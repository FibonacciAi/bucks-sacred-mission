/**
 * Buck's Sacred Mission — core 2D scroller engine.
 * Controls: A/D move · W/Space jump (double) · J/Click shoot · K special
 */
import { LEVELS, ENEMY_STATS, ARMOR } from './data.js';
import { sfx } from './audio.js';

const DEFAULT_W = 1280;
const H = 720;
const GRAV = 2200;
const MOVE = 340;
const JUMP = 720;
const DBL_JUMP = 680;
const MAX_HP = 100;

export function createGame(canvas, assets, meta) {
  const ctx = canvas.getContext('2d');
  // The physics world stays 720px tall, while the visible camera narrows in
  // phone portrait mode so the action remains large and readable.
  let W = DEFAULT_W;
  const G = {
    assets,
    meta, // { armor, slabs, score, dpsMul, owned }
    levelIndex: 0,
    level: null,
    player: null,
    enemies: [],
    bullets: [],
    eBullets: [],
    pickups: [],
    particles: [],
    floating: [],
    camX: 0,
    moveAxis: 0,
    shake: 0,
    time: 0,
    keys: Object.create(null),
    mouse: { x: 0, y: 0, down: false },
    paused: false,
    over: false,
    won: false,
    bossIntro: 0,
    toast: null,
    toastT: 0,
    exitFlash: 0,
    cleared: false,
    onEvent: null, // (type, payload) => void
  };

  function armorDR() {
    const a = G.meta.armor || 'none';
    if (a === 'both') return ARMOR.both.dr;
    if (a === 'socks') return ARMOR.socks.dr;
    if (a === 'undies') return ARMOR.undies.dr;
    // both pieces owned separately
    let dr = 0;
    if (G.meta.owned?.socks) dr += ARMOR.socks.dr;
    if (G.meta.owned?.undies) dr += ARMOR.undies.dr;
    return Math.min(0.5, dr);
  }

  function armorLabel() {
    const s = G.meta.owned?.socks;
    const u = G.meta.owned?.undies;
    if (s && u) return 'FULL LOADOUT';
    if (u) return 'ROCKET UNDIES';
    if (s) return 'DIAMOND SOCKS';
    return 'NONE';
  }

  function spawnParticles(x, y, color, n = 10, speed = 200) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      G.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 80,
        life: 0.3 + Math.random() * 0.5,
        max: 0.8,
        color,
        size: 2 + Math.random() * 4,
      });
    }
  }

  function floatText(x, y, text, color = '#fff') {
    G.floating.push({ x, y, text, color, life: 0.9, vy: -50 });
  }

  function toast(msg, t = 1.6) {
    G.toast = msg;
    G.toastT = t;
    G.onEvent?.('toast', msg);
  }

  function makePlayer() {
    return {
      x: 120,
      y: G.level.floorY - 90,
      w: 64,
      h: 80,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: false,
      jumps: 0,
      hp: MAX_HP,
      invuln: 0,
      shootCd: 0,
      diamondT: 0,
      bullishT: 0,
      anim: 0,
      hurtFlash: 0,
    };
  }

  function makeEnemy(spec) {
    const st = ENEMY_STATS[spec.type];
    const e = {
      type: spec.type,
      x: spec.x,
      y: spec.y || G.level.floorY - st.h,
      w: st.w,
      h: st.h,
      hp: st.hp,
      maxHp: st.hp,
      vx: 0,
      vy: 0,
      facing: -1,
      shootCd: 1 + Math.random(),
      hurt: 0,
      alive: true,
      phase: 0,
      phaseT: 0,
      fly: !!st.fly,
      boss: !!st.boss,
      bob: Math.random() * Math.PI * 2,
    };
    if (e.fly) e.y = spec.y || 280;
    if (e.boss) {
      e.y = G.level.floorY - e.h;
      e.phase = 0;
      e.phaseT = 2;
    }
    return e;
  }

  function makePickup(spec) {
    return {
      type: spec.type,
      x: spec.x,
      y: spec.y,
      w: 40,
      h: 40,
      bob: Math.random() * Math.PI * 2,
      taken: false,
      secret: !!spec.secret,
    };
  }

  function loadLevel(index) {
    G.levelIndex = index;
    G.level = LEVELS[index];
    G.player = makePlayer();
    G.enemies = G.level.enemies.map(makeEnemy);
    if (G.level.boss) G.enemies.push(makeEnemy(G.level.boss));
    G.pickups = G.level.pickups.map(makePickup);
    G.bullets = [];
    G.eBullets = [];
    G.particles = [];
    G.floating = [];
    G.camX = 0;
    G.shake = 0;
    G.over = false;
    G.won = false;
    G.paused = false;
    G.cleared = false;
    G.bossIntro = G.level.boss ? 2.2 : 0;
    G.exitFlash = 0;
    if (G.level.boss) {
      sfx.boss();
      toast('⚠ CEO DETECTED — SACRED MISSION LIVE', 2.5);
    }
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function solidAt(x, y, w, h, prevBottom, vy) {
    // floor
    const floor = G.level.floorY;
    if (y + h >= floor && prevBottom <= floor + 8) {
      return { y: floor - h, kind: 'floor' };
    }
    // platforms — only land from above
    if (vy >= -20) {
      for (const p of G.level.platforms) {
        const withinX = x + w > p.x + 4 && x < p.x + p.w - 4;
        const wasAbove = prevBottom <= p.y + 6;
        const nowOn = y + h >= p.y && y + h <= p.y + p.h + 16;
        if (withinX && wasAbove && nowOn) {
          return { y: p.y - h, kind: 'plat' };
        }
      }
    }
    return null;
  }

  function shootPlayer() {
    const p = G.player;
    if (p.shootCd > 0) return;
    const dps = G.meta.dpsMul || 1;
    const diamond = p.diamondT > 0;
    const mul = dps * (diamond ? 2.2 : 1);
    p.shootCd = diamond ? 0.12 : 0.22;
    const speed = 720;
    G.bullets.push({
      x: p.x + (p.facing > 0 ? p.w - 8 : -12),
      y: p.y + p.h * 0.42,
      w: 28,
      h: 18,
      vx: p.facing * speed,
      vy: (Math.random() - 0.5) * 30,
      dmg: 12 * mul,
      life: 1.4,
      spin: 0,
    });
    // multi-shot when diamond hands
    if (diamond) {
      for (const ang of [-0.18, 0.18]) {
        G.bullets.push({
          x: p.x + (p.facing > 0 ? p.w - 8 : -12),
          y: p.y + p.h * 0.42,
          w: 24,
          h: 16,
          vx: Math.cos(ang) * p.facing * speed,
          vy: Math.sin(ang) * speed * 0.5,
          dmg: 8 * mul,
          life: 1.1,
          spin: 0,
        });
      }
    }
    sfx.shoot();
    spawnParticles(p.x + (p.facing > 0 ? p.w : 0), p.y + p.h * 0.42, '#9b6bff', 4, 120);
  }

  function hurtPlayer(dmg, srcX) {
    const p = G.player;
    if (p.invuln > 0 || p.bullishT > 0 || G.over) return;
    const dr = armorDR();
    const final = Math.max(1, Math.round(dmg * (1 - dr)));
    p.hp -= final;
    p.invuln = 0.9;
    p.hurtFlash = 0.25;
    p.vx += (p.x < srcX ? -1 : 1) * 220;
    p.vy = -240;
    G.shake = 10;
    sfx.hurt();
    floatText(p.x + p.w / 2, p.y, `-${final}`, '#ff4d6a');
    if (p.hp <= 0) {
      p.hp = 0;
      G.over = true;
      sfx.die();
      spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#fff', 30, 320);
      G.onEvent?.('death');
    }
  }

  function killEnemy(e) {
    e.alive = false;
    e.hp = 0;
    const st = ENEMY_STATS[e.type];
    G.meta.score += st.score;
    sfx.explode();
    G.shake = e.boss ? 22 : 8;
    spawnParticles(e.x + e.w / 2, e.y + e.h / 2, e.boss ? '#ffd166' : '#4de1ff', e.boss ? 40 : 16, 280);
    floatText(e.x + e.w / 2, e.y, `+${st.score}`, '#ffd166');
    // occasional powerpack drop for playability
    if (!e.boss && Math.random() < 0.28) {
      G.pickups.push({
        type: 'powerpack',
        x: e.x + e.w / 2 - 18,
        y: Math.min(e.y, G.level.floorY - 50),
        w: 36, h: 36, bob: 0, taken: false, secret: false,
      });
    }
    if (e.boss) {
      G.won = true;
      G.over = true;
      sfx.win();
      toast('CEO ELIMINATED — PHYSICAL MEDIA WINS', 3);
      G.onEvent?.('win');
    }
  }

  function pickup(p) {
    const pl = G.player;
    p.taken = true;
    if (p.type === 'powerpack') {
      const heal = 35;
      pl.hp = Math.min(MAX_HP, pl.hp + heal);
      sfx.pickup();
      floatText(p.x, p.y, `+${heal} HP`, '#3dff9a');
      toast('POWERPACK RIPPED');
    } else if (p.type === 'diamond') {
      pl.diamondT = 8;
      G.meta.dpsMul = Math.max(G.meta.dpsMul || 1, 1.15);
      sfx.power();
      toast('💎 DIAMOND HANDS — +DPS');
    } else if (p.type === 'bullish') {
      pl.bullishT = 6;
      sfx.power();
      toast('🐂 BULLISH — INVINCIBLE');
    } else if (p.type === 'slab') {
      G.meta.slabs = (G.meta.slabs || 0) + 1;
      G.meta.score += 500;
      sfx.slab();
      floatText(p.x, p.y, 'SLAB!', '#9b6bff');
      toast(p.secret ? '🃏 SECRET SLAB FOUND' : '🃏 SLAB ACQUIRED');
    }
    spawnParticles(p.x + 20, p.y + 20, '#fff', 12, 160);
    G.onEvent?.('hud');
  }

  function updatePlayer(dt) {
    const p = G.player;
    const left = G.keys['KeyA'] || G.keys['ArrowLeft'];
    const right = G.keys['KeyD'] || G.keys['ArrowRight'];
    const jump = G.keys['KeyW'] || G.keys['Space'] || G.keys['ArrowUp'];

    let ax = Math.max(-1, Math.min(1, G.moveAxis || 0));
    if (Math.abs(ax) < 0.04) {
      ax = 0;
      if (left) ax -= 1;
      if (right) ax += 1;
    }
    if (Math.abs(ax) > 0.05) p.facing = ax < 0 ? -1 : 1;

    const target = ax * MOVE * (p.diamondT > 0 ? 1.15 : 1);
    p.vx += (target - p.vx) * Math.min(1, 12 * dt);
    if (ax === 0) p.vx *= Math.pow(0.001, dt);

    // jump edge
    if (jump && !G.keys._jumpHeld) {
      if (p.onGround) {
        p.vy = -JUMP;
        p.onGround = false;
        p.jumps = 1;
        sfx.jump();
        spawnParticles(p.x + p.w / 2, p.y + p.h, '#4de1ff', 6, 100);
      } else if (p.jumps < 2) {
        p.vy = -DBL_JUMP;
        p.jumps = 2;
        sfx.jump();
        spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#ffd166', 10, 160);
      }
    }
    G.keys._jumpHeld = jump;

    p.vy += GRAV * dt;
    p.x += p.vx * dt;
    const prevBottom = p.y + p.h;
    p.y += p.vy * dt;

    // bounds
    p.x = Math.max(0, Math.min(G.level.width - p.w, p.x));
    if (p.y > H + 200) {
      hurtPlayer(999, p.x);
    }

    // collisions
    const wasGround = p.onGround;
    p.onGround = false;
    const hit = solidAt(p.x, p.y, p.w, p.h, prevBottom, p.vy);
    if (hit) {
      p.y = hit.y;
      if (!wasGround && p.vy > 200) sfx.land();
      p.vy = 0;
      p.onGround = true;
      p.jumps = 0;
    }

    if (p.shootCd > 0) p.shootCd -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.hurtFlash > 0) p.hurtFlash -= dt;
    if (p.diamondT > 0) p.diamondT -= dt;
    if (p.bullishT > 0) p.bullishT -= dt;
    p.anim += dt;

    if (G.keys['KeyJ'] || G.mouse.down) shootPlayer();

    // K activates leftover diamond if any — or just a small dash
    if (G.keys['KeyK'] && !G.keys._kHeld) {
      dashPlayer(p.facing);
    }
    G.keys._kHeld = !!G.keys['KeyK'];

    // exit
    if (!G.level.boss && !G.cleared && p.x + p.w >= G.level.exitX) {
      G.exitFlash += dt;
      if (G.exitFlash > 0.25) {
        G.cleared = true;
        G.over = true;
        G.onEvent?.('levelclear');
      }
    }
  }

  function dashPlayer(direction = G.player?.facing || 1) {
    const p = G.player;
    if (!p || G.paused || G.over || p.bullishT > 0 || p.diamondT > 0) return false;
    p.facing = direction < 0 ? -1 : 1;
    p.vx = p.facing * 520;
    p.vy = -120;
    p.invuln = Math.max(p.invuln, 0.25);
    spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#fff', 8, 200);
    sfx.dash();
    return true;
  }

  function updateEnemies(dt) {
    const p = G.player;
    for (const e of G.enemies) {
      if (!e.alive) continue;
      e.hurt = Math.max(0, e.hurt - dt);
      e.bob += dt * 3;
      const st = ENEMY_STATS[e.type];

      if (e.boss) {
        updateBoss(e, dt);
      } else if (e.fly) {
        e.y += Math.sin(e.bob) * 40 * dt;
        e.x += Math.sin(e.bob * 0.5) * 30 * dt;
        const dx = p.x - e.x;
        e.facing = dx >= 0 ? 1 : -1;
        e.x += Math.sign(dx) * st.speed * 0.35 * dt;
      } else {
        const dx = p.x - e.x;
        e.facing = dx >= 0 ? 1 : -1;
        if (Math.abs(dx) > 40) e.x += Math.sign(dx) * st.speed * dt;
        // stay on floor
        e.y = G.level.floorY - e.h;
        // simple platform awareness — stay ground mostly
      }

      // shoot
      if (st.shoot) {
        e.shootCd -= dt;
        if (e.shootCd <= 0 && Math.abs(p.x - e.x) < 700) {
          e.shootCd = e.boss ? 0.55 : e.type === 'lawyer' ? 1.4 : 1.1;
          const dir = Math.sign(p.x - e.x) || -1;
          const speed = e.boss ? 380 : 300;
          G.eBullets.push({
            x: e.x + e.w / 2,
            y: e.y + e.h * 0.35,
            w: e.boss ? 22 : 14,
            h: e.boss ? 22 : 14,
            vx: dir * speed,
            vy: e.boss ? (p.y - e.y) * 0.15 : 0,
            dmg: st.damage,
            life: 2.5,
            boss: e.boss,
          });
          sfx.enemyShoot();
        }
      }

      // contact damage (i-frames handle spam; still knock back)
      if (rectsOverlap(p, e) && p.invuln <= 0) {
        hurtPlayer(st.damage, e.x + e.w / 2);
      }
    }
  }

  function updateBoss(e, dt) {
    const p = G.player;
    e.phaseT -= dt;
    const st = ENEMY_STATS.ceo;

    if (e.phase === 0) {
      // patrol / chase
      const dx = p.x - e.x;
      e.facing = dx >= 0 ? 1 : -1;
      e.x += Math.sign(dx) * st.speed * dt;
      e.y = G.level.floorY - e.h;
      if (e.phaseT <= 0) {
        e.phase = 1;
        e.phaseT = 1.8;
        toast('CEO: FORCED DIGITAL UPDATE', 1.2);
      }
    } else if (e.phase === 1) {
      // slam jump
      if (e.phaseT > 1.2 && e.phaseT < 1.25) {
        e.vy = -700;
      }
      e.vy = (e.vy || 0) + GRAV * dt;
      e.y += (e.vy || 0) * dt;
      e.x += e.facing * 120 * dt;
      if (e.y >= G.level.floorY - e.h) {
        e.y = G.level.floorY - e.h;
        e.vy = 0;
        if (e.phaseT < 1.1) {
          G.shake = 16;
          sfx.explode();
          // shockwave bullets
          for (const dir of [-1, 1]) {
            G.eBullets.push({
              x: e.x + e.w / 2, y: e.y + e.h - 20,
              w: 28, h: 16, vx: dir * 420, vy: 0, dmg: 20, life: 2, boss: true,
            });
          }
          e.phase = 2;
          e.phaseT = 2.5;
        }
      }
    } else if (e.phase === 2) {
      // laser barrage
      e.y = G.level.floorY - e.h;
      if (Math.floor(e.phaseT * 4) !== Math.floor((e.phaseT + dt) * 4)) {
        const ang = Math.atan2(p.y + p.h / 2 - (e.y + 40), p.x - (e.x + e.w / 2));
        G.eBullets.push({
          x: e.x + e.w / 2,
          y: e.y + 40,
          w: 16, h: 16,
          vx: Math.cos(ang) * 440,
          vy: Math.sin(ang) * 440,
          dmg: 16, life: 2.2, boss: true,
        });
      }
      if (e.phaseT <= 0) {
        e.phase = 0;
        e.phaseT = 2.5 + (1 - e.hp / e.maxHp) * 1.5;
      }
    }

    // enrage at half
    if (e.hp < e.maxHp * 0.45 && !e.enraged) {
      e.enraged = true;
      toast('CEO ENRAGED — DIAMOND HANDS RECOMMENDED', 2);
      sfx.boss();
    }

    e.x = Math.max(100, Math.min(G.level.width - e.w - 100, e.x));
  }

  function updateBullets(dt) {
    // player carts
    for (const b of G.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.spin += dt * 12;
      for (const e of G.enemies) {
        if (!e.alive) continue;
        if (rectsOverlap(b, e)) {
          b.life = 0;
          e.hp -= b.dmg;
          e.hurt = 0.12;
          sfx.hit();
          spawnParticles(b.x, b.y, '#ff4d9a', 6, 140);
          floatText(e.x + e.w / 2, e.y, `${Math.round(b.dmg)}`, '#ff9ecd');
          if (e.hp <= 0) killEnemy(e);
          break;
        }
      }
    }
    G.bullets = G.bullets.filter((b) => b.life > 0 && b.x > G.camX - 40 && b.x < G.camX + W + 40);

    // enemy
    for (const b of G.eBullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (rectsOverlap(b, G.player)) {
        b.life = 0;
        hurtPlayer(b.dmg, b.x);
      }
    }
    G.eBullets = G.eBullets.filter((b) => b.life > 0);
  }

  function updatePickups(dt) {
    for (const p of G.pickups) {
      if (p.taken) continue;
      p.bob += dt * 3;
      if (rectsOverlap(G.player, p)) pickup(p);
    }
  }

  function updateFx(dt) {
    for (const pt of G.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 400 * dt;
      pt.life -= dt;
    }
    G.particles = G.particles.filter((p) => p.life > 0);
    for (const f of G.floating) {
      f.y += f.vy * dt;
      f.life -= dt;
    }
    G.floating = G.floating.filter((f) => f.life > 0);
    if (G.toastT > 0) G.toastT -= dt;
    if (G.shake > 0) G.shake = Math.max(0, G.shake - 30 * dt);
  }

  function update(dt) {
    if (G.paused || G.over) {
      updateFx(dt);
      return;
    }
    G.time += dt;
    if (G.bossIntro > 0) {
      G.bossIntro -= dt;
      // still allow slight cam
      const boss = G.enemies.find((e) => e.boss && e.alive);
      if (boss) {
        G.camX += (boss.x + boss.w / 2 - W / 2 - G.camX) * Math.min(1, 3 * dt);
      }
      updateFx(dt);
      return;
    }
    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updatePickups(dt);
    updateFx(dt);

    // camera
    const target = G.player.x + G.player.w / 2 - W * 0.4;
    G.camX += (target - G.camX) * Math.min(1, 6 * dt);
    G.camX = Math.max(0, Math.min(G.level.width - W, G.camX));
  }

  // ─── DRAW ───
  function drawBg() {
    const bg = G.assets[`bg${G.levelIndex}`];
    const parallax = G.camX * 0.35;
    if (bg) {
      // tile / cover
      const scale = Math.max(W / bg.width, H / bg.height) * 1.15;
      const bw = bg.width * scale;
      const bh = bg.height * scale;
      const ox = -((parallax * 0.5) % bw);
      ctx.drawImage(bg, ox, H - bh, bw, bh);
      if (ox + bw < W) ctx.drawImage(bg, ox + bw - 1, H - bh, bw, bh);
      ctx.fillStyle = 'rgba(5,8,18,0.35)';
      ctx.fillRect(0, 0, W, H);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, G.level.sky[0]);
      g.addColorStop(0.5, G.level.sky[1]);
      g.addColorStop(1, G.level.sky[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // atmospheric haze
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, W, H * 0.2);
  }

  function worldX(x) {
    return x - G.camX;
  }

  function drawPlatforms() {
    // floor
    const fy = G.level.floorY;
    const grd = ctx.createLinearGradient(0, fy, 0, H);
    grd.addColorStop(0, '#1a2238');
    grd.addColorStop(1, '#0a0e18');
    ctx.fillStyle = grd;
    ctx.fillRect(0, fy - G.camX * 0, W, H - fy + 20);

    // floor line glow
    ctx.strokeStyle = G.level.accent;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, fy);
    ctx.lineTo(W, fy);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // grid on floor
    ctx.strokeStyle = 'rgba(100,140,255,0.08)';
    ctx.lineWidth = 1;
    for (let x = -((G.camX) % 80); x < W; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, fy);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    for (const p of G.level.platforms) {
      const x = worldX(p.x);
      if (x + p.w < -20 || x > W + 20) continue;
      const g = ctx.createLinearGradient(x, p.y, x, p.y + p.h);
      g.addColorStop(0, '#3a4a6a');
      g.addColorStop(1, '#1a2438');
      ctx.fillStyle = g;
      ctx.fillRect(x, p.y, p.w, p.h);
      ctx.fillStyle = G.level.accent;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(x, p.y, p.w, 3);
      ctx.globalAlpha = 1;
      // legs
      ctx.fillStyle = 'rgba(20,28,44,0.8)';
      ctx.fillRect(x + 8, p.y + p.h, 6, 18);
      ctx.fillRect(x + p.w - 14, p.y + p.h, 6, 18);
    }

    // exit marker
    if (!G.level.boss) {
      const ex = worldX(G.level.exitX);
      if (ex > -40 && ex < W + 40) {
        ctx.save();
        ctx.globalAlpha = 0.5 + Math.sin(G.time * 4) * 0.25;
        ctx.fillStyle = '#3dff9a';
        ctx.fillRect(ex, fy - 140, 8, 140);
        ctx.font = '700 14px Orbitron, sans-serif';
        ctx.fillText('EXIT', ex - 10, fy - 150);
        ctx.restore();
      }
    }
  }

  function drawSprite(img, x, y, w, h, flip, flash) {
    if (!img) {
      ctx.fillStyle = flash ? '#fff' : '#ccc';
      ctx.fillRect(x, y, w, h);
      return;
    }
    ctx.save();
    if (flip) {
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      x = 0; y = 0;
    }
    if (flash) {
      ctx.filter = 'brightness(3)';
    }
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    ctx.filter = 'none';
  }

  function drawPlayer() {
    const p = G.player;
    const x = worldX(p.x);
    const img = (!p.onGround || p.jumps > 0) ? G.assets.buckFly : G.assets.buckIdle;
    const bob = p.onGround ? Math.sin(p.anim * 10) * 2 : 0;
    if (p.invuln > 0 && Math.floor(G.time * 20) % 2 === 0 && p.bullishT <= 0) {
      ctx.globalAlpha = 0.45;
    }
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + p.w / 2, G.level.floorY - 4, p.w * 0.35, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // bullish aura
    if (p.bullishT > 0) {
      ctx.save();
      ctx.shadowColor = '#3dff9a';
      ctx.shadowBlur = 28;
      ctx.strokeStyle = 'rgba(61,255,154,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 4, p.y + bob - 4, p.w + 8, p.h + 8);
      ctx.restore();
    }
    if (p.diamondT > 0) {
      ctx.save();
      ctx.shadowColor = '#4de1ff';
      ctx.shadowBlur = 22;
      ctx.strokeStyle = 'rgba(77,225,255,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 2, p.y + bob - 2, p.w + 4, p.h + 4);
      ctx.restore();
    }

    drawSprite(img, x, p.y + bob, p.w, p.h, p.facing < 0, p.hurtFlash > 0);
    ctx.globalAlpha = 1;

    // eyes glow when powered
    if (p.diamondT > 0 || p.bullishT > 0) {
      ctx.fillStyle = p.bullishT > 0 ? '#3dff9a' : '#ffd166';
      ctx.globalAlpha = 0.5 + Math.sin(G.time * 12) * 0.3;
      const ex = p.facing > 0 ? x + p.w * 0.55 : x + p.w * 0.25;
      ctx.beginPath();
      ctx.arc(ex, p.y + bob + p.h * 0.32, 4, 0, Math.PI * 2);
      ctx.arc(ex + p.facing * 10, p.y + bob + p.h * 0.32, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawEnemies() {
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const x = worldX(e.x);
      if (x + e.w < -50 || x > W + 50) continue;
      const img = G.assets[e.type];
      const bob = e.fly ? Math.sin(e.bob) * 4 : 0;

      // boss intro zoom focus ring
      if (e.boss) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,77,106,0.5)';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.4 + Math.sin(G.time * 5) * 0.2;
        ctx.strokeRect(x - 8, e.y - 8, e.w + 16, e.h + 16);
        ctx.restore();
        // hp bar
        const bw = 200;
        const bx = x + e.w / 2 - bw / 2;
        const by = e.y - 28;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(bx, by, bw, 12);
        ctx.fillStyle = '#ff4d6a';
        ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), 12);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.strokeRect(bx, by, bw, 12);
        ctx.font = '700 11px Orbitron, sans-serif';
        ctx.fillStyle = '#ffd166';
        ctx.textAlign = 'center';
        ctx.fillText('CEO — DIGITAL ONLY', x + e.w / 2, by - 6);
        ctx.textAlign = 'left';
      }

      drawSprite(img, x, e.y + bob, e.w, e.h, e.facing > 0, e.hurt > 0);

      // small hp for non-boss
      if (!e.boss && e.hp < e.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x, e.y - 10, e.w, 5);
        ctx.fillStyle = '#ff4d6a';
        ctx.fillRect(x, e.y - 10, e.w * (e.hp / e.maxHp), 5);
      }
    }
  }

  function drawBullets() {
    for (const b of G.bullets) {
      const x = worldX(b.x);
      ctx.save();
      ctx.translate(x + b.w / 2, b.y + b.h / 2);
      ctx.rotate(b.spin);
      if (G.assets.cartridge) {
        ctx.drawImage(G.assets.cartridge, -b.w / 2, -b.h / 2, b.w, b.h);
      } else {
        ctx.fillStyle = '#9b6bff';
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      }
      ctx.restore();
      // trail
      ctx.fillStyle = 'rgba(155,107,255,0.35)';
      ctx.fillRect(x - Math.sign(b.vx) * 12, b.y + 4, 12, 6);
    }
    for (const b of G.eBullets) {
      const x = worldX(b.x);
      ctx.fillStyle = b.boss ? '#ff4d6a' : '#ff9a3d';
      ctx.shadowColor = b.boss ? '#ff4d6a' : '#ff9a3d';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(x + b.w / 2, b.y + b.h / 2, b.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawPickups() {
    for (const p of G.pickups) {
      if (p.taken) continue;
      const x = worldX(p.x);
      if (x < -40 || x > W + 40) continue;
      const bob = Math.sin(p.bob) * 6;
      const map = {
        powerpack: 'powerpack',
        diamond: 'diamond',
        bullish: 'bullish',
        slab: 'slab',
      };
      const img = G.assets[map[p.type]];
      // glow
      ctx.save();
      ctx.shadowColor = p.type === 'slab' ? '#9b6bff' : p.type === 'bullish' ? '#3dff9a' : p.type === 'diamond' ? '#4de1ff' : '#ffd166';
      ctx.shadowBlur = 16;
      if (img) ctx.drawImage(img, x, p.y + bob, p.w, p.h);
      else {
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, p.y + bob, p.w, p.h);
      }
      ctx.restore();
      if (p.secret) {
        ctx.font = '10px Orbitron, sans-serif';
        ctx.fillStyle = 'rgba(155,107,255,0.8)';
        ctx.fillText('SLAB', x + 4, p.y + bob - 4);
      }
    }
  }

  function drawParticles() {
    for (const pt of G.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.fillRect(worldX(pt.x), pt.y, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    for (const f of G.floating) {
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.font = '700 14px Orbitron, sans-serif';
      ctx.fillStyle = f.color;
      ctx.textAlign = 'center';
      ctx.fillText(f.text, worldX(f.x), f.y);
    }
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  function drawBossIntro() {
    if (G.bossIntro <= 0) return;
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.55, G.bossIntro * 0.3)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.font = '900 36px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4d6a';
    ctx.shadowColor = '#ff4d6a';
    ctx.shadowBlur = 20;
    ctx.fillText('THE CEO', W / 2, H / 2 - 10);
    ctx.font = '700 16px Orbitron, sans-serif';
    ctx.fillStyle = '#ffd166';
    ctx.fillText('DIGITAL ONLY · NO MERCY', W / 2, H / 2 + 28);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
  }

  function draw() {
    const sx = G.shake ? (Math.random() - 0.5) * G.shake : 0;
    const sy = G.shake ? (Math.random() - 0.5) * G.shake : 0;
    ctx.save();
    ctx.translate(sx, sy);

    ctx.clearRect(-20, -20, W + 40, H + 40);
    drawBg();
    drawPlatforms();
    drawPickups();
    drawEnemies();
    drawPlayer();
    drawBullets();
    drawParticles();
    drawBossIntro();

    if (G.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.font = '900 40px Orbitron, sans-serif';
      ctx.fillStyle = '#4de1ff';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', W / 2, H / 2);
      ctx.font = '16px Rajdhani, sans-serif';
      ctx.fillStyle = '#aaa';
      ctx.fillText('ESC or pause button to resume', W / 2, H / 2 + 36);
      ctx.textAlign = 'left';
    }

    ctx.restore();
  }

  function getHud() {
    const p = G.player;
    return {
      hp: p?.hp ?? 0,
      maxHp: MAX_HP,
      diamond: (p?.diamondT ?? 0) > 0,
      bullish: (p?.bullishT ?? 0) > 0,
      slabs: G.meta.slabs || 0,
      score: G.meta.score || 0,
      armor: armorLabel(),
      levelName: G.level?.name || '',
      objective: G.level?.objective || '',
      toast: G.toastT > 0 ? G.toast : null,
    };
  }

  // public API
  return {
    get W() { return W; },
    H,
    loadLevel,
    update,
    draw,
    getHud,
    setKey(code, down) { G.keys[code] = down; },
    setMoveAxis(value) {
      G.moveAxis = Math.max(-1, Math.min(1, Number(value) || 0));
    },
    triggerDash(direction) { return dashPlayer(direction); },
    shoot() {
      if (!G.paused && !G.over) shootPlayer();
    },
    setMouse(x, y, down) {
      G.mouse.x = x; G.mouse.y = y;
      if (down !== undefined) G.mouse.down = down;
    },
    setViewport(width) {
      W = Math.max(640, Math.min(DEFAULT_W, Math.round(width || DEFAULT_W)));
      canvas.width = W;
      canvas.height = H;
    },
    togglePause() {
      if (G.over) return;
      G.paused = !G.paused;
    },
    isPaused: () => G.paused,
    isOver: () => G.over,
    isWon: () => G.won,
    getMeta: () => G.meta,
    setOnEvent(fn) { G.onEvent = fn; },
    getLevelIndex: () => G.levelIndex,
    armorLabel,
    MAX_HP,
  };
}
