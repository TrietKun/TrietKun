import gsap from 'gsap';

/**
 * ProjectsExperience — Cinematic project detail overlay system
 *
 * When a project card is clicked, it expands into an immersive full-screen
 * detail view with 3D perspective animations, staggered reveals, and
 * glassmorphism design.
 */
class ProjectsExperience {
  constructor() {
    this.isOpen = false;
    this.currentProject = null;
    this.overlay = null;
    this.tl = null;

    this._cacheElements();
    this._bindEvents();
  }

  _cacheElements() {
    this.overlay = document.getElementById('project-detail-overlay');
    this.cards = document.querySelectorAll('.project-card[data-project]');
    this.closeBtn = document.querySelector('.project-detail-close');
    this.detailPanels = document.querySelectorAll('.project-detail');
  }

  _bindEvents() {
    // Card click → open detail
    this.cards.forEach((card) => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        const projectId = card.dataset.project;
        this.open(projectId, card);
      });
    });

    // Close button
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    // Click overlay backdrop to close
    if (this.overlay) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay || e.target.classList.contains('project-detail-backdrop')) {
          this.close();
        }
      });
    }

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  open(projectId, cardEl) {
    if (this.isOpen) return;
    this.isOpen = true;
    this.currentProject = projectId;

    // Find the matching detail panel
    const detail = this.overlay?.querySelector(`.project-detail[data-project="${projectId}"]`);
    if (!detail || !this.overlay) return;

    // Hide all detail panels, show the active one
    this.detailPanels.forEach((p) => p.classList.remove('active'));
    detail.classList.add('active');

    // Get card position for origin animation
    const rect = cardEl.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    // Set transform origin from card position
    this.overlay.style.perspectiveOrigin = `${originX}px ${originY}px`;

    // Show overlay
    this.overlay.classList.add('active');

    // Kill previous timeline
    if (this.tl) this.tl.kill();
    this.tl = gsap.timeline();

    // Backdrop fade
    const backdrop = this.overlay.querySelector('.project-detail-backdrop');
    if (backdrop) {
      this.tl.fromTo(backdrop,
        { opacity: 0 },
        { opacity: 1, duration: 0.4, ease: 'power2.out' },
        0
      );
    }

    // Detail container — 3D perspective entrance
    const container = detail.querySelector('.project-detail-container');
    if (container) {
      this.tl.fromTo(container,
        {
          opacity: 0,
          scale: 0.85,
          rotateX: 8,
          rotateY: -4,
          y: 60,
          filter: 'blur(12px)'
        },
        {
          opacity: 1,
          scale: 1,
          rotateX: 0,
          rotateY: 0,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.8,
          ease: 'expo.out'
        },
        0.1
      );
    }

    // Stagger in detail elements
    const header = detail.querySelector('.pd-header');
    const sections = detail.querySelectorAll('.pd-section');
    const techTags = detail.querySelectorAll('.pd-tech-tag');
    const features = detail.querySelectorAll('.pd-feature');
    const links = detail.querySelectorAll('.pd-link');

    if (header) {
      this.tl.fromTo(header,
        { y: 30, opacity: 0, filter: 'blur(6px)' },
        { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.7, ease: 'expo.out' },
        0.25
      );
    }

    if (sections.length) {
      this.tl.fromTo(sections,
        { y: 40, opacity: 0, filter: 'blur(4px)' },
        { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.8, ease: 'expo.out', stagger: 0.08 },
        0.35
      );
    }

    if (techTags.length) {
      this.tl.fromTo(techTags,
        { scale: 0.7, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2)', stagger: 0.04 },
        0.5
      );
    }

    if (features.length) {
      this.tl.fromTo(features,
        { x: -20, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.5, ease: 'expo.out', stagger: 0.04 },
        0.55
      );
    }

    if (links.length) {
      this.tl.fromTo(links,
        { y: 20, opacity: 0, scale: 0.9 },
        { y: 0, opacity: 1, scale: 1, duration: 0.6, ease: 'expo.out', stagger: 0.1 },
        0.7
      );
    }

    // Glow pulse on the detail
    const glow = detail.querySelector('.pd-glow');
    if (glow) {
      this.tl.fromTo(glow,
        { opacity: 0, scale: 0.5 },
        { opacity: 1, scale: 1, duration: 1.2, ease: 'expo.out' },
        0.2
      );
    }
  }

  close() {
    if (!this.isOpen || !this.overlay) return;

    if (this.tl) this.tl.kill();
    this.tl = gsap.timeline({
      onComplete: () => {
        this.overlay.classList.remove('active');
        this.detailPanels.forEach((p) => p.classList.remove('active'));
        this.isOpen = false;
        this.currentProject = null;
      }
    });

    const activeDetail = this.overlay.querySelector('.project-detail.active');
    const container = activeDetail?.querySelector('.project-detail-container');
    const backdrop = this.overlay.querySelector('.project-detail-backdrop');

    if (container) {
      this.tl.to(container, {
        opacity: 0,
        scale: 0.92,
        rotateX: -4,
        y: 40,
        filter: 'blur(8px)',
        duration: 0.45,
        ease: 'power3.in',
      }, 0);
    }

    if (backdrop) {
      this.tl.to(backdrop, {
        opacity: 0,
        duration: 0.35,
        ease: 'power2.in',
      }, 0.1);
    }
  }
}

export default ProjectsExperience;
