# 🐱 MeowCat — Comprehensive Product & Engineering Plan

> A realistic, 3D-shaded desktop cat for Windows 11 that lives **on top of everything** — walking across
> your entire screen, dancing, jumping between your open windows, reacting to petting, and shopping in its
> own **Cat Store** with a fun-coin economy.

| | |
|---|---|
| **Product** | MeowCat — Windows 11 desktop pet |
| **Stack** | C# / .NET 8.0 · WPF (transparent topmost overlay) · WinForms NotifyIcon (tray) |
| **Renderer** | Fully procedural vector cat with layered gradients → glossy **3D-shaded look**, 60 FPS |
| **Economy** | Fun Coins (passive + action earning, spent in Cat Store) |
| **Sound** | Full synthesized SFX pack (meow, purr, patter, whoosh, coin, scratch, chirp) |
| **Installer** | WiX MSI with MajorUpgrade → clean **upgrade & uninstall** via Apps & Features |
| **Repo** | `github.com/mythos0/meow` (private) |

---

## 1. Product Vision

A cat that feels *alive on your desktop*: it should never sit still behind your windows — it strolls
across the taskbar, naps in a corner, suddenly breaks into a dance, leaps in a real ballistic arc onto
one of your open application windows, chases your mouse when bored, and comes running to be petted.
Everything is drawn procedurally with layered lighting (radial gradients, specular highlights, ambient
occlusion shadows, fur tufts) so the cat reads as **soft, glossy and volumetric** — a 3D look with
zero binary sprite assets, infinitely rescalable from 0.5× to 2.0×.

### Design pillars
1. **Alive first** — the cat acts on its own every few seconds (AI mood brain), never loops robotically.
2. **Realistic motion** — diagonal-pair gaits, sinusoidal leg swing, body bob, tail follow-through,
   parabolic jumps with takeoff stretch / apex tuck / landing squash, breathing while asleep.
3. **Everything customizable** — 6 breeds, 6 accessories, 5 emote packs, size 0.5×–2.0×, live preview
   before buy/equip.
4. **Non-intrusive** — the pet window is only as large as the cat; the rest of your screen stays fully
   clickable. One click toggles nothing; drag carries the cat anywhere.

---

## 2. Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                            MeowCat (WPF)                           │
│                                                                    │
│  ┌──────────────┐   ┌───────────────┐   ┌──────────────────────┐   │
│  │  CatWindow   │   │ StoreWindow   │   │ TrayIcon (NotifyIcon)│   │
│  │ topmost,     │   │ tabs: breeds  │   │ menu: feed/dance/    │   │
│  │ transparent, │   │ accessories   │   │ sleep/play/jump ▸    │   │
│  │ sized to cat │   │ emotes size   │   │ store/sound/exit     │   │
│  └──────┬───────┘   └──────┬────────┘   └──────────┬───────────┘   │
│         │ CompositionTarget.Rendering (60 FPS tick) │               │
│  ┌──────▼───────────────────────────────────────────▼───────────┐   │
│  │ Rendering layer                                              │   │
│  │  CatRenderer   — procedural 3D-shaded cat (all poses)        │   │
│  │  EmoteRenderer — hearts / Zzz / notes / ! / sparkles         │   │
│  │  YarnBall, ScratchFX, CoinPopup                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────── Core (pure C#, unit-testable) ─┐  │
│  │  CatBrain     — mood system (happiness/energy/boredom),       │  │
│  │                 weighted autonomous action selection          │  │
│  │  CatState     — enum + transition rules + durations           │  │
│  │  CatModel     — position, velocity, facing, jump physics      │  │
│  │  CoinWallet   — earning rules, persistence, transactions      │  │
│  │  SettingsStore— %APPDATA%/MeowCat/config.json                 │  │
│  │  SkinCatalog  — breeds / accessories / emote packs / prices   │  │
│  │  SoundCatalog — state→sound mapping, cooldowns                │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────── Platform (Win32 interop) ──────┐  │
│  │  WindowEnumerator — EnumWindows/GetWindowRect/IsWindowVisible │  │
│  │  ScreenInfo       — primary screen + work area + DPI          │  │
│  │  SoundService     — MediaPlayer w/ volume + cooldown          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

**Key decisions**
- **Pet window = cat bounding box, not fullscreen.** A 260×220-DIU transparent `Window` with
  `WindowStyle=None, AllowsTransparency=True, Topmost=True, ShowInTaskbar=False, ShowActivated=False`.
  The window *moves* with the cat — screen stays clickable everywhere else.
- **Frame loop:** `CompositionTarget.Rendering` → dt → `Brain.Tick(dt)` → physics → `InvalidateVisual()`.
- **Core has zero WPF references** → the whole brain/economy/config layer is unit-tested on any OS.
- **State machine** drives everything: one `CatState` at a time, with per-state animation clock `t`.

---

## 3. Cat rendering — "3D-realistic" vector design

The cat is composed of ~25 painted layers per frame. Realism comes from **lighting, not texture**:

| Technique | Implementation |
|---|---|
| Volumetric body | Radial gradient centered top-left: highlight fur color → mid → dark rim (specular + shading) |
| Ambient occlusion | Soft dark ellipse under chin, under belly, under paws (blur via gradient alpha falloff) |
| Specular gloss | Small white 8%-alpha ellipse upper-left of head & body |
| Fur edge | Outer glow gradient + tuft triangles (3-5 px) on cheeks, chest, ear rims |
| Fur stripes | Curved low-alpha dark bezier bands (tabby), patches (calico), points (siamese) |
| Eyes | Almond shape: sclera, radial iris gradient (breed eye color), vertical pupil, 2 catchlights, dark liner stroke, animated eyelid blink |
| Nose/mouth | Pink radial-gradient triangle nose + highlight dot, `ω` mouth path |
| Whiskers | 3 thin white arcs/side at 35% alpha, animated sway |
| Tail | Quadratic bezier stroke with gradient + darker tip; follow-through wag |
| Ground shadow | Ellipse under cat, alpha & size vary with jump height (contact shadow) |

### Poses (all parameterized by time `t`)
| Pose | Motion math |
|---|---|
| **Walk** | speed 70 px/s · legs: diagonal pairs (FL+BR phase 0, FR+BL phase π) `θ=18°·sin(2π·1.6t)` · body bob `2px·sin(2π·3.2t)` · tail sway `±14°·sin(2π·0.8t)` |
| **Run** | speed 160 px/s · leg amplitude 26°, freq 2.6 Hz · body lean 8° forward · ears swept back |
| **Idle** | sit · breathing `scaleY 1+0.015·sin(2π·0.3t)` · slow tail curl · blink every 2.5–5 s |
| **Sit** | rear haunches ellipse, front paws forward, tail wrapped with slow tip flick |
| **Sleep** | lying body, eyes closed (`︶︶`), breathing `1+0.05·sin(2π·0.17t)`, Zzz emote rising |
| **Dance** | bounce `8px·sin(2π·2t)` · body roll `±12°·sin(2π·2t)` · front paws alternate raised · notes spawn every 0.5 s |
| **Jump** | ballistic `y(t)=y₀+v_y t−½g t²` (g≈1500 px/s²) · takeoff: legs extended · apex: tuck (`legs rotate 40°, body squash 0.9`) · landing: squash `0.85` for 120 ms |
| **ChaseCursor** | run toward mouse; < 40 px → sit + happy chirp |
| **PlayYarn** | yarn ball 24 px ahead; cat bobs, front paw bats at 2 Hz; yarn rolls 12 px then stops; loop 8 s |
| **Scratch** | at screen edge, front paws alternate 4 Hz vertical ±20°, 3 scratch lines fade, body tilt 6° |
| **Petted** | happy closed eyes `^^`, blush circles, hearts, wiggle ±4° |
| **Dragged** | legs dangle straight, sway `±8°·sin(2π·1.5t)`, wide eyes + `!` emote |

---

## 4. Behavior AI — CatBrain

**Mood model** (0–100 each, persisted): `Happiness`, `Energy`, `Boredom`.
- Passive per second: Energy −0.10, Boredom +0.25, Happiness drifts toward 55.
- Action effects: Sleep → Energy +30/s·(until 100) · PlayYarn/Dance → Boredom −18, Happiness +10 ·
  Walk → Boredom −4 · Chase → Boredom −12, Happiness +6 · Petted → Happiness +8 (30 s cooldown, +1 coin) ·
  Scratch → Boredom −8, Happiness +2 (mischief!).
- **Weighted choice** when an action ends: weight = base × mood modifier
  (e.g. Sleep weight ×4 when Energy < 30; Dance ×3 when Boredom > 60; Chase ×3 when Boredom > 50 and mouse moved recently).
- Typical autonomous sequence: idle 2–6 s → walk 3–8 s → (sit / dance / yarn / scratch / window-jump) → …

**User commands** (tray & context menu) force states: Feed (🍖 Happiness+20, Energy+15, coin bonus),
Dance!, Sleep, Play, Jump to window ▸ (submenu of live window titles).

**Coin sources:** +1 per 45 s alive · +2 per completed autonomous action · +1 per pet · +5 per dance ·
+10 daily bonus. Wallet & inventory persist as JSON.

---

## 5. Cat Store

A real WPF window (`700×520`), theme: warm cream + coral accents, rounded cards.

| Category | Items (price in 🪙) |
|---|---|
| **Breeds** (6) | Orange Tabby (0, default) · Calico (120) · Tuxedo (100) · White Persian (180) · British Shorthair (150) · Siamese (140) |
| **Accessories** (6) | Party Hat (40) · Top Hat (60) · Head Bow (35) · Bow Tie (35) · Round Glasses (50) · Cozy Scarf (55) — stackable, up to 3 |
| **Emote packs** (5) | Classic Hearts (0, default) · Zzz Clouds (30) · Music Notes (30) · Surprise `!` (25) · Sparkles (45) |
| **Size** | slider 0.5×–2.0×, free, live-applied to preview |

**Live preview** — right panel renders the *actual* `CatRenderer` at 3× zoom, animating (walk cycle),
with pending breed/accessories/emotes/size applied before purchase. Buttons: **Buy** (if unowned, costs
coins) → **Equip/Unequip** (owned items). Balance badge top-right. All transactions validated in
`CoinWallet` (unit-tested: no negative balance, no double-buy, equip only owned).

---

## 6. Sound design (synthesized WAV, 44.1 kHz 16-bit)

| File | Trigger | Synthesis |
|---|---|---|
| `meow.wav` | click / meow menu | 0.45 s pitch glide 780→420 Hz, 3 harmonics + vibrato 6 Hz, attack-decay envelope |
| `purr.wav` | sleeping, petting | 2.5 s, 26 Hz amplitude modulation over 90 Hz base rumble |
| `patter.wav` | walking steps | 4 × 45 ms filtered noise taps, alternating pan |
| `run_patter.wav` | running | 8 × 35 ms taps, faster |
| `whoosh.wav` | jump takeoff | 0.35 s band-passed noise sweep 300→1200→400 Hz |
| `land.wav` | jump landing | 60 Hz sine thud + 15 ms noise click |
| `coin.wav` | store purchase / earn popup | E6→C6 double sine ding |
| `scratch.wav` | scratching | 6 × 80 ms noise scrapes 1.4 kHz |
| `chirp.wav` | happy / yarn | rising chirp 500→1000 Hz ×2 |
| `dance_loop.wav` | dancing | 4 beats 112 BPM: kick + hat + marimba-ish square arps |

`SoundService` wraps WPF `MediaPlayer` with volume (0.6), per-sound cooldown (≥150 ms), mute toggle
persisted. Volume-safe: no sound louder than −6 dBFS.

---

## 7. Window jumping ("tab to tab")

1. `WindowEnumerator` (user32 P/Invoke: `EnumWindows`, `IsWindowVisible`, `IsIconic`, `GetWindowRect`,
   `GetWindowTextLength`) lists candidate windows: visible, non-minimized, titled, ≥200×150 px,
   **excluding** our own process windows, taskbar, Start.
2. Menu "Jump to window ▸" lists titles (truncated 40 chars). Brain also picks random candidates when
   Boredom > 40.
3. Jump animation: cat first **walks to the horizontal position** of the target (on the floor line),
   then crouch 250 ms → leap along parabolic arc to the target window's **top edge**, land with squash
   + `land.wav`, sit 1 s proudly, then continue wandering. If the target is above, jump is upward
   (arc apex 80 px above target edge); downward jumps gain speed naturally.

---

## 8. Installer — WiX MSI with upgrade/uninstall

- `installer/Product.wxs`: `Product Id="*"`, fixed `UpgradeCode = 7F3A9C4E-...` (stable across versions),
  `<MajorUpgrade AllowSameVersionUpgrades="yes" DowngradeErrorMessage="A newer version is already installed."/>`
  → **installing v1.1 over v1.0 upgrades in place; uninstall via Settings ▸ Apps or `msiexec /x`**.
- Per-machine install to `Program Files\MeowCat`, Start-Menu shortcut "MeowCat", Add/Remove Programs
  entry with icon + ARPHELPLINK.
- Files harvested from a framework-dependent `dotnet publish -r win-x64` output (script emits `Files.wxi`).
- MSI built with WiX v5 (`wix build`) — cross-platform, produced on the build machine, versioned
  `MeowCat-<version>-x64.msi`.
- UpgradeCode GUID (fixed): `B7E4A2D1-8C93-4F6E-9A15-D20C7E3F8B42`

---

## 9. Testing strategy

| Layer | How |
|---|---|
| **Build** | `dotnet build` on Linux with `EnableWindowsTargeting=true` — full compile verification of WPF app |
| **Unit tests (xunit)** | CatBrain: state transitions, mood bounds, weighted choice sanity (seeded RNG), action durations · CoinWallet: earn/spend/buy/equip rules, negative-balance prevention, persistence round-trip · SettingsStore: JSON round-trip, corrupt-file recovery, defaults · SkinCatalog: 6 breeds/6 accessories/5 emote packs, unique ids, prices ≥ 0 |
| **Brain simulation** | 10 000-tick loop with seeded RNG asserting: no invalid transitions, energy never negative, sleep restores energy, coins monotonically non-decreasing except store spends |
| **Renderer smoke test** | (Windows) all 12 states × 3 timestamps render without exception — documented in TESTING.md as a manual step |
| **Manual QA script** | TESTING.md: 20-point checklist for Windows 11 (walk, dance, jump onto Notepad, pet, drag, store preview, buy, size, sounds, upgrade install over old version, uninstall cleanliness) |

> Note: this build environment is Linux, so runtime/visual verification happens via compile + unit tests
> + simulation here, plus a precise manual QA checklist for the Windows 11 machine.

---

## 10. Repository layout & roadmap

```
meow/
├── MeowCat.sln
├── PLAN.md · README.md · docs/ (FEATURES, BUILD, TESTING)
├── src/MeowCat/            (WPF app)
│   ├── Core/               — brain, states, wallet, settings, catalog (pure C#)
│   ├── Rendering/          — CatRenderer, EmoteRenderer, effects
│   ├── Platform/           — Win32 interop, screen info, sound service
│   ├── Windows/            — CatWindow, StoreWindow
│   ├── Assets/sounds/      — synthesized WAVs
│   └── App.xaml(.cs), TrayService.cs
├── tests/MeowCat.Tests/    — xunit suite
├── installer/Product.wxs + Files.wxi (generated)
└── scripts/                — gen_sounds.py, gen_wix_files.py, build.ps1
```

**Milestones:** M1 plan → M2 core+rendering+windows → M3 tests green → M4 MSI → M5 docs & delivery.
