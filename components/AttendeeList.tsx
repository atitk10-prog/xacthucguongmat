
import React from 'react';
import { Attendee } from '../types';

interface AttendeeListProps {
  attendees: Attendee[];
  onEdit: (attendee: Attendee) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

const AttendeeList: React.FC<AttendeeListProps> = ({ attendees, onEdit, onDelete, onAdd }) => {
  return (
    <div className="animate-fadeIn space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Quản lý nhân sự</h2>
          <p className="text-slate-500 font-medium">Danh sách các đối tượng được phép điểm danh bằng AI.</p>
        </div>
        <button 
          onClick={onAdd}
          className="px-8 py-3.5 bg-indigo-600 text-white rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all hover:-translate-y-1 active:scale-95"
        >
          <span className="text-xl">+</span>
          THÊM THÀNH VIÊN
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] bg-slate-50/50">
                <th className="px-8 py-6">Nhân sự</th>
                <th className="px-8 py-6">Thông tin định danh</th>
                <th className="px-8 py-6">Phòng ban</th>
                <th className="px-8 py-6">Vai trò</th>
                <th className="px-8 py-6 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {attendees.map((attendee) => (
                <tr key={attendee.id} className="hover:bg-slate-50/80 transition-all group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <img
                          src={attendee.imageUrl}
                          alt={attendee.name}
                          className="w-14 h-14 rounded-2xl object-cover ring-2 ring-white shadow-md group-hover:scale-110 transition-transform duration-500"
                        />
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white"></div>
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-base leading-tight">{attendee.name}</p>
                        <p className="text-xs font-medium text-slate-400 mt-0.5">ID: {attendee.code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="text-sm font-bold text-slate-600 font-mono bg-slate-100 px-3 py-1 rounded-lg">
                      {attendee.code}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <p className="text-sm font-bold text-slate-700">{attendee.department}</p>
                  </td>
                  <td className="px-8 py-5">
                    <span className="inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-indigo-50 text-indigo-600 border border-indigo-100">
                      {attendee.role}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={() => onEdit(attendee)}
                        className="w-10 h-10 bg-white border border-slate-200 text-slate-600 rounded-xl flex items-center justify-center hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
                        title="Chỉnh sửa"
                      >
                        ✏️
                      </button>
                      <button 
                        onClick={() => onDelete(attendee.id)}
                        className="w-10 h-10 bg-white border border-slate-200 text-slate-600 rounded-xl flex items-center justify-center hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all shadow-sm"
                        title="Xóa"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {attendees.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center text-slate-400">
                    <div className="flex flex-col items-center">
                      <span className="text-5xl mb-4 opacity-50">📁</span>
                      <p className="font-bold text-lg">Chưa có người tham dự nào</p>
                      <p className="text-sm">Hãy nhấn "Thêm thành viên" để bắt đầu.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AttendeeList;
