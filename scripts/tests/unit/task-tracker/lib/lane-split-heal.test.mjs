#!/usr/bin/env node
// @story #934
// AC5 — `migrateTestsLaneSplit` surgically converts an in-flight body from the
// single-`test:all` tests verifier to the two-lane split, keeping the VC mirror
// by-id-safe (every live entry stays id-stamped so citation resolution does not
// collapse to ordinal). Three shapes are exercised: id-stamped VC entry (#934),
// id-less legacy VC entry, and no VC test:all entry at all (#933). Idempotent.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { migrateTestsLaneSplit } from '../../../../task-tracker/lib/tests-lane-split.mjs';
import { parseVerificationCommands } from '../../../../task-tracker/lib/verification-commands.mjs';

const DOD_LEGACY =
  '- [ ] All automated tests pass <!-- aitm-verified cmd="`npm run test:all`" --> <!-- dod:functional:tests --> <!-- dod:kinds exclude="spike,research" -->';
const DOD_TWO_LANE_RE = /cmd="`npm test` `npm run test:slow`"/;

function body({ dod, vcLines }) {
  return [
    '## Definition of Done',
    '',
    '### Functional (verified at Test)',
    '',
    dod,
    '',
    '## Verification Commands',
    '',
    ...vcLines,
    '',
  ].join('\n');
}

test('id-stamped test:all VC entry → tombstoned, both lanes appended with fresh ids', () => {
  const src = body({
    dod: DOD_LEGACY,
    vcLines: ['- [ ] `npm run test:all` <!-- id=1 -->', '- [ ] `npm run lint` <!-- id=2 -->'],
  });
  const { body: out, changed } = migrateTestsLaneSplit(src);
  assert.ok(changed);

  // DoD line is now two-lane, dod:kinds preserved.
  const testsLine = out.split('\n').find((l) => /dod:functional:tests/.test(l));
  assert.match(testsLine, DOD_TWO_LANE_RE);
  assert.match(testsLine, /dod:kinds exclude="spike,research"/);

  const items = parseVerificationCommands(out);
  const commands = items.map((it) => it.command);
  // Old test:all entry is gone from the live list; both lanes are present.
  assert.ok(!commands.includes('npm run test:all'), 'test:all retired from live VC');
  assert.ok(commands.includes('npm test'));
  assert.ok(commands.includes('npm run test:slow'));
  assert.ok(commands.includes('npm run lint'));
  // By-id safety: every live entry still carries an integer id.
  assert.ok(
    items.every((it) => Number.isInteger(it.id)),
    'all live VC entries stay id-stamped'
  );
  // Fresh lane ids are above the retired id=1 (monotonic, never reissued).
  const laneIds = items.filter((it) => /test:slow$|^npm test$/.test(it.command)).map((it) => it.id);
  assert.ok(
    laneIds.every((id) => id > 2),
    'lane ids are freshly minted above the high-water mark'
  );
});

test('id-less legacy test:all VC entry → rewritten in place + slow lane appended', () => {
  const src = body({
    dod: DOD_LEGACY,
    vcLines: ['- [ ] `npm run test:all`', '- [ ] `npm run lint`'],
  });
  const { body: out, changed } = migrateTestsLaneSplit(src);
  assert.ok(changed);
  const commands = parseVerificationCommands(out).map((it) => it.command);
  assert.ok(!commands.includes('npm run test:all'));
  assert.ok(commands.includes('npm test'));
  assert.ok(commands.includes('npm run test:slow'));
});

test('no test:all VC entry (#933 shape) → only the DoD line migrates', () => {
  const src = body({
    dod: DOD_LEGACY,
    vcLines: ['- [ ] `node --test scripts/foo.test.mjs` <!-- id=1 -->'],
  });
  const before = parseVerificationCommands(src);
  const { body: out, changed } = migrateTestsLaneSplit(src);
  assert.ok(changed, 'the DoD line still migrates');
  assert.match(
    out.split('\n').find((l) => /dod:functional:tests/.test(l)),
    DOD_TWO_LANE_RE
  );
  // VC mirror is untouched — dod-stamp's own reconcile will seed the lanes.
  assert.deepEqual(parseVerificationCommands(out), before);
});

test('migration is idempotent — a second pass reports no change', () => {
  const src = body({
    dod: DOD_LEGACY,
    vcLines: ['- [ ] `npm run test:all` <!-- id=1 -->'],
  });
  const once = migrateTestsLaneSplit(src);
  assert.ok(once.changed);
  const twice = migrateTestsLaneSplit(once.body);
  assert.equal(twice.changed, false);
  assert.equal(twice.body, once.body);
});

test('an already-stamped tests line is never rewritten', () => {
  const stamped =
    '- [x] All automated tests pass <!-- aitm-verified cmd="`npm run test:all`" ts=2026-07-22 exit=0 --> <!-- dod:functional:tests -->';
  const src = body({ dod: stamped, vcLines: ['- [ ] `npm run lint` <!-- id=1 -->'] });
  const { changed } = migrateTestsLaneSplit(src);
  assert.equal(changed, false);
});
