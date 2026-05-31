// Config loader for task-tracker.
// Precedence: project-local > user-global > defaults.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getProjectDir } from './paths.mjs';

export const DEFAULTS = {
  wpm: 180,
  // GitHub repo in "owner/repo" format — required, set via /task config repo <owner/repo>
  repo: '',
  // GitHub Projects V2 node ID (set by init script)
  projectId: '',
  // Kanban board field + state option IDs (set by init script).
  // The `kanbanOption*` key suffixes predate the 2026-05 column rename
  // (Groom→Refine, Analyze→Plan, Development→Develop, Validate→Test) and
  // remain the canonical config API. `scripts/gh/lib/project-tether.mjs`
  // `STATUS_CONFIG_KEYS` maps the new state slugs onto these keys.
  kanbanFieldId: '',
  kanbanOptionBacklog: '',
  kanbanOptionRefine: '',
  kanbanOptionPlan: '',
  kanbanOptionDevelop: '',
  kanbanOptionTest: '',
  kanbanOptionReview: '',
  kanbanOptionDone: '',
  // Sequence field ID (set by init script) — numeric field on the project board
  sequenceFieldId: '',
  // Size field ID (set by init script) — single-select field on the project board
  sizeFieldId: '',
  fieldIds: {},
  fieldEstimate: '',
  fieldEngagedTime: '',
  fieldSessionTime: '',
  fieldContextWords: '',
  fieldSequence: '',
  fieldStartTime: '',
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
  reviewPauseThresholdMin: 5,
  recordWallClock: true,
  pickupDirective: true,
  // Human-gate flags (true = human required; false = full-auto bypass).
  // Defaults preserve today's behavior. See docs/guides/workflow.md → Human Gates.
  gateAnalysisToDevelopment: true,
  gateReviewToDone: true,
  // #179 — Hard Review→Done lifecycle-checkbox gate. When true (default), close
  // refuses to advance unless each Lifecycle DoD item is ticked, audit-marker
  // satisfied (Full-Auto path), or per-key opt-out marker stamped. When false,
  // gate downgrades to a WARN row in the timing log.
  lifecycleCheckboxesRequired: true,
  // Verb-pipeline gate (#141). When false (default), non-verb invocations of
  // move-state.mjs without `--out-of-band <reason>` are refused unless a human
  // is at a TTY. Set true to permit direct invocation with a per-call warning.
  directMoveStateAllowed: false,
  // Orphan GC threshold for `.claude/task-tracker.session.*.json`. (#89)
  deadSessionMaxAgeMs: 604800000,
  // EPIC #207 / #212 — per-session state directory retention. Sessions whose
  // last-write mtime is older than this are eligible for GC by a future
  // sub-issue. Integer (days).
  sessionRetentionDays: 2,
  // EPIC #207 / #212 — minimum gap (in seconds) between activity events before
  // the next event implies a pause. Used by per-session pause detection in a
  // later sub-issue. Integer (seconds).
  pauseThresholdSeconds: 30,
};

const TYPES = {
  wpm: 'number',
  repo: 'string',
  projectId: 'string',
  kanbanFieldId: 'string',
  kanbanOptionBacklog: 'string',
  kanbanOptionRefine: 'string',
  kanbanOptionPlan: 'string',
  kanbanOptionDevelop: 'string',
  kanbanOptionTest: 'string',
  kanbanOptionReview: 'string',
  kanbanOptionDone: 'string',
  sequenceFieldId: 'string',
  sizeFieldId: 'string',
  fieldIds: 'object',
  fieldEstimate: 'string',
  fieldEngagedTime: 'string',
  fieldSessionTime: 'string',
  fieldContextWords: 'string',
  fieldSequence: 'string',
  fieldStartTime: 'string',
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
  reviewPauseThresholdMin: 'number',
  recordWallClock: 'boolean',
  pickupDirective: 'boolean',
  gateAnalysisToDevelopment: 'boolean',
  gateReviewToDone: 'boolean',
  lifecycleCheckboxesRequired: 'boolean',
  directMoveStateAllowed: 'boolean',
  deadSessionMaxAgeMs: 'number',
  sessionRetentionDays: 'integer',
  pauseThresholdSeconds: 'integer',
};

function defaultPaths() {
  const projectDir = getProjectDir();
  return {
    projectPath: path.join(projectDir, '.ai-task-manager', 'task-tracker.json'),
    legacyProjectPath: path.join(projectDir, '.claude', 'task-tracker.json'),
    userPath: path.join(os.homedir(), '.ai-task-manager', 'task-tracker-config.json'),
    legacyUserPath: path.join(os.homedir(), '.claude', 'task-tracker-config.json'),
  };
}

function readJson(p) {
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

// Return the raw project-config JSON without merging defaults. Used by the
// auto-mode prompt logic (#89) to detect "explicitly set" gate keys.
export function rawProjectConfig(paths = {}) {
  const defaults = defaultPaths();
  const projectPath = paths.projectPath ?? defaults.projectPath;
  const legacyProjectPath =
    paths.legacyProjectPath ?? (paths.projectPath ? null : defaults.legacyProjectPath);
  if (existsSync(projectPath)) return readJson(projectPath);
  if (legacyProjectPath && existsSync(legacyProjectPath)) return readJson(legacyProjectPath);
  return {};
}

// Team-shared workflow preferences. Stored under `preferences` in the
// git-tracked `.ai-task-manager/task-tracker.json`. Defaults preserve today's
// behavior; teams opt in by editing the file (or via `configure preferences`).
export const PREFERENCE_DEFAULTS = {
  noPushToOrigin: false,
  mainThreadOnly: false,
  driveSubIssuesToReview: true,
  pauseTimerOnBlockingQuestion: true,
  noConfirmAfterDeepDive: true,
  askGatesBeforeParallel: true,
  gateAssigneeMatch: true,
  formatting: {
    noEmojis: true,
    currencyInBackticks: true,
  },
  scratchDir: './.tmp/',
};

function mergePreferences(overrides) {
  const merged = { ...PREFERENCE_DEFAULTS };
  if (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) {
    for (const [k, v] of Object.entries(overrides)) {
      if (!(k in PREFERENCE_DEFAULTS)) continue;
      const def = PREFERENCE_DEFAULTS[k];
      if (def && typeof def === 'object' && !Array.isArray(def)) {
        merged[k] = { ...def, ...(v && typeof v === 'object' ? v : {}) };
      } else {
        merged[k] = v;
      }
    }
  }
  return merged;
}

export function getPreferences(paths = {}) {
  const defaults = defaultPaths();
  const projectPath = paths.projectPath ?? defaults.projectPath;
  const legacyProjectPath =
    paths.legacyProjectPath ?? (paths.projectPath ? null : defaults.legacyProjectPath);
  const project = existsSync(projectPath)
    ? readJson(projectPath)
    : legacyProjectPath
      ? readJson(legacyProjectPath)
      : {};
  return mergePreferences(project.preferences);
}

export function loadConfig(paths = {}) {
  const defaults = defaultPaths();
  const projectPath = paths.projectPath ?? defaults.projectPath;
  const legacyProjectPath =
    paths.legacyProjectPath ?? (paths.projectPath ? null : defaults.legacyProjectPath);
  const userPath = paths.userPath ?? defaults.userPath;
  const legacyUserPath = paths.legacyUserPath ?? (paths.userPath ? null : defaults.legacyUserPath);
  const user = existsSync(userPath)
    ? readJson(userPath)
    : legacyUserPath
      ? readJson(legacyUserPath)
      : {};
  const project = existsSync(projectPath)
    ? readJson(projectPath)
    : legacyProjectPath
      ? readJson(legacyProjectPath)
      : {};
  const merged = { ...DEFAULTS };
  const sources = {};
  for (const k of Object.keys(DEFAULTS)) sources[k] = 'default';
  for (const [k, v] of Object.entries(user)) {
    if (k in DEFAULTS) {
      merged[k] = v;
      sources[k] = 'user';
    }
  }
  for (const [k, v] of Object.entries(project)) {
    if (k in DEFAULTS) {
      merged[k] = v;
      sources[k] = 'project';
    }
  }
  if (merged.fieldIds && typeof merged.fieldIds === 'object') {
    merged.fieldEstimate ||= merged.fieldIds.estimate || '';
    merged.fieldEngagedTime ||= merged.fieldIds.engagedTime || merged.fieldIds.actualHours || '';
    merged.fieldSessionTime ||= merged.fieldIds.sessionTime || '';
    merged.fieldContextWords ||= merged.fieldIds.contextLength || '';
    merged.fieldSequence ||= merged.fieldIds.sequence || '';
    merged.sequenceFieldId ||= merged.fieldIds.sequence || '';
    merged.sizeFieldId ||= merged.fieldIds.size || '';
    merged.fieldStartTime ||= merged.fieldIds.startTime || '';
  }
  merged.preferences = mergePreferences(project.preferences);
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
  if (t === 'integer') {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw new Error(`value for ${key} must be an integer, got: ${raw}`);
    }
    return n;
  }
  if (t === 'boolean') {
    const s = String(raw).toLowerCase();
    if (['true', '1', 'yes'].includes(s)) return true;
    if (['false', '0', 'no'].includes(s)) return false;
    throw new Error(`value for ${key} must be boolean, got: ${raw}`);
  }
  if (t === 'array') {
    return String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (t === 'object') {
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return raw;
    try {
      const parsed = JSON.parse(String(raw));
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
    } catch {}
    throw new Error(`value for ${key} must be a JSON object, got: ${raw}`);
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
  'repo',
  'assignee',
  'defaultLabels',
  'wpm',
  'autoEndOnSwitch',
  'idleThresholdMinutes',
  'reviewPauseThresholdMin',
  'recordWallClock',
  'hookNetworkTimeoutMs',
  'pickupDirective',
  'gateAnalysisToDevelopment',
  'gateReviewToDone',
  'lifecycleCheckboxesRequired',
  'directMoveStateAllowed',
  'deadSessionMaxAgeMs',
  'statePath',
  'queuePath',
];

const INTERNAL_KEYS = [
  'projectId',
  'kanbanFieldId',
  'kanbanOptionBacklog',
  'kanbanOptionRefine',
  'kanbanOptionPlan',
  'kanbanOptionDevelop',
  'kanbanOptionTest',
  'kanbanOptionReview',
  'kanbanOptionDone',
  'sequenceFieldId',
  'sizeFieldId',
  'fieldIds',
  'fieldEstimate',
  'fieldEngagedTime',
  'fieldSessionTime',
  'fieldContextWords',
  'fieldSequence',
  'fieldStartTime',
  'priorityFieldId',
  'priorityOptionP0',
  'priorityOptionP1',
  'priorityOptionP2',
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
  const raw = cfg[k];
  const val =
    raw && typeof raw === 'object'
      ? `${Object.keys(raw).length} mapped`
      : raw
        ? String(raw).slice(0, 8) + '…'
        : '(not set)';
  return `  ${marker(cfg._sources[k])} ${k.padEnd(24)} ${val}`;
}

export function formatConfig(cfg) {
  return [
    'Task Tracker Config (* = project-local override, ^ = user-global override)\n',
    'Settings  (edit with: /task config <key> <value>)',
    ...USER_KEYS.map((k) => formatUserRow(cfg, k)),
    '\nInternal  (managed by: npx ai-task-manager init)',
    ...INTERNAL_KEYS.map((k) => formatInternalRow(cfg, k)),
  ].join('\n');
}
