/**
 * NIGHTFALL - A vampire swarm runner
 * An original endless runner: a horde of chibi vampires races across a gothic
 * town at night. Grow the horde with coffins and caged bats, break crates and
 * gates by numbers, dodge holy water and barricades, and never fall into a chasm.
 * One input: tap / Space to jump, hold to jump higher.
 *
 * Plain canvas 2D. World units are "design pixels" (the viewport is scaled so it
 * is always about 720 units tall); all motion is delta-time based.
 */

const BLOOD = '#E0294A';
const BONE = '#F2E8DC';
const EMBER = '#FF7A3D';
const HOLY = '#7CFFB2';
const MIST = '#9B7BFF';
const TAU = Math.PI * 2;

// Layout
const DESIGN_H = 720;
const GROUND_RATIO = 0.72;
const LANE_FLOOR = [3, 16, 29]; // y offset below the street edge for back / middle / front lane
const LANE_SCALE = [0.94, 1, 1.06];
const OBSTACLE_BASE = 16;
const BOT_H = 40; // one vampire tall: step blocks are 1 or 2 of these

// Physics (units per second)
const GRAVITY = 2300;
const JUMP_SPEED = 720;
const HOLD_GRAVITY_SCALE = 0.45;
const HOLD_MAX_TIME = 0.32;
const HOLD_JUMP_AIRTIME = 0.917; // seconds in the air for a full hold jump (derived from the numbers above)
const STEP_UP = 14; // a ledge this small is climbed, a taller one bumps
const SNAP_DOWN = 12;
const LEVEL_MAX = 70; // hills never rise above this

// Speed: smooth ease from BASE to a hard cap
const BASE_SPEED = 330;
const MAX_SPEED = 720;
const RAMP_SECONDS = 170;
const ATTRACT_SPEED = 60;
const MAX_DT = 0.05;

// Gameplay
const MAX_SWARM = 30;
const MILESTONE_STEP = 250;
const GATE_MIN_GAP_M = 600;
const PIT_MIN_WIDTH = 100;
const PIT_WIDTH_FACTOR = [0.3, 0.46]; // times current speed; hold jump covers 0.917 * speed
const PACK_SPACING = 10;
const POWERUP_DURATION = { shield: 14, magnet: 8, x2: 10 };
const POWERUP_KEYS = ['shield', 'magnet', 'x2'];
const POWERUP_COLOR = { shield: MIST, magnet: BLOOD, x2: EMBER };
const POWERUP_NAME = { shield: 'NIGHT CLOAK', magnet: 'BLOOD HUNGER', x2: 'BLOOD MOON' };

const REASONS = {
  void: 'The horde fell into the abyss',
  pushed: 'Pushed out of the night',
  destroyed: 'The horde was destroyed',
};

const STORAGE_BEST = 'cyberSwarmHigh';
const STORAGE_MUTED = 'cyberSwarmMuted';

const rand = (a, b) => Math.random() * (b - a) + a;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Smoothstep ramp from BASE_SPEED to MAX_SPEED; never exceeds MAX_SPEED. */
function speedAtTime(seconds) {
  const p = clamp(seconds / RAMP_SECONDS, 0, 1);
  return BASE_SPEED + (MAX_SPEED - BASE_SPEED) * p * p * (3 - 2 * p);
}

function hexA(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn('[Nightfall] localStorage read failed', key, error);
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn('[Nightfall] localStorage write failed', key, error);
  }
}

// ============================================
// Cached glow sprites (cheaper than shadowBlur)
// ============================================
const glowCache = new Map();

function glowSprite(color) {
  let sprite = glowCache.get(color);
  if (sprite) return sprite;
  sprite = document.createElement('canvas');
  sprite.width = 64;
  sprite.height = 64;
  const g = sprite.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, hexA(color, 1));
  grad.addColorStop(0.3, hexA(color, 0.4));
  grad.addColorStop(1, hexA(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, sprite);
  return sprite;
}

function drawGlow(ctx, color, x, y, radius, alpha) {
  const previous = ctx.globalAlpha;
  ctx.globalAlpha = previous * alpha;
  ctx.drawImage(glowSprite(color), x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = previous;
}

let fogSpriteCache = null;
function fogSprite() {
  if (fogSpriteCache) return fogSpriteCache;
  fogSpriteCache = document.createElement('canvas');
  fogSpriteCache.width = 512;
  fogSpriteCache.height = 96;
  const g = fogSpriteCache.getContext('2d');
  g.translate(256, 48);
  g.scale(1, 96 / 512);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(190, 170, 230, 0.55)');
  grad.addColorStop(0.6, 'rgba(150, 120, 200, 0.18)');
  grad.addColorStop(1, 'rgba(150, 120, 200, 0)');
  g.fillStyle = grad;
  g.fillRect(-256, -256, 512, 512);
  return fogSpriteCache;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function makeSprite(width, height, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const g = canvas.getContext('2d');
  g.scale(canvas.width / width, canvas.height / height);
  return { canvas, g };
}

// ============================================
// Sound: tiny WebAudio blips, muted by default
// ============================================
class SoundFx {
  constructor() {
    this.ctx = null;
    this.muted = readStorage(STORAGE_MUTED) !== '0';
  }

  setMuted(muted) {
    this.muted = muted;
    writeStorage(STORAGE_MUTED, muted ? '1' : '0');
    if (!muted) this._ensure();
  }

  _ensure() {
    if (!this.ctx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      try {
        this.ctx = new AudioCtor();
      } catch (error) {
        console.warn('[SoundFx] AudioContext unavailable', error);
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch((error) => console.warn('[SoundFx] resume failed', error));
    }
    return this.ctx;
  }

  _blip(from, to, duration, type, volume, delay = 0) {
    if (this.muted) return;
    const ctx = this._ensure();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  _noise(duration, volume, highpass) {
    if (this.muted) return;
    const ctx = this._ensure();
    if (!ctx) return;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  }

  jump() { this._blip(250, 560, 0.09, 'triangle', 0.045); }
  pickup() { this._blip(620, 940, 0.08, 'sine', 0.05); }
  hit() { this._blip(200, 45, 0.26, 'sawtooth', 0.05); }
  hiss() { this._noise(0.35, 0.05, 3500); }
  smash() { this._noise(0.28, 0.07, 700); this._blip(140, 50, 0.22, 'square', 0.04); }
  fall() { this._blip(420, 70, 0.5, 'triangle', 0.05); }
  rise() {
    this._blip(180, 360, 0.18, 'sine', 0.06);
    this._blip(360, 720, 0.2, 'triangle', 0.04, 0.1);
  }
  power() {
    this._blip(392, 392, 0.08, 'triangle', 0.05);
    this._blip(494, 494, 0.08, 'triangle', 0.05, 0.08);
    this._blip(659, 659, 0.14, 'triangle', 0.05, 0.16);
  }
  bell() {
    this._blip(131, 128, 0.9, 'sine', 0.08);
    this._blip(262, 258, 0.6, 'sine', 0.035);
  }
}

// ============================================
// Vampire drawing (canvas paths only)
// ============================================
let vampGradients = null;

function getVampGradients(ctx) {
  if (vampGradients && vampGradients.ctx === ctx) return vampGradients;
  const face = ctx.createRadialGradient(-2, -34, 1, 1, -31, 11);
  face.addColorStop(0, '#FFF7EC');
  face.addColorStop(0.6, '#EBDCCB');
  face.addColorStop(1, '#C7B2A4');
  vampGradients = { ctx, face };
  return vampGradients;
}

/**
 * Draws one chibi vampire with its feet at (x, y).
 * opts: scale, sx, sy (squash), run (leg phase), air, flash, leader, tip (blink phase), alpha, standing
 */
function drawVamp(ctx, x, y, opts) {
  const grads = getVampGradients(ctx);
  const flash = opts.flash;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(opts.sx * opts.scale, opts.sy * opts.scale);
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;

  // Cape: flutters while running, spreads like wings in the air
  const flutter = opts.standing ? Math.sin(opts.tip * 0.6) * 0.8 : Math.sin(opts.run * 1.3) * 3;
  if (opts.fledgling) {
    // Fledglings wear only a tiny cloak
    ctx.fillStyle = flash ? '#FFFFFF' : '#0B0714';
    ctx.beginPath();
    ctx.moveTo(2, -25);
    ctx.lineTo(-8, -22 + flutter * 0.2);
    ctx.lineTo(-6, -14);
    ctx.lineTo(-1, -17);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = flash ? '#FFE6EA' : BLOOD;
    ctx.beginPath();
    ctx.moveTo(-8, -22 + flutter * 0.2);
    ctx.lineTo(-6, -14);
    ctx.lineTo(-4, -19);
    ctx.closePath();
    ctx.fill();
  } else {
  ctx.fillStyle = flash ? '#FFFFFF' : '#0B0714';
  ctx.beginPath();
  if (opts.air) {
    const f = Math.sin(opts.tip * 2.2) * 1.6;
    ctx.moveTo(-2, -25);
    ctx.quadraticCurveTo(-13, -42 + f, -27, -36 + f);
    ctx.lineTo(-21, -29);
    ctx.quadraticCurveTo(-28, -22 + f, -23, -14);
    ctx.lineTo(-16, -17);
    ctx.quadraticCurveTo(-18, -8, -10, -3);
    ctx.lineTo(-4, -12);
  } else {
    ctx.moveTo(2, -25);
    ctx.bezierCurveTo(-5, -26, -13, -23 + flutter * 0.4, -19 - flutter, -13 + flutter * 0.5);
    ctx.lineTo(-15 - flutter * 0.6, -8);
    ctx.quadraticCurveTo(-11, -5 - flutter * 0.3, -9, -2);
    ctx.lineTo(-5, -8);
    ctx.lineTo(-3, -17);
  }
  ctx.closePath();
  ctx.fill();
  // Red lining along the hem
  ctx.fillStyle = flash ? '#FFE6EA' : BLOOD;
  ctx.beginPath();
  if (opts.air) {
    ctx.moveTo(-4, -23);
    ctx.quadraticCurveTo(-13, -36, -23, -32);
    ctx.lineTo(-19, -27);
    ctx.quadraticCurveTo(-14, -26, -4, -20);
  } else {
    ctx.moveTo(-4, -16);
    ctx.lineTo(-15 - flutter * 0.6, -8);
    ctx.quadraticCurveTo(-11, -5 - flutter * 0.3, -9, -2);
    ctx.lineTo(-6, -8);
  }
  ctx.closePath();
  ctx.fill();

  }

  // Legs
  let swingA = 0;
  let swingB = 0;
  let liftA = 0;
  let liftB = 0;
  if (opts.air) {
    swingA = -3;
    swingB = 4;
    liftA = 3;
    liftB = 1;
  } else if (!opts.standing) {
    swingA = Math.sin(opts.run) * 5;
    swingB = -swingA;
    liftA = Math.max(0, Math.cos(opts.run)) * 3.5;
    liftB = Math.max(0, -Math.cos(opts.run)) * 3.5;
  }
  ctx.lineCap = 'round';
  ctx.lineWidth = 4.2;
  ctx.strokeStyle = flash ? '#FFFFFF' : '#171022';
  ctx.beginPath();
  ctx.moveTo(-3, -12);
  ctx.lineTo(-3 + swingA, -1.5 - liftA);
  ctx.moveTo(4, -12);
  ctx.lineTo(4 + swingB, -1.5 - liftB);
  ctx.stroke();

  // Coat, vest and cravat
  roundRectPath(ctx, -6.5, -25, 14, 14, 4);
  ctx.fillStyle = flash ? '#FFFFFF' : '#2A1C44';
  ctx.fill();
  if (!flash) {
    ctx.fillStyle = '#8E1C37';
    ctx.fillRect(0, -23.5, 3.2, 11);
    ctx.fillStyle = BLOOD;
    ctx.beginPath();
    ctx.moveTo(-0.5, -25);
    ctx.lineTo(4.5, -25);
    ctx.lineTo(2, -19);
    ctx.closePath();
    ctx.fill();
  }
  // High collar
  ctx.fillStyle = flash ? '#FFFFFF' : '#0B0714';
  ctx.beginPath();
  ctx.moveTo(-7, -25);
  ctx.lineTo(-9, -33);
  ctx.lineTo(-2.5, -26);
  ctx.moveTo(8, -25);
  ctx.lineTo(10.5, -32);
  ctx.lineTo(4, -26);
  ctx.fill();

  // Head
  ctx.fillStyle = flash ? '#FFFFFF' : grads.face;
  ctx.beginPath();
  ctx.arc(1, -31, 9.2, 0, TAU);
  ctx.fill();
  // Pointed ear
  ctx.beginPath();
  ctx.moveTo(-7.5, -32);
  ctx.lineTo(-12.5, -37);
  ctx.lineTo(-7, -35);
  ctx.closePath();
  ctx.fill();
  // Slicked hair with a widow's peak
  ctx.fillStyle = flash ? '#DDDDEE' : '#0A0610';
  ctx.beginPath();
  ctx.moveTo(-8.8, -30.5);
  ctx.bezierCurveTo(-10, -43, 7, -45.5, 10.3, -34);
  ctx.lineTo(7.2, -34.8);
  ctx.lineTo(3.4, -30.6);
  ctx.lineTo(0.2, -34.4);
  ctx.closePath();
  ctx.fill();
  if (!flash) {
    ctx.strokeStyle = opts.leader ? '#C9C2E0' : '#3D2B66';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-5.5, -37.5);
    ctx.quadraticCurveTo(-1, -41.5, 4.5, -39.5);
    ctx.stroke();
  }
  // Red eyes, brows and fangs
  const eye = flash ? '#FF3A5A' : '#FF2A4A';
  ctx.fillStyle = eye;
  ctx.beginPath();
  ctx.ellipse(3.8, -29, 1.7, 2.1, 0, 0, TAU);
  ctx.ellipse(8.2, -29, 1.4, 1.9, 0, 0, TAU);
  ctx.fill();
  if (!flash) {
    ctx.strokeStyle = '#1A0A14';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(2.2, -32.2);
    ctx.lineTo(5.2, -31);
    ctx.moveTo(6.8, -31);
    ctx.lineTo(9.8, -32.4);
    ctx.stroke();
    ctx.strokeStyle = '#6E3A3A';
    ctx.beginPath();
    ctx.moveTo(4.6, -24.6);
    ctx.lineTo(8.4, -25);
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(5, -24.7);
    ctx.lineTo(6.1, -24.7);
    ctx.lineTo(5.55, -22.6);
    ctx.moveTo(7.2, -24.9);
    ctx.lineTo(8.3, -24.9);
    ctx.lineTo(7.75, -22.8);
    ctx.fill();
  }
  if (opts.leader && !flash) {
    ctx.fillStyle = '#FF4D6D';
    ctx.beginPath();
    ctx.arc(2.2, -21, 1.7, 0, TAU);
    ctx.fill();
  }

  // Glows (additive)
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, BLOOD, 6, -29, 8, 0.85);
  if (opts.leader) drawGlow(ctx, BLOOD, 2.2, -21, 6, 0.7);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/** Small flapping bat silhouette centred on (0,0), wing span about 2 * size. */
function drawBat(ctx, size, flap, fill, rim) {
  const w = size * (0.35 + 0.65 * Math.abs(Math.sin(flap)));
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.2);
  ctx.quadraticCurveTo(w * 0.6, -size * 0.95, w * 1.4, -size * 0.35);
  ctx.quadraticCurveTo(w * 1.0, -size * 0.2, w * 0.8, size * 0.15);
  ctx.quadraticCurveTo(w * 0.45, -size * 0.05, 0, size * 0.3);
  ctx.quadraticCurveTo(-w * 0.45, -size * 0.05, -w * 0.8, size * 0.15);
  ctx.quadraticCurveTo(-w * 1.0, -size * 0.2, -w * 1.4, -size * 0.35);
  ctx.quadraticCurveTo(-w * 0.6, -size * 0.95, 0, -size * 0.2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (rim) {
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = rim;
    ctx.stroke();
  }
}

// ============================================
// Gothic town sprites (pre-rendered)
// ============================================
function renderFar(spec, scale) {
  const { w, h, kind, r } = spec;
  const { canvas, g } = makeSprite(w, h, scale);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#190E36');
  grad.addColorStop(1, '#09061C');
  g.fillStyle = grad;
  const roof = (cx, baseY, tw, th) => {
    g.beginPath();
    g.moveTo(cx - tw / 2 - 2, baseY);
    g.lineTo(cx, baseY - th);
    g.lineTo(cx + tw / 2 + 2, baseY);
    g.closePath();
    g.fill();
  };
  const tower = (cx, baseY, tw, th, roofH) => {
    g.fillRect(cx - tw / 2, baseY - th, tw, th + 1);
    roof(cx, baseY - th, tw, roofH);
  };
  const lights = [];

  if (kind === 'castle') {
    const cliff = h * 0.34;
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, h - cliff * 0.45);
    g.lineTo(w * 0.07, h - cliff * 0.8);
    g.lineTo(w * 0.15, h - cliff);
    g.lineTo(w * 0.85, h - cliff);
    g.lineTo(w * 0.93, h - cliff * 0.65);
    g.lineTo(w, h - cliff * 0.3);
    g.lineTo(w, h);
    g.closePath();
    g.fill();
    const by = h - cliff;
    const wallH = h * 0.2;
    g.fillRect(w * 0.16, by - wallH, w * 0.68, wallH + 1);
    for (let cx = w * 0.16; cx < w * 0.84 - 6; cx += 11) g.fillRect(cx, by - wallH - 5, 6, 5);
    tower(w * 0.16, by, w * 0.09, h * 0.36, h * 0.17);
    tower(w * 0.84, by, w * 0.09, h * 0.32, h * 0.15);
    tower(w * 0.34, by - wallH, w * 0.08, h * 0.2, h * 0.12);
    tower(w * 0.52, by - wallH, w * 0.15, h * 0.3, h * 0.2);
    tower(w * 0.7, by - wallH, w * 0.07, h * 0.16, h * 0.1);
    for (let i = 0; i < 5; i++) {
      lights.push([w * (0.15 + r[i] * 0.7), by - h * (0.08 + r[i + 5] * 0.3)]);
    }
  } else if (kind === 'spires') {
    const nave = h * 0.34;
    g.fillRect(0, h - nave, w, nave + 1);
    tower(w * 0.5, h - nave, w * 0.3, h * 0.28, h * 0.4);
    tower(w * 0.14, h - nave, w * 0.14, h * 0.12, h * 0.2);
    tower(w * 0.86, h - nave, w * 0.14, h * 0.14, h * 0.22);
    g.strokeStyle = '#190E36';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(w * 0.5, 0);
    g.lineTo(w * 0.5, 9);
    g.moveTo(w * 0.5 - 3.5, 4);
    g.lineTo(w * 0.5 + 3.5, 4);
    g.stroke();
    for (let i = 0; i < 3; i++) lights.push([w * (0.2 + r[i] * 0.6), h - nave * (0.3 + r[i + 3] * 0.5)]);
  } else {
    g.beginPath();
    g.moveTo(0, h);
    const steps = 7;
    for (let i = 0; i <= steps; i++) g.lineTo((w / steps) * i, h * (0.25 + r[i] * 0.6));
    g.lineTo(w, h);
    g.closePath();
    g.fill();
    g.strokeStyle = '#150B2C';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(w * 0.3, h * 0.35);
    g.lineTo(w * 0.3, h * 0.05);
    g.moveTo(w * 0.3, h * 0.15);
    g.lineTo(w * 0.3 + 9, h * 0.07);
    g.moveTo(w * 0.3, h * 0.22);
    g.lineTo(w * 0.3 - 8, h * 0.12);
    g.stroke();
  }
  g.fillStyle = hexA(EMBER, 0.75);
  lights.forEach(([lx, ly]) => g.fillRect(lx, ly, 2, 3.4));
  return canvas;
}

function renderMid(spec, scale) {
  const { w, h, roofH, roofKind, skew, cols, rows, lit, chim } = spec;
  const { canvas, g } = makeSprite(w, h, scale);
  const body = g.createLinearGradient(0, roofH, 0, h);
  body.addColorStop(0, '#201640');
  body.addColorStop(1, '#100B28');
  g.fillStyle = body;
  g.fillRect(0, roofH, w, h - roofH);
  // Chimney then roof
  g.fillStyle = '#150E30';
  g.fillRect(chim, roofH * 0.15, 8, roofH * 0.9);
  g.fillStyle = '#0D0920';
  g.beginPath();
  if (roofKind === 'crooked') {
    g.moveTo(-4, roofH + 1);
    g.lineTo(w * 0.5 + skew, 0);
    g.lineTo(w + 4, roofH + 1);
  } else {
    g.moveTo(-4, roofH + 1);
    g.lineTo(w * 0.28 + skew, roofH * 0.12);
    g.lineTo(w * 0.72 + skew, roofH * 0.12);
    g.lineTo(w + 4, roofH + 1);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = hexA(MIST, 0.25);
  g.lineWidth = 1.2;
  g.stroke();
  // Arched windows
  const colors = [null, EMBER, '#FFD27A', HOLY];
  for (let rIdx = 0; rIdx < rows; rIdx++) {
    for (let c = 0; c < cols; c++) {
      const color = colors[lit[rIdx * cols + c]];
      const wx = 8 + c * 13;
      const wy = roofH + 10 + rIdx * 16;
      g.fillStyle = color ? hexA(color, 0.78) : 'rgba(120, 110, 200, 0.07)';
      g.fillRect(wx, wy + 2.5, 5, 7);
      g.beginPath();
      g.arc(wx + 2.5, wy + 2.5, 2.5, Math.PI, 0);
      g.fill();
    }
  }
  return canvas;
}

function renderNear(spec, scale) {
  const { w, h, kind, r } = spec;
  const { canvas, g } = makeSprite(w, h, scale);
  const iron = '#0A0818';
  g.fillStyle = iron;
  g.strokeStyle = iron;
  if (kind === 'fence') {
    const railY = [h * 0.3, h * 0.72];
    g.lineWidth = 2;
    for (let x = 6; x < w - 6; x += 9) {
      g.fillRect(x - 1, h * 0.12, 2.2, h * 0.88);
      g.beginPath();
      g.moveTo(x - 3, h * 0.14);
      g.lineTo(x, 0 + h * 0.02);
      g.lineTo(x + 3, h * 0.14);
      g.fill();
    }
    railY.forEach((ry) => g.fillRect(0, ry, w, 3));
    g.fillStyle = '#16122B';
    g.fillRect(0, h * 0.04, 8, h * 0.96);
    g.fillRect(w - 8, h * 0.04, 8, h * 0.96);
    g.fillStyle = '#1F1A3A';
    g.fillRect(-1, h * 0.0, 10, 4);
    g.fillRect(w - 9, h * 0.0, 10, 4);
  } else if (kind === 'lantern') {
    const px = w * 0.4;
    g.fillRect(px - 2.5, h * 0.18, 5, h * 0.82);
    g.fillRect(px - 7, h - 8, 14, 8);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(px, h * 0.22);
    g.quadraticCurveTo(px + w * 0.3, h * 0.1, px + w * 0.45, h * 0.18);
    g.stroke();
    // Lantern cage hanging from the arm
    const lx = px + w * 0.45;
    const ly = h * 0.18;
    g.fillRect(lx - 1, ly, 2, 6);
    g.fillRect(lx - 7, ly + 6, 14, 3);
    g.fillStyle = hexA(EMBER, 0.9);
    g.fillRect(lx - 5, ly + 9, 10, 13);
    g.fillStyle = iron;
    g.fillRect(lx - 7, ly + 22, 14, 3);
    g.fillRect(lx - 0.6, ly + 9, 1.2, 13);
  } else if (kind === 'graves') {
    g.fillStyle = '#12102A';
    g.beginPath();
    g.moveTo(0, h);
    g.quadraticCurveTo(w * 0.5, h * 0.7, w, h);
    g.closePath();
    g.fill();
    const count = 2 + Math.floor(r[0] * 3);
    for (let i = 0; i < count; i++) {
      const gx = (w / (count + 0.4)) * (i + 0.5) + 4;
      const gh = h * (0.35 + r[i + 1] * 0.5);
      const gw = 14 + r[i + 4] * 8;
      g.fillStyle = i % 2 ? '#1D1838' : '#242046';
      if (r[i + 7] < 0.35) {
        g.fillRect(gx - 2.5, h - gh, 5, gh);
        g.fillRect(gx - 8, h - gh + 8, 16, 4.5);
      } else {
        g.beginPath();
        g.moveTo(gx - gw / 2, h);
        g.lineTo(gx - gw / 2, h - gh + gw / 2);
        g.arc(gx, h - gh + gw / 2, gw / 2, Math.PI, 0);
        g.lineTo(gx + gw / 2, h);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(gx - 1, h - gh + gw * 0.5, 2, gw * 0.7);
      }
    }
  } else {
    // Dead tree: trunk plus branches from the spec
    g.lineCap = 'round';
    spec.branches.forEach((b) => {
      g.lineWidth = b.width;
      g.beginPath();
      g.moveTo(b.x1, b.y1);
      g.lineTo(b.x2, b.y2);
      g.stroke();
    });
  }
  return canvas;
}

// ============================================
// Game
// ============================================
class Nightfall {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.sfx = new SoundFx();

    this.state = 'START';
    this.t = 0;
    this.lastFrame = 0;
    this.highScore = parseInt(readStorage(STORAGE_BEST) || '0', 10) || 0;

    this.score = 0;
    this.distance = 0;
    this.runTime = 0;
    this.speed = ATTRACT_SPEED;
    this.maxSwarm = 1;
    this.combo = 1;
    this.streak = 0;
    this.vialCount = 0;
    this.nextMilestone = MILESTONE_STEP;
    this.shake = 0;
    this.flash = 0;
    this.holding = false;
    this.holdHistory = [];
    this.gridOffset = 0;
    this.leaderX = 0;
    this.packTimer = 0;
    this.lastPressAt = -10;
    this.attractHopTimer = 1;
    this.overTimer = null;
    this.overAllowedAt = 0;
    this.overReason = 'destroyed';
    this.lastLoss = 'destroyed';
    this.activePointers = new Set();

    this.bots = [];
    this.ghosts = [];
    this.ghostTimer = 0;
    this.pu = { shield: 0, magnet: 0, x2: 0 };
    this.pending = [];

    // World entities (x scrolls left with the world)
    this.terrain = [];
    this.terrainEnd = 0;
    this.level = 0;
    this.lastChunk = 'flat';
    this.noPitNext = false;
    this.lastGateD = -300;
    this.lastPowerD = 0;
    this.crates = [];
    this.mines = [];
    this.gates = [];
    this.coffins = [];
    this.cages = [];
    this.nodes = [];
    this.powerUps = [];
    this.obstacles = [];
    this.villagers = [];
    this.vehicles = [];
    this.guards = [];
    this.decks = [];

    // Pools: no allocations in the hot path
    this.particles = Array.from({ length: 420 }, () => ({ active: false }));
    this.particleCursor = 0;
    this.floatTexts = Array.from({ length: 14 }, () => ({ active: false }));
    this.speedLines = Array.from({ length: 16 }, () => ({ x: 0, y: 0, len: 0, mult: 1 }));

    this.stars = [];
    this.layers = [
      { kind: 'far', factor: 0.06, items: [], scale: 1, fog: null },
      { kind: 'mid', factor: 0.16, items: [], scale: 1, fog: null },
      { kind: 'near', factor: 0.38, items: [], scale: 1, fog: null },
    ];
    this.flickerClock = 0;
    this.skyActors = { bats: [], balloons: [], fog: [], plane: null };
    this.lightning = { timer: 8, flash: 0, bolt: null };

    this._cacheDom();
    this._layout();
    this._bindInput();
    this._bindUi();
    this._resetWorld();
    this._enterAttract();
    this._syncHud(true);

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready
        .then(() => this._rebuildSprites())
        .catch((error) => console.warn('[Nightfall] fonts.ready failed', error));
    }

    requestAnimationFrame((now) => this._frame(now));
  }

  _setHolding(on) {
    if (this.holding === on) return;
    this.holding = on;
    this.holdHistory.push({ t: this.t, on });
    if (this.holdHistory.length > 24) this.holdHistory.shift();
  }

  // Followers mirror the leader's input from the moment they reach the same spot
  _holdingAt(time) {
    for (let i = this.holdHistory.length - 1; i >= 0; i--) {
      if (this.holdHistory[i].t <= time) return this.holdHistory[i].on;
    }
    return false;
  }

  get reduced() {
    return this.reducedMotionQuery.matches;
  }

  // ============================
  // DOM
  // ============================
  _cacheDom() {
    const byId = (id) => document.getElementById(id);
    this.dom = {
      score: byId('hud-score'),
      combo: byId('hud-combo'),
      dist: byId('hud-dist'),
      swarm: byId('hud-swarm'),
      best: byId('hud-best'),
      speed: byId('hud-speed'),
      pending: byId('hud-pending'),
      pendingText: byId('hud-pending-text'),
      pause: byId('btn-pause'),
      mute: byId('btn-mute'),
      toast: byId('toast'),
      start: byId('start-screen'),
      pauseScreen: byId('pause-screen'),
      over: byId('game-over-screen'),
      startBest: byId('start-best'),
      goScore: byId('go-score'),
      goDist: byId('go-dist'),
      goSwarm: byId('go-swarm'),
      goBest: byId('go-high'),
      goRecord: byId('go-record'),
      goReason: byId('go-reason'),
      chips: {
        shield: byId('pu-shield'),
        magnet: byId('pu-magnet'),
        x2: byId('pu-x2'),
      },
    };
    this.hudCache = {};
  }

  _setText(key, el, value) {
    if (!el || this.hudCache[key] === value) return;
    this.hudCache[key] = value;
    el.textContent = value;
  }

  adultCount() {
    let count = 0;
    for (const bot of this.bots) if (!bot.fledgling) count++;
    return count;
  }

  _syncHud(force = false) {
    if (force) this.hudCache = {};
    const d = this.dom;
    const adults = this.adultCount();
    const fledglings = this.bots.length - adults;
    this._setText('score', d.score, Math.floor(this.score).toLocaleString('en-US'));
    this._setText('combo', d.combo, `x${this.combo}`);
    this._setText('dist', d.dist, `${Math.floor(this.distance)} m`);
    this._setText('swarm', d.swarm, fledglings > 0 ? `${adults} + ${fledglings}` : String(adults));
    this._setText('best', d.best, this.highScore.toLocaleString('en-US'));
    this._setText('startBest', d.startBest, this.highScore.toLocaleString('en-US'));
    if (d.combo) d.combo.dataset.level = String(this.combo);

    if (d.speed) {
      const ratio = clamp((this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 0, 1);
      const text = ratio.toFixed(2);
      if (this.hudCache.speedGauge !== text) {
        this.hudCache.speedGauge = text;
        d.speed.style.transform = `scaleX(${text})`;
      }
    }

    if (d.pending) {
      const next = this.pending[0];
      const show = Boolean(next) && this.state === 'PLAYING';
      if (show) {
        const left = Math.max(0, Math.ceil(next.at - this.distance));
        this._setText('pendingText', d.pendingText, `+${next.count} in ${left}m`);
      }
      if (this.hudCache.pendingShown !== show) {
        this.hudCache.pendingShown = show;
        d.pending.classList.toggle('active', show);
      }
    }

    POWERUP_KEYS.forEach((key) => {
      const chip = d.chips[key];
      if (!chip) return;
      const left = this.pu[key];
      const active = left > 0;
      chip.classList.toggle('active', active);
      if (active) {
        const ratio = clamp(left / POWERUP_DURATION[key], 0, 1);
        const bar = chip.querySelector('.pu-bar i');
        if (bar) bar.style.transform = `scaleX(${ratio.toFixed(3)})`;
        chip.classList.toggle('low', left < 2.5);
      }
    });
  }

  _setBodyState() {
    document.body.dataset.state = this.state.toLowerCase();
    const d = this.dom;
    d.start?.classList.toggle('active', this.state === 'START');
    d.pauseScreen?.classList.toggle('active', this.state === 'PAUSED');
    if (this.state !== 'GAMEOVER') d.over?.classList.remove('active');
    if (d.pause) {
      d.pause.classList.toggle('is-paused', this.state === 'PAUSED');
      d.pause.setAttribute('aria-label', this.state === 'PAUSED' ? 'Resume' : 'Pause');
    }
  }

  _toast(text) {
    const el = this.dom.toast;
    if (!el) return;
    el.textContent = text;
    el.classList.remove('show');
    // Force reflow so the CSS animation restarts
    void el.offsetWidth;
    el.classList.add('show');
  }

  // ============================
  // Layout / resize
  // ============================
  _layout() {
    const portraitTouch = window.matchMedia('(orientation: portrait) and (pointer: coarse)').matches;
    this.cssW = Math.max(1, portraitTouch ? window.innerHeight : window.innerWidth);
    this.cssH = Math.max(1, portraitTouch ? window.innerWidth : window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.sc = clamp(this.cssH / DESIGN_H, 0.5, 1.5);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.W = this.cssW / this.sc;
    this.H = this.cssH / this.sc;
    this.groundY = this.H * GROUND_RATIO;
    this.leaderXTarget = this._targetLeaderX();
    if (!this.leaderX) this.leaderX = this.leaderXTarget;

    this._buildStatic();
    this._seedStars();
    this._seedSky();
    this._fillLayers();
  }

  _targetLeaderX() {
    if (this.state === 'START') return clamp(this.W * 0.5, 240, 900);
    return clamp(this.W * 0.26, 170, 320);
  }

  _bindResize() {
    // Sprites are re-rendered after the resize settles; the cheap parts update immediately
    let timer = null;
    const onResize = () => {
      this._layout();
      clearTimeout(timer);
      timer = setTimeout(() => this._rebuildSprites(), 140);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
  }

  _buildStatic() {
    const { W, H, groundY } = this;
    const k = this.dpr * this.sc;

    // Sky + moon + street base (static, drawn once per layout)
    const sky = document.createElement('canvas');
    sky.width = this.canvas.width;
    sky.height = this.canvas.height;
    const g = sky.getContext('2d');
    g.scale(k, k);

    const skyGrad = g.createLinearGradient(0, 0, 0, groundY);
    skyGrad.addColorStop(0, '#02030C');
    skyGrad.addColorStop(0.45, '#0A0F2E');
    skyGrad.addColorStop(0.82, '#2A1048');
    skyGrad.addColorStop(1, '#4A1238');
    g.fillStyle = skyGrad;
    g.fillRect(0, 0, W, groundY + 2);

    // Horizon glow
    g.save();
    g.translate(W * 0.5, groundY);
    g.scale(1, 0.34);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, W * 0.75);
    glow.addColorStop(0, 'rgba(224, 41, 74, 0.36)');
    glow.addColorStop(0.5, 'rgba(110, 30, 110, 0.16)');
    glow.addColorStop(1, 'rgba(110, 30, 110, 0)');
    g.fillStyle = glow;
    g.fillRect(-W, -groundY / 0.34, W * 2, groundY / 0.34);
    g.restore();

    // Blood moon with halo
    const px = W * 0.72;
    const py = groundY * 0.3;
    const pr = Math.min(120, W * 0.1);
    this.moon = { x: px, y: py, r: pr };
    const halo = g.createRadialGradient(px, py, pr * 0.7, px, py, pr * 3.2);
    halo.addColorStop(0, 'rgba(224, 41, 74, 0.26)');
    halo.addColorStop(1, 'rgba(224, 41, 74, 0)');
    g.fillStyle = halo;
    g.fillRect(px - pr * 3.2, py - pr * 3.2, pr * 6.4, pr * 6.4);
    const body = g.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.1, px, py, pr);
    body.addColorStop(0, '#FF8A7A');
    body.addColorStop(0.5, '#D02A4C');
    body.addColorStop(1, '#6A0F2C');
    g.fillStyle = body;
    g.beginPath();
    g.arc(px, py, pr, 0, TAU);
    g.fill();
    g.save();
    g.beginPath();
    g.arc(px, py, pr, 0, TAU);
    g.clip();
    g.fillStyle = 'rgba(60, 5, 30, 0.2)';
    [[-0.35, 0.15, 0.22], [0.25, -0.3, 0.14], [0.3, 0.35, 0.18], [-0.1, -0.45, 0.1]].forEach(([cx, cy, cr]) => {
      g.beginPath();
      g.arc(px + cx * pr, py + cy * pr, cr * pr, 0, TAU);
      g.fill();
    });
    g.restore();

    // Street base
    const road = g.createLinearGradient(0, groundY, 0, H);
    road.addColorStop(0, '#1A132C');
    road.addColorStop(0.4, '#100B20');
    road.addColorStop(1, '#06050F');
    g.fillStyle = road;
    g.fillRect(0, groundY, W, H - groundY + 2);
    const roadGlow = g.createLinearGradient(0, groundY, 0, groundY + 70);
    roadGlow.addColorStop(0, 'rgba(255, 122, 61, 0.13)');
    roadGlow.addColorStop(1, 'rgba(255, 122, 61, 0)');
    g.fillStyle = roadGlow;
    g.fillRect(0, groundY, W, 70);
    this.skyCanvas = sky;

    // Reusable gradient objects (coordinates are in world units)
    const ctx = this.ctx;
    this.edgeGlow = ctx.createLinearGradient(0, -30, 0, 0);
    this.edgeGlow.addColorStop(0, hexA(MIST, 0));
    this.edgeGlow.addColorStop(1, hexA(MIST, 0.16));

    const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    vignette.addColorStop(0, 'rgba(0, 0, 10, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 10, 0.6)');
    this.vignette = vignette;

    const fogDefs = [
      { color: '#3A1030', alpha: 0.78, height: groundY * 0.8 },
      { color: '#241040', alpha: 0.5, height: groundY * 0.6 },
      { color: '#160A2C', alpha: 0.2, height: groundY * 0.35 },
    ];
    this.layers.forEach((layer, i) => {
      const def = fogDefs[i];
      const fog = ctx.createLinearGradient(0, groundY - def.height, 0, groundY);
      fog.addColorStop(0, hexA(def.color, 0));
      fog.addColorStop(1, hexA(def.color, def.alpha));
      layer.fog = fog;
      layer.fogTop = groundY - def.height;
    });
  }

  _seedStars() {
    const count = Math.round(clamp(this.W / 12, 50, 130));
    this.stars = Array.from({ length: count }, () => ({
      x: rand(0, this.W),
      y: rand(0, this.groundY * 0.8),
      size: rand(0.7, 1.9),
      phase: rand(0, TAU),
      twinkle: rand(0.8, 2.6),
      drift: rand(2, 8),
    }));
  }

  _seedSky() {
    const { W, groundY, moon } = this;
    this.skyActors.bats = Array.from({ length: 6 }, (_, i) => ({
      x: rand(0, W),
      y: moon.y + rand(-moon.r * 1.1, moon.r * 1.3),
      vx: rand(26, 62) * (i % 3 === 0 ? -1 : 1),
      phase: rand(0, TAU),
      size: rand(5, 9),
    }));
    this.skyActors.balloons = [
      { x: W * 0.22, y: groundY * 0.3, scale: 0.62, drift: 7, alpha: 0.7, hue: 0, phase: 0 },
      { x: W * 0.55, y: groundY * 0.18, scale: 0.4, drift: 4, alpha: 0.55, hue: 1, phase: 2 },
    ];
    this.skyActors.fog = Array.from({ length: 4 }, (_, i) => ({
      x: rand(-200, W),
      y: groundY - 30 - i * 62 - rand(0, 20),
      w: rand(520, 820),
      drift: rand(8, 20),
      alpha: 0.2 - i * 0.03,
    }));
    this.skyActors.plane = { x: -300, y: moon.y - moon.r * 0.4, timer: rand(6, 12), active: false };
  }

  // ============================
  // Town layers
  // ============================
  _layerScale(layer) {
    const k = this.dpr * this.sc;
    if (layer.kind === 'far') return Math.min(k, 1);
    if (layer.kind === 'mid') return Math.min(k, 1.5);
    return Math.min(k, 2);
  }

  _makeSpec(kind) {
    const gy = this.groundY;
    const r = Array.from({ length: 12 }, Math.random);
    if (kind === 'far') {
      const roll = Math.random();
      if (roll < 0.28) return { kind: 'castle', w: rand(260, 380), h: gy * rand(0.55, 0.72), gap: rand(0, 30), r };
      if (roll < 0.63) return { kind: 'spires', w: rand(70, 120), h: gy * rand(0.4, 0.62), gap: rand(-10, 30), r };
      return { kind: 'hill', w: rand(180, 300), h: gy * rand(0.16, 0.28), gap: rand(-30, 10), r };
    }
    if (kind === 'mid') {
      const w = Math.round(rand(64, 112));
      const roofH = Math.round(rand(24, 42));
      const bodyH = Math.round(gy * rand(0.2, 0.4));
      const cols = Math.max(1, Math.floor((w - 12) / 13));
      const rows = Math.max(1, Math.floor((bodyH - 14) / 16));
      const lit = new Uint8Array(cols * rows);
      for (let i = 0; i < lit.length; i++) {
        const roll = Math.random();
        lit[i] = roll < 0.55 ? 0 : (roll < 0.82 ? 1 : (roll < 0.95 ? 2 : 3));
      }
      const flicker = [];
      for (let i = 0; i < 3; i++) {
        flicker.push({
          c: Math.floor(rand(0, cols)),
          r: Math.floor(rand(0, rows)),
          color: pick([EMBER, '#FFD27A']),
          period: rand(3, 9),
          phase: rand(0, 9),
        });
      }
      return {
        kind: 'town', w, h: roofH + bodyH, roofH, roofKind: Math.random() < 0.55 ? 'crooked' : 'flat',
        skew: rand(-w * 0.15, w * 0.15), cols, rows, lit, flicker, chim: rand(w * 0.15, w * 0.7), gap: rand(0, 18), r,
      };
    }
    const roll = Math.random();
    if (roll < 0.35) return { kind: 'fence', w: rand(130, 220), h: rand(54, 72), gap: rand(20, 110), r, lamps: [] };
    if (roll < 0.55) {
      const w = rand(60, 80);
      const h = rand(130, 170);
      return {
        kind: 'lantern', w, h, gap: rand(60, 170), r,
        lamps: [{ ox: w * 0.85, oy: h * 0.18 + 15, phase: rand(0, 9) }],
      };
    }
    if (roll < 0.8) return { kind: 'graves', w: rand(100, 170), h: rand(50, 70), gap: rand(30, 120), r, lamps: [] };
    const w = rand(100, 150);
    const h = rand(150, 230);
    const branches = [];
    const grow = (x, y, angle, length, width, depth) => {
      const x2 = clamp(x + Math.cos(angle) * length, 4, w - 4);
      const y2 = Math.max(3, y + Math.sin(angle) * length);
      branches.push({ x1: x, y1: y, x2, y2, width });
      if (depth <= 0) return;
      grow(x2, y2, angle + rand(0.25, 0.8), length * rand(0.62, 0.8), width * 0.68, depth - 1);
      grow(x2, y2, angle - rand(0.25, 0.8), length * rand(0.62, 0.8), width * 0.68, depth - 1);
    };
    grow(w / 2, h, -Math.PI / 2 + rand(-0.1, 0.1), h * 0.34, 7, 4);
    return { kind: 'tree', w, h, gap: rand(50, 150), r, branches, lamps: [] };
  }

  _renderSpec(layer, spec) {
    const scale = this._layerScale(layer);
    if (layer.kind === 'far') return renderFar(spec, scale);
    if (layer.kind === 'mid') return renderMid(spec, scale);
    return renderNear(spec, scale);
  }

  _newBuilding(layer, x) {
    const spec = this._makeSpec(layer.kind);
    return { x, spec, w: spec.w, totalH: spec.h, canvas: this._renderSpec(layer, spec) };
  }

  _fillLayers() {
    this.layers.forEach((layer) => {
      layer.scale = this._layerScale(layer);
      const last = layer.items[layer.items.length - 1];
      let x = last ? last.x + last.w + last.spec.gap : -80;
      while (x < this.W + 240) {
        const b = this._newBuilding(layer, x);
        layer.items.push(b);
        x += b.w + b.spec.gap;
      }
    });
  }

  _rebuildSprites() {
    this.layers.forEach((layer) => {
      layer.scale = this._layerScale(layer);
      layer.items.forEach((b) => {
        b.canvas = this._renderSpec(layer, b.spec);
      });
    });
  }

  _scrollLayers(dt) {
    const parallax = this.reduced ? 0.35 : 1;
    this.layers.forEach((layer) => {
      const dx = this.speed * layer.factor * parallax * dt;
      layer.items.forEach((b) => { b.x -= dx; });
      while (layer.items.length && layer.items[0].x + layer.items[0].w < -80) {
        layer.items.shift();
      }
      const last = layer.items[layer.items.length - 1];
      let x = last ? last.x + last.w + last.spec.gap : -80;
      while (x < this.W + 240) {
        const b = this._newBuilding(layer, x);
        layer.items.push(b);
        x += b.w + b.spec.gap;
      }
    });
  }

  // ============================
  // Input
  // ============================
  _bindInput() {
    this._bindResize();
    const isJumpKey = (e) => e.code === 'Space' || e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';

    window.addEventListener('keydown', (e) => {
      if (isJumpKey(e)) {
        e.preventDefault();
        if (e.repeat) return;
        this._pressJump(true);
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        e.preventDefault();
        this._togglePause();
      } else if (e.key === 'm' || e.key === 'M') {
        this._toggleMute();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (isJumpKey(e)) {
        e.preventDefault();
        this._setHolding(false);
      }
    });

    window.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, a')) return;
      e.preventDefault();
      this.activePointers.add(e.pointerId);
      this._pressJump(false);
    });
    const release = (e) => {
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size === 0) this._setHolding(false);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', () => {
      this._setHolding(false);
      this.activePointers.clear();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'PLAYING') this._setPaused(true);
    });
  }

  _bindUi() {
    const click = (id, handler) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        el.blur();
        handler();
      });
    };
    click('btn-start', () => this._startGame());
    click('btn-retry', () => this._startGame());
    click('btn-resume', () => this._setPaused(false));
    click('btn-pause', () => this._togglePause());
    click('btn-mute', () => this._toggleMute());
    this._renderMute();
  }

  _pressJump(fromKeyboard) {
    if (this.state === 'START') {
      this._startGame();
      return;
    }
    if (this.state === 'GAMEOVER') {
      if (performance.now() >= this.overAllowedAt) this._startGame();
      return;
    }
    if (this.state === 'PAUSED') {
      if (fromKeyboard) this._setPaused(false);
      return;
    }
    this._setHolding(true);
    this._jumpSwarm();
  }

  _toggleMute() {
    this.sfx.setMuted(!this.sfx.muted);
    this._renderMute();
  }

  _renderMute() {
    const btn = this.dom.mute;
    if (!btn) return;
    btn.classList.toggle('is-muted', this.sfx.muted);
    btn.setAttribute('aria-pressed', String(this.sfx.muted));
    btn.setAttribute('aria-label', this.sfx.muted ? 'Sound off' : 'Sound on');
  }

  _togglePause() {
    if (this.state === 'PLAYING') this._setPaused(true);
    else if (this.state === 'PAUSED') this._setPaused(false);
  }

  _setPaused(paused) {
    if (paused && this.state === 'PLAYING') {
      this.state = 'PAUSED';
      this._setHolding(false);
    } else if (!paused && this.state === 'PAUSED') {
      this.state = 'PLAYING';
      this.lastFrame = 0;
    } else {
      return;
    }
    this._setBodyState();
  }

  // ============================
  // State changes
  // ============================
  _makeBot(index) {
    return {
      x: this.leaderX - index * 20,
      hy: 0,
      vy: 0,
      grounded: true,
      floorOff: LANE_FLOOR[1],
      sx: 1,
      sy: 1,
      run: rand(0, TAU),
      tip: rand(0, TAU),
      flash: 0,
      born: 0.28,
      queue: [],
      followDelay: 0,
      holdT: 0,
      launchH: 0,
      fledgling: false,
      matureAt: 0,
      catchUp: false,
      blocked: false,
    };
  }

  _resetWorld() {
    this.terrain = [];
    this.crates = [];
    this.mines = [];
    this.gates = [];
    this.coffins = [];
    this.cages = [];
    this.nodes = [];
    this.powerUps = [];
    this.obstacles = [];
    this.villagers = [];
    this.vehicles = [];
    this.guards = [];
    this.decks = [];
    this.level = 0;
    this.terrainEnd = -900;
    this._addSeg('flat', this.W + 900 + 420, 0, 0, 'street');
    this.lastChunk = 'flat';
    this.forceNext = null;
  }

  _enterAttract() {
    this.state = 'START';
    this.leaderXTarget = this._targetLeaderX();
    this.leaderX = this.leaderXTarget;
    this.speed = ATTRACT_SPEED;
    this.bots = Array.from({ length: 5 }, (_, i) => this._makeBot(i));
    this.bots.forEach((bot, i) => {
      const slot = this._slot(i, 5);
      bot.born = 0;
      bot.x = slot.x;
      bot.floorOff = LANE_FLOOR[slot.lane];
    });
    this._setBodyState();
  }

  _startGame() {
    clearTimeout(this.overTimer);
    this.score = 0;
    this.distance = 0;
    this.runTime = 0;
    this.speed = BASE_SPEED;
    this.maxSwarm = 1;
    this.combo = 1;
    this.streak = 0;
    this.vialCount = 0;
    this.nextMilestone = MILESTONE_STEP;
    this.shake = 0;
    this.flash = 0;
    this.packTimer = 0;
    this.lastGateD = -300;
    this.lastPowerD = 0;
    this.ghosts = [];
    this.pending = [];
    this.pu = { shield: 0, magnet: 0, x2: 0 };
    this.lastLoss = 'destroyed';
    this.particles.forEach((p) => { p.active = false; });
    this.floatTexts.forEach((f) => { f.active = false; });
    this._resetWorld();
    this.forceNext = 'villagers';
    this.leaderXTarget = this._targetLeaderX();
    // Coming from a push-back, the anchor may be far left: start from the normal spot
    if (this.leaderX < this.leaderXTarget * 0.9) this.leaderX = this.leaderXTarget;
    this.bots = [];
    this._addMember({ x: this.leaderX, born: 0.28 });
    this.holdHistory = [];
    this.holding = false;
    this._setHolding(this.activePointers.size > 0);
    this.state = 'PLAYING';
    this._setBodyState();
    this._syncHud(true);
    this.sfx.power();
  }

  _gameOver(reason) {
    if (this.state === 'GAMEOVER') return;
    this.state = 'GAMEOVER';
    this.overReason = reason;
    this._setHolding(false);
    this.overAllowedAt = performance.now() + 700;
    this.shake = this.reduced ? 0 : 14;
    this.flash = 0.45;

    const isRecord = this.score > this.highScore && this.score > 0;
    if (isRecord) {
      this.highScore = Math.floor(this.score);
      writeStorage(STORAGE_BEST, String(this.highScore));
    }
    const d = this.dom;
    if (d.goScore) d.goScore.textContent = Math.floor(this.score).toLocaleString('en-US');
    if (d.goDist) d.goDist.textContent = `${Math.floor(this.distance)} m`;
    if (d.goSwarm) d.goSwarm.textContent = String(this.maxSwarm);
    if (d.goBest) d.goBest.textContent = this.highScore.toLocaleString('en-US');
    if (d.goRecord) d.goRecord.hidden = !isRecord;
    if (d.goReason) d.goReason.textContent = REASONS[reason] || REASONS.destroyed;
    this._syncHud(true);
    this._setBodyState();
    this.overTimer = setTimeout(() => {
      if (this.state === 'GAMEOVER') d.over?.classList.add('active');
    }, 650);
  }

  // ============================
  // Horde
  // ============================
  _lead() {
    return this.bots.find((bot) => !bot.catchUp) || this.bots[0];
  }

  _slot(index, count) {
    if (index === 0) return { x: this.leaderX, lane: 1, col: 0 };
    const k = index - 1;
    const col = 1 + Math.floor(k / 3);
    const lane = [0, 2, 1][k % 3];
    const maxCol = 1 + Math.floor(Math.max(0, count - 2) / 3);
    const spacing = this.packTimer > 0 ? PACK_SPACING : clamp((this.leaderX - 30) / maxCol, 13, 25);
    const stagger = lane === 1 ? 0 : spacing * 0.5;
    return { x: this.leaderX - col * spacing + stagger, lane, col };
  }

  _jumpSwarm() {
    const lead = this._lead();
    if (!lead) return;
    this.lastPressAt = this.t;
    this.bots.forEach((bot) => {
      if (bot.catchUp) return;
      // Each member jumps when it reaches the spot where the leader jumped: a wave
      // that stays fair at every speed. Fledglings react a little later.
      const delay = clamp(Math.max(0, lead.x - bot.x) / Math.max(this.speed, 1), 0, 1.2) + (bot.fledgling ? 0.07 : 0);
      // A queue, so a quick second tap never cancels a jump the back of the horde has not made yet
      bot.queue.push({ at: this.t + delay, until: this.t + delay + 0.14, delay });
      if (bot.queue.length > 4) bot.queue.shift();
    });
    this.sfx.jump();
  }

  _launch(bot) {
    bot.vy = bot.fledgling ? JUMP_SPEED * 0.86 : JUMP_SPEED;
    bot.grounded = false;
    bot.holdT = 0;
    bot.launchH = bot.hy;
    bot.sy = 0.78;
    if (this.state !== 'PLAYING') bot.followDelay = 0;
  }

  _addMember(opts = {}) {
    if (this.bots.length >= MAX_SWARM) return false;
    const bot = this._makeBot(this.bots.length);
    const last = this.bots[this.bots.length - 1];
    // New members join at the back of the horde (arrivals run in from the left edge)
    bot.x = opts.catchUp ? opts.x : (last ? last.x - 24 : (opts.x !== undefined ? opts.x : this.leaderX));
    const ground = this._groundAt(bot.x);
    bot.hy = ground !== null ? ground : 0;
    bot.fledgling = Boolean(opts.fledgling);
    if (bot.fledgling) bot.matureAt = this.distance + 100;
    bot.catchUp = Boolean(opts.catchUp);
    bot.flash = 0.35;
    bot.born = opts.born !== undefined ? opts.born : 0.28;
    // A joiner mid-wave follows the jump the others are doing, so it never misses a pit
    const lead = this._lead();
    if (lead && !bot.catchUp && this.state === 'PLAYING') {
      const delay = Math.max(0, lead.x - bot.x) / Math.max(this.speed, 1) + (bot.fledgling ? 0.07 : 0);
      const remaining = delay - (this.t - this.lastPressAt);
      // Late joiners jump at once (the hazard is closer than planned); early ones wait their turn
      if (this.t - this.lastPressAt < 1.4) {
        const at = this.t + Math.max(0, remaining);
        bot.queue.push({ at, until: at + 0.25, delay });
      }
    }
    this.bots.push(bot);
    this.maxSwarm = Math.max(this.maxSwarm, this.bots.length);
    return true;
  }

  _mature(bot) {
    bot.fledgling = false;
    bot.flash = 0.45;
    bot.born = 0.28;
    const y = this._botScreenY(bot) - 20;
    this._burst(bot.x, y, BLOOD, 12, 0.9);
    this._burst(bot.x, y, BONE, 6, 0.7);
    this._ring(bot.x, y, EMBER, 56, 0.45);
    this._floatText(bot.x, y - 24, '+1 MATURED', EMBER);
    this.sfx.rise();
  }

  _botScreenY(bot) {
    return this.groundY + bot.floorOff - bot.hy;
  }

  _blockLimit(bot) {
    let limit = null;
    let crate = null;
    const front = bot.x + 11;
    for (const seg of this.terrain) {
      if (seg.type === 'pit') continue;
      if (seg.x > bot.x - 11 && seg.x < front + 3 && seg.h0 - bot.hy > STEP_UP) {
        const candidate = seg.x - 11;
        if (limit === null || candidate < limit) limit = candidate;
      }
    }
    for (const c of this.crates) {
      if (c.dead) continue;
      if (front > c.x - 1 && bot.x - 11 < c.x + c.w && bot.hy < c.base + c.h - 4) {
        const candidate = c.x - 11;
        if (limit === null || candidate < limit) {
          limit = candidate;
          crate = c;
        }
      }
    }
    return limit === null ? null : { x: limit, crate };
  }

  _updateBots(dt, running) {
    const bots = this.bots;
    const count = bots.length;
    const lead = this._lead();
    if (this.packTimer > 0) this.packTimer -= dt;
    const recover = this.state === 'PLAYING' ? 1.4 : 3;
    this.leaderX += (this.leaderXTarget - this.leaderX) * ease(recover, dt);
    const follow = ease(10, dt);
    let leadBlocked = false;
    let blockerCrate = null;
    const fallen = [];

    for (let i = 0; i < bots.length; i++) {
      const bot = bots[i];
      const slot = this._slot(i, count);
      if (bot.catchUp) {
        bot.x += Math.min(520 * dt, Math.max(0, slot.x - bot.x));
        if (slot.x - bot.x < 8) bot.catchUp = false;
      } else {
        bot.x += (slot.x - bot.x) * follow;
      }
      bot.floorOff += (LANE_FLOOR[slot.lane] - bot.floorOff) * follow;
      if (bot.born > 0) bot.born = Math.max(0, bot.born - dt);
      if (bot.flash > 0) bot.flash = Math.max(0, bot.flash - dt);
      bot.tip += dt * 5;
      if (running) bot.run += dt * (9 + this.speed * 0.022);

      // Ledges and crates are walls: bump instead of climbing
      bot.blocked = false;
      const limit = this._blockLimit(bot);
      if (limit && bot.x > limit.x) {
        bot.x = limit.x;
        bot.blocked = true;
        if (bot === lead) {
          leadBlocked = true;
          blockerCrate = limit.crate;
        }
      }

      // Arrivals running in hop over any chasm on the way
      if (bot.catchUp && bot.grounded && this._groundAt(bot.x + 40, bot.hy) === null) {
        this._launch(bot);
        bot.followDelay = 0;
      }

      // Queued jumps: the wave effect comes from the per-member delay
      while (bot.queue.length && this.t > bot.queue[0].until) bot.queue.shift();
      if (bot.queue.length && this.t >= bot.queue[0].at && bot.grounded && !bot.catchUp) {
        const entry = bot.queue.shift();
        bot.followDelay = entry.delay;
        this._launch(bot);
      }

      // Follow the ground surface
      let ground = this._groundAt(bot.x, bot.hy);
      if (bot.grounded) {
        if (ground === null || bot.hy - ground > SNAP_DOWN) {
          bot.grounded = false;
          bot.vy = 0;
          bot.holdT = HOLD_MAX_TIME;
          bot.launchH = bot.hy;
        } else {
          bot.hy = ground;
        }
      }
      if (!bot.grounded) {
        let gravity = GRAVITY;
        if (bot.vy > 0 && bot.holdT < HOLD_MAX_TIME && this._holdingAt(this.t - bot.followDelay)) {
          gravity *= HOLD_GRAVITY_SCALE;
          bot.holdT += dt;
        }
        const previousHeight = bot.hy;
        bot.vy -= gravity * dt;
        bot.hy += bot.vy * dt;
        ground = this._groundAt(bot.x, previousHeight);
        if (ground !== null && bot.vy <= 0 && bot.hy <= ground) {
          const impact = -bot.vy;
          const drop = bot.launchH - ground;
          bot.hy = ground;
          bot.vy = 0;
          bot.grounded = true;
          bot.sy = 0.7;
          if (bot === lead && drop > 60 && !this.reduced) {
            this.shake = Math.max(this.shake, 4 + Math.min(5, (drop - 60) * 0.04));
          }
          if (i < 6 && impact > 250) this._emitDust(bot.x, this.groundY + bot.floorOff - ground, running);
        } else if (bot.hy < -(this.H - this.groundY) - 80) {
          fallen.push(bot);
        }
      }

      // Squash and stretch spring
      const stretch = bot.grounded ? 1 : 1 + Math.min(0.22, Math.abs(bot.vy) / 2600);
      bot.sy += (stretch - bot.sy) * ease(16, dt);
      bot.sx = 1 + (1 - bot.sy) * 0.85;
    }

    if (leadBlocked) {
      this.packTimer = 0.35;
      this.leaderX = Math.min(this.leaderX, lead.x);
    }
    if (blockerCrate) this._pushCrate(blockerCrate, lead, count);
    fallen.forEach((bot) => this._loseFallen(bot));
  }

  _pushCrate(crate, lead, count) {
    let contact = 0;
    this.bots.forEach((bot, index) => {
      // Only adults push; fledglings are too small to count
      if (bot.fledgling || !bot.grounded || bot.catchUp) return;
      const col = this._slot(index, count).col;
      if (bot.x >= lead.x - col * PACK_SPACING - 22) contact++;
    });
    crate.contact = contact;
    crate.pressUntil = this.t + 0.25;
    if (contact >= crate.n) this._breakCrate(crate);
  }

  _breakCrate(crate) {
    crate.dead = true;
    const cx = crate.x + crate.w / 2;
    const cy = this.groundY - crate.base - crate.h / 2;
    this._burst(cx, cy, '#8A5A3A', 18, 1.1);
    this._burst(cx, cy, BONE, 8, 0.8);
    this._burst(cx, cy, '#5A5A72', 8, 0.9);
    this._ring(cx, cy, EMBER, 90, 0.5);
    const bonus = (100 + crate.n * 25) * (this.pu.x2 > 0 ? 2 : 1);
    this.score += bonus;
    this._floatText(cx, cy - crate.h / 2 - 10, `CRATE BROKEN +${bonus}`, EMBER);
    this.shake = this.reduced ? 0 : Math.max(this.shake, 6);
    this.packTimer = 0;
    this.sfx.smash();
  }

  _loseFallen(bot) {
    const index = this.bots.indexOf(bot);
    if (index < 0) return;
    this.bots.splice(index, 1);
    this.lastLoss = 'void';
    this.streak = 0;
    this.combo = 1;
    const y = this.H - 40;
    for (let i = 0; i < 4; i++) {
      this._emit({
        type: 3, x: bot.x + rand(-8, 8), y, vx: rand(-60, 60), vy: rand(-240, -120),
        life: rand(0.8, 1.2), size: rand(6, 9), color: '#CFC3E8', phase: rand(0, TAU),
      });
    }
    this._burst(bot.x, y, BLOOD, 6, 0.6);
    this.sfx.fall();
  }

  _destroyBot(bot, style) {
    const index = this.bots.indexOf(bot);
    if (index < 0) return;
    this.bots.splice(index, 1);
    this.lastLoss = 'destroyed';
    this.streak = 0;
    this.combo = 1;
    this._puff(bot.x, this._botScreenY(bot) - 18, style);
    this.shake = this.reduced ? 0 : Math.max(this.shake, 8);
    this.flash = Math.max(this.flash, 0.25);
    if (style === 'steam') this.sfx.hiss();
    else this.sfx.hit();
  }

  /** A lost vampire bursts into a puff of bats and dust. */
  _puff(x, y, style) {
    const steam = style === 'steam';
    for (let i = 0; i < 5; i++) {
      this._emit({
        type: 3, x, y, vx: rand(-150, 150), vy: rand(-240, -70),
        life: rand(0.8, 1.2), size: rand(7, 10), color: '#CFC3E8', phase: rand(0, TAU),
      });
    }
    for (let i = 0; i < 9; i++) {
      this._emit({
        type: 4, x: x + rand(-8, 8), y: y + rand(-10, 10), vx: rand(-60, 60), vy: rand(-60, 20),
        life: rand(0.5, 0.9), size: rand(7, 13), grow: steam ? 28 : 16,
        color: steam ? '#DFFFEA' : '#6A5A8A',
      });
    }
    if (style === 'burn') this._burst(x, y, EMBER, 10, 0.8);
    else this._burst(x, y, steam ? HOLY : BLOOD, 8, 0.7);
  }

  _emitDust(x, y, running) {
    for (let i = 0; i < 4; i++) {
      this._emit({
        type: 0, x: x + rand(-6, 6), y: y - 1,
        vx: rand(-60, 20) - (running ? this.speed * 0.3 : 0), vy: rand(-90, -20),
        life: rand(0.25, 0.45), size: rand(1.5, 3), color: '#B7A8C8', gravity: 200,
      });
    }
  }

  // ============================
  // Particles / floating text
  // ============================
  _emit(o) {
    const pool = this.particles;
    for (let n = 0; n < pool.length; n++) {
      const idx = (this.particleCursor + n) % pool.length;
      const p = pool[idx];
      if (!p.active) {
        this.particleCursor = (idx + 1) % pool.length;
        p.active = true;
        p.type = o.type;
        p.x = o.x;
        p.y = o.y;
        p.vx = o.vx || 0;
        p.vy = o.vy || 0;
        p.life = o.life;
        p.max = o.life;
        p.size = o.size || 2;
        p.color = o.color;
        p.gravity = o.gravity || 0;
        p.grow = o.grow || 0;
        p.phase = o.phase || 0;
        return;
      }
    }
  }

  _burst(x, y, color, count, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const s = rand(80, 300) * power;
      this._emit({
        type: 0, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
        life: rand(0.3, 0.7), size: rand(1.5, 3.4), color, gravity: 520,
      });
    }
  }

  _ring(x, y, color, radius = 46, life = 0.45) {
    this._emit({ type: 1, x, y, life, size: 6, color, grow: radius / life });
  }

  _floatText(x, y, text, color) {
    const slot = this.floatTexts.find((f) => !f.active) || this.floatTexts[0];
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.text = text;
    slot.color = color;
    slot.life = 1.1;
  }

  _updateParticles(dt) {
    this.particles.forEach((p) => {
      if (!p.active) return;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        return;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.phase += dt * 14;
    });
    this.floatTexts.forEach((f) => {
      if (!f.active) return;
      f.life -= dt;
      f.y -= 48 * dt;
      if (f.life <= 0) f.active = false;
    });
  }

  // ============================
  // Terrain
  // ============================
  _addSeg(type, w, h0, h1 = h0, style = 'street') {
    const seg = { type, x: this.terrainEnd, w, h0, h1, style };
    this.terrain.push(seg);
    this.terrainEnd += w;
    return seg;
  }

  _segHeight(seg, x) {
    if (seg.type === 'pit') return null;
    if (seg.type === 'slope') return seg.h0 + (seg.h1 - seg.h0) * clamp((x - seg.x) / seg.w, 0, 1);
    return seg.h0;
  }

  /** Surface height (above the street line) under x, or null over a chasm. */
  _groundAt(x, hy = -Infinity) {
    let height = null;
    let found = false;
    for (const seg of this.terrain) {
      if (x >= seg.x && x < seg.x + seg.w) {
        height = this._segHeight(seg, x);
        found = true;
        break;
      }
    }
    if (!found && this.terrain.length) {
      height = x < this.terrain[0].x ? this.terrain[0].h0 : this.terrain[this.terrain.length - 1].h1;
    }
    for (const c of this.crates) {
      if (c.dead || x < c.x - 2 || x > c.x + c.w + 2) continue;
      const top = c.base + c.h;
      if (height === null || top > height) height = top;
    }
    for (const d of this.decks) {
      if (x < d.x || x > d.x + d.w || hy < d.top - 10) continue;
      if (height === null || d.top > height) height = d.top;
    }
    return height;
  }

  _levelStyle() {
    return this.level > 8 ? 'hill' : 'street';
  }

  // ============================
  // Spawning director
  // ============================
  /** Pit width: always well inside a full hold jump (0.917 * speed) at the speed it will be met. */
  _pitWidth(arrivalSpeed) {
    return clamp(
      arrivalSpeed * rand(PIT_WIDTH_FACTOR[0], PIT_WIDTH_FACTOR[1]),
      PIT_MIN_WIDTH,
      arrivalSpeed * PIT_WIDTH_FACTOR[1],
    );
  }

  /** Crate strength: grows with distance, follows the adult count, sometimes sits above it. */
  _crateN() {
    const adults = this.adultCount();
    const distanceFloor = 2 + Math.floor(this.distance / 90);
    const factor = Math.random() < 0.7 ? rand(0.5, 0.9) : rand(1.15, 1.6);
    return clamp(Math.max(distanceFloor, Math.round(adults * factor)), 2, 28);
  }

  _gateN() {
    const adults = this.adultCount();
    return clamp(Math.round(adults * rand(0.5, 0.85) + this.distance / 160), 2, 26);
  }

  _chooseChunk() {
    if (this.forceNext) {
      const forced = this.forceNext;
      this.forceNext = null;
      return forced;
    }
    const d = this.distance;
    const diff = clamp(d / 1500, 0, 1);
    const last = this.lastChunk;
    const landing = last === 'pit' || last === 'balloon' || last === 'steps';
    const noPit = last === 'pit' || last === 'balloon' || last === 'crate' || last === 'guard';
    const members = this.bots.length;
    const options = [
      ['flat', 1.6 - 0.6 * diff],
      ['slope', 1.3],
      ['steps', d > 40 ? 1.2 + 0.7 * diff : 0],
      ['pit', d > 70 && !noPit ? 1 + 1.3 * diff : 0],
      ['balloon', d > 250 && !noPit ? 0.45 + 0.4 * diff : 0],
      ['crate', d > 50 && last !== 'pit' && last !== 'balloon' ? 1.1 + 0.9 * diff : 0],
      ['mines', d > 120 && !landing ? 0.9 + 1.1 * diff : 0],
      ['barricade', 1.3],
      ['guard', d > 90 && !landing ? 0.8 + 0.9 * diff : 0],
      ['villagers', members < 8 ? 2 : (members > 20 ? 0.5 : 1)],
      ['vehicles', d > 150 && !landing && last !== 'crate' && last !== 'gate' ? 1 : 0],
      ['recruit', 0.5],
      ['gate', d >= 300 && d - this.lastGateD >= GATE_MIN_GAP_M && !landing ? 1.1 : 0],
      ['power', d - this.lastPowerD >= 140 ? 0.8 : 0],
    ];
    const total = options.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = Math.random() * total;
    for (const [type, weight] of options) {
      roll -= weight;
      if (roll <= 0 && weight > 0) return type;
    }
    return 'flat';
  }

  _spawnChunk() {
    const type = this._chooseChunk();
    const handlers = {
      flat: () => this._chunkFlat(),
      slope: () => this._chunkSlope(),
      steps: () => this._chunkSteps(),
      pit: () => this._chunkPit(false),
      balloon: () => this._chunkPit(true),
      crate: () => this._chunkCrate(),
      mines: () => this._chunkMines(),
      barricade: () => this._chunkBarricade(),
      guard: () => this._chunkGuard(),
      villagers: () => this._chunkVillagers(),
      vehicles: () => this._chunkVehicles(),
      recruit: () => this._chunkRecruit(),
      gate: () => this._chunkGate(),
      power: () => this._chunkPower(),
    };
    (handlers[type] || handlers.flat)();
    this.lastChunk = type;
  }

  _vial(x, dy) {
    this.nodes.push({ x, dy, phase: rand(0, TAU) });
  }

  _vialArc(cx, baseDy, count = 5, spacing = 38, bump = 18) {
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) : 0;
      this._vial(cx + (i - (count - 1) / 2) * spacing, baseDy + Math.sin(t * Math.PI) * bump);
    }
  }

  _chunkFlat() {
    const lvl = this.level;
    const x0 = this.terrainEnd;
    this._addSeg('flat', rand(460, 760), lvl, lvl, this._levelStyle());
    const count = Math.floor(rand(4, 8));
    const wave = Math.random() < 0.5;
    for (let i = 0; i < count; i++) this._vial(x0 + 80 + i * 46, lvl + (wave ? 30 + Math.sin(i * 0.9) * 22 : 16));
  }

  _chunkSlope() {
    const lvl = this.level;
    let target = clamp(lvl + (Math.random() < 0.5 ? -1 : 1) * rand(28, 64), 0, LEVEL_MAX);
    if (Math.abs(target - lvl) < 20) target = lvl < LEVEL_MAX / 2 ? lvl + 40 : lvl - 40;
    const seg = this._addSeg('slope', rand(320, 480), lvl, target, 'hill');
    for (let x = seg.x + 70; x < seg.x + seg.w - 40; x += 52) {
      this._vial(x, this._segHeight(seg, x) + 26);
    }
    this.level = target;
    this._addSeg('flat', 180, target, target, this._levelStyle());
  }

  _chunkSteps() {
    const lvl = this.level;
    const d = this.distance;
    const style = this._levelStyle();
    this._addSeg('flat', Math.max(180, this.speed * 0.7), lvl, lvl, style);
    const twoTier = d > 250 && Math.random() < 0.35;
    const tiers = twoTier ? [BOT_H, BOT_H * 2] : [Math.random() < 0.5 ? BOT_H : BOT_H * 2];
    const withMine = !twoTier && d > 150 && Math.random() < 0.35;
    tiers.forEach((rise, i) => {
      const last = i === tiers.length - 1;
      const w = last ? (withMine ? 340 : Math.max(230, this.speed * 0.8)) : Math.max(170, this.speed * 0.75);
      const seg = this._addSeg('flat', w, lvl + rise, lvl + rise, 'stone');
      for (let k = 0; k < 3; k++) this._vial(seg.x + w * 0.3 + k * 44, lvl + rise + 26);
      if (withMine && last) this.mines.push({ x: seg.x + w * 0.62, base: lvl + rise, dead: false, phase: rand(0, TAU) });
    });
    this._addSeg('flat', Math.max(240, this.speed * 0.6), lvl, lvl, style);
  }

  _chunkPit(withBalloon) {
    const lvl = this.level;
    const arrival = Math.min(MAX_SPEED, this.speed + 30);
    // Short bridge run-up so the jump can be timed
    this._addSeg('flat', Math.max(240, arrival * 0.9), lvl, lvl, 'bridge');
    if (withBalloon) {
      // Two hops with a floating balloon basket in the middle: each gap is a normal pit gap
      const deckW = 140;
      const gapA = Math.max(60, arrival * 0.3);
      const width = gapA * 2 + deckW;
      const pit = this._addSeg('pit', width, lvl, lvl, 'street');
      this.decks.push({ x: pit.x + gapA, w: deckW, top: lvl + 48, base: lvl, phase: rand(0, TAU) });
      this._vialArc(pit.x + width / 2, lvl + 96, 3, 40, 14);
    } else {
      const pit = this._addSeg('pit', this._pitWidth(arrival), lvl, lvl, 'street');
      this._vialArc(pit.x + pit.w / 2, lvl + 70, 5, Math.min(40, pit.w / 4), 40);
    }
    this._addSeg('flat', Math.max(280, arrival * 0.6), lvl, lvl, 'bridge');
  }

  _chunkCrate() {
    const lvl = this.level;
    const n = this._crateN();
    const h = n <= 4 ? BOT_H : (n <= 9 ? 62 : 88);
    const w = clamp(h * 0.9 + 12, 46, 92);
    const runup = Math.max(260, this.speed * 0.9);
    const seg = this._addSeg('flat', runup + w + 320, lvl, lvl, this._levelStyle());
    const crate = {
      x: seg.x + runup, w, h, base: lvl, n, dead: false, contact: 0, pressUntil: 0,
      variant: h >= 62 ? 'stack' : 'cart',
    };
    this.crates.push(crate);
    this._vialArc(crate.x + w / 2, lvl + h + 24, 5, 38, 16);
  }

  _chunkMines() {
    const lvl = this.level;
    const runup = Math.max(240, this.speed * 0.8);
    const groups = 1 + Math.floor(Math.random() * 3);
    const groupGap = Math.max(this.speed * 1.2, 280);
    const length = runup + (groups - 1) * groupGap + 120 + 200;
    const seg = this._addSeg('flat', length, lvl, lvl, this._levelStyle());
    for (let g = 0; g < groups; g++) {
      const gx = seg.x + runup + g * groupGap;
      const count = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) this.mines.push({ x: gx + i * 36, base: lvl, dead: false, phase: rand(0, TAU) });
      this._vialArc(gx + ((count - 1) * 36) / 2, lvl + 56, 3, 36, 14);
    }
  }

  _makeObstacle(x, base) {
    const kind = Math.random();
    let w;
    let h;
    if (kind < 0.26) {
      h = rand(92, 122);
      w = rand(26, 40);
    } else if (kind < 0.4) {
      h = rand(36, 60);
      w = rand(70, 95);
    } else {
      h = rand(38, 76);
      w = rand(28, 62);
    }
    return { x, w, h, base, damage: h > 62 || w > 50 ? 2 : 1, hits: 0, cooldown: 0, phase: rand(0, 6) };
  }

  _chunkBarricade() {
    const lvl = this.level;
    const runup = Math.max(240, this.speed * 0.8);
    const x0 = this.terrainEnd;
    const obstacle = this._makeObstacle(x0 + runup, lvl);
    const tail = obstacle.w + 120 + this.speed * rand(1.05, 1.6);
    this._addSeg('flat', runup + tail, lvl, lvl, this._levelStyle());
    this.obstacles.push(obstacle);
    this._vialArc(obstacle.x + obstacle.w / 2, lvl + obstacle.h + 24, 5, 38, 18);
  }

  _chunkGuard() {
    const lvl = this.level;
    const runup = Math.max(260, this.speed * 0.9);
    const count = this.distance > 400 && Math.random() < 0.4 ? 2 : 1;
    const gap = Math.max(this.speed * 1.2, 260);
    const seg = this._addSeg('flat', runup + (count - 1) * gap + 330, lvl, lvl, this._levelStyle());
    for (let i = 0; i < count; i++) {
      const gx = seg.x + runup + i * gap;
      this.guards.push({ x: gx, base: lvl, phase: rand(0, TAU), cd: 0, dead: false });
      this._vialArc(gx, lvl + 84, 4, 34, 14);
    }
  }

  _makeVillager(x, base) {
    return {
      x, base, flee: false, turn: 0, dead: false, phase: rand(0, TAU),
      kind: pick(['tunic', 'dress', 'hood']),
      color: pick(['#8A5A3A', '#6B7A3A', '#B58A2E', '#4D6A8A', '#7A4A6A']),
      skin: pick(['#F0D2B0', '#E2B88F', '#C99872']),
      hat: pick(['none', 'cap', 'straw']),
      basket: Math.random() < 0.5,
    };
  }

  _chunkVillagers() {
    const lvl = this.level;
    const count = 1 + Math.floor(Math.random() * 2);
    const seg = this._addSeg('flat', 160 + count * 130 + 260, lvl, lvl, this._levelStyle());
    let x = seg.x + 190;
    for (let i = 0; i < count; i++) {
      this.villagers.push(this._makeVillager(x, lvl));
      x += rand(90, 150);
    }
    if (Math.random() < 0.5) this._vialArc(seg.x + 160 + count * 130, lvl + 34, 3, 40, 10);
  }

  _chunkVehicles() {
    const lvl = this.level;
    const seg = this._addSeg('flat', 1000, lvl, lvl, this._levelStyle());
    const roll = Math.random();
    const kind = roll < 0.4 ? 'bike' : (roll < 0.78 || this.distance < 300 ? 'carriage' : 'auto');
    const spec = {
      bike: { w: 56, h: 54, vx: 230, passengers: 1, wr: 14 },
      carriage: { w: 124, h: 66, vx: 150, passengers: 2 + Math.floor(Math.random() * 2), wr: 20 },
      auto: { w: 100, h: 48, vx: 320, passengers: 2, wr: 12 },
    }[kind];
    this.vehicles.push({
      kind, x: seg.x + 960, base: lvl, bitten: false, wheel: 0, fade: 0, dead: false, phase: rand(0, TAU), ...spec,
    });
  }

  _chunkRecruit() {
    const lvl = this.level;
    const count = 1 + Math.floor(Math.random() * 2);
    const seg = this._addSeg('flat', 520, lvl, lvl, this._levelStyle());
    for (let i = 0; i < count; i++) {
      const x = seg.x + 180 + i * rand(140, 190);
      if (Math.random() < 0.65) {
        this.coffins.push({
          x, base: lvl, big: this.distance > 200 && Math.random() < 0.15, dead: false, phase: rand(0, TAU), tilt: rand(-0.12, 0.12),
        });
      } else {
        this.cages.push({ x, dy: lvl + rand(78, 104), dead: false, phase: rand(0, TAU) });
      }
    }
  }

  _chunkGate() {
    const lvl = this.level;
    const runup = Math.max(380, this.speed * 1.3);
    const seg = this._addSeg('flat', runup + 34 + 300, lvl, lvl, this._levelStyle());
    this.gates.push({ x: seg.x + runup, w: 34, base: lvl, n: this._gateN(), dead: false });
    this.lastGateD = this.distance;
  }

  _chunkPower() {
    const lvl = this.level;
    const seg = this._addSeg('flat', 420, lvl, lvl, this._levelStyle());
    this.powerUps.push({ type: pick(POWERUP_KEYS), x: seg.x + 160, dy: lvl + rand(70, 95), phase: rand(0, TAU) });
    for (let i = 0; i < 3; i++) this._vial(seg.x + 230 + i * 40, lvl + 40 + i * 6);
    this.lastPowerD = this.distance;
  }

  // ============================
  // Update
  // ============================
  _scrollWorld(scroll) {
    this.terrainEnd -= scroll;
    this.terrain.forEach((seg) => { seg.x -= scroll; });
    [this.crates, this.mines, this.gates, this.coffins, this.cages, this.nodes, this.powerUps,
      this.obstacles, this.villagers, this.vehicles, this.guards, this.decks].forEach((list) => {
      list.forEach((item) => { item.x -= scroll; });
    });
  }

  _updateSky(dt, scroll) {
    const slow = this.reduced ? 0.3 : 1;
    const { bats, balloons, fog, plane } = this.skyActors;
    bats.forEach((b) => {
      b.x += b.vx * dt * slow;
      b.phase += dt * 14 * slow;
      if (b.vx > 0 && b.x > this.W + 30) b.x = -30;
      if (b.vx < 0 && b.x < -30) b.x = this.W + 30;
    });
    balloons.forEach((b) => {
      b.x -= b.drift * slow * dt + scroll * 0.03;
      if (b.x < -140) b.x = this.W + 140;
    });
    fog.forEach((f) => {
      f.x -= f.drift * slow * dt + scroll * 0.25;
      if (f.x + f.w < 0) f.x = this.W + rand(0, 200);
    });
    if (plane) {
      if (!plane.active) {
        plane.timer -= dt;
        if (plane.timer <= 0) {
          plane.active = true;
          plane.x = -120;
          plane.y = this.moon.y + rand(-this.moon.r * 0.6, this.moon.r * 0.3);
        }
      } else {
        plane.x += 80 * slow * dt;
        if (plane.x > this.W + 160) {
          plane.active = false;
          plane.timer = rand(14, 26);
        }
      }
    }
    const l = this.lightning;
    if (this.reduced) {
      l.flash = 0;
    } else {
      l.timer -= dt;
      if (l.timer <= 0) {
        l.timer = rand(8, 20);
        l.flash = 1;
        const bx = rand(this.W * 0.1, this.W * 0.9);
        l.bolt = [{ x: bx, y: 0 }];
        for (let i = 1; i <= 7; i++) l.bolt.push({ x: bx + rand(-26, 26) * i * 0.6, y: (this.groundY * 0.6 * i) / 7 });
      }
      l.flash = l.flash > 0.01 ? l.flash * Math.exp(-5 * dt) : 0;
    }
  }

  _updateEntities(dt) {
    const lead = this._lead();
    this.villagers.forEach((v) => {
      if (v.dead) return;
      if (!v.flee && lead && v.x > lead.x && v.x - lead.x < 330) {
        v.flee = true;
        v.turn = 0.3;
      }
      if (v.turn > 0) v.turn -= dt;
      // World-frame velocity (positive = away from the horde): fleeing is slower than the horde
      const velocity = v.flee ? this.speed * 0.42 + 40 : -42;
      const nextX = v.x + velocity * dt;
      const ahead = this._groundAt(nextX + Math.sign(velocity) * 10);
      if (ahead === null) {
        v.dead = true;
        this._emit({ type: 4, x: v.x, y: this.groundY - v.base - 10, vy: 30, life: 0.5, size: 8, grow: 14, color: '#6A5A8A' });
        return;
      }
      if (ahead - v.base <= STEP_UP) v.x = nextX;
      const ground = this._groundAt(v.x);
      if (ground !== null) v.base = ground;
      v.phase += dt * (v.flee ? 14 : 7);
    });
    this.vehicles.forEach((v) => {
      v.x -= v.vx * dt;
      v.wheel += ((this.speed + v.vx) * dt) / v.wr;
      v.phase += dt * 6;
      if (v.x < this.leaderX - 140) {
        v.fade += dt * 2.5;
        if (v.fade >= 1) v.dead = true;
      }
    });
    this.guards.forEach((g) => {
      g.x -= 48 * dt;
      g.phase += dt * 6;
      if (g.cd > 0) g.cd -= dt;
    });
  }

  _update(dt) {
    this.t += dt;
    const playing = this.state === 'PLAYING';

    if (playing) {
      this.runTime += dt;
      this.speed = speedAtTime(this.runTime);
    } else if (this.state === 'GAMEOVER') {
      this.speed += (ATTRACT_SPEED - this.speed) * ease(2, dt);
    } else {
      this.speed = ATTRACT_SPEED;
    }
    const scroll = this.speed * dt;

    this.gridOffset += scroll;
    this._scrollLayers(dt);
    this._updateSky(dt, scroll);
    const starDrift = this.reduced ? 0.3 : 1;
    this.stars.forEach((s) => {
      s.x -= (s.drift + this.speed * 0.01) * starDrift * dt;
      if (s.x < -2) s.x = this.W + 2;
    });
    this.flickerClock += dt;

    this._scrollWorld(scroll);
    if (playing) {
      let guard = 0;
      while (this.terrainEnd < this.W + 320 && guard++ < 6) this._spawnChunk();
    } else if (this.terrainEnd < this.W + 400) {
      this._addSeg('flat', 800, this.level, this.level, 'street');
    }

    // Attract mode: idle vampires hop now and then
    if (this.state === 'START') {
      this.attractHopTimer -= dt;
      if (this.attractHopTimer <= 0) {
        this.attractHopTimer = rand(1.4, 2.8);
        const bot = pick(this.bots);
        if (bot && bot.grounded) this._launch(bot);
      }
    }

    if (playing) this._updateEntities(dt);
    this._updateBots(dt, playing);
    this._updateParticles(dt);

    this.shake = this.shake > 0.2 ? this.shake * Math.exp(-9 * dt) : 0;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);

    if (!playing) {
      if (this.state === 'GAMEOVER') this._syncHud();
      return;
    }

    // Leader ghost trail
    this.ghostTimer -= dt;
    const lead = this._lead();
    if (this.ghostTimer <= 0 && lead) {
      this.ghostTimer = 0.035;
      this.ghosts.push({ x: lead.x, y: this._botScreenY(lead), life: 0.22, sy: lead.sy, sx: lead.sx });
    }
    this.ghosts.forEach((g) => { g.life -= dt; g.x -= scroll; });
    this.ghosts = this.ghosts.filter((g) => g.life > 0);

    POWERUP_KEYS.forEach((key) => {
      if (this.pu[key] > 0) this.pu[key] = Math.max(0, this.pu[key] - dt);
    });
    this._updateMagnet(dt);

    // Distance, score and maturation
    const meters = scroll * 0.02;
    this.distance += meters;
    this.score += meters * (this.pu.x2 > 0 ? 2 : 1);
    this.bots.forEach((bot) => {
      if (bot.fledgling && this.distance >= bot.matureAt) this._mature(bot);
    });
    this._arrivePending();
    if (this.distance >= this.nextMilestone) {
      this._toast(`${this.nextMilestone} M`);
      this.sfx.bell();
      this.nextMilestone += MILESTONE_STEP;
    }

    this._collideVials();
    this._collideCoffins();
    this._collideCages();
    this._collidePowerUps();
    this._collideBites();
    this._collideVehicles();
    this.obstacles.forEach((o) => { if (o.cooldown > 0) o.cooldown -= dt; });
    this._collideObstacles();
    this._collideMines();
    this._collideGuards();
    this._collideGates();

    const margin = -160;
    const alive = (item) => !item.dead && !item.taken && item.x + (item.w || 0) > margin;
    this.obstacles = this.obstacles.filter(alive);
    this.crates = this.crates.filter(alive);
    this.mines = this.mines.filter(alive);
    this.gates = this.gates.filter(alive);
    this.coffins = this.coffins.filter(alive);
    this.cages = this.cages.filter(alive);
    this.nodes = this.nodes.filter(alive);
    this.powerUps = this.powerUps.filter(alive);
    this.villagers = this.villagers.filter(alive);
    this.vehicles = this.vehicles.filter(alive);
    this.guards = this.guards.filter(alive);
    this.decks = this.decks.filter((deck) => deck.x + deck.w > margin);
    while (this.terrain.length > 2 && this.terrain[0].x + this.terrain[0].w < -700) this.terrain.shift();

    if (this.bots.length === 0) {
      this._gameOver(this.lastLoss);
    } else {
      const front = this.bots.find((bot) => !bot.catchUp);
      if (front && front.x < -24) this._gameOver('pushed');
    }

    // Wind streaks at high speed
    if (this.speed > MAX_SPEED * 0.7 && !this.reduced) {
      this.speedLines.forEach((line) => {
        line.x -= this.speed * line.mult * 2.4 * dt;
        if (line.x + line.len < 0) {
          line.x = this.W + rand(0, 300);
          line.y = rand(this.H * 0.08, this.H * 0.97);
          line.len = rand(70, 220);
          line.mult = rand(0.8, 1.5);
        }
      });
    }

    this._syncHud();
  }

  _arrivePending() {
    while (this.pending.length && this.distance >= this.pending[0].at) {
      const entry = this.pending.shift();
      let joined = 0;
      // Arrivals appear at the left edge, on the first solid ground
      let spawnX = -14;
      for (let tries = 0; tries < 14 && this._groundAt(spawnX) === null; tries++) spawnX += 40;
      for (let i = 0; i < entry.count; i++) {
        if (this._addMember({ fledgling: true, x: spawnX - i * 16, catchUp: true, born: 0 })) joined++;
      }
      this._floatText(54, this.groundY - 70, joined ? `+${joined} FLEDGLINGS` : 'HORDE FULL', BONE);
      if (!joined) this.score += 50 * entry.count;
      else this.sfx.rise();
    }
  }

  _updateMagnet(dt) {
    const lead = this._lead();
    if (this.pu.magnet <= 0 || !lead) return;
    const targetDy = lead.hy + 20 - lead.floorOff;
    const pull = ease(6, dt);
    this.nodes.forEach((n) => {
      const dx = lead.x - n.x;
      const dy = targetDy - n.dy;
      if (dx * dx + dy * dy < 420 * 420) {
        n.x += dx * pull;
        n.dy += dy * pull;
      }
    });
  }

  _absorbWithCloak() {
    if (this.pu.shield <= 0) return false;
    this.pu.shield = 0;
    const lead = this._lead();
    if (lead) this._ring(lead.x, this._botScreenY(lead) - 18, MIST, 120, 0.5);
    this.shake = this.reduced ? 0 : Math.max(this.shake, 5);
    this.sfx.hit();
    return true;
  }

  _centerDy(bot) {
    return bot.hy + 20 - bot.floorOff;
  }

  _collideVials() {
    this.nodes.forEach((n) => {
      if (n.taken) return;
      for (const bot of this.bots) {
        if (Math.abs(bot.x - n.x) < 24 && Math.abs(this._centerDy(bot) - n.dy) < 30) {
          n.taken = true;
          this.streak += 1;
          const previous = this.combo;
          this.combo = Math.min(5, 1 + Math.floor(this.streak / 5));
          this.score += 10 * this.combo * (this.pu.x2 > 0 ? 2 : 1);
          this.vialCount += 1;
          const y = this.groundY - n.dy;
          this._ring(n.x, y, BLOOD, 40, 0.4);
          this._burst(n.x, y, BLOOD, 6, 0.6);
          this._floatText(n.x, y - 14, '+10', '#FF9AAE');
          this.sfx.pickup();
          if (this.combo > previous) this._floatText(n.x, y - 36, `x${this.combo}`, HOLY);
          // Every 25 vials the blood strengthens the horde with one more adult
          if (this.vialCount % 25 === 0 && this._addMember({ x: n.x })) {
            this._floatText(n.x, y - 56, '+1 RISE', BONE);
          }
          break;
        }
      }
    });
  }

  _collideCoffins() {
    this.coffins.forEach((c) => {
      if (c.dead) return;
      const victim = this.bots.find((bot) => Math.abs(bot.x - c.x) < 28 && bot.hy < c.base + 46);
      if (!victim) return;
      c.dead = true;
      const amount = c.big ? 3 : 1;
      const y = this.groundY - c.base - 20;
      this._burst(c.x, y, '#8A5A3A', 10, 0.8);
      this._burst(c.x, y, BONE, 5, 0.6);
      this._ring(c.x, y, EMBER, 70, 0.5);
      let joined = 0;
      for (let i = 0; i < amount; i++) {
        if (this._addMember({ x: c.x - i * 10, born: 0.28 + i * 0.12 })) joined++;
      }
      this._floatText(c.x, y - 30, joined ? `+${joined} RISE` : 'HORDE FULL', BONE);
      if (!joined) this.score += 100;
      this.sfx.rise();
    });
  }

  _collideCages() {
    this.cages.forEach((c) => {
      if (c.dead) return;
      const victim = this.bots.find((bot) => Math.abs(bot.x - c.x) < 24 && Math.abs(this._centerDy(bot) - c.dy) < 32);
      if (!victim) return;
      c.dead = true;
      const y = this.groundY - c.dy;
      this._burst(c.x, y, '#8A8AA0', 10, 0.8);
      this._ring(c.x, y, BONE, 60, 0.45);
      for (let i = 0; i < 3; i++) {
        this._emit({
          type: 3, x: c.x, y, vx: rand(-120, 120), vy: rand(-260, -120),
          life: rand(0.9, 1.3), size: rand(7, 10), color: '#CFC3E8', phase: rand(0, TAU),
        });
      }
      const joined = this._addMember({ x: c.x });
      this._floatText(c.x, y - 26, joined ? '+1 FREED' : 'HORDE FULL', BONE);
      if (!joined) this.score += 100;
      this.sfx.rise();
    });
  }

  _collidePowerUps() {
    this.powerUps.forEach((p) => {
      if (p.taken) return;
      for (const bot of this.bots) {
        if (Math.abs(bot.x - p.x) < 28 && Math.abs(this._centerDy(bot) - p.dy) < 34) {
          p.taken = true;
          this.pu[p.type] = POWERUP_DURATION[p.type];
          this.score += 50;
          const y = this.groundY - p.dy;
          const color = POWERUP_COLOR[p.type];
          this._ring(p.x, y, color, 70, 0.55);
          this._burst(p.x, y, color, 14, 0.9);
          this._floatText(p.x, y - 20, POWERUP_NAME[p.type], color);
          this.sfx.power();
          break;
        }
      }
    });
  }

  _collideBites() {
    this.villagers.forEach((v) => {
      if (v.dead) return;
      const biter = this.bots.find((bot) => !bot.catchUp && Math.abs(bot.x - v.x) < 20 && bot.hy < v.base + 34);
      if (!biter) return;
      v.dead = true;
      const y = this.groundY - v.base - 22;
      this._bite(v.x, y);
      const joined = this._addMember({ fledgling: true, x: v.x, born: 0.28 });
      this.score += 20 * (this.pu.x2 > 0 ? 2 : 1);
      this._floatText(v.x, y - 28, joined ? 'BITE +1' : 'HORDE FULL', BLOOD);
      this.sfx.rise();
    });
  }

  /** Short bite flash: a white burst with two fangs and a few blood drops. */
  _bite(x, y) {
    this._ring(x, y, BONE, 44, 0.25);
    this._burst(x, y, BLOOD, 8, 0.6);
    this._emit({ type: 5, x, y, life: 0.28, size: 14, color: BONE });
  }

  _collideVehicles() {
    this.vehicles.forEach((v) => {
      if (v.bitten || v.dead) return;
      const touched = this.bots.some((bot) => (
        !bot.catchUp && Math.abs(bot.x - v.x) < v.w / 2 + 8 && bot.hy < v.base + v.h
      ));
      if (!touched) return;
      v.bitten = true;
      const y = this.groundY - v.base - v.h / 2;
      this._bite(v.x, y);
      this._bite(v.x - 14, y + 6);
      this.pending.push({ at: this.distance + 200, count: v.passengers });
      this._floatText(v.x, y - v.h / 2 - 12, `${v.passengers} BITTEN`, BLOOD);
      this.sfx.rise();
    });
  }

  _collideObstacles() {
    for (const obstacle of this.obstacles) {
      if (obstacle.dead || obstacle.cooldown > 0) continue;
      const victim = this.bots.find((bot) => (
        bot.x + 11 > obstacle.x && bot.x - 11 < obstacle.x + obstacle.w && bot.hy < obstacle.base + obstacle.h - 4
      ));
      if (!victim) continue;
      obstacle.cooldown = 0.14;
      if (this._absorbWithCloak()) {
        obstacle.dead = true;
        this._shatterBarricade(obstacle);
        continue;
      }
      this._destroyBot(victim, 'bats');
      obstacle.hits += 1;
      if (obstacle.hits >= obstacle.damage) {
        obstacle.dead = true;
        this._shatterBarricade(obstacle);
      }
    }
  }

  _shatterBarricade(obstacle) {
    const cx = obstacle.x + obstacle.w / 2;
    const cy = this.groundY + OBSTACLE_BASE - obstacle.base - obstacle.h / 2;
    this._burst(cx, cy, '#5A5A72', 12, 1);
    this._burst(cx, cy, HOLY, 6, 0.7);
  }

  _collideMines() {
    this.mines.forEach((m) => {
      if (m.dead) return;
      const victim = this.bots.find((bot) => Math.abs(bot.x - m.x) < 14 && bot.hy < m.base + 16);
      if (!victim) return;
      m.dead = true;
      const y = this.groundY - m.base - 8;
      this._burst(m.x, y, HOLY, 10, 0.8);
      if (this._absorbWithCloak()) return;
      this._destroyBot(victim, 'steam');
    });
  }

  _collideGuards() {
    this.guards.forEach((g) => {
      if (g.dead || g.cd > 0) return;
      const victim = this.bots.find((bot) => Math.abs(bot.x - g.x) < 34 && bot.hy < g.base + 62);
      if (!victim) return;
      g.cd = 0.22;
      if (this._absorbWithCloak()) return;
      this._destroyBot(victim, 'burn');
    });
  }

  _collideGates() {
    const lead = this._lead();
    if (!lead) return;
    for (const gate of this.gates) {
      if (gate.dead || lead.x + 11 < gate.x) continue;
      gate.dead = true;
      const cx = gate.x + gate.w / 2;
      const cy = this.groundY - gate.base - 90;
      this._burst(cx, cy, '#5A5A72', 18, 1.2);
      this._burst(cx, cy, BONE, 8, 0.9);
      this._ring(cx, cy, EMBER, 120, 0.5);
      if (this.adultCount() >= gate.n) {
        const bonus = (400 + gate.n * 40) * (this.pu.x2 > 0 ? 2 : 1);
        this.score += bonus;
        this.flash = Math.max(this.flash, 0.6);
        this.shake = this.reduced ? 0 : Math.max(this.shake, 7);
        this._floatText(cx, cy - 60, `GATE BROKEN +${bonus}`, HOLY);
        this.sfx.smash();
      } else {
        const cost = Math.ceil(gate.n / 2);
        this.sfx.smash();
        if (this._absorbWithCloak()) {
          this._floatText(cx, cy - 60, 'CLOAK HOLDS', MIST);
        } else {
          for (let i = 0; i < cost && this.bots.length; i++) this._destroyBot(this.bots[this.bots.length - 1], 'bats');
          this._floatText(cx, cy - 60, `-${cost} THE GATE TAKES ITS TOLL`, BLOOD);
        }
      }
    }
  }

  // ============================
  // Draw
  // ============================
  _draw() {
    const ctx = this.ctx;
    const k = this.dpr * this.sc;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.skyCanvas, 0, 0);
    ctx.setTransform(k, 0, 0, k, 0, 0);

    if (this.shake > 0 && !this.reduced) {
      ctx.translate(rand(-1, 1) * this.shake, rand(-1, 1) * this.shake);
    }

    this._drawStars(ctx);
    this._drawSkyActors(ctx);
    this._drawLightning(ctx);
    this._drawLayer(ctx, this.layers[0]);
    this._drawLayer(ctx, this.layers[1]);
    this._drawMidFlicker(ctx, this.layers[1]);
    this._drawFog(ctx, 0, 2);
    this._drawLayer(ctx, this.layers[2]);
    this._drawLamps(ctx, this.layers[2]);
    this._drawFog(ctx, 2, 4);
    this._drawTerrain(ctx);
    this.obstacles.forEach((o) => this._drawWarning(ctx, o));
    this.decks.forEach((d) => this._drawDeck(ctx, d));
    this.mines.forEach((m) => this._drawMine(ctx, m));
    this.coffins.forEach((c) => this._drawCoffin(ctx, c));
    this.gates.forEach((g) => this._drawGate(ctx, g));
    this.obstacles.forEach((o) => this._drawBarricade(ctx, o));
    this.crates.forEach((c) => this._drawCrate(ctx, c));
    this.villagers.forEach((v) => this._drawVillager(ctx, v));
    this.guards.forEach((g) => this._drawGuard(ctx, g));
    this.vehicles.forEach((v) => this._drawVehicle(ctx, v));
    this.cages.forEach((c) => this._drawCage(ctx, c));
    this.nodes.forEach((n) => this._drawVial(ctx, n));
    this.powerUps.forEach((p) => this._drawPowerUp(ctx, p));
    this._drawSwarm(ctx);
    this._drawParticles(ctx);
    this._drawSpeedLines(ctx);

    ctx.fillStyle = this.vignette;
    ctx.fillRect(-20, -20, this.W + 40, this.H + 40);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.5, this.flash)})`;
      ctx.fillRect(-20, -20, this.W + 40, this.H + 40);
    }
  }

  _drawStars(ctx) {
    ctx.fillStyle = '#E6DCF5';
    this.stars.forEach((s) => {
      ctx.globalAlpha = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(this.t * s.twinkle + s.phase));
      ctx.fillRect(s.x, s.y, s.size, s.size);
    });
    ctx.globalAlpha = 1;
  }

  _drawBalloon(ctx, x, y, scale, alpha, hue, t) {
    const palettes = [[BLOOD, BONE, '#5B2A86'], ['#5B2A86', EMBER, BONE]];
    const colors = palettes[hue % palettes.length];
    ctx.save();
    ctx.translate(x, y + Math.sin(t * 0.8 + hue) * 3 * scale);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    const r = 62;
    // Striped envelope
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = colors[i % 3];
      ctx.beginPath();
      const a0 = Math.PI + (Math.PI * i) / 5 - 0.001;
      const a1 = Math.PI + (Math.PI * (i + 1)) / 5;
      ctx.moveTo(0, 0);
      ctx.ellipse(0, 0, r, r * 1.15, 0, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = colors[0];
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.9, 0, 0, Math.PI);
    ctx.lineTo(14, r * 1.05);
    ctx.lineTo(-14, r * 1.05);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(20, 8, 40, 0.38)';
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 1.15, 0, 0, TAU);
    ctx.fill();
    // Ropes and basket
    ctx.strokeStyle = '#2A1B18';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-12, r * 1.05);
    ctx.lineTo(-14, r * 1.6);
    ctx.moveTo(12, r * 1.05);
    ctx.lineTo(14, r * 1.6);
    ctx.stroke();
    ctx.fillStyle = '#4A2E1E';
    ctx.fillRect(-17, r * 1.6, 34, 15);
    ctx.restore();
  }

  _drawBiplane(ctx, plane) {
    ctx.save();
    ctx.translate(plane.x, plane.y);
    ctx.fillStyle = '#07040F';
    ctx.strokeStyle = '#07040F';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 5, 0, 0, TAU);
    ctx.fill();
    ctx.fillRect(-14, -14, 30, 3);
    ctx.fillRect(-12, 7, 26, 3);
    ctx.beginPath();
    ctx.moveTo(-8, -12);
    ctx.lineTo(-8, 8);
    ctx.moveTo(8, -12);
    ctx.lineTo(8, 8);
    ctx.moveTo(-22, 0);
    ctx.lineTo(-30, -9);
    ctx.lineTo(-24, -1);
    ctx.stroke();
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.t * 40);
    ctx.fillRect(22, -8, 1.6, 16);
    ctx.globalAlpha = 1;
    if (Math.sin(this.t * 4) > 0) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, BLOOD, -28, -9, 6, 0.9);
    }
    ctx.restore();
  }

  _drawSkyActors(ctx) {
    const { bats, balloons, plane } = this.skyActors;
    balloons.forEach((b) => this._drawBalloon(ctx, b.x, b.y, b.scale, b.alpha, b.hue, this.t + b.phase));
    if (plane && plane.active) this._drawBiplane(ctx, plane);
    bats.forEach((b) => {
      ctx.save();
      ctx.translate(b.x, b.y);
      if (b.vx < 0) ctx.scale(-1, 1);
      drawBat(ctx, b.size, b.phase, '#07040F', null);
      ctx.restore();
    });
  }

  _drawLightning(ctx) {
    const l = this.lightning;
    if (l.flash < 0.02) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(150, 130, 255, ${(l.flash * 0.2).toFixed(3)})`;
    ctx.fillRect(0, 0, this.W, this.groundY);
    if (l.bolt && l.flash > 0.35) {
      ctx.strokeStyle = `rgba(220, 210, 255, ${l.flash.toFixed(3)})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      l.bolt.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawLayer(ctx, layer) {
    const gy = this.groundY;
    layer.items.forEach((b) => {
      if (b.x > this.W + 4 || b.x + b.w < -4) return;
      ctx.drawImage(b.canvas, b.x, gy - b.totalH, b.w, b.totalH);
    });
    ctx.fillStyle = layer.fog;
    ctx.fillRect(0, layer.fogTop, this.W, gy - layer.fogTop + 1);
  }

  _drawMidFlicker(ctx, layer) {
    const gy = this.groundY;
    layer.items.forEach((b) => {
      if (b.x > this.W + 4 || b.x + b.w < -4) return;
      b.spec.flicker.forEach((f) => {
        const on = ((this.flickerClock + f.phase) % f.period) < 0.35;
        if (!on) return;
        ctx.fillStyle = hexA(f.color, 0.9);
        ctx.fillRect(b.x + 8 + f.c * 13, gy - b.totalH + b.spec.roofH + 12.5 + f.r * 16, 5, 7);
      });
    });
  }

  _drawLamps(ctx, layer) {
    const gy = this.groundY;
    ctx.globalCompositeOperation = 'lighter';
    layer.items.forEach((b) => {
      if (!b.spec.lamps || b.x > this.W + 40 || b.x + b.w < -40) return;
      b.spec.lamps.forEach((lamp) => {
        // Gas flicker: a base glow with fast irregular dips
        const flick = 0.75 + 0.25 * Math.sin(this.t * 17 + lamp.phase) * Math.sin(this.t * 5.3 + lamp.phase * 2);
        drawGlow(ctx, EMBER, b.x + lamp.ox, gy - b.totalH + lamp.oy, 34, 0.85 * flick);
      });
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawFog(ctx, from, to) {
    const sprite = fogSprite();
    this.skyActors.fog.slice(from, to).forEach((f) => {
      ctx.globalAlpha = Math.max(0.05, f.alpha);
      ctx.drawImage(sprite, f.x, f.y, f.w, 96);
    });
    ctx.globalAlpha = 1;
  }

  // ---------- Terrain ----------
  _drawCobbles(ctx) {
    const { W, H, groundY: gy } = this;
    const vpX = W * 0.5;
    const vpY = gy - 130;
    const stretch = (H - vpY) / (gy - vpY);
    const spacing = 72;
    const offset = this.gridOffset % spacing;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(190, 170, 220, 0.09)';
    ctx.beginPath();
    for (let x = -offset - spacing * 3; x < W + spacing * 3; x += spacing) {
      ctx.moveTo(x, gy);
      ctx.lineTo(vpX + (x - vpX) * stretch, H);
    }
    ctx.stroke();
    for (let j = 1; j <= 8; j++) {
      const t = j / 8;
      const y = gy + (H - gy) * Math.pow(t, 1.7);
      ctx.strokeStyle = `rgba(190, 170, 220, ${0.04 + 0.1 * t})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.setLineDash([46, 52]);
    ctx.lineDashOffset = this.gridOffset * 1.6;
    ctx.lineWidth = 2;
    ctx.strokeStyle = hexA(BONE, 0.1);
    ctx.beginPath();
    ctx.moveTo(-60, gy + (H - gy) * 0.5);
    ctx.lineTo(W + 60, gy + (H - gy) * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  _drawPit(ctx, seg) {
    const { H, groundY: gy } = this;
    const topY = gy - seg.h0;
    const x0 = seg.x;
    const w = seg.w;
    const depth = H - topY + 4;
    const grad = ctx.createLinearGradient(0, topY, 0, H);
    grad.addColorStop(0, '#05030C');
    grad.addColorStop(0.6, '#0E0614');
    grad.addColorStop(1, '#260A1A');
    ctx.fillStyle = grad;
    ctx.fillRect(x0, topY, w, depth);
    // Shaded walls
    const left = ctx.createLinearGradient(x0, 0, x0 + 26, 0);
    left.addColorStop(0, 'rgba(0,0,0,0.6)');
    left.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = left;
    ctx.fillRect(x0, topY, 26, depth);
    const right = ctx.createLinearGradient(x0 + w - 26, 0, x0 + w, 0);
    right.addColorStop(0, 'rgba(0,0,0,0)');
    right.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = right;
    ctx.fillRect(x0 + w - 26, topY, 26, depth);
    // Splintered bridge planks at both ends
    ctx.fillStyle = '#3A2316';
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(x0 - 1, topY + 3 + i * 7);
      ctx.rotate(0.45 + i * 0.16);
      ctx.fillRect(-14 - i * 4, 0, 14 + i * 4, 4);
      ctx.restore();
      ctx.save();
      ctx.translate(x0 + w + 1, topY + 3 + i * 7);
      ctx.rotate(-0.45 - i * 0.16);
      ctx.fillRect(0, 0, 14 + i * 4, 4);
      ctx.restore();
    }
    // Mist drifting up and a faint red glow below
    ctx.globalCompositeOperation = 'lighter';
    const sprite = fogSprite();
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.2;
      const mx = x0 + w * (0.1 + 0.3 * i) + Math.sin(this.t * 0.6 + i) * 10;
      ctx.drawImage(sprite, mx - w * 0.2, topY + depth * (0.35 + 0.18 * i), w * 0.8, 60);
    }
    ctx.globalAlpha = 1;
    drawGlow(ctx, BLOOD, x0 + w / 2, H - 6, Math.max(w * 0.7, 80), 0.5);
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawBlock(ctx, seg) {
    const { W, groundY: gy } = this;
    const palette = {
      street: { top: '#1B1531', face: '#0E0A20', line: 'rgba(190,170,220,0.12)' },
      hill: { top: '#102620', face: '#0A1714', line: 'rgba(124,255,178,0.09)' },
      bridge: { top: '#3C2517', face: '#25150A', line: 'rgba(0,0,0,0.4)' },
      stone: { top: '#28223F', face: '#18142B', line: 'rgba(200,190,230,0.13)' },
    }[seg.style] || { top: '#1B1531', face: '#0E0A20', line: 'rgba(190,170,220,0.12)' };
    const x0 = seg.x;
    const x1 = seg.x + seg.w;
    const ya = gy - seg.h0;
    const yb = gy - seg.h1;
    const band = 32;
    const tall = Math.max(seg.h0, seg.h1) > 0.5;

    ctx.fillStyle = palette.top;
    ctx.beginPath();
    ctx.moveTo(x0, ya);
    ctx.lineTo(x1, yb);
    ctx.lineTo(x1, yb + band);
    ctx.lineTo(x0, ya + band);
    ctx.closePath();
    ctx.fill();
    if (tall) {
      ctx.fillStyle = palette.face;
      ctx.beginPath();
      ctx.moveTo(x0, ya + band);
      ctx.lineTo(x1, yb + band);
      ctx.lineTo(x1, gy + band);
      ctx.lineTo(x0, gy + band);
      ctx.closePath();
      ctx.fill();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(Math.max(x0, -20), Math.min(ya, yb), Math.min(x1, W + 20) - Math.max(x0, -20), gy + band - Math.min(ya, yb));
    ctx.clip();
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const startX = Math.max(x0, -20);
    const endX = Math.min(x1, W + 20);
    if (seg.style === 'bridge') {
      for (let x = startX - ((startX - x0) % 16); x < endX; x += 16) {
        ctx.moveTo(x, Math.min(ya, yb));
        ctx.lineTo(x, Math.min(ya, yb) + band + 4);
      }
      if (tall) {
        for (let x = startX - ((startX - x0) % 70); x < endX; x += 70) {
          ctx.moveTo(x, ya + band);
          ctx.lineTo(x, gy + band);
        }
      }
    } else {
      for (let x = startX - ((startX - x0) % 26); x < endX; x += 26) {
        ctx.moveTo(x, Math.min(ya, yb) + 4);
        ctx.lineTo(x, Math.min(ya, yb) + band);
      }
      if (tall) {
        let row = 0;
        for (let y = Math.min(ya, yb) + band + 18; y < gy + band; y += 18, row++) {
          ctx.moveTo(startX, y);
          ctx.lineTo(endX, y);
          const offset = row % 2 ? 13 : 0;
          for (let x = startX - ((startX - x0) % 26) + offset; x < endX; x += 26) {
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + 18);
          }
        }
      }
    }
    ctx.stroke();
    ctx.restore();

    if (seg.style === 'hill') {
      ctx.fillStyle = '#1D4034';
      for (let x = Math.max(x0, -10); x < Math.min(x1, W + 10); x += 14) {
        const y = ya + ((yb - ya) * (x - x0)) / seg.w;
        ctx.beginPath();
        ctx.moveTo(x, y + 1);
        ctx.lineTo(x + 3, y - 5);
        ctx.lineTo(x + 6, y + 1);
        ctx.fill();
      }
    }
    if (seg.style === 'bridge') {
      // Back rail posts and a sagging rope
      ctx.strokeStyle = '#2B170C';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = Math.max(x0, -10) - ((Math.max(x0, -10) - x0) % 60); x < Math.min(x1, W + 10); x += 60) {
        ctx.moveTo(x, ya);
        ctx.lineTo(x, ya - 22);
      }
      ctx.stroke();
    }
  }

  _drawTerrain(ctx) {
    const { W, groundY: gy } = this;
    this._drawCobbles(ctx);
    this.terrain.forEach((seg) => {
      if (seg.type === 'pit' && seg.x < W + 30 && seg.x + seg.w > -30) this._drawPit(ctx, seg);
    });
    this.terrain.forEach((seg) => {
      if (seg.type === 'pit' || seg.x > W + 30 || seg.x + seg.w < -30) return;
      if (Math.max(seg.h0, seg.h1) > 0.5 || seg.style === 'bridge') this._drawBlock(ctx, seg);
      if (seg.type === 'flat') {
        ctx.save();
        ctx.translate(0, gy - seg.h0);
        ctx.fillStyle = this.edgeGlow;
        ctx.fillRect(seg.x, -30, seg.w, 30);
        ctx.restore();
      }
    });

    // Glowing street edge following the profile
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    ctx.beginPath();
    let open = false;
    let lastY = 0;
    this.terrain.forEach((seg) => {
      if (seg.type === 'pit') {
        open = false;
        return;
      }
      const y0 = gy - seg.h0;
      const y1 = gy - seg.h1;
      if (!open) {
        ctx.moveTo(seg.x, y0);
        open = true;
      } else if (Math.abs(y0 - lastY) > 0.5) {
        ctx.lineTo(seg.x, y0);
      }
      ctx.lineTo(seg.x + seg.w, y1);
      lastY = y1;
    });
    ctx.strokeStyle = hexA(MIST, 0.12);
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.strokeStyle = hexA(MIST, 0.3);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = '#D9CCE8';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // ---------- Items and hazards ----------
  _drawWarning(ctx, o) {
    if (o.x > this.W + 10 || o.dead) return;
    const yTop = this.groundY - o.base;
    const pulse = 0.55 + 0.45 * Math.sin(this.t * 9 + o.phase);
    const reach = 240;
    const grad = ctx.createLinearGradient(o.x - reach, 0, o.x, 0);
    grad.addColorStop(0, hexA(BLOOD, 0));
    grad.addColorStop(1, hexA(BLOOD, 0.22 * pulse));
    ctx.fillStyle = grad;
    ctx.fillRect(o.x - reach, yTop + 2, reach, 52);
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const cx = o.x - 34 - i * 34;
      const alpha = 0.2 + 0.6 * Math.max(0, Math.sin(this.t * 9 - i * 0.9));
      ctx.strokeStyle = hexA(BLOOD, alpha * 0.8);
      ctx.beginPath();
      ctx.moveTo(cx + 5, yTop + 16);
      ctx.lineTo(cx - 3, yTop + 28);
      ctx.lineTo(cx + 5, yTop + 40);
      ctx.stroke();
    }
  }

  /** Garlic-and-iron spike barricade. */
  _drawBarricade(ctx, o) {
    if (o.x > this.W + 20 || o.dead) return;
    const base = this.groundY + OBSTACLE_BASE - o.base;
    const top = base - o.h;
    const worn = o.hits > 0;
    ctx.fillStyle = 'rgba(0, 0, 10, 0.35)';
    ctx.beginPath();
    ctx.ellipse(o.x + o.w / 2, base + 2, o.w * 0.6, 4, 0, 0, TAU);
    ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, HOLY, o.x + o.w / 2, top + o.h * 0.5, Math.max(o.w, o.h) * 0.9 + 14, 0.22);
    ctx.globalCompositeOperation = 'source-over';

    // Iron bars with spear tips
    ctx.fillStyle = worn ? '#3A3A50' : '#2A2A3E';
    const bars = Math.max(3, Math.round(o.w / 9));
    for (let i = 0; i < bars; i++) {
      const bx = o.x + 3 + (i * (o.w - 6)) / (bars - 1);
      const lean = (i % 2 ? 1 : -1) * 1.5;
      ctx.fillRect(bx - 1.6, top + 7, 3.2, o.h - 7);
      ctx.beginPath();
      ctx.moveTo(bx - 4, top + 9 + lean);
      ctx.lineTo(bx, top - 2);
      ctx.lineTo(bx + 4, top + 9 + lean);
      ctx.fill();
      ctx.fillStyle = '#7A7A98';
      ctx.fillRect(bx - 0.6, top + 7, 1.2, o.h - 9);
      ctx.fillStyle = worn ? '#3A3A50' : '#2A2A3E';
    }
    // Cross rails
    ctx.fillStyle = '#1C1C2C';
    const rails = o.h > 80 ? [0.3, 0.62, 0.9] : [0.35, 0.8];
    rails.forEach((r) => ctx.fillRect(o.x - 2, top + o.h * r - 2, o.w + 4, 4));
    // Garlic bulbs hung on the rails
    rails.slice(0, -1).forEach((r, rowIndex) => {
      const bulbs = Math.max(2, Math.round(o.w / 22));
      for (let i = 0; i < bulbs; i++) {
        const gx = o.x + ((i + 0.5) * o.w) / bulbs;
        const gy2 = top + o.h * r + 8 + (i + rowIndex) % 2 * 3;
        ctx.fillStyle = '#EEF0D8';
        ctx.beginPath();
        ctx.ellipse(gx, gy2, 4.4, 5.4, 0, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(gx - 1.6, gy2 - 4);
        ctx.lineTo(gx, gy2 - 9);
        ctx.lineTo(gx + 1.6, gy2 - 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,150,110,0.7)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(gx - 1.2, gy2 - 3);
        ctx.lineTo(gx - 1.2, gy2 + 4);
        ctx.moveTo(gx + 1.2, gy2 - 3);
        ctx.lineTo(gx + 1.2, gy2 + 4);
        ctx.stroke();
      }
    });
    ctx.fillStyle = '#1C1C2C';
    ctx.fillRect(o.x - 3, base - 6, o.w + 6, 6);
  }

  /** Heavy wooden crate (small cart or stacked coffin crates) with an iron N badge. */
  _drawCrate(ctx, c) {
    if (c.x > this.W + 20 || c.dead) return;
    const yb = this.groundY + OBSTACLE_BASE - c.base;
    const top = yb - c.h;
    const adults = this.adultCount();
    const breakable = adults >= c.n;
    const pressing = c.pressUntil > this.t;

    ctx.fillStyle = 'rgba(0, 0, 10, 0.4)';
    ctx.beginPath();
    ctx.ellipse(c.x + c.w / 2, yb + 2, c.w * 0.62, 5, 0, 0, TAU);
    ctx.fill();

    const wood = ctx.createLinearGradient(0, top, 0, yb);
    wood.addColorStop(0, '#5C3A28');
    wood.addColorStop(1, '#341E14');
    ctx.fillStyle = wood;
    ctx.fillRect(c.x, top, c.w, c.h);
    // Plank lines
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const layers = c.variant === 'stack' ? Math.round(c.h / 30) : 1;
    for (let y = top + c.h / (layers * 3); y < yb - 2; y += c.h / (layers * 3)) {
      ctx.moveTo(c.x + 1, y);
      ctx.lineTo(c.x + c.w - 1, y);
    }
    ctx.stroke();
    if (c.variant === 'stack') {
      // Stacked coffin crates: bold seams and lid crosses
      ctx.strokeStyle = '#1A0E08';
      ctx.lineWidth = 2;
      for (let i = 1; i < layers; i++) {
        const sy = top + (c.h * i) / layers;
        ctx.beginPath();
        ctx.moveTo(c.x, sy);
        ctx.lineTo(c.x + c.w, sy);
        ctx.stroke();
      }
    }
    // Iron bands and corner brackets
    ctx.fillStyle = '#25253A';
    ctx.fillRect(c.x + 3, top, 6, c.h);
    ctx.fillRect(c.x + c.w - 9, top, 6, c.h);
    ctx.fillRect(c.x, top, c.w, 5);
    ctx.fillRect(c.x, yb - 5, c.w, 5);
    ctx.fillStyle = '#9A9AB5';
    [[c.x + 6, top + 12], [c.x + c.w - 6, top + 12], [c.x + 6, yb - 12], [c.x + c.w - 6, yb - 12]].forEach(([bx, by]) => {
      ctx.beginPath();
      ctx.arc(bx, by, 1.6, 0, TAU);
      ctx.fill();
    });
    if (c.variant === 'cart') {
      ctx.fillStyle = '#1A1020';
      [c.x + 10, c.x + c.w - 10].forEach((wx) => {
        ctx.beginPath();
        ctx.arc(wx, yb - 1, 8, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#9A9AB5';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(wx - 7, yb - 1);
        ctx.lineTo(wx + 7, yb - 1);
        ctx.moveTo(wx, yb - 8);
        ctx.lineTo(wx, yb + 6);
        ctx.stroke();
      });
    }
    // Iron N badge
    const cx = c.x + c.w / 2;
    const cy = top + c.h / 2;
    const r = clamp(Math.min(c.w, c.h) * 0.34, 13, 24);
    const label = breakable ? HOLY : '#FF8095';
    ctx.fillStyle = '#1B1B2C';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#9A9AB5';
    ctx.stroke();
    ctx.font = `bold ${Math.round(r * 1.2)}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = label;
    ctx.fillText(String(c.n), cx, cy + 1);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, breakable ? HOLY : BLOOD, cx, cy, r * 2.2, 0.3);
    ctx.globalCompositeOperation = 'source-over';

    // Tall crates: lantern beacon and a jump chevron so they read from afar
    if (c.h >= 62) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, EMBER, cx, top - 8, 26, 0.6 + 0.3 * Math.sin(this.t * 5));
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#25253A';
      ctx.fillRect(cx - 4, top - 10, 8, 10);
      ctx.fillStyle = hexA(EMBER, 0.95);
      ctx.fillRect(cx - 2.5, top - 8, 5, 7);
      ctx.strokeStyle = hexA(EMBER, 0.5 + 0.4 * Math.sin(this.t * 6));
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x - 1, top - 1, c.w + 2, c.h + 2);
    }
    if (pressing) {
      ctx.font = 'bold 15px "JetBrains Mono", monospace';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(2, 4, 16, 0.85)';
      const text = `${c.contact}/${c.n}`;
      ctx.strokeText(text, cx, top - 26);
      ctx.fillStyle = EMBER;
      ctx.fillText(text, cx, top - 26);
    }
  }

  /** Holy water trap: a stone basin of glowing green-white water. */
  _drawMine(ctx, m) {
    if (m.x > this.W + 30 || m.dead) return;
    const yb = this.groundY + 18 - m.base;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 4 + m.phase);
    ctx.strokeStyle = hexA(HOLY, 0.25 + 0.4 * pulse);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(m.x, yb, 18 + pulse * 10, 6 + pulse * 3, 0, 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, HOLY, m.x, yb - 8, 30, 0.35 + 0.3 * pulse);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#5E5C78';
    ctx.beginPath();
    ctx.moveTo(m.x - 12, yb);
    ctx.lineTo(m.x - 10, yb - 11);
    ctx.lineTo(m.x + 10, yb - 11);
    ctx.lineTo(m.x + 12, yb);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7A7896';
    ctx.fillRect(m.x - 11, yb - 12, 22, 3);
    ctx.fillStyle = '#D8FFE8';
    ctx.beginPath();
    ctx.ellipse(m.x, yb - 11, 9, 2.6, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = hexA(HOLY, 0.9);
    ctx.beginPath();
    ctx.ellipse(m.x, yb - 11, 6.5, 1.8, 0, 0, TAU);
    ctx.fill();
    // Rising sparkles
    ctx.fillStyle = '#E8FFF0';
    for (let i = 0; i < 3; i++) {
      const p = (this.t * 0.9 + i / 3 + m.phase) % 1;
      ctx.globalAlpha = 1 - p;
      ctx.fillRect(m.x - 6 + i * 6 + Math.sin(p * 6 + i) * 2, yb - 12 - p * 22, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
  }

  _drawVial(ctx, n) {
    if (n.x > this.W + 30) return;
    const y = this.groundY - n.dy + Math.sin(this.t * 3 + n.phase) * 3;
    const pulse = 0.65 + 0.35 * Math.sin(this.t * 5 + n.phase);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, BLOOD, n.x, y, 24, 0.5 * pulse + 0.15);
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(n.x, y);
    ctx.fillStyle = 'rgba(220, 210, 240, 0.9)';
    ctx.fillRect(-2.6, -12, 5.2, 6);
    ctx.fillStyle = '#6A3A22';
    ctx.fillRect(-3.2, -14.5, 6.4, 3);
    const grad = ctx.createRadialGradient(-2, -2, 1, 0, 0, 8);
    grad.addColorStop(0, '#FF9AAE');
    grad.addColorStop(0.5, BLOOD);
    grad.addColorStop(1, '#6A0F2C');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 7.4, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.ellipse(-2.6, -2.8, 1.7, 2.6, -0.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  _drawCoffin(ctx, c) {
    if (c.x > this.W + 40 || c.dead) return;
    const yb = this.groundY + 16 - c.base;
    const s = c.big ? 1.45 : 1;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3 + c.phase);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, c.big ? '#FFC46B' : EMBER, c.x, yb - 20 * s, 34 * s, 0.22 + 0.2 * pulse);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0, 0, 10, 0.4)';
    ctx.beginPath();
    ctx.ellipse(c.x, yb + 1, 14 * s, 3.4 * s, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(c.x, yb);
    ctx.rotate(c.tilt);
    ctx.scale(s, s);
    const wood = ctx.createLinearGradient(-13, 0, 13, 0);
    wood.addColorStop(0, '#3A2018');
    wood.addColorStop(0.5, '#5A3426');
    wood.addColorStop(1, '#2E1812');
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.moveTo(-8, -46);
    ctx.lineTo(8, -46);
    ctx.lineTo(13, -30);
    ctx.lineTo(9, 0);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-13, -30);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = c.big ? '#FFC46B' : '#C9B8A0';
    ctx.stroke();
    ctx.strokeStyle = hexA(c.big ? '#FFC46B' : BONE, 0.7);
    ctx.beginPath();
    ctx.moveTo(0, -40);
    ctx.lineTo(0, -12);
    ctx.moveTo(-6, -31);
    ctx.lineTo(6, -31);
    ctx.stroke();
    ctx.restore();
  }

  _drawCage(ctx, c) {
    if (c.x > this.W + 40 || c.dead) return;
    const y = this.groundY - c.dy;
    const sway = Math.sin(this.t * 2 + c.phase) * 0.09;
    ctx.strokeStyle = '#4A4A62';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.x, -10);
    ctx.lineTo(c.x, y - 22);
    ctx.stroke();
    ctx.save();
    ctx.translate(c.x, y - 22);
    ctx.rotate(sway);
    ctx.translate(0, 22);
    ctx.fillStyle = 'rgba(10, 6, 24, 0.55)';
    roundRectPath(ctx, -14, -22, 28, 40, 5);
    ctx.fill();
    // Caged bat
    ctx.save();
    ctx.translate(0, -2);
    drawBat(ctx, 8, this.t * 12 + c.phase, '#3A2A55', '#8A6FB0');
    ctx.fillStyle = '#FF2A4A';
    ctx.fillRect(-2.5, -1, 1.5, 1.5);
    ctx.fillRect(1, -1, 1.5, 1.5);
    ctx.restore();
    ctx.strokeStyle = '#9A9AB5';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let bx = -10; bx <= 10; bx += 5) {
      ctx.moveTo(bx, -20);
      ctx.lineTo(bx, 16);
    }
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-14, -22);
    ctx.quadraticCurveTo(0, -34, 14, -22);
    ctx.moveTo(-14, 16);
    ctx.lineTo(14, 16);
    ctx.stroke();
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, MIST, c.x, y, 30, 0.2);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Wrought-iron cemetery gate with a big N plaque. */
  _drawGate(ctx, g) {
    if (g.x > this.W + 40 || g.dead) return;
    const yb = this.groundY + OBSTACLE_BASE - g.base;
    const affordable = this.adultCount() >= g.n;
    const color = affordable ? HOLY : BLOOD;
    const top = -10;
    ctx.fillStyle = '#1B1B2C';
    ctx.fillRect(g.x, top, 8, yb - top);
    ctx.fillRect(g.x + g.w - 8, top, 8, yb - top);
    ctx.fillStyle = '#2E2E46';
    ctx.fillRect(g.x - 3, yb - 10, 14, 10);
    ctx.fillRect(g.x + g.w - 11, yb - 10, 14, 10);
    ctx.strokeStyle = '#2A2A3E';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let bx = g.x + 12; bx < g.x + g.w - 8; bx += 6.5) {
      ctx.moveTo(bx, top);
      ctx.lineTo(bx, yb);
    }
    for (let ry = yb - 24; ry > top; ry -= 120) {
      ctx.moveTo(g.x, ry);
      ctx.lineTo(g.x + g.w, ry);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA(color, 0.28 + 0.12 * Math.sin(this.t * 5));
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(g.x + 4, top);
    ctx.lineTo(g.x + 4, yb);
    ctx.moveTo(g.x + g.w - 4, top);
    ctx.lineTo(g.x + g.w - 4, yb);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    // N plaque
    const cx = g.x + g.w / 2;
    const cy = clamp(yb - 170, 96, yb - 90);
    ctx.fillStyle = '#16162A';
    roundRectPath(ctx, cx - 30, cy - 24, 60, 48, 8);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.font = 'bold 30px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(String(g.n), cx, cy + 1);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, color, cx, cy, 60, 0.4);
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawPowerIcon(ctx, type, color) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (type === 'shield') {
      // Night cloak
      ctx.fillStyle = '#0B0714';
      ctx.beginPath();
      ctx.moveTo(-7, -8);
      ctx.quadraticCurveTo(0, -12, 7, -8);
      ctx.lineTo(10, 9);
      ctx.quadraticCurveTo(5, 5, 3, 10);
      ctx.quadraticCurveTo(0, 5, -3, 10);
      ctx.quadraticCurveTo(-5, 5, -10, 9);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.fillStyle = BLOOD;
      ctx.fillRect(-2, -9, 4, 6);
    } else if (type === 'magnet') {
      // Blood Hunger: a drop
      ctx.fillStyle = BLOOD;
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.bezierCurveTo(8, -1, 8, 9, 0, 9);
      ctx.bezierCurveTo(-8, 9, -8, -1, 0, -11);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(-2.6, 2, 1.6, 3, 0.3, 0, TAU);
      ctx.fill();
    } else {
      // Blood Moon: a crescent with x2
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, -2, 9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(5, 8, 26, 0.95)';
      ctx.beginPath();
      ctx.arc(4, -4, 7.5, 0, TAU);
      ctx.fill();
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = BONE;
      ctx.fillText('x2', 0, 10);
    }
  }

  _drawPowerUp(ctx, p) {
    if (p.x > this.W + 30) return;
    const color = POWERUP_COLOR[p.type];
    const y = this.groundY - p.dy + Math.sin(this.t * 3.4 + p.phase) * 5;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, color, p.x, y, 44, 0.7);
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(p.x, y);
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, TAU);
    ctx.fillStyle = 'rgba(8, 5, 22, 0.92)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 21 + Math.sin(this.t * 6) * 1.5, 0, TAU);
    ctx.lineWidth = 1;
    ctx.strokeStyle = hexA(color, 0.4);
    ctx.stroke();
    this._drawPowerIcon(ctx, p.type, color);
    ctx.restore();
  }

  /** Floating basket platform that helps cross a long chasm. */
  _drawDeck(ctx, d) {
    if (d.x > this.W + 140 || d.x + d.w < -140) return;
    const yTop = this.groundY + 16 - d.top;
    const bob = Math.sin(this.t * 1.4 + d.phase) * 3;
    const cx = d.x + d.w / 2;
    this._drawBalloon(ctx, cx, yTop - 175 + bob, 1.25, 1, 1, this.t + d.phase);
    // Ropes from the envelope to the basket corners
    ctx.strokeStyle = '#2A1B18';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(d.x + 6, yTop);
    ctx.lineTo(cx - 14, yTop - 96 + bob);
    ctx.moveTo(d.x + d.w - 6, yTop);
    ctx.lineTo(cx + 14, yTop - 96 + bob);
    ctx.stroke();
    // Wicker basket
    ctx.fillStyle = '#5A3A24';
    ctx.fillRect(d.x, yTop, d.w, 24);
    ctx.fillStyle = '#6B4630';
    ctx.fillRect(d.x - 2, yTop - 3, d.w + 4, 5);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = d.x + 6; x < d.x + d.w; x += 9) {
      ctx.moveTo(x, yTop + 4);
      ctx.lineTo(x, yTop + 24);
    }
    for (let y = yTop + 9; y < yTop + 24; y += 7) {
      ctx.moveTo(d.x, y);
      ctx.lineTo(d.x + d.w, y);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, EMBER, cx, yTop - 70 + bob, 36, 0.45);
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- Villagers, vehicles, hunters ----------
  _drawVillager(ctx, v) {
    if (v.x > this.W + 40 || v.dead) return;
    const y = this.groundY + 18 - v.base;
    const turnT = v.turn > 0 ? 1 - v.turn / 0.3 : 1;
    const facing = v.flee ? -1 + 2 * turnT : -1;
    const swing = Math.sin(v.phase) * 4;
    ctx.save();
    ctx.translate(v.x, y);
    ctx.scale(facing, 1);
    ctx.fillStyle = 'rgba(0, 0, 10, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 1, 9, 2.6, 0, 0, TAU);
    ctx.fill();
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = '#2A1E18';
    ctx.beginPath();
    ctx.moveTo(-2, -10);
    ctx.lineTo(-2 + swing, -0.5);
    ctx.moveTo(3, -10);
    ctx.lineTo(3 - swing, -0.5);
    ctx.stroke();
    // Clothes
    ctx.fillStyle = v.color;
    if (v.kind === 'dress') {
      ctx.beginPath();
      ctx.moveTo(-6, -24);
      ctx.lineTo(6, -24);
      ctx.lineTo(9.5, -5);
      ctx.lineTo(-9.5, -5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(-9, -8, 18, 2.4);
    } else {
      roundRectPath(ctx, -6, -24, 12, 15, 3);
      ctx.fill();
      ctx.fillStyle = '#2A1E18';
      ctx.fillRect(-6, -16, 12, 2.2);
    }
    // Arms: up in fright when fleeing
    ctx.strokeStyle = v.skin;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-5, -22);
    ctx.lineTo(-8, v.flee ? -31 : -14 + swing * 0.2);
    ctx.moveTo(5, -22);
    ctx.lineTo(9, v.flee ? -31 : -14 - swing * 0.2);
    ctx.stroke();
    if (v.basket) {
      ctx.fillStyle = '#8A6234';
      ctx.beginPath();
      ctx.arc(9, -13, 4.6, 0, Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#5A3E20';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(9, -13, 4.6, Math.PI, 0);
      ctx.stroke();
    }
    // Head and headgear
    ctx.fillStyle = v.skin;
    ctx.beginPath();
    ctx.arc(0, -30, 6.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2A1E18';
    ctx.beginPath();
    ctx.arc(2.6, -30.4, 0.9, 0, TAU);
    ctx.fill();
    if (v.flee) {
      ctx.beginPath();
      ctx.ellipse(3, -27.4, 1, 1.5, 0, 0, TAU);
      ctx.fill();
    }
    if (v.kind === 'hood') {
      ctx.fillStyle = v.color;
      ctx.beginPath();
      ctx.arc(0, -30, 7.6, Math.PI * 0.95, Math.PI * 2.05);
      ctx.lineTo(-8, -24);
      ctx.closePath();
      ctx.fill();
    } else if (v.hat === 'cap') {
      ctx.fillStyle = '#5A3A2A';
      ctx.beginPath();
      ctx.arc(0, -31, 6.6, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(2, -32, 7, 2);
    } else if (v.hat === 'straw') {
      ctx.fillStyle = '#D8B868';
      ctx.beginPath();
      ctx.ellipse(0, -34, 10, 2.6, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -34, 5.4, Math.PI, 0);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawWheel(ctx, cx, cy, r, angle, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = angle + (i * Math.PI) / 3;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.stroke();
  }

  _drawHead(ctx, x, y, r, skin, hat) {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2A1E18';
    ctx.beginPath();
    ctx.arc(x + r * 0.4, y - r * 0.1, 0.9, 0, TAU);
    ctx.fill();
    if (hat === 'top') {
      ctx.fillStyle = '#100B18';
      ctx.fillRect(x - r * 0.9, y - r * 2.1, r * 1.8, r * 1.4);
      ctx.fillRect(x - r * 1.3, y - r * 0.9, r * 2.6, r * 0.34);
    } else if (hat === 'bonnet') {
      ctx.fillStyle = '#B04A5C';
      ctx.beginPath();
      ctx.arc(x - r * 0.1, y - r * 0.2, r * 1.15, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
    } else if (hat === 'flat') {
      ctx.fillStyle = '#4A3A2A';
      ctx.fillRect(x - r, y - r * 1.2, r * 2, r * 0.5);
    }
  }

  _drawVehicle(ctx, v) {
    if (v.x > this.W + 140 || v.dead) return;
    const y = this.groundY + 22 - v.base;
    ctx.save();
    ctx.translate(v.x, y);
    ctx.scale(-1, 1);
    ctx.globalAlpha = 1 - clamp(v.fade, 0, 1);
    ctx.fillStyle = 'rgba(0, 0, 10, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 1, v.w * 0.5, 4, 0, 0, TAU);
    ctx.fill();
    const riders = v.bitten ? 0 : v.passengers;
    const spin = (r) => (v.wheel * v.wr) / r;
    if (v.kind === 'bike') {
      // Penny-farthing with a top-hatted rider
      this._drawWheel(ctx, 10, -24, 24, spin(24), '#B7A8C8');
      this._drawWheel(ctx, -26, -8, 8, spin(8), '#B7A8C8');
      ctx.strokeStyle = '#B7A8C8';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(10, -24);
      ctx.lineTo(4, -50);
      ctx.lineTo(-26, -8);
      ctx.moveTo(4, -50);
      ctx.lineTo(14, -52);
      ctx.stroke();
      if (riders) {
        ctx.fillStyle = '#3A2A55';
        roundRectPath(ctx, -2, -68, 11, 20, 4);
        ctx.fill();
        this._drawHead(ctx, 3.5, -74, 6, '#F0D2B0', 'top');
        ctx.strokeStyle = '#3A2A55';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(6, -62);
        ctx.lineTo(14, -52);
        ctx.stroke();
      }
    } else if (v.kind === 'carriage') {
      // Horse (ahead, to the right in local space) pulling a black carriage
      const gallop = Math.sin(v.phase * 2.4) * 7;
      ctx.fillStyle = '#1A1218';
      ctx.beginPath();
      ctx.ellipse(66, -42, 24, 12, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(80, -48);
      ctx.lineTo(92, -66);
      ctx.lineTo(102, -64);
      ctx.lineTo(98, -54);
      ctx.lineTo(86, -38);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = '#1A1218';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(54, -36);
      ctx.lineTo(54 + gallop, -1);
      ctx.moveTo(60, -36);
      ctx.lineTo(60 - gallop, -1);
      ctx.moveTo(74, -36);
      ctx.lineTo(74 - gallop, -1);
      ctx.moveTo(80, -36);
      ctx.lineTo(80 + gallop, -1);
      ctx.moveTo(42, -46);
      ctx.quadraticCurveTo(36, -38, 40, -26);
      ctx.stroke();
      // Carriage body, window and lantern
      ctx.fillStyle = '#120C1C';
      roundRectPath(ctx, -46, -64, 84, 42, 8);
      ctx.fill();
      ctx.fillStyle = '#1D1430';
      ctx.fillRect(-46, -62, 84, 5);
      ctx.fillStyle = hexA(EMBER, 0.28);
      ctx.fillRect(-36, -52, 26, 18);
      ctx.fillRect(-4, -52, 26, 18);
      for (let i = 0; i < riders; i++) {
        this._drawHead(ctx, riders === 3 ? -30 + i * 18 : -26 + i * 24, -40, 5.5, pick(['#F0D2B0', '#E2B88F']), i === 1 ? 'bonnet' : 'top');
      }
      ctx.fillStyle = '#B8923A';
      ctx.fillRect(-46, -26, 84, 3);
      ctx.fillStyle = '#2A1E18';
      ctx.fillRect(36, -62, 10, 6);
      this._drawHead(ctx, 40, -70, 5.2, '#E2B88F', 'flat');
      this._drawWheel(ctx, -26, -18, 18, spin(18), '#B8923A');
      this._drawWheel(ctx, 26, -14, 14, spin(14), '#B8923A');
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, EMBER, 40, -54, 20, 0.7);
    } else {
      // Vintage automobile with brass lamps
      ctx.fillStyle = '#101018';
      roundRectPath(ctx, -46, -30, 92, 16, 5);
      ctx.fill();
      ctx.fillRect(14, -40, 34, 12);
      ctx.fillStyle = '#B8923A';
      ctx.fillRect(-46, -17, 92, 2.4);
      ctx.fillRect(48, -36, 4, 14);
      ctx.strokeStyle = '#B7A8C8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(8, -30);
      ctx.lineTo(10, -46);
      ctx.lineTo(24, -46);
      ctx.stroke();
      ctx.fillStyle = '#2A1E18';
      ctx.fillRect(-34, -38, 12, 8);
      ctx.fillRect(-12, -38, 12, 8);
      if (riders) {
        this._drawHead(ctx, -28, -45, 5.5, '#F0D2B0', 'top');
        this._drawHead(ctx, -6, -45, 5.5, '#E2B88F', 'bonnet');
      }
      this._drawWheel(ctx, -30, -10, 10, spin(10), '#B8923A');
      this._drawWheel(ctx, 30, -10, 10, spin(10), '#B8923A');
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, EMBER, 50, -28, 18, 0.8);
    }
    ctx.restore();
  }

  /** A vampire hunter with a lantern: stepping into its light burns a vampire into bats. */
  _drawGuard(ctx, g) {
    if (g.x > this.W + 60 || g.dead) return;
    const y = this.groundY + 20 - g.base;
    const swing = Math.sin(g.phase) * 4;
    const flick = 0.8 + 0.2 * Math.sin(this.t * 14 + g.phase);
    const ringPulse = 0.5 + 0.5 * Math.sin(this.t * 4);
    ctx.strokeStyle = hexA(EMBER, 0.2 + 0.25 * ringPulse);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(g.x - 14, y, 36 + ringPulse * 6, 9, 0, 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, '#FFE2A8', g.x - 30, y - 46, 62, 0.8 * flick);
    drawGlow(ctx, EMBER, g.x - 30, y - 46, 92, 0.3 * flick);
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(g.x, y);
    ctx.scale(-1, 1);
    ctx.fillStyle = 'rgba(0, 0, 10, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 1, 11, 3, 0, 0, TAU);
    ctx.fill();
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#120D0A';
    ctx.beginPath();
    ctx.moveTo(-3, -14);
    ctx.lineTo(-3 + swing, -1);
    ctx.moveTo(4, -14);
    ctx.lineTo(4 - swing, -1);
    ctx.stroke();
    // Long coat, belt and hat
    ctx.fillStyle = '#2B1F1A';
    ctx.beginPath();
    ctx.moveTo(-7, -38);
    ctx.lineTo(7, -38);
    ctx.lineTo(10, -8);
    ctx.lineTo(-10, -8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6A4A2A';
    ctx.fillRect(-7, -24, 14, 3);
    ctx.fillStyle = '#E2B88F';
    ctx.beginPath();
    ctx.arc(0, -43, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1A1410';
    ctx.beginPath();
    ctx.ellipse(0, -47, 11, 2.8, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -47, 6, Math.PI, 0);
    ctx.fill();
    // Arm and pole holding the lantern out front
    ctx.strokeStyle = '#2B1F1A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(5, -34);
    ctx.lineTo(26, -42);
    ctx.stroke();
    ctx.strokeStyle = '#4A3A2A';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(30, -62);
    ctx.lineTo(30, -26);
    ctx.stroke();
    ctx.fillStyle = '#FFE2A8';
    ctx.fillRect(26, -50, 8, 10);
    ctx.fillStyle = '#1A1410';
    ctx.fillRect(25, -52, 10, 2.4);
    ctx.fillRect(25, -41, 10, 2.4);
    ctx.restore();
  }

  // ---------- Horde ----------
  _drawSwarm(ctx) {
    if (!this.bots.length) return;
    const { groundY: gy } = this;
    const running = this.state === 'PLAYING' || this.state === 'PAUSED';
    const list = this.bots.slice().sort((a, b) => a.floorOff - b.floorOff);

    list.forEach((bot) => {
      const ground = this._groundAt(bot.x, bot.hy);
      if (ground === null) return;
      const y = gy + bot.floorOff - ground;
      const lift = 1 / (1 + Math.max(0, bot.hy - ground) / 160);
      ctx.fillStyle = `rgba(0, 0, 10, ${0.38 * lift})`;
      ctx.beginPath();
      ctx.ellipse(bot.x, y + 1, 13 * lift, 3.2 * lift, 0, 0, TAU);
      ctx.fill();
    });

    // Motion streaks behind each member, plus leader afterimages
    if (running && this.speed > 120) {
      const len = clamp(this.speed * 0.05, 8, 30);
      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(190, 170, 220, 0.16)';
      ctx.beginPath();
      list.forEach((bot) => {
        if (bot.hy < -10) return;
        const y = this._botScreenY(bot) - 16;
        ctx.moveTo(bot.x - 12, y);
        ctx.lineTo(bot.x - 12 - len, y);
      });
      ctx.stroke();
      this.ghosts.forEach((g) => {
        ctx.globalAlpha = (g.life / 0.22) * 0.2;
        drawVamp(ctx, g.x, g.y, { scale: 1.1, sx: g.sx, sy: g.sy, run: 0, air: false, standing: true, tip: 0, leader: false, flash: false });
      });
      ctx.globalAlpha = 1;
    }

    if (this.pu.shield > 0) this._drawCloak(ctx);

    const lead = this._lead();
    list.forEach((bot) => {
      const laneScale = LANE_SCALE[bot.floorOff < 9 ? 0 : (bot.floorOff < 22 ? 1 : 2)];
      const born = bot.born > 0 ? clamp(1 - bot.born / 0.28, 0, 1) : 1;
      let alpha = this.state === 'GAMEOVER' ? 0.5 : 1;
      if (bot.hy < 0) alpha *= clamp(1 + bot.hy / 260, 0.1, 1);
      drawVamp(ctx, bot.x, this._botScreenY(bot), {
        scale: (bot.fledgling ? 0.8 : 1.1) * laneScale * (0.4 + 0.6 * born),
        sx: bot.sx,
        sy: bot.sy + (running ? 0 : Math.sin(this.t * 2.4 + bot.tip) * 0.025),
        run: bot.run,
        air: !bot.grounded && bot.hy >= 0,
        standing: !running,
        flash: bot.flash > 0 && Math.floor(this.t * 20) % 2 === 0,
        leader: bot === lead && !bot.fledgling,
        fledgling: bot.fledgling,
        tip: bot.tip,
        alpha,
      });
    });

    if (this.pu.magnet > 0 && lead) {
      const y = this._botScreenY(lead) - 18;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) {
        const r = 30 + ((this.t * 60 + i * 35) % 70);
        ctx.strokeStyle = hexA(BLOOD, 0.55 * (1 - (r - 30) / 70));
        ctx.beginPath();
        ctx.arc(lead.x, y, r, 0, TAU);
        ctx.stroke();
      }
    }
  }

  /** Night Cloak: a bubble of dark mist around the horde. */
  _drawCloak(ctx) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    this.bots.forEach((bot) => {
      if (bot.hy < -10) return;
      const y = this._botScreenY(bot);
      minX = Math.min(minX, bot.x);
      maxX = Math.max(maxX, bot.x);
      minY = Math.min(minY, y - 46);
      maxY = Math.max(maxY, y + 2);
    });
    if (!Number.isFinite(minX)) return;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = (maxX - minX) / 2 + 34;
    const ry = (maxY - minY) / 2 + 22;
    const flicker = this.pu.shield < 2.5 && Math.sin(this.t * 22) > 0 ? 0.4 : 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    const grad = ctx.createRadialGradient(0, 0, rx * 0.4, 0, 0, rx);
    grad.addColorStop(0, 'rgba(20, 8, 44, 0)');
    grad.addColorStop(1, `rgba(60, 24, 110, ${0.5 * flicker})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hexA(MIST, 0.7 * flicker);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeStyle = hexA('#1A0A30', 0.5 * flicker);
    const sweep = this.t * 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, rx - 5, sweep, sweep + 1.1);
    ctx.stroke();
    ctx.restore();
  }

  _drawParticles(ctx) {
    // Soft dust and bats first (normal blending)
    this.particles.forEach((p) => {
      if (!p.active) return;
      const a = clamp(p.life / p.max, 0, 1);
      if (p.type === 4) {
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, p.size), 0, TAU);
        ctx.fill();
      } else if (p.type === 3) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, a * 1.5);
        ctx.translate(p.x, p.y);
        if (p.vx < 0) ctx.scale(-1, 1);
        drawBat(ctx, p.size, p.phase, '#1C1030', hexA('#B7A8E0', 0.9));
        ctx.restore();
      }
    });
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = 'lighter';
    this.particles.forEach((p) => {
      if (!p.active) return;
      const a = clamp(p.life / p.max, 0, 1);
      if (p.type === 1) {
        ctx.globalAlpha = a;
        ctx.lineWidth = 2.5 * a + 0.5;
        ctx.strokeStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.stroke();
      } else if (p.type === 0) {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        const s = p.size * (0.4 + 0.6 * a);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.type === 5) {
        // Bite flash: bright rays and a pair of fangs
        ctx.globalAlpha = a;
        ctx.strokeStyle = BONE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const ang = (i * TAU) / 8 + 0.2;
          ctx.moveTo(p.x + Math.cos(ang) * 6, p.y + Math.sin(ang) * 6);
          ctx.lineTo(p.x + Math.cos(ang) * (10 + p.size * (1 - a)), p.y + Math.sin(ang) * (10 + p.size * (1 - a)));
        }
        ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(p.x - 5, p.y - 4);
        ctx.lineTo(p.x - 1.5, p.y - 4);
        ctx.lineTo(p.x - 3.2, p.y + 5);
        ctx.moveTo(p.x + 1.5, p.y - 4);
        ctx.lineTo(p.x + 5, p.y - 4);
        ctx.lineTo(p.x + 3.2, p.y + 5);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 15px "JetBrains Mono", monospace';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(2, 4, 16, 0.85)';
    this.floatTexts.forEach((f) => {
      if (!f.active) return;
      ctx.globalAlpha = clamp(f.life / 0.4, 0, 1);
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
  }

  _drawSpeedLines(ctx) {
    if (this.state !== 'PLAYING' || this.reduced) return;
    const strength = clamp((this.speed - MAX_SPEED * 0.7) / (MAX_SPEED * 0.3), 0, 1);
    if (strength <= 0) return;
    ctx.strokeStyle = `rgba(200, 180, 240, ${0.08 + 0.14 * strength})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    this.speedLines.forEach((line) => {
      if (!line.len) return;
      ctx.moveTo(line.x, line.y);
      ctx.lineTo(line.x + line.len, line.y);
    });
    ctx.stroke();
  }

  // ============================
  // Loop
  // ============================
  _frame(now) {
    const dt = this.lastFrame ? clamp((now - this.lastFrame) / 1000, 0, MAX_DT) : 0;
    this.lastFrame = now;
    if (this.state !== 'PAUSED') this._update(dt);
    this._draw();
    requestAnimationFrame((time) => this._frame(time));
  }
}

new Nightfall();
