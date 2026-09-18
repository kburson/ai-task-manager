// @story #1692
// Pure, provider-neutral ownership/content contract shared by install and doctor.

import { codexBootstrapBlock } from '../task-tracker/codex-superpowers.mjs';
import { getProvider } from '../providers/index.mjs';
import { RUNTIME_REL } from '../task-tracker/paths.mjs';
import {
  failClosedHookBootstrapCommand,
  guardBootstrapCommand,
  hookBootstrapCommand,
} from '../task-tracker/lib/guard-entrypoint.mjs';
import { CLAUDE_BASH_ALLOWLIST } from '../../bin/lib/claude-bash-allowlist.mjs';

const INSTALLED_ROOT = 'node_modules/@kburson/ai-task-manager';
const installed = (path) => `${INSTALLED_ROOT}/${path}`;

const COMMANDS = Object.freeze({
  timing: hookBootstrapCommand('scripts/task-tracker/hook-handler.mjs'),
  commit: hookBootstrapCommand('scripts/task-tracker/commit-trail-handler.mjs'),
  stop: hookBootstrapCommand('scripts/task-tracker/hooks/on-stop.mjs'),
  prompt: hookBootstrapCommand('scripts/task-tracker/hooks/on-user-prompt.mjs'),
  codexPrompt: hookBootstrapCommand('scripts/task-tracker/hooks/codex-prompt-timestamp.mjs'),
  askPause: hookBootstrapCommand('scripts/task-tracker/hooks/on-ask.mjs', 'pause'),
  askResume: hookBootstrapCommand('scripts/task-tracker/hooks/on-ask.mjs', 'resume'),
  stopAudit: hookBootstrapCommand('scripts/task-tracker/hooks/stop-audit-pause-resume.mjs'),
  memory: hookBootstrapCommand('scripts/task-tracker/hooks/memory-index.mjs'),
});

function grokCommand(handler) {
  return failClosedHookBootstrapCommand(
    'scripts/task-tracker/hooks/grok-wire.mjs',
    '--handler',
    handler
  );
}

const claudeSpecs = [
  ...['SessionStart', 'PreCompact', 'PostCompact'].map((event) => [event, '', COMMANDS.timing]),
  ['PreToolUse', 'Bash', guardBootstrapCommand('bash-guard')],
  ['PreToolUse', 'Agent', guardBootstrapCommand('agent-guard')],
  ['PreToolUse', 'Edit|Write|NotebookEdit', guardBootstrapCommand('activity-guard')],
  ['PreToolUse', 'Bash', guardBootstrapCommand('activity-guard')],
  ['PreToolUse', 'Edit|Write|NotebookEdit', guardBootstrapCommand('source-edit-gate')],
  ['PostToolUse', 'Bash', COMMANDS.commit],
  ['Stop', '', COMMANDS.stop],
  ['Stop', '', COMMANDS.stopAudit],
  ['UserPromptSubmit', '', COMMANDS.prompt],
  ['PreToolUse', 'AskUserQuestion', COMMANDS.askPause],
  ['PostToolUse', 'AskUserQuestion', COMMANDS.askResume],
];

const codexSpecs = [
  ['SessionStart', 'startup|resume|clear|compact', COMMANDS.timing],
  ['PreCompact', 'manual|auto', COMMANDS.timing],
  ['PostCompact', 'manual|auto', COMMANDS.timing],
  ['PreToolUse', 'Bash', guardBootstrapCommand('bash-guard')],
  ['PreToolUse', 'Bash', guardBootstrapCommand('activity-guard')],
  ['PreToolUse', 'apply_patch|Edit|Write|NotebookEdit', guardBootstrapCommand('activity-guard')],
  ['PreToolUse', 'apply_patch|Edit|Write|NotebookEdit', guardBootstrapCommand('source-edit-gate')],
  ['PostToolUse', 'Bash', COMMANDS.commit],
  ['Stop', null, COMMANDS.stop, { timeout: 30 }],
  ['Stop', null, COMMANDS.stopAudit, { timeout: 30 }],
  ['UserPromptSubmit', null, COMMANDS.prompt, { timeout: 30 }],
  ['UserPromptSubmit', null, COMMANDS.codexPrompt, { timeout: 30 }],
];

const grokSpecs = [
  ['SessionStart', 'startup|resume|clear|compact', grokCommand('timing')],
  ['PreCompact', 'manual|auto', grokCommand('timing')],
  ['PostCompact', 'manual|auto', grokCommand('timing')],
  ['PreToolUse', 'Bash', grokCommand('bash-guard')],
  ['PreToolUse', 'Bash', grokCommand('activity-guard')],
  ['PreToolUse', 'Edit|Write|NotebookEdit|search_replace|write', grokCommand('activity-guard')],
  ['PreToolUse', 'Edit|Write|NotebookEdit|search_replace|write', grokCommand('source-edit-gate')],
  ['PreToolUse', 'Agent|Task|spawn_subagent', grokCommand('agent-guard')],
];

const HOOK_CONTRACTS = Object.freeze({
  claude: Object.freeze({
    required: claudeSpecs,
    memory: [
      ['SessionStart', '', COMMANDS.memory],
      ['PostCompact', '', COMMANDS.memory],
    ],
  }),
  codex: Object.freeze({
    required: codexSpecs,
    memory: [
      ['SessionStart', 'startup|resume|clear|compact', COMMANDS.memory],
      ['PostCompact', 'manual|auto', COMMANDS.memory],
    ],
  }),
  grok: Object.freeze({
    required: grokSpecs,
    memory: [
      ['SessionStart', 'startup|resume|clear|compact', grokCommand('memory-index')],
      ['PostCompact', 'manual|auto', grokCommand('memory-index')],
    ],
  }),
});

export const INSTALL_GITIGNORE_ENTRIES = Object.freeze([
  '.ai-task-manager/.cache/',
  '.ai-task-manager/templates/*.bak',
  '.ai-task-manager/templates/references/*.bak',
  '.claude/worktrees/',
  '.claude/settings.local.json',
  '.claude/scheduled_tasks.lock',
  '.tmp/',
]);

function clone(value) {
  return value == null ? {} : structuredClone(value);
}

function hasCommand(entry, command) {
  return (
    entry?.command === command ||
    entry === command ||
    (Array.isArray(entry?.hooks) && entry.hooks.some((hook) => hook?.command === command))
  );
}

function entryFor(matcher, command, extra = {}) {
  const entry = { ...extra, hooks: [{ type: 'command', command }] };
  if (matcher !== null) entry.matcher = matcher;
  return entry;
}

export function managedHookContract(providerName, { memoryIndexHook = false } = {}) {
  const contract = HOOK_CONTRACTS[providerName];
  if (!contract) throw new TypeError(`Unknown provider hook contract: ${providerName}`);
  return Object.freeze({
    required: contract.required,
    optional: memoryIndexHook ? contract.memory : [],
  });
}

export function applyManagedHookContract(providerName, current, options = {}) {
  const result = clone(current);
  if (!result.hooks || typeof result.hooks !== 'object' || Array.isArray(result.hooks)) {
    result.hooks = {};
  }
  const { required, optional } = managedHookContract(providerName, options);
  for (const [event, matcher, command, extra] of [...required, ...optional]) {
    if (!Array.isArray(result.hooks[event])) result.hooks[event] = [];
    const present = result.hooks[event].some(
      (entry) => (entry?.matcher ?? null) === (matcher ?? null) && hasCommand(entry, command)
    );
    if (!present) result.hooks[event].push(entryFor(matcher, command, extra));
  }
  if (providerName === 'claude') {
    if (!result.permissions || typeof result.permissions !== 'object') result.permissions = {};
    if (!Array.isArray(result.permissions.allow)) result.permissions.allow = [];
    result.permissions.allow = result.permissions.allow.filter((entry) => entry !== 'Bash');
    for (const entry of CLAUDE_BASH_ALLOWLIST) {
      if (!result.permissions.allow.includes(entry)) result.permissions.allow.push(entry);
    }
  }
  return result;
}

function managedProjection(providerName, value, options) {
  const contract = managedHookContract(providerName, options);
  const specs = [...contract.required, ...contract.optional];
  const hooks = specs.map(([event, matcher, command, extra]) => ({
    event,
    matcher,
    command,
    extra: extra || {},
    present: Array.isArray(value?.hooks?.[event])
      ? value.hooks[event].some(
          (entry) => (entry?.matcher ?? null) === (matcher ?? null) && hasCommand(entry, command)
        )
      : false,
  }));
  const permissions =
    providerName === 'claude'
      ? CLAUDE_BASH_ALLOWLIST.map((entry) => value?.permissions?.allow?.includes(entry) === true)
      : [];
  return { hooks, permissions };
}

export function matchesManagedHookContract(providerName, current, options = {}) {
  const desired = applyManagedHookContract(providerName, current, options);
  return (
    JSON.stringify(managedProjection(providerName, current, options)) ===
    JSON.stringify(managedProjection(providerName, desired, options))
  );
}

export function renderProviderSkillStub(providerName) {
  const adapter = getProvider(providerName);
  if (!adapter) throw new TypeError(`Unknown provider skill contract: ${providerName}`);
  const adapterPath = installed(adapter.skillAdapterPath);
  if (providerName === 'grok') {
    return [
      '---',
      'name: task',
      'description: Bind Grok work sessions to GitHub issues and track governed delivery.',
      'user-invocable: true',
      '---',
      '',
      '# Task',
      '',
      'Load and follow the canonical Grok adapter instructions from:',
      '',
      `\`${adapterPath}\``,
      '',
    ].join('\n');
  }
  const sharedSkillPath = installed('skill/shared/SKILL.md');
  const scriptsPath = installed('scripts/');
  const codex = providerName === 'codex';
  return [
    '---',
    'name: task',
    codex
      ? 'description: Bind AI work sessions to GitHub issues and track time, context words, state, and completion workflow. Use when the user asks to manage a task, start or close issue work, run /task commands, create backlog issues, track active work, log time, update task status, or inspect the active task fleet.'
      : 'description: Bind AI work sessions to GitHub issues and track time, context words, state, and completion workflow. Use when the user types /task with no args or followed by #N, new, plan, resume, pause, update, close, log, check, fleet, or config.',
    '---',
    '',
    '# Task',
    '',
    '## Load-Once Procedure',
    '',
    'Frequently-loaded skill files carry an `<!-- aitm-skill-version: X.Y.Z -->` marker.',
    'To avoid re-reading them every invocation:',
    '',
    '1. Read just the first ~10 lines of each file below to extract its marker version.',
    '2. Grep your current context for `aitm-skill-loaded:<id>:<version>`. If found, skip step 3 for that file.',
    '3. Read the full file. Then emit a single line in your reply: `aitm-skill-loaded:<id>:<version>` so future invocations in this conversation can detect the load.',
    '',
    'Files (id — path):',
    '',
    `- \`${codex ? 'codex-adapter' : 'adapter'}\` — \`${adapterPath}\``,
    `- \`shared\` — \`${sharedSkillPath}\``,
    `- \`pickup\` — \`${RUNTIME_REL.pickupDirective}\` (loaded on ${codex ? 'issue' : 'sub-issue'} pickup)`,
    '',
    'After `/clear` or `/compact`, sentinels disappear from context and these files reload automatically.',
    'After `npm update ai-task-manager`, the marker version changes and reload is forced.',
    '',
    '## Canonical Source',
    '',
    `Load and follow the canonical ${codex ? 'Codex' : 'Claude'} adapter instructions from:`,
    '',
    `\`${adapterPath}\``,
    '',
    'Use executable scripts from:',
    '',
    `\`${scriptsPath}\``,
    '',
  ].join('\n');
}

export function renderClaudeCommandStub() {
  return [
    'Invoke the `task` skill to handle this request. Pass along any arguments: $ARGUMENTS',
    '',
    '<!-- Canonical source: skill/shared/SKILL.md (State Transition Verb Map). Mirrored here for the verb-uniqueness verification grep. -->',
    '',
    '### State Transition Verb Map (8-state model)',
    '',
    'States: `Backlog → Refine → Ready for Planning → Plan → Develop → Test → Review → Done`.',
    '',
    '- `/task refine #N --size <XS|S|M|L|XL> --estimate <hours> --priority <p0|p1|p2|p3> --reason "<text>"` — Backlog → Refine with required fields.',
    '- `/task plan #N` — Ready for Planning → Plan (JIT sprint-planning entry).',
    '- `/task promote` (or `/task next`) — advance one state generically.',
    '- `/task test #N` — Develop → Test (sandbox verification).',
    '- `/task approve #N` — write Plan-approval and review-approval markers.',
    '- `/task close` — Review → Done.',
    '',
    'Test → Review is automatic on verification pass — no dedicated CLI verb.',
    '',
  ].join('\n');
}

export function matchesCodexBootstrapBlock(content, { scope = 'repo' } = {}) {
  const expected = codexBootstrapBlock({ scope }).trim();
  const start = '<!-- ai-task-manager:codex-superpowers:start -->';
  const end = '<!-- ai-task-manager:codex-superpowers:end -->';
  const from = String(content || '').indexOf(start);
  const to = String(content || '').indexOf(end, from);
  if (from < 0 || to < 0) return false;
  return (
    String(content)
      .slice(from, to + end.length)
      .trim() === expected
  );
}
