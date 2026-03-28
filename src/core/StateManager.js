/**
 * State-driven experience controller
 * Manages transitions between experience states
 */

const STATES = {
  INTRO: 'INTRO',
  MAIN_HUB: 'MAIN_HUB',
  ABOUT: 'ABOUT',
  PROJECTS: 'PROJECTS',
  SKILLS: 'SKILLS',
  CONTACT: 'CONTACT',
};

class StateManager {
  constructor() {
    this.current = STATES.INTRO;
    this.previous = null;
    this.listeners = new Map();
    this.transitioning = false;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => {
      const cbs = this.listeners.get(event);
      const idx = cbs.indexOf(callback);
      if (idx > -1) cbs.splice(idx, 1);
    };
  }

  emit(event, data) {
    const cbs = this.listeners.get(event) || [];
    cbs.forEach(cb => cb(data));
  }

  async transition(newState) {
    if (this.transitioning || newState === this.current) return;
    if (!STATES[newState]) return;

    this.transitioning = true;
    this.previous = this.current;

    this.emit('transition:start', {
      from: this.previous,
      to: newState,
    });

    this.current = newState;

    this.emit('state:change', {
      from: this.previous,
      to: newState,
    });

    // Transition lock released by the camera/scene system
  }

  completeTransition() {
    this.transitioning = false;
    this.emit('transition:complete', {
      state: this.current,
    });
  }

  get state() {
    return this.current;
  }
}

export { STATES };
export default new StateManager();
