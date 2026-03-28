uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vWorldPos;

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
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;

  // Animated fog pattern
  float fog = fbm(uv * 3.0 + uTime * 0.05);
  fog += fbm(uv * 6.0 - uTime * 0.03) * 0.5;
  fog = smoothstep(0.3, 0.8, fog);

  // Edge fade
  float edgeFade = smoothstep(0.0, 0.3, uv.x) * smoothstep(1.0, 0.7, uv.x);
  edgeFade *= smoothstep(0.0, 0.3, uv.y) * smoothstep(1.0, 0.7, uv.y);

  float alpha = fog * edgeFade * uOpacity;

  gl_FragColor = vec4(uColor, alpha);
}
