#!/usr/bin/env node
// E2E: drive `/task review` against an issue body that contains a malicious
// backtick-wrapped verification command. Asserts:
//   1. The malicious command is REJECTED by the validator (no shell side effect).
//   2. The malicious checkbox stays unchecked.
//   3. The clean command's checkbox is auto-checked (golden path preserved).
//   4. CLI exits non-zero (failures present).
//   5. The exact rejection log line is emitted.
//
// Strategy: stand up a sandbox project, install a fake `gh` shim that:
//   - on `issue view ... --json body` returns a fixture body via stdout
//   - on `issue edit ... --body-file <path>` records the new body to a side file
//   - on anything else (timing comment post, move-state graphql, etc.) returns
//     a benign empty/ok stub so the harness keeps moving.
// We invoke the CLI via `node task-tracker.mjs review #999` with that shim on PATH.

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dir, '..', 'task-tracker.mjs');

const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-review-injection-'));
try {
  // Project config
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({ repo: 'test-owner/test-repo', projectId: 'PVT_test' }, null, 2)
  );
  // Pre-seed state so review has an active task and skips agent-timing branch
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json'),
    JSON.stringify({ active: '#999', lastActive: '#999', entryStartTs: null, wordsAtEntryStart: 0 })
  );

  // scripts/ dir for project-relative validator branch (not used by malicious case
  // but required so loadConfig + projectDir resolution don't trip).
  mkdirSync(path.join(sandbox, 'scripts'), { recursive: true });

  // Marker that the malicious payload would touch if it ever reached a shell.
  const pwnedMarker = path.join(sandbox, 'PWNED.txt');

  // Fixture issue body: one malicious line + one clean line.
  // The malicious payload is `node x; touch <pwnedMarker>` — under bash -c this
  // would create the marker. The validator MUST reject it on the semicolon.
  // The clean line is `node --version` — it lives in argv-allowlist and is fast.
  const fixtureBody = [
    '## Acceptance Criteria',
    '',
    '- [ ] AC item kept unchecked',
    '',
    '### Verification Commands',
    '',
    '- [ ] `node --version`',
    `- [ ] \`node x; touch ${pwnedMarker}\``,
    '',
  ].join('\n');

  // Fake gh shim
  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir, { recursive: true });
  const recordedBodyPath = path.join(sandbox, 'recorded-body.md');
  const ghShim = path.join(binDir, 'gh');
  writeFileSync(ghShim, `#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const argv = process.argv.slice(2);
const log = ${JSON.stringify(path.join(sandbox, 'gh-calls.log'))};
appendFileSync(log, JSON.stringify(argv) + '\\n');

// issue view <num> -R <repo> --json body
if (argv[0] === 'issue' && argv[1] === 'view' && argv.includes('--json')) {
  process.stdout.write(JSON.stringify({ body: ${JSON.stringify(fixtureBody)} }));
  process.exit(0);
}
// issue edit <num> -R <repo> --body-file <path>
if (argv[0] === 'issue' && argv[1] === 'edit') {
  const idx = argv.indexOf('--body-file');
  if (idx >= 0 && argv[idx+1]) {
    const body = readFileSync(argv[idx+1], 'utf8');
    writeFileSync(${JSON.stringify(recordedBodyPath)}, body);
  }
  process.exit(0);
}
// issue comment ... — used by timing comment poster. Return empty success.
if (argv[0] === 'issue' && argv[1] === 'comment') {
  process.exit(0);
}
// api graphql ... — return minimal envelope
if (argv[0] === 'api' && argv[1] === 'graphql') {
  process.stdout.write(JSON.stringify({ data: { repository: { issue: { subIssues: { nodes: [] }, parent: null, projectItems: { nodes: [] }, comments: { nodes: [] } } } } }));
  process.exit(0);
}
// Default benign success
process.exit(0);
`);
  chmodSync(ghShim, 0o755);

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
    // We want network ON (so we hit the verification block) but our gh shim handles it.
    TT_SKIP_NETWORK: '',
  };

  let stdout = '', stderr = '', exitCode = 0;
  try {
    const r = await pexec('node', [CLI, 'review', '#999'], { env, timeout: 30000 });
    stdout = r.stdout; stderr = r.stderr;
  } catch (err) {
    stdout = err.stdout || ''; stderr = err.stderr || '';
    exitCode = err.code ?? 1;
  }

  // 1. Marker file MUST NOT exist — the payload was never executed.
  assert.equal(existsSync(pwnedMarker), false,
    `SECURITY FAIL: malicious payload created marker at ${pwnedMarker}`);

  // 2. Rejection log line emitted, naming the offending construct.
  const combined = stdout + stderr;
  assert.match(combined, /\[task-tracker\] rejected: forbidden semicolon/,
    `expected rejection log; combined output:\n${combined}`);

  // 3. CLI exited non-zero (failures present → exit 3 path).
  assert.notEqual(exitCode, 0, 'review should fail when verification command is rejected');

  // 4. Recorded body shows malicious checkbox UNCHECKED, clean checkbox CHECKED.
  assert.ok(existsSync(recordedBodyPath), 'gh issue edit was never called');
  const written = readFileSync(recordedBodyPath, 'utf8');
  // Malicious line: still '- [ ]'
  assert.match(written, /- \[ \] `node x; touch /,
    `malicious checkbox should remain unchecked; body was:\n${written}`);
  // Clean line: now '- [x]'
  assert.match(written, /- \[x\] `node --version`/,
    `clean checkbox should be auto-checked; body was:\n${written}`);

  console.log('review-injection.test.mjs: all passed');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
