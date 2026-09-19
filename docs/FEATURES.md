# MeowCat — Feature Reference

## 1. The cat (renderer)

The cat is **painted procedurally every frame** — no images. Layer stack: ground shadow → tail
(bezier with follow-through + tabby rings) → back legs (darker) → torso (radial volume gradient,
belly patch, ambient-occlusion under the chin, fur pattern, chest tufts) → front legs (with breed
paw-socks) → head group (ears with pink inners, volume gradient, specular gloss, breed face pattern,
whiskers with sway, glossy eyes: iris gradient + pupil + 2 catchlights + eyeliner, nose highlight,
ω-mouth) → accessories → state effects → floating emotes.

| Pose | Motion design |
|---|---|
| Walk | 1.6 Hz diagonal-pair gait (FL+BR vs FR+BL), body rises mid-stride, head follows at 55 %, tail sway 0.8 Hz |
| Run / Chase | 2.6 Hz gait, ±26° swing, 6° forward lean, ears swept back; chasing steers to the mouse each frame |
| Idle | breathing (±1.3 % squash at 0.3 Hz), slow look-around head tilts, blink every ~3.7 s, lazy tail |
| Sit | haunches folded, tail wrapped to the front with slow flicks |
| Sleep | lying flat, ±5 % breathing at 0.17 Hz, closed eyes, purr loop, Zzz rising |
| Dance | 2 Hz bounce + ±12° body roll, alternating paw pumps, ±25° tail wag, note emotes |
| Jump | ballistic: takeoff stretch (vy < −60), apex tuck (legs 46°, squash 0.90), dive (vy > 140); ground shadow shrinks with altitude; landing squash + thud |
| Yarn | crouch + one paw batting at 2 Hz; ball rolls up to 26 px with a trailing thread |
| Scratch | reared against the edge, paws alternating at 4 Hz, pulsing scratch lines |
| Petted | ^^ happy eyes, blush, pack emotes, wiggle |
| Dragged | dangling swaying legs, wide eyes, ears back, shrink-shadow |

## 2. AI brain

Mood: `Happiness` `Energy` `Boredom` ∈ [0,100]. Passive rates: energy −0.10/s (−0.28 while
running/dancing, +6/s asleep), boredom +0.25/s idle / +0.10 walking, happiness drifts to 55.
Completion bonuses: dance/yarn −18 boredom +10 happiness; chase −12/+6; walk −4/+1; scratch −8/+2;
pet +8 happiness (+1 coin, 30 s cooldown); feed +20 happiness +15 energy.

Selection = weighted roulette, no instant repeats (repeat weight 0.15). Sleep weight ×4 when energy
< 30; dance ×3 when boredom > 60; chase ×2.5 when the mouse is moving & boredom > 40; window-jump
enabled when boredom > 25 and windows exist; energy < 8 forces sleep. Standing on a window top
after a jump → automatic hop back down to the floor.

Coins: +1/45 s alive · +2 per action · +5 per dance · +1 per pet · +50 daily gift.

## 3. Cat Store

| Category | Items |
|---|---|
| Breeds | Orange Tabby (free) · Tuxedo 100 · Calico 120 · Siamese 140 · British Shorthair 150 · White Persian 180 |
| Accessories (stackable ×3) | Party Hat 40 · Top Hat 60 · Head Bow 35 · Bow Tie 35 · Round Glasses 50 · Cozy Scarf 55 |
| Emote packs | Classic Hearts (free) · Surprise ! 25 · Zzz Clouds 30 · Music Notes 30 · Sparkles 45 |
| Size | slider 0.5× – 2.0× (free) |

Right pane = live animated preview of the pending look (walking cat at your size setting; choosing
an emote pack showcases it for 2.6 s). Buy once → own forever; equip/unequip freely. Everything is
validated in `CoinWallet` (no overdraft, no double-buy) and covered by unit tests.

## 4. Window jumping

The host enumerates visible, non-minimized, non-cloaked, titled top-level windows ≥ 220×140 px
(excluding our own windows, the taskbar and tool windows) every 1.2 s via user32/DWM. Pick a target
from the menu or let the brain choose one: the cat walks… well, leaps — along a piecewise-parabolic
arc to the window's top edge, lands with a squash + thud, sits proudly, then hops back down when it
next decides to move. The cat can also wander along window tops afterwards — hop-down happens
automatically.

## 5. Sounds

All synthesized (44.1 kHz 16-bit) by `scripts/gen_assets.py`: `meow` (750→460 Hz glide, vibrato),
`purr` (26 Hz modulated rumble), `patter`/`run_patter` (noise taps), `whoosh` (band-swept noise),
`land` (thud + click), `coin` (E6→C6 ding), `scratch` (scrape texture), `chirp`, `dance_loop`
(112 BPM kick/hat/arp). Volume 0.6 default, mute toggle persisted, 120 ms anti-spam cooldown.

## 6. Persistence & settings

`%APPDATA%\MeowCat\config.json` — coins, owned items, equipped breed/accessories/emote pack, size,
sound, mood, daily-gift date, cat name. Corrupt files are backed up (`*.corrupt-*`) and replaced
with defaults; all values sanitized on load.

---

# v2.0.0 — Frame-animated realism + major features

## Frame animation system

Every action now plays **AI-generated photographic frames** instead of the procedural vector cat:

| Clip | Frames | FPS | Notes |
|---|---|---|---|
| walk / run / jump / dance / scratch | **8** | 9 / 13 / 11 / 7 / 9 | interleaved A+B sheets → one natural gait cycle per loop |
| sit / sleep / idle / happy / angry / dangle / eat / pounce | **4** | 1.4–4.5 | subtle breathing/pose variations |

* **Cross-fade interpolation** (`SpriteRenderer`): during the last 55 % of each frame slot the next
  frame blends in (smoothstep, opacity-capped) — in-between poses without extra artwork, so motion
  looks fluid at 60 FPS even from 8 frames.
* **Asset pipeline** (`scripts/slice_assets_v3.py`): green *and* magenta screen keying
  (auto-detected), adaptive distance thresholds for vignettes, sure-foreground protection so wispy
  fur survives, hole filling, per-sheet **size normalization** (the kitten never changes scale
  between interleaved sheets), grid-line trimming, union-bbox cropping into a 512×512 art box.
* Breeds: grey_tabby has every clip at full frame counts; other breeds ship walk/sit/scratch and
  reuse look-alike clips for the rest (`SpriteCatalog.Resolve`).

## Angry mode (screen scratching)

* Click the angry cat → `ScratchAttack` (1.7 s) with 2 scheduled swipes.
* Each swipe stamps a decal batch (`DecalPlanner`): 1 spiderweb shatter + 2 claw gouges at the paw
  point, clamped to the visible screen, capped at 18 decals.
* `GlassOverlayWindow`: full-virtual-screen, transparent, **topmost + click-through**
  (WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW) — every window stays
  visible and clickable underneath, cracks render above everything.
* When the cat calms (time, treat, or happiness ≥ 55 after attacks) → all cracks fade out in 1.4 s
  and the layer empties.

## Topmost enforcement (the "cat under fullscreen tab" bug)

WPF `Topmost` asserts HWND_TOPMOST **once**; fullscreen apps create their own topmost windows
afterwards and bury the cat. `TopmostEnforcer` now calls `SetWindowPos(HWND_TOPMOST,
SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE)` for the cat window (and the glass overlay when visible)
every scan tick (1.2 s) — cheap, focus-steal-free, and it survives games/F11/slideshows.

## Tab-top hopping & desktop strolls

* `CatBrain` tracks the **platform** under the cat (`FindPlatform`): any window whose top edge is
  within 10 DIU of the feet and whose span contains the cat.
* On a platform the model bounds clamp to the window span (`+24/-24` margins) — the cat physically
  cannot walk off a title bar; it *hops*.
* **Auto-hop**: walking on the floor with a reachable window top ahead (≤ 560 DIU sideways,
  ≤ 460 DIU up, 6 s cooldown) triggers a spontaneous jump onto it.
* Landing on a platform → 55 % chance to hop to the *nearest other window* (continuing the
  window-to-window stroll), 20 % walk along the current one, 25 % descend.
* Jump reach is limited to ±620 DIU and the landing X is clamped **inside** the target window span.
* **Desktop mode** (no visible windows): the host reads real desktop icon positions
  (`DesktopIcons`: Progman → SHELLDLL_DefView → SysListView32 with cross-process
  VirtualAllocEx/ReadProcessMemory; synthesized grid fallback), and the brain strolls between
  icons, sits beside them, or walks to one and **scratches next to it**.

## Reminders & timers

* `Reminder` (Core): title, message, time, repeat (Once/Daily/Weekly/Every30Minutes/EveryHour),
  movement, sound, enabled. `ReminderStore`: JSON next to config.json, corrupt-safe.
* `ReminderService`: 1 Hz `Tick` — fires one-shots once (and disables them), rolls repeating
  reminders forward (catch-up loop, bounded); first-run-after-launch ignores reminders > 5 min late.
* Notification: **speech bubble** above the cat (`EmoteRenderer.RenderSpeechBubble` — rounded card,
  wrapped text, tail, clock dot, pop-in/out easing) + tray balloon + real meow, and the cat
  **performs the movement chosen for that reminder** (dance, jump, yarn, scratch, zoomies, …).
* `ReminderWindow`: list + editor (title/message/time `HH:mm`/repeat/movement/sound/enabled),
  delete, "preview movement" hint.

## Settings & installer

* `SettingsWindow`: **auto-start with Windows** (`AutoStart` — HKCU Run key), sound, volume,
  reminder popups, cat size; every change persists immediately.
* `MeowSettings` gained `AutoStartEnabled` + `ReminderPopupsEnabled` (backward-compatible JSON).
* MSI v2.0.0: **desktop shortcut is created by default** (`DesktopFolder` component, registry
  keypath, removed on uninstall), MajorUpgrade from 1.x, 155 components (all frames + sounds).
