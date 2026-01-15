
import React, { useState, useCallback } from 'react';
import Layout from './components/Layout';
import CameraView from './components/CameraView';
import CheckInDashboard from './components/CheckInDashboard';
import AttendeeList from './components/AttendeeList';
import AttendeeModal from './components/AttendeeModal';
import { Attendee, CheckInLog, AppView, RecognitionResult } from './types';
import { INITIAL_ATTENDEES } from './constants';
import { geminiService } from './services/geminiService';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('checkin');
  const [attendees, setAttendees] = useState<Attendee[]>(INITIAL_ATTENDEES);
  const [logs, setLogs] = useState<CheckInLog[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<{ result: RecognitionResult, attendee?: Attendee } | null>(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAttendee, setEditingAttendee] = useState<Attendee | null>(null);

  const handleCapture = useCallback(async (imageBase64: string) => {
    setIsProcessing(true);
    setLastResult(null);

    try {
      // Gọi service nhận diện nhanh
      const result = await geminiService.recognizeFace(imageBase64, attendees);
      
      let matchedAttendee: Attendee | undefined;
      if (result.matchedId) {
        matchedAttendee = attendees.find(a => a.id === result.matchedId);
      }

      const newLog: CheckInLog = {
        id: Math.random().toString(36).substr(2, 9),
        attendeeId: result.matchedId || 'unknown',
        timestamp: new Date(),
        confidence: result.confidence,
        status: (result.matchedId && result.confidence >= 60) ? 'success' : 'failed'
      };

      setLogs(prev => [...prev, newLog]);
      setLastResult({ result, attendee: matchedAttendee });
      
      // Hiển thị kết quả ngắn hơn một chút nếu là thành công để sẵn sàng cho lượt tiếp theo
      if (newLog.status === 'success') {
        setTimeout(() => setLastResult(null), 5000);
      }
    } catch (err) {
      console.error("Fast AI Analysis failed:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [attendees]);

  // Attendee Management Functions
  const openAddModal = () => {
    setEditingAttendee(null);
    setIsModalOpen(true);
  };

  const openEditModal = (attendee: Attendee) => {
    setEditingAttendee(attendee);
    setIsModalOpen(true);
  };

  const handleDeleteAttendee = (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa thành viên này khỏi hệ thống?')) {
      setAttendees(prev => prev.filter(a => a.id !== id));
    }
  };

  const handleSaveAttendee = (data: Partial<Attendee>) => {
    if (editingAttendee) {
      // Update
      setAttendees(prev => prev.map(a => a.id === editingAttendee.id ? { ...a, ...data } as Attendee : a));
    } else {
      // Create
      const newAttendee: Attendee = {
        ...data,
        id: Math.random().toString(36).substr(2, 9),
      } as Attendee;
      setAttendees(prev => [...prev, newAttendee]);
    }
    setIsModalOpen(false);
  };

  const renderContent = () => {
    switch (view) {
      case 'checkin':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-fadeIn">
            <div className="lg:col-span-8 space-y-8">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-4xl font-black text-slate-900 tracking-tight">Xác thực khuôn mặt</h2>
                  <p className="text-slate-500 mt-2 font-medium">Chế độ nhận diện siêu tốc (Low-latency Mode).</p>
                </div>
              </div>
              
              <CameraView onCapture={handleCapture} isProcessing={isProcessing} />
              
              <div className="bg-indigo-600 rounded-[2rem] p-8 text-white shadow-xl shadow-indigo-200 relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-12 opacity-10 text-9xl transition-transform group-hover:scale-125 duration-700">🏢</div>
                 <div className="relative z-10">
                   <h4 className="text-xl font-black mb-4 flex items-center gap-2">
                     <span className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-sm">📍</span>
                     Thông tin sự kiện
                   </h4>
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-widest mb-1">Sự kiện</p>
                        <p className="font-bold text-sm">Hội thảo AI 2024</p>
                      </div>
                      <div>
                        <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-widest mb-1">Thời gian</p>
                        <p className="font-bold text-sm">08:30 Sáng</p>
                      </div>
                      <div>
                        <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-widest mb-1">Địa điểm</p>
                        <p className="font-bold text-sm">Hội trường A</p>
                      </div>
                      <div>
                        <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-widest mb-1">Ban tổ chức</p>
                        <p className="font-bold text-sm">AI Division</p>
                      </div>
                   </div>
                 </div>
              </div>
            </div>

            <div className="lg:col-span-4 space-y-8">
              <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                <span className="w-1.5 h-8 bg-indigo-600 rounded-full"></span>
                Trạng thái AI
              </h2>
              
              {!lastResult && !isProcessing && (
                <div className="bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-12 text-center text-slate-400 group hover:border-indigo-300 transition-colors duration-500">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 text-4xl group-hover:scale-110 transition-transform">🔍</div>
                  <p className="font-bold text-slate-800">Sẵn sàng quét</p>
                  <p className="text-xs mt-2 px-4">Đã tối ưu hóa tốc độ xử lý.</p>
                </div>
              )}

              {isProcessing && (
                <div className="bg-white rounded-[2.5rem] shadow-xl border border-indigo-100 flex flex-col items-center justify-center p-12 text-center relative overflow-hidden">
                  <div className="shimmer absolute inset-0 opacity-50"></div>
                  <div className="relative z-10">
                    <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-6">
                      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <p className="text-indigo-900 font-black text-lg">Đang xác thực...</p>
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-2">Ultra-fast Analysis</p>
                  </div>
                </div>
              )}

              {lastResult && (
                <div className={`rounded-[2.5rem] p-8 shadow-2xl transition-all duration-500 transform scale-100 border-t-8 ${
                  lastResult.result.matchedId ? 'bg-white border-indigo-600' : 'bg-red-50 border-red-500'
                }`}>
                  {lastResult.result.matchedId && lastResult.attendee ? (
                    <div className="space-y-6">
                      <div className="flex flex-col items-center text-center">
                        <div className="relative mb-4">
                          <img 
                            src={lastResult.attendee.imageUrl} 
                            alt="Matched" 
                            className="w-28 h-28 rounded-[2rem] object-cover ring-4 ring-indigo-50 shadow-2xl"
                          />
                          <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white p-2 rounded-xl shadow-lg">
                            <span className="text-xs">✓</span>
                          </div>
                        </div>
                        <h4 className="text-2xl font-black text-slate-900 leading-tight mb-1">{lastResult.attendee.name}</h4>
                        <span className="bg-indigo-50 text-indigo-700 px-4 py-1 rounded-full text-[10px] font-black tracking-widest uppercase">
                          {lastResult.attendee.role}
                        </span>
                      </div>

                      <div className="bg-slate-50 rounded-3xl p-6 space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-slate-400 uppercase">Mã số</span>
                          <span className="text-sm font-bold text-slate-800">{lastResult.attendee.code}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-slate-400 uppercase">Độ khớp</span>
                          <span className="text-sm font-black text-indigo-600">{lastResult.result.confidence}%</span>
                        </div>
                      </div>

                      <div className="bg-indigo-600 text-white text-center py-4 rounded-2xl text-sm font-black shadow-lg shadow-indigo-200 animate-pulse">
                        XÁC THỰC THÀNH CÔNG
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <div className="w-20 h-20 bg-red-100 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6 text-4xl">⚠️</div>
                      <h4 className="text-xl font-black text-red-900 mb-2">Không thể xác thực</h4>
                      <p className="text-sm text-red-600/80 mb-8 font-medium">AI không tìm thấy khuôn mặt tương đồng.</p>
                      <button 
                        onClick={() => setLastResult(null)}
                        className="w-full py-4 bg-red-600 text-white rounded-2xl text-sm font-black hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                      >
                        THỬ LẠI NGAY
                      </button>
                    </div>
                  )}
                </div>
              )}
              
              <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                 <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                   <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                   Hệ thống tối ưu
                 </h4>
                 <ul className="space-y-3">
                   {[
                     "Ảnh được nén tự động trước khi gửi",
                     "Thời gian phản hồi mục tiêu: < 1.5s",
                     "Sử dụng mạng thần kinh Gemini 3"
                   ].map((tip, i) => (
                     <li key={i} className="flex gap-3 text-xs text-slate-500 font-medium">
                       <span className="text-indigo-600">✦</span>
                       {tip}
                     </li>
                   ))}
                 </ul>
              </div>
            </div>
          </div>
        );
      case 'dashboard':
        return <CheckInDashboard logs={logs} attendees={attendees} />;
      case 'registry':
        return (
          <AttendeeList 
            attendees={attendees} 
            onEdit={openEditModal} 
            onDelete={handleDeleteAttendee} 
            onAdd={openAddModal}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Layout activeView={view} onViewChange={setView}>
      <div className="transition-all duration-500 ease-in-out">
        {renderContent()}
      </div>
      
      <AttendeeModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSaveAttendee} 
        editingAttendee={editingAttendee} 
      />

      <footer className="mt-20 py-8 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
        <p>© 2024 AI FACE ID PRO • SECURED BIOMETRICS</p>
        <div className="flex gap-6">
          <a href="#" className="hover:text-indigo-600 transition-colors">Security Policy</a>
          <a href="#" className="hover:text-indigo-600 transition-colors">API Docs</a>
          <a href="#" className="hover:text-indigo-600 transition-colors">System Status</a>
        </div>
      </footer>
    </Layout>
  );
};

export default App;
