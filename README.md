# Bus Game

A mobile-first 8-bit browser game: drive a Sri Lankan bus down a three-lane highway and dodge the
oncoming traffic. Plain TypeScript and HTML canvas with Vite, and no game engine.

**Play:** https://malindupegasis-sl.github.io/bus-game/

## Controls

- **Phone:** tap the top or bottom half of the screen, or swipe up or down.
- **Desktop:** ↑/↓ or W/S. Enter or Space starts and retries, and M mutes.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/bus-game/
npm test         # Vitest: spawner fairness, difficulty ramp, score
npm run build
npm run icons    # regenerate home-screen icons from the bus sprite
```

Every push to `main` runs the tests, builds, and deploys to GitHub Pages
(`.github/workflows/deploy.yml`).

## Music

Put a song at `public/audio/song.mp3` and the game uses it automatically. Without one, it plays a
built-in Web Audio chiptune. Either way the music speeds up with the game, capped at 1.25x, and the
song keeps its pitch. Audio only starts after the first tap.

## Code map

| Path | What |
| --- | --- |
| `src/config.ts` | Resolution (256×144), lane geometry, timings, share link |
| `src/game/difficulty.ts` | Speed, spawn rate, and obstacle mix over time (pure) |
| `src/game/obstacles.ts` | Obstacle kinds registry: size, hitbox, speed, tuk-tuk swerve |
| `src/game/fairness.ts` | Lane-occupancy model and the "is there still a way through?" search |
| `src/game/spawner.ts` | Seeded spawner; rejects any spawn that would close the last gap |
| `src/game/world.ts` | One run: movement, collisions, events (no DOM) |
| `src/game/game.ts` | Title / playing / paused / crashed / over state machine, tap and swipe rules |
| `src/render/sprites.ts` | **All** sprites, palettes, bus skins, and the pixel font |
| `src/render/renderer.ts` | Road, parallax, entities, HUD, screens |
| `src/audio/` | Chiptune sequencer, sound effects, song-file switch, mute |

### Fairness

Positions are functions of distance travelled, and every obstacle's screen speed is a multiple of
the bus speed, so the safety maths holds as the game speeds up. Each obstacle blocks a lane for a
distance window, and a lane change blocks both lanes for its duration with a 40% margin. Before
accepting a spawn, the spawner searches for a path from the bus's actual lane and from every lane
that had one before. If the spawn would remove any of those paths, it is rejected. The tests drive
a perfect bot through the real game on 120 seeds for 150 seconds each, using real collisions.

### Adding the planned features

- **New obstacles** (politician's convoy, same-number rival buses): add a kind to `KINDS`, a sprite,
  and a spawn weight. A convoy can be one long entry, or several linked ones spawned together. The
  fairness check works with any lane-occupancy windows.
- **Conductor boost / party bus:** `World.speedBoost` multiplies speed, and `Renderer.busSkin =
  'party'` swaps the bus palette (`BUS_SKINS.party`). Flashing LEDs can cycle that palette each
  frame.
- **Routes:** the HUD mini-map draws from the `ROUTE` polyline in the renderer.
- **Customisation:** add entries to `BUS_SKINS`.
