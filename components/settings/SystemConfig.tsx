import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';
import { Icons } from '../ui';
import { useToast } from '../ui/Toast';

interface Config {
    key: string;
    value: string;
    description: string;
}

interface SystemConfigProps {
    onBack?: () => void;
}

// ── Section definitions: group configs logically ──────────────────
interface ConfigSection {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    iconBg: string;
    borderColor: string;
    keys: string[];
}

const SECTIONS: ConfigSection[] = [
    {
        id: 'school',
        title: 'Thông tin Trường học',
        description: 'Tên trường và địa chỉ hiển thị trên thẻ, chứng nhận',
        icon: <Icons.Home className="w-5 h-5" />,
        iconBg: 'bg-blue-100 text-blue-600',
        borderColor: 'border-blue-100',
        keys: ['school_name', 'school_address'],
    },
    {
        id: 'event_points',
        title: 'Điểm số Sự kiện',
        description: 'Cấu hình điểm cộng / trừ khi check-in sự kiện',
        icon: <Icons.Events className="w-5 h-5" />,
        iconBg: 'bg-emerald-100 text-emerald-600',
        borderColor: 'border-emerald-100',
        keys: ['points_on_time', 'points_late', 'points_absent_event', 'start_points'],
    },
    {
        id: 'boarding_points',
        title: 'Điểm số Nội trú',
        description: 'Cấu hình điểm trừ cho nội trú (đi muộn / vắng)',
        icon: <Icons.Boarding className="w-5 h-5" />,
        iconBg: 'bg-purple-100 text-purple-600',
        borderColor: 'border-purple-100',
        keys: ['points_late_boarding', 'points_absent_boarding'],
    },
    {
        id: 'thresholds',
        title: 'Ngưỡng hệ thống',
        description: 'Thời gian và độ chính xác cho các tính năng',
        icon: <Icons.Settings className="w-5 h-5" />,
        iconBg: 'bg-amber-100 text-amber-600',
        borderColor: 'border-amber-100',
        keys: ['late_threshold_mins', 'face_threshold'],
    },
];

// ── Readable labels & units ───────────────────────────────────────
const CONFIG_META: Record<string, { label: string; unit?: string; type: 'text' | 'number'; color?: string }> = {
    school_name: { label: 'Tên trường', type: 'text' },
    school_address: { label: 'Địa chỉ trường', type: 'text' },
    points_on_time: { label: 'Đúng giờ', unit: 'điểm', type: 'number', color: 'emerald' },
    points_late: { label: 'Đi muộn', unit: 'điểm', type: 'number', color: 'amber' },
    points_absent_event: { label: 'Vắng mặt', unit: 'điểm', type: 'number', color: 'red' },
    start_points: { label: 'Điểm khởi đầu (HS mới)', unit: 'điểm', type: 'number', color: 'blue' },
    points_late_boarding: { label: 'Đi muộn nội trú', unit: 'điểm', type: 'number', color: 'amber' },
    points_absent_boarding: { label: 'Vắng nội trú', unit: 'điểm', type: 'number', color: 'red' },
    late_threshold_mins: { label: 'Ngưỡng đi muộn', unit: 'phút', type: 'number', color: 'amber' },
    face_threshold: { label: 'Ngưỡng nhận diện Face ID', unit: '%', type: 'number', color: 'indigo' },
};

// ── Component ─────────────────────────────────────────────────────
const SystemConfig: React.FC<SystemConfigProps> = ({ onBack }) => {
    const [configs, setConfigs] = useState<Config[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [editedConfigs, setEditedConfigs] = useState<Record<string, string>>({});
    const toast = useToast();

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
            toast.error('Lỗi tải cấu hình');
        } finally {
            setIsLoading(false);
        }
    };

    const handleValueChange = (key: string, value: string) => {
        setEditedConfigs(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        if (Object.keys(editedConfigs).length === 0) return;
        setIsSaving(true);
        try {
            for (const [key, value] of Object.entries(editedConfigs)) {
                await dataService.updateConfig(key, String(value));
            }
            toast.success('Đã lưu cấu hình thành công!');
            setEditedConfigs({});
            loadConfigs();
        } catch (error) {
            toast.error('Có lỗi xảy ra khi lưu cấu hình');
        } finally {
            setIsSaving(false);
        }
    };

    const getConfigValue = (key: string): string => {
        if (editedConfigs[key] !== undefined) return editedConfigs[key];
        const config = configs.find(c => c.key === key);
        return config ? config.value : '';
    };

    const hasChanges = Object.keys(editedConfigs).length > 0;

    // ── Render helpers ────────────────────────────────────────────
    const renderNumberInput = (key: string) => {
        const meta = CONFIG_META[key] || { label: key, unit: '', type: 'number' };
        const val = getConfigValue(key);
        const numVal = parseInt(val);
        const isEdited = editedConfigs[key] !== undefined;

        let borderColor = 'border-slate-200';
        let bgColor = 'bg-white';
        let textColor = 'text-slate-900';

        if (isEdited) {
            borderColor = 'border-indigo-400';
            bgColor = 'bg-indigo-50';
        } else if (!isNaN(numVal)) {
            if (numVal > 0) {
                borderColor = 'border-emerald-200';
                textColor = 'text-emerald-700';
            } else if (numVal < 0) {
                borderColor = 'border-red-200';
                textColor = 'text-red-600';
            }
        }

        return (
            <div key={key} className="bg-slate-50/80 rounded-2xl p-4 hover:bg-slate-50 transition-colors">
                <p className="text-sm font-bold text-slate-600 mb-2">{meta.label}</p>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        value={val}
                        onChange={e => handleValueChange(key, e.target.value)}
                        className={`w-full px-4 py-3 rounded-xl border-2 text-lg font-bold text-center transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 ${borderColor} ${bgColor} ${textColor}`}
                    />
                    {meta.unit && <span className="text-slate-400 font-bold text-sm whitespace-nowrap">{meta.unit}</span>}
                </div>
            </div>
        );
    };

    const renderTextInput = (key: string) => {
        const meta = CONFIG_META[key] || { label: key, type: 'text' };
        const val = getConfigValue(key);
        const isEdited = editedConfigs[key] !== undefined;

        return (
            <div key={key} className="bg-slate-50/80 rounded-2xl p-4 hover:bg-slate-50 transition-colors">
                <p className="text-sm font-bold text-slate-600 mb-2">{meta.label}</p>
                <input
                    type="text"
                    value={val}
                    onChange={e => handleValueChange(key, e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border-2 text-base font-medium transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 ${isEdited ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'
                        } text-slate-900`}
                />
            </div>
        );
    };

    // ── Loading ───────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-500 font-medium">Đang tải cấu hình...</p>
                </div>
            </div>
        );
    }

    // ── Main ──────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
                        <Icons.Settings className="w-7 h-7 md:w-8 md:h-8 text-slate-600" />
                        Cấu hình Hệ thống
                    </h2>
                    <p className="text-slate-500 font-medium mt-1 text-sm">Thiết lập thông tin trường, điểm số và các thông số hệ thống</p>
                </div>
                <div className="flex w-full md:w-auto gap-2">
                    {onBack && (
                        <button onClick={onBack} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                            <Icons.ChevronLeft className="w-5 h-5 inline mr-1" />
                            Quay lại
                        </button>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={!hasChanges || isSaving}
                        className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${hasChanges && !isSaving
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                    >
                        {isSaving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                Đang lưu...
                            </>
                        ) : (
                            <>
                                <Icons.CheckCircle className="w-5 h-5" />
                                Lưu thay đổi
                                {hasChanges && (
                                    <span className="ml-1 px-2 py-0.5 text-xs bg-white/20 rounded-full">{Object.keys(editedConfigs).length}</span>
                                )}
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Unsaved changes banner */}
            {hasChanges && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <Icons.AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <p className="text-sm font-medium text-amber-800">
                        Bạn có <strong>{Object.keys(editedConfigs).length}</strong> thay đổi chưa lưu. Nhấn "Lưu thay đổi" để áp dụng.
                    </p>
                    <button
                        onClick={() => setEditedConfigs({})}
                        className="ml-auto text-xs font-bold text-amber-700 hover:text-amber-900 px-3 py-1.5 bg-amber-100 rounded-lg hover:bg-amber-200 transition-colors"
                    >
                        Hoàn tác
                    </button>
                </div>
            )}

            {/* Config Sections */}
            {SECTIONS.map(section => {
                // Only render section if it has at least one config key present
                const sectionConfigs = section.keys.filter(key =>
                    configs.some(c => c.key === key) || CONFIG_META[key]
                );
                if (sectionConfigs.length === 0) return null;

                return (
                    <div key={section.id} className={`bg-white rounded-2xl md:rounded-3xl shadow-sm border ${section.borderColor} overflow-hidden`}>
                        {/* Section Header */}
                        <div className="px-6 py-5 border-b border-slate-100/80">
                            <div className="flex items-center gap-3">
                                <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${section.iconBg}`}>
                                    {section.icon}
                                </span>
                                <div>
                                    <h3 className="text-lg font-black text-slate-900">{section.title}</h3>
                                    <p className="text-xs text-slate-400 font-medium">{section.description}</p>
                                </div>
                            </div>
                        </div>

                        {/* Section Body */}
                        <div className="p-5 md:p-6">
                            <div className={`grid gap-4 ${section.id === 'school'
                                ? 'grid-cols-1'
                                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                                }`}>
                                {sectionConfigs.map(key => {
                                    const meta = CONFIG_META[key];
                                    if (!meta) return null;
                                    return meta.type === 'text' ? renderTextInput(key) : renderNumberInput(key);
                                })}
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* Render any extra configs not in predefined sections */}
            {(() => {
                const allDefinedKeys = SECTIONS.flatMap(s => s.keys);
                const extraConfigs = configs.filter(c => !allDefinedKeys.includes(c.key));

                if (extraConfigs.length === 0) return null;

                return (
                    <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="px-6 py-5 border-b border-slate-100/80">
                            <div className="flex items-center gap-3">
                                <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600">
                                    <Icons.Settings className="w-5 h-5" />
                                </span>
                                <div>
                                    <h3 className="text-lg font-black text-slate-900">Cấu hình khác</h3>
                                    <p className="text-xs text-slate-400 font-medium">Các thông số bổ sung từ cơ sở dữ liệu</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-5 md:p-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {extraConfigs.map(config => (
                                    <div key={config.key} className="bg-slate-50/80 rounded-2xl p-4 hover:bg-slate-50 transition-colors">
                                        <p className="text-sm font-bold text-slate-600 mb-1">{config.description || config.key}</p>
                                        <code className="text-[10px] text-slate-400 font-mono">{config.key}</code>
                                        <div className="mt-2">
                                            <input
                                                type="text"
                                                value={getConfigValue(config.key)}
                                                onChange={e => handleValueChange(config.key, e.target.value)}
                                                className={`w-full px-4 py-3 rounded-xl border-2 text-base font-medium transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 ${editedConfigs[config.key] !== undefined
                                                    ? 'border-indigo-400 bg-indigo-50'
                                                    : 'border-slate-200 bg-white'
                                                    } text-slate-900`}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Help Guide */}
            <div className="bg-gradient-to-br from-slate-50 to-indigo-50/50 rounded-2xl md:rounded-3xl p-5 md:p-6 border border-slate-200/80">
                <h3 className="font-black text-slate-900 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                    <Icons.Info className="w-5 h-5 text-indigo-500" />
                    Hướng dẫn cấu hình
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="flex items-start gap-2.5 bg-white/70 rounded-xl p-3">
                        <Icons.CheckCircle className="w-4 h-4 flex-shrink-0 text-emerald-500 mt-0.5" />
                        <p className="text-slate-600"><strong className="text-slate-800">Điểm đúng giờ:</strong> Số điểm cộng khi check-in trước giờ quy định</p>
                    </div>
                    <div className="flex items-start gap-2.5 bg-white/70 rounded-xl p-3">
                        <Icons.Clock className="w-4 h-4 flex-shrink-0 text-amber-500 mt-0.5" />
                        <p className="text-slate-600"><strong className="text-slate-800">Điểm đi muộn:</strong> Số điểm trừ khi check-in sau thời gian quy định</p>
                    </div>
                    <div className="flex items-start gap-2.5 bg-white/70 rounded-xl p-3">
                        <Icons.XCircle className="w-4 h-4 flex-shrink-0 text-red-500 mt-0.5" />
                        <p className="text-slate-600"><strong className="text-slate-800">Điểm vắng mặt:</strong> Số điểm trừ khi không tham gia sự kiện / nội trú</p>
                    </div>
                    <div className="flex items-start gap-2.5 bg-white/70 rounded-xl p-3">
                        <Icons.Settings className="w-4 h-4 flex-shrink-0 text-indigo-500 mt-0.5" />
                        <p className="text-slate-600"><strong className="text-slate-800">Ngưỡng đi muộn:</strong> Số phút sau giờ bắt đầu được tính là muộn</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemConfig;
