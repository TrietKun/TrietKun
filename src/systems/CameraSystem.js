import * as THREE from 'three';
import gsap from 'gsap';
import mouse from '../core/Mouse.js';
import stateManager, { STATES } from '../core/StateManager.js';

/**
 * Cinematic camera system
 * - Deep idle breathing with multi-axis drift
 * - Strong mouse parallax
 * - Roll on transitions
 * - FOV punch (dolly-zoom feel)
 * - Per-state dramatic positions
 */

// Much wider spread, more dramatic angles per state
const CAMERA_CONFIGS = {
  [STATES.INTRO]: {
    position: new THREE.Vector3(0, 0.5, 14),
    lookAt: new THREE.Vector3(0, 0, 0),
    fov: 65,
    roll: 0,
  },
  [STATES.MAIN_HUB]: {
    position: new THREE.Vector3(0, 1.5, 9),
    lookAt: new THREE.Vector3(0, 0.5, -2),
    fov: 52,
    roll: 0,
  },
  [STATES.ABOUT]: {
    position: new THREE.Vector3(-5, 2.5, 9),
    lookAt: new THREE.Vector3(-3, 0.5, -3),
    fov: 48,
    roll: -0.02,
  },
  [STATES.PROJECTS]: {
    position: new THREE.Vector3(5, 1.0, 8),
    lookAt: new THREE.Vector3(3, 0, -2),
    fov: 50,
    roll: 0.02,
  },
  [STATES.SKILLS]: {
    position: new THREE.Vector3(0, 4, 11),
    lookAt: new THREE.Vector3(0, 1.5, -2),
    fov: 46,
    roll: 0.015,
  },
  [STATES.CONTACT]: {
    position: new THREE.Vector3(-2, -1.5, 8),
    lookAt: new THREE.Vector3(-1, -1, -3),
    fov: 50,
    roll: -0.015,
  },
};

class CameraSystem {
  constructor(camera) {
    this.camera = camera;
    this.currentLookAt = new THREE.Vector3(0, 0, 0);
    this.targetLookAt = new THREE.Vector3(0, 0, 0);
    this.breathOffset = new THREE.Vector3();
    this.parallaxOffset = new THREE.Vector3();
    this.currentRoll = 0;
    this.targetRoll = 0;
    this.time = 0;
    this.transitionTimeline = null;
    this.shakeIntensity = 0; // for impact shake

    // Set initial state
    const intro = CAMERA_CONFIGS[STATES.INTRO];
    this.camera.position.copy(intro.position);
    this.currentLookAt.copy(intro.lookAt);
    this.targetLookAt.copy(intro.lookAt);
    this.camera.fov = intro.fov;
    this.camera.updateProjectionMatrix();

    // Listen for state changes
    stateManager.on('state:change', (data) => this.onStateChange(data));
  }

  onStateChange({ from, to }) {
    const config = CAMERA_CONFIGS[to];
    if (!config) return;

    // Kill any existing transition
    if (this.transitionTimeline) {
      this.transitionTimeline.kill();
    }

    const duration = 2.4;

    this.transitionTimeline = gsap.timeline({
      onComplete: () => {
        stateManager.completeTransition();
      },
    });

    // --- FOV PUNCH: widen then snap to target ---
    // First punch out (wide), then ease into destination
    const punchFov = Math.max(config.fov + 12, this.camera.fov + 8);
    this.transitionTimeline.to(this.camera, {
      fov: punchFov,
      duration: duration * 0.35,
      ease: 'power3.in',
      onUpdate: () => this.camera.updateProjectionMatrix(),
    }, 0);
    this.transitionTimeline.to(this.camera, {
      fov: config.fov,
      duration: duration * 0.65,
      ease: 'expo.out',
      onUpdate: () => this.camera.updateProjectionMatrix(),
    }, duration * 0.35);

    // --- CAMERA POSITION: ease through a mid-point overshoot ---
    // Compute an overshoot position (push past target, then settle)
    const overshootDir = new THREE.Vector3()
      .subVectors(config.position, this.camera.position)
      .normalize();
    const overshoot = config.position.clone().add(overshootDir.multiplyScalar(1.2));

    this.transitionTimeline.to(this.camera.position, {
      x: overshoot.x,
      y: overshoot.y,
      z: overshoot.z,
      duration: duration * 0.55,
      ease: 'power3.inOut',
    }, 0);
    this.transitionTimeline.to(this.camera.position, {
      x: config.position.x,
      y: config.position.y,
      z: config.position.z,
      duration: duration * 0.45,
      ease: 'expo.out',
    }, duration * 0.55);

    // --- LOOK-AT: smooth but slightly delayed for cinematic lag ---
    this.transitionTimeline.to(this.targetLookAt, {
      x: config.lookAt.x,
      y: config.lookAt.y,
      z: config.lookAt.z,
      duration: duration * 0.9,
      ease: 'expo.inOut',
    }, duration * 0.1);

    // --- ROLL ---
    this.targetRoll = config.roll;

    // --- IMPACT SHAKE at mid-transition ---
    this.transitionTimeline.call(() => {
      this.shakeIntensity = 0.025;
    }, [], duration * 0.35);
  }

  update(deltaTime) {
    this.time += deltaTime;

    // --- IDLE BREATHING: multi-frequency, multi-axis ---
    this.breathOffset.x =
      Math.sin(this.time * 0.23) * 0.15 +
      Math.sin(this.time * 0.71) * 0.06;
    this.breathOffset.y =
      Math.cos(this.time * 0.17) * 0.12 +
      Math.sin(this.time * 0.53) * 0.05;
    this.breathOffset.z =
      Math.sin(this.time * 0.13) * 0.08 +
      Math.cos(this.time * 0.41) * 0.04;

    // --- PARALLAX: strong response to mouse ---
    this.parallaxOffset.x = mouse.normalizedX * 0.6;
    this.parallaxOffset.y = mouse.normalizedY * 0.4;
    this.parallaxOffset.z = (Math.abs(mouse.normalizedX) + Math.abs(mouse.normalizedY)) * -0.15;

    // Apply offsets when not mid-transition
    const config = CAMERA_CONFIGS[stateManager.state];
    if (config && !stateManager.transitioning) {
      const lerpSpeed = 0.035;
      this.camera.position.x += (config.position.x + this.breathOffset.x + this.parallaxOffset.x - this.camera.position.x) * lerpSpeed;
      this.camera.position.y += (config.position.y + this.breathOffset.y + this.parallaxOffset.y - this.camera.position.y) * lerpSpeed;
      this.camera.position.z += (config.position.z + this.breathOffset.z + this.parallaxOffset.z - this.camera.position.z) * lerpSpeed;
    }

    // --- IMPACT SHAKE decay ---
    if (this.shakeIntensity > 0.0005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= 0.9; // fast decay
    } else {
      this.shakeIntensity = 0;
    }

    // --- ROLL: smooth lerp ---
    // Add mouse-driven micro-roll
    const mouseRoll = mouse.normalizedX * -0.008;
    this.currentRoll += (this.targetRoll + mouseRoll - this.currentRoll) * 0.04;

    // --- LOOK-AT ---
    this.currentLookAt.lerp(this.targetLookAt, 0.06);
    this.camera.lookAt(this.currentLookAt);

    // Apply roll after lookAt (otherwise lookAt resets it)
    this.camera.rotateZ(this.currentRoll);
  }
}

export default CameraSystem;
