// @story #532
// The Develop→Test code-complete gate must honor the `invalid — non-demonstrable`
// AC opt-out the same way the Refine→Plan gate (`findAcsWithoutVerifierOrInvalidTag`)
// already does. A ticked non-demonstrable AC carries no machine verifier by design,
// so it must NOT raise `code-complete-ac-unverified` — but done-ness and the
// demonstrable-verifier requirement for every other AC must be preserved.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gateCodeComplete } from '../../../lib/code-complete-gate.mjs';

const cfg = { repo: 'o/r' };

// Inject a satisfied commit-trail so only the AC blockers vary across cases.
const passingDeps = {
  listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits: abc1234 -->' }],
  filesForSha: async () => ['src/foo.js'],
  dirtyFiles: async () => new Set(),
};

test('gateCodeComplete: a ticked non-demonstrable AC raises no code-complete-ac-unverified', async () => {
  const body = `## Acceptance Criteria

- [x] Determinism is the emergent outcome of AC1+AC2; invalid — non-demonstrable, no single clean verifier.
`;
  const r = await gateCodeComplete({ cfg, issueNumber: 1, body, deps: passingDeps });
  assert.ok(
    !r.blockers.some((b) => b.startsWith('code-complete-ac-unverified')),
    `expected no code-complete-ac-unverified blocker, got: ${JSON.stringify(r.blockers)}`
  );
  assert.equal(r.ok, true, `expected gate to pass, got blockers: ${JSON.stringify(r.blockers)}`);
});

test('gateCodeComplete: an UNticked non-demonstrable AC still raises code-complete-ac-unticked', async () => {
  const body = `## Acceptance Criteria

- [ ] Determinism holds; invalid — non-demonstrable.
`;
  const r = await gateCodeComplete({ cfg, issueNumber: 1, body, deps: passingDeps });
  assert.ok(
    r.blockers.some((b) => b.startsWith('code-complete-ac-unticked')),
    `expected code-complete-ac-unticked blocker, got: ${JSON.stringify(r.blockers)}`
  );
});

test('gateCodeComplete: a ticked demonstrable AC with no verifier still raises code-complete-ac-unverified', async () => {
  const body = `## Acceptance Criteria

- [x] Some demonstrable behavior with no verifier marker at all.
`;
  const r = await gateCodeComplete({ cfg, issueNumber: 1, body, deps: passingDeps });
  assert.ok(
    r.blockers.some((b) => b.startsWith('code-complete-ac-unverified')),
    `expected code-complete-ac-unverified blocker, got: ${JSON.stringify(r.blockers)}`
  );
});
