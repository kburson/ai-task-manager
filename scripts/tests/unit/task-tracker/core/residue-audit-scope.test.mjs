// @story #1411
// Boundary tests for the generated-research-artifact exemption in the legacy
// state-vocabulary residue audit (#1206, amended by #1411).
//
// The exemption exists because machine-generated research dumps inventory the
// repo's module paths, and one of those paths names the legacy-rename migration
// CLI — so the audit was failing on its own evidence rather than on residue.
// The danger of any such exemption is that it quietly widens until it exempts
// everything, so these cases pin all three edges: what is skipped, what is still
// audited inside the same directory, and what is still audited outside it.
//
// AC2 of #1411 rests on the negative cases here. They are the direct evidence
// that the audit still fails on genuine product-code residue.

import assert from 'node:assert/strict';
import test from 'node:test';

import { isGeneratedResearchArtifact } from '../../../lib/residue-audit-scope.mjs';

test('generated data under docs/research is exempt', () => {
  assert.equal(
    isGeneratedResearchArtifact(
      'docs/research/2026-08-24-test-suite-performance-audit/overlap.json'
    ),
    true
  );
  assert.equal(isGeneratedResearchArtifact('docs/research/anything/timings.txt'), true);
  assert.equal(isGeneratedResearchArtifact('docs/research/anything/rows.csv'), true);
  assert.equal(isGeneratedResearchArtifact('docs/research/anything/events.ndjson'), true);
});

test('authored prose under docs/research is still audited', () => {
  // The whole point of the narrow rule: a human writing the legacy vocabulary
  // into a research narrative must still be caught.
  assert.equal(
    isGeneratedResearchArtifact('docs/research/2026-08-24-test-suite-performance-audit/README.md'),
    false
  );
  assert.equal(isGeneratedResearchArtifact('docs/research/notes.md'), false);
});

test('executable analysis scripts under docs/research are still audited', () => {
  // These sit beside the dumps and are authored, not generated.
  assert.equal(
    isGeneratedResearchArtifact('docs/research/2026-08-24-test-suite-performance-audit/graph.mjs'),
    false
  );
});

test('generated-looking files outside docs/research are still audited', () => {
  assert.equal(isGeneratedResearchArtifact('package.json'), false);
  assert.equal(
    isGeneratedResearchArtifact('scripts/tests/fixtures/test-corpus-pre-move.json'),
    false
  );
  assert.equal(isGeneratedResearchArtifact('docs/migration-history.md'), false);
  // A path that merely contains the research segment deeper down does not match;
  // the prefix is anchored.
  assert.equal(isGeneratedResearchArtifact('scripts/docs/research/thing.json'), false);
});

test('backslash-separated paths normalize before the prefix check', () => {
  assert.equal(isGeneratedResearchArtifact('docs\\research\\audit\\overlap.json'), true);
});
