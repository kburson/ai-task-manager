// @story #567
// #567 — first-class `--allow-unverified-ticks` path for non-demonstrable ACs.
// Covers the four code-bearing acceptance criteria:
//   AC1 — `parseCheckArgs` recognizes the `--allow-unverified-ticks` flag.
//   AC2 — `classifyUnverifiedTick` admits a proofless AC but refuses a verifier-
//          bearing AC and a Functional DoD item (the hatch is not a verifier skip).
//   AC3 — `appendUnverifiedTickAudit` records an audit marker (idempotently) that
//          is NOT an `aitm-verified*` proof marker, so it never poses as evidence.
//   AC4 — `runReviewPreflight` exempts an AC tagged `invalid — non-demonstrable`
//          from the review-exit evidence scan (parity with the Refine→Plan gate).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCheckArgs,
  classifyUnverifiedTick,
  appendUnverifiedTickAudit,
  formatUnverifiedHatchRefusal,
} from '../verbs/check.mjs';
import { runReviewPreflight } from '../lib/review-preflight.mjs';

// ── AC1 — flag parsing ──────────────────────────────────────────────────────
test('parseCheckArgs recognizes --allow-unverified-ticks', () => {
  const off = parseCheckArgs(['--label', 'AC one']);
  assert.equal(off.allowUnverifiedTicks, false);
  assert.deepEqual(off.labels, ['AC one']);

  const on = parseCheckArgs(['--allow-unverified-ticks', '--label', 'AC one']);
  assert.equal(on.allowUnverifiedTicks, true);
  assert.deepEqual(on.labels, ['AC one']);

  // flag does not leak into positionals or labels
  const mixed = parseCheckArgs(['567', '--allow-unverified-ticks', 'My AC']);
  assert.equal(mixed.allowUnverifiedTicks, true);
  assert.deepEqual(mixed.positional, ['567', 'My AC']);
});

// ── AC2 — eligibility classifier ────────────────────────────────────────────
const PROOFLESS_BODY = `## Acceptance Criteria

- [ ] Honestly non-demonstrable AC (invalid — non-demonstrable) <!-- aitm-non-demonstrable -->
`;

const VERIFIER_BODY = `## Acceptance Criteria

- [ ] Demonstrable AC <!-- aitm-verified cmd="\`node --test foo.test.mjs\`" -->
`;

const DOD_BODY = `### Functional (verified at Test)

- [ ] All tests pass <!-- dod:functional:tests -->
`;

test('classifyUnverifiedTick admits a proofless AC', () => {
  const cls = classifyUnverifiedTick(
    PROOFLESS_BODY,
    'Honestly non-demonstrable AC (invalid — non-demonstrable)'
  );
  assert.equal(cls.kind, 'eligible');
});

test('classifyUnverifiedTick refuses a verifier-bearing AC', () => {
  const cls = classifyUnverifiedTick(VERIFIER_BODY, 'Demonstrable AC');
  assert.equal(cls.kind, 'refuse-verifier-ac');
  assert.equal(cls.label, 'Demonstrable AC');
  assert.deepEqual(cls.commands, ['node --test foo.test.mjs']);

  // the refusal message names ac-stamp and the declared command
  const msg = formatUnverifiedHatchRefusal({
    label: cls.label,
    issueRef: '#567',
    commands: cls.commands,
  });
  assert.match(msg, /UNVERIFIED_HATCH_REFUSED/);
  assert.match(msg, /ac-stamp/);
  assert.match(msg, /node --test foo\.test\.mjs/);
});

test('classifyUnverifiedTick refuses a Functional DoD item', () => {
  const cls = classifyUnverifiedTick(DOD_BODY, 'All tests pass');
  assert.equal(cls.kind, 'refuse-dod');
  assert.ok(cls.dodGate);
  assert.notEqual(cls.dodGate.kind, 'pass');
});

// ── AC3 — audit marker ──────────────────────────────────────────────────────
test('appendUnverifiedTickAudit records a non-proof audit marker, idempotently', () => {
  const body = '## Acceptance Criteria\n\n- [x] Some AC\n';
  const ts = '2026-06-27T00:00:00.000Z';
  const once = appendUnverifiedTickAudit(body, { label: 'Some AC', ts });

  assert.match(
    once,
    /<!-- aitm-unverified-tick label="Some AC" ts="2026-06-27T00:00:00\.000Z" -->/
  );
  // NOT an execution-proof marker — must not pose as evidence
  assert.doesNotMatch(once, /aitm-verified/);

  // idempotent for identical label + ts
  const twice = appendUnverifiedTickAudit(once, { label: 'Some AC', ts });
  assert.equal(twice, once);
});

// ── AC4 — review-exit exemption (confirms #537 parity holds) ─────────────────
function reviewDeps(body) {
  const sha = '0123456789abcdef0123456789abcdef01234567';
  return {
    gitStatus: async () => '',
    gitHeadSha: async () => sha,
    findTrailComment: async () => ({
      body: `### 🔗 Commits\n<!-- aitm-commits shas="${sha}" -->`,
    }),
    // #733 — attribution is message-based; the retired `gitIsAncestor` dep is
    // ignored, so inject the current `hasAttributingCommit` seam instead.
    hasAttributingCommit: async () => true,
    getIssueBody: async () => body,
  };
}

test('runReviewPreflight exempts an AC tagged invalid — non-demonstrable', async () => {
  const body = `## Acceptance Criteria

- [x] Honestly non-demonstrable AC (invalid — non-demonstrable) <!-- aitm-non-demonstrable -->
`;
  const res = await runReviewPreflight({
    issueNumber: 567,
    repo: 'kburson/ai-task-manager',
    projectDir: '/tmp',
    deps: reviewDeps(body),
  });
  assert.equal(res.ok, true, `expected clean preflight, got: ${res.reasons.join('; ')}`);
});

test('runReviewPreflight still flags a proofless AC that is NOT tagged non-demonstrable', async () => {
  const body = `## Acceptance Criteria

- [x] Plain AC with no verifier and no honest tag
`;
  const res = await runReviewPreflight({
    issueNumber: 567,
    repo: 'kburson/ai-task-manager',
    projectDir: '/tmp',
    deps: reviewDeps(body),
  });
  assert.equal(res.ok, false);
  assert.ok(res.reasons.some((r) => /missing .*evidence declaration/.test(r)));
});
