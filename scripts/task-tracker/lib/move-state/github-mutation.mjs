// INTERNAL — library module for the state-movement boundary (#559).
//
// GitHub-mutation concern extracted from `scripts/gh/move-state.mjs`: the two
// writes that actually change GitHub state for a transition —
//   1. `runStatusWrite`  — resolve the project item id, edit the kanban
//      single-select field, print the success line.
//   2. `stampEntryMarkers` — stamp `aitm-entered-<stage>` + `last-known-state`
//      body markers in a single body update (#170), and post the visit-numbered
//      re-entry audit comment when a stage is re-entered (#184).
//
// `runStatusWrite` returns `{ itemId, exit }`. A non-null `exit` means the host
// must `process.exit(exit)` (the "issue not found in project" path keeps exit
// code 1 in the host). The resolved `itemId` is threaded back into `ctx` so the
// later event-field sync can reuse it.
//
// Runtime values, `cfg`, and the I/O primitives arrive via the shared `ctx`;
// stateless helpers + node builtins are imported directly here.

import {
  stampEntryMarker,
  getStageVisitCount,
  postReentryAuditComment,
  STAGES,
} from '../stage-entry-markers.mjs';
import { getProjectDir, projectTmpDir } from '../../paths.mjs';
import { GH_API_TIMEOUT_MS } from '../process-timeouts.mjs';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

// #711 — how many times the write+read-back cycle is attempted before
// runStatusWrite gives up and fails loudly, and the base backoff between them.
export const STATUS_WRITE_MAX_ATTEMPTS = 3;
export const STATUS_WRITE_BACKOFF_MS = 400;
// Exit code returned to the host when the board field never confirms. Distinct
// from the "issue absent from project" exit 1 so the failure mode is greppable.
export const STATUS_WRITE_READBACK_EXIT = 7;
// #741 — exit code when the success-path post-condition (authoritative
// `aitm-last-known-state` marker == the just-confirmed board stage) does NOT
// hold. Distinct from 7 so a re-opened board/marker gap is greppable.
export const STATUS_MARKER_CONSISTENCY_EXIT = 8;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// #711 — default read-back: query the item's live Status single-select
// `optionId` for the configured project. Mirrors `resolveLiveStateName` in the
// host (`scripts/gh/move-state.mjs`) but returns the raw option id so the
// comparison in `runStatusWrite` is exact (option id, not display name).
// Returns '' when the value is absent/unreadable; never throws.
async function defaultReadBackStatusOptionId({ cfg, issueNumber }) {
  try {
    const { gql, splitRepo } = await import('../../../gh/lib/github-projects.mjs');
    const { owner, repoName } = splitRepo(cfg.repo);
    const data = await gql(
      `
      query($owner: String!, $repo: String!, $issue: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issue) {
            projectItems(first: 10) {
              nodes {
                project { id }
                fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue { optionId }
                }
              }
            }
          }
        }
      }`,
      { owner, repo: repoName, issue: Number(issueNumber) }
    );
    const nodes = data?.repository?.issue?.projectItems?.nodes || [];
    const node = nodes.find((n) => n?.project?.id === cfg.projectId);
    return String(node?.fieldValueByName?.optionId || '');
  } catch {
    return '';
  }
}

// Resolve the project item id, write the kanban Status field, and print the
// success line. Returns `{ itemId, exit }`; `exit` is a number only when the
// host must terminate — the issue is absent from the project (exit 1), or the
// board field never confirmed the write after read-back + retries (exit 7,
// #711). A non-null `exit` gates the host BEFORE `stampEntryMarkers`, so the
// entry marker never advances on a silently-dropped board-field write.
export async function runStatusWrite(ctx) {
  const { issueArg, stateArg, optionId, cfg, SKIP_NETWORK, gh, projectItemForIssue } = ctx;
  const readBackStatusOptionId = ctx.readBackStatusOptionId || defaultReadBackStatusOptionId;

  // Resolve project item ID
  let itemId = ctx.itemIdOverride;
  if (!itemId && !SKIP_NETWORK) {
    const result = await projectItemForIssue({
      repo: cfg.repo,
      projectId: cfg.projectId,
      issueNumber: issueArg,
    });
    itemId = result.itemId;
    if (!itemId) {
      process.stderr.write(
        `Issue #${issueArg} not found in project (repo: ${cfg.repo}, projectId: ${cfg.projectId})\n`
      );
      return { itemId: '', exit: 1 };
    }
  }

  // #711 — write the kanban board field, then READ IT BACK and confirm it
  // reached the target option. A dropped/failed GraphQL field write that does
  // not surface as a non-zero `gh` exit would otherwise leave the board behind
  // while the marker advances.
  //
  // Two distinct read-back outcomes, deliberately handled differently:
  //   • NON-EMPTY mismatch — the board holds a concrete DIFFERENT option than we
  //     wrote. That is positive evidence of a dropped/stale write (the exact
  //     #711 signature: board lagged at a prior stage while the marker moved on).
  //     Retry with bounded backoff to absorb eventual-consistency lag; if it
  //     still mismatches after the final attempt, FAIL LOUDLY (non-null exit) so
  //     the host halts before the marker is stamped.
  //   • EMPTY / unreadable — the read path itself is unavailable (offline, a
  //     shimmed `gh` in tests, or an item with no Status set yet). An unreadable
  //     read is NOT proof the write landed, so we do NOT soft-proceed (#747):
  //     an optimistic proceed here was the plausible cause of the #737
  //     split-brain that recurred after #711 shipped. Instead we RETRY across
  //     the whole budget so a transiently-degraded read path can still recover
  //     and confirm, and only if it never confirms do we fail closed — never
  //     stamping the marker or the timing row on an unverified move. The
  //     absolute invariant ("on verification failure the marker/timing are NOT
  //     stamped") holds for the empty case exactly as for a concrete mismatch.
  if (!SKIP_NETWORK) {
    let confirmed = false;
    let lastSeen = '';
    for (let attempt = 1; attempt <= STATUS_WRITE_MAX_ATTEMPTS; attempt++) {
      await gh([
        'project',
        'item-edit',
        '--project-id',
        cfg.projectId,
        '--id',
        itemId,
        '--field-id',
        cfg.kanbanFieldId,
        '--single-select-option-id',
        optionId,
      ]);
      lastSeen = await readBackStatusOptionId({ cfg, issueNumber: issueArg });
      if (lastSeen === optionId) {
        confirmed = true;
        break;
      }
      if (attempt < STATUS_WRITE_MAX_ATTEMPTS) await sleep(STATUS_WRITE_BACKOFF_MS * attempt);
    }
    if (!confirmed) {
      // Distinguish the two unconfirmed shapes in the message only — both fail
      // closed. A concrete DIFFERENT option is positive evidence of a
      // dropped/stale write; an empty read means the read path stayed
      // unavailable across every attempt and we could not verify the write.
      const readState = lastSeen
        ? `read-back Status optionId is "${lastSeen}", expected "${optionId}"`
        : `read-back returned no Status value across every attempt (read path unavailable) — the write could not be verified`;
      process.stderr.write(
        `⛔ Board field write for #${issueArg} → ${stateArg} did NOT confirm after ` +
          `${STATUS_WRITE_MAX_ATTEMPTS} attempts: ${readState}. Refusing to stamp the ` +
          `entry marker so the board and the marker cannot diverge. The move did NOT ` +
          `complete — retry, or reconcile the board before retrying.\n`
      );
      return { itemId, exit: STATUS_WRITE_READBACK_EXIT };
    }
  }

  console.log(`✓ Issue #${issueArg} moved to: ${stateArg}`);

  return { itemId, exit: null };
}

// Centralized stage-entry + recorded-state marker stamping. Every successful
// Status write stamps `<!-- aitm-entered-<stage>: <ts> -->` AND updates
// `<!-- aitm-last-known-state -->` in the issue body. Both markers are
// written in a single body update so drift detection cannot fire phantom
// `external-mutation` rows on legitimate non-promote transitions
// (#170). This is the single source of truth for the audit-trail chain —
// verbs must NOT stamp these markers themselves. Failures surface via
// `writeIssueBodyWithRetry`'s audit-comment path (#168).
export async function stampEntryMarkers(ctx) {
  const { issueArg, stateArg, cfg, SKIP_NETWORK, gh, pexec } = ctx;
  if (!(!SKIP_NETWORK && STAGES.includes(stateArg))) return { priorState: undefined };
  try {
    const [{ writeIssueBodyWithRetry }, { writeLastKnownState, readLastKnownState }] =
      await Promise.all([import('../state-recording.mjs'), import('../../gh-timing-comment.mjs')]);
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    const beforeBody = JSON.parse(stdout).body ?? '';
    // #741 — the stage the authoritative `aitm-last-known-state` marker points at
    // BEFORE this stamp advances it. Returned to the saga so a subsequent failed
    // board write can compensate by rolling the marker back to this value,
    // keeping marker == board instead of leaving marker-ahead-of-board drift.
    const priorState = readLastKnownState(beforeBody).state;
    const stampTs = new Date().toISOString();
    const priorVisitCount = getStageVisitCount(beforeBody, stateArg);
    let nextBody = stampEntryMarker(beforeBody, stateArg, stampTs);
    nextBody = writeLastKnownState(nextBody, stateArg);
    // Visit number this stamp produced. If stampEntryMarker treated the call
    // as a no-op (same ts re-stamp), the count is unchanged and we should
    // not post an audit comment.
    const nextVisitCount = getStageVisitCount(nextBody, stateArg);
    if (nextBody !== beforeBody) {
      const tmp = path.join(
        projectTmpDir(getProjectDir()),
        `aitm-entry-${issueArg}-${Date.now()}.md`
      );
      await writeIssueBodyWithRetry({
        issueNumber: issueArg,
        repo: cfg.repo,
        body: nextBody,
        bodyBefore: beforeBody,
        target: stateArg,
        writeIssueBody: async ({ body }) => {
          try {
            writeFileSync(tmp, body, 'utf8');
            await gh(['issue', 'edit', issueArg, '-R', cfg.repo, '--body-file', tmp]);
          } finally {
            try {
              unlinkSync(tmp);
            } catch {
              /* best-effort */
            }
          }
        },
      });
    }
    // #184 — When the body stamp produced a visit-numbered re-entry marker
    // (visit >= 2), post a backfill audit comment so the body change is
    // observable in the issue timeline. Idempotent on the (stage, visit)
    // tuple; failure does not undo the body stamp (degrades to stderr).
    if (nextVisitCount >= 2 && nextVisitCount > priorVisitCount) {
      await postReentryAuditComment({
        issueNumber: issueArg,
        repo: cfg.repo,
        stage: stateArg,
        visit: nextVisitCount,
        ts: stampTs,
      });
    }
    return { priorState };
  } catch (err) {
    // #544 — a stamp failure here is non-atomic with the already-committed
    // board move (runStatusWrite ran first): the board now shows `stateArg`
    // with no `aitm-entered-<stage>` marker, a silent contiguity hole that can
    // later block a forward promotion with no recovery trail. Surface it as a
    // DURABLE audit comment (not just stderr) naming the one-command recovery,
    // so every such hole is observable in the timeline and recoverable.
    process.stderr.write(`[move-state] #${issueArg}: marker stamp failed: ${err.message}\n`);
    await postStampFailureAudit({
      issueNumber: issueArg,
      repo: cfg.repo,
      stage: stateArg,
      error: err.message,
      postComment:
        ctx.postComment ||
        (async ({ issueNumber, repo, body }) => {
          await gh(['issue', 'comment', String(issueNumber), '-R', repo, '--body', body]);
        }),
    });
  }
}

// #544 — body for the durable stamp-failure audit comment. Pure + exported so
// the failure path is unit-testable without a live gh round-trip.
export function buildStampFailureCommentBody({ issueNumber, stage, error }) {
  return [
    `### ⚠ Entry-marker stamp FAILED — \`${stage}\``,
    '',
    `The board move for #${issueNumber} into \`${stage}\` succeeded, but writing the ` +
      `\`aitm-entered-${stage}\` body marker FAILED:`,
    '',
    '```',
    String(error || 'unknown error'),
    '```',
    '',
    'The board now shows this stage with no recorded entry marker. That is a ' +
      'contiguity hole — a later forward promotion can refuse with a missing ' +
      'prior-stage marker. Recover with:',
    '',
    '```',
    `npx aitm reconcile backfill #${issueNumber}`,
    '```',
    '',
    `<!-- aitm-stamp-failure stage="${stage}" -->`,
  ].join('\n');
}

// #544 — post the stamp-failure audit comment. Never throws: a failed audit
// post degrades to stderr, mirroring the rest of the best-effort stamp path.
export async function postStampFailureAudit({ issueNumber, repo, stage, error, postComment } = {}) {
  const body = buildStampFailureCommentBody({ issueNumber, stage, error });
  try {
    await postComment({ issueNumber, repo, body });
    return { mode: 'posted' };
  } catch (postErr) {
    process.stderr.write(
      `[move-state] #${issueNumber}: stamp-failure audit comment post FAILED: ${postErr.message}\n`
    );
    return { mode: 'error', error: postErr.message };
  }
}

// #741 — compensating rollback of the authoritative `aitm-last-known-state`
// marker. `stampEntryMarkers` advances the marker to the target stage BEFORE the
// board Status write; when that board write fails/does-not-confirm (#711 returns
// a non-null exit), the marker would be left ahead of the board. This restores
// the marker to `priorState` (the stage the board is still confirmed at) so the
// failure leaves marker == board — loud (the non-zero exit is preserved by the
// caller) AND consistent. Idempotent: a no-op when the marker already reads
// `priorState`. The additive `aitm-entered-<stage>` contiguity marker is left
// untouched (it is not the authoritative pointer and a re-run reconciles it).
export async function rollbackRecordedState(ctx, priorState) {
  const { issueArg, cfg, gh, pexec } = ctx;
  if (priorState == null) return { rolledBack: false, reason: 'no-prior-state' };
  const [{ writeIssueBodyWithRetry }, { writeLastKnownState, readLastKnownState }] =
    await Promise.all([import('../state-recording.mjs'), import('../../gh-timing-comment.mjs')]);
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  const beforeBody = JSON.parse(stdout).body ?? '';
  if (readLastKnownState(beforeBody).state === priorState) {
    return { rolledBack: false, reason: 'already-consistent', priorState };
  }
  const nextBody = writeLastKnownState(beforeBody, priorState);
  const tmp = path.join(
    projectTmpDir(getProjectDir()),
    `aitm-rollback-${issueArg}-${Date.now()}.md`
  );
  await writeIssueBodyWithRetry({
    issueNumber: issueArg,
    repo: cfg.repo,
    body: nextBody,
    bodyBefore: beforeBody,
    target: priorState,
    writeIssueBody: async ({ body }) => {
      try {
        writeFileSync(tmp, body, 'utf8');
        await gh(['issue', 'edit', issueArg, '-R', cfg.repo, '--body-file', tmp]);
      } finally {
        try {
          unlinkSync(tmp);
        } catch {
          /* best-effort */
        }
      }
    },
  });
  return { rolledBack: true, priorState };
}

// #741 — success-path post-condition: after the board write is confirmed at
// `expectedStage` (#711 read-back) and the sentinel verifies, the authoritative
// `aitm-last-known-state` marker MUST also read `expectedStage`. On the happy
// path this always holds (stampEntryMarkers set it); a mismatch means a
// regression re-opened the board/marker gap and is surfaced (non-zero exit),
// never swallowed. Returns `{ consistent, recorded, expected, exit }`.
export async function assertBoardMarkerConsistent(ctx, expectedStage) {
  const { issueArg, cfg, pexec } = ctx;
  const { readLastKnownState } = await import('../../gh-timing-comment.mjs');
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  const body = JSON.parse(stdout).body ?? '';
  const recorded = readLastKnownState(body).state;
  const consistent = recorded === expectedStage;
  return {
    consistent,
    recorded,
    expected: expectedStage,
    exit: consistent ? null : STATUS_MARKER_CONSISTENCY_EXIT,
  };
}
