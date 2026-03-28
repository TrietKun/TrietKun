uniform float uTime;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uHover;
uniform float uGlitch;
uniform vec3 uColor2; // secondary color for iridescence

varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewDir;
varying float vGlitchOffset;
varying float vDistortion;

float hash(float n) { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {

  // =============================================
  // 1. TRI-PLANAR SCANLINES (horizontal + vertical + depth)
  // =============================================
  float scanH = sin(vPosition.y * 120.0 + uTime * 5.0) * 0.5 + 0.5;
  scanH = pow(scanH, 2.0) * 0.12;

  float scanV = sin(vPosition.x * 80.0 - uTime * 3.0) * 0.5 + 0.5;
  scanV = pow(scanV, 3.0) * 0.06;

  float scanD = sin(vPosition.z * 60.0 + uTime * 2.0) * 0.5 + 0.5;
  scanD = pow(scanD, 3.0) * 0.04;

  float scanlines = scanH + scanV + scanD;

  // =============================================
  // 2. FRESNEL (edge glow)
  // =============================================
  float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), 3.0);

  // =============================================
  // 3. HOLOGRAPHIC IRIDESCENCE (rainbow shift based on angle + position)
  // =============================================
  float iriAngle = dot(vNormal, vViewDir);
  float iriShift = iriAngle * 3.0 + vPosition.y * 2.0 + uTime * 0.5;
  vec3 iriColor = vec3(
    sin(iriShift) * 0.5 + 0.5,
    sin(iriShift + 2.094) * 0.5 + 0.5,   // +2π/3
    sin(iriShift + 4.189) * 0.5 + 0.5    // +4π/3
  );
  // Blend iridescence with base colors
  vec3 baseColor = mix(uColor, uColor2, sin(iriShift * 0.5) * 0.5 + 0.5);
  vec3 holoColor = mix(baseColor, iriColor, 0.15 + fresnel * 0.2);

  // =============================================
  // 4. DATA STREAM FLICKER (random horizontal bands that brighten)
  // =============================================
  float bandY = floor(vPosition.y * 30.0 + uTime * 8.0);
  float bandFlicker = step(0.92, hash(bandY + floor(uTime * 12.0)));
  float dataStream = bandFlicker * 0.4;

  // Thin bright data lines
  float dataLine = step(0.995, sin(vPosition.y * 200.0 + uTime * 20.0));
  dataStream += dataLine * 0.25;

  // =============================================
  // 5. EDGE DISSOLUTION (alpha cutout pattern)
  // =============================================
  float dissolveNoise = hash2(vUv * 50.0 + uTime * 0.3);
  float dissolveEdge = smoothstep(0.0, 0.3, fresnel);
  float dissolution = smoothstep(dissolveNoise, dissolveNoise + 0.1, dissolveEdge * 0.3);

  // =============================================
  // 6. HOVER: chromatic split + glow intensify + distortion highlight
  // =============================================
  float hoverGlow = uHover * (0.4 + fresnel * 0.6);
  float hoverPulse = uHover * sin(uTime * 8.0) * 0.15;

  // Distortion highlight — brighter where vertex was displaced
  float distortHighlight = vDistortion * 1.5;

  // =============================================
  // 7. GLITCH: RGB channel corruption + band displacement
  // =============================================
  vec3 glitchColor = holoColor;
  float glitchAlpha = 0.0;

  if (uGlitch > 0.0) {
    // RGB channel separation per-fragment
    float rgbShift = uGlitch * 0.15;
    float shiftR = hash2(vUv + vec2(uTime * 5.0, 0.0));
    float shiftB = hash2(vUv + vec2(0.0, uTime * 5.0));

    glitchColor.r = mix(holoColor.r, shiftR, rgbShift * step(0.85, hash(floor(vPosition.y * 15.0) + uTime * 20.0)));
    glitchColor.b = mix(holoColor.b, shiftB, rgbShift * step(0.85, hash(floor(vPosition.y * 20.0) + uTime * 25.0)));

    // Bright corruption bands
    float corruptBand = step(0.9, hash(floor(vPosition.y * 8.0) + floor(uTime * 10.0)));
    glitchColor += corruptBand * uGlitch * vec3(0.0, 0.83, 1.0);

    // Flash on glitch
    glitchAlpha = vGlitchOffset * uGlitch * 0.3;

    // Inversion bands
    float invertBand = step(0.95, hash(floor(vPosition.y * 12.0) + floor(uTime * 8.0)));
    glitchColor = mix(glitchColor, vec3(1.0) - glitchColor, invertBand * uGlitch * 0.5);
  }

  // =============================================
  // COMPOSITE
  // =============================================
  vec3 finalColor = glitchColor;
  finalColor += fresnel * baseColor * 0.6;        // edge glow
  finalColor += scanlines;                          // scanlines
  finalColor += dataStream;                         // data flicker
  finalColor += hoverGlow * baseColor;              // hover glow
  finalColor += hoverPulse;                         // hover pulse
  finalColor += distortHighlight * baseColor;       // distortion highlight

  float finalAlpha = uAlpha;
  finalAlpha *= (0.5 + fresnel * 0.5);             // edge-weighted
  finalAlpha *= (1.0 - scanH * 0.2);               // scanline modulation
  finalAlpha *= (1.0 - dissolution * 0.3);          // edge dissolution
  finalAlpha += hoverGlow * 0.3;                    // hover visibility boost
  finalAlpha += glitchAlpha;                        // glitch flash
  finalAlpha = clamp(finalAlpha, 0.0, 1.0);

  gl_FragColor = vec4(finalColor, finalAlpha);
}
