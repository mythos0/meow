# MeowCat v3.1 — Feature Reference

A procedural desktop pet for Windows 11. Everything about the cat is drawn by code
(see [RENDERING.md](RENDERING.md)); this page lists the product-level features.

## 1. The cat

* **13 breeds · 6 body types** — Grey/Orange Tabby, Siamese, Calico, Persian, Tuxedo,
  Bombay (sleek black), Russian Blue, Ginger Kitten (baby proportions), Ragdoll (fluffy
  chubby), Bengal (rosettes), Maine Coon (huge, lynx tufts) and the **Panda**.
* **20 actions** — walk, run, idle, sit, sleep, dance, scratch, jump, happy, eat,
  stretch (downward-dog), groom (lick paw), pounce (butt-wiggle → leap), knead
  (biscuits), loaf, yawn, startle (ears flat + puff) + panda-only **waddle, bamboo
  munch (holds a drawn stalk), somersault roll**.
* **11 emotes** pop above the cat's head — heart, love, note, question, exclaim, sweat,
  angry, laugh, star, zzz, fish — spring pop-in, bob, fade. Triggered by state entries
  (dance→♪, sleep→Zz, startle→!, roll→HA…) and interactions (pet→love, feed→fish).
* **Realistic movement** — IK legs whose knees follow the feet, chained pendulum tail
  drawn inside the body transform (never floats away from a rotated/squashed torso),
  squash-&-stretch, diagonal-pair gaits, natural blinks, ear twitches.

## 2. Open-field roaming (v3.1)

The full screen is the cat's field: most walks head to a **random point anywhere in the
work area** (not just the taskbar line), then sniff around and pick another. Classic
edge-to-edge strolls still happen ~30 % of the time.

## 3. Window-top hopping (v3.1)

* The main process scans visible windows every 2.2 s (PowerShell EnumWindows, DWM-cloaked
  filtering, own windows excluded — no native modules).
* The brain treats every window's **top border as a platform**: if the cat is near
  (≤ 420 px climb, ≤ 240 px ahead — 560 px when leaving an edge), it jumps onto the
  border, strolls along it, **hops to the nearest neighbouring window**, or drops back
  to the ground. Closed windows vanish from the platform list and the cat lands safely.
* Verified by seeded unit tests **and** a live E2E jump in the real app.

## 4. Interactions

| input | action |
|---|---|
| double-click | Settings popup (**instant** — warm window pool, ~4 ms open) |
| single click | pet: purr + love emote + 🪙 (drag/drop is **silent**) |
| drag & release | carry the cat; snaps to the nearest window top or the ground |
| right-click | context menu: Settings, Reminders, Dance, Feed, Sleep, Quit |
| tray | menu + balloon notifications, left-click opens Settings |

## 5. Sounds

Real recorded cat sounds: three meows, purr, chirp; synthesized footsteps (walk/run),
whoosh, land, scratch, coin, dance loop. Footsteps sync to the gait; master toggle +
size-independent volume; drag & drop is deliberately silent.

## 6. Reminders & timers

Full editor: one-shot / daily / weekly / every-N-minutes repeats, custom message,
sound toggle. Missed one-shots are dropped after a grace window (no alarm storm after
sleep); repeats roll forward. When one fires: the cat dances, a speech bubble shows the
label, a chirp plays, and a system notification can appear.

## 7. Settings & Cat Store

* Instant-open Settings window (pre-warmed at startup; close *hides*, doesn't destroy).
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

## 9. Process identity

The portable exe is resource-patched after build (`scripts/patch-exe.mjs`, pure-JS
`resedit`): FileDescription "MeowCat — your desktop cat", ProductName MeowCat,
OriginalFilename MeowCat.exe, version 3.1.0.0, MIT copyright and the app icon —
Task Manager shows **MeowCat**, not "electron".
