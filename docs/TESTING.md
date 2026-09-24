# MeowCat — Testing Guide

## 1. Test pyramid (all runnable on Linux CI)

| layer | count | runner | what it proves |
|---|---|---|---|
| unit | 288 | `node --test` (no browser) | brain gaits & physics, platform hopping, ground-stroll-only (no roaming), emote anchors, window JSON parsing, scanner lifecycle, warm-window pool, economy (paid + unlimited promo), reminder scheduling, topmost enforcer, breed/body integrity (**24 breeds / 8 bodies** incl. the v3.11 kitten litter), **v3.5 funny pack: sneeze/hairball/zoomies states, post-meal zoomies gate, full laser-chase cycle incl. timeout, butterfly notice rules, panda hairball exclusion**, **v3.11: lane math (zero window moves while walking), drag-follow chase target, multi-display union, typing-hook isolation state machine, ginger-kitten default + migration, screenshot-style zone conversion, sound-spec wiring** |
| visual | 89 | Playwright + `test/harness.html` | every state/breed/emote paints, feet stay planted, animation is alive (frames differ), breeds are pixel-distinct, mirror flip is symmetric, panda has black+white anatomy, emote life-cycle, **v3.6: 7 new states, 4 new emotes, seasonal hats, custom-skin palettes** |
| E2E | 44 | real Electron under Xvfb + CDP | boot → paint → brain advance → IPC actions → coins persist → reminders fire/consume → settings warm-open <300 ms → close keeps pool warm → 24 store cards → premium UI → double-click popup → about page (version + dev link) → free panda unlock → reminders UI → **live window-top jump** → region follow → tap→meow+heart, hold→pet → **v3.5: laser toy chase+pounce+catch (+3 coins), ambient butterfly, MeowCat window title, AppUserModelID, version 3.7.0** → idle self-destroy |
| E2E v3.6 | 43 | real Electron under Xvfb + CDP (`e2e-v36.mjs`) | **every v3.6 feature live**: 19 toggles round-trip (+ the 3 hide toggles must STAY deleted) → real CPU-hog stress pulse → music bop sustain/stop → typing burst→pounce (real meter) → cursor stalk+pounce catch (+affection) → cursor-move abort → new-window sniff walk → editor loaf jump → build green/red dance & mope → battery curl/clear → companion nuzzle (+stat) → dance-party ghosts → photo PNG saved to Pictures → affection meter + 2 achievements → pomodoro IPC → no-walk zone respected live → call-ducking hook verified deleted → community skin import + store card + pumpkin hat → seasonal toggle → time-bias wiring → Win11 settings UI (10 nav pages, 21 switches, 8 achievement cards) |
| E2E robust | 20 | real Electron under Xvfb + CDP (`e2e-robust.mjs`) | adversarial: **v3.10: a real zoom process does NOT hide the cat and the loop keeps painting; the hidden state has only the user flag; the closed cat window RESURRECTS itself (~440 ms) with the process never dying** → reminder fires once through the 1s scheduler → hostile setSettings can't poison the store → poisoned region rect rejected → bad photo data rejected → perk activation mid-run → skin-import dedupe → status-file verdict gating → torture pass ends with a healthy renderer |
| E2E v3.7 | 9 | real Electron under Xvfb + CDP (`e2e-v37.mjs`) | **hop does not flap the region** (jumping-bug fix) → cat never drawn outside the canvas during slides → **v3.11: strolling moves the lane window ZERO times (flicker structurally dead)** → companion kitten leashed back and kept visible → **quick tap plays the natural single meow + heart** → **v3.10: a call app does NOT hide the cat, does NOT pause the render loop, `__catVisible` stays true** |
| E2E v3.9 | 6 | real Electron under Xvfb + CDP (`e2e-v39.mjs`) | **THE chase camera: per-frame origin deltas never spike** (p99 ≤ 16px measured across stroll+zoomies+jump; the old slide moved up to 400px in ONE frame) → cat stays fully visible during a max-legal 400px platform jump → **tracker ride: a dragged border carries the cat at a smooth capped speed** (measured ≤ 800px/s) → tracker vanish: one missed poll tolerated, two = animated fall → `platform-track` IPC retargets on landing/leaving |
| E2E v3.10 | — | covered by robust + v36 + v37 + `v310.test.mjs` | **the no-hide / never-stop contract**: no `hideDuringCalls`/`duckDuringCalls`/`hideInFullscreen` anywhere (settings, UI, main, renderer), no call/fullscreen detection exports, no process-list sampling (linux spawns ZERO subprocesses), crash guards present (`uncaughtException`, `render-process-gone` revival, closed-window self-heal) |
| E2E v3.11 | 30 | real Electron under Xvfb + CDP (`e2e-v311.mjs`) | **the walking-flicker test done properly**: 90 consecutive canvas frames captured while the cat walks — the cat is visible in EVERY frame, frame-to-frame motion stays continuous (max bbox jump ≤ 26px measured 7.1px), and the window issues ZERO region moves during the stroll → **drag-follow**: the cat hauled 620px outside the old region stays ON the canvas and visible in every sample, the window follows (19 moves measured), and the drop lands exactly where released → **sound spec**: quick click = `meow_single`, double-click = classic voice, ambient scheduler armed, master toggle silences everything → **zone selector**: the screenshot-style overlay opens with the display union, a drawn rect lands in the zone list workArea-relative → **never-stop contract**: helper windows closed, second launcher exits quietly, first cat survives, typing hook enabled at boot |

Run:

```bash
cd app-electron
npm test                        # unit + visual (377 checks)
node scripts/e2e-linux.mjs      # real app E2E (needs Xvfb on Linux)
node scripts/e2e-v311.mjs       # v3.11 feature E2E (needs Xvfb on Linux)
```

## 2. Determinism

* The brain uses seeded `mulberry32` RNG in tests — platform jumps and gaits are
  reproducible.
* The renderer is a pure function of `(t, state, breed, dir, scale, jumpP)` — visual
  tests can compare exact pixel buffers between timestamps.

## 3. Build-level verification

* `node scripts/gen-icons.mjs` regenerates `icon.ico` (7 sizes), `icon.png`, `tray.png`
  from the procedural face — no binary assets committed by hand.
* `node scripts/patch-exe.mjs <exe> [out] [ver]` stamps PE resources (name/icon/version)
  — verified by parsing the output PE for the UTF-16 strings and PNG icon payloads.
* `npm run dist` builds `MeowCat-3.1.0-portable.exe` via electron-builder
  (`signAndEditExecutable:false` on Linux; the patch script supplies identity instead).

## 4. Manual QA checklist (Windows 11, v3.2)

1. Run the portable exe → tray icon (cat face) appears; Task Manager shows **MeowCat** with the cat icon, not "electron"
2. Cat strolls along the ground edge-to-edge and never wanders off to random screen points (v3.2: no roaming)
3. Open any window; when the cat walks near, it jumps onto the **top border** and strolls along it
4. With two windows side by side, the cat hops from one top border to the other
5. Resize a window and repeat — any size window is a valid platform
6. Close a window while the cat is on it → the cat is back on the ground (no crash, no floating)
7. Double-click the cat → Settings opens instantly; Close hides it; reopen is instant
8. Single click → purr + heart emote; **drag & drop is silent**
9. Right-click → context menu (Settings/Reminders/Dance/Feed/Sleep/Quit)
10. Switch to Panda → waddle gait, bamboo munch with drawn stalk, somersault roll
11. Watch sleep → tail stays attached to the curled body (no floating tail)
12. Watch run/dance/pounce → squash & stretch, feet plant on the ground, natural gait
13. Emotes pop above the head and fade after ~2 s
14. Reminders → add one for 1 min ahead → cat dances + bubble + chirp
15. Coin pill updates; every breed unlocks free (unlimited promo); select Panda persists after restart
16. About panel → version v3.1.x, developer GitHub link opens the browser
17. Toggle "Start with Windows" → survives reboot (HKCU Run / Electron login item)
18. Fullscreen a video/game → cat remains visible above it
19. Drag the cat onto a window top border → it snaps to the border
20. Tray → Quit → app exits cleanly (no zombie processes in Task Manager)

## 5. Environment notes

* Linux CI: Electron runs under Xvfb; `wine` is blocked by the sandbox, which is why
  the portable exe is resource-patched in pure JS instead of rcedit.
* PowerShell window scanning only starts on `process.platform === 'win32'`; everywhere
  else the brain simply has no platforms (tests inject them).
