uniform float uTime;
uniform float uHover;
uniform float uGlitch;

varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewDir;
varying float vGlitchOffset;
varying float vDistortion;

// ---- noise ----
float hash(float n) { return fract(sin(n) * 43758.5453123); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise3(vec3 x) {
  vec3 p = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n = p.x + p.y * 57.0 + 113.0 * p.z;
  return mix(
    mix(mix(hash(n +   0.0), hash(n +   1.0), f.x),
        mix(hash(n +  57.0), hash(n +  58.0), f.x), f.y),
    mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
        mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y),
    f.z
  );
}

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);

  vec3 pos = position;

  // === HOVER DISTORTION: noise-based vertex warping ===
  float hoverNoise = noise3(pos * 3.0 + uTime * 1.5) * 2.0 - 1.0;
  float hoverPush = uHover * hoverNoise * 0.25;
  // Directional push along normal + tangential swirl
  pos += normal * hoverPush;
  pos.x += uHover * sin(pos.y * 8.0 + uTime * 4.0) * 0.08;
  pos.z += uHover * cos(pos.y * 6.0 + uTime * 3.5) * 0.06;
  vDistortion = abs(hoverNoise) * uHover;

  // === GLITCH: vertex tearing ===
  float glitchStrength = uGlitch;
  if (glitchStrength > 0.0) {
    // Horizontal slice displacement
    float sliceY = floor(pos.y * 12.0);
    float sliceRand = hash(sliceY + floor(uTime * 15.0));
    float sliceActive = step(1.0 - glitchStrength * 0.6, sliceRand);
    pos.x += sliceActive * (hash(sliceY * 7.0 + uTime * 30.0) - 0.5) * glitchStrength * 0.8;

    // Vertical chunk displacement
    float chunkZ = floor(pos.z * 6.0);
    float chunkRand = hash(chunkZ + floor(uTime * 10.0) + 100.0);
    float chunkActive = step(1.0 - glitchStrength * 0.3, chunkRand);
    pos.y += chunkActive * (hash(chunkZ * 3.0 + uTime * 20.0) - 0.5) * glitchStrength * 0.5;

    // Explosion scatter at high intensity
    if (glitchStrength > 0.7) {
      float scatter = (glitchStrength - 0.7) * 3.33;
      vec3 scatterDir = normalize(pos) + vec3(
        hash(pos.x * 100.0 + uTime) - 0.5,
        hash(pos.y * 100.0 + uTime) - 0.5,
        hash(pos.z * 100.0 + uTime) - 0.5
      );
      pos += scatterDir * scatter * 0.4;
    }

    vGlitchOffset = sliceActive + chunkActive;
  } else {
    vGlitchOffset = 0.0;
  }

  // === IDLE: subtle surface wave ===
  float wave = sin(pos.y * 10.0 + uTime * 2.0) * 0.012
             + sin(pos.x * 8.0 + uTime * 1.5) * 0.008;
  pos += normal * wave;

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPos.xyz;
  vPosition = pos;
  vViewDir = normalize(cameraPosition - worldPos.xyz);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
