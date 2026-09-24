# Building MeowCat

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20+ | <https://nodejs.org> |
| npm | 10+ | ships with Node |
| Python 3 + Pillow | 3.9+ | only for regenerating README screenshots (dev extra) |

## Run from source

```bash
cd app-electron
npm install          # electron + electron-builder + playwright (dev)
npm start            # the cat appears
```

On a fresh clone, if Electron's binary download was interrupted, force it:

```bash
cd app-electron/node_modules/electron && node install.js
```

## Tests

```bash
npm test                        # 288 unit checks + 89 visual (pixel) checks
node scripts/e2e-linux.mjs      # full-app E2E under Xvfb (44 checks)
node scripts/e2e-v311.mjs       # v3.11 feature E2E: flicker frames, drag-follow,
                                # sounds spec, zone selector, self-heal (30 checks)
```

The E2E harness boots the REAL app under Xvfb and drives it over the Chrome
DevTools Protocol — the same binary users run.

## Package the Windows portable exe

```bash
cd app-electron
npm run dist
# → dist/MeowCat-3.11.0-portable.exe
```

`electron-builder` produces a single portable exe. The process shows up in Task
Manager as **MeowCat.exe** (productName), never "electron" — this is verified
in E2E by reading `/proc`-equivalent process metadata at runtime.

Notes:

- `asarUnpack` covers `uiohook-napi` so its native module survives packaging;
  the keyboard hook itself runs in an Electron `utilityProcess`, so even a
  native crash cannot take the cat down (it respawns with backoff).
- Hardware acceleration is intentionally disabled (`disableHardwareAcceleration`
  + `in-process-gpu`): software compositing is what keeps the transparent
  overlay flicker-free and the process count at three.

## Releases (private repo)

1. Commit to `main`, tag `v3.11.0`.
2. Upload the portable exe to GitHub Releases (the exe is too large for git).
3. Verify the release asset downloads (HTTP 200, `application/octet-stream`).
