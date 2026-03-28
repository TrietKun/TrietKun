import gsap from 'gsap';

/**
 * Premium cursor system:
 * - Smooth trailing ring (slow lerp) + fast dot
 * - Magnetic attraction to interactive elements
 * - Glow ring on hover with scale
 * - Cursor text hints
 */
class Mouse {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.normalizedX = 0;
    this.normalizedY = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.prevX = 0;
    this.prevY = 0;
    this.ease = 0.08;

    // Raw pixel positions for cursor
    this.clientX = window.innerWidth / 2;
    this.clientY = window.innerHeight / 2;
    this.ringX = this.clientX;
    this.ringY = this.clientY;
    this.dotX = this.clientX;
    this.dotY = this.clientY;

    // Magnetic target
    this.magnetTarget = null;
    this.magnetStrength = 0;

    // Detect touch device — skip cursor setup
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    this._bindEvents();
    if (!this.isTouchDevice) {
      this._setupCursor();
    }
  }

  _bindEvents() {
    window.addEventListener('mousemove', (e) => {
      this.targetX = (e.clientX / window.innerWidth) * 2 - 1;
      this.targetY = -(e.clientY / window.innerHeight) * 2 + 1;
      this.clientX = e.clientX;
      this.clientY = e.clientY;
    });

    // Touch support for normalized position (camera parallax)
    window.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      this.targetX = (t.clientX / window.innerWidth) * 2 - 1;
      this.targetY = -(t.clientY / window.innerHeight) * 2 + 1;
      this.clientX = t.clientX;
      this.clientY = t.clientY;
    }, { passive: true });

    // Skip hover/magnetic on touch devices
    if (this.isTouchDevice) return;

    // Hover detection + magnetic
    document.addEventListener('mouseover', (e) => {
      const interactive = e.target.closest(
        'button, a, .nav-item, .nav-logo, .hub-card, .project-card, .skill-node, .cta-button, .back-button, .scene-dot, .about-prev-btn, .about-next-btn, .scene-tech-chip, .project-detail-close, .pd-link, .pd-tech-tag, .pd-arch-node, .pd-screen-item'
      );

      if (interactive) {
        this.cursor.classList.add('hovering');
        if (this.cursorGlow) this.cursorGlow.style.opacity = '1';
        this._startMagnet(interactive);

        // Cursor text hint
        const label = interactive.dataset.cursorLabel;
        if (label && this.cursorLabel) {
          this.cursorLabel.textContent = label;
          this.cursorLabel.style.opacity = '1';
        }
      } else {
        this.cursor.classList.remove('hovering');
        if (this.cursorGlow) this.cursorGlow.style.opacity = '0';
        this._stopMagnet();
        if (this.cursorLabel) {
          this.cursorLabel.style.opacity = '0';
        }
      }
    });
  }

  _startMagnet(el) {
    this.magnetTarget = el;
    this.magnetStrength = 0.3;
  }

  _stopMagnet() {
    this.magnetTarget = null;
    this.magnetStrength = 0;
  }

  _setupCursor() {
    this.cursor = document.createElement('div');
    this.cursor.id = 'cursor';
    document.body.appendChild(this.cursor);

    this.cursorDot = document.createElement('div');
    this.cursorDot.id = 'cursor-dot';
    document.body.appendChild(this.cursorDot);

    // Cursor glow ring
    this.cursorGlow = document.createElement('div');
    this.cursorGlow.id = 'cursor-glow';
    document.body.appendChild(this.cursorGlow);

    // Cursor label
    this.cursorLabel = document.createElement('div');
    this.cursorLabel.id = 'cursor-label';
    document.body.appendChild(this.cursorLabel);
  }

  update() {
    this.prevX = this.x;
    this.prevY = this.y;

    this.x += (this.targetX - this.x) * this.ease;
    this.y += (this.targetY - this.y) * this.ease;

    this.normalizedX = this.x;
    this.normalizedY = this.y;

    this.velocityX = this.x - this.prevX;
    this.velocityY = this.y - this.prevY;

    // Cursor positions with different lerp speeds
    let targetDotX = this.clientX;
    let targetDotY = this.clientY;

    // Magnetic pull toward element center
    if (this.magnetTarget) {
      const rect = this.magnetTarget.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      targetDotX += (cx - this.clientX) * this.magnetStrength;
      targetDotY += (cy - this.clientY) * this.magnetStrength;
    }

    // Dot: fast follow (0.25 lerp)
    this.dotX += (targetDotX - this.dotX) * 0.25;
    this.dotY += (targetDotY - this.dotY) * 0.25;

    // Ring: slow trailing follow (0.12 lerp) — creates the premium trailing feel
    this.ringX += (targetDotX - this.ringX) * 0.12;
    this.ringY += (targetDotY - this.ringY) * 0.12;

    // Apply transforms (GPU-friendly)
    if (this.cursor) {
      this.cursor.style.transform = `translate(${this.ringX - 10}px, ${this.ringY - 10}px)`;
    }
    if (this.cursorDot) {
      this.cursorDot.style.transform = `translate(${this.dotX - 2}px, ${this.dotY - 2}px)`;
    }
    if (this.cursorGlow) {
      this.cursorGlow.style.transform = `translate(${this.ringX - 30}px, ${this.ringY - 30}px)`;
    }
    if (this.cursorLabel) {
      this.cursorLabel.style.transform = `translate(${this.ringX + 20}px, ${this.ringY - 10}px)`;
    }
  }
}

export default new Mouse();
