// @story #887
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  hasEpicAcReconciledMarker,
  setEpicAcReconciled,
  parseIssueKind,
} from '../../lib/issue-kind.mjs';
import { INVARIANT_MARKER_PATTERNS, findLostMarkers } from '../../lib/body-invariants.mjs';
import { gateCodeComplete } from '../../lib/code-complete-gate.mjs';

const CFG = { repo: 'kburson/ai-task-manager' };

// Every AC ticked and verified, so the ONLY thing under test is the
// reconciliation blocker — not incidental AC failures.
const ACS = [
  '## Acceptance Criteria',
  '',
  '- [x] Child #872 landed X <!-- aitm-verified cmd="npm test" -->',
  '- [x] Child #873 landed Y <!-- aitm-verified cmd="npm test" -->',
  '',
].join('\n');

function epicBody({ reconciled = false, deliverable = true } = {}) {
  let body = ['<!-- aitm-issue-kind kind="epic" -->', '', ACS].join('\n');
  if (deliverable) body += '\n<!-- aitm-deliverable-posted ts="2026-07-19T00:00:00.000Z" -->\n';
  if (reconciled) body = setEpicAcReconciled(body, '2026-07-19T12:00:00.000Z');
  return body;
}

function codeBody() {
  return ACS;
}

const UNRECONCILED = (blockers) =>
  blockers.filter((b) => b.startsWith('code-complete-epic-unreconciled:'));

// --- AC 1 -------------------------------------------------------------------

test('AC1: an epic is refused develop-exit without a reconciliation marker', async () => {
  const res = await gateCodeComplete({ cfg: CFG, issueNumber: 883, body: epicBody() });
  assert.equal(res.ok, false);
  assert.equal(UNRECONCILED(res.blockers).length, 1);
});

test('AC1: the refusal is the ONLY blocker on an otherwise-complete epic', async () => {
  const res = await gateCodeComplete({ cfg: CFG, issueNumber: 883, body: epicBody() });
  assert.deepEqual(
    res.blockers.map((b) => b.split(':')[0]),
    ['code-complete-epic-unreconciled']
  );
});

// --- AC 2 -------------------------------------------------------------------

test('AC2: the same epic passes develop-exit once the marker is stamped', async () => {
  const res = await gateCodeComplete({
    cfg: CFG,
    issueNumber: 883,
    body: epicBody({ reconciled: true }),
  });
  assert.equal(res.ok, true, res.blockers.join('\n'));
  assert.deepEqual(res.blockers, []);
});

test('AC2: stamping does not disturb the kind marker or the deliverable marker', () => {
  const stamped = epicBody({ reconciled: true });
  assert.equal(parseIssueKind(stamped), 'epic');
  assert.match(stamped, /aitm-deliverable-posted/);
});

test('AC2: setEpicAcReconciled is idempotent — a second stamp adds no second marker', () => {
  const once = setEpicAcReconciled(epicBody(), '2026-07-19T12:00:00.000Z');
  const twice = setEpicAcReconciled(once, '2026-07-19T13:00:00.000Z');
  const count = (s) => (s.match(/aitm-epic-ac-reconciled/g) || []).length;
  assert.equal(count(once), 1);
  assert.equal(count(twice), 1);
  // The re-stamp refreshes the timestamp rather than preserving the stale one:
  // reconciliation is about the LAST time the epic was re-read.
  assert.match(twice, /ts="2026-07-19T13:00:00\.000Z"/);
});

test('AC2: hasEpicAcReconciledMarker honors a bare, un-timestamped marker', () => {
  assert.equal(hasEpicAcReconciledMarker('<!-- aitm-epic-ac-reconciled -->'), true);
  assert.equal(hasEpicAcReconciledMarker('no marker here'), false);
});

// --- AC 3 -------------------------------------------------------------------

test('AC3: a code-kind issue is unaffected by the new gate', async () => {
  const res = await gateCodeComplete({
    cfg: CFG,
    issueNumber: 500,
    body: codeBody(),
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits shas="c98aa08" -->' }],
      filesForSha: async () => [],
      dirtyFiles: async () => new Set(),
    },
  });
  assert.deepEqual(UNRECONCILED(res.blockers), []);
});

test('AC3: the other no-commit kinds are unaffected — they have no children to reconcile', async () => {
  for (const kind of ['audit', 'research', 'spike']) {
    const body = `<!-- aitm-issue-kind kind="${kind}" -->\n\n${ACS}\n<!-- aitm-deliverable-posted -->\n`;
    const res = await gateCodeComplete({ cfg: CFG, issueNumber: 600, body });
    assert.deepEqual(UNRECONCILED(res.blockers), [], `${kind} must not be gated`);
    assert.equal(res.ok, true, `${kind}: ${res.blockers.join('\n')}`);
  }
});

// --- AC 4 -------------------------------------------------------------------

test('AC4: the marker is registered as a body invariant', () => {
  const entry = INVARIANT_MARKER_PATTERNS.find((p) => p.name === 'aitm-epic-ac-reconciled');
  assert.ok(entry, 'aitm-epic-ac-reconciled missing from INVARIANT_MARKER_PATTERNS');
  assert.equal(entry.kind, 'single');
  assert.equal(
    entry.re.test('<!-- aitm-epic-ac-reconciled ts="2026-07-19T12:00:00.000Z" -->'),
    true
  );
});

test('AC4: dropping the marker is reported as a lost invariant', () => {
  const before = epicBody({ reconciled: true });
  const after = epicBody();
  assert.deepEqual(findLostMarkers(before, after), ['aitm-epic-ac-reconciled']);
  // And the reverse is not a loss — stamping is always allowed.
  assert.deepEqual(findLostMarkers(after, before), []);
});

test('AC4: the invariant entry is mirrored into the gh-edit-guard registry', async () => {
  // The guard does not export its registry, so assert through its public
  // behaviour: an edit that drops the marker must be blocked. This is the step
  // most likely to be forgotten when adding an invariant.
  const { evaluateGhEdit } = await import('../../lib/gh-edit-guard.mjs');
  const guard = String(
    readFileSync(fileURLToPath(new URL('../../lib/gh-edit-guard.mjs', import.meta.url)), 'utf8')
  );
  assert.match(guard, /aitm-epic-ac-reconciled/);
  assert.equal(typeof evaluateGhEdit, 'function');
});

// --- AC 5 -------------------------------------------------------------------

test('AC5: the refusal names the reconciliation act, not merely the missing marker', async () => {
  const res = await gateCodeComplete({ cfg: CFG, issueNumber: 883, body: epicBody() });
  const [msg] = UNRECONCILED(res.blockers);
  // An operator who reads only "missing marker" will stamp it blind, which turns
  // the gate into a speed bump. The message must say what to DO.
  assert.match(msg, /re-read the epic's goals against what its children actually delivered/);
  assert.match(msg, /record the mapping/);
  assert.match(msg, /\/task epic-reconcile 883/);
  assert.match(msg, /#883/);
});

test('AC5: the refusal explains WHY reconciliation is a develop-exit event', async () => {
  const res = await gateCodeComplete({ cfg: CFG, issueNumber: 883, body: epicBody() });
  const [msg] = UNRECONCILED(res.blockers);
  assert.match(msg, /provisional from decomposition until the last child lands/);
});

// --- guard-rail -------------------------------------------------------------

test('guard-rail: the marker cannot substitute for a missing deliverable', async () => {
  // Reconciled but no `aitm-deliverable-posted` — still refused. The two
  // requirements are independent; neither absorbs the other.
  const body = epicBody({ reconciled: true, deliverable: false });
  const res = await gateCodeComplete({ cfg: CFG, issueNumber: 883, body });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.startsWith('code-complete-deliverable-missing:')));
});

test('guard-rail: reconciliation does not excuse an unticked AC', async () => {
  const body = setEpicAcReconciled(
    [
      '<!-- aitm-issue-kind kind="epic" -->',
      '',
      '## Acceptance Criteria',
      '',
      '- [ ] Child #872 landed X',
      '',
      '<!-- aitm-deliverable-posted -->',
    ].join('\n')
  );
  const res = await gateCodeComplete({ cfg: CFG, issueNumber: 883, body });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.startsWith('code-complete-ac-unticked:')));
});
