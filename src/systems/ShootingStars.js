import * as THREE from 'three';

/**
 * Periodic shooting star / meteor streaks across the 3D scene.
 * Stars spawn at random edges, streak diagonally, and fade out.
 */
class ShootingStars {
  constructor(scene) {
    this.scene = scene;
    this.stars = [];
    this.maxStars = 3;
    this.nextSpawn = 1.0;
    this.time = 0;
  }

  _spawnStar() {
    if (this.stars.length >= this.maxStars) return;

    const trailLength = 25;
    const positions = new Float32Array(trailLength * 3);
    const colors = new Float32Array(trailLength * 4);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const line = new THREE.Line(geometry, material);
    this.scene.add(line);

    // Random start position at scene edges
    const side = Math.random();
    let startX, startY;
    if (side < 0.5) {
      // Top-right area
      startX = 5 + Math.random() * 15;
      startY = 5 + Math.random() * 8;
    } else {
      // Top-left area
      startX = -5 - Math.random() * 15;
      startY = 3 + Math.random() * 10;
    }
    const startZ = -3 - Math.random() * 12;

    // Direction: mostly diagonal downward
    const angle = (Math.random() * 0.6 + 0.3) * Math.PI; // 50-160 degrees
    const speed = 15 + Math.random() * 20;
    const dirX = Math.cos(angle) * (side < 0.5 ? -1 : 1);
    const dirY = -Math.abs(Math.sin(angle));
    const dirZ = (Math.random() - 0.5) * 2;

    const star = {
      line,
      positions,
      colors,
      trailLength,
      headPos: new THREE.Vector3(startX, startY, startZ),
      velocity: new THREE.Vector3(dirX * speed, dirY * speed, dirZ),
      life: 0,
      maxLife: 0.5 + Math.random() * 1.0,
      trailPoints: [],
      brightness: 0.8 + Math.random() * 0.2,
    };

    // Initialize trail points
    for (let i = 0; i < trailLength; i++) {
      star.trailPoints.push(star.headPos.clone());
    }

    this.stars.push(star);

    // Flash is achieved via the bright head of the trail — no extra mesh needed
  }

  update(time) {
    const dt = Math.min(time - this.time, 0.05);
    this.time = time;

    // Spawn logic
    this.nextSpawn -= dt;
    if (this.nextSpawn <= 0) {
      this._spawnStar();
      this.nextSpawn = 2 + Math.random() * 4;
    }

    // Update existing stars
    for (let s = this.stars.length - 1; s >= 0; s--) {
      const star = this.stars[s];
      star.life += dt;

      // Move head
      star.headPos.add(star.velocity.clone().multiplyScalar(dt));

      // Shift trail points
      star.trailPoints.unshift(star.headPos.clone());
      if (star.trailPoints.length > star.trailLength) {
        star.trailPoints.pop();
      }

      // Update geometry
      const lifeRatio = star.life / star.maxLife;
      const fadeOut = 1.0 - Math.pow(lifeRatio, 2);

      for (let i = 0; i < star.trailLength; i++) {
        const point = star.trailPoints[Math.min(i, star.trailPoints.length - 1)];
        star.positions[i * 3] = point.x;
        star.positions[i * 3 + 1] = point.y;
        star.positions[i * 3 + 2] = point.z;

        // Color: white/cyan head fading to purple tail
        const t = i / star.trailLength;
        const alpha = (1.0 - t) * fadeOut * star.brightness;
        // Head: bright white-cyan, tail: purple
        star.colors[i * 4] = 0.88 - t * 0.4;     // R
        star.colors[i * 4 + 1] = 0.96 - t * 0.7; // G
        star.colors[i * 4 + 2] = 1.0;              // B
        star.colors[i * 4 + 3] = alpha;
      }

      star.line.geometry.attributes.position.needsUpdate = true;
      star.line.geometry.attributes.color.needsUpdate = true;

      // Remove dead stars
      if (star.life >= star.maxLife) {
        this.scene.remove(star.line);
        star.line.geometry.dispose();
        star.line.material.dispose();
        this.stars.splice(s, 1);
      }
    }
  }

  dispose() {
    this.stars.forEach((star) => {
      this.scene.remove(star.line);
      star.line.geometry.dispose();
      star.line.material.dispose();
    });
  }
}

export default ShootingStars;
