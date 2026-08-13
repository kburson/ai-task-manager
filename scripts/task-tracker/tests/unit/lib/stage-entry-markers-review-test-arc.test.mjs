// @story #1001
// review->test drift-reverify arc: #999 added it to state-machine.mjs's
// BACKWARD map (board-move gate), but stage-entry-markers.mjs's own
// LEGAL_TRANSITIONS table never got the matching arc, so a chain that
// legitimately contains review->test failed close's chain-integrity check
// with close-chain-illegal-arc even after the board move succeeded. This is
// the exact shape #996 hit.
import { strict as assert } from 'node:assert';
import {
  stampEntryMarker,
  verifyChainIntegrity,
  LEGAL_TRANSITIONS,
} from '../../../lib/stage-entry-markers.mjs';

// 1. LEGAL_TRANSITIONS includes the review->test arc.
assert.ok(LEGAL_TRANSITIONS.has('review->test'), 'expected legal arc: review->test');

// 2. A chain containing ...->review->test->review->... passes
// verifyChainIntegrity without a close-chain-illegal-arc-shaped failure.
let chain = '';
for (const [s, ts] of [
  ['backlog', '2026-01-01T00:00:00Z'],
  ['refine', '2026-01-02T00:00:00Z'],
  ['ready-for-plan', '2026-01-02T12:00:00Z'],
  ['plan', '2026-01-03T00:00:00Z'],
  ['develop', '2026-01-04T00:00:00Z'],
  ['test', '2026-01-05T00:00:00Z'],
  ['review', '2026-01-06T00:00:00Z'],
  ['test', '2026-01-07T00:00:00Z'],
  ['review', '2026-01-08T00:00:00Z'],
]) {
  chain = stampEntryMarker(chain, s, ts);
}
const r = verifyChainIntegrity(chain, 'review');
assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
assert.deepEqual(r.illegalArcs, []);

// 3. Reproduce the exact #996 shape directly: review, then test (visit 2).
const reviewThenTest =
  '<!-- aitm-entered-review: 2026-01-06T00:00:00Z -->\n' +
  '<!-- aitm-entered-test-2: 2026-01-07T00:00:00Z -->\n';
const r2 = verifyChainIntegrity(reviewThenTest, 'test');
assert.equal(r2.ok, true, `expected ok, got ${JSON.stringify(r2)}`);
assert.equal(r2.illegalArcs.length, 0);
