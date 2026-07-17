/**
 * Buck's Sacred Mission — screens, shop, boot.
 */
import { loadAll } from './assets.js';
import { unlock as unlockAudio, muteToggle, isMuted, sfx } from './audio.js';
import { LEVELS, SHOP_ITEMS, WIN_TEXT, ARMOR } from './data.js';
import { createGame } from './game.js';

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
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE) || '{}'); } catch { return {}; }
}
function persist() {
  localStorage.setItem(SAVE, JSON.stringify({
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
  $('#brief-title').textContent = `LEVEL ${state.level + 1} — ${L.name}`;
  $('#brief-body').textContent = L.briefing;
  const tips = $('#brief-tips');
  tips.innerHTML = '';
  for (const t of L.tips) {
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
  sfx.ui();
}

function onGameEvent(type) {
  if (type === 'hud') {
    persist();
    syncHud();
  }
  if (type === 'death') {
    persist();
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
          cancelLoop();
        },
      });
    }, 600);
  }
  if (type === 'levelclear') {
    sfx.win();
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
          cancelLoop();
        },
        onSecondary: () => {
          show('title');
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
  // keep internal res; CSS scales
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // stay at design res for gameplay consistency
  canvas.width = 1280;
  canvas.height = 720;
}

// ─── Input ───
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
  unlockAudio();
  if (state.game && state.mode === 'game') {
    state.game.setKey(e.code, true);
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
  if (state.game) state.game.setKey(e.code, false);
});

canvas.addEventListener('mousedown', (e) => {
  unlockAudio();
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

// touch
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  unlockAudio();
  if (!state.game) return;
  state.game.setKey('KeyJ', true);
  // tap upper half = jump
  const t = e.changedTouches[0];
  const r = canvas.getBoundingClientRect();
  const y = (t.clientY - r.top) / r.height;
  const x = (t.clientX - r.left) / r.width;
  if (y < 0.45) state.game.setKey('Space', true);
  if (x < 0.35) state.game.setKey('KeyA', true);
  if (x > 0.65) state.game.setKey('KeyD', true);
}, { passive: false });
canvas.addEventListener('touchend', () => {
  if (!state.game) return;
  state.game.setKey('KeyJ', false);
  state.game.setKey('Space', false);
  state.game.setKey('KeyA', false);
  state.game.setKey('KeyD', false);
});

// ─── Buttons ───
$('#btn-start').onclick = () => {
  unlockAudio();
  sfx.ui();
  // fresh run from title unless mid-save
  if (state.level >= LEVELS.length) state.level = 0;
  updateBriefing();
  show('briefing');
};

$('#btn-deploy').onclick = () => {
  unlockAudio();
  sfx.ui();
  startLevel();
  if (state.meta.preHeal && state.game) {
    state.meta.preHeal = false;
    // full HP already on load; toast the rip
    sfx.pickup();
  }
};

$('#btn-shop-next').onclick = () => {
  sfx.ui();
  if (state.level >= LEVELS.length) {
    state.level = LEVELS.length - 1;
  }
  updateBriefing();
  show('briefing');
};

$('#btn-mute').onclick = () => {
  unlockAudio();
  const m = muteToggle();
  $('#btn-mute').textContent = m ? 'muted' : 'sound';
  sfx.ui();
};

window.addEventListener('resize', resizeCanvas);

// ─── Boot ───
(async function boot() {
  show('title');
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
