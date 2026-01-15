
import React, { useRef, useEffect, useState, useCallback } from 'react';

interface CameraViewProps {
  onCapture: (imageBase64: string) => void;
  isProcessing: boolean;
}

const CameraView: React.FC<CameraViewProps> = ({ onCapture, isProcessing }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        setError('Truy cập Camera thất bại. Vui lòng kiểm tra quyền trình duyệt.');
        console.error(err);
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const captureFrame = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        // Tối ưu hóa: Giảm kích thước ảnh gửi lên AI để tăng tốc độ xử lý (vẫn giữ tỉ lệ khung hình)
        const targetWidth = 640;
        const scale = targetWidth / videoRef.current.videoWidth;
        const targetHeight = videoRef.current.videoHeight * scale;
        
        canvasRef.current.width = targetWidth;
        canvasRef.current.height = targetHeight;
        
        context.drawImage(videoRef.current, 0, 0, targetWidth, targetHeight);
        // Giảm chất lượng JPEG xuống 0.7 để giảm dung lượng file
        const imageData = canvasRef.current.toDataURL('image/jpeg', 0.7);
        onCapture(imageData);
      }
    }
  }, [onCapture]);

  if (error) {
    return (
      <div className="aspect-[16/10] bg-white rounded-[2rem] flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-200">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
            <span className="text-4xl text-red-500">🚫</span>
        </div>
        <p className="text-slate-800 font-bold text-xl mb-2">{error}</p>
        <p className="text-slate-500 max-w-sm">Ứng dụng cần quyền truy cập camera để thực hiện nhận diện khuôn mặt AI.</p>
      </div>
    );
  }

  return (
    <div className="relative group overflow-hidden rounded-[2.5rem] bg-slate-900 border-[12px] border-white shadow-2xl aspect-[16/10] ring-1 ring-slate-200">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover scale-x-[-1]"
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Overlay UI - HUD Style */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {/* Face Detection Frame */}
        <div className={`w-72 h-80 border-2 transition-all duration-500 relative ${isProcessing ? 'border-indigo-500/80 scale-105' : 'border-white/30'}`}>
            {/* Corners */}
            <div className="absolute -top-1 -left-1 w-12 h-12 border-t-[6px] border-l-[6px] border-indigo-500 rounded-tl-2xl"></div>
            <div className="absolute -top-1 -right-1 w-12 h-12 border-t-[6px] border-r-[6px] border-indigo-500 rounded-tr-2xl"></div>
            <div className="absolute -bottom-1 -left-1 w-12 h-12 border-b-[6px] border-l-[6px] border-indigo-500 rounded-bl-2xl"></div>
            <div className="absolute -bottom-1 -right-1 w-12 h-12 border-b-[6px] border-r-[6px] border-indigo-500 rounded-br-2xl"></div>
            
            {/* Scan Line Animation */}
            {isProcessing && <div className="scan-line"></div>}
            
            {/* Decorative HUD markers */}
            <div className="absolute top-1/2 -left-8 h-[1px] w-4 bg-indigo-500/50"></div>
            <div className="absolute top-1/2 -right-8 h-[1px] w-4 bg-indigo-500/50"></div>
        </div>
      </div>

      {/* Status Badges */}
      <div className="absolute top-6 left-6 flex gap-3 pointer-events-none">
        <div className="dark-glass px-4 py-1.5 rounded-full flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_#6366f1] animate-pulse"></div>
            <span className="text-[10px] text-white font-bold tracking-widest uppercase">AI Engine Active</span>
        </div>
      </div>

      <div className="absolute bottom-8 left-0 right-0 px-8 flex justify-center">
        <button
          onClick={captureFrame}
          disabled={isProcessing}
          className={`px-10 py-4 rounded-[1.5rem] font-bold shadow-2xl transition-all duration-300 flex items-center gap-3 active:scale-95 ${
            isProcessing 
            ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700' 
            : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-indigo-500/40 hover:-translate-y-1'
          }`}
        >
          {isProcessing ? (
            <>
              <div className="flex gap-1">
                <div className="w-1.5 h-4 bg-indigo-500 rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
                <div className="w-1.5 h-4 bg-indigo-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                <div className="w-1.5 h-4 bg-indigo-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
              </div>
              XỬ LÝ SIÊU TỐC...
            </>
          ) : (
            <>
              <span className="text-xl">⚡</span>
              BẮT ĐẦU ĐIỂM DANH
            </>
          )}
        </button>
      </div>

      {isProcessing && (
        <div className="absolute inset-0 bg-indigo-950/20 backdrop-blur-[2px] pointer-events-none transition-all duration-500"></div>
      )}
    </div>
  );
};

export default CameraView;
