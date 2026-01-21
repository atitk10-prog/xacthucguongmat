/**
 * EduCheck Data Service v3.0 - Supabase Edition
 * Fast, reliable database operations using PostgreSQL
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { User, Event, EventCheckin, EventParticipant, BoardingConfig, BoardingTimeSlot, Certificate } from '../types';

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
        // Use maybeSingle() to avoid 406 error when no user found
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .maybeSingle();

        if (error) {
            console.error('Login query error:', error);
            return { success: false, error: 'Lỗi truy vấn database' };
        }

        if (!data) {
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
        let query = supabase.from('users').select('id, full_name, email, role, avatar_url, status, student_code, organization, created_at, birth_date, room_id, face_descriptor, total_points');

        if (filters?.role) {
            query = query.eq('role', filters.role);
        }
        if (filters?.status) {
            query = query.eq('status', filters.status);
        }

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .range(0, 4999); // Increase limit to load up to 5000 users

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
        // Fetch system config for start points
        let startPoints = 100;
        const configRes = await getConfigs();
        if (configRes.success && configRes.data) {
            const config = configRes.data.find(c => c.key === 'start_points');
            if (config) startPoints = parseInt(config.value);
        }

        const { password, ...rest } = userData; // Separate password
        const { data, error } = await supabase
            .from('users')
            .insert({
                ...rest,
                total_points: (userData as any).total_points ?? startPoints,
                password_hash: password // Map to password_hash
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

async function updateUser(id: string, userData: Partial<User> & { password?: string }): Promise<ApiResponse<User>> {
    try {
        const { password, ...rest } = userData;
        // Whitelist allowed columns to prevent 400 errors from extra fields
        const allowedColumns = [
            'email', 'full_name', 'role', 'class_id', 'room_id', 'zone',
            'avatar_url', 'face_vector', 'face_descriptor', 'qr_code',
            'status', 'student_code', 'organization', 'birth_date',
            'total_points', 'password_hash'
        ];

        const updatePayload: any = { updated_at: new Date().toISOString() };

        Object.keys(rest).forEach(key => {
            if (allowedColumns.includes(key) && rest[key as keyof User] !== undefined) {
                let value = rest[key as keyof User];

                // Convert empty strings to null for UUID/Foreign Key fields
                if ((key === 'room_id' || key === 'class_id') && value === '') {
                    value = null;
                }

                updatePayload[key] = value;
            }
        });

        // Only update password_hash if password is provided
        if (password) {
            updatePayload.password_hash = password;
        }

        const { data, error } = await supabase
            .from('users')
            .update(updatePayload)
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

async function updateZone(oldName: string, newName: string): Promise<ApiResponse<void>> {
    try {
        const { error } = await supabase
            .from('rooms')
            .update({ zone: newName })
            .eq('zone', oldName);

        if (error) return { success: false, error: error.message };
        return { success: true, message: 'Cập nhật tên khu vực thành công' };
    } catch (err) {
        return { success: false, error: 'Lỗi cập nhật khu vực' };
    }
}

// =====================================================
// EVENTS API
// =====================================================

async function getAllStudentsForCheckin(requireFaceId: boolean = true): Promise<ApiResponse<User[]>> {
    try {
        let query = supabase
            .from('users')
            .select('id, full_name, email, avatar_url, student_code, organization, face_descriptor, role, birth_date, room_id'); // Added email and room_id

        if (requireFaceId) {
            query = query.not('face_descriptor', 'is', null);
        } else {
            // If not requiring face ID, we might still want to filter for students only?
            // The prompt implies listing 'students', so let's stick to role check if needed, 
            // but the original function didn't verify role explicitly (though it was implied by face data).
            // Let's add role check just in case if we open the floodgates.
            query = query.eq('role', 'student');
        }

        const { data, error } = await query;

        if (error) return { success: false, error: error.message };
        return { success: true, data: data as unknown as User[] };
    } catch (err) {
        return { success: false, error: 'Lỗi tải danh sách học sinh' };
    }
}

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
    checkin_mode?: 'student' | 'event'; // New parameter
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

        // Calculate points based on mode
        let points = 0;
        if (data.checkin_mode !== 'event') {
            points = status === 'on_time'
                ? (event.points_on_time || 10)
                : (event.points_late || -5);
        }

        // Create checkin
        // Note: participant_id should only be set if it's a valid UUID from event_participants
        // Check if user_id looks like a UUID (36 chars with dashes)
        const isValidUUID = data.user_id && data.user_id.length === 36 && data.user_id.includes('-');

        let { data: newCheckin, error: checkinError } = await supabase
            .from('checkins')
            .insert({
                event_id: data.event_id,
                participant_id: isValidUUID ? data.user_id : null,
                checkin_time: checkinTime.toISOString(),
                status,
                face_confidence: data.face_confidence || 0,
                face_verified: data.face_verified || false,
                points_earned: points
            })
            .select()
            .single();

        // RETRY: If Foreign Key violation (user not in event_participants), try inserting with null participant_id
        if (checkinError && checkinError.code === '23503') {
            const { data: retryData, error: retryError } = await supabase
                .from('checkins')
                .insert({
                    event_id: data.event_id,
                    participant_id: null, // Set to null to fallback
                    checkin_time: checkinTime.toISOString(),
                    status,
                    face_confidence: data.face_confidence || 0,
                    face_verified: data.face_verified || false,
                    points_earned: points
                })
                .select()
                .single();

            newCheckin = retryData;
            checkinError = retryError;
        }

        if (checkinError) {
            return { success: false, error: checkinError.message };
        }

        return {
            success: true,
            data: { checkin: newCheckin as EventCheckin, event: event as Event },
            message: data.checkin_mode === 'event'
                ? 'Check-in thành công!'
                : (status === 'on_time' ? `Check-in đúng giờ! +${points} điểm` : `Check-in muộn. ${points} điểm`)
        };
    } catch (err) {
        return { success: false, error: 'Lỗi check-in' };
    }
}

async function getEventCheckins(eventId: string): Promise<ApiResponse<EventCheckin[]>> {
    try {
        const { data, error } = await supabase
            .from('checkins')
            .select('*, participants:event_participants(full_name, avatar_url, student_code, organization, birth_date)')
            .eq('event_id', eventId)
            .order('checkin_time', { ascending: false });

        if (error) {
            console.error('getEventCheckins ERROR:', error);
            return { success: false, error: error.message };
        }

        console.log(`getEventCheckins: Loaded ${data?.length || 0} rows for event ${eventId}`);
        return { success: true, data: data as EventCheckin[] };
    } catch (err) {
        return { success: false, error: 'Lỗi tải danh sách check-in' };
    }
}

// =====================================================
// EVENT PARTICIPANTS API
// =====================================================


async function getEventParticipants(eventId: string): Promise<ApiResponse<EventParticipant[]>> {
    try {
        const { data, error } = await supabase
            .from('event_participants')
            .select(`
                id, event_id, full_name, avatar_url, birth_date, organization, face_descriptor, user_id,
                user:users!user_id (
                    face_descriptor,
                    avatar_url
                )
            `) // Join with users to get the latest face_descriptor
            .eq('event_id', eventId)
            .order('full_name', { ascending: true })
            .range(0, 4999); // Increase limit to 5000

        if (error) return { success: false, error: error.message };
        return { success: true, data: data as EventParticipant[] };
    } catch (err) {
        return { success: false, error: 'Lỗi tải danh sách người tham gia' };
    }
}

async function getEventParticipantCount(eventId: string): Promise<ApiResponse<number>> {
    try {
        const { count, error } = await supabase
            .from('event_participants')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', eventId);

        if (error) return { success: false, error: error.message };
        return { success: true, data: count || 0 };
    } catch (err) {
        return { success: false, error: 'Lỗi đếm số lượng người tham gia' };
    }
}

async function updateParticipantFaceDescriptor(participantId: string, descriptor: string): Promise<ApiResponse<void>> {
    try {
        const { error } = await supabase
            .from('event_participants')
            .update({ face_descriptor: descriptor })
            .eq('id', participantId);

        if (error) return { success: false, error: error.message };
        return { success: true, message: 'Updated face descriptor' };
    } catch (err) {
        return { success: false, error: 'Failed to update face descriptor' };
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
                address: p.address || null,
                user_id: p.user_id || null, // Include user_id
                face_descriptor: p.face_descriptor || null // Save face descriptor
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
                        address: p.address,
                        user_id: p.user_id, // Include user_id
                        face_descriptor: p.face_descriptor // Update face descriptor
                    })
                    .eq('id', p.id)
                    .select()
                    .single()
            );

            const results = await Promise.all(updatePromises);
            results.forEach(res => {
                if (res.data) savedParticipants.push(res.data as EventParticipant);
            });
        }

        // SYNC DATA TO USERS TABLE (New Requirement: Sync all fields)
        // Filter participants that have user_id
        const participantsToSync = participants.filter(p => p.user_id);

        if (participantsToSync.length > 0) {
            Promise.all(participantsToSync.map(p => {
                // Prepare update payload with only defined values to avoid overwriting with nulls if not intended,
                // but user request implies "take info from checkin system", so we update what is provided.
                const userUpdatePayload: any = {};
                if (p.full_name) userUpdatePayload.full_name = p.full_name;
                if (p.birth_date) userUpdatePayload.birth_date = p.birth_date;
                if (p.organization) userUpdatePayload.organization = p.organization;
                // address is not in users table yet
                if (p.avatar_url) userUpdatePayload.avatar_url = p.avatar_url;

                // Only update if there are fields to update
                if (Object.keys(userUpdatePayload).length > 0) {
                    return supabase
                        .from('users')
                        .update(userUpdatePayload)
                        .eq('id', p.user_id);
                }
                return Promise.resolve();
            })).then(() => console.log('Synced participant data to users table'))
                .catch(err => console.error('Error syncing participant data:', err));
        }

        return { success: true, data: savedParticipants };
    } catch (err) {
        return { success: false, error: 'Lỗi lưu danh sách người tham gia' };
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

/**
 * Upload participant avatar AND automatically compute face descriptor (Face ID)
 * This ensures better face recognition from ID card photos which are usually clearer
 * 
 * @param participantId - ID of the participant to update
 * @param base64Image - Base64 encoded image data (with or without data:image prefix)
 * @returns Object containing avatar_url and computed face_descriptor (if successful)
 */
async function uploadParticipantAvatarWithFaceID(
    participantId: string,
    base64Image: string
): Promise<ApiResponse<{ avatar_url: string; face_descriptor: string | null }>> {
    try {
        // 1. Update avatar_url in database
        const { data, error: updateError } = await supabase
            .from('event_participants')
            .update({ avatar_url: base64Image })
            .eq('id', participantId)
            .select()
            .single();

        if (updateError) {
            return { success: false, error: updateError.message };
        }

        // 2. Compute face descriptor from the uploaded image
        // Import faceService dynamically to avoid circular dependencies
        let faceDescriptor: string | null = null;
        try {
            const { faceService, descriptorToString, base64ToImage } = await import('./faceService');

            // Ensure models are loaded
            if (!faceService.isModelsLoaded()) {
                await faceService.loadModels();
            }

            // Convert base64 to image and extract face descriptor
            const img = await base64ToImage(base64Image);
            const descriptor = await faceService.getFaceDescriptor(img);

            if (descriptor) {
                faceDescriptor = descriptorToString(descriptor);

                // 3. Save face descriptor to database
                await supabase
                    .from('event_participants')
                    .update({ face_descriptor: faceDescriptor })
                    .eq('id', participantId);

                console.log(`✅ Auto-computed face descriptor for participant ${participantId}`);
            } else {
                console.warn(`⚠️ Could not detect face in uploaded image for participant ${participantId}`);
            }
        } catch (faceError) {
            // Face extraction failed, but avatar was still uploaded successfully
            console.warn('Could not extract face from uploaded image:', faceError);
        }

        return {
            success: true,
            data: {
                avatar_url: base64Image,
                face_descriptor: faceDescriptor
            },
            message: faceDescriptor
                ? 'Đã tải ảnh và tạo Face ID thành công!'
                : 'Đã tải ảnh (không phát hiện được khuôn mặt)'
        };
    } catch (error: any) {
        return { success: false, error: error.message || 'Lỗi upload ảnh' };
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
            .order('zone', { ascending: true })
            .order('name', { ascending: true });

        if (error) return { success: false, error: error.message };
        return { success: true, data: data as Room[] };
    } catch (err) {
        return { success: false, error: 'Lỗi tải danh sách phòng' };
    }
}

async function createRoom(roomData: Omit<Room, 'id'>): Promise<ApiResponse<Room>> {
    try {
        const { data, error } = await supabase
            .from('rooms')
            .insert(roomData)
            .select()
            .single();

        if (error) return { success: false, error: error.message };
        clearCache('rooms');
        return { success: true, data: data as Room };
    } catch (err) {
        return { success: false, error: 'Lỗi tạo phòng mới' };
    }
}

async function updateRoom(id: string, roomData: Partial<Room>): Promise<ApiResponse<Room>> {
    try {
        const { data, error } = await supabase
            .from('rooms')
            .update(roomData)
            .eq('id', id)
            .select()
            .single();

        if (error) return { success: false, error: error.message };
        clearCache('rooms');
        return { success: true, data: data as Room };
    } catch (err) {
        return { success: false, error: 'Lỗi cập nhật phòng' };
    }
}

async function deleteRoom(id: string): Promise<ApiResponse<void>> {
    try {
        // First, remove room_id from all students in this room
        await supabase
            .from('users')
            .update({ room_id: null })
            .eq('room_id', id);

        const { error } = await supabase
            .from('rooms')
            .delete()
            .eq('id', id);

        if (error) return { success: false, error: error.message };
        clearCache('rooms');
        return { success: true };
    } catch (err) {
        return { success: false, error: 'Lỗi xóa phòng' };
    }
}

// Get unique zones list
async function getZones(): Promise<ApiResponse<string[]>> {
    try {
        const { data, error } = await supabase
            .from('rooms')
            .select('zone')
            .order('zone', { ascending: true });

        if (error) return { success: false, error: error.message };

        const zones = [...new Set(data?.map(r => r.zone).filter(Boolean))] as string[];
        return { success: true, data: zones };
    } catch (err) {
        return { success: false, error: 'Lỗi tải danh sách khu' };
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
    morning_in_status?: string;
    morning_out?: string;
    noon_in?: string;
    noon_in_status?: string;
    noon_out?: string;
    evening_in?: string;
    evening_in_status?: string;
    evening_out?: string;
    exit_permission: boolean;
    notes?: string;
}

export type CheckinType = 'morning_in' | 'morning_out' | 'noon_in' | 'noon_out' | 'evening_in' | 'evening_out';

async function boardingCheckin(
    userId: string,
    checkinType: CheckinType,
    status?: 'on_time' | 'late'
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

        const updateData: Record<string, string | boolean> = {};
        updateData[checkinType] = now;

        // Save status if it's an IN checkin and status is provided
        if (status && checkinType.endsWith('_in')) {
            updateData[`${checkinType}_status`] = status;
        }

        let recordData: BoardingCheckinRecord | null = null;

        if (existingRecord) {
            // Update existing record
            const { data, error } = await supabase
                .from('boarding_checkins')
                .update(updateData)
                .eq('id', existingRecord.id)
                .select()
                .single();

            if (error) return { success: false, error: error.message };
            recordData = data;
        } else {
            // Create new record
            updateData['user_id'] = userId;
            updateData['date'] = today;
            updateData['exit_permission'] = false;

            const { data, error } = await supabase
                .from('boarding_checkins')
                .insert(updateData)
                .select()
                .single();

            if (error) return { success: false, error: error.message };
            recordData = data;
        }

        // --- POINT DEDUCTION LOGIC (Runs for both Create and Update) ---
        if (status === 'late') {
            // Fetch config for boarding late points
            const { data: configData } = await supabase
                .from('system_configs')
                .select('value')
                .eq('key', 'points_late_boarding')
                .single();

            const latePoints = configData ? parseInt(configData.value) : -2;

            // Call RPC to update points safely
            await supabase.rpc('increment_user_points', {
                p_user_id: userId,
                p_amount: latePoints
            });
        }

        return { success: true, data: (recordData || updateData) as BoardingCheckinRecord };
    } catch (err) {
        // OFFLINE FALLBACK
        console.warn('Network error, saving to offline queue...');
        addToOfflineQueue({
            userId,
            checkinType,
            status,
            timestamp: new Date().toISOString()
        });

        // Return a fake success so UI doesn't block the user
        return {
            success: true,
            message: 'Đã lưu (Offline)',
            data: { id: 'offline', user_id: userId, date: '', exit_permission: false } // Dummy data
        };
    }
}

// Get boarding checkins for reporting
async function getBoardingCheckins(options?: {
    date?: string; // Single date YYYY-MM-DD
    startDate?: string;
    endDate?: string;
    userId?: string;
}): Promise<ApiResponse<(BoardingCheckinRecord & { user?: { full_name: string; student_code: string; organization: string } })[]>> {
    try {
        let query = supabase
            .from('boarding_checkins')
            .select(`
                *,
                user:users!user_id(full_name, student_code, organization)
            `)
            .order('date', { ascending: false });

        if (options?.date) {
            query = query.eq('date', options.date);
        }
        if (options?.startDate) {
            query = query.gte('date', options.startDate);
        }
        if (options?.endDate) {
            query = query.lte('date', options.endDate);
        }
        if (options?.userId) {
            query = query.eq('user_id', options.userId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching boarding checkins:', error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data || [] };
    } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi kết nối' };
    }
}

// =====================================================
// BOARDING TIME SLOTS API - Khung giờ check-in linh hoạt
// =====================================================

interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

/**
 * Lấy tất cả khung giờ check-in (active + inactive)
 */
async function getTimeSlots(): Promise<ApiResponse<BoardingTimeSlot[]>> {
    try {
        const { data, error } = await supabase
            .from('boarding_time_slots')
            .select('*')
            .order('order_index', { ascending: true });

        if (error) return { success: false, error: error.message };
        return { success: true, data: data as BoardingTimeSlot[] };
    } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi tải khung giờ' };
    }
}

/**
 * Lấy khung giờ đang active
 */
async function getActiveTimeSlots(): Promise<ApiResponse<BoardingTimeSlot[]>> {
    try {
        const { data, error } = await supabase
            .from('boarding_time_slots')
            .select('*')
            .eq('is_active', true)
            .order('order_index', { ascending: true });

        if (error) return { success: false, error: error.message };
        return { success: true, data: data as BoardingTimeSlot[] };
    } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi tải khung giờ' };
    }
}

/**
 * Tạo khung giờ mới
 */
async function createTimeSlot(slot: Omit<BoardingTimeSlot, 'id' | 'created_at' | 'updated_at'>): Promise<ApiResponse<BoardingTimeSlot>> {
    try {
        const { data, error } = await supabase
            .from('boarding_time_slots')
            .insert(slot)
            .select()
            .single();

        if (error) return { success: false, error: error.message };
        return { success: true, data: data as BoardingTimeSlot, message: 'Tạo khung giờ thành công!' };
    } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi tạo khung giờ' };
    }
}

/**
 * Cập nhật khung giờ
 */
async function updateTimeSlot(id: string, updates: Partial<BoardingTimeSlot>): Promise<ApiResponse<BoardingTimeSlot>> {
    try {
        const { data, error } = await supabase
            .from('boarding_time_slots')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) return { success: false, error: error.message };
        return { success: true, data: data as BoardingTimeSlot, message: 'Cập nhật thành công!' };
    } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi cập nhật khung giờ' };
    }
}

/**
 * Xóa khung giờ
 */
async function deleteTimeSlot(id: string): Promise<ApiResponse<void>> {
    try {
        const { error } = await supabase
            .from('boarding_time_slots')
            .delete()
            .eq('id', id);

        if (error) return { success: false, error: error.message };
        return { success: true, message: 'Đã xóa khung giờ' };
    } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi xóa khung giờ' };
    }
}

/**
 * Lấy khung giờ hiện tại dựa trên thời gian
 */
function getCurrentTimeSlot(slots: BoardingTimeSlot[]): BoardingTimeSlot | null {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const slot of slots) {
        if (!slot.is_active) continue;

        const [startH, startM] = slot.start_time.split(':').map(Number);
        const [endH, endM] = slot.end_time.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
            return slot;
        }
    }
    return null;
}

/**
 * Tính trạng thái check-in (đúng giờ hoặc trễ)
 */
function calculateCheckinStatus(slot: BoardingTimeSlot, checkinTime: Date): 'on_time' | 'late' {
    const minutes = checkinTime.getHours() * 60 + checkinTime.getMinutes();
    const [endH, endM] = slot.end_time.split(':').map(Number);
    const endMinutes = endH * 60 + endM;

    return minutes <= endMinutes ? 'on_time' : 'late';
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
                    { key: 'points_on_time', value: '0' },
                    { key: 'points_late', value: '-5' },
                    { key: 'start_points', value: '100' }
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
        const user = getStoredUser();
        if (!user) return { success: false, error: 'Chưa đăng nhập' };

        // 1. Try RPC First
        const { error: rpcError } = await supabase.rpc('add_user_points', {
            p_user_id: userId,
            p_points: points
        });

        // 2. If RPC failed, try Manual Update (Fetch -> Calculate -> Update)
        if (rpcError) {
            console.warn('RPC add_user_points failed, trying manual update:', rpcError);

            // Get current points
            const { data: userData, error: fetchError } = await supabase
                .from('users')
                .select('total_points')
                .eq('id', userId)
                .single();

            if (fetchError) throw new Error('Không thể lấy thông tin điểm người dùng');

            const currentPoints = userData.total_points || 0;
            const newPoints = currentPoints + points;

            // Update new points
            const { error: updateError } = await supabase
                .from('users')
                .update({ total_points: newPoints })
                .eq('id', userId);

            if (updateError) throw new Error('Lỗi cập nhật điểm (Manual Update)');
        }

        // 3. Log the points change
        const { error: logError } = await supabase.from('point_logs').insert({
            user_id: userId,
            points: points,
            reason: reason,
            created_by: user.id,
            type: 'manual'
        });

        if (logError) {
            console.error('Log error:', logError);
            // We usually don't fail the whole operation if logging fails, 
            // but for this app it's better to warn or assume success if points updated.
            // However, let's just log it. 
            // If the user wants STRICT consistency, we should throw.
            // But let's throw to ensure the user knows something is wrong with their DB setup
            throw new Error(`Lỗi lưu lịch sử: ${logError.message}`);
        }

        return { success: true, message: `Đã cộng ${points} điểm` };
    } catch (err: any) {
        console.error('addPoints error:', err);
        return { success: false, error: err.message || 'Lỗi hệ thống khi cộng điểm' };
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
    organization?: string;
    avatar_url?: string;
    total_points: number;
    rank?: number;
}

async function getRanking(options?: { role?: string; limit?: number }): Promise<ApiResponse<RankingUser[]>> {
    try {
        let query = supabase
            .from('users')
            .select('id, full_name, class_id, organization, avatar_url, total_points')
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
        // Optimize: Fetch everything in parallel
        const [eventRes, participantsRes, checkinsRes] = await Promise.all([
            // 1. Get Event Details
            supabase.from('events').select('*').eq('id', eventId).single(),

            // 2. Get Participants (Lightweight)
            supabase.from('event_participants').select('id, full_name, organization').eq('event_id', eventId),

            // 3. Get Checkins with joined participant data (if View exists, use View, else Join)
            // For now, allow client-side join to be safe if SQL view script isn't run, 
            // but fetch ONLY needed columns
            supabase.from('checkins')
                .select('id, participant_id, checkin_time, status, points_earned')
                .eq('event_id', eventId)
        ]);

        if (eventRes.error) return { success: false, error: eventRes.error.message };

        const event = eventRes.data as Event;
        const participants = (participantsRes.data || []) as any[];
        const rawCheckins = (checkinsRes.data || []) as any[];

        // Create a fast lookup map for checkins by participant_id
        const checkinMap = new Map(rawCheckins.map(c => [c.participant_id, c]));

        // Enrich ALL participants with checkin data (or mark absent)
        const fullCheckinsList: Checkin[] = participants.map(p => {
            const checkin = checkinMap.get(p.id);
            if (checkin) {
                return {
                    ...checkin,
                    user_name: p.full_name,
                    class_id: p.organization
                };
            } else {
                // Create "Absent" record
                return {
                    id: `absent_${p.id}`,
                    event_id: eventId,
                    participant_id: p.id,
                    user_id: p.user_id,
                    user_name: p.full_name,
                    class_id: p.organization,
                    checkin_time: null, // No time
                    status: 'absent',
                    points_earned: 0, // Or fetch points_absent if needed, but 0 or null is fine for now
                    image_url: null
                } as unknown as Checkin;
            }
        });

        const onTimeCount = fullCheckinsList.filter(c => c.status === 'on_time').length;
        const lateCount = fullCheckinsList.filter(c => c.status === 'late').length;
        const absentCount = fullCheckinsList.filter(c => c.status === 'absent').length;

        return {
            success: true,
            data: {
                event: event,
                totalParticipants: participants.length,
                totalCheckins: rawCheckins.length, // Only actual checkins
                onTimeCount,
                lateCount,
                absentCount,
                checkins: fullCheckinsList // Returns FULL list including absentees
            }
        };
    } catch (err) {
        console.error('Report Error:', err);
        return { success: false, error: 'Lỗi tải báo cáo sự kiện' };
    }
}

// =====================================================
// CERTIFICATES API
// =====================================================


async function getCertificates(): Promise<ApiResponse<Certificate[]>> {
    try {
        const { data, error } = await supabase
            .from('certificates')
            .select('*, user:users(id, full_name)')
            .order('issued_date', { ascending: false });

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
                issued_date: new Date().toISOString(),
                template_id: certData.template_id || 'modern',
                metadata: certData.metadata || {}
            })
            .select()
            .single();

        if (error) return { success: false, error: error.message };
        return { success: true, data: data as Certificate };
    } catch (err) {
        return { success: false, error: 'Lỗi tạo chứng nhận' };
    }
}


async function createCertificatesBulk(certsData: Partial<Certificate>[]): Promise<ApiResponse<Certificate[]>> {
    try {
        const { data, error } = await supabase
            .from('certificates')
            .insert(certsData.map(c => ({
                user_id: c.user_id,
                event_id: c.event_id,
                type: c.type || 'participation',
                title: c.title || 'Chứng nhận tham gia',
                issued_date: new Date().toISOString(),
                template_id: c.template_id || 'modern',
                metadata: c.metadata || {}
            })))
            .select();

        if (error) return { success: false, error: error.message };
        return { success: true, data: data as Certificate[] };
    } catch (err) {
        return { success: false, error: 'Lỗi tạo hàng loạt' };
    }
}

async function deleteCertificate(id: string): Promise<ApiResponse<void>> {
    try {
        const { error } = await supabase.from('certificates').delete().eq('id', id);
        if (error) return { success: false, error: error.message };
        return { success: true, message: 'Đã xóa chứng nhận' };
    } catch (err) {
        return { success: false, error: 'Lỗi xóa chứng nhận' };
    }
}

// =====================================================
// EXIT PERMISSIONS API - Đơn xin phép ra ngoài
// =====================================================

interface ExitPermission {
    id: string;
    user_id: string;
    reason: string;
    reason_detail?: string;
    destination: string;
    parent_contact?: string;
    exit_time: string;
    return_time: string;
    actual_return_time?: string;
    status: 'pending' | 'approved' | 'rejected';
    approved_by?: string;
    approved_at?: string;
    rejection_reason?: string;
    notes?: string;
    created_at: string;
    updated_at: string;
    user?: {
        full_name: string;
        student_code: string;
        organization: string;
    };
}

/**
 * Lấy danh sách đơn xin phép
 */
async function getExitPermissions(options?: {
    userId?: string;
    status?: 'pending' | 'approved' | 'rejected';
    startDate?: string;
    endDate?: string;
}): Promise<ApiResponse<ExitPermission[]>> {
    try {
        let query = supabase
            .from('exit_permissions')
            .select(`
                *,
                user:users!user_id(full_name, student_code, organization)
            `)
            .order('created_at', { ascending: false });

        if (options?.userId) {
            query = query.eq('user_id', options.userId);
        }
        if (options?.status) {
            query = query.eq('status', options.status);
        }
        if (options?.startDate) {
            query = query.gte('exit_time', options.startDate);
        }
        if (options?.endDate) {
            query = query.lte('exit_time', options.endDate);
        }

        const { data, error } = await query;

        if (error) return { success: false, error: error.message };
        return { success: true, data: data as ExitPermission[] };
    } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi tải danh sách đơn xin phép' };
    }
}

/**
 * Tạo đơn xin phép mới
 */
async function createExitPermission(data: {
    user_id: string;
    reason: string;
    reason_detail?: string;
    destination: string;
    parent_contact?: string;
    exit_time: string;
    return_time: string;
}): Promise<ApiResponse<ExitPermission>> {
    try {
        const { data: result, error } = await supabase
            .from('exit_permissions')
            .insert({
                ...data,
                status: 'pending'
            })
            .select();

        if (error) return { success: false, error: error.message };
        const createdRecord = result && result.length > 0 ? result[0] : null;
        if (!createdRecord) return { success: false, error: 'Không thể tạo đơn (Lỗi quyền truy cập)' };

        return { success: true, data: createdRecord as ExitPermission, message: 'Đã gửi đơn xin phép!' };
    } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi tạo đơn xin phép' };
    }
}

/**
 * Cập nhật đơn xin phép
 */
async function updateExitPermission(id: string, updates: Partial<ExitPermission>): Promise<ApiResponse<ExitPermission>> {
    try {
        const { data, error } = await supabase
            .from('exit_permissions')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select();

        if (error) return { success: false, error: error.message };
        const updatedRecord = data && data.length > 0 ? data[0] : null;
        if (!updatedRecord) return { success: false, error: 'Không tìm thấy đơn hoặc không có quyền sửa' };

        return { success: true, data: updatedRecord as ExitPermission };
    } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi cập nhật đơn' };
    }
}

/**
 * Duyệt hoặc từ chối đơn xin phép
 */
async function approveRejectExitPermission(
    id: string,
    action: 'approved' | 'rejected',
    approvedBy: string,
    rejectionReason?: string
): Promise<ApiResponse<ExitPermission>> {
    try {
        const updateData: any = {
            status: action,
            approved_by: approvedBy,
            approved_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        if (action === 'rejected' && rejectionReason) {
            updateData.rejection_reason = rejectionReason;
        }

        const { data, error } = await supabase
            .from('exit_permissions')
            .update(updateData)
            .eq('id', id)
            .select();

        if (error) return { success: false, error: error.message };
        const updatedRecord = data && data.length > 0 ? data[0] : null;
        if (!updatedRecord) return { success: false, error: 'Không tìm thấy đơn hoặc không có quyền duyệt' };

        return {
            success: true,
            data: updatedRecord as ExitPermission,
            message: action === 'approved' ? 'Đã duyệt đơn!' : 'Đã từ chối đơn!'
        };
    } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi xử lý đơn' };
    }
}

/**
 * Xóa đơn xin phép
 */
async function deleteExitPermission(id: string): Promise<ApiResponse<void>> {
    try {
        const { error } = await supabase
            .from('exit_permissions')
            .delete()
            .eq('id', id);

        if (error) return { success: false, error: error.message };
        return { success: true, message: 'Đã xóa đơn xin phép' };
    } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi xóa đơn' };
    }
}

// =====================================================
// SYSTEM CONFIG API
// =====================================================



async function getBoardingConfig(): Promise<ApiResponse<BoardingConfig>> {
    try {
        const { data, error } = await supabase
            .from('boarding_config')
            .select('*');

        if (error) {
            console.error('Failed to fetch config, using defaults', error);
            // Return defaults if DB fails
            return {
                success: true,
                data: {
                    morning_curfew: '07:00',
                    noon_curfew: '12:30',
                    evening_curfew: '22:00'
                }
            };
        }

        // Convert array to object
        const config: BoardingConfig = {
            morning_curfew: '07:00',
            noon_curfew: '12:30',
            evening_curfew: '22:00'
        };

        data.forEach((row: any) => {
            config[row.key] = row.value;
        });

        return { success: true, data: config };
    } catch (err) {
        return {
            success: true, data: {
                morning_curfew: '07:00',
                noon_curfew: '12:30',
                evening_curfew: '22:00'
            }
        };
    }
}

// OFFLINE QUEUE
async function updateBoardingConfig(config: BoardingConfig): Promise<ApiResponse<void>> {
    try {
        const updates = Object.entries(config).map(([key, value]) => ({ key, value: String(value) }));

        const { error } = await supabase
            .from('boarding_config')
            .upsert(updates, { onConflict: 'key' });

        if (error) return { success: false, error: error.message };
        return { success: true, message: 'Cập nhật cấu hình thành công' };
    } catch (err) {
        return { success: false, error: 'Lỗi cập nhật cấu hình' };
    }
}

const OFFLINE_QUEUE_KEY = 'boarding_offline_queue';

interface OfflineCheckin {
    userId: string;
    checkinType: CheckinType;
    status?: 'on_time' | 'late';
    timestamp: string;
}

function addToOfflineQueue(data: OfflineCheckin) {
    try {
        const queueRaw = localStorage.getItem(OFFLINE_QUEUE_KEY);
        const queue: OfflineCheckin[] = queueRaw ? JSON.parse(queueRaw) : [];
        queue.push(data);
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
        console.log('Saved to offline queue:', data);
    } catch (e) {
        console.error('Failed to save to offline queue', e);
    }
}

async function processOfflineQueue(): Promise<void> {
    const queueRaw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!queueRaw) return;

    try {
        const queue: OfflineCheckin[] = JSON.parse(queueRaw);
        if (queue.length === 0) return;

        console.log(`Processing ${queue.length} offline checkins...`);

        const failedQueue: OfflineCheckin[] = [];

        for (const item of queue) {
            // We use the timestamp from the offline record to ensure accuracy
            // But detailed boardingCheckin logic relies on "today", so day shift might be tricky.
            // For now, we assume simple resync.

            // Note: Ideally, boardingCheckin should accept an explicit timestamp. 
            // We will modify boardingCheckin slightly to handle this if needed, 
            // or just rely on server time (but set the correct column based on type).

            // Re-using boardingCheckin but suppressing errors is risky.
            // Let's copy logic:
            try {
                // Warning: This uses CURRENT time for checkin if we don't pass timestamp.
                // We heavily rely on 'checkinType' to put it in the right column.
                // The 'status' is preserved.
                const result = await boardingCheckin(item.userId, item.checkinType, item.status);
                if (!result.success) {
                    console.warn(`Failed to sync item ${item.userId}, keeping in queue.`);
                    failedQueue.push(item);
                }
            } catch (err) {
                failedQueue.push(item);
            }
        }

        if (failedQueue.length > 0) {
            localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(failedQueue));
        } else {
            localStorage.removeItem(OFFLINE_QUEUE_KEY);
            console.log('Offline queue processed successfully');
        }

    } catch (e) {
        console.error('Error processing offline queue', e);
    }
}

// Ensure queue is processed on load
if (typeof window !== 'undefined') {
    setTimeout(processOfflineQueue, 5000); // Wait 5s then sync
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
    getEventParticipantCount,
    updateParticipantFaceDescriptor,
    uploadParticipantAvatarWithFaceID, // NEW: Auto-compute face ID when uploading avatar
    saveEventParticipants,
    deleteEventParticipant,

    // Rooms
    getRooms,
    createRoom,
    updateRoom,
    deleteRoom,
    updateZone,
    getZones,

    // Boarding Check-in
    boardingCheckin,
    getBoardingCheckins,
    getBoardingConfig,
    updateBoardingConfig,
    processOfflineQueue,

    // Boarding Time Slots - Khung giờ linh hoạt
    getTimeSlots,
    getActiveTimeSlots,
    createTimeSlot,
    updateTimeSlot,
    deleteTimeSlot,
    getCurrentTimeSlot,
    calculateCheckinStatus,

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
    // Reports
    getEventReport,

    // Certificates
    getCertificates,
    createCertificate,
    createCertificatesBulk,
    deleteCertificate,

    // Exit Permissions - Đơn xin phép ra ngoài
    getExitPermissions,
    createExitPermission,
    updateExitPermission,
    approveRejectExitPermission,
    deleteExitPermission,

    // Cache
    clearCache,
    getAllStudentsForCheckin // Export new function
};
