// Config loader for task-tracker.
// Precedence: project-local > user-global > defaults.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const DEFAULTS = {
  wpm: 180,
  // GitHub repo in "owner/repo" format — required, set via /task config repo <owner/repo>
  repo: '',
  // GitHub Projects V2 node ID (set by init script)
  projectId: '',
  // Kanban board field + state option IDs (set by init script)
  kanbanFieldId: '',
  kanbanOptionBacklog: '',
  kanbanOptionReady: '',
  kanbanOptionInProgress: '',
  kanbanOptionInReview: '',
  kanbanOptionDone: '',
  // Sequence field ID (set by init script) — numeric field on the project board
  sequenceFieldId: '',
  // Priority field + option IDs (set by init script)
  priorityFieldId: '',
  priorityOptionP0: '',
  priorityOptionP1: '',
  priorityOptionP2: '',
  // GitHub assignee for new issues created via /task new (default: current gh user)
  assignee: '@me',
  defaultLabels: [],
  autoEndOnSwitch: true,
  hookNetworkTimeoutMs: 2000,
  queuePath: '.ai-task-manager/task-tracker-queue.json',
  statePath: '.ai-task-manager/task-tracker-state.json',
  idleThresholdMinutes: 5,
  recordWallClock: true,
  pickupDirective: true,
};

const TYPES = {
  wpm: 'number',
  repo: 'string',
  projectId: 'string',
  kanbanFieldId: 'string',
  kanbanOptionBacklog: 'string',
  kanbanOptionReady: 'string',
  kanbanOptionInProgress: 'string',
  kanbanOptionInReview: 'string',
  kanbanOptionDone: 'string',
  sequenceFieldId: 'string',
  priorityFieldId: 'string',
  priorityOptionP0: 'string',
  priorityOptionP1: 'string',
  priorityOptionP2: 'string',
  assignee: 'string',
  defaultLabels: 'array',
  autoEndOnSwitch: 'boolean',
  hookNetworkTimeoutMs: 'number',
  queuePath: 'string',
  statePath: 'string',
  idleThresholdMinutes: 'number',
  recordWallClock: 'boolean',
  pickupDirective: 'boolean',
};

function defaultPaths() {
  const projectDir = process.env.AI_TASK_MANAGER_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return {
    projectPath: path.join(projectDir, '.ai-task-manager', 'task-tracker.json'),
    legacyProjectPath: path.join(projectDir, '.claude', 'task-tracker.json'),
    userPath: path.join(os.homedir(), '.ai-task-manager', 'task-tracker-config.json'),
    legacyUserPath: path.join(os.homedir(), '.claude', 'task-tracker-config.json'),
  };
}

function readJson(p) {
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch { return {}; }
}

export function loadConfig(paths = {}) {
  const defaults = defaultPaths();
  const projectPath = paths.projectPath ?? defaults.projectPath;
  const legacyProjectPath = paths.legacyProjectPath ?? (paths.projectPath ? null : defaults.legacyProjectPath);
  const userPath = paths.userPath ?? defaults.userPath;
  const legacyUserPath = paths.legacyUserPath ?? (paths.userPath ? null : defaults.legacyUserPath);
  const user = existsSync(userPath) ? readJson(userPath) : (legacyUserPath ? readJson(legacyUserPath) : {});
  const project = existsSync(projectPath) ? readJson(projectPath) : (legacyProjectPath ? readJson(legacyProjectPath) : {});
  const merged = { ...DEFAULTS };
  const sources = {};
  for (const k of Object.keys(DEFAULTS)) sources[k] = 'default';
  for (const [k, v] of Object.entries(user)) { if (k in DEFAULTS) { merged[k] = v; sources[k] = 'user'; } }
  for (const [k, v] of Object.entries(project)) { if (k in DEFAULTS) { merged[k] = v; sources[k] = 'project'; } }
  merged._sources = sources;
  return merged;
}

function coerce(key, raw) {
  const t = TYPES[key];
  if (t === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`value for ${key} must be numeric, got: ${raw}`);
    return n;
  }
  if (t === 'boolean') {
    const s = String(raw).toLowerCase();
    if (['true', '1', 'yes'].includes(s)) return true;
    if (['false', '0', 'no'].includes(s)) return false;
    throw new Error(`value for ${key} must be boolean, got: ${raw}`);
  }
  if (t === 'array') {
    return String(raw).split(',').map(s => s.trim()).filter(Boolean);
  }
  return String(raw);
}

export function setConfigValue(key, rawValue, paths = {}) {
  if (!(key in DEFAULTS)) {
    throw new Error(`unknown config key: ${key}. Valid keys: ${Object.keys(DEFAULTS).join(', ')}`);
  }
  const value = coerce(key, rawValue);
  const { projectPath } = { ...defaultPaths(), ...paths };
  const current = readJson(projectPath);
  current[key] = value;
  mkdirSync(path.dirname(projectPath), { recursive: true });
  writeFileSync(projectPath, JSON.stringify(current, null, 2) + '\n', 'utf8');
  return value;
}

const USER_KEYS = [
  'repo', 'assignee', 'defaultLabels',
  'wpm', 'autoEndOnSwitch', 'idleThresholdMinutes', 'recordWallClock', 'hookNetworkTimeoutMs',
  'pickupDirective',
  'statePath', 'queuePath',
];

const INTERNAL_KEYS = [
  'projectId',
  'kanbanFieldId', 'kanbanOptionBacklog', 'kanbanOptionReady', 'kanbanOptionInProgress', 'kanbanOptionInReview', 'kanbanOptionDone',
  'sequenceFieldId',
  'priorityFieldId', 'priorityOptionP0', 'priorityOptionP1', 'priorityOptionP2',
];

function marker(src) {
  if (src === 'project') return ' *';
  if (src === 'user') return ' ^';
  return '  ';
}

function formatUserRow(cfg, k) {
  const val = Array.isArray(cfg[k]) ? JSON.stringify(cfg[k]) : String(cfg[k]);
  return `  ${marker(cfg._sources[k])} ${k.padEnd(24)} ${val}`;
}

function formatInternalRow(cfg, k) {
  const val = cfg[k] ? cfg[k].slice(0, 8) + '…' : '(not set)';
  return `  ${marker(cfg._sources[k])} ${k.padEnd(24)} ${val}`;
}

export function formatConfig(cfg) {
  return [
    'Task Tracker Config (* = project-local override, ^ = user-global override)\n',
    'Settings  (edit with: /task config <key> <value>)',
    ...USER_KEYS.map(k => formatUserRow(cfg, k)),
    '\nInternal  (managed by: npx ai-task-manager init)',
    ...INTERNAL_KEYS.map(k => formatInternalRow(cfg, k)),
  ].join('\n');
}
