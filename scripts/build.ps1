# Build MeowCat MSI locally on Windows.
# Requirements: .NET 8 SDK, Python 3, WiX v5 (auto-installed).
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\build.ps1 [-Version 1.0.0]
param([string]$Version = "1.0.0")

$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent
Set-Location $repo

Write-Host "==> Publishing app (win-x64, framework-dependent)"
dotnet publish src/MeowCat/MeowCat.csproj -c Release -r win-x64 --self-contained false `
  -p:Version=$Version -o artifacts/publish
if ($LASTEXITCODE -ne 0) { throw "publish failed" }

Write-Host "==> Running unit tests"
dotnet test MeowCat.sln -c Release
if ($LASTEXITCODE -ne 0) { throw "tests failed" }

Write-Host "==> Harvesting files"
python scripts/gen_wix_files.py artifacts/publish installer/Files.wxi
if ($LASTEXITCODE -ne 0) { throw "harvest failed" }

Write-Host "==> Ensuring WiX v5"
if (-not (Get-Command wix -ErrorAction SilentlyContinue)) {
  dotnet tool install --global wix --version 5.0.2
}
$env:PATH = "$env:USERPROFILE\.dotnet\tools;$env:PATH"

Write-Host "==> Building MSI"
$pub = Join-Path $repo "artifacts\publish"
wix build installer/Product.wxs -d "PublishDir=$pub" -d "Version=$Version" -arch x64 `
  -o "artifacts\MeowCat-$Version-x64.msi"
if ($LASTEXITCODE -ne 0) { throw "wix build failed" }

Write-Host ""
Write-Host "DONE: artifacts\MeowCat-$Version-x64.msi"
Write-Host "Install:   msiexec /i artifacts\MeowCat-$Version-x64.msi"
Write-Host "Upgrade:   msiexec /i artifacts\MeowCat-$Version-x64.msi  (over old version)"
Write-Host "Uninstall: Settings > Apps > MeowCat  |  msiexec /x artifacts\MeowCat-$Version-x64.msi"
