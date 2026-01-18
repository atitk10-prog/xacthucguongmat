/**
 * EduCheck - Face Recognition Service (using face-api.js)
 * Chạy offline, không cần API key
 */

import * as faceapi from 'face-api.js';

let modelsLoaded = false;
// Use CDN for models (no need to download manually)
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

// Load face-api.js models
export async function loadModels(): Promise<void> {
    if (modelsLoaded) return;

    try {
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        modelsLoaded = true;
        console.log('✅ Face-api.js models loaded');
    } catch (error) {
        console.error('❌ Failed to load face-api.js models:', error);
        throw error;
    }
}

// Check if models are loaded
export function isModelsLoaded(): boolean {
    return modelsLoaded;
}

// Detect face and get descriptor from image (HTMLImageElement or HTMLVideoElement)
export async function getFaceDescriptor(input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<Float32Array | null> {
    if (!modelsLoaded) await loadModels();

    const detection = await faceapi
        .detectSingleFace(input)
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (!detection) return null;
    return detection.descriptor;
}

// Detect all faces in an image
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
    // Distance of 0 = 100% match, distance of 0.6 = 0% match
    const confidence = Math.max(0, Math.min(100, (1 - distance / 0.6) * 100));
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

    // Find best match for a face descriptor
    findMatch(descriptor: Float32Array, threshold: number = 60): { userId: string; name: string; confidence: number } | null {
        if (this.registeredFaces.length === 0) return null;

        let bestMatch: { userId: string; name: string; confidence: number } | null = null;
        const allScores: { name: string; confidence: number }[] = [];

        for (const face of this.registeredFaces) {
            const confidence = compareFaces(descriptor, face.descriptor);
            allScores.push({ name: face.name, confidence });
            if (confidence >= threshold && (!bestMatch || confidence > bestMatch.confidence)) {
                bestMatch = { userId: face.userId, name: face.name, confidence };
            }
        }

        // Debug: Show all confidence scores
        if (!bestMatch && allScores.length > 0) {
            const scoresStr = allScores.map(s => `${s.name}: ${s.confidence}%`).join(', ');
            console.log(`📊 Face scores (threshold ${threshold}%): ${scoresStr}`);
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
    threshold: number = 60
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
