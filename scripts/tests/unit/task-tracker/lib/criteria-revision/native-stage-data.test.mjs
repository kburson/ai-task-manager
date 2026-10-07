// @story #1855
// Data-only native factors. These tests confer no stage execution authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fields from '../../../../../task-tracker/issue-field-db.mjs';

const input = extra => ({ fieldKey: 'startTime', fieldType: 'text', fieldId: 'F_started', mode: 'set',
  resolved: '2026-10-06 10:00 CDT', values: { startTime: null }, ...extra });

test('native event-field data factor preserves set-once and explicit field write semantics', () => {
  const original = input({ mode: 'set_once', values: { startTime: 'original' } });
  const untouched = structuredClone(original);
  assert.deepEqual(fields.deriveEventFieldBinding(original), { changed: false, values: { startTime: 'original' }, fieldWrite: null });
  assert.deepEqual(original, untouched);
  assert.deepEqual(fields.deriveEventFieldBinding(input()), { changed: true, values: { startTime: '2026-10-06 10:00 CDT' },
    fieldWrite: { fieldId: 'F_started', value: { text: '2026-10-06 10:00 CDT' } } });
});

test('native event-field data factor retains native date, number coercion and missing-ID body-only behavior', () => {
  assert.deepEqual(fields.deriveEventFieldBinding(input({ fieldType: 'date', resolved: '2026-10-06' })).fieldWrite,
    { fieldId: 'F_started', value: { date: '2026-10-06' } });
  assert.deepEqual(fields.deriveEventFieldBinding(input({ fieldType: 'number', resolved: '12' })).fieldWrite,
    { fieldId: 'F_started', value: { number: 12 } });
  assert.equal(fields.deriveEventFieldBinding(input({ fieldId: '' })).fieldWrite, null);
  assert.equal(fields.deriveEventFieldBinding(input({ mode: 'set_once', values: { startTime: 0 } })).changed, true,
    'ordinary native truthiness of set_once is preserved');
});

test('native event-field data factor retains persisted DB precedence over changed seed values', () => {
  const defs = [{ key: 'startTime', name: 'Started', type: 'text', aliases: [] }];
  const body = '## Scope\nNative field semantics\n\n' + fields.formatIssueFieldDb({ startTime: 'persisted' }) + '\n';
  const initial = fields.ensureIssueFieldDb(body, defs);
  const derived = fields.deriveEventFieldBinding(input({ values: initial.values }));
  assert.equal(derived.values.startTime, '2026-10-06 10:00 CDT');
  const after = fields.ensureIssueFieldDb(body, defs, derived.values);
  assert.equal(fields.parseIssueFieldDb(after.body).values.startTime, 'persisted',
    'factoring does not fix or override the existing seed precedence');
});

test('native event-field data input is closed and never executes supplied helpers', () => {
  let calls = 0;
  assert.throws(() => fields.deriveEventFieldBinding({ ...input(), clock: () => { calls++; } }), /event-field-input/);
  assert.throws(() => fields.deriveEventFieldBinding({ ...input(), write: () => { calls++; } }), /event-field-input/);
  assert.equal(calls, 0);
});


import * as timing from '../../../../../task-tracker/gh-timing-comment.mjs';
// @story #1855
test('native recorded last-known-state serializer shares exact current grammar without reading a clock', () => {
  const ts = '2026-01-01T01:02:03.000Z';
  const source = '<!-- aitm-last-known-state: plan -->\n<!-- aitm-last-known-state-ts: 2025-01-01T00:00:00Z -->\n## Scope\nkept\n';
  const body = timing.writeLastKnownStateAt({ body: source, state: 'test', ts });
  assert.deepEqual(timing.readLastKnownState(body), { state: 'test', ts });
  assert.equal(body.match(/aitm-last-known-state/g).length, 1);
  assert.match(body, /## Scope\nkept\n$/);
  assert.equal(timing.writeLastKnownStateAt({ body, state: 'test', ts }), body);
  const live = timing.writeLastKnownState(source, 'test');
  const liveTs = timing.readLastKnownState(live).ts;
  assert.equal(live, timing.writeLastKnownStateAt({ body: source, state: 'test', ts: liveTs }));
  assert.throws(() => timing.writeLastKnownStateAt({ body: source, state: 'test', ts, ready: true }), /last-known-state-input/);
  assert.throws(() => timing.writeLastKnownStateAt({ body: source, state: 'test', ts: 'invalid' }), /last-known-state-input/);
});

import * as codeComplete from '../../../../../task-tracker/lib/code-complete-gate.mjs';

test('native CodeComplete declaration data preserves checked, missing and deferred AC predicates', () => {
  const declaration = 'Working invariant <!-- aitm-verified cmd="`node --test scripts/tests/invariant.test.mjs`" -->';
  const input = { body: '## Acceptance Criteria', acceptanceCriteria: [{ declaration, checked: true }] };
  assert.deepEqual(codeComplete.deriveCodeCompleteAcBlockers(input), []);
  assert.deepEqual(codeComplete.deriveCodeCompleteAcBlockers({ ...input, acceptanceCriteria: [{ declaration: 'Full verification <!-- aitm-verified cmd="`npm run test:all`" -->', checked: false }] }), []);
  assert.match(codeComplete.deriveCodeCompleteAcBlockers({ ...input, acceptanceCriteria: [{ declaration, checked: false }] })[0], /ac-unticked/);
  assert.match(codeComplete.deriveCodeCompleteAcBlockers({ ...input, acceptanceCriteria: [{ declaration: 'Missing declaration', checked: true }] })[0], /ac-unverified/);
  assert.match(codeComplete.deriveCodeCompleteAcBlockers({ ...input, acceptanceCriteria: [] })[0], /no-ac-section/);
  assert.deepEqual(codeComplete.deriveCodeCompleteAcBlockers({ ...input, acceptanceCriteria: [{ declaration: 'Honest manual observation <!-- aitm-non-demonstrable -->', checked: true }] }), []);
  assert.throws(() => codeComplete.deriveCodeCompleteAcBlockers({ ...input, ready: true }), /code-complete-data/);
  assert.throws(() => codeComplete.deriveCodeCompleteAcBlockers({ ...input, acceptanceCriteria: [{ declaration, checked: true, success: true }] }), /code-complete-data/);
});

test('native CodeComplete touch data keeps tracked intersection and deterministic order', () => {
  assert.deepEqual(codeComplete.deriveCodeCompleteTouchBlockers({ touchedFiles: ['src/a.mjs', 'src/b.mjs', 'src/a.mjs'], dirtyFiles: ['unrelated.mjs', 'src/b.mjs'] }), ['code-complete-dirty-files: commit some changes or stash them: src/b.mjs']);
  assert.deepEqual(codeComplete.deriveCodeCompleteTouchBlockers({ touchedFiles: ['src/a.mjs'], dirtyFiles: ['unrelated.mjs'] }), []);
  assert.throws(() => codeComplete.deriveCodeCompleteTouchBlockers({ touchedFiles: [], dirtyFiles: [], read: () => [] }), /code-complete-data/);
});

test('native commit trail membership data shares prefix comparison without accepting decisions', () => {
  assert.equal(codeComplete.commitTrailIncludesSha({ sha: 'abcdef1234567890', trailShas: ['abcdef1'] }), true);
  assert.equal(codeComplete.commitTrailIncludesSha({ sha: 'abcdef1', trailShas: ['abcdef1234567890'] }), true);
  assert.equal(codeComplete.commitTrailIncludesSha({ sha: '1234567890abcdef', trailShas: ['abcdef1'] }), false);
  assert.throws(() => codeComplete.commitTrailIncludesSha({ sha: 'abcdef1', trailShas: [], ok: true }), /code-complete-data/);
});

import * as reachability from '../../../../../task-tracker/lib/evidence-branch-reachability.mjs';

test('native recorded ancestry qualification derives malformed and unreachable reasons from closed original data', () => {
  const input = { item: { kind: 'evidence marker', sha: 'abcdef1234567890', branch: 'task/124', worktreePath: process.cwd(), boundIssue: 124 }, issueNumber: 124, boundBranch: 'task/124', ancestryExitCode: 0 };
  assert.deepEqual(reachability.qualifyEvidenceBranchItem(input), []);
  assert.match(reachability.qualifyEvidenceBranchItem({ ...input, ancestryExitCode: 1 })[0], /sha `abcdef1234567890` is not reachable/);
  assert.match(reachability.qualifyEvidenceBranchItem({ ...input, item: { ...input.item, worktreePath: undefined }, ancestryExitCode: null })[0], /provenance-incomplete/);
  assert.throws(() => reachability.qualifyEvidenceBranchItem({ ...input, ancestryExitCode: 2 }), /evidence-branch-data/);
  assert.throws(() => reachability.qualifyEvidenceBranchItem({ ...input, ready: true }), /evidence-branch-data/);
  assert.throws(() => reachability.qualifyEvidenceBranchItem({ ...input, item: { ...input.item, complete: true } }), /evidence-branch-data/);
});

test('native event binding keeps permissive current config semantics separate from closed recorded data', () => {
  const odd = input({ mode: false, fieldType: 7, fieldId: 13, resolved: '42' });
  assert.deepEqual(fields.deriveNativeEventFieldBinding(odd), { changed: true, values: { startTime: '42' }, fieldWrite: { fieldId: 13, value: { number: 42 } } });
  assert.throws(() => fields.deriveEventFieldBinding(odd), /event-field-input/);
  assert.deepEqual(fields.deriveNativeEventFieldBinding(input({ mode: null, fieldId: null })), { changed: true, values: { startTime: '2026-10-06 10:00 CDT' }, fieldWrite: null });
});

import * as bootstrap from '../../../../../task-tracker/lib/state-bootstrap.mjs';
import { GUARDS } from '../../../../../task-tracker/lib/guard-registry.mjs';
test('native catalog data refuses replaced original functions, incomplete and reordered membership', () => {
  const input = { fromState: 'develop', toState: 'test' };
  const original = bootstrap.readNativeGuardCatalog(input);
  assert.deepEqual(original.map(x => x.guardId), ['blocked-by-not-done', 'develop-exit-code-complete', 'develop-exit-receipt', 'develop-exit-commit-trail-head', 'develop-exit-epic-children-done', 'child-cannot-lead-epic-exit', 'criteria-revision-admission', 'contiguity-entry', 'body-gates-entry-test']);
  assert.ok(Object.isFrozen(original) && original.every(Object.isFrozen));
  assert.equal(bootstrap.readNativeGuardCatalog({ ...input, ready: true }), null);
  assert.equal(bootstrap.readNativeGuardCatalog({ fromState: 'unknown', toState: 'test' }), null);
  const guards = [...GUARDS.develop.exit];
  try {
    GUARDS.develop.exit.shift();
    assert.equal(bootstrap.readNativeGuardCatalog(input), null);
    GUARDS.develop.exit.splice(0, GUARDS.develop.exit.length, ...[...guards].reverse());
    assert.equal(bootstrap.readNativeGuardCatalog(input), null);
  } finally { GUARDS.develop.exit.splice(0, GUARDS.develop.exit.length, ...guards); }
  const guard = GUARDS.develop.exit[1], run = guard.run;
  try {
    guard.run = () => ({ ok: true });
    assert.equal(bootstrap.readNativeGuardCatalog(input), null);
  } finally { guard.run = run; }
  assert.deepEqual(bootstrap.readNativeGuardCatalog(input), original);
});

test('recorded phase row data shares native rendering with zero accounting and exact original offset', () => {
  const input = { ts: '2026-01-02T03:04:05.000Z', offsetMin: -300, phase: 'develop:complete', transitionId: 'move:12345678-1234-4234-8234-123456789abc' };
  assert.equal(timing.buildRecordedPhaseRow(input), '| 2026-01-01 22:04:05 -05:00 | develop:completed |  |  |  | 0 | development complete | 0 | <!-- aitm-transition move="move:12345678-1234-4234-8234-123456789abc" --> <!-- row-sec: a=0 i=0 -->');
  assert.match(timing.buildRecordedPhaseRow({ ...input, offsetMin: 330, phase: 'test:enter' }), /^\| 2026-01-02 08:34:05 \+05:30 \| test:started \|  \|  \|  \| 0 \| start testing \| 0 \|/);
  for (const delta of [{ activeSec: 7 }, { phase: 'review:complete' }, { actorKey: 'fake' }, { offsetMin: null }, { transitionId: 'bad"marker' }]) {
    assert.throws(() => timing.buildRecordedPhaseRow({ ...input, ...delta }), /recorded-phase-data/);
  }
  assert.throws(() => timing.buildRow({ ts: input.ts, phase: { state: 'develop', phase: 'complete' }, activeSec: 0, idleSec: 0, deltaWords: 0, wordMarker: 0, fullWordMarker: 0 }), /retroactive timing entries/);
  const ts = new Date().toISOString();
  const current = timing.buildRow({ ts, phase: { state: 'test', phase: 'enter' }, activeSec: 0, idleSec: 0, deltaWords: 0, wordMarker: 0, fullWordMarker: 0 });
  const recorded = timing.buildRecordedPhaseRow({ ...input, ts, offsetMin: -new Date(ts).getTimezoneOffset(), phase: 'test:enter' });
  assert.equal(recorded.replace(' <!-- aitm-transition move="move:12345678-1234-4234-8234-123456789abc" -->', ''), current);
});


test('recorded actor row validates exact original native bytes without returning a row or bypassing current time', async () => {
  const { timingActorKey } = await import('../../../../../task-tracker/lib/timing-actor.mjs');
  const identity = { provider: 'codex', sid: 'recorded-stage-actor' };
  const ts = new Date().toISOString(), endMs = Date.parse(ts);
  const engagement = { startMs: endMs - 10000, endMs, activeEstimateSec: 3,
    wordStart: 10, wordEnd: 14, fullWordStart: 20, fullWordEnd: 27 };
  const args = { ts, actorKey: timingActorKey(identity), engagement,
    activeSec: 3, idleSec: 7, deltaWords: 4, wordMarker: 14, fullWordMarker: 27,
    event: 'update', description: 'lifecycle boundary' };
  const row = timing.buildRow(args);
  const input = { row, identity, ts, offsetMin: -new Date(ts).getTimezoneOffset(), engagement,
    activeSec: 3, idleSec: 7, deltaWords: 4, wordMarker: 14, fullWordMarker: 27 };
  assert.equal(timing.assertRecordedStageActorRow(input), undefined);
  assert.match(row, /update \| 0h 00m 03s \| 0h 00m 07s \| 4 \| 14 \| lifecycle boundary \| 27 \|/);
  for (const delta of [{ row: row + ' ' }, { identity: { ...identity, sid: 'foreign' } },
    { activeSec: 4 }, { idleSec: 8 }, { deltaWords: 5 }, { wordMarker: 15 },
    { fullWordMarker: 28 }, { offsetMin: 841 }, { event: 'start' },
    { engagement: { ...engagement, ready: true } }, { identity: { ...identity, ready: true } }])
    assert.throws(() => timing.assertRecordedStageActorRow({ ...input, ...delta }), /recorded-stage-actor-row/);
  const oldTs = '2026-01-02T03:04:05.000Z', oldEnd = Date.parse(oldTs);
  const oldEngagement = { ...engagement, startMs: oldEnd - 10000, endMs: oldEnd };
  const oldRow = '| 2026-01-02 03:04:05 +00:00 | update | 0h 00m 03s | 0h 00m 07s | 4 | 14 | lifecycle boundary | 27 |' +
    ' <!-- aitm-actor:v1 key=' + timingActorKey(identity).slice(3) + ' -->' +
    ' <!-- aitm-engagement:v1 start=1767323035000 end=1767323045000 active=3 wstart=10 wend=14 fstart=20 fend=27 -->' +
    ' <!-- row-sec: a=3 i=7 -->';
  assert.equal(timing.assertRecordedStageActorRow({ ...input, row: oldRow, ts: oldTs, offsetMin: 0, engagement: oldEngagement }), undefined);
  assert.throws(() => timing.buildRow({ ...args, ts: oldTs, engagement: oldEngagement }), /retroactive timing entries/);
});
