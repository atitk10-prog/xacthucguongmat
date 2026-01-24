/**
 * Utility for image processing and compression
 */

export const compressImage = async (
    source: string,
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.7,
    preserveTransparency = false // NEW: Set true for signatures, seals, logos
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            // Calculate new dimensions
            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                reject(new Error('Failed to get canvas context'));
                return;
            }

            // CRITICAL: Clear canvas to transparent for PNG preservation
            if (preserveTransparency) {
                ctx.clearRect(0, 0, width, height);
            }

            ctx.drawImage(img, 0, 0, width, height);

            // Use PNG for images with transparency (signatures, seals, logos)
            // Use JPEG for backgrounds (better compression, no transparency needed)
            if (preserveTransparency) {
                // PNG with compression by reducing dimensions
                const compressed = canvas.toDataURL('image/png');
                resolve(compressed);
            } else {
                // JPEG for better compression
                const compressed = canvas.toDataURL('image/jpeg', quality);
                resolve(compressed);
            }
        };
        img.onerror = (err) => reject(err);
        img.src = source;
    });
};

export const getImageDimensions = (source: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = reject;
        img.src = source;
    });
};
