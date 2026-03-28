/**
 * Idle Attract Mode — after 30s of no interaction,
 * particles flow into forming the text "TRIET" on a 2D canvas overlay.
 * Any mouse/touch/key interaction scatters them and resets the timer.
 */
class IdleAttract {
  constructor() {
    this.overlay = document.getElementById('idle-overlay');
    this.canvas = document.getElementById('idle-canvas');
    if (!this.canvas || !this.overlay) return;

    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.targets = [];
    this.active = false;
    this.scattered = false;
    this.idleTimeout = null;
    this.rafId = null;
    this.IDLE_DELAY = 30000; // 30 seconds

    this._resize();
    this._generateTargets();
    this._createParticles();
    this._bindEvents();
    this._resetTimer();
  }

  _resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    window.addEventListener('resize', () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this._generateTargets();
    });
  }

  _generateTargets() {
    this.targets = [];
    const text = 'TRIET';
    const fontSize = Math.min(window.innerWidth * 0.15, 150);
    const ctx = this.ctx;
    ctx.font = `bold ${fontSize}px 'Space Grotesk', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw text offscreen to sample pixels
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, this.canvas.width / 2, this.canvas.height / 2);

    const imageData = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = imageData.data;
    const step = 4; // sample every 4th pixel

    for (let y = 0; y < this.canvas.height; y += step) {
      for (let x = 0; x < this.canvas.width; x += step) {
        const i = (y * this.canvas.width + x) * 4;
        if (data[i + 3] > 128) {
          this.targets.push({ x, y });
        }
      }
    }

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _createParticles() {
    const count = Math.min(this.targets.length, 800);
    this.particles = [];
    for (let i = 0; i < count; i++) {
      const target = this.targets[i % this.targets.length];
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        tx: target.x,
        ty: target.y,
        vx: 0,
        vy: 0,
        size: 1.5 + Math.random() * 1.5,
        color: Math.random() > 0.5 ? '#00D4FF' : '#7C3AED',
        alpha: 0.6 + Math.random() * 0.4,
      });
    }
  }

  _bindEvents() {
    const resetEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    resetEvents.forEach((evt) => {
      window.addEventListener(evt, () => this._onInteraction(), { passive: true });
    });
  }

  _onInteraction() {
    if (this.active) {
      this._scatter();
      setTimeout(() => this._deactivate(), 1500);
    }
    this._resetTimer();
  }

  _resetTimer() {
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    this.idleTimeout = setTimeout(() => this._activate(), this.IDLE_DELAY);
  }

  _activate() {
    if (this.active) return;
    this.active = true;
    this.scattered = false;
    this.overlay.classList.add('active');
    this._animate();
  }

  _deactivate() {
    this.active = false;
    this.overlay.classList.remove('active');
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _scatter() {
    this.scattered = true;
    this.particles.forEach((p) => {
      p.vx = (Math.random() - 0.5) * 20;
      p.vy = (Math.random() - 0.5) * 20;
    });
  }

  _animate() {
    if (!this.active) return;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.particles.forEach((p) => {
      if (!this.scattered) {
        // Attract toward target
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        p.vx += dx * 0.03;
        p.vy += dy * 0.03;
        p.vx *= 0.92;
        p.vy *= 0.92;
      } else {
        // Just drift with friction
        p.vx *= 0.98;
        p.vy *= 0.98;
      }

      p.x += p.vx;
      p.y += p.vy;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.fill();
    });

    ctx.globalAlpha = 1;
    this.rafId = requestAnimationFrame(() => this._animate());
  }
}

export default IdleAttract;
