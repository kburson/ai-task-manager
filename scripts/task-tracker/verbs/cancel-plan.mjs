// `cancel-plan` verb — Plan -> Ready for Planning (#1213).
//
// Plan is intentionally short-lived. This governed backward edge invalidates
// Plan-only evidence before moving Status, preserves the Refine snapshot and
// issue fields, and restores the original body if Status does not move.

import { runMoveStateHost } from '../../gh/move-state.mjs';
import { fieldOptionMap, gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { withIssueLock, IssueLockError } from '../issue-mutator-lock.mjs';
import { assertBoundToIssue } from '../lib/bind-context.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import {
  actionPolicyFor,
  backwardTargets,
  normalizeStateId,
  validateExecutableTransition,
} from '../lib/lifecycle-policy/index.mjs';
import { serializeMarker } from '../lib/marker-grammar.mjs';
import { getProjectDir } from '../paths.mjs';
import { verifyRefinementSnapshot } from '../lib/refinement-snapshot.mjs';
import {
  fetchRefinementBoardFields,
  fetchRefinementBoardSnapshot,
} from '../lib/refinement-snapshot-guard.mjs';
import { clearPlannedEstimate, restorePlannedEstimate } from '../lib/refine-estimate-comment.mjs';
import { ensureIssueFieldDb, parseIssueFieldDb } from '../issue-field-db.mjs';
import { loadProjectFieldDefs } from '../project-fields.mjs';
import { tetherIssueToProject } from '../../gh/lib/project-tether.mjs';

export const CANCEL_PLAN_TARGET = actionPolicyFor('cancel-plan').target;
export const LEGAL_FROM = new Set(actionPolicyFor('cancel-plan').allowedStates);

const PLAN_ONLY_MARKERS = Object.freeze([
  /<!--\s*aitm-plan-approved(?::[^>]*|\s+[^>]*?)\s*-->\s*\n?/gi,
  /<!--\s*aitm-estimation-forecast-ready\s+[^>]*?-->\s*\n?/gi,
  /<!--\s*aitm-deep-dive-posted(?::[^>]*|\s+[^>]*?)\s*-->\s*\n?/gi,
  /<!--\s*aitm-deep-dive-complete(?::[^>]*|\s+[^>]*?)\s*-->\s*\n?/gi,
  /<!--\s*aitm-test-started(?::[^>]*|\s+[^>]*?)\s*-->\s*\n?/gi,
  /<!--\s*aitm-dod-verified(?::[^>]*|\s+[^>]*?)\s*-->\s*\n?/gi,
]);
const PLAN_CANCELLED_MARKER_RE = /<!--\s*aitm-plan-cancelled\s+[^>]*?-->\s*\n?/gi;

function planArtifactMarkers(body) {
  const found = [];
  for (const pattern of PLAN_ONLY_MARKERS) {
    for (const match of String(body || '').matchAll(pattern)) found.push(match[0].trim());
  }
  return [...new Set(found)];
}

export function invalidatePlanArtifacts(body, { reason, ts } = {}) {
  let next = String(body || '');
  for (const marker of PLAN_ONLY_MARKERS) next = next.replace(marker, '');
  next = next.replace(PLAN_CANCELLED_MARKER_RE, '');
  return `${next.trimEnd()}\n${serializeMarker('plan-cancelled', {
    ts: ts || new Date().toISOString(),
    reason: String(reason || '').trim(),
  })}\n`;
}

function restorePlanArtifacts(body, originalBody, originalFields, { fieldDefs }) {
  let next = String(body || '')
    .replace(PLAN_CANCELLED_MARKER_RE, '')
    .trimEnd();
  for (const marker of planArtifactMarkers(originalBody)) {
    if (!next.includes(marker)) next += `\n${marker}`;
  }
  return ensureIssueFieldDb(next, fieldDefs, originalFields.values, {
    overrideKeys: ['priority', 'size', 'estimate', 'rank', 'blockedBy'],
  }).body;
}

function restoreSnapshotFields(body, snapshot, { fieldDefs = loadProjectFieldDefs() } = {}) {
  return ensureIssueFieldDb(body, fieldDefs, snapshot.fields, {
    overrideKeys: ['priority', 'size', 'estimate', 'rank', 'blockedBy'],
  }).body;
}

async function defaultRestoreBoardFields({ issueNumber, cfg, fields }) {
  let cfgForTether = cfg;
  if (cfg.sizeFieldId && !cfg.sizeOptions && !cfg.sizeOptionMap) {
    cfgForTether = { ...cfg, sizeOptionMap: await fieldOptionMap(cfg.projectId) };
  }
  await tetherIssueToProject({
    cfg: cfgForTether,
    issueNumber,
    priority: String(fields.priority).toLowerCase(),
    size: fields.size,
    estimate: Number(fields.estimate),
    rank: Number(fields.rank),
  });
}

async function defaultFetchIssueBody({ issueNumber, cfg }) {
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await gql(
    `query($owner:String!,$repo:String!,$issue:Int!){repository(owner:$owner,name:$repo){issue(number:$issue){body labels(first:100){nodes{name} pageInfo{hasNextPage}}}}}`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  const issue = data?.repository?.issue;
  if (!issue) throw new Error(`cancel-plan: issue #${issueNumber} not found`);
  if (issue.labels?.pageInfo?.hasNextPage) {
    throw new Error('cancel-plan: issue labels exceed the bounded snapshot query');
  }
  return {
    body: issue.body || '',
    labels: (issue.labels?.nodes || []).map((label) => label?.name).filter(Boolean),
  };
}

async function defaultGetLiveState({ issueNumber, cfg }) {
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await gql(
    `query($owner:String!,$repo:String!,$issue:Int!){repository(owner:$owner,name:$repo){issue(number:$issue){projectItems(first:10){nodes{project{id} fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}}}`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  const nodes = data?.repository?.issue?.projectItems?.nodes || [];
  const node = nodes.find((item) => item.project?.id === cfg.projectId);
  if (!node) throw new Error('cancel-plan: configured project membership is unreadable');
  return normalizeStateId(node.fieldValueByName?.name);
}

export function defaultRunMoveState({ issueNumber, reason }, { host = runMoveStateHost } = {}) {
  return host({
    argv: [
      process.execPath,
      'move-state.mjs',
      String(issueNumber),
      CANCEL_PLAN_TARGET,
      '--demote',
      '--demote-reason',
      String(reason),
    ],
    env: { ...process.env, AITM_INTERNAL: '1', AITM_VERB_CONTEXT: 'cancel-plan' },
  });
}

function boardFieldsMatchCurrentPlan(board, current) {
  return (
    String(board?.priority || '').toUpperCase() === String(current?.priority || '').toUpperCase() &&
    String(board?.size || '').toUpperCase() === String(current?.size || '').toUpperCase() &&
    Number(board?.estimate) === Number(current?.estimate) &&
    Number(board?.rank) === Number(current?.rank)
  );
}

export async function runCancelPlan({ issueNumber, cfg, reason, now, deps = {} } = {}) {
  if (!Number.isInteger(issueNumber) || issueNumber <= 0)
    throw new Error('cancel-plan: issue# must be a positive integer');
  if (!cfg?.repo || !cfg?.projectId) throw new Error('cancel-plan: cfg is required');
  const why = String(reason || '').trim();
  if (!why) return { status: 'reason-required' };
  (deps.assertBound || assertBoundToIssue)(issueNumber);

  const fetchIssueBody = deps.fetchIssueBody || defaultFetchIssueBody;
  const getLiveState = deps.getLiveState || defaultGetLiveState;
  const mutateBody = deps.mutateIssueBody || mutateIssueBody;
  const runMoveState = deps.runMoveState || defaultRunMoveState;
  const issueRecord = await fetchIssueBody({ issueNumber, cfg });
  const originalBody = issueRecord.body;
  const recorded = readLastKnownState(originalBody).state;
  let live;
  let liveBoardFields = null;
  if (deps.fetchBoardSnapshot) {
    const boardSnapshot = await deps.fetchBoardSnapshot({ issueNumber, cfg });
    live = normalizeStateId(boardSnapshot?.state);
    liveBoardFields = boardSnapshot?.fields || null;
  } else if (!deps.getLiveState && !deps.fetchBoardFields) {
    const boardSnapshot = await fetchRefinementBoardSnapshot({ issueNumber, cfg });
    live = normalizeStateId(boardSnapshot?.state);
    liveBoardFields = boardSnapshot?.fields || null;
  } else {
    live = await getLiveState({ issueNumber, cfg });
  }
  if (recorded !== live) return { status: 'drift-refused', recorded, live };
  const policy = actionPolicyFor('cancel-plan', recorded);
  if (!policy.ok) return { status: 'invalid-source-refused', from: recorded };
  const labels =
    issueRecord.labels ||
    (deps.fetchLabels ? await deps.fetchLabels({ issueNumber, cfg }) : undefined);
  const snapshotResult = verifyRefinementSnapshot(originalBody, {
    labels,
    allowPlanProjection: true,
  });
  if (!snapshotResult.ok) {
    return { status: 'snapshot-refused', reason: snapshotResult.reason };
  }
  const snapshot = snapshotResult.snapshot;
  const originalFields = parseIssueFieldDb(originalBody);
  if (!originalFields.ok) return { status: 'fields-refused' };
  if (!liveBoardFields) {
    const fetchBoardFields = deps.fetchBoardFields || fetchRefinementBoardFields;
    try {
      liveBoardFields = await fetchBoardFields({ issueNumber, cfg });
    } catch (error) {
      return {
        status: 'board-fields-refused',
        reason: `live board fields unreadable: ${error.message}`,
      };
    }
  }
  if (!boardFieldsMatchCurrentPlan(liveBoardFields, originalFields.values)) {
    return {
      status: 'board-fields-refused',
      reason: 'live board fields disagree with the current Plan body; cancellation refused',
    };
  }
  if (
    !backwardTargets(recorded).includes(CANCEL_PLAN_TARGET) ||
    !validateExecutableTransition(recorded, CANCEL_PLAN_TARGET).ok
  )
    throw new Error(`cancel-plan: lifecycle policy refuses ${recorded} -> ${CANCEL_PLAN_TARGET}`);

  const ts = (now || (() => new Date().toISOString()))();
  const restoreBoardFields = deps.restoreBoardFields || defaultRestoreBoardFields;
  const fieldDefs = deps.loadProjectFieldDefs
    ? deps.loadProjectFieldDefs()
    : loadProjectFieldDefs();
  const plannedEstimateDeps = deps.plannedEstimate || {};
  let plannedEstimateRecord;
  try {
    plannedEstimateRecord = await clearPlannedEstimate({
      cfg,
      issueNumber,
      deps: plannedEstimateDeps,
    });
  } catch (error) {
    return { status: 'planned-estimate-refused', error: error.message };
  }
  if (['no-refine-comment', 'no-appendix'].includes(plannedEstimateRecord.status)) {
    plannedEstimateRecord = null;
  } else if (plannedEstimateRecord.status !== 'cleared') {
    return {
      status: 'planned-estimate-refused',
      detail: plannedEstimateRecord.status,
      error: plannedEstimateRecord.error,
    };
  }

  let bodyChanged = false;
  let boardChanged = false;
  async function restoreCancellationChanges() {
    let restored = true;
    if (bodyChanged) {
      try {
        await mutateBody({
          issueNumber,
          repo: cfg.repo,
          mutate: (base) => restorePlanArtifacts(base, originalBody, originalFields, { fieldDefs }),
          allowMarkerLoss: true,
        });
      } catch {
        restored = false;
      }
    }
    if (boardChanged) {
      try {
        await restoreBoardFields({ issueNumber, cfg, fields: originalFields.values });
      } catch {
        restored = false;
      }
    }
    if (plannedEstimateRecord) {
      try {
        await restorePlannedEstimate({
          cfg,
          issueNumber,
          record: plannedEstimateRecord,
          deps: plannedEstimateDeps,
        });
      } catch {
        restored = false;
      }
    }
    return restored;
  }

  bodyChanged = true;
  try {
    await mutateBody({
      issueNumber,
      repo: cfg.repo,
      mutate: (base) =>
        restoreSnapshotFields(invalidatePlanArtifacts(base, { reason: why, ts }), snapshot, {
          fieldDefs,
        }),
      allowMarkerLoss: true,
    });
  } catch (error) {
    const restored = await restoreCancellationChanges();
    return {
      status: restored
        ? 'artifact-invalidation-failed-restored'
        : 'artifact-invalidation-failed-recovery-uncertain',
      error: error.message,
    };
  }
  boardChanged = true;
  try {
    await restoreBoardFields({ issueNumber, cfg, fields: snapshot.fields });
  } catch (error) {
    const restored = await restoreCancellationChanges();
    return {
      status: restored
        ? 'field-restore-failed-restored'
        : 'field-restore-failed-recovery-uncertain',
      error: error.message,
    };
  }
  let exitCode;
  let moveError = null;
  try {
    exitCode = await runMoveState({
      issueNumber,
      target: CANCEL_PLAN_TARGET,
      reason: why,
      cfg,
    });
  } catch (error) {
    exitCode = 1;
    moveError = error;
  }
  if (exitCode !== 0) {
    let liveAfter = null;
    try {
      liveAfter = await getLiveState({ issueNumber, cfg });
    } catch {
      return { status: 'transition-outcome-ambiguous', exitCode, from: recorded };
    }
    if (liveAfter === CANCEL_PLAN_TARGET) {
      return {
        status: 'cancelled-with-warning',
        exitCode,
        from: recorded,
        to: CANCEL_PLAN_TARGET,
      };
    }
    if (liveAfter !== recorded) {
      return { status: 'transition-outcome-ambiguous', exitCode, from: recorded, liveAfter };
    }
    const restored = await restoreCancellationChanges();
    return {
      status: restored ? 'transition-failed-restored' : 'transition-failed-recovery-uncertain',
      exitCode,
      from: recorded,
      ...(moveError ? { error: moveError.message } : {}),
    };
  }
  return { status: 'cancelled', from: recorded, to: CANCEL_PLAN_TARGET };
}

export function parseArgs(rest = []) {
  let issueNumber = null;
  let reason = null;
  for (let index = 0; index < rest.length; index += 1) {
    const token = String(rest[index]);
    const match = token.match(/^#?(\d+)$/);
    if (match && issueNumber === null) issueNumber = Number(match[1]);
    else if (token === '--reason') reason = rest[++index] ?? '';
    else if (token.startsWith('--reason=')) reason = token.slice('--reason='.length);
    else throw new Error(`cancel-plan: unknown argument ${token}`);
  }
  return { issueNumber, reason };
}

export async function verbCancelPlan(rest, cfg, deps = {}) {
  let args;
  try {
    args = parseArgs(rest);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  if (!args.issueNumber || !String(args.reason || '').trim()) {
    process.stderr.write('Usage: cancel-plan <N> --reason "<text>"\n');
    process.exit(2);
  }
  let result;
  try {
    result = await (deps.withIssueLock || withIssueLock)(
      { issue: args.issueNumber, verb: 'cancel-plan', projDir: deps.projectDir || getProjectDir() },
      () => runCancelPlan({ ...args, cfg, deps })
    );
  } catch (error) {
    if (error instanceof IssueLockError) {
      process.stderr.write(`cancel-plan: ${error.message}\n`);
      process.exit(7);
    }
    process.stderr.write(`cancel-plan: ${error.message}\n`);
    process.exit(1);
  }
  if (result.status === 'cancelled') {
    process.stdout.write(`✓ #${args.issueNumber} Plan cancelled: plan → ready-for-plan\n`);
    return;
  }
  if (result.status === 'cancelled-with-warning') {
    process.stdout.write(`✓ #${args.issueNumber} Plan cancelled: plan → ready-for-plan\n`);
    process.stderr.write(
      `cancel-plan: move delegate exited ${result.exitCode} after Status reached ready-for-plan\n`
    );
    return;
  }
  process.stderr.write(`cancel-plan: ${result.status}\n`);
  process.exit(result.status === 'transition-failed-restored' ? result.exitCode || 1 : 4);
}
