#!/usr/bin/env node
// @story #137 #1089 #1212
// E2E: drive `/task test` against an issue body that contains a malicious
// backtick-wrapped verification command. Asserts:
//   1. The malicious payload is REJECTED by the allowlist validator — no shell side effect.
//   2. CLI exits non-zero (failures present).
//   3. Entry preflight refuses before comments, body writes, or a sandbox.
//   4. No `aitm-dod-verified` marker is written to the issue body.
//
// Strategy: stand up a sandbox project + fake `gh` + fake `git` and invoke
// the CLI via `node task-tracker.mjs test #999`. The gh shim records any
// comment or body write so the preflight's no-effect boundary is observable.

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
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { inspectTestDeclarations } from '../../../../task-tracker/lib/action-decision/test.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const CLI = path.resolve(__dir, '../../../task-tracker/task-tracker.mjs');

const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-test-injection-'));
try {
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify(
      {
        repo: 'test-owner/test-repo',
        projectId: 'PVT_test',
        kanbanFieldId: 'PVTSSF_status',
        kanbanOptionDevelop: 'option-develop',
        kanbanOptionTest: 'option-test',
      },
      null,
      2
    )
  );
  // Mirror the git-tracked .ai-task-manager/ layout a real checkout carries.
  writeFileSync(path.join(sandbox, '.ai-task-manager', 'pickup-directive.md'), '');
  writeFileSync(path.join(sandbox, '.ai-task-manager', 'definition-of-done.md'), '');
  mkdirSync(path.join(sandbox, '.tmp', 'aitm', 'state'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.tmp', 'aitm', 'state', 'task-tracker-state.json'),
    JSON.stringify({ active: '#999', lastActive: '#999', entryStartTs: null, wordsAtEntryStart: 0 })
  );
  // Stage-aware Test now finalizes Develop and fingerprints both the outer
  // checkout and clean sandbox. Model the tracked lockfile that every real
  // repository worktree contains so this fixture can still reach the command
  // injection boundary it exists to exercise.
  writeFileSync(path.join(sandbox, 'package-lock.json'), '{}\n');
  // The read-only entry preflight resolves the checkout's real Git metadata.
  // Model a detached worktree at the same HEAD returned by the git shim.
  const headSha = 'abcdef1234567890abcdef1234567890abcdef12';
  mkdirSync(path.join(sandbox, '.git'), { recursive: true });
  writeFileSync(path.join(sandbox, '.git', 'HEAD'), `${headSha}\n`);
  mkdirSync(path.join(sandbox, 'scripts'), { recursive: true });

  const pwnedMarker = path.join(sandbox, 'PWNED.txt');

  const fixtureBody = [
    '<!-- aitm-last-known-state: test -->',
    '<!-- aitm-entered-backlog ts="2026-08-31T00:00:00.000Z" -->',
    '<!-- aitm-entered-refine ts="2026-08-31T00:01:00.000Z" -->',
    '<!-- aitm-entered-plan ts="2026-08-31T00:02:00.000Z" -->',
    '<!-- aitm-entered-develop ts="2026-08-31T00:03:00.000Z" -->',
    '<!-- aitm-entered-test ts="2026-08-31T00:04:00.000Z" -->',
    '',
    '## User Story',
    '',
    'As an operator I want a safe Test rerun.',
    '',
    '## Scope',
    '',
    'Reject shell metacharacters in Verification Commands.',
    '',
    '## Acceptance Criteria',
    '',
    '- [x] Safe command executes <!-- aitm-verified cmd="`node --version`" exit="0" sha="abcdef1234567890abcdef1234567890abcdef12" ts="2026-08-31T00:04:00.000Z" key="deadbeef" -->',
    '',
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
  const gitShim = path.join(binDir, 'git');
  writeFileSync(
    gitShim,
    `#!/usr/bin/env node
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
const argv = process.argv.slice(2);
const joined = argv.join(' ');
if (joined === 'rev-parse HEAD') {
  process.stdout.write(${JSON.stringify(`${headSha}\n`)});
  process.exit(0);
}
if (argv[0] === 'worktree' && argv[1] === 'add') {
  // last positional that isn't HEAD/--detach is the path
  const wt = argv.find((a, i) => i >= 2 && a !== '--detach' && a !== 'HEAD');
  if (wt) {
    mkdirSync(wt, { recursive: true });
    copyFileSync(${JSON.stringify(path.join(sandbox, 'package-lock.json'))}, wt + '/package-lock.json');
  }
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

if (argv[0] === 'issue' && argv[1] === 'view' && argv.includes('comments')) {
  process.stdout.write(JSON.stringify([{ body: ${JSON.stringify(`### 🔗 Commits\n\n<!-- aitm-commits: ${headSha} -->\n`)} }]));
  process.exit(0);
}
if (argv[0] === 'issue' && argv[1] === 'view' && argv.includes('--json')) {
  // Stateful: return the last-pushed body when present, else the fixture.
  let cur;
  try { cur = readFileSync(${JSON.stringify(recordedBodyPath)}, 'utf8'); }
  catch { cur = ${JSON.stringify(fixtureBody)}; }
  process.stdout.write(argv.includes('--jq') || argv.includes('-q') ? cur : JSON.stringify({ body: cur }));
  process.exit(0);
}
if (argv[0] === 'issue' && argv[1] === 'edit') {
  const idx = argv.indexOf('--body-file');
  if (idx >= 0 && argv[idx+1]) {
    const src = argv[idx+1];
    if (src === '-') {
      let buf = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => { buf += c; });
      await new Promise((res) => process.stdin.on('end', res));
      writeFileSync(${JSON.stringify(recordedBodyPath)}, buf);
    } else {
      const body = readFileSync(src, 'utf8');
      writeFileSync(${JSON.stringify(recordedBodyPath)}, body);
    }
  }
  process.exit(0);
}
if (argv[0] === 'issue' && argv[1] === 'comment') {
  const idx = argv.indexOf('--body');
  if (idx >= 0 && argv[idx+1]) {
    appendFileSync(${JSON.stringify(recordedCommentPath)}, argv[idx+1] + '\\n');
  }
  process.exit(0);
}
if (argv[0] === 'api' && argv[1] === 'graphql') {
  process.stdout.write(JSON.stringify({ data: { repository: { issue: {
    subIssues: { nodes: [] },
    parent: null,
    assignees: { nodes: [{ login: 'kburson' }] },
    projectItems: { nodes: [{ project: { id: 'PVT_test' }, fieldValueByName: { name: 'Test' } }] },
    comments: { nodes: [] },
    subIssues: { totalCount: 0, nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }
  } } } }));
  process.exit(0);
}
if (argv[0] === 'api' && argv[1] === 'user') {
  process.stdout.write('kburson\\n');
  process.exit(0);
}
process.exit(0);
`
  );
  chmodSync(ghShim, 0o755);

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    AITM_GH_TEST_DOUBLE_BIN: binDir,
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
    TT_SKIP_NETWORK: '',
  };

  let stderr = '',
    exitCode = 0;
  try {
    await pexec('node', [CLI, 'test', '#999'], {
      cwd: sandbox,
      env,
      timeout: 30000,
    });
  } catch (err) {
    stderr = err.stderr || '';
    exitCode = err.code ?? 1;
  }

  assert.equal(
    existsSync(pwnedMarker),
    false,
    `SECURITY FAIL: malicious payload created marker at ${pwnedMarker}`
  );

  assert.notEqual(exitCode, 0, '/task test must exit non-zero when a VC is rejected');
  assert.match(stderr, /entry preflight blocked/);
  assert.match(stderr, /test-verification-command-invalid/);
  const declaration = inspectTestDeclarations(fixtureBody, { projectDir: sandbox });
  assert.equal(declaration.blockers.length, 1);
  assert.match(declaration.blockers[0].args.reason, /forbidden semicolon/);

  const ghCalls = existsSync(path.join(sandbox, 'gh-calls.log'))
    ? readFileSync(path.join(sandbox, 'gh-calls.log'), 'utf8')
    : '(none)';
  assert.equal(existsSync(recordedCommentPath), false, `preflight must not comment: ${ghCalls}`);
  assert.equal(existsSync(recordedBodyPath), false, 'preflight must not write issue body');
  assert.doesNotMatch(ghCalls, /\["issue","edit"/);

  console.log('test-verb-injection.test.mjs: all passed');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
