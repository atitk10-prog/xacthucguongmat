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
        console.log('🔄 Loading face models (ssdMobilenetv1 + Recognition)...');
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),    // ACCURATE detection (like old version)
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL), // ACCURATE landmarks
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
        .detectSingleFace(input)
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (!detection) return null;
    return detection.descriptor;
}

// Detect all faces in realtime
export async function detectFaces(input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) {
    if (!modelsLoaded) await loadModels();

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
    // Distance of 0 = 100% match, distance of 1.0 = 0% match (more lenient than before)
    // Lower distance = higher confidence
    const confidence = Math.max(0, Math.min(100, (1 - distance / 1.0) * 100));
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

    // Add a registered face
    addFace(userId: string, descriptor: Float32Array, name: string) {
        // Remove existing if already registered
        this.registeredFaces = this.registeredFaces.filter(f => f.userId !== userId);
        this.registeredFaces.push({ userId, descriptor, name });
    }

    // Remove a registered face
    removeFace(userId: string) {
        this.registeredFaces = this.registeredFaces.filter(f => f.userId !== userId);
    }

    // Clear all registered faces
    clearAll() {
        this.registeredFaces = [];
    }

    // Find best match for a face descriptor, excluding specified user IDs
    findMatch(descriptor: Float32Array, threshold: number = 25, excludeIds: string[] = []): { userId: string; name: string; confidence: number } | null {
        if (this.registeredFaces.length === 0) return null;

        let bestMatch: { userId: string; name: string; confidence: number } | null = null;
        const allScores: { name: string; confidence: number }[] = [];

        // Filter out excluded users (e.g. already checked in)
        const candidates = this.registeredFaces.filter(f => !excludeIds.includes(f.userId));

        for (const face of candidates) {
            const confidence = compareFaces(descriptor, face.descriptor);
            if (confidence > 10) { // Only log somewhat relevant scores
                allScores.push({ name: face.name, confidence });
            }

            if (confidence >= threshold && (!bestMatch || confidence > bestMatch.confidence)) {
                bestMatch = { userId: face.userId, name: face.name, confidence };
            }
        }

        // Sort scores descending and take top 5 for cleaner logs
        allScores.sort((a, b) => b.confidence - a.confidence);
        const topScores = allScores.slice(0, 5);

        // Log optimization: Only log if there are candidates
        if (allScores.length > 0) {
            const scoresStr = topScores.map(s => `${s.name}: ${s.confidence}%`).join(', ');
            console.log(`📊 Face scores (th=${threshold}%): ${scoresStr}${allScores.length > 5 ? '...' : ''} → ${bestMatch ? `MATCH: ${bestMatch.name}` : 'NO MATCH'}`);
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
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
    });
}

// Utility: Convert Float32Array to string for storage
export function descriptorToString(descriptor: Float32Array): string {
    return JSON.stringify(Array.from(descriptor));
}

// Utility: Convert string back to Float32Array
export function stringToDescriptor(str: string): Float32Array {
    return new Float32Array(JSON.parse(str));
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
