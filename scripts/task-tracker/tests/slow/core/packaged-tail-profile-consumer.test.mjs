// @story #925
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..', '..');

test('packed consumer can select and execute effect-scoped move tails', () => {
  const sandbox = mkdtempSync(join(projectScratchDir('test'), 'aitm-tail-profile-pack-'));
  const packDir = join(sandbox, 'pack');
  const consumerDir = join(sandbox, 'consumer');
  mkdirSync(packDir, { recursive: true });
  mkdirSync(consumerDir, { recursive: true });

  try {
    const packReport = JSON.parse(
      execFileSync('npm', ['pack', '--json', '--pack-destination', packDir], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, npm_config_loglevel: 'silent' },
      })
    );
    const packedFiles = new Set((packReport[0]?.files ?? []).map((file) => file.path));
    for (const required of [
      'bin/aitm.mjs',
      'skill/adapters/codex/SKILL.md',
      'scripts/task-tracker/lib/move-state/tail-profiles.mjs',
      'scripts/task-tracker/lib/move-state/post-commit-tail.mjs',
    ]) {
      assert.ok(packedFiles.has(required), `required packed file missing: ${required}`);
    }

    const tgz = join(packDir, packReport[0].filename);
    writeFileSync(
      join(consumerDir, 'package.json'),
      JSON.stringify({ name: 'tail-profile-consumer', private: true, type: 'module' })
    );
    execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tgz], {
      cwd: consumerDir,
      encoding: 'utf8',
      env: { ...process.env, npm_config_loglevel: 'silent' },
    });

    const installedRoot = join(consumerDir, 'node_modules', '@kburson', 'ai-task-manager');
    for (const required of [
      'bin/aitm.mjs',
      'skill/adapters/codex/SKILL.md',
      'scripts/task-tracker/lib/move-state/tail-profiles.mjs',
      'scripts/task-tracker/lib/move-state/post-commit-tail.mjs',
    ]) {
      assert.ok(
        existsSync(join(installedRoot, required)),
        `required installed file missing: ${required}`
      );
    }

    const consumerModule = join(consumerDir, 'consume.mjs');
    writeFileSync(
      consumerModule,
      `import {
  DEFAULT_TAIL_STEPS,
  runPostCommitTail,
} from '@kburson/ai-task-manager/scripts/task-tracker/lib/move-state/post-commit-tail.mjs';
import {
  resolveTailProfile,
} from '@kburson/ai-task-manager/scripts/task-tracker/lib/move-state/tail-profiles.mjs';

async function execute(profile) {
  resolveTailProfile(profile);
  const calls = [];
  const spySteps = DEFAULT_TAIL_STEPS.map((step) => ({
    ...step,
    fn: async () => calls.push(step.scope),
  }));
  await runPostCommitTail({ tailProfile: profile }, spySteps);
  return calls;
}

const taskOwner = await execute('task-owner');
const background = await execute('background-convergence');
console.log(\`task-owner=\${taskOwner.length}\`);
console.log(\`background-convergence=\${background.length}\`);
console.log(\`session-effects=\${background.filter((scope) => scope === 'session').length}\`);
`
    );

    const output = execFileSync(process.execPath, [consumerModule], {
      cwd: consumerDir,
      encoding: 'utf8',
    });
    assert.equal(
      output,
      'task-owner=8\nbackground-convergence=6\nsession-effects=0\n',
      `unexpected packaged-consumer output:\n${output}`
    );

    const manifest = JSON.parse(readFileSync(join(installedRoot, 'package.json'), 'utf8'));
    assert.equal(manifest.bin?.aitm, 'bin/aitm.mjs');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
