/**
 * Buck's Sacred Mission — screens, shop, boot.
 */
// Cache-bust query keeps iOS Safari from serving stale modules after deploys
import { loadAll } from './assets.js?v=20260719c';
import {
  unlock as unlockAudio, muteToggle, isMuted, sfx,
  startMusic, stopMusic, loadOpener, playOpener, stopOpener, isOpenerPlaying,
  ensurePlayback, getAudioStatus,
} from './audio.js?v=20260719c';
import { LEVELS, SHOP_ITEMS, WIN_TEXT, ARMOR } from './data.js?v=20260719c';
import { createGame } from './game.js?v=20260719c';

const $ = (s) => document.querySelector(s);

const views = {
  title: $('#title'),
  briefing: $('#briefing'),
  game: $('#game-view'),
  shop: $('#shop'),
};
const overlay = $('#overlay');
const canvas = $('#game');

const SAVE = 'bucks_sacred_v1';
const CAMPAIGN_VERSION = 5;
function loadSave() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE) || '{}');
    const prev = Number(saved.campaignVersion) || 0;
    if (prev !== CAMPAIGN_VERSION) {
      const L = Number(saved.level) || 0;
      if (prev < 2) {
        // Pre-expansion saves: kick mid-run players into the first added chapter.
        saved.level = L > 0 ? 1 : 0;
      } else if (prev === 3) {
        // v3 6-level → 10-level map (via v4 inserts + helipad/core before boss)
        const map = { 0: 0, 1: 1, 2: 2, 3: 4, 4: 6, 5: 9 };
        saved.level = map[L] != null ? map[L] : Math.min(L, 9);
      } else if (prev === 4) {
        // v4 8-level: boss was index 7 → insert helipad@7, core@8, boss@9
        if (L >= 7) saved.level = 7;
      } else if (prev < 3) {
        if (L >= 5) saved.level = 3;
      }
      if (Number(saved.level) >= 10) saved.level = 7;
      saved.campaignVersion = CAMPAIGN_VERSION;
    }
    return saved;
  } catch { return {}; }
}
function persist() {
  localStorage.setItem(SAVE, JSON.stringify({
    campaignVersion: CAMPAIGN_VERSION,
    level: state.level,
    slabs: state.meta.slabs,
    score: state.meta.score,
    owned: state.meta.owned,
    dpsMul: state.meta.dpsMul,
  }));
}

const saved = loadSave();
const state = {
  mode: 'title',
  level: saved.level || 0,
  assets: null,
  game: null,
  meta: {
    slabs: saved.slabs || 0,
    score: saved.score || 0,
    owned: saved.owned || { socks: false, undies: false },
    dpsMul: saved.dpsMul || 1,
    armor: 'none',
  },
  raf: 0,
  last: 0,
  loading: true,
};

function show(name) {
  for (const [k, el] of Object.entries(views)) {
    el.classList.toggle('hidden', k !== name);
  }
  state.mode = name;
  syncMuteLabels();
}

function syncMuteLabels() {
  const audio = getAudioStatus();
  const soundActive = audio.playing || audio.unlocked;
  const muted = isMuted();
  const label = muted ? 'sound off' : soundActive ? 'sound on' : 'tap sound';
  document.querySelectorAll('[data-mute]').forEach((el) => {
    if (el.classList.contains('btn-icon')) {
      el.textContent = muted ? '×' : '♪';
      el.title = label;
      el.classList.toggle('is-muted', muted);
    } else if (el.classList.contains('hud-sound')) {
      el.textContent = muted ? 'off' : soundActive ? 'on' : 'tap';
    } else {
      el.textContent = label;
    }
    el.setAttribute('aria-pressed', muted ? 'true' : 'false');
    el.setAttribute('aria-label', label);
  });
}

function showOverlay({ icon, title, body, primary, secondary, onPrimary, onSecondary }) {
  $('#ov-icon').textContent = icon;
  $('#ov-title').textContent = title;
  $('#ov-body').textContent = body;
  $('#btn-ov-primary').textContent = primary;
  $('#btn-ov-secondary').textContent = secondary;
  overlay.classList.remove('hidden');
  $('#btn-ov-primary').onclick = () => {
    overlay.classList.add('hidden');
    onPrimary?.();
  };
  $('#btn-ov-secondary').onclick = () => {
    overlay.classList.add('hidden');
    onSecondary?.();
  };
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function armorName() {
  const o = state.meta.owned;
  if (o.socks && o.undies) return 'Full Loadout';
  if (o.undies) return 'Rocket Undies';
  if (o.socks) return 'Diamond Socks';
  return 'None';
}

function updateBriefing() {
  const L = LEVELS[state.level];
  const n = state.level + 1;
  const lvlEl = $('#brief-lvl');
  if (lvlEl) lvlEl.textContent = String(n).padStart(2, '0');
  $('#brief-title').textContent = L.name;
  // Full copy always — mobile scrolls inside .brief-scroll, CTA stays pinned
  $('#brief-body').textContent = L.briefing;
  const tips = $('#brief-tips');
  tips.innerHTML = '';
  const touchMode = window.matchMedia('(hover: none) and (pointer: coarse), (max-width: 900px)').matches;
  const levelTips = touchMode
    ? [
        'L thumb: move · R thumb: hold fire · swipe ↑ jump · ↔ dash · ↓ pause',
        ...L.tips.map((tip) => tip.replace('J / Click', 'FIRE')),
      ]
    : L.tips;
  for (const t of levelTips) {
    const li = document.createElement('li');
    li.textContent = t;
    tips.appendChild(li);
  }
  $('#brief-hp').textContent = '100';
  $('#brief-dps').textContent = `${(state.meta.dpsMul || 1).toFixed(2)}×`;
  $('#brief-armor').textContent = armorName();
  $('#brief-slabs').textContent = String(state.meta.slabs || 0);
}

function syncHud() {
  if (!state.game) return;
  const h = state.game.getHud();
  const pct = Math.max(0, (h.hp / h.maxHp) * 100);
  $('#hp-fill').style.width = `${pct}%`;
  $('#hp-text').textContent = String(Math.ceil(h.hp));
  const d = $('#pill-diamond');
  const b = $('#pill-bullish');
  d.className = 'pill' + (h.diamond ? ' on diamond' : ' off');
  b.className = 'pill' + (h.bullish ? ' on bullish' : ' off');
  $('#hud-slabs').textContent = String(h.slabs);
  $('#hud-score').textContent = String(h.score);
  $('#hud-armor').textContent = h.armor;
  $('#level-name').textContent = h.levelName;
  $('#objective').textContent = h.objective;

  if (h.toast) {
    const t = $('#toast');
    t.textContent = h.toast;
    t.classList.remove('hidden');
  } else {
    $('#toast').classList.add('hidden');
  }
}

function startLevel() {
  hideOverlay();
  if (!state.game) {
    state.game = createGame(canvas, state.assets, state.meta);
    state.game.setOnEvent(onGameEvent);
  }
  // keep meta reference live
  state.meta.armor = armorName();
  state.game.loadLevel(state.level);
  show('game');
  resizeCanvas();
  state.last = performance.now();
  if (!state.raf) loop(state.last);
  sfx.uiOk();
  openerFinished = true;
  stopOpener();
  const L = LEVELS[state.level];
  startMusic(L?.boss ? 'boss' : 'mission');
}

function onGameEvent(type) {
  if (type === 'hud') {
    persist();
    syncHud();
  }
  if (type === 'death') {
    persist();
    stopMusic(0.5);
    setTimeout(() => {
      showOverlay({
        icon: '💀',
        title: 'MISSION FAILED',
        body: 'Buck got delisted. Rip a powerpack and try again — diamond hands never fold.',
        primary: 'RETRY LEVEL',
        secondary: 'TITLE',
        onPrimary: () => startLevel(),
        onSecondary: () => {
          show('title');
          startMusic('title');
          cancelLoop();
        },
      });
    }, 600);
  }
  if (type === 'levelclear') {
    sfx.levelClear();
    stopMusic(0.3);
    state.level += 1;
    persist();
    setTimeout(() => {
      if (state.level >= LEVELS.length) {
        // shouldn't happen without boss win
        state.level = LEVELS.length - 1;
      }
      openShop();
    }, 400);
  }
  if (type === 'win') {
    state.level = 0;
    persist();
    startMusic('win');
    setTimeout(() => {
      showOverlay({
        icon: '🎮',
        title: WIN_TEXT.title,
        body: WIN_TEXT.body + `  Final score: ${state.meta.score} · Slabs: ${state.meta.slabs}`,
        primary: 'PLAY AGAIN',
        secondary: 'TITLE',
        onPrimary: () => {
          state.level = 0;
          state.meta.score = 0;
          // keep slabs/armor as prestige
          persist();
          updateBriefing();
          show('briefing');
          startMusic('mission');
          cancelLoop();
        },
        onSecondary: () => {
          show('title');
          startMusic('title');
          cancelLoop();
        },
      });
    }, 900);
  }
}

function openShop() {
  cancelLoop();
  show('shop');
  renderShop();
  startMusic('title');
}

function renderShop() {
  $('#shop-slabs').textContent = String(state.meta.slabs || 0);
  const grid = $('#shop-grid');
  grid.innerHTML = '';
  for (const item of SHOP_ITEMS) {
    const owned = !item.consumable && state.meta.owned[item.id];
    const el = document.createElement('div');
    el.className = 'shop-item' + (owned ? ' owned' : '');
    el.innerHTML = `
      <h3>${item.name}</h3>
      <p>${item.desc}</p>
      <div class="cost">${owned ? 'OWNED' : `${item.cost} SLAB${item.cost === 1 ? '' : 'S'}`}</div>
      <button type="button" ${owned || state.meta.slabs < item.cost ? 'disabled' : ''}>
        ${owned ? 'EQUIPPED' : item.consumable ? 'RIP OPEN' : 'BUY'}
      </button>
    `;
    const btn = el.querySelector('button');
    btn.onclick = () => {
      if (state.meta.slabs < item.cost) return;
      if (!item.consumable && state.meta.owned[item.id]) return;
      state.meta.slabs -= item.cost;
      if (item.consumable) {
        // heal next deploy — store flag
        state.meta.preHeal = true;
        sfx.pickup();
      } else {
        state.meta.owned[item.id] = true;
        sfx.power();
      }
      persist();
      renderShop();
    };
    grid.appendChild(el);
  }
}

function cancelLoop() {
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = 0;
}

function loop(now) {
  state.raf = requestAnimationFrame(loop);
  const dt = Math.min(0.033, (now - state.last) / 1000);
  state.last = now;
  if (state.mode !== 'game' || !state.game) return;
  state.game.update(dt);
  state.game.draw();
  syncHud();
}

function resizeCanvas() {
  const portraitPhone = window.matchMedia('(max-width: 900px) and (orientation: portrait)').matches;
  // A narrower camera makes characters and hazards readable in portrait,
  // without stretching sprites or changing the level's physics scale.
  const logicalWidth = portraitPhone ? 640 : 1280;
  canvas.style.setProperty('--game-aspect', `${logicalWidth} / 720`);
  canvas.width = logicalWidth;
  canvas.height = 720;
  state.game?.setViewport(logicalWidth);
  state.game?.draw();
}

// ─── Mobile: kill double-tap / pinch zoom ───
// iOS ignores user-scalable=no for a11y — block at gesture + double-tap layers.
const VIEWPORT_LOCK =
  'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
const lockViewportMeta = () => {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) meta.setAttribute('content', VIEWPORT_LOCK);
};
lockViewportMeta();

document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

// Block multi-finger pinch
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false, capture: true });

// Double-tap zoom: intercept the SECOND touchstart (more reliable than touchend on iOS).
// Skip pan-y regions — those use touch-action: pan-y and need free scrolling.
let lastTapAt = 0;
let lastTapX = 0;
let lastTapY = 0;
document.addEventListener('touchstart', (e) => {
  if (e.touches.length > 1) {
    e.preventDefault();
    return;
  }
  const t = e.touches[0];
  const now = Date.now();
  const dt = now - lastTapAt;
  const dx = Math.abs(t.clientX - lastTapX);
  const dy = Math.abs(t.clientY - lastTapY);
  const inPanY = !!e.target?.closest?.('.brief-scroll, .shop-grid, #game, .touch-surface');
  if (!inPanY && dt > 0 && dt < 320 && dx < 40 && dy < 40) {
    e.preventDefault(); // blocks Safari double-tap zoom on buttons/chrome
  }
  lastTapAt = now;
  lastTapX = t.clientX;
  lastTapY = t.clientY;
}, { passive: false, capture: true });

// Hard-reset if visual viewport scale drifts
const resetViewportZoom = () => {
  const vv = window.visualViewport;
  if (!vv) return;
  if (Math.abs(vv.scale - 1) >= 0.01) lockViewportMeta();
};
window.visualViewport?.addEventListener('resize', resetViewportZoom);
window.visualViewport?.addEventListener('scroll', resetViewportZoom);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) lockViewportMeta();
});

// ─── Input ───
const keyboardKeys = new Set();
const pointerKeys = new Map();
const pointersByKey = new Map();
const pulseCounts = new Map();
const pulseTimers = new Set();
let audioGestureSeen = false;
let openerFinished = false;

function musicForCurrentScreen() {
  if (state.mode === 'game') return LEVELS[state.level]?.boss ? 'boss' : 'mission';
  return 'title';
}

function finishFuriOpener() {
  openerFinished = true;
  if (state.mode !== 'game') ensurePlayback('title');
  syncMuteLabels();
}

function tryFuriOpener({ force = false } = {}) {
  return playOpener({
    force,
    onEnd: finishFuriOpener,
    // Audible autoplay may be blocked by the browser. Stay silent and retry
    // the real opener on the next gesture instead of substituting synth music.
    onBlocked: syncMuteLabels,
  });
}

function activateAudio({ allowOpener = true } = {}) {
  audioGestureSeen = true;
  const resume = unlockAudio();
  const style = musicForCurrentScreen();

  if (allowOpener && state.mode === 'title' && !openerFinished && !isMuted()) {
    tryFuriOpener();
  } else if (!isOpenerPlaying() && (state.mode === 'game' || openerFinished)) {
    ensurePlayback(style);
  }

  resume.finally(syncMuteLabels);
}

// Arm audio from the first interaction anywhere, before a button's click
// handler or the game asset loader can consume the gesture.
window.addEventListener('pointerdown', () => activateAudio(), { capture: true, passive: true });

function isKeyHeld(code) {
  return keyboardKeys.has(code)
    || (pointersByKey.get(code)?.size || 0) > 0
    || (pulseCounts.get(code) || 0) > 0;
}

function syncGameKey(code) {
  state.game?.setKey(code, isKeyHeld(code));
}

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
  activateAudio();
  if (state.game && state.mode === 'game') {
    keyboardKeys.add(e.code);
    syncGameKey(e.code);
    if (e.code === 'Escape') {
      state.game.togglePause();
      sfx.ui();
    }
  }
  if (e.code === 'Enter' && state.mode === 'title') {
    $('#btn-start').click();
  }
});
window.addEventListener('keyup', (e) => {
  keyboardKeys.delete(e.code);
  syncGameKey(e.code);
});

canvas.addEventListener('mousedown', (e) => {
  activateAudio({ allowOpener: false });
  if (!state.game || state.mode !== 'game') return;
  const r = canvas.getBoundingClientRect();
  state.game.setMouse(
    (e.clientX - r.left) * (canvas.width / r.width),
    (e.clientY - r.top) * (canvas.height / r.height),
    true
  );
});
window.addEventListener('mouseup', () => state.game?.setMouse(0, 0, false));
canvas.addEventListener('mousemove', (e) => {
  if (!state.game) return;
  const r = canvas.getBoundingClientRect();
  state.game.setMouse(
    (e.clientX - r.left) * (canvas.width / r.width),
    (e.clientY - r.top) * (canvas.height / r.height)
  );
});

// Independent Pointer Events keep every finger active until that finger lifts.
function pressPointer(pointerId, code) {
  if (pointerKeys.has(pointerId)) return;
  pointerKeys.set(pointerId, { code });
  if (!pointersByKey.has(code)) pointersByKey.set(code, new Set());
  pointersByKey.get(code).add(pointerId);
  syncGameKey(code);
}

function releasePointer(pointerId) {
  const held = pointerKeys.get(pointerId);
  if (!held) return;
  pointerKeys.delete(pointerId);
  const ids = pointersByKey.get(held.code);
  ids?.delete(pointerId);
  if (!ids?.size) {
    pointersByKey.delete(held.code);
  }
  syncGameKey(held.code);
}

function pulseKey(code, duration = 120) {
  pulseCounts.set(code, (pulseCounts.get(code) || 0) + 1);
  syncGameKey(code);
  const timer = window.setTimeout(() => {
    pulseTimers.delete(timer);
    const next = Math.max(0, (pulseCounts.get(code) || 1) - 1);
    if (next) pulseCounts.set(code, next);
    else pulseCounts.delete(code);
    syncGameKey(code);
  }, duration);
  pulseTimers.add(timer);
}

const movePad = $('#move-pad');
const moveOrigin = $('#move-origin');
const moveStick = $('#move-stick');
const actionPad = $('#action-pad');
const gestureFeedback = $('#gesture-feedback');
const actionPointers = new Map();
let movePointerId = null;
let moveStartX = 0;
let moveStartY = 0;
let feedbackTimer = 0;

function showGesture(label) {
  gestureFeedback.textContent = label;
  gestureFeedback.classList.remove('show');
  void gestureFeedback.offsetWidth;
  gestureFeedback.classList.add('show');
  window.clearTimeout(feedbackTimer);
  feedbackTimer = window.setTimeout(() => gestureFeedback.classList.remove('show'), 360);
}

function updateMove(e) {
  if (e.pointerId !== movePointerId) return;
  const dx = e.clientX - moveStartX;
  const dy = e.clientY - moveStartY;
  const raw = Math.max(-1, Math.min(1, dx / 54));
  const deadzone = 0.1;
  const magnitude = Math.abs(raw);
  const axis = magnitude <= deadzone
    ? 0
    : Math.sign(raw) * Math.pow((magnitude - deadzone) / (1 - deadzone), 0.72);
  state.game?.setMoveAxis(axis);
  const knobX = axis * 27;
  const knobY = Math.max(-7, Math.min(7, dy * 0.12));
  moveStick.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
}

function releaseMove(pointerId) {
  if (pointerId !== movePointerId) return;
  movePointerId = null;
  state.game?.setMoveAxis(0);
  movePad.classList.remove('is-active');
  moveStick.style.transform = '';
}

movePad.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  activateAudio({ allowOpener: false });
  if (movePointerId !== null) return;
  movePointerId = e.pointerId;
  moveStartX = e.clientX;
  moveStartY = e.clientY;
  const rect = movePad.getBoundingClientRect();
  const x = Math.max(44, Math.min(rect.width - 44, e.clientX - rect.left));
  const y = Math.max(48, Math.min(rect.height - 44, e.clientY - rect.top));
  moveOrigin.style.left = `${x}px`;
  moveOrigin.style.top = `${y}px`;
  movePad.classList.add('is-active');
  try { movePad.setPointerCapture(e.pointerId); } catch { /* unsupported capture */ }
  updateMove(e);
});
movePad.addEventListener('pointermove', updateMove);
movePad.addEventListener('pointerup', (e) => { e.preventDefault(); releaseMove(e.pointerId); });
movePad.addEventListener('pointercancel', (e) => releaseMove(e.pointerId));
movePad.addEventListener('lostpointercapture', (e) => releaseMove(e.pointerId));
movePad.addEventListener('contextmenu', (e) => e.preventDefault());

function updateActionTrace(e, pointer) {
  const rect = actionPad.getBoundingClientRect();
  pointer.trace.style.left = `${e.clientX - rect.left}px`;
  pointer.trace.style.top = `${e.clientY - rect.top}px`;
}

function updateActionGesture(e) {
  const pointer = actionPointers.get(e.pointerId);
  if (!pointer) return;
  updateActionTrace(e, pointer);
  if (pointer.gesture) return;

  const dx = e.clientX - pointer.startX;
  const dy = e.clientY - pointer.startY;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (dy < -36 && ay > ax * 1.08) {
    pointer.gesture = 'jump';
    pulseKey('Space', 130);
    showGesture('↑ JUMP');
  } else if (ax > 44 && ax > ay * 1.08) {
    pointer.gesture = 'dash';
    state.game?.triggerDash(dx < 0 ? -1 : 1);
    showGesture(dx < 0 ? '← DASH' : 'DASH →');
  } else if (dy > 52 && ay > ax * 1.08) {
    pointer.gesture = 'pause';
    state.game?.togglePause();
    sfx.ui();
    showGesture('Ⅱ PAUSE');
  }
}

function releaseAction(pointerId) {
  const pointer = actionPointers.get(pointerId);
  if (!pointer) return;
  actionPointers.delete(pointerId);
  pointer.trace.remove();
  releasePointer(pointerId);
  actionPad.classList.toggle('is-active', actionPointers.size > 0);
}

actionPad.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  activateAudio({ allowOpener: false });
  const trace = document.createElement('span');
  trace.className = 'touch-trace';
  actionPad.appendChild(trace);
  actionPointers.set(e.pointerId, {
    startX: e.clientX,
    startY: e.clientY,
    gesture: null,
    trace,
  });
  actionPad.classList.add('is-active');
  pressPointer(e.pointerId, 'KeyJ');
  state.game?.shoot();
  try { actionPad.setPointerCapture(e.pointerId); } catch { /* unsupported capture */ }
  updateActionGesture(e);
});
actionPad.addEventListener('pointermove', updateActionGesture);
actionPad.addEventListener('pointerup', (e) => { e.preventDefault(); releaseAction(e.pointerId); });
actionPad.addEventListener('pointercancel', (e) => releaseAction(e.pointerId));
actionPad.addEventListener('lostpointercapture', (e) => releaseAction(e.pointerId));
actionPad.addEventListener('contextmenu', (e) => e.preventDefault());

function releaseAllInputs() {
  const affected = new Set([...keyboardKeys, ...pointersByKey.keys(), ...pulseCounts.keys()]);
  keyboardKeys.clear();
  pointerKeys.clear();
  pointersByKey.clear();
  pulseCounts.clear();
  for (const timer of pulseTimers) window.clearTimeout(timer);
  pulseTimers.clear();
  movePointerId = null;
  state.game?.setMoveAxis(0);
  movePad.classList.remove('is-active');
  moveStick.style.transform = '';
  for (const pointer of actionPointers.values()) pointer.trace.remove();
  actionPointers.clear();
  actionPad.classList.remove('is-active');
  for (const code of affected) state.game?.setKey(code, false);
  state.game?.setMouse(0, 0, false);
}

window.addEventListener('blur', releaseAllInputs);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    releaseAllInputs();
  } else if (audioGestureSeen && !isMuted()) {
    if (state.mode === 'title' && !openerFinished) tryFuriOpener();
    else ensurePlayback(musicForCurrentScreen()).finally(syncMuteLabels);
  }
});
window.addEventListener('pageshow', () => {
  if (!audioGestureSeen || isMuted()) return;
  if (state.mode === 'title' && !openerFinished) tryFuriOpener();
  else ensurePlayback(musicForCurrentScreen()).finally(syncMuteLabels);
});

// ─── Buttons ───
$('#btn-start').onclick = () => {
  activateAudio();
  sfx.uiOk();
  // fresh run from title unless mid-save
  if (state.level >= LEVELS.length) state.level = 0;
  updateBriefing();
  show('briefing');
};

$('#btn-deploy').onclick = () => {
  activateAudio({ allowOpener: false });
  sfx.uiOk();
  startLevel();
  if (state.meta.preHeal && state.game) {
    state.meta.preHeal = false;
    // full HP already on load; toast the rip
    sfx.pickup();
  }
};

$('#btn-shop-next').onclick = () => {
  sfx.uiOk();
  if (state.level >= LEVELS.length) {
    state.level = LEVELS.length - 1;
  }
  updateBriefing();
  show('briefing');
};

function onMuteClick() {
  activateAudio({ allowOpener: false });
  const m = muteToggle();
  syncMuteLabels();
  if (!m) {
    sfx.ui();
    if (state.mode === 'title' && !openerFinished) tryFuriOpener({ force: true });
    else ensurePlayback(musicForCurrentScreen());
  }
}

document.querySelectorAll('[data-mute]').forEach((el) => {
  el.onclick = onMuteClick;
});

window.addEventListener('resize', resizeCanvas);

// ─── Boot ───
(async function boot() {
  show('title');
  syncMuteLabels();
  // Start media preloading immediately. Never delay the first gesture listener
  // behind asset loading: iOS only grants audio from a live user interaction.
  loadOpener('assets/audio/fury_opener.mp3').then((ready) => {
    // Attempt the real opener immediately. If the browser blocks audible
    // autoplay, do not replace it with synth; the next gesture retries it.
    if (ready && state.mode === 'title' && !isMuted()) tryFuriOpener();
  });
  const btn = $('#btn-start');
  btn.disabled = true;
  btn.textContent = 'LOADING…';
  try {
    state.assets = await loadAll();
  } catch (e) {
    console.error(e);
  }
  state.loading = false;
  btn.disabled = false;
  btn.textContent = 'BEGIN MISSION';
  resizeCanvas();
})();
