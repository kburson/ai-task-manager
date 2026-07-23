#!/usr/bin/env node
// @story #359
// Tests for body-gates-entry guards (#359, parent epic #269).
//
// Verifies the three migrated guards behave as the inline composite did:
//   - test guard runs DEFAULT_GATES minus verification-commands;
//   - review guard runs full DEFAULT_GATES;
//   - done guard runs full DEFAULT_GATES + unchecked-checkbox + lifecycle;
//   - all three fail-open when ctx.body is missing or toState mismatches.
//
// Pure-function tests — no network, no fixture files. Bodies are minimal
// inline strings tuned to trip or pass specific rules.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  bodyGatesEntryGuardTest,
  bodyGatesEntryGuardReview,
  bodyGatesEntryGuardDone,
  TEST_GUARD_ID,
  REVIEW_GUARD_ID,
  DONE_GUARD_ID,
  BODY_GATES_ENTRY_GUARD_IDS,
} from '../../../lib/body-gates-entry-guard.mjs';

// Body with no triggers ticked and no unchecked checkboxes — innocuous.
const QUIET_BODY = '## Description\n\nNothing to gate here.\n';

// Body that trips `dependency-map`: ticks the Dependency Map evidence box
// without including a `## Dependency Map` section. Used by review/done.
const DEP_MAP_TICKED_NO_SECTION = [
  '## Description',
  'x',
  '',
  '- [x] **Dependency Map** posted',
  '',
].join('\n');

// Body that trips `verification-commands`: contains a `## Verification
// Commands` section with at least one unchecked entry. Used to confirm the
// test guard filters that rule out while review enforces it.
const VERIFY_UNCHECKED = [
  '## Description',
  'x',
  '',
  '## Verification Commands',
  '- [ ] `npm test`',
  '',
].join('\n');

// Body with an unchecked checkbox in a non-lifecycle, non-close-owned
// section — trips done-only `unchecked-checkbox` rule. The leading non-
// lifecycle list label keeps it out of close-gate's allow-list.
const HAS_UNCHECKED = '## Notes\n\n- [ ] arbitrary unchecked item\n';

describe('bodyGatesEntryGuardTest', () => {
  it('exports stable id', () => {
    assert.equal(bodyGatesEntryGuardTest.id, TEST_GUARD_ID);
    assert.equal(TEST_GUARD_ID, 'body-gates-entry-test');
  });

  it('fails open when toState does not match', async () => {
    const r = await bodyGatesEntryGuardTest.run({
      toState: 'review',
      body: DEP_MAP_TICKED_NO_SECTION,
    });
    assert.deepEqual(r, { ok: true });
  });

  it('fails open when body is missing or empty', async () => {
    assert.deepEqual(await bodyGatesEntryGuardTest.run({ toState: 'test' }), { ok: true });
    assert.deepEqual(await bodyGatesEntryGuardTest.run({ toState: 'test', body: '' }), {
      ok: true,
    });
  });

  it('passes on quiet body and on body that only trips verification-commands', async () => {
    assert.equal(
      (await bodyGatesEntryGuardTest.run({ toState: 'test', body: QUIET_BODY })).ok,
      true
    );
    // verification-commands is filtered out for test entry.
    assert.equal(
      (await bodyGatesEntryGuardTest.run({ toState: 'test', body: VERIFY_UNCHECKED })).ok,
      true
    );
  });

  it('refuses with blockers array when body trips dependency-map', async () => {
    const r = await bodyGatesEntryGuardTest.run({
      toState: 'test',
      body: DEP_MAP_TICKED_NO_SECTION,
    });
    assert.equal(r.ok, false);
    assert.ok(Array.isArray(r.blockers));
    assert.ok(r.blockers.length >= 1);
    assert.ok(/dependency-map/.test(r.reason));
  });
});

describe('bodyGatesEntryGuardReview', () => {
  it('exports stable id', () => {
    assert.equal(bodyGatesEntryGuardReview.id, REVIEW_GUARD_ID);
    assert.equal(REVIEW_GUARD_ID, 'body-gates-entry-review');
  });

  it('fails open on toState mismatch and missing body', async () => {
    assert.deepEqual(
      await bodyGatesEntryGuardReview.run({ toState: 'test', body: DEP_MAP_TICKED_NO_SECTION }),
      { ok: true }
    );
    assert.deepEqual(await bodyGatesEntryGuardReview.run({ toState: 'review' }), { ok: true });
  });

  it('passes on quiet body', async () => {
    const r = await bodyGatesEntryGuardReview.run({ toState: 'review', body: QUIET_BODY });
    assert.equal(r.ok, true);
  });

  it('refuses when verification-commands are unchecked (review enforces full gates)', async () => {
    const r = await bodyGatesEntryGuardReview.run({
      toState: 'review',
      body: VERIFY_UNCHECKED,
    });
    assert.equal(r.ok, false);
    assert.ok(Array.isArray(r.blockers));
    assert.ok(/verification-commands/.test(r.reason));
  });
});

describe('bodyGatesEntryGuardDone', () => {
  it('exports stable id', () => {
    assert.equal(bodyGatesEntryGuardDone.id, DONE_GUARD_ID);
    assert.equal(DONE_GUARD_ID, 'body-gates-entry-done');
  });

  it('fails open on toState mismatch and missing body', async () => {
    assert.deepEqual(
      await bodyGatesEntryGuardDone.run({ toState: 'review', body: HAS_UNCHECKED }),
      { ok: true }
    );
    assert.deepEqual(await bodyGatesEntryGuardDone.run({ toState: 'done' }), { ok: true });
  });

  it('refuses when unchecked checkboxes remain in body', async () => {
    const r = await bodyGatesEntryGuardDone.run({
      toState: 'done',
      body: HAS_UNCHECKED,
    });
    assert.equal(r.ok, false);
    assert.ok(Array.isArray(r.blockers));
    assert.ok(r.blockers.some((b) => /unchecked checkbox/.test(b)));
  });

  it('surfaces lifecycle warn payload when lifecycleCheckboxesRequired=false', async () => {
    const r = await bodyGatesEntryGuardDone.run({
      toState: 'done',
      body: QUIET_BODY,
      cfg: { lifecycleCheckboxesRequired: false },
    });
    // QUIET_BODY trips nothing else, so the warn path returns ok-with-warn.
    assert.equal(r.ok, true);
    assert.ok(r.warn);
    assert.equal(r.warn.kind, 'lifecycle');
    assert.ok(Array.isArray(r.warn.labels));
    assert.ok(r.warn.labels.length > 0);
  });

  it('refuses with lifecycle-incomplete when lifecycleCheckboxesRequired=true (default)', async () => {
    const r = await bodyGatesEntryGuardDone.run({
      toState: 'done',
      body: QUIET_BODY,
    });
    assert.equal(r.ok, false);
    assert.ok(Array.isArray(r.blockers));
    assert.ok(r.blockers.some((b) => /lifecycle/i.test(b)));
  });
});

describe('BODY_GATES_ENTRY_GUARD_IDS', () => {
  it('exposes the three ids in stable order', () => {
    assert.deepEqual(
      [...BODY_GATES_ENTRY_GUARD_IDS],
      ['body-gates-entry-test', 'body-gates-entry-review', 'body-gates-entry-done']
    );
  });
});
