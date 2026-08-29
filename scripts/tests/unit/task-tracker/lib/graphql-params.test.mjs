#!/usr/bin/env node
// @story #3
// Verifies fetchSubIssues / fetchParentIssue / getIssueBoardState use
// JSON-on-stdin GraphQL via the shared `gql()` helper:
//   - argv is ['api','graphql','--input','-']
//   - stdin is a JSON object {query, variables} where variables.owner/repo/issue
//     are typed correctly (strings for owner/repo, number for issue)
//
// Strategy: spawn a child node that
//   1. puts a fake `gh` shim at the front of PATH that records argv + stdin as JSON
//   2. imports task-tracker.mjs (which exports the three functions) and calls each
// Then this parent process inspects the captured calls.

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const TASK_TRACKER = path.resolve(__dir, '../../../task-tracker/task-tracker.mjs');

const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-graphql-params-'));
try {
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({ repo: 'test-owner/test-repo', projectId: 'PVT_test' }, null, 2)
  );

  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir, { recursive: true });
  const callsLog = path.join(sandbox, 'gh-calls.log');
  const ghShim = path.join(binDir, 'gh');
  // Each invocation appends one JSON line: {argv, stdin}.
  writeFileSync(
    ghShim,
    `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
let stdin = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) stdin += chunk;
appendFileSync(${JSON.stringify(callsLog)}, JSON.stringify({ argv: process.argv.slice(2), stdin }) + '\\n');
process.stdout.write(JSON.stringify({ data: { repository: { issue: { subIssues: { nodes: [] }, parent: null, projectItems: { nodes: [] } } } } }));
`
  );
  chmodSync(ghShim, 0o755);

  const driver = path.join(sandbox, 'driver.mjs');
  writeFileSync(
    driver,
    `
import * as tt from ${JSON.stringify(TASK_TRACKER)};
await tt.fetchSubIssues(42);
await tt.fetchParentIssue(42);
await tt.getIssueBoardState(42);
`
  );

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    AITM_GH_TEST_DOUBLE_BIN: binDir,
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
    TT_SKIP_NETWORK: '',
  };

  await pexec('node', [driver], { env, timeout: 15000 });

  const lines = readFileSync(callsLog, 'utf8').trim().split('\n').filter(Boolean);
  assert.equal(lines.length, 3, `expected 3 gh invocations, got ${lines.length}`);

  const labels = ['fetchSubIssues', 'fetchParentIssue', 'getIssueBoardState'];
  lines.forEach((line, i) => {
    const { argv, stdin } = JSON.parse(line);
    const label = labels[i];

    assert.deepEqual(
      argv,
      ['api', 'graphql', '--input', '-'],
      `${label}: argv must be ['api','graphql','--input','-'], got ${JSON.stringify(argv)}`
    );

    assert.ok(stdin && stdin.length > 0, `${label}: stdin must contain the JSON payload`);
    const payload = JSON.parse(stdin);
    assert.ok(typeof payload.query === 'string', `${label}: payload.query must be a string`);
    assert.ok(
      payload.variables && typeof payload.variables === 'object',
      `${label}: payload.variables must be an object`
    );

    const body = payload.query;
    assert.ok(
      !body.includes('${'),
      `${label}: query body must not contain '\${' (interpolation). Body was:\n${body}`
    );
    assert.match(body, /\$owner:\s*String!/, `${label}: body must declare $owner: String!`);
    assert.match(body, /\$repo:\s*String!/, `${label}: body must declare $repo: String!`);
    assert.match(body, /\$issue:\s*Int!/, `${label}: body must declare $issue: Int!`);

    const v = payload.variables;
    assert.equal(v.owner, 'test-owner', `${label}: variables.owner mismatch`);
    assert.equal(v.repo, 'test-repo', `${label}: variables.repo mismatch`);
    assert.equal(v.issue, 42, `${label}: variables.issue mismatch`);
    assert.equal(typeof v.issue, 'number', `${label}: variables.issue must be a JSON number`);
  });

  console.log('graphql-params.test.mjs: all passed');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
