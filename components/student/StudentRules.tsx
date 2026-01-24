import React from 'react';
import { BookOpen, AlertCircle, Award, Clock, ShieldCheck, UserCheck } from 'lucide-react';

const StudentRules: React.FC = () => {
    return (
        <div className="space-y-6 animate-slide-up">
            {/* Header */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                        <BookOpen className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900">Nội quy Học sinh</h1>
                        <p className="text-slate-500 font-medium">Quy định và hướng dẫn tham gia hệ thống</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Điểm danh & Thời gian */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                            <Clock className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-black text-slate-800">1. Quy định Điểm danh</h2>
                    </div>
                    <ul className="space-y-3 text-sm text-slate-600 font-medium list-disc list-outside pl-5">
                        <li>Học sinh phải điểm danh khuôn mặt tại máy check-in đúng khung giờ quy định.</li>
                        <li>
                            <span className="text-emerald-600 font-bold">Đúng giờ:</span> Được ghi nhận tham gia đầy đủ.
                        </li>
                        <li>
                            <span className="text-orange-500 font-bold">Điểm danh trễ:</span> Bị trừ điểm theo quy định (thường là -2 điểm/lần).
                        </li>
                        <li>
                            <span className="text-red-500 font-bold">Vắng mặt:</span> Không điểm danh hoặc không có phép sẽ bị trừ điểm nặng (thường là -5 điểm/lần).
                        </li>
                    </ul>
                </div>

                {/* 2. Điểm thưởng & Kỷ luật */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                            <Award className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-black text-slate-800">2. Điểm Thưởng & Phạt</h2>
                    </div>
                    <ul className="space-y-3 text-sm text-slate-600 font-medium list-disc list-outside pl-5">
                        <li>
                            <span className="text-emerald-600 font-bold">Điểm cộng (+):</span> Dành cho học sinh có thành tích tốt, tham gia tích cực các phong trào, hoặc được tuyên dương.
                        </li>
                        <li>
                            <span className="text-red-500 font-bold">Điểm trừ (-):</span> Áp dụng khi vi phạm nội quy, đi trễ, vắng mặt không phép, hoặc không tuân thủ quy định nề nếp.
                        </li>
                        <li>Điểm số sẽ được cập nhật ngay lập tức và ảnh hưởng trực tiếp đến xếp hạng thi đua.</li>
                    </ul>
                </div>

                {/* 3. Xin phép ra ngoài */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
                            <UserCheck className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-black text-slate-800">3. Xin phép Ra ngoài</h2>
                    </div>
                    <ul className="space-y-3 text-sm text-slate-600 font-medium list-disc list-outside pl-5">
                        <li>Học sinh có nhu cầu ra ngoài trong giờ nội trú phải tạo đơn xin phép trên hệ thống.</li>
                        <li>Đơn phải được Ban Quản Lý duyệt mới có hiệu lực.</li>
                        <li>Khi ra và vào cổng, học sinh phải check-in khuôn mặt hoặc mã QR để hệ thống ghi nhận giờ đi/về.</li>
                        <li>Mọi trường hợp ra ngoài không phép đều bị xử lý kỷ luật.</li>
                    </ul>
                </div>

                {/* 4. Giấy tờ & Tài khoản & Mã QR */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-black text-slate-800">4. Thẻ & Mã QR</h2>
                    </div>
                    <ul className="space-y-3 text-sm text-slate-600 font-medium list-disc list-outside pl-5">
                        <li>Mỗi học sinh được cấp một Thẻ học sinh điện tử kèm Mã QR định danh duy nhất.</li>
                        <li>Sử dụng Mã QR để check-in tại các sự kiện hoặc ra/vào cổng khi được yêu cầu.</li>
                        <li>Bảo mật Mã QR của mình, không chia sẻ cho người khác để tránh bị mạo danh.</li>
                        <li>Hình ảnh khuôn mặt (Face ID) cũng được sử dụng song song với QR Code cho mục đích điểm danh.</li>
                    </ul>
                </div>
            </div>

            {/* Footer Note */}
            <div className="bg-indigo-50 rounded-3xl p-6 border border-indigo-100 text-center">
                <p className="text-indigo-800 font-bold text-sm">
                    "Ý thức nề nếp tốt là nền tảng cho sự thành công trong tương lai."
                </p>
                <p className="text-indigo-600 text-xs mt-1">Ban Quản Lý Nội Trú</p>
            </div>
        </div>
    );
};

export default StudentRules;
