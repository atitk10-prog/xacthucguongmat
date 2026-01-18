import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';
import { Room, User } from '../../types';

interface RoomManagementProps {
    onBack?: () => void;
}

const RoomManagement: React.FC<RoomManagementProps> = ({ onBack }) => {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [students, setStudents] = useState<User[]>([]);
    const [selectedZone, setSelectedZone] = useState<string>('all');
    const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [roomsResult, studentsResult] = await Promise.all([
                dataService.getRooms(),
                dataService.getUsers({ role: 'student', status: 'active' })
            ]);

            if (roomsResult.success && roomsResult.data) setRooms(roomsResult.data);
            if (studentsResult.success && studentsResult.data) setStudents(studentsResult.data);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const getZones = (): string[] => {
        const zones = new Set(rooms.map(r => r.zone).filter(Boolean));
        return Array.from(zones);
    };

    const getFilteredRooms = () => {
        if (selectedZone === 'all') return rooms;
        return rooms.filter(r => r.zone === selectedZone);
    };

    const getRoomStudents = (roomId: string) => {
        return students.filter(s => s.room_id === roomId);
    };

    const getRoomOccupancy = (roomId: string) => {
        return students.filter(s => s.room_id === roomId).length;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black text-slate-900">Quản lý Phòng Nội trú</h2>
                    <p className="text-slate-500 font-medium mt-1">Theo dõi và quản lý học sinh theo phòng</p>
                </div>
                {onBack && (
                    <button onClick={onBack} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">
                        ← Quay lại
                    </button>
                )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                    <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-2xl mb-3">🏠</div>
                    <p className="text-slate-500 text-sm">Tổng phòng</p>
                    <p className="text-2xl font-black text-slate-900">{rooms.length}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                    <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-2xl mb-3">👥</div>
                    <p className="text-slate-500 text-sm">Học sinh nội trú</p>
                    <p className="text-2xl font-black text-slate-900">{students.filter(s => s.room_id).length}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                    <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-2xl mb-3">🏢</div>
                    <p className="text-slate-500 text-sm">Số khu</p>
                    <p className="text-2xl font-black text-slate-900">{getZones().length}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                    <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-2xl mb-3">📊</div>
                    <p className="text-slate-500 text-sm">Tỷ lệ lấp đầy</p>
                    <p className="text-2xl font-black text-slate-900">
                        {rooms.length > 0
                            ? Math.round((students.filter(s => s.room_id).length / rooms.reduce((acc, r) => acc + (r.capacity || 0), 0)) * 100)
                            : 0}%
                    </p>
                </div>
            </div>

            {/* Zone Filter */}
            <div className="flex gap-2 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 w-fit">
                <button
                    onClick={() => setSelectedZone('all')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${selectedZone === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'
                        }`}
                >
                    Tất cả
                </button>
                {getZones().map(zone => (
                    <button
                        key={zone}
                        onClick={() => setSelectedZone(zone)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${selectedZone === zone ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        Khu {zone}
                    </button>
                ))}
            </div>

            {/* Rooms Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {getFilteredRooms().map(room => {
                    const occupancy = getRoomOccupancy(room.id);
                    const capacity = room.capacity || 8;
                    const occupancyRate = Math.round((occupancy / capacity) * 100);

                    return (
                        <div
                            key={room.id}
                            onClick={() => setSelectedRoom(room)}
                            className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                                    <span className="text-xl font-black text-indigo-600">{room.name}</span>
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${occupancyRate >= 100 ? 'bg-red-100 text-red-600' :
                                        occupancyRate >= 75 ? 'bg-amber-100 text-amber-600' :
                                            'bg-emerald-100 text-emerald-600'
                                    }`}>
                                    {occupancy}/{capacity}
                                </span>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm text-slate-500">
                                    <span>🏢</span> Khu {room.zone}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-slate-500">
                                    <span>👥</span> {occupancy} học sinh
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="mt-4">
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${occupancyRate >= 100 ? 'bg-red-500' :
                                                occupancyRate >= 75 ? 'bg-amber-500' :
                                                    'bg-emerald-500'
                                            }`}
                                        style={{ width: `${Math.min(occupancyRate, 100)}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Room Detail Modal */}
            {selectedRoom && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center">
                                    <span className="text-2xl font-black text-indigo-600">{selectedRoom.name}</span>
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900">Phòng {selectedRoom.name}</h3>
                                    <p className="text-slate-500">Khu {selectedRoom.zone} • Sức chứa: {selectedRoom.capacity}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedRoom(null)}
                                className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-xl"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            <h4 className="font-bold text-slate-900">Danh sách học sinh ({getRoomStudents(selectedRoom.id).length})</h4>

                            {getRoomStudents(selectedRoom.id).length === 0 ? (
                                <div className="text-center py-8 text-slate-400">
                                    <span className="text-4xl">🛏️</span>
                                    <p className="mt-2">Chưa có học sinh trong phòng này</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {getRoomStudents(selectedRoom.id).map(student => (
                                        <div key={student.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl">
                                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-lg">
                                                👤
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-bold text-slate-900">{student.full_name}</p>
                                                <p className="text-sm text-slate-500">{student.class_id}</p>
                                            </div>
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${student.status === 'active' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                {student.status === 'active' ? 'Đang ở' : 'Không hoạt động'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RoomManagement;
