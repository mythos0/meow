# 🐱 MeowCat

A realistic, 3D-shaded desktop cat for Windows 11 that walks across your entire screen on top of
everything, dances, jumps between your open windows, chases your cursor, plays with yarn — and shops
in its own **Cat Store** with a fun-coin economy. Full synthesized SFX pack. Ships as an MSI installer
with clean upgrade/uninstall support.

> Full product & engineering plan: see [PLAN.md](PLAN.md)

## Quick start (from source)
```powershell
dotnet run --project src/MeowCat
```

## Build MSI installer
```powershell
scripts/build.ps1   # publishes app + builds MeowCat-<version>-x64.msi via WiX
```

---
Status: under active development (M1 plan complete).
