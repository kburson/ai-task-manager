// @story #1406
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { patchSettingsJson } from '../../../../../bin/cli.mjs';
import { realRepositoryFixture, runCli } from '../../../fixtures/co-review-fixture.mjs';

const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('../../../../../', import.meta.url)));
const REVIEWER_ENV = {
  ...process.env,
  AI_TASK_MANAGER_SESSION_ID: 'installed-chain-claim-invariance-1406',
  GROK_AGENT: '1',
  GROK_SESSION_ID: 'installed-chain-claim-invariance-1406',
};

function successfulCoReview(args, root) {
  const result = runCli(args, { cwd: root, env: REVIEWER_ENV });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function establishReviewerClaim(root, artifact, commit) {
  const dir = '.tmp/co-review/installed-chain-claim-invariance';
  successfulCoReview(
    [
      'init',
      '--dir',
      dir,
      '--artifact',
      artifact,
      '--owner',
      'owner-agent',
      '--reviewer',
      'reviewer-agent',
      '--max-turns',
      '3',
    ],
    root
  );
  successfulCoReview(['claim', '--dir', dir, '--actor', 'owner-agent'], root);
  const response = `${dir}/round-1-owner-response.md`;
  writeFileSync(path.join(root, response), '# Owner response\n\nReady for review.\n');
  successfulCoReview(
    [
      'handoff',
      '--dir',
      dir,
      '--actor',
      'owner-agent',
      '--response',
      response,
      '--artifact',
      artifact,
      '--commit',
      commit,
      '--message',
      'owner handoff complete',
    ],
    root
  );
  successfulCoReview(['claim', '--dir', dir, '--actor', 'reviewer-agent'], root);
}

function runInstalledCommand(command, { cwd, input, env }) {
  const prefix = 'node -e "';
  assert.ok(command.startsWith(prefix) && command.endsWith('"'), command);
  const program = command.slice(prefix.length, -1);
  return spawnSync(process.execPath, ['-e', program], {
    cwd,
    env,
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
}

test('a live reviewer claim does not narrow the installed Bash guard chain', () => {
  const fixture = realRepositoryFixture();
  try {
    establishReviewerClaim(fixture.root, fixture.artifact, fixture.initialCommit);

    const packageLink = path.join(fixture.root, 'node_modules', 'ai-task-manager');
    mkdirSync(path.dirname(packageLink), { recursive: true });
    symlinkSync(PACKAGE_ROOT, packageLink, 'dir');
    const settingsPath = path.join(fixture.root, '.tmp', 'installer', 'settings.json');
    patchSettingsJson(settingsPath);
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const bashGuardCommands = settings.hooks.PreToolUse.filter((entry) => entry.matcher === 'Bash')
      .flatMap((entry) => entry.hooks ?? [])
      .filter((hook) => hook.type === 'command')
      .map((hook) => hook.command);
    assert.equal(bashGuardCommands.length, 2);

    const input = {
      tool_name: 'Bash',
      cwd: fixture.root,
      tool_input: { command: 'git status --short | sed -n "1,5p"' },
    };
    const results = bashGuardCommands.map((command) =>
      runInstalledCommand(command, { cwd: fixture.root, input, env: REVIEWER_ENV })
    );
    for (const result of results) {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '');
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
