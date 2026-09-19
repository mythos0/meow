#!/usr/bin/env bash
# Build MeowCat MSI on Linux (WiX v5 is cross-platform) or Windows (works too).
# Usage: scripts/build_msi.sh [version]
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-1.0.0}"
export DOTNET_ROOT="${DOTNET_ROOT:-$HOME/.dotnet}"
export PATH="$HOME/.dotnet:$HOME/.dotnet/tools:$PATH"

echo "==> Publishing app (win-x64, framework-dependent)"
dotnet publish src/MeowCat/MeowCat.csproj -c Release -r win-x64 --self-contained false \
  -p:Version="$VERSION" -o artifacts/publish

echo "==> Harvesting files"
python3 scripts/gen_wix_files.py artifacts/publish installer/Files.wxi

echo "==> Building MSI"
wix build installer/Product.wxs \
  -d "PublishDir=artifacts/publish" \
  -d "Version=$VERSION" \
  -arch x64 \
  -o "artifacts/MeowCat-$VERSION-x64.msi"

echo "==> Done: artifacts/MeowCat-$VERSION-x64.msi"
