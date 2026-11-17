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
- [ ] 1.1 Lime-and-chilli boost: chilli pickups; 2 chillies hang a charm on the back of the bus; lime appears only after 2 chillies; lime completes the charm and starts the boost
- [ ] 1.2 Conductor hangs out of the door and shouts (speech bubble) when the boost starts
- [ ] 1.3 Lucky charm: saves one crash; charm falls off, 1.5 s blinking invincibility, collecting restarts from zero
- [ ] 1.4 After the boost the charm comes off and collecting restarts from zero
- [ ] 1.5 HUD charm-progress icon (empty / 1 chilli / 2 chillies)
- [ ] 1.6 Pickups are never placed where collecting one forces a crash
- [ ] 1.7 Dham Rajina Xpress: purple/pink/magenta party bus, chrome, colour-cycling LED strips, name on the sign board; short transition back
- [ ] 1.8 Boost effects: invincible with sparkles, road 1.3x, double score, 6 s
- [ ] 1.9 Chipmunk music during the boost (1.35x, preservesPitch off), normal afterwards
- [ ] 1.10 Politician's convoy: 5 black SUVs in one lane, flashing red/blue lights, after the warm-up only, rare
- [ ] 1.11 Fictional politician (white national dress, maroon shawl, invented face) shouting a campaign promise
- [ ] 1.12 Rival same-route buses travelling your way; overtaking one gives +50 with an "OVERTAKE!" popup; no penalty
- [ ] 1.13 First-appearance captions for each obstacle and pickup, short and out of the way
- [ ] 1.14 Tests: convoy fairness (long lane block, always a path), rival bonus scoring, charm states, lucky-charm save, pickups never force a crash
- [ ] 1.15 Stage 1 checked headless at 390px portrait + landscape, deployed and checked live -> STOP

## Stage 2: bus customisation
- [ ] 2.1 Garage screen from the start menu: bus colours
- [ ] 2.2 Decorations: sign board style, lights, stickers
- [ ] 2.3 Saved on the device (localStorage, try/catch)
- [ ] 2.4 Dham Rajina Xpress look overrides the custom look while boosted
- [ ] 2.5 Tests, headless check at 390px portrait + landscape, deployed and checked live -> STOP

## Stage 3: routes
- [ ] 3.1 Route picker before a run: 138 (Colombo city) and Colombo to Kandy (route 1)
- [ ] 3.2 138 scenery: busy streets, shops
- [ ] 3.3 Colombo to Kandy scenery: hills, greenery, bends
- [ ] 3.4 Separate high score per route (existing high score carries over to the 138)
- [ ] 3.5 Rival buses show the selected route's number; gameplay identical across routes
- [ ] 3.6 Tests, headless check at 390px portrait + landscape, deployed and checked live -> STOP
