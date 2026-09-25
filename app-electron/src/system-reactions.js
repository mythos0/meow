// system-reactions.js — v3.17
//
// This module used to hold ALL of the "the cat watches your machine"
// decision logic (CPU/RAM spikes, battery crisis, time-of-day bias, typing
// meter, new-window diffs, editor/game detection, SMTC music reactions,
// build-status parsing). The whole Reactions feature set was REMOVED at the
// user's request — the cat reacts to YOU now, not to your machine.
//
// The one survivor: the dance-party idle scheduler (screensaver mode), which
// is a Behavior toggle, not a reaction.

'use strict';

export function shouldDanceParty(idleSec, opts = {}) {
  const after = opts.afterSec ?? 600;           // 10 idle minutes
  const oncePer = opts.oncePerSec ?? 1800;      // don't loop it all night
  return Number.isFinite(idleSec) && idleSec >= after &&
         (opts.lastPartyAgeSec == null || opts.lastPartyAgeSec >= oncePer);
}
