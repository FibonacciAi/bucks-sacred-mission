/**
 * Image loader — pre-keyed transparent PNGs preferred.
 */

const cache = new Map();

export function loadImage(src) {
  if (cache.has(src)) return cache.get(src);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn('Missing asset', src);
      resolve(null);
    };
    img.src = src;
  });
  cache.set(src, p);
  return p;
}

export async function loadAll() {
  const paths = {
    buckIdle: 'assets/player/buck_idle.png',
    buckFly: 'assets/player/buck_fly.png',
    cartridge: 'assets/items/cartridge.png',
    diamond: 'assets/items/diamond_hands.png',
    bullish: 'assets/items/bullish.png',
    powerpack: 'assets/items/powerpack.png',
    slab: 'assets/items/slab.png',
    goon: 'assets/enemies/goon.png',
    drone: 'assets/enemies/drone.png',
    lawyer: 'assets/enemies/lawyer.png',
    ceo: 'assets/enemies/ceo.png',
    bg0: 'assets/bg/server_farm.jpg',
    bg1: 'assets/bg/cartridge_plant.jpg',
    bg2: 'assets/bg/hq_lobby.jpg',
    bg3: 'assets/bg/legal_vault.jpg',
    bg4: 'assets/bg/acquisitions_floor.jpg',
    bg5: 'assets/bg/trading_floor.jpg',
    bg6: 'assets/bg/executive_skybridge.jpg',
    bg7: 'assets/bg/rooftop_helipad.jpg',
    bg8: 'assets/bg/patch_core.jpg',
    bg9: 'assets/bg/boardroom.jpg',
    keyart: 'assets/ui/keyart.jpg',
  };

  const out = {};
  await Promise.all(
    Object.entries(paths).map(async ([k, src]) => {
      out[k] = await loadImage(src);
    })
  );
  return out;
}
