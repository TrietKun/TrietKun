import * as THREE from 'three';

/**
 * Floating code/text fragments drifting through the 3D scene.
 * Like digital rain but with actual programming keywords.
 */

const CODE_FRAGMENTS = [
  'const', '=>', 'async', 'Flutter', 'Dart', '{ }', '< />', '0xFF',
  'null', 'void', 'class', 'import', 'return', 'setState', 'build()',
  'Widget', 'Stream', 'Future', 'pub.dev', 'git push', 'npm', 'deploy',
  'API', 'IoT', 'MQTT', 'await', 'final', 'List<>', 'Map<>', '@override',
  'Riverpod', 'Provider', 'ref.watch', 'context', 'State', 'HTTP',
  '200 OK', 'WebSocket', 'JSON', 'REST', 'Docker', 'CI/CD',
];

class FloatingCode {
  constructor(scene) {
    this.scene = scene;
    this.sprites = [];
    this.count = 20;

    this._createSprites();
  }

  _createTexture(text) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontSize = 24;
    canvas.width = 256;
    canvas.height = 48;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${fontSize}px 'JetBrains Mono', 'Courier New', monospace`;
    ctx.fillStyle = 'rgba(0, 212, 255, 0.7)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  _createSprites() {
    for (let i = 0; i < this.count; i++) {
      const text = CODE_FRAGMENTS[Math.floor(Math.random() * CODE_FRAGMENTS.length)];
      const texture = this._createTexture(text);

      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.06 + Math.random() * 0.08,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const sprite = new THREE.Sprite(material);

      // Random position across scene volume
      const x = (Math.random() - 0.5) * 30;
      const y = (Math.random() - 0.5) * 16;
      const z = -3 - Math.random() * 14;
      sprite.position.set(x, y, z);

      // Scale based on depth — closer = slightly larger
      const depthScale = 0.3 + (1.0 - Math.abs(z) / 17) * 0.3;
      sprite.scale.set(depthScale * 2, depthScale * 0.4, 1);

      this.scene.add(sprite);

      this.sprites.push({
        sprite,
        material,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.15,
          (Math.random() - 0.5) * 0.08 + 0.02, // slight upward drift
          (Math.random() - 0.5) * 0.05
        ),
        phase: Math.random() * Math.PI * 2,
        floatSpeed: 0.3 + Math.random() * 0.5,
        floatAmp: 0.1 + Math.random() * 0.2,
        rotSpeed: (Math.random() - 0.5) * 0.1,
        baseOpacity: 0.06 + Math.random() * 0.08,
        flickerSpeed: 2 + Math.random() * 5,
        startX: x,
        startY: y,
        startZ: z,
      });
    }
  }

  update(time) {
    this.sprites.forEach((s) => {
      // Drift
      s.sprite.position.x += s.velocity.x * 0.016;
      s.sprite.position.y += s.velocity.y * 0.016;
      s.sprite.position.z += s.velocity.z * 0.016;

      // Floating sine wave
      s.sprite.position.y += Math.sin(time * s.floatSpeed + s.phase) * s.floatAmp * 0.01;
      s.sprite.position.x += Math.cos(time * s.floatSpeed * 0.7 + s.phase) * s.floatAmp * 0.005;

      // Wrap around when drifting too far
      if (s.sprite.position.x > 16) s.sprite.position.x = -16;
      if (s.sprite.position.x < -16) s.sprite.position.x = 16;
      if (s.sprite.position.y > 9) s.sprite.position.y = -9;
      if (s.sprite.position.y < -9) s.sprite.position.y = 9;

      // Flicker effect
      const flicker = Math.sin(time * s.flickerSpeed + s.phase * 10) * 0.5 + 0.5;
      const randomFlicker = Math.random() > 0.99 ? 0.3 : 0; // occasional bright flash
      s.material.opacity = s.baseOpacity * (0.5 + flicker * 0.5) + randomFlicker;
    });
  }

  dispose() {
    this.sprites.forEach(({ sprite, material }) => {
      material.map.dispose();
      material.dispose();
      this.scene.remove(sprite);
    });
  }
}

export default FloatingCode;
