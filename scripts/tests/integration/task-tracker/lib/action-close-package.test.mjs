// @story #1802
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { parseNpmPackReport } from '../../../helpers/npm-pack-report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

test('packed consumer resolves omitted trunkRef for close-readiness child lineage', (t) => {
  const sandbox = mkdtempSync(join(projectScratchDir('test'), 'aitm-close-default-pack-'));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const packDir = join(sandbox, 'pack');
  const consumerDir = join(sandbox, 'consumer');
  mkdirSync(packDir, { recursive: true });
  mkdirSync(join(consumerDir, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    join(consumerDir, 'package.json'),
    JSON.stringify({ private: true, type: 'module' })
  );
  writeFileSync(
    join(consumerDir, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({ repo: 'example/project' })
  );

  const raw = execFileSync('npm', ['pack', '--json', '--pack-destination', packDir], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, npm_config_loglevel: 'silent' },
  });
  const report = parseNpmPackReport(raw, {
    expectedPackageName: '@kburson/ai-task-manager',
    requireFilename: true,
  });
  const files = new Set(report.files.map(({ path }) => path));
  assert.ok(files.has('scripts/task-tracker/lib/action-decision/close.mjs'));
  assert.ok(files.has('scripts/task-tracker/lib/trunk-ref.mjs'));
  execFileSync(
    'npm',
    [
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      join(packDir, report.filename),
    ],
    {
      cwd: consumerDir,
      encoding: 'utf8',
      env: { ...process.env, npm_config_loglevel: 'silent', npm_config_offline: 'true' },
    }
  );

  writeFileSync(
    join(consumerDir, 'check.mjs'),
    `import assert from 'node:assert/strict';
import { loadConfig } from './node_modules/@kburson/ai-task-manager/scripts/task-tracker/config.mjs';
import { createCloseReadOnlyPorts } from './node_modules/@kburson/ai-task-manager/scripts/task-tracker/lib/action-decision/close.mjs';
const cfg = loadConfig({
  projectPath: '.ai-task-manager/task-tracker.json',
  userPath: '.missing-user-config.json',
});
assert.equal(cfg.trunkRef, '');
const sha = 'a'.repeat(40);
const receipt = Buffer.from(JSON.stringify({ stage: 'test', commitSha: sha })).toString('base64url');
const body = '## Scope\\nChild delivery\\n\\n- [x] Agent Review Passed <!-- aitm-verified gate="agent-review" result="pass" -->\\n<!-- aitm-verification-receipt stage="test" data="' + receipt + '" -->';
const ports = createCloseReadOnlyPorts({
  issue: 111,
  cfg,
  projectDir: process.cwd(),
  deps: {
    readGraph: async () => ({ parent: 110, children: [], parentAuthoritativeBranch: 'feature/epic/110' }),
    run: async (command, args) => {
      if (command === 'git' && args[0] === 'rev-parse') return { stdout: sha };
      if (command === 'git' && args[0] === 'branch') return { stdout: 'feature/child/111' };
      if (command === 'git' && args[0] === 'ls-remote') return { stdout: sha + '\\trefs/heads/feature/epic/110\\n' };
      if (command === 'gh' && args[0] === 'pr') return { stdout: '[]' };
      throw new Error('unexpected ' + command + ' ' + args.join(' '));
    },
  },
});
const delivery = await ports.readDelivery({ body });
assert.equal(delivery.gateInput.lineage.deliveryTarget, 'feature/epic/110');
assert.equal(delivery.gateInput.acceptedSha, sha);
console.log('consumer-close-default-ready');
`
  );
  const output = execFileSync(process.execPath, [join(consumerDir, 'check.mjs')], {
    cwd: consumerDir,
    encoding: 'utf8',
  });
  assert.equal(output.trim(), 'consumer-close-default-ready');
});
