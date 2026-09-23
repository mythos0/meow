// shared fine-grained CPU tick counter for probes (100Hz jiffies from /proc)
'use strict';
const fs = require('fs');
function treeTicks(parentPid) {
  // walk /proc, match processes whose cmdline references our electron binary or probe
  let total = 0;
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    let stat;
    try { stat = fs.readFileSync(`/proc/${d}/stat`, 'utf8'); } catch { continue; }
    let cmd = '';
    try { cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8'); } catch { continue; }
    if (!/electron/.test(cmd)) continue;
    const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const utime = +rest[11], stime = +rest[12];
    total += utime + stime;
  }
  return total;
}
module.exports = { treeTicks };
