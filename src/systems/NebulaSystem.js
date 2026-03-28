import * as THREE from 'three';
import nebulaVert from '../shaders/nebula.vert';
import nebulaFrag from '../shaders/nebula.frag';

/**
 * Cosmic nebula/aurora clouds layered in the background.
 * Multiple planes at different depths with flowing FBM noise patterns.
 */
class NebulaSystem {
  constructor(scene) {
    this.scene = scene;
    this.planes = [];

    const configs = [
      { z: -18, scale: 35, opacity: 0.05, speed: 0.08, colors: [0x00D4FF, 0x7C3AED, 0x1a0a3e] },
      { z: -22, scale: 40, opacity: 0.04, speed: 0.06, colors: [0x7C3AED, 0x00D4FF, 0x0a1a3e] },
      { z: -25, scale: 50, opacity: 0.03, speed: 0.05, colors: [0x5B2FBF, 0x00A8CC, 0x0a0a2e] },
    ];

    configs.forEach((cfg, i) => {
      const geo = new THREE.PlaneGeometry(cfg.scale, cfg.scale * 0.7);
      const mat = new THREE.ShaderMaterial({
        vertexShader: nebulaVert,
        fragmentShader: nebulaFrag,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: cfg.opacity },
          uColor1: { value: new THREE.Color(cfg.colors[0]) },
          uColor2: { value: new THREE.Color(cfg.colors[1]) },
          uColor3: { value: new THREE.Color(cfg.colors[2]) },
          uMouse: { value: new THREE.Vector2(0, 0) },
          uSpeed: { value: cfg.speed },
        },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (i - 2) * 3,  // spread horizontally
        (i % 2 === 0 ? 1 : -1) * (i * 0.5),
        cfg.z
      );
      mesh.rotation.z = (i - 2) * 0.05;

      this.scene.add(mesh);
      this.planes.push({ mesh, uniforms: mat.uniforms });
    });
  }

  update(time, mouseX, mouseY) {
    this.planes.forEach((p) => {
      p.uniforms.uTime.value = time;
      p.uniforms.uMouse.value.set(mouseX || 0, mouseY || 0);
    });
  }

  dispose() {
    this.planes.forEach(({ mesh }) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.scene.remove(mesh);
    });
  }
}

export default NebulaSystem;
