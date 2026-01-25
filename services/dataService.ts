/**
 * EduCheck Data Service v3.0 - Supabase Edition
 * Fast, reliable database operations using PostgreSQL
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { User, Event, EventCheckin, EventParticipant, BoardingConfig, BoardingTimeSlot, Certificate, PointLog } from '../types';
import { faceService, descriptorToString, base64ToImage } from './faceService';

// =====================================================
// CACHING SYSTEM (kept for offline support)
// =====================================================
interface CacheItem<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

// =====================================================
// OFFLINE ENGINE
// =====================================================
interface OfflineRecord {
    id: string;
    type: 'checkin' | 'point_log' | 'attendance';
    data: any;
    timestamp: number;
}

const OFFLINE_QUEUE_KEY = 'educheck_offline_queue';

function getOfflineQueue(): OfflineRecord[] {
    const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return stored ? JSON.parse(stored) : [];
}

function addToOfflineQueue(record: Omit<OfflineRecord, 'id' | 'timestamp'>): void {
    const queue = getOfflineQueue();

    // Duplication Check: Prevent adding the exact same check-in/attendance twice while offline
    const isDuplicate = queue.some(item => {
        if (item.type !== record.type) return false;
        if (record.type === 'attendance') {
            return item.data.userId === record.data.userId && item.data.slotId === record.data.slotId;
        }
        if (record.type === 'checkin') {
            return (item.data.user_id && item.data.user_id === record.data.user_id && item.data.event_id === record.data.event_id) ||
                (item.data.participant_id && item.data.participant_id === record.data.participant_id && item.data.event_id === record.data.event_id);
        }
        return JSON.stringify(item.data) === JSON.stringify(record.data);
    });

    if (isDuplicate) {
        console.warn(`📦 [Offline] Duplicate record ignored for type ${record.type}`);
        return;
    }

    queue.push({
        ...record,
        id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        timestamp: Date.now()
    });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    console.log(`📦 [Offline] Added record to queue. Current size: ${queue.length}`);
}

function isDuplicatePending(type: OfflineRecord['type'], data: any): boolean {
    const queue = getOfflineQueue();
    return queue.some(item => {
        if (item.type !== type) return false;
        if (type === 'attendance') {
            return item.data.userId === data.userId && item.data.slotId === data.slotId;
        }
        if (type === 'checkin') {
            return (item.data.user_id && item.data.user_id === data.user_id && item.data.event_id === data.event_id) ||
                (item.data.participant_id && item.data.participant_id === data.participant_id && item.data.event_id === data.event_id);
        }
        return JSON.stringify(item.data) === JSON.stringify(data);
    });
}

async function syncOfflineData(): Promise<{ success: number; failed: number }> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return { success: 0, failed: 0 };

    const queue = getOfflineQueue();
    if (queue.length === 0) return { success: 0, failed: 0 };

    console.log(`🔄 [Offline] Syncing ${queue.length} records...`);
    let successCount = 0;
    let failedCount = 0;
    const remainingQueue: OfflineRecord[] = [];

    // Process one by one to avoid overwhelming or race conditions
    for (const record of queue) {
        try {
            let res: any;
            if (record.type === 'checkin') {
                res = await checkin(record.data);
            } else if (record.type === 'point_log') {
                res = await addPoints(record.data.userId, record.data.points, record.data.reason, record.data.type, record.data.eventId);
            } else if (record.type === 'attendance') {
                res = await boardingCheckin(record.data.userId, record.data.slotId, record.data.status);
            }

            if (res && (res.success || res.alreadyExists || (res.error && (res.error.includes('already exists') || res.error.includes('đã check-in'))))) {
                successCount++;
                console.log(`✅ [Offline] Sync success for record ${record.id} (${record.type})`);
            } else {
                console.warn(`⚠️ [Offline] Sync failed for record ${record.id}. Will retry. Error: ${res?.error}`);
                remainingQueue.push(record);
            }
        } catch (e) {
            console.error(`❌ [Offline] Sync error for record ${record.id}:`, e);
            failedCount++;
            remainingQueue.push(record);
        }
    }

    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));

    if (successCount > 0) {
        console.log(`✅ [Offline] Synced ${successCount} records. ${remainingQueue.length} remaining.`);
    }

    return { success: successCount, failed: failedCount };
}

function getOfflineQueueLength(): number {
    return getOfflineQueue().length;
}

// Listen for network changes
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        console.log('🌐 [Network] Back online. Triggering sync...');
        syncOfflineData();
    });
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
    alreadyExists?: boolean;
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

        // Auto-clear status after 30 seconds (longer for user to see)
        setTimeout(() => pendingFaceComputes.delete(userId), 30000);

        // Notify callback
        options?.onComplete?.(result);

        // Notify all listeners
        faceComputeListeners.forEach(listener => listener(userId, result));

        return result;
    };

    // Small delay to ensure DB/Storage is settled
    await new Promise(resolve => setTimeout(resolve, 800));

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

            console.log(`📸 [FaceCompute] Attempting to load image from: ${avatarUrl.substring(0, 100)}...`);

            try {
                img = await base64ToImage(avatarUrl);
                console.log(`✅ [FaceCompute] Image loaded successfully (${img.width}x${img.height})`);
            } catch (loadError: any) {
                console.warn(`🔄 [FaceCompute] Direct load failed, trying with cache buster:`, loadError.message);
                // Try adding a cache buster if it's a URL
                if (avatarUrl.startsWith('http')) {
                    const separator = avatarUrl.includes('?') ? '&' : '?';
                    const proxiedUrl = `${avatarUrl}${separator}t=${Date.now()}`;
                    img = await base64ToImage(proxiedUrl);
                    console.log(`✅ [FaceCompute] Image loaded with cache buster`);
                } else {
                    throw loadError;
                }
            }

            console.log(`🔄 [FaceCompute] Analyzing image for faces...`);

            // Detect face
            const descriptor = await faceService.getFaceDescriptor(img);

            if (descriptor) {
                const descriptorStr = descriptorToString(descriptor);
                console.log(`✅ [FaceCompute] Face detected (length: ${descriptor.length}). Saving to database...`);

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

                    // Update in-memory matcher with the correct name
                    try {
                        const { data: userData } = await supabase
                            .from('users')
                            .select('full_name')
                            .eq('id', userId)
                            .single();

                        const userName = userData?.full_name || 'Học sinh';
                        faceService.faceMatcher.addFace(userId, descriptor, userName);
                        console.log(`📡 [FaceCompute] Matcher updated for: ${userName}`);
                    } catch (e) {
                        faceService.faceMatcher.addFace(userId, descriptor, 'Học sinh');
                    }

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
 * Background task to compute face descriptor for an event participant and save it
 */
async function computeAndSaveParticipantFaceDescriptor(
    participantId: string,
    avatarUrl: string,
    retryCount = 0,
    options?: { onComplete?: (result: { success: boolean; error?: string }) => void }
): Promise<ApiResponse<void>> {
    const notifyResult = (result: { success: boolean; error?: string }) => {
        options?.onComplete?.(result);
        faceComputeListeners.forEach(listener => listener(`participant_${participantId}`, result));
        return result;
    };

    try {
        if (!avatarUrl || avatarUrl.trim() === '') return notifyResult({ success: false, error: 'Không có ảnh' });

        await new Promise(resolve => setTimeout(resolve, 800));

        let img: HTMLImageElement;
        console.log(`📸 [ParticipantFaceCompute] Loading: ${avatarUrl.substring(0, 100)}...`);

        try {
            img = await base64ToImage(avatarUrl);
        } catch (loadError: any) {
            if (avatarUrl.startsWith('http')) {
                const separator = avatarUrl.includes('?') ? '&' : '?';
                img = await base64ToImage(`${avatarUrl}${separator}t=${Date.now()}`);
            } else throw loadError;
        }

        console.log(`🔄 [ParticipantFaceCompute] Analyzing...`);
        const descriptor = await faceService.getFaceDescriptor(img);

        if (descriptor) {
            const { error } = await supabase
                .from('event_participants')
                .update({ face_descriptor: descriptorToString(descriptor) })
                .eq('id', participantId);

            if (error) return notifyResult({ success: false, error: error.message });

            console.log(`✅ [ParticipantFaceCompute] SUCCESS for ${participantId}`);

            // Sync with memory
            try {
                const { data: pData } = await supabase.from('event_participants').select('full_name').eq('id', participantId).single();
                faceService.faceMatcher.addFace(participantId, descriptor, pData?.full_name || 'Người tham gia');
            } catch (e) { }

            return notifyResult({ success: true });
        } else {
            return notifyResult({ success: false, error: 'Không tìm thấy khuôn mặt' });
        }
    } catch (e: any) {
        console.error(`❌ [ParticipantFaceCompute] Error:`, e.message);
        if (retryCount < 2) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            return computeAndSaveParticipantFaceDescriptor(participantId, avatarUrl, retryCount + 1, options);
        }
        return notifyResult({ success: false, error: e.message });
    }
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

        // Convert empty strings to null for UUID/Foreign Key fields
        const sanitizedRest = { ...rest };
        if (sanitizedRest.room_id === '') sanitizedRest.room_id = null;
        if (sanitizedRest.class_id === '') sanitizedRest.class_id = null;

        const { data, error } = await supabase
            .from('users')
            .insert({
                ...sanitizedRest,
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

        // Force clear face_descriptor if avatar_url is being updated but face_descriptor is NOT explicitly provided
        // This prevents "stale" face recognition if the new portrait analysis fails or is still pending
        if (userData.avatar_url && !userData.face_descriptor) {
            updatePayload.face_descriptor = null;
        }

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
        // If avatar_url is provided, we ALWAYS re-compute to ensure Face ID matches the new image
        if (userData.avatar_url) {
            console.log(`📸 [updateUser] Avatar changed for user ${id}, clearing old Face ID and triggering re-computation...`);

            // Proactively remove from in-memory matcher
            faceService.faceMatcher.removeFace(id);

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

        // OFFLINE SUPPORT
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            if (isDuplicatePending('checkin', data)) {
                return {
                    success: true,
                    message: 'Bạn đã check-in rồi (Offline)',
                    alreadyExists: true
                } as any;
            }
            console.log(`📡 [Offline] No network. Queuing event check-in for id: ${data.user_id || data.participant_id}`);
            addToOfflineQueue({
                type: 'checkin',
                data: data
            });

            // Return a "pseudo-success" structure
            return {
                success: true,
                message: 'Đã lưu ngoại tuyến. Sẽ đồng bộ khi có mạng.',
                alreadyExists: false,
                data: {
                    checkin: {
                        id: `offline_${Date.now()}`,
                        event_id: data.event_id,
                        user_id: data.user_id || '',
                        participant_id: data.participant_id || '',
                        checkin_time: new Date().toISOString(),
                        status: 'on_time', // Assume on_time, will be corrected on server
                        points_earned: 0
                    } as any,
                    event: { id: data.event_id, start_time: new Date().toISOString() } as any
                }
            } as any;
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
            return {
                success: true,
                message: 'Bạn đã check-in sự kiện này rồi',
                alreadyExists: true
            } as any;
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
                id, event_id, full_name, avatar_url, birth_date, organization, address, student_code, qr_code, face_descriptor, user_id,
                user:users!user_id (
                    face_descriptor,
                    avatar_url,
                    student_code
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
                student_code: p.student_code || null,
                qr_code: p.qr_code || null,
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
                        student_code: p.student_code,
                        qr_code: p.qr_code,
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

        // For participants without explicit qr_code, update them to use their ID
        const setQrCodes = savedParticipants.filter(p => !p.qr_code).map(p =>
            supabase.from('event_participants').update({ qr_code: p.id }).eq('id', p.id)
        );
        if (setQrCodes.length > 0) await Promise.all(setQrCodes);

        // Auto re-compute face descriptors for participants with avatars
        participants.forEach(p => {
            const savedP = savedParticipants.find(sp => sp.id === p.id || sp.full_name === p.full_name);
            if (savedP && p.avatar_url) {
                // If avatar changed or descriptor missing, compute it
                if (p.avatar_url !== savedP.avatar_url || !savedP.face_descriptor) {
                    console.log(`📸 [saveEventParticipants] Triggering Face ID compute for participant ${savedP.full_name}`);
                    computeAndSaveParticipantFaceDescriptor(savedP.id, p.avatar_url)
                        .catch(e => console.warn('Background participant face compute failed:', e));
                }
            }
        });

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

        // OFFLINE SUPPORT
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            if (isDuplicatePending('attendance', { userId, slotId, status })) {
                return {
                    success: true,
                    message: 'Bạn đã điểm danh rồi (Offline)',
                    alreadyExists: true
                };
            }
            console.log(`📡 [Offline] No network. Queuing check-in for ${userId} in slot ${slotId}`);
            addToOfflineQueue({
                type: 'attendance',
                data: { userId, slotId, status }
            });
            // Return a "pseudo-success" for the UI to proceed
            return {
                success: true,
                message: 'Đã lưu ngoại tuyến. Sẽ đồng bộ khi có mạng.',
                alreadyExists: false,
                data: { id: `offline_${Date.now()}`, user_id: userId, slot_id: slotId, date: today, checkin_time: now, status }
            };
        }

        // 1. Kiểm tra xem đã có bản ghi điểm danh cho slot này hôm nay chưa
        const { data: existingAttendance } = await supabase
            .from('boarding_attendance')
            .select('*')
            .eq('user_id', userId)
            .eq('slot_id', slotId)
            .eq('date', today)
            .maybeSingle();

        if (existingAttendance) {
            console.log(`ℹ️ [BoardingCheckin] User ${userId} already checked in for slot ${slotId} today.`);
            return {
                success: true,
                message: 'Bạn đã điểm danh rồi',
                data: existingAttendance,
                alreadyExists: true
            };
        }

        // 2. Lưu vào bảng log duy nhất (boarding_attendance)
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

        // 3. Xử lý trừ điểm nếu đi muộn
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
                    `Điểm danh muộn ${slotName} ngày ${displayDate}`,
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
                user:users!user_id(full_name, student_code, organization, avatar_url),
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

/**
 * Lấy danh sách điểm danh thô (không nhóm) cho một ngày và/hoặc slot cụ thể
 */
async function getRecentBoardingActivity(options?: {
    date?: string;
    slotId?: string;
    limit?: number;
}): Promise<ApiResponse<any[]>> {
    try {
        let query = supabase
            .from('boarding_attendance')
            .select(`
                id,
                checkin_time,
                status,
                user:users!user_id(id, full_name, avatar_url),
                slot:boarding_time_slots!slot_id(id, name)
            `)
            .order('checkin_time', { ascending: false });

        if (options?.date) query = query.eq('date', options.date);
        if (options?.slotId) query = query.eq('slot_id', options.slotId);
        if (options?.limit) query = query.limit(options.limit);
        else query = query.limit(20);

        const { data, error } = await query;
        if (error) return { success: false, error: error.message };

        return {
            success: true,
            data: data.map(log => {
                const user = Array.isArray(log.user) ? log.user[0] : log.user;
                const slot = Array.isArray(log.slot) ? log.slot[0] : log.slot;

                return {
                    id: log.id,
                    user_id: user?.id,
                    name: user?.full_name || 'Học sinh',
                    avatar: user?.avatar_url,
                    time: log.checkin_time,
                    status: log.status,
                    slot_name: slot?.name
                };
            })
        };
    } catch (err) {
        return { success: false, error: 'Lỗi tải danh sách check-in' };
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
    alreadyExists?: boolean;
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


async function getPointLogs(userId?: string): Promise<ApiResponse<PointLog[]>> {
    try {
        const { data, error } = await supabase
            .from('point_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (userId) {
            // Client-side filtering if userId arg provided (or could enable RLS lookup)
            // But usually we want querying by DB. 
            // Re-adding filter:
            const { data: userLogs, error: userError } = await supabase
                .from('point_logs')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(100);

            if (userError) throw userError;
            return { success: true, data: userLogs };
        }

        if (error) {
            console.error('getPointLogs error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data };
    } catch (err: any) {
        // Fallback or error handling
        return { success: false, error: err.message || 'Lỗi tải lịch sử điểm' };
    }
}

async function addPoints(userId: string, points: number, reason: string, type: string = 'manual', eventId?: string): Promise<ApiResponse<void>> {
    // Offline support
    if (typeof window !== 'undefined' && !navigator.onLine) {
        addToOfflineQueue({ type: 'point_log', data: { userId, points, reason, type, eventId } });
        return { success: true, message: 'Đã lưu offline (Chờ đồng bộ khi có mạng)' };
    }
    try {
        const user = getStoredUser();
        // Automated actions should have null creator if it's the student themselves or no one logged in
        const creatorId = (user && user.id !== userId) ? user.id : null;

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
        // OPTIMIZATION: Exclude heavy 'metadata' column to prevent statement timeout
        // Metadata contains base64 images which are too large for bulk fetching
        let query = supabase
            .from('certificates')
            .select('id, user_id, event_id, type, title, issued_date, qr_verify, pdf_url, status, template_id, user:users(id, full_name)')
            .order('issued_date', { ascending: false })
            .limit(200); // Limit results for performance

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('getCertificates error:', error);
            return { success: false, error: error.message };
        }
        return { success: true, data: data as Certificate[] };
    } catch (err) {
        return { success: false, error: 'Lỗi tải danh sách chứng nhận' };
    }
}

// Fetch single certificate with full metadata (for PDF export)
// If certificate has config_id, load design from certificate_configs table
async function getCertificateById(id: string): Promise<ApiResponse<Certificate>> {
    try {
        const { data, error } = await supabase
            .from('certificates')
            .select('*, user:users(id, full_name)')
            .eq('id', id)
            .single();

        if (error) {
            console.error('getCertificateById error:', error);
            return { success: false, error: error.message };
        }

        const cert = data as Certificate & { config_id?: string };

        // If certificate references a config, load the design from certificate_configs
        if (cert.config_id && (!cert.metadata || Object.keys(cert.metadata).length === 0)) {
            try {
                const { data: configData, error: configError } = await supabase
                    .from('certificate_configs')
                    .select('config, template_id')
                    .eq('id', cert.config_id)
                    .single();

                if (!configError && configData) {
                    // Merge config into metadata for display
                    cert.metadata = {
                        ...(cert.metadata || {}),
                        ...configData.config
                    };
                    // Set template_id from config if not set
                    if (!cert.template_id && configData.template_id) {
                        cert.template_id = configData.template_id;
                    }
                }
            } catch (configLoadErr) {
                console.warn('Failed to load certificate config:', configLoadErr);
                // Continue with basic cert data
            }
        }

        return { success: true, data: cert as Certificate };
    } catch (err) {
        return { success: false, error: 'Lỗi tải chứng nhận' };
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
                issued_date: certData.issued_date || new Date().toISOString(),
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
                issued_date: c.issued_date || new Date().toISOString(),
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

/**
 * Láy danh sách các mẫu chứng nhận đã lưu (Certificate Presets/Configs)
 */
async function getCertificateConfigs(): Promise<ApiResponse<any[]>> {
    try {
        const { data, error } = await supabase
            .from('certificate_configs')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) throw error;
        return { success: true, data: data || [] };
    } catch (err: any) {
        console.error('getCertificateConfigs error:', err);
        return { success: false, error: err.message || 'Lỗi tải danh mục mẫu' };
    }
}

/**
 * Lưu mẫu chứng nhận mới hoặc cập nhật mẫu cũ
 */
async function saveCertificateConfig(data: {
    id?: string;
    name: string;
    template_id: string;
    config: any;
    is_default?: boolean;
}): Promise<ApiResponse<any>> {
    try {
        const user = getStoredUser();
        const payload = {
            ...data,
            created_by: user?.id
        };

        const { data: result, error } = await supabase
            .from('certificate_configs')
            .upsert(payload)
            .select()
            .single();

        if (error) throw error;
        return { success: true, data: result };
    } catch (err: any) {
        console.error('saveCertificateConfig error:', err);
        return { success: false, error: err.message || 'Lỗi lưu mẫu chứng nhận' };
    }
}

/**
 * Xóa mẫu chứng nhận
 */
async function deleteCertificateConfig(id: string): Promise<ApiResponse<{ usageCount?: number }>> {
    try {
        // First check if any certificates are using this config
        const { count, error: countError } = await supabase
            .from('certificates')
            .select('*', { count: 'exact', head: true })
            .eq('config_id', id);

        if (countError) {
            console.warn('Could not count certificates using config:', countError);
        }

        const usageCount = count || 0;

        // Proceed to delete (ON DELETE SET NULL will handle references)
        const { error } = await supabase
            .from('certificate_configs')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { success: true, message: 'Đã xóa mẫu chứng nhận', data: { usageCount } };
    } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi xóa mẫu' };
    }
}

/**
 * Count certificates using a specific config/preset
 */
async function countCertificatesByConfig(configId: string): Promise<ApiResponse<number>> {
    try {
        const { count, error } = await supabase
            .from('certificates')
            .select('*', { count: 'exact', head: true })
            .eq('config_id', configId);

        if (error) throw error;
        return { success: true, data: count || 0 };
    } catch (err: any) {
        console.error('countCertificatesByConfig error:', err);
        return { success: false, error: err.message, data: 0 };
    }
}

/**
 * Lấy top học sinh tiêu biểu theo tháng (Dựa trên điểm số tích lũy trong tháng)
 */
async function getTopStudentsByMonth(month: number, year: number, limit: number = 10): Promise<ApiResponse<any[]>> {
    try {
        const { data, error } = await supabase.rpc('get_top_students_by_month', {
            p_month: month,
            p_year: year,
            p_limit: limit
        });

        if (error) throw error;
        return { success: true, data: data || [] };
    } catch (err: any) {
        console.error('getTopStudentsByMonth error:', err);
        return { success: false, error: err.message || 'Lỗi tải danh sách top học sinh' };
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

// System Permissions API
async function getTeacherPermissions(): Promise<ApiResponse<any[]>> {
    try {
        const { data, error } = await supabase.from('teacher_permissions').select('*').order('module_id');
        if (error) throw error;
        return { success: true, data };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Lắng nghe thay đổi phân quyền thời gian thực
 */
function subscribeToTeacherPermissions(callback: (payload: any) => void) {
    return supabase
        .channel('public:teacher_permissions')
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'teacher_permissions'
            },
            (payload) => {
                callback(payload);
            }
        )
        .subscribe();
}

async function updateTeacherPermission(moduleId: string, updates: any): Promise<ApiResponse<void>> {
    try {
        console.log(`[Permissions] Invoking RPC for module ${moduleId}:`, updates);

        // Use RPC to bypass RLS UPDATE lock
        const { error } = await supabase.rpc('update_teacher_module_permission', {
            target_id: moduleId,
            updates: updates
        });

        if (error) throw error;

        return { success: true, message: 'Cập nhật phân quyền thành công' };
    } catch (err: any) {
        console.error('[Permissions] RPC Update failed:', err);
        return { success: false, error: err.message || 'Lỗi lưu dữ liệu' };
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
    computeAndSaveParticipantFaceDescriptor,

    // Rooms
    getRooms,
    createRoom,
    updateRoom,
    deleteRoom,
    updateZone,
    getZones,

    // Boarding Check-in
    boardingCheckin,
    syncOfflineData,
    getOfflineQueueLength,
    getBoardingCheckins,
    getRecentBoardingActivity,
    getBoardingConfig,
    updateBoardingConfig,
    getTeacherPermissions,
    subscribeToTeacherPermissions,
    updateTeacherPermission,

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
    getCertificateById,
    getTopStudentsByMonth,
    createCertificate,
    createCertificatesBulk,
    deleteCertificate,
    getCertificateConfigs,
    saveCertificateConfig,
    deleteCertificateConfig,
    countCertificatesByConfig,

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
    students: { name: string; code: string; organization: string; points: number; isExcused: boolean }[]
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

        // Improved query to find approved permissions that overlap with targetDate
        // We look for permissions that start before end of day AND end after start of day
        const { data: permissions } = await supabase
            .from('exit_permissions')
            .select('user_id, exit_time, return_time')
            .eq('status', 'approved')
            .lte('exit_time', `${targetDate}T23:59:59`)
            .gte('return_time', `${targetDate}T00:00:00`);

        const excusedUsers = new Set<string>();
        if (permissions) {
            for (const perm of permissions) {
                // Since the DB already filtered correctly, any permission in 'permissions'
                // overlaps with targetDate. We add them to excusedUsers.
                excusedUsers.add(perm.user_id);
            }
        }

        const absentStudents: { name: string; code: string; organization: string; points: number; isExcused: boolean }[] = [];
        for (const student of studentsRes.data) {
            if (!checkedInUsers.has(student.id)) {
                const isExcused = excusedUsers.has(student.id);

                // If excused, we show 0 points and mark as excused
                // If the user wants them GONE, we will filter in the UI/Excel
                // but for now let's pass them with 0 points to be safe.
                const pointsToDeduct = isExcused ? 0 : absentPoints;

                if (!isExcused) {
                    await deductPoints(
                        student.id,
                        pointsToDeduct,
                        `Vắng điểm danh ${slot.name} ngày ${targetDate}`
                    );
                }

                absentStudents.push({
                    name: student.full_name,
                    code: student.student_code || '',
                    organization: student.organization || '',
                    points: pointsToDeduct,
                    isExcused: isExcused
                });
            }
        }

        return {
            success: true,
            data: {
                processed: absentStudents.filter(s => !s.isExcused).length,
                pointsDeducted: absentPoints,
                students: absentStudents
            },
            message: `Đã xử lý ${absentStudents.filter(s => !s.isExcused).length} học sinh vắng ${slot.name}`
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
