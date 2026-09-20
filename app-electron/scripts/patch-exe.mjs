// patch-exe.mjs — stamp MeowCat identity (name/icon/version) into the built
// portable exe with pure-JS PE resource editing (resedit) — no wine needed.
// Without this, Task Manager shows the default "electron" stub metadata.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NtExecutable, NtExecutableResource, Resource, Data } from 'resedit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const inFile = process.argv[2];
const outFile = process.argv[3] || inFile;
const VERSION = process.argv[4] || '3.1.0';
if (!inFile || !existsSync(inFile)) {
  console.error('usage: node scripts/patch-exe.mjs <in-exe> [out-exe] [version]');
  process.exit(1);
}

const bin = readFileSync(inFile);
const exe = NtExecutable.from(bin);
const res = NtExecutableResource.from(exe);
// strip the stub's old version-info / icon resources so Task Manager shows
// MeowCat only (RT_ICON=3, RT_GROUP_ICON=14, RT_VERSION=16)
const before = res.entries.length;
res.entries = res.entries.filter(e => !(e.type === 3 || e.type === 14 || e.type === 16));
console.log('stripped stale resources:', before - res.entries.length);
const entries = res.entries;
const lang = res.langs && res.langs[0] !== undefined ? res.langs[0] : 1033;

// ---- version info (what Task Manager / Explorer show)
const vi = Resource.VersionInfo.createEmpty();
vi.setStringValues(lang, {
  CompanyName: 'mythos0',
  FileDescription: 'MeowCat — your desktop cat',
  FileVersion: VERSION,
  InternalName: 'MeowCat',
  LegalCopyright: 'MIT License © 2026 mythos0',
  OriginalFilename: 'MeowCat.exe',
  ProductName: 'MeowCat',
});
vi.setFileVersion(3, 1, 0, 0, lang);
vi.setProductVersion(3, 1, 0, 0, lang);
vi.outputToResourceEntries(entries);
console.log('version info stamped:', 'MeowCat', VERSION);

// ---- icon (background-less cat face)
try {
  const icoBin = readFileSync(path.join(ROOT, 'assets', 'icon.ico'));
  const iconFile = Data.IconFile.from(icoBin);
  Resource.IconGroupEntry.replaceIconsForResource(
    entries, 1, lang, iconFile.icons.map(item => item.data));
  console.log('icon stamped:', iconFile.icons.length, 'sizes');
} catch (e) {
  console.error('icon stamp failed (continuing):', e.message);
}

res.entries = entries;
res.outputResource(exe);
writeFileSync(outFile, Buffer.from(exe.generate()));
console.log('patched →', outFile, (bin.length / 1e6).toFixed(1) + 'MB →',
  (existsSync(outFile) ? readFileSync(outFile).length / 1e6 : 0).toFixed(1) + 'MB');
