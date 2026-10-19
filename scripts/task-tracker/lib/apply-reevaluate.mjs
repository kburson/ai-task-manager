import { readDecompositionRecords } from './decomposition-records.mjs';
import { resolveEstimateOperationId } from './estimate-writer-publication.mjs';
import { publishFieldEstimateRevision } from './decomposition-field-writer.mjs';
import {
  prepareEstimateAudit,
  publishEstimateAuditProposal,
} from './decomposition-audit-writer.mjs';
// Plan-stage re-evaluation: reads Deep-Dive signals from the issue body,
// rebuckets Size/Estimate, mutates the project board + issue field-DB block,
// and posts an audit comment. Partial publication remains fenced.
//
// Extracted from task-tracker.mjs so the plan→develop hook in
// verbs/approve.mjs can invoke it without dragging the whole CLI surface in.
// Deps are injectable for tests.

import { pexec } from '../../gh/lib/gh-client.mjs';

import {
  projectValuesForIssue,
  writeProjectFieldValue,
  fieldOptionMap,
} from '../../gh/lib/github-projects.mjs';
import { reevaluateEstimate, buildAuditCommentBody, AUDIT_HEADER } from './reevaluate-estimate.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { loadProjectFieldDefs, fieldIdFor } from '../project-fields.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

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

export async function applyReevaluate({ cfg, issueNumber, body, deps = {} } = {}) {
  if (!cfg) throw new Error('applyReevaluate: cfg is required');
  if (!issueNumber) throw new Error('applyReevaluate: issueNumber is required');

  const postComment = deps.postComment || defaultPostComment;
  const fieldDefsLoader = deps.loadProjectFieldDefs || loadProjectFieldDefs;
  const fetchProjectValues = deps.projectValuesForIssue || projectValuesForIssue;
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
  const key = {
    size: result.size,
    estimate: result.estimate,
    requiresHuman: result.requiresHuman,
    signals: result.signals,
  };
  if (!result.changed) {
    const publication = readDecompositionRecords(body).publication;
    if (
      publication?.writerId !== 'apply-reevaluate' ||
      publication.status !== 'pending' ||
      publication.operationId !== resolveEstimateOperationId('apply-reevaluate', key, publication)
    )
      return { status: 'unchanged', result };
  }

  const commentBody = buildAuditCommentBody(result);

  if (!cfg.projectId)
    return {
      status: 'refused',
      reason: 'estimate-publication:configured-membership-required',
      result,
    };
  try {
    const audit = await prepareEstimateAudit({
      cfg,
      issueNumber,
      writerId: 'apply-reevaluate',
      key,
      body: commentBody,
      postComment,
      deps,
    });
    let publication;
    if (result.requiresHuman)
      publication = await publishEstimateAuditProposal({
        cfg,
        issueNumber,
        writerId: 'apply-reevaluate',
        key,
        size: result.size,
        estimate: result.estimate,
        audit,
        deps,
      });
    else {
      const options = await optionMapFor(cfg.projectId);
      publication = await publishFieldEstimateRevision({
        cfg,
        issueNumber,
        writerId: 'apply-reevaluate',
        key,
        estimate: result.estimate,
        size: result.size,
        extraEffects: [audit.effect],
        deps,
        writeField: async ({ field, value, context }) => {
          const fieldId = fieldIdFor(cfg, field);
          if (!fieldId) throw new Error(`estimate-publication:field-${field}`);
          await writeField({
            projectId: cfg.projectId,
            itemId: context.subject.projectItemId,
            fieldId,
            value: field === 'estimate' ? { number: value } : { singleSelectOptionName: value },
            optionMap: options,
          });
        },
      });
    }
    return {
      ...publication,
      status:
        publication.status === 'recorded'
          ? result.requiresHuman
            ? 'human-attention'
            : 'applied'
          : publication.status,
      result,
    };
  } catch (error) {
    return { status: 'refused', reason: error.message, result };
  }
}
