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
- Chipmunk mode: song at 1.35x with preservesPitch off, during the boost only.
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
- [ ] S.6 Deployed and checked live in WebKit and Chromium -> STOP for the owner to test

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
