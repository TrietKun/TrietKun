import * as THREE from 'three';
import particleVert from '../shaders/particle.vert';
import particleFrag from '../shaders/particle.frag';
import mouse from '../core/Mouse.js';

class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.count = 1500;
    this.transitionValue = { value: 0 };

    this._createParticles();
  }

  _createParticles() {
    const positions = new Float32Array(this.count * 3);
    const scales = new Float32Array(this.count);
    const phases = new Float32Array(this.count);
    const velocities = new Float32Array(this.count * 3);

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;

      // Distribute in a large sphere with clustering
      const radius = Math.random() * 18 + 5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi);

      // Random scale for depth variation
      scales[i] = Math.random() * 0.8 + 0.2;

      // Phase offset for animation variation
      phases[i] = Math.random();

      // Velocity
      velocities[i3] = (Math.random() - 0.5) * 0.01;
      velocities[i3 + 1] = (Math.random() - 0.5) * 0.01;
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.01;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));

    this.material = new THREE.ShaderMaterial({
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uSize: { value: 2.0 },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uTransition: { value: 0 },
        uGlitch: { value: 0 },
        uWarp: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.scene.add(this.points);
  }

  setTransition(value) {
    this.transitionValue.value = value;
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uMouse.value.set(mouse.normalizedX, mouse.normalizedY);
    this.material.uniforms.uTransition.value = this.transitionValue.value;

    // Gentle overall rotation
    this.points.rotation.y = time * 0.02;
    this.points.rotation.x = Math.sin(time * 0.1) * 0.05;
  }

  onResize() {
    this.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
  }
}

export default ParticleSystem;
