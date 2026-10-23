// @story #2088
// cspell:words globalconfig LOGNAME SYSTEMROOT WINDIR
// These are offline hook-process fixtures, not evidence of a live native worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';

const source = fileURLToPath(new URL('../../../../..', import.meta.url));
const guard = path.join(source, 'scripts/task-tracker/activity-guard.mjs');
const sid = 'bootstrap-native-fixture';
const canonical = 'bash scripts/dev-env/setup-local-worktree.sh';
// Independently enumerated runtime closure, including npm lifecycle inputs.
const inputs = [
  'scripts/dev-env/setup-local-worktree.sh',
  'package.json',
  'package-lock.json',
  'bin/lib/stamp-skill-version.mjs',
  'scripts/dev-env/verify-local-worktree.mjs',
  'scripts/lib/self-doc.mjs',
  'scripts/providers/index.mjs',
  'scripts/providers/claude.mjs',
  'scripts/providers/codex.mjs',
  'scripts/providers/grok.mjs',
  'scripts/task-tracker/ensure-self-link.mjs',
  'scripts/task-tracker/lib/ensure-self-link.mjs',
  'scripts/task-tracker/paths.mjs',
  'scripts/task-tracker/lib/runtime-storage.mjs',
];
function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function fixture() {
  const parent = createRuntimeRootFixture('native-bootstrap-');
  for (const file of inputs) {
    mkdirSync(path.dirname(path.join(parent, file)), { recursive: true });
    copyFileSync(path.join(source, file), path.join(parent, file));
  }
  writeFileSync(path.join(parent, '.gitignore'), '.tmp/\nnode_modules/\nworker/\n');
  git(parent, 'add', '.');
  git(
    parent,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '-qm',
    'Fixture'
  );
  const root = path.join(parent, 'worker');
  git(parent, 'worktree', 'add', '--detach', root, 'HEAD');
  const env = Object.fromEntries(
    [
      'USER',
      'LOGNAME',
      'TMPDIR',
      'TEMP',
      'TMP',
      'SYSTEMROOT',
      'WINDIR',
      'COMSPEC',
      'LANG',
      'LC_ALL',
      'TZ',
    ]
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]])
  );
  // The fixture supplies trusted host tools; native lifecycle capture can add
  // a project-local gh shim to its caller PATH, which production must refuse.
  const home = path.join(parent, 'fixture-home');
  mkdirSync(home);
  Object.assign(env, {
    HOME: home,
    XDG_CONFIG_HOME: home,
    PATH: [
      path.dirname(process.execPath),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ].join(path.delimiter),
    CODEX_THREAD_ID: sid,
    CODEX_SESSION_ID: sid,
  });
  for (const key of [
    'AI_TASK_MANAGER_SESSION_ID',
    'AI_TASK_MANAGER_PROJECT_DIR',
    'TASK_TRACKER_PROJECT_DIR',
    'CLAUDE_PROJECT_DIR',
    'AITM_CAPTURE_PROJECT_DIR',
  ])
    delete env[key];
  return { root, parent, env };
}
function run(root, env, command = canonical, extra = {}) {
  const result = spawnSync(process.execPath, [guard], {
    cwd: root,
    env,
    encoding: 'utf8',
    input: JSON.stringify({
      session_id: sid,
      cwd: root,
      tool_name: 'Bash',
      tool_input: { command },
      ...extra,
    }),
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

test('canonical trusted setup is admitted before native issue binding', () => {
  const f = fixture();
  try {
    assert.equal(
      run(f.root, f.env),
      null,
      execFileSync('git', ['-C', f.root, 'config', '--show-origin', '--name-only', '--list'], {
        env: f.env,
        encoding: 'utf8',
      })
    );
    assert.equal(git(f.root, 'status', '--porcelain'), '');
  } finally {
    rmSync(f.parent, { recursive: true, force: true });
  }
});

test('unbound writes and near-match setup commands remain refused', () => {
  const f = fixture();
  try {
    for (const command of [
      canonical + '; touch product.mjs',
      canonical + ' --help',
      'env ' + canonical,
      'bash -c "bash scripts/dev-env/setup-local-worktree.sh"',
      canonical + ' > result.txt',
      'npm ci',
      'touch product.mjs',
    ])
      assert.equal(run(f.root, f.env, command)?.decision, 'block', command);
  } finally {
    rmSync(f.parent, { recursive: true, force: true });
  }
});

test('arbitrary committed setup replacement never becomes trusted by being clean', () => {
  const f = fixture();
  try {
    const file = path.join(f.root, inputs[0]);
    writeFileSync(file, readFileSync(file, 'utf8') + '\n# changed input\n');
    git(f.root, 'add', inputs[0]);
    git(
      f.root,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '-qm',
      'Alter setup'
    );
    assert.equal(git(f.root, 'status', '--porcelain'), '');
    assert.equal(run(f.root, f.env)?.decision, 'block');
  } finally {
    rmSync(f.parent, { recursive: true, force: true });
  }
});

test('conflicting native identity and execution injection refuse canonical setup', () => {
  const f = fixture();
  try {
    for (const changes of [
      { CODEX_SESSION_ID: 'another-worker' },
      { AI_TASK_MANAGER_SESSION_ID: sid },
      { BASH_ENV: '/untrusted/init' },
      { NODE_OPTIONS: '--inspect' },
      { npm_config_script_shell: '/untrusted/shell' },
    ])
      assert.equal(
        run(f.root, { ...f.env, ...changes })?.decision,
        'block',
        JSON.stringify(changes)
      );
  } finally {
    rmSync(f.parent, { recursive: true, force: true });
  }
});

test('doctor accepts a closed JSON binding-proof request without changing ordinary health forms', async () => {
  const { parseDoctorArgs } = await import('../../../../package/doctor.mjs');
  const nonce = 'a'.repeat(32);
  assert.deepEqual(parseDoctorArgs(['--json', '--binding-proof', nonce]), {
    json: true,
    bindingProof: nonce,
  });
  for (const args of [
    ['--binding-proof', nonce],
    ['--json', '--binding-proof', '../escape'],
    ['--json', '--binding-proof', nonce, '--json'],
  ])
    assert.throws(() => parseDoctorArgs(args));
});

test('offline hook and independently launched CLI compare one exact bound worker tuple', async () => {
  const { setActiveTask, getActiveTask } =
    await import('../../../../task-tracker/session-state.mjs');
  const f = fixture();
  try {
    setActiveTask(
      sid,
      {
        issue: '#2088',
        worktreePath: f.root,
        worktreeBranch: 'HEAD',
        bindingGenerationId: 'generation-fixture',
        entryStartTs: new Date().toISOString(),
        kanbanState: 'develop',
      },
      f.root
    );
    const before = getActiveTask(sid, f.root);
    const nonce = 'b'.repeat(32);
    run(f.root, f.env, 'npx aitm doctor --json --binding-proof ' + nonce);
    const result = spawnSync(
      process.execPath,
      [path.join(source, 'bin/aitm.mjs'), 'doctor', '--json', '--binding-proof', nonce],
      { cwd: f.root, env: f.env, encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const proof = JSON.parse(result.stdout);
    assert.equal(proof.schema, 'aitm.native-binding-proof/v1');
    assert.equal(proof.matches, true);
    assert.equal(proof.cli.issue, '#2088');
    assert.equal(proof.cli.bindingGenerationId, 'generation-fixture');
    assert.deepEqual(proof.hook, proof.cli);
    assert.deepEqual(getActiveTask(sid, f.root), before);
  } finally {
    rmSync(f.parent, { recursive: true, force: true });
  }
});

test('dirty input, project npm shadows and symbolic setup paths are refused', () => {
  const f = fixture();
  try {
    for (const file of ['.npmrc', 'npm-shrinkwrap.json', 'untracked.mjs']) {
      writeFileSync(path.join(f.root, file), '{}\n');
      assert.equal(run(f.root, f.env)?.decision, 'block', file);
      rmSync(path.join(f.root, file));
    }
    symlinkSync(f.parent, path.join(f.root, 'node_modules'));
    assert.equal(run(f.root, f.env)?.decision, 'block');
    rmSync(path.join(f.root, 'node_modules'));
    const script = path.join(f.root, inputs[0]);
    rmSync(script);
    symlinkSync(path.join(f.parent, inputs[0]), script);
    assert.equal(run(f.root, f.env)?.decision, 'block');
  } finally {
    rmSync(f.parent, { recursive: true, force: true });
  }
});

test('an issue binding in the main checkout cannot bootstrap another checkout', async () => {
  const { setActiveTask, getActiveTask } =
    await import('../../../../task-tracker/session-state.mjs');
  const f = fixture();
  try {
    const branch = git(f.parent, 'branch', '--show-current').trim();
    setActiveTask(
      sid,
      {
        issue: '#2088',
        worktreePath: f.parent,
        worktreeBranch: branch,
        bindingGenerationId: 'foreign-generation',
        entryStartTs: new Date().toISOString(),
        kanbanState: 'develop',
      },
      f.parent
    );
    const before = getActiveTask(sid, f.parent);
    assert.equal(run(f.root, f.env)?.decision, 'block');
    assert.deepEqual(getActiveTask(sid, f.parent), before);
  } finally {
    rmSync(f.parent, { recursive: true, force: true });
  }
});

test('diagnostic compares every tuple dimension and never repairs binding state', async () => {
  const { setActiveTask, getActiveTask } =
    await import('../../../../task-tracker/session-state.mjs');
  const { inspectNativeBindingProof } =
    await import('../../../../task-tracker/lib/native-binding-proof.mjs');
  const f = fixture();
  try {
    setActiveTask(
      sid,
      {
        issue: '#2088',
        worktreePath: f.root,
        worktreeBranch: 'HEAD',
        bindingGenerationId: 'proof-generation',
        entryStartTs: new Date().toISOString(),
        kanbanState: 'develop',
      },
      f.root
    );
    const before = getActiveTask(sid, f.root);
    const keys = [
      'sessionId',
      'root',
      'branch',
      'sourceHead',
      'issue',
      'bindingGenerationId',
      'state',
      'entryStartTs',
    ];
    for (let index = 0; index < keys.length; index++) {
      const nonce = (index + 1).toString(16).padStart(32, '0');
      run(f.root, f.env, 'npx aitm doctor --json --binding-proof ' + nonce);
      const file = path.join(f.root, '.tmp/aitm/native-binding-proof', sid, nonce + '.json');
      const observation = JSON.parse(readFileSync(file, 'utf8'));
      observation.hook[keys[index]] = 'adversarial mismatch';
      writeFileSync(file, JSON.stringify(observation));
      const result = inspectNativeBindingProof({ cwd: f.root, nonce, env: f.env });
      assert.equal(result.healthy, false, keys[index]);
      assert.deepEqual(result.mismatches, [keys[index]]);
      assert.deepEqual(getActiveTask(sid, f.root), before);
    }
  } finally {
    rmSync(f.parent, { recursive: true, force: true });
  }
});

test('missing, stale, malformed and reused diagnostic observations fail closed', async () => {
  const { inspectNativeBindingProof } =
    await import('../../../../task-tracker/lib/native-binding-proof.mjs');
  const f = fixture();
  try {
    const nonce = 'c'.repeat(32);
    assert.equal(inspectNativeBindingProof({ cwd: f.root, nonce, env: f.env }).healthy, false);
    run(f.root, f.env, 'npx aitm doctor --json --binding-proof ' + nonce);
    const file = path.join(f.root, '.tmp/aitm/native-binding-proof', sid, nonce + '.json');
    const original = JSON.parse(readFileSync(file, 'utf8'));
    writeFileSync(file, JSON.stringify({ ...original, observedAt: Date.now() - 61000 }));
    assert.match(inspectNativeBindingProof({ cwd: f.root, nonce, env: f.env }).error, /stale/);
    writeFileSync(file, '{invalid');
    assert.equal(inspectNativeBindingProof({ cwd: f.root, nonce, env: f.env }).healthy, false);
    writeFileSync(file, JSON.stringify(original));
    const unbound = inspectNativeBindingProof({ cwd: f.root, nonce, env: f.env });
    assert.equal(unbound.matches, true);
    assert.equal(unbound.bound, false);
    assert.equal(unbound.healthy, false);
    assert.equal(
      run(f.root, f.env, 'npx aitm doctor --json --binding-proof ' + nonce)?.decision,
      'block'
    );
    assert.equal(inspectNativeBindingProof({ cwd: f.root, nonce, env: f.env }).healthy, false);
  } finally {
    rmSync(f.parent, { recursive: true, force: true });
  }
});

test('native hook refuses conflicting proof identity and symlinked diagnostic storage', () => {
  const f = fixture();
  try {
    const command = 'npx aitm doctor --json --binding-proof ' + 'd'.repeat(32);
    assert.equal(
      run(f.root, f.env, command, { session_id: 'another-native-worker' })?.decision,
      'block'
    );
    const destination = path.join(f.parent, 'diagnostic-outside-worker');
    mkdirSync(destination);
    symlinkSync(destination, path.join(f.root, '.tmp'));
    assert.equal(run(f.root, f.env, command)?.decision, 'block');
    assert.equal(git(f.root, 'status', '--porcelain').includes('native-binding-proof'), false);
  } finally {
    rmSync(f.parent, { recursive: true, force: true });
  }
});

test('reviewed digest inventory covers the executable setup closure independently', async () => {
  const { parse, VisitorKeys } = await import('espree');
  const { builtinModules } = await import('node:module');
  const { BOOTSTRAP_INPUT_DIGESTS } =
    await import('../../../../task-tracker/lib/native-bootstrap-inputs.mjs');
  const { createHash } = await import('node:crypto');
  const pkg = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'));
  const shell = readFileSync(path.join(source, inputs[0]), 'utf8');
  const pending = [...shell.matchAll(/\bnode +(scripts\/[^\s]+\.mjs)/g)].map((match) => match[1]);
  for (const match of shell.matchAll(/\bnpm +run +([a-z:-]+)/g)) {
    assert.match(pkg.scripts[match[1]], /^node +[A-Za-z0-9/._-]+\.mjs$/);
    pending.push(pkg.scripts[match[1]].split(' ')[1]);
  }
  for (const key of ['preinstall', 'install', 'postinstall', 'prepare']) {
    if (!pkg.scripts[key]) continue;
    assert.match(pkg.scripts[key], /^node +[A-Za-z0-9/._-]+\.mjs$/);
    pending.push(pkg.scripts[key].split(' ')[1]);
  }
  const closure = new Set([inputs[0], 'package.json', 'package-lock.json']);
  while (pending.length) {
    const relative = pending.pop();
    if (closure.has(relative)) continue;
    closure.add(relative);
    const tree = parse(readFileSync(path.join(source, relative), 'utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'module',
    });
    const visit = (node) => {
      if (!node || typeof node.type !== 'string') return;
      if (
        [
          'ImportDeclaration',
          'ExportNamedDeclaration',
          'ExportAllDeclaration',
          'ImportExpression',
        ].includes(node.type) &&
        node.source
      ) {
        assert.equal(
          node.source.type,
          'Literal',
          'dynamic setup imports must be statically inspectable'
        );
        const specifier = node.source.value;
        if (specifier.startsWith('.'))
          pending.push(
            path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier))
          );
        else
          assert.ok(
            builtinModules.includes(specifier) ||
              (specifier.startsWith('node:') && builtinModules.includes(specifier.slice(5))),
            specifier
          );
      }
      for (const key of VisitorKeys[node.type] ?? []) {
        const value = node[key];
        if (Array.isArray(value)) value.forEach(visit);
        else visit(value);
      }
    };
    visit(tree);
  }
  assert.deepEqual([...closure].sort(), Object.keys(BOOTSTRAP_INPUT_DIGESTS).sort());
  for (const relative of closure)
    assert.equal(
      createHash('sha256')
        .update(readFileSync(path.join(source, relative)))
        .digest('hex'),
      BOOTSTRAP_INPUT_DIGESTS[relative],
      relative
    );
});

test('CLI requires Codex identity and native setup rejects inherited Bash functions', async () => {
  const { assertNativeSession } =
    await import('../../../../task-tracker/lib/native-worktree-bootstrap.mjs');
  assert.throws(() => assertNativeSession('default-session', {}), /native Codex/);
  assert.throws(
    () => assertNativeSession('claude-only', { CLAUDE_SESSION_ID: 'claude-only' }),
    /native Codex/
  );
  const f = fixture();
  try {
    assert.equal(
      run(f.root, { ...f.env, 'BASH_FUNC_npm%%': '() { printf untrusted; }' })?.decision,
      'block'
    );
  } finally {
    rmSync(f.parent, { recursive: true, force: true });
  }
});

test('canonical setup refuses external PATH shims before invoking them', () => {
  const f = fixture();
  try {
    const bin = path.join(f.parent, 'external-bin');
    mkdirSync(bin);
    const marker = path.join(f.parent, 'shim-was-executed');
    for (const name of ['git', 'dirname', 'npm']) {
      const shim = path.join(bin, name);
      writeFileSync(shim, '#!/bin/sh\ntouch ' + JSON.stringify(marker) + '\nexit 1\n');
      chmodSync(shim, 0o755);
      assert.equal(
        run(f.root, { ...f.env, PATH: bin + path.delimiter + f.env.PATH })?.decision,
        'block',
        name
      );
      assert.equal(
        spawnSync('test', ['-e', marker]).status,
        1,
        'untrusted executable must not run'
      );
      rmSync(shim);
    }
  } finally {
    rmSync(f.parent, { recursive: true, force: true });
  }
});

test('effective global and worktree Git execution configuration is refused before status', () => {
  const f = fixture();
  try {
    const home = path.join(f.parent, 'isolated-home');
    mkdirSync(home);
    writeFileSync(path.join(home, '.gitconfig'), '[filter "untrusted"]\n  clean = false\n');
    const global = run(f.root, { ...f.env, HOME: home });
    assert.equal(global?.decision, 'block');
    assert.match(global.reason, /Git execution configuration/);
    rmSync(path.join(home, '.gitconfig'));
    git(f.parent, 'config', 'extensions.worktreeConfig', 'true');
    git(f.root, 'config', '--worktree', 'filter.untrusted.clean', 'false');
    const worktree = run(f.root, { ...f.env, HOME: home });
    assert.equal(worktree?.decision, 'block');
    assert.match(worktree.reason, /Git execution configuration/);
  } finally {
    rmSync(f.parent, { recursive: true, force: true });
  }
});

test('npm user configuration cannot redirect execution or hide another global configuration', () => {
  const f = fixture();
  try {
    const home = path.join(f.parent, 'isolated-home');
    mkdirSync(home);
    for (const setting of [
      '\"script-shell\"=sh',
      "'script-shell'=sh",
      '\"globalconfig\"=local-config',
      'script-shell=/untrusted/shell',
      'node-options=--inspect',
      'globalconfig=/untrusted/npmrc',
      'prefix=/untrusted/prefix',
    ]) {
      writeFileSync(path.join(home, '.npmrc'), setting + '\n');
      const result = run(f.root, { ...f.env, HOME: home });
      assert.equal(result?.decision, 'block', setting);
      assert.match(result.reason, /npm execution configuration/);
    }
  } finally {
    rmSync(f.parent, { recursive: true, force: true });
  }
});

test('native hook payload remains authoritative when executor-only identity variables are absent', async () => {
  const { setActiveTask } = await import('../../../../task-tracker/session-state.mjs');
  const { inspectNativeBindingProof } =
    await import('../../../../task-tracker/lib/native-binding-proof.mjs');
  const f = fixture();
  try {
    const hookEnv = { ...f.env };
    delete hookEnv.CODEX_THREAD_ID;
    delete hookEnv.CODEX_SESSION_ID;
    assert.equal(run(f.root, hookEnv), null);
    setActiveTask(
      sid,
      {
        issue: '#2088',
        worktreePath: f.root,
        worktreeBranch: 'HEAD',
        bindingGenerationId: 'native-payload-generation',
        entryStartTs: new Date().toISOString(),
        kanbanState: 'develop',
      },
      f.root
    );
    const nonce = 'e'.repeat(32);
    const hookResult = run(f.root, hookEnv, 'npx aitm doctor --json --binding-proof ' + nonce);
    assert.notEqual(hookResult?.decision, 'block');
    const proof = inspectNativeBindingProof({ cwd: f.root, nonce, env: f.env });
    assert.equal(proof.healthy, true, JSON.stringify(proof));
    assert.deepEqual(proof.hook, proof.cli);
  } finally {
    rmSync(f.parent, { recursive: true, force: true });
  }
});

test('payload SID detects a foreign fleet binding when hook executor variables are absent', async () => {
  const { setActiveTask, getActiveTask } =
    await import('../../../../task-tracker/session-state.mjs');
  const { registerTask } = await import('../../../../task-tracker/fleet-registry.mjs');
  const f = fixture();
  try {
    const other = path.join(f.parent, 'another-worker');
    git(f.parent, 'worktree', 'add', '--detach', other, 'HEAD');
    setActiveTask(
      sid,
      {
        issue: '#2088',
        worktreePath: other,
        worktreeBranch: 'HEAD',
        bindingGenerationId: 'foreign-payload-generation',
        entryStartTs: new Date().toISOString(),
        kanbanState: 'develop',
      },
      other
    );
    registerTask(f.parent, '#2088', other, 'HEAD', 'child');
    const before = getActiveTask(sid, other);
    const hookEnv = { ...f.env };
    delete hookEnv.CODEX_THREAD_ID;
    delete hookEnv.CODEX_SESSION_ID;
    assert.equal(run(f.root, hookEnv)?.decision, 'block');
    assert.deepEqual(getActiveTask(sid, other), before);
  } finally {
    rmSync(f.parent, { recursive: true, force: true });
  }
});
