// @story #1410
// Integration lane: this contract intentionally resolves a child-process PATH sentinel.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  censusPassed,
  formatCensus,
  parseLanes,
  runLaneCensus,
} from '../../tools/gh-call-census.mjs';
import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';

const pexec = promisify(execFile);

test('parseLanes accepts repeatable canonical lane flags', () => {
  assert.deepEqual(parseLanes(['--lane', 'unit', '--lane=integration', '--lane', 'slow']), [
    'unit',
    'integration',
    'slow',
  ]);
  assert.throws(() => parseLanes([]), /at least one --lane/);
  assert.throws(() => parseLanes(['--lane', 'fast']), /unit\|integration\|slow/);
  assert.throws(() => parseLanes(['--unknown']), /unknown argument/);
});

test('runLaneCensus reports zero and removes its project-local sentinel', async () => {
  const result = await runLaneCensus('unit', {
    runLane: async ({ lane, env }) => {
      assert.equal(lane, 'unit');
      assert.notEqual(env.PATH, process.env.PATH);
      return 0;
    },
  });
  assert.deepEqual(result.calls, []);
  assert.equal(result.exitCode, 0);
  assert.equal(existsSync(result.scratchDir), false);
});

test('runLaneCensus records and refuses every resolved gh argv', async () => {
  const result = await runLaneCensus('slow', {
    runLane: async ({ env }) => {
      delete env.AITM_GH_CENSUS_CALLER;
      await assert.rejects(
        () => pexec('gh', ['issue', 'view', '1410'], { env }),
        /gh-call-census: refused real gh/
      );
      return 0;
    },
  });
  assert.deepEqual(result.calls, ['gh issue view 1410']);
  assert.equal(existsSync(result.scratchDir), false);
});

test('preload records an absorbed gh call even when the caller catches the refusal', async () => {
  const result = await runLaneCensus('unit', {
    runLane: async ({ env }) => {
      delete env.AITM_GH_CENSUS_CALLER;
      const script = [
        "import { execFile } from 'node:child_process';",
        "import { promisify } from 'node:util';",
        "try { await promisify(execFile)('gh', ['issue', 'view', '1410']); } catch {}",
      ].join('\n');
      await pexec(process.execPath, ['--input-type=module', '--eval', script], { env });
      return 0;
    },
  });
  assert.deepEqual(result.calls, ['gh issue view 1410']);
  assert.equal(censusPassed([result]), false);
});

test('preload records child-process overloads whose argv array is omitted', async () => {
  const result = await runLaneCensus('unit', {
    runLane: async ({ env }) => {
      delete env.AITM_GH_CENSUS_CALLER;
      const script = [
        "import { execFile, execFileSync, spawn, spawnSync } from 'node:child_process';",
        "import { promisify } from 'node:util';",
        "try { await promisify(execFile)('gh', { encoding: 'utf8' }); } catch {}",
        "execFile('gh', { encoding: 'utf8' }, () => {});",
        "spawn('gh', { stdio: 'ignore' });",
        "try { execFileSync('gh', { encoding: 'utf8' }); } catch {}",
        "spawnSync('gh', { encoding: 'utf8' });",
      ].join('\n');
      await pexec(process.execPath, ['--input-type=module', '--eval', script], { env });
      return 0;
    },
  });
  assert.deepEqual(result.calls, ['gh', 'gh', 'gh', 'gh', 'gh']);
  assert.equal(censusPassed([result]), false);
});

test('preload refuses an undeclared earlier PATH gh and permits an explicitly declared double', async () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'gh-census-double-'));
  const bin = path.join(dir, 'bin');
  const marker = path.join(dir, 'executed');
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\nprintf executed > '${marker}'\n`);
  chmodSync(path.join(bin, 'gh'), 0o755);
  const script = [
    "import { execFile } from 'node:child_process';",
    "import { promisify } from 'node:util';",
    "try { await promisify(execFile)('gh', ['api', 'rate_limit']); } catch {}",
  ].join('\n');
  try {
    const undeclared = await runLaneCensus('integration', {
      runLane: async ({ env }) => {
        delete env.AITM_GH_CENSUS_CALLER;
        env.PATH = `${bin}${path.delimiter}${env.PATH}`;
        await pexec(process.execPath, ['--input-type=module', '--eval', script], { env });
        return 0;
      },
    });
    assert.deepEqual(undeclared.calls, ['gh api rate_limit']);
    assert.equal(existsSync(marker), false);

    const declared = await runLaneCensus('integration', {
      runLane: async ({ env }) => {
        delete env.AITM_GH_CENSUS_CALLER;
        env.PATH = `${bin}${path.delimiter}${env.PATH}`;
        env.AITM_GH_TEST_DOUBLE_BIN = bin;
        await pexec(process.execPath, ['--input-type=module', '--eval', script], { env });
        return 0;
      },
    });
    assert.deepEqual(declared.calls, []);
    assert.equal(existsSync(marker), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('preload does not let an ambient declaration authorize a per-call PATH binary', async () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'gh-census-env-override-'));
  const declaredBin = path.join(dir, 'declared');
  const overrideBin = path.join(dir, 'override');
  const marker = path.join(dir, 'override-executed');
  mkdirSync(declaredBin, { recursive: true });
  mkdirSync(overrideBin, { recursive: true });
  for (const bin of [declaredBin, overrideBin]) {
    writeFileSync(
      path.join(bin, 'gh'),
      bin === overrideBin ? `#!/bin/sh\nprintf executed > '${marker}'\n` : '#!/bin/sh\nexit 0\n'
    );
    chmodSync(path.join(bin, 'gh'), 0o755);
  }
  const script = [
    "import { execFile } from 'node:child_process';",
    "import { promisify } from 'node:util';",
    'const env = { ...process.env, PATH: process.env.OVERRIDE_GH_PATH };',
    "try { await promisify(execFile)('gh', ['api', 'rate_limit'], { env }); } catch {}",
  ].join('\n');
  try {
    const result = await runLaneCensus('integration', {
      runLane: async ({ env }) => {
        delete env.AITM_GH_CENSUS_CALLER;
        env.PATH = `${declaredBin}${path.delimiter}${env.PATH}`;
        env.AITM_GH_TEST_DOUBLE_BIN = declaredBin;
        env.OVERRIDE_GH_PATH = `${overrideBin}${path.delimiter}${env.PATH}`;
        await pexec(process.execPath, ['--input-type=module', '--eval', script], { env });
        return 0;
      },
    });
    assert.deepEqual(result.calls, ['gh api rate_limit']);
    assert.equal(censusPassed([result]), false);
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('formatCensus is deterministic and the result fails closed', () => {
  const results = [
    { lane: 'unit', exitCode: 0, calls: [] },
    { lane: 'integration', exitCode: 0, calls: ['gh api rate_limit'] },
    { lane: 'slow', exitCode: 1, calls: [] },
  ];
  assert.equal(censusPassed(results), false);
  assert.equal(
    formatCensus(results),
    [
      'gh-call-census: unit: 0 real gh invocation(s); lane exit 0',
      'gh-call-census: integration: 1 real gh invocation(s); lane exit 0',
      '  1x gh api rate_limit',
      'gh-call-census: slow: 0 real gh invocation(s); lane exit 1',
      'gh-call-census: FAIL',
    ].join('\n')
  );
  assert.equal(censusPassed([{ lane: 'unit', exitCode: 0, calls: [] }]), true);
});
