import * as THREE from 'three';
import gsap from 'gsap';
import fogVert from '../shaders/fog.vert';
import fogFrag from '../shaders/fog.frag';
import hologramVert from '../shaders/hologram.vert';
import hologramFrag from '../shaders/hologram.frag';
import mouse from '../core/Mouse.js';
import stateManager from '../core/StateManager.js';

/**
 * Futuristic environment with:
 * - Volumetric fog planes
 * - Floating holographic geometry (upgraded shader)
 * - Raycasting hover → drives uHover distortion
 * - Per-object glitch on state transitions → drives uGlitch
 * - Grid plane + energy rings
 */
class SceneEnvironment {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.objects = [];
    this.holoMeshes = [];  // meshes with hologram material (for raycasting)
    this.time = 0;

    // Raycasting
    this.raycaster = new THREE.Raycaster();
    this.mouseVec = new THREE.Vector2();
    this.hoveredMesh = null;

    this._createFog();
    this._createFloatingGeometry();
    this._createGridPlane();
    this._createEnergyRings();
    this._createOrbitalParticles();

    // Glitch all hologram objects on state transition
    stateManager.on('transition:start', () => this._triggerGlitch());
  }

  // ============================
  // FOG
  // ============================
  _createFog() {
    const fogMaterial = new THREE.ShaderMaterial({
      vertexShader: fogVert,
      fragmentShader: fogFrag,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x000000) },
        uOpacity: { value: 0.15 },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const fogGeo = new THREE.PlaneGeometry(40, 40);

    for (let i = 0; i < 3; i++) {
      const fog = new THREE.Mesh(fogGeo, fogMaterial.clone());
      fog.position.z = -8 - i * 4;
      fog.position.y = -2 + i * 0.5;
      fog.rotation.x = -0.2;
      fog.material.uniforms.uOpacity.value = 0.06 - i * 0.015;
      this.scene.add(fog);
      this.objects.push({ mesh: fog, type: 'fog' });
    }
  }

  // ============================
  // FLOATING HOLOGRAPHIC GEOMETRY
  // ============================
  _createFloatingGeometry() {
    const shapes = [
      { geo: new THREE.IcosahedronGeometry(0.8, 1), pos: [-6, 3, -5], rot: [0.5, 0.3, 0], scale: 1 },
      { geo: new THREE.OctahedronGeometry(0.5, 0), pos: [7, -2, -4], rot: [0, 0.8, 0.2], scale: 1.2 },
      { geo: new THREE.TetrahedronGeometry(0.6, 0), pos: [-4, -3, -6], rot: [0.3, 0, 0.5], scale: 0.9 },
      { geo: new THREE.TorusGeometry(0.6, 0.15, 16, 32), pos: [5, 2, -7], rot: [0.7, 0.2, 0], scale: 1.1 },
      { geo: new THREE.IcosahedronGeometry(0.4, 0), pos: [3, 4, -3], rot: [0.1, 0.5, 0.3], scale: 0.8 },
      { geo: new THREE.OctahedronGeometry(0.3, 0), pos: [-8, 1, -8], rot: [0.4, 0.2, 0.6], scale: 1.0 },
      { geo: new THREE.BoxGeometry(0.5, 0.5, 0.5), pos: [8, -1, -6], rot: [0.2, 0.4, 0.1], scale: 0.7 },
      { geo: new THREE.TorusKnotGeometry(0.35, 0.1, 64, 8, 2, 3), pos: [-2, 4.5, -4], rot: [0.6, 0.1, 0.4], scale: 0.9 },
      { geo: new THREE.DodecahedronGeometry(0.45, 0), pos: [6, 3, -8], rot: [0.2, 0.7, 0.1], scale: 1.0 },
      // Additional artistic shapes
      { geo: new THREE.TorusGeometry(0.5, 0.08, 8, 24), pos: [-7, -1, -3], rot: [1.2, 0.3, 0.5], scale: 1.1 },
      { geo: new THREE.OctahedronGeometry(0.6, 0), pos: [-3, 5, -7], rot: [0.5, 0.1, 0.7], scale: 0.7 },
      { geo: new THREE.TorusKnotGeometry(0.25, 0.08, 32, 6, 2, 3), pos: [7, 4, -5], rot: [0.1, 0.6, 0.3], scale: 1.2 },
    ];

    shapes.forEach((shape, i) => {
      const colorMix = i / shapes.length;
      const primaryColor = new THREE.Color().lerpColors(
        new THREE.Color(0x00D4FF),
        new THREE.Color(0x7C3AED),
        colorMix
      );
      const secondaryColor = new THREE.Color().lerpColors(
        new THREE.Color(0x7C3AED),
        new THREE.Color(0x00D4FF),
        colorMix
      );

      const mat = new THREE.ShaderMaterial({
        vertexShader: hologramVert,
        fragmentShader: hologramFrag,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: primaryColor },
          uColor2: { value: secondaryColor },
          uAlpha: { value: 0.07 + Math.random() * 0.05 },
          uHover: { value: 0 },
          uGlitch: { value: 0 },
        },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        wireframe: true,
      });

      const mesh = new THREE.Mesh(shape.geo, mat);
      mesh.position.set(...shape.pos);
      mesh.rotation.set(...shape.rot);
      mesh.scale.setScalar(shape.scale);

      this.scene.add(mesh);
      this.holoMeshes.push(mesh);
      this.objects.push({
        mesh,
        type: 'float',
        speed: 0.15 + Math.random() * 0.25,
        amplitude: 0.3 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        rotSpeed: {
          x: (Math.random() - 0.5) * 0.3,
          y: (Math.random() - 0.5) * 0.3,
          z: (Math.random() - 0.5) * 0.2,
        },
        originalY: shape.pos[1],
      });
    });
  }

  // ============================
  // GRID
  // ============================
  _createGridPlane() {
    const gridMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vWorldPos;

        void main() {
          vec2 grid = abs(fract(vWorldPos.xz * 0.5) - 0.5);
          float line = min(grid.x, grid.y);
          float gridAlpha = 1.0 - smoothstep(0.0, 0.03, line);
          gridAlpha *= 0.04;

          float dist = length(vWorldPos.xz);
          float fade = smoothstep(15.0, 5.0, dist);
          gridAlpha *= fade;

          float pulse = sin(dist * 0.5 - uTime * 0.5) * 0.5 + 0.5;
          gridAlpha *= (0.5 + pulse * 0.5);

          vec3 color = mix(vec3(0.0, 0.83, 1.0), vec3(0.49, 0.23, 0.93), pulse);
          gl_FragColor = vec4(color, gridAlpha);
        }
      `,
      uniforms: {
        uTime: { value: 0 },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const gridGeo = new THREE.PlaneGeometry(30, 30);
    const grid = new THREE.Mesh(gridGeo, gridMat);
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = -4;
    this.scene.add(grid);
    this.objects.push({ mesh: grid, type: 'grid' });
  }

  // ============================
  // ENERGY RINGS
  // ============================
  _createEnergyRings() {
    for (let i = 0; i < 4; i++) {
      const ringGeo = new THREE.TorusGeometry(1.5 + i * 1.2, 0.008 + (i % 2) * 0.005, 8, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().lerpColors(
          new THREE.Color(0x00D4FF),
          new THREE.Color(0x7C3AED),
          i / 4
        ),
        transparent: true,
        opacity: 0.03 - i * 0.003,
        depthWrite: false,
      });

      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.z = -4 - i * 1.5;
      ring.position.y = (i % 2 === 0 ? 1 : -1) * (i * 0.3);
      ring.position.x = Math.sin(i * 1.5) * 2;
      ring.rotation.x = Math.PI * 0.1 * i + Math.random() * 0.5;
      ring.rotation.y = Math.random() * Math.PI;
      this.scene.add(ring);
      this.objects.push({
        mesh: ring,
        type: 'ring',
        speed: 0.08 + i * 0.04,
        phase: i * 0.8,
      });
    }
  }

  // ============================
  // ORBITAL PARTICLES (tiny particles orbiting each hologram mesh)
  // ============================
  _createOrbitalParticles() {
    this.orbitalGroups = [];
    const orbitsPerMesh = 6;

    this.holoMeshes.forEach((mesh, meshIdx) => {
      const count = orbitsPerMesh;
      const positions = new Float32Array(count * 3);
      const phases = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        phases[i] = Math.random() * Math.PI * 2;
        // Initial positions don't matter, we update them each frame
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const colorMix = meshIdx / this.holoMeshes.length;
      const color = new THREE.Color().lerpColors(
        new THREE.Color(0x00D4FF),
        new THREE.Color(0x7C3AED),
        colorMix
      );

      const mat = new THREE.PointsMaterial({
        color,
        size: 0.03,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const points = new THREE.Points(geo, mat);
      this.scene.add(points);

      this.orbitalGroups.push({
        points,
        mesh,
        phases,
        count,
        orbitRadius: 0.8 + Math.random() * 0.6,
        orbitSpeed: 0.4 + Math.random() * 0.8,
        tiltX: Math.random() * Math.PI,
        tiltZ: Math.random() * Math.PI,
      });
    });
  }

  // ============================
  // GLITCH TRIGGER (state transitions)
  // ============================
  _triggerGlitch() {
    this.holoMeshes.forEach((mesh, i) => {
      const uniforms = mesh.material.uniforms;
      const delay = i * 0.04; // staggered

      // Ramp up
      gsap.to(uniforms.uGlitch, {
        value: 0.6 + Math.random() * 0.5,
        duration: 0.12,
        ease: 'power4.in',
        delay,
      });
      // Hold briefly, then ramp down
      gsap.to(uniforms.uGlitch, {
        value: 0,
        duration: 0.6 + Math.random() * 0.3,
        ease: 'expo.out',
        delay: delay + 0.2,
      });
    });
  }

  // ============================
  // HOVER RAYCAST
  // ============================
  _updateHover() {
    if (!this.camera) return;

    this.mouseVec.set(mouse.normalizedX, mouse.normalizedY);
    this.raycaster.setFromCamera(this.mouseVec, this.camera);

    const intersects = this.raycaster.intersectObjects(this.holoMeshes);

    // Un-hover previous
    if (this.hoveredMesh && (!intersects.length || intersects[0].object !== this.hoveredMesh)) {
      gsap.to(this.hoveredMesh.material.uniforms.uHover, {
        value: 0,
        duration: 0.6,
        ease: 'expo.out',
      });
      this.hoveredMesh = null;
    }

    // Hover new
    if (intersects.length) {
      const hit = intersects[0].object;
      if (hit !== this.hoveredMesh) {
        this.hoveredMesh = hit;
        gsap.to(hit.material.uniforms.uHover, {
          value: 1,
          duration: 0.4,
          ease: 'expo.out',
        });
      }
    }
  }

  // ============================
  // UPDATE
  // ============================
  update(time) {
    this.time = time;

    // Hover raycast
    this._updateHover();

    this.objects.forEach((obj) => {
      // Update shader time
      if (obj.mesh.material.uniforms?.uTime) {
        obj.mesh.material.uniforms.uTime.value = time;
      }

      if (obj.type === 'float') {
        obj.mesh.position.y = obj.originalY + Math.sin(time * obj.speed + obj.phase) * obj.amplitude;
        obj.mesh.rotation.x += obj.rotSpeed.x * 0.01;
        obj.mesh.rotation.y += obj.rotSpeed.y * 0.01;
        obj.mesh.rotation.z += obj.rotSpeed.z * 0.01;
      }

      if (obj.type === 'ring') {
        obj.mesh.rotation.z = time * obj.speed + obj.phase;
        obj.mesh.rotation.y = Math.sin(time * 0.1 + obj.phase) * 0.2;
      }
    });

    // Update orbital particles
    if (this.orbitalGroups) {
      this.orbitalGroups.forEach((group) => {
        const positions = group.points.geometry.attributes.position.array;
        const center = group.mesh.position;

        for (let i = 0; i < group.count; i++) {
          const angle = time * group.orbitSpeed + group.phases[i];
          const r = group.orbitRadius + Math.sin(time * 1.5 + group.phases[i] * 3) * 0.15;

          // 3D orbit with tilt
          let x = Math.cos(angle) * r;
          let y = Math.sin(angle) * r * Math.cos(group.tiltX);
          let z = Math.sin(angle) * r * Math.sin(group.tiltZ);

          positions[i * 3] = center.x + x;
          positions[i * 3 + 1] = center.y + y;
          positions[i * 3 + 2] = center.z + z;
        }

        group.points.geometry.attributes.position.needsUpdate = true;

        // Pulse opacity
        group.points.material.opacity = 0.2 + Math.sin(time * 2 + group.tiltX) * 0.15;
      });
    }
  }
}

export default SceneEnvironment;
