import * as THREE from 'three';
import mouse from '../core/Mouse.js';

const TRAIL_LENGTH = 48;
const SPARKLE_COUNT = 7;

class MouseTrail3D {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    this.currentPos = new THREE.Vector3();
    this.initialized = false;

    this._initTrail();
    this._initSparkles();
  }

  _initTrail() {
    const positions = new Float32Array(TRAIL_LENGTH * 3);
    const colors = new Float32Array(TRAIL_LENGTH * 4);

    this.trailPositions = positions;
    this.trailColors = colors;
    this.trailHistory = [];

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));

    const material = new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec4 color;
        varying vec4 vColor;
        void main() {
          vColor = color;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPos;
          gl_PointSize = max(1.0, 3.0 * (1.0 / -mvPos.z));
        }
      `,
      fragmentShader: `
        varying vec4 vColor;
        void main() {
          float dist = length(gl_PointCoord - 0.5);
          float alpha = smoothstep(0.5, 0.0, dist) * vColor.a;
          gl_FragColor = vec4(vColor.rgb, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    // Line trail
    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.trailLine = new THREE.Line(geometry, lineMat);
    this.scene.add(this.trailLine);
  }

  _initSparkles() {
    this.sparkles = [];
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(SPARKLE_COUNT * 3);
    const sizes = new Float32Array(SPARKLE_COUNT);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      color: 0x00D4FF,
      size: 0.08,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.sparklePoints = new THREE.Points(geo, mat);
    this.scene.add(this.sparklePoints);

    for (let i = 0; i < SPARKLE_COUNT; i++) {
      this.sparkles.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        active: false,
      });
    }
  }

  _getWorldPosition() {
    // Cheap projection — no raycasting
    return new THREE.Vector3(
      mouse.normalizedX * 6,
      mouse.normalizedY * 4,
      2
    );
  }

  update(time) {
    const targetPos = this._getWorldPosition();

    if (!this.initialized) {
      this.currentPos.copy(targetPos);
      for (let i = 0; i < TRAIL_LENGTH; i++) {
        this.trailHistory.push(targetPos.clone());
      }
      this.initialized = true;
    }

    // Smooth follow
    this.currentPos.lerp(targetPos, 0.15);

    // Add current position to history
    this.trailHistory.unshift(this.currentPos.clone());
    if (this.trailHistory.length > TRAIL_LENGTH) {
      this.trailHistory.pop();
    }

    // Update trail geometry
    const headColor = new THREE.Color(0x00D4FF);
    const tailColor = new THREE.Color(0x7C3AED);

    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const point = this.trailHistory[Math.min(i, this.trailHistory.length - 1)];

      // Slight organic movement perpendicular to trail direction
      const wobble = Math.sin(time * 3 + i * 0.5) * 0.01 * (i / TRAIL_LENGTH);

      this.trailPositions[i * 3] = point.x + wobble;
      this.trailPositions[i * 3 + 1] = point.y + Math.cos(time * 2.5 + i * 0.3) * 0.008 * (i / TRAIL_LENGTH);
      this.trailPositions[i * 3 + 2] = point.z;

      // Color: cyan head to purple tail
      const t = i / TRAIL_LENGTH;
      const color = headColor.clone().lerp(tailColor, t);
      const alpha = (1.0 - t) * 0.4;

      this.trailColors[i * 4] = color.r;
      this.trailColors[i * 4 + 1] = color.g;
      this.trailColors[i * 4 + 2] = color.b;
      this.trailColors[i * 4 + 3] = alpha;
    }

    this.trailLine.geometry.attributes.position.needsUpdate = true;
    this.trailLine.geometry.attributes.color.needsUpdate = true;

    // Sparkles
    this._updateSparkles(time);
  }

  _updateSparkles(time) {
    const dt = 0.016;

    // Spawn new sparkles at trail head
    for (let i = 0; i < this.sparkles.length; i++) {
      const s = this.sparkles[i];
      if (!s.active && Math.random() < 0.15) {
        s.pos.copy(this.currentPos);
        s.vel.set(
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.8 + 0.2,
          (Math.random() - 0.5) * 0.3
        );
        s.life = 0;
        s.maxLife = 0.3 + Math.random() * 0.5;
        s.active = true;
      }

      if (s.active) {
        s.life += dt;
        s.pos.add(s.vel.clone().multiplyScalar(dt));
        s.vel.multiplyScalar(0.97); // drag

        if (s.life >= s.maxLife) {
          s.active = false;
        }
      }

      const positions = this.sparklePoints.geometry.attributes.position.array;
      positions[i * 3] = s.active ? s.pos.x : 9999;
      positions[i * 3 + 1] = s.active ? s.pos.y : 9999;
      positions[i * 3 + 2] = s.active ? s.pos.z : 9999;
    }

    this.sparklePoints.geometry.attributes.position.needsUpdate = true;
    this.sparklePoints.material.opacity = 0.4 + Math.sin(time * 5) * 0.2;
  }

  dispose() {
    this.trailLine.geometry.dispose();
    this.trailLine.material.dispose();
    this.scene.remove(this.trailLine);
    this.sparklePoints.geometry.dispose();
    this.sparklePoints.material.dispose();
    this.scene.remove(this.sparklePoints);
  }
}

export default MouseTrail3D;
