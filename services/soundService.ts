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
    private isInitialized = false;

    constructor() {
        // Pre-load sounds
        if (typeof window !== 'undefined') {
            Object.values(SOUNDS).forEach(src => {
                const audio = new Audio(src);
                audio.volume = 0.8;
                this.audioCache.set(src, audio);
            });

            // Interaction listener to resume AudioContext
            const resumeAudio = () => {
                if (this.audioContext && this.audioContext.state === 'suspended') {
                    this.audioContext.resume();
                }
                window.removeEventListener('click', resumeAudio);
                window.removeEventListener('touchstart', resumeAudio);
                window.removeEventListener('keydown', resumeAudio);
            };
            window.addEventListener('click', resumeAudio);
            window.addEventListener('touchstart', resumeAudio);
            window.addEventListener('keydown', resumeAudio);
        }
    }

    // Play a specific sound type
    play(type: keyof typeof SOUNDS) {
        // Double "ting" for success
        if (type === 'success') {
            this.playSoundEffect(type);
            setTimeout(() => this.playSoundEffect(type), 150);
        } else {
            this.playSoundEffect(type);
        }
    }

    private playSoundEffect(type: keyof typeof SOUNDS) {
        const src = SOUNDS[type];
        const audio = this.audioCache.get(src);

        // Try to play file, fallback to synthesized beep if fails
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => {
                this.fallbackBeep(type);
            });
        } else {
            this.fallbackBeep(type);
        }
    }

    // Fallback using Oscillator (synthesized sound)
    private fallbackBeep(type: keyof typeof SOUNDS) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            }

            const ctx = this.audioContext;
            if (ctx.state === 'suspended') ctx.resume();

            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            const now = ctx.currentTime;

            if (type === 'success') {
                // High-pitched pleasant "Ting"
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(1046.50, now); // C6
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(0.2, now + 0.01);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                oscillator.start(now);
                oscillator.stop(now + 0.3);
            } else if (type === 'error') {
                // Low "Buzz"
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(120, now);
                gainNode.gain.setValueAtTime(0.1, now);
                gainNode.gain.linearRampToValueAtTime(0, now + 0.4);
                oscillator.start(now);
                oscillator.stop(now + 0.4);
            } else {
                // Warning "Ping"
                oscillator.type = 'triangle';
                oscillator.frequency.setValueAtTime(660, now); // E5
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(0.1, now + 0.01);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                oscillator.start(now);
                oscillator.stop(now + 0.2);
            }

        } catch (e) {
            console.error("Audio fallback failed", e);
        }
    }
}

export const soundService = new SoundService();
