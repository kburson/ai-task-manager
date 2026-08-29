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

import * as residueAudit from '../../../lib/residue-audit-scope.mjs';

const { isGeneratedResearchArtifact } = residueAudit;

function requiredFunction(name) {
  assert.equal(typeof residueAudit[name], 'function', `${name} must be exported`);
  return residueAudit[name];
}

const LEGACY_STATE = ['On', 'Deck'].join(' ');
const RESIDUE_LINE = `const currentState = '${LEGACY_STATE}';`;

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
  assert.equal(isGeneratedResearchArtifact('scripts/tests/fixtures/generated.json'), false);
  assert.equal(isGeneratedResearchArtifact('docs/migration-history.md'), false);
  // A path that merely contains the research segment deeper down does not match;
  // the prefix is anchored.
  assert.equal(isGeneratedResearchArtifact('scripts/docs/research/thing.json'), false);
});

test('non-canonical research paths are audited rather than exempted', () => {
  const nonCanonicalPaths = [
    'docs\\research\\audit\\overlap.json',
    '/docs/research/audit/overlap.json',
    'docs/research//overlap.json',
    'docs/research/./overlap.json',
    'docs/research/../src/overlap.json',
  ];

  for (const file of nonCanonicalPaths) {
    assert.equal(isGeneratedResearchArtifact(file), false, file);
  }
});

test('non-string paths are audited rather than coerced', () => {
  assert.equal(isGeneratedResearchArtifact(undefined), false);
  assert.equal(isGeneratedResearchArtifact({ toString: () => 'docs/research/data.json' }), false);
});

test('legacy matcher catches a state name split across comment lines', () => {
  const legacyMatches = requiredFunction('legacyMatches');
  assert.deepEqual(legacyMatches('current state: On\n// Deck waiting room'), [
    '1:split:On // Deck',
  ]);
});

test('audit reports product residue but ignores generated research data', () => {
  const evaluateResidueAudit = requiredFunction('evaluateResidueAudit');
  const failures = evaluateResidueAudit({
    entries: [
      {
        file: 'scripts/product-state.mjs',
        source: RESIDUE_LINE,
      },
      {
        file: 'docs/research/audit/inventory.json',
        source: RESIDUE_LINE,
      },
    ],
    allowlist: new Map(),
  });

  assert.deepEqual(failures, [`UNEXPECTED scripts/product-state.mjs\n  1:${RESIDUE_LINE}`]);
});

test('audit preserves exact count and missing allowlist failures', () => {
  const evaluateResidueAudit = requiredFunction('evaluateResidueAudit');
  const failures = evaluateResidueAudit({
    entries: [
      {
        file: 'scripts/compatibility.mjs',
        source: RESIDUE_LINE,
      },
    ],
    allowlist: new Map([
      ['scripts/compatibility.mjs', [2, 'compatibility seam']],
      ['docs/migration-history.md', [1, 'expected historical carrier']],
    ]),
  });

  assert.deepEqual(failures, [
    `COUNT scripts/compatibility.mjs: expected 2, found 1 (compatibility seam)\n  1:${RESIDUE_LINE}`,
    'MISSING docs/migration-history.md: expected 1 (expected historical carrier)',
  ]);
});
