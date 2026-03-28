import gsap from 'gsap';
import stateManager, { STATES } from '../core/StateManager.js';
import TextScramble from './TextScramble.js';

/**
 * Controls DOM UI transitions with dramatic cinematic timing:
 * - Exposure dip-to-black / flash
 * - Chromatic aberration spike
 * - Bloom burst
 * - Multi-phase glitch
 * - Dramatic stagger animations with scale + skew + blur
 */
class UIController {
  constructor(postProcessing, particles) {
    this.pp = postProcessing;
    this.particles = particles;
    this.screens = {};
    this.navItems = [];
    this.transitionTl = null;

    this._cacheElements();
    this._bindEvents();
    this._listenState();
    this._initKonamiCode();
  }

  _cacheElements() {
    Object.values(STATES).forEach((state) => {
      const el = document.getElementById(`screen-${state.toLowerCase()}`);
      if (el) this.screens[state] = el;
    });

    this.navItems = document.querySelectorAll('.nav-item');
    this.stateLabel = document.querySelector('.state-label');
    this.overlay = document.getElementById('ui-overlay');
  }

  _bindEvents() {
    this.navItems.forEach((item) => {
      item.addEventListener('click', () => {
        const state = item.dataset.state;
        if (state) stateManager.transition(state);
      });
    });

    const logo = document.querySelector('.nav-logo');
    if (logo) {
      logo.addEventListener('click', () => {
        stateManager.transition(STATES.MAIN_HUB);
      });
    }

    const cta = document.querySelector('.cta-button');
    if (cta) {
      cta.addEventListener('click', () => {
        const state = cta.dataset.state;
        if (state) stateManager.transition(state);
      });
    }

    document.querySelectorAll('.hub-card').forEach((card) => {
      card.addEventListener('click', () => {
        const state = card.dataset.state;
        if (state) stateManager.transition(state);
      });
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        card.style.setProperty('--mouse-x', (x * 100) + '%');
        card.style.setProperty('--mouse-y', (y * 100) + '%');
        // 3D tilt: ±8 degrees
        card.style.setProperty('--tilt-x', ((0.5 - y) * 16) + 'deg');
        card.style.setProperty('--tilt-y', ((x - 0.5) * 16) + 'deg');
      });
      card.addEventListener('mouseleave', () => {
        card.style.setProperty('--tilt-x', '0deg');
        card.style.setProperty('--tilt-y', '0deg');
      });
    });

    // 3D tilt on project cards
    document.querySelectorAll('.project-card').forEach((card) => {
      const inner = card.querySelector('.project-card-inner');
      if (!inner) return;
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        inner.style.setProperty('--tilt-x', ((0.5 - y) * 12) + 'deg');
        inner.style.setProperty('--tilt-y', ((x - 0.5) * 12) + 'deg');
      });
      card.addEventListener('mouseleave', () => {
        inner.style.setProperty('--tilt-x', '0deg');
        inner.style.setProperty('--tilt-y', '0deg');
      });
    });

    document.querySelectorAll('.back-button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const state = btn.dataset.state;
        if (state) stateManager.transition(state);
      });
    });

    // --- Keyboard Navigation (1-4 keys) ---
    window.addEventListener('keydown', (e) => {
      // Don't intercept if user is typing in an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case '1': stateManager.transition(STATES.ABOUT); break;
        case '2': stateManager.transition(STATES.PROJECTS); break;
        case '3': stateManager.transition(STATES.SKILLS); break;
        case '4': stateManager.transition(STATES.CONTACT); break;
        case '0':
        case 'Escape': stateManager.transition(STATES.MAIN_HUB); break;
        case 'h':
        case 'Home': stateManager.transition(STATES.INTRO); break;
      }
    });

    // --- Click Explosion Particles ---
    const interactiveSelector = 'button, a, .cta-button, .hub-card, .nav-item, .back-button, .project-card, .nav-logo';
    window.addEventListener('click', (e) => {
      // Skip particles on interactive elements
      if (e.target.closest(interactiveSelector)) return;
      this._spawnClickParticles(e.clientX, e.clientY);
    });
  }

  _spawnClickParticles(x, y) {
    const colors = ['#00f0ff', '#a855f7'];
    for (let i = 0; i < 12; i++) {
      const particle = document.createElement('div');
      particle.className = 'click-particle';
      const angle = (Math.PI * 2 * i) / 12 + (Math.random() - 0.5) * 0.5;
      const distance = 30 + Math.random() * 60;
      const size = 3 + Math.random() * 5;
      particle.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        pointer-events: none;
        z-index: 9999;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        --angle: ${angle};
        --distance: ${distance}px;
        --size: ${size}px;
      `;
      document.body.appendChild(particle);

      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance;

      gsap.to(particle, {
        x: tx,
        y: ty,
        opacity: 0,
        scale: 0,
        duration: 0.6,
        ease: 'expo.out',
        onComplete: () => particle.remove(),
      });
    }
  }

  _listenState() {
    stateManager.on('state:change', ({ from, to }) => {
      this._cinematicTransition(from, to);
      this._updateNav(to);
      this._updateStateLabel(to);
    });
  }

  /**
   * Elegant smooth transition — no glitch, no harsh exposure dip.
   * Gentle crossfade with blur, soft bloom pulse, graceful element reveals.
   */
  _cinematicTransition(from, to) {
    if (this.transitionTl) this.transitionTl.kill();
    this.transitionTl = gsap.timeline();

    const pp = this.pp;
    const fromScreen = this.screens[from];
    const toScreen = this.screens[to];

    // --- Subtle bloom pulse ---
    this.transitionTl.to(pp.bloomStrength, { value: 0.8, duration: 0.4, ease: 'power2.in' }, 0);
    this.transitionTl.to(pp.bloomStrength, { value: 0.5, duration: 1.0, ease: 'expo.out' }, 0.5);

    // --- Gentle vignette tighten + release ---
    this.transitionTl.to(pp.vignetteIntensity, { value: 2.8, duration: 0.4, ease: 'power2.in' }, 0);
    this.transitionTl.to(pp.vignetteIntensity, { value: 2.2, duration: 1.0, ease: 'expo.out' }, 0.5);

    // --- Soft exposure dip (not to black, just dim) ---
    this.transitionTl.to(pp.exposure, { value: 0.7, duration: 0.4, ease: 'power2.inOut' }, 0);
    this.transitionTl.to(pp.exposure, { value: 1.0, duration: 0.8, ease: 'expo.out' }, 0.45);

    // --- Tiny CA for elegance ---
    this.transitionTl.to(pp.chromaticAberration, { value: 0.008, duration: 0.3, ease: 'power2.in' }, 0);
    this.transitionTl.to(pp.chromaticAberration, { value: 0.003, duration: 0.8, ease: 'expo.out' }, 0.4);

    // --- Old screen: gentle fade out ---
    if (fromScreen) {
      this.transitionTl.to(fromScreen, {
        opacity: 0,
        y: -20,
        filter: 'blur(8px)',
        duration: 0.5,
        ease: 'power2.in',
        onComplete: () => {
          fromScreen.classList.remove('active');
          gsap.set(fromScreen, { y: 0, filter: 'none' });
        },
      }, 0);
    }

    // --- New screen: elegant entrance ---
    if (toScreen) {
      this.transitionTl.call(() => {
        toScreen.classList.add('active');
        gsap.set(toScreen, { opacity: 0, y: 30, filter: 'blur(6px)' });
      }, [], 0.4);

      this.transitionTl.to(toScreen, {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.8,
        ease: 'expo.out',
      }, 0.45);

      this.transitionTl.call(() => {
        this._animateScreenElements(toScreen, to);
      }, [], 0.6);
    }
  }

  _animateScreenElements(screen, state) {
    const elements = screen.querySelectorAll(
      '.section-header, .project-card, .skill-node, .terminal, .hub-card, .intro-line, .intro-subtitle, .cta-button'
    );

    gsap.fromTo(elements,
      {
        y: 30,
        opacity: 0,
        filter: 'blur(4px)',
      },
      {
        y: 0,
        opacity: 1,
        filter: 'blur(0px)',
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.08,
      }
    );

    // Text scramble disabled — all labels readable instantly

    if (state === STATES.CONTACT) {
      this._animateTerminal(screen);
    }

    // --- Hub Card Counter Animation ---
    if (state === STATES.MAIN_HUB) {
      this._animateHubCardCounters(screen);
    }
  }

  _animateHubCardCounters(screen) {
    const icons = screen.querySelectorAll('.hub-card-icon');
    icons.forEach((icon) => {
      const target = parseInt(icon.textContent, 10);
      if (isNaN(target) || target <= 0) return;

      let current = 0;
      icon.textContent = '00';
      const duration = 800;
      const steps = target;
      const interval = Math.floor(duration / steps);

      const timer = setInterval(() => {
        current++;
        icon.textContent = current < 10 ? '0' + current : String(current);
        if (current >= target) clearInterval(timer);
      }, interval);
    });
  }

  _animateTerminal(screen) {
    const lines = screen.querySelectorAll('.terminal-line');
    gsap.set(lines, { opacity: 0, x: -20 });
    lines.forEach((line, i) => {
      gsap.to(line, {
        opacity: 1,
        x: 0,
        duration: 0.4,
        ease: 'expo.out',
        delay: 0.6 + i * 0.1,
      });
    });
  }

  _updateNav(state) {
    this.navItems.forEach((item) => {
      item.classList.toggle('active', item.dataset.state === state);
    });
  }

  _updateStateLabel(state) {
    if (this.stateLabel) {
      gsap.to(this.stateLabel, {
        opacity: 0,
        duration: 0.15,
        onComplete: () => {
          this.stateLabel.textContent = state.replace('_', ' ');
          gsap.to(this.stateLabel, { opacity: 1, duration: 0.4, delay: 0.3 });
        },
      });
    }
  }

  show() {
    if (this.overlay) {
      this.overlay.classList.add('visible');
    }
    this._initParallax();
    this._initMagneticElements();
  }

  _initParallax() {
    // Skip parallax on touch devices — causes layout issues
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) return;

    window.addEventListener('mousemove', (e) => {
      const mx = (e.clientX / window.innerWidth - 0.5) * 2;
      const my = (e.clientY / window.innerHeight - 0.5) * 2;

      // Parallax depth layers — different elements move at different rates
      const introContent = document.querySelector('.intro-content');
      if (introContent) {
        introContent.style.transform = `translate(${mx * -8}px, ${my * -6}px)`;
      }

      const hubContent = document.querySelector('.hub-content');
      if (hubContent) {
        hubContent.style.transform = `translate(${mx * -5}px, ${my * -4}px)`;
      }

      const sectionHeaders = document.querySelectorAll('.section-header');
      sectionHeaders.forEach((h) => {
        h.style.transform = `translate(${mx * -4}px, ${my * -3}px)`;
      });
    });
  }

  _initMagneticElements() {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) return;

    const selector = '.cta-button, .hub-card, .nav-item, .back-button';
    let ticking = false;
    let mouseX = 0;
    let mouseY = 0;

    const update = () => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = mouseX - cx;
        const dy = mouseY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 100) {
          const pull = (1 - dist / 100) * 8;
          const tx = (dx / dist) * pull;
          const ty = (dy / dist) * pull;
          el.style.transform = `translate(${tx}px, ${ty}px)`;
          el.dataset.magnetic = 'true';
        } else if (el.dataset.magnetic === 'true') {
          el.style.transform = '';
          el.dataset.magnetic = 'false';
        }
      });
      ticking = false;
    };

    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    });
  }

  // --- Konami Code Easter Egg ---
  _initKonamiCode() {
    const sequence = [
      'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
      'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
      'b', 'a',
    ];
    let index = 0;

    window.addEventListener('keydown', (e) => {
      const expected = sequence[index];
      if (e.key === expected || e.key.toLowerCase() === expected) {
        index++;
        if (index === sequence.length) {
          index = 0;
          this._triggerMatrixRain();
        }
      } else {
        index = 0;
      }
    });
  }

  _triggerMatrixRain() {
    // Glitch burst
    this.pp.setGlitch(1.5);
    setTimeout(() => this.pp.setGlitch(0.5), 300);
    setTimeout(() => this.pp.setGlitch(0), 800);

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'matrix-rain';
    overlay.className = 'matrix-active';
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      z-index: 10000;
      pointer-events: none;
      overflow: hidden;
      opacity: 1;
      transition: opacity 0.8s ease;
    `;
    document.body.appendChild(overlay);

    const katakana = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
    const latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const chars = katakana + latin;

    // Spawn 30 columns
    for (let i = 0; i < 30; i++) {
      const column = document.createElement('div');
      const x = Math.random() * 100;
      const speed = 2 + Math.random() * 4;
      const delay = Math.random() * 2;
      const fontSize = 12 + Math.random() * 8;

      column.style.cssText = `
        position: absolute;
        left: ${x}%;
        top: -20%;
        font-family: monospace;
        font-size: ${fontSize}px;
        color: #00ff41;
        text-shadow: 0 0 8px #00ff41, 0 0 20px #00ff41;
        writing-mode: vertical-rl;
        white-space: nowrap;
        animation: matrix-fall ${speed}s ${delay}s linear infinite;
        opacity: ${0.4 + Math.random() * 0.6};
      `;

      // Generate random character string
      let text = '';
      const len = 10 + Math.floor(Math.random() * 20);
      for (let j = 0; j < len; j++) {
        text += chars[Math.floor(Math.random() * chars.length)];
      }
      column.textContent = text;
      overlay.appendChild(column);
    }

    // Inject keyframes if not present
    if (!document.getElementById('matrix-rain-style')) {
      const style = document.createElement('style');
      style.id = 'matrix-rain-style';
      style.textContent = `
        @keyframes matrix-fall {
          0% { transform: translateY(0); }
          100% { transform: translateY(130vh); }
        }
      `;
      document.head.appendChild(style);
    }

    // Fade out and remove after 5 seconds
    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 800);
    }, 5000);
  }
}

export default UIController;
