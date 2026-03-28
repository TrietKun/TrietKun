import stateManager, { STATES } from '../core/StateManager.js';

const STATE_ORDER = [
  STATES.INTRO,
  STATES.MAIN_HUB,
  STATES.ABOUT,
  STATES.PROJECTS,
  STATES.SKILLS,
  STATES.CONTACT,
];

const SWIPE_MIN_DX = 50;
const SWIPE_MAX_DY = 75;

class TouchNavigation {
  constructor() {
    if (!('ontouchstart' in window)) return;

    this.startX = 0;
    this.startY = 0;
    this.tracking = false;

    this._bindTouch();
    this._createIndicators();
  }

  _bindTouch() {
    const opts = { passive: true };

    document.addEventListener('touchstart', (e) => {
      if (stateManager.transitioning) return;
      const touch = e.touches[0];
      this.startX = touch.clientX;
      this.startY = touch.clientY;
      this.tracking = true;
      this._showIndicators();
    }, opts);

    document.addEventListener('touchmove', (e) => {
      if (!this.tracking) return;
      const touch = e.touches[0];
      const dy = Math.abs(touch.clientY - this.startY);
      // If vertical movement exceeds threshold, cancel swipe tracking
      if (dy > SWIPE_MAX_DY) {
        this.tracking = false;
        this._hideIndicators();
      }
    }, opts);

    document.addEventListener('touchend', (e) => {
      if (!this.tracking) return;
      this.tracking = false;
      this._hideIndicators();

      if (stateManager.transitioning) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - this.startX;
      const dy = Math.abs(touch.clientY - this.startY);

      if (Math.abs(dx) < SWIPE_MIN_DX || dy > SWIPE_MAX_DY) return;

      if (dx < 0) {
        this._navigate(1); // swipe left → next
      } else {
        this._navigate(-1); // swipe right → previous
      }
    });
  }

  _navigate(direction) {
    const currentIndex = STATE_ORDER.indexOf(stateManager.current);
    if (currentIndex === -1) return;

    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= STATE_ORDER.length) return;

    stateManager.transition(STATE_ORDER[nextIndex]);
  }

  _createIndicators() {
    const style = document.createElement('style');
    style.textContent = `
      .swipe-indicator {
        position: fixed;
        top: 50%;
        transform: translateY(-50%);
        width: 20px;
        height: 40px;
        z-index: 9999;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.25s ease;
      }
      .swipe-indicator.visible {
        opacity: 0.4;
        animation: swipe-pulse 1.2s ease-in-out infinite;
      }
      .swipe-indicator--left {
        left: 6px;
      }
      .swipe-indicator--right {
        right: 6px;
      }
      .swipe-indicator svg {
        width: 100%;
        height: 100%;
        fill: none;
        stroke: rgba(255, 255, 255, 0.8);
        stroke-width: 2.5;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      @keyframes swipe-pulse {
        0%, 100% { opacity: 0.2; }
        50% { opacity: 0.5; }
      }
    `;
    document.head.appendChild(style);

    this.leftIndicator = this._createArrow('left');
    this.rightIndicator = this._createArrow('right');
    document.body.appendChild(this.leftIndicator);
    document.body.appendChild(this.rightIndicator);
  }

  _createArrow(direction) {
    const el = document.createElement('div');
    el.className = `swipe-indicator swipe-indicator--${direction}`;
    const points = direction === 'left' ? '15,5 5,20 15,35' : '5,5 15,20 5,35';
    el.innerHTML = `<svg viewBox="0 0 20 40"><polyline points="${points}"/></svg>`;
    return el;
  }

  _showIndicators() {
    const idx = STATE_ORDER.indexOf(stateManager.current);
    if (idx > 0 && this.leftIndicator) {
      this.leftIndicator.classList.add('visible');
    }
    if (idx < STATE_ORDER.length - 1 && this.rightIndicator) {
      this.rightIndicator.classList.add('visible');
    }
  }

  _hideIndicators() {
    if (this.leftIndicator) this.leftIndicator.classList.remove('visible');
    if (this.rightIndicator) this.rightIndicator.classList.remove('visible');
  }

  dispose() {
    if (this.leftIndicator) this.leftIndicator.remove();
    if (this.rightIndicator) this.rightIndicator.remove();
  }
}

export default TouchNavigation;
