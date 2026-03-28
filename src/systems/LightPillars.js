import * as THREE from 'three';
import gsap from 'gsap';
import stateManager from '../core/StateManager.js';

/**
 * Vertical light beams / pillars positioned throughout the scene.
 * Atmospheric, subtle, with slow sway and pulse.
 */
class LightPillars {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.pillars = [];
    this.glitchIntensity = 0;

    const configs = [
      { x: -8, z: -8, height: 12, width: 0.4, color: 0x00D4FF, opacity: 0.025 },
      { x: 6, z: -10, height: 15, width: 0.6, color: 0x7C3AED, opacity: 0.02 },
      { x: -4, z: -14, height: 10, width: 0.3, color: 0x00D4FF, opacity: 0.018 },
      { x: 10, z: -6, height: 13, width: 0.5, color: 0x7C3AED, opacity: 0.022 },
      { x: 3, z: -16, height: 14, width: 0.45, color: 0x9B5FFF, opacity: 0.017 },
    ];

    configs.forEach((cfg, i) => {
      const geo = new THREE.PlaneGeometry(cfg.width, cfg.height);
      const mat = new THREE.ShaderMaterial({
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uColor;
          uniform float uOpacity;
          uniform float uGlitch;
          varying vec2 vUv;

          void main() {
            // Vertical gradient: brightest at center, fades at top and bottom
            float vertFade = 1.0 - abs(vUv.y - 0.5) * 2.0;
            vertFade = pow(vertFade, 1.5);

            // Horizontal gradient: brightest at center
            float horizFade = 1.0 - abs(vUv.x - 0.5) * 2.0;
            horizFade = pow(horizFade, 3.0);

            // Animated brightness pulse
            float pulse = sin(uTime * 0.8 + vUv.y * 3.0) * 0.3 + 0.7;

            // Scanlines moving upward
            float scanline = sin(vUv.y * 80.0 - uTime * 3.0) * 0.5 + 0.5;
            scanline = pow(scanline, 4.0) * 0.3;

            // Shimmer
            float shimmer = sin(vUv.y * 20.0 + uTime * 5.0) * sin(vUv.x * 10.0 + uTime * 3.0);
            shimmer = shimmer * 0.1 + 0.9;

            float alpha = vertFade * horizFade * pulse * shimmer * uOpacity;
            alpha += scanline * vertFade * horizFade * uOpacity * 0.3;

            // Glitch flash
            alpha += uGlitch * vertFade * 0.1;

            vec3 color = uColor;
            // Slight color shift along height
            color += vec3(0.1, 0.05, 0.0) * (1.0 - vUv.y) * 0.2;

            gl_FragColor = vec4(color, alpha);
          }
        `,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(cfg.color) },
          uOpacity: { value: cfg.opacity },
          uGlitch: { value: 0 },
        },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cfg.x, cfg.height * 0.3, cfg.z);
      this.scene.add(mesh);

      this.pillars.push({
        mesh,
        uniforms: mat.uniforms,
        phase: i * 0.8,
        swaySpeed: 0.15 + i * 0.03,
        swayAmp: 0.3 + Math.random() * 0.2,
        baseX: cfg.x,
      });
    });

    // React to state transitions
    stateManager.on('transition:start', () => {
      this.glitchIntensity = 1.0;
    });
  }

  update(time) {
    // Decay glitch
    if (this.glitchIntensity > 0.001) {
      this.glitchIntensity *= 0.95;
    } else {
      this.glitchIntensity = 0;
    }

    this.pillars.forEach((p) => {
      p.uniforms.uTime.value = time;
      p.uniforms.uGlitch.value = this.glitchIntensity;

      // Sway
      p.mesh.position.x = p.baseX + Math.sin(time * p.swaySpeed + p.phase) * p.swayAmp;

      // Billboard — face camera
      p.mesh.lookAt(this.camera.position);
    });
  }

  dispose() {
    this.pillars.forEach(({ mesh }) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.scene.remove(mesh);
    });
  }
}

export default LightPillars;
