/**
 * EduCheck - Google Apps Script Backend
 * Main entry point with routing
 */

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
  CONFIGS: 'Configs'
};

function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function handleRequest(e, method) {
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
      case 'auth/login':
        result = handleLogin(postData);
        break;
      case 'auth/register':
        result = handleRegister(postData);
        break;
      case 'auth/me':
        result = handleGetMe(params);
        break;
      case 'users/list':
        result = handleGetUsers(params);
        break;
      case 'users/get':
        result = handleGetUser(params);
        break;
      case 'users/create':
        result = handleCreateUser(postData);
        break;
      case 'users/update':
        result = handleUpdateUser(postData);
        break;
      case 'users/delete':
        result = handleDeleteUser(params);
        break;
      case 'events/list':
        result = handleGetEvents(params);
        break;
      case 'events/get':
        result = handleGetEvent(params);
        break;
      case 'events/create':
        result = handleCreateEvent(postData);
        break;
      case 'events/update':
        result = handleUpdateEvent(postData);
        break;
      case 'events/delete':
        result = handleDeleteEvent(params);
        break;
      case 'checkin/event':
        result = handleCheckin(postData);
        break;
      case 'checkin/list':
        result = handleGetCheckins(params);
        break;
      case 'checkin/boarding':
        result = handleBoardingCheckin(postData);
        break;
      case 'reports/event':
        result = handleEventReport(params);
        break;
      case 'reports/user':
        result = handleUserReport(params);
        break;
      case 'reports/ranking':
        result = handleRanking(params);
        break;
      case 'certificates/create':
        result = handleCreateCertificate(postData);
        break;
      case 'certificates/list':
        result = handleGetCertificates(params);
        break;
      case 'certificates/verify':
        result = handleVerifyCertificate(params);
        break;
      case 'classes/list':
        result = handleGetClasses(params);
        break;
      case 'rooms/list':
        result = handleGetRooms(params);
        break;
      case 'init':
        result = initializeSheets();
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + path };
    }
    
    return jsonResponse(result);
    
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet() {
  if (!SPREADSHEET_ID) {
    throw new Error('SPREADSHEET_ID not configured');
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(sheetName) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
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

function initializeSheets() {
  const ss = getSpreadsheet();
  
  const usersHeaders = ['id', 'email', 'password_hash', 'full_name', 'role', 'class_id', 'room_id', 'zone', 'avatar_url', 'face_vector', 'qr_code', 'status', 'created_at'];
  initSheet(ss, SHEETS.USERS, usersHeaders);
  
  const eventsHeaders = ['id', 'name', 'type', 'start_time', 'end_time', 'location', 'target_audience', 'checkin_method', 'qr_code', 'late_threshold_mins', 'points_on_time', 'points_late', 'points_absent', 'require_face', 'face_threshold', 'created_by', 'status'];
  initSheet(ss, SHEETS.EVENTS, eventsHeaders);
  
  const checkinsHeaders = ['id', 'event_id', 'user_id', 'checkin_time', 'status', 'face_confidence', 'face_verified', 'points_earned', 'photo_url', 'device_info', 'ip_address'];
  initSheet(ss, SHEETS.CHECKINS, checkinsHeaders);
  
  const boardingHeaders = ['id', 'user_id', 'date', 'morning_in', 'morning_out', 'evening_in', 'evening_out', 'exit_permission', 'notes'];
  initSheet(ss, SHEETS.BOARDING_CHECKINS, boardingHeaders);
  
  const scoresHeaders = ['id', 'user_id', 'period', 'total_events', 'attended', 'on_time_count', 'late_count', 'absent_count', 'total_points', 'rank'];
  initSheet(ss, SHEETS.ATTENDANCE_SCORES, scoresHeaders);
  
  const certsHeaders = ['id', 'user_id', 'event_id', 'type', 'title', 'issued_date', 'qr_verify', 'pdf_url', 'status'];
  initSheet(ss, SHEETS.CERTIFICATES, certsHeaders);
  
  const classesHeaders = ['id', 'name', 'grade', 'homeroom_teacher_id', 'student_count'];
  initSheet(ss, SHEETS.CLASSES, classesHeaders);
  
  const roomsHeaders = ['id', 'name', 'zone', 'capacity', 'manager_id'];
  initSheet(ss, SHEETS.ROOMS, roomsHeaders);
  
  const configsHeaders = ['key', 'value', 'description'];
  initSheet(ss, SHEETS.CONFIGS, configsHeaders);
  
  return { success: true, message: 'All sheets initialized' };
}

function initSheet(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (!firstRow[0]) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  
  return sheet;
}

function findRowById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      return { row: i + 1, data: data[i] };
    }
  }
  return null;
}

function findRowByColumn(sheet, columnIndex, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][columnIndex] === value) {
      return { row: i + 1, data: data[i] };
    }
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
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    rows.push(obj);
  }
  
  return rows;
}

function rowToObject(headers, row) {
  const obj = {};
  for (let i = 0; i < headers.length; i++) {
    obj[headers[i]] = row[i];
  }
  return obj;
}
