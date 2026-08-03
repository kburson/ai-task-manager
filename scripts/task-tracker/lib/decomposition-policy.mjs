import { accessSync, constants, existsSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  isSubstantiveMetadataValue,
  metadataFieldValue,
  parseMetadataField,
  sectionBounds,
} from './metadata-section.mjs';

export const DECOMPOSITION_THRESHOLDS = Object.freeze({
  reviewEstimateHours: 16,
  splitEstimateHours: 24,
  reviewTaskCount: 3,
  splitTaskCount: 4,
  reviewVerificationGroups: 2,
  splitXlVerificationGroups: 2,
});

const TASK_HEADING_RE = /^###\s+(Task|Milestone)\s+(\d+):\s*(.*?)\s*$/i;
const SECTION_HEADING_RE = /^#{1,3}\s+/;
const RUN_COMMAND_RE = /^\s*Run:\s*`([^`]+)`\s*$/gim;
const VERIFICATION_BLOCK_RE =
  /\*\*Verification Commands:\*\*\s*\n\s*```[^\n]*\n([\s\S]*?)\n\s*```/gi;
const PLAN_METADATA_KEYS = ['Implementation-plan', 'Source-plan', 'Plan'];
const WAIVER_HEADING = 'Decomposition Waiver';
const WAIVER_FIELDS = [
  'Rationale',
  'Expected-focused-duration',
  'Milestone-checkpoint-plan',
  'Why-no-nested-children',
  'Approved-by',
  'Approved-at',
];

function uniqueCommands(commands) {
  const seen = new Set();
  return commands.filter((command) => {
    const normalized = String(command).trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function commandsFromTaskBody(body) {
  const commands = [];
  for (const match of String(body).matchAll(RUN_COMMAND_RE)) commands.push(match[1].trim());
  for (const block of String(body).matchAll(VERIFICATION_BLOCK_RE)) {
    for (const line of block[1].split('\n')) {
      const command = line.trim().replace(/^`|`$/g, '');
      if (command && !command.startsWith('#')) commands.push(command);
    }
  }
  return uniqueCommands(commands);
}

export function extractPlanTasks(planText = '') {
  const lines = String(planText).split('\n');
  const tasks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = TASK_HEADING_RE.exec(lines[index]);
    if (!match) continue;
    let end = index + 1;
    while (end < lines.length && !SECTION_HEADING_RE.test(lines[end])) end += 1;
    const body = lines.slice(index + 1, end).join('\n');
    tasks.push({
      number: Number(match[2]),
      kind: match[1].toLowerCase(),
      title: match[3].trim(),
      heading: `### ${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${Number(match[2])}: ${match[3].trim()}`,
      body,
      commands: commandsFromTaskBody(body),
    });
  }
  return tasks;
}

function signal(code, value, threshold, level) {
  return { code, value, threshold, level };
}

function collectSignals({ size, estimateHours, taskCount, verificationGroupCount }) {
  const thresholds = DECOMPOSITION_THRESHOLDS;
  const signals = [];
  const normalizedSize = typeof size === 'string' ? size.trim().toUpperCase() : null;
  const estimate = Number.isFinite(estimateHours) ? Number(estimateHours) : null;

  if (normalizedSize === 'XL') signals.push(signal('size-xl', 'XL', 'XL', 'review'));
  if (estimate !== null && estimate >= thresholds.splitEstimateHours) {
    signals.push(signal('estimate-hours', estimate, thresholds.splitEstimateHours, 'must-split'));
  } else if (estimate !== null && estimate >= thresholds.reviewEstimateHours) {
    signals.push(signal('estimate-hours', estimate, thresholds.reviewEstimateHours, 'review'));
  }
  if (taskCount >= thresholds.splitTaskCount) {
    signals.push(signal('task-count', taskCount, thresholds.splitTaskCount, 'must-split'));
  } else if (taskCount >= thresholds.reviewTaskCount) {
    signals.push(signal('task-count', taskCount, thresholds.reviewTaskCount, 'review'));
  }
  if (verificationGroupCount >= thresholds.reviewVerificationGroups) {
    signals.push(
      signal(
        'verification-groups',
        verificationGroupCount,
        thresholds.reviewVerificationGroups,
        'review'
      )
    );
  }
  if (normalizedSize === 'XL' && verificationGroupCount >= thresholds.splitXlVerificationGroups) {
    signals.push(
      signal(
        'xl-verification-groups',
        verificationGroupCount,
        thresholds.splitXlVerificationGroups,
        'must-split'
      )
    );
  }
  return signals;
}

export function classifyDecomposition({ size = null, estimateHours = null, planText = '' } = {}) {
  const tasks = extractPlanTasks(planText);
  const verificationGroupCount = tasks.filter((task) => task.commands.length > 0).length;
  const signals = collectSignals({
    size,
    estimateHours,
    taskCount: tasks.length,
    verificationGroupCount,
  });
  const mustSplit = signals.some((item) => item.level === 'must-split');
  const needsReview = signals.some((item) => item.level === 'review');
  return {
    status: mustSplit ? 'must-split' : needsReview ? 'needs-decomposition-review' : 'story-ok',
    signals,
    taskCount: tasks.length,
    verificationGroupCount,
    tasks,
  };
}

export function linkedPlanPath(body = '') {
  for (const key of PLAN_METADATA_KEYS) {
    const value = metadataFieldValue(body, 'Plan Metadata', key);
    if (!value) continue;
    return value.replace(/\s+@\s+[0-9a-f]{7,40}\s*$/i, '').trim();
  }
  return null;
}

function unavailable(source, diagnostic) {
  return { path: null, source, diagnostic };
}

export function resolvePlanPath({ projectDir, body = '', overridePath = null } = {}) {
  if (!projectDir) throw new Error('resolvePlanPath: projectDir is required');
  const source = overridePath ? 'override' : 'metadata';
  const candidate = overridePath || linkedPlanPath(body);
  if (!candidate) return unavailable(source, 'no linked plan path');
  const root = path.resolve(projectDir);
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return unavailable(source, `plan path resolves outside repository root: ${candidate}`);
  }
  try {
    if (!existsSync(resolved) || !statSync(resolved).isFile()) {
      return unavailable(source, `plan path is not a readable file: ${candidate}`);
    }
    accessSync(resolved, constants.R_OK);
  } catch {
    return unavailable(source, `plan path is not a readable file: ${candidate}`);
  }
  return { path: resolved, source, diagnostic: null };
}

function canonicalWaiverKey(key) {
  return WAIVER_FIELDS.find((candidate) => candidate.toLowerCase() === key.toLowerCase()) || null;
}

export function parseDecompositionWaiver(body = '') {
  const lines = String(body).split('\n');
  const bounds = sectionBounds(lines, WAIVER_HEADING);
  if (!bounds) return { ok: false, reason: 'missing', fields: {}, missing: WAIVER_FIELDS };

  const fields = {};
  const duplicates = [];
  for (const line of lines.slice(bounds.start, bounds.end)) {
    const parsed = parseMetadataField(line);
    if (!parsed) continue;
    const key = canonicalWaiverKey(parsed.key);
    if (!key) continue;
    if (Object.hasOwn(fields, key)) duplicates.push(key);
    fields[key] = parsed.value.trim();
  }
  if (duplicates.length > 0) {
    return { ok: false, reason: 'duplicate fields', fields, duplicates: [...new Set(duplicates)] };
  }
  const missing = WAIVER_FIELDS.filter(
    (key) => !Object.hasOwn(fields, key) || !isSubstantiveMetadataValue(fields[key])
  );
  if (missing.length > 0) return { ok: false, reason: 'incomplete', fields, missing };
  if (!/^\d+(?:\.\d+)?\s*(?:h|hours?)$/i.test(fields['Expected-focused-duration'])) {
    return { ok: false, reason: 'invalid Expected-focused-duration', fields };
  }
  const duration = Number.parseFloat(fields['Expected-focused-duration']);
  if (!(duration > 0)) {
    return { ok: false, reason: 'invalid Expected-focused-duration', fields };
  }
  if (!Number.isFinite(Date.parse(fields['Approved-at']))) {
    return { ok: false, reason: 'invalid Approved-at', fields };
  }
  return { ok: true, reason: null, fields, missing: [], duplicates: [] };
}
