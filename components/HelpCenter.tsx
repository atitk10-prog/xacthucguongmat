import React, { useState } from 'react';
import { Icons } from './ui';
import { HelpCircle, BookOpen, ShieldCheck, UserCheck, BarChart3, Settings, ChevronDown, ChevronUp } from 'lucide-react';

const HelpCenter: React.FC = () => {
    const [openSection, setOpenSection] = useState<string | null>('intro');

    const sections = [
        {
            id: 'intro',
            title: 'Giới thiệu EduCheck',
            icon: <HelpCircle className="w-5 h-5 text-indigo-500" />,
            content: (
                <div className="space-y-3">
                    <p>Chào mừng bạn đến với <strong>EduCheck v2.0</strong> - Hệ thống quản lý nề nếp và nhận diện khuôn mặt/mã QR chuyên nghiệp.</p>
                    <p>Hệ thống giúp tự động hóa việc điểm danh, theo dõi vi phạm và khen thưởng học sinh một cách minh bạch, chính xác.</p>
                </div>
            )
        },
        {
            id: 'admin',
            title: 'Dành cho Quản trị viên (Admin)',
            icon: <ShieldCheck className="w-5 h-5 text-emerald-500" />,
            content: (
                <div className="space-y-4">
                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                        <h4 className="font-bold text-emerald-800 mb-2">Quy trình khởi tạo:</h4>
                        <ol className="list-decimal pl-5 space-y-2 text-emerald-900/80 text-sm">
                            <li><strong>Nhập dữ liệu:</strong> Vào mục <span className="font-bold">Người dùng</span> &rarr; Nhập Excel để nạp danh sách.</li>
                            <li><strong>Nạp Face ID:</strong> Tiếp tục mục đó, chọn Tải ảnh thẻ hàng loạt (tên file = Mã SV) để hệ thống học khuôn mặt.</li>
                            <li><strong>Cấu hình điểm:</strong> Vào mục <span className="font-bold">Cấu hình</span> để cài đặt mức ban đầu và điểm trừ cho việc trễ, vắng.</li>
                            <li><strong>Khung giờ:</strong> Và mục <span className="font-bold">Quản lý Nội trú</span> để thiết lập các khung giờ điểm danh nội trú (Sáng/Trưa/Chiều/Tối).</li>
                        </ol>
                    </div>
                </div>
            )
        },
        {
            id: 'checkin',
            title: 'Vận hành Điểm danh AI',
            icon: <UserCheck className="w-5 h-5 text-amber-500" />,
            content: (
                <div className="space-y-3">
                    <p>Hệ thống hỗ trợ 2 chế độ điểm danh chính:</p>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                        <li><strong>Điểm danh Sự kiện:</strong> Dùng máy tính/điện thoại quét mặt học sinh/mã QR tại cửa phòng họp/sân khấu.</li>
                        <li><strong>Điểm danh Nội trú:</strong> Tự động trừ điểm nếu học sinh không quét mặt/mã QR trong khung giờ quy định.</li>
                    </ul>
                    <div className="bg-amber-50 p-3 rounded-lg text-xs text-amber-800 italic">
                        Mẹo: Đảm bảo Camera đủ ánh sáng để đạt tốc độ nhận diện nhanh nhất (dưới 1 giây).
                    </div>
                </div>
            )
        },
        {
            id: 'reports',
            title: 'Báo cáo & Xuất Excel',
            icon: <BarChart3 className="w-5 h-5 text-purple-500" />,
            content: (
                <div className="space-y-3">
                    <p>Mục <span className="font-bold">Thống kê điểm</span> cung cấp cái nhìn toàn diện về phong trào nề nếp của trường.</p>
                    <p>Khi xuất <span className="font-bold">Excel chi tiết</span>, bạn sẽ nhận được file gồm 5 Sheet:</p>
                    <ul className="list-disc pl-5 text-xs grid grid-cols-2 gap-1 font-medium">
                        <li>Tổng hợp mọi loại hình thức</li>
                        <li>Danh sách Khen thưởng</li>
                        <li>Danh sách Vi phạm</li>
                        <li>Tổng hợp theo Lớp</li>
                        <li>Thống kê theo Sự kiện</li>
                    </ul>
                </div>
            )
        }
    ];

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
                <div className="w-20 h-20 bg-indigo-100 rounded-[2.5rem] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-100">
                    <BookOpen className="w-10 h-10 text-indigo-600" />
                </div>
                <h2 className="text-3xl font-black text-slate-900">Trung tâm Hướng dẫn</h2>
                <p className="text-slate-500 font-medium">Tìm hiểu cách sử dụng EduCheck hiệu quả nhất</p>
            </div>

            <div className="space-y-4">
                {sections.map(section => (
                    <div key={section.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden transition-all hover:shadow-md">
                        <button
                            onClick={() => setOpenSection(openSection === section.id ? null : section.id)}
                            className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                                    {section.icon}
                                </div>
                                <span className="font-bold text-slate-800 text-lg">{section.title}</span>
                            </div>
                            {openSection === section.id ? <ChevronUp className="text-slate-400" /> : <ChevronDown className="text-slate-400" />}
                        </button>

                        {openSection === section.id && (
                            <div className="px-6 pb-6 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="pl-14 text-slate-600 leading-relaxed">
                                    {section.content}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="bg-slate-900 rounded-[3rem] p-8 text-white relative overflow-hidden shadow-2xl">
                <div className="absolute -right-10 -bottom-10 opacity-20 rotate-12">
                    <Icons.Shield className="w-64 h-64" />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                    <div className="flex-1 text-center md:text-left space-y-4">
                        <h3 className="text-2xl font-black">Cần hỗ trợ kỹ thuật?</h3>
                        <p className="text-slate-400 font-medium">Đội ngũ kỹ thuật của chúng tôi luôn sẵn sàng hỗ trợ bạn 24/7 để đảm bảo hệ thống vận hành ổn định tại trường.</p>
                        <div className="flex flex-wrap justify-center md:justify-start gap-4 pt-2">
                            <div className="bg-white/10 px-4 py-2 rounded-xl border border-white/10 text-sm font-bold flex items-center gap-2">
                                <Icons.Dashboard className="w-4 h-4 text-indigo-400" />
                                Hotline: 1900 xxxx
                            </div>
                            <div className="bg-white/10 px-4 py-2 rounded-xl border border-white/10 text-sm font-bold flex items-center gap-2">
                                <Icons.FileText className="w-4 h-4 text-indigo-400" />
                                support@educheck.vn
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HelpCenter;
