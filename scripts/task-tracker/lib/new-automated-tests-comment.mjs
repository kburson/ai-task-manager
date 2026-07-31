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

// #684 — legend footer. Without it, a reader cannot tell whether the text after
// `→` in a test title (e.g. `writeField rejects → error`) is the outcome the test
// *asserts* (expected) or an *actual* runtime result. Appended to every generated
// comment so the ambiguity is answered inline.
export const NEW_TESTS_FOOTER =
  '_Each bullet is the verbatim title of a test case added during this issue’s ' +
  'Develop stage, grouped by test file. Read a title as `subject: scenario → ' +
  'expected outcome` — the value after `→` is what the test **asserts** (e.g. ' +
  '`→ error` means the input is expected to throw/reject), not an actual result. ' +
  'All listed tests pass: this comment is posted only after the Develop→Test gate ' +
  'goes green._';

const FILE_HEADER_RE = /^\+\+\+ b\/(.+)$/;
// Matches an added (`+`) test-declaration line for either node:test idiom:
// the `test(` form and the `describe/it` form's `it(` calls (nested `it(`
// included — the leading anchor only requires the verb to follow the diff
// marker + indentation, so an `it(` inside a `describe(` block still matches).
// `describe(` itself is a grouping wrapper, not a test declaration, so it is
// deliberately excluded — the reported entry is the individual `it(` name.
// The `\s*\(` suffix keeps identifiers like `visit(` / `iterate(` from matching.
const TEST_DECL_RE =
  /^\+\s*(?:test|it)(?:\.skip|\.only|\.todo)?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/;

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

async function defaultShowShaTestDiff(sha, { cwd, exec = pexec, env } = {}) {
  const { stdout } = await exec('git', ['show', sha, '--', '*.test.mjs'], {
    cwd,
    env,
    timeout: 15000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

async function defaultListComments({ cfg, issueNumber, exec = pexec, env }) {
  const { stdout } = await exec(
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
    { timeout: 15000, env }
  );
  return JSON.parse(stdout || '[]');
}

async function defaultCreateComment({ cfg, issueNumber, body, exec = pexec, env }) {
  await exec('gh', ['issue', 'comment', String(issueNumber), '-R', cfg.repo, '--body', body], {
    timeout: 15000,
    env,
  });
}

export async function collectTestDiffEntries({ shas, cwd, deps = {} } = {}) {
  const showShaTestDiff = deps.showShaTestDiff || defaultShowShaTestDiff;
  const seen = new Set();
  const entries = [];
  for (const sha of shas || []) {
    let diffText = '';
    try {
      diffText = await showShaTestDiff(sha, { cwd, exec: deps.pexec, env: deps.env });
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
  lines.push('', NEW_TESTS_FOOTER);
  return lines.join('\n');
}

export async function postNewAutomatedTestsComment({ cfg, issueNumber, cwd, deps = {} } = {}) {
  if (!cfg?.repo) throw new Error('postNewAutomatedTestsComment: cfg.repo is required');
  if (!issueNumber) throw new Error('postNewAutomatedTestsComment: issueNumber is required');

  const listComments = deps.listComments || defaultListComments;
  const createComment = deps.createComment || defaultCreateComment;

  const comments = await listComments({ cfg, issueNumber, exec: deps.pexec, env: deps.env });
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
  const create = () =>
    createComment({ cfg, issueNumber, body, exec: deps.pexec, env: deps.env });
  if (typeof deps.withGovernedEffect === 'function') {
    await deps.withGovernedEffect(
      {
        issueId: String(issueNumber),
        operation: 'evidence-mutation',
        heartbeat: true,
      },
      create
    );
  } else {
    await create();
  }
  return { status: 'posted', entries };
}
