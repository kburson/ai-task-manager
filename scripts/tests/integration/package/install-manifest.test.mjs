// @story #1692
import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { after, test } from 'node:test';

import { replaceWithSymlink, runInstall } from '../../../../bin/cli.mjs';
import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';

const inventory = { templates: [], references: [], configs: [] };
const scratch = mkdtempSync(join(projectScratchDir('test'), 'install-manifest-integration-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

test('runInstall publishes the manifest after every selected effect', async () => {
  const calls = [];
  const result = await runInstall(
    {
      targetDir: '/repo',
      args: [],
      selectedNames: ['codex'],
      linkMode: 'stub',
      enableCodexSuperpowers: true,
      globalCodexSuperpowers: false,
    },
    {
      installMemorySeed: async () => ({ count: 1, files: ['.ai-task-manager/memory/fact.md'] }),
      installProvider: () => calls.push('provider'),
      setupCodexSuperpowers: () => calls.push('bootstrap'),
      installTemplates: () => calls.push('templates'),
      collectPackageInventory: () => inventory,
      writeInstallManifest: (_target, manifest) => calls.push(['manifest', manifest]),
    }
  );
  assert.deepEqual(
    calls.map((item) => (Array.isArray(item) ? item[0] : item)),
    ['provider', 'bootstrap', 'templates', 'manifest']
  );
  assert.equal(result.manifest.schema, 'aitm.install-manifest/v1');
  assert.deepEqual(result.manifest.intent.memoryFiles, ['.ai-task-manager/memory/fact.md']);
});

test('runInstall never publishes after an earlier effect fails', async () => {
  let published = false;
  await assert.rejects(
    () =>
      runInstall(
        {
          targetDir: '/repo',
          args: [],
          selectedNames: ['codex'],
          linkMode: 'stub',
          enableCodexSuperpowers: false,
          globalCodexSuperpowers: false,
        },
        {
          installMemorySeed: async () => ({ count: 0, files: [] }),
          installProvider: () => {
            throw new Error('provider failed');
          },
          collectPackageInventory: () => inventory,
          writeInstallManifest: () => {
            published = true;
          },
        }
      ),
    /provider failed/
  );
  assert.equal(published, false);
});

test('runInstall rejects invalid feature combinations before any install effect', async () => {
  const calls = [];
  await assert.rejects(
    () =>
      runInstall(
        {
          targetDir: '/repo',
          args: [],
          selectedNames: ['claude'],
          linkMode: 'stub',
          enableCodexSuperpowers: true,
          globalCodexSuperpowers: false,
        },
        {
          installMemorySeed: async () => {
            calls.push('memory');
            return { count: 0, files: [] };
          },
          installProvider: () => calls.push('provider'),
          setupCodexSuperpowers: () => calls.push('bootstrap'),
          installTemplates: () => calls.push('templates'),
          collectPackageInventory: () => inventory,
          writeInstallManifest: () => calls.push('manifest'),
        }
      ),
    /feature-combination/
  );
  assert.deepEqual(calls, []);
});

test('runInstall rejects an external symlink source before memory installation', async () => {
  const calls = [];
  await assert.rejects(
    () =>
      runInstall(
        {
          targetDir: join(scratch, 'external-symlink-target'),
          args: [],
          selectedNames: ['codex'],
          linkMode: 'symlink',
          enableCodexSuperpowers: false,
          globalCodexSuperpowers: false,
        },
        {
          installMemorySeed: async () => {
            calls.push('memory');
            return { count: 0, files: [] };
          },
          installProvider: () => calls.push('provider'),
          installTemplates: () => calls.push('templates'),
          collectPackageInventory: () => inventory,
          writeInstallManifest: () => calls.push('manifest'),
        }
      ),
    /requires the installed package to resolve inside the target project/
  );
  assert.deepEqual(calls, []);
});

test('real stub install publishes a deterministic selected-provider manifest last', async () => {
  const target = join(scratch, 'consumer');
  mkdirSync(target, { recursive: true });
  const options = {
    targetDir: target,
    args: ['--memory-seed', 'none'],
    selectedNames: ['codex'],
    linkMode: 'stub',
    enableCodexSuperpowers: false,
    globalCodexSuperpowers: false,
  };
  await runInstall(options);
  const manifestPath = join(target, '.ai-task-manager', 'install-manifest.json');
  assert.equal(existsSync(manifestPath), true);
  const first = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(first);
  assert.deepEqual(manifest.intent.providers, ['codex']);
  assert.ok(manifest.artifacts.some((item) => item.id === 'provider.codex.skill'));
  assert.ok(manifest.artifacts.some((item) => item.id === 'config.task-tracker'));
  await runInstall(options);
  assert.equal(readFileSync(manifestPath, 'utf8'), first);
});

test('contained symlink uses a relative target and resolves to its package source', () => {
  const target = join(scratch, 'contained');
  const source = join(
    target,
    'node_modules',
    '@kburson',
    'ai-task-manager',
    'skill',
    'adapters',
    'codex'
  );
  const destination = join(target, '.agents', 'skills', 'task');
  mkdirSync(source, { recursive: true });
  replaceWithSymlink(destination, source, 'Skill', target);
  assert.equal(lstatSync(destination).isSymbolicLink(), true);
  assert.equal(isAbsolute(readlinkSync(destination)), false);
  assert.equal(realpathSync(destination), realpathSync(source));
});

test('contained symlink install publishes a manifest matching the directory symlink', async () => {
  const target = join(scratch, 'contained-install');
  const packageRoot = join(target, 'node_modules', '@kburson', 'ai-task-manager');
  const source = join(packageRoot, 'skill', 'adapters', 'codex');
  mkdirSync(source, { recursive: true });
  writeFileSync(join(source, 'SKILL.md'), '# task\n', 'utf8');

  const result = await runInstall(
    {
      targetDir: target,
      args: [],
      selectedNames: ['codex'],
      linkMode: 'symlink',
      enableCodexSuperpowers: false,
      globalCodexSuperpowers: false,
    },
    {
      packageRoot,
      installMemorySeed: async () => ({ count: 0, files: [] }),
      installTemplates: () => {},
      collectPackageInventory: () => inventory,
    }
  );

  const skill = result.manifest.artifacts.find(({ id }) => id === 'provider.codex.skill');
  assert.deepEqual(
    { path: skill.path, kind: skill.kind },
    { path: '.agents/skills/task', kind: 'symlink' }
  );
  assert.equal(lstatSync(join(target, skill.path)).isSymbolicLink(), true);
  assert.deepEqual(
    JSON.parse(readFileSync(join(target, '.ai-task-manager', 'install-manifest.json'), 'utf8')),
    result.manifest
  );
});
