
---
Task ID: 6
Agent: Super Z (main)
Task: Fix "invisible cat" bug — user screenshot showed empty store cards/live preview; make cat render everywhere; drop frame-interpolation & vector-art work per user; rebuild + test + release v2.0.1

Work Log:
- Diagnosed root cause: MSI v2.0.0 shipped ZERO sprite PNGs (installer Files.wxi/Dirs.wxi only packaged exe+dlls+ico+sounds); LoadFrame() returned null → only contact shadow rendered
- Re-sliced calico from magenta screens: made keyer chroma-agnostic (green OR magenta axis), scaled spill threshold with screen strength, disabled sure_fg dam on strong screens, added bg-island dropping; generated new calico walk sheet (candidate a) + deterministic frame repair (bite-fill / pink-drop)
- Rewrote scripts/gen_wix_files.py (dynamic Dirs.wxi + Files.wxi, recursive) — still unusable: WiX v4/v5 dotnet tool errors WIX0389 on EVERY Directory/@Name on Linux (GetCanonicalRelativePath does Path.GetFullPath("C:\"+name), broken on Unix)
- Confirmed even pristine HEAD installer files fail with wix 4.0.5/5.0.2 → tool is broken on Linux, not content
- Restored msitools pipeline without root: apt-get download msitools/wixl/libmsi/libgcab/libgsf debs → dpkg -x into ~/opt/msitools/root (wixl 0.106 works with LD_LIBRARY_PATH)
- Rewrote scripts/gen_wixl_wxs.py: nested directory tree under INSTALLFOLDER (Assets/sprites/<breed>/<clip>/), one component per file, uuid5 stable GUIDs, fixed double-emit + missing Assets-level files bugs; start-menu + desktop shortcuts
- Built MeowCat-2.0.1-x64.msi (40.2MB) and VERIFIED payload with msiextract: 126 PNG sprites at exact SpriteCatalog paths + 17 wavs + fx decals + exe/dlls
- Rewrote scripts/build_msi.sh to the wixl pipeline with built-in payload verification (fails if PNG count < 126)
- Visual test: scripts/render_proof.py replicates SpriteRenderer.Render geometry → download/meowcat_v2.0.1_render_proof.png shows all 6 breeds + desktop cat walking between folders
- dotnet build: 0 errors; dotnet test: 56/56 passed
- Version bumped 2.0.0 → 2.0.1 (csproj)

Stage Summary:
- ROOT CAUSE FIXED: installer now packages every asset recursively; MSI verified to contain all frames
- Desktop shortcut added to Product.wxs + wixl generator (default on install, per-machine Public Desktop)
- Deliverables: artifacts/MeowCat-2.0.1-x64.msi; proof image in /home/z/my-project/download/
- Frame interpolation (more-frames) task CANCELLED per user; vector-art path abandoned per user

---
Task ID: 7
Agent: Super Z (main)
Task: Deliver portable EXE ("give me exe file") — self-contained single-file build + integrity verification

Work Log:
- Verified all 122 sprite frames non-empty (alpha coverage check: 0 suspicious frames) — "no cat" root cause remained the v2.0.0 MSI missing payloads, already fixed in 66016b8
- Sandbox reset wiped .NET SDK → reinstalled 8.0.425 via dotnet-install.sh
- dotnet build Release: 0 errors, 0 warnings; dotnet test: 56/56 passed
- dotnet publish self-contained win-x64 single-file: PublishSingleFile + IncludeAllContentForSelfExtract + IncludeNativeLibrariesForSelfExtract + EnableCompressionInSingleFile, PDBs stripped
- Verified EXE: MZ header OK; .NET bundle signature found (offset 7953968, header offset 105587118); bundle manifest contains all 126 sprite paths + 17 wav paths; size 105.6MB confirms bundled runtime
- Cleaned git file-mode noise (core.fileMode=false), ignored artifacts/exe-release/, pushed to private repo

Stage Summary:
- Deliverable: download/MeowCat-2.0.1-win-x64.exe (105.6MB, runs on any Win10/11 x64, no .NET install / no installer needed, assets self-extract to %TEMP% on first launch)
- Private repo pushed: 650f7c1

---
Task ID: 8
Agent: Super Z (main)
Task: v3.0 rewrite per user — "which kind of windows app can you test? make it that way; replace frame-based cat with your best 2D canvas"

Work Log:
- Answered user's question: HTML-canvas apps are fully testable here (headless Chromium) → rebuilt on Electron 33 (same Chromium engine as user's Windows target)
- Wrote app-electron/src/cat-renderer.js (~700 lines): procedural cat, 10 states, 6 breeds, IK legs, chained tail, radial-gradient shading, rim light, particles; zero frames
- Visual iteration: harness + Playwright screenshots; fixed tail y-axis bug (drooped to ground), far-leg contrast, siamese points/ears, tuxedo chest
- Pure modules: cat-brain (seeded state machine), reminder-scheduler, settings-store, topmost-enforcer → 37 node:test unit tests
- Visual tests: 13 Playwright tests (per-state pixel coverage, bbox/feet position, animation aliveness, breed distinctness, mirror flip)
- Electron app: screen-sized transparent overlay (no window moves = no jank), click-through with hit-test forwarding, drag + double-click pet, tray, settings window with live breed previews, reminders window, coin economy, auto-start, screen-saver-level topmost re-assert
- Real-app E2E on Linux: Xvfb + electron --remote-debugging-port + Playwright CDP → 14/14 (boot, render, brain, IPC actions, coins persist, settings persist, reminder fire→dance→consume, settings/reminders windows, UI add reminder)
- Packaging: wine blocked by seccomp ("bad system call") → signAndEditExecutable:false; NSIS portable target built: dist/MeowCat-3.0.0-portable.exe (75.8MB), asar payload verified (@electron/asar list: all src/windows/sounds/assets)
- Deliverables in download/: MeowCat-3.0.0-portable.exe + 3 preview PNGs

Stage Summary:
- v3 portable EXE delivered and fully tested (64 automated checks)
- Frame-based sprite pipeline superseded by procedural canvas renderer

---
Task ID: 9
Agent: Super Z (main)
Task: v3.1.0 — more breeds/bodies + panda, more actions/emotes, window-top hopping, fast settings, roaming, identity/UX polish

Work Log:
- Renderer: BODIES body-type system (6 skeletons), 7 new breeds (bombay, russian_blue, ginger_kitten, ragdoll, bengal, maine_coon) + panda (round ears, eye patches, black limbs, shoulder band, stubby tail) → 13 breeds
- Renderer: 10 new actions (stretch/groom/pounce/knead/loaf/yawn/startle + panda waddle/bamboo/roll) → 20 states; drawEmote with 11 glyphs (pop/spring/fade, badge bubbles); leaf/bamboo prop; whole-body rotation for somersault
- FIX: tail drawn inside body transform — no longer floats off rotated/squashed torso (sleep bug user reported)
- Brain: breed-aware weights (panda set), EMOTE_ON contextual emotes, platform hopping (jump onto ANY nearby window top ≤420px, walk span-clamped, neighbor hops ≤560px, drop to ground), open-field roaming (70% of walks go to random screen points), dropAt snapping
- window-scan.js: PowerShell EnumWindows scanner (DWM cloaked filter, own windows excluded) + pure JSON parser + dedupe emitter; main starts it on win32 only
- fast-windows.js warm pool: settings/reminders created hidden at startup; open = show+focus (4ms measured); FIX: renderer window.close() destroys → new close-window IPC keeps pool warm
- UX: double-click opens Settings popup (pet moved to delayed tap), right-click context menu, drag/drop silent (mousedown meow removed)
- Settings: premium store UI (gradient cards, hover lift, gold selected ring, NEW badges, coin pill), breed display names, About panel (version, Electron, github.com/mythos0 dev/repo/issues links via whitelisted open-external)
- Icon: new background-less procedural cat face (256→16), icon.ico 7 sizes + tray.png via png-to-ico
- patch-exe.mjs: pure-JS resedit PE patcher — strips stub resources, stamps MeowCat FileDescription/ProductName/version/mythos0 + 7 icon sizes (Task Manager shows MeowCat, not electron); verified by PE parse
- Tests: roam.test.mjs + platforms/window-scan/fastwindows/breeds suites → 78 unit; visual suite extended to all states/breeds/emotes → 60; e2e extended (fast open, dblclick, about, store, live hop) → 24/24. TOTAL 162 automated checks green
- Docs: README rewritten ("How the cat is rendered" full detail), docs/RENDERING.md, FEATURES/TESTING refreshed for v3.1
- Build: electron-builder portable → dist/MeowCat-3.1.0-portable.exe → patched → download/ (76.2MB, asar payload verified)

Stage Summary:
- v3.1.0 delivered: download/MeowCat-3.1.0-portable.exe (162 checks green)
- Ready: push private repo, then public repo (README + release asset only)

---
Task ID: 9 (final)
Agent: Super Z (main)
Task: repos — private push (code+README) and public push (README+release only)

Work Log:
- Private repo mythos0/meow: commits 6c86bbc (v3.1.0: all features/tests/docs) + 059bc28 (drop debug repro) pushed to main
- Public repo mythos0/MeowCat (already existed, public): README rewritten for v3.1 procedural era (download/FAQ/interactions/credits), old v2 screenshots replaced with v31_live/v31_store/v31_sheet/v31_panda, commit 1dd4cdb pushed
- Release v3.1.0 created on public repo ("Panda, Window Hopping & Open-Field Roaming") with MeowCat-3.1.0-portable.exe attached (76,166,079 bytes, state=uploaded); releases/latest now points to v3.1.0; download URL verified (HTTP 302)
- Final verification: 78 unit + 60 visual + 24 E2E green (two consecutive clean 24/24 runs)

Stage Summary:
- v3.1.0 shipped: private repo = full source; public repo = README + screenshots + release asset only
- Deliverable: download/MeowCat-3.1.0-portable.exe + GitHub release live

---
Task ID: 10
Agent: Super Z (main)
Task: v3.2.0 — remove random walking, emote-anchor bugfix, real eating animation, panda research+redesign, 7 new store cats, RAM diet

Work Log:
- Web-researched giant pandas per user instruction (3 searches: gait/waddle, feeding posture, anatomy) — sources confirm bear body, 10-15cm stub tail, black ears/eye-patches/muzzle/legs/shoulders, feeding SITTING with curved paws hooking bamboo, love of rolling, sprawled naps
- cat-brain.js: REMOVED open-field roaming (opts.roam, _roamTarget, _pickRoamTarget, _roamTick) — ground edge-to-edge strolls only + window-top hops; roll state now travels forward; 'happy' weight fixed (was falling to default); eat duration 4.9s for 3 bite cycles
- Emote bug FIXED: emoteAnchor(breed) exported per-body anchor just above head; cat.html passed y scaled by size AND drawEmote scaled it again (double-scale) + old -158 baseline floated ~60px over every head; harness + tests updated
- Eating redesigned: fish prop on ground (shrinks per bite, tail fin drops after first bite), 5 mouth modes incl. wide-open 'bite' with teeth and 'chew' with side-to-side jaw + bulging cheek + fish-crumb particles; bamboo upgraded to sit-up + both paws hooking stalk + gnaw cycles (research-backed)
- Panda rebuilt: BODIES.panda bear barrel (rx 50, 4-seg stub tail r10), pandaFace (dark muzzle, slanted cheek eye patches, low lateral round ears), heavier waddle (3.8Hz, head sway), sprawled-flat sleep; tuned after visual QA (patches/muzzle resized for cuteness)
- 7 new breeds + 2 new bodies: chibi (mochi/sakura) + munchkin (choco_munchkin); features: foldEars, hetero (eye2), blaze, blush, beans, bigEye, brushTail; prices added; BREEDS 13→20, BODIES 6→8
- RAM diet: disableHardwareAcceleration + in-process-gpu (no GPU proc), network-service-in-process (no network utility; feature-flag variant didn't work, standalone switch did), AudioServiceOutOfProcess disabled, reminders MERGED into settings window (one warm renderer, reminders.html deleted), v8CacheOptions none, --max-old-space-size=160, window-scan 2.2s→3.2s; scripts/mem-report.mjs measures procs+PSS; measured 10→7 Linux procs (3 zygotes absent on Windows → ~5 procs), RSS 1042→863MB; 'desynchronized' canvas flag caused a real E2E renderer crash — removed
- Tests: stroll.test.mjs replaces roam.test.mjs (pins no-roaming), breeds tests 20/8 + emote-anchor hugging test, e2e 24/24 incl. merged reminders UI; TOTAL 140 node:test + 24 E2E green
- Visual QA: 60 screenshots inspected (eat phases, panda phases, all new breeds, emote strip); sheet/panda shots + docs/screenshots/v32_* refreshed
- Docs: README (8-body table, 20-breeds, panda research table, memory diet section, no-roaming), FEATURES.md v3.2, TESTING.md, RENDERING.md counts
- Build: MeowCat-3.2.0-portable.exe (76.2MB) built, patch-exe v3.2.0 stamped (PE verified: MeowCat + 3.2.0 UTF-16 present), asar payload verified (27 app files, no reminders.html), delivered to download/

Stage Summary:
- v3.2.0 shipped: download/MeowCat-3.2.0-portable.exe
- All user asks addressed: no random walking, emote distance fixed, real fish-biting/chewing eat, 7 fully new designed cats + photo-matched Mochi, panda researched online and rebuilt (not cat-like), memory diet ~5 procs on Windows
- 164 automated checks green (140 test + 24 e2e)

---
Agent: Super Z (main)
Task: v3.4.0 — "make it 1 process, rename electron to proper app name in process manager, test all features properly"

Work Log:
- Empirically disproved TRUE single-process on Electron 33: `--single-process` SIGTRAP-crashes at boot even a BLANK app (probe scripts + blank app test, 5 flag-mitigation variants, with/without CDP) — Chromium 130 framework bug; documented so nobody re-tries it
- Proved JS-appended switches never reach early helpers (zygotes/network utility spawn before app JS) — the v3.2 `network-service-in-process` append was inert; removed misleading flags, kept verified ones (disableHardwareAcceleration API, js-flags reaches renderers, AudioService disable)
- Shipped the honest process floor: main + renderer + network helper = 3 MeowCat.exe at rest on Windows (was 7 "electron" rows); no GPU process; no crashpad (never started); `process.title='MeowCat'` verified via comm
- fast-windows.js: warm Settings now self-destroys after 5 idle minutes (MEOW_WARM_IDLE_MS override, unref'd timer, cancel-on-show) — returns the process count to the at-rest floor; 2 new unit tests
- New Behaviour toggle "Jump onto window tops" (windowHopping default on): scanner created on demand via ensureScanner(), settings:set start/stop live — off = zero transient PowerShell spawns
- Auto-start portable fix: registers the ORIGINAL portable exe (PORTABLE_EXECUTABLE_DIR scan) instead of the %TEMP% extraction path that dies on reboot
- Task-Manager identity: NEW afterPack hook stamps MeowCat name/version/icon into the INNER exe (electron-builder skipped it via signAndEditExecutable:false — the unpatched inner exe said "Electron"; that was the name the user saw); fixed patch-exe.mjs binary FileVersion stuck at 3.1.0.0; new verify-exe.mjs reads PE resources back and asserts identity — PASS on launcher AND inner exe
- Tests: 147 unit (+2 idle-destroy) / 62 visual / 37 E2E (+10: MeowCat identity, no GPU, no crashpad, 1 renderer at rest, proc-count cap, hopToggle round-trip, idle self-destroy + fast reopen) all green; observer 6/6 (no roam, in-bounds, 10 states, emotes); 60-shot visual proofs regenerated to artifacts/v34-shots
- Build: MeowCat-3.4.0-portable.exe (76,189,171 B) — afterPack-patched inner + patched launcher, SFX payload verified (7z offset + NSIS marker); delivered to download/ + GitHub Release v3.4.0 (round-trip SHA-256 verified 2f8ab1e0...)
- README: "Process & memory diet (v3.2 → v3.4)" rewritten with honest single-process findings; identity row; testing pyramid counts updated; pushed main (ce995b8) + tag v3.4.0

Stage Summary:
- Release: https://github.com/mythos0/meow/releases/tag/v3.4.0
- Task Manager now shows MeowCat (never "electron"); at-rest = 3 MeowCat.exe on Windows; 1-process is impossible on stock Electron 33 (framework bug, proven) — documented in README + release notes
- 246 automated checks green (147 unit + 62 visual + 37 E2E)

---
Task ID: 14
Agent: Super Z (main)
Task: v3.5.0 — funny features pack + "still shows electron in process manager" investigation & bulletproof identity

Work Log:
- FORENSICS on the shipped v3.4.0 EXE (downloaded from the release, carved the 7z out of the SFX, parsed PE resources with pefile/resedit): launcher AND inner MeowCat.exe carry FileDescription "MeowCat — your desktop cat", ProductName MeowCat, OriginalFilename MeowCat.exe, 7-icon group; the only "Electron" UTF-16 strings are internal symbol names in .rdata (window class names) that Windows never displays → the user's sighting almost certainly came from an older v3.3.0-or-earlier download
- Found & fixed a real bug anyway: inner exe's BINARY VS_FIXEDFILEINFO was 0.0.0.0 (patch-exe.mjs called setFileVersion/setProductVersion AFTER outputToResourceEntries — changes never serialized); fixed order, binary version now 3.5.0.0
- Identity hardening: app.setAppUserModelId('com.mythos0.meowcat') (Electron 33 has no getter — constant reported via app-info for e2e), <title>MeowCat</title> on cat.html + settings.html, About page relabelled "Runtime: Electron vX"
- NEW build gate scripts/verify-artifact-identity.mjs: carves 7z from the finished portable EXE (BCJ2 — py7zr can't, uses bundled 7z from /home/z/my-project/tools/7zip), extracts inner exe, asserts 27 identity facts across ALL shipped EXEs (every string MeowCat, none Electron, binary version, icons, launcher too) — run in CI/build, exits 1 on any leak
- verify-exe.mjs hardened: now also asserts binary fixed version + per-string Electron scan + OriginalFilename
- Funny pack (brain+renderer+cat.html): 4 new states — sneeze (wind-up → droplet-blast AH-CHOO + shock wedge → dazed recover), hairball (cough heaves → fuzzy souvenir prop drops out, sweat emote), zoomies (1.7× run gallop, pinned ears, dust trail; fires alone rarely AND 45% right after eat/bamboo — "snack raccs"), laser (interactive: stalk → chase → pounce → catch); laser toy lives in cat.html (dot spawn/drift/flee/clamp), brain only chases fed coords, catch = +3 coins + star emote + happy, miss = dot teleports away, total chase capped at 8s incl. pounces (_laserAge accumulates in tick); ambient butterfly (5 hue morphs, 18-42s cadence, idle cats noticeButterfly→pounce, butterfly flees faster); bread emote for loaf
- main.js/preload: tray + context menu "Laser pointer!" → laser-start IPC (preload allowlist), 24 states / 12 emotes now
- Tests: NEW tests/funny.test.mjs (10: state registry+emotes, long-sim hits all gags, zoomies speed & bounds, post-meal gate both ways, laser chase→pounce→resume, 8s timeout stops laser, safe no-ops, butterfly rules, panda hairball exclusion) → 166 unit green; E2E +6 (laser live chase+pounce, laser catch +3 coins, butterfly live, window title MeowCat, AUMID, version 3.5.0) → 43/43 green; behavior observer 6/6 (no roaming contract intact, bread emote seen live); mem-report 5 procs / 285MB PSS on Linux (Windows floor 3 × MeowCat.exe)
- Visual QA: contact sheet + single renders of sneeze (3 phases), hairball (3 phases), zoomies, laser stalk, bread emote, laser dot, butterfly, chase vignettes; harness sheet extended with a toys row; sneeze droplets strengthened for contrast after first render was too faint
- Build: MeowCat-3.5.0-portable.exe (76,174,330 B) — afterPack stamps inner exe (3.5.0.0 binary version now lands), launcher patched, verify-exe PASS both, verify-artifact-identity PASS 27/27, v3.5 feature strings verified inside app.asar, delivered to download/ + GitHub Release v3.5.0 (round-trip SHA-256 verified 9a36da1c…)
- Cleanup: deleted the abandoned draft v4.0.0 C# release; docs refreshed (README funny-pack + identity forensics sections, FEATURES 24 actions/12 emotes, TESTING pyramid 166/62/43)

Stage Summary:
- Release: https://github.com/mythos0/meow/releases/tag/v3.5.0
- v3.5.0: funny pack (laser/zoomies/sneeze/hairball/butterfly/bread) + every identity surface provably MeowCat (27-assertion artifact gate), 209 automated checks green
- Task Manager can only show "MeowCat" (3 × MeowCat.exe at rest on Windows); old downloads were the "electron" culprit

---
Task ID: 15
Agent: Super Z (main)
Task: v3.6.0 — "add all of this feature properly, give each feature an on/off toggle in settings, update the settings app like modern windows apps, update readme (short but funny), test all features"

Work Log:
- v3.6 feature pack built end-to-end on the v3.5 Electron base (system-reactions.js, sys-monitor.js, music-watcher.js, pomodoro.js, achievements.js, no-walk.js — all pure + injectable)
- System-aware: 5s CPU/RAM sampler (Linux /proc in-process, Windows PS CIM one-shot) + hysteresis spike detector → startle/prowl; battery crisis → curl state (Battery API, cooldown); time-of-day weight multipliers (night sleep×3/yawn×4, speed −15%); new-window diff from the platform scanner → walk + sniff; music via long-lived PowerShell SMTC (WinRT) child / playerctl fallback → bop state; foreground app detection added to window scan (per-window PIDs + one Get-Process call) → editor loaf (goToPlatform + cozy bias) / game hype; global keyboard hook (uiohook-napi, bundled win32 prebuild) → rolling WPM → pounce + idle nap; cursor-idle watch (screen.getCursorScreenPoint) → stalk state (crouch-wiggle→creep→pounce→"caught" purr + affection)
- Interaction: affection meter + 8 achievements persisted in settings-store (bumpStat/addAffection/unlock/addCustomSkin), perk hooks (rainbow pet, landing sparkles); companion cat (second brain, 62% size, nuzzle/play-fight/cursor rivalry); photo mode (freeze → canvas PNG → Pictures, flash)
- Sound: contextual glass paw-taps (real recording) on window edges + synthesized squeak on jumps (scripts/gen-sfx.mjs); call detection (OBS/Zoom/Teams/Discord/…) → auto-hide + volume duck 22%
- Dev extras: pomodoro engine (25/5 chains, tray menu, countdown badge, celebration + Night Owl achievement); build-status file watcher (green→celebrate, red→mope); idle dance party (10 min idle → 2 ghost cats)
- Customization: seasonal hats (pumpkin/santa/flower/shades) drawn in head-space; community skins — validated JSON def → registerSkin into PALETTES → first-class store breed with own hat
- QoL: global hotkeys Ctrl+Alt+C/P, no-walk zones (body-rect blocking + platform filtering), fullscreen auto-hide, hide-during-calls — every one with a toggle
- Settings app REWRITTEN Windows 11 Fluent style: left nav (10 pages), cards, Win11 toggle switches (24), affection meter, achievements grid, pomodoro controls, zone editor, skin import, status-file field; window resized/resizable
- Brain/renderer extended: 7 new states (stalk/bop/mope/nuzzle/investigate/sniff/curl), 4 new emotes (sad/battery/rainbow/cookie), 31 actions/16 emotes total
- Tests: +104 unit (270 total incl. spike hysteresis, typing meter WPM/cooldowns, fullscreen cover, window diff, process parsing, SMTC parsing, status verdicts, pomodoro chains, zone math, brain v3.6 flows, store progression) + 43 new e2e checks in scripts/e2e-v36.mjs (real CPU-hog stress, real typing meter injection, injected battery, forced companion interactions, photo file assertions, skin import, settings UI structure) → 86 e2e total, all green; fixed bop-expiry, investigate duration, tasklist .exe strip, pomodoro snapshot clock, stalk-pounce resolution, typing timestamp edge
- Build: npmRebuild=false (uiohook-napi ships prebuilds — packaged win32-x64 .node verified in asar); MeowCat-3.6.0-portable.exe 76,449,180 B (sha256 cc9f53c9…), launcher+inner patched, verify-exe PASS both, verify-artifact-identity 27/27, released + round-trip SHA verified
- Docs: README rewritten short & funny (feature table, skin format, test philosophy); FEATURES.md v3.6 section + counts (31 actions/16 emotes); TESTING.md 270/89/129+43 pyramid

Stage Summary:
- Release: https://github.com/mythos0/meow/releases/tag/v3.6.0
- 22 features shipped, every one toggleable in the new Win11 settings; 359 automated checks green
- main pushed 3692b5a + follow-ups, tag v3.6.0

---
Task ID: 16
Agent: Super Z (main)
Task: v3.7.0 — "find bug, apply fixes and improvements" + user reports: cat jumping/flushing rendering bug, friend cat not showing, too much CPU/RAM, add click real cat sound

Work Log:
- ROOT-CAUSED the "cat jumping/flushing" bug (two halves): (1) slideIfNeeded had a ZERO-WIDTH vertical band — at ground the feet sit exactly on the aboveFeet boundary, so every 70px hop, 4px bop bob and 9px zoomies bounce re-triggered a window slide and the transparent overlay flapped up/down on loop; fixed with an 80px TOPSLACK (hop/bob ride inside the already-reserved headroom; real platform climbs still slide). (2) The renderer painted with the NEW origin before the async window move landed → visible jumps; fixed with synchronized slides: keep painting with the OLD origin while region:move is in flight, flip O when the IPC resolves, then repaint IMMEDIATELY (paint() extracted from the loop); slide suppression while in flight. Plus: dt clamp 0.11s in the loop (stall/GC no longer teleports the cat).
- ROOT-CAUSED "friend cat not properly showing": the region window (~480px) follows the MAIN cat but the kitten roamed up to 420px away → drawn outside the visible canvas, clipped/invisible. Fixed: companionLeash(regionW) pure helper (480→160px), run-back beyond the leash, hard safety net at leash+50, and the region now slides to the main/companion MIDPOINT so both cats are provably always inside the region at every scale (unit-tested inequality).
- CPU diet, measured with a new cpu-probe.mjs harness (same box, v3.6.1 vs v3.7): idle+states CPU 26.6% → 13.3% of one core (-50%). Levers: rAF loop fully STOPS while hidden (new cat-visible IPC from updateCatVisibility + ready-to-show sync; paints verified frozen via a new __paintCount probe — backgroundThrottling:false was burning 60fps software-raster on an invisible overlay), region:move uses setPosition when size unchanged (skips identical rects; no transparent-surface resize churn), topmost enforcer skips redundant setAlwaysOnTop when isAlwaysOnTop() is already true (+ interval 2s→3s), audio pool (3 rotating clones per sound) replaces per-footstep cloneNode() allocations, window scanner 3.2s→4.5s, sys-monitor win32 5s→8s.
- Windows CPU/RAM sampler rewritten: ONE persistent PowerShell streams a JSON line per interval (winStatsStreamScript + streaming path in createSysMonitor) instead of a fresh ~0.3-CPU-s one-shot every 5s (12 spawns/min → 1 process total); self-healing watchdog kills a silent streamer (2.5 intervals), respawn with backoff, automatic fallback to the legacy one-shot timer after 4 failures; process list on its own procTimer (intervalMs × procEvery). Linux /proc path unchanged. 6 new unit tests incl. restart/fallback/watchdog with fake spawns.
- NEW FEATURE — click = real meow: quick tap plays a random meow_real/2/3 + heart emote (hold ≥280ms remains the pet: purr + affection + coins; drag cancels; double-click still opens Settings — first click meows, which is just correct cat behavior). e2e asserts the actual play() call via __lastPlay instrumentation.
- RAM trims: warm Settings self-destroy 5min→2.5min, spellcheck:false on both windows, renderer heap cap unchanged (160MB). mem-report: 5 procs / 277MB PSS on Linux (Windows floor 3× MeowCat.exe); README RAM row updated honestly.
- Tests: +15 unit (v37.test.mjs: hop/bob no-slide + oscillation hysteresis, leash inequality at every scale, streaming sampler pipeline/restart/fallback/watchdog/linux-unchanged, topmost skip+enforce) = 303 unit + 89 visual; NEW e2e-v37.mjs 10/10 live checks (hop no-flap measured across two full hops, worst-case draw-outside-canvas = 0px during 3 slides, kitten flung 1200px away reeled back to 200px and inside region, tap→meow_real+heart, real "teams" proc hides cat → paints frozen → resumes); e2e-linux updated to the new tap/pet contract (tap=meow+heart, hold=pet with pets-stat assertion) and version 3.7.0 → 44/44; e2e-robust 19/19 (one flaky first run: zoom detection at the 10s process-snapshot cadence under double-suite load, passed twice after); e2e-v36 43/43. Total 518 checks green.
- Visual QA: 60-state contact sheet regenerated (artifacts/v37-shots) — all 31 states + 20 breeds render identically after the paint() refactor.
- Docs: README (install row 4 = click-to-meow, CPU/RAM table rows, testing-philosophy scars paragraph, 303/89/126 counts), FEATURES.md renamed v3.7 + "stop being rude to your laptop" section, TESTING.md pyramid extended with robust+v3.7 rows.
- Also fixed in passing: e2e-linux version pin; sys-monitor close-handler counts mid-run stream deaths as failures (stop() doesn't).

Stage Summary:
- v3.7.0: 2 user-reported rendering bugs root-caused and fixed (hop-flap, invisible kitten), CPU -50% at idle (measured), RAM at the Electron floor, click-meow shipped
- 303 unit + 89 visual + 126 E2E = 518 checks green; visual QA 60 shots identical
- Build + release next (MeowCat-3.7.0-portable.exe)

Stage Summary (release):
- Built MeowCat-3.7.0-portable.exe (76,454,382 B, sha256 a923d6ce…): afterPack stamped inner exe, patch-exe stamped launcher (3.7.0.0 binary version), verify-exe PASS, verify-artifact-identity 27/27, v3.7 feature strings verified inside app.asar (cat-visible, companionLeash, winStatsStreamScript, TOPSLACK)
- Released https://github.com/mythos0/meow/releases/tag/v3.7.0 — asset round-trip SHA-256 verified byte-identical
- main pushed ef4b7b2 + tag v3.7.0; artifact excluded from repo via .gitignore (artifacts/v37-shots/)

---
Task ID: 17
Agent: Super Z (main)
Task: v3.9.0 — user reports: "still seeing rendering jumps, fix it properly. try to optimize more. test all features are working without any bug."

Work Log:
- MEASURED before touching code: built a canvas-cost probe (xvfb, software rendering — the app runs disableHardwareAcceleration). Full-work-area overlay + dirty-rect = 74.9% CPU at 60fps vs 12.5% for the 480px region (dead end, would regress the CPU complaint); dirty-rect at region size = no gain (12.9%); continuous window motion = +6.1% at 60Hz, +3.4% at 30Hz. Data picked the architecture.
- ROOT-CAUSED the persistent "rendering jump" (3rd user report) as STRUCTURAL, not timing: the overlay window and the canvas origin live in two processes joined by async IPC — a one-shot slide of up to 400px (vertical re-center after a platform jump) can never flip atomically with the canvas, so ≥1 vsync shows stale content at the new position = a visible leap. Three timing fixes could never kill it.
- CHASE CAMERA (region.js chaseStep/clampOrigin + cat.html): the origin now WALKS toward the same slideIfNeeded target at ≤900px/s (≤15px/frame), fire-and-forget, renderer pre-clamps identically to main (clampOrigin pinned to a copy of main's clamp in tests). No await, no paint freeze, no race. Worst stale frame = ≤15px shimmer.
- PLATFORM TRACKER (new src/platform-tracker.js): the OTHER half of the jump — the 4.5s scan left the cat floating on a stale border during window drags, then snapping. One persistent PowerShell polls the tracked hwnd via user32 GetWindowRect P/Invoke at 3Hz (stdin-retargeted "track <hwnd>"/"off", parent-PID heartbeat so it can never orphan, self-restarting with backoff). Scanner now exposes the hwnd id. Brain: updateTrackedPlatform stores SMOOTHED targets (never raw 3Hz snaps); _tickTrackerRide glides the border AND the cat at ≤700px/s vertical / 900px/s horizontal, carried like a real window; tracker alive = authoritative (flaky scan can't drop the cat — ghost grace); 2 consecutive ok:false = animated fall; mid-air border moves correct the in-flight landing y1; ride exempt from the idle throttle (throttled batching = 45px lurches).
- Kitten visibility made structural: off-canvas during a violent reel it dashes back at a single capped 850px/s (reel skipped while off-stage) — worst measured delta 79px/100ms (was a 575px clamp snap in the first attempt, caught by e2e-v38).
- Optimization: sleep/curl quantized to ~7.5fps (idleFrameSkip 7); measured per-state CPU: sleep 5.7% (was ~8), idle 7.5% forced / 13.3% mixed (unchanged), walk+chase 23.2% on the 2-core sandbox; RAM 165.4MB PSS / 5 procs (v3.7 documented 277MB); 60/60 render states PIXEL-IDENTICAL to v3.8 (PIL pixel-diff of the contact sheets).
- Tests: +41 unit (tests/v39.test.mjs: chaseStep caps/exact-landing/degenerates, clampOrigin parity with main across 21 cases, tracker line parse/script heartbeat/retarget protocol/buffered stdout/restart lifecycle, brain ride rates/ghost grace/vanish-fall/mid-jump correction/stale-line rejection/target re-anchor) + NEW e2e-v39.mjs 6/6 live (per-frame origin delta p99=16px max=16px across stroll+zoomies+jump; 0px canvas breach during a max-legal 400px jump; ride speed 759px/s ≤800 measured live; vanish semantics; tracker retarget on land/leave via __trackedPlatId hook). All suites: 347 unit+visual, e2e 44+43+19+10+11+6 = 133 → 480 checks green (one known robust flake passed on retry).
- Build: MeowCat-3.9.0-portable.exe 76,465,829B sha256 d3f0618b… — afterpack stamped the inner exe, patch-exe stamped the launcher (lesson re-learned: patch-exe argv order in|out|version), verify-exe PASS 3.9.0, verify-artifact-identity VERIFIED (Task Manager can only show MeowCat), v3.9 strings confirmed inside app.asar.
- Release: https://github.com/mythos0/meow/releases/tag/v3.9.0 — asset round-trip SHA-256 verified byte-identical; main pushed d7e70ba + tag v3.9.0.
- Docs: README (v3.9 section: why three fixes failed, chase camera, tracker, measured numbers; RAM row 165MB; tests 347/89/133), FEATURES.md renamed v3.9 + new §12 (v3.8 recap) + §13 (chase camera + tracker + invariants), TESTING.md pyramid updated + v3.9 e2e row.

Stage Summary:
- The rendering jump is dead by construction: the window never makes a >15px/frame move, and the cat's window carries it in real time.
- v3.9.0: 480 automated checks green, pixel-identical art, no CPU/RAM regression (both improved), Release + exe verified
- Pending for next session: user real-Windows validation of the chase camera feel (drag a window the cat stands on)

---
Task ID: 18
Agent: Super Z (main)
Task: v3.10.0 — user directive: "remove all kind of cat hidden logic such as call detection, etc has in the app. without explicit user quit the cat shouldnt stop its process."

Work Log:
- REMOVED call/record-app detection end-to-end: pure helpers (CALL_APP_RE, findCallApp, isFullscreenWindow, parseProcessList) deleted from system-reactions.js; onProcessList + hiddenByCall + hiddenByFullscreen + the "taking cover" toast deleted from main.js; hiddenByUser is now the ONLY visibility flag (tray "Hide cat" / Ctrl+Alt+C stay — they are explicit user actions).
- REMOVED the sound-duck that rode on call detection: 'duck' IPC channel + volumeMul multiplier gone from cat.html (sounds always play at full requested volume); the e2e __volumeMul hook verified deleted.
- REMOVED fullscreen auto-hide: hideInFullscreen wiring in onWindowScan gone; FLAG_KEYS shrunk; applyFeatureFlags no longer guards stale hide flags.
- REMOVED the process-list sampler from sys-monitor.js (sampleProcs/procTimer/onProcesses) — it existed ONLY to feed call detection: linux sampler now spawns ZERO subprocesses, win32 spawns exactly ONE persistent PowerShell (extra optimization).
- Settings cleaned: hideDuringCalls/duckDuringCalls/hideInFullscreen removed from DEFAULTS (sanitize() auto-drops them from old persisted files), settings.html rows + bindSwitch + sync pairs removed (24 → 21 switches).
- NEVER-STOP guarantees (main.js): closed cat window self-heals (recreate after 250ms when !quitting), render-process-gone → destroy → revival, second-instance re-summons a missing window, process-level uncaughtException/unhandledRejection guards log-and-continue; window-all-closed keeps the app alive; only tray/context "Quit" (quitting=true) ends the process.
- Tests: NEW tests/v310.test.mjs (7 contract tests: removed keys/symbols, legacy settings sanitized, set() rejects, no tasklist ever, zero linux spawns, no duck hook in renderer, main.js crash guards present); features.test.mjs lost fullscreen/process-list describes; v37.test.mjs updated (linux = zero spawns); store-features toggle list shrunk; e2e-robust section 1 replaced (zoom process must NOT hide cat + loop keeps painting + window.close() resurrection live: revived in 436ms, process alive); e2e-v37 section 5 flipped (call app changes nothing); e2e-v36 toggles 22→19 + deleted-keys probe + switch count 24→21.
- Full regression: 351 unit+visual (262 unit + 89 visual) + 133 E2E (44 linux + 20 robust + 43 v36 + 9 v37 + 11 v38 + 6 v39) = 484 checks green (v39 chase-camera + vanish checks are load-sensitive: p99 30px and a "did not land" flake under heavy sandbox load, both passed on isolated re-runs — timing, not regressions; code paths untouched).
- Build: MeowCat-3.10.0-portable.exe 76,460,405B sha256 630fafae… — afterpack stamped inner exe, patch-exe stamped launcher, verify-artifact-identity 27/27 ("Task Manager can only show MeowCat"), v3.10 strings confirmed inside app.asar (uncaughtException/render-process-gone/reviving), asar verified clean of hide-during-calls logic.
- Docs: README feature row rewritten (cat NEVER hides itself, never quits on its own), FEATURES.md §12.5 (v3.10), TESTING.md pyramid updated (262/89 rows, robust 20, v37 9, new v3.10 contract row).

Stage Summary:
- v3.10.0 shipped: no call detection, no fullscreen auto-hide, no ducking, no process-list sampler; the cat can only be hidden by the user and only stopped by an explicit Quit — plus a real extra CPU win (one less recurring subprocess on Windows, zero on Linux).

---
Task ID: 18
Agent: main (Super Z)
Task: v3.13.0 — butterfly on every desktop + real hunts; companion cat visibility; auto-quit re-verification; full visibility-tested release

Work Log:
- Synced stale sandbox checkout to origin/main v3.12.0 (stash + ff-only), reinstalled node_modules + electron binary
- Audited butterfly/companion/quit-gate code; ran a live dual-display probe which CONFIRMED the butterfly bug (spawn tied to primary work area → on display 2 it crossed the wrong screen, everInLane=0) and localized the companion failure mode
- NEW src/butterfly.js: pure unit-tested butterfly state machine (cruise/hunted/flee, lane-relative spawn from the NEARER edge, dip into pounce reach, flutter-around-hunter, startle dart) replacing the primary-workArea spawner in cat.html
- Real hunt loop in cat.html: notice (≤340px, idle-ish ground cats) → brain.startStalk(kind='butterfly') + stalkBoost 2.3 → auto-pounce → resolveButterflyPounce: catch = hearts + +2 coins + bumpStat('butterflies') + bubble + next visitor in 9-16s; miss = startle + flee, ≤3 attempts; cursor-idle/busy/typing handlers gated so they never steal a live hunt; loop's cursor-stalk feed gated likewise
- Companion fixes: kitten receives the SAME platform list (setPlatforms wired in the platforms IPC + at spawn); chase camera frames the MAIN cat's feet, so a ground kitten under a platform cat was pushed below the canvas (the "companion not showing" root cause) — the kitten now _jumpTo's the big cat's platform (joinCd 2.5s) and wakes (sleep/curl/eat/groom…) when separated; beyond-run forcing no longer fires mid-jump
- Brain hardening: startStalk(x,y,kind) + stalkBoost; _enter() now LANDS an interrupted jump at its arc destination (previously a pet/pounce/nuzzle mid-flight stranded a stale _jump that blocked the companion join guards forever and froze the feet mid-air); dropAt() mid-air releases FALL to the ground (≤60px above ground still snaps exactly where released, preserving the pinned no-snap-back e2e)
- Laser dot spawn/drift clamps + typing-pounce keyboard target made lane-relative (same primary-workArea bug class)
- settings-store: butterflies stat; settings.html stat line shows 🦋
- Tests: +15 unit (tests/v313.test.mjs: spawn/cull/dip/flee/catch geometry, stalk kinds + boost, 3 drop-fall cases, interrupted-jump landing, stat); NEW scripts/e2e-v313.mjs (21 checks: butterfly paints pixels on display 1 AND 2 inside the lane, kitten joins a window top + paints pixels, hunt→catch→stat through the real store, miss→flee, laser lane-relative, quit-gate + SIGTERM re-pin) with real canvas pixel-visibility helpers
- Suite hardening: __stopButterfly hook pins ambient spawns to manual (the 18-42s scheduler hijacked live checks' cat states); e2e-linux sets MEOWCAT_TEST=1 so the pet-hold can park the cursor ON the cat (Xvfb's resting pointer at screen center used to drag the cat away mid-hold); pet-hold got a clean-reset + retry loop; zone-draw overlay-close race tolerated; pet probe reproduced + fixed a Playwright closure-in-evaluate pitfall
- Release: electron-builder portable → MeowCat-3.13.0-portable.exe; verify-artifact-identity 25/25 (Task Manager can only show MeowCat); 7z restored via node_modules/7zip-bin symlink; C#-era root remnants (src/tests/publish) removed from the worktree; committed + pushed main + tag v3.13.0; GitHub Release created with the exe; asset download-verified (octet-stream, SHA-256 a67d29e0… == uploaded digest)

Stage Summary:
- ALL GREEN: 321 unit + 89 visual + 193 e2e (44 e2e-linux + 29 e2e-dual + 21 e2e-v313 + 30 v311 + 11 v38 + 9 v37 + 43 v36 + 6 v39) = 603 checks
- User questions answered with evidence: auto-quit STILL blocked (dev:force-quit reversed + journaled; SIGTERM ignored); butterfly now visible + huntable on every display; companion kitten visible everywhere and follows onto window tops
- Release: https://github.com/mythos0/meow/releases/tag/v3.13.0 (MeowCat-3.13.0-portable.exe, 76,545,708 bytes, sha256 verified)
