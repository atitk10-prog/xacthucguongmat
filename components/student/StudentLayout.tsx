import React, { useState } from 'react';
import { Home, QrCode, FileText, Award, User as UserIcon, LogOut } from 'lucide-react';
import { User } from '../../types';
import StudentDashboard from '@/components/student/StudentDashboard';
import DigitalCard from '@/components/student/DigitalCard';
import LeaveRequestManager from '@/components/student/LeaveRequestManager';
import MyCertificates from '@/components/student/MyCertificates';
import StudentProfile from '@/components/student/StudentProfile';
import StudentLeaderboard from '@/components/student/StudentLeaderboard';
// Re-trigger build and check imports

interface StudentLayoutProps {
    currentUser: User;
    onLogout: () => void;
}

export type StudentTab = 'dashboard' | 'card' | 'requests' | 'certificates' | 'profile' | 'ranking';

export default function StudentLayout({ currentUser, onLogout }: StudentLayoutProps) {
    const [activeTab, setActiveTab] = useState<StudentTab>('dashboard');

    const navItems: { id: StudentTab; icon: React.ReactNode; label: string }[] = [
        { id: 'dashboard', icon: <Home size={24} />, label: 'Trang chủ' },
        { id: 'card', icon: <QrCode size={24} />, label: 'Thẻ' },
        { id: 'requests', icon: <FileText size={24} />, label: 'Đơn từ' },
        { id: 'certificates', icon: <Award size={24} />, label: 'Chứng nhận' },
        { id: 'profile', icon: <UserIcon size={24} />, label: 'Cá nhân' },
    ];

    const handleLogout = () => {
        if (window.confirm('Bạn có chắc chắn muốn đăng xuất?')) {
            onLogout();
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white shadow-sm px-4 py-3 flex justify-between items-center z-10">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
                        E
                    </div>
                    <h1 className="text-lg font-bold text-blue-600">Cổng Học Sinh</h1>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 hidden md:block">
                        {currentUser.full_name}
                    </span>
                    <button
                        onClick={handleLogout}
                        className="p-2 text-gray-500 hover:text-red-500 rounded-full hover:bg-red-50 transition-colors"
                        title="Đăng xuất"
                    >
                        <LogOut size={20} />
                    </button>
                </div>
            </header>

            {/* Main Content - Scrollable */}
            <div className="flex-1 overflow-y-auto pb-20 p-4">
                <div className="max-w-md mx-auto w-full">
                    {activeTab === 'dashboard' && <StudentDashboard user={currentUser} onNavigate={setActiveTab} />}
                    {activeTab === 'card' && <DigitalCard user={currentUser} />}
                    {activeTab === 'requests' && <LeaveRequestManager user={currentUser} />}
                    {activeTab === 'certificates' && <MyCertificates user={currentUser} />}
                    {activeTab === 'profile' && <StudentProfile user={currentUser} />}
                    {activeTab === 'ranking' && <StudentLeaderboard user={currentUser} />}
                </div>
            </div>

            {/* Bottom Navigation for Mobile */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-20">
                <div className="flex justify-around items-center h-16 max-w-md mx-auto">
                    {navItems.map((item) => {
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
                                className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                                    }`}
                            >
                                <div className={`p-1 rounded-xl transition-all ${isActive ? 'bg-blue-50' : ''}`}>
                                    {item.icon}
                                </div>
                                <span className="text-[10px] font-medium">{item.label}</span>
                            </button>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}
