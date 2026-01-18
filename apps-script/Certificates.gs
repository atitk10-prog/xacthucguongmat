/**
 * EduCheck - Certificates Module
 */

function handleCreateCertificate(data) {
  const { user_id, event_id, type, title, token } = data;
  
  if (!user_id || !type || !title) {
    return { success: false, error: 'user_id, type và title là bắt buộc' };
  }
  
  if (!isTeacherOrAdmin(token)) {
    return { success: false, error: 'Không có quyền cấp chứng nhận' };
  }
  
  const validTypes = ['participation', 'completion', 'excellent'];
  if (!validTypes.includes(type)) {
    return { success: false, error: 'Loại chứng nhận không hợp lệ' };
  }
  
  const usersSheet = getSheet(SHEETS.USERS);
  const userResult = findRowById(usersSheet, user_id);
  
  if (!userResult) return { success: false, error: 'User không tồn tại' };
  
  const userHeaders = usersSheet.getRange(1, 1, 1, 13).getValues()[0];
  const user = rowToObject(userHeaders, userResult.data);
  
  const certificate = {
    id: generateUUID(),
    user_id: user_id,
    event_id: event_id || '',
    type: type,
    title: title,
    issued_date: new Date().toISOString().split('T')[0],
    qr_verify: generateUUID().substring(0, 10).toUpperCase(),
    pdf_url: '',
    status: 'issued'
  };
  
  const sheet = getSheet(SHEETS.CERTIFICATES);
  const headers = sheet.getRange(1, 1, 1, 9).getValues()[0];
  const row = headers.map(h => certificate[h] !== undefined ? certificate[h] : '');
  sheet.appendRow(row);
  
  return {
    success: true,
    data: { certificate: certificate, user: { id: user.id, full_name: user.full_name } },
    message: 'Đã cấp chứng nhận thành công'
  };
}

function handleGetCertificates(params) {
  const { user_id, event_id, type } = params;
  
  const sheet = getSheet(SHEETS.CERTIFICATES);
  let certificates = getAllRows(sheet);
  
  if (user_id) certificates = certificates.filter(c => c.user_id === user_id);
  if (event_id) certificates = certificates.filter(c => c.event_id === event_id);
  if (type) certificates = certificates.filter(c => c.type === type);
  
  const usersSheet = getSheet(SHEETS.USERS);
  const users = getAllRows(usersSheet);
  
  const eventsSheet = getSheet(SHEETS.EVENTS);
  const events = getAllRows(eventsSheet);
  
  certificates = certificates.map(c => {
    const user = users.find(u => u.id === c.user_id);
    const event = events.find(e => e.id === c.event_id);
    return { ...c, user_name: user ? user.full_name : 'Unknown', event_name: event ? event.name : '' };
  });
  
  certificates.sort((a, b) => new Date(b.issued_date) - new Date(a.issued_date));
  
  return { success: true, data: certificates };
}

function handleVerifyCertificate(params) {
  const { qr } = params;
  
  if (!qr) return { success: false, error: 'QR code is required' };
  
  const sheet = getSheet(SHEETS.CERTIFICATES);
  const certificates = getAllRows(sheet);
  
  const certificate = certificates.find(c => c.qr_verify === qr);
  
  if (!certificate) return { success: false, error: 'Không tìm thấy chứng nhận với mã QR này' };
  
  if (certificate.status === 'revoked') {
    return { success: false, error: 'Chứng nhận này đã bị thu hồi' };
  }
  
  const usersSheet = getSheet(SHEETS.USERS);
  const userResult = findRowById(usersSheet, certificate.user_id);
  
  let userName = 'Unknown';
  if (userResult) {
    const userHeaders = usersSheet.getRange(1, 1, 1, 13).getValues()[0];
    const user = rowToObject(userHeaders, userResult.data);
    userName = user.full_name;
  }
  
  let eventName = '';
  if (certificate.event_id) {
    const eventsSheet = getSheet(SHEETS.EVENTS);
    const eventResult = findRowById(eventsSheet, certificate.event_id);
    if (eventResult) {
      const eventHeaders = eventsSheet.getRange(1, 1, 1, 17).getValues()[0];
      const event = rowToObject(eventHeaders, eventResult.data);
      eventName = event.name;
    }
  }
  
  return {
    success: true,
    data: { valid: true, certificate: { ...certificate, user_name: userName, event_name: eventName } },
    message: 'Chứng nhận hợp lệ ✅'
  };
}
