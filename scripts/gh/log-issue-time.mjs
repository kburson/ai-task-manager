#!/usr/bin/env node
// Read an issue's ⏱ Timing Log comment, compute totals, and write them to GitHub Projects V2.
//
// Engaged Time / Session Time = sum of all Active Min rows until richer Codex
// engagement metrics are available.
//
// Usage: node log-issue-time.mjs <issue#> [--dry-run]

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
import { firstStartTimestamp } from '../task-tracker/gh-timing-comment.mjs';
import { gh, gql, splitRepo, writeProjectFieldValue } from './lib/github-projects.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

const args = process.argv.slice(2);
if (wantsHelp(args)) {
  emitSelfDoc('log-issue-time');
  process.exit(0);
}
const issueArg = args.find((a) => /^#?\d+$/.test(a));
const dryRun = args.includes('--dry-run');

if (!issueArg) {
  console.error('Usage: node log-issue-time.mjs <issue#> [--dry-run]');
  process.exit(1);
}

const issueNumber = issueArg.replace('#', '');
const cfg = loadConfig();

if (!cfg.repo) {
  console.error('repo not configured. Run: /task config repo owner/repo');
  process.exit(1);
}
if (!cfg.projectId) {
  console.error('projectId not configured. Run: npx ai-task-manager init');
  process.exit(1);
}

const { owner, repoName } = splitRepo(cfg.repo);

async function fetchIssueBody() {
  const out = await gh(['issue', 'view', issueNumber, '-R', cfg.repo, '--json', 'body']);
  return JSON.parse(out).body ?? '';
}

// ---- GitHub queries ----

async function fetchTimingComment() {
  const out = await gh(['issue', 'view', issueNumber, '-R', cfg.repo, '--json', 'comments']);
  const { comments } = JSON.parse(out);
  return comments.find((c) => c.body.includes('⏱ Timing Log')) ?? null;
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
    : fieldByName('Engaged Time', 'Actual Hours');
  const sessionField = cfg.fieldSessionTime
    ? { id: cfg.fieldSessionTime }
    : fieldByName('Session Time', 'Actual Session Time');
  const reviewField = fieldIdFor(cfg, 'reviewTime')
    ? { id: fieldIdFor(cfg, 'reviewTime') }
    : fieldByName('Review Time');
  const planField = fieldIdFor(cfg, 'planTime')
    ? { id: fieldIdFor(cfg, 'planTime') }
    : fieldByName('Plan Time');
  const startTimeField = cfg.fieldStartTime
    ? { id: cfg.fieldStartTime }
    : fieldByName('Start time');
  if (!sessionField) throw new Error('Field "Session Time" not found on project');

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

(async () => {
  const comment = await fetchTimingComment();
  if (!comment) {
    // Not an error condition: an issue with no timing rows is a legitimate
    // state (e.g. test fixtures, issues closed without engaged work). Exit
    // cleanly so the fail-loud guard in runtime.mjs only fires on real
    // failures. The close-path body-marker assertion (#180) will catch the
    // resulting null engagedTime at the appropriate layer.
    console.error(`No ⏱ Timing Log comment found on issue #${issueNumber}`);
    process.exit(0);
  }

  const rows = parseTimingRows(comment.body);
  const issueBodyForPauses = await fetchIssueBody();
  const thresholdMin = Number(cfg.reviewPauseThresholdMin) || 5;
  // EPIC #823 timing model v2 (C3): active/idle totals are recomputed from phase
  // spans by passing the raw timing-comment body to rollupTotals. The old
  // `applyPauseSpansToRows` per-row pause subtraction is retired here — it
  // double-subtracted brackets already netted inside each `<phase>:completed`
  // row's span. `reviewMin`/`planMin` are timestamp-delta derived from the rows.
  const {
    rowCount,
    totalActiveMin,
    totalActiveSec,
    reviewMin,
    reviewSec,
    planMin,
    engagedMin,
    engagedSec,
  } = rollupTotals(rows, thresholdMin, comment.body);

  if (rowCount === 0) {
    console.error('Timing comment found but contains no data rows');
    process.exit(1);
  }

  console.log(`Issue #${issueNumber}: ${rowCount} timing rows`);
  console.log(
    `  Engaged Time        : ${engagedMin} min  (active ${totalActiveMin} + review ${reviewMin})`
  );
  console.log(`  Session Time        : ${totalActiveMin} min`);
  console.log(`  Review Time         : ${reviewMin} min  (threshold ${thresholdMin} min)`);
  console.log(`  Plan Time           : ${planMin} min`);

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
    process.exit(0);
  }

  const { itemId, startTimeFieldId } = await fetchProjectMeta();
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
    engagedTime: engagedMin,
    sessionTime: totalActiveMin,
    reviewTime: reviewMin,
    planTime: planMin,
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
  const secondsByKey = {
    engagedTime: engagedSec,
    sessionTime: totalActiveSec,
    reviewTime: reviewSec,
    planTime: planMin * 60,
  };
  const syncPlan = buildFieldSyncPlan({ cfg, fieldDefs, values, secondsByKey });
  for (const item of syncPlan) {
    await writeProjectFieldValue({
      projectId: cfg.projectId,
      itemId,
      fieldId: item.fieldId,
      value: item.value,
    });
  }

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
})().catch((err) => {
  console.error(`log-issue-time: ${err.message}`);
  process.exit(1);
});
