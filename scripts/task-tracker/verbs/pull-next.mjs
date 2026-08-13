// `pull-next` verb (#135) — JIT child-promotion for an epic in Develop.
//
// Usage: `/task pull-next <epic#>`
//
// Behavior:
// 1. Verify the epic is in `develop` (the orchestrator must be active).
// 2. Fetch the epic's children and pick the first dependency-ready R4P child.
// 3. Promote that child ready-for-plan→plan via `verbPromote`. The agent then
//    refreshes JIT planning in Plan and runs promote again for plan→develop.
//
// If no dependency-ready R4P child exists, the verb is a no-op success.
// If the epic is not in `develop`, the verb errors.

import { loadConfig } from '../config.mjs';
import {
  fetchEpicChildren,
  findNextEligibleChild,
  enrichChildrenWithBlockedBy,
  isActiveChild,
  isPendingRecoveryPhase,
} from '../lib/epic-children-gate.mjs';
import { normalizeStateId } from '../lib/lifecycle-policy/index.mjs';
import { fetchAssignmentSnapshot } from '../lib/assignment-snapshot.mjs';
import { runPromote } from './promote.mjs';
import { runMoveInvariantAudit } from '../lib/verify-move-invariants.mjs';
import { buildContext } from '../runtime.mjs';
import { verbClose } from './close.mjs';
import { resolveProjectDir } from '../lib/project-dir.mjs';
import { runPreflight } from '../lib/verb-preflight.mjs';
import { withIssueLock } from '../issue-mutator-lock.mjs';
import { stateIds } from '../lib/lifecycle-policy/index.mjs';

export async function defaultGetLiveState({ issueNumber, cfg, deps = {} }) {
  const fetchSnapshot = deps.fetchSnapshot || fetchAssignmentSnapshot;
  const snapshot = await fetchSnapshot({ issueNumber, cfg, deps });
  return normalizeStateId(snapshot?.state);
}

export async function defaultConvergeClosedIssue(
  { issueNumber },
  { buildContextFn = buildContext, closeFn = verbClose } = {}
) {
  const ctx = buildContextFn(['close', `#${issueNumber}`]);
  // The pull-next caller owns the active epic binding. Child housekeeping may
  // deregister the completed child, but it must not clear the epic's state.
  ctx.preserveActiveOnConvergence = true;
  // Child convergence is background housekeeping. Its Done move must retain
  // issue/project effects while excluding every session-owned tail effect.
  ctx.convergenceTailProfile = 'background-convergence';
  return closeFn(ctx);
}

export async function promoteSelectedChild({
  issueNumber,
  cfg,
  projectDir,
  promoteDeps = {},
  promoteRunner = runPromote,
  ownershipPreflight = runPreflight,
  acquireIssueLock = withIssueLock,
} = {}) {
  const selectedIssueNumber = Number(issueNumber);
  if (!Number.isSafeInteger(selectedIssueNumber) || selectedIssueNumber <= 0) {
    throw new Error('promoteSelectedChild: valid issueNumber is required');
  }
  if (typeof projectDir !== 'string' || !projectDir.trim()) {
    throw new Error('promoteSelectedChild: bound epic projectDir is required');
  }

  // pull-next owns an epic-bound orchestration session, so the ordinary
  // active-issue assertion cannot authorize its selected child. Replace only
  // that dependency, and scope the replacement to the child already chosen by
  // the rank/blocker gates above. Every other verbPromote guard remains live.
  const assertSelectedChild = (targetIssueNumber) => {
    if (Number(targetIssueNumber) !== selectedIssueNumber) {
      throw new Error(
        `pull-next promote authority is limited to #${selectedIssueNumber}; ` +
          `received #${targetIssueNumber}`
      );
    }
  };

  return acquireIssueLock(
    { issue: selectedIssueNumber, verb: 'pull-next-child', projDir: projectDir },
    async () => {
      const ownership = await ownershipPreflight({
        stateBefore: { active: `#${selectedIssueNumber}` },
        target: `#${selectedIssueNumber}`,
        cfg,
        ownershipOnly: true,
        deps: promoteDeps.preflightDeps || {},
      });
      if (!ownership.ok) {
        throw new Error(
          `pull-next ownership preflight refused #${selectedIssueNumber}: ${ownership.assigneeKind || ownership.kind}`
        );
      }

      return promoteRunner({
        issueNumber: selectedIssueNumber,
        cfg,
        deps: {
          ...promoteDeps,
          projectDir,
          assertBound: assertSelectedChild,
        },
      });
    }
  );
}

export async function runPullNext({ epicNumber, cfg, deps = {} } = {}) {
  if (!epicNumber) throw new Error('runPullNext: epicNumber is required');
  if (!cfg) throw new Error('runPullNext: cfg is required');
  const acquireIssueLock = deps.withIssueLock || withIssueLock;
  const projectDir =
    deps.projectDir ||
    (deps.resolveProjectDir ?? resolveProjectDir)({
      issue: epicNumber,
      deps: deps.projectDirDeps ?? deps,
    });
  return acquireIssueLock({ issue: epicNumber, verb: 'pull-next', projDir: projectDir }, () =>
    runPullNextLocked({ epicNumber, cfg, deps, projectDir })
  );
}

async function runPullNextLocked({ epicNumber, cfg, deps, projectDir }) {
  const getLiveState = deps.getLiveState || defaultGetLiveState;
  const getChildLiveState = deps.getChildLiveState || defaultGetLiveState;
  const audit = deps.audit || runMoveInvariantAudit;

  const liveState = await getLiveState({ issueNumber: epicNumber, cfg });
  if (liveState !== 'develop') {
    return {
      status: 'epic-not-in-develop',
      message: `Refusing to pull-next on #${epicNumber}: epic state is "${liveState || 'unknown'}", expected "develop".`,
    };
  }

  // #758 — audit the epic for out-of-band Status drift before selecting a child.
  // Ambiguous or dirty authority blocks selection; pull-next must never create
  // new work from an unverified parent snapshot.
  const auditResult = await audit({ issueNumber: epicNumber, cfg, deps: deps.auditDeps });
  if (!auditResult?.ok) {
    return {
      status: 'epic-audit-refused',
      message: `Refusing to pull-next on #${epicNumber}: epic invariant audit is not clean (${auditResult?.drift || 'unknown'}).`,
    };
  }

  let children;
  try {
    children = await fetchEpicChildren({
      cfg,
      parentEpicNumber: epicNumber,
      deps: deps.epicChildren,
    });
  } catch (err) {
    return {
      status: 'fetch-failed',
      message: `Failed to fetch children of #${epicNumber}: ${err.message}`,
    };
  }

  if (!children.length) {
    return {
      status: 'no-children',
      message: `#${epicNumber} has no sub-issues — nothing to pull.`,
    };
  }

  const ambiguous = children.filter(
    (child) =>
      !child ||
      !Number.isSafeInteger(Number(child.number)) ||
      !childStateIsKnown(child) ||
      child.childEvidenceError ||
      (!isPendingRecoveryPhase(child.recoveryPhase) &&
        childStateNeedsPlanningEvidence(child) &&
        (!Number.isFinite(Number(child.rank)) || child.hasCurrentRefinement !== true))
  );
  if (ambiguous.length) {
    return {
      status: 'child-state-ambiguous',
      ambiguousChildren: ambiguous.map((child) => child?.number || null),
      message: `Refusing to pull-next on #${epicNumber}: child enumeration or planning evidence is incomplete.`,
    };
  }

  // #925 — closed children are compatibility-coerced to `state: done`, while
  // `boardState` preserves their raw project column. That pair identifies a
  // CLOSED + not-Done convergence candidate even when stateReason is unknown.
  // A pending durable recovery is also a candidate regardless of its current
  // issue/board snapshot so interrupted transactions resume before new work.
  const sweep = {
    checked: [],
    finalized: [],
    recovered: [],
    dead: [],
    failed: [],
  };
  const convergeClosedIssue = deps.convergeClosedIssue || defaultConvergeClosedIssue;
  const candidates = children.filter((child) => {
    const rawBoardState = normalizeStateId(child.boardState);
    const closedBehind =
      String(child.state || '').toLowerCase() === 'done' &&
      rawBoardState &&
      rawBoardState !== 'done';
    return closedBehind || isPendingRecoveryPhase(child.recoveryPhase);
  });
  for (const child of candidates) {
    sweep.checked.push(child.number);
    let convergence;
    try {
      convergence = await convergeClosedIssue({
        issueNumber: child.number,
        boardState: child.boardState,
        stateReason: child.closeReason,
        recoveryPhase: child.recoveryPhase,
        recoveryTx: child.recoveryTx,
        cfg,
      });
    } catch {
      convergence = { action: null, status: 'failed' };
    }

    if (convergence?.status === 'failed' || !convergence) {
      sweep.failed.push(child.number);
      return {
        status: 'self-heal-paused',
        sweep,
        message:
          `Closed-child convergence failed for #${child.number}; ` + 'no new child was promoted.',
      };
    }
    if (convergence.action === 'aberration' || convergence.status === 'recovered') {
      sweep.recovered.push(child.number);
      return {
        status: 'self-heal-paused',
        sweep,
        message:
          `Recovered unauthorized close on #${child.number}; ` +
          'resolve the Review-state child before pulling another.',
      };
    }
    if (convergence.action === 'dead') sweep.dead.push(child.number);
    else if (convergence.action === 'finalize' || convergence.action === 'noop') {
      sweep.finalized.push(child.number);
    }
  }

  // Attach each child's `aitm-blocked-by` blockers so selection can skip
  // children with unmet dependencies and prefer blockers (#248).
  const enriched = await enrichChildrenWithBlockedBy({
    children,
    cfg,
    deps: deps.enrich,
  });

  const active = enriched.filter(isActiveChild);
  if (active.length) {
    return {
      status: 'active-child',
      activeChildren: active.map((child) => child.number),
      sweep,
      message: `Refusing to pull another local child while ${active
        .map((child) => `#${child.number} (${child.state})`)
        .join(', ')} is active. Finish the active child before continuing.`,
    };
  }

  const next = findNextEligibleChild(enriched);
  if (!next) {
    const counts = children.reduce((acc, c) => {
      const s = String(c.state || 'unknown').toLowerCase();
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    return {
      status: 'no-eligible',
      message: `No dependency-ready R4P children eligible for JIT pull on #${epicNumber}. States: ${JSON.stringify(counts)}`,
      counts,
      sweep,
    };
  }

  const promoteResult = deps.promote
    ? await deps.promote([String(next.number)], cfg)
    : await promoteSelectedChild({
        issueNumber: next.number,
        cfg,
        projectDir,
        promoteDeps: deps.promoteDeps,
        promoteRunner: deps.promoteRunner,
        acquireIssueLock: deps.childIssueLock || withIssueLock,
      });

  let observedState = null;
  let verificationError = null;
  try {
    observedState = await getChildLiveState({ issueNumber: next.number, cfg });
  } catch (err) {
    verificationError = err;
  }
  if (observedState !== 'plan') {
    return {
      status: 'promotion-unverified',
      childNumber: next.number,
      childRank: next.rank,
      observedState,
      promoteResult,
      sweep,
      message:
        `Refusing to report #${next.number} as pulled: expected "plan" after promotion, ` +
        `observed "${observedState || 'unknown'}"` +
        (verificationError ? ` (${verificationError.message})` : '') +
        '.',
    };
  }
  return {
    status: 'pulled',
    childNumber: next.number,
    childRank: next.rank,
    promoteResult,
    sweep,
    message: `Pulled #${next.number} (rank=${next.rank}) ready-for-plan→plan. Refresh JIT planning against current trunk, then run /task promote ${next.number}; Plan→Develop will verify exclusive ownership.`,
  };
}

const knownChildStates = new Set(stateIds());

function childStateIsKnown(child) {
  return knownChildStates.has(String(child?.state || '').toLowerCase());
}

function childStateNeedsPlanningEvidence(child) {
  return !['backlog', 'refine', 'done'].includes(String(child?.state || '').toLowerCase());
}

export async function verbPullNext(rest = [], cfgArg = null) {
  const epicNumber = rest[0] ? Number(rest[0]) : null;
  if (!epicNumber || Number.isNaN(epicNumber)) {
    console.error('Usage: /task pull-next <epic#>');
    return 2;
  }
  const cfg = cfgArg || (await loadConfig());
  const result = await runPullNext({ epicNumber, cfg });
  if (result.status === 'pulled') {
    console.log(`✓ ${result.message}`);
    return 0;
  }
  if (result.status === 'no-eligible' || result.status === 'no-children') {
    console.log(result.message);
    return 0;
  }
  if (result.status === 'self-heal-paused' && result.sweep?.failed?.length === 0) {
    console.log(result.message);
    return 0;
  }
  console.error(`⛔ ${result.message}`);
  return 1;
}
