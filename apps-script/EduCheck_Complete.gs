/**
 * =====================================================
 * EDUCHECK v2.0 - HỆ THỐNG CHECK-IN AI HOÀN CHỈNH
 * Copy toàn bộ file này vào Google Apps Script
 * =====================================================
 */

// =====================================================
// CONFIGURATION
// =====================================================

const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '';

const SHEETS = {
  USERS: 'Users',
  EVENTS: 'Events',
  CHECKINS: 'CheckIns',
  BOARDING_CHECKINS: 'Boarding_CheckIns',
  ATTENDANCE_SCORES: 'Attendance_Scores',
  CERTIFICATES: 'Certificates',
  CLASSES: 'Classes',
  ROOMS: 'Rooms',
  CONFIGS: 'Configs',
  POINT_LOGS: 'Point_Logs',
  EVENT_PARTICIPANTS: 'Event_Participants'
};

// Default point configurations
const DEFAULT_CONFIGS = {
  'points_checkin_ontime': { value: '10', description: 'Điểm cộng check-in đúng giờ' },
  'points_checkin_late': { value: '-5', description: 'Điểm trừ check-in muộn' },
  'points_checkin_absent': { value: '-10', description: 'Điểm trừ vắng mặt' },
  'points_boarding_ontime': { value: '5', description: 'Điểm cộng nội trú đúng giờ' },
  'points_boarding_late': { value: '-3', description: 'Điểm trừ nội trú muộn' },
  'points_manual_max': { value: '50', description: 'Điểm tối đa cộng/trừ thủ công' },
  'late_threshold_default': { value: '15', description: 'Số phút mặc định tính đi muộn' },
  'face_threshold_default': { value: '60', description: 'Ngưỡng nhận diện khuôn mặt mặc định (%)' }
};

// =====================================================
// MAIN ROUTING
// =====================================================

function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function handleRequest(e, method) {
  if (!e) e = {};
  if (!e.parameter) e.parameter = {};
  
  const path = e.parameter.action || '';
  const params = e.parameter;
  
  let postData = {};
  if (method === 'POST' && e.postData) {
    try {
      postData = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonResponse({ success: false, error: 'Invalid JSON body' });
    }
  }
  
  try {
    let result;
    
    switch (path) {
      // Auth
      case 'auth/login': result = handleLogin(postData); break;
      case 'auth/register': result = handleRegister(postData); break;
      case 'auth/me': result = handleGetMe(params); break;
      
      // Users CRUD
      case 'users/list': result = handleGetUsers(params); break;
      case 'users/get': result = handleGetUser(params); break;
      case 'users/create': result = handleCreateUser(postData); break;
      case 'users/update': result = handleUpdateUser(postData); break;
      case 'users/delete': result = handleDeleteUser(params); break;
      
      // Events CRUD
      case 'events/list': result = handleGetEvents(params); break;
      case 'events/get': result = handleGetEvent(params); break;
      case 'events/create': result = handleCreateEvent(postData); break;
      case 'events/update': result = handleUpdateEvent(postData); break;
      case 'events/delete': result = handleDeleteEvent(params); break;
      
      // Check-in
      case 'checkin/event': result = handleCheckin(postData); break;
      case 'checkin/list': result = handleGetCheckins(params); break;
      case 'checkin/boarding': result = handleBoardingCheckin(postData); break;
      
      // Points
      case 'points/add': result = handleAddPoints(postData); break;
      case 'points/deduct': result = handleDeductPoints(postData); break;
      case 'points/logs': result = handleGetPointLogs(params); break;
      
      // Classes CRUD
      case 'classes/list': result = handleGetClasses(params); break;
      case 'classes/create': result = handleCreateClass(postData); break;
      case 'classes/update': result = handleUpdateClass(postData); break;
      case 'classes/delete': result = handleDeleteClass(params); break;
      
      // Rooms CRUD
      case 'rooms/list': result = handleGetRooms(params); break;
      case 'rooms/create': result = handleCreateRoom(postData); break;
      case 'rooms/update': result = handleUpdateRoom(postData); break;
      case 'rooms/delete': result = handleDeleteRoom(params); break;
      
      // Configs
      case 'configs/list': result = handleGetConfigs(params); break;
      case 'configs/update': result = handleUpdateConfig(postData); break;
      
      // Reports
      case 'reports/event': result = handleEventReport(params); break;
      case 'reports/user': result = handleUserReport(params); break;
      case 'reports/ranking': result = handleRanking(params); break;
      case 'reports/dashboard': result = handleDashboardSummary(params); break;
      
      // Certificates CRUD
      case 'certificates/create': result = handleCreateCertificate(postData); break;
      case 'certificates/list': result = handleGetCertificates(params); break;
      case 'certificates/verify': result = handleVerifyCertificate(params); break;
      case 'certificates/revoke': result = handleRevokeCertificate(postData); break;
      
      // Event Participants
      case 'participants/list': result = handleGetParticipants(params); break;
      case 'participants/save': result = handleSaveParticipants(postData); break;
      case 'participants/delete': result = handleDeleteParticipant(params); break;
      
      // Init
      case 'init': result = initializeSheets(); break;
      
      default: result = { success: false, error: 'Unknown action: ' + path };
    }
    
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet() {
  if (!SPREADSHEET_ID) throw new Error('SPREADSHEET_ID not configured');
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(sheetName) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  return sheet;
}

function generateUUID() {
  return Utilities.getUuid();
}

function hashPassword(password) {
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  return hash.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function now() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function findRowById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) return { row: i + 1, data: data[i] };
  }
  return null;
}

function getAllRows(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const obj = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = data[i][j];
    rows.push(obj);
  }
  return rows;
}

function rowToObject(headers, row) {
  const obj = {};
  for (let i = 0; i < headers.length; i++) obj[headers[i]] = row[i];
  return obj;
}

function getConfig(key) {
  const sheet = getSheet(SHEETS.CONFIGS);
  const configs = getAllRows(sheet);
  const config = configs.find(c => c.key === key);
  return config ? config.value : (DEFAULT_CONFIGS[key] ? DEFAULT_CONFIGS[key].value : null);
}

// =====================================================
// INITIALIZE SHEETS
// =====================================================

function initializeSheets() {
  const ss = getSpreadsheet();
  
  initSheet(ss, SHEETS.USERS, ['id', 'email', 'password_hash', 'full_name', 'role', 'class_id', 'room_id', 'zone', 'avatar_url', 'face_vector', 'qr_code', 'status', 'created_at', 'total_points']);
  initSheet(ss, SHEETS.EVENTS, ['id', 'name', 'type', 'start_time', 'end_time', 'location', 'target_audience', 'checkin_method', 'qr_code', 'late_threshold_mins', 'points_on_time', 'points_late', 'points_absent', 'require_face', 'face_threshold', 'created_by', 'status', 'created_at']);
  initSheet(ss, SHEETS.CHECKINS, ['id', 'event_id', 'user_id', 'checkin_time', 'status', 'face_confidence', 'face_verified', 'points_earned', 'photo_url', 'device_info', 'ip_address']);
  initSheet(ss, SHEETS.BOARDING_CHECKINS, ['id', 'user_id', 'date', 'morning_in', 'morning_out', 'evening_in', 'evening_out', 'exit_permission', 'notes']);
  initSheet(ss, SHEETS.ATTENDANCE_SCORES, ['id', 'user_id', 'period', 'total_events', 'attended', 'on_time_count', 'late_count', 'absent_count', 'total_points', 'rank']);
  initSheet(ss, SHEETS.CERTIFICATES, ['id', 'user_id', 'event_id', 'type', 'title', 'issued_date', 'qr_verify', 'pdf_url', 'status']);
  initSheet(ss, SHEETS.CLASSES, ['id', 'name', 'grade', 'homeroom_teacher_id', 'student_count']);
  initSheet(ss, SHEETS.ROOMS, ['id', 'name', 'zone', 'capacity', 'manager_id']);
  initSheet(ss, SHEETS.CONFIGS, ['key', 'value', 'description']);
  initSheet(ss, SHEETS.POINT_LOGS, ['id', 'user_id', 'points', 'reason', 'type', 'event_id', 'created_by', 'created_at']);
  
  // New: Event Participants sheet for storing event attendees with photos
  initSheet(ss, SHEETS.EVENT_PARTICIPANTS, ['id', 'event_id', 'full_name', 'birth_date', 'organization', 'address', 'email', 'phone', 'avatar_url', 'created_at', 'updated_at']);
  
  // Initialize default configs
  initDefaultConfigs();
  
  return { success: true, message: 'All sheets initialized successfully! Including Event_Participants.' };
}

function initSheet(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (!firstRow[0]) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function initDefaultConfigs() {
  const sheet = getSheet(SHEETS.CONFIGS);
  const existingConfigs = getAllRows(sheet);
  
  for (const [key, config] of Object.entries(DEFAULT_CONFIGS)) {
    if (!existingConfigs.find(c => c.key === key)) {
      sheet.appendRow([key, config.value, config.description]);
    }
  }
}

// =====================================================
// TOKEN HANDLING
// =====================================================

function generateToken(userId) {
  const timestamp = Date.now();
  const data = userId + ':' + timestamp;
  const signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, data + 'educheck_secret');
  const sigStr = signature.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
  return Utilities.base64Encode(data + ':' + sigStr);
}

function validateToken(token) {
  try {
    const decoded = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString();
    const parts = decoded.split(':');
    if (parts.length < 3) return null;
    const userId = parts[0];
    const timestamp = parseInt(parts[1]);
    if (Date.now() - timestamp > 7 * 24 * 60 * 60 * 1000) return null;
    return userId;
  } catch (e) {
    return null;
  }
}

// =====================================================
// AUTHENTICATION
// =====================================================

function handleLogin(data) {
  const { email, password } = data;
  if (!email || !password) return { success: false, error: 'Email và mật khẩu là bắt buộc' };
  
  const sheet = getSheet(SHEETS.USERS);
  const users = getAllRows(sheet);
  const user = users.find(u => u.email === email);
  
  if (!user) return { success: false, error: 'Email không tồn tại' };
  if (user.password_hash !== hashPassword(password)) return { success: false, error: 'Mật khẩu không đúng' };
  if (user.status !== 'active') return { success: false, error: 'Tài khoản đã bị vô hiệu hóa' };
  
  const token = generateToken(user.id);
  delete user.password_hash;
  delete user.face_vector;
  
  return { success: true, data: { user: user, token: token } };
}

function handleRegister(data) {
  const { email, password, full_name, role, class_id, room_id, zone } = data;
  if (!email || !password || !full_name || !role) return { success: false, error: 'Thiếu thông tin bắt buộc' };
  
  const sheet = getSheet(SHEETS.USERS);
  const users = getAllRows(sheet);
  if (users.find(u => u.email === email)) return { success: false, error: 'Email đã tồn tại' };
  
  const validRoles = ['admin', 'teacher', 'student', 'guest'];
  if (!validRoles.includes(role)) return { success: false, error: 'Role không hợp lệ' };
  
  const newUser = {
    id: generateUUID(), email: email, password_hash: hashPassword(password), full_name: full_name,
    role: role, class_id: class_id || '', room_id: room_id || '', zone: zone || '', avatar_url: '',
    face_vector: '', qr_code: generateUUID().substring(0, 8).toUpperCase(), status: 'active', 
    created_at: now(), total_points: 0
  };
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(h => newUser[h] !== undefined ? newUser[h] : ''));
  delete newUser.password_hash;
  
  return { success: true, data: newUser, message: 'Đăng ký thành công' };
}

function handleGetMe(params) {
  const { token } = params;
  if (!token) return { success: false, error: 'Token is required' };
  
  const userId = validateToken(token);
  if (!userId) return { success: false, error: 'Token không hợp lệ' };
  
  const sheet = getSheet(SHEETS.USERS);
  const result = findRowById(sheet, userId);
  if (!result) return { success: false, error: 'User không tồn tại' };
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const user = rowToObject(headers, result.data);
  delete user.password_hash;
  delete user.face_vector;
  
  return { success: true, data: user };
}

// =====================================================
// USERS CRUD
// =====================================================

function handleGetUsers(params) {
  const sheet = getSheet(SHEETS.USERS);
  let users = getAllRows(sheet);
  
  if (params.role) users = users.filter(u => u.role === params.role);
  if (params.class_id) users = users.filter(u => u.class_id === params.class_id);
  if (params.room_id) users = users.filter(u => u.room_id === params.room_id);
  if (params.status) users = users.filter(u => u.status === params.status);
  
  users = users.map(u => {
    delete u.password_hash;
    delete u.face_vector;
    return u;
  });
  
  return { success: true, data: users };
}

function handleGetUser(params) {
  const { id } = params;
  if (!id) return { success: false, error: 'ID is required' };
  
  const sheet = getSheet(SHEETS.USERS);
  const result = findRowById(sheet, id);
  if (!result) return { success: false, error: 'User not found' };
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const user = rowToObject(headers, result.data);
  delete user.password_hash;
  delete user.face_vector;
  
  return { success: true, data: user };
}

function handleCreateUser(data) {
  const { email, password, full_name, role, class_id, room_id, zone, status } = data;
  if (!email || !full_name || !role) return { success: false, error: 'Thiếu thông tin bắt buộc' };
  
  const sheet = getSheet(SHEETS.USERS);
  const users = getAllRows(sheet);
  if (users.find(u => u.email === email)) return { success: false, error: 'Email đã tồn tại' };
  
  const newUser = {
    id: generateUUID(), email: email, password_hash: hashPassword(password || '123456'), full_name: full_name,
    role: role, class_id: class_id || '', room_id: room_id || '', zone: zone || '', avatar_url: '',
    face_vector: '', qr_code: generateUUID().substring(0, 8).toUpperCase(), status: status || 'active',
    created_at: now(), total_points: 0
  };
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(h => newUser[h] !== undefined ? newUser[h] : ''));
  delete newUser.password_hash;
  
  return { success: true, data: newUser, message: 'Tạo người dùng thành công' };
}

function handleUpdateUser(data) {
  const { id, ...updates } = data;
  if (!id) return { success: false, error: 'ID is required' };
  
  const sheet = getSheet(SHEETS.USERS);
  const result = findRowById(sheet, id);
  if (!result) return { success: false, error: 'User not found' };
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const user = rowToObject(headers, result.data);
  
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'id' && key !== 'password_hash' && headers.includes(key)) {
      user[key] = value;
    }
  }
  
  if (updates.password) {
    user.password_hash = hashPassword(updates.password);
  }
  
  sheet.getRange(result.row, 1, 1, headers.length).setValues([headers.map(h => user[h] !== undefined ? user[h] : '')]);
  delete user.password_hash;
  delete user.face_vector;
  
  return { success: true, data: user, message: 'Cập nhật thành công' };
}

function handleDeleteUser(params) {
  const { id } = params;
  if (!id) return { success: false, error: 'ID is required' };
  
  const sheet = getSheet(SHEETS.USERS);
  const result = findRowById(sheet, id);
  if (!result) return { success: false, error: 'User not found' };
  
  sheet.deleteRow(result.row);
  return { success: true, message: 'Xóa người dùng thành công' };
}

// =====================================================
// EVENTS CRUD
// =====================================================

function handleGetEvents(params) {
  const sheet = getSheet(SHEETS.EVENTS);
  let events = getAllRows(sheet);
  
  if (params.status) events = events.filter(e => e.status === params.status);
  if (params.type) events = events.filter(e => e.type === params.type);
  
  return { success: true, data: events };
}

function handleGetEvent(params) {
  const { id } = params;
  if (!id) return { success: false, error: 'ID is required' };
  
  const sheet = getSheet(SHEETS.EVENTS);
  const result = findRowById(sheet, id);
  if (!result) return { success: false, error: 'Event not found' };
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const event = rowToObject(headers, result.data);
  
  const checkinSheet = getSheet(SHEETS.CHECKINS);
  const checkins = getAllRows(checkinSheet).filter(c => c.event_id === id);
  
  return {
    success: true,
    data: event,
    stats: {
      total_checkins: checkins.length,
      on_time: checkins.filter(c => c.status === 'on_time').length,
      late: checkins.filter(c => c.status === 'late').length
    }
  };
}

function handleCreateEvent(data) {
  const { name, type, start_time, end_time, location } = data;
  if (!name || !start_time) return { success: false, error: 'Tên và thời gian bắt đầu là bắt buộc' };
  
  const sheet = getSheet(SHEETS.EVENTS);
  
  const newEvent = {
    id: generateUUID(),
    name: name,
    type: type || 'học_tập',
    start_time: start_time,
    end_time: end_time || '',
    location: location || '',
    target_audience: data.target_audience || 'all',
    checkin_method: data.checkin_method || 'qr',
    qr_code: generateUUID().substring(0, 8).toUpperCase(),
    late_threshold_mins: data.late_threshold_mins || getConfig('late_threshold_default') || 15,
    points_on_time: data.points_on_time || getConfig('points_checkin_ontime') || 10,
    points_late: data.points_late || getConfig('points_checkin_late') || -5,
    points_absent: data.points_absent || getConfig('points_checkin_absent') || -10,
    require_face: data.require_face || false,
    face_threshold: data.face_threshold || getConfig('face_threshold_default') || 60,
    created_by: data.created_by || '',
    status: data.status || 'draft',
    created_at: now()
  };
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(h => newEvent[h] !== undefined ? newEvent[h] : ''));
  
  return { success: true, data: newEvent, message: 'Tạo sự kiện thành công' };
}

function handleUpdateEvent(data) {
  const { id, ...updates } = data;
  if (!id) return { success: false, error: 'ID is required' };
  
  const sheet = getSheet(SHEETS.EVENTS);
  const result = findRowById(sheet, id);
  if (!result) return { success: false, error: 'Event not found' };
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const event = rowToObject(headers, result.data);
  
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'id' && headers.includes(key)) {
      event[key] = value;
    }
  }
  
  sheet.getRange(result.row, 1, 1, headers.length).setValues([headers.map(h => event[h] !== undefined ? event[h] : '')]);
  
  return { success: true, data: event, message: 'Cập nhật sự kiện thành công' };
}

function handleDeleteEvent(params) {
  const { id } = params;
  if (!id) return { success: false, error: 'ID is required' };
  
  const sheet = getSheet(SHEETS.EVENTS);
  const result = findRowById(sheet, id);
  if (!result) return { success: false, error: 'Event not found' };
  
  sheet.deleteRow(result.row);
  return { success: true, message: 'Xóa sự kiện thành công' };
}

// =====================================================
// CHECK-IN
// =====================================================

function handleCheckin(data) {
  const { event_id, user_id, face_confidence, face_verified, device_info } = data;
  if (!event_id || !user_id) return { success: false, error: 'Event ID và User ID là bắt buộc' };
  
  const eventSheet = getSheet(SHEETS.EVENTS);
  const eventResult = findRowById(eventSheet, event_id);
  if (!eventResult) return { success: false, error: 'Sự kiện không tồn tại' };
  
  const eventHeaders = eventSheet.getRange(1, 1, 1, eventSheet.getLastColumn()).getValues()[0];
  const event = rowToObject(eventHeaders, eventResult.data);
  
  const checkinSheet = getSheet(SHEETS.CHECKINS);
  const existingCheckins = getAllRows(checkinSheet);
  if (existingCheckins.find(c => c.event_id === event_id && c.user_id === user_id)) {
    return { success: false, error: 'Bạn đã check-in sự kiện này rồi' };
  }
  
  const checkinTime = new Date();
  const eventStartTime = new Date(event.start_time);
  const lateThreshold = parseInt(event.late_threshold_mins) || 15;
  const diffMinutes = (checkinTime - eventStartTime) / (1000 * 60);
  
  let status = 'on_time';
  let points = parseInt(event.points_on_time) || 10;
  
  if (diffMinutes > lateThreshold) {
    status = 'late';
    points = parseInt(event.points_late) || -5;
  }
  
  const newCheckin = {
    id: generateUUID(),
    event_id: event_id,
    user_id: user_id,
    checkin_time: checkinTime.toISOString(),
    status: status,
    face_confidence: face_confidence || 0,
    face_verified: face_verified || false,
    points_earned: points,
    photo_url: '',
    device_info: device_info || '',
    ip_address: ''
  };
  
  const checkinHeaders = checkinSheet.getRange(1, 1, 1, checkinSheet.getLastColumn()).getValues()[0];
  checkinSheet.appendRow(checkinHeaders.map(h => newCheckin[h] !== undefined ? newCheckin[h] : ''));
  
  // Update user total points
  updateUserPoints(user_id, points);
  
  // Log the points
  logPoints(user_id, points, 'Check-in: ' + event.name, 'checkin', event_id, '');
  
  return {
    success: true,
    data: { checkin: newCheckin, event: event },
    message: status === 'on_time' ? 'Check-in đúng giờ! +' + points + ' điểm' : 'Check-in muộn. ' + points + ' điểm'
  };
}

function handleGetCheckins(params) {
  const sheet = getSheet(SHEETS.CHECKINS);
  let checkins = getAllRows(sheet);
  
  if (params.event_id) checkins = checkins.filter(c => c.event_id === params.event_id);
  if (params.user_id) checkins = checkins.filter(c => c.user_id === params.user_id);
  if (params.date) {
    const date = params.date.split('T')[0];
    checkins = checkins.filter(c => c.checkin_time && c.checkin_time.startsWith(date));
  }
  
  return { success: true, data: checkins };
}

function handleBoardingCheckin(data) {
  const { user_id, type } = data;
  if (!user_id || !type) return { success: false, error: 'User ID và Type là bắt buộc' };
  
  const validTypes = ['morning_in', 'morning_out', 'evening_in', 'evening_out'];
  if (!validTypes.includes(type)) return { success: false, error: 'Type không hợp lệ' };
  
  const sheet = getSheet(SHEETS.BOARDING_CHECKINS);
  const records = getAllRows(sheet);
  const todayStr = today();
  
  let record = records.find(r => r.user_id === user_id && r.date === todayStr);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  if (record) {
    if (record[type]) {
      return { success: false, error: 'Đã check-in ' + type + ' hôm nay rồi' };
    }
    record[type] = now();
    const result = findRowById(sheet, record.id);
    if (result) {
      sheet.getRange(result.row, 1, 1, headers.length).setValues([headers.map(h => record[h] !== undefined ? record[h] : '')]);
    }
  } else {
    record = {
      id: generateUUID(),
      user_id: user_id,
      date: todayStr,
      morning_in: '',
      morning_out: '',
      evening_in: '',
      evening_out: '',
      exit_permission: false,
      notes: ''
    };
    record[type] = now();
    sheet.appendRow(headers.map(h => record[h] !== undefined ? record[h] : ''));
  }
  
  // Award boarding points
  const points = parseInt(getConfig('points_boarding_ontime')) || 5;
  updateUserPoints(user_id, points);
  logPoints(user_id, points, 'Check-in nội trú: ' + type, 'boarding', '', '');
  
  return { success: true, data: record, message: 'Check-in thành công! +' + points + ' điểm' };
}

// =====================================================
// MANUAL POINTS
// =====================================================

function handleAddPoints(data) {
  const { user_id, points, reason, created_by } = data;
  if (!user_id || !points || !reason) return { success: false, error: 'User ID, points và lý do là bắt buộc' };
  
  const maxPoints = parseInt(getConfig('points_manual_max')) || 50;
  const pointValue = Math.min(parseInt(points), maxPoints);
  
  updateUserPoints(user_id, pointValue);
  logPoints(user_id, pointValue, reason, 'manual_add', '', created_by || '');
  
  return { success: true, message: 'Đã cộng ' + pointValue + ' điểm cho học sinh' };
}

function handleDeductPoints(data) {
  const { user_id, points, reason, created_by } = data;
  if (!user_id || !points || !reason) return { success: false, error: 'User ID, points và lý do là bắt buộc' };
  
  const maxPoints = parseInt(getConfig('points_manual_max')) || 50;
  const pointValue = -Math.min(parseInt(points), maxPoints);
  
  updateUserPoints(user_id, pointValue);
  logPoints(user_id, pointValue, reason, 'manual_deduct', '', created_by || '');
  
  return { success: true, message: 'Đã trừ ' + Math.abs(pointValue) + ' điểm của học sinh' };
}

function handleGetPointLogs(params) {
  const sheet = getSheet(SHEETS.POINT_LOGS);
  let logs = getAllRows(sheet);
  
  if (params.user_id) logs = logs.filter(l => l.user_id === params.user_id);
  if (params.type) logs = logs.filter(l => l.type === params.type);
  
  return { success: true, data: logs };
}

function updateUserPoints(userId, points) {
  const sheet = getSheet(SHEETS.USERS);
  const result = findRowById(sheet, userId);
  if (!result) return;
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const pointsColIndex = headers.indexOf('total_points');
  if (pointsColIndex === -1) return;
  
  const currentPoints = parseInt(result.data[pointsColIndex]) || 0;
  sheet.getRange(result.row, pointsColIndex + 1).setValue(currentPoints + parseInt(points));
}

function logPoints(userId, points, reason, type, eventId, createdBy) {
  const sheet = getSheet(SHEETS.POINT_LOGS);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  const log = {
    id: generateUUID(),
    user_id: userId,
    points: points,
    reason: reason,
    type: type,
    event_id: eventId || '',
    created_by: createdBy || '',
    created_at: now()
  };
  
  sheet.appendRow(headers.map(h => log[h] !== undefined ? log[h] : ''));
}

// =====================================================
// CLASSES CRUD
// =====================================================

function handleGetClasses(params) {
  const sheet = getSheet(SHEETS.CLASSES);
  const classes = getAllRows(sheet);
  return { success: true, data: classes };
}

function handleCreateClass(data) {
  const { name, grade, homeroom_teacher_id } = data;
  if (!name) return { success: false, error: 'Tên lớp là bắt buộc' };
  
  const sheet = getSheet(SHEETS.CLASSES);
  const newClass = {
    id: generateUUID(),
    name: name,
    grade: grade || '',
    homeroom_teacher_id: homeroom_teacher_id || '',
    student_count: 0
  };
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(h => newClass[h] !== undefined ? newClass[h] : ''));
  
  return { success: true, data: newClass, message: 'Tạo lớp thành công' };
}

function handleUpdateClass(data) {
  const { id, ...updates } = data;
  if (!id) return { success: false, error: 'ID is required' };
  
  const sheet = getSheet(SHEETS.CLASSES);
  const result = findRowById(sheet, id);
  if (!result) return { success: false, error: 'Class not found' };
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const classData = rowToObject(headers, result.data);
  
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'id' && headers.includes(key)) {
      classData[key] = value;
    }
  }
  
  sheet.getRange(result.row, 1, 1, headers.length).setValues([headers.map(h => classData[h] !== undefined ? classData[h] : '')]);
  
  return { success: true, data: classData, message: 'Cập nhật lớp thành công' };
}

function handleDeleteClass(params) {
  const { id } = params;
  if (!id) return { success: false, error: 'ID is required' };
  
  const sheet = getSheet(SHEETS.CLASSES);
  const result = findRowById(sheet, id);
  if (!result) return { success: false, error: 'Class not found' };
  
  sheet.deleteRow(result.row);
  return { success: true, message: 'Xóa lớp thành công' };
}

// =====================================================
// ROOMS CRUD
// =====================================================

function handleGetRooms(params) {
  const sheet = getSheet(SHEETS.ROOMS);
  let rooms = getAllRows(sheet);
  
  if (params.zone) rooms = rooms.filter(r => r.zone === params.zone);
  
  return { success: true, data: rooms };
}

function handleCreateRoom(data) {
  const { name, zone, capacity } = data;
  if (!name) return { success: false, error: 'Tên phòng là bắt buộc' };
  
  const sheet = getSheet(SHEETS.ROOMS);
  const newRoom = {
    id: generateUUID(),
    name: name,
    zone: zone || '',
    capacity: capacity || 8,
    manager_id: data.manager_id || ''
  };
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(h => newRoom[h] !== undefined ? newRoom[h] : ''));
  
  return { success: true, data: newRoom, message: 'Tạo phòng thành công' };
}

function handleUpdateRoom(data) {
  const { id, ...updates } = data;
  if (!id) return { success: false, error: 'ID is required' };
  
  const sheet = getSheet(SHEETS.ROOMS);
  const result = findRowById(sheet, id);
  if (!result) return { success: false, error: 'Room not found' };
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const room = rowToObject(headers, result.data);
  
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'id' && headers.includes(key)) {
      room[key] = value;
    }
  }
  
  sheet.getRange(result.row, 1, 1, headers.length).setValues([headers.map(h => room[h] !== undefined ? room[h] : '')]);
  
  return { success: true, data: room, message: 'Cập nhật phòng thành công' };
}

function handleDeleteRoom(params) {
  const { id } = params;
  if (!id) return { success: false, error: 'ID is required' };
  
  const sheet = getSheet(SHEETS.ROOMS);
  const result = findRowById(sheet, id);
  if (!result) return { success: false, error: 'Room not found' };
  
  sheet.deleteRow(result.row);
  return { success: true, message: 'Xóa phòng thành công' };
}

// =====================================================
// CONFIGS
// =====================================================

function handleGetConfigs(params) {
  const sheet = getSheet(SHEETS.CONFIGS);
  const configs = getAllRows(sheet);
  return { success: true, data: configs };
}

function handleUpdateConfig(data) {
  const { key, value } = data;
  if (!key) return { success: false, error: 'Key is required' };
  
  const sheet = getSheet(SHEETS.CONFIGS);
  const configs = getAllRows(sheet);
  const config = configs.find(c => c.key === key);
  
  if (config) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(value);
        break;
      }
    }
  } else {
    sheet.appendRow([key, value, '']);
  }
  
  return { success: true, message: 'Cập nhật cấu hình thành công' };
}

// =====================================================
// REPORTS
// =====================================================

function handleEventReport(params) {
  const { event_id } = params;
  if (!event_id) return { success: false, error: 'Event ID is required' };
  
  const eventSheet = getSheet(SHEETS.EVENTS);
  const eventResult = findRowById(eventSheet, event_id);
  if (!eventResult) return { success: false, error: 'Event not found' };
  
  const eventHeaders = eventSheet.getRange(1, 1, 1, eventSheet.getLastColumn()).getValues()[0];
  const event = rowToObject(eventHeaders, eventResult.data);
  
  const checkinSheet = getSheet(SHEETS.CHECKINS);
  const checkins = getAllRows(checkinSheet).filter(c => c.event_id === event_id);
  
  const userSheet = getSheet(SHEETS.USERS);
  const users = getAllRows(userSheet);
  
  const checkinsWithUser = checkins.map(c => {
    const user = users.find(u => u.id === c.user_id);
    return { ...c, user_name: user ? user.full_name : '', class_id: user ? user.class_id : '' };
  });
  
  return {
    success: true,
    data: {
      event: event,
      stats: {
        total_expected: users.filter(u => u.role === 'student').length,
        total_checkins: checkins.length,
        on_time: checkins.filter(c => c.status === 'on_time').length,
        late: checkins.filter(c => c.status === 'late').length,
        absent: 0,
        attendance_rate: users.length > 0 ? Math.round((checkins.length / users.filter(u => u.role === 'student').length) * 100) : 0
      },
      checkins: checkinsWithUser
    }
  };
}

function handleUserReport(params) {
  const { user_id } = params;
  if (!user_id) return { success: false, error: 'User ID is required' };
  
  const userSheet = getSheet(SHEETS.USERS);
  const userResult = findRowById(userSheet, user_id);
  if (!userResult) return { success: false, error: 'User not found' };
  
  const userHeaders = userSheet.getRange(1, 1, 1, userSheet.getLastColumn()).getValues()[0];
  const user = rowToObject(userHeaders, userResult.data);
  delete user.password_hash;
  delete user.face_vector;
  
  const checkinSheet = getSheet(SHEETS.CHECKINS);
  const checkins = getAllRows(checkinSheet).filter(c => c.user_id === user_id);
  
  const boardingSheet = getSheet(SHEETS.BOARDING_CHECKINS);
  const boarding = getAllRows(boardingSheet).filter(b => b.user_id === user_id);
  
  const certSheet = getSheet(SHEETS.CERTIFICATES);
  const certificates = getAllRows(certSheet).filter(c => c.user_id === user_id);
  
  return {
    success: true,
    data: {
      user: user,
      checkins: checkins,
      boarding: boarding,
      certificates: certificates,
      stats: {
        total_checkins: checkins.length,
        on_time: checkins.filter(c => c.status === 'on_time').length,
        late: checkins.filter(c => c.status === 'late').length,
        total_points: user.total_points || 0
      }
    }
  };
}

function handleRanking(params) {
  const { type, class_id, limit } = params;
  const userSheet = getSheet(SHEETS.USERS);
  let users = getAllRows(userSheet).filter(u => u.role === 'student' && u.status === 'active');
  
  if (class_id) users = users.filter(u => u.class_id === class_id);
  
  users.sort((a, b) => (parseInt(b.total_points) || 0) - (parseInt(a.total_points) || 0));
  
  const maxLimit = parseInt(limit) || 50;
  users = users.slice(0, maxLimit);
  
  const checkinSheet = getSheet(SHEETS.CHECKINS);
  const allCheckins = getAllRows(checkinSheet);
  
  const ranking = users.map((user, index) => ({
    position: index + 1,
    user_id: user.id,
    user_name: user.full_name,
    class_id: user.class_id,
    total_points: parseInt(user.total_points) || 0,
    on_time_count: allCheckins.filter(c => c.user_id === user.id && c.status === 'on_time').length,
    late_count: allCheckins.filter(c => c.user_id === user.id && c.status === 'late').length,
    absent_count: 0,
    rank: getRankLevel(user.total_points)
  }));
  
  return { success: true, data: ranking };
}

function getRankLevel(points) {
  const p = parseInt(points) || 0;
  if (p >= 100) return 'Tốt';
  if (p >= 50) return 'Khá';
  if (p >= 0) return 'Trung bình';
  return 'Yếu';
}

function handleDashboardSummary(params) {
  const userSheet = getSheet(SHEETS.USERS);
  const users = getAllRows(userSheet);
  
  const eventSheet = getSheet(SHEETS.EVENTS);
  const events = getAllRows(eventSheet);
  
  const checkinSheet = getSheet(SHEETS.CHECKINS);
  const checkins = getAllRows(checkinSheet);
  const todayStr = today();
  const todayCheckins = checkins.filter(c => c.checkin_time && c.checkin_time.startsWith(todayStr));
  
  return {
    success: true,
    data: {
      total_users: users.length,
      total_students: users.filter(u => u.role === 'student').length,
      total_events: events.length,
      active_events: events.filter(e => e.status === 'active').length,
      today_checkins: todayCheckins.length
    }
  };
}

// =====================================================
// CERTIFICATES
// =====================================================

function handleCreateCertificate(data) {
  const { user_id, event_id, type, title } = data;
  if (!user_id || !title) return { success: false, error: 'User ID và tiêu đề là bắt buộc' };
  
  const sheet = getSheet(SHEETS.CERTIFICATES);
  
  const newCert = {
    id: generateUUID(),
    user_id: user_id,
    event_id: event_id || '',
    type: type || 'participation',
    title: title,
    issued_date: today(),
    qr_verify: generateUUID().substring(0, 12).toUpperCase(),
    pdf_url: '',
    status: 'issued'
  };
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(h => newCert[h] !== undefined ? newCert[h] : ''));
  
  const userSheet = getSheet(SHEETS.USERS);
  const userResult = findRowById(userSheet, user_id);
  const userName = userResult ? rowToObject(userSheet.getRange(1, 1, 1, userSheet.getLastColumn()).getValues()[0], userResult.data).full_name : '';
  
  return {
    success: true,
    data: { certificate: newCert, user: { id: user_id, full_name: userName } },
    message: 'Tạo chứng nhận thành công'
  };
}

function handleGetCertificates(params) {
  const sheet = getSheet(SHEETS.CERTIFICATES);
  let certificates = getAllRows(sheet);
  
  if (params.user_id) certificates = certificates.filter(c => c.user_id === params.user_id);
  if (params.event_id) certificates = certificates.filter(c => c.event_id === params.event_id);
  if (params.status) certificates = certificates.filter(c => c.status === params.status);
  
  return { success: true, data: certificates };
}

function handleVerifyCertificate(params) {
  const { qr } = params;
  if (!qr) return { success: false, error: 'QR code is required' };
  
  const sheet = getSheet(SHEETS.CERTIFICATES);
  const certificates = getAllRows(sheet);
  const cert = certificates.find(c => c.qr_verify === qr);
  
  if (!cert) return { success: true, data: { valid: false } };
  
  const userSheet = getSheet(SHEETS.USERS);
  const userResult = findRowById(userSheet, cert.user_id);
  const userName = userResult ? rowToObject(userSheet.getRange(1, 1, 1, userSheet.getLastColumn()).getValues()[0], userResult.data).full_name : '';
  
  const eventSheet = getSheet(SHEETS.EVENTS);
  const eventResult = cert.event_id ? findRowById(eventSheet, cert.event_id) : null;
  const eventName = eventResult ? rowToObject(eventSheet.getRange(1, 1, 1, eventSheet.getLastColumn()).getValues()[0], eventResult.data).name : '';
  
  return {
    success: true,
    data: {
      valid: cert.status === 'issued',
      certificate: { ...cert, user_name: userName, event_name: eventName }
    }
  };
}

function handleRevokeCertificate(data) {
  const { id } = data;
  if (!id) return { success: false, error: 'Certificate ID is required' };
  
  const sheet = getSheet(SHEETS.CERTIFICATES);
  const result = findRowById(sheet, id);
  if (!result) return { success: false, error: 'Certificate not found' };
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const statusColIndex = headers.indexOf('status');
  if (statusColIndex !== -1) {
    sheet.getRange(result.row, statusColIndex + 1).setValue('revoked');
  }
  
  return { success: true, message: 'Thu hồi chứng nhận thành công' };
}

// =====================================================
// EVENT PARTICIPANTS MANAGEMENT
// =====================================================

/**
 * Initialize Event_Participants sheet if not exists
 * Call this once: initEventParticipantsSheet()
 */
function initEventParticipantsSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.EVENT_PARTICIPANTS);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.EVENT_PARTICIPANTS);
    const headers = [
      'id', 'event_id', 'full_name', 'birth_date', 'organization', 
      'address', 'email', 'phone', 'avatar_url', 'created_at', 'updated_at'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#4F46E5')
      .setFontColor('white')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    Logger.log('Created Event_Participants sheet with headers');
  }
  
  return { success: true, message: 'Event_Participants sheet initialized' };
}

function handleGetParticipants(params) {
  const { event_id } = params;
  const sheet = getSheet(SHEETS.EVENT_PARTICIPANTS);
  
  // Check if sheet has headers, if not initialize
  if (sheet.getLastRow() === 0) {
    initEventParticipantsSheet();
  }
  
  let participants = getAllRows(sheet);
  
  if (event_id) {
    participants = participants.filter(p => p.event_id === event_id);
  }
  
  return { success: true, data: participants };
}

function handleSaveParticipants(data) {
  const { event_id, participants } = data;
  if (!event_id) return { success: false, error: 'Event ID is required' };
  if (!participants || !Array.isArray(participants)) {
    return { success: false, error: 'Participants array is required' };
  }
  
  const sheet = getSheet(SHEETS.EVENT_PARTICIPANTS);
  
  // Check if sheet has headers, if not initialize
  if (sheet.getLastRow() === 0) {
    initEventParticipantsSheet();
  }
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const timestamp = now();
  const savedParticipants = [];
  
  // OPTIMIZATION: Load all existing data ONCE (not inside loop)
  const existingData = getAllRows(sheet);
  
  // Collect batch operations
  const rowsToUpdate = []; // { row: number, values: array }
  const rowsToAppend = []; // array of new rows
  
  participants.forEach(p => {
    let existing = null;
    
    // First try to find by ID (if not a new/import ID)
    if (p.id && !p.id.startsWith('new_') && !p.id.startsWith('import_')) {
      existing = existingData.find(e => e.id === p.id);
    }
    
    // If not found by ID, try to find by full_name + event_id to prevent duplicates
    if (!existing && p.full_name) {
      existing = existingData.find(e => 
        e.event_id === event_id && 
        e.full_name && 
        e.full_name.toLowerCase().trim() === p.full_name.toLowerCase().trim()
      );
    }
    
    if (existing) {
      // Update existing - find row number
      const result = findRowById(sheet, existing.id);
      if (result) {
        const updatedRow = headers.map(h => {
          if (h === 'updated_at') return timestamp;
          if (h === 'id') return existing.id;
          if (h === 'event_id') return event_id;
          return p[h] !== undefined ? p[h] : existing[h] || '';
        });
        rowsToUpdate.push({ row: result.row, values: updatedRow });
        savedParticipants.push({ ...existing, ...p, updated_at: timestamp });
      }
    } else {
      // Create new
      const newId = generateUUID();
      const newRow = headers.map(h => {
        if (h === 'id') return newId;
        if (h === 'event_id') return event_id;
        if (h === 'created_at') return timestamp;
        if (h === 'updated_at') return timestamp;
        return p[h] || '';
      });
      rowsToAppend.push(newRow);
      savedParticipants.push({ id: newId, event_id, ...p, created_at: timestamp, updated_at: timestamp });
    }
  });
  
  // BATCH UPDATE: Apply all updates at once
  rowsToUpdate.forEach(update => {
    sheet.getRange(update.row, 1, 1, headers.length).setValues([update.values]);
  });
  
  // BATCH APPEND: Add all new rows at once
  if (rowsToAppend.length > 0) {
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend);
  }
  
  return { success: true, data: savedParticipants, message: `Đã lưu ${savedParticipants.length} người tham gia` };
}

function handleDeleteParticipant(params) {
  const { id } = params;
  if (!id) return { success: false, error: 'Participant ID is required' };
  
  const sheet = getSheet(SHEETS.EVENT_PARTICIPANTS);
  const result = findRowById(sheet, id);
  
  if (!result) return { success: false, error: 'Participant not found' };
  
  sheet.deleteRow(result.row);
  return { success: true, message: 'Đã xóa người tham gia' };
}

/**
 * Get all participants from all events (for reuse)
 */
function handleGetAllParticipantProfiles(params) {
  const sheet = getSheet(SHEETS.EVENT_PARTICIPANTS);
  const allData = getAllRows(sheet);
  
  // Get unique participants by name (aggregate from all events)
  const uniqueMap = new Map();
  allData.forEach(p => {
    const key = p.full_name.toLowerCase().trim();
    if (!uniqueMap.has(key) || (p.avatar_url && !uniqueMap.get(key).avatar_url)) {
      uniqueMap.set(key, p);
    }
  });
  
  return { success: true, data: Array.from(uniqueMap.values()) };
}

