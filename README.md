# 🐱 MeowCat

**A desktop cat for Windows 11 that thinks it lives in your computer.** It doesn't just sit on
your taskbar — it watches your CPU, hears your music, judges your build failures, and pounces on
your mouse cursor when you leave it unattended. Every pixel of the cat is drawn by pure code on a
canvas at 60 FPS — **no sprite frames, no image assets, no mercy**.

![](docs/screenshots/01_hero_walk.png)

```
$ whoami
MeowCat.exe        ← in Task Manager, always. Never "electron".
```

## What the cat actually does

| It can… | Details |
|---|---|
| 🚶 **Live on your windows** | Walks the taskbar, and walks & jumps along the top border of your normal (resized) windows — hopping roof-to-roof, riding along when you drag or resize a window it stands on, and politely skipping maximized full-screen ones |
| 🖥️ **Feel your machine** | CPU/RAM spike → startled panic · low battery → curls up "to save energy" · 10 PM → yawny naps · new window opens → walks over and sniffs it |
| 🎵 **Hear your music** | Bops to the beat while Spotify/YouTube plays; new track = excited hop (Windows SMTC) |
| 💻 **Judge your job** | Loafs on your code editor while you type; happy-dances when your build file goes green, mopes when it's red |
| ⌨️ **Chase your workload** | Fast typing burst → pounces toward the keyboard · mouse idle nearby → classic red-dot stalking (it remembers) |
| 🔋 **Save the planet** | Battery under 20% → curls into a ball. When you plug in, it pretends that was the plan all along |
| ❤️ **Be loved** | Pet it → purrs + affection meter → unlocks rainbow emotes and, at Lv.4, a boot-time greeting |
| 🐈 **Have friends** | Companion cat mode: nuzzling, play-fighting, and cursor-related rivalry |
| 📸 **Be famous** | Photo mode (Ctrl+Alt+P) freezes the pose and exports a transparent PNG sticker |
| 🏆 **Brag** | 8 achievements — "Purring Machine" (100 pets), "Dot Exterminator" (5 laser catches)… |
| 🍅 **Manage your time** | Pomodoro companion: supervises focus rounds, celebrates with a dance when you finish |
| 🎃 **Dress up** | Seasonal hats (pumpkin in October, santa in December, shades in summer) + importable JSON community skins |
| 🚫 **Respect boundaries** | No-walk zones you draw on screen — and it stays on stage: the cat NEVER hides itself (no call/fullscreen auto-hide) and never quits on its own |
| 🎮 **Play** | Interactive laser-pointer chase (+3 coins per catch), ambient butterflies, zoomies, sneezes, hairballs, a bread emote for the loaf |
| ⏰ **Nag you** | Reminders & timers — the cat dances and delivers your message |
| 🛍️ **Get adopted** | Cat Store: 20 breeds + a panda that waddles like a real bear and eats bamboo sitting up (researched!) |

**Every feature above has an on/off toggle** in a Windows 11 Fluent-style Settings app
(left nav, cards, proper toggle switches — it looks like it ships with Windows).

## Install

1. Grab `MeowCat-3.10.0-portable.exe` from [Releases](https://github.com/mythos0/meow/releases).
2. Run it. A cat appears. That's the whole setup.
3. Right-click the cat → **Settings…**, or double-click it. Tray icon works too.
4. **Click the cat** → it meows. For real. Spam-click it → still exactly one cat, one voice, zero overlap.

| | |
|---|---|
| **Stack** | Electron 33 · HTML5 Canvas 2D · zero native modules required for the core |
| **Art** | 100% procedural — palettes + body skeletons + IK pose math, no PNGs |
| **Sounds** | Real recorded cats (+2 tiny code-synthesized SFX, because the author doesn't own a trampoline) |
| **Tests** | 351 unit + 89 visual + 133 E2E (real app under Xvfb, every feature exercised live) |
| **RAM** | ~165 MB PSS, 3× MeowCat.exe processes at rest (main + renderer + helper, all named MeowCat) |
| **CPU** | idle 13% of a core, sleep ~5.7% (7.5fps breathing), paints freeze while hidden, one PowerShell stream instead of 12/min |
| **Docs** | [RENDERING](docs/RENDERING.md) · [FEATURES](docs/FEATURES.md) · [BUILD](docs/BUILD.md) · [TESTING](docs/TESTING.md) |

## Community skins (no recompile!)

Drop a JSON file via **Settings → Cat Store → Import…**:

```json
{
  "name": "Nightsky",
  "base": "bombay",
  "body": "chubby",
  "colors": { "fur": "#4a4a7a", "eye": "#ffd94d", "belly": "#c8c8f0" },
  "pattern": "spots",
  "hat": "pumpkin"
}
```

It appears in the Cat Store like any breed. Ship your cat. Open a PR. Famous.

## Build from source

```bash
cd app-electron
npm install
npm start        # run the cat
npm test         # 303 unit + 89 visual checks
npm run dist     # portable Windows exe (MeowCat.exe, honestly named)
```

## Testing philosophy

The cat is 100% code, so the cat is 100% testable: the brain is a deterministic seeded state
machine (unit-tested), the renderer is a pure draw function (pixel-tested in headless Chromium),
and the full app boots under Xvfb where an E2E harness pokes *every feature* — it hogs the CPU
until the cat panics, feeds it a fake dead battery, makes it stalk a cursor, imports a skin,
and checks the no-walk zones actually stop the cat. All green, every release.

v3.7's torture pass earned its scars: the hop that used to flap the overlay window on loop
(zero-width slide band — the "cat is jumping/flushing" bug), a kitten that wandered outside
the visible window and astral-projected, a render loop that kept painting at 60 FPS while
hidden, and a Windows sampler that spawned a fresh PowerShell every 5 seconds like it was
paying per spawn. All measured, all fixed, all regression-tested.

v3.8 went after the leftover jumps: spam-clicking the cat stacked overlapping meows (now one
exclusive voice — one cat, one meow, no choir), windows that moved or resized between scans
teleported the standing cat to the ground (it now re-binds by geometry, rides the border, and
only ever *hops* after a far-dragged window), a vanished window dropped the cat instantly
(now an animated fall), the companion kitten sprinted the wrong way on leash-recovery and got
snapped back (now a smooth dash), the reminder toast said "your cat has a message" instead of
the actual message, and long speech bubbles got clipped at the region edge. Plus the headline
act: the cat properly walks AND jumps along the top border of resized windows — and no longer
treats a maximized full-screen window as a sidewalk.

v3.9 killed the jump at its structural root. The overlay window and the canvas coordinate
system live in two processes joined by async IPC, so a one-shot slide of up to 400px could
never flip together with the canvas origin — for one vsync the window showed stale content
and the whole scene visibly leapt. Three timing fixes failed to kill it because it was not a
timing bug. So now the window never makes a big move: the **chase camera** walks the origin
toward the re-centering target at a capped 900px/s (≤15px per frame — a stale frame, when it
even happens, is an invisible shimmer instead of a teleport). The **platform tracker** is the
other half: one persistent PowerShell polls the hwnd the cat stands on with user32
GetWindowRect (~0% CPU) and the cat is *carried* by its window at a smoothed ≤700px/s while
you drag or resize it — no more floating in the air for up to 4.5s and then snapping. A flaky
scan can no longer drop the cat off a healthy window (the tracker is authoritative while
alive), and the sleeping cat now animates at ~7.5fps because nobody needs 60fps of
breathing. Measured: identical idle CPU, sleep −25%, RAM down to ~165MB PSS, and all 60
render states pixel-identical.

## License

MIT © 2026 mythos0. The cat is not licenced for use in nuclear facilities, but honestly it would
probably improve morale there too.
