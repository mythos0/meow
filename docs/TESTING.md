# Testing MeowCat

## 1. Automated test suite (runs on any OS)

```bash
dotnet test MeowCat.sln -c Release        # → 40/40 passed
```

| Suite | What it proves |
|---|---|
| `CatBrainTests` (13) | starts idle · mood clamping · sleep restores energy · passive drain · finite actions complete on time · dance rewards & mood relief · **low energy forces sleep** · pet coin cooldown · **jump reaches window top edge exactly + lands sitting** · apex above both endpoints & velocity signs · **hop-down from window tops** · chase ends near mouse · command legality mid-air · drag override rules · **10 000-tick simulation: mood bounds, floor bounds, no lost coins, ≥4 distinct activities, naps when tired** · weight table never negative & no instant repeats |
| `CoinWalletTests` (5) | start balance · earn · spend within balance · **overdraft impossible** · negative amounts rejected · change events |
| `SettingsStoreTests` (4) | JSON round-trip · **corrupt file → defaults + .corrupt backup** · missing file → defaults · sanitize clamps crazy values |
| `CatModelTests` (2) | walking integrates + bounces at walls · jump completes exactly at planned duration & position |
| `CatStateInfoTests` (3) | drag blocks commands, release returns to sitting · mid-air interrupts blocked · finite flags |
| `SkinCatalogTests` (6) | 6/6/5 merch counts · **ids unique across whole store** · default breed free · sane prices · lookups · max 3 accessories |
| `SoundCatalogTests` (3) | every mapped sound is a known file · **all 10 WAVs exist in Assets** · positive loop intervals |

## 2. Build-level verification already performed

- `dotnet build` of the **full WPF app** on Linux (`EnableWindowsTargeting`) — the entire app
  (renderer, windows, interop) compiles cleanly.
- `dotnet publish -r win-x64` — Windows exe + all deps produced.
- MSI built & inspected table-by-table with `msiinfo` (Property, Upgrade, Directory, Component,
  File, Shortcut, Registry, InstallExecuteSequence, embedded cabinet).

## 3. Manual QA checklist (Windows 11 — 20 points)

*(automated UI tests need a real Windows session; this is the 15-minute pass)*

| # | Check | Expected |
|---|---|---|
| 1 | Install MSI | completes, Start-Menu shortcut exists, entry in Apps & Features |
| 2 | Launch | cat appears on the floor line (above taskbar), no console window |
| 3 | Walk | strolls both directions, bounces at screen edges, footstep sounds |
| 4 | Overlay | cat renders **over** browsers/tabs/taskbar; rest of screen fully clickable (click under the cat's empty window corners) |
| 5 | Idle life | sits, looks around, blinks; boredom builds → dances/plays on its own |
| 6 | Sleep | lies down, breathes, purrs, Zzz floats; wakes with energy |
| 7 | Dance | bounce + roll + music notes + dance loop |
| 8 | Jump | tray menu ▸ Jump to window ▸ pick a Notepad/Explorer window → arc, tuck, landing squash + thud, proud sit |
| 9 | After jump | when it next walks it hops down from the window top automatically |
| 10 | Pet | single click → hearts + happiness; double-click → meow |
| 11 | Drag | drag by the cat → dangles, follows cursor; release → sits where dropped |
| 12 | Chase | move mouse a lot while bored → cat runs to the cursor and sits by it |
| 13 | Yarn | ball appears, paw bats it, ball rolls |
| 14 | Scratch | occasional edge-scratch with scratch sound + lines |
| 15 | Store preview | open store (tray double-click or cat menu) → preview pane walks with your pending selections; emote pick shows showcase |
| 16 | Store economy | buy Calico (120) with start coins → applied instantly; try buying when broke → friendly hint; daily gift +50 once/day |
| 17 | Accessories | equip top hat + scarf + glasses together (max 3), then unequip |
| 18 | Size | slider 0.5→2.0 resizes cat + overlay live; size persists after restart |
| 19 | Persistence | restart app → coins/wardrobe/mood restored from %APPDATA%\MeowCat\config.json |
| 20 | Upgrade & uninstall | install MSI again over itself (same version upgrade), then uninstall → files, shortcut and ARP entry removed; config.json survives for the next install |

## 4. Known environment notes

- Other *always-on-top* overlays (some game HUDs) can cover the cat; the cat re-asserts topmost on
  state changes.
- Per-monitor DPI: mouse/window rects are converted with the **primary** monitor scale — mixed-DPI
  multi-monitor setups may show small offset on secondary monitors (listed as a future fix).
- UWP full-screen apps: DWM-cloaked windows are excluded from jump targets automatically.
