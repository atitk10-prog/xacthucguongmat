
import React from 'react';
import { CheckInLog, Attendee } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface CheckInDashboardProps {
  logs: CheckInLog[];
  attendees: Attendee[];
}

const CheckInDashboard: React.FC<CheckInDashboardProps> = ({ logs, attendees }) => {
  const successCount = logs.filter(l => l.status === 'success').length;
  const totalExpected = attendees.length;

  const hourlyData = [
    { hour: '08:00', count: logs.filter(l => l.timestamp.getHours() === 8).length },
    { hour: '09:00', count: logs.filter(l => l.timestamp.getHours() === 9).length },
    { hour: '10:00', count: logs.filter(l => l.timestamp.getHours() === 10).length },
    { hour: '11:00', count: logs.filter(l => l.timestamp.getHours() === 11).length },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Tổng quan sự kiện</h2>
          <p className="text-slate-500 mt-1">Số liệu thống kê thời gian thực từ hệ thống AI.</p>
        </div>
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm">
           <span className="text-sm font-bold text-slate-700">Trạng thái:</span>
           <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
             <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
             LIVE DATA
           </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-xl transition-all duration-300">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6 text-xl shadow-inner">👥</div>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Danh sách mời</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-4xl font-black text-slate-900">{attendees.length}</p>
            <span className="text-xs font-bold text-slate-400">người</span>
          </div>
        </div>
        
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-xl transition-all duration-300">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 text-xl shadow-inner">✅</div>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Đã có mặt</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-4xl font-black text-indigo-600">{successCount}</p>
            <span className="text-xs font-bold text-indigo-400">/ {totalExpected}</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-6 overflow-hidden">
            <div 
              className="h-full bg-indigo-600 rounded-full transition-all duration-1000"
              style={{ width: `${(successCount / totalExpected) * 100}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-xl transition-all duration-300">
          <div className="w-12 h-12 bg-violet-50 text-violet-600 rounded-2xl flex items-center justify-center mb-6 text-xl shadow-inner">⚡</div>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Tốc độ AI</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-4xl font-black text-slate-900">0.8</p>
            <span className="text-xs font-bold text-slate-400">giây / lượt</span>
          </div>
          <p className="text-[10px] font-bold text-emerald-600 mt-4">TỐI ƯU HÓA 98%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold mb-8 flex items-center gap-2">
            <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
            Lưu lượng điểm danh
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}}
                />
                <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={4} fillOpacity={1} fill="url(#colorCount)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col">
          <div className="p-8 border-b border-slate-50 flex justify-between items-center">
            <h3 className="text-lg font-bold">Lịch sử mới nhất</h3>
            <div className="flex -space-x-2">
               {logs.slice(0, 5).map((log, i) => (
                 <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] font-bold">
                   {log.status === 'success' ? '✅' : '❌'}
                 </div>
               ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[350px] p-2">
            {logs.length > 0 ? (
              <div className="space-y-2">
                {logs.slice().reverse().map((log) => {
                  const attendee = attendees.find(a => a.id === log.attendeeId);
                  return (
                    <div key={log.id} className="flex items-center justify-between p-4 hover:bg-slate-50 rounded-2xl transition-colors group">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg ${log.status === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                          {log.status === 'success' ? '👤' : '❓'}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{attendee?.name || 'Vô danh'}</p>
                          <p className="text-[10px] font-medium text-slate-400 uppercase">{log.timestamp.toLocaleTimeString('vi-VN')}</p>
                        </div>
                      </div>
                      <div className="text-right">
                         <p className="text-xs font-black text-slate-700">{log.confidence}% Match</p>
                         <p className={`text-[10px] font-bold uppercase ${log.status === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
                           {log.status === 'success' ? 'Verified' : 'Failed'}
                         </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 p-12 text-center">
                <span className="text-4xl mb-2">📥</span>
                <p className="text-sm font-medium">Chưa có hoạt động nào được ghi lại.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckInDashboard;
