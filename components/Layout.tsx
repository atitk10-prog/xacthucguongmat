
import React from 'react';
import { AppView } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeView, onViewChange }) => {
  const menuItems = [
    { id: 'checkin' as AppView, label: 'Điểm danh AI', icon: '📸', desc: 'Nhận diện khuôn mặt' },
    { id: 'dashboard' as AppView, label: 'Báo cáo', icon: '📊', desc: 'Thống kê thời gian thực' },
    { id: 'registry' as AppView, label: 'Nhân sự', icon: '👥', desc: 'Quản lý danh sách' },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#f8fafc]">
      {/* Sidebar - Ultra Premium */}
      <aside className="w-full md:w-80 bg-[#0f172a] text-white flex flex-col sticky top-0 md:h-screen z-30 shadow-[10px_0_30px_rgba(0,0,0,0.1)]">
        {/* Branding Area */}
        <div className="p-8 pb-4">
          <div className="flex items-center gap-4 mb-8">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-tr from-indigo-500 to-violet-500 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-500"></div>
              <div className="relative w-12 h-12 bg-slate-900 border border-slate-700 rounded-2xl flex items-center justify-center shadow-2xl">
                <span className="text-2xl">🛡️</span>
              </div>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                PRO-FACE
              </h1>
              <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-[0.2em]">Enterprise AI</p>
            </div>
          </div>
          
          <div className="dark-glass p-4 rounded-2xl border border-white/5 mb-6">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-ping absolute"></div>
                <div className="w-3 h-3 bg-emerald-500 rounded-full relative"></div>
              </div>
              <p className="text-xs font-bold text-slate-300">Hệ thống đang hoạt động</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-4 mb-4">Điều hướng</p>
          
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full group relative px-4 py-4 rounded-2xl flex items-center gap-4 transition-all duration-500 ${
                activeView === item.id 
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-600/20' 
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
              }`}
            >
              <div className={`text-2xl transition-all duration-500 ${activeView === item.id ? 'scale-110 drop-shadow-md' : 'opacity-50 grayscale group-hover:grayscale-0'}`}>
                {item.icon}
              </div>
              <div className="text-left">
                <p className="font-bold text-sm leading-none mb-1">{item.label}</p>
                <p className={`text-[10px] transition-colors ${activeView === item.id ? 'text-indigo-200' : 'text-slate-600 group-hover:text-slate-400'}`}>
                  {item.desc}
                </p>
              </div>
              {activeView === item.id && (
                <div className="absolute right-4 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_white]"></div>
              )}
            </button>
          ))}
        </nav>

        {/* Bottom Panel */}
        <div className="p-6 mt-auto">
          <div className="bg-slate-800/40 rounded-3xl p-4 border border-white/5 group transition-all hover:bg-slate-800/60">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-sm font-bold shadow-lg">
                  AD
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate text-white">Quản trị viên</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Cấp quyền cao nhất</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative">
        {/* Top Header Placeholder (could add breadcrumbs here) */}
        <div className="sticky top-0 z-20 h-2 bg-[#f8fafc]/80 backdrop-blur-sm"></div>
        <div className="max-w-7xl mx-auto p-6 md:p-10 lg:p-12 pb-24">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
