// Wave admission gate for the Grooming → Analysis transition on epic sub-issues.
//
// `admit({ parentEpicNumber, rank, repo, projectId, fetchSiblings })`
// returns `{ ok, blockers }`.
//
// Pure function modulo the injectable `fetchSiblings`. Tests pass a stub;
// production wiring uses the default GraphQL implementation in
// `defaultFetchSiblings` below.
//
// Semantics:
// - **Solo bypass.** When `parentEpicNumber` is null/undefined, return
//   `{ ok: true, blockers: [] }` without calling `fetchSiblings`.
// - **Wave admission.** A sibling blocks iff its `rank` is strictly LESS
//   than this issue's `rank` AND its board state is one of the
//   "in-flight" states. In-flight = past Backlog and before Review/Done:
//   `grooming | analyze | development | validate | review`.
// - **Same-Rank siblings (newcomers).** Never block. Members of the same
//   wave advance independently.
// - **Higher-Rank siblings.** Never block (they are the next wave).
// - **Backlog / Ready for Planning siblings.** Excluded — backlog is unvetted,
//   while R4P is a durable parking queue not yet admitted to JIT planning.
// - **Review / Done siblings.** Excluded — terminal states never block.
//
// `fetchSiblings({ parentEpicNumber, repo, projectId })` must return an array
// of sibling descriptors `{ number, rank, state }` where `state` is one
// of the lower-cased 8-state slugs (e.g. `'backlog'`, `'ready-for-plan'`,
// `'review'`, `'done'`).
//
// - **CLOSED is terminal (#947).** A sub-issue closed on GitHub always resolves
//   to `state: 'done'`, whatever column its board item was left in. The raw
//   column survives additively as `boardState`; the disposition survives as
//   `closeReason` (#888). Gates read `state`.

import { gql, splitRepo } from './github-projects.mjs';
import { readUnauthorizedCloseRecovery } from '../../task-tracker/lib/closed-issue-convergence.mjs';
import { normalizeStateId } from '../../task-tracker/lib/lifecycle-policy/index.mjs';

const IN_FLIGHT_STATES = new Set(['refine', 'plan', 'develop', 'test', 'review']);

export function admit({
  parentEpicNumber,
  rank,
  repo,
  projectId,
  fetchSiblings = defaultFetchSiblings,
} = {}) {
  // Solo bypass — no parent epic, no wave.
  if (parentEpicNumber == null) {
    return Promise.resolve({ ok: true, blockers: [] });
  }
  return Promise.resolve(fetchSiblings({ parentEpicNumber, repo, projectId })).then((siblings) => {
    const blockers = [];
    const myRank = Number(rank);
    for (const sib of siblings || []) {
      if (sib.number === undefined || sib.number === null) continue;
      const sibRankRaw = sib.rank ?? sib.sequence;
      if (sibRankRaw === undefined || sibRankRaw === null || sibRankRaw === '') continue;
      const sibRank = Number(sibRankRaw);
      if (!Number.isFinite(sibRank) || !Number.isFinite(myRank)) continue;
      if (sibRank >= myRank) continue; // same wave or later — never blocks
      const state = String(sib.state || '').toLowerCase();
      if (!IN_FLIGHT_STATES.has(state)) continue; // backlog / review / done excluded
      blockers.push({ issue: sib.number, rank: sibRank, state });
    }
    return { ok: blockers.length === 0, blockers };
  });
}

// #888 — GitHub's `IssueStateReason` enum, lower-snake-cased. Only meaningful on
// a CLOSED issue; an open one has no disposition to report.
export function normalizeCloseReason(sub) {
  if (!sub || String(sub.state || '').toUpperCase() !== 'CLOSED') return null;
  const raw = String(sub.stateReason || '').toLowerCase();
  return raw === 'not_planned' || raw === 'completed' ? raw : null;
}

// Default sibling fetcher. Queries the parent epic's sub-issues and resolves
// each sub-issue's project status (kanban single-select) and Sequence number.
//
// Throws if `repo` or `projectId` is missing — wave-admission is fail-closed.
export async function defaultFetchSiblings({ parentEpicNumber, repo, projectId } = {}) {
  if (!repo) throw new Error('wave-admission: repo is required');
  if (!projectId) throw new Error('wave-admission: projectId is required');
  const { owner, repoName } = splitRepo(repo);
  const data = await gql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          subIssues(first: 100) {
            nodes {
              number
              state
              stateReason
              body
              projectItems(first: 20) {
                nodes {
                  project { id }
                  fieldValues(first: 100) {
                    nodes {
                      ... on ProjectV2ItemFieldNumberValue {
                        number
                        field { ... on ProjectV2FieldCommon { name } }
                      }
                      ... on ProjectV2ItemFieldSingleSelectValue {
                        name
                        field { ... on ProjectV2FieldCommon { name } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { owner, repo: repoName, issue: Number(parentEpicNumber) }
  );
  return mapSubIssueNodes(data?.repository?.issue?.subIssues?.nodes, projectId);
}

/**
 * Pure mapping from the GraphQL sub-issue nodes to child descriptors.
 *
 * Split out of `defaultFetchSiblings` (#947) so the coercion rules are unit
 * testable against the exact node shape the query selects, without stubbing the
 * network.
 *
 * @param {Array|null|undefined} subs sub-issue nodes from the query above
 * @param {string} projectId the bound board's node id — only an item on THIS
 *   board contributes `Status` / `Rank`.
 * @returns {Array<{number:number, rank:number|null, state:string,
 *   boardState:string, closeReason:string|null, recoveryPhase:string|null,
 *   recoveryTx:string|null}>}
 */
export function mapSubIssueNodes(subs, projectId) {
  const out = [];
  for (const sub of subs || []) {
    if (!sub) continue;
    const item = (sub.projectItems?.nodes || []).find((n) => n?.project?.id === projectId);
    let state = '';
    let rank = null;
    if (item) {
      for (const fv of item.fieldValues?.nodes || []) {
        const fname = fv?.field?.name;
        if (!fname) continue;
        if (fname.toLowerCase() === 'status' && fv.name) state = normalizeStateId(fv.name) || '';
        else if (
          (fname.toLowerCase() === 'rank' || fname.toLowerCase() === 'sequence') &&
          fv.number != null
        )
          rank = Number(fv.number);
      }
    }
    // #947 — a CLOSED sub-issue is terminal, full stop. This coercion used to
    // carry an `!state &&` conjunct, so it fired only for a child with no item
    // on the bound board. A child that WAS on the board and got closed without
    // its `Status` being advanced kept that stale in-flight column forever —
    // and nothing could repair it, since no sanctioned verb moves the board for
    // a closed issue (`promote`/`demote` need an open bound issue, `move-state`
    // refuses direct invocation, `reconcile` rewrites the marker not the
    // column). Every consumer that trusts `state` — the three epic children
    // gates, `findNextEligibleChild`, `wipAdvanceDecision`, and `admit` above —
    // then read that child as in-flight and blocked its epic permanently.
    // Discovered on epic #859, whose child #945 was closed NOT_PLANNED from
    // Backlog and deadlocked the develop→test gate.
    const boardState = state;
    if (String(sub.state || '').toUpperCase() === 'CLOSED') state = 'done';
    // #888 — close disposition, additive. `{number, rank, state}` is unchanged
    // for every existing consumer; `closeReason` is normalized off GitHub's
    // `COMPLETED` / `NOT_PLANNED` enum so no caller sees the API casing. An OPEN
    // child gets `null`: "still open" is not a disposition, and the children-done
    // gate already refuses it.
    //
    // `boardState` (#947) is likewise additive: the raw column, preserved so
    // reporting and drift detection can still see where a closed child was
    // parked. No gate reads it — gates read the coerced `state`.
    //
    // #925 — parse recovery from the body already selected with this child.
    // The shared protected-marker reader ignores fenced examples and malformed
    // markers. A complete transaction is historical evidence, not pending
    // work, so it deliberately maps to null just like no marker.
    const recovery = readUnauthorizedCloseRecovery(sub.body);
    const pendingRecovery = recovery?.phase !== 'complete' ? recovery : null;
    out.push({
      number: sub.number,
      rank,
      state,
      boardState,
      closeReason: normalizeCloseReason(sub),
      recoveryPhase: pendingRecovery?.phase ?? null,
      recoveryTx: pendingRecovery?.tx ?? null,
    });
  }
  return out;
}
