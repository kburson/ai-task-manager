// @story #1207
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';

const pexec = promisify(execFile);
const SCRIPT = new URL('../../../../gh/project-tether.mjs', import.meta.url).pathname;

function makeHarness() {
  const root = mkdtempProjectIsolated('aitm-project-tether-assigned-');
  const bin = path.join(root, 'bin');
  const shared = path.join(root, '.ai-task-manager');
  const mutationLog = path.join(root, 'mutations.log');
  mkdirSync(bin, { recursive: true });
  mkdirSync(shared, { recursive: true });
  writeFileSync(
    path.join(shared, 'task-tracker.json'),
    JSON.stringify({
      repo: 'o/r',
      projectId: 'P1',
      kanbanFieldId: 'STATUS',
      kanbanOptionAssigned: 'ASSIGNED',
    })
  );
  const gh = path.join(bin, 'gh');
  writeFileSync(
    gh,
    `#!/usr/bin/env node
const fs = require('node:fs');
const mode = process.env.ASSIGNEE_MODE;
const args = process.argv.slice(2);
if (args[0] === 'issue' && args[1] === 'view') {
  if (mode === 'failure') { process.stderr.write('assignee transport unavailable\\n'); process.exit(1); }
  process.stdout.write(JSON.stringify({ assignees: mode === 'present' ? [{ login: 'alice' }] : [] }));
  process.exit(0);
}
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const payload = JSON.parse(input || '{}');
  const query = payload.query || '';
  let data;
  if (query.includes('linkProjectV2ToRepository')) {
    fs.appendFileSync(process.env.MUTATION_LOG, 'link-write\\n');
    data = { linkProjectV2ToRepository: { repository: { nameWithOwner: 'o/r' } } };
  } else if (query.includes('repository(owner:') && query.includes('issue(number:')) {
    data = { repository: { id: 'R1', issue: { id: 'I42', number: 42, title: 'Issue', url: 'u', projectItems: { nodes: [{ id: 'ITEM', project: { id: 'P1', title: 'Board', url: 'p' } }] } } } };
  } else if (query.includes('updateProjectV2ItemFieldValue')) {
    fs.appendFileSync(process.env.MUTATION_LOG, 'status-write\\n');
    data = { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'ITEM' } } };
  } else {
    process.stderr.write('unexpected query: ' + query + '\\n'); process.exit(2);
  }
  process.stdout.write(JSON.stringify({ data }));
});
`
  );
  chmodSync(gh, 0o755);
  return { root, bin, mutationLog };
}

async function runPublicTether(harness, mode) {
  try {
    const result = await pexec(
      process.execPath,
      [SCRIPT, '--issue', '42', '--status', 'assigned'],
      {
        cwd: harness.root,
        env: {
          ...process.env,
          PATH: `${harness.bin}:${process.env.PATH}`,
          AI_TASK_MANAGER_PROJECT_DIR: harness.root,
          ASSIGNEE_MODE: mode,
          MUTATION_LOG: harness.mutationLog,
        },
      }
    );
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      exitCode: Number(error.code) || 1,
      stdout: String(error.stdout || ''),
      stderr: String(error.stderr || ''),
    };
  }
}

function writes(harness) {
  try {
    return readFileSync(harness.mutationLog, 'utf8').trim().split(/\n+/).filter(Boolean);
  } catch {
    return [];
  }
}

test('public project-tether Assigned route refuses empty/read-failed assignees before any write', async () => {
  for (const mode of ['empty', 'failure']) {
    const harness = makeHarness();
    try {
      const result = await runPublicTether(harness, mode);
      assert.notEqual(result.exitCode, 0, `${mode} assignee read must fail closed`);
      assert.deepEqual(writes(harness), []);
    } finally {
      rmSync(harness.root, { recursive: true, force: true });
    }
  }
});

test('public project-tether Assigned route writes under the guard when an assignee exists', async () => {
  const harness = makeHarness();
  try {
    const result = await runPublicTether(harness, 'present');
    assert.equal(result.exitCode, 0, result.stderr);
    assert.deepEqual(writes(harness), ['link-write', 'status-write']);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});
