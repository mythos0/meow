// verify-exe.mjs — read back the PE version info of the built portable exe
// and assert the Task Manager identity is MeowCat (not Electron).
'use strict';
import { readFileSync } from 'fs';
import { NtExecutable, NtExecutableResource, Resource, Data } from 'resedit';

const file = process.argv[2];
const bin = readFileSync(file);
const exe = NtExecutable.from(bin);
const res = NtExecutableResource.from(exe);

// version info — fromEntries() filters RT_VERSION (16) itself
const viEntries = res.entries.filter(e => e.type === 16);
if (!viEntries.length) { console.error('FAIL: no RT_VERSION entry'); process.exit(1); }
const viObjs = Resource.VersionInfo.fromEntries(viEntries);   // array (one per lang)
const flat = {};
for (const vi of (Array.isArray(viObjs) ? viObjs : [viObjs])) {
  for (const lg of vi.getAvailableLanguages()) {
    for (const [k, v] of Object.entries(vi.getStringValues(lg))) flat[k] = v;
  }
}
console.log('FileDescription :', flat.FileDescription);
console.log('ProductName     :', flat.ProductName);
console.log('FileVersion     :', flat.FileVersion);
console.log('OriginalFilename:', flat.OriginalFilename);

// icon
const icons = res.entries.filter(e => e.type === 3);
const groups = res.entries.filter(e => e.type === 14);
console.log('RT_ICON entries :', icons.length, '| RT_GROUP_ICON:', groups.length);

const okName = flat.FileDescription?.startsWith('MeowCat') && flat.ProductName === 'MeowCat';
const okVer = flat.FileVersion === '3.4.0';
const okIcon = icons.length >= 5 && groups.length >= 1;
console.log(okName && okVer && okIcon ? 'PASS: exe identity is MeowCat 3.4.0 with icon' : 'FAIL: identity check');
process.exit(okName && okVer && okIcon ? 0 : 1);
