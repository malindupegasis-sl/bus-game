# LANKAN BUS LEGENDZ

A mobile-first 8-bit browser game: drive a Sri Lankan bus down a three-lane highway and dodge the
oncoming traffic. Plain TypeScript and HTML canvas with Vite, and no game engine.

**Play:** https://malindupegasis-sl.github.io/bus-game/

## Controls

- **Phone:** the big ▲ (bottom-left) and ▼ (bottom-right) thumb buttons, or swipe up or down
  anywhere. Tapping the game itself only starts or resumes.
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

Music: *Nandana Sihina Gange* by Sangeeth Wijesuriya (`public/audio/song.mp3`).

- The song loops seamlessly between `SONG_LOOP.start` and `SONG_LOOP.end` in `src/config.ts`
  (0.70s → 204.0s, measured with ffmpeg; the file has silence at both ends), with a short crossfade
  between two `<audio>` copies. **If you replace the song, re-measure these.**
- It speeds up with the game, capped at 1.25x, with pitch preserved.
- If the file is missing or fails to load, the built-in Web Audio chiptune plays instead.
- Audio only starts after the first tap.

## Code map

| Path | What |
| --- | --- |
| `src/config.ts` | Resolution (256×144), lane geometry, timings, share link |
| `src/game/difficulty.ts` | 30s warm-up, then speed / spawn-rate ramp; obstacle mix (pure) |
| `src/game/bubble.ts` | Tuk-tuk swearing bubble: text pick and placement (never over the target lane) |
| `src/render/busPose.ts` | Bus bounce, lean, wheel spin and glow flicker (always inside its lane) |
| `src/game/obstacles.ts` | Obstacle kinds registry: size, hitbox, speed, tuk-tuk swerve |
| `src/game/fairness.ts` | Lane-occupancy model and the "is there still a way through?" search |
| `src/game/spawner.ts` | Seeded spawner; rejects any spawn that would close the last gap |
| `src/game/world.ts` | One run: movement, collisions, events (no DOM) |
| `src/game/game.ts` | Title / playing / paused / crashed / over state machine; buttons, swipes, taps |
| `src/render/sprites.ts` | **All** sprites, palettes, bus skins, and the pixel font |
| `src/render/renderer.ts` | Road, parallax, entities, HUD, screens |
| `src/audio/` | Song playback and seamless loop, chiptune fallback, sound effects, mute |
| `src/layout.ts` | Canvas scaling and ▲/▼ thumb-button placement (never over the bus) |

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
