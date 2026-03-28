varying float vAlpha;
varying float vPhase;
varying vec3 vColor;
varying float vGlitch;
varying float vWarp;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float dist = length(uv);

  // Multi-layer soft glow — dreamy particle look
  float alpha = smoothstep(0.5, 0.1, dist);

  // Inner glow — soft bright core
  float glow = exp(-dist * 5.0) * 0.3;
  alpha += glow;

  // Outer halo — very soft extended glow
  float halo = exp(-dist * 2.5) * 0.08;
  alpha += halo;

  alpha *= vAlpha;

  // Glitch: make some particles render as squares/streaks
  if (vGlitch > 0.5) {
    vec2 absUv = abs(uv);
    float box = step(max(absUv.x, absUv.y), 0.4);
    alpha = box * vAlpha * 1.2;
  }

  // Anamorphic streak on glitch
  if (vGlitch > 0.3 && vGlitch <= 0.5) {
    float streak = exp(-abs(uv.y) * 6.0) * exp(-abs(uv.x) * 2.0) * 0.4;
    alpha += streak * vAlpha;
  }

  // Warp: elongate particles into speed lines
  if (vWarp > 0.1) {
    float warpStreak = exp(-abs(uv.x) * 3.0) * exp(-abs(uv.y) * (1.0 + vWarp * 8.0)) * vWarp;
    alpha = max(alpha, warpStreak * vAlpha * 2.0);
  }

  // Final clamp — prevent any particle from being fully opaque
  alpha = min(alpha, 0.6);

  gl_FragColor = vec4(vColor, alpha);
}
