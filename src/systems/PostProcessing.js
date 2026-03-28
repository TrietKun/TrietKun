import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import postVert from '../shaders/postprocess.vert';
import postFrag from '../shaders/postprocess.frag';

/**
 * Lightweight post-processing — NO UnrealBloomPass.
 * Bloom is faked cheaply in the custom shader with 4-tap box blur on bright pixels.
 */
class PostProcessing {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    // Transition-animated values (tweened externally)
    this.bloomStrength = { value: 0.5 };
    this.chromaticAberration = { value: 0.003 };
    this.vignetteIntensity = { value: 2.2 };
    this.exposure = { value: 1.0 };
    this.rippleCenter = new THREE.Vector2(0.5, 0.5);
    this.rippleTime = { value: 0 };
    this.rippleIntensity = { value: 0 };

    this._setup();
  }

  _setup() {
    const size = this.renderer.getSize(new THREE.Vector2());

    this.composer = new EffectComposer(this.renderer);

    // Render pass
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Single custom pass — includes cheap bloom + all effects
    this.customPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uGlitchIntensity: { value: 0 },
        uChromaticAberration: { value: 0.003 },
        uVignetteIntensity: { value: 2.0 },
        uNoiseIntensity: { value: 0.035 },
        uResolution: { value: new THREE.Vector2(size.x, size.y) },
        uExposure: { value: 1.2 },
        uBloomStrength: { value: 0.5 },
        uRippleCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uRippleTime: { value: 0 },
        uRippleIntensity: { value: 0 },
      },
      vertexShader: postVert,
      fragmentShader: postFrag,
    });
    this.composer.addPass(this.customPass);
  }

  setGlitch(intensity) {
    this.customPass.uniforms.uGlitchIntensity.value = intensity;
  }

  triggerRipple(x, y, intensity = 1.0) {
    this.rippleCenter.set(x, y);
    this.rippleTime.value = 0;
    this.rippleIntensity.value = intensity;
  }

  update(time) {
    this.customPass.uniforms.uChromaticAberration.value = this.chromaticAberration.value;
    this.customPass.uniforms.uVignetteIntensity.value = this.vignetteIntensity.value;
    this.customPass.uniforms.uExposure.value = this.exposure.value;
    this.customPass.uniforms.uBloomStrength.value = this.bloomStrength.value;
    this.customPass.uniforms.uTime.value = time;
    this.customPass.uniforms.uRippleCenter.value.copy(this.rippleCenter);
    this.customPass.uniforms.uRippleTime.value = this.rippleTime.value;
    this.customPass.uniforms.uRippleIntensity.value = this.rippleIntensity.value;

    if (this.rippleIntensity.value > 0.001) {
      this.rippleTime.value += 0.016;
      this.rippleIntensity.value *= 0.97;
    }

    this.renderer.toneMappingExposure = this.exposure.value;

    this.composer.render();
  }

  onResize(width, height) {
    this.composer.setSize(width, height);
    this.customPass.uniforms.uResolution.value.set(width, height);
  }
}

export default PostProcessing;
