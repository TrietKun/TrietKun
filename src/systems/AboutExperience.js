import gsap from 'gsap';

/**
 * Immersive About section — scene-based storytelling with:
 * - Word-by-word blur-to-sharp reveal
 * - Scene transitions with scatter/dissolve
 * - Floating decorative elements responding to mouse
 * - Timeline animations
 * - Progressive scene navigation
 */
class AboutExperience {
  constructor() {
    this.currentScene = 0;
    this.totalScenes = 4;
    this.isAnimating = false;
    this.isActive = false;
    this.sceneTl = null;
    this.mouseX = 0;
    this.mouseY = 0;
    this.rafId = null;

    this._cacheElements();
    this._bindEvents();
    this._prepareWordWrapping();
  }

  _cacheElements() {
    this.container = document.querySelector('.about-experience');
    this.scenes = document.querySelectorAll('.about-scene');
    this.sceneDots = document.querySelectorAll('.scene-dot');
    this.progress = document.querySelector('.scene-progress');
    this.prevBtn = document.querySelector('.about-prev-btn');
    this.nextBtn = document.querySelector('.about-next-btn');
    this.counter = document.querySelector('.scene-current');
    this.decos = document.querySelectorAll('.about-deco');
    this.glowLayer = document.querySelector('.about-glow-layer');
  }

  _bindEvents() {
    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', () => this.nextScene());
    }
    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', () => this.prevScene());
    }

    this.sceneDots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const target = parseInt(dot.dataset.scene);
        if (target !== this.currentScene) this.goToScene(target);
      });
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!this.isActive) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.nextScene();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.prevScene();
    });

    // Mouse tracking for parallax decos + glow
    if (!('ontouchstart' in window)) {
      window.addEventListener('mousemove', (e) => {
        this.mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
        this.mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
      });
    }
  }

  /**
   * Wrap text inside [data-reveal] elements into individual word spans
   * for staggered word-by-word animation.
   */
  _prepareWordWrapping() {
    const revealElements = document.querySelectorAll('.about-scene [data-reveal]');
    revealElements.forEach((el) => {
      const text = el.textContent.trim();
      el.textContent = '';
      text.split(/\s+/).forEach((word, i) => {
        const span = document.createElement('span');
        span.className = 'reveal-word';
        span.textContent = word;
        span.style.setProperty('--word-i', i);
        el.appendChild(span);
        // Add space between words
        el.appendChild(document.createTextNode(' '));
      });
    });
  }

  /**
   * Called when entering ABOUT state
   */
  activate() {
    this.isActive = true;
    this.currentScene = 0;
    this._resetAllScenes();
    this._showScene(0, true);
    this._updateControls();
    this._startDecoLoop();
  }

  /**
   * Called when leaving ABOUT state
   */
  deactivate() {
    this.isActive = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.sceneTl) this.sceneTl.kill();
  }

  nextScene() {
    if (this.isAnimating || this.currentScene >= this.totalScenes - 1) return;
    this.goToScene(this.currentScene + 1);
  }

  prevScene() {
    if (this.isAnimating || this.currentScene <= 0) return;
    this.goToScene(this.currentScene - 1);
  }

  goToScene(index) {
    if (this.isAnimating || index === this.currentScene) return;
    this.isAnimating = true;

    const oldScene = this.scenes[this.currentScene];
    const newScene = this.scenes[index];
    const direction = index > this.currentScene ? 1 : -1;

    if (this.sceneTl) this.sceneTl.kill();
    this.sceneTl = gsap.timeline({
      onComplete: () => {
        this.isAnimating = false;
      },
    });

    // --- Phase 1: Current scene words scatter out ---
    const oldWords = oldScene.querySelectorAll('.reveal-word');
    const oldOther = oldScene.querySelectorAll('.scene-label, .scene-divider, .scene-tag, .scene-tech-row, .scene-tech-chip, .timeline-item, .scene-signature');

    this.sceneTl.to(oldWords, {
      y: direction * -30,
      opacity: 0,
      filter: 'blur(6px)',
      duration: 0.4,
      ease: 'power3.in',
      stagger: { each: 0.02, from: 'random' },
    }, 0);

    this.sceneTl.to(oldOther, {
      y: direction * -20,
      opacity: 0,
      duration: 0.3,
      ease: 'power3.in',
      stagger: 0.03,
    }, 0);

    this.sceneTl.call(() => {
      oldScene.classList.remove('active');
      gsap.set(oldScene, { clearProps: 'all' });
      gsap.set(oldWords, { clearProps: 'all' });
      gsap.set(oldOther, { clearProps: 'all' });
    }, [], 0.45);

    // --- Phase 2: New scene enters ---
    this.sceneTl.call(() => {
      newScene.classList.add('active');
      this.currentScene = index;
      this._updateControls();
    }, [], 0.45);

    this.sceneTl.call(() => {
      this._showScene(index, false);
    }, [], 0.5);
  }

  _showScene(index, isInitial) {
    const scene = this.scenes[index];
    if (!scene) return;

    const delay = isInitial ? 0.8 : 0;
    const tl = gsap.timeline();

    // Scene label
    const label = scene.querySelector('.scene-label');
    if (label) {
      tl.fromTo(label,
        { y: 20, opacity: 0, letterSpacing: '8px' },
        { y: 0, opacity: 1, letterSpacing: '4px', duration: 0.8, ease: 'expo.out' },
        delay
      );
    }

    // Word-by-word headline reveal (blur → sharp)
    const headlineWords = scene.querySelectorAll('.scene-headline .reveal-word');
    if (headlineWords.length) {
      tl.fromTo(headlineWords,
        { y: 40, opacity: 0, filter: 'blur(12px)', scale: 0.95 },
        {
          y: 0, opacity: 1, filter: 'blur(0px)', scale: 1,
          duration: 1.0, ease: 'expo.out', stagger: 0.08,
        },
        delay + 0.15
      );
    }

    // Divider
    const divider = scene.querySelector('.scene-divider');
    if (divider) {
      tl.fromTo(divider,
        { scaleX: 0 },
        { scaleX: 1, duration: 0.8, ease: 'expo.out' },
        delay + 0.3
      );
    }

    // Word-by-word body reveal
    const bodyWords = scene.querySelectorAll('.scene-body .reveal-word');
    if (bodyWords.length) {
      tl.fromTo(bodyWords,
        { y: 20, opacity: 0, filter: 'blur(6px)' },
        {
          y: 0, opacity: 1, filter: 'blur(0px)',
          duration: 0.7, ease: 'expo.out', stagger: 0.03,
        },
        delay + 0.5
      );
    }

    // Tags / chips
    const chips = scene.querySelectorAll('.scene-tech-chip');
    if (chips.length) {
      tl.fromTo(chips,
        { y: 15, opacity: 0, scale: 0.9 },
        { y: 0, opacity: 1, scale: 1, duration: 0.6, ease: 'expo.out', stagger: 0.06 },
        delay + 0.7
      );
    }

    // Scene tag
    const tag = scene.querySelector('.scene-tag');
    if (tag) {
      tl.fromTo(tag,
        { y: 10, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out' },
        delay + 0.8
      );
    }

    // Timeline items
    const timelineItems = scene.querySelectorAll('.timeline-item');
    if (timelineItems.length) {
      tl.fromTo(timelineItems,
        { x: -30, opacity: 0, filter: 'blur(4px)' },
        {
          x: 0, opacity: 1, filter: 'blur(0px)',
          duration: 0.8, ease: 'expo.out', stagger: 0.2,
        },
        delay + 0.5
      );
    }

    // Signature (Scene 3 wow moment)
    const signature = scene.querySelector('.scene-signature');
    if (signature) {
      const sigLine = signature.querySelector('.signature-line');
      const sigText = signature.querySelector('.signature-text');
      tl.fromTo(sigLine,
        { scaleX: 0 },
        { scaleX: 1, duration: 1.2, ease: 'expo.out' },
        delay + 1.0
      );
      tl.fromTo(sigText,
        { opacity: 0, x: -10 },
        { opacity: 1, x: 0, duration: 0.8, ease: 'expo.out' },
        delay + 1.4
      );
    }

    // Headline glow pulse (wow moment for vision scene)
    const glowHeadline = scene.querySelector('.scene-headline-glow');
    if (glowHeadline) {
      tl.fromTo(glowHeadline,
        { textShadow: '0 0 0px rgba(0,212,255,0)' },
        {
          textShadow: '0 0 40px rgba(0,212,255,0.4), 0 0 80px rgba(124,58,237,0.2)',
          duration: 2.0, ease: 'power2.out',
        },
        delay + 0.8
      );
    }
  }

  _resetAllScenes() {
    this.scenes.forEach((scene, i) => {
      if (i === 0) {
        scene.classList.add('active');
      } else {
        scene.classList.remove('active');
      }
    });
  }

  _updateControls() {
    // Update dots
    this.sceneDots.forEach((dot, i) => {
      dot.classList.toggle('active', i === this.currentScene);
    });

    // Update counter
    if (this.counter) {
      this.counter.textContent = String(this.currentScene + 1).padStart(2, '0');
    }

    // Update progress bar
    if (this.progress) {
      const pct = (this.currentScene / (this.totalScenes - 1)) * 100;
      this.progress.style.width = pct + '%';
    }

    // Disable prev/next at boundaries
    if (this.prevBtn) {
      this.prevBtn.style.opacity = this.currentScene === 0 ? '0.2' : '1';
      this.prevBtn.style.pointerEvents = this.currentScene === 0 ? 'none' : 'auto';
    }
    if (this.nextBtn) {
      this.nextBtn.style.opacity = this.currentScene === this.totalScenes - 1 ? '0.2' : '1';
      this.nextBtn.style.pointerEvents = this.currentScene === this.totalScenes - 1 ? 'none' : 'auto';
    }
  }

  /**
   * Ambient decorative element loop — parallax + floating
   */
  _startDecoLoop() {
    const animate = () => {
      if (!this.isActive) return;

      // Move decos with mouse parallax
      this.decos.forEach((deco, i) => {
        const speed = 0.3 + i * 0.15;
        const x = this.mouseX * speed * 20;
        const y = this.mouseY * speed * 15;
        deco.style.transform = `translate(${x}px, ${y}px)`;
      });

      // Move glow layer with mouse
      if (this.glowLayer) {
        this.glowLayer.style.background = `radial-gradient(600px circle at ${(this.mouseX + 1) * 50}% ${(this.mouseY + 1) * 50}%, rgba(0,212,255,0.03), transparent 60%)`;
      }

      this.rafId = requestAnimationFrame(animate);
    };
    this.rafId = requestAnimationFrame(animate);
  }
}

export default AboutExperience;
