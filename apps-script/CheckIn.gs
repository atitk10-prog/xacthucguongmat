/**
 * EduCheck - CheckIn Module
 */

function handleCheckin(data) {
  const { event_id, user_id, face_confidence, face_verified, photo_url, device_info } = data;
  
  if (!event_id || !user_id) {
    return { success: false, error: 'event_id và user_id là bắt buộc' };
  }
  
  const eventsSheet = getSheet(SHEETS.EVENTS);
  const eventResult = findRowById(eventsSheet, event_id);
  
  if (!eventResult) return { success: false, error: 'Sự kiện không tồn tại' };
  
  const eventHeaders = eventsSheet.getRange(1, 1, 1, 17).getValues()[0];
  const event = rowToObject(eventHeaders, eventResult.data);
  
  if (event.status !== 'active') {
    return { success: false, error: 'Sự kiện chưa được kích hoạt hoặc đã kết thúc' };
  }
  
  const usersSheet = getSheet(SHEETS.USERS);
  const userResult = findRowById(usersSheet, user_id);
  
  if (!userResult) return { success: false, error: 'User không tồn tại' };
  
  const checkinsSheet = getSheet(SHEETS.CHECKINS);
  const existingCheckins = getAllRows(checkinsSheet);
  const alreadyCheckedIn = existingCheckins.find(c => c.event_id === event_id && c.user_id === user_id);
  
  if (alreadyCheckedIn) {
    return { success: false, error: 'Bạn đã check-in sự kiện này rồi' };
  }
  
  if (event.require_face === true || event.require_face === 'TRUE') {
    if (!face_verified) {
      return { success: false, error: 'Sự kiện yêu cầu xác nhận khuôn mặt' };
    }
    
    const faceThreshold = Number(event.face_threshold) || 60;
    if ((face_confidence || 0) < faceThreshold) {
      return { success: false, error: 'Độ khớp khuôn mặt chưa đạt (' + face_confidence + '% < ' + faceThreshold + '%)' };
    }
  }
  
  const nowTime = new Date();
  const eventStart = new Date(event.start_time);
  const lateThreshold = Number(event.late_threshold_mins) || 15;
  const lateCutoff = new Date(eventStart.getTime() + lateThreshold * 60 * 1000);
  
  let status = 'on_time';
  let pointsEarned = Number(event.points_on_time) || 10;
  
  if (nowTime > lateCutoff) {
    status = 'late';
    pointsEarned = Number(event.points_late) || -5;
  }
  
  const checkin = {
    id: generateUUID(),
    event_id: event_id,
    user_id: user_id,
    checkin_time: nowTime.toISOString(),
    status: status,
    face_confidence: face_confidence || 0,
    face_verified: face_verified ? 'TRUE' : 'FALSE',
    points_earned: pointsEarned,
    photo_url: photo_url || '',
    device_info: device_info || '',
    ip_address: ''
  };
  
  const headers = checkinsSheet.getRange(1, 1, 1, 11).getValues()[0];
  const row = headers.map(h => checkin[h] !== undefined ? checkin[h] : '');
  checkinsSheet.appendRow(row);
  
  updateAttendanceScore(user_id, status, pointsEarned);
  
  const userHeaders = usersSheet.getRange(1, 1, 1, 13).getValues()[0];
  const user = rowToObject(userHeaders, userResult.data);
  delete user.password_hash;
  delete user.face_vector;
  
  return {
    success: true,
    data: { checkin: checkin, user: user, event: event },
    message: status === 'on_time' ? 'Check-in thành công! ✅' : 'Check-in muộn! ⚠️'
  };
}

function handleGetCheckins(params) {
  const { event_id, user_id, date } = params;
  
  const sheet = getSheet(SHEETS.CHECKINS);
  let checkins = getAllRows(sheet);
  
  if (event_id) checkins = checkins.filter(c => c.event_id === event_id);
  if (user_id) checkins = checkins.filter(c => c.user_id === user_id);
  if (date) checkins = checkins.filter(c => c.checkin_time.startsWith(date));
  
  const usersSheet = getSheet(SHEETS.USERS);
  const users = getAllRows(usersSheet);
  
  checkins = checkins.map(c => {
    const user = users.find(u => u.id === c.user_id);
    if (user) {
      c.user_name = user.full_name;
      c.user_class = user.class_id;
    }
    return c;
  });
  
  checkins.sort((a, b) => new Date(b.checkin_time) - new Date(a.checkin_time));
  
  return { success: true, data: checkins };
}

function handleBoardingCheckin(data) {
  const { user_id, type } = data;
  
  if (!user_id || !type) return { success: false, error: 'user_id và type là bắt buộc' };
  
  const validTypes = ['morning_in', 'morning_out', 'evening_in', 'evening_out'];
  if (!validTypes.includes(type)) return { success: false, error: 'Type không hợp lệ' };
  
  const usersSheet = getSheet(SHEETS.USERS);
  const userResult = findRowById(usersSheet, user_id);
  
  if (!userResult) return { success: false, error: 'User không tồn tại' };
  
  const userHeaders = usersSheet.getRange(1, 1, 1, 13).getValues()[0];
  const user = rowToObject(userHeaders, userResult.data);
  
  if (!user.room_id) return { success: false, error: 'User không thuộc khu nội trú' };
  
  const today = new Date().toISOString().split('T')[0];
  const nowTime = new Date().toISOString();
  
  const sheet = getSheet(SHEETS.BOARDING_CHECKINS);
  const boardings = getAllRows(sheet);
  
  let todayRecord = boardings.find(b => b.user_id === user_id && b.date === today);
  
  if (todayRecord) {
    const result = findRowById(sheet, todayRecord.id);
    if (result) {
      const headers = sheet.getRange(1, 1, 1, 9).getValues()[0];
      todayRecord[type] = nowTime;
      
      const updatedRow = headers.map(h => todayRecord[h] !== undefined ? todayRecord[h] : '');
      sheet.getRange(result.row, 1, 1, headers.length).setValues([updatedRow]);
    }
  } else {
    todayRecord = {
      id: generateUUID(),
      user_id: user_id,
      date: today,
      morning_in: '',
      morning_out: '',
      evening_in: '',
      evening_out: '',
      exit_permission: 'FALSE',
      notes: ''
    };
    todayRecord[type] = nowTime;
    
    const headers = sheet.getRange(1, 1, 1, 9).getValues()[0];
    const row = headers.map(h => todayRecord[h] !== undefined ? todayRecord[h] : '');
    sheet.appendRow(row);
  }
  
  return { success: true, data: todayRecord, message: 'Check-in ' + type.replace('_', ' ') + ' thành công!' };
}

function updateAttendanceScore(userId, status, points) {
  const sheet = getSheet(SHEETS.ATTENDANCE_SCORES);
  const scores = getAllRows(sheet);
  
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const period = year + '-HK' + (month < 6 ? 1 : 2);
  
  let userScore = scores.find(s => s.user_id === userId && s.period === period);
  
  if (userScore) {
    const result = findRowById(sheet, userScore.id);
    if (result) {
      userScore.total_events = (Number(userScore.total_events) || 0) + 1;
      userScore.attended = (Number(userScore.attended) || 0) + 1;
      
      if (status === 'on_time') {
        userScore.on_time_count = (Number(userScore.on_time_count) || 0) + 1;
      } else if (status === 'late') {
        userScore.late_count = (Number(userScore.late_count) || 0) + 1;
      }
      
      userScore.total_points = (Number(userScore.total_points) || 0) + points;
      userScore.rank = calculateRank(userScore.total_points);
      
      const headers = sheet.getRange(1, 1, 1, 10).getValues()[0];
      const updatedRow = headers.map(h => userScore[h] !== undefined ? userScore[h] : '');
      sheet.getRange(result.row, 1, 1, headers.length).setValues([updatedRow]);
    }
  } else {
    userScore = {
      id: generateUUID(),
      user_id: userId,
      period: period,
      total_events: 1,
      attended: 1,
      on_time_count: status === 'on_time' ? 1 : 0,
      late_count: status === 'late' ? 1 : 0,
      absent_count: 0,
      total_points: points,
      rank: calculateRank(points)
    };
    
    const headers = sheet.getRange(1, 1, 1, 10).getValues()[0];
    const row = headers.map(h => userScore[h] !== undefined ? userScore[h] : '');
    sheet.appendRow(row);
  }
}

function calculateRank(points) {
  points = Number(points) || 0;
  if (points >= 80) return 'Tốt';
  if (points >= 50) return 'Khá';
  if (points >= 30) return 'Trung bình';
  return 'Yếu';
}
