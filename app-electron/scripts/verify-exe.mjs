// verify-exe.mjs — read back the PE version info of a built exe and assert
// the Task Manager identity is MeowCat (never Electron).
// v3.5: also asserts the BINARY VS_FIXEDFILEINFO version (Task Manager's
// "Product version" column) — the string column alone can hide 0.0.0.0.
'use strict';
import { readFileSync } from 'fs';
import { NtExecutable, NtExecutableResource, Resource } from 'resedit';

const file = process.argv[2];
const VERSION = process.argv[3] || '3.5.0';
const bin = readFileSync(file);
const exe = NtExecutable.from(bin);
const res = NtExecutableResource.from(exe);

// version info — fromEntries() filters RT_VERSION (16) itself
const viEntries = res.entries.filter(e => e.type === 16);
if (!viEntries.length) { console.error('FAIL: no RT_VERSION entry'); process.exit(1); }
const viObjs = Resource.VersionInfo.fromEntries(viEntries);   // array (one per lang)
const flat = {};
let fixed = null;
for (const vi of (Array.isArray(viObjs) ? viObjs : [viObjs])) {
  for (const lg of vi.getAvailableLanguages()) {
    for (const [k, v] of Object.entries(vi.getStringValues(lg))) flat[k] = v;
  }
  if (!fixed) {
    const fi = vi.fixedInfo;
    fixed = [fi.fileVersionMS >>> 16, fi.fileVersionMS & 0xffff, fi.productVersionMS >>> 16, fi.productVersionMS & 0xffff].join('.');
  }
}
console.log('FileDescription :', flat.FileDescription);
console.log('ProductName     :', flat.ProductName);
console.log('FileVersion     :', flat.FileVersion);
console.log('OriginalFilename:', flat.OriginalFilename);
console.log('Binary fixed ver:', fixed, '(file/product MS words)');

// icon
const icons = res.entries.filter(e => e.type === 3);
const groups = res.entries.filter(e => e.type === 14);
console.log('RT_ICON entries :', icons.length, '| RT_GROUP_ICON:', groups.length);

let fail = 0;
const check = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ` (${extra})` : ''));
  if (!cond) fail = 1;
};
check('FileDescription starts with MeowCat', !!flat.FileDescription?.startsWith('MeowCat'), JSON.stringify(flat.FileDescription || ''));
check('ProductName is MeowCat', flat.ProductName === 'MeowCat', JSON.stringify(flat.ProductName || ''));
check('OriginalFilename is MeowCat.exe', flat.OriginalFilename === 'MeowCat.exe', JSON.stringify(flat.OriginalFilename || ''));
for (const [k, v] of Object.entries(flat)) {
  check(`string ${k} free of "Electron"`, !/electron/i.test(String(v)), JSON.stringify(v));
}
check('binary file/product version major.minor = ' + VERSION, fixed.startsWith(VERSION.split('.').slice(0, 2).join('.')), fixed);
check('has app icon', icons.length >= 5 && groups.length >= 1, `icons=${icons.length} groups=${groups.length}`);
console.log(fail ? 'FAIL: identity check' : `PASS: exe identity is MeowCat ${VERSION} with icon`);
process.exit(fail);
