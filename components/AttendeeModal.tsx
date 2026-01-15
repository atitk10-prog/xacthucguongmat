
import React, { useState, useEffect, useRef } from 'react';
import { Attendee } from '../types';

interface AttendeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (attendee: Partial<Attendee>) => void;
  editingAttendee: Attendee | null;
}

const AttendeeModal: React.FC<AttendeeModalProps> = ({ isOpen, onClose, onSave, editingAttendee }) => {
  const [formData, setFormData] = useState<Partial<Attendee>>({
    name: '',
    code: '',
    department: '',
    role: 'Sinh viên',
    imageUrl: ''
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingAttendee) {
      setFormData(editingAttendee);
    } else {
      setFormData({
        name: '',
        code: '',
        department: '',
        role: 'Sinh viên',
        imageUrl: ''
      });
    }
  }, [editingAttendee, isOpen]);

  if (!isOpen) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, imageUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 overflow-hidden">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-fadeIn" onClick={onClose}></div>
      
      <div className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl shadow-slate-900/20 overflow-hidden animate-slideUp">
        {/* Header */}
        <div className="px-10 py-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">
              {editingAttendee ? 'Cập nhật thông tin' : 'Đăng ký thành viên mới'}
            </h3>
            <p className="text-sm text-slate-500 font-medium">Đảm bảo ảnh rõ mặt để AI nhận diện chính xác nhất.</p>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-2xl hover:bg-slate-200 transition-colors flex items-center justify-center text-2xl">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Image Section */}
            <div className="flex flex-col items-center gap-4">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full aspect-square rounded-[2rem] bg-slate-100 border-4 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all group overflow-hidden relative"
              >
                {formData.imageUrl ? (
                  <img src={formData.imageUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="Preview" />
                ) : (
                  <div className="text-center p-6">
                    <span className="text-4xl mb-2 block">📷</span>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tải ảnh lên</p>
                  </div>
                )}
                <div className="absolute inset-0 bg-indigo-600/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                   <span className="text-white font-bold text-sm">Thay đổi ảnh</span>
                </div>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                className="hidden" 
                accept="image/*" 
              />
              <p className="text-[10px] text-slate-400 font-bold uppercase">Ảnh định dạng JPG, PNG (Max 5MB)</p>
            </div>

            {/* Fields Section */}
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Họ và tên</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-bold transition-all"
                  placeholder="Nhập họ tên..."
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Mã số (ID)</label>
                <input 
                  required
                  type="text" 
                  value={formData.code}
                  onChange={e => setFormData({...formData, code: e.target.value})}
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-bold transition-all"
                  placeholder="Vd: SV001..."
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Phòng ban / Lớp</label>
                <input 
                  required
                  type="text" 
                  value={formData.department}
                  onChange={e => setFormData({...formData, department: e.target.value})}
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-bold transition-all"
                  placeholder="Vd: Khoa CNTT..."
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Vai trò</label>
                <select 
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value})}
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-bold transition-all appearance-none"
                >
                  <option value="Sinh viên">Sinh viên</option>
                  <option value="Giảng viên">Giảng viên</option>
                  <option value="Khách mời">Khách mời</option>
                  <option value="Ban tổ chức">Ban tổ chức</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-12 flex gap-4">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-sm hover:bg-slate-200 transition-colors"
            >
              HỦY BỎ
            </button>
            <button 
              type="submit"
              className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-600/30 hover:bg-indigo-700 transition-all hover:-translate-y-1"
            >
              LƯU THÔNG TIN
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AttendeeModal;
