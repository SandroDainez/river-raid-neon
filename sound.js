// sound.js - Web Audio API Sound Synthesizer for River Raid - Neon Edition

class RetroAudio {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.lowFuelOsc = null;
        this.lowFuelGain = null;
        this.lowFuelInterval = null;
        this.isLowFuelPlaying = false;
    }

    init() {
        if (this.ctx) return;
        // Create audio context on user gesture
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            this.ctx = new AudioContextClass();
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.muted) {
            this.stopLowFuelWarning();
        }
        return this.muted;
    }

    playLaser() {
        this.init();
        if (!this.ctx || this.muted) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.15);
    }

    playExplosion() {
        this.init();
        if (!this.ctx || this.muted) return;

        const now = this.ctx.currentTime;
        const duration = 0.35;
        
        // Generate white noise buffer
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = buffer;

        // Bandpass filter to make it sound crunchy and retro
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1000, now);
        filter.frequency.exponentialRampToValueAtTime(100, now + duration);
        filter.Q.setValueAtTime(3, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        noiseNode.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noiseNode.start(now);
        noiseNode.stop(now + duration);
    }

    playBridgeExplosion() {
        this.init();
        if (!this.ctx || this.muted) return;

        const now = this.ctx.currentTime;
        const duration = 0.8;
        
        // Generate white noise
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = buffer;

        // Lowpass filter for bassy, deep explosion rumble
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, now);
        filter.frequency.exponentialRampToValueAtTime(30, now + duration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        noiseNode.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noiseNode.start(now);
        noiseNode.stop(now + duration);
    }

    playRefuelTick() {
        this.init();
        if (!this.ctx || this.muted) return;

        // Play a short rising sine wave beep
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.08);
    }

    startLowFuelWarning() {
        this.init();
        if (!this.ctx || this.muted || this.isLowFuelPlaying) return;

        this.isLowFuelPlaying = true;
        
        // Create repeating interval for low fuel warning beeps
        this.lowFuelInterval = setInterval(() => {
            if (this.muted || !this.ctx) return;
            const now = this.ctx.currentTime;
            
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(330, now); // E4 note, annoying warning sound
            osc.frequency.setValueAtTime(220, now + 0.1); // drop down pitch

            gain.gain.setValueAtTime(0.15, now);
            gain.gain.setValueAtTime(0.15, now + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.2);
        }, 500);
    }

    stopLowFuelWarning() {
        if (this.lowFuelInterval) {
            clearInterval(this.lowFuelInterval);
            this.lowFuelInterval = null;
        }
        this.isLowFuelPlaying = false;
    }

    playStartMelody() {
        this.init();
        if (!this.ctx || this.muted) return;

        const now = this.ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C major arpeggio rising
        const noteDuration = 0.08;

        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const noteStart = now + idx * noteDuration;

            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, noteStart);

            gain.gain.setValueAtTime(0.05, noteStart);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + noteDuration - 0.01);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(noteStart);
            osc.stop(noteStart + noteDuration);
        });
    }

    playGameOverMelody() {
        this.init();
        if (!this.ctx || this.muted) return;

        const now = this.ctx.currentTime;
        const notes = [392.00, 349.23, 311.13, 261.63, 220.00, 196.00]; // descending minor-ish arpeggio
        const noteDuration = 0.15;

        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const noteStart = now + idx * noteDuration;

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, noteStart);

            gain.gain.setValueAtTime(0.1, noteStart);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + noteDuration - 0.02);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(noteStart);
            osc.stop(noteStart + noteDuration);
        });
    }
}

// Global audio player instance
const audioPlayer = new RetroAudio();
window.audioPlayer = audioPlayer;
