// pe-strings.mjs — dump ALL version-info strings from a Windows PE (forensics).
// usage: node scripts/pe-strings.mjs <exe> [exe2 ...]
import { readFileSync } from 'fs';
import { NtExecutable, NtExecutableResource, Resource } from 'resedit';

for (const f of process.argv.slice(2)) {
  console.log('====', f);
  try {
    const exe = NtExecutable.from(readFileSync(f));
    const res = NtExecutableResource.from(exe);
    const vi = Resource.VersionInfo.fromEntries(res.entries);
    if (!vi.length) { console.log('  (no version info resource)'); continue; }
    for (const v of vi) {
      // resedit exposes translations via `vi.translations` (array of {lang, codepage})
      const trs = v.translations || [{ lang: 1033, codepage: 1200 }];
      for (const t of trs) {
        const s = v.getStringValues(t) || {};
        console.log('  lang/codepage:', t.lang, t.codepage);
        for (const [k, val] of Object.entries(s)) console.log('   ', k, '=', JSON.stringify(val));
      }
      const fixed = v.getFixedVersionInfo?.();
      if (fixed) console.log('  fixed:', JSON.stringify(fixed));
    }
    // any icon group?
    const groups = res.entries.filter(e => e.type === 14).length;
    const icons = res.entries.filter(e => e.type === 3).length;
    console.log('  icon groups:', groups, 'icons:', icons);
  } catch (e) {
    console.log('  ERROR:', e.message);
  }
}
