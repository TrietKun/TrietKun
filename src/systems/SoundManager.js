import stateManager from '../core/StateManager.js';

/**
 * Sound Manager — generates ambient sci-fi drone and UI sounds
 * using the Web Audio API (no external files needed).
 * Toggle on/off via the #sound-toggle button.
 */
class SoundManager {
  constructor() {
    this.btn = document.getElementById('sound-toggle');
    this.active = false;
    this.ctx = null;
    this.masterGain = null;
    this.drones = [];

    if (!this.btn) return;
    this.btn.addEventListener('click', () => this.toggle());

    // Play transition sound on state change
    stateManager.on('transition:start', () => {
      if (this.active) this._playTransitionSound();
    });
  }

  toggle() {
    if (!this.active) {
      this._start();
    } else {
      this._stop();
    }
  }

  _start() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0;
    this.masterGain.connect(this.ctx.destination);

    // Fade in
    this.masterGain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 2);

    // Create ambient drone layers
    this._createDrone(55, 'sine', 0.03);     // deep bass
    this._createDrone(110, 'sine', 0.015);   // low hum
    this._createDrone(220, 'sine', 0.008);   // mid tone
    this._createDrone(330, 'triangle', 0.004); // harmonic
    this._createDrone(82.5, 'sine', 0.02);   // fifth interval

    // Subtle noise layer
    this._createNoise(0.006);

    // LFO modulation on bass
    this._createLFO(0.1, this.drones[0]?.osc?.frequency, 2);

    this.active = true;
    this.btn.classList.add('active');
  }

  _stop() {
    if (!this.masterGain) return;

    // Fade out
    this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1);

    setTimeout(() => {
      this.drones.forEach((d) => {
        try { d.osc.stop(); } catch (e) { /* already stopped */ }
      });
      this.drones = [];
      if (this.noiseSource) {
        try { this.noiseSource.stop(); } catch (e) {}
        this.noiseSource = null;
      }
    }, 1200);

    this.active = false;
    this.btn.classList.remove('active');
  }

  _createDrone(freq, type, volume) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    this.drones.push({ osc, gain });
  }

  _createNoise(volume) {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }

    this.noiseSource = this.ctx.createBufferSource();
    this.noiseSource.buffer = buffer;
    this.noiseSource.loop = true;

    // Bandpass filter for sci-fi feel
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 0.5;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    this.noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    this.noiseSource.start();
  }

  _createLFO(freq, target, depth) {
    if (!target) return;
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = freq;
    lfoGain.gain.value = depth;
    lfo.connect(lfoGain);
    lfoGain.connect(target);
    lfo.start();
  }

  _playTransitionSound() {
    if (!this.ctx || !this.masterGain) return;

    // Quick "whoosh" sweep
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 200;
    osc.frequency.exponentialRampToValueAtTime(2000, this.ctx.currentTime + 0.15);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.4);
    gain.gain.value = 0.04;
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);

    // Click tick
    const tick = this.ctx.createOscillator();
    const tickGain = this.ctx.createGain();
    tick.type = 'square';
    tick.frequency.value = 1000;
    tickGain.gain.value = 0.03;
    tickGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.05);
    tick.connect(tickGain);
    tickGain.connect(this.masterGain);
    tick.start();
    tick.stop(this.ctx.currentTime + 0.06);
  }
}

export default SoundManager;
