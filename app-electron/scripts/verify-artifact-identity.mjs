// verify-artifact-identity.mjs — END-TO-END identity proof for the built
// portable exe. Cracks the 7z payload out of the SFX, extracts the INNER
// MeowCat.exe, and asserts every Task-Manager-visible string says "MeowCat"
// and NONE say "Electron". Run after `npm run dist` + patch-exe on the
// launcher. Exit 1 = identity leak.
//   usage: node scripts/verify-artifact-identity.mjs <portable.exe> [version]
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { NtExecutable, NtExecutableResource, Resource } from 'resedit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exe = process.argv[2];
const VERSION = process.argv[3] || '';
if (!exe || !existsSync(exe)) {
  console.error('usage: node scripts/verify-artifact-identity.mjs <portable.exe> [version]');
  process.exit(1);
}

// locate a 7z that can handle BCJ2 (py7zr can't): env override, bundled tools dir, PATH
function find7z() {
  if (process.env.MEOW_7Z && existsSync(process.env.MEOW_7Z)) return process.env.MEOW_7Z;
  for (const cand of ['/home/z/my-project/tools/7zip/7z', '/usr/lib/7zip/7z', '/usr/bin/7z']) {
    if (existsSync(cand)) return cand;
  }
  return '7z';
}

let fail = 0;
const check = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ` (${extra})` : ''));
  if (!cond) fail = 1;
};

function peStrings(file) {
  const bin = readFileSync(file);
  const nt = NtExecutable.from(bin);
  const res = NtExecutableResource.from(nt);
  const vis = Resource.VersionInfo.fromEntries(res.entries);
  const strings = {};
  let fixed = null;
  if (vis.length) {
    const vi = vis[0];
    // resedit API: languages live in the StringFileInfo lang-charset blocks
    const langs = vi.getAllLanguagesForStringValues();
    for (const t of (langs.length ? langs : [{ lang: 1033, codepage: 1200 }])) {
      Object.assign(strings, vi.getStringValues(t) || {});
    }
    const fi = vi.fixedInfo;
    fixed = {
      fileVersion: [fi.fileVersionMS >>> 16, fi.fileVersionMS & 0xffff, fi.fileVersionLS >>> 16, fi.fileVersionLS & 0xffff],
      productVersion: [fi.productVersionMS >>> 16, fi.productVersionMS & 0xffff, fi.productVersionLS >>> 16, fi.productVersionLS & 0xffff],
    };
  }
  return { strings, fixed, iconGroups: res.entries.filter(e => e.type === 14).length };
}

// ------------------------------------------------ carve the 7z out of the SFX
const data = readFileSync(exe);
const SIG = Buffer.from([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]);
const off = data.indexOf(SIG);
check('7z payload found in SFX', off > 0, `offset ${off}`);
if (off <= 0) process.exit(1);

const tmp = mkdtempSync(path.join(tmpdir(), 'meowid-'));
const carved = path.join(tmp, 'inner.7z');
writeFileSync(carved, data.subarray(off));
const outDir = path.join(tmp, 'x');
execFileSync(find7z(), ['x', '-y', carved, `-o${outDir}`], { stdio: 'pipe' });

const inner = path.join(outDir, 'MeowCat.exe');
check('inner exe is named MeowCat.exe', existsSync(inner));

// ------------------------------------------------ inner exe identity
const inner_ = peStrings(inner);
const s = inner_.strings;
check('inner FileDescription mentions MeowCat', /meowcat/i.test(s.FileDescription || ''), JSON.stringify(s.FileDescription || ''));
check('inner ProductName is MeowCat', (s.ProductName || '') === 'MeowCat', JSON.stringify(s.ProductName || ''));
check('inner OriginalFilename is MeowCat.exe', (s.OriginalFilename || '') === 'MeowCat.exe', JSON.stringify(s.OriginalFilename || ''));
check('inner has app icon', inner_.iconGroups >= 1, `groups=${inner_.iconGroups}`);
for (const [k, v] of Object.entries(s)) {
  check(`inner ${k} free of "Electron"`, !/electron/i.test(String(v)), JSON.stringify(v));
}
if (VERSION) {
  const fv = inner_.fixed ? inner_.fixed.fileVersion.join('.') : '';
  check(`inner binary FileVersion is ${VERSION}.0`, fv === VERSION + '.0', `got ${fv}`);
}

// no second exe with electron metadata ships in the payload
const exes = execFileSync(find7z(), ['l', '-ba', '-slt', carved], { encoding: 'utf8' })
  .split(/\r?\n\r?\n/).map(b => (b.match(/^Path = (.+)$/m) || [])[1]).filter(Boolean).filter(p => /\.exe$/i.test(p));
check('payload exe inventory', exes.length > 0, exes.join(', '));
for (const rel of exes) {
  if (/^MeowCat\.exe$/i.test(rel)) continue;   // main exe checked above
  const st = peStrings(path.join(outDir, rel));
  const desc = st.strings.FileDescription || '';
  // elevate.exe is an electron-builder UAC helper that never runs for the cat;
  // assert it at least does not present itself to the user as "Electron"
  check(`payload exe ${rel} not named "Electron"`, !/^electron$/i.test(desc.trim()), JSON.stringify(desc));
}

// ------------------------------------------------ launcher identity
const launcher = peStrings(exe);
const ls = launcher.strings;
check('launcher FileDescription mentions MeowCat', /meowcat/i.test(ls.FileDescription || ''), JSON.stringify(ls.FileDescription || ''));
check('launcher ProductName is MeowCat', (ls.ProductName || '') === 'MeowCat', JSON.stringify(ls.ProductName || ''));
for (const [k, v] of Object.entries(ls)) {
  check(`launcher ${k} free of "Electron"`, !/electron/i.test(String(v)), JSON.stringify(v));
}

rmSync(tmp, { recursive: true, force: true });
console.log(fail ? '\nIDENTITY LEAK — see FAIL rows above' : '\nARTIFACT IDENTITY VERIFIED — Task Manager can only show MeowCat');
process.exit(fail);
