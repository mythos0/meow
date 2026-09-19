# Building MeowCat

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| .NET SDK | 8.0+ | <https://dotnet.microsoft.com/download> |
| Python 3 | 3.9+ | with Pillow + numpy (asset regeneration only) |
| WiX v5 | 5.0.2 | auto-installed by the build scripts (`dotnet tool install --global wix`) |

## 1. Run from source (any OS for dev; visuals need Windows)

```bash
dotnet run --project src/MeowCat
```

## 2. Run unit tests

```bash
dotnet test MeowCat.sln -c Release
```

The test project targets plain `net8.0` (only `MeowCat.Core`), so it runs on Windows, Linux and
macOS — 40 tests cover the brain simulation, economy, physics and catalogs.

## 3. Build the MSI (Windows — recommended)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build.ps1          # version defaults to 1.0.0
powershell -ExecutionPolicy Bypass -File scripts\build.ps1 -Version 1.1.0
```

The script: publishes `win-x64` framework-dependent → runs tests → harvests files
(`scripts/gen_wix_files.py` → `installer/Files.wxi`) → `wix build` → `artifacts\MeowCat-<version>-x64.msi`.

> The MSI needs the **.NET 8 Desktop Runtime (x64)** on the target machine. For a fully
> self-contained installer, add `--self-contained true` to the publish step (≈150 MB).

## 4. Build the MSI (Linux — how the shipped MSI was produced)

```bash
export DOTNET_ROOT="$HOME/.dotnet"; export PATH="$HOME/.dotnet:$HOME/.dotnet/tools:$PATH"
dotnet publish src/MeowCat/MeowCat.csproj -c Release -r win-x64 --self-contained false -o artifacts/publish
python3 scripts/gen_wixl_wxs.py artifacts/publish installer/Product-wixl.wxs 1.0.0
wixl -a x64 -o artifacts/MeowCat-1.0.0-x64.msi installer/Product-wixl.wxs   # msitools
```

`scripts/build_msi.sh` wraps the WiX-v5 path for machines where it works; `wixl` (msitools) is the
Linux-proven path. Verify the result with `msiinfo export <msi> Property` etc.

## 5. Regenerate assets (optional)

```bash
pip install pillow numpy
python3 scripts/gen_assets.py      # → src/MeowCat/Assets/app.ico + 10 SFX WAVs, docs/icon-preview.png
```

## 6. GitHub Actions CI

`docs/ci/build-msi.yml.example` — copy to `.github/workflows/build-msi.yml` to build/test/package
the MSI and publish a GitHub Release on every push (needs a token with `workflow` scope to push the
file, or use the GitHub web UI).

## 7. Installer internals

- `UpgradeCode` = `B7E4A2D1-8C93-4F6E-9A15-D20C7E3F8B42` — **stable across all versions; never change it.**
- `Product Id="*"` → new ProductCode each build; `MajorUpgrade AllowSameVersionUpgrades="yes"`
  → newer-MSI-over-old = clean upgrade; same-version reinstall allowed; downgrade blocked with a
  clear message. `RemoveExistingProducts` sequenced at 1401 (after InstallValidate).
- Per-machine → `Program Files\MeowCat`; Start-Menu shortcut; ARP icon + link; uninstall via
  Apps & Features or `msiexec /x`.
