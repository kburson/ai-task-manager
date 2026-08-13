// @story #782
// #782 — fixture-based unit tests for the three-signal attribution resolver,
// the heal-backlog-attribution classifier/re-trace, and the value-report
// consume-point. Pure: no live `gh`/`git`; all signals are synthetic bodies +
// fake trunk maps. Test names embed the `--test-name-pattern` anchors bound in
// the issue's AC map.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveAttribution,
  isDead,
  classifyIssue,
  retraceSha,
  reportAttribution,
  buildTrunkTokenMap,
  buildTrunkShaSet,
  LOG_FIELD_SEP,
} from '../lib/attribution-resolver.mjs';
import { rewriteCommitsMarker } from '../heal-backlog-attribution.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const US = LOG_FIELD_SEP;

// --- fixtures ---

// trunkTokens: commit `sha-token-1` attributes issue #101 via a `[#101]` subject.
const TRUNK_LOG = [`sha-token-1${US}[#101] feat: tokenized delivery`].join('\n');
const trunkTokens = buildTrunkTokenMap(TRUNK_LOG);
// trunkShas: two commits live on trunk.
const trunkShas = buildTrunkShaSet(['aaaa1111', 'ffff0000'].join('\n'));

const commitsBody = '## body\n<!-- aitm-commits shas="aaaa1111,bbbb2222" -->\n';
const offtrunkBody = '## body\n<!-- aitm-commits shas="dead9999,cafe8888" -->\n';
const deliverableBody = '## body\n\n## AITM Progress Markers\n\n<!-- aitm-deliverable-posted -->\n';
const supersededBody =
  '## body\n<!-- aitm-superseded-by refs="#399" ts="2026-06-14T14:00:00.000Z" -->\n';
const plainBody = '## body\njust prose, no markers\n';

const maps = { trunkTokens, trunkShas };

// --- AC1: each signal independently ---

test('resolveAttribution resolves via each signal independently', () => {
  // token
  assert.deepEqual(resolveAttribution({ issueNumber: 101, body: plainBody, ...maps }), {
    attributed: true,
    shas: ['sha-token-1'],
    source: 'token',
  });
  // commits marker cross-checked against trunk (only aaaa1111 is on trunk)
  const c = resolveAttribution({ issueNumber: 202, body: commitsBody, ...maps });
  assert.equal(c.attributed, true);
  assert.equal(c.source, 'commits');
  assert.deepEqual(c.shas, ['aaaa1111']);
  // deliverable marker
  assert.deepEqual(resolveAttribution({ issueNumber: 303, body: deliverableBody, ...maps }), {
    attributed: true,
    shas: [],
    source: 'deliverable',
  });
  // no signal
  assert.deepEqual(resolveAttribution({ issueNumber: 404, body: plainBody, ...maps }), {
    attributed: false,
    shas: [],
    source: null,
  });
  // off-trunk marker SHAs do NOT attribute
  assert.equal(resolveAttribution({ issueNumber: 505, body: offtrunkBody, ...maps }).attributed, false);
});

// --- AC1: three-signal union / precedence ---

test('three-signal union picks the first matching signal in precedence order', () => {
  // token wins over a same-body commits marker
  const bothBody = `${commitsBody}\n<!-- aitm-deliverable-posted -->`;
  const r = resolveAttribution({ issueNumber: 101, body: bothBody, ...maps });
  assert.equal(r.source, 'token');
  // with no token, commits marker wins over deliverable marker
  const r2 = resolveAttribution({ issueNumber: 999, body: bothBody, ...maps });
  assert.equal(r2.source, 'commits');
  // buildTrunkShaSet + buildTrunkTokenMap parse git-log text into the maps
  assert.deepEqual([...trunkTokens.get('101')], ['sha-token-1']);
  assert.ok(trunkShas.has('aaaa1111'));
});

// --- AC2: read-only classification ---

test('read-only classification groups the closed backlog into the five lanes', () => {
  const rows = [
    { issueNumber: 101, body: plainBody, stateReason: 'COMPLETED' }, // token → HEALABLE
    { issueNumber: 202, body: commitsBody, stateReason: 'COMPLETED' }, // commits → HEALABLE
    { issueNumber: 505, body: offtrunkBody, stateReason: 'COMPLETED' }, // marker off-trunk
    { issueNumber: 303, body: deliverableBody, stateReason: 'COMPLETED' }, // DELIVERABLE
    { issueNumber: 700, body: supersededBody, stateReason: 'NOT_PLANNED' }, // DEAD
    { issueNumber: 800, body: plainBody, stateReason: 'COMPLETED' }, // UNKNOWN
  ].map((r) => classifyIssue({ ...r, ...maps }).klass);

  assert.deepEqual(rows, [
    'HEALABLE',
    'HEALABLE',
    'COMMITS_OFFTRUNK',
    'DELIVERABLE',
    'DEAD',
    'UNKNOWN',
  ]);
});

// --- AC3: dead detection ---

test('dead detection flags not-planned, duplicate, and superseded; excludes never mutates', () => {
  assert.equal(isDead({ stateReason: 'NOT_PLANNED', body: plainBody }), true);
  assert.equal(isDead({ stateReason: 'DUPLICATE', body: plainBody }), true);
  assert.equal(isDead({ stateReason: 'COMPLETED', body: supersededBody }), true);
  assert.equal(isDead({ stateReason: 'COMPLETED', body: plainBody }), false);
  // DEAD wins over an attribution signal: a superseded issue that still carries
  // trunk commits classifies DEAD, not HEALABLE.
  const c = classifyIssue({
    issueNumber: 202,
    body: `${commitsBody}\n${supersededBody}`,
    stateReason: 'NOT_PLANNED',
    ...maps,
  });
  assert.equal(c.klass, 'DEAD');
});

// --- AC4: offtrunk re-trace ---

test('offtrunk re-trace maps by patch-id, falls back to subject, and reports ambiguity', () => {
  const trunkByPatchId = new Map([['pid-1', ['trunkShaA']]]);
  const trunkBySubject = new Map([
    ['fix: the thing', ['trunkShaB']],
    ['generic subject', ['dupX', 'dupY']],
  ]);

  // patch-id match
  assert.deepEqual(retraceSha('orphan1', { oldPatchId: 'pid-1', trunkByPatchId, trunkBySubject }), {
    sha: 'orphan1',
    mapped: 'trunkShaA',
    method: 'patch-id',
    ambiguous: false,
  });
  // subject fallback (no patch-id hit)
  assert.deepEqual(
    retraceSha('orphan2', { oldSubject: 'fix: the thing', trunkByPatchId, trunkBySubject }),
    { sha: 'orphan2', mapped: 'trunkShaB', method: 'subject', ambiguous: false },
  );
  // ambiguous subject → reported, not guessed
  const amb = retraceSha('orphan3', { oldSubject: 'generic subject', trunkBySubject });
  assert.equal(amb.mapped, null);
  assert.equal(amb.ambiguous, true);
  // no match at all
  assert.deepEqual(retraceSha('orphan4', { oldSubject: 'nope', trunkBySubject }), {
    sha: 'orphan4',
    mapped: null,
    method: null,
    ambiguous: false,
  });

  // the marker-rewrite primitive swaps the SHA set in place, marker preserved
  const rewritten = rewriteCommitsMarker(offtrunkBody, ['trunkShaA', 'cafe8888']);
  assert.match(rewritten, /<!-- aitm-commits shas="trunkShaA,cafe8888" -->/);
  assert.doesNotMatch(rewritten, /dead9999/);
});

// --- AC5: apply off by default ---

test('apply off by default: the mutation is guarded and the rewrite primitive is pure', () => {
  // rewriteCommitsMarker returns a NEW body and never touches its input.
  const before = offtrunkBody;
  const after = rewriteCommitsMarker(before, ['zzzz0000']);
  assert.notEqual(after, before);
  assert.equal(offtrunkBody, before, 'input body must be unmodified (pure)');

  // Structural guarantee: the script's only mutating call (mutateIssueBody) sits
  // behind the `--apply` guard — an early return fires when apply is off.
  const src = readFileSync(path.join(__dir, '..', 'heal-backlog-attribution.mjs'), 'utf8');
  const applyGuardIdx = src.indexOf('if (!args.apply)');
  const mutateIdx = src.indexOf('await mutateIssueBody(');
  assert.ok(applyGuardIdx > -1, 'expected an `if (!args.apply)` guard');
  assert.ok(mutateIdx > -1, 'expected a mutateIssueBody call');
  assert.ok(applyGuardIdx < mutateIdx, 'the apply guard must precede the mutation');
});

// --- AC6: value-report consumes resolver ---

test('value-report consumes resolver: admits attributed dataless issues, drops dead', () => {
  // attributed-but-dataless → admit
  const admit = reportAttribution({ number: 101, body: plainBody, stateReason: 'COMPLETED' }, maps);
  assert.equal(admit.attributed, true);
  assert.equal(admit.dead, false);
  // dead → drop
  const drop = reportAttribution(
    { number: 700, body: supersededBody, stateReason: 'NOT_PLANNED' },
    maps,
  );
  assert.equal(drop.dead, true);
  // un-attributed, non-dead → neither admitted-by-attribution nor dropped
  const neutral = reportAttribution({ number: 800, body: plainBody, stateReason: 'COMPLETED' }, maps);
  assert.equal(neutral.attributed, false);
  assert.equal(neutral.dead, false);

  // generate-value-report actually imports and calls the consume-point.
  const src = readFileSync(path.join(__dir, '..', 'generate-value-report.mjs'), 'utf8');
  assert.match(src, /import \{ reportAttribution \} from '\.\/lib\/attribution-resolver\.mjs'/);
  assert.match(src, /reportAttribution\(i, attribution\)/);
});
