
import { Attendee } from './types';

export const SYSTEM_INSTRUCTION = `
Bạn là một chuyên gia nhận diện khuôn mặt AI cho hệ thống điểm danh sự kiện.
Nhiệm vụ của bạn:
1. Nhận một hình ảnh chụp trực tiếp từ camera.
2. So sánh khuôn mặt trong ảnh với danh sách các "Người tham dự đã đăng ký" (được cung cấp dưới dạng ảnh hoặc mô tả).
3. Xác định xem người trong ảnh là ai trong danh sách.
4. Trả về kết quả dưới định dạng JSON duy nhất:
{
  "matchedId": "ID_CỦA_NGƯỜI_DÙNG" | null,
  "confidence": số từ 0 đến 100,
  "reason": "Giải thích ngắn gọn lý do (ví dụ: đặc điểm khuôn mặt tương đồng, mắt, mũi, miệng)"
}

Lưu ý quan trọng:
- Chỉ xác nhận khớp nếu độ tin tưởng (confidence) >= 60%.
- Nếu không chắc chắn, trả về matchedId: null.
`;

export const INITIAL_ATTENDEES: Attendee[] = [
  {
    id: '1',
    name: 'Nguyễn Văn A',
    code: 'SV001',
    department: 'Khoa CNTT',
    role: 'Sinh viên',
    imageUrl: 'https://picsum.photos/seed/person1/200/200'
  },
  {
    id: '2',
    name: 'Trần Thị B',
    code: 'SV002',
    department: 'Khoa Kinh tế',
    role: 'Sinh viên',
    imageUrl: 'https://picsum.photos/seed/person2/200/200'
  },
  {
    id: '3',
    name: 'Lê Văn C',
    code: 'GV001',
    department: 'Khoa Ngoại ngữ',
    role: 'Giảng viên',
    imageUrl: 'https://picsum.photos/seed/person3/200/200'
  }
];
