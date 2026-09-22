# MeowCat v3.2 — Feature Reference

A procedural desktop pet for Windows 11. Everything about the cat is drawn by code
(see [RENDERING.md](RENDERING.md)); this page lists the product-level features.

## 1. The cat

* **20 breeds · 8 body types** — Grey/Orange Tabby, Siamese, Calico, Persian, Tuxedo,
  Bombay (sleek black), Russian Blue, Ginger Kitten (baby proportions), Ragdoll (fluffy
  chubby), Bengal (rosettes), Maine Coon (huge, lynx tufts), the **Panda** (bear anatomy),
  and v3.2's completely new designs: **Mochi Kitten** (the reference-photo chibi — huge
  slate-blue eyes, white blaze, pink toe beans), **Scottish Fold** (folded ears, blush),
  **Snow Angora** (all-white, odd eyes: blue + green), **Somali** (russet brush tail),
  **British Plush** (dense blue-cream teddy), **Choco Munchkin** (chocolate sausage cat),
  **Sakura** (pale cream-pink chibi).
* **24 actions** — walk, run, idle, sit, sleep, dance, scratch, jump, happy,
  **eat (v3.2: real fish-biting — a fish lies on the ground, each cycle the cat bites a
  chunk off, the fish visibly shrinks, then side-to-side chewing with a working cheek and
  closed blissful eyes, ×3 + a gulp)**, stretch (downward-dog), groom (lick paw), pounce
  (butt-wiggle → leap), knead (biscuits), loaf, yawn, startle (ears flat + puff) +
  panda-only **waddle (heavy bear roll), bamboo (sits up, hooks the stalk with both paws,
  gnaw-gnaw-bite), somersault roll that travels forward** +
  **v3.5 funny pack: sneeze (wind-up → droplet-blast "AH-CHOO!"), hairball (cough-heaves →
  a fuzzy souvenir drops out), zoomies (the mad after-meal sprint — dust trail, pinned
  ears, 1.7× run speed; 45 % chance right after eating), laser (low stalk chasing the red
  dot → pounce → catch pays +3 coins; interactive via tray / right-click menu)**.
* **12 emotes** pop just above the cat's head (v3.2 anchor fix — no more icons hovering
  far away) — heart, love, note, question, exclaim, sweat, angry, laugh, star, zzz, fish,
  **bread (v3.5: a tiny steaming loaf for the loaf pose)** — spring pop-in, bob, fade.
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
