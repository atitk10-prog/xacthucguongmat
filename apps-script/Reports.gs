/**
 * EduCheck - Reports Module
 */

function handleEventReport(params) {
  const { event_id } = params;
  
  if (!event_id) return { success: false, error: 'event_id is required' };
  
  const eventsSheet = getSheet(SHEETS.EVENTS);
  const eventResult = findRowById(eventsSheet, event_id);
  
  if (!eventResult) return { success: false, error: 'Sự kiện không tồn tại' };
  
  const eventHeaders = eventsSheet.getRange(1, 1, 1, 17).getValues()[0];
  const event = rowToObject(eventHeaders, eventResult.data);
  
  const checkinsSheet = getSheet(SHEETS.CHECKINS);
  const checkins = getAllRows(checkinsSheet).filter(c => c.event_id === event_id);
  
  const usersSheet = getSheet(SHEETS.USERS);
  const users = getAllRows(usersSheet);
  
  const enrichedCheckins = checkins.map(c => {
    const user = users.find(u => u.id === c.user_id);
    return {
      ...c,
      user_name: user ? user.full_name : 'Unknown',
      user_class: user ? user.class_id : ''
    };
  });
  
  const stats = {
    total_expected: users.filter(u => u.status === 'active').length,
    total_checkins: checkins.length,
    on_time: checkins.filter(c => c.status === 'on_time').length,
    late: checkins.filter(c => c.status === 'late').length,
    absent: checkins.filter(c => c.status === 'absent').length,
    attendance_rate: 0,
    punctuality_rate: 0
  };
  
  if (stats.total_expected > 0) {
    stats.attendance_rate = Math.round((stats.total_checkins / stats.total_expected) * 100);
  }
  if (stats.total_checkins > 0) {
    stats.punctuality_rate = Math.round((stats.on_time / stats.total_checkins) * 100);
  }
  
  return { success: true, data: { event: event, stats: stats, checkins: enrichedCheckins } };
}

function handleUserReport(params) {
  const { user_id, period } = params;
  
  if (!user_id) return { success: false, error: 'user_id is required' };
  
  const usersSheet = getSheet(SHEETS.USERS);
  const userResult = findRowById(usersSheet, user_id);
  
  if (!userResult) return { success: false, error: 'User không tồn tại' };
  
  const userHeaders = usersSheet.getRange(1, 1, 1, 13).getValues()[0];
  const user = rowToObject(userHeaders, userResult.data);
  delete user.password_hash;
  delete user.face_vector;
  
  const checkinsSheet = getSheet(SHEETS.CHECKINS);
  let checkins = getAllRows(checkinsSheet).filter(c => c.user_id === user_id);
  
  const eventsSheet = getSheet(SHEETS.EVENTS);
  const events = getAllRows(eventsSheet);
  
  checkins = checkins.map(c => {
    const event = events.find(e => e.id === c.event_id);
    return { ...c, event_name: event ? event.name : 'Unknown' };
  });
  
  const scoresSheet = getSheet(SHEETS.ATTENDANCE_SCORES);
  let scores = getAllRows(scoresSheet).filter(s => s.user_id === user_id);
  
  if (period) scores = scores.filter(s => s.period === period);
  
  const boardingSheet = getSheet(SHEETS.BOARDING_CHECKINS);
  const boardings = getAllRows(boardingSheet).filter(b => b.user_id === user_id);
  
  const certsSheet = getSheet(SHEETS.CERTIFICATES);
  const certificates = getAllRows(certsSheet).filter(c => c.user_id === user_id);
  
  return { success: true, data: { user: user, checkins: checkins, scores: scores, boarding: boardings.slice(-30), certificates: certificates } };
}

function handleRanking(params) {
  const { period, type, class_id, room_id, limit } = params;
  
  const scoresSheet = getSheet(SHEETS.ATTENDANCE_SCORES);
  let scores = getAllRows(scoresSheet);
  
  if (period) {
    scores = scores.filter(s => s.period === period);
  } else {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const currentPeriod = year + '-HK' + (month < 6 ? 1 : 2);
    scores = scores.filter(s => s.period === currentPeriod);
  }
  
  const usersSheet = getSheet(SHEETS.USERS);
  const users = getAllRows(usersSheet);
  
  let ranking = [];
  
  if (type === 'class') {
    const classScores = {};
    
    scores.forEach(s => {
      const user = users.find(u => u.id === s.user_id);
      if (user && user.class_id) {
        if (!classScores[user.class_id]) {
          classScores[user.class_id] = { class_id: user.class_id, total_points: 0, student_count: 0 };
        }
        classScores[user.class_id].total_points += Number(s.total_points) || 0;
        classScores[user.class_id].student_count++;
      }
    });
    
    ranking = Object.values(classScores).map(cs => ({
      ...cs,
      avg_points: Math.round(cs.total_points / cs.student_count)
    }));
    
    ranking.sort((a, b) => b.avg_points - a.avg_points);
  } else {
    let filteredScores = scores;
    
    if (class_id) {
      const classUserIds = users.filter(u => u.class_id === class_id).map(u => u.id);
      filteredScores = scores.filter(s => classUserIds.includes(s.user_id));
    }
    
    if (room_id) {
      const roomUserIds = users.filter(u => u.room_id === room_id).map(u => u.id);
      filteredScores = scores.filter(s => roomUserIds.includes(s.user_id));
    }
    
    ranking = filteredScores.map(s => {
      const user = users.find(u => u.id === s.user_id);
      return { ...s, user_name: user ? user.full_name : 'Unknown', class_id: user ? user.class_id : '' };
    });
    
    ranking.sort((a, b) => (Number(b.total_points) || 0) - (Number(a.total_points) || 0));
  }
  
  const maxLimit = Number(limit) || 50;
  ranking = ranking.slice(0, maxLimit);
  ranking = ranking.map((r, i) => ({ ...r, position: i + 1 }));
  
  return { success: true, data: ranking };
}

function handleGetClasses(params) {
  const sheet = getSheet(SHEETS.CLASSES);
  const classes = getAllRows(sheet);
  
  const usersSheet = getSheet(SHEETS.USERS);
  const users = getAllRows(usersSheet);
  
  const enrichedClasses = classes.map(c => {
    const studentCount = users.filter(u => u.class_id === c.id && u.status === 'active').length;
    return { ...c, actual_student_count: studentCount };
  });
  
  return { success: true, data: enrichedClasses };
}

function handleGetRooms(params) {
  const { zone } = params;
  
  const sheet = getSheet(SHEETS.ROOMS);
  let rooms = getAllRows(sheet);
  
  if (zone) rooms = rooms.filter(r => r.zone === zone);
  
  const usersSheet = getSheet(SHEETS.USERS);
  const users = getAllRows(usersSheet);
  
  const enrichedRooms = rooms.map(r => {
    const occupancy = users.filter(u => u.room_id === r.id && u.status === 'active').length;
    return { ...r, current_occupancy: occupancy };
  });
  
  return { success: true, data: enrichedRooms };
}
