// Epic plan→develop gate + JIT child-pull helpers (#135).
//
// At plan→develop, an epic (issue with sub-issues) refuses to advance if any
// child is still in `backlog`. Children must be at least refined before the
// orchestrator starts driving them. Non-epic issues (no children) pass through.
//
// The `/task pull-next` verb consumes `findNextEligibleChild` to pick the
// next-in-sequence refine-state child to promote refine→plan.

import { defaultFetchSiblings } from '../../gh/lib/wave-admission.mjs';
import { splitRepo, gql } from '../../gh/lib/github-projects.mjs';
import { parseBlockedBy } from './blocked-marker.mjs';

export async function fetchEpicChildren({ cfg, parentEpicNumber, deps = {} } = {}) {
  if (!cfg) throw new Error('fetchEpicChildren: cfg is required');
  if (!parentEpicNumber) throw new Error('fetchEpicChildren: parentEpicNumber is required');
  const fetchSiblings = deps.fetchSiblings || defaultFetchSiblings;
  const children = await fetchSiblings({
    parentEpicNumber,
    repo: cfg.repo,
    projectId: cfg.projectId,
  });
  return Array.isArray(children) ? children : [];
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
  const forcePromote = process.env.TASK_TRACKER_FORCE_PROMOTE === '1';
  const offenders = children.filter((c) => String(c.state || '').toLowerCase() !== 'refine');
  if (offenders.length && !forcePromote) {
    const lines = offenders.map((c) => `#${c.number} (state=${c.state || 'unknown'})`);
    return {
      ok: false,
      blockers: [
        `epic-children-not-at-refine: every child must be at refine before the epic promotes to Develop (children must not lead the parent): ${lines.join(', ')}. Heal-forward override: TASK_TRACKER_FORCE_PROMOTE=1`,
      ],
      offendingChildren: offenders,
    };
  }
  return { ok: true, children };
}

// Normalizes a child's `blockedBy` into an array of positive integers. Accepts
// the `aitm-blocked-by` parse output (number[]) and defaults to `[]` when the
// field is absent — so children that were never enriched behave as unblocked
// and the selector degrades to pure sequence ordering (back-compat).
function childBlockers(child) {
  const raw = child && Array.isArray(child.blockedBy) ? child.blockedBy : [];
  return raw.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * Pick the next child to pull refine→plan, dependency-aware.
 *
 * Eligibility: state `refine`, finite `sequence`, and every `aitm-blocked-by`
 * blocker already Done. Ordering: children that block a sibling sort ahead of
 * leaf children (so blockers clear first), then `sequence` ascending.
 *
 * Pure: reads `c.state`, `c.sequence`, and the optional `c.blockedBy` (number[],
 * attached by `enrichChildrenWithBlockedBy`). With no `blockedBy` anywhere this
 * reduces to the original lowest-sequence-refine-child behavior.
 *
 * @param {Array<{number:number, state?:string, sequence?:number, blockedBy?:number[]}>} children
 * @returns {object|null} the chosen child, or null when none eligible.
 */
export function findNextEligibleChild(children = []) {
  const list = children || [];

  // Set of issue numbers that are Done — used to test whether a blocker cleared.
  const doneNumbers = new Set(
    list
      .filter((c) => String(c.state || '').toLowerCase() === 'done')
      .map((c) => Number(c.number))
      .filter((n) => Number.isInteger(n))
  );

  // Set of issue numbers that block at least one sibling — used for ordering.
  const blockingNumbers = new Set();
  for (const c of list) {
    for (const b of childBlockers(c)) blockingNumbers.add(b);
  }

  const eligible = list
    .filter((c) => String(c.state || '').toLowerCase() === 'refine')
    .filter((c) => c.sequence != null && Number.isFinite(Number(c.sequence)))
    // Exclude any child whose blockers are not all Done.
    .filter((c) => childBlockers(c).every((b) => doneNumbers.has(b)))
    .sort((a, b) => {
      // Blocking-first: a child that blocks a sibling outranks one that doesn't.
      const aBlocks = blockingNumbers.has(Number(a.number)) ? 0 : 1;
      const bBlocks = blockingNumbers.has(Number(b.number)) ? 0 : 1;
      if (aBlocks !== bBlocks) return aBlocks - bBlocks;
      // Sequence ascending tiebreak (preserves original behavior).
      return Number(a.sequence) - Number(b.sequence);
    });

  return eligible[0] || null;
}

// States that count as "out of Refine but not yet Done" — a child occupying one
// of these is actively advancing through the verb chain.
const OUT_OF_REFINE_ACTIVE = new Set(['plan', 'develop', 'test', 'review']);

// A child is "parked" when it carries at least one unmet blocker
// (`aitm-blocked-by`), attached as `blockedBy` by enrichChildrenWithBlockedBy.
function isParked(child) {
  return childBlockers(child).length > 0;
}

/**
 * WIP-budget decision for a child leaving Refine (Refine→Plan).
 *
 * The budget is **one advancing child**: a child may leave Refine iff no other
 * non-Done child is already out of Refine, OR the promoting child is a blocker
 * of a now-parked out-of-Refine sibling (so the blocker can run ahead and clear
 * the park). Parked children (carrying an unmet `aitm-blocked-by`) never count
 * against the budget.
 *
 * Pure: reads each child's `state` and optional `blockedBy` (number[]).
 *
 * @param {object} opts
 * @param {number} opts.promotingNumber  the child being promoted out of Refine
 * @param {Array<{number:number, state?:string, blockedBy?:number[]}>} opts.children
 *   the full sibling set (may include the promoting child).
 * @returns {{ok:boolean, reason:string, advancing:number[]}}
 */
export function wipAdvanceDecision({ promotingNumber, children = [] } = {}) {
  const me = Number(promotingNumber);
  const others = (children || []).filter((c) => Number(c.number) !== me);

  // Advancing = out-of-refine, not Done, not parked.
  const advancing = others
    .filter((c) => OUT_OF_REFINE_ACTIVE.has(String(c.state || '').toLowerCase()))
    .filter((c) => !isParked(c));

  if (advancing.length === 0) {
    return { ok: true, reason: 'no advancing sibling', advancing: [] };
  }

  // Blocker-exception: the promoting child unblocks a parked, out-of-refine
  // sibling.
  const parkedOutOfRefine = others.filter(
    (c) => OUT_OF_REFINE_ACTIVE.has(String(c.state || '').toLowerCase()) && isParked(c)
  );
  const unblocksParked = parkedOutOfRefine.some((c) => childBlockers(c).includes(me));

  const advancingNums = advancing.map((c) => Number(c.number));
  if (unblocksParked) {
    return {
      ok: true,
      reason: `blocker-exception: #${me} unblocks a parked out-of-Refine sibling`,
      advancing: advancingNums,
    };
  }
  return {
    ok: false,
    reason: `wip-budget: ${advancingNums.map((n) => `#${n}`).join(', ')} already out of Refine`,
    advancing: advancingNums,
  };
}

/**
 * Network wrapper for the WIP gate, called from the promote verb at Refine→Plan.
 * Solo issues (no parent epic) bypass. Fails open on any fetch error so a
 * transient GitHub failure never deadlocks the board.
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
  } catch {
    return { ok: true }; // fail open
  }
  if (parentEpicNumber == null) return { ok: true }; // solo issue — bypass

  let children;
  try {
    children = await fetchEpicChildren({ cfg, parentEpicNumber, deps });
    children = await enrichChildrenWithBlockedBy({ children, cfg, deps });
  } catch {
    return { ok: true }; // fail open
  }

  const decision = wipAdvanceDecision({ promotingNumber: me, children });
  if (decision.ok) return { ok: true };
  return {
    ok: false,
    blockers: [
      `wip-budget-exceeded: ${decision.reason}. Finish or park the advancing sibling first, or make #${me} its blocker. Override: TASK_TRACKER_FORCE_PROMOTE=1`,
    ],
  };
}

// Epic states at which new sub-issues may be created. A Done epic must not grow
// new children (it would have to reopen). Backlog/Refine/Plan/Develop/Test/
// Review all admit children; Done refuses.
const CHILD_CREATION_EPIC_STATES = new Set([
  'backlog',
  'refine',
  'plan',
  'develop',
  'test',
  'review',
]);

/**
 * Whether a sub-issue may be created under an epic at the given board state.
 * @param {string} state epic board state
 * @returns {boolean} true for backlog/refine/plan/develop/test/review; false for
 *   done (or any unrecognized state).
 */
export function childCreationAllowedAtEpicState(state) {
  return CHILD_CREATION_EPIC_STATES.has(String(state || '').toLowerCase());
}

// Default per-child body fetch (used by enrichChildrenWithBlockedBy). Returns
// the issue body text, or '' on any failure (treated as no blockers).
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
 * Attach a `blockedBy` (number[]) field to each child by reading its
 * `aitm-blocked-by` body marker (via child (b)'s `parseBlockedBy`). Per-child
 * fetch/parse failure is non-fatal → that child gets `blockedBy: []`.
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
      try {
        const body = await fetchBody({ issueNumber: child.number, cfg });
        return { ...child, blockedBy: parseBlockedBy(body) };
      } catch {
        return { ...child, blockedBy: [] };
      }
    })
  );
}
