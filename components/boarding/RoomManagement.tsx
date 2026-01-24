import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';
import { User } from '../../types';
import { Icons, useToast } from '../ui';
import { Plus, Edit2, Trash2, X, Save, Building, Users as UsersIcon, Home, UserPlus, UserMinus, Search, Edit } from 'lucide-react';

interface Room {
    id: string;
    name: string;
    zone: string;
    capacity: number;
    manager_id?: string;
}

interface RoomManagementProps {
    onBack?: () => void;
    currentUser: User;
    teacherPermissions: any[];
}

const RoomManagement: React.FC<RoomManagementProps> = ({ onBack, currentUser, teacherPermissions }) => {
    // Permission checks
    const modulePerm = teacherPermissions?.find(p => p.module_id === 'boarding');
    const isAdmin = currentUser.role === 'admin';
    const canEdit = isAdmin || (modulePerm?.is_enabled && modulePerm?.can_edit);
    const canDelete = isAdmin || (modulePerm?.is_enabled && modulePerm?.can_delete);

    const { error: toastError, success: toastSuccess } = useToast();
    const [rooms, setRooms] = useState<Room[]>([]);
    const [students, setStudents] = useState<User[]>([]);
    const [selectedZone, setSelectedZone] = useState<string>('all');
    const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Modal states
    const [showRoomModal, setShowRoomModal] = useState(false);
    const [editingRoom, setEditingRoom] = useState<Room | null>(null);
    const [roomForm, setRoomForm] = useState({ name: '', zone: '', capacity: 8 });
    const [deleteConfirm, setDeleteConfirm] = useState<Room | null>(null);

    // Student assignment modal
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [assigningRoom, setAssigningRoom] = useState<Room | null>(null);
    const [studentSearch, setStudentSearch] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [roomsResult, studentsResult] = await Promise.all([
                dataService.getRooms(),
                dataService.getUsers({ role: 'student' })
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
        const zones = new Set(rooms.map(r => r.zone).filter(Boolean) as string[]);
        return Array.from(zones).sort();
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

    const getUnassignedStudents = () => {
        return students.filter(s => !s.room_id);
    };

    // Zone Management
    const [showZoneEditModal, setShowZoneEditModal] = useState(false);
    const [editingZoneName, setEditingZoneName] = useState('');
    const [newZoneName, setNewZoneName] = useState('');

    const openZoneEditModal = (e: React.MouseEvent, zone: string) => {
        e.stopPropagation();
        setEditingZoneName(zone);
        setNewZoneName(zone);
        setShowZoneEditModal(true);
    };

    const handleUpdateZoneName = async () => {
        if (!newZoneName.trim() || newZoneName === editingZoneName) return;

        // Validation: New name must not exist
        if (getZones().includes(newZoneName)) {
            toastError('Tên khu vực đã tồn tại!');
            return;
        }

        const res = await dataService.updateZone(editingZoneName, newZoneName);
        if (res.success) {
            toastSuccess('Cập nhật tên khu vực thành công!');
            setShowZoneEditModal(false);
            if (selectedZone === editingZoneName) setSelectedZone(newZoneName);
            loadData();
        } else {
            toastError(res.error || 'Lỗi cập nhật');
        }
    };



    // CRUD Handlers
    const handleAddRoom = () => {
        setEditingRoom(null);
        setRoomForm({ name: '', zone: getZones()[0] || 'A', capacity: 8 });
        setShowRoomModal(true);
    };

    const handleEditRoom = (room: Room, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingRoom(room);
        setRoomForm({ name: room.name, zone: room.zone, capacity: room.capacity });
        setShowRoomModal(true);
    };

    const handleSaveRoom = async () => {
        if (!roomForm.name.trim() || !roomForm.zone.trim()) {
            alert('Vui lòng điền đầy đủ thông tin');
            return;
        }

        try {
            if (editingRoom) {
                const res = await dataService.updateRoom(editingRoom.id, roomForm);
                if (res.success) {
                    setRooms(rooms.map(r => r.id === editingRoom.id ? { ...r, ...roomForm } : r));
                    setShowRoomModal(false);
                } else {
                    alert('Lỗi: ' + res.error);
                }
            } else {
                const res = await dataService.createRoom(roomForm);
                if (res.success && res.data) {
                    setRooms([...rooms, res.data]);
                    setShowRoomModal(false);
                } else {
                    alert('Lỗi: ' + res.error);
                }
            }
        } catch (err) {
            alert('Có lỗi xảy ra');
        }
    };

    const handleDeleteRoom = async (room: Room) => {
        try {
            const res = await dataService.deleteRoom(room.id);
            if (res.success) {
                setRooms(rooms.filter(r => r.id !== room.id));
                // Update students that were in this room
                setStudents(students.map(s => s.room_id === room.id ? { ...s, room_id: undefined } : s));
                setDeleteConfirm(null);
                if (selectedRoom?.id === room.id) setSelectedRoom(null);
            } else {
                alert('Lỗi: ' + res.error);
            }
        } catch (err) {
            alert('Có lỗi xảy ra');
        }
    };

    // Student assignment handlers
    const handleOpenAssignModal = (room: Room) => {
        setAssigningRoom(room);
        setStudentSearch('');
        setShowAssignModal(true);
    };

    // Filtered students for assignment modal - Allows searching ALL students
    const filteredStudentsForAssign = students.filter(s =>
        (s.full_name.toLowerCase().includes(studentSearch.toLowerCase()) ||
            (s.student_code || '').toLowerCase().includes(studentSearch.toLowerCase()) ||
            (s.organization || '').toLowerCase().includes(studentSearch.toLowerCase())) &&
        // Exclude students already in THIS room
        s.room_id !== assigningRoom?.id
    );

    const handleAssignStudent = async (student: User) => {
        if (!assigningRoom) return;

        // If student already has a room, ask for confirmation to move
        if (student.room_id) {
            const currentRoom = rooms.find(r => r.id === student.room_id);
            const confirmMove = window.confirm(
                `Học sinh ${student.full_name} đang ở phòng ${currentRoom?.name || 'khác'}. Bạn có muốn chuyển sang phòng ${assigningRoom.name}?`
            );
            if (!confirmMove) return;
        }

        try {
            const res = await dataService.updateUser(student.id, { room_id: assigningRoom.id });
            if (res.success) {
                setStudents(students.map(s => s.id === student.id ? { ...s, room_id: assigningRoom.id } : s));
            } else {
                alert('Lỗi: ' + res.error);
            }
        } catch (err) {
            alert('Có lỗi xảy ra');
        }
    };

    const handleRemoveStudent = async (student: User) => {
        try {
            const res = await dataService.updateUser(student.id, { room_id: null });
            if (res.success) {
                setStudents(students.map(s => s.id === student.id ? { ...s, room_id: undefined } : s));
            } else {
                alert('Lỗi: ' + res.error);
            }
        } catch (err) {
            alert('Có lỗi xảy ra');
        }
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
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h2 className="text-2xl font-black text-slate-900">Quản lý Phòng Nội trú</h2>
                    <p className="text-slate-500 font-medium mt-1">Thêm, sửa, xóa phòng và gán học sinh</p>
                </div>
                {canEdit && (
                    <button
                        onClick={handleAddRoom}
                        className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg"
                    >
                        <Plus className="w-5 h-5" />
                        Thêm Phòng
                    </button>
                )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                            <Home className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-black text-slate-900">{rooms.length}</p>
                            <p className="text-slate-500 text-sm">Tổng phòng</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                            <UsersIcon className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-black text-slate-900">{students.filter(s => s.room_id).length}</p>
                            <p className="text-slate-500 text-sm">Đã có phòng</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                            <UserMinus className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-black text-slate-900">{getUnassignedStudents().length}</p>
                            <p className="text-slate-500 text-sm">Chưa có phòng</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                            <Building className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-black text-slate-900">{getZones().length}</p>
                            <p className="text-slate-500 text-sm">Số khu</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Zone Filter */}
            <div className="flex gap-2 flex-wrap bg-white rounded-2xl p-1.5 shadow-sm border border-slate-100 w-fit items-center">
                <button
                    onClick={() => setSelectedZone('all')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${selectedZone === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    Tất cả
                </button>
                {getZones().map(zone => {
                    const zoneRoomCount = rooms.filter(r => r.zone === zone).length;

                    return (
                        <div key={zone} className="relative group flex items-center">
                            <button
                                onClick={() => setSelectedZone(zone)}
                                className={`pl-4 pr-8 py-2 rounded-xl text-sm font-bold transition-all ${selectedZone === zone ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                Khu {zone} <span className="text-xs opacity-70">({zoneRoomCount})</span>
                            </button>
                            {canEdit && (
                                <button
                                    onClick={(e) => openZoneEditModal(e, zone)}
                                    className={`absolute right-1 p-1 rounded-lg hover:bg-white/20 transition-colors ${selectedZone === zone ? 'text-white' : 'text-slate-400 group-hover:text-indigo-600'}`}
                                    title="Sửa tên khu"
                                >
                                    <Edit className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Rooms Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {getFilteredRooms().length === 0 ? (
                    <div className="col-span-full bg-white rounded-2xl p-12 text-center border border-slate-100">
                        <Home className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                        <p className="text-slate-500">Chưa có phòng nào</p>
                        <button onClick={handleAddRoom} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm">
                            + Thêm Phòng Đầu Tiên
                        </button>
                    </div>
                ) : (
                    getFilteredRooms().map(room => {
                        const occupancy = getRoomOccupancy(room.id);
                        const capacity = room.capacity || 8;
                        const occupancyRate = Math.round((occupancy / capacity) * 100);

                        return (
                            <div
                                key={room.id}
                                onClick={() => setSelectedRoom(room)}
                                className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer group"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                                        <span className="text-lg font-black text-indigo-600">{room.name}</span>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {canEdit && (
                                            <>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleOpenAssignModal(room); }}
                                                    className="p-1.5 hover:bg-emerald-50 rounded-lg text-slate-400 hover:text-emerald-600"
                                                    title="Thêm học sinh"
                                                >
                                                    <UserPlus className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={(e) => handleEditRoom(room, e)}
                                                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600"
                                                    title="Sửa phòng"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                            </>
                                        )}
                                        {canDelete && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(room); }}
                                                className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600"
                                                title="Xóa phòng"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                        <Building className="w-4 h-4" /> Khu {room.zone}
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-500 flex items-center gap-2">
                                            <UsersIcon className="w-4 h-4" /> {occupancy}/{capacity}
                                        </span>
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${occupancyRate >= 100 ? 'bg-red-100 text-red-600' :
                                            occupancyRate >= 75 ? 'bg-amber-100 text-amber-600' :
                                                'bg-emerald-100 text-emerald-600'
                                            }`}>
                                            {occupancyRate}%
                                        </span>
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
                    })
                )}
            </div>

            {/* Room Detail Modal with Student Management */}
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
                            <div className="flex gap-2">
                                {canEdit && (
                                    <button
                                        onClick={() => handleOpenAssignModal(selectedRoom)}
                                        className="px-3 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center gap-1 hover:bg-emerald-700"
                                    >
                                        <UserPlus className="w-4 h-4" />
                                        Thêm HS
                                    </button>
                                )}
                                <button
                                    onClick={() => setSelectedRoom(null)}
                                    className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center"
                                >
                                    <X className="w-6 h-6 text-slate-500" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="font-bold text-slate-900">Danh sách học sinh ({getRoomStudents(selectedRoom.id).length}/{selectedRoom.capacity})</h4>

                            {getRoomStudents(selectedRoom.id).length === 0 ? (
                                <div className="text-center py-8 text-slate-400 flex flex-col items-center">
                                    <Icons.Bed className="w-12 h-12 mb-2 opacity-50" />
                                    <p className="mt-2">Chưa có học sinh trong phòng này</p>
                                    <button
                                        onClick={() => handleOpenAssignModal(selectedRoom)}
                                        className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm"
                                    >
                                        + Thêm học sinh
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {getRoomStudents(selectedRoom.id).map(student => (
                                        <div key={student.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl group">
                                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold">
                                                {student.full_name.charAt(0)}
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-bold text-slate-900">{student.full_name}</p>
                                                <p className="text-sm text-slate-500">{student.organization || student.student_code}</p>
                                            </div>
                                            {canEdit && (
                                                <button
                                                    onClick={() => handleRemoveStudent(student)}
                                                    className="p-2 hover:bg-red-100 rounded-lg text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title="Xóa khỏi phòng"
                                                >
                                                    <UserMinus className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Room Modal */}
            {showRoomModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-900">
                                {editingRoom ? 'Sửa Phòng' : 'Thêm Phòng Mới'}
                            </h3>
                            <button
                                onClick={() => setShowRoomModal(false)}
                                className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center"
                            >
                                <X className="w-6 h-6 text-slate-500" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Tên phòng</label>
                                <input
                                    type="text"
                                    value={roomForm.name}
                                    onChange={e => setRoomForm({ ...roomForm, name: e.target.value })}
                                    placeholder="VD: 101, 102, A01..."
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Khu</label>
                                <input
                                    type="text"
                                    value={roomForm.zone}
                                    onChange={e => setRoomForm({ ...roomForm, zone: e.target.value.toUpperCase() })}
                                    placeholder="VD: A, B, C, Nam, Nữ..."
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                {getZones().length > 0 && (
                                    <div className="mt-2 flex gap-2 flex-wrap">
                                        <span className="text-xs text-slate-500">Khu có sẵn:</span>
                                        {getZones().map(z => (
                                            <button
                                                key={z}
                                                type="button"
                                                onClick={() => setRoomForm({ ...roomForm, zone: z })}
                                                className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded font-medium hover:bg-indigo-100 hover:text-indigo-600"
                                            >
                                                {z}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Sức chứa</label>
                                <input
                                    type="number"
                                    value={roomForm.capacity}
                                    onChange={e => setRoomForm({ ...roomForm, capacity: parseInt(e.target.value) || 0 })}
                                    min={1}
                                    max={50}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <button
                                onClick={handleSaveRoom}
                                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors"
                            >
                                <Save className="w-5 h-5" />
                                {editingRoom ? 'Cập Nhật' : 'Thêm Phòng'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Assign Student Modal */}
            {showAssignModal && assigningRoom && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl p-6 max-w-lg w-full max-h-[80vh] overflow-auto">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-xl font-black text-slate-900">Thêm Học Sinh</h3>
                                <p className="text-slate-500 text-sm">Vào phòng {assigningRoom.name} - Khu {assigningRoom.zone}</p>
                            </div>
                            <button
                                onClick={() => setShowAssignModal(false)}
                                className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center"
                            >
                                <X className="w-6 h-6 text-slate-500" />
                            </button>
                        </div>

                        {/* Search */}
                        <div className="relative mb-4">
                            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={studentSearch}
                                onChange={e => setStudentSearch(e.target.value)}
                                placeholder="Tìm theo tên, mã HS, lớp..."
                                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        {/* Unassigned students list */}
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                            {filteredStudentsForAssign.length === 0 ? (
                                <div className="text-center py-8 text-slate-400">
                                    <UsersIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                    <p>{getUnassignedStudents().length === 0 ? 'Tất cả học sinh đã có phòng' : 'Không tìm thấy học sinh'}</p>
                                </div>
                            ) : (
                                filteredStudentsForAssign.map(student => {
                                    const currentRoom = rooms.find(r => r.id === student.room_id);

                                    return (
                                        <div
                                            key={student.id}
                                            className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 cursor-pointer transition-colors"
                                            onClick={() => handleAssignStudent(student)}
                                        >
                                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold">
                                                {student.full_name.charAt(0)}
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-bold text-slate-900">{student.full_name}</p>
                                                <p className="text-sm text-slate-500">
                                                    {student.organization || student.student_code}
                                                    {currentRoom ? <span className="text-amber-600 font-medium"> • Đang ở P.{currentRoom.name}</span> : <span className="text-emerald-600 font-medium"> • Chưa có phòng</span>}
                                                </p>
                                            </div>
                                            <div className={`px-3 py-1 rounded-lg text-sm font-bold ${currentRoom ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                {currentRoom ? 'Chuyển' : '+ Thêm'}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Zone Edit Modal */}
            {showZoneEditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scale-in">
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <Edit className="w-5 h-5 text-indigo-600" />
                            Cập nhật Khu vực
                        </h3>

                        <div className="mb-4">
                            <label className="block text-sm font-bold text-slate-700 mb-2">Tên khu vực mới</label>
                            <input
                                autoFocus
                                value={newZoneName}
                                onChange={(e) => setNewZoneName(e.target.value)}
                                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium"
                                placeholder="Nhập tên khu vực..."
                            />
                        </div>

                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-6 text-sm text-slate-500">
                            <p className="flex gap-2">
                                <span className="font-bold">⚠️ Lưu ý:</span>
                                2 hành động này sẽ áp dụng cho tất cả các phòng thuộc khu <strong>{editingZoneName}</strong>.
                            </p>
                            <ul className="list-disc pl-8 mt-2 space-y-1">
                                <li>Đổi tên sẽ cập nhật hàng loạt.</li>
                                <li>Khu vực sẽ <strong>tự động biến mất</strong> nếu bạn xóa hết phòng trong đó.</li>
                            </ul>
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowZoneEditModal(false)}
                                className="px-4 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleUpdateZoneName}
                                className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                            >
                                Lưu thay đổi
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Trash2 className="w-8 h-8 text-red-600" />
                        </div>
                        <h3 className="text-xl font-black text-slate-900 mb-2">Xóa Phòng {deleteConfirm.name}?</h3>
                        <p className="text-slate-500 mb-6">
                            {getRoomOccupancy(deleteConfirm.id) > 0
                                ? `Có ${getRoomOccupancy(deleteConfirm.id)} học sinh sẽ bị bỏ phòng.`
                                : 'Hành động này không thể hoàn tác.'
                            }
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={() => handleDeleteRoom(deleteConfirm)}
                                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700"
                            >
                                Xóa
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RoomManagement;
