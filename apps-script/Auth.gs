/**
 * EduCheck - Authentication Module
 */

function handleLogin(data) {
  const { email, password } = data;
  
  if (!email || !password) {
    return { success: false, error: 'Email và mật khẩu là bắt buộc' };
  }
  
  const sheet = getSheet(SHEETS.USERS);
  const users = getAllRows(sheet);
  
  const user = users.find(u => u.email === email);
  
  if (!user) {
    return { success: false, error: 'Email không tồn tại' };
  }
  
  const passwordHash = hashPassword(password);
  if (user.password_hash !== passwordHash) {
    return { success: false, error: 'Mật khẩu không đúng' };
  }
  
  if (user.status !== 'active') {
    return { success: false, error: 'Tài khoản đã bị vô hiệu hóa' };
  }
  
  const token = generateToken(user.id);
  
  delete user.password_hash;
  delete user.face_vector;
  
  return {
    success: true,
    data: { user: user, token: token }
  };
}

function handleRegister(data) {
  const { email, password, full_name, role, class_id, room_id, zone } = data;
  
  if (!email || !password || !full_name || !role) {
    return { success: false, error: 'Thiếu thông tin bắt buộc' };
  }
  
  const sheet = getSheet(SHEETS.USERS);
  const users = getAllRows(sheet);
  
  if (users.find(u => u.email === email)) {
    return { success: false, error: 'Email đã tồn tại' };
  }
  
  const validRoles = ['admin', 'teacher', 'student', 'guest'];
  if (!validRoles.includes(role)) {
    return { success: false, error: 'Role không hợp lệ' };
  }
  
  const newUser = {
    id: generateUUID(),
    email: email,
    password_hash: hashPassword(password),
    full_name: full_name,
    role: role,
    class_id: class_id || '',
    room_id: room_id || '',
    zone: zone || '',
    avatar_url: '',
    face_vector: '',
    qr_code: generateUUID().substring(0, 8).toUpperCase(),
    status: 'active',
    created_at: now()
  };
  
  const headers = sheet.getRange(1, 1, 1, 13).getValues()[0];
  const row = headers.map(h => newUser[h] || '');
  sheet.appendRow(row);
  
  delete newUser.password_hash;
  
  return {
    success: true,
    data: newUser,
    message: 'Đăng ký thành công'
  };
}

function handleGetMe(params) {
  const { token } = params;
  
  if (!token) {
    return { success: false, error: 'Token is required' };
  }
  
  const userId = validateToken(token);
  if (!userId) {
    return { success: false, error: 'Token không hợp lệ' };
  }
  
  const sheet = getSheet(SHEETS.USERS);
  const result = findRowById(sheet, userId);
  
  if (!result) {
    return { success: false, error: 'User không tồn tại' };
  }
  
  const headers = sheet.getRange(1, 1, 1, 13).getValues()[0];
  const user = rowToObject(headers, result.data);
  
  delete user.password_hash;
  delete user.face_vector;
  
  return { success: true, data: user };
}

function generateToken(userId) {
  const data = userId + '|' + Date.now();
  return Utilities.base64Encode(data);
}

function validateToken(token) {
  try {
    const decoded = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString();
    const parts = decoded.split('|');
    if (parts.length !== 2) return null;
    
    const userId = parts[0];
    const timestamp = parseInt(parts[1]);
    
    const expiry = 24 * 60 * 60 * 1000;
    if (Date.now() - timestamp > expiry) {
      return null;
    }
    
    return userId;
  } catch (e) {
    return null;
  }
}

function isAdmin(token) {
  const userId = validateToken(token);
  if (!userId) return false;
  
  const sheet = getSheet(SHEETS.USERS);
  const result = findRowById(sheet, userId);
  if (!result) return false;
  
  const headers = sheet.getRange(1, 1, 1, 13).getValues()[0];
  const user = rowToObject(headers, result.data);
  
  return user.role === 'admin';
}

function isTeacherOrAdmin(token) {
  const userId = validateToken(token);
  if (!userId) return false;
  
  const sheet = getSheet(SHEETS.USERS);
  const result = findRowById(sheet, userId);
  if (!result) return false;
  
  const headers = sheet.getRange(1, 1, 1, 13).getValues()[0];
  const user = rowToObject(headers, result.data);
  
  return user.role === 'admin' || user.role === 'teacher';
}
