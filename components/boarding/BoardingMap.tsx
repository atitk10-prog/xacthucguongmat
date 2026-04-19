import React, { useEffect, useState, useRef } from 'react';
import { MapPin, Clock, Filter, Calendar, Download, RefreshCw, Users, CheckCircle, XCircle, AlertTriangle, UserCheck } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { supabase } from '../../services/supabaseClient';
import { BoardingTimeSlot } from '../../types';

interface BoardingMapProps {
    timeSlots: BoardingTimeSlot[];
    activeSlotId?: string; // Auto-sync with dashboard tab
}

interface MapRecord {
    id: string;
    user_id: string;
    checkin_time: string;
    status: string;
    checkin_latitude: number | null;
    checkin_longitude: number | null;
    checkin_accuracy: number | null;
    gps_suspicious: boolean;
    checkin_mode: string | null;
    face_verified: boolean;
    notes: string | null;
    user: {
        full_name: string;
        student_code: string;
        organization: string;
        avatar_url: string;
        room_id: string | null;
    };
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string; dot: string }> = {
    on_time: { bg: 'bg-green-50', text: 'text-green-700', label: 'Đúng giờ', dot: 'bg-green-500' },
    late: { bg: 'bg-yellow-50', text: 'text-yellow-700', label: 'Trễ', dot: 'bg-yellow-500' },
    absent: { bg: 'bg-red-50', text: 'text-red-600', label: 'Vắng', dot: 'bg-red-500' },
    excused: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Có phép', dot: 'bg-purple-500' },
    manual: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'GV tick', dot: 'bg-orange-500' },
};

const MODE_LABELS: Record<string, string> = {
    qr: 'QR thẻ',
    face: 'Face ID',
    geo: 'GPS ĐT',
    manual: 'Thủ công',
};

export default function BoardingMap({ timeSlots, activeSlotId }: BoardingMapProps) {
    const [selectedSlot, setSelectedSlot] = useState<BoardingTimeSlot | null>(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'));
    const [records, setRecords] = useState<MapRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [selectedRecord, setSelectedRecord] = useState<MapRecord | null>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);

    // Sync with parent dashboard's selected slot tab
    useEffect(() => {
        if (activeSlotId && activeSlotId !== 'all') {
            const slot = timeSlots.find(s => s.id === activeSlotId);
            if (slot && slot.id !== selectedSlot?.id) {
                setSelectedSlot(slot);
            }
        }
    }, [activeSlotId, timeSlots]);

    // Fallback: On mount, select first active slot if no parent sync
    useEffect(() => {
        if (!activeSlotId || activeSlotId === 'all') {
            const active = timeSlots.filter(s => s.is_active);
            if (active.length > 0 && !selectedSlot) {
                setSelectedSlot(active[0]);
            }
        }
    }, [timeSlots]);

    // Load data when slot/date changes
    // loadMapData function (defined first, used by both useEffect and realtime)
    const loadMapDataRef = useRef<() => Promise<void>>();
    const loadMapData = async () => {
        if (!selectedSlot) return;
        setLoading(true);
        try {
            const res = await dataService.getBoardingMapData({
                slotId: selectedSlot.id,
                date: selectedDate
            });
            if (res.success && res.data) {
                setRecords(res.data.map((r: any) => ({
                    ...r,
                    user: Array.isArray(r.user) ? r.user[0] : r.user
                })));
            }
        } catch (e) {
            console.error('Load map data error:', e);
        } finally {
            setLoading(false);
        }
    };
    loadMapDataRef.current = loadMapData;

    // Load data when slot/date changes
    useEffect(() => {
        if (selectedSlot) loadMapData();
    }, [selectedSlot?.id, selectedDate]);

    // ── REALTIME: Auto-refresh khi có check-in mới ──
    const [isLive, setIsLive] = useState(false);
    useEffect(() => {
        if (!selectedSlot) return;

        const channel = supabase
            .channel(`boarding_map_rt:${selectedSlot.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',  // INSERT + UPDATE
                    schema: 'public',
                    table: 'boarding_attendance',
                    filter: `slot_id=eq.${selectedSlot.id}`
                },
                (payload) => {
                    const row = (payload.new || payload.old) as any;
                    if (row?.date === selectedDate) {
                        // Flash live indicator
                        setIsLive(true);
                        setTimeout(() => setIsLive(false), 2000);
                        // Reload map data via ref (always latest version)
                        loadMapDataRef.current?.();
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [selectedSlot?.id, selectedDate]);

    // Init Leaflet map
    useEffect(() => {
        if (!mapContainerRef.current) return;

        const initMap = async () => {
            try {
                const L = await import('leaflet');
                // Import leaflet CSS
                if (!document.querySelector('link[href*="leaflet.css"]')) {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                    document.head.appendChild(link);
                }

                if (mapInstanceRef.current) {
                    mapInstanceRef.current.remove();
                }

                // Get center from boarding config
                const configRes = await dataService.getBoardingConfig();
                let center: [number, number] = [10.8231, 106.6297]; // Default HCMC
                let radius = 100;

                if (configRes.success && configRes.data) {
                    const lat = parseFloat(configRes.data.boarding_latitude || '0');
                    const lng = parseFloat(configRes.data.boarding_longitude || '0');
                    radius = parseInt(configRes.data.boarding_radius || '100');
                    if (lat !== 0 && lng !== 0) center = [lat, lng];
                }

                const map = L.map(mapContainerRef.current!, {
                    center: center,
                    zoom: 17,
                    zoomControl: true,
                    attributionControl: false
                });

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                }).addTo(map);

                // Draw geofence circle
                L.circle(center, {
                    radius: radius,
                    fillColor: '#3b82f6',
                    fillOpacity: 0.08,
                    color: '#3b82f6',
                    weight: 2,
                    dashArray: '6, 6'
                }).addTo(map);

                // Center marker
                L.marker(center, {
                    icon: L.divIcon({
                        className: 'custom-marker',
                        html: `<div style="width:32px;height:32px;background:#3b82f6;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:16px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">🏫</div>`,
                        iconSize: [32, 32],
                        iconAnchor: [16, 16]
                    })
                }).addTo(map).bindPopup(`<b>Ký túc xá</b><br>Bán kính: ${radius}m`);

                mapInstanceRef.current = map;
            } catch (e) {
                console.error('Failed to initialize map:', e);
            }
        };

        initMap();

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);

    // Update markers when records change
    useEffect(() => {
        if (!mapInstanceRef.current) return;

        const updateMarkers = async () => {
            const L = await import('leaflet');

            // Clear old markers
            markersRef.current.forEach(m => m.remove());
            markersRef.current = [];

            const filtered = statusFilter === 'all'
                ? records
                : records.filter(r =>
                    statusFilter === 'manual'
                        ? r.checkin_mode === 'manual'
                        : r.status === statusFilter
                );

            filtered.forEach(record => {
                if (!record.checkin_latitude || !record.checkin_longitude) return;

                const statusInfo = record.checkin_mode === 'manual'
                    ? STATUS_COLORS.manual
                    : (STATUS_COLORS[record.status] || STATUS_COLORS.on_time);

                const dotColor = record.gps_suspicious ? '#ef4444' : (
                    record.status === 'on_time' ? '#22c55e' :
                    record.status === 'late' ? '#eab308' :
                    record.checkin_mode === 'manual' ? '#f97316' : '#6b7280'
                );

                const marker = L.marker([record.checkin_latitude, record.checkin_longitude], {
                    icon: L.divIcon({
                        className: 'student-marker',
                        html: `<div style="width:24px;height:24px;background:${dotColor};border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:bold;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);${record.gps_suspicious ? 'animation:pulse 1s infinite' : ''}">${record.user?.full_name?.charAt(0) || '?'}</div>`,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    })
                }).addTo(mapInstanceRef.current!);

                const time = new Date(record.checkin_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                marker.bindPopup(`
                    <div style="font-family:system-ui;min-width:180px">
                        <b style="font-size:14px">${record.user?.full_name || 'HS'}</b><br>
                        <span style="color:#6b7280;font-size:12px">${record.user?.organization || ''} ${record.user?.student_code ? `• ${record.user.student_code}` : ''}</span>
                        <hr style="margin:6px 0;border-color:#e5e7eb">
                        <div style="font-size:12px;display:grid;gap:4px">
                            <div>🕐 <b>${time}</b> — <span style="color:${dotColor}">${statusInfo.label}</span></div>
                            <div>📱 ${MODE_LABELS[record.checkin_mode || ''] || record.checkin_mode || 'N/A'}</div>
                            ${record.face_verified ? '<div>✅ Face verified</div>' : ''}
                            ${record.checkin_accuracy ? `<div>📡 Độ chính xác: ${Math.round(record.checkin_accuracy)}m</div>` : ''}
                            ${record.gps_suspicious ? '<div style="color:#ef4444">⚠️ GPS nghi giả!</div>' : ''}
                            ${record.notes ? `<div>📝 ${record.notes}</div>` : ''}
                        </div>
                    </div>
                `);

                markersRef.current.push(marker);
            });
        };

        updateMarkers();
    }, [records, statusFilter]);

    // Stats
    const stats = {
        total: records.length,
        onTime: records.filter(r => r.status === 'on_time').length,
        late: records.filter(r => r.status === 'late').length,
        manual: records.filter(r => r.checkin_mode === 'manual').length,
        withGps: records.filter(r => r.checkin_latitude !== null).length,
        suspicious: records.filter(r => r.gps_suspicious).length,
    };

    // Pagination
    const PAGE_SIZE = 10;
    const [currentPage, setCurrentPage] = useState(1);

    // Reset page when filter or records change
    useEffect(() => { setCurrentPage(1); }, [statusFilter, records.length]);

    // Filtered + Sorted (newest first)
    const filteredRecords = (statusFilter === 'all'
        ? records
        : records.filter(r =>
            statusFilter === 'manual' ? r.checkin_mode === 'manual' :
            statusFilter === 'gps' ? r.checkin_latitude !== null :
            r.status === statusFilter
        )
    ).sort((a, b) => new Date(b.checkin_time).getTime() - new Date(a.checkin_time).getTime());

    const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
    const paginatedRecords = filteredRecords.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    // Toggle filter on stat click
    const toggleFilter = (filter: string) => {
        setStatusFilter(prev => prev === filter ? 'all' : filter);
    };

    const activeSlots = timeSlots.filter(s => s.is_active);

    return (
        <div className="space-y-4">
            {/* Slot Tabs */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-3">
                    <MapPin size={18} className="text-blue-600" />
                    <h3 className="font-bold text-gray-800">Bản đồ điểm danh</h3>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2">
                    {activeSlots.map(slot => (
                        <button
                            key={slot.id}
                            onClick={() => setSelectedSlot(slot)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                                selectedSlot?.id === slot.id
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {slot.name}
                            <span className="ml-1 text-xs opacity-75">{slot.start_time}</span>
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-3 mt-3">
                    <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-gray-500" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <button
                        onClick={loadMapData}
                        disabled={loading}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1.5"
                        title="Tải lại"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>

                    {/* Live indicator */}
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${isLive ? 'bg-green-100 text-green-700 animate-pulse' : 'bg-gray-100 text-gray-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {isLive ? 'Cập nhật' : 'Live'}
                    </div>
                </div>
            </div>

            {/* Map */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div
                    ref={mapContainerRef}
                    style={{ height: '400px', width: '100%' }}
                    className="bg-gray-100"
                />
            </div>

            {/* Stats Bar — Clickable to filter */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                    onClick={() => toggleFilter('on_time')}
                    className={`rounded-xl p-3 shadow-sm border text-center transition-all active:scale-95 ${statusFilter === 'on_time' ? 'bg-green-50 border-green-300 ring-2 ring-green-400/30' : 'bg-white border-gray-100 hover:border-green-200'}`}
                >
                    <div className="flex items-center justify-center gap-1 mb-1">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-xs text-gray-500">Đúng giờ</span>
                    </div>
                    <span className="text-lg font-bold text-green-700">{stats.onTime}</span>
                </button>
                <button
                    onClick={() => toggleFilter('late')}
                    className={`rounded-xl p-3 shadow-sm border text-center transition-all active:scale-95 ${statusFilter === 'late' ? 'bg-yellow-50 border-yellow-300 ring-2 ring-yellow-400/30' : 'bg-white border-gray-100 hover:border-yellow-200'}`}
                >
                    <div className="flex items-center justify-center gap-1 mb-1">
                        <div className="w-2 h-2 rounded-full bg-yellow-500" />
                        <span className="text-xs text-gray-500">Trễ</span>
                    </div>
                    <span className="text-lg font-bold text-yellow-700">{stats.late}</span>
                </button>
                <button
                    onClick={() => toggleFilter('manual')}
                    className={`rounded-xl p-3 shadow-sm border text-center transition-all active:scale-95 ${statusFilter === 'manual' ? 'bg-orange-50 border-orange-300 ring-2 ring-orange-400/30' : 'bg-white border-gray-100 hover:border-orange-200'}`}
                >
                    <div className="flex items-center justify-center gap-1 mb-1">
                        <div className="w-2 h-2 rounded-full bg-orange-500" />
                        <span className="text-xs text-gray-500">GV tick</span>
                    </div>
                    <span className="text-lg font-bold text-orange-700">{stats.manual}</span>
                </button>
                <button
                    onClick={() => toggleFilter('gps')}
                    className={`rounded-xl p-3 shadow-sm border text-center transition-all active:scale-95 ${statusFilter === 'gps' ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400/30' : 'bg-white border-gray-100 hover:border-blue-200'}`}
                >
                    <div className="flex items-center justify-center gap-1 mb-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-xs text-gray-500">Có GPS</span>
                    </div>
                    <span className="text-lg font-bold text-blue-700">{stats.withGps}</span>
                </button>
            </div>

            {/* Records List — Paginated */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
                <div className="px-4 py-3 flex items-center justify-between">
                    <h4 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                        <Users size={16} />
                        Danh sách ({filteredRecords.length}{statusFilter !== 'all' ? `/${records.length}` : ''})
                    </h4>
                    {statusFilter !== 'all' && (
                        <button
                            onClick={() => setStatusFilter('all')}
                            className="text-xs text-blue-600 hover:text-blue-800 font-bold transition-colors"
                        >
                            Xóa bộ lọc ✕
                        </button>
                    )}
                </div>

                <div>
                    {filteredRecords.length === 0 && !loading && (
                        <div className="p-8 text-center text-gray-400 text-sm">
                            {statusFilter !== 'all' ? 'Không có dữ liệu cho bộ lọc này' : 'Chưa có dữ liệu điểm danh'}
                        </div>
                    )}
                    {loading && (
                        <div className="p-8 text-center text-gray-400 text-sm">
                            <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
                            Đang tải...
                        </div>
                    )}
                    {paginatedRecords.map(record => {
                        const statusInfo = record.checkin_mode === 'manual'
                            ? STATUS_COLORS.manual
                            : (STATUS_COLORS[record.status] || STATUS_COLORS.on_time);
                        const time = new Date(record.checkin_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

                        return (
                            <div key={record.id} className={`px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${record.gps_suspicious ? 'bg-red-50/50' : ''}`}>
                                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${statusInfo.dot}`} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-sm text-gray-800 truncate">{record.user?.full_name || 'HS'}</span>
                                        <span className="text-[10px] text-gray-400">{record.user?.organization}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <span>{time}</span>
                                        <span>•</span>
                                        <span>{MODE_LABELS[record.checkin_mode || ''] || '-'}</span>
                                        {record.face_verified && <span className="text-green-600">✓ Face</span>}
                                        {record.checkin_latitude && <span className="text-blue-500">📍</span>}
                                        {record.gps_suspicious && <span className="text-red-500">⚠️</span>}
                                        {record.notes && <span className="text-orange-500" title={record.notes}>📝</span>}
                                    </div>
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.bg} ${statusInfo.text} font-medium`}>
                                    {statusInfo.label}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Pagination */}
                {filteredRecords.length > PAGE_SIZE && (
                    <div className="px-4 py-3 flex items-center justify-between bg-gray-50/50">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage <= 1}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            ← Trước
                        </button>
                        <span className="text-xs text-gray-500 font-medium">
                            Trang {currentPage}/{totalPages} • {filteredRecords.length} HS
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage >= totalPages}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Sau →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
