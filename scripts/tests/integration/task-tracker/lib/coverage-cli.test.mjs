// @story #651
// cspell:ignore dryrun
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
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  lstatSync,
  readlinkSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { writeIssueTemplates } from '../../../../task-tracker/lib/config-init/issue-templates.mjs';
import { codexBootstrapBlock } from '../../../../task-tracker/codex-superpowers.mjs';
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
  const activityMatchers = first.hooks.PreToolUse.filter((entry) =>
    (entry.hooks ?? []).some((hook) => hook.command?.includes('activity-guard'))
  ).map((entry) => entry.matcher);
  assert.deepEqual(
    activityMatchers.sort(),
    ['Bash', 'apply_patch|Edit|Write|NotebookEdit'].sort(),
    'Codex installs activity enforcement for both Bash and direct mutation tools'
  );
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
  const r1 = run(['install', '--target', target, '--agent', 'all', '--link-mode', 'stub'], {
    env,
  });
  assert.equal(r1.status, 0, r1.stderr);
  assert.ok(existsSync(join(target, '.claude', 'settings.json')), 'claude settings written');
  assert.ok(existsSync(join(target, '.codex', 'hooks.json')), 'codex hooks written');
  assert.ok(existsSync(join(target, '.ai-task-manager')), 'templates dir written');
  const r2 = run(['install', '--target', target, '--agent', 'all', '--link-mode', 'stub'], {
    env,
  });
  assert.equal(r2.status, 0, r2.stderr); // second run exercises the "unchanged" branches
});

test('install --link-mode symlink refuses a package source outside the target project', () => {
  const target = scratch('cli-symlink-');
  const home = scratch('cli-home-');
  const r = run(['install', '--target', target, '--link-mode', 'symlink'], {
    env: { ...process.env, HOME: home },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /requires the installed package to resolve inside the target project/);
  assert.equal(existsSync(join(target, '.ai-task-manager', 'install-manifest.json')), false);
});

test('uninstall removes Codex integrations while preserving user hooks and durable data', () => {
  const target = scratch('cli-uninstall-codex-');
  const home = scratch('cli-home-');
  const env = { ...process.env, HOME: home };
  const installed = run(
    ['install', '--target', target, '--agent', 'codex', '--memory-seed', 'none'],
    { env }
  );
  assert.equal(installed.status, 0, installed.stderr);

  const hooksPath = join(target, '.codex', 'hooks.json');
  const hooks = JSON.parse(readFileSync(hooksPath, 'utf8'));
  hooks.hooks.CustomEvent = [
    {
      matcher: '',
      hooks: [
        { type: 'command', command: 'echo user-hook' },
        {
          type: 'command',
          command: `node -e "import('./scripts/task-tracker/custom-user-hook.mjs')"`,
        },
      ],
    },
  ];
  writeFileSync(hooksPath, JSON.stringify(hooks, null, 2) + '\n', 'utf8');
  writeFileSync(join(target, '.ai-task-manager', 'keep.txt'), 'durable\n', 'utf8');

  const removed = run(['uninstall', '--target', target, '--agent', 'codex'], { env });
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(
    existsSync(join(target, '.agents', 'skills', 'task')),
    false,
    'AITM Codex skill removed'
  );
  const after = JSON.parse(readFileSync(hooksPath, 'utf8'));
  assert.deepEqual(after.hooks.CustomEvent, [
    {
      matcher: '',
      hooks: [
        { type: 'command', command: 'echo user-hook' },
        {
          type: 'command',
          command: `node -e "import('./scripts/task-tracker/custom-user-hook.mjs')"`,
        },
      ],
    },
  ]);
  const remainingCommands = Object.values(after.hooks)
    .flat()
    .flatMap((entry) => (entry.hooks ?? []).map((hook) => hook.command));
  assert.equal(
    remainingCommands.some((command) => command?.includes('ai-task-manager')),
    false,
    'AITM Codex hooks removed'
  );
  assert.equal(
    readFileSync(join(target, '.ai-task-manager', 'keep.txt'), 'utf8'),
    'durable\n',
    'durable project data preserved'
  );
  const repeated = run(['uninstall', '--target', target, '--agent', 'codex'], { env });
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.deepEqual(JSON.parse(readFileSync(hooksPath, 'utf8')), after);
});

test('uninstall defaults to all providers and removes the generated Claude command', () => {
  const target = scratch('cli-uninstall-all-');
  const home = scratch('cli-home-');
  const env = { ...process.env, HOME: home };
  const installed = run(
    ['install', '--target', target, '--agent', 'all', '--memory-seed', 'none'],
    { env }
  );
  assert.equal(installed.status, 0, installed.stderr);
  const claudeSettingsPath = join(target, '.claude', 'settings.json');
  const claudeSettings = JSON.parse(readFileSync(claudeSettingsPath, 'utf8'));
  claudeSettings.permissions.allow.push('Bash(custom-user-command:*)');
  writeFileSync(claudeSettingsPath, JSON.stringify(claudeSettings, null, 2) + '\n', 'utf8');

  const removed = run(['uninstall', '--target', target], { env });
  assert.equal(removed.status, 0, removed.stderr);
  for (const relativePath of [
    '.agents/skills/task',
    '.claude/skills/task',
    '.grok/skills/task',
    '.claude/commands/task.md',
  ]) {
    assert.equal(existsSync(join(target, relativePath)), false, `${relativePath} removed`);
  }
  const settingsAfter = JSON.parse(readFileSync(claudeSettingsPath, 'utf8'));
  assert.equal(settingsAfter.permissions.allow.includes('Bash(custom-user-command:*)'), true);
  for (const managedPermission of [
    'Bash(node node_modules/@kburson/ai-task-manager/scripts/**)',
    'Bash(node node_modules/ai-task-manager/scripts/**)',
    'Bash(npx aitm:*)',
    'Bash(node_modules/.bin/aitm:*)',
    'Bash(./node_modules/.bin/aitm:*)',
  ]) {
    assert.equal(
      settingsAfter.permissions.allow.includes(managedPermission),
      false,
      `${managedPermission} removed`
    );
  }
});

test('uninstall --dry-run reports cleanup without changing the project', () => {
  const target = scratch('cli-uninstall-dry-run-');
  const home = scratch('cli-home-');
  const env = { ...process.env, HOME: home };
  const installed = run(
    ['install', '--target', target, '--agent', 'codex', '--memory-seed', 'none'],
    { env }
  );
  assert.equal(installed.status, 0, installed.stderr);
  const skillPath = join(target, '.agents', 'skills', 'task');
  const hooksPath = join(target, '.codex', 'hooks.json');
  const hooksBefore = readFileSync(hooksPath, 'utf8');

  const preview = run(
    ['uninstall', '--target', target, '--agent', 'codex', '--purge', '--dry-run'],
    { env }
  );
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /dry run/i);
  assert.equal(existsSync(skillPath), true, 'skill remains during dry run');
  assert.equal(readFileSync(hooksPath, 'utf8'), hooksBefore, 'hooks remain byte-identical');
});

test('uninstall --purge refuses non-interactive deletion without --yes', () => {
  const target = scratch('cli-uninstall-purge-confirm-');
  mkdirSync(join(target, '.ai-task-manager'), { recursive: true });
  const durablePath = join(target, '.ai-task-manager', 'keep.txt');
  writeFileSync(durablePath, 'durable\n', 'utf8');

  const refused = run(['uninstall', '--target', target, '--purge']);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /--purge.*--yes|--yes.*--purge/i);
  assert.equal(readFileSync(durablePath, 'utf8'), 'durable\n');
});

test('uninstall --purge --yes removes durable AITM data but preserves unrelated issue templates', () => {
  const target = scratch('cli-uninstall-purge-');
  mkdirSync(join(target, '.ai-task-manager'), { recursive: true });
  mkdirSync(join(target, '.tmp', 'aitm'), { recursive: true });
  writeFileSync(join(target, '.ai-task-manager', 'keep.txt'), 'durable\n', 'utf8');
  writeFileSync(join(target, '.tmp', 'aitm', 'state.json'), '{}\n', 'utf8');
  writeIssueTemplates(target);
  const issueTemplateDir = join(target, '.github', 'ISSUE_TEMPLATE');
  writeFileSync(join(issueTemplateDir, 'custom.yml'), 'name: Custom\n', 'utf8');

  const removed = run(['uninstall', '--target', target, '--purge', '--yes']);
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(existsSync(join(target, '.ai-task-manager')), false);
  assert.equal(existsSync(join(target, '.tmp', 'aitm')), false);
  assert.equal(existsSync(join(issueTemplateDir, 'task.yml')), false);
  assert.equal(existsSync(join(issueTemplateDir, 'bug.yml')), false);
  assert.equal(readFileSync(join(issueTemplateDir, 'custom.yml'), 'utf8'), 'name: Custom\n');
});

test('uninstall validates every managed file before removing any provider integration', () => {
  const target = scratch('cli-uninstall-atomic-');
  const home = scratch('cli-home-');
  const env = { ...process.env, HOME: home };
  const installed = run(
    ['install', '--target', target, '--agent', 'all', '--memory-seed', 'none'],
    { env }
  );
  assert.equal(installed.status, 0, installed.stderr);
  const modifiedSkill = join(target, '.claude', 'skills', 'task', 'SKILL.md');
  writeFileSync(modifiedSkill, readFileSync(modifiedSkill, 'utf8') + '\nuser edit\n', 'utf8');

  const refused = run(['uninstall', '--target', target], { env });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Refusing to remove modified AITM skill/);
  for (const relativePath of ['.agents/skills/task', '.claude/skills/task', '.grok/skills/task']) {
    assert.equal(existsSync(join(target, relativePath)), true, `${relativePath} preserved`);
  }
});

test('uninstall refuses to recursively remove a managed skill directory with user files', () => {
  const target = scratch('cli-uninstall-skill-sibling-');
  const home = scratch('cli-home-');
  const env = { ...process.env, HOME: home };
  const installed = run(
    ['install', '--target', target, '--agent', 'codex', '--memory-seed', 'none'],
    { env }
  );
  assert.equal(installed.status, 0, installed.stderr);
  const skillDir = join(target, '.agents', 'skills', 'task');
  const userFile = join(skillDir, 'notes.md');
  writeFileSync(userFile, 'keep me\n', 'utf8');
  const hooksPath = join(target, '.codex', 'hooks.json');
  const hooksBefore = readFileSync(hooksPath, 'utf8');

  const refused = run(['uninstall', '--target', target, '--agent', 'codex'], { env });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Refusing to remove modified AITM skill/);
  assert.equal(readFileSync(userFile, 'utf8'), 'keep me\n');
  assert.equal(readFileSync(hooksPath, 'utf8'), hooksBefore, 'validation remains atomic');
});

test('uninstall refuses to remove a foreign symlink at a managed skill path', () => {
  const target = scratch('cli-uninstall-foreign-link-');
  const foreign = scratch('cli-uninstall-foreign-target-');
  const skillDir = join(target, '.agents', 'skills', 'task');
  mkdirSync(join(target, '.agents', 'skills'), { recursive: true });
  writeFileSync(join(foreign, 'SKILL.md'), 'user skill\n', 'utf8');
  symlinkSync(foreign, skillDir);

  const refused = run(['uninstall', '--target', target, '--agent', 'codex']);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Refusing to remove modified AITM skill/);
  assert.equal(lstatSync(skillDir).isSymbolicLink(), true);
  assert.equal(readlinkSync(skillDir), foreign);
  assert.equal(readFileSync(join(foreign, 'SKILL.md'), 'utf8'), 'user skill\n');
});

test('uninstall recognizes exact generated artifacts from the previous package layout', () => {
  const target = scratch('cli-uninstall-previous-layout-');
  const home = scratch('cli-home-');
  const env = { ...process.env, HOME: home };
  const installed = run(
    ['install', '--target', target, '--agent', 'all', '--memory-seed', 'none'],
    { env }
  );
  assert.equal(installed.status, 0, installed.stderr);

  const seedBlock = [
    '## Step 0 — Verify worktree seeding (run before anything else)',
    '',
    'If this session runs in a git worktree, its `node_modules` may be absent, which',
    'breaks the skill reads below and silently redirects module resolution to the',
    'parent checkout. The SessionStart hook heals this automatically; if you have any',
    'doubt it ran, verify and self-heal before loading the skill:',
    '',
    '```bash',
    "node -e \"const{existsSync}=require('fs');const{resolve}=require('path');const{pathToFileURL}=require('url');const c=['node_modules/ai-task-manager/scripts/task-tracker/ensure-worktree-seeded.mjs','scripts/task-tracker/ensure-worktree-seeded.mjs'];const p=c.map(x=>resolve(process.cwd(),x)).find(existsSync);if(p){process.argv=[process.argv[0],p];import(pathToFileURL(p).href);}\"",
    '```',
    '',
    'Proceed to the Load-Once Procedure only once the self-link resolves to THIS worktree.',
    '',
  ].join('\n');
  for (const [relativePath, seeded] of [
    ['.claude/skills/task/SKILL.md', true],
    ['.agents/skills/task/SKILL.md', true],
    ['.grok/skills/task/SKILL.md', false],
  ]) {
    const file = join(target, relativePath);
    let previous = readFileSync(file, 'utf8').replaceAll(
      'node_modules/@kburson/ai-task-manager',
      'node_modules/ai-task-manager'
    );
    if (seeded) {
      previous = previous.replace('## Load-Once Procedure', `${seedBlock}## Load-Once Procedure`);
    }
    writeFileSync(file, previous, 'utf8');
  }

  const commandPath = join(target, '.claude', 'commands', 'task.md');
  const previousCommand = readFileSync(commandPath, 'utf8')
    .replace('Backlog → Refine → Ready for Planning → Plan', 'Backlog → Assigned → Refine → Plan')
    .replace(
      'Backlog → Refine with required fields.',
      'Backlog/Assigned → Refine with required fields.'
    )
    .replace(
      'Ready for Planning → Plan (JIT sprint-planning entry).',
      'Refine → Plan (sprint-planning entry).'
    );
  writeFileSync(commandPath, previousCommand, 'utf8');

  const agentsPath = join(target, 'AGENTS.md');
  writeFileSync(
    agentsPath,
    codexBootstrapBlock().replace('for Sprint-Planning entry', 'for JIT Sprint-Planning entry'),
    'utf8'
  );

  const removed = run(['uninstall', '--target', target], { env });
  assert.equal(removed.status, 0, removed.stderr);
  for (const relativePath of [
    '.claude/skills/task',
    '.agents/skills/task',
    '.grok/skills/task',
    '.claude/commands/task.md',
    'AGENTS.md',
  ]) {
    assert.equal(existsSync(join(target, relativePath)), false, `${relativePath} removed`);
  }
});

test('uninstall removes only the marked project-local AITM bootstrap block', () => {
  const target = scratch('cli-uninstall-bootstrap-');
  const agentsPath = join(target, 'AGENTS.md');
  writeFileSync(
    agentsPath,
    `# User instructions\n\n${codexBootstrapBlock()}Keep this user-authored footer.\n`,
    'utf8'
  );

  const removed = run(['uninstall', '--target', target]);
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(
    readFileSync(agentsPath, 'utf8'),
    '# User instructions\n\nKeep this user-authored footer.\n'
  );
});

test('uninstall refuses a modified or ambiguously embedded AITM bootstrap block', () => {
  for (const [name, content] of [
    ['modified', codexBootstrapBlock().replace('AI Task Manager:', 'Modified:')],
    ['inline-marker', `user prefix ${codexBootstrapBlock().trimEnd()}\nuser footer\n`],
  ]) {
    const target = scratch(`cli-uninstall-bootstrap-${name}-`);
    const agentsPath = join(target, 'AGENTS.md');
    writeFileSync(agentsPath, content, 'utf8');

    const refused = run(['uninstall', '--target', target, '--agent', 'codex']);
    assert.equal(refused.status, 1, `${name}: ${refused.stderr}`);
    assert.match(refused.stderr, /Refusing to remove modified AITM bootstrap|Malformed/);
    assert.equal(readFileSync(agentsPath, 'utf8'), content);
  }
});

test('uninstall --agent scopes provider files and Codex bootstrap cleanup', () => {
  const target = scratch('cli-uninstall-agent-scope-');
  const home = scratch('cli-home-');
  const env = { ...process.env, HOME: home };
  const installed = run(
    ['install', '--target', target, '--agent', 'all', '--memory-seed', 'none'],
    { env }
  );
  assert.equal(installed.status, 0, installed.stderr);
  const agentsPath = join(target, 'AGENTS.md');
  writeFileSync(
    agentsPath,
    '<!-- ai-task-manager:codex-superpowers:start -->\nmanaged\n<!-- ai-task-manager:codex-superpowers:end -->\n',
    'utf8'
  );

  const removed = run(['uninstall', '--target', target, '--agent', 'claude'], { env });
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(existsSync(join(target, '.claude', 'skills', 'task')), false);
  assert.equal(existsSync(join(target, '.agents', 'skills', 'task')), true);
  assert.equal(existsSync(join(target, '.grok', 'skills', 'task')), true);
  assert.match(readFileSync(agentsPath, 'utf8'), /ai-task-manager:codex-superpowers:start/);
});

test('uninstall removes only exact managed hook commands', () => {
  const target = scratch('cli-uninstall-exact-hooks-');
  const home = scratch('cli-home-');
  const env = { ...process.env, HOME: home };
  const installed = run(
    ['install', '--target', target, '--agent', 'codex', '--memory-seed', 'none'],
    { env }
  );
  assert.equal(installed.status, 0, installed.stderr);
  const hooksPath = join(target, '.codex', 'hooks.json');
  const config = JSON.parse(readFileSync(hooksPath, 'utf8'));
  const userCommand = `node -e "import('scripts/task-tracker/custom-user-hook.mjs')"`;
  config.hooks.CustomEvent = [{ matcher: '', hooks: [{ type: 'command', command: userCommand }] }];
  writeFileSync(hooksPath, JSON.stringify(config, null, 2) + '\n', 'utf8');

  const removed = run(['uninstall', '--target', target, '--agent', 'codex'], { env });
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(
    flatHookCommands(JSON.parse(readFileSync(hooksPath, 'utf8')), 'CustomEvent')[0],
    userCommand
  );
});

test('uninstall removes Claude permissions without hooks and never strips other providers', () => {
  const claudeTarget = scratch('cli-uninstall-claude-permissions-');
  const claudeSettings = join(claudeTarget, '.claude', 'settings.json');
  mkdirSync(join(claudeTarget, '.claude'), { recursive: true });
  writeFileSync(
    claudeSettings,
    JSON.stringify({ permissions: { allow: ['Bash(npx aitm:*)', 'Bash(user:*)'] } }, null, 2) +
      '\n',
    'utf8'
  );
  const claudeRemoved = run(['uninstall', '--target', claudeTarget, '--agent', 'claude']);
  assert.equal(claudeRemoved.status, 0, claudeRemoved.stderr);
  assert.deepEqual(JSON.parse(readFileSync(claudeSettings, 'utf8')).permissions.allow, [
    'Bash(user:*)',
  ]);

  const codexTarget = scratch('cli-uninstall-codex-permissions-');
  const codexHooks = join(codexTarget, '.codex', 'hooks.json');
  mkdirSync(join(codexTarget, '.codex'), { recursive: true });
  const codexHooksBefore = JSON.stringify({
    hooks: {},
    permissions: { allow: ['Bash(npx aitm:*)'] },
  });
  writeFileSync(codexHooks, codexHooksBefore, 'utf8');
  const codexRemoved = run(['uninstall', '--target', codexTarget, '--agent', 'codex']);
  assert.equal(codexRemoved.status, 0, codexRemoved.stderr);
  assert.equal(
    readFileSync(codexHooks, 'utf8'),
    codexHooksBefore,
    'unowned JSON remains byte-identical'
  );
});

test('uninstall rejects malformed hook schemas before changing any files', () => {
  const target = scratch('cli-uninstall-hook-schema-');
  const home = scratch('cli-home-');
  const env = { ...process.env, HOME: home };
  const installed = run(
    ['install', '--target', target, '--agent', 'codex', '--memory-seed', 'none'],
    { env }
  );
  assert.equal(installed.status, 0, installed.stderr);
  const skillPath = join(target, '.agents', 'skills', 'task');
  const hooksPath = join(target, '.codex', 'hooks.json');
  const malformed = JSON.stringify({ hooks: { SessionStart: 'not-an-array' } }, null, 2) + '\n';
  writeFileSync(hooksPath, malformed, 'utf8');

  const refused = run(['uninstall', '--target', target, '--agent', 'codex'], { env });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /malformed hooks file/i);
  assert.equal(existsSync(skillPath), true);
  assert.equal(readFileSync(hooksPath, 'utf8'), malformed);
});

test('uninstall rejects unknown, missing, duplicate, and conflicting options without cleanup', () => {
  const target = scratch('cli-uninstall-args-');
  const home = scratch('cli-home-');
  const env = { ...process.env, HOME: home };
  const installed = run(
    ['install', '--target', target, '--agent', 'codex', '--memory-seed', 'none'],
    { env }
  );
  assert.equal(installed.status, 0, installed.stderr);
  const skillPath = join(target, '.agents', 'skills', 'task');

  for (const argv of [
    ['uninstall', '--target', target, '--dryrun'],
    ['uninstall', '--target', '--dry-run'],
    ['uninstall', '--target', '-not-a-path'],
    ['uninstall', '--target', target, '--wat'],
    ['uninstall', '--target', target, '--dry-run', '--dry-run'],
    ['uninstall', '--target', target, '--yes'],
  ]) {
    const refused = run(argv, { env });
    assert.notEqual(refused.status, 0, `${argv.join(' ')} unexpectedly succeeded`);
    assert.equal(existsSync(skillPath), true, `${argv.join(' ')} changed the project`);
  }
});

test('uninstall --help documents cleanup ordering and destructive options', () => {
  const help = run(['uninstall', '--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /uninstall/);
  assert.match(help.stdout, /before.*npm uninstall/is);
  assert.match(help.stdout, /--dry-run/);
  assert.match(help.stdout, /--purge/);
  assert.match(help.stdout, /--yes/);
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
