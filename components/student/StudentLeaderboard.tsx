import React, { useEffect, useState } from 'react';
import { Trophy, Medal, User } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { User as UserType } from '../../types';

interface StudentLeaderboardProps {
    user: UserType;
}

export default function StudentLeaderboard({ user }: StudentLeaderboardProps) {
    const [ranking, setRanking] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [myRank, setMyRank] = useState<any>(null);

    useEffect(() => {
        loadRanking();
    }, [user]);

    const loadRanking = async () => {
        setLoading(true);
        // Get limit 50, filter role usually happens in backend or here? 
        // dataService.getRanking allows role filter.
        const res = await dataService.getRanking({ role: 'student', limit: 50 });

        if (res.success && res.data) {
            setRanking(res.data);
            const me = res.data.find((r: any) => r.id === user.id);
            if (me) setMyRank(me);
        }
        setLoading(false);
    };

    const getRankIcon = (rank: number) => {
        switch (rank) {
            case 1: return <Trophy className="text-yellow-500" size={20} fill="currentColor" />;
            case 2: return <Medal className="text-gray-400" size={20} fill="currentColor" />;
            case 3: return <Medal className="text-amber-700" size={20} fill="currentColor" />;
            default: return <span className="font-bold text-gray-400 text-sm">#{rank}</span>;
        }
    };

    return (
        <div className="space-y-4 h-full flex flex-col">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">Bảng Xếp Hạng</h2>
                {myRank && (
                    <div className="bg-yellow-50 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold border border-yellow-200">
                        Hạng: #{myRank.rank}
                    </div>
                )}
            </div>

            {loading ? (
                <div className="text-center text-gray-400 py-8">Đang tải...</div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-2 p-3 bg-gray-50 text-xs font-bold text-gray-500 border-b border-gray-100 uppercase tracking-wider">
                        <div className="col-span-2 text-center">Hạng</div>
                        <div className="col-span-7">Học sinh</div>
                        <div className="col-span-3 text-right">Điểm</div>
                    </div>

                    {/* List */}
                    <div className="overflow-y-auto flex-1 max-h-[60vh]">
                        {ranking.map((row, idx) => {
                            const isMe = row.id === user.id;
                            return (
                                <div
                                    key={row.id}
                                    className={`grid grid-cols-12 gap-2 p-3 items-center border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${isMe ? 'bg-blue-50 hover:bg-blue-100' : ''}`}
                                >
                                    <div className="col-span-2 flex justify-center">
                                        {getRankIcon(row.rank)}
                                    </div>
                                    <div className="col-span-7 flex items-center gap-3">
                                        <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0 overflow-hidden">
                                            {row.avatar_url ? (
                                                <img src={row.avatar_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                    <User size={14} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`text-sm font-medium truncate ${isMe ? 'text-blue-700' : 'text-gray-800'}`}>
                                                {row.full_name} {isMe && '(Bạn)'}
                                            </p>
                                            <p className="text-xs text-gray-400 truncate">{row.organization || '---'}</p>
                                        </div>
                                    </div>
                                    <div className="col-span-3 text-right">
                                        <span className="font-bold text-sm text-gray-800">{row.total_points}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
