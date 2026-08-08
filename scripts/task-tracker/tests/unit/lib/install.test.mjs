#!/usr/bin/env node
// @story #309
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardBootstrapCommand, hookBootstrapCommand } from '../../../lib/guard-entrypoint.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const ROOT = path.resolve(__dir, '..', '..', '..', '..');
const CLI = path.join(ROOT, 'bin', 'cli.mjs');

const target = mkdtempSync(path.join(projectScratchDir('test'), 'install-test-'));
const legacyTarget = mkdtempSync(
  path.join(projectScratchDir('test'), 'install-legacy-hooks-test-')
);
const codexTarget = mkdtempSync(
  path.join(projectScratchDir('test'), 'install-codex-superpowers-test-')
);
const memoryTarget = mkdtempSync(path.join(projectScratchDir('test'), 'install-memory-test-'));
const memoryNoneTarget = mkdtempSync(
  path.join(projectScratchDir('test'), 'install-memory-none-test-')
);
const fakeHome = mkdtempSync(
  path.join(projectScratchDir('test'), 'install-codex-superpowers-home-')
);

// #869 — lifecycle hooks register via the node_modules-first / repo-relative
// bootstrap shim, matching cli.mjs. Compute the expected commands the same way.
const TIMING_HOOK_CMD = hookBootstrapCommand('scripts/task-tracker/hook-handler.mjs');
const COMMIT_TRAIL_HOOK_CMD = hookBootstrapCommand('scripts/task-tracker/commit-trail-handler.mjs');
const MEMORY_INDEX_HOOK_CMD = hookBootstrapCommand('scripts/task-tracker/hooks/memory-index.mjs');
// #792 — bash-guard registered via node_modules → repo-relative bootstrap form.
const BASH_GUARD_HOOK_CMD = guardBootstrapCommand('bash-guard');
const ON_STOP_HOOK_CMD = hookBootstrapCommand('scripts/task-tracker/hooks/on-stop.mjs');
const ON_USER_PROMPT_HOOK_CMD = hookBootstrapCommand(
  'scripts/task-tracker/hooks/on-user-prompt.mjs'
);
const CODEX_PROMPT_TIMESTAMP_HOOK_CMD =
  'node node_modules/ai-task-manager/scripts/task-tracker/hooks/codex-prompt-timestamp.mjs';
const LEGACY_TIMING_HOOK_CMD = '.claude/hooks/task-tracker.sh';
const LEGACY_COMMIT_TRAIL_HOOK_CMD = '.claude/hooks/commit-trail.sh';
const CANONICAL_DOCS = [
  'README.md',
  'docs/DESIGN.md',
  'docs/guides/settings-guide.md',
  'docs/introduction/install-and-setup.md',
  'skill/adapters/claude/SKILL.md',
  'skill/shared/SKILL.md',
];
function hookCommands(settings, event) {
  return (settings.hooks?.[event] ?? []).flatMap((entry) => [
    ...(typeof entry === 'string' ? [entry] : []),
    ...(entry.command ? [entry.command] : []),
    ...(entry.hooks ?? []).map((inner) => inner.command).filter(Boolean),
  ]);
}

function hasHookCommand(settings, event, command) {
  return hookCommands(settings, event).includes(command);
}

function hookCommandCount(settings, event, command) {
  return hookCommands(settings, event).filter((value) => value === command).length;
}

async function gitIgnores(repoRelativePath) {
  try {
    await pexec('git', ['check-ignore', '--no-index', '--quiet', repoRelativePath], {
      cwd: ROOT,
    });
    return true;
  } catch (error) {
    if (error?.code === 1) return false;
    throw error;
  }
}

function writeSkill(name) {
  const dir = path.join(
    fakeHome,
    '.claude',
    'plugins',
    'cache',
    'claude-plugins-official',
    'superpowers',
    '5.1.0',
    'skills',
    name
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), `# ${name}\n`, 'utf8');
}

function assertDocsDoNotDescribeLegacyHookStubs() {
  for (const rel of CANONICAL_DOCS) {
    const text = readFileSync(path.join(ROOT, rel), 'utf8');
    assert.doesNotMatch(
      text,
      /\.claude\/hooks\/task-tracker\.sh/,
      `${rel} names legacy timing stub`
    );
    assert.doesNotMatch(
      text,
      /\.claude\/hooks\/commit-trail\.sh/,
      `${rel} names legacy commit-trail stub`
    );
  }
}

try {
  await pexec('node', [CLI, 'install', '--target', target]);

  // Agent stubs installed
  const claudeSkill = path.join(target, '.claude', 'skills', 'task', 'SKILL.md');
  const codexSkill = path.join(target, '.agents', 'skills', 'task', 'SKILL.md');
  assert.ok(existsSync(claudeSkill), 'Claude SKILL.md missing');
  assert.ok(existsSync(codexSkill), 'Codex SKILL.md missing');
  assert.match(
    readFileSync(claudeSkill, 'utf8'),
    /skill\/adapters\/claude\/SKILL\.md/,
    'Claude stub must point to adapter'
  );
  assert.match(
    readFileSync(codexSkill, 'utf8'),
    /skill\/adapters\/codex\/SKILL\.md/,
    'Codex stub must point to adapter'
  );
  const codexSkillBody = readFileSync(codexSkill, 'utf8');
  assert.match(
    codexSkillBody,
    /## Load-Once Procedure/,
    'Codex stub must include load-once procedure'
  );
  assert.match(
    codexSkillBody,
    /aitm-skill-loaded:<id>:<version>/,
    'Codex stub must explain sentinel-based load detection'
  );
  assert.match(
    codexSkillBody,
    /`codex-adapter` — `node_modules\/ai-task-manager\/skill\/adapters\/codex\/SKILL\.md`/,
    'Codex stub must load the Codex adapter with codex-adapter stamp id'
  );
  assert.match(
    codexSkillBody,
    /`shared` — `node_modules\/ai-task-manager\/skill\/shared\/SKILL\.md`/,
    'Codex stub must include shared skill in load-once file list'
  );

  const codexHooksPath = path.join(target, '.codex', 'hooks.json');
  assert.ok(existsSync(codexHooksPath), 'Codex hooks.json missing');
  const codexHooks = JSON.parse(readFileSync(codexHooksPath, 'utf8'));
  for (const event of ['SessionStart', 'PreCompact', 'PostCompact']) {
    assert.ok(
      hasHookCommand(codexHooks, event, TIMING_HOOK_CMD),
      `Codex ${event} timing hook missing`
    );
  }
  assert.ok(
    hasHookCommand(codexHooks, 'PreToolUse', BASH_GUARD_HOOK_CMD),
    'Codex PreToolUse bash guard missing'
  );
  assert.ok(
    hasHookCommand(codexHooks, 'PostToolUse', COMMIT_TRAIL_HOOK_CMD),
    'Codex PostToolUse commit-trail hook missing'
  );
  assert.ok(
    hasHookCommand(codexHooks, 'UserPromptSubmit', ON_USER_PROMPT_HOOK_CMD),
    'Codex UserPromptSubmit timing hook missing'
  );
  assert.ok(
    hasHookCommand(codexHooks, 'UserPromptSubmit', CODEX_PROMPT_TIMESTAMP_HOOK_CMD),
    'Codex UserPromptSubmit timestamp hook missing'
  );
  assert.ok(
    hasHookCommand(codexHooks, 'Stop', ON_STOP_HOOK_CMD),
    'Codex Stop pending-pause hook missing'
  );

  // Timing and commit-trail hooks are direct Node settings commands, not installed shell stubs.
  assert.equal(
    existsSync(path.join(target, '.claude', 'hooks', 'task-tracker.sh')),
    false,
    'fresh install must not write .claude/hooks/task-tracker.sh'
  );
  assert.equal(
    existsSync(path.join(target, '.claude', 'hooks', 'commit-trail.sh')),
    false,
    'fresh install must not write .claude/hooks/commit-trail.sh'
  );

  // settings.json patched
  const settings = JSON.parse(readFileSync(path.join(target, '.claude', 'settings.json'), 'utf8'));
  for (const event of ['SessionStart', 'PreCompact', 'PostCompact']) {
    assert.ok(hasHookCommand(settings, event, TIMING_HOOK_CMD), `${event} timing hook missing`);
    assert.equal(
      hasHookCommand(settings, event, LEGACY_TIMING_HOOK_CMD),
      false,
      `${event} must not use legacy timing shell hook`
    );
  }
  assert.ok(
    hasHookCommand(settings, 'PostToolUse', COMMIT_TRAIL_HOOK_CMD),
    'PostToolUse commit-trail hook missing'
  );
  assert.equal(
    hasHookCommand(settings, 'PostToolUse', LEGACY_COMMIT_TRAIL_HOOK_CMD),
    false,
    'PostToolUse must not use legacy commit-trail shell hook'
  );

  // #70: PreToolUse must include Agent and Edit|Write|NotebookEdit matchers.
  const preToolUse = settings.hooks?.PreToolUse ?? [];
  const hasAgentGuard = preToolUse.some(
    (h) =>
      h.matcher === 'Agent' && h.hooks?.some((inner) => inner.command?.includes('agent-guard.mjs'))
  );
  assert.ok(hasAgentGuard, 'PreToolUse Agent → agent-guard.mjs missing');
  const hasActivityEdit = preToolUse.some(
    (h) =>
      h.matcher === 'Edit|Write|NotebookEdit' &&
      h.hooks?.some((inner) => inner.command?.includes('activity-guard.mjs'))
  );
  assert.ok(hasActivityEdit, 'PreToolUse Edit|Write|NotebookEdit → activity-guard.mjs missing');

  // #70: activity-policy.json written with shipped default on first install.
  const policyPath = path.join(target, '.ai-task-manager', 'activity-policy.json');
  assert.ok(existsSync(policyPath), 'activity-policy.json missing on first install');
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  assert.ok(
    Array.isArray(policy.codeGlobs) && policy.codeGlobs.length > 0,
    'activity-policy default must include codeGlobs'
  );
  assert.ok(Array.isArray(policy.docGlobs), 'activity-policy default must include docGlobs');

  // #70: Idempotency — re-running install produces zero net change to settings
  // or to activity-policy.json.
  const settingsBefore = readFileSync(path.join(target, '.claude', 'settings.json'), 'utf8');
  const codexHooksBefore = readFileSync(codexHooksPath, 'utf8');
  const policyBefore = readFileSync(policyPath, 'utf8');
  await pexec('node', [CLI, 'install', '--target', target]);
  const settingsAfter = readFileSync(path.join(target, '.claude', 'settings.json'), 'utf8');
  const codexHooksAfter = readFileSync(codexHooksPath, 'utf8');
  const policyAfter = readFileSync(policyPath, 'utf8');
  assert.equal(settingsAfter, settingsBefore, 'second install must be a no-op on settings.json');
  assert.equal(
    codexHooksAfter,
    codexHooksBefore,
    'second install must be a no-op on .codex/hooks.json'
  );
  assert.equal(policyAfter, policyBefore, 'second install must not touch activity-policy.json');

  // #70: User edits to activity-policy.json must be preserved across re-install.
  const customPolicy = JSON.stringify(
    {
      codeGlobs: ['custom/**'],
      docGlobs: [],
      testRunners: [],
      buildCommands: [],
      codeGlobExcludes: [],
    },
    null,
    2
  );
  writeFileSync(policyPath, customPolicy, 'utf8');
  await pexec('node', [CLI, 'install', '--target', target]);
  assert.equal(
    readFileSync(policyPath, 'utf8'),
    customPolicy,
    'install must not overwrite an existing activity-policy.json'
  );

  // .gitignore entries written
  const gitignore = readFileSync(path.join(target, '.gitignore'), 'utf8');
  // #573: machine-local runtime state moved under `.tmp/aitm/` (covered by the
  // `.tmp/` entry). #574: the markdown templates + references/ moved under
  // `.ai-task-manager/templates/` and are tracked; only local `.bak` edit
  // backups are ignored there.
  assert.ok(
    gitignore.includes('.ai-task-manager/templates/*.bak'),
    'template backup glob entry missing'
  );

  // #412: the installer must ignore the hidden `.tmp/` scratch dir the tools
  // actually write to — never a bare `tmp/`, which nothing writes to.
  const gitignoreLines = gitignore.split('\n').map((l) => l.trim());
  assert.ok(gitignoreLines.includes('.tmp/'), 'installer must ignore the .tmp/ scratch dir');
  assert.ok(
    gitignoreLines.includes('.ai-task-manager/.cache/'),
    'installer must ignore local AITM cache'
  );
  assert.ok(
    gitignoreLines.includes('.claude/worktrees/'),
    'installer must ignore Claude worktree checkouts'
  );
  assert.ok(
    gitignoreLines.includes('.claude/settings.local.json'),
    'installer must ignore local Claude settings overrides'
  );
  assert.ok(
    gitignoreLines.includes('.claude/scheduled_tasks.lock'),
    'installer must ignore Claude scheduled task lock'
  );
  assert.equal(
    gitignoreLines.includes('.claude/'),
    false,
    'installer must not ignore the whole .claude/ directory'
  );
  assert.equal(
    gitignoreLines.includes('.agents/'),
    false,
    'installer must not ignore the whole .agents/ directory'
  );
  assert.equal(
    gitignoreLines.includes('tmp/'),
    false,
    'installer must not ignore a bare tmp/ (regression #412)'
  );

  const repoGitignoreLines = readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
    .split('\n')
    .map((line) => line.trim());
  for (const localPath of [
    '.ai-task-manager/.cache/',
    '.claude/worktrees/',
    '.claude/settings.local.json',
    '.claude/scheduled_tasks.lock',
  ]) {
    assert.ok(repoGitignoreLines.includes(localPath), `root .gitignore must ignore ${localPath}`);
  }
  assert.equal(
    repoGitignoreLines.includes('.claude/'),
    false,
    'root .gitignore must track portable Claude artifacts'
  );
  assert.equal(
    repoGitignoreLines.includes('.agents/'),
    false,
    'root .gitignore must track portable agent artifacts'
  );
  for (const portablePath of [
    '.claude/settings.json',
    '.claude/commands/task.md',
    '.claude/skills/task/SKILL.md',
    '.codex/hooks.json',
    '.agents/skills/task/SKILL.md',
    '.ai-task-manager/memory/MEMORY.md',
  ]) {
    assert.ok(existsSync(path.join(ROOT, portablePath)), `${portablePath} must be generated`);
    assert.equal(await gitIgnores(portablePath), false, `${portablePath} must remain trackable`);
  }

  await pexec('node', [
    CLI,
    'install',
    '--target',
    memoryTarget,
    '--agent',
    'codex',
    '--memory-seed=all',
  ]);
  const installedMemoryDir = path.join(memoryTarget, '.ai-task-manager', 'memory');
  const representativeFact = 'feedback_xl_epics_standalone.md';
  assert.equal(
    readFileSync(path.join(installedMemoryDir, representativeFact), 'utf8'),
    readFileSync(path.join(ROOT, 'docs', 'ai-memory', representativeFact), 'utf8'),
    'install must preserve accepted memory fact content'
  );
  assert.ok(
    existsSync(path.join(installedMemoryDir, 'MEMORY.md')),
    'all-memory install must write the filtered memory index'
  );
  const prettierIgnoreLines = readFileSync(path.join(ROOT, '.prettierignore'), 'utf8')
    .split('\n')
    .map((line) => line.trim());
  assert.ok(
    prettierIgnoreLines.includes('docs/ai-memory/'),
    '.prettierignore must preserve the opaque upstream memory policy'
  );
  assert.ok(
    prettierIgnoreLines.includes('.ai-task-manager/memory/'),
    '.prettierignore must apply the opaque memory policy to installed artifacts'
  );
  const markdownlintConfig = JSON.parse(
    readFileSync(path.join(ROOT, '.markdownlint-cli2.jsonc'), 'utf8')
  );
  assert.ok(
    markdownlintConfig.ignores.includes('docs/ai-memory/**'),
    'Markdownlint must preserve the opaque upstream memory policy'
  );
  assert.ok(
    markdownlintConfig.ignores.includes('.ai-task-manager/memory/**'),
    'Markdownlint must apply the opaque memory policy to installed artifacts'
  );

  // Templates written to shared runtime folder under templates/ (#574)
  assert.ok(
    existsSync(path.join(target, '.ai-task-manager', 'templates', 'pickup-directive.md')),
    'pickup directive missing'
  );
  assert.ok(
    existsSync(path.join(target, '.ai-task-manager', 'templates', 'definition-of-done.md')),
    'definition of done missing'
  );

  // scripts NOT copied to project
  assert.ok(
    !existsSync(path.join(target, 'scripts', 'task-tracker')),
    'scripts/task-tracker must NOT be copied'
  );
  assert.ok(!existsSync(path.join(target, 'scripts', 'gh')), 'scripts/gh must NOT be copied');

  assert.ok(
    !existsSync(path.join(target, 'AGENTS.md')),
    'default install must not create AGENTS.md'
  );

  await pexec('node', [
    CLI,
    'install',
    '--target',
    memoryTarget,
    '--agent',
    'codex',
    '--memory-seed=all',
  ]);
  const memoryCodexHooks = JSON.parse(
    readFileSync(path.join(memoryTarget, '.codex', 'hooks.json'), 'utf8')
  );
  assert.ok(
    hasHookCommand(memoryCodexHooks, 'SessionStart', MEMORY_INDEX_HOOK_CMD),
    'Codex SessionStart memory-index hook missing after memory seed acceptance'
  );
  assert.ok(
    hasHookCommand(memoryCodexHooks, 'PostCompact', MEMORY_INDEX_HOOK_CMD),
    'Codex PostCompact memory-index hook missing after memory seed acceptance'
  );
  assert.equal(
    hasHookCommand(memoryCodexHooks, 'PreCompact', MEMORY_INDEX_HOOK_CMD),
    false,
    'Codex PreCompact must not receive memory-index hook'
  );
  assert.ok(
    existsSync(path.join(memoryTarget, '.ai-task-manager', 'memory', 'MEMORY.md')),
    'accepted memory seed must write shared MEMORY.md index'
  );

  await pexec('node', [
    CLI,
    'install',
    '--target',
    memoryNoneTarget,
    '--agent',
    'codex',
    '--memory-seed=none',
  ]);
  const memoryNoneCodexHooks = JSON.parse(
    readFileSync(path.join(memoryNoneTarget, '.codex', 'hooks.json'), 'utf8')
  );
  assert.equal(
    hasHookCommand(memoryNoneCodexHooks, 'SessionStart', MEMORY_INDEX_HOOK_CMD),
    false,
    'Codex SessionStart memory-index hook must not install when memory seed is none'
  );
  assert.equal(
    existsSync(path.join(memoryNoneTarget, '.ai-task-manager', 'memory', 'MEMORY.md')),
    false,
    'memory seed none must not write shared memory index'
  );

  mkdirSync(path.join(legacyTarget, '.claude'), { recursive: true });
  writeFileSync(
    path.join(legacyTarget, '.claude', 'settings.json'),
    JSON.stringify(
      {
        hooks: {
          SessionStart: [
            { matcher: '', hooks: [{ type: 'command', command: LEGACY_TIMING_HOOK_CMD }] },
          ],
          PreCompact: [
            { matcher: '', hooks: [{ type: 'command', command: LEGACY_TIMING_HOOK_CMD }] },
          ],
          PostCompact: [
            { matcher: '', hooks: [{ type: 'command', command: LEGACY_TIMING_HOOK_CMD }] },
          ],
          PostToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: LEGACY_COMMIT_TRAIL_HOOK_CMD }],
            },
          ],
        },
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
  await pexec('node', [CLI, 'install', '--target', legacyTarget]);
  const migratedSettings = JSON.parse(
    readFileSync(path.join(legacyTarget, '.claude', 'settings.json'), 'utf8')
  );
  for (const event of ['SessionStart', 'PreCompact', 'PostCompact']) {
    assert.equal(
      hookCommandCount(migratedSettings, event, TIMING_HOOK_CMD),
      1,
      `${event} must have one direct timing hook after migration`
    );
    assert.equal(
      hasHookCommand(migratedSettings, event, LEGACY_TIMING_HOOK_CMD),
      false,
      `${event} legacy timing hook must be migrated`
    );
  }
  assert.equal(
    hookCommandCount(migratedSettings, 'PostToolUse', COMMIT_TRAIL_HOOK_CMD),
    1,
    'PostToolUse must have one direct commit-trail hook after migration'
  );
  assert.equal(
    hasHookCommand(migratedSettings, 'PostToolUse', LEGACY_COMMIT_TRAIL_HOOK_CMD),
    false,
    'PostToolUse legacy commit-trail hook must be migrated'
  );

  writeSkill('using-superpowers');
  writeSkill('brainstorming');
  writeSkill('verification-before-completion');
  await pexec(
    'node',
    [CLI, 'install', '--agent', 'codex', '--codex-superpowers', '--target', codexTarget],
    {
      env: { ...process.env, HOME: fakeHome },
    }
  );
  assert.ok(
    existsSync(path.join(fakeHome, '.codex', 'skills', 'using-superpowers', 'SKILL.md')),
    'Codex Superpowers opt-in must mirror skills to ~/.codex/skills'
  );
  const agents = readFileSync(path.join(codexTarget, 'AGENTS.md'), 'utf8');
  assert.match(
    agents,
    /ai-task-manager:codex-superpowers:start/,
    'Codex Superpowers opt-in must update repo AGENTS.md'
  );
  assert.match(agents, /using-superpowers/, 'AGENTS.md bootstrap must mention using-superpowers');
  assert.match(
    agents,
    /State Transition Verb Map \(8-state model\)/,
    'AGENTS.md bootstrap must name the current state model'
  );
  assert.match(
    agents,
    /Backlog → On Deck → Refine → Plan → Develop → Test → Review → Done/,
    'AGENTS.md bootstrap must include On Deck in the state chain'
  );
  assert.match(agents, /\/task plan #N/, 'AGENTS.md bootstrap must name the plan verb');
  assert.match(agents, /\/task test #N/, 'AGENTS.md bootstrap must name the test verb');

  assertDocsDoNotDescribeLegacyHookStubs();

  console.log('install.test.mjs: all assertions passed');
} finally {
  rmSync(target, { recursive: true, force: true });
  rmSync(legacyTarget, { recursive: true, force: true });
  rmSync(codexTarget, { recursive: true, force: true });
  rmSync(memoryTarget, { recursive: true, force: true });
  rmSync(memoryNoneTarget, { recursive: true, force: true });
  rmSync(fakeHome, { recursive: true, force: true });
}
