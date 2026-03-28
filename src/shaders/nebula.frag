uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec2 uMouse;
uniform float uSpeed;

varying vec2 vUv;
varying vec3 vWorldPos;

// --- noise functions ---
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = rot * p * 2.0;
    a *= 0.5;
  }
  return v;
}

// Single-level domain warping (cheap but organic)
float warpedFbm(vec2 p, float time) {
  vec2 q = vec2(
    fbm(p + time * uSpeed * 0.4),
    fbm(p + vec2(5.2, 1.3) + time * uSpeed * 0.3)
  );
  return fbm(p + 3.0 * q);
}

void main() {
  vec2 uv = vUv;

  // Subtle mouse distortion
  vec2 mouseOffset = uMouse * 0.05;
  uv += mouseOffset;

  float time = uTime;

  // Multi-scale nebula pattern with domain warping
  float nebula1 = warpedFbm(uv * 2.5, time);
  float nebula2 = warpedFbm(uv * 1.8 + vec2(3.0, 7.0), time * 0.7);
  float nebula3 = fbm(uv * 4.0 + time * uSpeed * 0.15);

  // Combine layers
  float pattern = nebula1 * 0.5 + nebula2 * 0.35 + nebula3 * 0.15;

  // Shape into cloud-like formations
  pattern = smoothstep(0.3, 0.8, pattern);

  // Color mixing — three-way gradient based on pattern intensity and position
  float colorMix1 = sin(pattern * 3.14159 + uv.x * 2.0 + time * 0.1) * 0.5 + 0.5;
  float colorMix2 = cos(pattern * 2.0 + uv.y * 1.5 + time * 0.15) * 0.5 + 0.5;

  vec3 color = mix(uColor1, uColor2, colorMix1);
  color = mix(color, uColor3, colorMix2 * 0.4);

  // Brighten at cloud centers
  color += pattern * 0.15 * uColor1;

  // Edge fade — smooth falloff toward edges
  float edgeFade = smoothstep(0.0, 0.25, uv.x) * smoothstep(1.0, 0.75, uv.x);
  edgeFade *= smoothstep(0.0, 0.25, uv.y) * smoothstep(1.0, 0.75, uv.y);

  float alpha = pattern * edgeFade * uOpacity;

  gl_FragColor = vec4(color, alpha);
}
