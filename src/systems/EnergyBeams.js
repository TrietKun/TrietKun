import * as THREE from 'three';
import stateManager from '../core/StateManager.js';

/**
 * Dynamic energy beams connecting nearby holographic meshes.
 * Beams pulse, flicker, and react to state transitions.
 */
class EnergyBeams {
  constructor(scene, holoMeshes) {
    this.scene = scene;
    this.meshes = holoMeshes;
    this.beams = [];
    this.time = 0;
    this.glitchIntensity = 0;

    this._createBeams();

    stateManager.on('transition:start', () => {
      this.glitchIntensity = 1.0;
    });
  }

  _createBeams() {
    const maxDist = 12;

    for (let i = 0; i < this.meshes.length; i++) {
      for (let j = i + 1; j < this.meshes.length; j++) {
        const dist = this.meshes[i].position.distanceTo(this.meshes[j].position);
        if (dist < maxDist) {
          const beam = this._createBeam(i, j);
          this.beams.push({
            line: beam,
            meshA: this.meshes[i],
            meshB: this.meshes[j],
            baseOpacity: Math.max(0.02, 0.06 - dist * 0.004),
            phase: Math.random() * Math.PI * 2,
            speed: 0.5 + Math.random() * 1.5,
            flickerSpeed: 3 + Math.random() * 8,
          });
        }
      }
    }
  }

  _createBeam(idxA, idxB) {
    const geometry = new THREE.BufferGeometry();
    // We'll update positions each frame
    const positions = new Float32Array(2 * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const colorA = new THREE.Color(0x00D4FF);
    const colorB = new THREE.Color(0x7C3AED);
    const mix = (idxA + idxB) / (this.meshes.length * 2);

    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color().lerpColors(colorA, colorB, mix),
      transparent: true,
      opacity: 0.04,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    return line;
  }

  update(time) {
    this.time = time;

    // Decay glitch
    if (this.glitchIntensity > 0.001) {
      this.glitchIntensity *= 0.96;
    } else {
      this.glitchIntensity = 0;
    }

    this.beams.forEach((beam) => {
      const posA = beam.meshA.position;
      const posB = beam.meshB.position;

      // Update line positions to follow meshes
      const positions = beam.line.geometry.attributes.position.array;
      positions[0] = posA.x;
      positions[1] = posA.y;
      positions[2] = posA.z;
      positions[3] = posB.x;
      positions[4] = posB.y;
      positions[5] = posB.z;
      beam.line.geometry.attributes.position.needsUpdate = true;

      // Pulsing opacity
      const pulse = Math.sin(time * beam.speed + beam.phase) * 0.5 + 0.5;
      const flicker = Math.sin(time * beam.flickerSpeed) > 0.3 ? 1.0 : 0.2;

      // Glitch makes beams flash bright
      const glitchBoost = this.glitchIntensity * (Math.random() > 0.5 ? 2.0 : 0.0);

      beam.line.material.opacity = beam.baseOpacity * pulse * flicker + glitchBoost * 0.15;
    });
  }

  dispose() {
    this.beams.forEach((beam) => {
      beam.line.geometry.dispose();
      beam.line.material.dispose();
      this.scene.remove(beam.line);
    });
  }
}

export default EnergyBeams;
