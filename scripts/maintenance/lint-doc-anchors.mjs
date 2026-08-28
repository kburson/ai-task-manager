#!/usr/bin/env node
// #941 — Lint guard: assert the guide docs still carry the anchors that #912's
// shipped behavior depends on.
//
// Two pure doc-presence tests delivered by epic #912 (via stories #908 and #934)
// tripped the #866 reach gate (`lint:test-reach`) because they exercise no repo
// module — they only `readFileSync` a guide and `assert.match` anchors. Per the
// gate's own sanctioned remedy and the #852 precedent (move doc-content
// assertions into a lint, not a test), their assertions live here as a
// standalone maintenance lint instead of in the test suite. The two source tests
// (`full-auto-docs-present.test.mjs`, `lane-split-doc.test.mjs`) are deleted.
//
// This file is self-executing: run directly (`node scripts/maintenance/…`) it
// checks the live docs and exits non-zero on any missing/forbidden anchor. It
// also exports `lintDocAnchors(root)` so the companion test can drive it against
// fixtures — which is what lets that test exercise a repo module and clear the
// reach gate.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');

// Each spec names a doc and the anchors that must be present (`required`) or
// absent (`forbidden`). `label` is the human-readable description surfaced on a
// violation. Provenance is noted per group so a future editor knows which
// shipped behavior each anchor protects.
export const DOC_ANCHOR_SPECS = [
  {
    rel: 'docs/guides/workflow.md',
    // #908 — Full-Auto PR merge + local-trunk sync section.
    required: [
      {
        re: /### Full-Auto PR merge \+ local-trunk sync/,
        label: 'Full-Auto merge section heading',
      },
      { re: /--auto/, label: '`--auto` merge flag' },
      { re: /auto-merge/i, label: 'auto-merge mechanism' },
      { re: /origin\/trunk/, label: '`origin/trunk` re-sync reference' },
      { re: /full-auto-merge\.mjs/, label: '`full-auto-merge.mjs` script reference' },
      // #934 — two-lane DoD `tests` verification section.
      { re: /Two-lane DoD `tests` verification/, label: 'two-lane DoD tests section heading' },
      { re: /`npm run test:slow`/, label: '`npm run test:slow` lane name' },
      { re: /`npm test`/, label: '`npm test` lane name' },
      { re: /coverage-identical/, label: 'coverage-identical claim' },
      { re: /#908/, label: '#908 cross-reference' },
      // #1381 — governed delivery convergence.
      { re: /Governed delivery convergence/, label: 'delivery convergence section heading' },
      { re: /Review → deliver → receipt → close/, label: 'terminal delivery sequence' },
      { re: /historical receipt recovery/i, label: 'historical recovery mode' },
      { re: /cumulative inclusion/i, label: 'cumulative-inclusion refusal' },
      { re: /approved incident ledger/i, label: 'approved incident-ledger authority' },
    ],
    forbidden: [{ re: /~130s/, label: 'stale `~130s` single-command timing figure' }],
  },
  {
    rel: 'docs/guides/settings-guide.md',
    // #908/#1381 — provider-action delivery plus explicit local lane.
    required: [
      { re: /### `fullAutoMerge`/, label: '`fullAutoMerge` config block heading' },
      { re: /provider-action/, label: '`provider-action` mechanism' },
      { re: /github\.merge-pull-request/, label: 'provider integration action' },
      { re: /expected-head/i, label: 'expected-head provider boundary' },
      { re: /gh-auto-merge` is retired/, label: 'retired mechanism migration' },
      { re: /local-trunk-lane/, label: '`local-trunk-lane` reference' },
      { re: /operatorAuthorized/, label: '`operatorAuthorized` field' },
      { re: /mergeMethod/, label: '`mergeMethod` field' },
      { re: /required checks/i, label: 'required-check verification' },
      { re: /#908/, label: '#908 cross-reference' },
      // #1381 — delivery and incident authority settings.
      { re: /### Delivery and incident authority/, label: 'delivery authority heading' },
      { re: /current-head provider action/i, label: 'current-head provider action' },
      { re: /historical\s+receipt\s+recovery/i, label: 'historical no-action recovery' },
      { re: /canonical digest/i, label: 'canonical incident digest' },
    ],
    forbidden: [
      { re: /"mechanism": "gh-auto-merge"/, label: 'retired configured mechanism' },
      { re: /runs? `gh pr merge[^`]*--auto/i, label: 'retired auto-merge instruction' },
    ],
  },
  {
    rel: 'docs/guides/architecture-overview.md',
    required: [
      { re: /Delivery authority and incident reconciliation/, label: 'delivery authority heading' },
      { re: /accepted SHA/i, label: 'immutable accepted SHA' },
      { re: /exact accepted-head/i, label: 'exact accepted-head PR selection' },
      { re: /timestamp normalization/i, label: 'adapter timestamp normalization' },
      { re: /strict core parsing/i, label: 'strict core timestamp parsing' },
      { re: /record readback/i, label: 'incident record readback' },
    ],
    forbidden: [],
  },
];

// Check every spec against docs rooted at `root`. Returns a flat list of
// human-readable violation strings (empty when all anchors hold).
export function lintDocAnchors(root = REPO_ROOT) {
  const offenders = [];
  for (const spec of DOC_ANCHOR_SPECS) {
    let doc;
    try {
      doc = readFileSync(path.join(root, spec.rel), 'utf8');
    } catch (err) {
      offenders.push(`${spec.rel}: cannot read (${err.code || err.message})`);
      continue;
    }
    for (const { re, label } of spec.required) {
      if (!re.test(doc)) offenders.push(`${spec.rel}: missing anchor — ${label} (${re})`);
    }
    for (const { re, label } of spec.forbidden) {
      if (re.test(doc)) offenders.push(`${spec.rel}: forbidden anchor present — ${label} (${re})`);
    }
  }
  return offenders;
}

// Self-execute only when invoked directly, so importing the module for a test
// does not run the process-exiting path.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const offenders = lintDocAnchors();
  if (offenders.length) {
    process.stderr.write(`lint:doc-anchors — ${offenders.length} violation(s):\n`);
    for (const o of offenders) process.stderr.write(`  ${o}\n`);
    process.stderr.write(
      `\nFix: restore the anchor in the named guide (these document #912's shipped ` +
        `Full-Auto merge + two-lane DoD behavior); do not weaken the lint.\n`
    );
    process.exit(1);
  }
  const total = DOC_ANCHOR_SPECS.reduce((n, s) => n + s.required.length + s.forbidden.length, 0);
  console.log(
    `lint:doc-anchors — ${total} anchor(s) across ${DOC_ANCHOR_SPECS.length} doc(s) clean`
  );
}
