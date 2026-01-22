/**
 * EduCheck Data Service v3.0 - Supabase Edition
 * Fast, reliable database operations using PostgreSQL
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { User, Event, EventCheckin, EventParticipant, BoardingConfig, BoardingTimeSlot, Certificate } from '../types';
import { faceService, descriptorToString, base64ToImage } from './faceService';

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
// Helper to get local date string (YYYY-MM-DD)
const getTodayDateStr = () => {
    return new Date().toLocaleDateString('en-CA');
};

async function login(identifier: string, password: string): Promise<ApiResponse<{ user: User; token: string }>> {
    if (!isSupabaseConfigured()) {
        return { success: false, error: 'Supabase chưa được cấu hình' };
    }

    try {
        // Simple password-based auth (no Supabase Auth, just table lookup)
        // Use maybeSingle() to avoid 406 error when no user found
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .or(`email.eq.${identifier},student_code.eq.${identifier}`)
            .maybeSingle();

        if (error) {
            console.error('Login query error:', error);
            return { success: false, error: 'Lỗi truy vấn database' };
        }

        if (!data) {
            return { success: false, error: 'Tài khoản không tồn tại (Email hoặc Mã SV sai)' };
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
// FACE DESCRIPTOR AUTO-COMPUTE
// =====================================================

// Track pending Face ID computations for UI status
const pendingFaceComputes = new Map<string, { status: 'processing' | 'success' | 'failed'; error?: string }>();

// Listeners for Face ID computation updates
const faceComputeListeners: ((userId: string, result: { success: boolean; error?: string }) => void)[] = [];

/**
 * Register a listener for Face ID computation updates
 */
function onFaceComputeComplete(callback: (userId: string, result: { success: boolean; error?: string }) => void) {
    faceComputeListeners.push(callback);
    return () => {
        const idx = faceComputeListeners.indexOf(callback);
        if (idx > -1) faceComputeListeners.splice(idx, 1);
    };
}

/**
 * Get pending Face ID computation status for a user
 */
function getFaceComputeStatus(userId: string): { status: 'processing' | 'success' | 'failed' | 'none'; error?: string } {
    const pending = pendingFaceComputes.get(userId);
    return pending || { status: 'none' };
}

/**
 * Get all pending Face ID computations
 */
function getPendingFaceComputes(): Map<string, { status: 'processing' | 'success' | 'failed'; error?: string }> {
    return new Map(pendingFaceComputes);
}

/**
 * Auto-compute face descriptor from avatar image and save to database
 * Enhanced with callbacks, auto-retry, and status tracking
 * 
 * @param userId - ID of the user to update
 * @param avatarUrl - Base64 or URL of the avatar image
 * @param options - Optional configuration
 * @returns Promise with success/failure result
 */
async function computeAndSaveFaceDescriptor(
    userId: string,
    avatarUrl: string,
    options?: {
        onComplete?: (result: { success: boolean; error?: string }) => void;
        maxRetries?: number;
    }
): Promise<{ success: boolean; error?: string }> {
    console.log(`🔄 [FaceCompute] Starting for user ${userId}...`);

    const maxRetries = options?.maxRetries ?? 3;
    let retryCount = 0;

    // Mark as processing
    pendingFaceComputes.set(userId, { status: 'processing' });

    // Helper to notify completion
    const notifyResult = (result: { success: boolean; error?: string }) => {
        pendingFaceComputes.set(userId, {
            status: result.success ? 'success' : 'failed',
            error: result.error
        });

        // Auto-clear status after 10 seconds
        setTimeout(() => pendingFaceComputes.delete(userId), 10000);

        // Notify callback
        options?.onComplete?.(result);

        // Notify all listeners
        faceComputeListeners.forEach(listener => listener(userId, result));

        return result;
    };

    // Skip if no avatar
    if (!avatarUrl || avatarUrl.trim() === '') {
        const error = 'Không có ảnh avatar';
        console.warn(`⚠️ [FaceCompute] No avatar URL for user ${userId}`);
        return notifyResult({ success: false, error });
    }

    // Retry loop for model loading
    while (retryCount <= maxRetries) {
        try {
            console.log(`🔄 [FaceCompute] Loading face models... (attempt ${retryCount + 1}/${maxRetries + 1})`);

            // Ensure models are loaded with retry
            if (!faceService.isModelsLoaded()) {
                await faceService.loadModels();
            }

            // Double-check models are loaded
            if (!faceService.isModelsLoaded()) {
                throw new Error('MODEL_NOT_LOADED');
            }

            console.log(`🔄 [FaceCompute] Models ready, loading image...`);

            // Handle different URL types
            let img: HTMLImageElement;

            if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
                // For HTTP URLs, we need to handle CORS
                try {
                    img = await base64ToImage(avatarUrl);
                } catch (corsError) {
                    console.log(`🔄 [FaceCompute] Direct load failed, trying fetch...`);
                    const response = await fetch(avatarUrl);
                    const blob = await response.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    img = await base64ToImage(blobUrl);
                    URL.revokeObjectURL(blobUrl);
                }
            } else {
                // Base64 or data URL
                img = await base64ToImage(avatarUrl);
            }

            console.log(`🔄 [FaceCompute] Image loaded (${img.width}x${img.height}), detecting face...`);

            // Detect face
            const descriptor = await faceService.getFaceDescriptor(img);

            if (descriptor) {
                const descriptorStr = descriptorToString(descriptor);
                console.log(`🔄 [FaceCompute] Face detected! Saving to database...`);

                // Save to database
                const { error } = await supabase
                    .from('users')
                    .update({ face_descriptor: descriptorStr })
                    .eq('id', userId);

                if (error) {
                    console.error(`❌ [FaceCompute] DB save failed for user ${userId}:`, error.message);
                    return notifyResult({ success: false, error: 'Lỗi lưu vào database: ' + error.message });
                } else {
                    console.log(`✅ [FaceCompute] SUCCESS! Face descriptor saved for user ${userId}`);
                    return notifyResult({ success: true });
                }
            } else {
                console.warn(`⚠️ [FaceCompute] No face detected in avatar for user ${userId}`);
                return notifyResult({ success: false, error: 'Không tìm thấy khuôn mặt trong ảnh' });
            }
        } catch (e: any) {
            const errorMsg = e.message || String(e);
            console.error(`❌ [FaceCompute] Error for user ${userId} (attempt ${retryCount + 1}):`, errorMsg);

            // Retry if model not loaded
            if (errorMsg === 'MODEL_NOT_LOADED' && retryCount < maxRetries) {
                retryCount++;
                console.log(`🔄 [FaceCompute] Retrying in 1 second...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            return notifyResult({ success: false, error: 'Lỗi xử lý: ' + errorMsg });
        }
    }

    return notifyResult({ success: false, error: 'Đã thử ' + (maxRetries + 1) + ' lần nhưng không thành công' });
}

/**
 * Batch compute face descriptors for all users with avatar but no face_descriptor
 * Returns progress updates via callback
 */
async function batchComputeFaceDescriptors(
    onProgress?: (current: number, total: number, name: string) => void
): Promise<{ success: number; failed: number; total: number }> {
    try {
        // Get users with avatar but no face_descriptor
        const { data: users, error } = await supabase
            .from('users')
            .select('id, full_name, avatar_url')
            .not('avatar_url', 'is', null)
            .is('face_descriptor', null)
            .neq('avatar_url', '');

        if (error || !users) {
            console.error('Failed to fetch users for batch compute:', error);
            return { success: 0, failed: 0, total: 0 };
        }

        const total = users.length;
        let success = 0;
        let failed = 0;

        console.log(`🚀 Starting batch compute for ${total} users...`);

        // Dynamic import
        const { faceService, descriptorToString } = await import('./faceService');
        if (!faceService.isModelsLoaded()) {
            await faceService.loadModels();
        }

        // Helper function to load image with CORS handling
        const loadImageWithCors = async (url: string): Promise<HTMLImageElement> => {
            // For URLs (not base64), fetch as blob to avoid CORS tainted canvas
            if (url.startsWith('http://') || url.startsWith('https://')) {
                const response = await fetch(url);
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);

                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        URL.revokeObjectURL(blobUrl); // Clean up
                        resolve(img);
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(blobUrl);
                        reject(new Error('Failed to load image'));
                    };
                    img.src = blobUrl;
                });
            } else {
                // Base64 image
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = url;
                });
            }
        };

        // Process sequentially to avoid overwhelming the browser
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            onProgress?.(i + 1, total, user.full_name);

            try {
                const img = await loadImageWithCors(user.avatar_url);
                const descriptor = await faceService.getFaceDescriptor(img);

                if (descriptor) {
                    const descriptorStr = descriptorToString(descriptor);

                    const { error: updateError } = await supabase
                        .from('users')
                        .update({ face_descriptor: descriptorStr })
                        .eq('id', user.id);

                    if (!updateError) {
                        success++;
                        console.log(`✅ ${i + 1}/${total} - ${user.full_name}`);
                    } else {
                        failed++;
                        console.warn(`❌ ${i + 1}/${total} - ${user.full_name}: DB Error`);
                    }
                } else {
                    failed++;
                    console.warn(`⚠️ ${i + 1}/${total} - ${user.full_name}: No face detected`);
                }
            } catch (e) {
                failed++;
                console.warn(`❌ ${i + 1}/${total} - ${user.full_name}: ${e}`);
            }
        }

        console.log(`🏁 Batch complete: ${success} success, ${failed} failed out of ${total}`);
        return { success, failed, total };
    } catch (e) {
        console.error('Batch compute error:', e);
        return { success: 0, failed: 0, total: 0 };
    }
}

// =====================================================
// USERS API
// =====================================================
async function getUsers(options?: {
    role?: string;
    status?: string;
    page?: number;
    pageSize?: number;
    search?: string;
    missingFaceId?: boolean;
}): Promise<ApiResponse<User[] & { total?: number }>> {
    try {
        const isPaging = options?.page !== undefined && options?.pageSize !== undefined;

        let query = supabase.from('users').select(
            'id, full_name, email, role, avatar_url, status, student_code, organization, created_at, birth_date, room_id, face_descriptor, total_points',
            { count: isPaging ? 'exact' : undefined }
        );

        if (options?.role && options.role !== 'all') {
            query = query.eq('role', options.role);
        }
        if (options?.status && options.status !== 'all') {
            query = query.eq('status', options.status);
        }
        if (options?.search) {
            const q = options.search;
            query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,student_code.ilike.%${q}%`);
        }
        if (options?.missingFaceId) {
            query = query.is('face_descriptor', null);
        }

        if (isPaging) {
            const from = (options!.page! - 1) * options!.pageSize!;
            const to = from + options!.pageSize! - 1;
            query = query.range(from, to);
        } else {
            query = query.range(0, 4999);
        }

        const { data, error, count } = await query.order('created_at', { ascending: false });

        if (error) return { success: false, error: error.message };

        const result = data as User[] & { total?: number };
        if (isPaging && count !== null) {
            result.total = count;
        }

        return { success: true, data: result };
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

        // Auto-compute face descriptor if avatar is provided (runs in background)
        if (userData.avatar_url && !userData.face_descriptor) {
            computeAndSaveFaceDescriptor(data.id, userData.avatar_url)
                .catch(e => console.warn('Background face compute failed:', e));
        }

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

        // Auto re-compute face descriptor if avatar changed (runs in background)
        // Only if face_descriptor is not explicitly provided in the update
        if (userData.avatar_url && !userData.face_descriptor) {
            computeAndSaveFaceDescriptor(id, userData.avatar_url)
                .catch(e => console.warn('Background face compute failed:', e));
        }

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

async function getEventsWithCounts(): Promise<ApiResponse<{
    events: Event[],
    participantCounts: Record<string, number>,
    checkedInCounts: Record<string, number>
}>> {
    try {
        const cacheKey = 'events_with_counts';
        const cached = getFromCache<any>(cacheKey);
        if (cached) return { success: true, data: cached };

        const eventsResult = await getEvents();
        if (!eventsResult.success || !eventsResult.data) {
            return { success: false, error: eventsResult.error };
        }

        const events = eventsResult.data;
        const eventIds = events.map(e => e.id);

        if (eventIds.length === 0) {
            return { success: true, data: { events, participantCounts: {}, checkedInCounts: {} } };
        }

        // Fetch all participant counts in ONE query
        const { data: pData, error: pError } = await supabase
            .from('event_participants')
            .select('event_id')
            .in('event_id', eventIds);

        // Fetch all check-in counts in ONE query
        const { data: cData, error: cError } = await supabase
            .from('checkins')
            .select('event_id')
            .in('event_id', eventIds);

        const pCounts: Record<string, number> = {};
        const cCounts: Record<string, number> = {};

        eventIds.forEach(id => {
            pCounts[id] = 0;
            cCounts[id] = 0;
        });

        pData?.forEach(row => { if (pCounts[row.event_id] !== undefined) pCounts[row.event_id]++; });
        cData?.forEach(row => { if (cCounts[row.event_id] !== undefined) cCounts[row.event_id]++; });

        const resultData = { events, participantCounts: pCounts, checkedInCounts: cCounts };
        setCache(cacheKey, resultData, 30000); // 30s cache

        return { success: true, data: resultData };
    } catch (err: any) {
        console.error('getEventsWithCounts error:', err);
        return { success: false, error: 'Lỗi tải danh sách sự kiện và thống kê' };
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
    user_id?: string;
    participant_id?: string;
    face_confidence?: number;
    face_verified?: boolean;
    checkin_mode?: 'student' | 'event';
    device_info?: string;
    ip_address?: string;
}): Promise<ApiResponse<{ checkin: EventCheckin; event: Event }>> {
    try {
        if (!data.user_id && !data.participant_id) {
            return { success: false, error: 'Thiếu thông tin người điểm danh' };
        }

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
        let query = supabase.from('checkins').select('id').eq('event_id', data.event_id);

        if (data.participant_id) {
            query = query.eq('participant_id', data.participant_id);
        } else if (data.user_id) {
            query = query.eq('user_id', data.user_id);
        }

        const { data: existingCheckin } = await query.single();

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
                ? (event.points_on_time ?? 10)
                : (event.points_late ?? -5);
        }

        // Create checkin
        const { data: newCheckin, error: checkinError } = await supabase
            .from('checkins')
            .insert({
                event_id: data.event_id,
                user_id: data.user_id || null,
                participant_id: data.participant_id || null,
                checkin_time: checkinTime.toISOString(),
                status,
                face_confidence: data.face_confidence || 0,
                face_verified: data.face_verified || false,
                points_earned: points,
                device_info: data.device_info,
                ip_address: data.ip_address
            })
            .select()
            .single();

        if (checkinError) {
            return { success: false, error: checkinError.message };
        }

        // --- INTEGRATE ACTUAL POINTS ---
        // If checkin_mode is not 'event' (meaning it's a points-enabled checkin), 
        // update the user's total_points and create a notification.
        if (data.checkin_mode !== 'event' && points !== 0) {
            try {
                const reason = status === 'on_time'
                    ? `Tham gia sự kiện "${event.name}" đúng giờ`
                    : `Tham gia sự kiện "${event.name}" muộn`;

                // addPoints already handles total_points update and notification entry
                // Passing 'event' as type and data.event_id for proper tracking
                await addPoints(data.user_id, points, reason, 'event', data.event_id);
            } catch (pErr) {
                console.error('Failed to update points during checkin:', pErr);
            }
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

async function getEventCheckedInCount(eventId: string): Promise<ApiResponse<number>> {
    try {
        const { count, error } = await supabase
            .from('checkins')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', eventId);

        if (error) return { success: false, error: error.message };
        return { success: true, data: count || 0 };
    } catch (err) {
        return { success: false, error: 'Lỗi đếm số lượng người đã check-in' };
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
// Dữ liệu điểm danh nội trú tập trung (LOGS)
interface BoardingCheckinRecord {
    id: string;
    user_id: string;
    date: string;
    // Map động các slot vào đây để UI cũ vẫn chạy được (nếu cần)
    slots?: Record<string, {
        time?: string;
        status?: string;
        name: string;
    }>;
    // Hỗ trợ backward compatibility cho các buổi chính
    morning_in?: string;
    morning_in_status?: string;
    noon_in?: string;
    noon_in_status?: string;
    afternoon_in?: string;
    afternoon_in_status?: string;
    evening_in?: string;
    evening_in_status?: string;
    user?: {
        full_name: string;
        student_code: string;
        organization: string;
    };
    exit_permission: boolean;
    notes?: string;
}

export type CheckinType = 'morning_in' | 'morning_out' | 'noon_in' | 'noon_out' | 'afternoon_in' | 'afternoon_out' | 'evening_in' | 'evening_out' | string;

async function boardingCheckin(
    userId: string,
    slotId: string,
    status: 'on_time' | 'late' = 'on_time'
): Promise<ApiResponse<any>> {
    try {
        const today = getTodayDateStr();
        const now = new Date().toISOString();

        // 1. Lưu vào bảng log duy nhất (boarding_attendance)
        const { data: attendanceData, error: attendanceError } = await supabase
            .from('boarding_attendance')
            .upsert({
                user_id: userId,
                slot_id: slotId,
                date: today,
                checkin_time: now,
                status: status
            }, {
                onConflict: 'user_id, slot_id, date'
            })
            .select()
            .single();

        if (attendanceError) return { success: false, error: attendanceError.message };

        // 2. Xử lý trừ điểm nếu đi muộn (Chỉ trừ nếu chưa có log điểm danh cho slot này trước đó)
        if (status === 'late') {
            // Kiểm tra xem đã trừ điểm cho slot này hôm nay chưa
            // Vì có thể chưa có cột date, ta kiểm tra theo created_at trong khoảng hôm nay
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);

            const { count } = await supabase
                .from('point_logs')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .gte('created_at', startOfToday.toISOString())
                .eq('type', 'boarding_late')
                .ilike('reason', `%${slotId}%`);

            if (!count || count === 0) {
                // Lấy thông tin khung giờ để có tên buổi
                const { data: slotData } = await supabase
                    .from('boarding_time_slots')
                    .select('name')
                    .eq('id', slotId)
                    .single();

                const slotName = slotData?.name || 'Khung giờ';

                const { data: configData } = await supabase
                    .from('system_configs')
                    .select('value')
                    .eq('key', 'points_late_boarding')
                    .single();

                const latePoints = configData ? Math.abs(parseInt(configData.value)) : 2;
                const displayDate = new Date().toLocaleDateString('vi-VN');

                await addPoints(
                    userId,
                    -latePoints,
                    `Điểm danh muộn ${slotName} ngày ${displayDate} (ID: ${slotId})`,
                    'boarding_late'
                );
            }
        }

        return { success: true, data: attendanceData };
    } catch (err: any) {
        console.error('boardingCheckin error:', err);
        return { success: false, error: err.message || 'Lỗi điểm danh' };
    }
}

// Get boarding checkins for reporting
async function getBoardingCheckins(options?: {
    date?: string;
    startDate?: string;
    endDate?: string;
    userId?: string;
}): Promise<ApiResponse<BoardingCheckinRecord[]>> {
    try {
        // 1. Lấy dữ liệu từ bảng log mới
        let query = supabase
            .from('boarding_attendance')
            .select(`
                *,
                user:users!user_id(full_name, student_code, organization),
                slot:boarding_time_slots!slot_id(name, start_time, end_time)
            `)
            .order('date', { ascending: false });

        if (options?.date) query = query.eq('date', options.date);
        if (options?.startDate) query = query.gte('date', options.startDate);
        if (options?.endDate) query = query.lte('date', options.endDate);
        if (options?.userId) query = query.eq('user_id', options.userId);

        const { data: logs, error } = await query;
        if (error) return { success: false, error: error.message };

        // 2. Nhóm dữ liệu theo User và Ngày để UI dễ hiển thị
        const grouped: Record<string, BoardingCheckinRecord> = {};

        logs.forEach((log: any) => {
            const key = `${log.user_id}_${log.date}`;
            if (!grouped[key]) {
                grouped[key] = {
                    id: log.id,
                    user_id: log.user_id,
                    date: log.date,
                    user: log.user,
                    exit_permission: false, // Sẽ lấy từ bảng khác nếu cần
                    slots: {}
                };
            }

            // Gắn vào map slots của bản ghi
            if (grouped[key].slots) {
                grouped[key].slots![log.slot_id] = {
                    time: log.checkin_time,
                    status: log.status,
                    name: log.slot?.name || 'Khung giờ'
                };
            }

            // Backward compatibility cho UI cũ (Sáng/Trưa/Tối)
            const slotName = (log.slot?.name || '').toLowerCase();
            if (slotName.includes('sáng')) {
                grouped[key].morning_in = log.checkin_time;
                grouped[key].morning_in_status = log.status;
            } else if (slotName.includes('trưa')) {
                grouped[key].noon_in = log.checkin_time;
                grouped[key].noon_in_status = log.status;
            } else if (slotName.includes('chiều')) {
                grouped[key].afternoon_in = log.checkin_time;
                grouped[key].afternoon_in_status = log.status;
            } else if (slotName.includes('tối')) {
                grouped[key].evening_in = log.checkin_time;
                grouped[key].evening_in_status = log.status;
            }
        });

        return { success: true, data: Object.values(grouped) };
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
    description?: string;
}

async function getConfigs(): Promise<ApiResponse<SystemConfig[]>> {
    const defaultConfigs: SystemConfig[] = [
        { key: 'school_name', value: 'Trường THPT ABC', description: 'Tên trường hiển thị' },
        { key: 'school_address', value: '123 Đường XYZ', description: 'Địa chỉ trường' },
        { key: 'late_threshold_mins', value: '15', description: 'Ngưỡng đi muộn mặc định (phút)' },
        { key: 'points_on_time', value: '10', description: 'Điểm cộng đúng giờ mặc định' },
        { key: 'points_late', value: '-5', description: 'Điểm trừ đi muộn mặc định' },
        { key: 'points_absent_event', value: '-10', description: 'Điểm trừ vắng mặt sự kiện mặc định' },
        { key: 'start_points', value: '100', description: 'Điểm khởi tạo cho học sinh mới' },
        { key: 'face_threshold', value: '40', description: 'Ngưỡng nhận diện khuôn mặt' }
    ];

    try {
        const { data, error } = await supabase
            .from('system_configs')
            .select('*');

        if (error) {
            console.warn('System configs table might be missing, returning hardcoded defaults');
            return { success: true, data: defaultConfigs };
        }

        // Merge DB data with defaults to ensure all keys are present
        const dbConfigs = data as SystemConfig[];
        const dbKeys = new Set(dbConfigs.map(c => c.key));

        const mergedConfigs = [...dbConfigs];
        for (const def of defaultConfigs) {
            if (!dbKeys.has(def.key)) {
                mergedConfigs.push(def);
            }
        }

        return { success: true, data: mergedConfigs };
    } catch (err: any) {
        return { success: false, error: 'Lỗi tải cấu hình: ' + err.message };
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
    try {
        const defaults = [
            { key: 'school_name', value: 'Trường THPT ABC', description: 'Tên trường hiển thị' },
            { key: 'school_address', value: '123 Đường XYZ', description: 'Địa chỉ trường' },
            { key: 'late_threshold_mins', value: '15', description: 'Ngưỡng đi muộn mặc định (phút)' },
            { key: 'points_on_time', value: '10', description: 'Điểm cộng đúng giờ mặc định' },
            { key: 'points_late', value: '-5', description: 'Điểm trừ đi muộn mặc định' },
            { key: 'points_absent_event', value: '-10', description: 'Điểm trừ vắng mặt sự kiện mặc định' },
            { key: 'start_points', value: '100', description: 'Điểm khởi tạo cho học sinh mới' },
            { key: 'face_threshold', value: '40', description: 'Ngưỡng nhận diện khuôn mặt' }
        ];

        for (const config of defaults) {
            await supabase
                .from('system_configs')
                .upsert(config, { onConflict: 'key' });
        }

        return { success: true, message: 'Hệ thống đã được khởi tạo và cập nhật cấu hình mặc định' };
    } catch (err: any) {
        return { success: false, error: 'Lỗi khởi tạo hệ thống: ' + err.message };
    }
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

async function getPointLogs(userId?: string): Promise<ApiResponse<PointLog[]>> {
    try {
        // Now fetching from notifications table (type: 'points') to unify storage
        let query = supabase
            .from('notifications')
            .select('*')
            .eq('type', 'points')
            .order('created_at', { ascending: false })
            .limit(100);

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('getPointLogs error:', error);
            return { success: false, error: error.message };
        }

        // Map notification records to PointLog format for backward compatibility
        const logs: PointLog[] = (data || []).map(n => ({
            id: n.id,
            user_id: n.user_id,
            points: n.metadata?.points || 0,
            reason: n.message,
            type: n.metadata?.type || 'manual', // or other types stored in metadata
            created_at: n.created_at,
            created_by: n.metadata?.created_by || ''
        }));

        return { success: true, data: logs };
    } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi tải lịch sử điểm' };
    }
}

async function addPoints(userId: string, points: number, reason: string, type: string = 'manual', eventId?: string): Promise<ApiResponse<void>> {
    try {
        const user = getStoredUser();
        // Don't fail the whole operation if no logged-in user (e.g. automated check-in machine)
        const creatorId = user?.id || userId; // Fallback to student ID as creator if system-triggered

        console.log(`[Points] Updating ${points} points for user ${userId}. Reason: ${reason}, Type: ${type}`);

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

            if (fetchError) throw new Error('Không thể lấy thông tin điểm người dùng: ' + fetchError.message);

            const currentPoints = userData.total_points ?? 0;
            const newPoints = currentPoints + points;

            console.log(`[Points] Manual update for ${userId}: ${currentPoints} -> ${newPoints}`);

            // Update new points
            const { error: updateError } = await supabase
                .from('users')
                .update({ total_points: newPoints })
                .eq('id', userId);

            if (updateError) throw new Error('Lỗi cập nhật điểm (Manual Update): ' + updateError.message);
        }

        // 3. Create notification for the student (Primary History)
        const isAuto = type.includes('boarding_') || type.includes('event_');
        const autoLabel = isAuto ? ' (Tự động)' : '';

        const notifTitle = points >= 0 ? `+${points} điểm${autoLabel}` : `${points} điểm${autoLabel}`;
        const notifMessage = points >= 0
            ? `Bạn được cộng ${points} điểm. Lý do: ${reason}${autoLabel}`
            : `Bạn bị trừ ${Math.abs(points)} điểm. Lý do: ${reason}${autoLabel}`;

        // Map types to specific categories for reporting
        let finalType = type;
        if (type === 'manual') {
            finalType = points >= 0 ? 'manual_add' : 'manual_deduct';
        }

        // Record in point_logs for compatibility with other legacy views
        const { error: logError } = await supabase.from('point_logs').insert({
            user_id: userId,
            points: points,
            reason: reason,
            type: finalType,
            created_by: creatorId,
            event_id: eventId // Pass eventId if available
        });

        if (logError) {
            console.error('Point Log insertion failed:', logError);
            // Don't throw here, prioritize the user update and notification
        }

        const { error: notifError } = await supabase.from('notifications').insert({
            user_id: userId,
            type: 'points',
            title: notifTitle,
            message: notifMessage,
            is_read: false,
            metadata: {
                points,
                reason: reason,
                created_by: creatorId,
                type: finalType,
                event_id: eventId
            }
        });

        if (notifError) {
            console.error('Notification creation failed:', notifError);
        }

        return { success: true, message: `Đã ${points >= 0 ? 'cộng' : 'trừ'} ${Math.abs(points)} điểm` };
    } catch (err: any) {
        console.error('addPoints error:', err);
        return { success: false, error: err.message || 'Lỗi hệ thống khi cộng điểm' };
    }
}

async function deductPoints(userId: string, points: number, reason: string): Promise<ApiResponse<void>> {
    return addPoints(userId, -points, reason);
}

// =====================================================
// NOTIFICATIONS API
// =====================================================
interface UserNotification {
    id: string;
    user_id: string;
    type: string;
    title: string;
    message: string;
    is_read: boolean;
    created_at: string;
    metadata?: any;
}

async function getNotifications(userId: string, limit: number = 20): Promise<ApiResponse<UserNotification[]>> {
    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('getNotifications error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data || [] };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

async function markNotificationsRead(userId: string, notificationIds?: string[]): Promise<ApiResponse<void>> {
    try {
        let query = supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', userId);

        if (notificationIds && notificationIds.length > 0) {
            query = query.in('id', notificationIds);
        }

        const { error } = await query;

        if (error) {
            console.error('markNotificationsRead error:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Đăng ký lắng nghe thông báo thời gian thực
 */
function subscribeToNotifications(userId: string, callback: (payload: any) => void) {
    return supabase
        .channel(`notifications:user_id=eq.${userId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${userId}`
            },
            (payload) => {
                callback(payload);
            }
        )
        .subscribe();
}

/**
 * Đăng ký lắng nghe đơn xin phép ra ngoài mới (cho Admin)
 */
function subscribeToExitPermissions(callback: (payload: any) => void) {
    return supabase
        .channel('admin:exit_permissions')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'exit_permissions'
            },
            (payload) => {
                callback(payload);
            }
        )
        .subscribe();
}

/**
 * Lấy số lượng đơn xin phép đang chờ duyệt
 */
async function getPendingExitPermissionsCount(): Promise<ApiResponse<number>> {
    try {
        const { count, error } = await supabase
            .from('exit_permissions')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        if (error) throw error;
        return { success: true, data: count || 0 };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
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
    on_time_count?: number;
    late_count?: number;
    absent_count?: number;
    // For Class Ranking
    student_count?: number;
    average_points?: number;
}

async function getRanking(options?: {
    type?: 'student' | 'class';
    role?: string;
    limit?: number;
    page?: number;
    organization?: string;
}): Promise<ApiResponse<RankingUser[]>> {
    try {
        const type = options?.type || 'student';
        const limit = options?.limit || 50;
        const page = options?.page || 0;
        const offset = page * limit;

        const cacheKey = `ranking_${type}_${options?.role || 'all'}_${options?.organization || 'all'}_${page}`;
        const cached = getFromCache<RankingUser[]>(cacheKey);
        if (cached) return { success: true, data: cached };

        if (type === 'student') {
            let query = supabase
                .from('users')
                .select('id, full_name, class_id, organization, avatar_url, total_points')
                .order('total_points', { ascending: false })
                .range(offset, offset + limit - 1);

            if (options?.role) {
                query = query.eq('role', options.role);
            }

            if (options?.organization) {
                query = query.eq('organization', options.organization);
            }

            const { data, error } = await query;
            if (error) return { success: false, error: error.message };

            // Fetch attendance stats
            const userIds = (data || []).map(u => u.id);
            const { data: attendanceData } = await supabase
                .from('boarding_attendance')
                .select('user_id, status')
                .in('user_id', userIds);

            const attendanceMap: Record<string, { on_time: number, late: number, absent: number }> = {};
            userIds.forEach(uid => {
                attendanceMap[uid] = { on_time: 0, late: 0, absent: 0 };
            });

            attendanceData?.forEach(log => {
                if (attendanceMap[log.user_id]) {
                    if (log.status === 'on_time') attendanceMap[log.user_id].on_time++;
                    else if (log.status === 'late') attendanceMap[log.user_id].late++;
                    else if (log.status === 'absent' || log.status === 'excused') attendanceMap[log.user_id].absent++;
                }
            });

            const rankedData = (data || []).map((user, index) => ({
                ...user,
                rank: offset + index + 1,
                on_time_count: attendanceMap[user.id]?.on_time || 0,
                late_count: attendanceMap[user.id]?.late || 0,
                absent_count: attendanceMap[user.id]?.absent || 0
            }));

            setCache(cacheKey, rankedData, 30000); // 30s cache
            return { success: true, data: rankedData as RankingUser[] };
        } else {
            // Class Ranking: Group by organization
            const { data, error } = await supabase
                .from('users')
                .select('organization, total_points')
                .eq('role', 'student')
                .not('organization', 'is', null);

            if (error) return { success: false, error: error.message };

            // Manual grouping
            const classMap: Record<string, { name: string, total: number, count: number }> = {};
            data?.forEach(u => {
                const org = u.organization;
                if (!classMap[org]) {
                    classMap[org] = { name: org, total: 0, count: 0 };
                }
                classMap[org].total += u.total_points || 0;
                classMap[org].count++;
            });

            const classList = Object.values(classMap).map(c => ({
                id: c.name,
                full_name: c.name,
                total_points: c.total,
                student_count: c.count,
                average_points: Math.round((c.total / c.count) * 10) / 10
            })).sort((a, b) => b.average_points - a.average_points);

            const result = classList.slice(offset, offset + limit).map((c, i) => ({
                ...c,
                rank: offset + i + 1
            })) as any;

            setCache(cacheKey, result, 30000); // 30s cache
            return {
                success: true,
                data: result
            };
        }
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Lấy lịch sử giao dịch điểm chi tiết
 */
async function getDetailedPointLogs(options: {
    limit?: number;
    offset?: number;
    userId?: string;
    range?: 'day' | 'week' | 'month';
}): Promise<ApiResponse<any[]>> {
    try {
        const limit = options.limit || 20;
        const offset = options.offset || 0;

        let query = supabase
            .from('point_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (options.userId) {
            query = query.eq('user_id', options.userId);
        }

        if (options.range) {
            const startDate = new Date();
            if (options.range === 'day') startDate.setHours(0, 0, 0, 0);
            else if (options.range === 'week') startDate.setDate(startDate.getDate() - 7);
            else if (options.range === 'month') startDate.setMonth(startDate.getMonth() - 1);
            query = query.gte('created_at', startDate.toISOString());
            console.log('getDetailedPointLogs range filter:', startDate.toISOString());
        }

        const { data: logs, error } = await query;
        console.log('getDetailedPointLogs logs result:', { count: logs?.length, error });

        if (error) throw error;
        if (!logs || logs.length === 0) return { success: true, data: [] };

        // Manual Join for Users
        const userIds = [...new Set(logs.map((log: any) => log.user_id).filter(Boolean))];
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('id, full_name, student_code, organization, avatar_url')
            .in('id', userIds);

        if (userError) console.error('Error fetching users for logs:', userError);

        const userMap = new Map(users?.map((u: any) => [u.id, u]) || []);

        const enrichedLogs = logs.map((log: any) => ({
            ...log,
            user: userMap.get(log.user_id) || null
        }));

        return { success: true, data: enrichedLogs };
    } catch (err: any) {
        return { success: false, error: err.message };
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
    status: 'on_time' | 'late' | 'absent' | 'excused';
    face_confidence?: number;
    face_verified?: boolean;
    points_earned?: number;
}

export type CheckinStatus = 'on_time' | 'late' | 'absent' | 'excused';

interface EventReport {
    event: Event;
    totalParticipants: number;
    totalCheckins: number;
    onTimeCount: number;
    lateCount: number;
    absentCount: number;
    excusedCount: number; // Added field
    checkins: Checkin[];
}

async function getEventReport(eventId: string): Promise<ApiResponse<EventReport>> {
    try {
        // 1. Get Event Details
        const { data: event, error: eventError } = await supabase.from('events').select('*').eq('id', eventId).single();
        if (eventError || !event) return { success: false, error: 'Không tìm thấy sự kiện' };

        // 2. Get Participants, Checkins, Leaves and Point Logs in parallel
        const [participantsRes, checkinsRes, excusedRes, logsRes] = await Promise.all([
            // Get Participants with user_id
            supabase.from('event_participants')
                .select('id, user_id, full_name, organization')
                .eq('event_id', eventId),

            // Get Checkins
            supabase.from('checkins')
                .select('id, participant_id, user_id, checkin_time, status, points_earned')
                .eq('event_id', eventId),

            // Get Approved Exit Permissions (Excused Leaves)
            supabase.from('exit_permissions')
                .select('user_id, exit_time, return_time')
                .eq('status', 'approved')
                .lte('exit_time', event.start_time)
                .gte('return_time', event.start_time),

            // Get Point Logs for this event (Processed Absences)
            supabase.from('point_logs')
                .select('user_id, points')
                .eq('event_id', eventId)
                .eq('type', 'event_absence')
        ]);

        const participants = (participantsRes.data || []) as any[];
        const rawCheckins = (checkinsRes.data || []) as any[];
        const approvedLeaves = (excusedRes.data || []) as any[];
        const absenceLogs = (logsRes.data || []) as any[];

        // Create fast lookup maps
        const checkinMap = new Map(rawCheckins.map(c => [c.participant_id, c]));
        const leavesSet = new Set(approvedLeaves.map(l => l.user_id));
        const absencePointsMap = new Map(absenceLogs.map(l => [l.user_id, l.points]));

        // Enrich ALL participants
        const fullCheckinsList: (Checkin & { user_id?: string; user_name: string; class_id: string })[] = participants.map(p => {
            const checkin = checkinMap.get(p.id);
            if (checkin) {
                return {
                    ...checkin,
                    user_id: p.user_id,
                    user_name: p.full_name,
                    class_id: p.organization
                };
            } else {
                // Is this person excused?
                const isExcused = p.user_id && leavesSet.has(p.user_id);
                // Did they get points deducted for absence already?
                const pointsEarned = p.user_id ? (absencePointsMap.get(p.user_id) || 0) : 0;

                return {
                    id: `absent_${p.id}`,
                    event_id: eventId,
                    participant_id: p.id,
                    user_id: p.user_id,
                    user_name: p.full_name,
                    class_id: p.organization,
                    checkin_time: null,
                    status: isExcused ? 'excused' : 'absent',
                    points_earned: pointsEarned, // Now showing actual deducted points
                    image_url: null
                } as any;
            }
        });

        const onTimeCount = fullCheckinsList.filter(c => c.status === 'on_time').length;
        const lateCount = fullCheckinsList.filter(c => c.status === 'late').length;
        const absentCount = fullCheckinsList.filter(c => c.status === 'absent').length;
        const excusedCount = fullCheckinsList.filter(c => c.status === 'excused').length;

        return {
            success: true,
            data: {
                event: event as Event,
                totalParticipants: participants.length,
                totalCheckins: rawCheckins.length,
                onTimeCount,
                lateCount,
                absentCount,
                excusedCount, // NEW: extra count for UI
                checkins: fullCheckinsList
            } as any
        };
    } catch (err: any) {
        console.error('Report Error:', err);
        return { success: false, error: err.message || 'Lỗi tải báo cáo sự kiện' };
    }
}

// =====================================================
// CERTIFICATES API
// =====================================================


async function getCertificates(userId?: string): Promise<ApiResponse<Certificate[]>> {
    try {
        let query = supabase
            .from('certificates')
            .select('*, user:users(id, full_name)')
            .order('issued_date', { ascending: false });

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data, error } = await query;

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

        // --- ADD SYSTEM NOTIFICATION ---
        try {
            const notifTitle = action === 'approved' ? 'Đơn xin phép được DUYỆT' : 'Đơn xin phép bị TỪ CHỐI';
            const notifMessage = action === 'approved'
                ? `Đơn xin nghỉ ngày ${new Date(updatedRecord.exit_time).toLocaleDateString('vi-VN')} của bạn đã được phê duyệt.`
                : `Đơn xin nghỉ ngày ${new Date(updatedRecord.exit_time).toLocaleDateString('vi-VN')} đã bị từ chối.${rejectionReason ? ' Lý do: ' + rejectionReason : ''}`;

            await supabase.from('notifications').insert({
                user_id: updatedRecord.user_id,
                type: action, // 'approved' or 'rejected'
                title: notifTitle,
                message: notifMessage,
                is_read: false,
                metadata: { permission_id: id, status: action }
            });
        } catch (notifErr) {
            console.error('Failed to create exit permission notification:', notifErr);
        }

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
    storeUser,

    // Users
    getUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser,

    // Events
    getEvents,
    getEventsWithCounts,
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
    getEventCheckedInCount,
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

    // Notifications
    getNotifications,
    markNotificationsRead,
    subscribeToNotifications,

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
    subscribeToExitPermissions,
    getPendingExitPermissionsCount,

    // Absent & Late Processing
    processAbsentStudents,
    getLateStudents,
    processLateStudents,
    processEventAbsence,
    getPointStatistics,
    getDetailedPointLogs,

    // Cache
    clearCache,
    getAllStudentsForCheckin, // Export new function

    // Face ID
    batchComputeFaceDescriptors,
    computeAndSaveFaceDescriptor,
    onFaceComputeComplete,
    getFaceComputeStatus,
    getPendingFaceComputes
};

/**
 * Process absent students for a specific date and slot.
 * Deducts points for students who:
 * 1. Didn't check in for the specified slot
 * 2. Don't have an approved exit permission for that date
 */
/**
 * Process absent students for a specific date and slot.
 */
async function processAbsentStudents(
    targetDate: string,
    slotId: string
): Promise<ApiResponse<{
    processed: number;
    pointsDeducted: number;
    students: { name: string; code: string; organization: string }[]
}>> {
    try {
        const { data: slot } = await supabase
            .from('boarding_time_slots')
            .select('*')
            .eq('id', slotId)
            .single();

        if (!slot) return { success: false, error: 'Không tìm thấy khung giờ' };

        const configsRes = await getConfigs();
        let absentPoints = 10;
        if (configsRes.success && configsRes.data) {
            const config = configsRes.data.find(c => c.key === 'points_absent_boarding');
            if (config) absentPoints = Math.abs(parseInt(config.value) || 10);
        }

        const { data: attendance } = await supabase
            .from('boarding_attendance')
            .select('user_id')
            .eq('slot_id', slotId)
            .eq('date', targetDate);

        const checkedInUsers = new Set(attendance?.map(a => a.user_id) || []);
        const studentsRes = await getAllStudentsForCheckin(false);
        if (!studentsRes.success || !studentsRes.data) return { success: false, error: 'Không tải được danh sách học sinh' };

        const permissionsRes = await getExitPermissions({
            startDate: targetDate,
            endDate: targetDate,
            status: 'approved'
        });

        const excusedUsers = new Set<string>();
        if (permissionsRes.success && permissionsRes.data) {
            for (const perm of permissionsRes.data) {
                const exitDate = new Date(perm.exit_time).toISOString().split('T')[0];
                const returnDate = new Date(perm.return_time).toISOString().split('T')[0];
                if (targetDate >= exitDate && targetDate <= returnDate) {
                    excusedUsers.add(perm.user_id);
                }
            }
        }

        const absentStudents: { name: string; code: string; organization: string }[] = [];
        for (const student of studentsRes.data) {
            if (!checkedInUsers.has(student.id) && !excusedUsers.has(student.id)) {
                absentStudents.push({
                    name: student.full_name,
                    code: student.student_code || '',
                    organization: student.organization || ''
                });

                await deductPoints(
                    student.id,
                    absentPoints,
                    `Vắng điểm danh ${slot.name} ngày ${targetDate}`
                );
            }
        }

        return {
            success: true,
            data: {
                processed: absentStudents.length,
                pointsDeducted: absentPoints,
                students: absentStudents
            },
            message: `Đã xử lý ${absentStudents.length} học sinh vắng ${slot.name}`
        };
    } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi xử lý vắng' };
    }
}

/**
 * Get list of students who checked in late for a specific date and slot.
 */
async function getLateStudents(
    targetDate: string,
    slotId: string
): Promise<ApiResponse<{
    students: { id: string; name: string; code: string; organization: string; checkinTime: string }[];
    pointsDeducted: number;
}>> {
    try {
        const configsRes = await getConfigs();
        let latePoints = 2;
        if (configsRes.success && configsRes.data) {
            const config = configsRes.data.find(c => c.key === 'points_late_boarding');
            if (config) latePoints = Math.abs(parseInt(config.value) || 2);
        }

        const { data: logs, error } = await supabase
            .from('boarding_attendance')
            .select(`
                user_id,
                checkin_time,
                status,
                user:users!user_id(full_name, student_code, organization)
            `)
            .eq('slot_id', slotId)
            .eq('date', targetDate)
            .eq('status', 'late');

        if (error) return { success: false, error: error.message };

        const formatted = logs?.map((log: any) => ({
            id: log.user_id,
            name: log.user?.full_name || '',
            code: log.user?.student_code || '',
            organization: log.user?.organization || '',
            checkinTime: log.checkin_time
        })) || [];

        return {
            success: true,
            data: {
                students: formatted,
                pointsDeducted: latePoints
            }
        };
    } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi lấy DS đi muộn' };
    }
}

/**
 * Manually process late students for a specific date and slot.
 */
async function processLateStudents(
    targetDate: string,
    slotId: string
): Promise<ApiResponse<{
    processed: number;
    pointsDeducted: number;
    students: { id: string; name: string; code: string; organization: string; checkinTime: string }[]
}>> {
    try {
        const slotRes = await supabase.from('boarding_time_slots').select('name').eq('id', slotId).single();
        const slotName = slotRes.data?.name || 'Khung giờ';

        const lateRes = await getLateStudents(targetDate, slotId);
        if (!lateRes.success || !lateRes.data) return { success: false, error: 'Không tải được danh sách trễ' };

        return {
            success: true,
            data: {
                processed: lateRes.data.students.length,
                pointsDeducted: lateRes.data.pointsDeducted,
                students: lateRes.data.students
            },
            message: `Hệ thống đã tự động trừ điểm cho ${lateRes.data.students.length} học sinh muộn ${slotName}`
        };
    } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi xử lý trễ' };
    }
}

/**
 * Xử lý chốt vắng mặt cho sự kiện
 */
async function processEventAbsence(eventId: string, absentPoints: number = -10, selectedUserIds?: string[]): Promise<ApiResponse<void>> {
    try {
        const { data: event, error: eventErr } = await supabase
            .from('events')
            .select('name')
            .eq('id', eventId)
            .single();

        if (eventErr || !event) throw new Error('Không tìm thấy sự kiện');

        const { data: absentStudents, error: absentErr } = await supabase
            .from('event_participants')
            .select('user_id')
            .eq('event_id', eventId)
            .not('user_id', 'is', null);

        if (absentErr) throw new Error(absentErr.message);

        const { data: checkinData, error: checkinErr } = await supabase
            .from('checkins')
            .select('participant_id')
            .eq('event_id', eventId);

        if (checkinErr) throw new Error(checkinErr.message);

        const checkedInIds = new Set(checkinData?.map(c => c.participant_id).filter(Boolean));
        let actuallyAbsent = absentStudents?.filter(s => !checkedInIds.has(s.user_id)) || [];

        if (selectedUserIds && selectedUserIds.length > 0) {
            const selectedSet = new Set(selectedUserIds);
            actuallyAbsent = actuallyAbsent.filter(s => selectedSet.has(s.user_id));
        }

        if (actuallyAbsent.length === 0) {
            return { success: true, message: 'Không có học sinh nào vắng mặt' };
        }

        const reason = `Vắng mặt sự kiện "${event.name}"`;
        for (const student of actuallyAbsent) {
            await addPoints(student.user_id, absentPoints, reason, 'event_absence', eventId);
        }

        return { success: true, message: `Đã xử lý vắng mặt cho ${actuallyAbsent.length} học sinh.` };
    } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi xử lý vắng mặt sự kiện' };
    }
}

/**
 * Lấy dữ liệu thống kê điểm số
 */
async function getPointStatistics(options: {
    range: 'day' | 'week' | 'month';
    userId?: string;
}): Promise<ApiResponse<any>> {
    try {
        const cacheKey = `point_stats_${options.range}_${options.userId || 'all'}`;
        const cached = getFromCache<any>(cacheKey);
        if (cached) return { success: true, data: cached };

        const now = new Date();
        let startDate = new Date();

        if (options.range === 'day') startDate.setHours(0, 0, 0, 0);
        else if (options.range === 'week') startDate.setDate(now.getDate() - 7);
        else if (options.range === 'month') startDate.setMonth(now.getMonth() - 1);

        let query = supabase
            .from('point_logs')
            .select('points, type, created_at')
            .gte('created_at', startDate.toISOString());

        if (options.userId) query = query.eq('user_id', options.userId);

        const { data, error } = await query;
        if (error) throw error;

        // Ensure we handle potential null/undefined data
        const logs = data || [];

        const totalPoints = logs.reduce((sum, log) => sum + (log.points || 0), 0);
        const totalAdded = logs.filter(log => (log.points || 0) > 0).reduce((sum, log) => sum + log.points, 0);
        const totalDeducted = logs.filter(log => (log.points || 0) < 0).reduce((sum, log) => sum + Math.abs(log.points), 0);

        // Group by category
        const byCategory = {
            boarding: 0,
            event: 0,
            manual: 0
        };

        logs.forEach(log => {
            const p = log.points || 0;
            const t = log.type || '';
            if (t.startsWith('boarding_')) {
                byCategory.boarding += p;
            } else if (t.startsWith('event_')) {
                byCategory.event += p;
            } else {
                byCategory.manual += p;
            }
        });

        const resultData = {
            totalPoints,
            totalAdded,
            totalDeducted,
            byCategory,
            logsCount: logs.length,
            range: options.range
        };

        setCache(cacheKey, resultData, 30000); // 30s cache
        return {
            success: true,
            data: resultData
        };
    } catch (err: any) {
        console.error('getPointStatistics error:', err);
        return { success: false, error: err.message || 'Lỗi tải thống kê điểm' };
    }
}
