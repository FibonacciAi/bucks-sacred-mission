/**
 * Buck's Sacred Mission — WebAudio SFX + procedural mission music
 * + optional Fury meme opener clip (assets/audio/fury_opener.mp3).
 */
let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let muted = false;
let musicOn = true;
let unlocked = false;
let musicNodes = null;
let musicStyle = 'mission';

/** HTMLAudio meme opener (~13s Fury clip from user assets) */
let openerEl = null;
let openerPlayed = false;
let openerReady = false;

const SAVE_MUTE = 'bucks_mute_v1';
try {
  muted = localStorage.getItem(SAVE_MUTE) === '1';
} catch { /* ignore */ }

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.55;
    sfxBus.connect(master);

    musicBus = ctx.createGain();
    musicBus.gain.value = 0.22;
    musicBus.connect(master);
  }
  return ctx;
}

export function unlock() {
  const c = ac();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  unlocked = true;
  if (master) master.gain.value = muted ? 0 : 0.85;
}

export function muteToggle() {
  muted = !muted;
  try { localStorage.setItem(SAVE_MUTE, muted ? '1' : '0'); } catch { /* ignore */ }
  unlock();
  if (master && ctx) {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(muted ? 0 : 0.85, now, 0.03);
  }
  if (openerEl) {
    openerEl.muted = muted;
    if (muted) openerEl.pause();
  }
  if (muted) {
    // keep nodes but silent via master
  } else if (musicOn && !musicNodes && !isOpenerPlaying()) {
    startMusic(musicStyle);
  }
  return muted;
}

/** Preload the meme opener clip. */
export function loadOpener(src = 'assets/audio/fury_opener.mp3') {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'auto';
    a.src = src;
    a.volume = 0.9;
    a.muted = muted;
    const done = () => {
      openerEl = a;
      openerReady = true;
      resolve(true);
    };
    a.addEventListener('canplaythrough', done, { once: true });
    a.addEventListener('error', () => {
      console.warn('Opener audio missing:', src);
      openerReady = false;
      resolve(false);
    });
    a.load();
  });
}

export function isOpenerPlaying() {
  return !!(openerEl && !openerEl.paused && !openerEl.ended);
}

export function stopOpener() {
  if (!openerEl) return;
  try {
    openerEl.onended = null;
    openerEl.pause();
    openerEl.currentTime = 0;
  } catch { /* ignore */ }
}

/**
 * Play the Fury meme opener once (title sting).
 * Calls onEnd when finished (or immediately if unavailable / already played / muted).
 */
export function playOpener({ force = false, onEnd } = {}) {
  unlock();
  if (!openerEl || !openerReady || muted) {
    onEnd?.();
    return false;
  }
  if (openerPlayed && !force) {
    onEnd?.();
    return false;
  }
  openerPlayed = true;
  stopMusic(0.05);
  try {
    openerEl.muted = muted;
    openerEl.currentTime = 0;
    openerEl.onended = () => {
      openerEl.onended = null;
      onEnd?.();
    };
    const p = openerEl.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => onEnd?.());
    }
    return true;
  } catch {
    onEnd?.();
    return false;
  }
}

export function isMuted() {
  return muted;
}

export function isMusicOn() {
  return musicOn;
}

function alive() {
  return unlocked && ctx && !muted;
}

function tone(freq, dur = 0.08, type = 'square', vol = 0.2, slide = 0) {
  if (!alive()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, freq), t);
  if (slide) {
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + Math.max(0.01, dur));
  }
  g.gain.setValueAtTime(Math.max(0.0001, vol), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(sfxBus);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise(dur = 0.1, vol = 0.15, filterType = 'highpass', filterFreq = 800) {
  if (!alive()) return;
  const t = ctx.currentTime;
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(0.0001, vol), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = filterFreq;
  src.connect(f);
  f.connect(g);
  g.connect(sfxBus);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export function stopMusic(fade = 0.35) {
  if (!musicNodes) return;
  const nodes = musicNodes;
  musicNodes = null;
  if (nodes.timer) clearInterval(nodes.timer);
  if (ctx && musicBus) {
    const t = ctx.currentTime;
    try {
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), t);
      musicBus.gain.linearRampToValueAtTime(0.0001, t + fade);
    } catch { /* ignore */ }
  }
  setTimeout(() => {
    for (const o of nodes.osc || []) {
      try { o.stop(); o.disconnect(); } catch { /* ignore */ }
    }
  }, fade * 1000 + 40);
}

export function startMusic(style = 'mission') {
  musicStyle = style;
  if (!musicOn) return;
  unlock();
  if (!ctx) return;

  stopMusic(0.12);

  if (muted) return;

  const t0 = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t0);
  musicBus.gain.setValueAtTime(0.0001, t0);
  const targetVol = style === 'boss' ? 0.3 : style === 'title' ? 0.17 : style === 'win' ? 0.24 : 0.22;
  musicBus.gain.linearRampToValueAtTime(targetVol, t0 + 0.45);

  const progs = {
    title: [110, 130.81, 98, 146.83],
    mission: [82.41, 98, 87.31, 110],
    boss: [55, 58.27, 61.74, 65.41],
    win: [130.81, 164.81, 196, 246.94],
  };
  const chords = {
    title: [0, 3, 7, 10],
    mission: [0, 3, 7, 12],
    boss: [0, 1, 6, 7],
    win: [0, 4, 7, 12],
  };
  const prog = progs[style] || progs.mission;
  const intervals = chords[style] || chords.mission;
  const bpm = style === 'boss' ? 96 : style === 'win' ? 122 : style === 'title' ? 88 : 108;
  const beat = 60 / bpm;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = style === 'boss' ? 420 : 900;
  filter.Q.value = 5;
  filter.connect(musicBus);

  const bass = ctx.createOscillator();
  bass.type = 'sawtooth';
  bass.frequency.value = prog[0];
  const bassG = ctx.createGain();
  bassG.gain.value = 0.13;
  bass.connect(bassG);
  bassG.connect(filter);
  bass.start(t0);

  const lead = ctx.createOscillator();
  lead.type = style === 'win' ? 'triangle' : 'square';
  lead.frequency.value = prog[0] * 2;
  const leadG = ctx.createGain();
  leadG.gain.value = 0.0001;
  lead.connect(leadG);
  leadG.connect(filter);
  lead.start(t0);

  const pad = ctx.createOscillator();
  pad.type = 'triangle';
  pad.frequency.value = prog[0] * 1.5;
  const padG = ctx.createGain();
  padG.gain.value = 0.045;
  pad.connect(padG);
  padG.connect(filter);
  pad.start(t0);

  const hatBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate);
  {
    const d = hatBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.25));
  }

  let step = 0;
  const osc = [bass, lead, pad];

  const timer = setInterval(() => {
    if (!musicNodes || !ctx || muted) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    const root = prog[Math.floor(step / 4) % prog.length];
    const deg = intervals[step % intervals.length];
    const freq = root * Math.pow(2, deg / 12);

    try {
      bass.frequency.setTargetAtTime(root, t, 0.04);
      lead.frequency.setTargetAtTime(freq * 2, t, 0.012);
      pad.frequency.setTargetAtTime(root * Math.pow(2, intervals[2] / 12), t, 0.08);

      leadG.gain.cancelScheduledValues(t);
      leadG.gain.setValueAtTime(0.0001, t);
      leadG.gain.linearRampToValueAtTime(style === 'title' ? 0.055 : 0.085, t + 0.015);
      leadG.gain.exponentialRampToValueAtTime(0.0001, t + beat * 0.8);

      const baseF = style === 'boss' ? 380 : style === 'win' ? 1400 : 820;
      filter.frequency.setTargetAtTime(baseF + (step % 2 === 0 ? 380 : 0), t, 0.05);

      // kick
      if (step % 4 === 0) {
        const k = ctx.createOscillator();
        const kg = ctx.createGain();
        k.type = 'sine';
        k.frequency.setValueAtTime(style === 'boss' ? 72 : 105, t);
        k.frequency.exponentialRampToValueAtTime(38, t + 0.12);
        kg.gain.setValueAtTime(0.2, t);
        kg.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        k.connect(kg);
        kg.connect(musicBus);
        k.start(t);
        k.stop(t + 0.15);
      }

      // hat / snare click
      if (step % 2 === 1 || style === 'boss') {
        const src = ctx.createBufferSource();
        src.buffer = hatBuf;
        const hg = ctx.createGain();
        hg.gain.value = 0.055;
        const hf = ctx.createBiquadFilter();
        hf.type = 'highpass';
        hf.frequency.value = 5500;
        src.connect(hf);
        hf.connect(hg);
        hg.connect(musicBus);
        src.start(t);
      }

      // snare on 2 and 4
      if (step % 4 === 2) {
        noise(0.08, 0.07, 'bandpass', 1800);
      }
    } catch { /* teardown race */ }

    step += 1;
  }, beat * 1000);

  musicNodes = { osc, timer };
}

// ─── SFX ────────────────────────────────────────────────────────────
export const sfx = {
  shoot() {
    unlock();
    tone(920, 0.05, 'square', 0.11, -520);
    tone(1400, 0.03, 'square', 0.05, -800);
    noise(0.035, 0.07, 'highpass', 1200);
  },
  hit() {
    unlock();
    tone(210, 0.07, 'sawtooth', 0.14, -90);
    noise(0.05, 0.1, 'bandpass', 900);
  },
  hurt() {
    unlock();
    tone(160, 0.16, 'sawtooth', 0.17, -90);
    tone(90, 0.2, 'square', 0.08, -40);
  },
  jump() {
    unlock();
    tone(280, 0.1, 'triangle', 0.12, 320);
    tone(400, 0.08, 'sine', 0.06, 200);
  },
  land() {
    unlock();
    noise(0.04, 0.06, 'lowpass', 400);
    tone(90, 0.05, 'sine', 0.06);
  },
  pickup() {
    unlock();
    tone(660, 0.07, 'sine', 0.13, 180);
    setTimeout(() => tone(990, 0.09, 'sine', 0.11), 55);
  },
  power() {
    unlock();
    tone(200, 0.14, 'sawtooth', 0.12, 380);
    setTimeout(() => tone(400, 0.16, 'square', 0.1, 280), 70);
    setTimeout(() => tone(800, 0.12, 'triangle', 0.08), 140);
  },
  slab() {
    unlock();
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'sine', 0.12), i * 70));
  },
  explode() {
    unlock();
    noise(0.22, 0.22, 'lowpass', 600);
    tone(100, 0.25, 'sawtooth', 0.15, -55);
    tone(55, 0.3, 'sine', 0.12, -20);
  },
  enemyShoot() {
    unlock();
    tone(480, 0.06, 'square', 0.07, -200);
    noise(0.03, 0.05, 'highpass', 2000);
  },
  ui() {
    unlock();
    tone(540, 0.045, 'square', 0.07);
  },
  uiOk() {
    unlock();
    tone(440, 0.05, 'sine', 0.08);
    setTimeout(() => tone(660, 0.08, 'sine', 0.08), 45);
  },
  win() {
    unlock();
    [523, 659, 784, 1046, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.12), i * 95));
  },
  die() {
    unlock();
    tone(280, 0.35, 'sawtooth', 0.16, -220);
    noise(0.3, 0.14, 'lowpass', 500);
  },
  boss() {
    unlock();
    tone(70, 0.35, 'sawtooth', 0.18, 35);
    setTimeout(() => tone(55, 0.4, 'square', 0.12), 100);
    noise(0.2, 0.1, 'lowpass', 300);
  },
  levelClear() {
    unlock();
    [392, 494, 587, 784].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'square', 0.1), i * 80));
  },
  dash() {
    unlock();
    noise(0.08, 0.1, 'highpass', 1500);
    tone(200, 0.1, 'triangle', 0.08, 400);
  },
};
