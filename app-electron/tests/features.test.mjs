// features.test.mjs — v3.17: the system-reaction suites were removed WITH
// the feature (user directive). The only surviving export is the dance-party
// idle scheduler.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { shouldDanceParty } from '../src/system-reactions.js';

describe('dance party', () => {
  test('fires after idle threshold', () => {
    assert.equal(shouldDanceParty(100), false);              // 100s < 600s default
    assert.equal(shouldDanceParty(700), true);               // 700s ≥ 600s default
    assert.equal(shouldDanceParty(700, { afterSec: 900 }), false);
    assert.equal(shouldDanceParty(1000, { afterSec: 900 }), true);
  });
  test('respects once-per period', () => {
    assert.equal(shouldDanceParty(700, { lastPartyAgeSec: 100 }), false);
    assert.equal(shouldDanceParty(700, { lastPartyAgeSec: 1900 }), true);
  });
});
