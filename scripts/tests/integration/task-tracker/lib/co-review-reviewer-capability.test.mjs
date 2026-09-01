// @story #1406
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import '../../../fixtures/offline-gh-auto.mjs';
import { fileURLToPath } from 'node:url';

import {
  patchCodexHooksJson,
  patchGrokHooksJson,
  patchSettingsJson,
} from '../../../../../bin/cli.mjs';
import {
  commitArtifact,
  readEvents,
  realRepositoryFixture,
  runCli,
  runCliDirect,
} from '../../../fixtures/co-review-fixture.mjs';

const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('../../../../../', import.meta.url)));
function providerEnv(provider, sid) {
  const env = { ...process.env, TT_SKIP_NETWORK: '1' };
  for (const key of [
    'AI_TASK_MANAGER_SESSION_ID',
    'CLAUDE_CODE_SESSION_ID',
    'CLAUDE_SESSION_ID',
    'CODEX_THREAD_ID',
    'CODEX_SESSION_ID',
    'GROK_SESSION_ID',
  ]) {
    delete env[key];
  }
  if (provider === 'codex') env.CODEX_THREAD_ID = sid;
  else if (provider === 'grok') env.GROK_SESSION_ID = sid;
  else env.CLAUDE_CODE_SESSION_ID = sid;
  return env;
}

const OWNER_ENV = providerEnv('codex', 'installed-chain-owner-1406');
const REVIEWER_ENV = providerEnv('grok', 'installed-chain-reviewer-1406');

function successfulCoReview(args, root, env) {
  const result = runCli(args, { cwd: root, env });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function establishReviewerClaim(root, artifact, commit) {
  const dir = '.scratch/co-review/installed-chain-claim-invariance';
  successfulCoReview(
    [
      'init',
      '--low-level',
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
    root,
    OWNER_ENV
  );
  successfulCoReview(['claim', '--dir', dir, '--actor', 'owner-agent'], root, OWNER_ENV);
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
    root,
    OWNER_ENV
  );
  return successfulCoReview(
    ['claim', '--dir', dir, '--actor', 'reviewer-agent'],
    root,
    REVIEWER_ENV
  );
}

function createIntervention(root, artifact, commit) {
  const dir = '.scratch/co-review/installed-chain-intervention';
  successfulCoReview(
    [
      'init',
      '--low-level',
      '--dir',
      dir,
      '--artifact',
      artifact,
      '--owner',
      'owner-agent',
      '--reviewer',
      'reviewer-agent',
      '--max-turns',
      '1',
    ],
    root,
    OWNER_ENV
  );
  successfulCoReview(['claim', '--dir', dir, '--actor', 'owner-agent'], root, OWNER_ENV);
  const firstResponse = `${dir}/round-1-owner-response.md`;
  writeFileSync(path.join(root, firstResponse), '# Owner response\n\nReady.\n');
  successfulCoReview(
    [
      'handoff',
      '--dir',
      dir,
      '--actor',
      'owner-agent',
      '--response',
      firstResponse,
      '--artifact',
      artifact,
      '--commit',
      commit,
      '--message',
      'owner handoff complete',
    ],
    root,
    OWNER_ENV
  );
  successfulCoReview(['claim', '--dir', dir, '--actor', 'reviewer-agent'], root, REVIEWER_ENV);
  const review = `${dir}/round-2-review.md`;
  writeFileSync(path.join(root, review), '[finding:F-001] Add recovery evidence.\n');
  successfulCoReview(
    [
      'handoff',
      '--dir',
      dir,
      '--actor',
      'reviewer-agent',
      '--review',
      review,
      '--review-of',
      commit,
      '--decision',
      'changes-requested',
      '--message',
      'one finding',
    ],
    root,
    REVIEWER_ENV
  );
  successfulCoReview(['claim', '--dir', dir, '--actor', 'owner-agent'], root, OWNER_ENV);
  const revisedCommit = commitArtifact(root, '# Artifact\n\nRecovery evidence.\n');
  const closingResponse = `${dir}/round-3-owner-response.md`;
  writeFileSync(
    path.join(root, closingResponse),
    '[finding:F-001] [disposition:accepted]\nAdded recovery evidence.\n'
  );
  const state = successfulCoReview(
    [
      'handoff',
      '--dir',
      dir,
      '--actor',
      'owner-agent',
      '--response',
      closingResponse,
      '--artifact',
      artifact,
      '--commit',
      revisedCommit,
      '--answers',
      review,
      '--message',
      'closing owner handoff',
    ],
    root,
    OWNER_ENV
  );
  assert.equal(state.lifecycle, 'intervention-required');
  return { dir, revisedCommit };
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

function matchingCommands(settings, toolName) {
  return (settings.hooks?.PreToolUse ?? [])
    .filter((entry) =>
      String(entry.matcher ?? '')
        .split('|')
        .includes(toolName)
    )
    .flatMap((entry) => entry.hooks ?? [])
    .filter((hook) => hook.type === 'command')
    .map((hook) => hook.command);
}

function installedChains(root) {
  const directory = path.join(root, '.tmp', 'installer');
  const paths = {
    claude: path.join(directory, 'settings.json'),
    codex: path.join(directory, 'codex-hooks.json'),
    grok: path.join(directory, 'grok-hooks.json'),
  };
  patchSettingsJson(paths.claude);
  patchCodexHooksJson(paths.codex);
  patchGrokHooksJson(paths.grok);
  return Object.fromEntries(
    Object.entries(paths).map(([provider, file]) => [
      provider,
      JSON.parse(readFileSync(file, 'utf8')),
    ])
  );
}

function assertChain(input, commands, { root, env, allowed }) {
  assert.ok(commands.length > 0, `${input.tool_name}: installed chain exists`);
  const results = commands.map((command) =>
    runInstalledCommand(command, { cwd: root, input, env })
  );
  for (const result of results) {
    if (allowed) assert.equal(refused(result), false, result.stderr || result.stdout);
    else assert.equal(refused(result), true, 'dangerous input must be refused');
  }
  return results.map(({ status, stdout, stderr }) => ({ status, stdout, stderr }));
}

function refused(result) {
  if (result.status !== 0) return true;
  try {
    return ['block', 'deny'].includes(JSON.parse(result.stdout).decision);
  } catch {
    return false;
  }
}

function directToolCases(root, packageLink) {
  return ['Edit', 'Write', 'NotebookEdit', 'apply_patch'].map((toolName) => {
    const file = path.join(root, '.scratch/review/new-review.md');
    const sourceFile = path.join(root, 'scripts/review/unbound-review.mjs');
    const toolInput =
      toolName === 'apply_patch'
        ? { patch: `*** Begin Patch\n*** Add File: ${file}\n+# Review\n*** End Patch` }
        : toolName === 'NotebookEdit'
          ? { notebook_path: file }
          : { file_path: file };
    const input = { tool_name: toolName, cwd: root, tool_input: toolInput };
    return {
      toolName,
      input,
      sourceEdit: {
        ...input,
        tool_input:
          toolName === 'apply_patch'
            ? {
                patch: `*** Begin Patch\n*** Add File: ${sourceFile}\n+export const unsafe = true;\n*** End Patch`,
              }
            : toolName === 'NotebookEdit'
              ? { notebook_path: sourceFile }
              : { file_path: sourceFile },
      },
      selfEdit: {
        ...input,
        tool_input:
          toolName === 'apply_patch'
            ? {
                patch: `*** Begin Patch\n*** Update File: ${packageLink}/scripts/task-tracker/activity-guard.mjs\n@@\n-//\n+// unsafe\n*** End Patch`,
              }
            : toolName === 'NotebookEdit'
              ? { notebook_path: `${packageLink}/scripts/task-tracker/activity-guard.mjs` }
              : { file_path: `${packageLink}/scripts/task-tracker/activity-guard.mjs` },
      },
    };
  });
}

test('a live reviewer claim does not narrow any installed guard chain', () => {
  const fixture = realRepositoryFixture();
  try {
    const packageLink = path.join(fixture.root, 'node_modules', 'ai-task-manager');
    mkdirSync(path.dirname(packageLink), { recursive: true });
    symlinkSync(PACKAGE_ROOT, packageLink, 'dir');
    const chains = installedChains(fixture.root);
    const commands = [
      'git status --short | sed -n "1,5p"',
      'find scripts/review -maxdepth 2 -type f | sort',
      'git branch --show-current',
      'node --test scripts/tests/unit/review/co-review-fixture-cost.test.mjs',
      'npm run build --if-present',
    ];
    const dangerousCommands = [
      'rm -rf /',
      'echo unsafe > /tmp/foreign-review',
      'gh issue edit 1406 --body "unsafe"',
      'git commit -m "unowned review commit"',
    ];
    const baseline = new Map();
    const dangerousBaseline = new Map();
    for (const [provider, settings] of Object.entries(chains)) {
      const hookCommands = matchingCommands(settings, 'Bash');
      for (const command of commands) {
        const input = { tool_name: 'Bash', cwd: fixture.root, tool_input: { command } };
        baseline.set(
          `${provider}:${command}`,
          assertChain(input, hookCommands, {
            root: fixture.root,
            env: REVIEWER_ENV,
            allowed: true,
          })
        );
      }
      for (const command of dangerousCommands) {
        const input = { tool_name: 'Bash', cwd: fixture.root, tool_input: { command } };
        const results = hookCommands.map((hookCommand) =>
          runInstalledCommand(hookCommand, {
            cwd: fixture.root,
            input,
            env: REVIEWER_ENV,
          })
        );
        assert.ok(results.some(refused), `${provider}:${command}: baseline refusal`);
        dangerousBaseline.set(
          `${provider}:${command}`,
          results.map(({ status, stdout, stderr }) => ({ status, stdout, stderr }))
        );
      }
    }

    const directBaseline = new Map();
    const sourceEditBaseline = new Map();
    const selfEditBaseline = new Map();
    for (const [provider, settings] of Object.entries(chains)) {
      for (const { toolName, input, sourceEdit, selfEdit } of directToolCases(
        fixture.root,
        packageLink
      )) {
        const directCommands = matchingCommands(settings, toolName);
        if (directCommands.length === 0) continue;
        directBaseline.set(
          `${provider}:${toolName}`,
          assertChain(input, directCommands, {
            root: fixture.root,
            env: REVIEWER_ENV,
            allowed: true,
          })
        );
        const sourceResults = directCommands.map((command) =>
          runInstalledCommand(command, {
            cwd: fixture.root,
            input: sourceEdit,
            env: REVIEWER_ENV,
          })
        );
        assert.ok(sourceResults.some(refused), `${provider}:${toolName}: unbound source refusal`);
        sourceEditBaseline.set(
          `${provider}:${toolName}`,
          sourceResults.map(({ status, stdout, stderr }) => ({ status, stdout, stderr }))
        );
        const nativeNegative =
          (provider === 'codex' && toolName === 'apply_patch') ||
          (provider === 'claude' && ['Edit', 'Write', 'NotebookEdit'].includes(toolName)) ||
          (provider === 'grok' && ['Edit', 'Write'].includes(toolName));
        if (!nativeNegative) continue;
        const results = directCommands.map((command) =>
          runInstalledCommand(command, {
            cwd: fixture.root,
            input: selfEdit,
            env: REVIEWER_ENV,
          })
        );
        assert.ok(results.some(refused), `${provider}:${toolName}: baseline self-edit refusal`);
        selfEditBaseline.set(
          `${provider}:${toolName}`,
          results.map(({ status, stdout, stderr }) => ({ status, stdout, stderr }))
        );
      }
    }

    const claimed = establishReviewerClaim(fixture.root, fixture.artifact, fixture.initialCommit);
    assert.equal(claimed.claim.provider, 'grok');
    assert.equal(claimed.claim.sid, 'installed-chain-reviewer-1406');

    for (const [provider, settings] of Object.entries(chains)) {
      const hookCommands = matchingCommands(settings, 'Bash');
      for (const command of commands) {
        const input = { tool_name: 'Bash', cwd: fixture.root, tool_input: { command } };
        assert.deepEqual(
          assertChain(input, hookCommands, {
            root: fixture.root,
            env: REVIEWER_ENV,
            allowed: true,
          }),
          baseline.get(`${provider}:${command}`),
          `${provider}:${command}`
        );
      }
    }

    for (const dangerous of dangerousCommands) {
      const input = { tool_name: 'Bash', cwd: fixture.root, tool_input: { command: dangerous } };
      for (const [provider, settings] of Object.entries(chains)) {
        const commandsForTool = matchingCommands(settings, 'Bash');
        const dangerousResults = commandsForTool.map((command) =>
          runInstalledCommand(command, {
            cwd: fixture.root,
            input,
            env: REVIEWER_ENV,
          })
        );
        assert.ok(
          dangerousResults.some(refused),
          `${provider}:${dangerous}:${JSON.stringify(
            dangerousResults.map(({ status, stdout, stderr }) => ({ status, stdout, stderr }))
          )}`
        );
        assert.deepEqual(
          dangerousResults.map(({ status, stdout, stderr }) => ({ status, stdout, stderr })),
          dangerousBaseline.get(`${provider}:${dangerous}`),
          `${provider}:${dangerous}: refusal claim invariance`
        );
      }
    }

    for (const [provider, settings] of Object.entries(chains)) {
      for (const { toolName, input, sourceEdit, selfEdit } of directToolCases(
        fixture.root,
        packageLink
      )) {
        const directCommands = matchingCommands(settings, toolName);
        if (directCommands.length === 0) continue;
        assert.deepEqual(
          assertChain(input, directCommands, {
            root: fixture.root,
            env: REVIEWER_ENV,
            allowed: true,
          }),
          directBaseline.get(`${provider}:${toolName}`),
          `${provider}:${toolName}: claim invariance`
        );
        const sourceResults = directCommands.map((command) =>
          runInstalledCommand(command, {
            cwd: fixture.root,
            input: sourceEdit,
            env: REVIEWER_ENV,
          })
        );
        assert.ok(sourceResults.some(refused), `${provider}:${toolName}: unbound source refusal`);
        assert.deepEqual(
          sourceResults.map(({ status, stdout, stderr }) => ({ status, stdout, stderr })),
          sourceEditBaseline.get(`${provider}:${toolName}`),
          `${provider}:${toolName}: unbound source claim invariance`
        );
        const nativeNegative =
          (provider === 'codex' && toolName === 'apply_patch') ||
          (provider === 'claude' && ['Edit', 'Write', 'NotebookEdit'].includes(toolName)) ||
          (provider === 'grok' && ['Edit', 'Write'].includes(toolName));
        if (!nativeNegative) continue;
        const selfEditResults = directCommands.map((command) =>
          runInstalledCommand(command, {
            cwd: fixture.root,
            input: selfEdit,
            env: REVIEWER_ENV,
          })
        );
        assert.ok(
          selfEditResults.some(refused),
          `${provider}:${toolName}: installed self-edit refusal:${JSON.stringify(
            selfEditResults.map(({ status, stdout, stderr }) => ({ status, stdout, stderr }))
          )}`
        );
        assert.deepEqual(
          selfEditResults.map(({ status, stdout, stderr }) => ({ status, stdout, stderr })),
          selfEditBaseline.get(`${provider}:${toolName}`),
          `${provider}:${toolName}: self-edit claim invariance`
        );
      }
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('owner lifecycle commands remain usable without fabricating approval', async () => {
  const fixture = realRepositoryFixture();
  try {
    const packageLink = path.join(fixture.root, 'node_modules', 'ai-task-manager');
    mkdirSync(path.dirname(packageLink), { recursive: true });
    symlinkSync(PACKAGE_ROOT, packageLink, 'dir');
    const chains = installedChains(fixture.root);
    const claimed = establishReviewerClaim(fixture.root, fixture.artifact, fixture.initialCommit);
    assert.equal(claimed.claim.provider, 'grok');

    const activeDir = '.scratch/co-review/installed-chain-claim-invariance';
    const supplement = '.scratch/co-review/installed-chain-intervention/supplement.md';
    const invocations = [
      ['status', '--dir', activeDir],
      ['wait', '--dir', activeDir, '--actor', 'owner-agent', '--timeout', '0'],
      ['set-max-turns', '--dir', activeDir, '--max-turns', '4'],
      [
        'supplement',
        '--dir',
        '.scratch/co-review/installed-chain-intervention',
        '--file',
        supplement,
      ],
      [
        'continue',
        '--dir',
        '.scratch/co-review/installed-chain-intervention',
        '--additional-turns',
        '1',
      ],
    ];
    for (const invocation of invocations) {
      const command = `npx aitm co-review ${invocation.join(' ')}`;
      const input = { tool_name: 'Bash', cwd: fixture.root, tool_input: { command } };
      for (const [provider, settings] of Object.entries(chains)) {
        assertChain(input, matchingCommands(settings, 'Bash'), {
          root: fixture.root,
          env: OWNER_ENV,
          allowed: true,
        });
        assert.ok(provider, 'provider chain identified');
      }
    }

    const status = runCli(['status', '--dir', activeDir, '--json'], { cwd: fixture.root });
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).claim.provider, 'grok');
    const waiting = runCli(
      ['wait', '--dir', activeDir, '--actor', 'owner-agent', '--timeout', '0'],
      { cwd: fixture.root }
    );
    assert.equal(waiting.status, 3, waiting.stderr);
    const adjusted = await runCliDirect(['set-max-turns', '--dir', activeDir, '--max-turns', '4'], {
      cwd: fixture.root,
      env: OWNER_ENV,
      resolveGitHubLoginImpl: () => 'kendrick',
    });
    assert.equal(adjusted.status, 0, adjusted.stderr);

    const sentinelIssueBody = path.join(fixture.root, '.scratch/issue-body.md');
    writeFileSync(sentinelIssueBody, '# Issue\n\nNo human approval marker.\n');
    const issueBodyBefore = readFileSync(sentinelIssueBody, 'utf8');
    const intervention = createIntervention(fixture.root, fixture.artifact, fixture.initialCommit);
    writeFileSync(path.join(fixture.root, supplement), '# Human context\n\nCheck recovery.\n');
    const supplemented = await runCliDirect(
      ['supplement', '--dir', intervention.dir, '--file', supplement],
      {
        cwd: fixture.root,
        env: OWNER_ENV,
        resolveGitHubLoginImpl: () => 'kendrick',
      }
    );
    assert.equal(supplemented.status, 0, supplemented.stderr);
    const continued = await runCliDirect(
      ['continue', '--dir', intervention.dir, '--additional-turns', '1'],
      {
        cwd: fixture.root,
        env: OWNER_ENV,
        resolveGitHubLoginImpl: () => 'kendrick',
      }
    );
    assert.equal(continued.status, 0, continued.stderr);
    assert.equal(readFileSync(sentinelIssueBody, 'utf8'), issueBodyBefore);
    assert.ok(
      readEvents(fixture.root, intervention.dir).every(
        (event) => event.type !== 'review:approved' && event.approval !== 'human-semantic'
      )
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
