/**
 * Lightweight WebAudio SFX — no external assets required.
 */
let ctx = null;
let muted = false;
let master = null;

export function unlock() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.28;
  master.connect(ctx.destination);
}

export function muteToggle() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.28;
  return muted;
}

export function isMuted() {
  return muted;
}

function tone(freq, dur = 0.08, type = 'square', gain = 0.2, slide = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur = 0.1, gain = 0.15) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = gain;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 800;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
  src.stop(t + dur);
}

export const sfx = {
  shoot() {
    tone(880, 0.06, 'square', 0.12, -500);
    noise(0.04, 0.08);
  },
  hit() {
    tone(180, 0.09, 'sawtooth', 0.14, -80);
    noise(0.05, 0.1);
  },
  hurt() {
    tone(140, 0.18, 'sawtooth', 0.18, -100);
  },
  jump() {
    tone(320, 0.12, 'triangle', 0.12, 280);
  },
  pickup() {
    tone(660, 0.08, 'sine', 0.12, 200);
    setTimeout(() => tone(990, 0.1, 'sine', 0.1), 60);
  },
  power() {
    tone(220, 0.15, 'sawtooth', 0.12, 400);
    setTimeout(() => tone(440, 0.2, 'square', 0.1, 300), 80);
  },
  slab() {
    tone(523, 0.1, 'sine', 0.14);
    setTimeout(() => tone(659, 0.1, 'sine', 0.12), 70);
    setTimeout(() => tone(784, 0.16, 'sine', 0.12), 140);
  },
  explode() {
    noise(0.25, 0.22);
    tone(90, 0.28, 'sawtooth', 0.16, -50);
  },
  ui() {
    tone(520, 0.05, 'square', 0.08);
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'sine', 0.12), i * 100));
  },
  die() {
    tone(300, 0.4, 'sawtooth', 0.16, -250);
    noise(0.35, 0.15);
  },
  boss() {
    tone(80, 0.35, 'sawtooth', 0.18, 40);
    setTimeout(() => tone(60, 0.4, 'square', 0.12), 120);
  },
};
