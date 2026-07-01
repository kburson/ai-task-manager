// #674 — "New Automated Tests" comment, posted when Develop reaches
// CODE_COMPLETE (i.e. the develop→test promotion succeeds).
//
// Diff basis: the `### 🔗 Commits` trail comment already required by
// `gateCodeComplete` (code-complete-gate.mjs) records every SHA committed
// during this issue's Develop stage. Diffing each of those SHAs against its
// parent (`git show <sha> -- '*.test.mjs'`) captures exactly the test-file
// changes made for this issue — unlike a working-tree-vs-HEAD diff, which is
// empty by the time this hook fires (the dirty-file check already requires a
// clean tree). Test names are parsed from added (`+`) lines only, so both
// brand-new `test(...)` calls and edited bodies of existing ones (which
// re-emit the `test('name', ...)` line as an addition) are picked up.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findCommitTrailComment, parseCommitShas } from './code-complete-gate.mjs';

const pexec = promisify(execFile);

export const NEW_TESTS_HEADING = '## New Automated Tests';

const FILE_HEADER_RE = /^\+\+\+ b\/(.+)$/;
const TEST_DECL_RE = /^\+\s*test(?:\.skip|\.only|\.todo)?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/;

export function parseTestEntriesFromDiff(diffText) {
  const entries = [];
  let currentFile = null;
  for (const line of String(diffText || '').split('\n')) {
    const fileMatch = FILE_HEADER_RE.exec(line);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    const declMatch = TEST_DECL_RE.exec(line);
    if (declMatch && currentFile) {
      entries.push({ file: currentFile, name: declMatch[2] });
    }
  }
  return entries;
}

async function defaultShowShaTestDiff(sha, { cwd } = {}) {
  const { stdout } = await pexec('git', ['show', sha, '--', '*.test.mjs'], {
    cwd,
    timeout: 15000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

async function defaultListComments({ cfg, issueNumber }) {
  const { stdout } = await pexec(
    'gh',
    [
      'issue',
      'view',
      String(issueNumber),
      '-R',
      cfg.repo,
      '--json',
      'comments',
      '--jq',
      '.comments',
    ],
    { timeout: 15000 }
  );
  return JSON.parse(stdout || '[]');
}

async function defaultCreateComment({ cfg, issueNumber, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', cfg.repo, '--body', body], {
    timeout: 15000,
  });
}

export async function collectTestDiffEntries({ shas, cwd, deps = {} } = {}) {
  const showShaTestDiff = deps.showShaTestDiff || defaultShowShaTestDiff;
  const seen = new Set();
  const entries = [];
  for (const sha of shas || []) {
    let diffText = '';
    try {
      diffText = await showShaTestDiff(sha, { cwd });
    } catch {
      continue; // best-effort: a missing/unreachable SHA just contributes nothing
    }
    for (const entry of parseTestEntriesFromDiff(diffText)) {
      const key = `${entry.file}::${entry.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
    }
  }
  return entries;
}

export function buildNewAutomatedTestsComment(entries) {
  if (!entries || entries.length === 0) return null;
  const byFile = new Map();
  for (const { file, name } of entries) {
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(name);
  }
  const lines = [NEW_TESTS_HEADING, ''];
  for (const [file, names] of byFile) {
    lines.push(`- \`${file}\``);
    for (const name of names) {
      lines.push(`  - ${name}`);
    }
  }
  return lines.join('\n');
}

export async function postNewAutomatedTestsComment({ cfg, issueNumber, cwd, deps = {} } = {}) {
  if (!cfg?.repo) throw new Error('postNewAutomatedTestsComment: cfg.repo is required');
  if (!issueNumber) throw new Error('postNewAutomatedTestsComment: issueNumber is required');

  const listComments = deps.listComments || defaultListComments;
  const createComment = deps.createComment || defaultCreateComment;

  const comments = await listComments({ cfg, issueNumber });
  const trail = findCommitTrailComment(comments);
  if (!trail) return { status: 'no-commits' };

  const shas = parseCommitShas(trail.body);
  if (shas.length === 0) return { status: 'no-commits' };

  if (comments.some((c) => String(c.body || '').startsWith(NEW_TESTS_HEADING))) {
    return { status: 'duplicate' };
  }

  const entries = await collectTestDiffEntries({ shas, cwd, deps });
  if (entries.length === 0) return { status: 'no-tests' };

  const body = buildNewAutomatedTestsComment(entries);
  await createComment({ cfg, issueNumber, body });
  return { status: 'posted', entries };
}
