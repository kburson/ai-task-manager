#!/usr/bin/env node
import { enforceDirectGuidance } from '../task-tracker/lib/direct-guidance-admission.mjs';
enforceDirectGuidance(import.meta.url, 'log-issue-time');
// Read an issue's ⏱ Timing Log comment, compute totals, and write them to GitHub Projects V2.
//
// Engaged / Session = sum of all Active Min rows until richer Codex
// engagement metrics are available.
//
// Usage: node log-issue-time.mjs <issue#> [--dry-run]

import { pathToFileURL } from 'node:url';

import { loadConfig } from '../task-tracker/config.mjs';
import { ensureIssueFieldDb } from '../task-tracker/issue-field-db.mjs';
import { mutateIssueBody } from '../task-tracker/lib/issue-body-mutate.mjs';
import { withRetry } from './lib/with-retry.mjs';
import {
  buildFieldSyncPlan,
  fieldIdFor,
  loadProjectFieldDefs,
} from '../task-tracker/project-fields.mjs';
import {
  computeStageDurations,
  humanizeSec,
  parseTimingRows,
  rollupTotals,
  upsertStageRollupMarker,
} from '../task-tracker/timing-rollup.mjs';
import {
  firstStartTimestamp,
  readCanonicalTimingSource,
} from '../task-tracker/gh-timing-comment.mjs';
import { gh, gql, splitRepo, writeProjectFieldValue } from './lib/github-projects.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

export const DURATION_FIELD_LABELS = {
  engagedTime: 'Engaged',
  sessionTime: 'Session',
  reviewTime: 'Review',
  planTime: 'Plan',
};

const DURATION_FIELD_ALIASES = {
  engagedTime: ['Engaged Time', 'Actual Hours'],
  sessionTime: ['Session Time', 'Actual Session Time'],
  reviewTime: ['Review Time'],
  planTime: ['Plan Time'],
};

export function durationFieldLookupNames(key) {
  const label = DURATION_FIELD_LABELS[key];
  if (!label) return [];
  return [label, ...(DURATION_FIELD_ALIASES[key] || [])];
}

export function formatRollupSummaryLines({
  engagedMin,
  totalActiveMin,
  reviewMin,
  planMin,
  thresholdMin,
  knownEngagedSec,
  telemetry,
} = {}) {
  if ([engagedMin, totalActiveMin, reviewMin, planMin].some((value) => value === null)) {
    return [
      ...Object.entries({
        Engaged: engagedMin,
        Session: totalActiveMin,
        Review: reviewMin,
        Plan: planMin,
      }).map(
        ([label, value]) => '  ' + label + ': ' + (value === null ? 'Unknown' : value + ' min')
      ),
      ...(Number.isFinite(knownEngagedSec)
        ? ['  Known engagement lower bound: ' + knownEngagedSec + ' seconds']
        : []),
      ...(telemetry?.reasons?.length ? ['  Unavailable: ' + telemetry.reasons.join(', ')] : []),
    ];
  }
  return [
    `  ${DURATION_FIELD_LABELS.engagedTime.padEnd(19)}: ${engagedMin} min  (active ${totalActiveMin} + review ${reviewMin})`,
    `  ${DURATION_FIELD_LABELS.sessionTime.padEnd(19)}: ${totalActiveMin} min`,
    `  ${DURATION_FIELD_LABELS.reviewTime.padEnd(19)}: ${reviewMin} min  (threshold ${thresholdMin} min)`,
    `  ${DURATION_FIELD_LABELS.planTime.padEnd(19)}: ${planMin} min`,
  ];
}

let issueNumber = '';
export function timingFieldProjection(rollup) {
  const values = {
    engagedTime: rollup.engagedMin,
    sessionTime: rollup.totalActiveMin,
    reviewTime: rollup.reviewMin,
    planTime: rollup.planMin,
  };
  const secondsByKey = {
    engagedTime: rollup.engagedSec,
    sessionTime: rollup.totalActiveSec,
    reviewTime: rollup.reviewSec,
    planTime: rollup.planMin === null ? null : rollup.planMin * 60,
  };
  for (const value of Object.values(values)) {
    if (value !== null && (!Number.isFinite(value) || value < 0))
      throw new TypeError('timing-field-projection:invalid');
  }
  if (rollup.telemetry?.reasons?.includes('invalid-actor-evidence'))
    throw new TypeError('timing-field-projection:invalid-evidence');
  return {
    schema: 'aitm.timing-field-result/v1',
    status: rollup.telemetry?.status ?? 'complete',
    reasons: rollup.telemetry?.reasons ?? [],
    knownEngagedSec: rollup.knownEngagedSec ?? rollup.engagedSec,
    values,
    secondsByKey,
    unknownFields: Object.keys(values).filter((key) => values[key] === null),
  };
}

let dryRun = false;
export async function publishTimingBoardFields({
  cfg,
  itemId,
  fieldDefs,
  values,
  projection,
  resolvedFieldIds = {},
  write = writeProjectFieldValue,
}) {
  const effectiveCfg = { ...cfg, fieldIds: { ...resolvedFieldIds, ...cfg.fieldIds } };
  const unknownIds = new Set(
    projection.unknownFields.map((key) => fieldIdFor(effectiveCfg, key)).filter(Boolean)
  );
  const plan = buildFieldSyncPlan({
    cfg: effectiveCfg,
    fieldDefs,
    values,
    secondsByKey: projection.secondsByKey,
  });
  for (const item of plan) {
    if (unknownIds.has(item.fieldId)) continue;
    await write({ projectId: cfg.projectId, itemId, fieldId: item.fieldId, value: item.value });
  }
  for (const fieldId of unknownIds) {
    await write({
      projectId: cfg.projectId,
      itemId,
      fieldId,
      value: { text: 'Unknown (canonical timing evidence incomplete)' },
    });
  }
}

let cfg = null;
let owner = '';
let repoName = '';

async function fetchIssueBody() {
  const out = await gh(['issue', 'view', issueNumber, '-R', cfg.repo, '--json', 'body']);
  return JSON.parse(out).body ?? '';
}

// ---- GitHub queries ----

async function fetchTimingComment() {
  const result = await readCanonicalTimingSource({ issueNumber, repo: cfg.repo });
  if (result.status === 'error')
    throw new Error('log-issue-time: canonical timing source unavailable');
  return result.status === 'found' ? { body: result.source.body, source: result.source } : null;
}

async function fetchProjectMeta() {
  const data = await gql(
    `
    query($owner: String!, $repo: String!, $issue: Int!, $project: ID!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          projectItems(first: 5) {
            nodes { id project { id } }
          }
        }
      }
      node(id: $project) {
        ... on ProjectV2 {
          fields(first: 50) {
            nodes {
              ... on ProjectV2FieldCommon { id name }
            }
          }
        }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber), project: cfg.projectId }
  );

  const projectItems = data.repository.issue.projectItems.nodes;
  const itemNode = projectItems.find((n) => n.project?.id === cfg.projectId) ?? projectItems[0];
  if (!itemNode) throw new Error(`Issue #${issueNumber} is not on project ${cfg.projectId}`);

  const fields = data.node.fields.nodes;
  const fieldByName = (...names) => fields.find((f) => names.includes(f.name));

  const engagedField = cfg.fieldEngagedTime
    ? { id: cfg.fieldEngagedTime }
    : fieldByName(...durationFieldLookupNames('engagedTime'));
  const sessionField = cfg.fieldSessionTime
    ? { id: cfg.fieldSessionTime }
    : fieldByName(...durationFieldLookupNames('sessionTime'));
  const reviewField = fieldIdFor(cfg, 'reviewTime')
    ? { id: fieldIdFor(cfg, 'reviewTime') }
    : fieldByName(...durationFieldLookupNames('reviewTime'));
  const planField = fieldIdFor(cfg, 'planTime')
    ? { id: fieldIdFor(cfg, 'planTime') }
    : fieldByName(...durationFieldLookupNames('planTime'));
  const startTimeField = cfg.fieldStartTime
    ? { id: cfg.fieldStartTime }
    : fieldByName('Start time');
  if (!sessionField)
    throw new Error(`Field "${DURATION_FIELD_LABELS.sessionTime}" not found on project`);

  return {
    itemId: itemNode.id,
    engagedFieldId: engagedField?.id || '',
    sessionFieldId: sessionField.id,
    reviewFieldId: reviewField?.id || '',
    planFieldId: planField?.id || '',
    startTimeFieldId: startTimeField?.id || '',
  };
}

// ---- Main ----

export async function main(argv = process.argv.slice(2)) {
  if (wantsHelp(argv)) {
    emitSelfDoc('log-issue-time');
    return 0;
  }
  const issueArg = argv.find((a) => /^#?\d+$/.test(a));
  dryRun = argv.includes('--dry-run');

  if (!issueArg) {
    console.error('Usage: node log-issue-time.mjs <issue#> [--dry-run]');
    return 1;
  }

  issueNumber = issueArg.replace('#', '');
  cfg = loadConfig();

  if (!cfg.repo) {
    console.error('repo not configured. Run: /task config repo owner/repo');
    return 1;
  }
  if (!cfg.projectId) {
    console.error('projectId not configured. Run: npx ai-task-manager init');
    return 1;
  }

  ({ owner, repoName } = splitRepo(cfg.repo));

  const comment = await fetchTimingComment();
  if (!comment) {
    // Not an error condition: an issue with no timing rows is a legitimate
    // state (e.g. test fixtures, issues closed without engaged work). Exit
    // cleanly so the fail-loud guard in runtime.mjs only fires on real
    // failures. The close-path body-marker assertion (#180) will catch the
    // resulting null engagedTime at the appropriate layer.
    console.error(`No ⏱ Timing Log comment found on issue #${issueNumber}`);
    return 0;
  }

  const rows = parseTimingRows(comment.body);
  const issueBodyForPauses = await fetchIssueBody();
  const thresholdMin = Number(cfg.reviewPauseThresholdMin) || 5;
  // EPIC #823 timing model v2 (C3): active/idle totals are recomputed from phase
  // spans by passing the raw timing-comment body to rollupTotals. The old
  // `applyPauseSpansToRows` per-row pause subtraction is retired here — it
  // double-subtracted brackets already netted inside each `<phase>:completed`
  // row's span. `reviewMin`/`planMin` are timestamp-delta derived from the rows.
  const rollup = rollupTotals(rows, thresholdMin, comment.body);
  const { rowCount, totalActiveMin, reviewMin, planMin, engagedMin, knownEngagedSec, telemetry } =
    rollup;
  const fieldProjection = timingFieldProjection(rollup);

  if (rowCount === 0) {
    console.error('Timing comment found but contains no data rows');
    return 1;
  }

  console.log(`Issue #${issueNumber}: ${rowCount} timing rows`);
  for (const line of formatRollupSummaryLines({
    engagedMin,
    totalActiveMin,
    reviewMin,
    planMin,
    thresholdMin,
    knownEngagedSec,
    telemetry,
  })) {
    console.log(line);
  }

  const stageRollup = computeStageDurations(issueBodyForPauses);
  if (stageRollup.visits.length) {
    console.log('  Stage Time (per visit):');
    for (const v of stageRollup.visits) {
      const closed = v.endMs != null ? humanizeSec(v.durationSec) : 'open';
      console.log(`    ${v.stage}#${v.visit}: ${closed}`);
    }
    console.log('  Stage Time (totals):');
    for (const [stage, sec] of Object.entries(stageRollup.perStageSec)) {
      if (sec > 0) console.log(`    ${stage}: ${humanizeSec(sec)}`);
    }
  }

  if (dryRun) {
    const startTimestamp = firstStartTimestamp(comment.body);
    if (startTimestamp) console.log(`  Start Time (from log): ${startTimestamp}`);
    console.log('Dry run — no writes performed.');
    return 0;
  }

  const projectMeta = await fetchProjectMeta();
  const { itemId, startTimeFieldId } = projectMeta;
  const fieldDefs = loadProjectFieldDefs();
  const issueBody = issueBodyForPauses;

  // Repair startTime: if missing from the issue field DB, derive from earliest timing row.
  const existingValues = ensureIssueFieldDb(issueBody, fieldDefs).values;
  const repairedStartTime =
    !existingValues.startTime && startTimeFieldId
      ? (firstStartTimestamp(comment.body) ?? null)
      : null;

  // Authoritative timing rollup — these keys MUST overwrite stale body-marker values.
  // Without override, the persisted DB wins (see ensureIssueFieldDb), so a board write
  // succeeds but the `<!-- aitm-fields -->` cache stays null. That is the #180 bug.
  const overrideKeys = ['engagedTime', 'sessionTime', 'reviewTime', 'planTime'];
  if (repairedStartTime) overrideKeys.push('startTime');
  const writeUpdates = {
    ...fieldProjection.values,
    ...(repairedStartTime ? { startTime: repairedStartTime } : {}),
  };

  // `values` feeds the board-field sync below. Derived once from the body we
  // already fetched; the override keys force the authoritative timing values
  // (see #180), so this is stable regardless of any concurrent body edit.
  const values = ensureIssueFieldDb(issueBody, fieldDefs, writeUpdates, { overrideKeys }).values;

  // Body write goes through mutateIssueBody — fetch-and-write in one
  // transaction, marker-invariant safe (#361/#409) — wrapped in bounded
  // retry/backoff so a transient gh failure neither aborts the flush nor
  // tears the body. The `mutate` recomputes the transform against the FRESH
  // base mutateIssueBody fetches, not the earlier read. The timing data lives
  // in the ⏱ comment (read-only here), so an exhausted retry rethrows loudly
  // without dropping a row or corrupting the body.
  await withRetry(() =>
    mutateIssueBody({
      issueNumber: Number(issueNumber),
      repo: cfg.repo,
      mutate: (base) => {
        let next = ensureIssueFieldDb(base, fieldDefs, writeUpdates, { overrideKeys }).body;
        if (stageRollup.visits.length) next = upsertStageRollupMarker(next, stageRollup);
        return next;
      },
    })
  );

  // #399 — board writes carry fixed-width duration strings at second
  // precision. The body marker (`values`) stays in minutes; `secondsByKey`
  // feeds the true seconds totals so `buildFieldSyncPlan` formats the four
  // timing Text fields via `formatDuration`. This is the sole board-write path.
  await publishTimingBoardFields({
    cfg,
    itemId,
    fieldDefs,
    values,
    projection: fieldProjection,
    resolvedFieldIds: {
      engagedTime: projectMeta.engagedFieldId,
      sessionTime: projectMeta.sessionFieldId,
      reviewTime: projectMeta.reviewFieldId,
      planTime: projectMeta.planFieldId,
    },
  });
  console.log(
    'AITM_TIMING_RESULT ' +
      JSON.stringify({
        ...fieldProjection,
        issue: Number(issueNumber),
        repository: cfg.repo,
        sourceCommentId: comment.source.commentNodeId,
      })
  );

  if (repairedStartTime && startTimeFieldId) {
    await writeProjectFieldValue({
      projectId: cfg.projectId,
      itemId,
      fieldId: startTimeFieldId,
      value: { text: repairedStartTime },
    });
    console.log(`  Start Time (repaired): ${repairedStartTime}`);
  }

  console.log('Fields updated on GitHub Projects board.');
  return 0;
}

function isCliEntry() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isCliEntry()) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(`log-issue-time: ${err.message}`);
      process.exitCode = 1;
    });
}
