import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../../services/dataService';
import {
    LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, BarChart, Bar
} from 'recharts';
import { TrendingUp, TrendingDown, Award, AlertCircle, Calendar, Filter, Users, ArrowRight } from 'lucide-react';

const PointStatistics: React.FC = () => {
    const [range, setRange] = useState<'day' | 'week' | 'month'>('day');
    const [stats, setStats] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showDetail, setShowDetail] = useState(false);
    const [detailedLogs, setDetailedLogs] = useState<any[]>([]);
    const [isDetailLoading, setIsDetailLoading] = useState(false);

    useEffect(() => {
        loadStats();
    }, [range]);

    const loadStats = async () => {
        setIsLoading(true);
        try {
            const result = await dataService.getPointStatistics({ range });
            if (result.success) {
                setStats(result.data);
            }
        } catch (error) {
            console.error('Failed to load point stats:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadDetailedLogs = async () => {
        setShowDetail(true);
        setIsDetailLoading(true);
        const res = await dataService.getDetailedPointLogs({ range, limit: 100 });
        if (res.success) setDetailedLogs(res.data || []);
        setIsDetailLoading(false);
    };

    const getTypeLabel = (type: string) => {
        const labels: any = {
            boarding_late: { text: 'Trễ nội trú', icon: <Calendar className="w-3 h-3" />, color: 'text-orange-600 bg-orange-50' },
            boarding_absent: { text: 'Vắng nội trú', icon: <AlertCircle className="w-3 h-3" />, color: 'text-red-600 bg-red-50' },
            event_absence: { text: 'Vắng sự kiện', icon: <Filter className="w-3 h-3" />, color: 'text-amber-600 bg-amber-50' },
            manual_add: { text: 'Cộng thủ công', icon: <Award className="w-3 h-3" />, color: 'text-emerald-600 bg-emerald-50' },
            manual_deduct: { text: 'Trừ thủ công', icon: <TrendingDown className="w-3 h-3" />, color: 'text-rose-600 bg-rose-50' },
            checkin: { text: 'Tham gia', icon: <Users className="w-3 h-3" />, color: 'text-blue-600 bg-blue-50' }
        };
        return labels[type] || { text: type, icon: <Award className="w-3 h-3" />, color: 'text-slate-600 bg-slate-50' };
    };

    const pieData = useMemo(() => {
        if (!stats || !stats.byCategory) return [];
        return [
            { name: 'Nội trú', value: Math.abs(stats.byCategory.boarding || 0), color: '#6366f1' },
            { name: 'Sự kiện', value: Math.abs(stats.byCategory.event || 0), color: '#10b981' },
            { name: 'Thủ công', value: Math.abs(stats.byCategory.manual || 0), color: '#f59e0b' },
        ].filter(d => d.value > 0);
    }, [stats]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        <span className="bg-amber-100 p-2 rounded-xl text-amber-600">📈</span>
                        Thống kê Điểm số
                    </h2>
                    <p className="text-slate-500 font-medium mt-1 ml-14">Phân tích biến động và hành vi</p>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto">
                    {(['day', 'week', 'month'] as const).map((r) => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={`flex-1 md:flex-none px-4 py-2 rounded-lg font-bold text-sm transition-all ${range === r
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            {r === 'day' ? 'Hôm nay' : r === 'week' ? '7 ngày' : '30 ngày'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                        <TrendingUp className="w-16 h-16 text-emerald-500" />
                    </div>
                    <p className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-1">Tổng điểm cộng</p>
                    <p className="text-4xl font-black text-emerald-600">+{stats?.totalAdded || 0}</p>
                    <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-400">
                        <Award className="w-4 h-4" />
                        Tích lũy từ khen thưởng & sự kiện
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                        <TrendingDown className="w-16 h-16 text-red-500" />
                    </div>
                    <p className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-1">Tổng điểm trừ</p>
                    <p className="text-4xl font-black text-red-500">-{stats?.totalDeducted || 0}</p>
                    <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-400">
                        <AlertCircle className="w-4 h-4" />
                        Do vi phạm nội quy & vắng mặt
                    </div>
                </div>

                <div className="bg-indigo-600 p-6 rounded-3xl shadow-lg shadow-indigo-200 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-20 text-white group-hover:scale-110 transition-transform">
                        <Users className="w-16 h-16" />
                    </div>
                    <p className="text-indigo-100 font-bold text-xs uppercase tracking-wider mb-1">Cân bằng hệ thống</p>
                    <p className="text-4xl font-black text-white">
                        {(stats?.totalAdded || 0) - (stats?.totalDeducted || 0) > 0 ? '+' : ''}
                        {(stats?.totalAdded || 0) - (stats?.totalDeducted || 0)}
                    </p>
                    <div className="mt-4 flex items-center gap-2 text-xs font-bold text-indigo-200">
                        Hiệu số biến động trong giai đoạn
                    </div>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Distribution Pie Chart */}
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                        <Filter className="w-5 h-5 text-indigo-500" />
                        Cơ cấu điểm theo hạng mục
                    </h3>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={8}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                                />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Category Bar Chart */}
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                        <Award className="w-5 h-5 text-emerald-500" />
                        Chi tiết từng nhóm (Điểm thuần)
                    </h3>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={[
                                    { name: 'Nội trú', points: stats?.byCategory?.boarding || 0 },
                                    { name: 'Sự kiện', points: stats?.byCategory?.event || 0 },
                                    { name: 'Thủ công', points: stats?.byCategory?.manual || 0 }
                                ]}
                                margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: '#64748b' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                <Tooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                                <Bar dataKey="points" radius={[8, 8, 0, 0]}>
                                    {
                                        [
                                            { name: 'Nội trú', points: stats?.byCategory?.boarding || 0 },
                                            { name: 'Sự kiện', points: stats?.byCategory?.event || 0 },
                                            { name: 'Thủ công', points: stats?.byCategory?.manual || 0 }
                                        ].map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.points >= 0 ? '#10b981' : '#ef4444'} />
                                        ))
                                    }
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* AI Insights (Mockup based on data) */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-8 rounded-3xl text-white relative overflow-hidden shadow-xl">
                <div className="absolute -right-10 -bottom-10 opacity-20 scale-150 rotate-12">
                    <TrendingUp className="w-64 h-64 text-indigo-400" />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row gap-6 items-center">
                    <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/10">
                        <TrendingUp className="w-8 h-8 text-indigo-400" />
                    </div>
                    <div>
                        <h4 className="text-xl font-bold mb-2">Nhận định hệ thống (AI Insights)</h4>
                        <p className="text-slate-400 leading-relaxed max-w-2xl">
                            {stats?.totalDeducted > stats?.totalAdded
                                ? "Tỷ lệ vi phạm (điểm trừ) đang cao hơn điểm cộng khuyến khích. Cần kiểm tra lại các buổi điểm danh nội trú vì đây là nguồn trừ điểm chính."
                                : "Hệ thống đang hoạt động tích cực với lượng điểm cộng từ sự kiện vượt trội. Đây là dấu hiệu của sự tham gia nhiệt tình của học sinh."
                            }
                        </p>
                    </div>
                    <button
                        onClick={loadDetailedLogs}
                        className="md:ml-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold transition-all flex items-center gap-2 group"
                    >
                        Chi tiết báo cáo
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>

            {/* Detail Modal */}
            {showDetail && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden scale-in">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-xl font-black text-slate-800">Chi tiết biến động điểm</h3>
                                <p className="text-slate-500 text-sm font-medium">Báo cáo các giao dịch trong {range === 'day' ? 'hôm nay' : range === 'week' ? '7 ngày qua' : 'tháng này'}</p>
                            </div>
                            <button onClick={() => setShowDetail(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                                <Filter className="w-6 h-6 rotate-45 text-slate-400" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {isDetailLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-4">
                                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-slate-500 font-bold">Đang tải dữ liệu...</p>
                                </div>
                            ) : detailedLogs.length === 0 ? (
                                <div className="text-center py-20">
                                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Award className="w-10 h-10 text-slate-300" />
                                    </div>
                                    <h4 className="text-lg font-bold text-slate-800">Không có dữ liệu</h4>
                                    <p className="text-slate-500">Không tìm thấy sự thay đổi điểm nào trong khoảng thời gian này.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {detailedLogs.map((log) => {
                                        const typeInfo = getTypeLabel(log.type);
                                        return (
                                            <div key={log.id} className="group p-4 bg-white border border-slate-100 rounded-2xl hover:border-indigo-200 hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex-shrink-0 relative overflow-hidden">
                                                        {log.user?.avatar_url ? (
                                                            <img src={log.user.avatar_url} className="w-full h-full object-cover" alt="" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold uppercase">
                                                                {log.user?.full_name?.charAt(0) || 'U'}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h5 className="font-bold text-slate-900 leading-tight">{log.user?.full_name || 'Người dùng hệ thống'}</h5>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">{log.user?.organization || 'N/A'}</span>
                                                            <span className="text-[10px] text-slate-400 font-medium">{new Date(log.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} • {new Date(log.created_at).toLocaleDateString('vi-VN')}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex-1 md:px-6">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${typeInfo.color}`}>
                                                            {typeInfo.icon}
                                                            {typeInfo.text}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 line-clamp-1">{log.reason}</p>
                                                </div>

                                                <div className={`text-xl font-black md:w-20 text-right ${log.points >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    {log.points >= 0 ? `+${log.points}` : log.points}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                            <p className="text-xs text-slate-400">Hiển thị tối đa 100 giao dịch gần nhất</p>
                            <button onClick={() => setShowDetail(false)} className="px-6 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all">
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PointStatistics;
