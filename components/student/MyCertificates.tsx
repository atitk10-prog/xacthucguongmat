import React, { useEffect, useState, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import { Award, Calendar, Download, Eye, X, ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { User, Certificate } from '../../types';
import { getTemplateComponent, generateSingleExportPDF } from '../../services/certificateExportService';

interface MyCertificatesProps {
    user: User;
}

export default function MyCertificates({ user }: MyCertificatesProps) {
    const [certificates, setCertificates] = useState<Certificate[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);
    const [resolvedConfig, setResolvedConfig] = useState<any>(null);
    const [loadingCertDetail, setLoadingCertDetail] = useState(false);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [configCache, setConfigCache] = useState<Record<string, any>>({});
    const [certQR, setCertQR] = useState('');
    const itemsPerPage = 6;

    // Zoom & Pan state for certificate preview
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [baseScale, setBaseScale] = useState(0.5);
    const panStart = useRef({ x: 0, y: 0 });
    const panOffset = useRef({ x: 0, y: 0 });
    const lastTouchDist = useRef(0);
    const zoomContainerRef = useRef<HTMLDivElement>(null);

    const CERT_WIDTH = 800; // Typical certificate template width in px
    const MIN_ZOOM = 0.5;
    const MAX_ZOOM = 4;

    // Calculate base scale to fit certificate in container
    useEffect(() => {
        if (selectedCert && zoomContainerRef.current) {
            const containerW = zoomContainerRef.current.clientWidth - 32; // minus padding
            const scale = Math.min(containerW / CERT_WIDTH, 0.9);
            setBaseScale(Math.max(0.3, scale));
            setZoom(1);
            setPan({ x: 0, y: 0 });
        }
    }, [selectedCert]);

    // Also recalculate on resize
    useEffect(() => {
        if (!selectedCert) return;
        const handleResize = () => {
            if (zoomContainerRef.current) {
                const containerW = zoomContainerRef.current.clientWidth - 32;
                const scale = Math.min(containerW / CERT_WIDTH, 0.9);
                setBaseScale(Math.max(0.3, scale));
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [selectedCert]);

    const handleZoomIn = useCallback(() => setZoom(z => Math.min(MAX_ZOOM, z + 0.2)), []);
    const handleZoomOut = useCallback(() => setZoom(z => Math.max(MIN_ZOOM, z - 0.2)), []);
    const handleZoomReset = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

    // Mouse wheel zoom
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta)));
    }, []);

    // Touch: pinch zoom + pan
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastTouchDist.current = Math.sqrt(dx * dx + dy * dy);
        } else if (e.touches.length === 1) {
            setIsPanning(true);
            panStart.current = { x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y };
        }
    }, [pan]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (lastTouchDist.current > 0) {
                const scale = dist / lastTouchDist.current;
                setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * scale)));
            }
            lastTouchDist.current = dist;
        } else if (e.touches.length === 1 && isPanning && zoom > 1) {
            const x = e.touches[0].clientX - panStart.current.x;
            const y = e.touches[0].clientY - panStart.current.y;
            setPan({ x, y });
        }
    }, [isPanning, zoom]);

    const handleTouchEnd = useCallback(() => {
        lastTouchDist.current = 0;
        setIsPanning(false);
    }, []);

    // Mouse drag pan
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (zoom <= 1) return;
        setIsPanning(true);
        panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }, [zoom, pan]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isPanning || zoom <= 1) return;
        setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
    }, [isPanning, zoom]);

    const handleMouseUp = useCallback(() => setIsPanning(false), []);

    // Resolve full config by merging lightweight metadata with shared config from config_id
    const resolveConfig = async (cert: Certificate): Promise<any> => {
        const meta = (cert.metadata || {}) as any;
        const configId = meta.config_id;

        // If metadata already has images (old format), use directly
        if (meta.bgImage || meta.logoImage || meta.signatureImage) {
            return meta;
        }

        // If has config_id, load from shared config
        if (configId) {
            // Check cache first
            if (configCache[configId]) {
                return { ...configCache[configId], ...meta };
            }
            // Load from DB
            try {
                const res = await dataService.getCertificateConfigs();
                if (res.success && res.data) {
                    const preset = res.data.find((p: any) => p.id === configId);
                    if (preset?.config) {
                        setConfigCache(prev => ({ ...prev, [configId]: preset.config }));
                        return { ...preset.config, ...meta };
                    }
                }
            } catch (e) {
                console.warn('Failed to load config:', e);
            }
        }

        return meta;
    };

    useEffect(() => {
        loadCertificates();
    }, [user]);

    // Generate QR locally when a cert is selected
    useEffect(() => {
        if (selectedCert) {
            QRCode.toDataURL(selectedCert.id, { margin: 1, width: 150 })
                .then(url => setCertQR(url))
                .catch(() => setCertQR(''));
        }
    }, [selectedCert]);

    const loadCertificates = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const res = await dataService.getCertificates(user.id);
            if (res.success && res.data) {
                setCertificates(res.data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const totalPages = Math.ceil(certificates.length / itemsPerPage);
    const paginatedCerts = certificates.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const handlePreview = async (cert: Certificate) => {
        setLoadingCertDetail(true);
        try {
            let fullCert = cert;
            if (!cert.metadata) {
                const res = await dataService.getCertificateById(cert.id);
                if (res.success && res.data) fullCert = res.data;
            }
            // Resolve full config (merge with shared config from config_id)
            const config = await resolveConfig(fullCert);
            setResolvedConfig(config);
            setSelectedCert(fullCert);
        } catch (err) {
            console.error('Failed to load certificate details:', err);
            setResolvedConfig(cert.metadata || {});
            setSelectedCert(cert);
        } finally {
            setLoadingCertDetail(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                    <Award className="text-amber-500 w-8 h-8" />
                    Thành Tích & Chứng Nhận
                </h2>
                <div className="bg-amber-50 text-amber-600 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border border-amber-200">
                    Tổng: {certificates.length}
                </div>
            </div>

            {loading && (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-bold">Đang nạp chứng nhận...</p>
                </div>
            )}

            {!loading && certificates.length === 0 && (
                <div className="text-center py-20 bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100 shadow-sm">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Award className="text-slate-300 w-10 h-10" />
                    </div>
                    <h4 className="text-lg font-black text-slate-800">Chưa có chứng nhận nào</h4>
                    <p className="text-slate-400 text-sm mt-1 font-medium">Cố gắng hoàn thành tốt nhiệm vụ để nhận phần thưởng nhé!</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {paginatedCerts.map((cert) => (
                    <div key={cert.id} className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col hover:shadow-xl hover:-translate-y-1 transition-all group">
                        <div className="p-6 flex-1">
                            <div className="flex items-start justify-between mb-4">
                                <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-3.5 rounded-2xl text-white shadow-lg shadow-amber-100 group-hover:rotate-6 transition-transform">
                                    <Award size={28} />
                                </div>
                                <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-3 py-1.5 rounded-xl uppercase tracking-wider border border-slate-100 shadow-sm">
                                    Năm {new Date(cert.issued_date).getFullYear()}
                                </span>
                            </div>
                            <h3 className="font-black text-slate-800 text-xl mb-2 line-clamp-1">{cert.title}</h3>
                            <p className="text-slate-500 text-sm mb-6 line-clamp-2 leading-relaxed font-medium">
                                {cert.metadata?.manualEventName || cert.event_id || 'Thành tích xuất sắc ghi nhận sự nỗ lực và đóng góp tích cực của bạn.'}
                            </p>

                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 mt-auto pt-4 border-t border-slate-50 uppercase tracking-[0.2em]">
                                <Calendar size={12} className="text-indigo-400" />
                                <span>Cấp ngày: {new Date(cert.issued_date).toLocaleDateString('vi-VN')}</span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="bg-slate-50/50 px-6 py-5 flex gap-3 text-sm border-t border-slate-50 backdrop-blur-sm">
                            <button
                                onClick={() => handlePreview(cert)}
                                className="flex-1 flex items-center justify-center gap-2 bg-white text-indigo-600 font-black hover:bg-indigo-50 border border-indigo-100 shadow-sm py-3 rounded-2xl transition-all active:scale-95"
                            >
                                <Eye size={18} /> Xem ảnh
                            </button>
                            <button
                                disabled={downloadingId === cert.id}
                                onClick={async () => {
                                    setDownloadingId(cert.id);
                                    try {
                                        let fullCert = cert;
                                        if (!cert.metadata || Object.keys(cert.metadata).length === 0) {
                                            const res = await dataService.getCertificateById(cert.id);
                                            if (res.success && res.data) fullCert = res.data;
                                        }
                                        // Resolve full config for export
                                        const exportConfig = await resolveConfig(fullCert);
                                        const items = [{
                                            cert: fullCert,
                                            user: user,
                                            config: exportConfig,
                                            overrideName: user.full_name
                                        }];
                                        const fileName = `${fullCert.title.replace(/\s+/g, '_')}_${user.full_name.replace(/\s+/g, '_')}.pdf`;
                                        await generateSingleExportPDF(items, fileName);
                                    } catch (e) {
                                        console.error('PDF export failed:', e);
                                    } finally {
                                        setDownloadingId(null);
                                    }
                                }}
                                className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white font-black hover:bg-indigo-700 shadow-lg shadow-indigo-100 py-3 rounded-2xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait"
                            >
                                {downloadingId === cert.id ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                {downloadingId === cert.id ? 'Đang tải...' : 'Tải PDF'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-12 bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm w-fit mx-auto">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-3 rounded-2xl bg-slate-50 text-slate-400 hover:text-indigo-600 disabled:opacity-30 transition-all border border-slate-100"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="flex gap-2">
                        {[...Array(totalPages)].map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setCurrentPage(i + 1)}
                                className={`w-12 h-12 rounded-2xl font-black transition-all ${currentPage === i + 1
                                    ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 scale-110'
                                    : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 border border-transparent'
                                    }`}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-3 rounded-2xl bg-slate-50 text-slate-400 hover:text-indigo-600 disabled:opacity-30 transition-all border border-slate-100"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            )}

            {/* Loading Modal */}
            {loadingCertDetail && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl p-12 shadow-2xl flex flex-col items-center gap-4">
                        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                        <p className="text-slate-600 font-bold">Đang tải chứng nhận...</p>
                    </div>
                </div>
            )}

            {/* Preview Modal */}
            {selectedCert && !loadingCertDetail && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] w-full max-w-5xl max-h-[92vh] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-500">
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl rotate-3">
                                    <Eye size={28} />
                                </div>
                                <div className="ml-2">
                                    <h3 className="text-2xl font-black text-slate-800 leading-tight">Xem trước Chứng nhận</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{selectedCert.title}</span>
                                        <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                        <span className="text-[10px] text-indigo-500 font-black uppercase tracking-widest">Digital Verified</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedCert(null)}
                                className="p-4 hover:bg-red-50 hover:text-red-500 text-slate-300 rounded-3xl transition-all bg-white shadow-sm border border-slate-100"
                            >
                                <X size={28} />
                            </button>
                        </div>

                        <div
                            ref={zoomContainerRef}
                            className="flex-1 overflow-hidden p-4 md:p-8 flex items-center justify-center bg-slate-100/30 relative select-none"
                            style={{ cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default', touchAction: 'none' }}
                            onWheel={handleWheel}
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        >
                            {/* Decorative Background Elements */}
                            <div className="absolute top-10 left-10 w-32 h-32 bg-indigo-400/10 blur-[60px] rounded-full pointer-events-none"></div>
                            <div className="absolute bottom-10 right-10 w-40 h-40 bg-amber-400/10 blur-[70px] rounded-full pointer-events-none"></div>

                            <div
                                className="origin-center shadow-[0_30px_100px_rgba(0,0,0,0.15)] bg-white rounded-lg"
                                style={{
                                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${baseScale * zoom})`,
                                    transition: isPanning ? 'none' : 'transform 0.3s ease-out',
                                }}
                            >
                                {React.createElement(getTemplateComponent(selectedCert.template_id || 'classic'), {
                                    data: {
                                        recipientName: user.full_name,
                                        title: selectedCert.title,
                                        eventName: selectedCert.metadata?.manualEventName || '',
                                        issuedDate: selectedCert.metadata?.issuedDate || (selectedCert.issued_date ? new Date(selectedCert.issued_date).toLocaleDateString('vi-VN') : ''),
                                        type: selectedCert.type || 'excellent',
                                        verifyCode: selectedCert.id.split('-').pop() || '',
                                        verifyQR: certQR
                                    },
                                    customConfig: resolvedConfig || selectedCert.metadata as any
                                })}
                            </div>

                            {/* Zoom Controls */}
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900/80 backdrop-blur-xl px-3 py-2 rounded-2xl shadow-xl border border-white/10">
                                <button onClick={handleZoomOut} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-90" title="Thu nhỏ">
                                    <ZoomOut size={18} />
                                </button>
                                <button onClick={handleZoomReset} className="px-3 py-1 text-xs font-black text-white/90 hover:bg-white/10 rounded-xl transition-all min-w-[52px] text-center" title="Reset zoom">
                                    {Math.round(zoom * 100)}%
                                </button>
                                <button onClick={handleZoomIn} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-90" title="Phóng to">
                                    <ZoomIn size={18} />
                                </button>
                                {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
                                    <button onClick={handleZoomReset} className="p-2 text-amber-400/80 hover:text-amber-300 hover:bg-white/10 rounded-xl transition-all active:scale-90 ml-1 border-l border-white/10 pl-3" title="Reset">
                                        <RotateCcw size={16} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                            <p className="text-xs text-slate-400 font-medium hidden md:block">
                                Chứng nhận điện tử có giá trị tương đương bản giấy.
                            </p>
                            <div className="flex gap-4 w-full md:w-auto">
                                <button
                                    onClick={() => setSelectedCert(null)}
                                    className="flex-1 md:flex-none px-10 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black hover:bg-slate-100 transition-all shadow-sm"
                                >
                                    Đóng
                                </button>
                                <button
                                    disabled={downloadingId === selectedCert.id}
                                    onClick={async () => {
                                        setDownloadingId(selectedCert.id);
                                        try {
                                            const exportConfig = resolvedConfig || selectedCert.metadata || {};
                                            const items = [{
                                                cert: selectedCert,
                                                user: user,
                                                config: exportConfig,
                                                overrideName: user.full_name
                                            }];
                                            const fileName = `${selectedCert.title.replace(/\s+/g, '_')}_${user.full_name.replace(/\s+/g, '_')}.pdf`;
                                            await generateSingleExportPDF(items, fileName);
                                        } catch (e) {
                                            console.error('PDF export failed:', e);
                                        } finally {
                                            setDownloadingId(null);
                                        }
                                    }}
                                    className="flex-1 md:flex-none px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 text-center flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-wait"
                                >
                                    {downloadingId === selectedCert.id ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                    {downloadingId === selectedCert.id ? 'Đang tải...' : 'Tải PDF Ngay'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
