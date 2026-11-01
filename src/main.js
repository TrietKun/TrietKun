import * as THREE from 'three';
import gsap from 'gsap';
import mouse from './core/Mouse.js';
import stateManager, { STATES } from './core/StateManager.js';
import CameraSystem from './systems/CameraSystem.js';
import ParticleSystem from './systems/ParticleSystem.js';
import PostProcessing from './systems/PostProcessing.js';
import SceneEnvironment from './systems/SceneEnvironment.js';
import LightingDirector from './systems/LightingDirector.js';
import UIController from './systems/UIController.js';
import SkillsNetwork from './systems/SkillsNetwork.js';
import AboutExperience from './systems/AboutExperience.js';
import ProjectsExperience from './systems/ProjectsExperience.js';
import EnergyBeams from './systems/EnergyBeams.js';
import TextScramble from './systems/TextScramble.js';
import ShootingStars from './systems/ShootingStars.js';
import FloatingCode from './systems/FloatingCode.js';
import LightPillars from './systems/LightPillars.js';
import IdleAttract from './systems/IdleAttract.js';
import SoundManager from './systems/SoundManager.js';

/**
 * TRIET TRUONG - Digital Experience
 * Main application entry point
 */

const LOADER_TIMEOUT_MS = 8000;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// UI transitions still run, but almost instantly
if (prefersReducedMotion) gsap.globalTimeline.timeScale(6);

/**
 * Last-resort reveal: hides the loader and shows the DOM content even when the
 * WebGL scene could not start, so the page is never stuck on the loading screen.
 */
function revealContentWithoutScene() {
  const loader = document.getElementById('loader');
  if (loader) loader.style.display = 'none';
  document.getElementById('ui-overlay')?.classList.add('visible');
  document
    .querySelectorAll('.intro-line, .intro-greeting, .intro-subtitle, .intro-cta')
    .forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.style.filter = 'none';
    });
}

class Experience {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.clock = new THREE.Clock();
    this.time = 0;
    this._loaded = false;
    this._failedSystems = new Set();

    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._initSystems();
    this._initPostProcessing();
    this._initUI();
    this._bindEvents();
    this._startLoading();
  }

  /**
   * Runs one system's init in isolation: a failure is logged and the rest keep starting.
   */
  _safeInit(name, factory) {
    try {
      return factory();
    } catch (error) {
      console.error(`[initSystems] ${name} failed`, error);
      this._failedSystems.add(name);
      return null;
    }
  }

  /**
   * Runs one system's per-frame update; a throwing system is logged once and
   * disabled instead of breaking the whole frame.
   */
  _safeUpdate(name, system, update) {
    if (!system || this._failedSystems.has(name)) return;
    try {
      update(system);
    } catch (error) {
      console.error(`[update] ${name} failed`, error);
      this._failedSystems.add(name);
    }
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    // Use visualViewport for mobile browser chrome awareness
    const vw = window.visualViewport?.width || window.innerWidth;
    const vh = window.visualViewport?.height || window.innerHeight;
    this.renderer.setSize(vw, vh);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    // All lighting handled by LightingDirector — no inline lights
  }

  _initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 0.5, 14);
  }

  _initSystems() {
    const init = (name, factory) => this._safeInit(name, factory);

    this.cameraSystem = init('CameraSystem', () => new CameraSystem(this.camera));
    this.particles = init('ParticleSystem', () => new ParticleSystem(this.scene));
    this.environment = init('SceneEnvironment', () => new SceneEnvironment(this.scene, this.camera));
    this.lighting = init('LightingDirector', () => new LightingDirector(this.scene));
    this.skillsNetwork = init('SkillsNetwork', () => new SkillsNetwork());
    this.aboutExperience = init('AboutExperience', () => new AboutExperience());
    this.projectsExperience = init('ProjectsExperience', () => new ProjectsExperience());

    // Energy beams connecting hologram meshes
    this.energyBeams = this.environment
      ? init('EnergyBeams', () => new EnergyBeams(this.scene, this.environment.holoMeshes))
      : null;

    // Decorative systems are skipped entirely for reduced motion
    this.shootingStars = prefersReducedMotion ? null : init('ShootingStars', () => new ShootingStars(this.scene));
    this.floatingCode = prefersReducedMotion ? null : init('FloatingCode', () => new FloatingCode(this.scene));
    this.lightPillars = prefersReducedMotion ? null : init('LightPillars', () => new LightPillars(this.scene, this.camera));
    this.idleAttract = prefersReducedMotion ? null : init('IdleAttract', () => new IdleAttract());
    this.soundManager = init('SoundManager', () => new SoundManager());

    stateManager.on('state:change', ({ to }) => {
      this._safeUpdate('SkillsNetwork', this.skillsNetwork, (system) => {
        if (to === STATES.SKILLS) system.activate();
        else system.deactivate();
      });
      this._safeUpdate('AboutExperience', this.aboutExperience, (system) => {
        if (to === STATES.ABOUT) system.activate();
        else system.deactivate();
      });
    });
  }

  _initPostProcessing() {
    this.postProcessing = this._safeInit('PostProcessing', () => (
      new PostProcessing(this.renderer, this.scene, this.camera)
    ));
  }

  _initUI() {
    this.ui = this._safeInit('UIController', () => new UIController(this.postProcessing, this.particles));
  }

  _bindEvents() {
    window.addEventListener('resize', () => this._onResize());
    // Mobile browser chrome changes (address bar show/hide)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this._onResize());
    }

    // Click ripple shockwave
    window.addEventListener('click', (e) => {
      const x = e.clientX / window.innerWidth;
      const y = 1.0 - e.clientY / window.innerHeight; // flip Y for shader
      this.postProcessing?.triggerRipple(x, y, 0.8);
    });
  }

  _onResize() {
    const w = window.visualViewport?.width || window.innerWidth;
    const h = window.visualViewport?.height || window.innerHeight;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this.postProcessing?.onResize(w, h);
    this.particles?.onResize();
  }

  _startLoading() {
    const loaderBar = document.querySelector('.loader-bar');
    const loaderPercent = document.querySelector('.loader-percent');

    let progress = 0;
    const loadInterval = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(loadInterval);
        setTimeout(() => this._onLoadComplete(), 400);
      }

      if (loaderBar) loaderBar.style.width = progress + '%';
      if (loaderPercent) loaderPercent.textContent = Math.floor(progress) + '%';
    }, 200);

    // Watchdog: whatever happens above, the loader must go away
    setTimeout(() => {
      if (this._loaded) return;
      console.error(`[loader] still loading after ${LOADER_TIMEOUT_MS}ms, forcing reveal`);
      clearInterval(loadInterval);
      this._onLoadComplete();
    }, LOADER_TIMEOUT_MS);

    this._animate();
  }

  _onLoadComplete() {
    if (this._loaded) return;
    this._loaded = true;

    try {
      this._playIntroSequence();
    } catch (error) {
      console.error('[loader] intro sequence failed', error);
      revealContentWithoutScene();
    }
  }

  _playIntroSequence() {
    const loader = document.getElementById('loader');
    const pp = this.postProcessing;

    // --- ELEGANT INTRO SEQUENCE ---

    // 1. Smooth loader fade
    gsap.to(loader, {
      opacity: 0,
      duration: 1.0,
      ease: 'power2.inOut',
      onComplete: () => { loader.style.display = 'none'; },
    });

    // 2. Gentle rise from darkness
    if (pp) {
      pp.exposure.value = 0;
      gsap.to(pp.exposure, { value: 1.0, duration: 2.0, ease: 'power2.out', delay: 0.3 });

      // 3. Soft bloom
      pp.bloomStrength.value = 0.8;
      gsap.to(pp.bloomStrength, { value: 0.5, duration: 2.5, ease: 'power2.out', delay: 0.5 });
    }

    // 4. Show UI
    gsap.delayedCall(0.8, () => this.ui?.show());
    // If the UI controller failed to start, still make the page visible
    if (!this.ui) document.getElementById('ui-overlay')?.classList.add('visible');

    // 5. Particles expand in gracefully
    if (this.particles) {
      gsap.to(this.particles.transitionValue, { value: 1, duration: 4, ease: 'power3.out' });
    }

    // 6. Gentle dolly
    gsap.to(this.camera.position, { z: 10, y: 0.3, duration: 4.5, ease: 'power3.out' });

    // 7. Elegant text reveal — smooth fade + rise, no scramble
    gsap.delayedCall(1.2, () => {
      const introLines = document.querySelectorAll('.intro-line');
      const greeting = document.getElementById('greeting');
      const subtitle = document.querySelector('.intro-subtitle');
      const cta = document.querySelector('.intro-cta');

      if (greeting) {
        gsap.fromTo(greeting,
          { y: 15, opacity: 0 },
          { y: 0, opacity: 0.6, duration: 1.2, ease: 'power3.out' }
        );
      }

      gsap.fromTo(introLines,
        { y: 40, opacity: 0, filter: 'blur(6px)' },
        { y: 0, opacity: 1, filter: 'blur(0px)', duration: 1.4, ease: 'power3.out', stagger: 0.2 }
      );

      gsap.fromTo(subtitle,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.2, ease: 'power3.out', delay: 0.6 }
      );

      gsap.fromTo(cta,
        { y: 15, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.0, ease: 'power3.out', delay: 1.0 }
      );
    });
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const deltaTime = this.clock.getDelta();
    // Reduced motion: the scene keeps rendering but drifts at a fraction of the speed
    const scaledDelta = prefersReducedMotion ? deltaTime * 0.15 : deltaTime;
    this.time += scaledDelta;

    // Update all systems; one failing system never stops the frame
    this._safeUpdate('Mouse', mouse, (system) => system.update());
    this._safeUpdate('CameraSystem', this.cameraSystem, (system) => system.update(scaledDelta));
    this._safeUpdate('ParticleSystem', this.particles, (system) => system.update(this.time));
    this._safeUpdate('SceneEnvironment', this.environment, (system) => system.update(this.time));
    this._safeUpdate('LightingDirector', this.lighting, (system) => system.update(this.time));
    this._safeUpdate('EnergyBeams', this.energyBeams, (system) => system.update(this.time));
    this._safeUpdate('SkillsNetwork', this.skillsNetwork, (system) => system.update(this.time));
    this._safeUpdate('ShootingStars', this.shootingStars, (system) => system.update(this.time));
    this._safeUpdate('FloatingCode', this.floatingCode, (system) => system.update(this.time));
    this._safeUpdate('LightPillars', this.lightPillars, (system) => system.update(this.time));

    // Render with post-processing, falling back to a plain render
    if (this.postProcessing && !this._failedSystems.has('PostProcessing')) {
      this._safeUpdate('PostProcessing', this.postProcessing, (system) => system.update(this.time));
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

// Launch
try {
  new Experience();
} catch (error) {
  console.error('[Experience] failed to start, showing static content', error);
  revealContentWithoutScene();
}

// =============================================
// Time-Based Greeting
// =============================================
(function initGreeting() {
  const el = document.getElementById('greeting');
  if (!el) return;
  const hour = new Date().getHours();
  let greeting;
  if (hour >= 5 && hour < 12) greeting = 'GOOD MORNING';
  else if (hour >= 12 && hour < 17) greeting = 'GOOD AFTERNOON';
  else if (hour >= 17 && hour < 21) greeting = 'GOOD EVENING';
  else greeting = 'GOOD NIGHT';
  el.textContent = `- ${greeting} -`;
})();

// =============================================
// Lazy-load Interactive Terminal & Touch Navigation
// =============================================
(async function loadExtras() {
  const [{ default: InteractiveTerminal }, { default: TouchNavigation }] = await Promise.all([
    import('./systems/InteractiveTerminal.js').catch(() => ({ default: null })),
    import('./systems/TouchNavigation.js').catch(() => ({ default: null })),
  ]);

  if (InteractiveTerminal) {
    try {
      const terminalInstance = new InteractiveTerminal();
      stateManager.on('state:change', ({ to }) => {
        if (to === 'CONTACT') terminalInstance.activate();
        else terminalInstance.deactivate();
      });
    } catch (error) {
      console.error('[loadExtras] InteractiveTerminal failed', error);
    }
  }

  if (TouchNavigation) {
    try {
      new TouchNavigation();
    } catch (error) {
      console.error('[loadExtras] TouchNavigation failed', error);
    }
  }
})().catch((error) => console.error('[loadExtras] failed', error));

// =============================================
// Scroll Progress Bar — tracks scroll on active screens
// =============================================
(function initScrollProgress() {
  const bar = document.getElementById('scroll-progress');
  if (!bar) return;

  const updateProgress = () => {
    const activeScreen = document.querySelector('.screen.active');
    if (!activeScreen) { bar.style.width = '0%'; return; }
    const scrollTop = activeScreen.scrollTop;
    const scrollHeight = activeScreen.scrollHeight - activeScreen.clientHeight;
    if (scrollHeight <= 0) { bar.style.width = '0%'; return; }
    const progress = Math.min(scrollTop / scrollHeight * 100, 100);
    bar.style.width = progress + '%';
  };

  // Listen for scroll on all screens
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.addEventListener('scroll', updateProgress, { passive: true });
  });

  // Reset on state change
  const observer = new MutationObserver(updateProgress);
  document.querySelectorAll('.screen').forEach((screen) => {
    observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
  });
})();

// =============================================
// Show keyboard hints after 3 seconds
// =============================================
(function initKeyboardHints() {
  const hint = document.getElementById('keyboard-hint');
  if (!hint) return;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouchDevice) return;
  setTimeout(() => {
    hint.classList.add('visible');
    setTimeout(() => hint.classList.remove('visible'), 8000);
  }, 3000);
})();

// =============================================
// CSS Ambient Particles — floating background particles
// =============================================
(function initAmbientParticles() {
  const container = document.getElementById('ambient-particles');
  if (!container) return;
  const count = 12;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'ambient-particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.setProperty('--float-duration', (6 + Math.random() * 10) + 's');
    p.style.setProperty('--float-delay', (-Math.random() * 15) + 's');
    p.style.setProperty('--float-x', (Math.random() * 80 - 40) + 'px');
    container.appendChild(p);
  }
})();

// (cursor sparkle trail removed — not elegant enough)
