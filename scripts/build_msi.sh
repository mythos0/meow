#!/usr/bin/env bash
# Build the MeowCat MSI on Linux with msitools' wixl.
#
# Why not `wix build` (WiX v4/v5 dotnet tool)? Its Directory compiler
# canonicalizes relative names via Windows-only `Path.GetFullPath("C:\" + n)`,
# which errors WIX0389 on Unix for EVERY directory. wixl is the native Linux
# MSI toolchain and the pipeline that produced the shipped installers.
#
# Usage: scripts/build_msi.sh [version]
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-2.0.1}"
export DOTNET_ROOT="${DOTNET_ROOT:-$HOME/.dotnet}"
export PATH="$HOME/.dotnet:$HOME/.dotnet/tools:$PATH"

# ---- locate wixl (system, or locally extracted debs)
if command -v wixl >/dev/null 2>&1; then
  WIXL=wixl
elif [ -x "$HOME/opt/msitools/root/usr/bin/wixl" ]; then
  WIXL="$HOME/opt/msitools/root/usr/bin/wixl"
  export LD_LIBRARY_PATH="$HOME/opt/msitools/root/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
else
  echo "wixl not found. Install msitools+wixl (or extract their .debs into ~/opt/msitools/root)." >&2
  exit 1
fi

echo "==> Publishing app (win-x64, framework-dependent)"
dotnet publish src/MeowCat/MeowCat.csproj -c Release -r win-x64 --self-contained false \
  -p:Version="$VERSION" -o artifacts/publish -v q --nologo

echo "==> Generating wixl wxs (recursive: exe+dlls+sprites+sounds+fx, shortcuts)"
python3 scripts/gen_wixl_wxs.py artifacts/publish installer/Product-wixl.wxs "$VERSION"

echo "==> Building MSI with wixl"
"$WIXL" installer/Product-wixl.wxs -o "artifacts/MeowCat-$VERSION-x64.msi"

echo "==> Verifying payload (sprite count inside MSI)"
TMP=$(mktemp -d)
msiextract -C "$TMP" "artifacts/MeowCat-$VERSION-x64.msi" >/dev/null 2>&1 || true
N=$(find "$TMP" -name '*.png' | wc -l)
echo "    PNG frames inside MSI: $N (expect >= 126)"
[ "$N" -ge 126 ] || { echo "    ERROR: sprites missing from MSI!" >&2; exit 1; }
rm -rf "$TMP"

echo "==> Done: artifacts/MeowCat-$VERSION-x64.msi"
