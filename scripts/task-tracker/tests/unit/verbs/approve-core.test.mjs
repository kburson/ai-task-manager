// @story #310
// Unit tests for scripts/task-tracker/verbs/approve.mjs.
//
// Covers:
//   1. Refuses when issue is not in `review` (wrong-state).
//   2. First call inserts the marker and returns 'approved' with ts.
//   3. Second call is a no-op ('already-approved'); body is not rewritten.
//   4. Marker is inserted before the fields-block when present; legacy
//      encoding in fixture is normalized to canonical HTML-comment encoding.
//   5. Marker is appended at body end when no fields-block.
//   6. hasApprovalMarker / buildMarker pure helpers.
//   7. New-encoded body stays new-encoded after insertApprovalMarker.
//   8. Legacy-encoded body is normalized to new encoding.

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  runApprove,
  buildMarker,
  hasApprovalMarker,
  insertApprovalMarker,
  detectFullAuto,
} from '../../../verbs/approve.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

const isolatedProjectDir = mkdtempSync(path.join(projectScratchDir('test'), 'approve-core-'));
process.env.AI_TASK_MANAGER_PROJECT_DIR = isolatedProjectDir;
process.once('exit', () => rmSync(isolatedProjectDir, { recursive: true, force: true }));

const cfg = { repo: 'o/r' };
const FIXED_TS = '2026-05-10T00:00:00Z';
const REVIEW_ONE = '2026-07-29T10:00:00Z';
const REVIEW_TWO = '2026-07-29T11:00:00Z';
const EPOCH_ONE = `review:1:${REVIEW_ONE}`;
const EPOCH_TWO = `review:2:${REVIEW_TWO}`;
const PROOF_ONE = 'abc1234';
const PROOF_TWO = 'def5678';

async function allowApprovalMutation(options, callback) {
  assert.equal(options.issueId, '58');
  assert.equal(options.operation, 'approval-mutation');
  return callback({ reverify: async () => {} });
}

function reviewProof(epoch, sha) {
  return `<!-- aitm-agent-review-proof schema="1" epoch="${epoch}" sha="${sha}" ts="2026-07-29T10:01:00Z" validators="unit" result="pass" -->`;
}

function reviewApproval({ epoch, proofSha, provenance = 'human', signals = '' }) {
  const signal = provenance === 'full-auto' ? ` signals="${signals}"` : '';
  return `<!-- aitm-review-approved schema="1" epoch="${epoch}" proof-sha="${proofSha}" ts="2026-07-29T10:02:00Z" provenance="${provenance}"${signal} -->`;
}

const AGENT_REVIEW_LINE =
  '\n- [ ] Agent Review Passed <!-- aitm-verified gate="agent-review" ts="2026-05-10T00:00:00Z" sha="sandbox" validators="body-sections" result="pass" -->\n';
const AGENT_REVIEW_PASSED = [
  '',
  `<!-- aitm-entered-review ts="${REVIEW_ONE}" -->`,
  `<!-- aitm-dod-verified sha="${PROOF_ONE}" ts="2026-07-29T10:00:00Z" -->`,
  reviewProof(EPOCH_ONE, PROOF_ONE),
  AGENT_REVIEW_LINE.trim(),
  '',
].join('\n');

function makeDeps(overrides = {}) {
  const calls = {
    writes: [],
    bodies: [],
    stateLookups: 0,
    comments: [],
    authority: [],
    locks: [],
  };
  const initialBody =
    overrides.initialBody ??
    '## Acceptance Criteria\n\n- [x] all\n\n<!-- ai-task-manager:fields:start -->\n```json\n{"schema":1,"values":{"size":"S"}}\n```\n<!-- ai-task-manager:fields:end -->\n';
  let body =
    initialBody +
    (initialBody.includes('aitm-entered-review') ? AGENT_REVIEW_LINE : AGENT_REVIEW_PASSED);
  return {
    calls,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => {
        calls.bodies.push(body);
        return body;
      },
      // #295 — closure-form body write. Track both base-in and result-out so
      // tests can assert "mutate produced body X from base Y" rather than just
      // observing the final body.
      mutateIssueBody: async ({ mutate, operation }) => {
        calls.authority.push(`body:${operation}`);
        const before = body;
        const next = mutate(before);
        if (next !== before) {
          body = next;
          calls.writes.push(next);
        }
        // #655 — surface the verified live body for approve's read-back assertion.
        return { status: next !== before ? 'ok' : 'no-op', body };
      },
      getBoardState: async () => {
        calls.stateLookups++;
        return overrides.state ?? 'review';
      },
      nowIso: () => FIXED_TS,
      // Isolate baseline tests from ambient env (e.g. TT_FULL_AUTO=1 in
      // sandbox). Tests that exercise the full-auto path inject their own
      // detectFullAuto via overrides.deps.
      detectFullAuto: () => ({ fired: false, signals: '' }),
      postComment: async ({ body }) => {
        calls.comments.push(body);
      },
      fetchComments: async () => [],
      fetchProjectValues: async () => ({}),
      withIssueLock: async (_options, callback) => {
        calls.locks.push('lock');
        return callback();
      },
      withGovernedEffect: async (options, callback) => {
        calls.authority.push(`authorize:${options.issueId}:${options.operation}`);
        return callback({
          reverify: async () => {
            calls.authority.push('reverify');
          },
        });
      },
      ...overrides.deps,
    },
    getBody: () => body,
  };
}

// #1049 — a mutation attempt acquires the issue lock, authorizes the exact
// approval boundary, and reverifies immediately before the body effect.
{
  const { deps, calls } = makeDeps();
  const r = await runApprove({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'approved');
  assert.deepEqual(calls.locks, ['lock']);
  assert.equal(calls.authority[0], 'authorize:58:approval-mutation');
  assert.equal(calls.authority.at(-1), 'body:approval-mutation');
  assert.ok(
    calls.authority.slice(1, -1).every((event) => event === 'reverify'),
    `every pre-body authority event must be reverify: ${calls.authority.join(', ')}`
  );
}

// #1049 — current approval is a read-only no-op: it needs neither a lock nor
// lease authority.
{
  const current = [
    `<!-- aitm-entered-review ts="${REVIEW_ONE}" -->`,
    `<!-- aitm-dod-verified sha="${PROOF_ONE}" ts="2026-07-29T10:00:00Z" -->`,
    reviewProof(EPOCH_ONE, PROOF_ONE),
    AGENT_REVIEW_LINE.trim(),
    reviewApproval({ epoch: EPOCH_ONE, proofSha: PROOF_ONE }),
  ].join('\n');
  const { deps, calls } = makeDeps({ initialBody: current });
  deps.withGovernedEffect = async () => {
    throw new Error('authority must remain unopened');
  };
  const r = await runApprove({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'already-approved');
  assert.deepEqual(calls.locks, []);
  assert.deepEqual(calls.authority, []);
}

// #1049 — denied approval authority prevents every body/comment effect.
{
  const { deps, calls } = makeDeps({
    deps: {
      withGovernedEffect: async (options) => {
        calls.authority.push(`authorize:${options.issueId}:${options.operation}`);
        const error = new Error('stale approval authority');
        error.code = 'fence-stale';
        throw error;
      },
    },
  });
  await assert.rejects(
    () => runApprove({ issueNumber: 58, cfg, deps }),
    /stale approval authority/
  );
  assert.deepEqual(calls.locks, ['lock']);
  assert.deepEqual(calls.writes, []);
  assert.deepEqual(calls.comments, []);
}

// 1. wrong-state when not in review (develop)
{
  const { deps, calls } = makeDeps({ state: 'develop' });
  const r = await runApprove({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'wrong-state');
  assert.match(r.message, /develop/);
  assert.equal(calls.writes.length, 0);
}

// 1b. wrong-state when in plan (Review approval cannot approve Plan)
{
  const { deps, calls } = makeDeps({ state: 'plan' });
  const r = await runApprove({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'wrong-state');
  assert.match(r.message, /plan/);
  assert.equal(calls.writes.length, 0);
}

// 2. first call inserts marker
{
  const { deps, calls, getBody } = makeDeps();
  const r = await runApprove({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'approved');
  assert.equal(r.ts, FIXED_TS);
  assert.equal(calls.writes.length, 1);
  assert.match(
    getBody(),
    /<!-- aitm-review-approved schema="1" epoch="review:1:2026-07-29T10:00:00Z" proof-sha="abc1234" ts="2026-05-10T00:00:00Z" provenance="human" -->/
  );
}

// 3. second call is idempotent
{
  const { deps, calls } = makeDeps();
  await runApprove({ issueNumber: 58, cfg, deps });
  const r = await runApprove({ issueNumber: 58, cfg, deps });
  assert.equal(r.status, 'already-approved');
  assert.equal(calls.writes.length, 1, 'second call must not rewrite the body');
}

// #1050 — an approval from a prior Review visit is historical, not an
// idempotent approval. A current passing proof must replace it with authority
// for the re-entered Review epoch.
{
  const staleHuman = [
    `<!-- aitm-entered-review ts="${REVIEW_ONE}" -->`,
    reviewProof(EPOCH_ONE, PROOF_ONE),
    reviewApproval({ epoch: EPOCH_ONE, proofSha: PROOF_ONE }),
    `<!-- aitm-entered-review-2 ts="${REVIEW_TWO}" -->`,
    `<!-- aitm-dod-verified sha="${PROOF_TWO}" ts="2026-07-29T11:00:00Z" -->`,
    reviewProof(EPOCH_TWO, PROOF_TWO),
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [x] Passed final human review',
  ].join('\n');
  const { deps, calls, getBody } = makeDeps({ initialBody: staleHuman });
  const r = await runApprove({ issueNumber: 58, cfg, deps });

  assert.equal(r.status, 'approved');
  assert.equal(calls.writes.length, 2, 'archive and replacement are separate fresh-base writes');
  assert.deepEqual(calls.locks, ['lock'], 'stale approval repair must acquire the issue lock');
  assert.equal(
    calls.authority[0],
    'authorize:58:approval-mutation',
    'stale approval repair must open exact approval authority'
  );
  assert.match(getBody(), /aitm-review-approval-history[^>]*provenance="human"/);
  assert.match(
    getBody(),
    new RegExp(`aitm-review-approved schema="1" epoch="${EPOCH_TWO}" proof-sha="${PROOF_TWO}"`)
  );
  assert.match(getBody(), /- \[x\] Passed final human review/);
}

// #1050 — the versioned current proof/approval pair, unlike mere marker
// presence, is the only idempotent approve state.
{
  const current = [
    `<!-- aitm-entered-review ts="${REVIEW_ONE}" -->`,
    `<!-- aitm-dod-verified sha="${PROOF_ONE}" ts="2026-07-29T10:00:00Z" -->`,
    reviewProof(EPOCH_ONE, PROOF_ONE),
    AGENT_REVIEW_LINE.trim(),
    reviewApproval({ epoch: EPOCH_ONE, proofSha: PROOF_ONE }),
  ].join('\n');
  const { deps, calls } = makeDeps({ initialBody: current });
  const r = await runApprove({ issueNumber: 58, cfg, deps });

  assert.equal(r.status, 'already-approved');
  assert.equal(calls.writes.length, 0);
}

// #1050 — validated Git abbreviations are the same revision authority at every
// consumer. Approve must not reject a current reducer projection merely
// because the persisted Test marker carries the full object ID.
{
  const fullSha = 'abc1234deadbeefabc1234deadbeefabc1234dea';
  const current = [
    `<!-- aitm-entered-review ts="${REVIEW_ONE}" -->`,
    `<!-- aitm-dod-verified sha="${fullSha}" ts="2026-07-29T10:00:00Z" -->`,
    reviewProof(EPOCH_ONE, PROOF_ONE),
    AGENT_REVIEW_LINE.trim(),
    reviewApproval({ epoch: EPOCH_ONE, proofSha: PROOF_ONE }),
  ].join('\n');
  const { deps, calls } = makeDeps({ initialBody: current });

  const r = await runApprove({ issueNumber: 58, cfg, deps });

  assert.equal(r.status, 'already-approved');
  assert.equal(calls.writes.length, 0);
}

// #1050 — fenced DoD examples are documentation, never the revision authority
// selected by the approval mutation.
{
  const current = [
    '```md',
    '<!-- aitm-dod-verified sha="dec0de1" ts="2026-07-29T09:00:00Z" -->',
    '```',
    `<!-- aitm-entered-review ts="${REVIEW_ONE}" -->`,
    `<!-- aitm-dod-verified sha="${PROOF_ONE}" ts="2026-07-29T10:00:00Z" -->`,
    reviewProof(EPOCH_ONE, PROOF_ONE),
    AGENT_REVIEW_LINE.trim(),
    reviewApproval({ epoch: EPOCH_ONE, proofSha: PROOF_ONE }),
  ].join('\n');
  const { deps, calls } = makeDeps({ initialBody: current });

  const r = await runApprove({ issueNumber: 58, cfg, deps });

  assert.equal(r.status, 'already-approved');
  assert.equal(calls.writes.length, 0);
}

// #1050 — an Agent Review proof is current only when it binds the persisted
// Test/DoD revision; feeding the proof's own SHA back into the reducer would
// make this mismatch tautologically pass.
{
  const mismatchedTestEvidence = [
    `<!-- aitm-entered-review ts="${REVIEW_ONE}" -->`,
    '<!-- aitm-dod-verified sha="def5678" ts="2026-07-29T10:00:00Z" -->',
    reviewProof(EPOCH_ONE, PROOF_ONE),
    reviewApproval({ epoch: EPOCH_ONE, proofSha: PROOF_ONE }),
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [x] Passed final human review',
  ].join('\n');
  const { deps, calls, getBody } = makeDeps({ initialBody: mismatchedTestEvidence });
  const r = await runApprove({ issueNumber: 58, cfg, deps });

  assert.equal(r.status, 'agent-review-incomplete');
  assert.equal(calls.writes.length, 1);
  assert.match(getBody(), /aitm-review-approval-history/);
  assert.doesNotMatch(getBody(), /<!-- aitm-review-approved /);
}

// #1050 — approval is serialized from the versioned mutation's fresh base, not
// the earlier fetch. The proof-bound write must fail closed instead of retrying
// onto an authority that changed during a conflict.
{
  const preflight = [
    `<!-- aitm-entered-review ts="${REVIEW_ONE}" -->`,
    `<!-- aitm-dod-verified sha="${PROOF_ONE}" ts="2026-07-29T10:00:00Z" -->`,
    reviewProof(EPOCH_ONE, PROOF_ONE),
    AGENT_REVIEW_LINE.trim(),
  ].join('\n');
  let fresh = [
    `<!-- aitm-entered-review ts="${REVIEW_ONE}" -->`,
    `<!-- aitm-dod-verified sha="${PROOF_TWO}" ts="2026-07-29T10:00:00Z" -->`,
    reviewProof(EPOCH_ONE, PROOF_TWO),
    AGENT_REVIEW_LINE.trim(),
  ].join('\n');
  let capturedOptions = null;
  const r = await runApprove({
    issueNumber: 58,
    cfg,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => preflight,
      getBoardState: async () => 'review',
      nowIso: () => FIXED_TS,
      detectFullAuto: () => ({ fired: false, signals: '' }),
      promptDrivers: async () => [],
      withGovernedEffect: allowApprovalMutation,
      mutateIssueBody: async (options) => {
        capturedOptions = options;
        fresh = options.mutate(fresh);
        return { status: 'ok', body: fresh };
      },
    },
  });

  assert.equal(r.status, 'approved');
  assert.equal(capturedOptions.maxRetries, 1);
  assert.match(fresh, new RegExp(`proof-sha="${PROOF_TWO}"`));
  assert.doesNotMatch(fresh, new RegExp(`proof-sha="${PROOF_ONE}"`));
}

// #1050 — a competing approver can finish the exact current proof between
// preflight and the fresh-base mutation. That is a truthful idempotent result,
// not an incomplete Agent Review.
{
  const preflight = [
    `<!-- aitm-entered-review ts="${REVIEW_ONE}" -->`,
    `<!-- aitm-dod-verified sha="${PROOF_ONE}" ts="2026-07-29T10:00:00Z" -->`,
    reviewProof(EPOCH_ONE, PROOF_ONE),
    AGENT_REVIEW_LINE.trim(),
  ].join('\n');
  let fresh = `${preflight}\n${reviewApproval({ epoch: EPOCH_ONE, proofSha: PROOF_ONE })}`;
  const r = await runApprove({
    issueNumber: 58,
    cfg,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => preflight,
      getBoardState: async () => 'review',
      nowIso: () => FIXED_TS,
      detectFullAuto: () => ({ fired: false, signals: '' }),
      promptDrivers: async () => [],
      withGovernedEffect: allowApprovalMutation,
      mutateIssueBody: async ({ mutate }) => {
        fresh = mutate(fresh);
        return { status: 'no-op', body: fresh };
      },
    },
  });

  assert.equal(r.status, 'already-approved');
}

// 4. marker placed before fields-block; legacy fixture normalized to new encoding
{
  const { deps, getBody } = makeDeps();
  await runApprove({ issueNumber: 58, cfg, deps });
  const body = getBody();
  const markerIdx = body.indexOf('<!-- aitm-review-approved');
  const fieldsIdx = body.indexOf('<!-- aitm-fields:');
  assert.ok(
    markerIdx >= 0 && fieldsIdx > markerIdx,
    `marker must appear before field-DB; markerIdx=${markerIdx}, fieldsIdx=${fieldsIdx}`
  );
  assert.ok(
    !body.includes('<!-- ai-task-manager:fields:start -->'),
    'legacy fields-start marker must not survive an approve write'
  );
}

// 5. marker appended at end when no fields-block
{
  const { deps, getBody } = makeDeps({ initialBody: '## AC\n- [x] x\n' });
  await runApprove({ issueNumber: 58, cfg, deps });
  assert.match(
    getBody(),
    /<!-- aitm-review-approved schema="1" epoch="review:1:2026-07-29T10:00:00Z" proof-sha="abc1234" ts="2026-05-10T00:00:00Z" provenance="human" -->\s*$/
  );
}

// 6. pure helpers
{
  assert.equal(buildMarker(FIXED_TS), `<!-- aitm-review-approved ts="${FIXED_TS}" -->`);
  assert.equal(hasApprovalMarker(''), false);
  assert.equal(hasApprovalMarker(buildMarker(FIXED_TS)), true);
  assert.equal(hasApprovalMarker('<!--aitm-review-approved:foo-->'), true);
  // insertApprovalMarker is idempotent on already-marked body.
  const already = `body\n${buildMarker(FIXED_TS)}\n`;
  assert.equal(insertApprovalMarker(already, '2099-01-01T00:00:00Z'), already);
}

// 7. new-encoded body stays new-encoded
{
  const newBody = '## AC\n- [x] x\n\n<!-- aitm-fields: {"schema":1,"values":{"size":"S"}} -->\n';
  const out = insertApprovalMarker(newBody, FIXED_TS);
  assert.ok(out.includes('<!-- aitm-fields:'), 'output must contain new-encoded field-DB');
  assert.ok(
    !out.includes('ai-task-manager:fields:start'),
    'output must NOT contain legacy fields-start marker'
  );
  const markerIdx = out.indexOf('<!-- aitm-review-approved');
  const fieldsIdx = out.indexOf('<!-- aitm-fields:');
  assert.ok(markerIdx >= 0 && fieldsIdx > markerIdx, 'approval marker must precede field-DB');
}

// 8. legacy-encoded body is normalized to new encoding
{
  const legacy =
    '## AC\n- [x] x\n\n<!-- ai-task-manager:fields:start -->\n```json\n{"schema":1,"values":{"size":"M"}}\n```\n<!-- ai-task-manager:fields:end -->\n';
  const out = insertApprovalMarker(legacy, FIXED_TS);
  assert.ok(
    !out.includes('ai-task-manager:fields:start'),
    'legacy fields-start marker must be stripped'
  );
  assert.ok(
    !out.includes('ai-task-manager:fields:end'),
    'legacy fields-end marker must be stripped'
  );
  assert.ok(
    out.includes('<!-- aitm-fields: {"schema":1,"values":{"size":"M"}} -->'),
    'output must contain canonical re-emission of parsed values'
  );
}

// 9. auto-ticks "Passed final human review" Lifecycle item on approve (#139)
{
  const body = [
    '## AC',
    '- [x] x',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [ ] Passed final human review',
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
    '',
    '<!-- aitm-fields: {"schema":1,"values":{"size":"S"}} -->',
    '',
  ].join('\n');
  const { deps, getBody } = makeDeps({ initialBody: body });
  await runApprove({ issueNumber: 58, cfg, deps });
  const out = getBody();
  assert.match(out, /- \[x\] Passed final human review/);
  assert.match(out, /- \[ \] Story closed and moved to Done/);
  assert.match(out, /- \[ \] Timing data flushed to issue/);
}

// 10. auto-tick is a no-op when there is no Lifecycle section (back-compat)
{
  const { deps, getBody } = makeDeps({ initialBody: '## AC\n- [x] x\n' });
  await runApprove({ issueNumber: 58, cfg, deps });
  assert.match(
    getBody(),
    /<!-- aitm-review-approved schema="1" epoch="review:1:2026-07-29T10:00:00Z"/
  );
  assert.doesNotMatch(getBody(), /Passed final human review/);
}
