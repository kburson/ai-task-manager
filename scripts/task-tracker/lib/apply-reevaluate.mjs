// Analyze-stage re-evaluation: reads Deep-Dive signals from the issue body,
// rebuckets Size/Estimate, mutates the project board + issue field-DB block,
// and posts an audit comment. Failures must not block the calling verb.
//
// Extracted from task-tracker.mjs so the analyze→development hook in
// verbs/approve.mjs can invoke it without dragging the whole CLI surface in.
// Deps are injectable for tests.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

import { projectValuesForIssue, writeProjectFieldValue, fieldOptionMap, projectItemForIssue } from '../../gh/lib/github-projects.mjs';
import { reevaluateEstimate, buildAuditCommentBody, AUDIT_HEADER } from './reevaluate-estimate.mjs';
import { parseIssueFieldDb, formatIssueFieldDb, stripIssueFieldDb } from '../issue-field-db.mjs';
import { loadProjectFieldDefs, fieldIdFor } from '../project-fields.mjs';

const pexec = promisify(execFile);

async function defaultPostComment({ issueNumber, repo, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], { timeout: 5000 });
}

async function defaultWriteIssueBody({ issueNumber, repo, body, scratchDir }) {
  const tmpFile = path.join(scratchDir, `reeval-${issueNumber}.md`);
  writeFileSync(tmpFile, body);
  try {
    await pexec('gh', ['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', tmpFile], { timeout: 10000 });
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

export async function applyReevaluate({ cfg, issueNumber, body, scratchDir, deps = {} } = {}) {
  if (!cfg) throw new Error('applyReevaluate: cfg is required');
  if (!issueNumber) throw new Error('applyReevaluate: issueNumber is required');

  const postComment = deps.postComment || defaultPostComment;
  const writeIssueBody = deps.writeIssueBody || defaultWriteIssueBody;
  const fieldDefsLoader = deps.loadProjectFieldDefs || loadProjectFieldDefs;
  const fetchProjectValues = deps.projectValuesForIssue || projectValuesForIssue;
  const fetchProjectItem = deps.projectItemForIssue || projectItemForIssue;
  const writeField = deps.writeProjectFieldValue || writeProjectFieldValue;
  const optionMapFor = deps.fieldOptionMap || fieldOptionMap;

  const ts = new Date().toISOString();
  if (process.env.TASK_TRACKER_SKIP_REEVAL === '1') {
    try {
      await postComment({
        issueNumber,
        repo: cfg.repo,
        body: `${AUDIT_HEADER}\n\n_Bypassed via \`TASK_TRACKER_SKIP_REEVAL=1\` at ${ts}._`,
      });
    } catch {}
    return { status: 'skipped' };
  }

  const fieldDefs = fieldDefsLoader();
  const dbParsed = parseIssueFieldDb(body);
  let currentSize = dbParsed.ok ? dbParsed.values?.size ?? null : null;
  let currentEstimate = dbParsed.ok && typeof dbParsed.values?.estimate === 'number'
    ? dbParsed.values.estimate : null;

  if ((currentSize == null || currentEstimate == null) && cfg.projectId) {
    try {
      const projVals = await fetchProjectValues({ cfg, fieldDefs, issueNumber });
      if (currentSize == null && projVals.size != null) currentSize = projVals.size;
      if (currentEstimate == null && typeof projVals.estimate === 'number') currentEstimate = projVals.estimate;
    } catch {}
  }

  const result = reevaluateEstimate(body, { size: currentSize, estimate: currentEstimate });
  if (!result.changed) return { status: 'unchanged', result };

  const commentBody = buildAuditCommentBody(result);

  if (result.requiresHuman) {
    try {
      await postComment({ issueNumber, repo: cfg.repo, body: commentBody });
    } catch {}
    return { status: 'human-attention', result };
  }

  if (cfg.projectId) {
    try {
      const { itemId } = await fetchProjectItem({ repo: cfg.repo, projectId: cfg.projectId, issueNumber });
      if (itemId) {
        const sizeFieldId = fieldIdFor(cfg, 'size');
        const estimateFieldId = fieldIdFor(cfg, 'estimate');
        const optionMap = sizeFieldId ? await optionMapFor(cfg.projectId) : {};
        if (estimateFieldId) {
          await writeField({
            projectId: cfg.projectId, itemId, fieldId: estimateFieldId,
            value: { number: result.estimate },
          });
        }
        if (sizeFieldId) {
          await writeField({
            projectId: cfg.projectId, itemId, fieldId: sizeFieldId,
            value: { singleSelectOptionName: result.size }, optionMap,
          });
        }
      }
    } catch (err) {
      process.stderr.write(`⚠ re-eval: project field write failed: ${err.message}\n`);
    }
  }

  if (dbParsed.ok) {
    const nextValues = { ...dbParsed.values, size: result.size, estimate: result.estimate };
    const nextBody = `${stripIssueFieldDb(body)}\n\n${formatIssueFieldDb(nextValues)}\n`;
    try {
      await writeIssueBody({ issueNumber, repo: cfg.repo, body: nextBody, scratchDir });
    } catch (err) {
      process.stderr.write(`⚠ re-eval: body patch failed: ${err.message}\n`);
    }
  }

  try {
    await postComment({ issueNumber, repo: cfg.repo, body: commentBody });
  } catch {}

  return { status: 'applied', result };
}
