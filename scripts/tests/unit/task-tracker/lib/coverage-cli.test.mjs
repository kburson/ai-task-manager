// @story #651
// Coverage + behaviour for `bin/cli.mjs` (the `npx ai-task-manager` entrypoint).
//
// Two complementary surfaces:
//   1. Exported pure-ish functions (color helpers, patchSettingsJson,
//      patchCodexHooksJson) are imported and called directly. Importing the
//      module does NOT dispatch — the `invokedDirectly` guard (#212) only fires
//      when the file is the process entrypoint.
//   2. The dispatch table + command bodies are driven as a child process via
//      `spawnSync(node, [cli, ...argv])`, asserting exit code + output. Side
//      effects are confined to scratch `--target` dirs and a scratch `$HOME`,
//      so nothing escapes into the real project or user home.

import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import * as cli from '../../../../../bin/cli.mjs';

const repoRoot = fileURLToPath(new URL('../../../../..', import.meta.url));
const CLI = join(repoRoot, 'bin', 'cli.mjs');

function flatHookCommands(config, event) {
  return (config.hooks?.[event] ?? []).flatMap((entry) => [
    ...(typeof entry === 'string' ? [entry] : []),
    ...(entry.command ? [entry.command] : []),
    ...(entry.hooks ?? []).map((inner) => inner.command).filter(Boolean),
  ]);
}

function commandCount(config, event, commandPart) {
  return flatHookCommands(config, event).filter((cmd) => cmd.includes(commandPart)).length;
}

function run(argv, opts = {}) {
  return spawnSync(process.execPath, [CLI, ...argv], { encoding: 'utf8', ...opts });
}
function scratch(prefix) {
  return mkdtempSync(join(projectScratchDir('test'), prefix));
}

// ---------------------------------------------------------------------------
// 1. Exported helpers
// ---------------------------------------------------------------------------

test('color helpers return the wrapped content regardless of TTY', () => {
  for (const fn of [
    cli.bold,
    cli.dim,
    cli.green,
    cli.red,
    cli.yellow,
    cli.cyan,
    cli.magenta,
    cli.bgBlue,
    cli.bgGreen,
    cli.bgYellow,
  ]) {
    assert.ok(fn('TOKEN').includes('TOKEN'));
  }
  assert.ok(cli.colorize('\x1b[1m', 'X').includes('X'));
});

test('patchSettingsJson creates settings and is idempotent', () => {
  const dir = scratch('cli-settings-');
  const p = join(dir, '.claude', 'settings.json');
  cli.patchSettingsJson(p);
  const first = JSON.parse(readFileSync(p, 'utf8'));
  assert.ok(Array.isArray(first.hooks.SessionStart) && first.hooks.SessionStart.length >= 1);
  assert.ok(Array.isArray(first.hooks.PreToolUse) && first.hooks.PreToolUse.length >= 1);
  assert.ok(Array.isArray(first.permissions.allow) && first.permissions.allow.length >= 1);
  cli.patchSettingsJson(p); // re-run hits the "already registered" branches
  const second = JSON.parse(readFileSync(p, 'utf8'));
  assert.deepEqual(second, first);
});

test('patchSettingsJson migrates legacy hook commands and broad Bash allow', () => {
  const dir = scratch('cli-settings-legacy-');
  const p = join(dir, '.claude', 'settings.json');
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(
    p,
    JSON.stringify({
      hooks: {
        SessionStart: [
          { matcher: '', hooks: [{ type: 'command', command: '.claude/hooks/task-tracker.sh' }] },
        ],
        PostToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: '.claude/hooks/commit-trail.sh' }],
          },
        ],
      },
      permissions: { allow: ['Bash'] },
    }),
    'utf8'
  );
  cli.patchSettingsJson(p);
  const out = JSON.parse(readFileSync(p, 'utf8'));
  assert.ok(!out.permissions.allow.includes('Bash'), 'broad Bash allow migrated away');
  const ssCmds = out.hooks.SessionStart.flatMap((h) => h.hooks?.map((i) => i.command) ?? []);
  assert.ok(!ssCmds.includes('.claude/hooks/task-tracker.sh'), 'legacy timing hook removed');
  const ptCmds = out.hooks.PostToolUse.flatMap((h) => h.hooks?.map((i) => i.command) ?? []);
  assert.ok(!ptCmds.includes('.claude/hooks/commit-trail.sh'), 'legacy commit-trail hook removed');
});

test('patchSettingsJson tolerates a malformed existing file', () => {
  const dir = scratch('cli-settings-bad-');
  const p = join(dir, '.claude', 'settings.json');
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(p, '{ not json', 'utf8');
  cli.patchSettingsJson(p);
  const out = JSON.parse(readFileSync(p, 'utf8'));
  assert.ok(out.hooks && out.permissions);
});

test('patchCodexHooksJson creates hooks, is idempotent, tolerates garbage', () => {
  const dir = scratch('cli-codex-');
  const p = join(dir, '.codex', 'hooks.json');
  cli.patchCodexHooksJson(p);
  const first = JSON.parse(readFileSync(p, 'utf8'));
  assert.ok(Array.isArray(first.hooks.SessionStart) && first.hooks.SessionStart.length >= 1);
  assert.ok(Array.isArray(first.hooks.PreToolUse) && first.hooks.PreToolUse.length >= 1);
  cli.patchCodexHooksJson(p);
  assert.deepEqual(JSON.parse(readFileSync(p, 'utf8')), first);

  const dir2 = scratch('cli-codex-bad-');
  const p2 = join(dir2, '.codex', 'hooks.json');
  mkdirSync(join(dir2, '.codex'), { recursive: true });
  writeFileSync(p2, 'nonsense', 'utf8');
  cli.patchCodexHooksJson(p2);
  assert.ok(JSON.parse(readFileSync(p2, 'utf8')).hooks);
});

test('patchCodexHooksJson registers memory index hooks only when requested', () => {
  const dir = scratch('cli-codex-memory-');
  const p = join(dir, '.codex', 'hooks.json');

  cli.patchCodexHooksJson(p, { memoryIndexHook: false });
  let config = JSON.parse(readFileSync(p, 'utf8'));
  assert.equal(
    commandCount(config, 'SessionStart', 'hooks/memory-index.mjs'),
    0,
    'no SessionStart memory index hook when seed selection was none'
  );
  assert.equal(
    commandCount(config, 'PostCompact', 'hooks/memory-index.mjs'),
    0,
    'no PostCompact memory index hook when seed selection was none'
  );
  assert.equal(
    commandCount(config, 'PreCompact', 'hooks/memory-index.mjs'),
    0,
    'memory index hook must never register on PreCompact'
  );

  cli.patchCodexHooksJson(p, { memoryIndexHook: true });
  config = JSON.parse(readFileSync(p, 'utf8'));
  assert.equal(
    commandCount(config, 'SessionStart', 'hooks/memory-index.mjs'),
    1,
    'SessionStart memory index hook registered'
  );
  assert.equal(
    commandCount(config, 'PostCompact', 'hooks/memory-index.mjs'),
    1,
    'PostCompact memory index hook registered'
  );
  assert.equal(
    commandCount(config, 'PreCompact', 'hooks/memory-index.mjs'),
    0,
    'PreCompact remains timing-only for memory index'
  );

  cli.patchCodexHooksJson(p, { memoryIndexHook: true });
  config = JSON.parse(readFileSync(p, 'utf8'));
  assert.equal(commandCount(config, 'SessionStart', 'hooks/memory-index.mjs'), 1);
  assert.equal(commandCount(config, 'PostCompact', 'hooks/memory-index.mjs'), 1);
});

// ---------------------------------------------------------------------------
// 2. Dispatch surface (child process)
// ---------------------------------------------------------------------------

test('version subcommand and aliases print the package version', () => {
  for (const v of ['version', '-v', '--version']) {
    const r = run([v]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /ai-task-manager v\d+\.\d+\.\d+/);
  }
});

test('no-args prints help while an unknown verb returns a usage error', () => {
  const r = run([]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Usage/);
  const r2 = run(['totally-unknown-verb']);
  assert.equal(r2.status, 2, r2.stderr);
  assert.match(`${r2.stdout}${r2.stderr}`, /Usage/);
});

test('configure with a bad or missing subcommand exits 1', () => {
  const r = run(['configure', 'bogus']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown configure subcommand/);
  const r2 = run(['configure']);
  assert.equal(r2.status, 1);
});

test('install rejects bad --agent and --link-mode', () => {
  const r = run(['install', '--agent', 'bogus']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown --agent/);
  const r2 = run(['install', '--link-mode', 'bogus']);
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /Unknown --link-mode/);
});

test('install --link-mode stub writes skill, settings, templates and is idempotent', () => {
  const target = scratch('cli-install-');
  const home = scratch('cli-home-');
  const env = { ...process.env, HOME: home };
  const r1 = run(['install', '--target', target, '--agent', 'both', '--link-mode', 'stub'], {
    env,
  });
  assert.equal(r1.status, 0, r1.stderr);
  assert.ok(existsSync(join(target, '.claude', 'settings.json')), 'claude settings written');
  assert.ok(existsSync(join(target, '.codex', 'hooks.json')), 'codex hooks written');
  assert.ok(existsSync(join(target, '.ai-task-manager')), 'templates dir written');
  const r2 = run(['install', '--target', target, '--agent', 'both', '--link-mode', 'stub'], {
    env,
  });
  assert.equal(r2.status, 0, r2.stderr); // second run exercises the "unchanged" branches
});

test('install --link-mode symlink links the skill dirs', () => {
  const target = scratch('cli-symlink-');
  const home = scratch('cli-home-');
  const r = run(['install', '--target', target, '--link-mode', 'symlink'], {
    env: { ...process.env, HOME: home },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(target, '.claude', 'skills', 'task')), 'claude skill symlink present');
});

test('statusline installs under an overridden HOME', () => {
  const home = scratch('cli-statusline-');
  mkdirSync(join(home, '.claude'), { recursive: true });
  const r = run(['statusline'], { env: { ...process.env, HOME: home } });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(home, '.claude', 'statusline.sh')), 'statusline script installed');
  assert.ok(existsSync(join(home, '.claude', 'settings.json')), 'user settings updated');
});

// ---------------------------------------------------------------------------
// 3. configurePreferences seam (#651)
// ---------------------------------------------------------------------------
// The interactive prompt loop reads from readline, which is not reliably driven
// over buffered child stdin. The behaviour-preserving seam exposes the loop with
// an injectable `ask`, so we drive every branch deterministically here.

test('configurePreferences with all-empty answers writes defaults', async () => {
  const dir = scratch('cli-prefs-empty-');
  const prefs = await cli.configurePreferences({
    targetDir: dir,
    ask: async () => '', // Enter on every prompt → keep current/default
    log: () => {},
  });
  const cfgPath = join(dir, '.ai-task-manager', 'task-tracker.json');
  assert.ok(existsSync(cfgPath), 'config written');
  const onDisk = JSON.parse(readFileSync(cfgPath, 'utf8'));
  assert.deepEqual(onDisk.preferences, prefs);
  assert.equal(typeof prefs.noPushToOrigin, 'boolean');
  assert.ok(prefs.formatting && typeof prefs.formatting === 'object');
  assert.equal(typeof prefs.scratchDir, 'string');
});

test('configurePreferences with "y" answers parses every bool branch truthy', async () => {
  const dir = scratch('cli-prefs-yes-');
  const prefs = await cli.configurePreferences({
    targetDir: dir,
    ask: async () => 'y', // exercises the parseBool / inline truthy branches
    log: () => {},
  });
  assert.equal(prefs.noPushToOrigin, true);
  assert.equal(prefs.mainThreadOnly, true);
  assert.equal(prefs.driveSubIssuesToReview, true);
  assert.equal(prefs.pauseTimerOnBlockingQuestion, true);
  assert.equal(prefs.noConfirmAfterDeepDive, true);
  assert.equal(prefs.askGatesBeforeParallel, true);
  assert.equal(prefs.formatting.noEmojis, true);
  assert.equal(prefs.formatting.currencyInBackticks, true);
});

test('configurePreferences merges over an existing config and a custom scratchDir', async () => {
  const dir = scratch('cli-prefs-merge-');
  mkdirSync(join(dir, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    join(dir, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({
      assignee: '@me',
      preferences: { noPushToOrigin: true, formatting: { noEmojis: true } },
    }),
    'utf8'
  );
  // 'n' flips bools off; the final scratchDir prompt gets a non-empty value.
  const answers = ['n', 'n', 'n', 'n', 'n', 'n', 'n', 'n', './scratch'];
  let i = 0;
  const prefs = await cli.configurePreferences({
    targetDir: dir,
    ask: async () => answers[i++],
    log: () => {},
  });
  assert.equal(prefs.noPushToOrigin, false);
  assert.equal(prefs.formatting.noEmojis, false);
  assert.equal(prefs.scratchDir, './scratch');
  const onDisk = JSON.parse(
    readFileSync(join(dir, '.ai-task-manager', 'task-tracker.json'), 'utf8')
  );
  assert.equal(onDisk.assignee, '@me', 'pre-existing non-preference keys preserved');
});

test('configurePreferences tolerates a malformed existing config', async () => {
  const dir = scratch('cli-prefs-bad-');
  mkdirSync(join(dir, '.ai-task-manager'), { recursive: true });
  writeFileSync(join(dir, '.ai-task-manager', 'task-tracker.json'), '{ not json', 'utf8');
  const prefs = await cli.configurePreferences({
    targetDir: dir,
    ask: async () => '',
    log: () => {},
  });
  assert.ok(prefs && typeof prefs === 'object');
});
