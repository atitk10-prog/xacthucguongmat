/**
 * EduCheck - Users Module
 */

function handleGetUsers(params) {
  const { role, class_id, room_id, status } = params;
  
  const sheet = getSheet(SHEETS.USERS);
  let users = getAllRows(sheet);
  
  if (role) users = users.filter(u => u.role === role);
  if (class_id) users = users.filter(u => u.class_id === class_id);
  if (room_id) users = users.filter(u => u.room_id === room_id);
  if (status) users = users.filter(u => u.status === status);
  
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
  
  if (!result) return { success: false, error: 'User không tồn tại' };
  
  const headers = sheet.getRange(1, 1, 1, 13).getValues()[0];
  const user = rowToObject(headers, result.data);
  
  delete user.password_hash;
  delete user.face_vector;
  
  return { success: true, data: user };
}

function handleCreateUser(data) {
  const { email, password, full_name, role, class_id, room_id, zone, avatar_url, token } = data;
  
  if (!isTeacherOrAdmin(token)) {
    return { success: false, error: 'Không có quyền thực hiện' };
  }
  
  if (!email || !password || !full_name || !role) {
    return { success: false, error: 'Thiếu thông tin bắt buộc' };
  }
  
  const sheet = getSheet(SHEETS.USERS);
  const users = getAllRows(sheet);
  
  if (users.find(u => u.email === email)) {
    return { success: false, error: 'Email đã tồn tại' };
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
    avatar_url: avatar_url || '',
    face_vector: '',
    qr_code: generateUUID().substring(0, 8).toUpperCase(),
    status: 'active',
    created_at: now()
  };
  
  const headers = sheet.getRange(1, 1, 1, 13).getValues()[0];
  const row = headers.map(h => newUser[h] || '');
  sheet.appendRow(row);
  
  delete newUser.password_hash;
  
  return { success: true, data: newUser, message: 'Tạo user thành công' };
}

function handleUpdateUser(data) {
  const { id, full_name, role, class_id, room_id, zone, avatar_url, status, face_vector, token } = data;
  
  if (!id) return { success: false, error: 'ID is required' };
  
  const currentUserId = validateToken(token);
  if (!currentUserId) return { success: false, error: 'Token không hợp lệ' };
  
  if (currentUserId !== id && !isAdmin(token)) {
    return { success: false, error: 'Không có quyền chỉnh sửa user này' };
  }
  
  const sheet = getSheet(SHEETS.USERS);
  const result = findRowById(sheet, id);
  
  if (!result) return { success: false, error: 'User không tồn tại' };
  
  const headers = sheet.getRange(1, 1, 1, 13).getValues()[0];
  const user = rowToObject(headers, result.data);
  
  if (full_name) user.full_name = full_name;
  if (role && isAdmin(token)) user.role = role;
  if (class_id !== undefined) user.class_id = class_id;
  if (room_id !== undefined) user.room_id = room_id;
  if (zone !== undefined) user.zone = zone;
  if (avatar_url !== undefined) user.avatar_url = avatar_url;
  if (status && isAdmin(token)) user.status = status;
  if (face_vector !== undefined) user.face_vector = face_vector;
  
  const updatedRow = headers.map(h => user[h] || '');
  sheet.getRange(result.row, 1, 1, headers.length).setValues([updatedRow]);
  
  delete user.password_hash;
  delete user.face_vector;
  
  return { success: true, data: user, message: 'Cập nhật thành công' };
}

function handleDeleteUser(params) {
  const { id, token } = params;
  
  if (!id) return { success: false, error: 'ID is required' };
  if (!isAdmin(token)) return { success: false, error: 'Chỉ Admin mới có thể xóa user' };
  
  const sheet = getSheet(SHEETS.USERS);
  const result = findRowById(sheet, id);
  
  if (!result) return { success: false, error: 'User không tồn tại' };
  
  const headers = sheet.getRange(1, 1, 1, 13).getValues()[0];
  const user = rowToObject(headers, result.data);
  
  user.status = 'inactive';
  
  const updatedRow = headers.map(h => user[h] || '');
  sheet.getRange(result.row, 1, 1, headers.length).setValues([updatedRow]);
  
  return { success: true, message: 'Đã vô hiệu hóa user' };
}
