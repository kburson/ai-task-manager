// Epic R4P admission + sequential JIT child-pull authority (#1216).

import { defaultFetchSiblings } from '../../gh/lib/wave-admission.mjs';
import { splitRepo, gql } from '../../gh/lib/github-projects.mjs';
import { parseBlockedBy } from './blocked-marker.mjs';
import { parseRefinementSnapshot } from './refinement-snapshot.mjs';
import { normalizeStateId } from './lifecycle-policy/index.mjs';

const PENDING_RECOVERY_PHASES = new Set(['intent', 'reopened', 'review', 'timing']);
export const CHILD_STAGING_STATE = 'ready-for-plan';
export const ACTIVE_CHILD_STATES = Object.freeze(new Set(['plan', 'develop', 'test', 'review']));
const PLAN_ADMISSION_STATES = new Set([CHILD_STAGING_STATE, ...ACTIVE_CHILD_STATES]);
const ACCEPTED_TERMINAL_DISPOSITIONS = new Set(['completed', 'not_planned']);

function childState(child) {
  return String(child?.state || '').toLowerCase();
}

export function isAcceptedTerminalChild(child) {
  if (child?.childEvidenceError) return false;
  const disposition = String(child?.closeReason || '').toLowerCase();
  if (
    childState(child) !== 'done' ||
    String(child?.issueState || '').toLowerCase() !== 'closed' ||
    !ACCEPTED_TERMINAL_DISPOSITIONS.has(disposition) ||
    isPendingRecoveryPhase(child?.recoveryPhase)
  )
    return false;
  if (disposition === 'not_planned') return true;
  return normalizeStateId(child?.boardState) === 'done';
}

export function isActiveChild(child) {
  return ACTIVE_CHILD_STATES.has(childState(child));
}

function hasCompletePlanningRecord(child) {
  return (
    PLAN_ADMISSION_STATES.has(childState(child)) &&
    child?.hasCurrentRefinement === true &&
    Number.isFinite(Number(child?.rank ?? child?.sequence))
  );
}

export function isPendingRecoveryPhase(phase) {
  return PENDING_RECOVERY_PHASES.has(phase);
}

export async function fetchEpicChildren({ cfg, parentEpicNumber, deps = {} } = {}) {
  if (!cfg) throw new Error('fetchEpicChildren: cfg is required');
  if (!parentEpicNumber) throw new Error('fetchEpicChildren: parentEpicNumber is required');
  const fetchSiblings = deps.fetchSiblings || defaultFetchSiblings;
  const children = await fetchSiblings({
    parentEpicNumber,
    repo: cfg.repo,
    projectId: cfg.projectId,
    cfg,
  });
  if (!Array.isArray(children)) throw new Error('fetchEpicChildren: malformed child list');
  return children;
}

export async function planEpicDevelopChildrenGate({ cfg, issueNumber, deps = {} } = {}) {
  if (!cfg) throw new Error('planEpicDevelopChildrenGate: cfg is required');
  if (!issueNumber) throw new Error('planEpicDevelopChildrenGate: issueNumber is required');
  let children;
  try {
    children = await fetchEpicChildren({
      cfg,
      parentEpicNumber: issueNumber,
      deps,
    });
  } catch (err) {
    return { ok: false, blockers: [`epic-children-fetch-failed: ${err.message}`] };
  }
  if (!children.length) {
    return { ok: true, children: [] };
  }
  const offenders = children.filter(
    (child) => !isAcceptedTerminalChild(child) && !hasCompletePlanningRecord(child)
  );
  if (offenders.length) {
    const lines = offenders.map(
      (c) => `#${c?.number || 'unknown'} (state=${c?.state || 'unknown'})`
    );
    return {
      ok: false,
      blockers: [
        `epic-children-not-r4p: every executable nonterminal child must be at Ready for Planning or later with current refinement evidence and a finite rank before the epic promotes to Develop: ${lines.join(', ')}`,
      ],
      offendingChildren: offenders,
    };
  }
  return { ok: true, children };
}

// Develop→Test requires every child to be terminally delivered or carry the
// accepted Closed Not Planned disposition. A Review child is not delivered to
// the epic branch yet and therefore cannot admit the parent.
export async function developEpicTestChildrenGate({ cfg, issueNumber, deps = {} } = {}) {
  if (!cfg) throw new Error('developEpicTestChildrenGate: cfg is required');
  if (!issueNumber) throw new Error('developEpicTestChildrenGate: issueNumber is required');
  let children;
  try {
    children = await fetchEpicChildren({
      cfg,
      parentEpicNumber: issueNumber,
      deps,
    });
  } catch (err) {
    return { ok: false, blockers: [`epic-children-fetch-failed: ${err.message}`] };
  }
  if (!children.length) {
    return { ok: true, children: [] };
  }
  const offenders = children.filter((child) => !isAcceptedTerminalChild(child));
  if (offenders.length) {
    const lines = offenders.map(
      (c) => `#${c?.number || 'unknown'} (state=${c?.state || 'unknown'})`
    );
    return {
      ok: false,
      blockers: [
        `epic-children-not-terminal: every required child must be Done or closed with an accepted terminal disposition before the epic promotes to Test: ${lines.join(', ')}`,
      ],
      offendingChildren: offenders,
    };
  }
  return { ok: true, children };
}

// Review→done admission gate (#877): the child-`done` invariant relaxed off the
// develop→test arc lands here. An epic refuses to leave Review unless every
// sub-issue is at `done`. This is the load-bearing half of #877 — before it
// existed there was NO epic-side children check on the review→done arc
// (`childCannotLeadEpicExitGuard` inspects the issue's own *parent*, not its
// children), so relaxing the develop gate alone would have dropped the
// invariant entirely rather than moved it. Leaf issues pass trivially.
export async function reviewEpicDoneChildrenGate({ cfg, issueNumber, deps = {} } = {}) {
  if (!cfg) throw new Error('reviewEpicDoneChildrenGate: cfg is required');
  if (!issueNumber) throw new Error('reviewEpicDoneChildrenGate: issueNumber is required');
  let children;
  try {
    children = await fetchEpicChildren({
      cfg,
      parentEpicNumber: issueNumber,
      deps,
    });
  } catch (err) {
    return { ok: false, blockers: [`epic-children-fetch-failed: ${err.message}`] };
  }
  if (!children.length) {
    return { ok: true, children: [] };
  }
  const offenders = children.filter((child) => !isAcceptedTerminalChild(child));
  if (offenders.length) {
    const lines = offenders.map((c) => `#${c.number} (state=${c.state || 'unknown'})`);
    return {
      ok: false,
      blockers: [
        `epic-children-not-done: every child must be at done before the epic promotes to Done: ${lines.join(', ')}`,
      ],
      offendingChildren: offenders,
    };
  }
  return { ok: true, children };
}

// Normalizes a child's `blockedBy` into an array of positive integers. Accepts
// the `aitm-blocked-by` parse output (number[]) and defaults to `[]` when the
// field is absent — so children that were never enriched behave as unblocked
// and the selector degrades to pure rank ordering (back-compat).
function childBlockers(child) {
  const raw = child && Array.isArray(child.blockedBy) ? child.blockedBy : [];
  return raw.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * Pick the next child to pull Ready for Planning→Plan, dependency-aware.
 *
 * Eligibility: state `ready-for-plan`, current refinement evidence, finite
 * `rank`, every `aitm-blocked-by`
 * blocker already Done. Ordering: children that block a sibling sort ahead of
 * leaf children (so blockers clear first), then `rank` ascending.
 *
 * Pure: reads `c.state`, `c.rank`, and the optional `c.blockedBy` (number[],
 * attached by `enrichChildrenWithBlockedBy`). With no `blockedBy` anywhere this
 * reduces to the original lowest-rank-refine-child behavior.
 *
 * @param {Array<{number:number, state?:string, rank?:number, blockedBy?:number[]}>} children
 * @returns {object|null} the chosen child, or null when none eligible.
 */
export function findNextEligibleChild(children = []) {
  const list = children || [];

  if (list.some(isActiveChild)) return null;

  // Set of issue numbers that are Done — used to test whether a blocker cleared.
  const doneNumbers = new Set(
    list
      .filter(isAcceptedTerminalChild)
      .map((c) => Number(c.number))
      .filter((n) => Number.isInteger(n))
  );

  // Set of issue numbers that block at least one sibling — used for ordering.
  const blockingNumbers = new Set();
  for (const c of list) {
    for (const b of childBlockers(c)) blockingNumbers.add(b);
  }

  const eligible = list
    .filter((c) => childState(c) === CHILD_STAGING_STATE)
    .filter((c) => c.hasCurrentRefinement === true)
    .filter((c) => Array.isArray(c.blockedBy))
    .filter((c) => (c.rank ?? c.sequence) != null && Number.isFinite(Number(c.rank ?? c.sequence)))
    // Exclude any child whose blockers are not all Done.
    .filter((c) => childBlockers(c).every((b) => doneNumbers.has(b)))
    .sort((a, b) => {
      // Blocking-first: a child that blocks a sibling outranks one that doesn't.
      const aBlocks = blockingNumbers.has(Number(a.number)) ? 0 : 1;
      const bBlocks = blockingNumbers.has(Number(b.number)) ? 0 : 1;
      if (aBlocks !== bBlocks) return aBlocks - bBlocks;
      // Rank ascending tiebreak (preserves original behavior).
      return Number(a.rank ?? a.sequence) - Number(b.rank ?? b.sequence);
    });

  return eligible[0] || null;
}

/**
 * WIP-budget decision for a child leaving R4P (R4P→Plan).
 *
 * The local budget is exactly one active child. Until isolated cloud CI is an
 * explicit proven prerequisite, dependencies never create a parallel bypass.
 *
 * Pure: reads each child's `state` and optional `blockedBy` (number[]).
 *
 * @param {object} opts
 * @param {number} opts.promotingNumber  the child being promoted out of R4P
 * @param {Array<{number:number, state?:string, blockedBy?:number[]}>} opts.children
 *   the full sibling set (may include the promoting child).
 * @returns {{ok:boolean, reason:string, advancing:number[]}}
 */
export function wipAdvanceDecision({ promotingNumber, children = [] } = {}) {
  const me = Number(promotingNumber);
  const others = (children || []).filter((c) => Number(c.number) !== me);

  const advancing = others.filter(isActiveChild);

  if (advancing.length === 0) {
    return { ok: true, reason: 'no active sibling', advancing: [] };
  }
  const advancingNums = advancing.map((c) => Number(c.number));
  return {
    ok: false,
    reason: `wip-budget: ${advancingNums.map((n) => `#${n}`).join(', ')} already active`,
    advancing: advancingNums,
  };
}

/**
 * Network wrapper for the WIP gate, called from the promote verb at R4P→Plan.
 * Solo issues bypass. Epic reads fail closed: an unreadable sibling set cannot
 * authorize another local child.
 *
 * @returns {Promise<{ok:boolean, blockers?:string[]}>}
 */
export async function planRefineWipGate({ cfg, issueNumber, deps = {} } = {}) {
  if (!cfg) throw new Error('planRefineWipGate: cfg is required');
  if (!issueNumber) throw new Error('planRefineWipGate: issueNumber is required');
  const me = Number(String(issueNumber).replace(/^#/, ''));

  let parentEpicNumber = null;
  try {
    const fetchParent = deps.fetchParentIssue;
    parentEpicNumber = fetchParent ? await fetchParent({ issueNumber: me, repo: cfg.repo }) : null;
  } catch (error) {
    return { ok: false, blockers: [`wip-parent-fetch-failed: ${error.message}`] };
  }
  if (parentEpicNumber == null) return { ok: true }; // solo issue — bypass

  let children;
  try {
    children = await fetchEpicChildren({ cfg, parentEpicNumber, deps });
    children = await enrichChildrenWithBlockedBy({ children, cfg, deps });
  } catch (error) {
    return { ok: false, blockers: [`wip-children-fetch-failed: ${error.message}`] };
  }

  const decision = wipAdvanceDecision({ promotingNumber: me, children });
  if (decision.ok) return { ok: true };
  return {
    ok: false,
    blockers: [
      `wip-budget-exceeded: ${decision.reason}. Finish the active sibling before pulling another local child.`,
    ],
  };
}

// Epic states at which new sub-issues may be created. Preserve the established
// admission set across #1206: the renamed second slot remains non-admitting,
// while Backlog/Refine/Plan/Develop/Test/Review admit children and Done refuses.
const CHILD_CREATION_EPIC_STATES = new Set([
  'backlog',
  'refine',
  CHILD_STAGING_STATE,
  'plan',
  'develop',
  'test',
  'review',
]);

/**
 * Whether a sub-issue may be created under an epic at the given board state.
 * @param {string} state epic board state
 * @returns {boolean} true for backlog/refine/R4P/plan/develop/test/review;
 *   false for done or any unrecognized state.
 */
export function childCreationAllowedAtEpicState(state) {
  return CHILD_CREATION_EPIC_STATES.has(String(state || '').toLowerCase());
}

// Default per-child body fetch (used by enrichChildrenWithBlockedBy).
async function defaultFetchBody({ issueNumber, cfg }) {
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await gql(
    `query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) { body }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  return data?.repository?.issue?.body ?? '';
}

/**
 * Attach blocker and current-refinement evidence to each child. Per-child
 * fetch/parse failure remains ineligible rather than being treated as empty.
 *
 * Layering note: this lives in task-tracker/lib (which already depends on
 * gh/lib) and consumes the sibling `blocked-marker.mjs`. No new back-edge.
 *
 * @returns {Promise<Array>} the children with `blockedBy` attached.
 */
export async function enrichChildrenWithBlockedBy({ children = [], cfg, deps = {} } = {}) {
  if (!cfg) throw new Error('enrichChildrenWithBlockedBy: cfg is required');
  const fetchBody = deps.fetchBody || defaultFetchBody;
  const list = children || [];
  return Promise.all(
    list.map(async (child) => {
      if (Array.isArray(child.blockedBy) && typeof child.hasCurrentRefinement === 'boolean') {
        return child;
      }
      try {
        const body = await fetchBody({ issueNumber: child.number, cfg });
        return {
          ...child,
          blockedBy: parseBlockedBy(body),
          hasCurrentRefinement: Boolean(parseRefinementSnapshot(body)),
        };
      } catch (error) {
        return {
          ...child,
          blockedBy: null,
          hasCurrentRefinement: false,
          childEvidenceError: error.message,
        };
      }
    })
  );
}
