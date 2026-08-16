import { accessSync, constants, existsSync, lstatSync, realpathSync, statSync } from 'node:fs';
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
const RUN_COMMAND_RE = /^\s*Run:\s*`([^`]+)`\s*$/i;
const VERIFICATION_LABEL_RE = /^\s*\*\*Verification Commands:\*\*\s*$/i;
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

function openingFenceFor(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null;
  return { character: match[1][0], length: match[1].length };
}

function isClosingFence(line, fence) {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  return Boolean(match && match[1][0] === fence.character && match[1].length >= fence.length);
}

function commandsFromTaskBody(body) {
  const commands = [];
  let fence = null;
  for (const line of String(body).split('\n')) {
    if (fence) {
      if (isClosingFence(line, fence)) {
        fence = null;
        continue;
      }
      const command = line.trim().replace(/^`|`$/g, '');
      if (command && !command.startsWith('#')) commands.push(command);
      continue;
    }
    const openingFence = openingFenceFor(line);
    if (openingFence) {
      fence = openingFence;
      continue;
    }
    const run = RUN_COMMAND_RE.exec(line);
    if (run) commands.push(run[1].trim());
  }
  return uniqueCommands(commands);
}

function stripLineMarkdown(line, lines, lineIndex, state) {
  let visible = '';
  let structural = '';
  let index = 0;
  while (index < line.length) {
    if (state.inComment) {
      const end = line.indexOf('-->', index);
      const stop = end === -1 ? line.length : end + 3;
      visible += ' '.repeat(stop - index);
      structural += ' '.repeat(stop - index);
      index = stop;
      if (end !== -1) state.inComment = false;
      continue;
    }
    const ticks = /^`+/.exec(line.slice(index));
    if (ticks) {
      const length = ticks[0].length;
      let backslashes = 0;
      for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) {
        backslashes += 1;
      }
      const escaped = backslashes % 2 === 1;
      if (state.inlineTicks === 0) {
        if (!escaped && hasClosingBacktickRun(lines, lineIndex, index + length, length)) {
          state.inlineTicks = length;
          structural += ' '.repeat(length);
        } else {
          structural += ticks[0];
        }
      } else {
        structural += ' '.repeat(length);
        if (length === state.inlineTicks) state.inlineTicks = 0;
      }
      visible += ticks[0];
      index += length;
      continue;
    }
    if (state.inlineTicks === 0 && line.startsWith('<!--', index)) {
      state.inComment = true;
      visible += '    ';
      structural += '    ';
      index += 4;
      continue;
    }
    visible += line[index];
    structural += state.inlineTicks === 0 ? line[index] : ' ';
    index += 1;
  }
  return { visible, structural };
}

function hasClosingBacktickRun(lines, lineIndex, start, expectedLength) {
  for (let currentLine = lineIndex; currentLine < lines.length; currentLine += 1) {
    const line = lines[currentLine];
    if (currentLine > lineIndex && interruptsInlineBlock(line)) return false;
    let index = currentLine === lineIndex ? start : 0;
    while (index < line.length) {
      if (line[index] !== '`') {
        index += 1;
        continue;
      }
      let end = index + 1;
      while (end < line.length && line[end] === '`') end += 1;
      if (end - index === expectedLength) return true;
      index = end;
    }
  }
  return false;
}

function interruptsInlineBlock(line) {
  return (
    /^\s*$/.test(line) ||
    /^ {0,3}(?:#{1,6}(?:[ \t]+|$)|>|`{3,}|~{3,}|<!--|(?:[*+-]|\d{1,9}[.)])(?:[ \t]+|$))/.test(line)
  );
}

function markdownViews(value) {
  const lines = String(value).split('\n');
  const state = {
    inComment: false,
    fence: null,
    inlineTicks: 0,
    verificationFenceEligible: false,
  };
  const structuralLines = [];
  const commandLines = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (state.fence) {
      const verificationFence = state.fence.verification;
      if (isClosingFence(line, state.fence)) {
        state.fence = null;
      }
      structuralLines.push('');
      commandLines.push(verificationFence ? line : '');
      continue;
    }
    const inlineTicksAtStart = state.inlineTicks;
    const { visible, structural } = stripLineMarkdown(line, lines, lineIndex, state);
    const openingFence = !state.inComment && openingFenceFor(visible);
    let verificationFence = false;
    if (inlineTicksAtStart === 0 && openingFence) {
      verificationFence = state.verificationFenceEligible;
      state.fence = {
        ...openingFence,
        verification: verificationFence,
      };
      state.inlineTicks = 0;
      state.verificationFenceEligible = false;
    } else if (visible.trim()) {
      state.verificationFenceEligible = VERIFICATION_LABEL_RE.test(structural);
    }
    structuralLines.push(openingFence && inlineTicksAtStart === 0 ? '' : structural);
    const insideMultilineSpan = inlineTicksAtStart !== 0 || state.inlineTicks !== 0;
    commandLines.push(
      openingFence && inlineTicksAtStart === 0
        ? verificationFence
          ? visible
          : ''
        : insideMultilineSpan
          ? ''
          : visible
    );
  }
  return { structuralLines, commandLines };
}

function visibleStructuralLines(value) {
  return markdownViews(value).structuralLines;
}

export function extractPlanTasks(planText = '') {
  const originalLines = String(planText).split('\n');
  const { commandLines, structuralLines } = markdownViews(planText);
  const tasks = [];
  for (let index = 0; index < structuralLines.length; index += 1) {
    const match = TASK_HEADING_RE.exec(structuralLines[index]);
    if (!match) continue;
    const number = Number(match[2]);
    const title = match[3].trim();
    if (!Number.isInteger(number) || number <= 0 || !title) continue;
    let end = index + 1;
    while (end < structuralLines.length && !SECTION_HEADING_RE.test(structuralLines[end])) end += 1;
    const body = originalLines.slice(index + 1, end).join('\n');
    const commandBody = commandLines.slice(index + 1, end).join('\n');
    tasks.push({
      number,
      kind: match[1].toLowerCase(),
      title,
      heading: `### ${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${number}: ${title}`,
      body,
      commands: commandsFromTaskBody(commandBody),
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

export function linkedPlanReference(body = '') {
  for (const key of PLAN_METADATA_KEYS) {
    const value = visibleMetadataFieldValue(body, 'Plan Metadata', key);
    if (value == null) continue;
    const candidate = value.replace(/\s+@\s+[0-9a-f]{7,40}\s*$/i, '').trim();
    if (isSubstantiveMetadataValue(candidate)) return { key, path: candidate };
  }
  return null;
}

export function linkedPlanPath(body = '') {
  return linkedPlanReference(body)?.path || null;
}

export function visibleMetadataFieldValue(body, heading, key) {
  const value = metadataFieldValue(visibleStructuralLines(body).join('\n'), heading, key);
  return value != null && isSubstantiveMetadataValue(value) ? value.trim() : null;
}

export function visibleMetadataFieldValues(body, heading, key) {
  const lines = visibleStructuralLines(body);
  const bounds = sectionBounds(lines, heading);
  if (!bounds) return [];
  const wanted = String(key).toLowerCase();
  return lines
    .slice(bounds.start, bounds.end)
    .map(parseMetadataField)
    .filter((field) => field?.key.toLowerCase() === wanted)
    .map((field) => field.value.trim());
}

export function selectDecompositionPlanSection({
  body = '',
  planText = '',
  activePlanKey = null,
} = {}) {
  const inactive = {
    ok: true,
    applied: false,
    planText: String(planText),
    heading: null,
    diagnostic: null,
  };
  if (activePlanKey !== 'Source-plan') return inactive;

  const values = visibleMetadataFieldValues(body, 'Plan Metadata', 'Source-plan-section');
  if (values.length === 0) return inactive;
  if (values.length !== 1) {
    return {
      ...inactive,
      ok: false,
      applied: true,
      diagnostic: 'duplicate Source-plan-section fields',
    };
  }

  const heading = values[0];
  if (!isSubstantiveMetadataValue(heading)) {
    return {
      ...inactive,
      ok: false,
      applied: true,
      heading,
      diagnostic: 'Source-plan-section is empty',
    };
  }

  const matches = extractPlanTasks(planText).filter((task) => task.heading === heading);
  if (matches.length !== 1) {
    return {
      ...inactive,
      ok: false,
      applied: true,
      heading,
      diagnostic:
        matches.length === 0
          ? `Source-plan-section not found: ${heading}`
          : `Source-plan-section is ambiguous: ${heading}`,
    };
  }

  const [task] = matches;
  return {
    ok: true,
    applied: true,
    planText: `${task.heading}\n${task.body}`,
    heading,
    diagnostic: null,
  };
}

function unavailable(source, diagnostic) {
  return { path: null, source, diagnostic };
}

export function resolvePlanPath({ projectDir, body = '', overridePath = null } = {}) {
  if (!projectDir) throw new Error('resolvePlanPath: projectDir is required');
  const source = overridePath ? 'override' : 'metadata';
  const candidate = overridePath || linkedPlanPath(body);
  if (!candidate) return unavailable(source, 'no linked plan path');
  if (path.isAbsolute(candidate)) {
    return unavailable(source, `plan path must be repository-relative: ${candidate}`);
  }
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
    if (lstatSync(resolved).isSymbolicLink()) {
      return unavailable(source, `plan path must not be a symbolic link: ${candidate}`);
    }
    accessSync(resolved, constants.R_OK);
    const realRoot = realpathSync(root);
    const realResolved = realpathSync(resolved);
    const realRelative = path.relative(realRoot, realResolved);
    if (
      realRelative === '..' ||
      realRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(realRelative)
    ) {
      return unavailable(source, `plan path resolves outside repository root: ${candidate}`);
    }
  } catch {
    return unavailable(source, `plan path is not a readable file: ${candidate}`);
  }
  return { path: resolved, source, diagnostic: null };
}

function canonicalWaiverKey(key) {
  return WAIVER_FIELDS.find((candidate) => candidate.toLowerCase() === key.toLowerCase()) || null;
}

function isValidIsoTimestamp(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(
      value
    );
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const calendarDateMatches =
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day);
  return (
    calendarDateMatches &&
    Number(hour) <= 23 &&
    Number(minute) <= 59 &&
    Number(second) <= 59 &&
    (offsetHour === undefined || (Number(offsetHour) <= 23 && Number(offsetMinute) <= 59))
  );
}

export function parseDecompositionWaiver(body = '') {
  const lines = visibleStructuralLines(body);
  const sectionCount = lines.filter((line) => /^##\s+Decomposition Waiver\s*$/i.test(line)).length;
  if (sectionCount > 1) {
    return { ok: false, reason: 'duplicate sections', fields: {}, missing: WAIVER_FIELDS };
  }
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
  const approvedAt = fields['Approved-at'];
  if (!isValidIsoTimestamp(approvedAt)) {
    return { ok: false, reason: 'invalid Approved-at', fields };
  }
  return { ok: true, reason: null, fields, missing: [], duplicates: [] };
}
