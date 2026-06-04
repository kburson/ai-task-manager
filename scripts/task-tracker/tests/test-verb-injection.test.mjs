#!/usr/bin/env node
// E2E: drive `/task test` against an issue body that contains a malicious
// backtick-wrapped verification command. Asserts:
//   1. The malicious payload is REJECTED by the allowlist validator — no shell side effect.
//   2. CLI exits non-zero (failures present).
//   3. The posted failure comment names the rejection reason ("forbidden semicolon").
//   4. No `aitm-dod-verified` marker is written to the issue body.
//
// Strategy: stand up a sandbox project + fake `gh` + fake `git` + stubbed
// `npm` (since /task test calls `npm ci`) and invoke the CLI via
// `node task-tracker.mjs test #999`. The gh shim records any comment body
// and any body-file write to side files we can inspect.

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dir, '..', 'task-tracker.mjs');

const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-test-injection-'));
try {
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({ repo: 'test-owner/test-repo', projectId: 'PVT_test' }, null, 2)
  );
  // seedWorktree requires these to exist in the parent .ai-task-manager/.
  writeFileSync(path.join(sandbox, '.ai-task-manager', 'pickup-directive.md'), '');
  writeFileSync(path.join(sandbox, '.ai-task-manager', 'definition-of-done.md'), '');
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json'),
    JSON.stringify({ active: '#999', lastActive: '#999', entryStartTs: null, wordsAtEntryStart: 0 })
  );
  mkdirSync(path.join(sandbox, 'scripts'), { recursive: true });

  const pwnedMarker = path.join(sandbox, 'PWNED.txt');

  const fixtureBody = [
    '## Verification Commands',
    '',
    '- [ ] `node --version`',
    `- [ ] \`node x; touch ${pwnedMarker}\``,
    '',
  ].join('\n');

  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir, { recursive: true });

  // git shim: stub worktree add/remove + rev-parse HEAD. worktree add creates
  // the target dir so existsSync sees it; worktree remove deletes it.
  const headSha = 'abcdef1234567890abcdef1234567890abcdef12';
  const gitShim = path.join(binDir, 'git');
  writeFileSync(
    gitShim,
    `#!/usr/bin/env node
import { mkdirSync, rmSync } from 'node:fs';
const argv = process.argv.slice(2);
const joined = argv.join(' ');
if (joined === 'rev-parse HEAD') {
  process.stdout.write(${JSON.stringify(`${headSha}\n`)});
  process.exit(0);
}
if (argv[0] === 'worktree' && argv[1] === 'add') {
  // last positional that isn't HEAD/--detach is the path
  const wt = argv.find((a, i) => i >= 2 && a !== '--detach' && a !== 'HEAD');
  if (wt) mkdirSync(wt, { recursive: true });
  process.exit(0);
}
if (argv[0] === 'worktree' && argv[1] === 'remove') {
  const wt = argv[argv.length - 1];
  try { rmSync(wt, { recursive: true, force: true }); } catch {}
  process.exit(0);
}
process.exit(0);
`
  );
  chmodSync(gitShim, 0o755);

  // npm shim: stub `npm ci` — no-op success.
  const npmShim = path.join(binDir, 'npm');
  writeFileSync(npmShim, `#!/usr/bin/env node\nprocess.exit(0);\n`);
  chmodSync(npmShim, 0o755);

  const recordedBodyPath = path.join(sandbox, 'recorded-body.md');
  const recordedCommentPath = path.join(sandbox, 'recorded-comment.md');
  const ghShim = path.join(binDir, 'gh');
  writeFileSync(
    ghShim,
    `#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const argv = process.argv.slice(2);
const log = ${JSON.stringify(path.join(sandbox, 'gh-calls.log'))};
appendFileSync(log, JSON.stringify(argv) + '\\n');

if (argv[0] === 'issue' && argv[1] === 'view' && argv.includes('--json')) {
  // Stateful: return the last-pushed body when present, else the fixture.
  let cur;
  try { cur = readFileSync(${JSON.stringify(recordedBodyPath)}, 'utf8'); }
  catch { cur = ${JSON.stringify(fixtureBody)}; }
  process.stdout.write(cur);
  process.exit(0);
}
if (argv[0] === 'issue' && argv[1] === 'edit') {
  const idx = argv.indexOf('--body-file');
  if (idx >= 0 && argv[idx+1]) {
    const body = readFileSync(argv[idx+1], 'utf8');
    writeFileSync(${JSON.stringify(recordedBodyPath)}, body);
  }
  process.exit(0);
}
if (argv[0] === 'issue' && argv[1] === 'comment') {
  const idx = argv.indexOf('--body');
  if (idx >= 0 && argv[idx+1]) {
    writeFileSync(${JSON.stringify(recordedCommentPath)}, argv[idx+1]);
  }
  process.exit(0);
}
if (argv[0] === 'api' && argv[1] === 'graphql') {
  process.stdout.write(JSON.stringify({ data: { repository: { issue: { subIssues: { nodes: [] }, parent: null, projectItems: { nodes: [] }, comments: { nodes: [] } } } } }));
  process.exit(0);
}
process.exit(0);
`
  );
  chmodSync(ghShim, 0o755);

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
    TT_SKIP_NETWORK: '',
  };

  let stdout = '',
    stderr = '',
    exitCode = 0;
  try {
    const r = await pexec('node', [CLI, 'test', '#999'], { env, timeout: 30000 });
    stdout = r.stdout;
    stderr = r.stderr;
  } catch (err) {
    stdout = err.stdout || '';
    stderr = err.stderr || '';
    exitCode = err.code ?? 1;
  }

  assert.equal(
    existsSync(pwnedMarker),
    false,
    `SECURITY FAIL: malicious payload created marker at ${pwnedMarker}`
  );

  assert.notEqual(exitCode, 0, '/task test must exit non-zero when a VC is rejected');

  assert.ok(existsSync(recordedCommentPath), 'gh issue comment was never called');
  const comment = readFileSync(recordedCommentPath, 'utf8');
  assert.match(
    comment,
    /forbidden semicolon/,
    `expected rejection reason in failure comment; comment was:\n${comment}`
  );

  // The entry marker (aitm-test-started) is stamped BEFORE the VC runs, so the
  // body file will exist on red. What MUST NOT appear is the dod-verified exit
  // marker. Allow either: body file missing, or body file present without
  // aitm-dod-verified.
  if (existsSync(recordedBodyPath)) {
    const writtenBody = readFileSync(recordedBodyPath, 'utf8');
    assert.ok(
      !/aitm-dod-verified:/.test(writtenBody),
      'aitm-dod-verified marker must NOT be stamped on red verification'
    );
    assert.ok(
      /aitm-test-started:/.test(writtenBody),
      'aitm-test-started entry marker must be stamped before VC runs'
    );
  }

  console.log('test-verb-injection.test.mjs: all passed');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
