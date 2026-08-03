#!/usr/bin/env node
// #488/#892 — One-shot, idempotent metadata back-fill. It bolds legacy flat
// labels and relocates create-time provenance from `## Plan Metadata` into the
// adjacent `## Story Origin` section. Existing Story Origin values win when a
// legacy body contains the same key in both sections.
//
// The pure core `buildPlanMetadataBackfill(body)` is exported for offline unit
// tests; the CLI wraps it with `gh issue list` enumeration and `mutateIssueBody`
// writes so invariant markers are preserved.
//
// Audit/dry-run is the DEFAULT (AC4) — nothing is written without `--apply`:
//   node scripts/task-tracker/backfill-plan-metadata.mjs            # audit only
//   node scripts/task-tracker/backfill-plan-metadata.mjs --apply    # write
//   node scripts/task-tracker/backfill-plan-metadata.mjs --help     # usage, no writes (#722)

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { findUnboldPlanMetadataLabels, PLAN_METADATA_HEADING } from './lib/plan-metadata.mjs';
import { STORY_ORIGIN_HEADING, STORY_ORIGIN_PROVENANCE_KEYS } from './lib/story-origin.mjs';
import {
  normalizeMetadataLine,
  normalizeMetadataSection,
  parseMetadataField,
  sectionBounds,
} from './lib/metadata-section.mjs';
import { mutateIssueBody } from './lib/issue-body-mutate.mjs';
import { parseIssueKind } from './lib/issue-kind.mjs';
import { assertKnownArgv, reportStrictArgvError } from './lib/argv-strict.mjs';
import { confirmBlastRadius } from './lib/blast-radius-guard.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(process.argv.slice(2))) {
  emitSelfDoc('backfill-plan-metadata');
  process.exit(0);
}

const pexec = promisify(execFile);

const PROVENANCE_KEYS = new Set(STORY_ORIGIN_PROVENANCE_KEYS);
const LEGACY_PARENT_EPIC_RE = /^(?:-\s+)?\*\*Parent epic(?::\*\*|\*\*:)\s*(.*)$/i;

function canonicalOriginKey(key) {
  return key === 'size-note' ? 'size-guess' : key;
}

function parseLegacyParentEpicField(line) {
  const match = LEGACY_PARENT_EPIC_RE.exec(String(line));
  if (!match) return null;
  return { key: 'parent', value: match[1], bold: true };
}

function insertFieldsBeforeTrailingBlank(lines, bounds, fields) {
  let insertAt = bounds.end;
  while (insertAt > bounds.start && lines[insertAt - 1].trim() === '') insertAt -= 1;
  lines.splice(insertAt, 0, ...fields);
}

// Pure: normalize both metadata sections and relocate legacy provenance.
//
//   { status: 'skip' }                              no section, or already bold
//   { status: 'healed', body, changed: [labels] }   body required convergence
export function buildPlanMetadataBackfill(body = '') {
  const src = String(body);
  const originalLines = src.split('\n');
  const originalPlanBounds = sectionBounds(originalLines, PLAN_METADATA_HEADING);
  if (!originalPlanBounds) return { status: 'skip' };

  const originalStoryBounds = sectionBounds(originalLines, STORY_ORIGIN_HEADING);
  const storyValues = new Map();
  if (originalStoryBounds) {
    for (let i = originalStoryBounds.start; i < originalStoryBounds.end; i += 1) {
      const field = parseMetadataField(originalLines[i]);
      const key = field?.key.toLowerCase();
      if (!field || !PROVENANCE_KEYS.has(key)) continue;
      const canonical = canonicalOriginKey(key);
      if (field.value.trim() && !storyValues.has(canonical)) {
        storyValues.set(canonical, field.value);
      }
    }
  }

  const changed = [];
  const movedFields = [];
  const planContent = [];
  for (let i = originalPlanBounds.start; i < originalPlanBounds.end; i += 1) {
    const line = originalLines[i];
    const field = parseMetadataField(line) ?? parseLegacyParentEpicField(line);
    const key = field?.key.toLowerCase();
    if (field && PROVENANCE_KEYS.has(key)) {
      const canonical = canonicalOriginKey(key);
      changed.push(canonical);
      if (field.value.trim() && !storyValues.has(canonical)) {
        storyValues.set(canonical, field.value);
        movedFields.push(`- **${canonical}**: ${field.value}`);
      }
      continue;
    }
    const normalized = normalizeMetadataLine(line);
    if (normalized !== line && field) changed.push(key);
    planContent.push(normalized);
  }

  if (!storyValues.has('kind')) {
    const kind = parseIssueKind(src);
    storyValues.set('kind', kind);
    movedFields.unshift(`- **kind**: ${kind}`);
    if (!changed.includes('kind')) changed.unshift('kind');
  }

  const lines = [
    ...originalLines.slice(0, originalPlanBounds.start),
    ...planContent,
    ...originalLines.slice(originalPlanBounds.end),
  ];

  let outputLines = lines;
  let storyBounds = sectionBounds(outputLines, STORY_ORIGIN_HEADING);
  if (storyBounds) {
    if (movedFields.length > 0) {
      insertFieldsBeforeTrailingBlank(outputLines, storyBounds, movedFields);
    }

    // Converge a legacy size-note already present in Story Origin and normalize
    // all of its labels. Preserve the first value if both spellings exist.
    storyBounds = sectionBounds(outputLines, STORY_ORIGIN_HEADING);
    const seen = new Set();
    const storyContent = [];
    for (let i = storyBounds.start; i < storyBounds.end; i += 1) {
      const line = outputLines[i];
      const field = parseMetadataField(line);
      const key = field?.key.toLowerCase();
      if (!field || !PROVENANCE_KEYS.has(key)) {
        storyContent.push(normalizeMetadataLine(line));
        continue;
      }
      const canonical = canonicalOriginKey(key);
      if (!field.value.trim()) {
        if (!changed.includes(canonical)) changed.push(canonical);
        continue;
      }
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      const normalized = `- **${canonical}**: ${field.value}`;
      if (normalized !== line && !changed.includes(canonical)) changed.push(canonical);
      storyContent.push(normalized);
    }
    outputLines = [
      ...outputLines.slice(0, storyBounds.start),
      ...storyContent,
      ...outputLines.slice(storyBounds.end),
    ];
  } else if (movedFields.length > 0) {
    const planBounds = sectionBounds(outputLines, PLAN_METADATA_HEADING);
    outputLines.splice(
      planBounds.heading,
      0,
      STORY_ORIGIN_HEADING.replace(/^/, '## '),
      '',
      ...movedFields,
      ''
    );
  }

  // A partially migrated body may already have Story Origin after, or
  // separated from, Plan Metadata. Converge the whole section to the canonical
  // adjacent position. Once canonical, this block is byte-for-byte inert.
  storyBounds = sectionBounds(outputLines, STORY_ORIGIN_HEADING);
  let planBounds = sectionBounds(outputLines, PLAN_METADATA_HEADING);
  if (
    storyBounds &&
    planBounds &&
    (storyBounds.heading > planBounds.heading || storyBounds.end !== planBounds.heading)
  ) {
    const storySection = outputLines.slice(storyBounds.heading, storyBounds.end);
    outputLines.splice(storyBounds.heading, storyBounds.end - storyBounds.heading);
    if (storySection.at(-1)?.trim() !== '') storySection.push('');
    planBounds = sectionBounds(outputLines, PLAN_METADATA_HEADING);
    outputLines.splice(planBounds.heading, 0, ...storySection);
  }

  let output = outputLines.join('\n');
  output = normalizeMetadataSection(output, STORY_ORIGIN_HEADING);
  output = normalizeMetadataSection(output, PLAN_METADATA_HEADING);
  if (output === src) return { status: 'skip' };

  // Preserve #488's changed-label reporting for callers and audit logs.
  const unboldPlanLabels = findUnboldPlanMetadataLabels(src).map((item) => item.label);
  for (const label of unboldPlanLabels) {
    const canonical = canonicalOriginKey(label);
    if (!changed.includes(canonical)) changed.push(canonical);
  }
  return {
    status: 'healed',
    body: output,
    changed,
  };
}

export async function listOpenIssues(deps = {}) {
  const run = deps.pexec || pexec;
  const { stdout } = await run(
    'gh',
    ['issue', 'list', '--state', 'open', '--limit', '500', '--json', 'number,title,body'],
    { maxBuffer: 50 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

const USAGE =
  'Usage: backfill-plan-metadata.mjs [--apply] [--yes] [--help]\n' +
  '  (default)   audit only, no writes\n' +
  '  --apply     split legacy provenance and normalize metadata labels on matching issues\n' +
  '  --yes       skip the blast-radius confirmation prompt on a multi-issue --apply\n' +
  '  --help, -h  print this usage and exit; never writes\n';

export async function main(argv = process.argv.slice(2), deps = {}) {
  const log = deps.log || ((s) => console.log(s));

  // #878 — refuse unknown flags before any gh call, so a typo cannot leave
  // `--apply` honored and the intended narrowing silently dropped.
  if (assertKnownArgv(argv, { flags: ['--apply', '--yes'], usage: USAGE })) {
    log(USAGE);
    return;
  }

  const list = deps.listOpenIssues || listOpenIssues;
  const mutate = deps.mutateIssueBody || mutateIssueBody;
  const err = deps.err || ((s) => console.error(s));
  const confirm = deps.confirmBlastRadius || confirmBlastRadius;
  const apply = argv.includes('--apply');
  const yes = argv.includes('--yes');
  const repo = 'kburson/ai-task-manager';
  const issues = await list(deps);

  if (apply) {
    const decision = await confirm({
      issueNumbers: issues.map((it) => it.number),
      yes,
      log,
      warn: err,
    });
    if (!decision.proceed) {
      if (deps.exit) deps.exit(2);
      else process.exitCode = 2;
      return;
    }
  }

  const summary = { skipped: 0, healed: 0, failed: 0 };
  for (const it of issues.sort((a, b) => a.number - b.number)) {
    const plan = buildPlanMetadataBackfill(it.body || '');
    if (plan.status === 'skip') {
      summary.skipped += 1;
      continue;
    }
    if (!apply) {
      summary.healed += 1;
      log(`#${it.number}  would-heal  [${plan.changed.join(', ')}]  (audit)`);
      continue;
    }
    try {
      const r = await mutate({
        issueNumber: it.number,
        repo,
        mutate: (base) => buildPlanMetadataBackfill(base).body ?? base,
      });
      summary.healed += 1;
      log(`#${it.number}  healed  ${r.status}  [${plan.changed.join(', ')}]`);
    } catch (e) {
      summary.failed += 1;
      err(`#${it.number}  FAILED  ${e.message}`);
    }
  }

  log(
    `\nopen=${issues.length}  skipped=${summary.skipped}  ` +
      `healed=${summary.healed}  failed=${summary.failed}` +
      `${apply ? '' : '  (audit — no writes; pass --apply to write)'}`
  );
}

const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err) => {
    if (reportStrictArgvError(err, { usage: USAGE })) process.exit(2);
    console.error(err);
    process.exit(1);
  });
}
