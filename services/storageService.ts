/**
 * Certificate Storage Service
 * Upload certificate images to Supabase Storage instead of storing base64 in database.
 * This reduces database usage from ~1-5MB per preset to ~2-5KB per preset.
 * 
 * Bucket: certificate-assets (must be created in Supabase Dashboard)
 */

import { supabase } from './supabaseClient';

const BUCKET_NAME = 'certificate-assets';

/**
 * Convert a base64 data URL to a Blob for upload
 */
function dataURLtoBlob(dataURL: string): Blob {
    const parts = dataURL.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(parts[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) {
        u8arr[i] = bstr.charCodeAt(i);
    }
    return new Blob([u8arr], { type: mime });
}

/**
 * Generate a unique file path for storage
 */
function generateFilePath(category: string, extension: string = 'png'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${category}/${timestamp}_${random}.${extension}`;
}

/**
 * Upload a base64 image to Supabase Storage and return the public URL.
 * If the input is already a URL (not base64), returns it as-is.
 */
export async function uploadCertificateImage(
    base64Data: string,
    category: 'backgrounds' | 'logos' | 'signatures' | 'seals' = 'backgrounds'
): Promise<{ success: boolean; url?: string; error?: string }> {
    // If already a URL (not base64), skip upload
    if (!base64Data.startsWith('data:')) {
        return { success: true, url: base64Data };
    }

    try {
        const blob = dataURLtoBlob(base64Data);
        const isJpeg = base64Data.includes('image/jpeg') || base64Data.includes('image/jpg');
        const extension = isJpeg ? 'jpg' : 'png';
        const filePath = generateFilePath(category, extension);

        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, blob, {
                contentType: blob.type,
                cacheControl: '31536000', // 1 year cache
                upsert: false
            });

        if (error) {
            console.error('Storage upload error:', error);
            return { success: false, error: error.message };
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(data.path);

        return { success: true, url: urlData.publicUrl };
    } catch (err: any) {
        console.error('Upload failed:', err);
        return { success: false, error: err.message || 'Lỗi tải ảnh lên Storage' };
    }
}

/**
 * Delete an image from Supabase Storage by its URL
 */
export async function deleteCertificateImage(publicUrl: string): Promise<boolean> {
    try {
        // Extract file path from public URL
        // URL format: https://xxx.supabase.co/storage/v1/object/public/certificate-assets/category/file.ext
        const bucketPath = publicUrl.split(`${BUCKET_NAME}/`)[1];
        if (!bucketPath) return false;

        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([bucketPath]);

        if (error) {
            console.warn('Storage delete error:', error);
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Upload multiple images and return their URLs.
 * Used for migrating existing base64 configs to Storage URLs.
 */
export async function uploadConfigImages(config: any): Promise<any> {
    const updated = { ...config };

    // Upload background
    if (updated.bgImage && updated.bgImage.startsWith('data:')) {
        const res = await uploadCertificateImage(updated.bgImage, 'backgrounds');
        if (res.success && res.url) updated.bgImage = res.url;
    }

    // Upload signature
    if (updated.signatureImage && updated.signatureImage.startsWith('data:')) {
        const res = await uploadCertificateImage(updated.signatureImage, 'signatures');
        if (res.success && res.url) updated.signatureImage = res.url;
    }

    // Upload seal
    if (updated.sealImage && updated.sealImage.startsWith('data:')) {
        const res = await uploadCertificateImage(updated.sealImage, 'seals');
        if (res.success && res.url) updated.sealImage = res.url;
    }

    // Upload single logo
    if (updated.logoImage && updated.logoImage.startsWith('data:')) {
        const res = await uploadCertificateImage(updated.logoImage, 'logos');
        if (res.success && res.url) updated.logoImage = res.url;
    }

    // Upload multi-logos
    if (updated.logos && Array.isArray(updated.logos)) {
        const uploadedLogos: string[] = [];
        for (const logo of updated.logos) {
            if (logo.startsWith('data:')) {
                const res = await uploadCertificateImage(logo, 'logos');
                uploadedLogos.push(res.success && res.url ? res.url : logo);
            } else {
                uploadedLogos.push(logo);
            }
        }
        updated.logos = uploadedLogos;
    }

    return updated;
}
