// Plan-stage re-evaluation: reads Deep-Dive signals from the issue body,
// rebuckets Size/Estimate, mutates the project board + issue field-DB block,
// and posts an audit comment. Failures must not block the calling verb.
//
// Extracted from task-tracker.mjs so the plan→develop hook in
// verbs/approve.mjs can invoke it without dragging the whole CLI surface in.
// Deps are injectable for tests.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  projectValuesForIssue,
  writeProjectFieldValue,
  fieldOptionMap,
  projectItemForIssue,
} from '../../gh/lib/github-projects.mjs';
import { reevaluateEstimate, buildAuditCommentBody, AUDIT_HEADER } from './reevaluate-estimate.mjs';
import { parseIssueFieldDb, formatIssueFieldDb, stripIssueFieldDb } from '../issue-field-db.mjs';
import { loadProjectFieldDefs, fieldIdFor } from '../project-fields.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { mutateIssueBody } from './issue-body-mutate.mjs';
import { warnMissingFieldId } from './field-config-warn.mjs';

const pexec = promisify(execFile);

async function defaultPostComment({ issueNumber, repo, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

async function defaultHasSubIssues({ issueNumber, repo }) {
  try {
    const [owner, repoName] = repo.split('/');
    const { stdout } = await pexec(
      'gh',
      [
        'api',
        'graphql',
        '-f',
        `query=query($owner:String!,$repo:String!,$issue:Int!){repository(owner:$owner,name:$repo){issue(number:$issue){subIssues(first:1){totalCount}}}}`,
        '-F',
        `owner=${owner}`,
        '-F',
        `repo=${repoName}`,
        '-F',
        `issue=${Number(issueNumber)}`,
      ],
      { timeout: GH_API_TIMEOUT_MS }
    );
    const data = JSON.parse(stdout);
    const count = data?.data?.repository?.issue?.subIssues?.totalCount ?? 0;
    return { hasSubIssues: count > 0, count };
  } catch {
    return { hasSubIssues: false, count: 0 };
  }
}

async function defaultMutateIssueBody({ issueNumber, repo, mutate }) {
  await mutateIssueBody({ issueNumber, repo, mutate, deps: { pexec } });
}

export async function applyReevaluate({ cfg, issueNumber, body, deps = {} } = {}) {
  if (!cfg) throw new Error('applyReevaluate: cfg is required');
  if (!issueNumber) throw new Error('applyReevaluate: issueNumber is required');

  const postComment = deps.postComment || defaultPostComment;
  const mutateBody = deps.mutateIssueBody || defaultMutateIssueBody;
  const fieldDefsLoader = deps.loadProjectFieldDefs || loadProjectFieldDefs;
  const fetchProjectValues = deps.projectValuesForIssue || projectValuesForIssue;
  const fetchProjectItem = deps.projectItemForIssue || projectItemForIssue;
  const writeField = deps.writeProjectFieldValue || writeProjectFieldValue;
  const optionMapFor = deps.fieldOptionMap || fieldOptionMap;
  const hasSubIssues = deps.hasSubIssues || defaultHasSubIssues;

  const ts = new Date().toISOString();
  if (process.env.TASK_TRACKER_SKIP_REEVAL === '1') {
    try {
      await postComment({
        issueNumber,
        repo: cfg.repo,
        body: `${AUDIT_HEADER}\n\n_Bypassed via \`TASK_TRACKER_SKIP_REEVAL=1\` at ${ts}._`,
      });
    } catch {
      /* best-effort: GitHub/telemetry side effect; core flow proceeds */
    }
    return { status: 'skipped' };
  }

  const subInfo = await hasSubIssues({ issueNumber, repo: cfg.repo });
  if (subInfo.hasSubIssues) {
    try {
      await postComment({
        issueNumber,
        repo: cfg.repo,
        body: `${AUDIT_HEADER}\n\n_Skipped: epic with ${subInfo.count} sub-issue(s); Size/Estimate is the sum of children, set at Refine time._`,
      });
    } catch {
      /* best-effort: GitHub/telemetry side effect; core flow proceeds */
    }
    return { status: 'skipped-epic', subIssueCount: subInfo.count };
  }

  const fieldDefs = fieldDefsLoader();
  const dbParsed = parseIssueFieldDb(body);
  let currentSize = dbParsed.ok ? (dbParsed.values?.size ?? null) : null;
  let currentEstimate =
    dbParsed.ok && typeof dbParsed.values?.estimate === 'number' ? dbParsed.values.estimate : null;

  if ((currentSize == null || currentEstimate == null) && cfg.projectId) {
    try {
      const projVals = await fetchProjectValues({ cfg, fieldDefs, issueNumber });
      if (currentSize == null && projVals.size != null) currentSize = projVals.size;
      if (currentEstimate == null && typeof projVals.estimate === 'number')
        currentEstimate = projVals.estimate;
    } catch {
      /* best-effort: failure must not abort the primary operation */
    }
  }

  const result = reevaluateEstimate(body, { size: currentSize, estimate: currentEstimate });
  if (!result.changed) return { status: 'unchanged', result };

  const commentBody = buildAuditCommentBody(result);

  if (result.requiresHuman) {
    try {
      await postComment({ issueNumber, repo: cfg.repo, body: commentBody });
    } catch {
      /* best-effort: GitHub/telemetry side effect; core flow proceeds */
    }
    return { status: 'human-attention', result };
  }

  if (cfg.projectId) {
    try {
      const { itemId } = await fetchProjectItem({
        repo: cfg.repo,
        projectId: cfg.projectId,
        issueNumber,
      });
      if (itemId) {
        const sizeFieldId = fieldIdFor(cfg, 'size');
        const estimateFieldId = fieldIdFor(cfg, 'estimate');
        if (!estimateFieldId) {
          warnMissingFieldId({
            cfgKey: 'fieldEstimate',
            context: 're-eval estimate write skipped',
          });
        }
        if (!sizeFieldId) {
          warnMissingFieldId({ cfgKey: 'fieldSize', context: 're-eval size write skipped' });
        }
        const optionMap = sizeFieldId ? await optionMapFor(cfg.projectId) : {};
        if (estimateFieldId) {
          await writeField({
            projectId: cfg.projectId,
            itemId,
            fieldId: estimateFieldId,
            value: { number: result.estimate },
          });
        }
        if (sizeFieldId) {
          await writeField({
            projectId: cfg.projectId,
            itemId,
            fieldId: sizeFieldId,
            value: { singleSelectOptionName: result.size },
            optionMap,
          });
        }
      }
    } catch (err) {
      process.stderr.write(`⚠ re-eval: project field write failed: ${err.message}\n`);
    }
  }

  if (dbParsed.ok) {
    // #295 — re-derive the field-DB block from the FRESH base inside the
    // closure so a concurrent writer between the pre-flight fetch above and
    // this write doesn't get clobbered. The size/estimate values are
    // deterministic from `result` (computed once); only the surrounding
    // body context is re-read.
    try {
      await mutateBody({
        issueNumber,
        repo: cfg.repo,
        mutate: (base) => {
          const parsed = parseIssueFieldDb(base);
          const baseValues = parsed.ok ? parsed.values : {};
          const nextValues = { ...baseValues, size: result.size, estimate: result.estimate };
          return `${stripIssueFieldDb(base)}\n\n${formatIssueFieldDb(nextValues)}\n`;
        },
      });
    } catch (err) {
      process.stderr.write(`⚠ re-eval: body patch failed: ${err.message}\n`);
    }
  }

  try {
    await postComment({ issueNumber, repo: cfg.repo, body: commentBody });
  } catch {
    /* best-effort: GitHub/telemetry side effect; core flow proceeds */
  }

  return { status: 'applied', result };
}
