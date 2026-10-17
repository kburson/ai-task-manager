// @story #2020
// These shell strings are policy inputs only; the fixture never executes them.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';

const GUARD = fileURLToPath(new URL('../../../../task-tracker/bash-guard.mjs', import.meta.url));

test(
  'registered review command retains POSIX Bash path boundaries',
  { skip: process.platform === 'win32' },
  async (t) => {
    const project = realpathSync(mkdtempProjectIsolated('registered-command-project-'));
    const home = realpathSync(mkdtempProjectIsolated('registered-command-home-'));
    t.after(() => {
      rmSync(project, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    });
    const node = path.join(home, 'node', 'bin', 'node');
    const root = path.join(home, 'runtime', 'lib', 'node_modules', '@kburson', 'ai-peer-review');
    const cli = path.join(root, 'bin', 'peer-review.mjs');
    const selection = path.join(home, '.config', 'ai-peer-review', 'runtime-selection.json');
    for (const file of [node, cli, selection]) mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(node, 'fixture executable, never executed');
    writeFileSync(cli, 'fixture entrypoint, never executed');
    const manifest = {
      name: '@kburson/ai-peer-review',
      bin: { 'peer-review': './bin/peer-review.mjs' },
    };
    const record = {
      schema: 'ai-peer-review.runtime-selection/v1',
      selection_id: '12345678-1234-1234-1234-123456789abc',
      package_root: root,
      node_executable: node,
      package_name: manifest.name,
      registered_at: '2026-10-16T00:00:00.000Z',
    };
    const save = (value = record) => writeFileSync(selection, JSON.stringify(value));
    const saveManifest = (value = manifest) =>
      writeFileSync(path.join(root, 'package.json'), JSON.stringify(value));
    save();
    saveManifest();
    const importRefusal = path.join(project, 'refuse-review-imports.mjs');
    writeFileSync(
      importRefusal,
      `
      import { registerHooks } from 'node:module';
      registerHooks({ resolve(specifier, context, nextResolve) {
        if (specifier.includes('ai-peer-review')) throw new Error('Review runtime import is forbidden');
        return nextResolve(specifier, context);
      }});
    `
    );
    const command = `${node} ${cli} help --json`;
    const run = (input) => {
      const result = spawnSync(process.execPath, ['--import', importRefusal, GUARD], {
        cwd: project,
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          AI_TASK_MANAGER_PROJECT_DIR: project,
          AI_TASK_MANAGER_SESSION_ID: 'registered-review-command-fixture',
        },
        input: JSON.stringify({ cwd: project, tool_input: { command: input } }),
        encoding: 'utf8',
        timeout: 20_000,
      });
      assert.equal(result.error, undefined, result.error?.message);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, '');
      return result.stdout;
    };
    const allow = (input) => assert.equal(run(input), '', input);
    const block = (input) => assert.equal(JSON.parse(run(input)).decision, 'block', input);

    await t.test('admits only the registered executable pair', () => allow(command));
    await t.test('retains normal project and system reads with absent registration', () => {
      rmSync(selection);
      allow('cat README.md');
      allow('/usr/bin/env');
      block(command);
      save();
    });
    await t.test('unrelated executables and entrypoints remain outside scope', () => {
      block(`${node}-other ${cli} help`);
      block(`${node} ${root}/bin/other.mjs help`);
      block(`cat ${node}`);
      block(`cat ${cli}`);
    });
    await t.test('additional outside arguments and writes remain blocked', () => {
      block(`${command} ${home}/private.txt`);
      block(`${command} > ${home}/response.md`);
      block(`${command} | tee ${home}/response.md`);
      block(`touch ${node}`);
    });
    await t.test('Node options and compound shell commands gain no permission', () => {
      for (const input of [
        `${node} --import ${cli} ${cli}`,
        `env ${command}`,
        `${command}; cat README.md`,
        `${command} && echo ok`,
        `${command}\necho ok`,
        `${command} $(echo x)`,
        `${command} < README.md`,
      ])
        block(input);
    });
    await t.test('traversal and executable aliases gain no permission', () => {
      block(`${home}/node/bin/../bin/node ${cli} help`);
      const alias = path.join(home, 'node-alias');
      symlinkSync(node, alias);
      block(`${alias} ${cli} help`);
      const cliAlias = path.join(root, 'bin', 'alias.mjs');
      symlinkSync(cli, cliAlias);
      block(`${node} ${cliAlias} help`);
      save({ ...record, node_executable: alias });
      block(`${alias} ${cli} help`);
      save();
    });
    await t.test('missing or malformed targets and records grant nothing', () => {
      for (const value of [
        { ...record, schema: 'other' },
        { ...record, extra: true },
        { ...record, selection_id: 'bad' },
        { ...record, registered_at: 'yesterday' },
        { ...record, node_executable: node + '-missing' },
        { ...record, package_root: root + '-other' },
        { ...record, package_name: 'other' },
      ]) {
        save(value);
        block(command);
      }
      writeFileSync(selection, '{');
      block(command);
      writeFileSync(selection, ' '.repeat(9000));
      block(command);
      save();
    });
    await t.test('package metadata disagreement and symlinked records grant nothing', () => {
      saveManifest({ ...manifest, name: 'other' });
      block(command);
      saveManifest({ ...manifest, bin: { 'peer-review': './bin/other.mjs' } });
      block(command);
      saveManifest();
      rmSync(selection);
      const target = path.join(home, 'selection-copy.json');
      writeFileSync(target, JSON.stringify(record));
      symlinkSync(target, selection);
      block(command);
      rmSync(selection);
      save();
    });
    await t.test('does not widen protected GitHub or write policies', () => {
      block(`${command} && gh issue create --title x`);
      block(`${command}; touch ${home}/outside`);
      allow('echo ok > ./.scratch-notes');
    });
  }
);
