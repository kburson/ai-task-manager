#!/usr/bin/env node
// @story #865
// The `docs-only` issue kind: a commit-bearing kind whose functional-test DoD
// item is diff-conditional — "the kind declares, the diff decides." A
// docs-only issue drops the `tests` item (and its derived `npm test` +
// `npm run test:slow` verification commands) ONLY when the actual
// `trunk...HEAD` diff is provably documentation-only; default-deny keeps the
// suite for any unclassified path.
//
// This file is the single verifier bound to all eight ACs of #865:
//   AC1  `docs-only` ∈ VALID_KINDS and ∉ NO_COMMIT_KINDS
//   AC2  `/task kind <N> docs-only` marker round-trips through parseIssueKind
//   AC3  docs-only kind + docs-only diff drops the tests item AND its suite VCs
//   AC4  docs-only kind + any non-doc path still requires the tests item
//   AC5  unrecognized path counts as functional (default-deny), unknown extension
//   AC6  lint + format DoD items remain required for docs-only kind
//   AC7  commit-trace attributes a docs-only issue like code (not a no-commit kind)
//   AC8  workflow.md documents the docs-only kind and the diff-decides rule

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import {
  VALID_KINDS,
  NO_COMMIT_KINDS,
  DEFAULT_KIND,
  normalizeKind,
  parseIssueKind,
  isNoCommitKind,
  setIssueKindMarker,
} from '../../../lib/issue-kind.mjs';
import {
  isDocPath,
  diffIsDocsOnly,
  docsKindDropsTests,
  filterDodForKind,
  filterDodForKindAndDiff,
} from '../../../lib/dod-kind-filter.mjs';

const pexec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const SCRIPT = path.resolve(HERE, '..', '..', 'preflight-issue.mjs');
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..');
const RUNTIME_DOD = path.join(REPO_ROOT, '.ai-task-manager', 'templates', 'definition-of-done.md');
const WORKFLOW_DOC = path.join(REPO_ROOT, 'docs', 'guides', 'workflow.md');
const RUNTIME_DOD_TEXT = readFileSync(RUNTIME_DOD, 'utf8').replace(/\s+$/, '');

function makeFixture() {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'docs-only-kind-dod-'));
  const scope = path.join(dir, 'scope.md');
  const ac = path.join(dir, 'ac.md');
  const meta = path.join(dir, 'meta.md');
  writeFileSync(scope, 'Scope.\n', 'utf8');
  writeFileSync(
    ac,
    '- [ ] Something happens. <!-- aitm-verified cmd="`node --test x.mjs`" -->\n',
    'utf8'
  );
  writeFileSync(meta, '- **Size**: S\n', 'utf8');
  return { dir, scope, ac, meta };
}

function writeChangedPaths(fx, paths) {
  const p = path.join(fx.dir, 'changed.txt');
  writeFileSync(p, paths.join('\n') + '\n', 'utf8');
  return p;
}

async function runPreflight(args) {
  try {
    const { stdout, stderr } = await pexec('node', [SCRIPT, ...args]);
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

function subIssueArgs(fx, extra = []) {
  return [
    '--shape',
    'sub-issue',
    '--parent',
    '1',
    '--scope-file',
    fx.scope,
    '--ac-file',
    fx.ac,
    '--plan-metadata-file',
    fx.meta,
    ...extra,
  ];
}

// ---------------------------------------------------------------------------
// AC1 — `docs-only` is a member of VALID_KINDS and NOT NO_COMMIT_KINDS
// ---------------------------------------------------------------------------
describe('AC1: docs-only is a commit-bearing valid kind', () => {
  it('docs-only ∈ VALID_KINDS', () => {
    assert.ok(VALID_KINDS.has('docs-only'), 'docs-only must be a valid kind');
  });
  it('docs-only ∉ NO_COMMIT_KINDS', () => {
    assert.ok(!NO_COMMIT_KINDS.has('docs-only'), 'docs-only must NOT be a no-commit kind');
  });
  it('the four no-commit kinds are unchanged', () => {
    assert.deepEqual([...NO_COMMIT_KINDS].sort(), ['audit', 'epic', 'research', 'spike']);
  });
});

// ---------------------------------------------------------------------------
// AC2 — the kind marker round-trips (what `/task kind <N> docs-only` writes/reads)
// ---------------------------------------------------------------------------
describe('AC2: docs-only kind marker round-trips', () => {
  it('normalizeKind accepts docs-only (case/space insensitive)', () => {
    assert.equal(normalizeKind('docs-only'), 'docs-only');
    assert.equal(normalizeKind('  DOCS-ONLY '), 'docs-only');
  });
  it('setIssueKindMarker → parseIssueKind round-trips docs-only', () => {
    const body = 'Body.\n\n## AITM Progress Markers\n';
    const marked = setIssueKindMarker(body, 'docs-only');
    assert.match(marked, /aitm-issue-kind kind="docs-only"/);
    assert.equal(parseIssueKind(marked), 'docs-only');
  });
  it('code (default) still writes no marker', () => {
    const body = 'Body.\n\n## AITM Progress Markers\n';
    assert.equal(parseIssueKind(setIssueKindMarker(body, 'code')), DEFAULT_KIND);
  });
});

// ---------------------------------------------------------------------------
// Pure path-classifier + filter helpers (support AC3/AC4/AC5)
// ---------------------------------------------------------------------------
describe('diff classifier: isDocPath / diffIsDocsOnly / docsKindDropsTests', () => {
  it('isDocPath: .md, .markdown, and docs/ dirs are docs; code is not', () => {
    assert.ok(isDocPath('docs/guides/workflow.md'));
    assert.ok(isDocPath('README.md'));
    assert.ok(isDocPath('NOTES.markdown'));
    assert.ok(isDocPath('pkg/docs/adr/0001.txt')); // under a docs/ dir
    assert.ok(!isDocPath('scripts/task-tracker/lib/issue-kind.mjs'));
    assert.ok(!isDocPath('src/app.ts'));
    assert.ok(!isDocPath('notes.xyz'));
    assert.ok(!isDocPath(''));
  });
  it('diffIsDocsOnly: empty set is NOT docs-only (default-deny)', () => {
    assert.equal(diffIsDocsOnly([]), false);
    assert.equal(diffIsDocsOnly(null), false);
  });
  it('diffIsDocsOnly: all-doc → true; any non-doc → false', () => {
    assert.equal(diffIsDocsOnly(['docs/a.md', 'README.md']), true);
    assert.equal(diffIsDocsOnly(['docs/a.md', 'scripts/x.mjs']), false);
    assert.equal(diffIsDocsOnly(['notes.xyz']), false);
  });
  it('docsKindDropsTests: only docs-only kind + provably docs-only diff', () => {
    assert.equal(docsKindDropsTests('docs-only', ['docs/a.md']), true);
    assert.equal(docsKindDropsTests('docs-only', ['scripts/x.mjs']), false);
    assert.equal(docsKindDropsTests('docs-only', []), false);
    assert.equal(docsKindDropsTests('code', ['docs/a.md']), false);
    assert.equal(docsKindDropsTests('spike', ['docs/a.md']), false);
  });
});

// ---------------------------------------------------------------------------
// AC3 — docs-only kind + docs-only diff drops the tests item AND its suite VCs
// ---------------------------------------------------------------------------
describe('AC3: docs-only diff drops the functional tests item', () => {
  it('filterDodForKindAndDiff drops dod:functional:tests for docs-only diff', () => {
    const filtered = filterDodForKindAndDiff(RUNTIME_DOD_TEXT, 'docs-only', [
      'docs/guides/workflow.md',
      'README.md',
    ]);
    assert.doesNotMatch(filtered, /dod:functional:tests/);
  });

  it('preflight --kind docs-only with a docs-only changed-paths-file omits tests + suite VCs', async () => {
    const fx = makeFixture();
    try {
      const cp = writeChangedPaths(fx, ['docs/guides/workflow.md', 'README.md']);
      const r = await runPreflight(
        subIssueArgs(fx, ['--kind', 'docs-only', '--changed-paths-file', cp])
      );
      assert.equal(r.code, 0, r.stderr);
      assert.doesNotMatch(r.stdout, /dod:functional:tests/);
      assert.doesNotMatch(r.stdout, /^- \[ \] `npm test` <!-- id=\d+ -->\s*$/m);
      assert.doesNotMatch(r.stdout, /^- \[ \] `npm run test:slow` <!-- id=\d+ -->\s*$/m);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// AC4 — docs-only kind + any non-doc path still requires the tests item
// ---------------------------------------------------------------------------
describe('AC4: a mixed (non-doc) diff keeps the tests item for docs-only kind', () => {
  it('filterDodForKindAndDiff keeps tests when a code path is present', () => {
    const filtered = filterDodForKindAndDiff(RUNTIME_DOD_TEXT, 'docs-only', [
      'docs/guides/workflow.md',
      'scripts/task-tracker/lib/issue-kind.mjs',
    ]);
    assert.match(filtered, /dod:functional:tests/);
  });

  it('preflight --kind docs-only with a functional path keeps tests + suite VCs', async () => {
    const fx = makeFixture();
    try {
      const cp = writeChangedPaths(fx, ['docs/guides/workflow.md', 'scripts/foo.mjs']);
      const r = await runPreflight(
        subIssueArgs(fx, ['--kind', 'docs-only', '--changed-paths-file', cp])
      );
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stdout, /dod:functional:tests/);
      assert.match(r.stdout, /^- \[ \] `npm test` <!-- id=\d+ -->\s*$/m);
      assert.match(r.stdout, /^- \[ \] `npm run test:slow` <!-- id=\d+ -->\s*$/m);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });

  it('docs-only kind WITHOUT a changed-paths-file keeps tests (safe default)', async () => {
    const fx = makeFixture();
    try {
      const r = await runPreflight(subIssueArgs(fx, ['--kind', 'docs-only']));
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stdout, /dod:functional:tests/);
      assert.match(r.stdout, /^- \[ \] `npm test` <!-- id=\d+ -->\s*$/m);
      assert.match(r.stdout, /^- \[ \] `npm run test:slow` <!-- id=\d+ -->\s*$/m);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// AC5 — an unrecognized path counts as functional (default-deny)
// ---------------------------------------------------------------------------
describe('AC5: an unknown extension counts as functional (default-deny)', () => {
  it('filterDodForKindAndDiff keeps tests for an unknown extension', () => {
    const filtered = filterDodForKindAndDiff(RUNTIME_DOD_TEXT, 'docs-only', ['release-notes.rst']);
    assert.match(filtered, /dod:functional:tests/);
  });

  it('preflight --kind docs-only with only an unknown-extension path keeps tests', async () => {
    const fx = makeFixture();
    try {
      const cp = writeChangedPaths(fx, ['release-notes.rst']);
      const r = await runPreflight(
        subIssueArgs(fx, ['--kind', 'docs-only', '--changed-paths-file', cp])
      );
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stdout, /dod:functional:tests/);
      assert.match(r.stdout, /^- \[ \] `npm test` <!-- id=\d+ -->\s*$/m);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// AC6 — lint + format DoD items remain required for docs-only kind
// ---------------------------------------------------------------------------
describe('AC6: lint/format items survive for docs-only kind', () => {
  it('the lint+format line survives even when tests is dropped', () => {
    const filtered = filterDodForKindAndDiff(RUNTIME_DOD_TEXT, 'docs-only', ['docs/a.md']);
    assert.match(filtered, /dod:functional:lint/);
    assert.match(filtered, /Lint and format checks pass/);
    // and the other kind-agnostic Functional items survive too
    for (const key of ['acs', 'checkboxes']) {
      assert.match(filtered, new RegExp(`dod:functional:${key}`), `${key} must survive`);
    }
  });

  it('preflight docs-only render still emits the lint item', async () => {
    const fx = makeFixture();
    try {
      const cp = writeChangedPaths(fx, ['docs/a.md']);
      const r = await runPreflight(
        subIssueArgs(fx, ['--kind', 'docs-only', '--changed-paths-file', cp])
      );
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stdout, /dod:functional:lint/);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// AC7 — commit-trace attributes a docs-only issue exactly as for code:
// docs-only is a commit-bearing kind, so isNoCommitKind is false and the
// develop→test gate keeps the `### 🔗 Commits` trail requirement (never the
// no-commit deliverable lane).
// ---------------------------------------------------------------------------
describe('AC7: docs-only is commit-bearing (attributed like code)', () => {
  it('isNoCommitKind is false for a docs-only-marked body', () => {
    const body = setIssueKindMarker('Body.\n\n## AITM Progress Markers\n', 'docs-only');
    assert.equal(isNoCommitKind(body), false);
  });
  it('isNoCommitKind stays true for the no-commit kinds', () => {
    for (const k of ['audit', 'research', 'spike', 'epic']) {
      const body = setIssueKindMarker('Body.\n\n## AITM Progress Markers\n', k);
      assert.equal(isNoCommitKind(body), true, `kind=${k}`);
    }
  });
});

// ---------------------------------------------------------------------------
// AC8 — workflow.md documents the docs-only kind and the diff-decides rule
// ---------------------------------------------------------------------------
describe('AC8: workflow.md documents docs-only kind + diff-decides rule', () => {
  it('names the docs-only kind, the #865 story, and the decide-by-diff principle', () => {
    const doc = readFileSync(WORKFLOW_DOC, 'utf8');
    assert.match(doc, /docs-only/i);
    assert.match(doc, /the kind declares, the diff decides/i);
    assert.match(doc, /default-deny/i);
    assert.match(doc, /#865/);
  });
});

// ---------------------------------------------------------------------------
// Back-compat: filterDodForKindAndDiff is byte-identical to filterDodForKind for
// every non-docs-only kind and for a docs-only kind with no/empty diff.
// ---------------------------------------------------------------------------
describe('back-compat: no conditional drop off the docs-only path', () => {
  it('code render is identical to filterDodForKind', () => {
    assert.equal(
      filterDodForKindAndDiff(RUNTIME_DOD_TEXT, 'code', ['docs/a.md']),
      filterDodForKind(RUNTIME_DOD_TEXT, 'code')
    );
  });
  it('docs-only kind with a null/empty diff equals filterDodForKind (keeps tests)', () => {
    assert.equal(
      filterDodForKindAndDiff(RUNTIME_DOD_TEXT, 'docs-only', null),
      filterDodForKind(RUNTIME_DOD_TEXT, 'docs-only')
    );
    assert.match(
      filterDodForKindAndDiff(RUNTIME_DOD_TEXT, 'docs-only', []),
      /dod:functional:tests/
    );
  });
});
