uniform float uTime;

varying vec2 vUv;
varying vec3 vWorldPos;
varying float vHeight;

void main() {
  // Height-based color mixing: cyan (low) to purple (high)
  vec3 colCyan = vec3(0.0, 0.83, 1.0);
  vec3 colPurple = vec3(0.49, 0.23, 0.93);
  vec3 colWhite = vec3(0.9, 0.95, 1.0);

  float heightNorm = smoothstep(-0.5, 1.5, vHeight);
  vec3 color = mix(colCyan, colPurple, heightNorm);

  // Brighten wave peaks
  float peakGlow = smoothstep(0.5, 1.2, vHeight) * 0.3;
  color += peakGlow * colWhite;

  // Subtle pulse on peaks
  float pulse = sin(vHeight * 5.0 + uTime * 2.0) * 0.5 + 0.5;
  color += pulse * peakGlow * 0.2 * colCyan;

  // Distance fade from center
  float dist = length(vWorldPos.xy);
  float distFade = smoothstep(25.0, 8.0, dist);

  // Edge fade based on UV
  float edgeFade = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
  edgeFade *= smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y);

  float alpha = 0.045 * distFade * edgeFade;

  // Bright wireframe lines at wave crests
  alpha += peakGlow * 0.02;

  gl_FragColor = vec4(color, alpha);
}
