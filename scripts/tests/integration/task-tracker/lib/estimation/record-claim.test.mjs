// @story #1091
import { strict as assert } from 'node:assert';
import { readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

import { mkdtempProjectIsolated } from '../../../../../task-tracker/lib/scratch-dir.mjs';

const claimModule = new URL(
  '../../../../../task-tracker/lib/estimation/record-claim.mjs',
  import.meta.url
).href;

function child(script, env) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['--input-type=module', '--eval', script], {
      env: { ...globalThis.process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`claim child exited ${code}: ${stderr}`));
    });
  });
}

test('main-worktree authority claim serializes independent Node processes', async () => {
  const projectDir = mkdtempProjectIsolated('estimation-record-claim-');
  const eventsPath = path.join(projectDir, '.tmp', 'claim-events.log');
  const script = `
    import { appendFileSync, mkdirSync } from 'node:fs';
    import path from 'node:path';
    import { withCrossProcessRecordClaim } from ${JSON.stringify(claimModule)};
    mkdirSync(path.dirname(process.env.AITM_CLAIM_EVENTS), { recursive: true });
    await withCrossProcessRecordClaim({
      key: 'outcome:1091:story:forecast',
      issue: 1091,
      projectDir: process.env.AITM_CLAIM_PROJECT,
    }, async () => {
      appendFileSync(process.env.AITM_CLAIM_EVENTS, 'start:' + process.pid + '\\n');
      await new Promise((resolve) => setTimeout(resolve, 75));
      appendFileSync(process.env.AITM_CLAIM_EVENTS, 'end:' + process.pid + '\\n');
    });
  `;
  const env = { AITM_CLAIM_PROJECT: projectDir, AITM_CLAIM_EVENTS: eventsPath };

  try {
    await Promise.all([child(script, env), child(script, env)]);
    const events = readFileSync(eventsPath, 'utf8').trim().split('\n');
    assert.equal(events.length, 4);
    assert.match(events[0], /^start:/);
    assert.equal(events[1], events[0].replace('start:', 'end:'));
    assert.match(events[2], /^start:/);
    assert.equal(events[3], events[2].replace('start:', 'end:'));
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});
