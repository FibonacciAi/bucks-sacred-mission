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
let playbackWanted = false;
let resumePromise = null;

/** HTMLAudio meme opener (~13s Fury clip from user assets) */
let openerEl = null;
let openerPlayed = false;
let openerReady = false;
let openerStarting = false;
let openerLoadPromise = null;

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
  if (!c) return Promise.resolve(false);
  unlocked = true;
  if (master) master.gain.value = muted ? 0 : 0.85;
  if (c.state === 'running') return Promise.resolve(true);
  if (!resumePromise) {
    resumePromise = c.resume()
      .then(() => c.state === 'running')
      .catch(() => false)
      .finally(() => { resumePromise = null; });
  }
  return resumePromise;
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
  if (openerLoadPromise) return openerLoadPromise;
  openerLoadPromise = new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'auto';
    a.src = src;
    a.volume = 0.9;
    a.muted = muted;
    let settled = false;
    const done = (ready) => {
      if (settled) return;
      settled = true;
      openerEl = a;
      openerReady = ready;
      resolve(ready);
    };
    // Mobile Safari frequently skips canplaythrough for preloaded media.
    // loadeddata/canplay are enough because playback can continue buffering.
    a.addEventListener('loadeddata', () => done(true), { once: true });
    a.addEventListener('canplay', () => done(true), { once: true });
    a.addEventListener('error', () => {
      console.warn('Opener audio missing:', src);
      done(false);
    }, { once: true });
    a.load();
    if (a.readyState >= 2) done(true);
  });
  return openerLoadPromise;
}

export function isOpenerPlaying() {
  return openerStarting || !!(openerEl && !openerEl.paused && !openerEl.ended);
}

export function stopOpener() {
  openerStarting = false;
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
  if (openerStarting) return true;
  stopMusic(0.05);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    openerStarting = false;
    if (openerEl) openerEl.onended = null;
    onEnd?.();
  };
  try {
    openerEl.muted = muted;
    openerEl.currentTime = 0;
    openerEl.onended = finish;
    openerStarting = true;
    const p = openerEl.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        openerPlayed = true;
        openerStarting = false;
      }).catch(finish);
    } else {
      openerPlayed = true;
      openerStarting = false;
    }
    return true;
  } catch {
    finish();
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

export function stopMusic(fade = 0.35, { keepIntent = false } = {}) {
  if (!keepIntent) playbackWanted = false;
  if (!musicNodes) return;
  const nodes = musicNodes;
  musicNodes = null;
  if (nodes.timer) clearInterval(nodes.timer);
  if (nodes.arpTimer) clearInterval(nodes.arpTimer);
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
    for (const n of nodes.graph || []) {
      try { n.disconnect(); } catch { /* ignore */ }
    }
  }, fade * 1000 + 40);
}

/**
 * Furi / Carpenter Brut–inspired synthwave beds.
 * Detuned saws, minor progressions, 16th arps, sidechain pump, delay.
 */
export function startMusic(style = 'mission') {
  musicStyle = style;
  playbackWanted = true;
  if (!musicOn || muted || isOpenerPlaying()) return false;
  const c = ac();
  if (!c) return false;

  const launch = () => {
    if (!playbackWanted || musicStyle !== style || muted || isOpenerPlaying()) return false;
    if (c.state !== 'running') return false;
    if (musicNodes?.style === style) return true;
    buildMusic(style);
    return true;
  };

  const resumed = unlock();
  if (c.state === 'running') return launch();
  resumed.then((ok) => { if (ok) launch(); });
  return false;
}

/** Resume the desired music after a gesture, tab restore, or interrupted audio session. */
export function ensurePlayback(style = musicStyle) {
  musicStyle = style;
  playbackWanted = true;
  const resumed = unlock();
  if (!muted && !isOpenerPlaying()) startMusic(style);
  resumed.then((ok) => {
    if (ok && !muted && !isOpenerPlaying() && playbackWanted) startMusic(musicStyle);
  });
  return resumed;
}

export function getAudioStatus() {
  return {
    muted,
    unlocked: !!(ctx && ctx.state === 'running'),
    playing: isOpenerPlaying() || !!musicNodes,
    style: musicStyle,
  };
}

function buildMusic(style) {
  if (!ctx || ctx.state !== 'running' || muted) return;

  stopMusic(0.1, { keepIntent: true });
  playbackWanted = true;

  const t0 = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t0);
  musicBus.gain.setValueAtTime(0.0001, t0);
  const targetVol =
    style === 'boss' ? 0.34 :
    style === 'title' ? 0.2 :
    style === 'win' ? 0.26 : 0.28;
  musicBus.gain.linearRampToValueAtTime(targetVol, t0 + 0.55);

  // Dark synthwave progressions (Hz roots)
  const progs = {
    // Am → F → G → Em energy
    title:   [110.0, 87.31, 98.0, 82.41],
    // Furi-ish boss rush: low A → C → G → E
    mission: [55.0, 65.41, 49.0, 41.2],
    // Drop-tuned dread
    boss:    [46.25, 49.0, 43.65, 36.71],
    // Lifted major-ish victory
    win:     [130.81, 164.81, 98.0, 146.83],
  };
  // Scale degrees for arp / lead (semitones from root)
  const arps = {
    title:   [0, 3, 7, 12, 10, 7, 3, 7],
    mission: [0, 3, 7, 12, 15, 12, 10, 7],
    boss:    [0, 1, 5, 7, 12, 7, 6, 5],
    win:     [0, 4, 7, 12, 16, 12, 7, 4],
  };
  const prog = progs[style] || progs.mission;
  const arpPat = arps[style] || arps.mission;
  const bpm =
    style === 'boss' ? 128 :
    style === 'win' ? 132 :
    style === 'title' ? 100 : 118;
  const beat = 60 / bpm;
  const sixteenth = beat / 4;

  // ── FX graph: filter → delay → musicBus ──
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = style === 'boss' ? 520 : style === 'win' ? 1600 : 1100;
  filter.Q.value = style === 'boss' ? 8 : 4;

  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = style === 'boss' ? 0.23 : 0.19;
  const delayFb = ctx.createGain();
  delayFb.gain.value = 0.32;
  const delayWet = ctx.createGain();
  delayWet.gain.value = style === 'title' ? 0.18 : 0.28;
  const dry = ctx.createGain();
  dry.gain.value = 0.85;

  // sidechain bus (ducks on kick)
  const pump = ctx.createGain();
  pump.gain.value = 1;

  filter.connect(pump);
  pump.connect(dry);
  dry.connect(musicBus);
  pump.connect(delay);
  delay.connect(delayWet);
  delayWet.connect(musicBus);
  delay.connect(delayFb);
  delayFb.connect(delay);

  const graph = [filter, delay, delayFb, delayWet, dry, pump];
  const osc = [];

  function mkOsc(type, freq, gainVal, dest) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gainVal;
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    osc.push(o);
    return { o, g };
  }

  // Sub sine + mid saw bass (French electro weight)
  const sub = mkOsc('sine', prog[0], style === 'boss' ? 0.22 : 0.16, filter);
  const bass = mkOsc('sawtooth', prog[0], 0.1, filter);
  const bass2 = mkOsc('sawtooth', prog[0] * 1.005, 0.06, filter); // slight detune

  // Dual detuned saw leads (Carpenter Brut-ish)
  const leadOct = style === 'boss' ? 3 : 2;
  const leadA = mkOsc('sawtooth', prog[0] * leadOct, 0.0001, filter);
  const leadB = mkOsc('sawtooth', prog[0] * leadOct * 1.007, 0.0001, filter);
  // Square fifth for bite
  const leadC = mkOsc('square', prog[0] * leadOct * Math.pow(2, 7 / 12), 0.0001, filter);

  // Warm pad
  const pad = mkOsc('triangle', prog[0] * 2, style === 'win' ? 0.07 : 0.04, filter);
  const pad2 = mkOsc('sawtooth', prog[0] * 2 * 1.003, 0.025, filter);

  // Noise buffer for hats / snare / risers
  const nLen = Math.floor(ctx.sampleRate * 0.15);
  const hatBuf = ctx.createBuffer(1, nLen, ctx.sampleRate);
  {
    const d = hatBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (nLen * 0.12));
  }
  const snareBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
  {
    const d = snareBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.08));
  }

  function playNoise(buf, t, vol, type, freq, dur = 0.08) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    src.connect(f);
    f.connect(g);
    g.connect(musicBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function kick(t, heavy = false) {
    const k = ctx.createOscillator();
    const kg = ctx.createGain();
    k.type = 'sine';
    const f0 = heavy ? 68 : 95;
    k.frequency.setValueAtTime(f0, t);
    k.frequency.exponentialRampToValueAtTime(32, t + 0.14);
    kg.gain.setValueAtTime(heavy ? 0.32 : 0.24, t);
    kg.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    k.connect(kg);
    kg.connect(musicBus); // kick stays dry / full
    k.start(t);
    k.stop(t + 0.18);
    // sidechain duck
    try {
      pump.gain.cancelScheduledValues(t);
      pump.gain.setValueAtTime(0.25, t);
      pump.gain.linearRampToValueAtTime(1, t + (heavy ? 0.22 : 0.16));
    } catch { /* ignore */ }
  }

  let step = 0; // 16th notes
  const arpTimer = setInterval(() => {
    if (!musicNodes || !ctx || muted) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    const bar = Math.floor(step / 16);
    const root = prog[bar % prog.length];
    const deg = arpPat[step % arpPat.length];
    const note = root * Math.pow(2, deg / 12);
    const leadF = note * (style === 'boss' ? 2 : 2);

    try {
      // Bass follows root (octave)
      sub.o.frequency.setTargetAtTime(root, t, 0.03);
      bass.o.frequency.setTargetAtTime(root * 2, t, 0.025);
      bass2.o.frequency.setTargetAtTime(root * 2 * 1.005, t, 0.025);
      pad.o.frequency.setTargetAtTime(root * 2 * Math.pow(2, 3 / 12), t, 0.1);
      pad2.o.frequency.setTargetAtTime(root * 2 * Math.pow(2, 7 / 12) * 1.003, t, 0.1);

      // Arp pluck every 16th (gate pattern for groove)
      const gate =
        style === 'title' ? (step % 2 === 0) :
        style === 'win' ? true :
        // mission: gallop 1-0-1-1
        [1, 0, 1, 1][step % 4];

      const leadVol =
        style === 'boss' ? 0.07 :
        style === 'title' ? 0.045 :
        style === 'win' ? 0.06 : 0.065;
      const fifthVol = style === 'boss' ? 0.035 : 0.02;

      if (gate) {
        leadA.o.frequency.setValueAtTime(leadF, t);
        leadB.o.frequency.setValueAtTime(leadF * 1.007, t);
        leadC.o.frequency.setValueAtTime(leadF * Math.pow(2, 7 / 12), t);
        for (const g of [leadA.g, leadB.g]) {
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(leadVol, t + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, t + sixteenth * 0.85);
        }
        leadC.g.gain.cancelScheduledValues(t);
        leadC.g.gain.setValueAtTime(0.0001, t);
        leadC.g.gain.linearRampToValueAtTime(fifthVol, t + 0.008);
        leadC.g.gain.exponentialRampToValueAtTime(0.0001, t + sixteenth * 0.7);
      }

      // Filter sweep / pump motion
      const baseF =
        style === 'boss' ? 480 :
        style === 'win' ? 1800 :
        style === 'title' ? 900 : 1000;
      const sweep = Math.sin(step * 0.2) * (style === 'boss' ? 500 : 350);
      const open = (step % 16 < 12) ? 1 : 0.55; // close filter end of bar
      filter.frequency.setTargetAtTime((baseF + sweep) * open, t, 0.04);
      filter.Q.setTargetAtTime(style === 'boss' ? 9 : 3.5 + (step % 8 === 0 ? 3 : 0), t, 0.05);

      // Drums on 16ths → quarter resolution
      if (step % 4 === 0) {
        const beatN = (step / 4) % 4;
        if (beatN === 0 || beatN === 2 || style === 'boss') {
          kick(t, style === 'boss' || beatN === 0);
        }
        // open hat on off-beats
        if (beatN === 1 || beatN === 3) {
          playNoise(hatBuf, t, style === 'boss' ? 0.07 : 0.05, 'highpass', 7000, 0.05);
        }
        // snare backbeat
        if (beatN === 2) {
          playNoise(snareBuf, t, style === 'win' ? 0.08 : 0.1, 'bandpass', 2200, 0.1);
          // clap layer
          playNoise(hatBuf, t + 0.01, 0.05, 'highpass', 3000, 0.06);
        }
      }

      // Boss riser every 2 bars
      if (style === 'boss' && step % 32 === 28) {
        const r = ctx.createOscillator();
        const rg = ctx.createGain();
        r.type = 'sawtooth';
        r.frequency.setValueAtTime(80, t);
        r.frequency.exponentialRampToValueAtTime(600, t + sixteenth * 4);
        rg.gain.setValueAtTime(0.01, t);
        rg.gain.linearRampToValueAtTime(0.08, t + sixteenth * 3.5);
        rg.gain.exponentialRampToValueAtTime(0.001, t + sixteenth * 4);
        r.connect(rg);
        rg.connect(filter);
        r.start(t);
        r.stop(t + sixteenth * 4.1);
      }
    } catch { /* teardown race */ }

    step += 1;
  }, sixteenth * 1000);

  musicNodes = { osc, graph, arpTimer, timer: null, style };
}

// ─── SFX ────────────────────────────────────────────────────────────
export const sfx = {
  shoot() {
    unlock();
    // cart laser — synthwave zap
    tone(1100, 0.045, 'sawtooth', 0.1, -700);
    tone(1600, 0.03, 'square', 0.06, -900);
    noise(0.03, 0.06, 'highpass', 1800);
  },
  hit() {
    unlock();
    tone(240, 0.06, 'sawtooth', 0.13, -100);
    tone(180, 0.08, 'square', 0.08, -60);
    noise(0.05, 0.09, 'bandpass', 1100);
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
