# 🐱 MeowCat

A **realistic, 3D-shaded desktop cat for Windows 11** that lives *on top of everything*: it strolls
across your entire screen, dances, takes naps, chases your mouse, plays with yarn, scratches screen
edges for fun, and leaps in real ballistic arcs **between your open windows**. Everything is drawn
procedurally with layered lighting (radial volume gradients, specular highlights, ambient occlusion)
— a glossy 3D look at 60 FPS with zero sprite assets, infinitely rescalable 0.5×–2.0×.

It has its own **Cat Store** (breeds · accessories · emote packs · size — all with live animated
preview), a **fun-coin economy** (your cat earns coins by living, dancing and being petted), a full
**synthesized SFX pack** (meow, purr, footsteps, whoosh, coin ding, dance loop…), and ships as an
**MSI installer** with clean upgrade & uninstall support.

| | |
|---|---|
| **Stack** | C# / .NET 8 · WPF overlay · WinForms tray · WiX/msitools MSI |
| **Renderer** | Fully procedural vector cat, layered 3D-style shading, 60 FPS |
| **AI** | Mood brain (happiness / energy / boredom) with weighted autonomous actions |
| **Docs** | [PLAN.md](PLAN.md) · [docs/FEATURES.md](docs/FEATURES.md) · [docs/BUILD.md](docs/BUILD.md) · [docs/TESTING.md](docs/TESTING.md) |

---

## Install (Windows 11)

**Option A — MSI installer (recommended)**

1. Grab `MeowCat-1.0.0-x64.msi` (repo → `installer/`, or the GitHub Release once CI is enabled).
2. Double-click → installs to `Program Files\MeowCat`, adds a **MeowCat** Start-Menu shortcut and an
   **Apps & Features** entry.
3. **Upgrade:** just run a newer MSI over it — the old version is removed automatically
   (MajorUpgrade). Same-version reinstalls are allowed too.
4. **Uninstall:** `Settings ▸ Apps ▸ Installed apps ▸ MeowCat ▸ Uninstall`
   or `msiexec /x MeowCat-1.0.0-x64.msi`.

> Requires the **.NET 8 Desktop Runtime** (x64) — download: <https://dotnet.microsoft.com/download/dotnet/8.0/runtime>

**Option B — run from source**

```powershell
git clone https://github.com/mythos0/meow.git
cd meow
dotnet run --project src/MeowCat
```

**Build the MSI yourself**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build.ps1          # → artifacts\MeowCat-1.0.0-x64.msi
```

---

## What your cat can do

| | |
|---|---|
| 🚶 **Walk / 🏃 run** across the whole screen with a realistic diagonal-pair gait, body bob and tail sway | 😴 **Sleep** with slow breathing, purring and Zzz |
| 💃 **Dance** — bounce + roll wiggle, pumping paws, music emotes | 🪟 **Jump between your open windows** — real parabolic arcs, tuck at apex, squash on landing, then a proud sit |
| 🖱️ **Chase the mouse** when bored | 🧶 **Play with yarn** — bats the rolling ball |
| 🧱 **Scratch screen edges** (mischief earns happiness) | 🫱 **Pet it** (click) → hearts · **drag it** anywhere (legs dangle) · **double-click** → meow |
| 🛍️ **Cat Store** — 6 breeds, 6 accessories, 5 emote packs, size slider, live animated preview | 🪙 **Fun coins** — earned passively + per action + daily gift; spend in the store |
| 🔊 **Full SFX** — meow, purr, footsteps, jump whoosh, landing thud, coin ding, scratch, dance loop | 🫥 **System tray icon** with the full menu — also right-click the cat itself |

Right-click the cat (or the tray icon): **Feed · Dance · Nap · Play · Jump to window ▸ · Sound ·
Size ▸ · Cat Store · Exit**.

---

## Architecture

```
MeowCat.sln
├── src/MeowCat.Core     — pure C# brain/economy/catalog (no UI deps, fully unit-tested)
├── src/MeowCat          — WPF app: Rendering (3D-shaded painter), Windows (overlay + store),
│                          Platform (Win32 interop, DPI, sound), Assets (icon + 10 synthesized WAVs)
├── tests/MeowCat.Tests  — 40 xunit tests (brain simulation, economy, physics, catalogs)
├── installer/           — WiX sources + prebuilt MSI (MajorUpgrade = upgrade/uninstall)
└── scripts/             — asset synthesis, WiX harvesting, MSI + CI build scripts
```

Key design notes live in [PLAN.md](PLAN.md) — pose math, mood weights, jump physics, store economy,
and the installer upgrade strategy.

## CI

`.github/workflows/build-msi.yml` (committed as `docs/ci/build-msi.yml.example` because the current
deploy token lacks the `workflow` scope) builds + tests + packs the MSI on `windows-latest` and
publishes a GitHub Release on every push. To activate: copy it to `.github/workflows/` with a
token/user that can push workflows.

## Privacy & data

The cat stores one JSON file at `%APPDATA%\MeowCat\config.json` (coins, wardrobe, mood, sound
settings). No network access, no telemetry. Delete the file for a factory reset.
