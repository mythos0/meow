
---
Task ID: 6
Agent: Super Z (main)
Task: Fix "invisible cat" bug — user screenshot showed empty store cards/live preview; make cat render everywhere; drop frame-interpolation & vector-art work per user; rebuild + test + release v2.0.1

Work Log:
- Diagnosed root cause: MSI v2.0.0 shipped ZERO sprite PNGs (installer Files.wxi/Dirs.wxi only packaged exe+dlls+ico+sounds); LoadFrame() returned null → only contact shadow rendered
- Re-sliced calico from magenta screens: made keyer chroma-agnostic (green OR magenta axis), scaled spill threshold with screen strength, disabled sure_fg dam on strong screens, added bg-island dropping; generated new calico walk sheet (candidate a) + deterministic frame repair (bite-fill / pink-drop)
- Rewrote scripts/gen_wix_files.py (dynamic Dirs.wxi + Files.wxi, recursive) — still unusable: WiX v4/v5 dotnet tool errors WIX0389 on EVERY Directory/@Name on Linux (GetCanonicalRelativePath does Path.GetFullPath("C:\"+name), broken on Unix)
- Confirmed even pristine HEAD installer files fail with wix 4.0.5/5.0.2 → tool is broken on Linux, not content
- Restored msitools pipeline without root: apt-get download msitools/wixl/libmsi/libgcab/libgsf debs → dpkg -x into ~/opt/msitools/root (wixl 0.106 works with LD_LIBRARY_PATH)
- Rewrote scripts/gen_wixl_wxs.py: nested directory tree under INSTALLFOLDER (Assets/sprites/<breed>/<clip>/), one component per file, uuid5 stable GUIDs, fixed double-emit + missing Assets-level files bugs; start-menu + desktop shortcuts
- Built MeowCat-2.0.1-x64.msi (40.2MB) and VERIFIED payload with msiextract: 126 PNG sprites at exact SpriteCatalog paths + 17 wavs + fx decals + exe/dlls
- Rewrote scripts/build_msi.sh to the wixl pipeline with built-in payload verification (fails if PNG count < 126)
- Visual test: scripts/render_proof.py replicates SpriteRenderer.Render geometry → download/meowcat_v2.0.1_render_proof.png shows all 6 breeds + desktop cat walking between folders
- dotnet build: 0 errors; dotnet test: 56/56 passed
- Version bumped 2.0.0 → 2.0.1 (csproj)

Stage Summary:
- ROOT CAUSE FIXED: installer now packages every asset recursively; MSI verified to contain all frames
- Desktop shortcut added to Product.wxs + wixl generator (default on install, per-machine Public Desktop)
- Deliverables: artifacts/MeowCat-2.0.1-x64.msi; proof image in /home/z/my-project/download/
- Frame interpolation (more-frames) task CANCELLED per user; vector-art path abandoned per user
