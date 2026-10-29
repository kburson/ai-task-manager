// @story #2106
// cspell:ignore gpgsign
// @story #2088
// Offline installation/selection fixtures, never genuine native-worker evidence.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { parseNpmPackReport } from '../../../helpers/npm-pack-report.mjs';
const source = fileURLToPath(new URL('../../../../..', import.meta.url));
const packageName = '@kburson/ai-task-manager';
const sid = 'installation-offline-fixture';
const digest = (file, algorithm = 'sha256') =>
  createHash(algorithm).update(readFileSync(file)).digest('hex');
function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}
function files(root, prefix = '') {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = path.posix.join(prefix, entry.name);
      assert.equal(entry.isSymbolicLink(), false, relative);
      return entry.isDirectory() ? files(path.join(root, entry.name), relative) : [relative];
    })
    .sort();
}
function hook(command, cwd, input, toolName = 'Bash') {
  const env = { ...process.env, CODEX_THREAD_ID: sid, CODEX_SESSION_ID: sid };
  for (const key of [
    'AI_TASK_MANAGER_SESSION_ID',
    'AI_TASK_MANAGER_PROJECT_DIR',
    'TASK_TRACKER_PROJECT_DIR',
    'CLAUDE_PROJECT_DIR',
    'AITM_CAPTURE_PROJECT_DIR',
    'AITM_GRAPHQL_USAGE',
    'TT_FULL_AUTO',
  ])
    delete env[key];
  return spawnSync('/bin/sh', ['-c', command], {
    cwd,
    env,
    encoding: 'utf8',
    input: JSON.stringify({
      session_id: sid,
      cwd,
      tool_name: toolName,
      tool_input: typeof input === 'string' ? { command: input } : input,
    }),
  });
}
function observation(command, cwd, nonce) {
  const result = hook(command, cwd, `npx aitm doctor --json --runtime-proof ${nonce}`);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.notEqual(output.decision, 'block', result.stdout);
  return JSON.parse(output.hookSpecificOutput.additionalContext).runtimeObservation;
}

const productionDependencies = [
  'acorn',
  'acorn-jsx',
  'argparse',
  'eslint-visitor-keys',
  'espree',
  'js-yaml',
];
function qualifyDependencies(packageRoot) {
  const privateModules = realpathSync(path.join(packageRoot, 'node_modules'));
  const lock = JSON.parse(readFileSync(path.join(packageRoot, 'package-lock.json'), 'utf8'));
  const visited = new Map();
  function visit(parent) {
    const pkg = JSON.parse(readFileSync(path.join(parent, 'package.json'), 'utf8'));
    const resolve = createRequire(path.join(parent, 'package.json'));
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      const entry = realpathSync(resolve.resolve(name));
      assert.equal(
        entry.startsWith(privateModules + path.sep),
        true,
        `private dependency escaped: ${name}`
      );
      let directory = path.dirname(entry);
      while (
        !existsSync(path.join(directory, 'package.json')) ||
        JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')).name !== name
      ) {
        const next = path.dirname(directory);
        assert.notEqual(next, directory);
        directory = next;
      }
      if (visited.has(name)) {
        assert.equal(visited.get(name).root, directory);
        continue;
      }
      const metadata = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
      const lockKey = path.relative(packageRoot, directory).split(path.sep).join('/');
      assert.equal(metadata.version, lock.packages[lockKey].version, name);
      const inventory = files(directory).map((relative) => ({
        path: relative,
        sha256: digest(path.join(directory, relative)),
      }));
      assert.ok(inventory.length > 0, name);
      visited.set(name, { name, version: metadata.version, root: directory, entry, inventory });
      visit(directory);
    }
  }
  visit(packageRoot);
  assert.deepEqual([...visited.keys()].sort(), productionDependencies);
  const imports = JSON.parse(
    run(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        'process.stdout.write(JSON.stringify(process.argv.slice(1).map(name=>({name,url:import.meta.resolve(name)}))));',
        ...productionDependencies,
      ],
      packageRoot
    )
  );
  for (const { name, url } of imports)
    assert.equal(
      realpathSync(fileURLToPath(url)).startsWith(privateModules + path.sep),
      true,
      name
    );
  return [...visited.values()];
}
function qualifyStage(packageRoot, report) {
  for (const entry of report.files)
    assert.equal(
      digest(path.join(packageRoot, entry.path)),
      digest(path.join(source, entry.path)),
      entry.path
    );
  return qualifyDependencies(packageRoot);
}
function publishStage(staged, live, report) {
  assert.equal(existsSync(live), false, 'never overwrite a selected package');
  qualifyStage(staged, report);
  mkdirSync(path.dirname(live), { recursive: true });
  renameSync(staged, live);
}
function admitted(result) {
  assert.equal(result.status, 0, result.stderr);
  if (result.stdout.trim())
    assert.notEqual(JSON.parse(result.stdout).decision, 'block', result.stdout);
}
function refused(result) {
  assert.equal(
    result.status === 2 ||
      (result.status === 0 &&
        result.stdout.trim() &&
        JSON.parse(result.stdout).decision === 'block'),
    true,
    result.stderr + result.stdout
  );
}

test('complete package staging and atomic hook selection preserve safe interruption boundaries', async (t) => {
  const fixture = createRuntimeRootFixture('bootstrap-install-');
  const packDir = path.join(fixture, '.tmp', 'pack');
  const staged = path.join(fixture, '.tmp', 'stage', 'node_modules', packageName);
  const live = path.join(fixture, 'node_modules', packageName);
  try {
    mkdirSync(packDir, { recursive: true });
    mkdirSync(staged, { recursive: true });
    const report = parseNpmPackReport(
      run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', packDir], source),
      { expectedPackageName: packageName, requireFilename: true }
    );
    const archive = path.join(packDir, report.filename);
    assert.equal(
      'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64'),
      report.integrity
    );
    assert.match(digest(archive), /^[a-f0-9]{64}$/);
    run('tar', ['-xzf', archive, '--strip-components=1', '-C', staged], fixture);
    assert.deepEqual(
      files(staged),
      report.files.map((entry) => entry.path).sort(),
      'complete archive inventory, without extra entries'
    );
    for (const entry of report.files)
      assert.equal(
        digest(path.join(staged, entry.path)),
        digest(path.join(source, entry.path)),
        entry.path
      );
    cpSync(path.join(source, 'package-lock.json'), path.join(staged, 'package-lock.json'));
    run(
      'npm',
      [
        'ci',
        '--prefix',
        staged,
        '--omit=dev',
        '--ignore-scripts',
        '--offline',
        '--no-audit',
        '--no-fund',
      ],
      fixture
    );
    cpSync(path.join(staged, 'node_modules'), path.join(fixture, 'node_modules'), {
      recursive: true,
    });
    for (const directory of [
      'bin',
      'scripts',
      'config',
      'guidance',
      'instructions',
      'docs',
      'skill',
    ])
      cpSync(path.join(source, directory), path.join(fixture, directory), { recursive: true });
    cpSync(path.join(source, 'package.json'), path.join(fixture, 'package.json'));
    mkdirSync(path.join(fixture, '.codex'), { recursive: true });
    cpSync(path.join(source, '.codex/hooks.json'), path.join(fixture, '.codex/hooks.json'));
    writeFileSync(path.join(fixture, '.gitignore'), '.tmp/\nnode_modules/\n.ai-task-manager/\n');
    run('git', ['add', '.'], fixture);
    run(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.test',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-qm',
        'Fixture runtime',
      ],
      fixture
    );
    const configuration = JSON.parse(readFileSync(path.join(source, '.codex/hooks.json'), 'utf8'));
    const command = configuration.hooks.PreToolUse.flatMap((entry) => entry.hooks).find((entry) =>
      entry.command.includes('activity-guard.mjs')
    ).command;
    const configuredGuards = configuration.hooks.PreToolUse.flatMap((entry) =>
      entry.hooks.map((item) => ({ matcher: entry.matcher, command: item.command }))
    );
    assert.equal(configuredGuards.length, 4);
    const guardCases = configuredGuards.map((entry) => {
      const script = ['bash-guard.mjs', 'activity-guard.mjs', 'source-edit-gate.mjs'].find((name) =>
        entry.command.includes(name)
      );
      assert.ok(script);
      const edit = entry.matcher.includes('apply_patch');
      return {
        ...entry,
        script,
        edit,
        tool: edit ? 'apply_patch' : 'Bash',
        positive: edit
          ? {
              command:
                '*** Begin Patch\n*** Add File: .scratch/fixture-proof.md\n+proof\n*** End Patch',
            }
          : 'git status --short',
        negative: edit
          ? {
              command:
                '*** Begin Patch\n*** Add File: src/unauthorized.mjs\n+unauthorized\n*** End Patch',
            }
          : script === 'bash-guard.mjs'
            ? 'gh issue create --title forbidden'
            : 'touch unauthorized.mjs',
      };
    });
    const qualified = qualifyStage(staged, report);
    assert.equal(qualified.length, 6);
    const expected = (root) =>
      pathToFileURL(path.join(root, 'scripts/task-tracker/lib/native-runtime-observation.mjs'))
        .href;

    await t.test('before publication and interrupted staging retain actual source fallback', () => {
      assert.equal(existsSync(live), false);
      assert.equal(
        observation(command, fixture, '1'.repeat(32)).helperModule.url,
        expected(fixture)
      );
      const refused = hook(command, fixture, 'touch unauthorized.mjs');
      assert.equal(refused.status, 0, refused.stderr);
      assert.equal(JSON.parse(refused.stdout).decision, 'block');
      assert.equal(existsSync(path.join(fixture, 'unauthorized.mjs')), false);
    });
    await t.test(
      'every configured enforcement hook runs through source fallback before publication',
      () => {
        for (const item of guardCases) {
          admitted(hook(item.command, fixture, item.positive, item.tool));
          refused(hook(item.command, fixture, item.negative, item.tool));
        }
      }
    );
    await t.test(
      'missing entry or any locked private dependency refuses publication without selecting a partial stage',
      () => {
        for (const script of ['bash-guard.mjs', 'activity-guard.mjs', 'source-edit-gate.mjs']) {
          const entry = path.join(staged, 'scripts/task-tracker', script);
          renameSync(entry, entry + '.held');
          try {
            assert.throws(() => publishStage(staged, live, report));
            assert.equal(existsSync(live), false);
          } finally {
            renameSync(entry + '.held', entry);
          }
        }
        for (const name of productionDependencies) {
          const dependency = path.join(staged, 'node_modules', name);
          renameSync(dependency, dependency + '.held');
          try {
            assert.throws(() => publishStage(staged, live, report));
            assert.equal(existsSync(live), false);
          } finally {
            renameSync(dependency + '.held', dependency);
          }
        }
      }
    );
    await t.test(
      'one filesystem rename selects the whole qualified package including private dependencies',
      () => {
        publishStage(staged, live, report);
        assert.equal(existsSync(staged), false);
        assert.equal(
          observation(command, fixture, '3'.repeat(32)).helperModule.url,
          expected(live)
        );
        const probe = run(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            "import {createRequire} from 'node:module'; const r=createRequire(process.cwd()+'/package.json'); process.stdout.write(r.resolve('espree'));",
          ],
          live
        );
        assert.equal(probe.startsWith(path.join(live, 'node_modules') + path.sep), true);
        const cli = run(
          process.execPath,
          [path.join(live, 'bin/aitm.mjs'), 'doctor', '--help'],
          fixture
        );
        assert.match(cli, /doctor/);
        assert.equal(
          JSON.parse(hook(command, fixture, 'touch unauthorized.mjs').stdout).decision,
          'block'
        );
      }
    );
    await t.test(
      'every configured enforcement hook selects the actual package, preserves installed self-edit refusal and fails closed with both entries absent',
      () => {
        for (const item of guardCases) {
          const fallback = path.join(fixture, 'scripts/task-tracker', item.script);
          const installed = path.join(live, 'scripts/task-tracker', item.script);
          renameSync(fallback, fallback + '.held');
          try {
            admitted(hook(item.command, fixture, item.positive, item.tool));
            refused(hook(item.command, fixture, item.negative, item.tool));
            if (item.edit) {
              const target = path
                .join('node_modules', packageName, 'scripts/task-tracker/activity-guard.mjs')
                .split(path.sep)
                .join('/');
              const result = hook(
                item.command,
                fixture,
                {
                  command: `*** Begin Patch\n*** Update File: ${target}\n@@\n-old\n+new\n*** End Patch`,
                },
                item.tool
              );
              refused(result);
              assert.match(JSON.parse(result.stdout).reason, /installed guard/i);
            }
            renameSync(installed, installed + '.held');
            try {
              assert.equal(
                hook(item.command, fixture, item.positive, item.tool).status,
                2,
                'missing both configured entries must fail closed'
              );
            } finally {
              renameSync(installed + '.held', installed);
            }
          } finally {
            renameSync(fallback + '.held', fallback);
          }
        }
        assert.equal(qualifyDependencies(live).length, 6);
      }
    );
    await t.test(
      'missing package entry and whole-package deletion select the verified source fallback',
      () => {
        const guard = path.join(live, 'scripts/task-tracker/activity-guard.mjs');
        const bytes = readFileSync(guard);
        rmSync(guard);
        assert.equal(
          observation(command, fixture, '4'.repeat(32)).helperModule.url,
          expected(fixture)
        );
        writeFileSync(guard, bytes, { mode: 0o755 });
        renameSync(live, staged);
        assert.equal(
          observation(command, fixture, '5'.repeat(32)).helperModule.url,
          expected(fixture)
        );
        renameSync(staged, live);
      }
    );
    await t.test(
      'dependency loss during recovery cannot turn an unbound write into an unblocked hook error',
      () => {
        for (const modules of [path.join(live, 'node_modules'), path.join(fixture, 'node_modules')])
          for (const name of productionDependencies) {
            const dependency = path.join(modules, name);
            if (existsSync(dependency)) renameSync(dependency, dependency + '.held');
          }
        for (const item of guardCases)
          refused(hook(item.command, fixture, item.negative, item.tool));
      }
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
