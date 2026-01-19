import React, { useState, useEffect, useRef } from 'react';
import { TEMPLATE_OPTIONS, CertificateTemplateId, CertificateTemplateProps } from './templates/types';
import { dataService } from '../../services/dataService';
import { User, Event, Certificate } from '../../types';
import { generateSingleExportPDF, generateBatchPDF, getTemplateComponent } from '../../services/certificateExportService';
import {
    Loader2, Landmark, Sparkles, Cpu, Crown, Upload, Image as ImageIcon, LayoutTemplate,
    Rocket, Eye, Archive, Download, CheckCircle, AlertCircle, Award, Settings2, Edit3, ChevronDown,
    Palette, Type, Users
} from 'lucide-react';

import { ToastProvider, useToast } from '../ui/Toast';

interface CertificateGeneratorProps {
    onBack?: () => void;
}

const CertificateGeneratorContent: React.FC<CertificateGeneratorProps> = ({ onBack }) => {
    const { success: toastSuccess, error: toastError } = useToast();
    // Data States
    const [users, setUsers] = useState<User[]>([]);
    const [events, setEvents] = useState<Event[]>([]);
    const [certificates, setCertificates] = useState<Certificate[]>([]);

    // Recipient Selection Logic
    const [recipientSource, setRecipientSource] = useState<'users' | 'event'>('users');
    const [eventParticipants, setEventParticipants] = useState<User[]>([]);

    // UI States
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    // Form States
    const [formData, setFormData] = useState({
        user_id: '',
        event_id: '',
        manualEventName: '',
        issuedDate: '',
        type: 'participation' as 'participation' | 'completion' | 'excellent',
        title: '',
        template_id: 'custom' as CertificateTemplateId
    });

    // Multi-select state
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'design' | 'content' | 'recipients'>('design'); // UI Tab State
    const [savedPresets, setSavedPresets] = useState<any[]>([]); // Presets

    // Load presets on mount
    useEffect(() => {
        const saved = localStorage.getItem('cert_presets');
        if (saved) {
            try {
                setSavedPresets(JSON.parse(saved));
            } catch (e) {
                console.error("Error parsing presets", e);
            }
        }
    }, []);

    const handleSavePreset = () => {
        const name = prompt("Nhập tên cấu hình để lưu:");
        if (!name) return;
        const newPreset = { name, config: customConfig, templateId: formData.template_id };
        const newPresets = [...savedPresets, newPreset];
        setSavedPresets(newPresets);
        localStorage.setItem('cert_presets', JSON.stringify(newPresets));
        toastSuccess("Đã lưu cấu hình!");
    };

    const handleLoadPreset = (preset: any) => {
        if (preset.config) setCustomConfig(preset.config);
        if (preset.templateId) setFormData(prev => ({ ...prev, template_id: preset.templateId }));
        toastSuccess(`Đã tải cấu hình: ${preset.name}`);
    };

    const handleDeletePreset = (idx: number) => {
        if (!confirm("Xóa cấu hình này?")) return;
        const newPresets = savedPresets.filter((_, i) => i !== idx);
        setSavedPresets(newPresets);
        localStorage.setItem('cert_presets', JSON.stringify(newPresets));
    };

    const [customConfig, setCustomConfig] = useState<{
        bgImage?: string;
        logoImage?: string;
        paperSize: 'A4' | 'A5' | 'B4' | 'A3';
        fontStyle?: 'serif' | 'sans' | 'handwriting' | 'times';
        titleFont?: 'serif' | 'sans' | 'handwriting' | 'times';
        recipientFont?: 'serif' | 'sans' | 'handwriting' | 'times';
        textColor?: string;
        logoAlignment?: 'left' | 'center' | 'right';
        logoScale?: number; // 0.5 to 1.5 default 1
        spacingScale?: number; // 0.5 to 2.0 default 1
        titleScale?: number; // 0.5 to 1.5 default 1
        showQR?: boolean;
        visibility?: {
            title?: boolean;
            recipient?: boolean;
            eventStr?: boolean;
            eventName?: boolean;
            date?: boolean;
            signature?: boolean;
            qr?: boolean;
            logo?: boolean;
        };
        labels?: { title?: string; presentedTo?: string; eventPrefix?: string; datePrefix?: string; signature?: string; };
    }>({
        paperSize: 'A4',
        fontStyle: 'serif',
        titleFont: undefined,
        recipientFont: undefined,
        textColor: '#1e293b',
        logoAlignment: 'center',
        logoScale: 1,
        spacingScale: 1,
        titleScale: 1,
        logos: [],
        visibility: { qr: false, title: true, recipient: true, eventName: true, eventStr: true, date: true, signature: true, logo: true },
        labels: {
            title: 'Certificate',
            presentedTo: 'Trao tặng cho',
            eventPrefix: 'Đã tham gia sự kiện',
            datePrefix: 'Ngày cấp:',
            signature: 'Ban Tổ Chức',
            entryNo: 'Vào sổ số: ______'
        }
    });
    useEffect(() => {
        loadData();
    }, []);
    const loadData = async () => {
        setIsLoading(true);
        try {
            const [usersResult, eventsResult, certsResult] = await Promise.all([
                dataService.getUsers({ status: 'active' }),
                dataService.getEvents({ status: 'completed' }),
                dataService.getCertificates()
            ]);

            if (usersResult.success && usersResult.data) setUsers(usersResult.data);
            if (eventsResult.success && eventsResult.data) setEvents(eventsResult.data);
            if (certsResult.success && certsResult.data) setCertificates(certsResult.data);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (formData.event_id && recipientSource === 'event') {
            const fetchParticipants = async () => {
                const res = await dataService.getEventParticipants(formData.event_id);
                if (res.success && res.data) {
                    setEventParticipants(res.data);
                }
            };
            fetchParticipants();
        }
    }, [formData.event_id, recipientSource]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'bgImage' | 'logoImage') => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setCustomConfig(prev => ({ ...prev, [field]: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    // --- Helper for Export Preparation ---
    const prepareCertificatesForExport = (targets: string[]) => {
        const eventName = formData.manualEventName || events.find(e => e.id === formData.event_id)?.name || formData.title || 'Certificates';
        const items = targets.map(uid => {
            const user = users.find(u => u.id === uid);
            const participant = !user ? eventParticipants.find(p => (p as any).user_id === uid || p.id === uid) : null;
            const realName = user?.full_name || (participant as any)?.full_name || (participant as any)?.student_name || 'Người dùng';

            const tempCert: Certificate = {
                id: `INSTANT-${uid}-${new Date().getTime()}`,
                user_id: uid,
                event_id: formData.event_id,
                type: formData.type,
                title: formData.title || 'Certificate',
                issued_date: formData.issuedDate || new Date().toISOString(),
                template_id: formData.template_id,
                metadata: {
                    ...customConfig,
                    manualEventName: formData.manualEventName,
                    issuedDate: formData.issuedDate
                },
            } as any;

            return {
                cert: tempCert,
                user: user,
                config: tempCert.metadata,
                overrideName: realName
            };
        });

        return { items, eventName };
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();

        // Use selectedUserIds as primary source
        const targets = selectedUserIds.length > 0 ? selectedUserIds : (formData.user_id ? [formData.user_id] : []);

        if (targets.length === 0) {
            toastError("Vui lòng chọn ít nhất một người nhận");
            return;
        }
        if (!formData.title) {
            toastError("Vui lòng nhập tiêu đề chứng nhận");
            return;
        }

        setIsGenerating(true);
        setResult(null);

        try {
            // Prepare all payloads
            const certificatesPayload = targets.map(uid => ({
                user_id: uid,
                event_id: formData.event_id || undefined,
                type: formData.type,
                title: formData.title,
                template_id: formData.template_id,
                metadata: customConfig,
                // Store manual inputs in metadata or separate fields?
                // dataService.createCertificate takes Partial<Certificate>
                // We will store manualEventName and issuedDate in metadata for now, or assume backend ignores extras?
                // Better: Create custom columns or just use metadata.
                // Re-using metadata for storage of event override
                // Actually Certificate interface needs update if we want first-class support, but metadata is fine.
            }));

            // Inject manual data into metadata for storage
            const enrichedPayloads = certificatesPayload.map(p => ({
                ...p,
                metadata: {
                    ...p.metadata,
                    manualEventName: formData.manualEventName,
                    issuedDate: formData.issuedDate
                },
                issued_date: formData.issuedDate || new Date().toISOString() // Use manual date for DB sorting if provided
            }));

            // ONE Single Call
            const response = await dataService.createCertificatesBulk(enrichedPayloads);

            if (response.success && response.data) {
                const count = response.data.length;
                toastSuccess(`Đã tạo ${count} chứng nhận thành công!`);

                // Add new certs to state
                const newCerts = response.data.map(d => ({ ...d, template_id: formData.template_id } as unknown as Certificate));
                setCertificates(prev => [...prev, ...newCerts]);

                // Reset form
                setFormData(prev => ({ ...prev, user_id: '' }));
                setSelectedUserIds([]);
            } else {
                toastError(response.error || 'Tạo hàng loạt thất bại');
            }

        } catch (error) {
            console.error(error);
            toastError('Có lỗi xảy ra');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleInstantExport = async () => {
        const targets = selectedUserIds.length > 0 ? selectedUserIds : (formData.user_id ? [formData.user_id] : []);
        if (targets.length === 0) {
            toastError("Vui lòng chọn người nhận để xuất file");
            return;
        }

        setIsExporting(true);
        try {
            const { items, eventName } = prepareCertificatesForExport(targets);
            const fileName = `Danh_sách_chứng_nhận_${eventName.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;

            const count = await generateSingleExportPDF(items, fileName);

            if (count > 0) {
                toastSuccess(`Đã xuất ${count} chứng nhận ra file PDF!`);
            } else {
                toastError("Không thể tạo file nào.");
            }
        } catch (e) {
            console.error(e);
            toastError("Lỗi xuất file PDF.");
        } finally {
            setIsExporting(false);
        }
    };

    const handleBatchDownload = async () => {
        const eventId = formData.event_id;
        if (!eventId) {
            toastError("Vui lòng chọn Sự kiện để tải hàng loạt");
            return;
        }

        setIsExporting(true);
        try {
            // Refetch to ensure we have latest data
            const certsResult = await dataService.getCertificates();
            const allCerts = certsResult.data || certificates;

            const eventCerts = allCerts.filter(c => c.event_id === eventId);

            if (eventCerts.length === 0) {
                toastError("Không tìm thấy chứng nhận nào thuộc sự kiện này.");
                setIsExporting(false);
                return;
            }

            const eventName = events.find(e => e.id === eventId)?.name || 'Event';
            const zipName = `Certificates_${eventName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().getTime()}.zip`;

            // Prepare items for export service
            const items = eventCerts.map(cert => {
                const user = users.find(u => u.id === cert.user_id);
                return {
                    cert,
                    user,
                    config: (cert as any).metadata || customConfig,
                    overrideName: user?.full_name
                };
            });

            const count = await generateBatchPDF(items, zipName);

            if (count > 0) {
                toastSuccess(`Đã tải xuống ${count} chứng nhận (ZIP)!`);
            } else {
                toastError("Lỗi: Không thể tạo file PDF nào.");
            }
        } catch (e) {
            console.error(e);
            toastError("Có lỗi xảy ra khi tải xuống.");
        } finally {
            setIsExporting(false);
        }
    };

    // handleInstantWordExport removed

    // handleSingleWordExport removed

    const handleSinglePDFExport = async (cert: Certificate) => {
        setIsExporting(true);
        try {
            const user = users.find(u => u.id === cert.user_id);
            const items = [{
                cert,
                user,
                config: (cert.metadata as any) || customConfig,
                overrideName: user?.full_name
            }];
            const fileName = `Certificate_${cert.title.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;
            const count = await generateSingleExportPDF(items, fileName);

            if (count > 0) toastSuccess("Đã tải xuống file PDF!");
            else toastError("Lỗi tạo file.");
        } catch (e) {
            console.error(e);
            toastError("Lỗi xuất file PDF.");
        } finally {
            setIsExporting(false);
        }
    };

    const SelectedTemplate = getTemplateComponent(formData.template_id);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-50">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-200">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 leading-none">CertGenerator</h1>
                        <p className="text-xs font-bold text-slate-500 mt-1">Hệ thống cấp chứng nhận tự động</p>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-[1920px] mx-auto grid grid-cols-1 xl:grid-cols-12 gap-6">

                    {/* LEFT COLUMN: Controls */}
                    <div className="xl:col-span-4 space-y-6">
                        {/* Tab Headers */}
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                            <div className="flex border-b border-slate-100">
                                <button
                                    onClick={() => setActiveTab('design')}
                                    className={`flex-1 py-4 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'design' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                                >
                                    <Palette className="w-4 h-4" />
                                    Giao diện
                                </button>
                                <button
                                    onClick={() => setActiveTab('content')}
                                    className={`flex-1 py-4 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'content' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                                >
                                    <Type className="w-4 h-4" />
                                    Nội dung
                                </button>
                                <button
                                    onClick={() => setActiveTab('recipients')}
                                    className={`flex-1 py-4 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'recipients' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                                >
                                    <Users className="w-4 h-4" />
                                    Người nhận
                                </button>
                            </div>

                            <div className="p-6">
                                <form onSubmit={handleCreate} className="space-y-5">

                                    {/* TAB: DESIGN */}
                                    {activeTab === 'design' && (
                                        <div className="space-y-5 animate-in fade-in slide-in-from-left-4 duration-300">
                                            {/* Presets */}
                                            {savedPresets.length > 0 && (
                                                <div className="mb-4">
                                                    <label className="text-xs font-bold text-slate-400 mb-2 block">Mẫu đã lưu</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {savedPresets.map((preset, idx) => (
                                                            <div key={idx} className="flex items-center gap-1 bg-slate-100 rounded-lg px-2 py-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleLoadPreset(preset)}
                                                                    className="text-xs font-bold text-slate-600 hover:text-indigo-600"
                                                                >
                                                                    {preset.name}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeletePreset(idx)}
                                                                    className="text-slate-400 hover:text-red-500"
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Template Selector */}
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2">Chọn giao diện gốc</label>
                                                <div className="grid grid-cols-4 gap-2">
                                                    {TEMPLATE_OPTIONS.map(opt => {
                                                        const Icon = {
                                                            classic: Landmark,
                                                            modern: Sparkles,
                                                            tech: Cpu,
                                                            luxury: Crown,
                                                            custom: Upload
                                                        }[opt.id] || Sparkles;

                                                        return (
                                                            <button
                                                                key={opt.id}
                                                                type="button"
                                                                onClick={() => setFormData(p => ({ ...p, template_id: opt.id }))}
                                                                className={`p-2 rounded-xl border transition-all flex flex-col items-center gap-1 ${formData.template_id === opt.id
                                                                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                                                    : 'border-slate-100 bg-slate-50 text-slate-500 hover:bg-slate-100'
                                                                    }`}
                                                                title={opt.name}
                                                            >
                                                                <Icon className="w-5 h-5" strokeWidth={1.5} />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Custom Template Config */}
                                            {formData.template_id === 'custom' && (
                                                <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                                    <h4 className="font-bold text-slate-900 flex items-center justify-between text-sm">
                                                        <span className="flex items-center gap-2"><LayoutTemplate className="w-4 h-4" /> Tùy chỉnh</span>
                                                        <button type="button" onClick={handleSavePreset} className="text-xs text-indigo-600 hover:underline font-normal">Lưu mẫu này</button>
                                                    </h4>

                                                    {/* Appearance */}
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-500 mb-1 block">Khổ giấy</label>
                                                            <select
                                                                value={customConfig.paperSize}
                                                                onChange={e => setCustomConfig(p => ({ ...p, paperSize: e.target.value as any }))}
                                                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-xs"
                                                            >
                                                                <option value="A4">A4 (Ngang)</option>
                                                                <option value="A5">A5 (Ngang nhỏ)</option>
                                                                <option value="A3">A3 (Khổ lớn)</option>
                                                                <option value="B4">B4</option>
                                                            </select>
                                                        </div>
                                                        <div className="col-span-2 grid grid-cols-2 gap-3">
                                                            <div>
                                                                <label className="text-[10px] font-bold text-slate-500 mb-1 block">Font chung</label>
                                                                <select
                                                                    value={customConfig.fontStyle || 'serif'}
                                                                    onChange={e => setCustomConfig(p => ({ ...p, fontStyle: e.target.value as any }))}
                                                                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-xs"
                                                                >
                                                                    <option value="serif">Trang trọng</option>
                                                                    <option value="times">Times New Roman</option>
                                                                    <option value="sans">Hiện đại</option>
                                                                    <option value="handwriting">Viết tay</option>
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] font-bold text-slate-500 mb-1 block">Font tên người nhận</label>
                                                                <select
                                                                    value={customConfig.recipientFont || customConfig.fontStyle || 'serif'}
                                                                    onChange={e => setCustomConfig(p => ({ ...p, recipientFont: e.target.value as any }))}
                                                                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-xs"
                                                                >
                                                                    <option value="">(Theo Font chung)</option>
                                                                    <option value="serif">Trang trọng</option>
                                                                    <option value="times">Times New Roman</option>
                                                                    <option value="sans">Hiện đại</option>
                                                                    <option value="handwriting">Viết tay</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Spacing & Title Size Settings */}
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-500 mb-1 block">Khoảng cách dòng ({Math.round((customConfig.spacingScale || 1) * 100)}%)</label>
                                                            <input
                                                                type="range"
                                                                min="0.5"
                                                                max="2.0"
                                                                step="0.1"
                                                                value={customConfig.spacingScale || 1}
                                                                onChange={e => setCustomConfig(p => ({ ...p, spacingScale: parseFloat(e.target.value) }))}
                                                                className="w-full accent-indigo-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-500 mb-1 block">Cỡ chữ tiêu đề ({Math.round((customConfig.titleScale || 1) * 100)}%)</label>
                                                            <input
                                                                type="range"
                                                                min="0.5"
                                                                max="2.0"
                                                                step="0.1"
                                                                value={customConfig.titleScale || 1}
                                                                onChange={e => setCustomConfig(p => ({ ...p, titleScale: parseFloat(e.target.value) }))}
                                                                className="w-full accent-indigo-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Color */}
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 mb-1 block">Màu chữ chính</label>
                                                        <div className="flex gap-2 mb-2">
                                                            <input
                                                                type="color"
                                                                value={customConfig.textColor || '#1e293b'}
                                                                onChange={e => setCustomConfig(p => ({ ...p, textColor: e.target.value }))}
                                                                className="w-8 h-8 p-0.5 rounded cursor-pointer border border-slate-200"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={customConfig.textColor || '#1e293b'}
                                                                onChange={e => setCustomConfig(p => ({ ...p, textColor: e.target.value }))}
                                                                className="flex-1 px-2 py-1.5 bg-white border border-slate-200 rounded text-xs uppercase"
                                                            />
                                                        </div>

                                                        {/* Event Name Visibility */}
                                                        <label className="flex items-center gap-2 cursor-pointer mt-3 bg-white p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                                                            <input
                                                                type="checkbox"
                                                                checked={customConfig.visibility?.eventName !== false}
                                                                onChange={e => setCustomConfig(p => ({
                                                                    ...p,
                                                                    visibility: { ...p.visibility, eventName: e.target.checked }
                                                                }))}
                                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                                            />
                                                            <span className="text-xs font-bold text-slate-700">Hiển thị Tên sự kiện</span>
                                                        </label>
                                                    </div>


                                                    {/* Logo Settings */}
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-500 mb-1 block">Vị trí Logo</label>
                                                            <div className="flex bg-slate-100 rounded p-1">
                                                                {['left', 'center', 'right'].map((align) => (
                                                                    <button
                                                                        key={align}
                                                                        type="button"
                                                                        onClick={() => setCustomConfig(p => ({ ...p, logoAlignment: align as any }))}
                                                                        className={`flex-1 py-1 rounded text-xs transition-all ${customConfig.logoAlignment === align ? 'bg-white shadow text-indigo-600 font-bold' : 'text-slate-400 hover:text-slate-600'}`}
                                                                    >
                                                                        {align === 'left' ? 'Trái' : align === 'center' ? 'Giữa' : 'Phải'}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-500 mb-1 block">Kích thước Logo ({Math.round((customConfig.logoScale || 1) * 100)}%)</label>
                                                            <input
                                                                type="range"
                                                                min="0.5"
                                                                max="2.0"
                                                                step="0.1"
                                                                value={customConfig.logoScale || 1}
                                                                onChange={e => setCustomConfig(p => ({ ...p, logoScale: parseFloat(e.target.value) }))}
                                                                className="w-full accent-indigo-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Uploads */}
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <label className="block p-2 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-indigo-500 hover:bg-white text-center transition-all bg-white/50">
                                                            <input type="file" className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'bgImage')} />
                                                            <span className="text-[10px] font-bold text-slate-500 block">Ảnh nền</span>
                                                            {customConfig.bgImage ? <CheckCircle className="w-3 h-3 mx-auto text-emerald-500" /> : <Upload className="w-3 h-3 mx-auto text-slate-400" />}
                                                        </label>
                                                        <label className="block p-2 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-indigo-500 hover:bg-white text-center transition-all bg-white/50">
                                                            <input type="file" className="hidden" accept="image/*" onChange={e => {
                                                                const file = e.target.files?.[0];
                                                                if (file) {
                                                                    const reader = new FileReader();
                                                                    reader.onloadend = () => {
                                                                        if (reader.result) {
                                                                            setCustomConfig(p => ({ ...p, logos: [...(p.logos || []), reader.result as string] }));
                                                                        }
                                                                    };
                                                                    reader.readAsDataURL(file);
                                                                }
                                                            }} />
                                                            <span className="text-[10px] font-bold text-slate-500 block">+ Logo</span>
                                                            <span className="text-[9px] text-slate-400">{customConfig.logos?.length || 0} đã chọn</span>
                                                        </label>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* TAB: CONTENT */}
                                    {activeTab === 'content' && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Tiêu đề chứng nhận <span className="text-red-500">*</span></label>
                                                <input
                                                    type="text"
                                                    value={formData.title}
                                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                                    required
                                                    placeholder="VD: Chứng nhận Hoàn thành..."
                                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                {[
                                                    { id: 'presentedTo', label: 'Lời dẫn (Tặng cho)', ph: 'Trao tặng cho' },
                                                    { id: 'eventPrefix', label: 'Lời dẫn (Sự kiện)', ph: 'Đã tham gia sự kiện' },
                                                    { id: 'signature', label: 'Người ký', ph: 'Ban Tổ Chức' },
                                                    { id: 'datePrefix', label: 'Nhãn Ngày cấp', ph: 'Ngày cấp:' },
                                                    { id: 'entryNo', label: 'Số vào sổ', ph: 'Vào sổ số: ______' },
                                                ].map(field => (
                                                    <div key={field.id}>
                                                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">{field.label}</label>
                                                        <input
                                                            type="text"
                                                            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                                                            placeholder={field.ph}
                                                            value={customConfig.labels?.[field.id as keyof typeof customConfig.labels] || ''}
                                                            onChange={e => setCustomConfig(p => ({ ...p, labels: { ...p.labels, [field.id]: e.target.value } }))}
                                                        />
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Toggles */}
                                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                                                {[
                                                    { id: 'logo', label: 'Hiện Logo' },
                                                    { id: 'signature', label: 'Hiện Chữ ký' },
                                                    { id: 'date', label: 'Hiện Ngày cấp' },
                                                ].map(opt => (
                                                    <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={customConfig.visibility?.[opt.id as keyof typeof customConfig.visibility] !== false}
                                                            onChange={() => setCustomConfig(p => ({ ...p, visibility: { ...p.visibility, [opt.id]: !p.visibility?.[opt.id as any] } }))}
                                                            className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                                                        />
                                                        <span className="text-xs font-medium text-slate-700">{opt.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* TAB: RECIPIENTS */}
                                    {activeTab === 'recipients' && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                                            <div>
                                                <select
                                                    value={formData.event_id}
                                                    onChange={e => {
                                                        const eid = e.target.value;
                                                        const eventName = events.find(ev => ev.id === eid)?.name || '';
                                                        setFormData({ ...formData, event_id: eid, manualEventName: eventName });
                                                        setRecipientSource('event'); // Auto switch
                                                    }}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm mb-3"
                                                >
                                                    <option value="">-- Lọc theo Sự kiện --</option>
                                                    {events.map(event => (
                                                        <option key={event.id} value={event.id}>{event.name}</option>
                                                    ))}
                                                </select>

                                                <div className="flex gap-2 mb-2">
                                                    <button type="button" onClick={() => setRecipientSource('users')} className={`flex-1 py-1.5 text-xs font-bold rounded border ${recipientSource === 'users' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white'}`}>Toàn bộ User</button>
                                                    <button type="button" onClick={() => setRecipientSource('event')} className={`flex-1 py-1.5 text-xs font-bold rounded border ${recipientSource === 'event' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white'}`}>Theo Sự kiện</button>
                                                </div>

                                                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white max-h-60 flex flex-col">
                                                    {/* Toolbar */}
                                                    <div className="p-2 border-b border-slate-100 bg-slate-50 flex gap-2">
                                                        <button type="button" onClick={() => setSelectedUserIds((recipientSource === 'users' ? users : eventParticipants).map((u: any) => u.id || u.user_id))} className="text-[10px] font-bold text-indigo-600 hover:bg-slate-200 px-2 py-1 rounded">Chọn tất cả</button>
                                                        <button type="button" onClick={() => setSelectedUserIds([])} className="text-[10px] font-bold text-slate-500 hover:bg-slate-200 px-2 py-1 rounded">Bỏ chọn</button>
                                                    </div>
                                                    <div className="overflow-y-auto p-1 space-y-0.5 flex-1">
                                                        {(recipientSource === 'users' ? users : eventParticipants).map((u: any) => {
                                                            const uid = u.id || u.user_id;
                                                            return (
                                                                <label key={uid} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedUserIds.includes(uid)}
                                                                        onChange={(e) => {
                                                                            if (e.target.checked) setSelectedUserIds(prev => [...prev, uid]);
                                                                            else setSelectedUserIds(prev => prev.filter(id => id !== uid));
                                                                        }}
                                                                        className="rounded text-indigo-600 w-4 h-4"
                                                                    />
                                                                    <span className="text-xs font-medium truncate">{u.full_name}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                    <div className="p-1.5 bg-slate-50 text-[10px] text-center font-bold text-slate-500 border-t">Đã chọn: {selectedUserIds.length}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Action Buttons (Always Visible) */}
                                    <div className="pt-4 border-t border-slate-100 space-y-2">
                                        <button
                                            type="submit"
                                            disabled={isGenerating || selectedUserIds.length === 0}
                                            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {isGenerating ? <Loader2 className="animate-spin w-5 h-5" /> : <><Sparkles className="w-5 h-5" /> Tạo chứng nhận ({selectedUserIds.length})</>}
                                        </button>

                                        <div className="flex gap-2 mt-2">
                                            <button
                                                type="button"
                                                onClick={handleInstantExport}
                                                disabled={isExporting || selectedUserIds.length === 0}
                                                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
                                            >
                                                {isExporting ? <Loader2 className="animate-spin w-5 h-5" /> : <><Download className="w-5 h-5" /> Xuất PDF Ngay</>}
                                            </button>
                                        </div>
                                    </div>
                                </form>

                                {result && (
                                    <div className={`mt-4 p-3 rounded-xl text-sm font-bold text-center flex items-center justify-center gap-2 ${result.success ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                        {result.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                        {result.message}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Preview & List */}
                    <div className="xl:col-span-8 space-y-6">
                        {/* Live Preview */}
                        <div className="bg-slate-100 rounded-3xl p-8 flex items-center justify-center overflow-hidden relative min-h-[400px]">
                            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full text-xs font-bold text-slate-600 shadow-sm flex items-center gap-2">
                                <Eye className="w-3 h-3" /> Xem trước (Live Preview)
                            </div>
                            <div className="transform scale-[0.6] origin-center shadow-2xl transition-all duration-500">
                                <SelectedTemplate
                                    data={{
                                        recipientName: users.find(u => u.id === formData.user_id)?.full_name || 'Nguyễn Văn A',
                                        title: formData.title || 'Chứng Nhận Demo',
                                        eventName: formData.manualEventName || '',
                                        issuedDate: formData.issuedDate || '',
                                        type: formData.type,
                                        verifyCode: 'DEMO-123',
                                        verifyQR: 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=DEMO'
                                    }}
                                    customConfig={customConfig}
                                    isEditable={true}
                                    onLabelChange={(key, val) => setCustomConfig(prev => ({ ...prev, labels: { ...prev.labels, [key]: val } }))}
                                />
                            </div>
                        </div>

                        {/* Recent Certificates */}
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                            <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                                <Award className="w-5 h-5 text-indigo-500" />
                                Đã cấp gần đây
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {certificates.slice(-6).reverse().map(cert => (
                                    <div key={cert.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-all group">
                                        <div className="min-w-0">
                                            <p className="font-bold text-slate-900 truncate">{cert.title}</p>
                                            <p className="text-xs text-slate-500 truncate">{users.find(u => u.id === cert.user_id)?.full_name}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleSinglePDFExport(cert)}
                                                className="p-2 bg-white rounded-lg shadow-sm text-indigo-600 hover:bg-indigo-50 transition-colors border border-slate-100"
                                                title="Tải PDF"
                                            >
                                                <Download className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (window.confirm('Bạn có chắc chắn muốn xóa chứng nhận này?')) {
                                                        const res = await dataService.deleteCertificate(cert.id);
                                                        if (res.success) {
                                                            setCertificates(prev => prev.filter(c => c.id !== cert.id));
                                                            toastSuccess('Đã xóa chứng nhận');
                                                        } else {
                                                            toastError(res.error || 'Lỗi xóa');
                                                        }
                                                    }
                                                }}
                                                className="p-2 bg-white rounded-lg shadow-sm text-red-600 hover:bg-red-50 transition-colors border border-slate-100"
                                                title="Xóa"
                                            >
                                                <Archive className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CertificateGenerator: React.FC<CertificateGeneratorProps> = (props) => (
    <ToastProvider>
        <CertificateGeneratorContent {...props} />
    </ToastProvider>
);

export default CertificateGenerator;

