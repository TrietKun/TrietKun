import * as THREE from 'three';
import terrainVert from '../shaders/terrain.vert';
import terrainFrag from '../shaders/terrain.frag';

/**
 * Animated wireframe terrain / wave landscape beneath the scene.
 * Rolling hills with flowing ocean-like motion.
 */
class TerrainWaves {
  constructor(scene) {
    this.scene = scene;

    const geo = new THREE.PlaneGeometry(60, 60, 50, 50);
    const mat = new THREE.ShaderMaterial({
      vertexShader: terrainVert,
      fragmentShader: terrainFrag,
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0, 0) },
      },
      transparent: true,
      wireframe: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = -5;
    this.scene.add(this.mesh);
  }

  update(time, mouseX, mouseY) {
    this.mesh.material.uniforms.uTime.value = time;
    this.mesh.material.uniforms.uMouse.value.set(mouseX || 0, mouseY || 0);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.scene.remove(this.mesh);
  }
}

export default TerrainWaves;
