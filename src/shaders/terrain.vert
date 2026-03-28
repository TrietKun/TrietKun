uniform float uTime;
uniform vec2 uMouse;

varying vec2 vUv;
varying vec3 vWorldPos;
varying float vHeight;

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

void main() {
  vUv = uv;

  vec3 pos = position;

  // Large rolling waves
  float wave1 = sin(pos.x * 0.3 + uTime * 0.4) * cos(pos.y * 0.2 + uTime * 0.3) * 0.8;
  float wave2 = sin(pos.x * 0.15 - uTime * 0.25) * sin(pos.y * 0.25 + uTime * 0.2) * 0.5;

  // Smaller detail waves
  float detail1 = sin(pos.x * 0.8 + uTime * 1.2) * cos(pos.y * 0.6 - uTime * 0.8) * 0.15;
  float detail2 = sin(pos.x * 1.5 + uTime * 2.0) * cos(pos.y * 1.2 + uTime * 1.5) * 0.08;

  // Noise-based displacement
  float n = noise(pos.xy * 0.2 + uTime * 0.1) * 0.6;

  // Mouse interaction — waves get taller near mouse
  vec2 mouseWorld = uMouse * 15.0;
  float mouseDist = length(pos.xy - mouseWorld);
  float mouseInfluence = smoothstep(8.0, 0.0, mouseDist) * 0.4;

  float height = wave1 + wave2 + detail1 + detail2 + n + mouseInfluence;
  pos.z = height;

  vHeight = height;

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPos.xyz;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
