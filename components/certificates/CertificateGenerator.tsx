import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { TEMPLATE_OPTIONS, CertificateTemplateId } from './templates/types';
import { dataService } from '../../services/dataService';
import { compressImage } from '../../services/imageService';
import { uploadCertificateImage, uploadConfigImages } from '../../services/storageService';
import { User, Event, Certificate } from '../../types';
import { generateSingleExportPDF, generateBatchPDF, getTemplateComponent } from '../../services/certificateExportService';
import {
    Loader2, Landmark, Sparkles, Crown, Upload, Image as ImageIcon, LayoutTemplate,
    Eye, Archive, Download, CheckCircle, AlertCircle, Award, Settings2, Edit3,
    Palette, Type, Users, Search, ChevronLeft, ChevronRight, Calendar,
    GraduationCap, BookOpen, UsersRound, UserCheck, UserX
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
    const [showSaveNaming, setShowSaveNaming] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const [saveProgress, setSaveProgress] = useState<{ current: number, total: number } | null>(null);

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
    const [presetToDelete, setPresetToDelete] = useState<{ id: string, idx: number, name: string } | null>(null);
    const [certToDelete, setCertToDelete] = useState<{ id: string, title: string } | null>(null);

    const [recipientSearch, setRecipientSearch] = useState('');
    const [recipientPage, setRecipientPage] = useState(1);
    const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'teacher'>('student');
    const [eventAttendFilter, setEventAttendFilter] = useState<'attended' | 'absent'>('attended');
    const recipientsPerPage = 20;

    const [recentCertsPage, setRecentCertsPage] = useState(1);
    const [historySearch, setHistorySearch] = useState('');
    const recentCertsPerPage = 6;

    // Monthly Filter States
    const [monthFilter, setMonthFilter] = useState<number>(new Date().getMonth() + 1);
    const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear());
    const [topLimit, setTopLimit] = useState<number>(10);
    const [isFetchingTop, setIsFetchingTop] = useState(false);
    const [topStudents, setTopStudents] = useState<any[]>([]);

    // Local QR for preview (replaces external API)
    const [demoQR, setDemoQR] = useState('');
    useEffect(() => {
        QRCode.toDataURL('DEMO-PREVIEW', { margin: 1, width: 150 })
            .then(url => setDemoQR(url))
            .catch(() => {});
    }, []);

    // Load presets and last config on mount
    useEffect(() => {
        // Load last session config from localStorage (as temporary backup)
        const lastSession = localStorage.getItem('last_cert_config');
        if (lastSession) {
            try {
                const { config } = JSON.parse(lastSession);
                if (config) setCustomConfig(config);
                // Force template_id to 'custom' on fresh load as requested, 
                // but keep config if session exists.
                setFormData(prev => ({ ...prev, template_id: 'custom' }));
            } catch (e) { }
        }
    }, []);

    const handleSavePreset = async () => {
        if (!saveName.trim()) {
            toastError("Vui lòng nhập tên mẫu");
            return;
        }

        setIsLoading(true);

        // OPTIMIZATION: Compress images before saving to reduce database storage
        // Skip compression for signature/seal/logo under 0.5MB to preserve quality
        const optimizedConfig = { ...customConfig };
        const SIZE_THRESHOLD = 0.5 * 1024 * 1024; // 0.5MB in bytes
        const getBase64Size = (base64: string) => (base64.length * 3) / 4; // Approximate size

        try {
            // Background: Always compress with JPEG (no transparency needed)
            if (optimizedConfig.bgImage && optimizedConfig.bgImage.startsWith('data:')) {
                optimizedConfig.bgImage = await compressImage(optimizedConfig.bgImage, 800, 800, 0.4, false);
            }
            // Signature: Only compress if > 0.5MB, use PNG to preserve transparency
            if (optimizedConfig.signatureImage && optimizedConfig.signatureImage.startsWith('data:')) {
                if (getBase64Size(optimizedConfig.signatureImage) > SIZE_THRESHOLD) {
                    optimizedConfig.signatureImage = await compressImage(optimizedConfig.signatureImage, 400, 400, 0.8, true);
                }
            }
            // Seal: Only compress if > 0.5MB
            if (optimizedConfig.sealImage && optimizedConfig.sealImage.startsWith('data:')) {
                if (getBase64Size(optimizedConfig.sealImage) > SIZE_THRESHOLD) {
                    optimizedConfig.sealImage = await compressImage(optimizedConfig.sealImage, 300, 300, 0.8, true);
                }
            }
            // Logo: Only compress if > 0.5MB
            if (optimizedConfig.logoImage && optimizedConfig.logoImage.startsWith('data:')) {
                if (getBase64Size(optimizedConfig.logoImage) > SIZE_THRESHOLD) {
                    optimizedConfig.logoImage = await compressImage(optimizedConfig.logoImage, 300, 300, 0.8, true);
                }
            }
        } catch (compressionError) {
            console.warn('Image compression failed, saving without compression:', compressionError);
        }

        const res = await dataService.saveCertificateConfig({
            name: saveName.trim(),
            template_id: formData.template_id,
            config: optimizedConfig
        });

        if (res.success) {
            setSavedPresets(prev => [res.data, ...prev]);
            setShowSaveNaming(false);
            setSaveName('');
            toastSuccess("Đã lưu mẫu thiết kế mới!");
        } else {
            toastError(res.error || "Lỗi lưu cấu hình");
        }
        setIsLoading(false);
    };

    const handleLoadPreset = (preset: any) => {
        if (preset.config) setCustomConfig(preset.config);
        if (preset.template_id) setFormData(prev => ({ ...prev, template_id: preset.template_id }));
        toastSuccess(`Đã tải cấu hình: ${preset.name}`);
    };

    const handleDeletePreset = async (id: string, idx: number, name: string) => {
        setPresetToDelete({ id, idx, name });
    };

    const confirmDeletePreset = async () => {
        if (!presetToDelete) return;

        const { id, idx } = presetToDelete;
        const res = await dataService.deleteCertificateConfig(id);
        if (res.success) {
            setSavedPresets(prev => prev.filter((_, i) => i !== idx));
            toastSuccess("Đã xóa mẫu");
        } else {
            toastError(res.error || "Lỗi xóa");
        }
        setPresetToDelete(null);
    };

    const [customConfig, setCustomConfig] = useState<{
        bgImage?: string;
        logoImage?: string;
        paperSize: 'A4' | 'A5' | 'B4' | 'A3';
        fontStyle?: string;
        titleFont?: string;
        recipientFont?: string;
        textColor?: string;
        logoAlignment?: 'left' | 'center' | 'right';
        logoScale?: number; // 0.5 to 1.5 default 1
        spacingScale?: number; // 0.5 to 2.0 default 1
        titleScale?: number; // 0.5 to 1.5 default 1
        showQR?: boolean;
        signatureImage?: string;
        sealImage?: string;
        visibility?: {
            title?: boolean;
            recipient?: boolean;
            eventStr?: boolean;
            eventName?: boolean;
            date?: boolean;
            signature?: boolean;
            qr?: boolean;
            logo?: boolean;
            entryNo?: boolean;
        };
        labels?: { title?: string; presentedTo?: string; eventPrefix?: string; datePrefix?: string; signature?: string; };
        orientation: 'landscape' | 'portrait';
    }>({
        paperSize: 'A4',
        orientation: 'landscape',
        fontStyle: 'serif',
        titleFont: undefined,
        recipientFont: undefined,
        textColor: '#1e293b',
        logoAlignment: 'center',
        logoScale: 1,
        spacingScale: 1,
        titleScale: 1,
        logoImage: '/educheck_logo.png',
        logos: [],
        bgImage: undefined,
        signatureImage: undefined,
        sealImage: undefined,
        customTexts: [],
        positions: {
            title: { x: 50, y: 15 },
            recipient: { x: 50, y: 35 },
            eventName: { x: 50, y: 55 },
            eventStr: { x: 50, y: 50 },
            date: { x: 20, y: 85 },
            signature: { x: 80, y: 85 },
            qr: { x: 50, y: 85 },
            logo: { x: 50, y: 5 },
            seal: { x: 85, y: 15 },
            entryNo: { x: 20, y: 80 }
        },
        elementStyles: {
            title: { color: '#1e293b', scale: 1 },
            recipient: { color: '#1e293b', scale: 1.5 },
            eventName: { color: '#1e293b', scale: 1 },
            eventStr: { color: '#64748b', scale: 1 },
            signature: { color: '#1e293b', scale: 1 }
        },
        labels: {
            title: 'Certificate',
            presentedTo: 'Trao tặng cho',
            eventPrefix: 'Đã tham gia sự kiện',
            datePrefix: 'Ngày cấp: . . .',
            signature: 'Ban Tổ Chức',
            entryNo: 'Vào sổ số: . . .'
        },
        visibility: {
            title: true,
            recipient: true,
            eventStr: true,
            eventName: true,
            date: true,
            signature: true,
            qr: true,
            logo: true,
            entryNo: true
        }
    });
    useEffect(() => {
        if (formData.issuedDate) {
            setCustomConfig(prev => ({
                ...prev,
                labels: {
                    ...prev.labels,
                    datePrefix: `Ngày cấp: ${formData.issuedDate}`
                }
            }));
        }
    }, [formData.issuedDate]);

    // Persist current config to localStorage on change (Session Backup) - PRUNED TO AVOID QUOTA ERROR
    useEffect(() => {
        if (!isLoading) {
            // Prune heavy images from localStorage to prevent QuotaExceededError
            const prunedConfig = { ...customConfig };
            delete (prunedConfig as any).bgImage;
            delete (prunedConfig as any).signatureImage;
            delete (prunedConfig as any).sealImage;
            delete (prunedConfig as any).logos;

            localStorage.setItem('last_cert_config', JSON.stringify({
                config: prunedConfig,
                template_id: formData.template_id
            }));
        }
    }, [customConfig, formData.template_id, isLoading]);

    const handleFetchTopStudents = async () => {
        setIsFetchingTop(true);
        try {
            const res = await dataService.getTopStudentsByMonth(monthFilter, yearFilter, topLimit);
            if (res.success && res.data) {
                setTopStudents(res.data);
                setRecipientSource('users'); // Reuse users view but with filtered data
                toastSuccess(`Đã tìm thấy ${res.data.length} học sinh tiêu biểu!`);
            } else {
                toastError(res.error || "Không thể tải danh sách top");
            }
        } catch (e) {
            toastError("Lỗi hệ thống");
        } finally {
            setIsFetchingTop(false);
        }
    };

    const replaceVariables = (text: string, user: any, rank?: number) => {
        if (!text) return text;
        return text
            .replace(/{full_name}/g, user?.full_name || 'Người nhận')
            .replace(/{class}/g, user?.organization || user?.class_id || 'Lớp')
            .replace(/{points}/g, (user?.monthly_points || user?.total_points || 0).toString())
            .replace(/{rank}/g, (rank || user?.rank || '-').toString())
            .replace(/{date}/g, formData.issuedDate || new Date().toLocaleDateString('vi-VN'));
    };

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [usersResult, eventsResult, certsResult, presetsResult] = await Promise.all([
                dataService.getUsers(),
                dataService.getEvents(),
                dataService.getCertificates(),
                dataService.getCertificateConfigs()
            ]);

            if (usersResult.success && usersResult.data) setUsers(usersResult.data);
            if (eventsResult.success && eventsResult.data) setEvents(eventsResult.data);
            if (certsResult.success && certsResult.data) {
                setCertificates(certsResult.data);
            } else if (certsResult.error) {
                toastError("Lỗi tải lịch sử: " + certsResult.error);
            }
            if (presetsResult.success && presetsResult.data) setSavedPresets(presetsResult.data);
        } catch (error) {
            console.error('Failed to load data:', error);
            toastError("Lỗi tải dữ liệu: " + (error as Error).message || "Không thể tải dữ liệu");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

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

    const handleAddCustomText = () => {
        const id = `text-${Date.now()}`;
        setCustomConfig(prev => ({
            ...prev,
            customTexts: [
                ...(prev.customTexts || []),
                { id, content: 'Văn bản mới', x: 50, y: 50, fontSize: 18, color: prev.textColor || '#1e293b' }
            ]
        }));
    };

    const handleUpdateCustomText = (id: string, updates: any) => {
        setCustomConfig(prev => ({
            ...prev,
            customTexts: (prev.customTexts || []).map(t => t.id === id ? { ...t, ...updates } : t)
        }));
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'bgImage' | 'logoImage' | 'signatureImage' | 'sealImage') => {
        const file = e.target.files?.[0];
        if (file) {
            // Basic validation to prevent crashes
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                toastError("File quá lớn (Tối đa 5MB)");
                return;
            }

            const reader = new FileReader();
            reader.onloadstart = () => setIsLoading(true);
            reader.onloadend = async () => {
                const result = reader.result as string;
                if (result) {
                    try {
                        // Compress before uploading
                        const isBackground = field === 'bgImage';
                        const targetWidth = isBackground ? 1600 : 800;
                        const preserveTransparency = !isBackground;
                        const compressed = await compressImage(result, targetWidth, targetWidth, 0.7, preserveTransparency);

                        // Upload to Supabase Storage
                        const category = field === 'bgImage' ? 'backgrounds' : field === 'signatureImage' ? 'signatures' : field === 'sealImage' ? 'seals' : 'logos';
                        const uploadRes = await uploadCertificateImage(compressed, category as any);

                        if (uploadRes.success && uploadRes.url) {
                            setCustomConfig(prev => ({ ...prev, [field]: uploadRes.url }));
                            toastSuccess("Đã tải ảnh lên Storage!");
                        } else {
                            // Fallback: store compressed base64 if upload fails
                            console.warn('Storage upload failed, using base64 fallback:', uploadRes.error);
                            setCustomConfig(prev => ({ ...prev, [field]: compressed }));
                            toastSuccess("Đã tải ảnh (lưu cục bộ)!");
                        }
                    } catch (e) {
                        console.error("Processing failed", e);
                        setCustomConfig(prev => ({ ...prev, [field]: result }));
                        toastSuccess("Đã tải ảnh lên!");
                    }
                }
                setIsLoading(false);
            };
            reader.onerror = () => {
                toastError("Lỗi đọc file");
                setIsLoading(false);
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
                title: replaceVariables(formData.title || 'Certificate', user || participant, (user as any)?.rank || (participant as any)?.rank),
                issued_date: formData.issuedDate || new Date().toISOString(),
                template_id: formData.template_id,
                metadata: {
                    ...customConfig,
                    manualEventName: formData.manualEventName,
                    issuedDate: formData.issuedDate,
                    // Ensure signature and seal are in metadata
                    signatureImage: (customConfig as any).signatureImage,
                    sealImage: (customConfig as any).sealImage,
                    labels: {
                        ...customConfig.labels,
                        title: replaceVariables(customConfig.labels?.title || '', user || participant, (user as any)?.rank || (participant as any)?.rank),
                        presentedTo: replaceVariables(customConfig.labels?.presentedTo || '', user || participant, (user as any)?.rank || (participant as any)?.rank),
                        eventPrefix: replaceVariables(customConfig.labels?.eventPrefix || '', user || participant, (user as any)?.rank || (participant as any)?.rank),
                    }
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
            // STEP 1: Upload any remaining base64 images to Storage before saving
            let optimizedConfig;
            try {
                optimizedConfig = await uploadConfigImages({ ...customConfig });
            } catch (uploadErr) {
                console.warn('Storage upload failed, using compression fallback:', uploadErr);
                optimizedConfig = { ...customConfig };
            }

            // Compress any images that failed to upload (still base64)
            const SIZE_THRESHOLD = 0.5 * 1024 * 1024; // 0.5MB in bytes
            const getBase64Size = (base64: string) => (base64.length * 3) / 4;

            try {
                // Background: Compress but keep reasonable quality for viewing
                if (optimizedConfig.bgImage && optimizedConfig.bgImage.startsWith('data:')) {
                    optimizedConfig.bgImage = await compressImage(optimizedConfig.bgImage, 1600, 1200, 0.7, false);
                    toastSuccess('⚠️ Ảnh nền đã được lưu ở chất lượng vừa phải. Để xuất PDF sắc nét, hãy tải ảnh nền gốc (chất lượng cao) trước khi xuất.');
                }
                // Signature: Only compress if > 0.5MB
                if (optimizedConfig.signatureImage && optimizedConfig.signatureImage.startsWith('data:')) {
                    if (getBase64Size(optimizedConfig.signatureImage) > SIZE_THRESHOLD) {
                        optimizedConfig.signatureImage = await compressImage(optimizedConfig.signatureImage, 400, 400, 0.8, true);
                    }
                }
                // Seal: Only compress if > 0.5MB
                if (optimizedConfig.sealImage && optimizedConfig.sealImage.startsWith('data:')) {
                    if (getBase64Size(optimizedConfig.sealImage) > SIZE_THRESHOLD) {
                        optimizedConfig.sealImage = await compressImage(optimizedConfig.sealImage, 300, 300, 0.8, true);
                    }
                }
                // Logo: Only compress if > 0.5MB
                if (optimizedConfig.logoImage && optimizedConfig.logoImage.startsWith('data:')) {
                    if (getBase64Size(optimizedConfig.logoImage) > SIZE_THRESHOLD) {
                        optimizedConfig.logoImage = await compressImage(optimizedConfig.logoImage, 300, 300, 0.8, true);
                    }
                }
            } catch (compressionError) {
                console.warn('Image compression failed:', compressionError);
            }

            // NO auto-save preset — user can manually save via "Lưu mẫu" button
            // Store full config directly in certificate metadata for student viewing

            // STEP 2: CREATE CERTIFICATES WITH FULL METADATA
            const certificatesPayload = targets.map(uid => {
                const user = users.find(u => u.id === uid);
                const participant = !user ? eventParticipants.find(p => (p as any).user_id === uid || p.id === uid) : null;
                const recipientName = user?.full_name || (participant as any)?.full_name || (participant as any)?.student_name || '';

                return {
                    user_id: uid,
                    event_id: formData.event_id || undefined,
                    type: formData.type,
                    title: formData.title,
                    template_id: formData.template_id,
                    metadata: {
                        recipient_name: recipientName,
                        manualEventName: formData.manualEventName,
                        issuedDate: formData.issuedDate || new Date().toLocaleDateString('vi-VN'),
                        // Store display config (images already compressed)
                        bgImage: optimizedConfig.bgImage,
                        logoImage: optimizedConfig.logoImage,
                        signatureImage: optimizedConfig.signatureImage,
                        sealImage: optimizedConfig.sealImage,
                        logos: optimizedConfig.logos,
                        labels: optimizedConfig.labels,
                        textColor: optimizedConfig.textColor,
                        fontStyle: optimizedConfig.fontStyle,
                        titleFont: optimizedConfig.titleFont,
                        recipientFont: optimizedConfig.recipientFont,
                        orientation: optimizedConfig.orientation,
                        customTexts: optimizedConfig.customTexts,
                        elementStyles: optimizedConfig.elementStyles,
                        visibility: optimizedConfig.visibility,
                        positions: optimizedConfig.positions,
                        bgOpacity: optimizedConfig.bgOpacity,
                    },
                    issued_date: formData.issuedDate || new Date().toISOString()
                };
            });

            // Chunking logic to prevent payload limits/timeouts
            const CHUNK_SIZE = 5;
            const createdCerts: Certificate[] = [];
            setSaveProgress({ current: 0, total: targets.length });

            try {
                for (let i = 0; i < certificatesPayload.length; i += CHUNK_SIZE) {
                    const chunk = certificatesPayload.slice(i, i + CHUNK_SIZE);
                    const response = await dataService.createCertificatesBulk(chunk);
                    if (response.success && response.data) {
                        const newCerts = response.data.map(d => ({ ...d, template_id: formData.template_id } as unknown as Certificate));
                        createdCerts.push(...newCerts);
                        setSaveProgress({ current: Math.min(i + CHUNK_SIZE, targets.length), total: targets.length });
                    } else {
                        toastError(`Lỗi ở lượt lưu thứ ${Math.floor(i / CHUNK_SIZE) + 1}: ${response.error || 'Thất bại'}`);
                        break;
                    }
                }

                if (createdCerts.length > 0) {
                    toastSuccess(`Đã tạo ${createdCerts.length}/${targets.length} chứng nhận thành công!`);
                    setCertificates(prev => [...prev, ...createdCerts]);

                    // Notification is handled by DB trigger (notify_certificate_issued)
                    // No need to create manually here

                    // Reset form
                    setFormData(prev => ({ ...prev, user_id: '' }));
                    setSelectedUserIds([]);
                }
            } finally {
                setSaveProgress(null);
            }

        } catch (error) {
            console.error("Create Error:", error);
            toastError("Lỗi hệ thống khi tạo chứng nhận");
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

            // Prepare items: resolve full config for each cert
            const configsRes = await dataService.getCertificateConfigs();
            const allConfigs = configsRes.success ? configsRes.data || [] : [];

            const items = eventCerts.map(cert => {
                const meta = (cert as any).metadata || {};
                let resolvedConfig = meta;

                // Resolve config from config_id
                if (meta.config_id) {
                    const preset = allConfigs.find((p: any) => p.id === meta.config_id);
                    if (preset?.config) {
                        resolvedConfig = { ...preset.config, ...meta };
                    }
                }

                const user = users.find(u => u.id === cert.user_id);
                const participant = !user ? eventParticipants.find(p => (p as any).user_id === cert.user_id || p.id === cert.user_id) : null;

                return {
                    cert,
                    user,
                    config: resolvedConfig || customConfig,
                    overrideName: user?.full_name || (participant as any)?.full_name || (participant as any)?.student_name
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
            // Load full certificate with metadata from database
            let fullCert = cert;
            if (!cert.metadata || Object.keys(cert.metadata).length === 0) {
                const res = await dataService.getCertificateById(cert.id);
                if (res.success && res.data) {
                    fullCert = res.data;
                }
            }

            // Resolve full config (merge config_id with shared preset)
            const meta = (fullCert.metadata || {}) as any;
            let resolvedConfig = meta;
            if (meta.config_id) {
                try {
                    const configRes = await dataService.getCertificateConfigs();
                    if (configRes.success && configRes.data) {
                        const preset = configRes.data.find((p: any) => p.id === meta.config_id);
                        if (preset?.config) {
                            resolvedConfig = { ...preset.config, ...meta };
                        }
                    }
                } catch (e) { console.warn('Config resolve failed:', e); }
            }

            // Find user or event participant for name
            const user = users.find(u => u.id === fullCert.user_id);
            const participant = !user ? eventParticipants.find(p => (p as any).user_id === fullCert.user_id || p.id === fullCert.user_id) : null;
            const overrideName = user?.full_name || (participant as any)?.full_name || (participant as any)?.student_name;

            const items = [{
                cert: fullCert,
                user,
                config: resolvedConfig || customConfig,
                overrideName: overrideName
            }];
            const fileName = `Certificate_${fullCert.title.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;
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
                                            {/* Template Selector - Moved to top as priority */}
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2 font-serif">Chọn giao diện</label>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {TEMPLATE_OPTIONS.map(opt => {
                                                        const Icon = {
                                                            classic: Landmark,
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
                                                                <span className="text-[9px] font-bold uppercase tracking-tighter">{opt.name}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Presets - Moved below selector */}
                                            {savedPresets.length > 0 && (
                                                <div className="mt-4">
                                                    <label className="text-[10px] font-black text-slate-400 mb-2 block uppercase tracking-widest">Mẫu của bạn đã lưu</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {savedPresets.map((preset, idx) => (
                                                            <div key={idx} className="flex items-center gap-1 bg-white border border-slate-100 rounded-lg px-2 py-1.5 shadow-sm hover:border-indigo-200 transition-all">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleLoadPreset(preset)}
                                                                    className="text-[10px] font-bold text-slate-600 hover:text-indigo-600 truncate max-w-[120px]"
                                                                >
                                                                    {preset.name}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeletePreset(preset.id, idx, preset.name)}
                                                                    className="text-slate-300 hover:text-red-500 ml-1"
                                                                >
                                                                    <Archive className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Template Config — available for ALL templates */}
                                            {(
                                                <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                                    <h4 className="font-bold text-slate-900 flex items-center justify-between text-sm">
                                                        <span className="flex items-center gap-2"><LayoutTemplate className="w-4 h-4" /> Tùy chỉnh</span>
                                                    </h4>

                                                    {/* Quick Actions Toolbar */}
                                                    <div className="space-y-2">
                                                        {showSaveNaming ? (
                                                            <div className="p-3 bg-white border border-indigo-200 rounded-xl shadow-sm animate-in fade-in zoom-in-95 duration-200">
                                                                <label className="block text-[10px] font-black text-indigo-600 uppercase mb-2">Đặt tên cho mẫu</label>
                                                                <input
                                                                    autoFocus
                                                                    type="text"
                                                                    value={saveName}
                                                                    onChange={e => setSaveName(e.target.value)}
                                                                    placeholder="VD: Mẫu tháng 1..."
                                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs mb-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                                                    onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
                                                                />
                                                                <div className="flex gap-2">
                                                                    <button onClick={() => setShowSaveNaming(false)} className="flex-1 py-1.5 text-[10px] font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Hủy</button>
                                                                    <button onClick={handleSavePreset} className="flex-1 py-1.5 text-[10px] font-bold bg-indigo-600 text-white rounded-lg shadow-sm shadow-indigo-100">Xác nhận Lưu</button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={handleAddCustomText}
                                                                    className="flex-1 py-2 bg-indigo-50 text-indigo-700 rounded-xl font-bold text-xs hover:bg-indigo-100 transition-all border border-indigo-100 flex items-center justify-center gap-2"
                                                                >
                                                                    <Type className="w-4 h-4" /> Thêm chữ mới
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setShowSaveNaming(true);
                                                                        setSaveName(formData.title || '');
                                                                    }}
                                                                    className="flex-1 py-2 bg-slate-50 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-100 transition-all border border-slate-100 flex items-center justify-center gap-2"
                                                                >
                                                                    <Settings2 className="w-4 h-4" /> Lưu mẫu
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Appearance */}
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-500 mb-1 block">Khổ giấy</label>
                                                            <select
                                                                value={customConfig.paperSize}
                                                                onChange={e => setCustomConfig(p => ({ ...p, paperSize: e.target.value as any }))}
                                                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-xs"
                                                            >
                                                                <option value="A4">A4</option>
                                                                <option value="A5">A5</option>
                                                                <option value="A3">A3</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-500 mb-1 block">Hướng giấy</label>
                                                            <div className="flex bg-white border border-slate-200 rounded p-0.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setCustomConfig(p => ({ ...p, orientation: 'landscape' }))}
                                                                    className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${customConfig.orientation === 'landscape' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400'}`}
                                                                >
                                                                    Ngang
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setCustomConfig(p => ({ ...p, orientation: 'portrait' }))}
                                                                    className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${customConfig.orientation === 'portrait' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400'}`}
                                                                >
                                                                    Dọc
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="col-span-2 grid grid-cols-2 gap-3">
                                                            <div>
                                                                <label className="text-[10px] font-bold text-slate-500 mb-1 block">Font chung</label>
                                                                <select
                                                                    value={customConfig.fontStyle || 'serif'}
                                                                    onChange={e => setCustomConfig(p => ({ ...p, fontStyle: e.target.value as any }))}
                                                                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-xs"
                                                                >
                                                                    <optgroup label="🎨 Cổ điển">
                                                                        <option value="serif">Playfair Display</option>
                                                                        <option value="times">Times New Roman</option>
                                                                        <option value="cormorant">Cormorant Garamond</option>
                                                                        <option value="librebaskerville">Libre Baskerville</option>
                                                                    </optgroup>
                                                                    <optgroup label="✨ Calligraphy / Nhiều nét">
                                                                        <option value="greatvibes">Great Vibes</option>
                                                                        <option value="alexbrush">Alex Brush</option>
                                                                        <option value="pinyon">Pinyon Script</option>
                                                                        <option value="handwriting">Dancing Script</option>
                                                                    </optgroup>
                                                                    <optgroup label="💻 Hiện đại">
                                                                        <option value="cinzel">Cinzel (La Mã)</option>
                                                                        <option value="sans">Arimo</option>
                                                                        <option value="bevietnam">Be Vietnam Pro</option>
                                                                    </optgroup>
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
                                                                    <optgroup label="🎨 Cổ điển">
                                                                        <option value="serif">Playfair Display</option>
                                                                        <option value="times">Times New Roman</option>
                                                                        <option value="cormorant">Cormorant Garamond</option>
                                                                        <option value="librebaskerville">Libre Baskerville</option>
                                                                    </optgroup>
                                                                    <optgroup label="✨ Calligraphy / Nhiều nét">
                                                                        <option value="greatvibes">Great Vibes</option>
                                                                        <option value="alexbrush">Alex Brush</option>
                                                                        <option value="pinyon">Pinyon Script</option>
                                                                        <option value="handwriting">Dancing Script</option>
                                                                    </optgroup>
                                                                    <optgroup label="💻 Hiện đại">
                                                                        <option value="cinzel">Cinzel (La Mã)</option>
                                                                        <option value="sans">Arimo</option>
                                                                        <option value="bevietnam">Be Vietnam Pro</option>
                                                                    </optgroup>
                                                                </select>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Spacing & Title Size Settings Removed as they are now per-element */}

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

                                                        {/* Visibility Toggles */}
                                                        <div className="grid grid-cols-2 gap-2 mt-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                            <h4 className="col-span-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ẩn / Hiện thành phần</h4>
                                                            {[
                                                                { id: 'logo', label: 'Logo' },
                                                                { id: 'title', label: 'Tiêu đề' },
                                                                { id: 'recipient', label: 'Tên người nhận' },
                                                                { id: 'presentedTo', label: 'Lời tặng' },
                                                                { id: 'eventName', label: 'Tên sự kiện' },
                                                                { id: 'eventStr', label: 'Lời dẫn sự kiện' },
                                                                { id: 'date', label: 'Ngày cấp' },
                                                                { id: 'entryNo', label: 'Vào sổ số' },
                                                                { id: 'signature', label: 'Tên người ký' },
                                                                { id: 'signatureImg', label: 'Ảnh chữ ký' },
                                                                { id: 'seal', label: 'Con dấu' },
                                                                { id: 'qr', label: 'Mã QR' }
                                                            ].map(item => (
                                                                <label key={item.id} className="flex items-center gap-2 cursor-pointer bg-white p-1.5 border border-slate-200 rounded-lg hover:border-indigo-300 transition-all">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={customConfig.visibility?.[item.id as keyof typeof customConfig.visibility] !== false}
                                                                        onChange={e => {
                                                                            const val = e.target.checked;
                                                                            setCustomConfig(p => ({
                                                                                ...p,
                                                                                visibility: { ...(p.visibility || {}), [item.id]: val }
                                                                            }));
                                                                        }}
                                                                        className="w-3 h-3 rounded text-indigo-600 border-gray-300"
                                                                    />
                                                                    <span className="text-[10px] font-bold text-slate-700">{item.label}</span>

                                                                    {/* Simple Individual Color/Size Trigger */}
                                                                    {['title', 'recipient', 'presentedTo', 'eventStr', 'eventName', 'signature', 'signatureImg', 'seal', 'date', 'entryNo'].includes(item.id) && (
                                                                        <div className="ml-auto flex gap-1 items-center">
                                                                            <input
                                                                                type="color"
                                                                                value={customConfig.elementStyles?.[item.id]?.color || customConfig.textColor || '#1e293b'}
                                                                                onChange={e => setCustomConfig(p => ({
                                                                                    ...p,
                                                                                    elementStyles: {
                                                                                        ...(p.elementStyles || {}),
                                                                                        [item.id]: { ...(p.elementStyles?.[item.id] || {}), color: e.target.value }
                                                                                    }
                                                                                }))}
                                                                                className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer"
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </label>
                                                            ))}
                                                        </div>
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

                                                    {/* Background Settings */}
                                                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 mb-2">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-500 mb-1 block">Chế độ nền</label>
                                                            <select
                                                                value={customConfig.bgMode || 'cover'}
                                                                onChange={e => setCustomConfig(p => ({ ...p, bgMode: e.target.value as any }))}
                                                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-[10px] font-bold"
                                                            >
                                                                <option value="cover">Phủ kín (Cover)</option>
                                                                <option value="contain">Vừa vặn (Contain)</option>
                                                                <option value="fill">Kéo giãn (Stretch)</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-500 mb-1 block">Độ mờ nền ({Math.round((customConfig.bgOpacity !== undefined ? customConfig.bgOpacity : 1) * 100)}%)</label>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="1"
                                                                step="0.1"
                                                                value={customConfig.bgOpacity !== undefined ? customConfig.bgOpacity : 1}
                                                                onChange={e => setCustomConfig(p => ({ ...p, bgOpacity: parseFloat(e.target.value) }))}
                                                                className="w-full accent-indigo-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Uploads */}
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="relative block p-2 border-x border-t border-slate-200 rounded-t-lg hover:border-indigo-500 hover:bg-white text-center transition-all bg-white/50">
                                                            <label className="cursor-pointer block">
                                                                <input type="file" className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'bgImage')} />
                                                                <span className="text-[10px] font-bold text-slate-500 block">Ảnh nền</span>
                                                                {customConfig.bgImage ? <CheckCircle className="w-3 h-3 mx-auto text-emerald-500" /> : <Upload className="w-3 h-3 mx-auto text-slate-400" />}
                                                            </label>
                                                            {customConfig.bgImage && (
                                                                <button type="button" onClick={() => setCustomConfig(p => ({ ...p, bgImage: undefined }))} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] leading-none flex items-center justify-center hover:bg-red-600 shadow-sm" title="Xóa">×</button>
                                                            )}
                                                        </div>
                                                        <div className="relative block p-2 border-x border-t border-slate-200 rounded-t-lg hover:border-indigo-500 hover:bg-white text-center transition-all bg-white/50">
                                                            <label className="cursor-pointer block">
                                                                <input type="file" className="hidden" accept="image/*" onChange={async e => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file) {
                                                                        setIsLoading(true);
                                                                        const reader = new FileReader();
                                                                        reader.onloadend = async () => {
                                                                            if (reader.result) {
                                                                                const base64 = reader.result as string;
                                                                                // Upload to Storage
                                                                                const uploadRes = await uploadCertificateImage(base64, 'logos');
                                                                                if (uploadRes.success && uploadRes.url) {
                                                                                    setCustomConfig(p => ({ ...p, logos: [...(p.logos || []), uploadRes.url!] }));
                                                                                    toastSuccess('Đã tải logo lên Storage!');
                                                                                } else {
                                                                                    // Fallback to base64
                                                                                    setCustomConfig(p => ({ ...p, logos: [...(p.logos || []), base64] }));
                                                                                    toastSuccess('Đã thêm logo!');
                                                                                }
                                                                            }
                                                                            setIsLoading(false);
                                                                        };
                                                                        reader.readAsDataURL(file);
                                                                    }
                                                                }} />
                                                                <span className="text-[10px] font-bold text-slate-500 block">+ Logo</span>
                                                                <span className="text-[9px] text-slate-400">{customConfig.logos?.length || 0} đã chọn</span>
                                                            </label>
                                                            {(customConfig.logos?.length || 0) > 0 && (
                                                                <button type="button" onClick={() => setCustomConfig(p => ({ ...p, logos: [] }))} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] leading-none flex items-center justify-center hover:bg-red-600 shadow-sm" title="Xóa tất cả">×</button>
                                                            )}
                                                        </div>
                                                        <div className="relative block p-2 border border-slate-200 rounded-bl-lg hover:border-indigo-500 hover:bg-white text-center transition-all bg-white/50">
                                                            <label className="cursor-pointer block">
                                                                <input type="file" className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'signatureImage' as any)} />
                                                                <span className="text-[10px] font-bold text-slate-500 block">Chữ ký</span>
                                                                {(customConfig as any).signatureImage ? <CheckCircle className="w-3 h-3 mx-auto text-emerald-500" /> : <Edit3 className="w-3 h-3 mx-auto text-slate-400" />}
                                                            </label>
                                                            {(customConfig as any).signatureImage && (
                                                                <button type="button" onClick={() => setCustomConfig(p => ({ ...p, signatureImage: undefined } as any))} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] leading-none flex items-center justify-center hover:bg-red-600 shadow-sm" title="Xóa">×</button>
                                                            )}
                                                        </div>
                                                        <div className="relative block p-2 border border-slate-200 rounded-br-lg hover:border-indigo-500 hover:bg-white text-center transition-all bg-white/50">
                                                            <label className="cursor-pointer block">
                                                                <input type="file" className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'sealImage' as any)} />
                                                                <span className="text-[10px] font-bold text-slate-500 block">Con dấu</span>
                                                                {(customConfig as any).sealImage ? <CheckCircle className="w-3 h-3 mx-auto text-emerald-500" /> : <Landmark className="w-3 h-3 mx-auto text-slate-400" />}
                                                            </label>
                                                            {(customConfig as any).sealImage && (
                                                                <button type="button" onClick={() => setCustomConfig(p => ({ ...p, sealImage: undefined } as any))} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] leading-none flex items-center justify-center hover:bg-red-600 shadow-sm" title="Xóa">×</button>
                                                            )}
                                                        </div>
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

                                            {/* Toggles removed as they are redundant with Design tab */}
                                        </div>
                                    )}

                                    {/* TAB: RECIPIENTS */}
                                    {activeTab === 'recipients' && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                                            {/* Monthly Filter Section */}
                                            <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 mb-4">
                                                <h4 className="text-xs font-black text-indigo-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                    <Award className="w-3.5 h-3.5" /> Lọc học sinh tiêu biểu
                                                </h4>
                                                <div className="grid grid-cols-2 gap-2 mb-3">
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 mb-1 block">Tháng</label>
                                                        <select
                                                            value={monthFilter}
                                                            onChange={e => setMonthFilter(parseInt(e.target.value))}
                                                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-xs font-bold"
                                                        >
                                                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                                                <option key={m} value={m}>Tháng {m}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 mb-1 block">Năm</label>
                                                        <select
                                                            value={yearFilter}
                                                            onChange={e => setYearFilter(parseInt(e.target.value))}
                                                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-xs font-bold"
                                                        >
                                                            {[2024, 2025, 2026].map(y => (
                                                                <option key={y} value={y}>Năm {y}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <div className="flex-1">
                                                        <label className="text-[10px] font-bold text-slate-500 mb-1 block">Số lượng (Top N)</label>
                                                        <input
                                                            type="number"
                                                            value={topLimit}
                                                            onChange={e => setTopLimit(parseInt(e.target.value))}
                                                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-bold"
                                                            min="1"
                                                            max="100"
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={handleFetchTopStudents}
                                                        disabled={isFetchingTop}
                                                        className="self-end px-4 py-1.5 bg-indigo-600 text-white rounded font-bold text-xs hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md shadow-indigo-100"
                                                    >
                                                        {isFetchingTop ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lọc ngay'}
                                                    </button>
                                                </div>
                                            </div>

                                            <div>
                                                <select
                                                    value={formData.event_id}
                                                    onChange={e => {
                                                        const eid = e.target.value;
                                                        const eventName = events.find(ev => ev.id === eid)?.name || '';
                                                        setFormData({ ...formData, event_id: eid, manualEventName: eventName, title: eventName || formData.title });
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
                                                    <button type="button" onClick={() => { setRecipientSource('users'); setTopStudents([]); }} className={`flex-1 py-1.5 text-xs font-bold rounded border flex items-center justify-center gap-1.5 ${recipientSource === 'users' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white'}`}><UsersRound className="w-3.5 h-3.5" />Toàn bộ User</button>
                                                    <button type="button" onClick={() => { setRecipientSource('event'); setTopStudents([]); }} className={`flex-1 py-1.5 text-xs font-bold rounded border flex items-center justify-center gap-1.5 ${recipientSource === 'event' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white'}`}><Calendar className="w-3.5 h-3.5" />Theo Sự kiện</button>
                                                </div>

                                                {/* Role Filter - only for 'users' mode */}
                                                {recipientSource === 'users' && (
                                                    <div className="flex gap-1 mb-2">
                                                        <button type="button" onClick={() => { setRoleFilter('student'); setRecipientPage(1); setTopStudents([]); }} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border flex items-center justify-center gap-1 ${roleFilter === 'student' ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`}><GraduationCap className="w-3 h-3" /> Học sinh</button>
                                                        <button type="button" onClick={() => { setRoleFilter('teacher'); setRecipientPage(1); setTopStudents([]); }} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border flex items-center justify-center gap-1 ${roleFilter === 'teacher' ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}><BookOpen className="w-3 h-3" /> Giáo viên</button>
                                                        <button type="button" onClick={() => { setRoleFilter('all'); setRecipientPage(1); setTopStudents([]); }} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border flex items-center justify-center gap-1 ${roleFilter === 'all' ? 'bg-purple-50 border-purple-400 text-purple-700' : 'bg-white border-slate-200 text-slate-500'}`}><UsersRound className="w-3 h-3" /> Tất cả</button>
                                                    </div>
                                                )}

                                                {/* Attendance Filter - only for 'event' mode */}
                                                {recipientSource === 'event' && formData.event_id && (
                                                    <div className="flex gap-1 mb-2">
                                                        <button type="button" onClick={() => { setEventAttendFilter('attended'); setRecipientPage(1); }} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border flex items-center justify-center gap-1 ${eventAttendFilter === 'attended' ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`}><UserCheck className="w-3 h-3" /> Tham gia ({eventParticipants.length})</button>
                                                        <button type="button" onClick={() => { setEventAttendFilter('absent'); setRecipientPage(1); }} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border flex items-center justify-center gap-1 ${eventAttendFilter === 'absent' ? 'bg-rose-50 border-rose-400 text-rose-700' : 'bg-white border-slate-200 text-slate-500'}`}><UserX className="w-3 h-3" /> Không tham gia</button>
                                                    </div>
                                                )}

                                                <div className="relative mb-3">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                    <input
                                                        type="text"
                                                        placeholder="Tìm kiếm người nhận..."
                                                        value={recipientSearch}
                                                        onChange={(e) => {
                                                            setRecipientSearch(e.target.value);
                                                            setRecipientPage(1);
                                                        }}
                                                        className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-xl text-xs focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                </div>

                                                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white max-h-[400px] flex flex-col">
                                                    {/* Toolbar */}
                                                    <div className="p-2 border-b border-slate-100 bg-slate-50 flex justify-between items-center text-[10px] font-bold">
                                                        <div className="flex gap-2">
                                                            <button type="button" onClick={() => {
                                                                const isEventMode = recipientSource === 'event';
                                                                let sourceData: any[];
                                                                if (topStudents.length > 0) {
                                                                    sourceData = topStudents;
                                                                } else if (isEventMode) {
                                                                    if (eventAttendFilter === 'attended') {
                                                                        sourceData = eventParticipants;
                                                                    } else {
                                                                        const pIds = new Set(eventParticipants.map((p: any) => p.user_id || p.id));
                                                                        sourceData = users.filter(u => !pIds.has(u.id) && u.role !== 'admin');
                                                                    }
                                                                } else {
                                                                    sourceData = users;
                                                                }
                                                                if (!isEventMode && topStudents.length === 0 && roleFilter !== 'all') {
                                                                    sourceData = sourceData.filter((u: any) => u.role === roleFilter);
                                                                } else if (!isEventMode && topStudents.length === 0) {
                                                                    sourceData = sourceData.filter((u: any) => u.role !== 'admin');
                                                                }
                                                                const filtered = sourceData.filter((u: any) =>
                                                                    u.full_name?.toLowerCase().includes(recipientSearch.toLowerCase()) ||
                                                                    u.student_code?.toLowerCase().includes(recipientSearch.toLowerCase())
                                                                );
                                                                setSelectedUserIds(filtered.map((u: any) => u.id || u.user_id));
                                                            }} className="text-indigo-600 hover:bg-slate-200 px-2 py-1 rounded">Chọn tất cả</button>
                                                            <button type="button" onClick={() => setSelectedUserIds([])} className="text-slate-500 hover:bg-slate-200 px-2 py-1 rounded">Bỏ chọn</button>
                                                        </div>
                                                        <span className="text-slate-400">Đã chọn: {selectedUserIds.length}</span>
                                                    </div>

                                                    <div className="overflow-y-auto p-1 space-y-0.5 flex-1">
                                                        {(() => {
                                                            const isEventMode = recipientSource === 'event';
                                                            const eventEmpty = isEventMode && eventParticipants.length === 0;
                                                            let sourceData: any[];

                                                            if (topStudents.length > 0) {
                                                                sourceData = topStudents;
                                                            } else if (isEventMode) {
                                                                if (eventAttendFilter === 'attended') {
                                                                    // Show only event participants
                                                                    sourceData = eventParticipants;
                                                                } else {
                                                                    // Show users NOT in event participants
                                                                    const participantIds = new Set(eventParticipants.map((p: any) => p.user_id || p.id));
                                                                    sourceData = users.filter(u => !participantIds.has(u.id) && u.role !== 'admin');
                                                                }
                                                            } else {
                                                                sourceData = users;
                                                            }

                                                            // Apply role filter only for normal users mode (skip when topStudents is active)
                                                            if (!isEventMode && topStudents.length === 0) {
                                                                if (roleFilter !== 'all') {
                                                                    sourceData = sourceData.filter((u: any) => u.role === roleFilter);
                                                                } else {
                                                                    sourceData = sourceData.filter((u: any) => u.role !== 'admin');
                                                                }
                                                            }
                                                            const filtered = sourceData.filter((u: any) =>
                                                                u.full_name?.toLowerCase().includes(recipientSearch.toLowerCase()) ||
                                                                u.student_code?.toLowerCase().includes(recipientSearch.toLowerCase())
                                                            );
                                                            const totalRecipientPages = Math.ceil(filtered.length / recipientsPerPage);
                                                            const displayRecipients = filtered.slice((recipientPage - 1) * recipientsPerPage, recipientPage * recipientsPerPage);

                                                            return (
                                                                <>
                                                                    {eventEmpty && formData.event_id && (
                                                                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700 mb-2">
                                                                            <p className="font-bold">⚠️ Sự kiện này chưa có người tham gia.</p>
                                                                            <p className="mt-1 text-amber-600">Vui lòng chọn sự kiện khác hoặc chuyển sang "Toàn bộ User".</p>
                                                                        </div>
                                                                    )}
                                                                    {displayRecipients.map((u: any) => {
                                                                        const uid = u.id || u.user_id;
                                                                        return (
                                                                            <label key={uid} className="flex items-center gap-2 p-2 hover:bg-indigo-50/50 rounded-lg cursor-pointer transition-colors">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={selectedUserIds.includes(uid)}
                                                                                    onChange={(e) => {
                                                                                        if (e.target.checked) setSelectedUserIds(prev => [...prev, uid]);
                                                                                        else setSelectedUserIds(prev => prev.filter(id => id !== uid));
                                                                                    }}
                                                                                    className="rounded text-indigo-600 w-4 h-4"
                                                                                />
                                                                                <div className="min-w-0">
                                                                                    <p className="text-xs font-bold text-slate-700 truncate">{u.full_name}</p>
                                                                                    <p className="text-[10px] text-slate-400">{u.student_code || 'No Code'}</p>
                                                                                </div>
                                                                            </label>
                                                                        );
                                                                    })}

                                                                    {totalRecipientPages > 1 && (
                                                                        <div className="flex items-center justify-between p-2 sticky bottom-0 bg-white border-t border-slate-100">
                                                                            <button
                                                                                type="button"
                                                                                disabled={recipientPage === 1}
                                                                                onClick={() => setRecipientPage(p => p - 1)}
                                                                                className="p-1 hover:bg-slate-100 rounded disabled:opacity-30"
                                                                            >
                                                                                <ChevronLeft className="w-4 h-4" />
                                                                            </button>
                                                                            <span className="text-[10px] text-slate-500 font-bold">Trang {recipientPage}/{totalRecipientPages}</span>
                                                                            <button
                                                                                type="button"
                                                                                disabled={recipientPage === totalRecipientPages}
                                                                                onClick={() => setRecipientPage(p => p + 1)}
                                                                                className="p-1 hover:bg-slate-100 rounded disabled:opacity-30"
                                                                            >
                                                                                <ChevronRight className="w-4 h-4" />
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
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
                            <div className={`shadow-2xl transition-all duration-500 origin-center ${customConfig.orientation === 'portrait' ? 'scale-[0.45]' : 'scale-[0.6]'}`}>
                                <SelectedTemplate
                                    data={{
                                        recipientName: replaceVariables('{full_name}', users.find(u => u.id === formData.user_id)),
                                        title: replaceVariables(formData.title || 'Chứng Nhận Demo', users.find(u => u.id === formData.user_id)),
                                        eventName: replaceVariables(formData.manualEventName || '', users.find(u => u.id === formData.user_id)),
                                        issuedDate: formData.issuedDate || new Date().toLocaleDateString('vi-VN'),
                                        type: formData.type,
                                        verifyCode: 'DEMO-123',
                                        verifyQR: demoQR
                                    }}
                                    customConfig={customConfig}
                                    isEditable={true}
                                    onLabelChange={(key, val) => {
                                        if (key.startsWith('pos_')) {
                                            const elementId = key.replace('pos_', '');
                                            const [x, y] = val.split(',').map(Number);
                                            setCustomConfig(prev => ({
                                                ...prev,
                                                positions: { ...prev.positions, [elementId]: { x, y } }
                                            }));
                                        } else if (key.startsWith('style_')) {
                                            const parts = key.split('_');
                                            const elementId = parts[1];
                                            const prop = parts[2] as 'scale' | 'color';
                                            setCustomConfig(prev => ({
                                                ...prev,
                                                elementStyles: {
                                                    ...(prev.elementStyles || {}),
                                                    [elementId]: {
                                                        ...(prev.elementStyles?.[elementId] || {}),
                                                        [prop]: prop === 'scale' ? parseFloat(val) : val
                                                    }
                                                }
                                            }));
                                        } else if (key.startsWith('visibility_')) {
                                            const elementId = key.replace('visibility_', '');
                                            setCustomConfig(prev => ({
                                                ...prev,
                                                visibility: { ...(prev.visibility || {}), [elementId]: val === 'true' }
                                            }));
                                        } else if (key.startsWith('remove_logo_')) {
                                            const index = parseInt(key.replace('remove_logo_', ''));
                                            setCustomConfig(prev => ({
                                                ...prev,
                                                logos: (prev.logos || []).filter((_, i) => i !== index)
                                            }));
                                        } else if (key.startsWith('customtext_')) {
                                            const textId = key.replace('customtext_', '');
                                            setCustomConfig(prev => ({
                                                ...prev,
                                                customTexts: (prev.customTexts || []).map(t => t.id === textId ? { ...t, content: val } : t)
                                            }));
                                        } else if (key.startsWith('delete_customtext_')) {
                                            const textId = key.replace('delete_customtext_', '');
                                            setCustomConfig(prev => ({
                                                ...prev,
                                                customTexts: (prev.customTexts || []).filter(t => t.id !== textId)
                                            }));
                                        } else {
                                            setCustomConfig(prev => ({ ...prev, labels: { ...prev.labels, [key]: val } }));
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        {/* Recent Certificates */}
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <Award className="w-5 h-5 text-indigo-500" />
                                    Đã cấp gần đây
                                </h3>
                                <div className="relative flex-1 max-w-xs">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Tìm tên hoặc nội dung..."
                                        value={historySearch}
                                        onChange={(e) => {
                                            setHistorySearch(e.target.value);
                                            setRecentCertsPage(1);
                                        }}
                                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(() => {
                                    const filtered = certificates.filter(cert => {
                                        const certTitle = (cert.title || '').toLowerCase();
                                        const recipient = (users.find(u => u.id === cert.user_id)?.full_name || '').toLowerCase();
                                        const search = historySearch.toLowerCase();
                                        return certTitle.includes(search) || recipient.includes(search);
                                    });
                                    // Sort by issued_date: newest first
                                    const sorted = [...filtered].sort((a, b) => {
                                        const dateA = new Date(a.issued_date || 0).getTime();
                                        const dateB = new Date(b.issued_date || 0).getTime();
                                        return dateB - dateA; // Descending (newest first)
                                    });
                                    const totalCertPages = Math.ceil(sorted.length / recentCertsPerPage);
                                    const displayCerts = sorted.slice((recentCertsPage - 1) * recentCertsPerPage, recentCertsPage * recentCertsPerPage);

                                    return (
                                        <>
                                            {displayCerts.map(cert => (
                                                <div key={cert.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-all group">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-bold text-slate-900 truncate">{users.find(u => u.id === cert.user_id)?.full_name || (cert.metadata as any)?.recipient_name || eventParticipants.find(p => (p as any).user_id === cert.user_id || p.id === cert.user_id)?.full_name || cert.user_id?.slice(0, 8) || 'N/A'}</p>
                                                        <p className="text-xs text-indigo-600 font-semibold truncate">{cert.title}</p>
                                                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                                            <Calendar className="w-3 h-3" /> {cert.issued_date ? new Date(cert.issued_date).toLocaleDateString('vi-VN') : 'N/A'}
                                                        </p>
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
                                                            onClick={() => setCertToDelete({ id: cert.id, title: cert.title })}
                                                            className="p-2 bg-white rounded-lg shadow-sm text-red-600 hover:bg-red-50 transition-colors border border-slate-100"
                                                            title="Xóa"
                                                        >
                                                            <Archive className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}

                                            {totalCertPages > 1 && (
                                                <div className="col-span-1 md:col-span-2 flex items-center justify-center gap-4 mt-4 py-2 border-t border-slate-50">
                                                    <button
                                                        disabled={recentCertsPage === 1}
                                                        onClick={() => setRecentCertsPage(p => p - 1)}
                                                        className="p-2 hover:bg-slate-100 rounded-lg disabled:opacity-30"
                                                    >
                                                        <ChevronLeft className="w-5 h-5" />
                                                    </button>
                                                    <span className="text-xs font-bold text-slate-500">Trang {recentCertsPage}/{totalCertPages}</span>
                                                    <button
                                                        disabled={recentCertsPage === totalCertPages}
                                                        onClick={() => setRecentCertsPage(p => p + 1)}
                                                        className="p-2 hover:bg-slate-100 rounded-lg disabled:opacity-30"
                                                    >
                                                        <ChevronRight className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modern Delete Confirmation Modal */}
            {presetToDelete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
                        <div className="bg-red-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                            <Archive className="w-6 h-6 text-red-600" />
                        </div>
                        <h3 className="text-lg font-black text-slate-900 mb-2">Xác nhận xóa mẫu?</h3>
                        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                            Bạn có chắc chắn muốn xóa mẫu <span className="font-bold text-slate-700">"{presetToDelete.name}"</span>? Thao tác này không thể hoàn tác.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setPresetToDelete(null)}
                                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all"
                            >
                                Quay lại
                            </button>
                            <button
                                onClick={confirmDeletePreset}
                                className="flex-1 py-3 bg-red-600 text-white rounded-2xl font-bold text-sm hover:bg-red-700 shadow-lg shadow-red-200 transition-all"
                            >
                                Xóa ngay
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Certificate Confirmation Modal */}
            {certToDelete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
                        <div className="bg-red-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                            <Archive className="w-6 h-6 text-red-600" />
                        </div>
                        <h3 className="text-lg font-black text-slate-900 mb-2">Xác nhận xóa chứng nhận?</h3>
                        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                            Bạn có chắc chắn muốn xóa chứng nhận <span className="font-bold text-slate-700">"{certToDelete.title}"</span>? Thao tác này không thể hoàn tác.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setCertToDelete(null)}
                                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all"
                            >
                                Quay lại
                            </button>
                            <button
                                onClick={async () => {
                                    const res = await dataService.deleteCertificate(certToDelete.id);
                                    if (res.success) {
                                        setCertificates(prev => prev.filter(c => c.id !== certToDelete.id));
                                        toastSuccess('Đã xóa chứng nhận');
                                    } else {
                                        toastError(res.error || 'Lỗi xóa');
                                    }
                                    setCertToDelete(null);
                                }}
                                className="flex-1 py-3 bg-red-600 text-white rounded-2xl font-bold text-sm hover:bg-red-700 shadow-lg shadow-red-200 transition-all"
                            >
                                Xóa ngay
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Mass Creation Progress Overlay */}
            {
                saveProgress && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-indigo-900/40 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white rounded-[2rem] shadow-2xl border border-white/50 max-w-md w-full p-10 text-center animate-in zoom-in-95 duration-300">
                            <div className="relative w-24 h-24 mx-auto mb-8">
                                <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
                                <svg className="w-full h-full transform -rotate-90">
                                    <circle
                                        cx="48"
                                        cy="48"
                                        r="44"
                                        stroke="currentColor"
                                        strokeWidth="6"
                                        fill="transparent"
                                        className="text-indigo-600 transition-all duration-500 ease-out"
                                        strokeDasharray={2 * Math.PI * 44}
                                        strokeDashoffset={2 * Math.PI * 44 * (1 - saveProgress.current / saveProgress.total)}
                                        strokeLinecap="round"
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-2xl font-black text-slate-900">{Math.round((saveProgress.current / saveProgress.total) * 100)}%</span>
                                </div>
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 mb-3">Đang tạo chứng nhận</h3>
                            <p className="text-slate-500 font-bold mb-8">Đã hoàn thành {saveProgress.current}/{saveProgress.total} bản ghi...</p>

                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                                <div
                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                                    style={{ width: `${(saveProgress.current / saveProgress.total) * 100}%` }}
                                ></div>
                            </div>
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Vui lòng không đóng trình duyệt</p>
                        </div>
                    </div>
                )
            }
        </div>
    );
};

const CertificateGenerator: React.FC<CertificateGeneratorProps> = (props) => (
    <ToastProvider>
        <CertificateGeneratorContent {...props} />
    </ToastProvider>
);

export default CertificateGenerator;

