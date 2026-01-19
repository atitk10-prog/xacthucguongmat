/**
 * SoundService - Centralized audio management
 * Replaces oscillator beeps with real sound files for better UX.
 */

const SOUNDS = {
    success: '/sounds/success.mp3', // Ting
    error: '/sounds/error.mp3',     // Buzz/Fail
    warning: '/sounds/warning.mp3', // Ping/Alert
    camera: '/sounds/camera.mp3'    // Shutter (Optional)
};

class SoundService {
    private audioCache: Map<string, HTMLAudioElement> = new Map();
    private audioContext: AudioContext | null = null;

    constructor() {
        // Pre-load sounds
        if (typeof window !== 'undefined') {
            Object.values(SOUNDS).forEach(src => {
                const audio = new Audio(src);
                audio.volume = 0.8;
                this.audioCache.set(src, audio);
            });
        }
    }

    // Play a specific sound type
    play(type: keyof typeof SOUNDS) {
        const src = SOUNDS[type];
        const audio = this.audioCache.get(src);

        if (audio) {
            // Reset and play
            audio.currentTime = 0;
            audio.play().catch(e => {
                // Fallback to oscillator if file not found or blocked
                console.warn(`Sound file ${src} failed, falling back to beep.`, e);
                this.fallbackBeep(type);
            });
        } else {
            this.fallbackBeep(type);
        }
    }

    // Fallback using Oscillator (in case MP3s are missing)
    private fallbackBeep(type: keyof typeof SOUNDS) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            }

            const ctx = this.audioContext;
            if (!ctx) return;

            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            if (type === 'success') {
                // Pleasant "Ding"
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
                oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
                gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
                oscillator.start(ctx.currentTime);
                oscillator.stop(ctx.currentTime + 0.5);
            } else if (type === 'error') {
                // Low "Buzz"
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(150, ctx.currentTime);
                gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
                gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
                oscillator.start(ctx.currentTime);
                oscillator.stop(ctx.currentTime + 0.3);
            } else {
                // Warning "Ping"
                oscillator.type = 'triangle';
                oscillator.frequency.setValueAtTime(440, ctx.currentTime);
                gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                oscillator.start(ctx.currentTime);
                oscillator.stop(ctx.currentTime + 0.3);
            }

        } catch (e) {
            console.error("Audio fallback failed", e);
        }
    }
}

export const soundService = new SoundService();
