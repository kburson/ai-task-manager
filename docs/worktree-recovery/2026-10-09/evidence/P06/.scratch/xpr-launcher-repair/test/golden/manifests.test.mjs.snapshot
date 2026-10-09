import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { renderManifest } from '../../src/manifest/render.mjs';

const git = '1'.repeat(40);

function model({ override = false, noCommit = false } = {}) {
  const humanDecision = override
    ? {
        decision: 'accepted-over-objections',
        unresolved_finding_ids: ['R1-F001'],
      }
    : null;
  return {
    schema: 'ai-peer-review.manifest/v1',
    review_id: 'golden-review',
    status: override
      ? noCommit
        ? 'accepted-over-objections-uncommitted'
        : 'accepted-over-objections'
      : noCommit
        ? 'accepted-uncommitted'
        : 'accepted',
    acceptance_basis: override ? 'human-override' : 'reviewer-consensus',
    commit_mode: noCommit ? 'no-commit' : 'normal',
    authority_assurance: override ? 'cryptographic-local' : 'unavailable',
    residual_risk: noCommit
      ? [
          'uncommitted-test-evidence',
          ...(override ? ['detection-grade-authority'] : ['human-authority-unavailable']),
        ]
      : override
        ? ['detection-grade-authority']
        : ['human-authority-unavailable'],
    startup_commit: git,
    final_commit: noCommit ? null : git,
    human_decision: humanDecision,
  };
}

for (const scenario of [
  ['consensus', {}],
  ['override', { override: true }],
  ['no-commit-consensus', { noCommit: true }],
  ['no-commit-override', { override: true, noCommit: true }],
]) {
  test(`manifest golden: ${scenario[0]}`, () => {
    const actual = renderManifest(model(scenario[1]));
    const expected = readFileSync(new URL(`./manifests/${scenario[0]}.md`, import.meta.url));
    assert.deepEqual(actual, expected);
    assert.doesNotMatch(actual.toString(), /session_id|transcript|token|ipc|private_key/i);
  });
}
