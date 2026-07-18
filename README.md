# Buck's Sacred Mission

**A corporate espionage 2D scroller** starring Buck the Bunny.

The Gaming Studio Conglomerate is strong-arming the industry into **digital-only** releases. Buck’s job: infiltrate, diamond-hand the chaos, and **assassinate the CEO**.

Grounded in the [@activistJ741 / eBuck](https://x.com) game idea post. Cult classic energy. `$GME`.

## Features (from the post)

| Feature | In-game |
|--------|---------|
| Weapon shoots video game cartridges | **J** / click — cart projectiles |
| Diamond Hand powerups (+DPS) | Pickup → multi-cart barrage + damage |
| Bullish powerup (invincible) | Pickup → green invuln aura |
| Secret items (Slabs) | Hidden collectibles for score + shop |
| Rip Powerpacks for HP | Heal pickups mid-level |
| Upgrade armor (Underwear / Socks) | Between-level armory shop |

## Levels

1. **Server Farm** — Operation Bitrot
2. **Cartridge Plant** — Operation Hard Copy
3. **Conglomerate HQ** — Operation Forced Update
4. **Legal Vault** — Operation Fine Print
5. **Acquisitions Floor** — Operation Hostile Takeover
6. **Trading Floor** — Operation Paper Hands
7. **Executive Skybridge** — Operation Kill Switch
8. **Penthouse Boardroom** — Sacred Mission (CEO boss)

One continuous corporate-espionage arc: shut down the physical-media shredders,
breach the tower, crack the contract vault, break hostile acquisitions, ride
the shareholder pit, cross the glass skybridge, then take the CEO.

Hazard progression: conveyors (plant / trading floor) → vault lasers → elite
density (acquisitions) → skybridge laser gauntlet → boss.

## Controls

| Key | Action |
|-----|--------|
| A / D or ← → | Move |
| W / Space / ↑ | Jump (double-jump with wings) |
| J / Click | Shoot cartridges |
| K | Wing dash |
| ESC | Pause |

Touch uses two large thumb surfaces instead of buttons. Drag anywhere on the
left surface for analog movement. Hold anywhere on the right to fire, swipe up
to jump, swipe sideways to dash in that direction, and swipe down to pause.
Every finger is tracked independently, so movement, firing, and gestures work
together with true multitouch. Portrait uses a tighter player-follow camera;
landscape opens the full-width view.

## Play

**Live:** [https://fibonacciai.github.io/bucks-sacred-mission/](https://fibonacciai.github.io/bucks-sacred-mission/)

Local:

```bash
python3 -m http.server 8765
```

Then visit `http://localhost:8765`.

## Audio

- Procedural WebAudio SFX + mission beds (title / mission / boss / win)
- Title opener clip: `assets/audio/fury_opener.mp3` (from FibonacciAi/42069 `Fury.mp3`)
- The Furi opener attempts audible autoplay immediately on the title screen.
  If a browser rejects autoplay, the first valid gesture retries the Furi clip
  rather than skipping to synth music. The synth bed begins only after the clip
  completes or gameplay starts. Audio recovers after tab restores; mute persists
  in localStorage.

## Stack

Pure HTML / CSS / Canvas JS. No build step. Art generated from the Buck key art + mission vibe.
