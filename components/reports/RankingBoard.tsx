import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';
import { utils, writeFile } from 'xlsx';

interface RankingUser {
    position: number;
    user_id: string;
    user_name: string;
    class_id?: string;
    total_points: number;
    on_time_count?: number;
    late_count?: number;
    absent_count?: number;
    rank?: string;
}

interface RankingBoardProps {
    type?: 'student' | 'class';
    classId?: string;
    roomId?: string;
}

const RankingBoard: React.FC<RankingBoardProps> = ({ type = 'student', classId, roomId }) => {
    const [rankings, setRankings] = useState<RankingUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewType, setViewType] = useState<'student' | 'class'>(type);

    useEffect(() => {
        loadRankings();
    }, [viewType, classId, roomId]);

    const loadRankings = async () => {
        setIsLoading(true);
        try {
            const result = await dataService.getRanking({
                role: 'student',
                limit: 50
            });

            if (result.success && result.data) {
                setRankings(result.data as any[]);
            }
        } catch (error) {
            console.error('Failed to load rankings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExport = () => {
        const wb = utils.book_new();
        const dataToExport = rankings.map(r => ({
            'Hạng': r.position,
            'Họ và tên': r.user_name,
            'Lớp': r.class_id || 'N/A',
            'Đúng giờ': r.on_time_count || 0,
            'Muộn': r.late_count || 0,
            'Vắng': r.absent_count || 0,
            'Tổng điểm': r.total_points,
            'Xếp loại': r.rank || 'N/A'
        }));
        const ws = utils.json_to_sheet(dataToExport);
        utils.book_append_sheet(wb, ws, "BangXepHangNeNep");
        writeFile(wb, "BangXepHangNeNep.xlsx");
    };

    const MedalIcons = {
        gold: (
            <svg className="w-8 h-8 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="currentColor" />
                <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">1</text>
            </svg>
        ),
        silver: (
            <svg className="w-7 h-7 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="currentColor" />
                <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">2</text>
            </svg>
        ),
        bronze: (
            <svg className="w-7 h-7 text-amber-600" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="currentColor" />
                <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">3</text>
            </svg>
        )
    };

    const getMedalEmoji = (position: number): React.ReactNode => {
        if (position === 1) return MedalIcons.gold;
        if (position === 2) return MedalIcons.silver;
        if (position === 3) return MedalIcons.bronze;
        return <span className="text-slate-400 text-sm font-bold">#{position}</span>;
    };

    const getRankColor = (rank?: string): string => {
        switch (rank) {
            case 'Tốt': return 'bg-emerald-100 text-emerald-600';
            case 'Khá': return 'bg-blue-100 text-blue-600';
            case 'Trung bình': return 'bg-amber-100 text-amber-600';
            case 'Yếu': return 'bg-red-100 text-red-600';
            default: return 'bg-slate-100 text-slate-600';
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
                    <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
                        </svg>
                        Bảng xếp hạng Nề nếp
                    </h2>
                    <p className="text-slate-500 font-medium mt-1">Xếp hạng theo điểm chuyên cần</p>
                </div>

                <div className="flex gap-2 items-center">
                    {/* View Type Toggle */}
                    <div className="flex gap-2 bg-white rounded-2xl p-1 shadow-sm border border-slate-100">
                        <button
                            onClick={() => setViewType('student')}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${viewType === 'student' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'
                                }`}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                            Cá nhân
                        </button>
                        <button
                            onClick={() => setViewType('class')}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${viewType === 'class' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'
                                }`}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
                            Theo lớp
                        </button>
                    </div>

                    <button
                        onClick={handleExport}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 flex items-center gap-2 shadow-lg shadow-emerald-200"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Xuất Excel
                    </button>
                </div>
            </div>

            {/* Top 3 Podium */}
            {rankings.length >= 3 && (
                <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-3xl p-6 text-white">
                    <h3 className="text-center font-bold text-white/80 mb-6">TOP 3</h3>
                    <div className="flex justify-center items-end gap-4">
                        {/* 2nd Place */}
                        <div className="text-center">
                            <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mb-3 mx-auto backdrop-blur-sm">
                                <div className="w-12 h-12 rounded-full bg-slate-300 flex items-center justify-center text-white font-black text-xl">2</div>
                            </div>
                            <p className="font-bold text-sm truncate max-w-[100px]">{rankings[1]?.user_name}</p>
                            <p className="text-white/60 text-xs">{rankings[1]?.total_points} điểm</p>
                        </div>

                        {/* 1st Place */}
                        <div className="text-center -mt-4">
                            <div className="w-24 h-24 bg-yellow-400/30 rounded-2xl flex items-center justify-center mb-3 mx-auto backdrop-blur-sm ring-4 ring-yellow-400/50">
                                <div className="w-16 h-16 rounded-full bg-yellow-400 flex items-center justify-center text-white font-black text-2xl">1</div>
                            </div>
                            <p className="font-black text-lg truncate max-w-[120px]">{rankings[0]?.user_name}</p>
                            <p className="text-yellow-300 font-bold">{rankings[0]?.total_points} điểm</p>
                        </div>

                        {/* 3rd Place */}
                        <div className="text-center">
                            <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mb-3 mx-auto backdrop-blur-sm">
                                <div className="w-12 h-12 rounded-full bg-amber-600 flex items-center justify-center text-white font-black text-xl">3</div>
                            </div>
                            <p className="font-bold text-sm truncate max-w-[100px]">{rankings[2]?.user_name}</p>
                            <p className="text-white/60 text-xs">{rankings[2]?.total_points} điểm</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Full Ranking Table */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50 text-left">
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Hạng</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Tên</th>
                                {viewType === 'student' && (
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Lớp</th>
                                )}
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-center">Đúng giờ</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-center">Muộn</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-center">Vắng</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Điểm</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Xếp loại</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rankings.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                                        <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                                        </svg>
                                        <p>Chưa có dữ liệu xếp hạng</p>
                                    </td>
                                </tr>
                            ) : (
                                rankings.map((user, index) => (
                                    <tr key={index} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <span className={`text-xl ${user.position <= 3 ? '' : 'text-slate-400 text-sm'}`}>
                                                {getMedalEmoji(user.position)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                                                </div>
                                                <span className="font-bold text-slate-900">{user.user_name}</span>
                                            </div>
                                        </td>
                                        {viewType === 'student' && (
                                            <td className="px-6 py-4 text-slate-500">{user.class_id || '—'}</td>
                                        )}
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-emerald-600 font-bold">{user.on_time_count || 0}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-amber-600 font-bold">{user.late_count || 0}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-red-600 font-bold">{user.absent_count || 0}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-xl font-black text-slate-900">{user.total_points}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getRankColor(user.rank)}`}>
                                                {user.rank || '—'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default RankingBoard;
