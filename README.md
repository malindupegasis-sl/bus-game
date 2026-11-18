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

## Gameplay extras (v2)

- **Lime and chilli:** collect 2 chillies to hang the charm on the bus (it saves you from one
  crash), then a lime appears; collect it for the **Dham Rajina Xpress** boost: 11 s,
  road 1.3x, double score, music 1.35x faster. Pickups are never placed where collecting one forces
  a crash.
- **Knockouts:** during the boost the bus knocks vehicles off the road instead of crashing:
  +25 each (+50 with the boost's double score), with a combo counter (x2, x3…) for hits within
  2 s of each other. Lorries tip over and spill their cargo, tuk-tuks spin off the top of the
  screen swearing, convoy SUVs scatter like bowling pins ("I'LL SUE!!"), rival buses spin and slide
  off backwards, and the family motorbike swerves onto the verge (fists shaken, dog barking).
  A knocked-off vehicle leaves the world at once, so it can never cause a crash.
- **Politician's convoy:** 5 SUVs in one lane after the warm-up, rarely (30 s cooldown).
- **Rival buses** on your route: overtake one for +50.
- **Captions** explain each thing the first time it appears in a run.
- **Leaderboard (Supabase):** the first time the game opens it asks for a nickname (3-12 letters,
  numbers and spaces, basic rude-word filter; remembered on the device, "change name" on the start
  screen). Every run is submitted; the game-over screen shows the score, the top 10 (each
  nickname's best, your entry highlighted) or "You: #27 of 54" below it, then RETRY and SHARE ON
  WHATSAPP with your rank in the message. If the leaderboard can't be reached, the game carries on
  and shows "Leaderboard unavailable". See *Leaderboard setup* below.
- **Debug overlay:** tap the HUD score 5 times (FPS, music, charm and knockout status), with a
  SCREEN SHAKE on/off button for the small knockout shake (remembered on the device).

The boost bus is an affectionate parody with its own livery; it doesn't copy any real operator's
paint job or logo. The politician is fictional.

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
| `src/game/difficulty.ts` | 20s warm-up, then speed / spawn-rate ramp; obstacle mix (pure) |
| `src/game/bubble.ts` | Speech bubbles (tuk-tuk, politician, conductor): placement, never over the bus |
| `src/viewport.ts` | Real visible area (visualViewport) for rotation-safe layout |
| `src/render/busPose.ts` | Bus tilt, squash & stretch, bounce, wheel spin, glow (kept inside its lane) |
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

## Leaderboard setup (Supabase)

1. In the Supabase dashboard open **SQL Editor**, paste the whole of `supabase/leaderboard.sql`
   and press **Run**. It creates the `scores` table (Row Level Security on), grants the `anon`
   role read access to it plus execute on `submit_score` and `leaderboard_top`, and nothing else.
   It's safe to run again.
2. Put the project's **Project URL** and **anon / publishable key** (Project Settings -> API) in
   `src/leaderboard/config.ts`. Both are public by design. Never use the service_role / secret key.
3. Push to `main`; the deploy workflow publishes it.

With the two values empty the game works normally and shows "Leaderboard unavailable".

How scores are checked (in the database, not the game): nickname rules and the rude-word list
are enforced again; a score above 500 + 250 points per second of run is rejected (real play stays
under ~200/s even with a permanent boost); each device (hashed IP) and each nickname may submit
at most once every 2 s and 30 times per 10 minutes, with an overall cap of 1,000 per minute.
Nicknames aren't accounts: anyone typing the same name (in any capitals) adds to that name's row.
`supabase/test_leaderboard.sql` checks all of this against a local Postgres
(`supabase/setup_local.sql` first).
