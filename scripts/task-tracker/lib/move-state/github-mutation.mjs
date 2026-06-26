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

// Resolve the project item id, write the kanban Status field, and print the
// success line. Returns `{ itemId, exit }`; `exit` is a number only when the
// host must terminate (issue absent from the project).
export async function runStatusWrite(ctx) {
  const { issueArg, stateArg, optionId, cfg, SKIP_NETWORK, gh, projectItemForIssue } = ctx;

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

  // Update the kanban board field
  if (!SKIP_NETWORK) {
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
  if (!(!SKIP_NETWORK && STAGES.includes(stateArg))) return;
  try {
    const [{ writeIssueBodyWithRetry }, { writeLastKnownState }] = await Promise.all([
      import('../state-recording.mjs'),
      import('../../gh-timing-comment.mjs'),
    ]);
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    const beforeBody = JSON.parse(stdout).body ?? '';
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
  } catch (err) {
    process.stderr.write(`[move-state] #${issueArg}: marker stamp failed: ${err.message}\n`);
  }
}
