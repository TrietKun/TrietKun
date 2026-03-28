uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;
uniform vec2 uMouse;
uniform float uTransition;
uniform float uGlitch;
uniform float uWarp;

attribute float aScale;
attribute float aPhase;
attribute vec3 aVelocity;

varying float vAlpha;
varying float vPhase;
varying vec3 vColor;
varying float vGlitch;
varying float vWarp;

float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

float noise(vec3 x) {
  vec3 p = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n = p.x + p.y * 57.0 + 113.0 * p.z;
  return mix(
    mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
        mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y),
    mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
        mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y),
    f.z
  );
}

void main() {
  vec3 pos = position;

  // Organic floating motion
  float t = uTime * 0.3 + aPhase * 6.283;
  pos.x += sin(t * 0.7 + pos.y * 0.5) * 0.3;
  pos.y += cos(t * 0.5 + pos.z * 0.3) * 0.4 + sin(t * 0.2) * 0.2;
  pos.z += sin(t * 0.6 + pos.x * 0.4) * 0.3;

  // Noise displacement
  float n = noise(pos * 0.3 + uTime * 0.1);
  pos += normalize(pos) * n * 0.5;

  // Mouse interaction
  vec3 mousePos = vec3(uMouse * 5.0, 0.0);
  float dist = distance(pos.xy, mousePos.xy);
  float mouseInfluence = smoothstep(3.0, 0.0, dist) * 0.8;
  pos.xy += normalize(pos.xy - mousePos.xy) * mouseInfluence;

  // === GLITCH: particle scatter + freeze + jitter ===
  float glitch = uGlitch;
  if (glitch > 0.0) {
    // Jitter all particles
    float jitterX = (hash(aPhase * 100.0 + floor(uTime * 30.0)) - 0.5) * glitch * 1.5;
    float jitterY = (hash(aPhase * 200.0 + floor(uTime * 25.0)) - 0.5) * glitch * 1.5;
    float jitterZ = (hash(aPhase * 300.0 + floor(uTime * 35.0)) - 0.5) * glitch * 0.8;
    pos += vec3(jitterX, jitterY, jitterZ);

    // Some particles streak horizontally (like a broken screen)
    float streakChance = step(1.0 - glitch * 0.3, hash(aPhase * 50.0 + floor(uTime * 10.0)));
    pos.x += streakChance * (hash(aPhase * 77.0 + uTime * 20.0) - 0.5) * 4.0 * glitch;

    // Bright flash on glitched particles
    vGlitch = streakChance * glitch + glitch * 0.3;
  } else {
    vGlitch = 0.0;
  }

  // === WARP: particles streak toward/away from camera during transitions ===
  if (uWarp > 0.0) {
    // Streak particles along Z toward camera
    float warpDir = sign(pos.z);
    pos.z += warpDir * uWarp * 8.0 * (0.5 + aPhase * 0.5);
    // Compress X/Y for speed lines feel
    pos.x *= 1.0 - uWarp * 0.3;
    pos.y *= 1.0 - uWarp * 0.3;
  }

  // Transition effect
  pos *= mix(0.01, 1.0, uTransition);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

  // Size attenuation — capped to prevent massive blobs near camera
  float sizeAtten = (120.0 / -mvPosition.z);
  float glitchSize = 1.0 + vGlitch * 1.5;
  gl_PointSize = uSize * aScale * uPixelRatio * sizeAtten * glitchSize;
  gl_PointSize = clamp(gl_PointSize, 0.5, 8.0);

  gl_Position = projectionMatrix * mvPosition;

  // Depth-based alpha — much lower to prevent additive blowout
  float depth = smoothstep(-25.0, -4.0, mvPosition.z);
  float flicker = 0.3 + 0.4 * (sin(t * 2.0 + aPhase * 10.0) * 0.5 + 0.5);
  vAlpha = depth * aScale * flicker * 0.35;
  vPhase = aPhase;

  // Color variation — aurora palette with time-based cycling
  vec3 colCyan   = vec3(0.0, 0.83, 1.0);    // #00D4FF primary
  vec3 colPurple = vec3(0.49, 0.23, 0.93);  // #7C3AED accent
  vec3 colWhite  = vec3(0.9, 0.95, 1.0);    // cool white highlight
  vec3 colPink   = vec3(1.0, 0.3, 0.6);     // aurora pink
  vec3 colGreen  = vec3(0.0, 1.0, 0.55);    // aurora green
  vec3 colBlue   = vec3(0.15, 0.4, 1.0);    // deep blue

  // Time-based aurora cycling — each particle has a unique phase
  float auroraT = sin(uTime * 0.15 + aPhase * 6.283 + pos.y * 0.3) * 0.5 + 0.5;
  float auroraT2 = sin(uTime * 0.22 + aPhase * 4.0 + pos.x * 0.2) * 0.5 + 0.5;

  vec3 baseCol = mix(colCyan, colPurple, aPhase);
  // Layer aurora colors based on position and time
  baseCol = mix(baseCol, colPink, step(0.75, auroraT) * 0.4 * step(0.5, aPhase));
  baseCol = mix(baseCol, colGreen, step(0.8, auroraT2) * 0.3 * step(0.7, aPhase));
  baseCol = mix(baseCol, colBlue, sin(uTime * 0.3 + aPhase * 5.0) * 0.15 + 0.15);
  // Sprinkle white on a few particles
  baseCol = mix(baseCol, colWhite, step(0.92, aPhase) * 0.5);
  vColor = mix(baseCol, colWhite, vGlitch * 0.5);
  vWarp = uWarp;
}
