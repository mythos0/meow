# MeowCat — Testing Guide

## 1. Test pyramid (all runnable on Linux CI)

| layer | count | runner | what it proves |
|---|---|---|---|
| unit | 303 | `node --test` (no browser) | brain gaits & physics, platform hopping, ground-stroll-only (no roaming), emote anchors, window JSON parsing, scanner lifecycle, warm-window pool, economy (paid + unlimited promo), reminder scheduling, topmost enforcer, breed/body integrity (20 breeds / 8 bodies), **v3.5 funny pack: sneeze/hairball/zoomies states, post-meal zoomies gate, full laser-chase cycle incl. timeout, butterfly notice rules, panda hairball exclusion** |
| visual | 89 | Playwright + `test/harness.html` | every state/breed/emote paints, feet stay planted, animation is alive (frames differ), breeds are pixel-distinct, mirror flip is symmetric, panda has black+white anatomy, emote life-cycle, **v3.6: 7 new states, 4 new emotes, seasonal hats, custom-skin palettes** |
| E2E | 129 | real Electron under Xvfb + CDP | boot → paint → brain advance → IPC actions → coins persist → reminders fire/consume → settings warm-open <300 ms → close keeps pool warm → 20 store cards → premium UI → double-click popup → about page (version + dev link) → free panda unlock → reminders UI → **live window-top jump** → region follow → tap→meow+heart, hold→pet → **v3.5: laser toy chase+pounce+catch (+3 coins), ambient butterfly, MeowCat window title, AppUserModelID, version 3.7.0** → idle self-destroy |
| E2E v3.6 | 43 | real Electron under Xvfb + CDP (`e2e-v36.mjs`) | **every v3.6 feature live**: 22 toggles round-trip → real CPU-hog stress pulse → music bop sustain/stop → typing burst→pounce (real meter) → cursor stalk+pounce catch (+affection) → cursor-move abort → new-window sniff walk → editor loaf jump → build green/red dance & mope → battery curl/clear → companion nuzzle (+stat) → dance-party ghosts → photo PNG saved to Pictures → affection meter + 2 achievements → pomodoro IPC → no-walk zone respected live → call ducking → community skin import + store card + pumpkin hat → seasonal toggle → time-bias wiring → Win11 settings UI (10 nav pages, 24 switches, 8 achievement cards) |
| E2E robust | 19 | real Electron under Xvfb + CDP (`e2e-robust.mjs`) | adversarial: real zoom proc hides cat → toggle-off unhides instantly → duck lifts on exit → reminder fires once through the 1s scheduler → hostile setSettings can't poison the store → poisoned region rect rejected → bad photo data rejected → perk activation mid-run → skin-import dedupe → status-file verdict gating → torture pass ends with a healthy renderer |
| E2E v3.7 | 10 | real Electron under Xvfb + CDP (`e2e-v37.mjs`) | **hop does not flap the region** (jumping-bug fix) → cat never drawn outside the canvas during slides → slides still happen while strolling → companion kitten leashed back and kept visible → **quick tap plays a real meow + heart** → real call app hides cat → **paints freeze while hidden** (CPU win) → `__catVisible` flag → cat returns and painting resumes |

Run:

```bash
cd app-electron
npm test                        # unit + visual (359 checks)
node scripts/e2e-linux.mjs      # real app E2E (needs Xvfb on Linux)
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
