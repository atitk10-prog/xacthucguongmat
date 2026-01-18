/**
 * EduCheck Data Service v3.0 - Supabase Edition
 * Fast, reliable database operations using PostgreSQL
 */

import { User, Event, EventCheckin } from '../types';
import { supabase, isSupabaseConfigured } from './supabaseClient';

// =====================================================
// CACHING SYSTEM (kept for offline support)
// =====================================================
interface CacheItem<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

const cache = new Map<string, CacheItem<unknown>>();

const CACHE_TTL = {
    users: 5 * 60 * 1000,
    events: 2 * 60 * 1000,
    participants: 2 * 60 * 1000,
    dashboard: 1 * 60 * 1000
};

function getFromCache<T>(key: string): T | null {
    const item = cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > item.ttl) {
        cache.delete(key);
        return null;
    }
    return item.data as T;
}

function setCache<T>(key: string, data: T, ttl: number): void {
    cache.set(key, { data, timestamp: Date.now(), ttl });
}

function clearCache(prefix?: string): void {
    if (prefix) {
        for (const key of cache.keys()) {
            if (key.startsWith(prefix)) cache.delete(key);
        }
    } else {
        cache.clear();
    }
}

// =====================================================
// API RESPONSE TYPES
// =====================================================
interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

// =====================================================
// TOKEN MANAGEMENT
// =====================================================
function getToken(): string | null {
    return localStorage.getItem('educheck_token');
}

function setToken(token: string): void {
    localStorage.setItem('educheck_token', token);
}

function removeToken(): void {
    localStorage.removeItem('educheck_token');
    localStorage.removeItem('educheck_user');
}

function storeUser(user: User): void {
    localStorage.setItem('educheck_user', JSON.stringify(user));
}

function getStoredUser(): User | null {
    const stored = localStorage.getItem('educheck_user');
    return stored ? JSON.parse(stored) : null;
}

function isAuthenticated(): boolean {
    return !!getToken() && !!getStoredUser();
}

function logout(): void {
    removeToken();
    clearCache();
}

// =====================================================
// AUTH API
// =====================================================
async function login(email: string, password: string): Promise<ApiResponse<{ user: User; token: string }>> {
    if (!isSupabaseConfigured()) {
        return { success: false, error: 'Supabase chưa được cấu hình' };
    }

    try {
        // Simple password-based auth (no Supabase Auth, just table lookup)
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !data) {
            return { success: false, error: 'Email không tồn tại' };
        }

        // Simple password check (in production, use proper hashing)
        if (data.password_hash !== password) {
            return { success: false, error: 'Mật khẩu không đúng' };
        }

        const token = `token_${data.id}_${Date.now()}`;
        const user = data as User;

        setToken(token);
        storeUser(user);

        return { success: true, data: { user, token } };
    } catch (err) {
        return { success: false, error: 'Lỗi kết nối' };
    }
}

async function register(userData: {
    email: string;
    password: string;
    full_name: string;
    role?: string;
}): Promise<ApiResponse<User>> {
    if (!isSupabaseConfigured()) {
        return { success: false, error: 'Supabase chưa được cấu hình' };
    }

    try {
        const { data, error } = await supabase
            .from('users')
            .insert({
                email: userData.email,
                password_hash: userData.password,
                full_name: userData.full_name,
                role: userData.role || 'user'
            })
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, data: data as User, message: 'Đăng ký thành công!' };
    } catch (err) {
        return { success: false, error: 'Lỗi đăng ký' };
    }
}

async function getMe(): Promise<ApiResponse<User>> {
    const user = getStoredUser();
    if (user) {
        return { success: true, data: user };
    }
    return { success: false, error: 'Chưa đăng nhập' };
}

// =====================================================
// USERS API
// =====================================================
async function getUsers(filters?: { role?: string; status?: string }): Promise<ApiResponse<User[]>> {
    try {
        // Select only necessary fields for faster loading
        let query = supabase.from('users').select('id, full_name, email, role, avatar_url, status, created_at');

        if (filters?.role) {
            query = query.eq('role', filters.role);
        }
        if (filters?.status) {
            query = query.eq('status', filters.status);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) return { success: false, error: error.message };
        return { success: true, data: data as User[] };
    } catch (err) {
        return { success: false, error: 'Lỗi tải danh sách người dùng' };
    }
}

async function getUser(id: string): Promise<ApiResponse<User>> {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', id)
            .single();

        if (error) return { success: false, error: error.message };
        return { success: true, data: data as User };
    } catch (err) {
        return { success: false, error: 'Lỗi tải thông tin người dùng' };
    }
}

async function createUser(userData: Partial<User> & { password?: string }): Promise<ApiResponse<User>> {
    try {
        const { data, error } = await supabase
            .from('users')
            .insert({
                ...userData,
                password_hash: userData.password
            })
            .select()
            .single();

        if (error) return { success: false, error: error.message };
        clearCache('users');
        return { success: true, data: data as User, message: 'Tạo người dùng thành công!' };
    } catch (err) {
        return { success: false, error: 'Lỗi tạo người dùng' };
    }
}

async function updateUser(id: string, userData: Partial<User>): Promise<ApiResponse<User>> {
    try {
        const { data, error } = await supabase
            .from('users')
            .update({ ...userData, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) return { success: false, error: error.message };
        clearCache('users');
        return { success: true, data: data as User, message: 'Cập nhật thành công!' };
    } catch (err) {
        return { success: false, error: 'Lỗi cập nhật người dùng' };
    }
}

async function deleteUser(id: string): Promise<ApiResponse<void>> {
    try {
        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) return { success: false, error: error.message };
        clearCache('users');
        return { success: true, message: 'Đã xóa người dùng' };
    } catch (err) {
        return { success: false, error: 'Lỗi xóa người dùng' };
    }
}

// =====================================================
// EVENTS API
// =====================================================
async function getEvents(filters?: { status?: string }): Promise<ApiResponse<Event[]>> {
    try {
        const cached = getFromCache<Event[]>('events');
        if (cached) return { success: true, data: cached };

        let query = supabase.from('events').select('*');

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) return { success: false, error: error.message };

        setCache('events', data, CACHE_TTL.events);
        return { success: true, data: data as Event[] };
    } catch (err) {
        return { success: false, error: 'Lỗi tải danh sách sự kiện' };
    }
}

async function getEvent(id: string): Promise<ApiResponse<Event>> {
    try {
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .eq('id', id)
            .single();

        if (error) return { success: false, error: error.message };
        return { success: true, data: data as Event };
    } catch (err) {
        return { success: false, error: 'Lỗi tải thông tin sự kiện' };
    }
}

async function createEvent(eventData: Partial<Event>): Promise<ApiResponse<Event>> {
    try {
        // Remove participants field as it's managed in event_participants table
        const { participants, ...dataToInsert } = eventData as Partial<Event> & { participants?: string[] };

        const { data, error } = await supabase
            .from('events')
            .insert(dataToInsert)
            .select()
            .single();

        if (error) return { success: false, error: error.message };
        clearCache('events');
        return { success: true, data: data as Event, message: 'Tạo sự kiện thành công!' };
    } catch (err) {
        return { success: false, error: 'Lỗi tạo sự kiện' };
    }
}

async function updateEvent(id: string, eventData: Partial<Event>): Promise<ApiResponse<Event>> {
    try {
        // Remove participants field as it's managed in event_participants table
        const { participants, ...dataToUpdate } = eventData as Partial<Event> & { participants?: string[] };

        const { data, error } = await supabase
            .from('events')
            .update(dataToUpdate)
            .eq('id', id)
            .select()
            .single();

        if (error) return { success: false, error: error.message };
        clearCache('events');
        return { success: true, data: data as Event, message: 'Cập nhật sự kiện thành công!' };
    } catch (err) {
        return { success: false, error: 'Lỗi cập nhật sự kiện' };
    }
}

async function deleteEvent(id: string): Promise<ApiResponse<void>> {
    try {
        const { error } = await supabase.from('events').delete().eq('id', id);
        if (error) return { success: false, error: error.message };
        clearCache('events');
        return { success: true, message: 'Đã xóa sự kiện' };
    } catch (err) {
        return { success: false, error: 'Lỗi xóa sự kiện' };
    }
}

// =====================================================
// CHECK-IN API
// =====================================================
async function checkin(data: {
    event_id: string;
    user_id: string;
    face_confidence?: number;
    face_verified?: boolean;
}): Promise<ApiResponse<{ checkin: EventCheckin; event: Event }>> {
    try {
        // Get event first
        const { data: event, error: eventError } = await supabase
            .from('events')
            .select('*')
            .eq('id', data.event_id)
            .single();

        if (eventError || !event) {
            return { success: false, error: 'Sự kiện không tồn tại' };
        }

        // Check if already checked in
        const { data: existingCheckin } = await supabase
            .from('checkins')
            .select('id')
            .eq('event_id', data.event_id)
            .eq('participant_id', data.user_id)
            .single();

        if (existingCheckin) {
            return { success: false, error: 'Bạn đã check-in sự kiện này rồi' };
        }

        // Calculate status
        const checkinTime = new Date();
        const eventStartTime = new Date(event.start_time);
        const lateThreshold = event.late_threshold_mins || 15;
        const diffMinutes = (checkinTime.getTime() - eventStartTime.getTime()) / (1000 * 60);

        const status = diffMinutes > lateThreshold ? 'late' : 'on_time';
        const points = status === 'on_time'
            ? (event.points_on_time || 10)
            : (event.points_late || -5);

        // Create checkin
        const { data: newCheckin, error: checkinError } = await supabase
            .from('checkins')
            .insert({
                event_id: data.event_id,
                participant_id: data.user_id,
                checkin_time: checkinTime.toISOString(),
                status,
                face_confidence: data.face_confidence || 0,
                face_verified: data.face_verified || false,
                points_earned: points
            })
            .select()
            .single();

        if (checkinError) {
            return { success: false, error: checkinError.message };
        }

        return {
            success: true,
            data: { checkin: newCheckin as EventCheckin, event: event as Event },
            message: status === 'on_time'
                ? `Check-in đúng giờ! +${points} điểm`
                : `Check-in muộn. ${points} điểm`
        };
    } catch (err) {
        return { success: false, error: 'Lỗi check-in' };
    }
}

async function getEventCheckins(eventId: string): Promise<ApiResponse<EventCheckin[]>> {
    try {
        const { data, error } = await supabase
            .from('checkins')
            .select('*')
            .eq('event_id', eventId)
            .order('checkin_time', { ascending: false });

        if (error) return { success: false, error: error.message };
        return { success: true, data: data as EventCheckin[] };
    } catch (err) {
        return { success: false, error: 'Lỗi tải danh sách check-in' };
    }
}

// =====================================================
// EVENT PARTICIPANTS API
// =====================================================
interface EventParticipant {
    id: string;
    event_id: string;
    full_name: string;
    avatar_url?: string;
    birth_date?: string;
    organization?: string;
    address?: string;
    created_at?: string;
}

async function getEventParticipants(eventId: string): Promise<ApiResponse<EventParticipant[]>> {
    try {
        const { data, error } = await supabase
            .from('event_participants')
            .select('id, event_id, full_name, avatar_url, birth_date, organization') // Select only necessary columns
            .eq('event_id', eventId)
            .order('full_name', { ascending: true });

        if (error) return { success: false, error: error.message };
        return { success: true, data: data as EventParticipant[] };
    } catch (err) {
        return { success: false, error: 'Lỗi tải danh sách người tham gia' };
    }
}

async function saveEventParticipants(
    eventId: string,
    participants: Partial<EventParticipant>[]
): Promise<ApiResponse<EventParticipant[]>> {
    try {
        // Separate new and existing participants
        const newParticipants = participants.filter(p => !p.id || p.id.startsWith('new_') || p.id.startsWith('import_'));
        const existingParticipants = participants.filter(p => p.id && !p.id.startsWith('new_') && !p.id.startsWith('import_'));

        const savedParticipants: EventParticipant[] = [];

        // Batch insert new participants (much faster!)
        if (newParticipants.length > 0) {
            const insertData = newParticipants.map(p => ({
                event_id: eventId,
                full_name: p.full_name,
                avatar_url: p.avatar_url || null,
                birth_date: p.birth_date || null,
                organization: p.organization || null,
                address: p.address || null
            }));

            const { data, error } = await supabase
                .from('event_participants')
                .insert(insertData)
                .select();

            if (!error && data) {
                savedParticipants.push(...(data as EventParticipant[]));
            }
        }

        // Update existing participants in parallel
        if (existingParticipants.length > 0) {
            const updatePromises = existingParticipants.map(p =>
                supabase
                    .from('event_participants')
                    .update({
                        full_name: p.full_name,
                        avatar_url: p.avatar_url,
                        birth_date: p.birth_date,
                        organization: p.organization,
                        address: p.address
                    })
                    .eq('id', p.id)
                    .select()
                    .single()
            );

            const results = await Promise.all(updatePromises);
            results.forEach(r => {
                if (!r.error && r.data) {
                    savedParticipants.push(r.data as EventParticipant);
                }
            });
        }

        clearCache('participants');
        return {
            success: true,
            data: savedParticipants,
            message: `Đã lưu ${savedParticipants.length} người tham gia`
        };
    } catch (err) {
        return { success: false, error: 'Lỗi lưu người tham gia' };
    }
}

async function deleteEventParticipant(id: string): Promise<ApiResponse<void>> {
    try {
        const { error } = await supabase
            .from('event_participants')
            .delete()
            .eq('id', id);

        if (error) return { success: false, error: error.message };
        clearCache('participants');
        return { success: true, message: 'Đã xóa người tham gia' };
    } catch (err) {
        return { success: false, error: 'Lỗi xóa người tham gia' };
    }
}

// =====================================================
// ROOMS API
// =====================================================
interface Room {
    id: string;
    name: string;
    zone: string;
    capacity: number;
    manager_id?: string;
}

async function getRooms(): Promise<ApiResponse<Room[]>> {
    try {
        const { data, error } = await supabase
            .from('rooms')
            .select('*')
            .order('name', { ascending: true });

        if (error) return { success: false, error: error.message };
        return { success: true, data: data as Room[] };
    } catch (err) {
        return { success: false, error: 'Lỗi tải danh sách phòng' };
    }
}

// =====================================================
// BOARDING CHECK-IN API
// =====================================================
interface BoardingCheckinRecord {
    id: string;
    user_id: string;
    date: string;
    morning_in?: string;
    morning_out?: string;
    evening_in?: string;
    evening_out?: string;
    exit_permission: boolean;
    notes?: string;
}

type CheckinType = 'morning_in' | 'morning_out' | 'evening_in' | 'evening_out';

async function boardingCheckin(
    userId: string,
    checkinType: CheckinType
): Promise<ApiResponse<BoardingCheckinRecord>> {
    try {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toISOString();

        // Check if record exists for today
        const { data: existingRecord, error: fetchError } = await supabase
            .from('boarding_checkins')
            .select('*')
            .eq('user_id', userId)
            .eq('date', today)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            return { success: false, error: fetchError.message };
        }

        if (existingRecord) {
            // Update existing record
            const updateData: Record<string, string> = {};
            updateData[checkinType] = now;

            const { data, error } = await supabase
                .from('boarding_checkins')
                .update(updateData)
                .eq('id', existingRecord.id)
                .select()
                .single();

            if (error) return { success: false, error: error.message };
            return { success: true, data: data as BoardingCheckinRecord };
        } else {
            // Create new record
            const insertData: Record<string, string | boolean> = {
                user_id: userId,
                date: today,
                exit_permission: false
            };
            insertData[checkinType] = now;

            const { data, error } = await supabase
                .from('boarding_checkins')
                .insert(insertData)
                .select()
                .single();

            if (error) return { success: false, error: error.message };
            return { success: true, data: data as BoardingCheckinRecord };
        }
    } catch (err) {
        return { success: false, error: 'Lỗi check-in nội trú' };
    }
}

// =====================================================
// DASHBOARD API
// =====================================================
async function getDashboardStats(): Promise<ApiResponse<{
    totalEvents: number;
    totalCheckins: number;
    totalUsers: number;
    todayCheckins: number;
}>> {
    try {
        const today = new Date().toISOString().split('T')[0];

        const [eventsRes, checkinsRes, usersRes, todayCheckinsRes] = await Promise.all([
            supabase.from('events').select('id', { count: 'exact', head: true }),
            supabase.from('checkins').select('id', { count: 'exact', head: true }),
            supabase.from('users').select('id', { count: 'exact', head: true }),
            supabase.from('checkins').select('id', { count: 'exact', head: true })
                .gte('checkin_time', today)
        ]);

        return {
            success: true,
            data: {
                totalEvents: eventsRes.count || 0,
                totalCheckins: checkinsRes.count || 0,
                totalUsers: usersRes.count || 0,
                todayCheckins: todayCheckinsRes.count || 0
            }
        };
    } catch (err) {
        return { success: false, error: 'Lỗi tải thống kê' };
    }
}

// =====================================================
// SYSTEM CONFIG API
// =====================================================
interface SystemConfig {
    key: string;
    value: string;
}

async function getConfigs(): Promise<ApiResponse<SystemConfig[]>> {
    try {
        const { data, error } = await supabase
            .from('system_configs')
            .select('*');

        if (error) {
            // Return defaults if table doesn't exist
            return {
                success: true,
                data: [
                    { key: 'school_name', value: 'Trường THPT ABC' },
                    { key: 'school_address', value: '123 Đường XYZ' },
                    { key: 'late_threshold_mins', value: '15' },
                    { key: 'points_on_time', value: '10' },
                    { key: 'points_late', value: '-5' }
                ]
            };
        }
        return { success: true, data: data as SystemConfig[] };
    } catch (err) {
        return { success: false, error: 'Lỗi tải cấu hình' };
    }
}

async function updateConfig(key: string, value: string): Promise<ApiResponse<void>> {
    try {
        const { error } = await supabase
            .from('system_configs')
            .upsert({ key, value }, { onConflict: 'key' });

        if (error) return { success: false, error: error.message };
        return { success: true, message: 'Đã cập nhật cấu hình' };
    } catch (err) {
        return { success: false, error: 'Lỗi cập nhật cấu hình' };
    }
}

async function initSystem(): Promise<ApiResponse<void>> {
    return { success: true, message: 'Hệ thống đã được khởi tạo' };
}

// =====================================================
// POINTS API
// =====================================================
interface PointLog {
    id: string;
    user_id: string;
    points: number;
    reason: string;
    created_at: string;
    user?: User;
}

async function getPointLogs(): Promise<ApiResponse<PointLog[]>> {
    try {
        const { data, error } = await supabase
            .from('point_logs')
            .select('*, user:users(id, full_name)')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            // Return empty if table doesn't exist
            return { success: true, data: [] };
        }
        return { success: true, data: data as PointLog[] };
    } catch (err) {
        return { success: false, error: 'Lỗi tải lịch sử điểm' };
    }
}

async function addPoints(userId: string, points: number, reason: string): Promise<ApiResponse<void>> {
    try {
        // Update user points
        const { error: updateError } = await supabase.rpc('add_user_points', {
            p_user_id: userId,
            p_points: points
        });

        // If RPC doesn't exist, update directly
        if (updateError) {
            await supabase
                .from('users')
                .update({ total_points: supabase.rpc('add_points_direct', { uid: userId, pts: points }) })
                .eq('id', userId);
        }

        // Log the points change
        await supabase.from('point_logs').insert({
            user_id: userId,
            points: points,
            reason: reason
        });

        return { success: true, message: `Đã cộng ${points} điểm` };
    } catch (err) {
        return { success: false, error: 'Lỗi cộng điểm' };
    }
}

async function deductPoints(userId: string, points: number, reason: string): Promise<ApiResponse<void>> {
    return addPoints(userId, -points, reason);
}

// =====================================================
// RANKING API
// =====================================================
interface RankingUser {
    id: string;
    full_name: string;
    class_id?: string;
    total_points: number;
    rank?: number;
}

async function getRanking(options?: { role?: string; limit?: number }): Promise<ApiResponse<RankingUser[]>> {
    try {
        let query = supabase
            .from('users')
            .select('id, full_name, class_id, total_points')
            .order('total_points', { ascending: false })
            .limit(options?.limit || 50);

        if (options?.role) {
            query = query.eq('role', options.role);
        }

        const { data, error } = await query;

        if (error) return { success: false, error: error.message };

        // Add rank
        const rankedData = (data || []).map((user, index) => ({
            ...user,
            rank: index + 1
        }));

        return { success: true, data: rankedData as RankingUser[] };
    } catch (err) {
        return { success: false, error: 'Lỗi tải bảng xếp hạng' };
    }
}

// =====================================================
// EVENT REPORT API
// =====================================================
interface Checkin {
    id: string;
    event_id: string;
    user_id?: string;
    participant_id?: string;
    checkin_time: string;
    status: 'on_time' | 'late' | 'absent';
    face_confidence?: number;
    face_verified?: boolean;
    points_earned?: number;
}

interface EventReport {
    event: Event;
    totalParticipants: number;
    totalCheckins: number;
    onTimeCount: number;
    lateCount: number;
    absentCount: number;
    checkins: Checkin[];
}

async function getEventReport(eventId: string): Promise<ApiResponse<EventReport>> {
    try {
        // Get event
        const { data: event, error: eventError } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (eventError) return { success: false, error: eventError.message };

        // Get participants
        const { data: participants } = await supabase
            .from('event_participants')
            .select('*')
            .eq('event_id', eventId);

        // Get checkins
        const { data: checkins } = await supabase
            .from('checkins')
            .select('*')
            .eq('event_id', eventId);

        const checkinData = checkins || [];
        const onTimeCount = checkinData.filter(c => c.status === 'on_time').length;
        const lateCount = checkinData.filter(c => c.status === 'late').length;

        return {
            success: true,
            data: {
                event: event as Event,
                totalParticipants: (participants || []).length,
                totalCheckins: checkinData.length,
                onTimeCount,
                lateCount,
                absentCount: (participants || []).length - checkinData.length,
                checkins: checkinData as Checkin[]
            }
        };
    } catch (err) {
        return { success: false, error: 'Lỗi tải báo cáo sự kiện' };
    }
}

// =====================================================
// CERTIFICATES API
// =====================================================
interface Certificate {
    id: string;
    user_id: string;
    event_id?: string;
    type: string;
    title: string;
    issued_at: string;
    user?: User;
}

async function getCertificates(): Promise<ApiResponse<Certificate[]>> {
    try {
        const { data, error } = await supabase
            .from('certificates')
            .select('*, user:users(id, full_name)')
            .order('issued_at', { ascending: false });

        if (error) {
            // Return empty if table doesn't exist
            return { success: true, data: [] };
        }
        return { success: true, data: data as Certificate[] };
    } catch (err) {
        return { success: false, error: 'Lỗi tải danh sách chứng nhận' };
    }
}

async function createCertificate(certData: Partial<Certificate>): Promise<ApiResponse<Certificate>> {
    try {
        const { data, error } = await supabase
            .from('certificates')
            .insert({
                user_id: certData.user_id,
                event_id: certData.event_id,
                type: certData.type || 'participation',
                title: certData.title || 'Chứng nhận tham gia',
                issued_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) return { success: false, error: error.message };
        return { success: true, data: data as Certificate };
    } catch (err) {
        return { success: false, error: 'Lỗi tạo chứng nhận' };
    }
}

// =====================================================
// EXPORT DATA SERVICE
// =====================================================
export const dataService = {
    // Auth
    login,
    register,
    getMe,
    logout,
    isAuthenticated,
    getToken,
    getStoredUser,

    // Users
    getUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser,

    // Events
    getEvents,
    getEvent,
    createEvent,
    updateEvent,
    deleteEvent,

    // Check-in
    checkin,
    getEventCheckins,

    // Participants
    getEventParticipants,
    saveEventParticipants,
    deleteEventParticipant,

    // Rooms
    getRooms,

    // Boarding Check-in
    boardingCheckin,

    // Dashboard
    getDashboardStats,

    // System Config
    getConfigs,
    updateConfig,
    initSystem,

    // Points
    getPointLogs,
    addPoints,
    deductPoints,

    // Ranking
    getRanking,

    // Reports
    getEventReport,

    // Certificates
    getCertificates,
    createCertificate,

    // Cache
    clearCache
};
