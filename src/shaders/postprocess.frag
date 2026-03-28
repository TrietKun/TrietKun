uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uGlitchIntensity;
uniform float uChromaticAberration;
uniform float uVignetteIntensity;
uniform float uNoiseIntensity;
uniform vec2 uResolution;
uniform float uExposure;
uniform float uBloomStrength;
uniform vec2 uRippleCenter;
uniform float uRippleTime;
uniform float uRippleIntensity;

varying vec2 vUv;

float random(vec2 st) {
  return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;

  // =============================================
  // GLITCH (3-layer — reduced from 5)
  // =============================================
  float glitch = uGlitchIntensity;
  float glitchCA = 0.0;

  if (glitch > 0.0) {
    float lineJitter = step(0.94, random(vec2(floor(uv.y * 100.0), uTime * 40.0)));
    uv.x += lineJitter * glitch * 0.05 * (random(vec2(uTime)) - 0.5);

    float blockY = floor(uv.y * 18.0);
    float blockShift = step(0.96, random(vec2(blockY, floor(uTime * 10.0))));
    uv.x += blockShift * (random(vec2(blockY * 3.0, uTime * 5.0)) - 0.5) * glitch * 0.15;

    float tearY = floor(uv.y * 5.0);
    float tearActive = step(0.99, random(vec2(tearY, floor(uTime * 4.0))));
    uv.x += tearActive * (random(vec2(tearY * 7.0, uTime * 8.0)) - 0.5) * glitch * 0.25;

    if (glitch > 0.6) {
      float waveStr = (glitch - 0.6) * 2.5;
      uv.x += sin(uv.y * 30.0 + uTime * 25.0) * waveStr * 0.02;
    }

    glitchCA = glitch * 0.012;
  }

  // =============================================
  // RIPPLE SHOCKWAVE
  // =============================================
  if (uRippleIntensity > 0.001) {
    vec2 rippleUV = uv - uRippleCenter;
    float aspect = uResolution.x / uResolution.y;
    rippleUV.x *= aspect;
    float rippleDist = length(rippleUV);
    float rippleRadius = uRippleTime * 1.8;
    float rippleWidth = 0.12 + uRippleTime * 0.15;
    float rippleEdge = smoothstep(rippleRadius - rippleWidth, rippleRadius, rippleDist)
                     * (1.0 - smoothstep(rippleRadius, rippleRadius + rippleWidth, rippleDist));
    vec2 rippleDir = normalize(rippleUV + 0.0001);
    rippleDir.x /= aspect;
    uv += rippleDir * rippleEdge * uRippleIntensity * 0.035 * sin(rippleDist * 40.0 - uRippleTime * 25.0);
  }

  // =============================================
  // CHROMATIC ABERRATION (radial)
  // =============================================
  float ca = uChromaticAberration + glitchCA;
  vec2 caDir = (uv - 0.5);
  vec2 caOffset = caDir * ca * (1.0 + length(caDir) * 2.5);

  float r = texture2D(tDiffuse, uv + caOffset).r;
  float g = texture2D(tDiffuse, uv).g;
  float b = texture2D(tDiffuse, uv - caOffset).b;
  vec3 color = vec3(r, g, b);

  // =============================================
  // CHEAP BLOOM — 4-tap cross sample, threshold bright pixels
  // Replaces the entire UnrealBloomPass (saves 5+ GPU passes)
  // =============================================
  vec2 texel = 1.0 / uResolution * 3.0; // 3px spread
  vec3 bloom = vec3(0.0);
  bloom += max(texture2D(tDiffuse, uv + vec2( texel.x, 0.0)).rgb - 0.5, 0.0);
  bloom += max(texture2D(tDiffuse, uv + vec2(-texel.x, 0.0)).rgb - 0.5, 0.0);
  bloom += max(texture2D(tDiffuse, uv + vec2(0.0,  texel.y)).rgb - 0.5, 0.0);
  bloom += max(texture2D(tDiffuse, uv + vec2(0.0, -texel.y)).rgb - 0.5, 0.0);
  color += bloom * 0.25 * uBloomStrength;

  // =============================================
  // GLITCH POST-SAMPLE
  // =============================================
  if (glitch > 0.0) {
    float invertBand = step(0.96, random(vec2(floor(vUv.y * 10.0), floor(uTime * 6.0))));
    color = mix(color, vec3(1.0) - color, invertBand * glitch * 0.4);

    float flashLine = step(0.98, random(vec2(floor(vUv.y * 60.0), floor(uTime * 15.0))));
    color += flashLine * glitch * vec3(0.0, 0.83, 1.0);

    color += (random(vUv * uResolution + uTime * 100.0) - 0.5) * glitch * 0.12;
  }

  // =============================================
  // EXPOSURE
  // =============================================
  color *= uExposure;

  // =============================================
  // VIGNETTE (softer, more elegant)
  // =============================================
  float vigDist = length(vUv - 0.5);
  color *= 1.0 - smoothstep(0.4, 1.5, vigDist * uVignetteIntensity) * 0.8;

  float lum = dot(color, vec3(0.299, 0.587, 0.114));

  // =============================================
  // VERY SUBTLE FILM GRAIN (barely visible)
  // =============================================
  float noise = (random(vUv * uTime * 0.01 + 0.5) - 0.5) * uNoiseIntensity * 0.5;
  color += noise * smoothstep(0.0, 0.1, lum);

  // (scanlines removed — too harsh)

  // =============================================
  // ELEGANT COLOR TINT (cool shadows, warm highlights)
  // =============================================
  color.b += smoothstep(0.0, 0.2, lum) * (1.0 - smoothstep(0.2, 0.5, lum)) * 0.008;
  color.r += smoothstep(0.6, 1.0, lum) * 0.004;

  // Soft black floor
  color = max(color - 0.003, 0.0);

  gl_FragColor = vec4(color, 1.0);
}
