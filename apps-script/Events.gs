/**
 * EduCheck - Events Module
 */

function handleGetEvents(params) {
  const { status, type, created_by } = params;
  
  const sheet = getSheet(SHEETS.EVENTS);
  let events = getAllRows(sheet);
  
  if (status) events = events.filter(e => e.status === status);
  if (type) events = events.filter(e => e.type === type);
  if (created_by) events = events.filter(e => e.created_by === created_by);
  
  events.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  
  return { success: true, data: events };
}

function handleGetEvent(params) {
  const { id } = params;
  
  if (!id) return { success: false, error: 'ID is required' };
  
  const sheet = getSheet(SHEETS.EVENTS);
  const result = findRowById(sheet, id);
  
  if (!result) return { success: false, error: 'Sự kiện không tồn tại' };
  
  const headers = sheet.getRange(1, 1, 1, 17).getValues()[0];
  const event = rowToObject(headers, result.data);
  
  const checkinsSheet = getSheet(SHEETS.CHECKINS);
  const checkins = getAllRows(checkinsSheet).filter(c => c.event_id === id);
  
  event.stats = {
    total_checkins: checkins.length,
    on_time: checkins.filter(c => c.status === 'on_time').length,
    late: checkins.filter(c => c.status === 'late').length
  };
  
  return { success: true, data: event };
}

function handleCreateEvent(data) {
  const { name, type, start_time, end_time, location, target_audience, checkin_method, late_threshold_mins, points_on_time, points_late, points_absent, require_face, face_threshold, token } = data;
  
  if (!isTeacherOrAdmin(token)) {
    return { success: false, error: 'Không có quyền tạo sự kiện' };
  }
  
  if (!name || !type || !start_time || !end_time) {
    return { success: false, error: 'Thiếu thông tin bắt buộc' };
  }
  
  const userId = validateToken(token);
  
  const newEvent = {
    id: generateUUID(),
    name: name,
    type: type,
    start_time: start_time,
    end_time: end_time,
    location: location || '',
    target_audience: target_audience || 'all',
    checkin_method: checkin_method || 'qr',
    qr_code: generateUUID().substring(0, 12).toUpperCase(),
    late_threshold_mins: late_threshold_mins || 15,
    points_on_time: points_on_time || 10,
    points_late: points_late || -5,
    points_absent: points_absent || -10,
    require_face: require_face || false,
    face_threshold: face_threshold || 60,
    created_by: userId,
    status: 'draft'
  };
  
  const sheet = getSheet(SHEETS.EVENTS);
  const headers = sheet.getRange(1, 1, 1, 17).getValues()[0];
  const row = headers.map(h => {
    const val = newEvent[h];
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    return val !== undefined ? val : '';
  });
  sheet.appendRow(row);
  
  return { success: true, data: newEvent, message: 'Tạo sự kiện thành công' };
}

function handleUpdateEvent(data) {
  const { id, name, type, start_time, end_time, location, target_audience, checkin_method, late_threshold_mins, points_on_time, points_late, points_absent, require_face, face_threshold, status, token } = data;
  
  if (!id) return { success: false, error: 'ID is required' };
  if (!isTeacherOrAdmin(token)) return { success: false, error: 'Không có quyền chỉnh sửa sự kiện' };
  
  const sheet = getSheet(SHEETS.EVENTS);
  const result = findRowById(sheet, id);
  
  if (!result) return { success: false, error: 'Sự kiện không tồn tại' };
  
  const headers = sheet.getRange(1, 1, 1, 17).getValues()[0];
  const event = rowToObject(headers, result.data);
  
  if (name) event.name = name;
  if (type) event.type = type;
  if (start_time) event.start_time = start_time;
  if (end_time) event.end_time = end_time;
  if (location !== undefined) event.location = location;
  if (target_audience) event.target_audience = target_audience;
  if (checkin_method) event.checkin_method = checkin_method;
  if (late_threshold_mins !== undefined) event.late_threshold_mins = late_threshold_mins;
  if (points_on_time !== undefined) event.points_on_time = points_on_time;
  if (points_late !== undefined) event.points_late = points_late;
  if (points_absent !== undefined) event.points_absent = points_absent;
  if (require_face !== undefined) event.require_face = require_face;
  if (face_threshold !== undefined) event.face_threshold = face_threshold;
  if (status) event.status = status;
  
  const updatedRow = headers.map(h => {
    const val = event[h];
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    return val !== undefined ? val : '';
  });
  sheet.getRange(result.row, 1, 1, headers.length).setValues([updatedRow]);
  
  return { success: true, data: event, message: 'Cập nhật sự kiện thành công' };
}

function handleDeleteEvent(params) {
  const { id, token } = params;
  
  if (!id) return { success: false, error: 'ID is required' };
  if (!isTeacherOrAdmin(token)) return { success: false, error: 'Không có quyền xóa sự kiện' };
  
  const sheet = getSheet(SHEETS.EVENTS);
  const result = findRowById(sheet, id);
  
  if (!result) return { success: false, error: 'Sự kiện không tồn tại' };
  
  sheet.deleteRow(result.row);
  
  return { success: true, message: 'Đã xóa sự kiện' };
}
