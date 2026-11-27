# LANKAN BUS LEGENDZ v2 progress

**For a new session:** read this file first, then continue from the first unticked item.
Tick an item only when it is done *and* tested. Commit and push after every finished item.
After each stage: deploy, check the live site, then STOP for the owner to test on their phone.

Keep as is unless a feature needs it (and say so): v1.3 controls, hitboxes, lane sizes, the 20s
warm-up, the difficulty ramp, the traffic mix, tuk-tuk swearing bubbles, the song.
Reference images are style-only: never copy them or commit them.

## Decisions (agreed with the owner)
- No boost sound file. Conductor gets a speech bubble only; the chipmunk song is enough.
- Boost bus name: "Dham Rajina Xpress" as an affectionate parody, own livery design (no copied paint job or logo).
- Boost: invincible with sparkles, road 1.3x, double score, 6 s, ~1 s transition back.
- Chipmunk mode: song at 1.35x with preservesPitch off, during the boost only. (Stage A: pitch change dropped, the song is only sped up to 1.35x; see below.)
- Rival buses: route 138 until Stage 3, route 1 for Colombo-Kandy; +50 "OVERTAKE!" bonus, no penalty.
- Lucky charm: saves one crash from the 2nd chilli until the boost ends; 1.5 s blinking invincibility; collecting restarts from zero.

## Stage 0: iPhone fixes (before anything new)
- [x] 0.1 Investigate and fix lag from the tuk-tuk swerve and speech bubble (per-frame text drawing/measuring, 2x portrait text, per-frame allocations); cache the bubble as an image if it helps
- [x] 0.2 Bubbles about half their current size, still readable (drop the 2x portrait scaling)
- [x] 0.3 Music stopping ~10 s in on iPhone: find the cause (main-thread stalls, AudioContext suspended/interrupted, memory); stream with an audio element if needed; recover automatically after an iOS interruption
- [x] 0.4 General performance: cap device pixel ratio, draw at internal resolution and scale once, clean up particles/puffs/bubbles off screen, smooth rendering between fixed 60 Hz updates (120 Hz screens)
- [x] 0.5 Debug overlay toggled by tapping the score 5 times: FPS and music status
- [x] 0.6 Stage 0 tests pass, headless check at 390px portrait + landscape, deployed and checked live -> STOP

### Stage 0 notes
- Draw calls per frame (traffic + a bubble): fillRect 1013 -> 5, fillStyle changes 807 -> 5, drawImage 82 -> 33.
  Static scenery, road, HUD, text, wheels, LCD digits and bubbles are pre-rendered once and blitted.
- Bubbles: 5x7 text at normal size everywhere (the 2x portrait text is gone); each phrase is a cached image.
- Music: one streamed <audio> element (no Web Audio routing, nothing decoded into memory); loops by seeking;
  playbackRate stepped (not set every frame); watchdog restarts a paused/stuck song and resumes an
  interrupted AudioContext. The previous build never decoded the song into an AudioBuffer.
- Fixed 60 Hz simulation with render interpolation; canvas stays 256x144 (DPR only picks the CSS scale).
- Debug overlay: tap the HUD score 5 times (remembered on the device).
- Live check (00a7a32): 66 unit tests pass; portrait + landscape at 390px; overlay toggles; a 45 s
  live run kept the song playing the whole time (0 silent samples); warm-up held 20 s.
- Owner tested Stage 0 on iPhone: smooth, music survives taps and locking, loop point fine, bubbles readable.
- [x] 0.7 Follow-up: subtle music stutter. Likely cause: playbackRate re-tuned every few seconds in 0.01
  steps. Now changes only by >= 0.04 and at most every 4 s (~6 changes over the whole ramp). Needs
  the owner's ear to confirm on iPhone.

## Stage 1: gameplay
- [x] 1.1 Lime-and-chilli boost: chilli pickups; 2 chillies hang a charm on the back of the bus; lime appears only after 2 chillies; lime completes the charm and starts the boost
- [x] 1.2 Conductor hangs out of the door and shouts (speech bubble) when the boost starts
- [x] 1.3 Lucky charm: saves one crash; charm falls off, 1.5 s blinking invincibility, collecting restarts from zero
- [x] 1.4 After the boost the charm comes off and collecting restarts from zero
- [x] 1.5 HUD charm-progress icon (empty / 1 chilli / 2 chillies)
- [x] 1.6 Pickups are never placed where collecting one forces a crash
- [x] 1.7 Dham Rajina Xpress: purple/pink/magenta party bus, chrome, colour-cycling LED strips, name on the sign board; short transition back
- [x] 1.8 Boost effects: invincible with sparkles, road 1.3x, double score, 6 s
- [x] 1.9 Chipmunk music during the boost (1.35x, preservesPitch off), normal afterwards
- [x] 1.10 Politician's convoy: 5 black SUVs in one lane, flashing red/blue lights, after the warm-up only, rare
- [x] 1.11 Fictional politician (white national dress, maroon shawl, invented face) shouting a campaign promise
- [x] 1.12 Rival same-route buses travelling your way; overtaking one gives +50 with an "OVERTAKE!" popup; no penalty
- [x] 1.13 First-appearance captions for each obstacle and pickup, short and out of the way
- [x] 1.14 Tests: convoy fairness (long lane block, always a path), rival bonus scoring, charm states, lucky-charm save, pickups never force a crash
- [x] 1.15 Stage 1 checked headless at 390px portrait + landscape, deployed and checked live -> STOP

### Stage 1 notes
- Built together (they share the World and renderer), so items 1.1-1.14 landed in one commit rather than one each.
- Traffic mix kept: weights re-calibrated with convoys and rivals on the road -> measured lorry 56.4%,
  tuk-tuk 34.0%, motorbike 9.6% (v1.3: 56.4/34.2/9.5); ~50% of tuk-tuks swerve. Extras on top:
  ~1 rival per 18 s, ~1 convoy per 50 s after the warm-up (30 s cooldown).
- Changed for new features (owner asked to be told): HUD score shows 5 digits to make room for the
  charm icon; rival buses get a slightly shorter hitbox (halfH 9) so a lane change beside one clips at
  the usual ~40% point; fairness tests now run traffic-only so the charm/boost can't hide a crash.
- Pickup safety is checked against all traffic up to the moment it is collected; after that the
  normal rule protects the bus's actual lane.
- Music speed follows the base difficulty speed, not the boost's 1.3x (found in testing).
- Live check (10fab55): 81 unit tests; portrait + landscape at 390px; a 45 s live run saw lorries,
  tuk-tuks, motorbikes, rival buses and a convoy, plus pickups; music never dropped; no page errors.
  Boost + chipmunk music verified in the dev build from a real lime pickup.
- Owner tested Stage 1 on iPhone and asked for these fixes before Stage 2:

### Stage 1 feedback fixes
- [x] 1.16 Boost lasts 11 s (was 6); ~1 s transition back kept; chipmunk music for the full boost
- [x] 1.17 Chilli and lime pickups 2.5x bigger (25x30, 25x25), inside the lane; fairness rule kept; HUD icon unchanged
- [x] 1.18 Pickup feedback: white flash + gold glint across the bus, sparkle burst off the pickup, "+CHILLI!"/"+LIME!" popup; all under 1 s; popups sit above (or below) the bus, never on the road ahead
- [x] 1.19 Charm moved under the front bumper, in proportion to the bus; grows 1 chilli -> 2 chillies -> full with lime (boost); sways (more on lane changes); not part of the hitbox
- [x] 1.20 Deployed and checked live (a3cd97b): 86 unit tests; portrait + landscape at 390px; live run
  with music throughout, no errors; 2.5x chilli seen live; 11 s chipmunk boost verified in the dev build.
- Owner tested on iPhone and is happy with Stage 1. Two changes before Stage 2:

### Before Stage 2
- [x] 1.21 Convoy schedule: first at ~30 s (after the warm-up), then about every 35 s (±3), never two within 20 s; fairness rule applies (measured: first convoy at 30.1 s on average, ~5 per 3-minute run; core mix unchanged 56.3/34.1/9.6)
- [x] 1.22 HUD: route map and analog speedometer removed; score and speed in big 12x20 LCD digits (was 8x14); charm icon next to the score; HUD content kept in x 37..219 so landscape thumb buttons never cover it (tested on 10 screen sizes incl. 16:9 667x375 and 568x320)

## Stage 2: bus customisation
- [x] 2.1 Garage screen from the start menu: bus colours
- [x] 2.2 Decorations: sign board style, lights, stickers
- [x] 2.3 Saved on the device (localStorage, try/catch)
- [x] 2.4 Dham Rajina Xpress look overrides the custom look while boosted
- [x] 2.5 Tests, headless check at 390px portrait + landscape, deployed and checked live -> STOP
  (907ed0a: 106 unit tests; garage flow checked live in portrait, landscape and 16:9 landscape incl.
  reload persistence and playing in the chosen colour; live run saw lorries, tuk-tuks, motorbikes,
  rivals, a convoy, pickups and a boost; music never dropped; no page errors)
- **Waiting for the owner to test Stage 2 on the iPhone before starting Stage 3.**

### Stage 2 notes
- Garage options: colour (Classic red, Ocean teal, Emerald, Sunset orange, Midnight, Banana; no
  blue+yellow so you never look like a rival), sign board (Amber 138, Green LED, Red LED, Scrolling),
  lights (None, Roof LEDs, Rainbow chase), stickers (None, Stars, Flames, Flowers).
- Saved as JSON under busgame.garage; anything unknown/broken falls back to the default per field.
- UI: GARAGE button on the start screen; HTML options panel (44px+ buttons) under the game in
  portrait, beside a 2x preview in landscape (rows stack on narrow 16:9 phones).
- Found in testing: the anti-scroll touch handler swallowed taps on new buttons; it now leaves all
  buttons, links and the garage panel alone (zoom/scroll still blocked by CSS touch-action).
- Items 2.1-2.4 landed in one commit (they share the renderer and main).

## Stage 3: routes
- [x] 3.1 Route picker before a run: 138 (Colombo city) and Colombo to Kandy (route 1)
- [x] 3.2 138 scenery: busy streets, shops
- [x] 3.3 Colombo to Kandy scenery: hills, greenery, bends
- [x] 3.4 Separate high score per route (existing high score carries over to the 138)
- [x] 3.5 Rival buses show the selected route's number; gameplay identical across routes
- [x] 3.6 Tests, headless check at 390px portrait + landscape, deployed and checked live -> STOP
  (4233248: 112 unit tests; live in portrait + landscape: route switching, carry-over and separate
  high scores, reload persistence; garage, overlay and controls re-checked; music never dropped;
  no page errors)
- Owner tested Stage 3: menu felt congested and the two routes looked too similar on the phone.

## Simplification + rotation fix (after Stage 3)
- [x] S.1 One route: route 1 (Kandy), its scenery, the ROUTE button and the route-picking code removed; 138 city scenery and number kept
- [x] S.2 Garage removed (button, screen, customisation code); bus always classic red; Dham Rajina Xpress boost unchanged; old saved garage/route settings are never read
- [x] S.3 Start screen: controls hint and "BEST ON ROUTE" removed; game over shows "BEST: n"; title ~10% bigger; music credit ~50% smaller (HTML text, 8px floor on small portraits)
- [x] S.4 Single high score: the original key, which already holds the player's 138 score
- [x] S.5 Rotation bug: layout uses the real visible area (visualViewport), re-lays out immediately on rotation/resize/visualViewport/ResizeObserver events plus re-checks at 100/300/600/1000 ms and a 400 ms safety timer (no dependence on animation frames); body fixed, nothing overflows, zoom snapped back to 1x if it ever happens. Tested: 6 rotations each on the start screen, mid-run and game over, plus fast back-and-forth and toolbar changes, in WebKit and Chromium at 390x844 and 375x667
- [x] S.6 Deployed and checked live in WebKit and Chromium (9c0ff6b): rotation stress test (start, mid-run, game over; 390x844 and 375x667) passed in both engines; WebKit play checks in portrait + landscape; Chromium controls and overlay checks; 103 unit tests incl. fairness
- **Waiting for the owner to test on the iPhone (Safari and Chrome).**

## Boost upgrade: knockouts
- [x] K.1 During the boost (and its 1 s transition) the bus knocks vehicles off the road instead of passing through: the vehicle is removed from the world at once (several in one step if needed), so it can't hit the bus or block a lane
- [x] K.2 Scoring: +25 KNOCKOUT per vehicle, doubled by the boost (+50); combo counter x2, x3... for knockouts within 2 s of each other (display only)
- [x] K.3 Animations (pre-rendered rotation/tip frames, pooled wrecks and particles): lorry shoved to the road edge, tips onto its side with dust and spilled cargo; tuk-tuk spins off the top of the screen with a trailing swear bubble; convoy SUVs scatter like bowling pins with lights flashing and "I'LL SUE!!" / "MY LAWYER!!" / "WHO DID THIS?!"; rival bus spins and slides off backwards; family motorbike swerves onto the verge, fists shaking, dog barking "WOOF!"
- [x] K.4 Screen shake 2-3 px for ~0.1 s per knockout; SCREEN SHAKE on/off button in the debug overlay (remembered, busgame.shake)
- [x] K.5 Outside the boost nothing changes (crash ends the run or uses the lucky charm; the charm's blink still passes through)
- [x] K.6 Tests: knockout scoring, boost doubling, combo window, several hits in one step, charm/crash unchanged outside the boost, a 35 s boost through heavy traffic on 10 seeds (knocked-off vehicles never return or cause a crash), effect pools fixed-size, every wreck leaves the screen within 2 s; fairness tests unchanged (116 tests)
- [x] K.7 Performance: 60 fps (no frame over 20 ms) with a knockout every ~150 ms, 4x CPU throttle, 390x844 @3x
- [x] K.8 Deployed and checked live in WebKit and Chromium (7344dc4): portrait + landscape in both engines: loads clean, live hook still read-only, debug overlay SCREEN SHAKE button toggles, doesn't steer and is remembered after reload, normal crash outside the boost, no page errors; WebKit play checks and the rotation stress test re-run and passed
- **Waiting for the owner to test on the iPhone (Safari and Chrome).**

## Stage A: music cutting out (~2,000 points, Chrome on iOS)
- [x] A.1 Cause: every boost start/end flipped `preservesPitch` on the playing song. On iOS WebKit (Safari and Chrome both) that swaps the player's time-pitch algorithm mid-playback, which can leave the element "playing" with its time advancing but no sound. The watchdog couldn't see that, so the music never came back. The first boost usually lands around 2,000 points, which matches the report. (Could not be reproduced in desktop WebKit, which doesn't use AVFoundation.)
- [x] A.2 Fix: `preservesPitch` is set once, before the file loads, and never written again. The boost only raises the speed to 1.35x (pitch preserved), so there's no chipmunk pitch any more. The chiptune fallback still goes up in pitch (Web Audio, unaffected).
- [x] A.3 Watchdog: still restarts a paused song and nudges/reloads a stuck one at the current (boost) rate; a reload now restores the position after the file's metadata loads (setting it straight after load() was ignored); a refused play() is retried every 3 s as well as on the next tap
- [x] A.4 Debug overlay lists the last 6 audio events with times (run start, boost on/off with the rate, speed-ups, playing/paused/buffering/stalled, play() refused or failed, watchdog restarts and reloads)
- [x] A.5 Tests: 20 boosts in a row with a fake element (pitch never written, playing throughout, rate 1.35 <-> normal); watchdog recovers a pause during a boost and a frozen song after one. WebKit and Chromium dev build: 5 real boosts in a row plus a system pause mid-boost: song kept playing (time advancing) at 1.35x during and the normal rate after, preservesPitch never written, no errors
- [x] A.6 Deployed and checked live (b68394a) in WebKit and Chromium: song plays, audio events show in the debug overlay, WebKit play checks, knockout/overlay checks, no page errors. (Boosts can't be triggered on the live site; the 5-boost test ran on the dev build.)
- Owner tested Stage A on the iPhone: music survives multiple boosts.

## Stage B: shared leaderboard (Supabase)
- [x] B.1 `supabase/leaderboard.sql` (paste into the SQL editor, re-runnable): `scores` table (nickname, score, run_seconds, created_at) with RLS; anon gets SELECT on it and EXECUTE on `submit_score` / `leaderboard_top` only; no insert/update/delete grants or policies; rate-limit table and helper functions invisible to anon
- [x] B.2 `submit_score()` (security definer, fixed search_path): re-validates the nickname (3-12, letters/numbers/single spaces, rude words), rejects impossible scores (> 500 + 250/s of run, negative, run > 2 h), rate-limits per hashed IP and per nickname (2 s gap, 30 per 10 min) plus a global cap, stores every accepted run, returns ok/reason, rank, total players and best (rank still returned when rate-limited)
- [x] B.3 `leaderboard_top(10)`: each nickname's best only (case-insensitive), ties share a rank
- [x] B.4 Name entry before the first run (HTML form: 16px+ input so iOS doesn't zoom, only valid characters can be typed, same rude filter as the database); remembered on the device; small "DRIVER: NAME · CHANGE NAME" under the music credit on the start screen (with cancel)
- [x] B.5 Game over is now an HTML panel (crisp text): score, best, top 10 with own entry highlighted, "YOU: #27 OF 54" when outside the top 10, then RETRY and SHARE ON WHATSAPP; two columns in landscape; thumb buttons hidden behind it
- [x] B.6 Share text: "I'm #3 on LANKAN BUS LEGENDZ with 2,140 points! Beat me: ..." (rank and best score), falling back to "I scored 2,140 in ..." without a leaderboard
- [x] B.7 Failure handling: offline / HTTP error / bad response / 8 s timeout -> "LEADERBOARD UNAVAILABLE"; the game never waits for it (RETRY works while it loads); not configured -> unavailable straight away
- [x] B.8 Tests: 9 unit tests (nickname rules, SQL and game rules identical, grants, score cap vs a permanent-boost worst case, client requests/failures/timeouts, share text); 31 SQL checks on a local Postgres 16 as the anon role (`supabase/test_leaderboard.sql`); 195 browser checks in Chromium + WebKit at 390x844, 844x390, 375x667, 667x375 against a local stand-in for Supabase's API backed by the real SQL (first-launch name, refusals, can't start without a name, top 10 + highlight, "You:" line, share text, change/cancel/reload, buttons on screen and uncovered, Supabase down / hanging / not configured)
- [x] B.9 Deployed and checked live (515cf86) in Chromium + WebKit at 390x844, 844x390, 375x667, 667x375 (80 checks): first launch asks for a name, no run before it, name shown and remembered, game over shows "LEADERBOARD UNAVAILABLE" (no Supabase details yet) with the plain share text, RETRY/SHARE on screen and uncovered, RETRY works, hook read-only, no errors; rotation stress test (RETRY now checked on screen after each turn) and WebKit play checks passed
- [x] B.10 Owner ran supabase/leaderboard.sql; Project URL + publishable key in src/leaderboard/config.ts (3fb98bb). Checked against the real project: anon can read scores and call the functions; direct insert and reading the rate-limit table are refused (permission denied); impossible score, rude name and bad name rejected with nothing stored. Live site, Chromium 390x844 ("Test Bot") and WebKit 844x390 ("Test Bot 2"), two runs each (31 checks): name asked on first launch, every run submitted (HTTP 200), top 10 loaded with own row highlighted, rank #1 of 1 then #1 of 2, best score per nickname only, share text "I'm #1 on LANKAN BUS LEGENDZ with 84 points! Beat me: ..." and the WhatsApp link carries it, no errors. The 4 test rows are still in the table (owner can delete them in the SQL editor).
- **Waiting for the owner to test on the iPhone.**

Notes: a run that ends within the first second is still submitted (any run length >= 0; the score cap still applies). The dev build can point at a test server via localStorage `busgame.lbDev`; production builds don't contain that code.

Notes: Stage 2 (garage) and route 1 were removed at the owner's request; their checklist items above stay ticked as history. The Stage 3 scenery for 138 remains.

### Stage 3 notes
- ROUTE button on the start screen toggles 138 City / 1 Kandy; remembered on the device (busgame.route).
- High scores: busgame.highscore (route 138, so the old high score carries over) and busgame.highscore.1.
- Scenery lives in the 9px strip above and 8px strip below the road plus the road surface itself
  (lanes and HUD take the rest of the 144px screen):
  138: shophouse skyline with awnings/signboards, black-and-white kerbs, paved footpath with bollards,
  shop awnings, darker road with manhole covers and an occasional (subtle) zebra crossing.
  Kandy: layered green hills with a road winding over them and trees, red-earth shoulder, tea bushes,
  bend warning signs and milestones, older patched and cracked road.
- Gameplay identical: the World doesn't know the route (test: same seed -> same traffic and crash).
- Items 3.1-3.5 landed in one commit.

## Analytics (GoatCounter) + Supabase queries
- [x] G.1 GoatCounter script (count.v4.js, pinned with an integrity hash, async, cookie-free) counts page views for busgamemalindu
- [x] G.2 Events: run-start, run-end/0-500 | 500-1000 | 1000+, boost, share-whatsapp, leaderboard-viewed (plus leaderboard-unavailable). Fixed names only: no nicknames, exact scores or typed text
- [x] G.3 Never slows or breaks the game: sent outside the frame (setTimeout 0), try/catch everywhere, queue of 20 while the script loads, dropped after ~20 s if blocked
- [x] G.4 supabase/analytics.sql: runs per day, unique players, average run length, score distribution (tested on a local copy)
- [x] G.5 Tests: 5 unit tests (buckets, deferred sending, queue while loading, blocked, GoatCounter errors)

- [x] G.6 Deployed (08ffa74) and checked live in Chromium (portrait) and WebKit (landscape): script loads with its integrity hash; page view, run-start, run-end/0-500, leaderboard-viewed and share-whatsapp sent; no nickname or exact score in any request; no cookies; with GoatCounter blocked the game plays normally at ~60 fps with no errors. One real run sent to busgamemalindu (2026-11-18 12:35 UTC, iPhone user agent): 5 hits, all accepted (HTTP 200). Supabase was faked in these tests (no new leaderboard rows). Owner confirms on the dashboard.

## Creator credit
- [x] C.1 "Game Created By - Malindu K" in the HUD cyan (#3cfcfc): start screen (bottom, under "change name"; music credit and change name moved up a little to make room, all above the HUD) and the game-over panel (last row, under RETRY/SHARE; left column in landscape)
- [x] C.2 "Malindu K" links to https://www.linkedin.com/in/malindu-karu/ in a new tab (noopener); tapping it, or Enter on it, never starts/retries a run, steers or presses another button
- [x] C.3 Checked in Chromium + WebKit at 390x844, 844x390, 360x640, 640x360, 375x667, 667x375 (396 checks): on screen, cyan, clear of the music credit, change name, title/TAP TO START, HUD, thumb buttons, RETRY, SHARE, the leaderboard and "You:" line (with a full top 10); tap opens LinkedIn in a new tab, nothing else happens; panel still fits

## Play counter + creator credit (second request)
- [x] P.1 `supabase/plays.sql`: one-row `play_counter` (RLS on, no grants), seeded once from `count(*)` of `scores` and never reset on re-run; `add_play(device)` (security definer) +1 per run start, rate-limited per device (1/s, 60 per 10 min), per IP (200 per 10 min, so one network can't inflate it with made-up device ids) and overall (2,000/min); `play_count()`; anon may only execute those two. Only hashes of the IP/device id are kept, for an hour. 16 checks on local Postgres (`supabase/test_plays.sql`)
- [x] P.2 Lowercase a-z for the 5×7 font in the same style (x-height on the capitals' baseline, g/j/p/q/y and the comma hang below the line); text images grow to fit descenders
- [x] P.3 Start screen: "Played 1,234 times" (sentence case, commas, "Played 1 time" for 1) in the 5×7 font directly under the title; the two title lines moved up 3-4 px to make room; nothing else moved
- [x] P.4 Run start sends +1 without waiting (never delays the run; a failure is ignored); a random 32-hex device id is kept on the device for the rate limit
- [x] P.5 Count fetched when the start screen appears (opening the game, coming back to the tab) and every 30 s while it shows; not while playing; hidden (never 0) if it can't load
- [x] P.6 Tests: 5 unit tests (label, client calls, failures/timeouts -> hidden, SQL grants and seeding); Chromium + WebKit (30 checks): shown on opening, refreshed after 30 s, +1 per start/retry with the same device id across reloads, no calls during a run, hidden when Supabase is down, run starts at once when the +1 call fails or hangs; layout suite re-run with the counter showing (444 checks, 6 sizes x 2 engines)
- [x] C.4 Creator credit: already live from the previous change (C.1-C.3); re-checked with the counter showing
- Note: "returning from game over" doesn't pass through the start screen (RETRY goes straight into a run), so the count refreshes on opening the game, on coming back to the tab and every 30 s.
- [x] P.7 Owner ran plays.sql. Checked live against the real project: anon can call play_count/add_play, direct reads/updates of play_counter and play_rate_limits refused; start screen shows the real total in Chromium + WebKit at 390x844, 844x390, 360x640, 640x360; one real run start added exactly 1 (2,366 -> 2,367; a real player's run then made it 2,368)

## Leaderboard: per-device rate limit
- [x] L.1 `submit_score(nickname, score, run_seconds, device)`: per device 1 per 2 s and 30 per 10 min (was per IP); per nickname unchanged; looser per-connection backstop 300 per 10 min (no 2 s gap); overall 1,000/min (now counted once per submission); impossible-score check unchanged. Missing/junk device id = one device per connection. Old 3-argument function dropped; the device argument is optional so older cached copies of the game keep working
- [x] L.2 Game sends the same device id as the play counter; if the database still has the old function (404), it retries once the old way, so the order of deploy and SQL doesn't matter
- [x] L.3 Tests: 43 SQL checks (incl. two devices on one connection at the same moment both saved, 31st per device limited, 300 per connection with made-up ids limited, old 3-argument call, raw ids never stored, installing over the old version keeps scores and the counter); 140 unit tests; 195 leaderboard browser checks re-run against the new SQL; two browsers on one connection crashing at the same moment both saved
- Test hygiene: an outdated "not configured" test scenario reached the real project (3 "Offline Guy" rows, a few play-counter starts); all browser suites now block *.supabase.co unless a check is meant to be real
- [ ] L.4 Owner re-runs supabase/leaderboard.sql in Supabase


## Music drafts (not in the game)
- [x] D.1 Three original 8-bit baila tracks (A: Bus Stop Shuffle, G major; B: Kandy Express, A major; C: Galle Road Jump, D major): 6/8 at 130 BPM, 96 bars = 88.6 s, intro / verse / chorus / verse / chorus / drum break (air horn, cowbell) / final chorus, looping straight back to the intro. Square-wave trumpet hook and brass stabs, 4-bit triangle bass, off-beat pulse strum, bit-crushed overdriven drum machine with fills at every section end. Synthesised by `music-drafts/src/compose.py` (numpy + ffmpeg)
- [x] D.2 Preview page https://malindupegasis-sl.github.io/bus-game/music-drafts/ (not linked from the game, noindex): play/stop per track, section and bar display, sample-exact Web Audio loop (finds the real start whether or not the decoder strips the mp3 encoder delay), plays with the iPhone silent switch on (Safari 16.4+), download links
- [x] D.3 Checked: tempo measured at 130 BPM, no gaps or clipping, loop seam smaller than a normal sample step; live page in Chromium + WebKit: all three play, loop start found to the exact sample (Chrome strips the 1,105-sample mp3 delay, WebKit doesn't), decoded loop matches the original render at both ends; game build unchanged (same bundle hash), nothing links to the drafts

## Start / game-over tidy-up
- [x] T.1 Creator credit only on the game-over screen, now "Created By - Malindu K" (LinkedIn link, new tab)
- [x] T.2 HUD 28 -> 25 rows (~11% shorter); digits keep their 12x20 size, charm icon kept, labels repacked. The 3 rows went to the play area: road moved down 1px, footpath strip 8 -> 10px, top strip 9 -> 10px. Lane height (33), hitboxes and vehicle sizes unchanged; fairness, lane-fit and HUD tests re-run and pass
- [x] T.3 Title on one line (5x7 font at 2x), centred and clear of the mute button's tap area
- [x] T.4 Split-flap play counter: charcoal pixel tiles, cream digits (plain zero), split line and hinges, commas; each changed digit flips (top flap falls, new bottom flap drops in, 0.16 s); on every start-screen appearance it shows N-1 then flips to N; a higher 30 s refresh flips through every number (at most 12 steps for big jumps); hidden if the count can't load; never delays a run
- [x] T.5 Music credit bubble on the right of the start screen: Spotify's official green icon (from the Spotify developer design guidelines icon pack, unaltered SVG) at 21px (their minimum), on pure black (green is only allowed on black/white), with 11px clear space (rule: half the icon height), "Nandana Sihina Gange - Sangeeth Wijesuriya"; opens the track in a new tab; moves left of the landscape ▼ button; hidden outside the start screen. Taps never start a run or steer
- [x] T.6 Tests: 143 unit tests (incl. flip counter); 576 browser checks in Chromium + WebKit at 390x844, 844x390, 360x640, 640x360, 375x667, 667x375 (no overlaps between title, counter, TAP TO START, bubble, DRIVER/CHANGE NAME, mute, HUD, thumb buttons; Spotify size/ratio/clear space/background; bubble and credit taps; game-over credit clear of the leaderboard and buttons)
- [x] T.7 Deployed (6ad32f9) and checked live: the 576-check layout/tap suite passes on the live site (Supabase faked), rotation stress test and WebKit play checks pass; read-only against the real project, the counter showed 3,190 then flipped to the real total 3,191 in Chromium and WebKit

## Start screen layout, round 2
- [x] R.1 Title, flip counter and TAP TO START move as one group (spacing inside unchanged: counter 22px and TAP TO START 49px below the title top), vertically centred between the top of the screen and the top of the bottom bubbles (measured on each screen); title still clear of the mute button
- [x] R.2 Driver bubble bottom left, mirroring the Spotify bubble: one shared style (black pill, padding, 9px font, height), same inset from its edge, same top; pixel steering-wheel icon in the same 22x21 box as the Spotify icon; "Driver: NAME" / "Change name" on two lines. The whole bubble is the Change name button (touch adjustment on phones snapped taps near the link onto it anyway); taps never start a run or steer, and Space/Enter on it don't either. A long name is shortened with … only when both bubbles wouldn't otherwise fit (360px portrait with a 12-character name)
- [x] R.3 Landscape: both bubbles move inwards by the same amount to clear the ▲/▼ buttons, staying symmetrical
- [x] R.4 Checked in Chromium + WebKit at 390x844, 844x390, 360x640, 640x360, 375x667, 667x375 (948 checks): no overlaps between title, counter, TAP TO START, both bubbles, mute, thumb buttons and HUD (thumb buttons vs HUD readouts: they have always sat over the HUD panel's red ends in landscape), bubbles mirror each other (insets, tops, heights, styles, icon sizes), group centred, Spotify icon rules, taps

- [x] R.5 Deployed (a7f6b11) and checked live: 948/948 layout and tap checks (Supabase faked), rotation stress test and WebKit play checks pass; read-only against the real project the counter flipped 3,194 -> 3,195 in Chromium and WebKit

## Play counter: "bus tickets issued" + ticket machine
- [x] K.1 Wording "3,195 bus tickets issued" ("1 bus ticket issued"); the split-flap tiles are gone (flipping N-1 -> N on every visit looked like the player's visit added one)
- [x] K.2 A pixel conductor's ticket machine (18x20: grey body, bus-red stripe, green screen, light that blinks while issuing) with a cream ticket (red stripe, perforated end, dark ink) sliding out of its slot; the ticket prints with the total this phone saw last time (localStorage busgame.ticketsSeen) and then counts up to the real total; first visit or no change: no counting, never a fake +1; a higher 30 s refresh counts up on the same ticket; hidden if the count can't load; never delays a run
- [x] K.3 Same row as before, so the centred title group keeps its spacing; ticket sized for the final text so it doesn't change width while counting
- [x] K.4 Tests: 145 unit tests (incl. 5 for the ticket counter and wording); 948 layout/tap checks in Chromium + WebKit at 390x844, 844x390, 360x640, 640x360, 375x667, 667x375 with "1,234,567 bus tickets issued"

- [x] K.5 Deployed (c1290ca) and checked live: read-only against the real project (3,198 tickets) a first-visit phone printed 3,198 with no counting, a phone that last saw 3,193 printed 3,193 and counted up to 3,198, both remembered 3,198 (Chromium + WebKit); 948/948 layout and tap checks, rotation stress test and WebKit play checks pass
- [x] K.6 Wording shortened to "3,195 tickets issued" ("1 ticket issued"); the bus is implied by the ticket machine

## Start screen bubbles, iPhone fix (smaller, out of the game in portrait)
- [x] B2.1 Both bubbles share one size rule: 32px tall on portrait phones (21px icons, 5.5px above/below), 8px text on two lines (song / artist; driver / Change name), 11px icon-to-text gap (Spotify clear space 10.5px), the edge closer; each only as wide as its text, at least a 10px gap between them
- [x] B2.2 Portrait: below the game frame, centred in the empty strip above the ▲/▼ buttons, outer edges lined up with the buttons' outer edges (symmetrical)
- [x] B2.3 Landscape: inside the game's bottom corners above the HUD, clear of the ▲/▼ buttons, mirrored; scaled with the game but only as far as still fits a 12-character name without shortening
- [x] B2.4 Title group: still centred between the top of the game and what's at its bottom; in portrait that's now the HUD (the bubbles left the game), in landscape the bubbles. Spacing inside unchanged; counter untouched
- [x] B2.5 Checked in Chromium + WebKit at 390x844, 844x390, 360x640, 640x360, 375x667, 667x375 (978 checks): size, position, symmetry, no overlaps, Spotify rules, no name shortening, bubble taps never start a run or steer

- [x] B2.6 Found on the live site (Chromium, 640x360): if the Spotify icon loaded after the layout ran, the bubble was measured without it and ended up off-centre (portrait: 22px past the right edge; landscape: over the ▼ button). Fixed: the icon has its size attributes again and the bubbles are re-placed when it loads; tested with the icon delayed 1.5 s in Chromium + WebKit
- [x] B2.7 Deployed (57541cc) and checked live: 978/978 layout and tap checks, late-icon test, rotation stress test, WebKit play checks and the read-only ticket counter check all pass

## Start screen bubbles, round 3 (compact, on the road)
- [x] B3.1 Both bubbles back inside the game, on the road in its bottom corners, bottoms 1px above the kerb strip (logical y 108); driver bottom left, Spotify bottom right, mirrored to the sub-pixel; same rule in portrait and landscape; in landscape the inset grows equally to clear the ▲/▼ buttons
- [x] B3.2 Compact fixed size: 23px tall (Spotify icon exactly 21px, steering wheel the same, 1px above and below), 6px two-line text, 11px icon-to-text gap (Spotify clear space 10.5px), 1-4px edge padding, each only as wide as its text. Width: Spotify bubble 31% of the game in 390px portrait (33% at 360px), 18% in landscape; driver bubble with a 12-character name 29% / 31% / 17% ("Driver: Malindu" is under 25%). A quarter in portrait would need ~4.5px text (Spotify's 22-character song line plus the required clear space)
- [x] B3.3 Title group centred between the top of the game and the bubbles (spacing unchanged)
- [x] B3.4 Checked in Chromium + WebKit at 390x844, 844x390, 360x640, 640x360, 375x667, 667x375 (1,092 checks): position, size, mirroring, no overlap with title, ticket counter, TAP TO START, the bus, the kerb, the HUD or the thumb buttons; Spotify rules; taps never start a run or steer; only on the start screen; late-loading icon still placed correctly

- [x] B3.5 Screenshots sent before deploying; deployed (3750ecf) and checked live: 1,092/1,092 layout and tap checks, late-icon test, rotation stress test, WebKit play checks and the read-only ticket counter check all pass
