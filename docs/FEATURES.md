# MeowCat v3.7 — Feature Reference

A procedural desktop pet for Windows 11. Everything about the cat is drawn by code
(see [RENDERING.md](RENDERING.md)); this page lists the product-level features.

## 0. What v3.7 changed (the "stop being rude to your laptop" release)

* **Click = meow.** A quick tap on the cat plays a real recorded meow + a heart.
  Holding the click stays the pet (purr + affection + coins).
* **The jumping/flushing bug is dead.** The overlay window used to flap up/down on
  every hop, bop and zoomies bounce (a zero-width vertical slide band), and repainted
  at the new origin before the OS had actually moved the window. Both halves are fixed:
  an 80px slack band + fully synchronized async slides with an immediate repaint on landing.
* **The friend cat shows up properly.** The companion kitten used to roam 420px from the
  big cat — outside the ~480px window that follows it (invisible kitten). It is now leashed
  to ~160px and the window slides to the pair's midpoint, so both are always on screen.
* **CPU diet, measured -50% at idle.** Paints freeze while the cat is hidden (hotkey /
  call / fullscreen), the region window is moved with setPosition instead of a full
  setBounds cycle, redundant always-on-top pokes are skipped, footstep sounds reuse a
  small audio pool instead of allocating per step, and on Windows ONE persistent
  PowerShell streams CPU/RAM/battery samples (self-healing watchdog, falls back to the
  legacy one-shot after 4 failures) instead of a fresh spawn every 5 seconds.
* **RAM trim:** the warm Settings window self-destroys after 2.5 idle minutes (was 5),
  spell-check dictionaries are off, renderer heap stays capped at 160MB.

## 1. The cat

* **20 breeds · 8 body types** — Grey/Orange Tabby, Siamese, Calico, Persian, Tuxedo,
  Bombay (sleek black), Russian Blue, Ginger Kitten (baby proportions), Ragdoll (fluffy
  chubby), Bengal (rosettes), Maine Coon (huge, lynx tufts), the **Panda** (bear anatomy),
  and v3.2's completely new designs: **Mochi Kitten** (the reference-photo chibi — huge
  slate-blue eyes, white blaze, pink toe beans), **Scottish Fold** (folded ears, blush),
  **Snow Angora** (all-white, odd eyes: blue + green), **Somali** (russet brush tail),
  **British Plush** (dense blue-cream teddy), **Choco Munchkin** (chocolate sausage cat),
  **Sakura** (pale cream-pink chibi).
* **31 actions** — walk, run, idle, sit, sleep, dance, scratch, jump, happy,
  **eat (v3.2: real fish-biting — a fish lies on the ground, each cycle the cat bites a
  chunk off, the fish visibly shrinks, then side-to-side chewing with a working cheek and
  closed blissful eyes, ×3 + a gulp)**, stretch (downward-dog), groom (lick paw), pounce
  (butt-wiggle → leap), knead (biscuits), loaf, yawn, startle (ears flat + puff) +
  panda-only **waddle (heavy bear roll), bamboo (sits up, hooks the stalk with both paws,
  gnaw-gnaw-bite), somersault roll that travels forward** +
  **v3.5 funny pack: sneeze (wind-up → droplet-blast "AH-CHOO!"), hairball (cough-heaves →
  a fuzzy souvenir drops out), zoomies (the mad after-meal sprint — dust trail, pinned
  ears, 1.7× run speed; 45 % chance right after eating), laser (low stalk chasing the red
  dot → pounce → catch pays +3 coins; interactive via tray / right-click menu) + **v3.6: stalk (crouch-wiggle → slinky creep → pounce on an idle cursor), bop (sways to playing music), investigate → sniff (walks to a newly opened app and interrogates it with a "?"), nuzzle (companion head-rub), mope (red-build depression), curl (battery-saving ball)**.
* **16 emotes** pop just above the cat's head (v3.2 anchor fix — no more icons hovering
  far away) — heart, love, note, question, exclaim, sweat, angry, laugh, star, zzz, fish,
  **bread (v3.5), + v3.6: sad (broken heart for red builds), battery (low-power pill with bolt), rainbow (rare pet reward), cookie (celebration treat)** — spring pop-in, bob, fade.
  Triggered by state entries (dance→♪, sleep→Zz, startle→!, zoomies→!, hairball→sweat,
  loaf→bread) and interactions (pet→love, feed→fish, laser catch→star).
* **Realistic movement** — IK legs whose knees follow the feet, chained pendulum tail
  drawn inside the body transform (never floats away from a rotated/squashed torso),
  squash-&-stretch, diagonal-pair gaits, natural blinks, ear twitches.
* **No random walking** (v3.2) — the cat strolls along the ground edge-to-edge instead of
  wandering to random screen points.

## 2. Window-top hopping (v3.1+)

* The main process scans visible windows every 3.2 s (PowerShell EnumWindows, DWM-cloaked
  filtering, own windows excluded — no native modules); resized windows update automatically.
* The brain treats every window's **top border as a platform**: if the cat is near
  (≤ 420 px climb, ≤ 240 px ahead — 560 px when leaving an edge), it jumps onto the
  border, strolls along it, **hops to the nearest neighbouring window**, or drops back
  to the ground. Closed windows vanish from the platform list and the cat lands safely.
* Verified by seeded unit tests **and** a live E2E jump in the real app.

## 3. The panda is not a cat (v3.2)

Rebuilt from researched panda facts: bear barrel body + 10–15 cm stub tail, black ears /
eye patches / muzzle / legs / shoulder band with the rest white, low lateral round ears,
slow heavy waddle with a swaying head, **feeding sitting up with both paws hooking the
bamboo** (pseudo-thumb grip) and sideways gnawing, forward-travelling somersaults, and
**sprawled-flat naps** instead of a cat curl.

## 4. Interactions

| input | action |
|---|---|
| double-click | Settings popup (**instant** — warm window pool, ~4–15 ms open) |
| single click | pet: purr + love emote + 🪙 (drag/drop is **silent**) |
| drag & release | carry the cat; snaps to the nearest window top or the ground |
| right-click | context menu: Settings, Reminders, Dance, Feed, Sleep, Quit |
| tray | menu + balloon notifications, left-click opens Settings |

## 5. Sounds

Real recorded cat sounds: three meows, purr, chirp; synthesized footsteps (walk/run),
whoosh, land, scratch, coin, dance loop. Footsteps sync to the gait; master toggle +
size-independent volume; drag & drop is deliberately silent.

## 6. Reminders & timers

Full editor inside the Settings window (one-shot / daily / weekly / every-N repeats,
custom message, sound toggle). Missed one-shots are dropped after a grace window (no
alarm storm after sleep); repeats roll forward. When one fires: the cat performs its
chosen move, a speech bubble shows the label, a chirp plays, and a system notification
can appear.

## 7. Settings & Cat Store

* Instant-open Settings window (pre-warmed at startup; close *hides*, doesn't destroy).
  One helper window total — Reminders is a section inside it (v3.2 RAM diet).
* Size 0.5×–2×, opacity, walk speed, sound toggle, stay-on-top, start-with-Windows.
* **Premium Cat Store**: gradient cards, hover lift, golden selected ring, NEW badges,
  coin pill. `unlimitedCoins: true` promo unlocks every breed free (paid path remains,
  still tested, and can be re-enabled in `settings-store.js`).
* **About panel**: version, Electron version, developer GitHub link
  (github.com/mythos0), repo + issues links (whitelisted `openExternal`), credits.

## 8. Always-on-top

A topmost enforcer re-asserts the cat at screen-saver level every 2 s and on
show/restore/focus events — the cat stays visible over fullscreen apps and games
without stealing focus.

## 9. Low memory footprint (v3.2)

1. No GPU process (hardware acceleration disabled + `in-process-gpu`).
2. One warm helper window (Reminders merged into Settings).
3. Network service in the browser process; audio service kept in-host.
4. No V8 code-cache blobs on the overlay; capped old-space; PowerShell window-scan at a
   relaxed 3.2 s cadence.

On Windows: **~5 processes** (was 7) and roughly a third less RAM. Measure anytime with
`node scripts/mem-report.mjs` (process tree + PSS).

## 10. Process identity

The portable exe is resource-patched after build (`scripts/patch-exe.mjs`, pure-JS
`resedit`): FileDescription "MeowCat — your desktop cat", ProductName MeowCat,
OriginalFilename MeowCat.exe, version 3.2.0.0, MIT copyright and the app icon —
Task Manager shows **MeowCat**, not "electron".

## 11. v3.6 — the "living on your machine" pack

Every feature ships with an **on/off toggle** in the new Windows 11 Fluent settings app
(left nav pane, cards, real toggle switches). Reaction pollers only run while enabled —
switching a feature off genuinely stops its CPU cost.

**System-aware reactions** (all toggleable, Reactions page):

* **CPU/RAM spikes** — a 5 s system sampler (Linux: `/proc`, Windows: one PowerShell CIM
  one-shot) feeds a hysteresis detector (2 hot samples, 90 s cooldown). The cat jumps, then
  prowls 30 % faster and 12× more likely to zoom until the machine calms down.
* **Low battery** — under 20 % and unplugged, the cat curls into a ball (battery emote + a
  bubble). Plugging in releases it. Percentage comes from the renderer Battery API.
* **Time-of-day mood** — 22:00–07:00: sleep ×3, yawn ×4, loaf ×2, run/zoomies heavily damped,
  walk speed −15 %. Daytime: pounce/zoomies/run boosted. Applied as weight multipliers.
* **New-window investigator** — the window scanner diffs platform lists; a new window ≥220×140
  sends its centre to the cat, which walks over and sniffs (question emote).
* **Music bops** — Windows: one long-lived PowerShell child polls the Modern Media Transport
  (SMTC — the same session the volume flyout shows) and prints one JSON line per change;
  Linux: `playerctl`. Playing → `bop` state (sustained sway + note emotes); track change →
  excited star; stop → finishes the current bop.
* **Editor loaf & game hype** — the scanner now attaches owner process names (one extra
  `Get-Process` call per scan). Foreground editor (Code/idea/notepad/vim/…) → the cat jumps
  onto its top border and loafs there (cozy bias). Game processes → celebratory zoomies.
* **Typing pounce** — a global keyboard hook (`uiohook-napi`, bundled win32/linux prebuilds)
  feeds a rolling WPM meter; ≥62 WPM → the cat pounces toward the keyboard (45 s cooldown).
  12 idle minutes → it naps instead.
* **Cursor stalking** — main polls `screen.getCursorScreenPoint()`; an idle cursor (≤4 px for
  2.5 s) near the cat triggers a stalk: crouch-wiggle, slinky creep, pounce → "caught" → purr
  + affection. Move the mouse and the cat loses interest.

**Interaction & progression**

* **Affection meter** — every pet tap feeds a persisted meter (Lv.2 at 30, Lv.3 at 100,
  Lv.4 at 250 = boot-time greeting). Settings Home shows the bar + lifetime stats.
* **Achievements** — 8 unlockables (First Contact, Purring Machine, Parkour Cat, Regular at
  the Diner, Dot Exterminator, Zen Household, Night Owl, On Schedule) with toasts and a grid
  in Settings; some unlock cosmetic perks (rainbow pet emote, landing sparkles…).
* **Companion cat** — a second, 62 %-size kitten joins: wanders near the big cat, nuzzles
  (hearts + nuzzle stat + affection) or play-fights, and competes for the cursor.
* **Photo mode** — Ctrl+Alt+P / tray / context menu: freezes the pose mid-animation, exports
  the transparent canvas to Pictures as `MeowCat-YYYYMMDD-HHMMSS.png`, flash effect, resume.

**Sound design** — contextual glass paw-taps while walking window edges + toy squeaks on jumps
(toggle), and **call ducking**: when OBS/Zoom/Teams/Discord/Slack/Skype/WebEx processes are
detected, cat volume drops to 22 % (and the cat fully auto-hides if "Hide during calls" is on).

**Founder extras** — **Pomodoro companion** (tray/settings, 25/5, the cat supervises with a
countdown badge and celebrates completed rounds; a focus session past 10 PM earns the Night Owl
achievement); **build/test reactions** (watch any status file — green words → happy dance,
red words → mope); **idle dance party** (10 idle minutes → two ghost cats join for a 24 s party).

**Customization** — **seasonal hats** (pumpkin Oct, santa Dec, flower crown Mar–Apr, shades
Jun–Aug; opt-in) drawn in head-space so they follow head rotation; **community skins** — a
validated JSON def (base breed + colors + body + pattern + hat) imports at runtime into the
Cat Store as a first-class breed.

**Quality-of-life** — global hotkeys (Ctrl+Alt+C summon/hide, Ctrl+Alt+P photo), **no-walk
zones** (work-area-relative rects the cat's body never enters, and whose window tops it never
lands on), **auto-hide in fullscreen** (window-covering detection from the scanner), plus the
existing reminders, auto-start, topmost enforcement and warm-pool settings.
