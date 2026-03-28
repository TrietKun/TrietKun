import * as THREE from 'three';
import gsap from 'gsap';
import stateManager, { STATES } from '../core/StateManager.js';

/**
 * Cinematic lighting director — #00D4FF / #7C3AED palette
 *
 * Palette reference:
 *   Cyan     #00D4FF  rgb(0,212,255)
 *   Purple   #7C3AED  rgb(124,58,237)
 *   Deep bg  #05070A
 *   Sec bg   #0A0F1C
 */

const LIGHT_MOODS = {
  [STATES.INTRO]: {
    ambient: { color: 0x000000, intensity: 0.05 },
    key:     { color: 0x00D4FF, intensity: 0.35, pos: [4, 6, 8] },
    fill:    { color: 0x000000, intensity: 0.0,  pos: [-5, -2, 3] },
    rim:     { color: 0x7C3AED, intensity: 0.5,  pos: [0, 3, -6] },
    accentA: { color: 0x00D4FF, intensity: 0.8,  pos: [-4, 3, 4] },
    accentB: { color: 0x7C3AED, intensity: 0.5,  pos: [4, -2, 3] },
    spot:    { color: 0x00D4FF, intensity: 1.4,  pos: [0, 8, 6], target: [0, 0, 0] },
  },
  [STATES.MAIN_HUB]: {
    ambient: { color: 0x000000, intensity: 0.04 },
    key:     { color: 0x00D4FF, intensity: 0.4,  pos: [3, 5, 6] },
    fill:    { color: 0x000000, intensity: 0.0,  pos: [-4, -1, 4] },
    rim:     { color: 0x9B5FFF, intensity: 0.4,  pos: [-2, 4, -5] },
    accentA: { color: 0x00D4FF, intensity: 1.0,  pos: [-3, 2, 5] },
    accentB: { color: 0x7C3AED, intensity: 0.7,  pos: [5, -1, 2] },
    spot:    { color: 0x00D4FF, intensity: 1.6,  pos: [0, 6, 5], target: [0, 0, -2] },
  },
  [STATES.ABOUT]: {
    ambient: { color: 0x000000, intensity: 0.03 },
    key:     { color: 0x33DDFF, intensity: 0.3,  pos: [-3, 6, 7] },
    fill:    { color: 0x000000, intensity: 0.0,  pos: [4, -2, 3] },
    rim:     { color: 0x7C3AED, intensity: 0.35, pos: [3, 2, -6] },
    accentA: { color: 0x00D4FF, intensity: 0.7,  pos: [-6, 3, 3] },
    accentB: { color: 0x9B5FFF, intensity: 0.5,  pos: [2, -3, 4] },
    spot:    { color: 0x33DDFF, intensity: 1.1,  pos: [-4, 7, 5], target: [-3, 0, -2] },
  },
  [STATES.PROJECTS]: {
    ambient: { color: 0x000000, intensity: 0.03 },
    key:     { color: 0x00D4FF, intensity: 0.3,  pos: [5, 5, 6] },
    fill:    { color: 0x000000, intensity: 0.0,  pos: [-3, -2, 4] },
    rim:     { color: 0x7C3AED, intensity: 0.4,  pos: [-4, 3, -5] },
    accentA: { color: 0x00BFEE, intensity: 0.8,  pos: [6, 2, 3] },
    accentB: { color: 0x9B5FFF, intensity: 0.5,  pos: [-2, -1, 5] },
    spot:    { color: 0x00D4FF, intensity: 1.4,  pos: [4, 6, 4], target: [3, 0, -1] },
  },
  [STATES.SKILLS]: {
    ambient: { color: 0x000000, intensity: 0.03 },
    key:     { color: 0x7C3AED, intensity: 0.35, pos: [0, 8, 6] },
    fill:    { color: 0x000000, intensity: 0.0,  pos: [0, -3, 4] },
    rim:     { color: 0x00D4FF, intensity: 0.5,  pos: [0, -2, -6] },
    accentA: { color: 0x9B5FFF, intensity: 0.9,  pos: [-3, 5, 4] },
    accentB: { color: 0x00D4FF, intensity: 0.7,  pos: [3, 3, 3] },
    spot:    { color: 0x7C3AED, intensity: 1.2,  pos: [0, 10, 6], target: [0, 1, -2] },
  },
  [STATES.CONTACT]: {
    ambient: { color: 0x000000, intensity: 0.02 },
    key:     { color: 0x00D4FF, intensity: 0.2,  pos: [-2, 4, 7] },
    fill:    { color: 0x000000, intensity: 0.0,  pos: [3, -2, 3] },
    rim:     { color: 0x7C3AED, intensity: 0.3,  pos: [2, 1, -6] },
    accentA: { color: 0x00D4FF, intensity: 0.6,  pos: [-3, 0, 4] },
    accentB: { color: 0x6B2FCC, intensity: 0.4,  pos: [2, -2, 5] },
    spot:    { color: 0x00D4FF, intensity: 0.8,  pos: [-2, 5, 5], target: [-1, -1, -2] },
  },
};

class LightingDirector {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;

    this._createLights();
    this._applyMood(STATES.INTRO, true);

    stateManager.on('state:change', ({ to }) => this._applyMood(to));
  }

  _createLights() {
    this.ambient = new THREE.AmbientLight(0x000000, 0.05);
    this.scene.add(this.ambient);

    this.key = new THREE.DirectionalLight(0x00D4FF, 0.35);
    this.key.position.set(4, 6, 8);
    this.scene.add(this.key);

    this.fill = new THREE.DirectionalLight(0x000000, 0.0);
    this.fill.position.set(-5, -2, 3);
    this.scene.add(this.fill);

    this.rim = new THREE.PointLight(0x7C3AED, 0.5, 30);
    this.rim.position.set(0, 3, -6);
    this.scene.add(this.rim);

    this.accentA = new THREE.PointLight(0x00D4FF, 0.8, 25);
    this.accentA.position.set(-4, 3, 4);
    this.scene.add(this.accentA);

    this.accentB = new THREE.PointLight(0x7C3AED, 0.5, 25);
    this.accentB.position.set(4, -2, 3);
    this.scene.add(this.accentB);

    this.spotTarget = new THREE.Object3D();
    this.spotTarget.position.set(0, 0, 0);
    this.scene.add(this.spotTarget);

    this.spot = new THREE.SpotLight(0x00D4FF, 1.4, 30, Math.PI * 0.15, 0.6, 1.5);
    this.spot.position.set(0, 8, 6);
    this.spot.target = this.spotTarget;
    this.scene.add(this.spot);
  }

  _applyMood(state, instant = false) {
    const mood = LIGHT_MOODS[state];
    if (!mood) return;

    const dur = instant ? 0 : 2.0;
    const ease = 'expo.inOut';

    gsap.to(this.ambient.color, {
      r: new THREE.Color(mood.ambient.color).r,
      g: new THREE.Color(mood.ambient.color).g,
      b: new THREE.Color(mood.ambient.color).b,
      duration: dur, ease,
    });
    gsap.to(this.ambient, { intensity: mood.ambient.intensity, duration: dur, ease });

    this._tweenLight(this.key, mood.key, dur, ease);
    this._tweenLight(this.fill, mood.fill, dur, ease);
    this._tweenPointLight(this.rim, mood.rim, dur, ease);
    this._tweenPointLight(this.accentA, mood.accentA, dur, ease);
    this._tweenPointLight(this.accentB, mood.accentB, dur, ease);

    const spotColor = new THREE.Color(mood.spot.color);
    gsap.to(this.spot.color, { r: spotColor.r, g: spotColor.g, b: spotColor.b, duration: dur, ease });
    gsap.to(this.spot, { intensity: mood.spot.intensity, duration: dur, ease });
    gsap.to(this.spot.position, { x: mood.spot.pos[0], y: mood.spot.pos[1], z: mood.spot.pos[2], duration: dur, ease });
    gsap.to(this.spotTarget.position, { x: mood.spot.target[0], y: mood.spot.target[1], z: mood.spot.target[2], duration: dur, ease });
  }

  _tweenLight(light, config, dur, ease) {
    const c = new THREE.Color(config.color);
    gsap.to(light.color, { r: c.r, g: c.g, b: c.b, duration: dur, ease });
    gsap.to(light, { intensity: config.intensity, duration: dur, ease });
    gsap.to(light.position, { x: config.pos[0], y: config.pos[1], z: config.pos[2], duration: dur, ease });
  }

  _tweenPointLight(light, config, dur, ease) {
    const c = new THREE.Color(config.color);
    gsap.to(light.color, { r: c.r, g: c.g, b: c.b, duration: dur, ease });
    gsap.to(light, { intensity: config.intensity, duration: dur, ease });
    gsap.to(light.position, { x: config.pos[0], y: config.pos[1], z: config.pos[2], duration: dur, ease });
  }

  update(time) {
    this.time = time;

    const breathA = Math.sin(time * 0.7) * 0.3 + Math.sin(time * 1.3) * 0.15;
    const breathB = Math.cos(time * 0.5) * 0.25 + Math.sin(time * 1.1) * 0.1;

    this.accentA.intensity += breathA * 0.02;
    this.accentB.intensity += breathB * 0.02;

    this.accentA.position.x += Math.sin(time * 0.3) * 0.005;
    this.accentA.position.y += Math.cos(time * 0.2) * 0.004;
    this.accentB.position.x += Math.cos(time * 0.25) * 0.005;
    this.accentB.position.y += Math.sin(time * 0.35) * 0.004;

    this.rim.intensity += Math.sin(time * 0.4) * 0.01;
  }
}

export default LightingDirector;
