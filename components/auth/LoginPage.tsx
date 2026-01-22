import React, { useState } from 'react';
import { dataService } from '../../services/dataService';
import { User } from '../../types';
import FaceLoginModal from './FaceLoginModal';
import { Camera } from 'lucide-react';

interface LoginPageProps {
    onLoginSuccess: (user: User) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showFaceLogin, setShowFaceLogin] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const result = await dataService.login(email, password);
            if (result.success && result.data) {
                onLoginSuccess(result.data.user);
            } else {
                setError(result.error || 'Đăng nhập thất bại');
            }
        } catch (err) {
            setError('Lỗi kết nối. Vui lòng thử lại.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFaceLoginSuccess = (user: User) => {
        // Store user session
        dataService.storeUser(user);
        onLoginSuccess(user);
    };

    return (
        <>
            <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex items-center justify-center p-4">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-20 left-20 w-72 h-72 bg-indigo-500/20 rounded-full blur-3xl"></div>
                    <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"></div>
                </div>

                <div className="w-full max-w-md relative z-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 backdrop-blur-sm rounded-3xl mb-4 border border-white/20">
                            <span className="text-4xl">🛡️</span>
                        </div>
                        <h1 className="text-3xl font-black text-white mb-2">EduCheck</h1>
                        <p className="text-indigo-200 text-sm font-medium">Hệ thống check-in AI dành cho giáo dục</p>
                    </div>

                    <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 border border-white/20 shadow-2xl">
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && (
                                <div className="bg-red-500/20 border border-red-500/30 rounded-2xl p-4 text-red-200 text-sm font-medium flex items-center gap-2">
                                    <span>⚠️</span>{error}
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-black text-indigo-200 uppercase tracking-wider mb-2">Email</label>
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="email@example.com"
                                    className="w-full px-5 py-4 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                            </div>

                            <div>
                                <label className="block text-xs font-black text-indigo-200 uppercase tracking-wider mb-2">Mật khẩu</label>
                                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••"
                                    className="w-full px-5 py-4 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                            </div>

                            <button type="submit" disabled={isLoading}
                                className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition-all ${isLoading ? 'bg-indigo-600/50 text-indigo-200 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg'}`}>
                                {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                            </button>
                        </form>

                        {/* Divider */}
                        <div className="flex items-center gap-4 my-6">
                            <div className="flex-1 h-px bg-white/20"></div>
                            <span className="text-white/50 text-xs font-bold uppercase tracking-wider">hoặc</span>
                            <div className="flex-1 h-px bg-white/20"></div>
                        </div>

                        {/* FaceID Login Button */}
                        <button
                            onClick={() => setShowFaceLogin(true)}
                            className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-2xl font-black text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:-translate-y-0.5"
                        >
                            <Camera className="w-5 h-5" />
                            Đăng nhập bằng Khuôn mặt
                        </button>
                    </div>

                    <p className="text-center text-indigo-300/60 text-xs mt-6">© 2024 EduCheck • Powered by Gemini AI</p>
                </div>
            </div>

            {/* FaceLogin Modal */}
            <FaceLoginModal
                isOpen={showFaceLogin}
                onClose={() => setShowFaceLogin(false)}
                onLoginSuccess={handleFaceLoginSuccess}
            />
        </>
    );
};

export default LoginPage;
