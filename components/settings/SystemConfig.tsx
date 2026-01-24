import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';

interface Config {
    key: string;
    value: string;
    description: string;
}

interface SystemConfigProps {
    onBack?: () => void;
}

const SystemConfig: React.FC<SystemConfigProps> = ({ onBack }) => {
    const [configs, setConfigs] = useState<Config[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [editedConfigs, setEditedConfigs] = useState<Record<string, string>>({});
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    useEffect(() => {
        loadConfigs();
    }, []);

    const loadConfigs = async () => {
        setIsLoading(true);
        try {
            const response = await dataService.getConfigs();
            if (response.success && response.data) {
                setConfigs(response.data);
            }
        } catch (error) {
            console.error('Failed to load configs:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleValueChange = (key: string, value: string) => {
        setEditedConfigs(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        setResult(null);

        try {
            for (const [key, value] of Object.entries(editedConfigs)) {
                await dataService.updateConfig(key, String(value));
            }
            setResult({ success: true, message: 'Đã lưu cấu hình thành công!' });
            setEditedConfigs({});
            loadConfigs();
        } catch (error) {
            setResult({ success: false, message: 'Có lỗi xảy ra khi lưu cấu hình' });
        } finally {
            setIsSaving(false);
        }
    };

    const getConfigValue = (key: string): string => {
        if (editedConfigs[key] !== undefined) return editedConfigs[key];
        const config = configs.find(c => c.key === key);
        return config ? config.value : '';
    };

    const handleInitSystem = async () => {
        setIsInitializing(true);
        setResult(null);
        try {
            const response = await dataService.initSystem();
            if (response.success) {
                setResult({ success: true, message: response.message || 'Đã cập nhật cấu trúc hệ thống thành công! Các sheet mới đã được tạo.' });
            } else {
                setResult({ success: false, message: response.error || 'Có lỗi xảy ra khi cập nhật' });
            }
        } catch (error) {
            setResult({ success: false, message: 'Lỗi kết nối khi cập nhật cấu trúc hệ thống' });
        } finally {
            setIsInitializing(false);
        }
    };

    const ConfigIcons: Record<string, React.ReactNode> = {
        checkin: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
        boarding: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>,
        manual: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>,
        threshold: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
        face: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>,
        start: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
        default: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
    };

    const getConfigIcon = (key: string): React.ReactNode => {
        if (key.includes('on_time')) return <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
        if (key.includes('late')) return <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
        if (key.includes('absent')) return <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
        if (key.includes('threshold')) return ConfigIcons.threshold;
        if (key.includes('face')) return ConfigIcons.face;
        if (key.includes('start')) return ConfigIcons.start;
        return ConfigIcons.default;
    };

    const getConfigLabel = (key: string, description?: string): string => {
        // Map legacy/system keys to clearer names
        const labels: Record<string, string> = {
            'points_late': 'Điểm sự kiện: Đi muộn',
            'points_on_time': 'Điểm sự kiện: Đúng giờ',
            'points_absent_event': 'Điểm sự kiện: Vắng mặt',
            'points_late_boarding': 'Điểm nội trú: Đi muộn',
            'points_absent_boarding': 'Điểm nội trú: Vắng mặt',
            'start_points': 'Điểm Khởi Đầu (Tất cả HS)',
            'late_threshold_mins': 'Sự kiện: Ngưỡng đi muộn (phút)',
            'school_name': 'Thông tin: Tên trường',
            'school_address': 'Thông tin: Địa chỉ trường',
            'face_threshold': 'Bảo mật: Ngưỡng nhận diện (Face ID)'
        };

        if (labels[key]) return labels[key];

        // Dynamic formatting for other keys
        if (key.toLowerCase().includes('boarding') || description?.toLowerCase().includes('nội trú')) {
            return description || `Nội trú: ${key}`;
        }

        return description || key;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const pointConfigs = configs.filter(c => c.key.includes('points') || c.key.includes('boarding'));
    const thresholdConfigs = configs.filter(c => c.key.includes('threshold'));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Cấu hình Hệ thống
                    </h2>
                    <p className="text-slate-500 font-medium mt-1">Thiết lập điểm số và các thông số hệ thống</p>
                </div>
                <div className="flex gap-2">
                    {onBack && (
                        <button onClick={onBack} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">
                            ← Quay lại
                        </button>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={Object.keys(editedConfigs).length === 0 || isSaving}
                        className={`px-6 py-2 rounded-xl font-bold flex items-center gap-2 ${Object.keys(editedConfigs).length === 0 || isSaving
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                            }`}
                    >
                        {isSaving ? (
                            <><svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" /><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75" /></svg> Đang lưu...</>
                        ) : (
                            <><svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg> Lưu thay đổi</>
                        )}
                    </button>
                </div>
            </div>

            {result && (
                <div className={`p-4 rounded-2xl ${result.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {result.message}
                </div>
            )}

            {/* Point Configuration */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                    <span className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
                    </span>
                    Cấu hình Điểm số
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pointConfigs.map(config => (
                        <div key={config.key} className="bg-slate-50 rounded-2xl p-4">
                            <div className="flex items-center gap-2 mb-2 text-slate-600">
                                {getConfigIcon(config.key)}
                                <p className="text-sm font-bold">{getConfigLabel(config.key, config.description)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    value={getConfigValue(config.key)}
                                    onChange={e => handleValueChange(config.key, e.target.value)}
                                    className={`w-full px-4 py-3 rounded-xl border-2 text-lg font-bold text-center ${parseInt(getConfigValue(config.key)) >= 0
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                        : 'border-red-200 bg-red-50 text-red-600'
                                        }`}
                                />
                                <span className="text-slate-400 font-bold">điểm</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Threshold Configuration */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                    <span className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </span>
                    Cấu hình Ngưỡng
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {thresholdConfigs.map(config => (
                        <div key={config.key} className="bg-slate-50 rounded-2xl p-4">
                            <div className="flex items-center gap-2 mb-2 text-slate-600">
                                {getConfigIcon(config.key)}
                                <p className="text-sm font-bold">{getConfigLabel(config.key, config.description)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    value={getConfigValue(config.key)}
                                    onChange={e => handleValueChange(config.key, e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-white text-lg font-bold text-center"
                                />
                                <span className="text-slate-400 font-bold">
                                    {config.key.includes('face') ? '%' : 'phút'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Quick Actions Info */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-3xl p-6 border border-indigo-100">
                <h3 className="font-bold text-indigo-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" /></svg>
                    Hướng dẫn cấu hình
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-indigo-700">
                    <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 flex-shrink-0 text-emerald-500 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <p><strong>Điểm check-in đúng giờ:</strong> Số điểm cộng khi check-in trước thời gian quy định</p>
                    </div>
                    <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 flex-shrink-0 text-amber-500 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                        <p><strong>Điểm check-in muộn:</strong> Số điểm trừ khi check-in sau thời gian quy định</p>
                    </div>
                    <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 flex-shrink-0 text-red-500 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <p><strong>Điểm vắng mặt:</strong> Số điểm trừ khi không tham gia sự kiện</p>
                    </div>
                    <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 flex-shrink-0 text-indigo-500 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <p><strong>Ngưỡng đi muộn:</strong> Số phút sau thời gian bắt đầu được tính là muộn</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemConfig;
