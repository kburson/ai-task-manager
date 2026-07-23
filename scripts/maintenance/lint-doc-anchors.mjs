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
    ],
    forbidden: [{ re: /~130s/, label: 'stale `~130s` single-command timing figure' }],
  },
  {
    rel: 'docs/guides/settings-guide.md',
    // #908 — fullAutoMerge config block + required repo/branch-protection settings.
    required: [
      { re: /### `fullAutoMerge`/, label: '`fullAutoMerge` config block heading' },
      { re: /gh-auto-merge/, label: '`gh-auto-merge` classifier reference' },
      { re: /local-trunk-lane/, label: '`local-trunk-lane` reference' },
      { re: /operatorAuthorized/, label: '`operatorAuthorized` field' },
      { re: /mergeMethod/, label: '`mergeMethod` field' },
      { re: /Allow auto-merge/i, label: '"Allow auto-merge" repo setting' },
      { re: /branch-protection/i, label: 'branch-protection requirement' },
      { re: /required status check/i, label: 'required status check requirement' },
      { re: /#908/, label: '#908 cross-reference' },
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
