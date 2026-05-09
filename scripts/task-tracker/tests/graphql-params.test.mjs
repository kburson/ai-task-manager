#!/usr/bin/env node
// Verifies fetchSubIssues / fetchParentIssue / getIssueBoardState use
// parameterized GraphQL via the shared `gql()` helper:
//   - argv contains -F owner=, -F repo=, -F issue=
//   - the query body passed via -f query=... contains no `${` (no interpolation)
//
// Strategy: spawn a child node that
//   1. puts a fake `gh` shim at the front of PATH that records its argv as JSON
//   2. imports task-tracker.mjs (which exports the three functions) and calls each
// Then this parent process inspects the captured argv.

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const TASK_TRACKER = path.resolve(__dir, '..', 'task-tracker.mjs');

const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-graphql-params-'));
try {
  // 1. project config so loadConfig() succeeds with a known repo
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({ repo: 'test-owner/test-repo', projectId: 'PVT_test' }, null, 2)
  );

  // 2. fake gh on PATH that records argv and returns a minimal-but-valid body
  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir, { recursive: true });
  const argvLog = path.join(sandbox, 'gh-argv.log');
  const ghShim = path.join(binDir, 'gh');
  // Each invocation appends one JSON line containing the full argv.
  // Returns a stub data envelope so JSON.parse downstream is happy.
  writeFileSync(ghShim, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(argvLog)}, JSON.stringify(process.argv.slice(2)) + '\\n');
process.stdout.write(JSON.stringify({ data: { repository: { issue: { subIssues: { nodes: [] }, parent: null, projectItems: { nodes: [] } } } } }));
`);
  chmodSync(ghShim, 0o755);

  // 3. driver script that imports task-tracker.mjs (NOT as main) and exercises the three fns
  const driver = path.join(sandbox, 'driver.mjs');
  writeFileSync(driver, `
import * as tt from ${JSON.stringify(TASK_TRACKER)};
await tt.fetchSubIssues(42);
await tt.fetchParentIssue(42);
await tt.getIssueBoardState(42);
`);

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
    // Important: do NOT set TT_SKIP_NETWORK — those flags short-circuit the calls.
    TT_SKIP_NETWORK: '',
  };

  await pexec('node', [driver], { env, timeout: 15000 });

  const lines = readFileSync(argvLog, 'utf8').trim().split('\n').filter(Boolean);
  assert.equal(lines.length, 3, `expected 3 gh invocations, got ${lines.length}`);

  const labels = ['fetchSubIssues', 'fetchParentIssue', 'getIssueBoardState'];
  lines.forEach((line, i) => {
    const argv = JSON.parse(line);
    const label = labels[i];

    // Always begins with: api graphql -f query=<body>
    assert.equal(argv[0], 'api', `${label}: argv[0] should be 'api'`);
    assert.equal(argv[1], 'graphql', `${label}: argv[1] should be 'graphql'`);
    assert.equal(argv[2], '-f', `${label}: argv[2] should be '-f'`);
    assert.match(argv[3], /^query=/, `${label}: argv[3] should be query=...`);

    const body = argv[3].slice('query='.length);
    assert.ok(!body.includes('${'),
      `${label}: query body must not contain '\${' (interpolation). Body was:\n${body}`);
    assert.match(body, /\$owner:\s*String!/, `${label}: body must declare $owner: String!`);
    assert.match(body, /\$repo:\s*String!/, `${label}: body must declare $repo: String!`);
    assert.match(body, /\$issue:\s*Int!/, `${label}: body must declare $issue: Int!`);

    // Variable bindings must be present as -F key=value pairs.
    const fFlags = [];
    for (let j = 0; j < argv.length - 1; j++) {
      if (argv[j] === '-F') fFlags.push(argv[j + 1]);
    }
    assert.ok(fFlags.some(s => s.startsWith('owner=')), `${label}: missing -F owner= in ${JSON.stringify(argv)}`);
    assert.ok(fFlags.some(s => s.startsWith('repo=')),  `${label}: missing -F repo= in ${JSON.stringify(argv)}`);
    assert.ok(fFlags.some(s => s.startsWith('issue=')), `${label}: missing -F issue= in ${JSON.stringify(argv)}`);

    // Sanity: the actual values bound match what we passed.
    assert.ok(fFlags.includes('owner=test-owner'), `${label}: owner binding mismatch (${fFlags.join(',')})`);
    assert.ok(fFlags.includes('repo=test-repo'),   `${label}: repo binding mismatch  (${fFlags.join(',')})`);
    assert.ok(fFlags.includes('issue=42'),         `${label}: issue binding mismatch (${fFlags.join(',')})`);
  });

  console.log('graphql-params.test.mjs: all passed');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
