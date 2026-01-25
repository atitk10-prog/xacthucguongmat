/**
 * EduCheck - Face Recognition Service (using face-api.js)
 * Using ssdMobilenetv1 for ACCURATE detection (same as working old version)
 * Includes model warmup to eliminate first-inference delay
 * Chạy offline, không cần API key
 */

import * as faceapi from 'face-api.js';

let modelsLoaded = false;
let modelsLoading = false;
let modelsWarmedUp = false;

// Use CDN for models
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

/**
 * Warm up the models by running a dummy inference
 * This eliminates the "first inference" delay with TensorFlow.js
 */
const warmupModels = async (): Promise<void> => {
    if (modelsWarmedUp) return;

    try {
        console.log('🔥 Warming up face models...');
        const startTime = performance.now();

        // Create a canvas with realistic dimensions (640x480 VGA)
        const dummyCanvas = document.createElement('canvas');
        dummyCanvas.width = 640;
        dummyCanvas.height = 480;
        const ctx = dummyCanvas.getContext('2d');
        if (ctx) {
            // Draw face-like oval for better warmup
            ctx.fillStyle = '#d0d0d0';
            ctx.fillRect(0, 0, 640, 480);
            ctx.fillStyle = '#ffcc99';
            ctx.beginPath();
            ctx.ellipse(320, 240, 80, 100, 0, 0, 2 * Math.PI);
            ctx.fill();
        }

        // Run detection to warm up all networks
        await faceapi
            .detectSingleFace(dummyCanvas)
            .withFaceLandmarks()
            .withFaceDescriptor();

        modelsWarmedUp = true;
        console.log(`✅ Face models warmed up in ${Math.round(performance.now() - startTime)}ms`);
    } catch (error) {
        console.warn('⚠️ Warmup failed (non-critical):', error);
        modelsWarmedUp = true; // Mark as done to avoid retrying
    }
};

// Load face-api.js models - using ssdMobilenetv1 for ACCURACY (same as old working version)
export async function loadModels(): Promise<void> {
    if (modelsLoaded) return;

    // Prevent multiple concurrent loads
    if (modelsLoading) {
        while (modelsLoading) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        return;
    }

    modelsLoading = true;

    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL), // TINY/FAST detection (Mô hình siêu nhẹ)
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL), // Landmarks
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL) // Recognition
        ]);

        // Warmup BEFORE marking as loaded
        await warmupModels();

        modelsLoaded = true;
        console.log('✅ Face models loaded and warmed up!');
    } catch (error) {
        console.error('❌ Failed to load face models:', error);
        throw error;
    } finally {
        modelsLoading = false;
    }
}

// Check if models are loaded
export function isModelsLoaded(): boolean {
    return modelsLoaded;
}

// Detect face and get descriptor from image (for registration)
export async function getFaceDescriptor(input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<Float32Array | null> {
    if (!modelsLoaded) await loadModels();

    const detection = await faceapi
        .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 160 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (!detection) return null;
    return detection.descriptor;
}

// Detect faces in realtime (all or single)
export async function detectFaces(input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement, single: boolean = false) {
    if (!modelsLoaded) await loadModels();

    if (single) {
        const detection = await faceapi
            .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 160 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
        return detection ? [detection] : [];
    }

    const detections = await faceapi
        .detectAllFaces(input)
        .withFaceLandmarks()
        .withFaceDescriptors();

    return detections;
}

// Compare two face descriptors
export function compareFaces(descriptor1: Float32Array, descriptor2: Float32Array): number {
    const distance = faceapi.euclideanDistance(descriptor1, descriptor2);
    // Convert distance to confidence percentage (0-100)
    // Distance of 0 = 100% match.
    // 0.8 is the max distance for "some" confidence.
    const confidence = Math.max(0, Math.min(100, (1 - distance / 0.8) * 100));
    return Math.round(confidence);
}

// Interface for registered user with face data
export interface RegisteredFace {
    userId: string;
    descriptor: Float32Array;
    name: string;
}

// Face matcher for comparing against multiple registered faces
class FaceMatcherService {
    private registeredFaces: RegisteredFace[] = [];

    // Register a face
    registerFace(userId: string, descriptor: Float32Array, name: string) {
        this.removeFace(userId);
        this.registeredFaces.push({ userId, descriptor, name });
    }

    addFace(userId: string, descriptor: Float32Array, name: string) {
        this.registerFace(userId, descriptor, name);
    }

    removeFace(userId: string) {
        this.registeredFaces = this.registeredFaces.filter(f => f.userId !== userId);
    }

    clearAll() {
        this.registeredFaces = [];
    }

    // Find best match for a face descriptor
    findMatch(descriptor: Float32Array, threshold: number = 25, excludeIds: string[] = []): { userId: string; name: string; confidence: number } | null {
        if (this.registeredFaces.length === 0) return null;

        let bestMatch: { userId: string; name: string; confidence: number } | null = null;
        let secondBestMatch: { userId: string; name: string; confidence: number } | null = null;
        const allScores: { name: string; confidence: number }[] = [];

        const candidates = this.registeredFaces.filter(f => !excludeIds.includes(f.userId));

        for (const face of candidates) {
            const confidence = compareFaces(descriptor, face.descriptor);
            if (confidence > 10) {
                allScores.push({ name: face.name, confidence });
            }

            if (confidence >= threshold) {
                if (!bestMatch || confidence > bestMatch.confidence) {
                    secondBestMatch = bestMatch;
                    bestMatch = { userId: face.userId, name: face.name, confidence };
                } else if (!secondBestMatch || confidence > secondBestMatch.confidence) {
                    secondBestMatch = { userId: face.userId, name: face.name, confidence };
                }
            }
        }

        // Sort for logging
        allScores.sort((a, b) => b.confidence - a.confidence);
        const topScores = allScores.slice(0, 3);

        if (allScores.length > 0) {
            const scoresStr = topScores.map(s => `${s.name}: ${s.confidence}%`).join(', ');

            // AMBIGUITY CHECK: Reduced margin from 8 to 5 for better usability
            if (bestMatch && secondBestMatch) {
                const margin = bestMatch.confidence - secondBestMatch.confidence;
                if (margin < 5) {
                    console.warn(`⚠️ AMBIGUOUS MATCH (Margin ${margin}% < 5%): ${scoresStr}`);
                    return null;
                }
            }

            console.log(`📊 Ngưỡng ${threshold}% | Best: ${bestMatch?.name || 'None'} (${bestMatch?.confidence || 0}%) | Top: ${scoresStr}`);
        }

        return bestMatch;
    }

    // Get count of registered faces
    getCount(): number {
        return this.registeredFaces.length;
    }
}

// Singleton instance
export const faceMatcher = new FaceMatcherService();

// Utility: Convert base64 image to HTMLImageElement
export function base64ToImage(base64: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        if (base64.startsWith('http')) {
            img.crossOrigin = 'anonymous';
        }
        img.onload = () => resolve(img);
        img.onerror = (e) => {
            console.error('❌ [base64ToImage] Failed to load image:', base64.substring(0, 100) + '...');
            reject(new Error('Failed to load image'));
        };
        img.src = (base64.startsWith('data:') || base64.startsWith('http')) ? base64 : `data:image/jpeg;base64,${base64}`;
    });
}

// Utility: Convert Float32Array to string for storage
export function descriptorToString(descriptor: Float32Array): string {
    return JSON.stringify(Array.from(descriptor));
}

// Utility: Convert string back to Float32Array
export function stringToDescriptor(str: string): Float32Array {
    try {
        if (!str || str === 'undefined' || str === 'null') {
            console.warn('⚠️ stringToDescriptor received invalid string:', str);
            return new Float32Array(0);
        }
        const arr = JSON.parse(str);
        if (!Array.isArray(arr)) {
            console.warn('⚠️ stringToDescriptor: parsed value is not an array');
            return new Float32Array(0);
        }
        return new Float32Array(arr);
    } catch (e) {
        console.error('❌ Failed to parse face descriptor:', e, 'Input:', str);
        return new Float32Array(0);
    }
}

// Main function: Verify face from video/image against registered users
export async function verifyFace(
    input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
    threshold: number = 35
): Promise<{ matched: boolean; userId?: string; name?: string; confidence: number }> {
    const descriptor = await getFaceDescriptor(input);

    if (!descriptor) {
        return { matched: false, confidence: 0 };
    }

    const match = faceMatcher.findMatch(descriptor, threshold);

    if (match) {
        return { matched: true, userId: match.userId, name: match.name, confidence: match.confidence };
    }

    return { matched: false, confidence: 0 };
}

// Export the service
export const faceService = {
    loadModels,
    isModelsLoaded,
    getFaceDescriptor,
    detectFaces,
    compareFaces,
    verifyFace,
    faceMatcher,
    base64ToImage,
    descriptorToString,
    stringToDescriptor
};
