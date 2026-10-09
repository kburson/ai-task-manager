import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AprError } from '../errors.mjs';
import { configPaths, validateConfig } from './load.mjs';

const HOST_DIR = Object.freeze({
  codex: '.codex',
  claude: '.claude',
  grok: '.grok',
  generic: '.agents',
});
const SKILL_SOURCE = fileURLToPath(new URL('../../skills/peer-review/SKILL.md', import.meta.url));
const SCRATCH_RULE = '.scratch/peer-review/';
const OFFICIAL_RESUME = Object.freeze({
  codex: ['codex', 'resume'],
  claude: ['claude', '--resume'],
  grok: ['grok', 'resume'],
});
const AUTOMATIC_ADAPTER = Object.freeze({
  codex: Object.freeze({
    adapter_version: '2.0.0',
    capability: 'live-wait',
    server_command: Object.freeze(['peer-review-mcp']),
    tool_timeout_ms: 28_800_000,
    heartbeat_interval_ms: 15_000,
    lease_ttl_ms: 60_000,
  }),
  claude: Object.freeze({
    adapter_version: '2.0.0',
    capability: 'live-wait',
    server_command: Object.freeze(['peer-review-mcp']),
    tool_timeout_ms: 28_800_000,
    heartbeat_interval_ms: 15_000,
    lease_ttl_ms: 60_000,
  }),
});

function fail(code, message, recovery, details = {}) {
  throw new AprError(code, message, { recovery, details });
}

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function planSetup({ scope, host, current = {}, desired = null }) {
  if (!['user', 'project'].includes(scope))
    fail('APR_SETUP_INVALID', 'Setup scope is invalid.', 'Select user or project scope.');
  if (!Object.hasOwn(HOST_DIR, host))
    fail('APR_SETUP_INVALID', 'Setup host is invalid.', 'Select codex, claude, grok, or generic.');
  const before = clone(current);
  const after = clone(current);
  if (desired === null) delete after.ai_peer_review;
  else after.ai_peer_review = clone(desired);
  const changed = stable(before) !== stable(after);
  const operations = changed
    ? [
        Object.freeze({
          kind: Object.keys(before).length ? 'modify' : 'create',
          target: 'provider-config',
          before,
          after,
        }),
      ]
    : [];
  return Object.freeze({
    scope,
    host,
    changed,
    backup_required: operations.some((operation) => operation.kind === 'modify'),
    operations: Object.freeze(operations),
  });
}

function readJson(file, fallback) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('not object');
    return parsed;
  } catch (cause) {
    if (cause?.code === 'ENOENT') return clone(fallback);
    fail(
      'APR_SETUP_INVALID',
      'Existing setup configuration is not a JSON object.',
      'Repair the provider configuration before setup.',
      { file }
    );
  }
}

function atomicWrite(file, contents) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  writeFileSync(temporary, contents, { mode: 0o600 });
  renameSync(temporary, file);
}

function operation(file, before, after, owner) {
  const beforeText = before === null ? null : typeof before === 'string' ? before : stable(before);
  const afterText = after === null ? null : typeof after === 'string' ? after : stable(after);
  return Object.freeze({
    file,
    owner,
    kind: beforeText === null ? 'create' : afterText === null ? 'remove' : 'modify',
    before: beforeText,
    after: afterText,
  });
}

function providerRoot({ scope, host, cwd, home }) {
  return path.join(scope === 'project' ? cwd : home, HOST_DIR[host]);
}

function defaultExclude(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--git-path', 'info/exclude'], {
      cwd,
      encoding: 'utf8',
    }).trim();
  } catch {
    fail(
      'APR_SETUP_INVALID',
      'Git did not report a repository-local exclude path.',
      'Run project setup from a Git worktree.'
    );
  }
}

function packageConfigAfter(current, agents, remove, configExists, scope, scratchRuleExists) {
  const result = clone(current);
  const selected = new Set(agents);
  const ownedResume = new Set(current.setup?.resume_commands_added ?? []);
  const ownedAutomatic = new Set(current.setup?.automatic_adapters_added ?? []);
  result.hosts ??= {};
  if (remove) {
    for (const agent of agents) {
      if (ownedResume.has(agent) && result.hosts[agent]?.resume) {
        delete result.hosts[agent].resume;
        ownedResume.delete(agent);
      }
      if (ownedAutomatic.has(agent) && result.hosts[agent]?.automatic) {
        delete result.hosts[agent].automatic;
        ownedAutomatic.delete(agent);
      }
      if (result.hosts[agent] && Object.keys(result.hosts[agent]).length === 0)
        delete result.hosts[agent];
    }
  } else {
    for (const agent of agents) {
      if (!OFFICIAL_RESUME[agent] || result.hosts[agent]?.resume) continue;
      result.hosts[agent] ??= {};
      result.hosts[agent].resume = { command: [...OFFICIAL_RESUME[agent]] };
      ownedResume.add(agent);
    }
    for (const agent of agents) {
      if (!AUTOMATIC_ADAPTER[agent] || result.hosts[agent]?.automatic) continue;
      result.hosts[agent] ??= {};
      result.hosts[agent].automatic = clone(AUTOMATIC_ADAPTER[agent]);
      ownedAutomatic.add(agent);
    }
  }
  if (Object.keys(result.hosts).length === 0) delete result.hosts;
  const nextAgents = remove
    ? (current.setup?.agents ?? []).filter((agent) => !selected.has(agent))
    : [...new Set([...(current.setup?.agents ?? []), ...agents])].sort();
  if (remove && nextAgents.length === 0) delete result.setup;
  else
    result.setup = {
      owner: 'ai-peer-review',
      version: 2,
      agents: nextAgents,
      config_created: current.setup?.config_created ?? !configExists,
      scratch_exclude_added:
        current.setup?.scratch_exclude_added ?? (scope === 'project' && !scratchRuleExists),
      resume_commands_added: [...ownedResume].sort(),
      automatic_adapters_added: [...ownedAutomatic].sort(),
    };
  return result;
}

export function setup(options = {}) {
  const scope = options.scope;
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const home = path.resolve(options.home ?? os.homedir());
  const agents = [...new Set(options.agents ?? ['generic'])].sort();
  if (!['user', 'project'].includes(scope))
    fail(
      'APR_SETUP_INVALID',
      'Setup requires an explicit scope.',
      'Pass --scope user or --scope project.'
    );
  if (!agents.length || agents.some((agent) => !Object.hasOwn(HOST_DIR, agent)))
    fail(
      'APR_SETUP_INVALID',
      'Setup agent selection is invalid.',
      'Select codex, claude, grok, or generic.'
    );
  const remove = Boolean(options.remove);
  const input = Object.freeze({
    scope,
    cwd,
    home,
    agents: Object.freeze(agents),
    confirmScratchExclude: Boolean(options.confirmScratchExclude),
    ...(options.gitExcludePath ? { gitExcludePath: path.resolve(options.gitExcludePath) } : {}),
    ...(options.platform ? { platform: options.platform } : {}),
  });
  const operations = [];
  const excludeFile =
    scope === 'project' ? path.resolve(cwd, options.gitExcludePath ?? defaultExclude(cwd)) : null;
  const currentExclude =
    excludeFile && existsSync(excludeFile) ? readFileSync(excludeFile, 'utf8') : '';
  const scratchRuleExists = currentExclude.split(/\r?\n/).includes(SCRATCH_RULE);
  const configFile = configPaths({ cwd, home, env: options.env ?? {}, platform: options.platform })[
    scope
  ];
  const configExists = existsSync(configFile);
  const currentConfig = readJson(configFile, { schema: 'ai-peer-review.config/v1' });
  validateConfig(currentConfig);
  const nextConfig = packageConfigAfter(
    currentConfig,
    agents,
    remove,
    configExists,
    scope,
    scratchRuleExists
  );
  validateConfig(nextConfig);
  if (stable(currentConfig) !== stable(nextConfig)) {
    const removeCreatedConfig =
      remove && currentConfig.setup?.config_created && Object.keys(nextConfig).length === 1;
    operations.push(
      operation(
        configFile,
        configExists ? currentConfig : null,
        removeCreatedConfig ? null : nextConfig,
        'package-config'
      )
    );
  }

  const skillBytes = readFileSync(SKILL_SOURCE, 'utf8');
  for (const host of agents) {
    const root = providerRoot({ scope, host, cwd, home });
    const adapterFile = path.join(root, 'config.json');
    const adapterExists = existsSync(adapterFile);
    const current = readJson(adapterFile, {});
    if (current.ai_peer_review && current.ai_peer_review.owner !== 'ai-peer-review') {
      fail(
        'APR_SETUP_CONFLICT',
        'A provider configuration key named ai_peer_review is not package-owned.',
        'Rename or remove the foreign key before setup.',
        { file: adapterFile }
      );
    }
    const desired = remove
      ? null
      : {
          owner: 'ai-peer-review',
          version: 2,
          adapter_version: '2.0.0',
          reviewer_guard: { installed: false, enforcement: 'advisory' },
          resume_adapter: host !== 'generic',
          transport: nextConfig.setup?.automatic_adapters_added.includes(host)
            ? 'live-wait'
            : 'manual',
          mcp: nextConfig.setup?.automatic_adapters_added.includes(host)
            ? clone(AUTOMATIC_ADAPTER[host])
            : null,
          config_created: current.ai_peer_review?.config_created ?? !adapterExists,
          skill_created:
            current.ai_peer_review?.skill_created ??
            !existsSync(path.join(root, 'skills', 'peer-review', 'SKILL.md')),
        };
    const planned = planSetup({ scope, host, current, desired });
    let adapterOperation = null;
    if (planned.changed) {
      const after = planned.operations[0].after;
      const removeCreatedAdapter =
        remove && current.ai_peer_review?.config_created && Object.keys(after).length === 0;
      adapterOperation = operation(
        adapterFile,
        adapterExists ? current : null,
        removeCreatedAdapter ? null : after,
        `${host}-adapter`
      );
    }
    const skillFile = path.join(root, 'skills', 'peer-review', 'SKILL.md');
    const existingSkill = existsSync(skillFile) ? readFileSync(skillFile, 'utf8') : null;
    const nextSkill = remove ? null : skillBytes;
    if (!remove && existingSkill !== null && existingSkill !== skillBytes) {
      fail(
        'APR_SETUP_CONFLICT',
        'An existing peer-review skill is not package-owned.',
        'Preserve or relocate the existing skill before setup.',
        { file: skillFile }
      );
    }
    if (!remove && adapterOperation) operations.push(adapterOperation);
    const preserveSkillOnRemoval =
      remove &&
      (!current.ai_peer_review?.skill_created ||
        (existingSkill !== null && existingSkill !== skillBytes));
    if (
      !preserveSkillOnRemoval &&
      existingSkill !== nextSkill &&
      !(remove && existingSkill === null)
    )
      operations.push(operation(skillFile, existingSkill, nextSkill, `${host}-skill`));
    if (remove && adapterOperation) operations.push(adapterOperation);
  }

  if (scope === 'project') {
    const current = currentExclude;
    const lines = current.split(/\r?\n/).filter(Boolean);
    const hasRule = lines.includes(SCRATCH_RULE);
    if (!remove && !hasRule && !options.confirmScratchExclude && !options.dryRun) {
      fail(
        'APR_SETUP_CONFIRMATION_REQUIRED',
        'Scratch exclusion requires explicit confirmation.',
        `Review the plan, then pass --confirm-scratch-exclude to edit ${excludeFile}.`,
        { file: excludeFile }
      );
    }
    const removeScratchRule =
      remove && currentConfig.setup?.scratch_exclude_added && !nextConfig.setup?.agents.length;
    const nextLines = remove
      ? removeScratchRule
        ? lines.filter((line) => line !== SCRATCH_RULE)
        : lines
      : hasRule
        ? lines
        : [...lines, SCRATCH_RULE];
    const next = nextLines.length ? `${nextLines.join('\n')}\n` : '';
    if (current !== next)
      operations.push(
        operation(excludeFile, existsSync(excludeFile) ? current : null, next, 'scratch-exclude')
      );
  }

  const diff = operations
    .map((entry) => {
      if (entry.owner.endsWith('-adapter')) {
        const before = entry.before === null ? null : JSON.parse(entry.before).ai_peer_review;
        const after = entry.after === null ? null : JSON.parse(entry.after).ai_peer_review;
        return `${entry.kind} ${entry.file}\n- ai_peer_review: ${JSON.stringify(before ?? '<absent>')}\n+ ai_peer_review: ${JSON.stringify(after ?? '<absent>')}`;
      }
      if (entry.owner === 'scratch-exclude') {
        return `${entry.kind} ${entry.file}\n${entry.after?.includes(SCRATCH_RULE) ? '+' : '-'} ${SCRATCH_RULE}`;
      }
      return `${entry.kind} ${entry.file}\n- ${entry.before ?? '<absent>'}\n+ ${entry.after ?? '<absent>'}`;
    })
    .join('\n');
  const publicOperations = Object.freeze(
    operations.map((entry) =>
      Object.freeze({
        file: entry.file,
        owner: entry.owner,
        kind: entry.kind,
        backup_required: entry.kind === 'modify',
      })
    )
  );
  const plan = {
    schema: 'ai-peer-review.setup-plan/v1',
    scope,
    agents,
    changed: operations.length > 0,
    backup_required: operations.some((entry) => entry.kind === 'modify'),
    operations: publicOperations,
    diff,
    input,
  };
  if (!options.dryRun) {
    const applicationOrder = remove
      ? [
          ...operations.filter((entry) => entry.owner !== 'package-config'),
          ...operations.filter((entry) => entry.owner === 'package-config'),
        ]
      : operations;
    for (const entry of applicationOrder) {
      if (entry.kind === 'modify') {
        mkdirSync(path.dirname(`${entry.file}.bak`), { recursive: true });
        copyFileSync(entry.file, `${entry.file}.bak`);
      }
      if (entry.after === null) rmSync(entry.file);
      else atomicWrite(entry.file, entry.after);
    }
  }
  return Object.freeze(plan);
}
