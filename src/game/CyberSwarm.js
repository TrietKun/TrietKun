/**
 * CYBER SWARM — Zombie Tsunami–style endless runner
 * Nanobots run through a cyber city, collect data nodes, avoid firewalls.
 * Single input: tap/space = jump.
 */

const CYAN = '#00D4FF';
const PURPLE = '#7C3AED';
const PINK = '#FF3A8C';
const GREEN = '#00FF88';
const WHITE = '#fff';

// Physics
const GRAVITY = 0.55;
const JUMP_FORCE = -10;
const HOLD_FORCE = -0.4; // stronger hold = higher jump
const GROUND_Y_RATIO = 0.75; // ground at 75% of screen height
const BASE_SPEED = 4;
const MAX_SPEED = 10;
const SPEED_INCREASE = 0.0008; // per frame

// Spawning
const MIN_GAP = 180;
const NODE_CHANCE = 0.04;
const OBSTACLE_CHANCE = 0.012;
const POWERUP_CHANCE = 0.003;

function rand(a, b) { return Math.random() * (b - a) + a; }

// ============================================
// BOT (individual swarm member)
// ============================================
class Bot {
  constructor(x, y, index) {
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.vy = 0;
    this.grounded = false;
    this.size = 16;
    this.index = index;
    this.phase = Math.random() * Math.PI * 2;
    this.alive = true;
    this.flashTimer = 0;
  }
}

// ============================================
// GAME
// ============================================
class CyberSwarm {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.W = 0;
    this.H = 0;
    this.groundY = 0;
    this._resize();

    this.state = 'START';
    this.score = 0;
    this.distance = 0;
    this.speed = BASE_SPEED;
    this.maxSwarm = 1;
    this.highScore = parseInt(localStorage.getItem('cyberSwarmHigh') || '0');
    this.time = 0;
    this.screenShake = 0;
    this.flashAlpha = 0;

    // Swarm
    this.bots = [];
    this.jumping = false;
    this.holdingJump = false;

    // World
    this.obstacles = [];
    this.nodes = [];
    this.powerUps = [];
    this.particles = [];
    this.bgBuildings = [];
    this.gridOffset = 0;

    this._generateBuildings();
    this._bindInput();
    this._updateHUD();
    this._loop();
  }

  _resize() {
    this._updateSize();
    window.addEventListener('resize', () => {
      this._updateSize();
      this._generateBuildings();
    });
    // Also listen for orientation change on mobile
    window.addEventListener('orientationchange', () => {
      setTimeout(() => { this._updateSize(); this._generateBuildings(); }, 200);
    });
  }

  _updateSize() {
    // If portrait on touch device, game is CSS-rotated — swap dimensions
    const isPortraitTouch = window.matchMedia('(orientation: portrait) and (pointer: coarse)').matches;
    if (isPortraitTouch) {
      this.W = window.innerHeight;
      this.H = window.innerWidth;
    } else {
      this.W = window.innerWidth;
      this.H = window.innerHeight;
    }
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.groundY = this.H * GROUND_Y_RATIO;
  }

  _generateBuildings() {
    this.bgBuildings = [];
    for (let i = 0; i < 30; i++) {
      this.bgBuildings.push({
        x: i * (this.W / 10) + rand(-20, 20),
        w: rand(30, 80),
        h: rand(60, 200),
        layer: Math.random() < 0.5 ? 0 : 1, // 0=far, 1=near
        hue: Math.random() < 0.5 ? 190 : 270,
      });
    }
  }

  // ============================
  // INPUT
  // ============================
  _bindInput() {
    const doJump = () => {
      if (this.state === 'START') { this._startGame(); return; }
      if (this.state === 'GAMEOVER') { this._startGame(); return; }
      if (this.state !== 'PLAYING') return;
      this.holdingJump = true;
      this._jump();
    };

    const endJump = () => {
      this.holdingJump = false;
    };

    // Keyboard
    window.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        doJump();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        endJump();
      }
    });

    // Mouse
    window.addEventListener('mousedown', (e) => {
      e.preventDefault();
      doJump();
    });
    window.addEventListener('mouseup', endJump);

    // Touch
    window.addEventListener('touchstart', (e) => {
      e.preventDefault();
      doJump();
    }, { passive: false });
    window.addEventListener('touchend', endJump);
  }

  _jump() {
    // All grounded bots jump with slight stagger
    let anyJumped = false;
    this.bots.forEach((bot, i) => {
      if (bot.grounded && bot.alive) {
        bot.vy = JUMP_FORCE - (i * 0.3); // slight stagger for wave effect
        bot.grounded = false;
        anyJumped = true;
      }
    });
    if (anyJumped) {
      this._spawnParticles(this.bots[0].x, this.groundY, CYAN, 5);
    }
  }

  _startGame() {
    this.state = 'PLAYING';
    this.score = 0;
    this.distance = 0;
    this.speed = BASE_SPEED;
    this.maxSwarm = 1;
    this.time = 0;
    this.screenShake = 0;
    this.obstacles = [];
    this.nodes = [];
    this.powerUps = [];
    this.particles = [];

    // Spawn initial bot
    this.bots = [new Bot(this.W * 0.15, this.groundY - 8, 0)];
    this.bots[0].grounded = true;

    document.getElementById('start-screen')?.classList.remove('active');
    document.getElementById('game-over-screen')?.classList.remove('active');
  }

  // ============================
  // SPAWNING
  // ============================
  _spawnNode() {
    const y = this.groundY - rand(15, 55);
    this.nodes.push({
      x: this.W + rand(0, 100),
      y,
      size: 14,
      collected: false,
      phase: rand(0, Math.PI * 2),
    });
  }

  _spawnObstacle() {
    const types = ['wall', 'spike', 'laser'];
    const type = types[Math.floor(rand(0, types.length))];
    let obs;

    if (type === 'wall') {
      const h = rand(30, 60);
      obs = { type, x: this.W + 20, y: this.groundY - h, w: 28, h, damage: 1 };
    } else if (type === 'spike') {
      obs = { type, x: this.W + 20, y: this.groundY - 22, w: 32, h: 22, damage: 2 };
    } else {
      // Laser beam — max height = jumpable
      const h = rand(50, 90);
      obs = { type, x: this.W + 20, y: this.groundY - h, w: 12, h, damage: 1, phase: rand(0, Math.PI * 2) };
    }
    this.obstacles.push(obs);
  }

  _spawnPowerUp() {
    const types = ['magnet', 'shield', 'multiply'];
    const type = types[Math.floor(rand(0, types.length))];
    this.powerUps.push({
      type,
      x: this.W + 20,
      y: this.groundY - rand(20, 55),
      size: 12,
    });
  }

  _spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: rand(-3, 3),
        vy: rand(-4, 1),
        size: rand(1, 3),
        color,
        life: rand(15, 35),
        maxLife: 35,
      });
    }
  }

  // ============================
  // UPDATE
  // ============================
  _update() {
    if (this.state !== 'PLAYING') return;
    this.time++;
    this.distance += this.speed * 0.1;
    this.speed = Math.min(MAX_SPEED, BASE_SPEED + this.time * SPEED_INCREASE);
    this.gridOffset = (this.gridOffset + this.speed) % 40;

    // --- Spawn world objects ---
    if (Math.random() < NODE_CHANCE + this.time * 0.000005) this._spawnNode();
    if (Math.random() < OBSTACLE_CHANCE + this.time * 0.000003) {
      // Check min gap from last obstacle
      const lastObs = this.obstacles[this.obstacles.length - 1];
      if (!lastObs || this.W + 20 - lastObs.x > MIN_GAP) {
        this._spawnObstacle();
      }
    }
    if (Math.random() < POWERUP_CHANCE) this._spawnPowerUp();

    // --- Update bots ---
    const leader = this.bots[0];
    this.bots.forEach((bot, i) => {
      if (!bot.alive) return;

      // Physics
      if (!bot.grounded) {
        bot.vy += GRAVITY;
        // Hold jump for extra lift
        if (this.holdingJump && bot.vy < 0) {
          bot.vy += HOLD_FORCE;
        }
        bot.y += bot.vy;
      }

      // Ground collision
      if (bot.y >= this.groundY - bot.size) {
        bot.y = this.groundY - bot.size;
        bot.vy = 0;
        bot.grounded = true;
      }

      // Formation: follow leader with offset
      if (i > 0) {
        const row = Math.floor(i / 3);
        const col = i % 3;
        bot.targetX = leader.x - (row + 1) * 22;
        bot.targetY = leader.y + (col - 1) * 16;
        bot.x += (bot.targetX - bot.x) * 0.08;
        // Only follow Y if grounded (don't pull mid-air)
        if (bot.grounded && leader.grounded) {
          bot.y += (bot.targetY - bot.y) * 0.05;
          bot.y = Math.min(bot.y, this.groundY - bot.size);
        }
      }

      // Bounce animation
      if (bot.grounded) {
        bot.y += Math.sin(this.time * 0.15 + bot.phase) * 0.5;
      }

      if (bot.flashTimer > 0) bot.flashTimer--;
    });

    // Remove dead bots
    this.bots = this.bots.filter(b => b.alive);
    if (this.bots.length === 0) {
      this._gameOver();
      return;
    }

    // --- Move world left ---
    this.nodes.forEach(n => n.x -= this.speed);
    this.obstacles.forEach(o => o.x -= this.speed);
    this.powerUps.forEach(p => p.x -= this.speed);

    // Cleanup offscreen
    this.nodes = this.nodes.filter(n => n.x > -30 && !n.collected);
    this.obstacles = this.obstacles.filter(o => o.x > -50);
    this.powerUps = this.powerUps.filter(p => p.x > -30);

    // --- Collision: Nodes ---
    this.nodes.forEach(n => {
      if (n.collected) return;
      this.bots.forEach(bot => {
        if (!bot.alive) return;
        if (Math.abs(bot.x - n.x) < 28 && Math.abs(bot.y - n.y) < 28) {
          n.collected = true;
          this.score += 10;
          this._addBot();
          this._spawnParticles(n.x, n.y, CYAN, 8);
        }
      });
    });

    // --- Collision: Obstacles ---
    this.obstacles.forEach(obs => {
      this.bots.forEach(bot => {
        if (!bot.alive || bot.flashTimer > 0) return;
        const bx = bot.x, by = bot.y, bs = bot.size;
        // AABB overlap
        if (bx + bs > obs.x && bx - bs < obs.x + obs.w &&
            by + bs > obs.y && by - bs < obs.y + obs.h) {
          // Remove bots from the back
          this._hitSwarm(obs.damage, obs.x, obs.y);
        }
      });
    });

    // --- Collision: Power-ups ---
    this.powerUps = this.powerUps.filter(pu => {
      for (const bot of this.bots) {
        if (Math.abs(bot.x - pu.x) < 20 && Math.abs(bot.y - pu.y) < 20) {
          this._collectPowerUp(pu);
          return false;
        }
      }
      return true;
    });

    // --- Particles ---
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.life--;
    });
    this.particles = this.particles.filter(p => p.life > 0);

    // --- Buildings scroll ---
    this.bgBuildings.forEach(b => {
      const spd = b.layer === 0 ? this.speed * 0.2 : this.speed * 0.5;
      b.x -= spd;
      if (b.x + b.w < 0) {
        b.x = this.W + rand(0, 100);
        b.h = rand(60, 200);
        b.w = rand(30, 80);
      }
    });

    // --- Score ---
    this.score += Math.floor(this.speed * 0.1);

    // --- Shake decay ---
    if (this.screenShake > 0) this.screenShake *= 0.85;
    if (this.screenShake < 0.3) this.screenShake = 0;
    if (this.flashAlpha > 0) this.flashAlpha -= 0.03;

    this._updateHUD();
  }

  _addBot() {
    const last = this.bots[this.bots.length - 1];
    const newBot = new Bot(last.x - 14, last.y, this.bots.length);
    newBot.grounded = last.grounded;
    newBot.vy = last.vy;
    newBot.flashTimer = 15; // brief flash on spawn
    this.bots.push(newBot);
    if (this.bots.length > this.maxSwarm) this.maxSwarm = this.bots.length;
  }

  _hitSwarm(damage, hx, hy) {
    for (let i = 0; i < damage; i++) {
      if (this.bots.length === 0) break;
      const victim = this.bots.pop();
      if (victim) {
        victim.alive = false;
        this._spawnParticles(victim.x, victim.y, PINK, 10);
      }
    }
    this.screenShake = 8;
    this.flashAlpha = 0.25;
  }

  _collectPowerUp(pu) {
    this._spawnParticles(pu.x, pu.y, GREEN, 12);
    if (pu.type === 'multiply') {
      // Double swarm size (up to +5)
      const toAdd = Math.min(5, this.bots.length);
      for (let i = 0; i < toAdd; i++) this._addBot();
      this.flashAlpha = 0.15;
    } else if (pu.type === 'shield') {
      // Brief invincibility
      this.bots.forEach(b => b.flashTimer = 120);
    } else if (pu.type === 'magnet') {
      // Pull all nearby nodes
      this.nodes.forEach(n => {
        if (n.x < this.W && n.x > 0) {
          n.x = this.bots[0].x;
          n.y = this.bots[0].y;
        }
      });
    }
    this.score += 50;
  }

  _gameOver() {
    this.state = 'GAMEOVER';
    this.screenShake = 15;
    this.flashAlpha = 0.4;

    const isNew = this.score > this.highScore;
    if (isNew) {
      this.highScore = this.score;
      localStorage.setItem('cyberSwarmHigh', String(this.score));
    }

    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('go-score', this.score.toLocaleString());
    el('go-dist', Math.floor(this.distance) + 'm');
    el('go-swarm', this.maxSwarm);
    el('go-high', this.highScore.toLocaleString());

    const highEl = document.getElementById('go-high');
    if (highEl) highEl.className = isNew ? 'stat-v new-high' : 'stat-v';

    document.getElementById('game-over-screen')?.classList.add('active');
  }

  _updateHUD() {
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('hud-score', this.score.toLocaleString());
    el('hud-swarm', `SWARM: ${this.bots.length}`);
    el('hud-distance', Math.floor(this.distance) + 'm');
    if (this.highScore > 0) el('hud-high', `BEST: ${this.highScore.toLocaleString()}`);
  }

  // ============================
  // DRAW
  // ============================
  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    // Shake
    ctx.save();
    if (this.screenShake > 0) {
      ctx.translate(rand(-1, 1) * this.screenShake, rand(-1, 1) * this.screenShake);
    }

    // --- Sky gradient ---
    const sky = ctx.createLinearGradient(0, 0, 0, this.H);
    sky.addColorStop(0, '#03050A');
    sky.addColorStop(0.6, '#080C18');
    sky.addColorStop(1, '#0A0F1C');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.W, this.H);

    // --- Background buildings ---
    this.bgBuildings.forEach(b => {
      const alpha = b.layer === 0 ? 0.06 : 0.1;
      ctx.fillStyle = `hsla(${b.hue}, 60%, 50%, ${alpha})`;
      ctx.fillRect(b.x, this.groundY - b.h, b.w, b.h);
      // Window dots
      ctx.fillStyle = `hsla(${b.hue}, 80%, 60%, ${alpha * 1.5})`;
      for (let wy = this.groundY - b.h + 10; wy < this.groundY - 5; wy += 15) {
        for (let wx = b.x + 5; wx < b.x + b.w - 5; wx += 12) {
          if (Math.random() > 0.3) ctx.fillRect(wx, wy, 4, 4);
        }
      }
    });

    // --- Grid floor ---
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.06)';
    ctx.lineWidth = 1;
    // Horizontal lines
    for (let y = this.groundY; y < this.H; y += 20) {
      ctx.globalAlpha = 0.5 - (y - this.groundY) / (this.H - this.groundY) * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.W, y);
      ctx.stroke();
    }
    // Vertical lines (scrolling)
    for (let x = -this.gridOffset; x < this.W + 40; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, this.groundY);
      ctx.lineTo(x, this.H);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // --- Ground line ---
    ctx.strokeStyle = CYAN;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, this.groundY);
    ctx.lineTo(this.W, this.groundY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // --- Nodes ---
    this.nodes.forEach(n => {
      if (n.collected) return;
      const pulse = Math.sin(this.time * 0.08 + n.phase) * 0.3 + 0.7;
      ctx.fillStyle = CYAN;
      ctx.shadowColor = CYAN;
      ctx.shadowBlur = 10;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(n.x, n.y + Math.sin(this.time * 0.05 + n.phase) * 3, n.size, 0, Math.PI * 2);
      ctx.fill();
      // Outer ring
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(n.x, n.y + Math.sin(this.time * 0.05 + n.phase) * 3, n.size + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    });

    // --- Obstacles ---
    this.obstacles.forEach(obs => {
      if (obs.type === 'wall') {
        ctx.fillStyle = PINK;
        ctx.shadowColor = PINK;
        ctx.shadowBlur = 8;
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        // Warning stripes
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        for (let sy = obs.y; sy < obs.y + obs.h; sy += 8) {
          ctx.fillRect(obs.x, sy, obs.w, 3);
        }
      } else if (obs.type === 'spike') {
        ctx.fillStyle = '#FF6B00';
        ctx.shadowColor = '#FF6B00';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(obs.x, obs.y + obs.h);
        ctx.lineTo(obs.x + obs.w / 2, obs.y);
        ctx.lineTo(obs.x + obs.w, obs.y + obs.h);
        ctx.closePath();
        ctx.fill();
      } else if (obs.type === 'laser') {
        const alpha = Math.sin(this.time * 0.1 + obs.phase) * 0.3 + 0.7;
        ctx.fillStyle = `rgba(255, 58, 140, ${alpha})`;
        ctx.shadowColor = PINK;
        ctx.shadowBlur = 12;
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
      }
      ctx.shadowBlur = 0;
    });

    // --- Power-ups ---
    this.powerUps.forEach(pu => {
      const colors = { magnet: PURPLE, shield: CYAN, multiply: GREEN };
      const labels = { magnet: 'M', shield: 'S', multiply: 'x2' };
      const color = colors[pu.type];
      const bob = Math.sin(this.time * 0.06) * 4;

      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(pu.x, pu.y + bob, pu.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[pu.type], pu.x, pu.y + bob);
    });

    // --- Bots (swarm) ---
    this.bots.forEach((bot, i) => {
      if (!bot.alive) return;
      const flash = bot.flashTimer > 0 && Math.floor(this.time / 4) % 2 === 0;

      // Trail glow
      ctx.fillStyle = `rgba(0, 212, 255, ${flash ? 0.15 : 0.05})`;
      ctx.beginPath();
      ctx.arc(bot.x - 4, bot.y, bot.size + 4, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.fillStyle = flash ? WHITE : (i === 0 ? '#00E5FF' : CYAN);
      ctx.shadowColor = flash ? WHITE : CYAN;
      ctx.shadowBlur = flash ? 15 : 6;
      ctx.beginPath();
      ctx.arc(bot.x, bot.y, bot.size, 0, Math.PI * 2);
      ctx.fill();

      // Eye
      ctx.fillStyle = '#000';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(bot.x + 5, bot.y - 3, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = WHITE;
      ctx.beginPath();
      ctx.arc(bot.x + 6, bot.y - 4, 1.8, 0, Math.PI * 2);
      ctx.fill();
    });

    // --- Particles ---
    this.particles.forEach(p => {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // --- Damage flash ---
    if (this.flashAlpha > 0) {
      ctx.fillStyle = `rgba(255, 30, 80, ${this.flashAlpha})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }

    ctx.restore();
  }

  // ============================
  // LOOP
  // ============================
  _loop() {
    this._update();
    this._draw();
    requestAnimationFrame(() => this._loop());
  }
}

new CyberSwarm();
