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
// - **Same-Rank siblings (newcomers).** This rank-order reader does not order
//   them against one another. It does not authorize concurrent execution; the
//   strict local WIP gate independently permits only one active epic child.
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
import { parseBlockedByStrict } from '../../task-tracker/lib/blocked-marker.mjs';
import {
  hasUnauthorizedCloseRecoveryMarker,
  readUnauthorizedCloseRecovery,
} from '../../task-tracker/lib/closed-issue-convergence.mjs';
import { normalizeStateId } from '../../task-tracker/lib/lifecycle-policy/index.mjs';
import { fieldIdFor } from '../../task-tracker/project-fields.mjs';
import { verifyRefinementSnapshot } from '../../task-tracker/lib/refinement-snapshot.mjs';

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
export async function defaultFetchSiblings({ parentEpicNumber, repo, projectId, cfg = {} } = {}) {
  if (!repo) throw new Error('wave-admission: repo is required');
  if (!projectId) throw new Error('wave-admission: projectId is required');
  const nodes = await fetchAllSubIssueNodes({ parentEpicNumber, repo, projectId });
  return mapSubIssueNodes(nodes, { ...cfg, projectId });
}

function projectFieldSelection() {
  return `
    nodes {
      ... on ProjectV2ItemFieldNumberValue {
        number
        field { ... on ProjectV2FieldCommon { id name } }
      }
      ... on ProjectV2ItemFieldSingleSelectValue {
        name
        field { ... on ProjectV2FieldCommon { id name } }
      }
    }
    pageInfo { hasNextPage endCursor }
  `;
}

export async function fetchConfiguredProjectItem({
  issueNumber,
  repo,
  projectId,
  gqlFn = gql,
} = {}) {
  if (!repo || !projectId) throw new Error('wave-admission: configured project is required');
  const { owner, repoName } = splitRepo(repo);
  const matches = [];
  const seenMembershipCursors = new Set();
  let after = null;

  for (let page = 0; page < 1000; page++) {
    const data = await gqlFn(
      `query($owner: String!, $repo: String!, $issue: Int!, $after: String) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issue) {
            projectItems(first: 50, after: $after) {
              nodes {
                id
                project { id }
                fieldValues(first: 100) { ${projectFieldSelection()} }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }`,
      { owner, repo: repoName, issue: Number(issueNumber), after }
    );
    const connection = data?.repository?.issue?.projectItems;
    if (!connection || !Array.isArray(connection.nodes) || !connection.pageInfo) {
      throw new Error('wave-admission: configured project membership unreadable');
    }
    matches.push(...connection.nodes.filter((item) => item?.project?.id === projectId));
    if (!connection.pageInfo.hasNextPage) break;
    const next = connection.pageInfo.endCursor;
    if (!next) throw new Error('wave-admission: project membership page missing end cursor');
    if (seenMembershipCursors.has(next)) {
      throw new Error('wave-admission: repeated project membership cursor');
    }
    seenMembershipCursors.add(next);
    after = next;
    if (page === 999) throw new Error('wave-admission: project membership safety limit exceeded');
  }

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? 'wave-admission: configured project membership missing'
        : 'wave-admission: configured project membership ambiguous'
    );
  }
  const item = matches[0];
  const initialFields = item.fieldValues;
  if (!initialFields || !Array.isArray(initialFields.nodes) || !initialFields.pageInfo) {
    throw new Error('wave-admission: configured project fields unreadable');
  }
  const fieldNodes = [...initialFields.nodes];
  const seenFieldCursors = new Set();
  let fieldAfter = initialFields.pageInfo.endCursor;
  let hasNextFields = initialFields.pageInfo.hasNextPage;
  for (let page = 0; hasNextFields && page < 1000; page++) {
    if (!fieldAfter) throw new Error('wave-admission: project fields page missing end cursor');
    if (seenFieldCursors.has(fieldAfter)) {
      throw new Error('wave-admission: repeated project fields cursor');
    }
    seenFieldCursors.add(fieldAfter);
    const data = await gqlFn(
      `query($item: ID!, $after: String) {
        node(id: $item) {
          ... on ProjectV2Item {
            fieldValues(first: 100, after: $after) { ${projectFieldSelection()} }
          }
        }
      }`,
      { item: item.id, after: fieldAfter }
    );
    const fields = data?.node?.fieldValues;
    if (!fields || !Array.isArray(fields.nodes) || !fields.pageInfo) {
      throw new Error('wave-admission: configured project fields unreadable');
    }
    fieldNodes.push(...fields.nodes);
    hasNextFields = fields.pageInfo.hasNextPage;
    fieldAfter = fields.pageInfo.endCursor;
    if (hasNextFields && page === 999) {
      throw new Error('wave-admission: project fields safety limit exceeded');
    }
  }
  return {
    ...item,
    fieldValues: { nodes: fieldNodes, pageInfo: { hasNextPage: false, endCursor: null } },
  };
}

export async function fetchAllSubIssueNodes({
  parentEpicNumber,
  repo,
  projectId,
  gqlFn = gql,
} = {}) {
  if (!repo) throw new Error('wave-admission: repo is required');
  if (!Number.isSafeInteger(Number(parentEpicNumber)) || Number(parentEpicNumber) <= 0) {
    throw new Error('wave-admission: parentEpicNumber is required');
  }
  const { owner, repoName } = splitRepo(repo);
  const nodes = [];
  const seenNodeIds = new Set();
  const seenIssueNumbers = new Set();
  const seenCursors = new Set();
  let expectedTotalCount = null;
  let after = null;

  for (let page = 0; page < 1000; page++) {
    const data = await gqlFn(
      `
    query($owner: String!, $repo: String!, $issue: Int!, $after: String) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          subIssues(first: 100, after: $after) {
            totalCount
            nodes {
              id
              number
              title
              state
              stateReason
              body
              labels(first: 100) {
                nodes { name }
                pageInfo { hasNextPage }
              }
              projectItems(first: 20) {
                nodes {
                  id
                  project { id }
                  fieldValues(first: 100) {
                    nodes {
                      ... on ProjectV2ItemFieldNumberValue {
                        number
                        field { ... on ProjectV2FieldCommon { id name } }
                      }
                      ... on ProjectV2ItemFieldSingleSelectValue {
                        name
                        field { ... on ProjectV2FieldCommon { id name } }
                      }
                    }
                    pageInfo { hasNextPage }
                  }
                }
                pageInfo { hasNextPage }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }`,
      { owner, repo: repoName, issue: Number(parentEpicNumber), after }
    );
    const connection = data?.repository?.issue?.subIssues;
    if (!connection) throw new Error('wave-admission: parent issue or sub-issues unreadable');
    if (!Array.isArray(connection.nodes) || !connection.pageInfo) {
      throw new Error('wave-admission: malformed sub-issue page');
    }
    const pageTotalCount = Number(connection.totalCount);
    if (!Number.isSafeInteger(pageTotalCount) || pageTotalCount < 0) {
      throw new Error('wave-admission: sub-issue total count unreadable');
    }
    if (expectedTotalCount === null) expectedTotalCount = pageTotalCount;
    else if (pageTotalCount !== expectedTotalCount) {
      throw new Error('wave-admission: sub-issue snapshot count changed during pagination');
    }
    for (const node of connection.nodes) {
      const nodeId = String(node?.id || '').trim();
      const issueNumber = Number(node?.number);
      if (!nodeId || !Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
        throw new Error('wave-admission: malformed sub-issue identity');
      }
      if (seenNodeIds.has(nodeId) || seenIssueNumbers.has(issueNumber)) {
        throw new Error('wave-admission: duplicate sub-issue identity');
      }
      seenNodeIds.add(nodeId);
      seenIssueNumbers.add(issueNumber);
      nodes.push(node);
    }
    if (!connection.pageInfo?.hasNextPage) {
      if (nodes.length !== expectedTotalCount) {
        throw new Error('wave-admission: sub-issue snapshot count mismatch');
      }
      if (projectId) {
        for (const sub of nodes) {
          const projectItems = sub?.projectItems;
          const configured = projectItems?.nodes?.filter((item) => item?.project?.id === projectId);
          const needsHydration =
            !Array.isArray(projectItems?.nodes) ||
            !projectItems?.pageInfo ||
            projectItems.pageInfo.hasNextPage ||
            configured?.length !== 1 ||
            !configured[0]?.fieldValues?.pageInfo ||
            configured[0].fieldValues.pageInfo.hasNextPage;
          if (!needsHydration) continue;
          const item = await fetchConfiguredProjectItem({
            issueNumber: sub?.number,
            repo,
            projectId,
            gqlFn,
          });
          sub.projectItems = {
            nodes: [item],
            pageInfo: { hasNextPage: false, endCursor: null },
          };
        }
      }
      const verifiedIdentities = await fetchSubIssueIdentities({
        owner,
        repoName,
        parentEpicNumber,
        gqlFn,
      });
      const initialIdentities = nodes.map((node) => `${node.id}:${node.number}`).sort();
      if (JSON.stringify(initialIdentities) !== JSON.stringify(verifiedIdentities)) {
        throw new Error('wave-admission: sub-issue snapshot changed during verification');
      }
      return nodes;
    }
    const next = connection.pageInfo.endCursor;
    if (!next) throw new Error('wave-admission: sub-issue page missing end cursor');
    if (seenCursors.has(next)) throw new Error('wave-admission: repeated sub-issue cursor');
    seenCursors.add(next);
    after = next;
  }
  throw new Error('wave-admission: sub-issue pagination safety limit exceeded');
}

async function fetchSubIssueIdentities({ owner, repoName, parentEpicNumber, gqlFn } = {}) {
  const identities = [];
  const seenIds = new Set();
  const seenNumbers = new Set();
  const seenCursors = new Set();
  let expectedTotalCount = null;
  let after = null;

  for (let page = 0; page < 1000; page++) {
    const data = await gqlFn(
      `query($owner: String!, $repo: String!, $issue: Int!, $after: String) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issue) {
            subIssues(first: 100, after: $after) {
              totalCount
              nodes { id number }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }`,
      { owner, repo: repoName, issue: Number(parentEpicNumber), after }
    );
    const connection = data?.repository?.issue?.subIssues;
    if (!connection || !Array.isArray(connection.nodes) || !connection.pageInfo) {
      throw new Error('wave-admission: sub-issue verification unreadable');
    }
    const totalCount = Number(connection.totalCount);
    if (!Number.isSafeInteger(totalCount) || totalCount < 0) {
      throw new Error('wave-admission: sub-issue verification count unreadable');
    }
    if (expectedTotalCount === null) expectedTotalCount = totalCount;
    else if (expectedTotalCount !== totalCount) {
      throw new Error('wave-admission: sub-issue snapshot changed during verification');
    }
    for (const node of connection.nodes) {
      const id = String(node?.id || '').trim();
      const number = Number(node?.number);
      if (!id || !Number.isSafeInteger(number) || number <= 0) {
        throw new Error('wave-admission: malformed sub-issue verification identity');
      }
      if (seenIds.has(id) || seenNumbers.has(number)) {
        throw new Error('wave-admission: duplicate sub-issue verification identity');
      }
      seenIds.add(id);
      seenNumbers.add(number);
      identities.push(`${id}:${number}`);
    }
    if (!connection.pageInfo.hasNextPage) {
      if (identities.length !== expectedTotalCount) {
        throw new Error('wave-admission: sub-issue verification count mismatch');
      }
      return identities.sort();
    }
    const next = connection.pageInfo.endCursor;
    if (!next) throw new Error('wave-admission: sub-issue verification missing end cursor');
    if (seenCursors.has(next)) {
      throw new Error('wave-admission: repeated sub-issue verification cursor');
    }
    seenCursors.add(next);
    after = next;
  }
  throw new Error('wave-admission: sub-issue verification safety limit exceeded');
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
export function mapSubIssueNodes(subs, cfgOrProjectId) {
  const cfg =
    typeof cfgOrProjectId === 'string'
      ? { projectId: cfgOrProjectId }
      : { ...(cfgOrProjectId || {}) };
  const projectId = cfg.projectId;
  const out = [];
  if (!Array.isArray(subs)) return out;
  for (const sub of subs) {
    if (!sub || !Number.isSafeInteger(Number(sub.number))) {
      out.push({
        number: null,
        rank: null,
        state: '',
        boardState: '',
        issueState: '',
        closeReason: null,
        recoveryPhase: null,
        recoveryTx: null,
        blockedBy: null,
        hasCurrentRefinement: false,
        childEvidenceError: 'malformed child descriptor',
      });
      continue;
    }
    const projectMatches = (sub.projectItems?.nodes || []).filter(
      (node) => node?.project?.id === projectId
    );
    const item = projectMatches.length === 1 ? projectMatches[0] : null;
    let state = '';
    let rank = null;
    if (item) {
      for (const fv of item.fieldValues?.nodes || []) {
        const fname = fv?.field?.name;
        const fieldId = fv?.field?.id;
        if (!fname) continue;
        const statusMatches = cfg.kanbanFieldId
          ? fieldId === cfg.kanbanFieldId
          : fname.toLowerCase() === 'status';
        const rankId = fieldIdFor(cfg, 'rank') || cfg.rankFieldId;
        const rankMatches = rankId
          ? fieldId === rankId
          : fname.toLowerCase() === 'rank' || fname.toLowerCase() === 'sequence';
        if (statusMatches && fv.name) state = normalizeStateId(fv.name) || '';
        else if (rankMatches && fv.number != null) rank = Number(fv.number);
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
    const recoveryMarkerPresent = hasUnauthorizedCloseRecoveryMarker(sub.body);
    const recovery = readUnauthorizedCloseRecovery(sub.body);
    const pendingRecovery = recovery?.phase !== 'complete' ? recovery : null;
    const closeReason = normalizeCloseReason(sub);
    const issueClosed = String(sub.state || '').toUpperCase() === 'CLOSED';
    const labels = sub.labels;
    let blockedBy = null;
    let childEvidenceError = null;
    try {
      blockedBy = parseBlockedByStrict(sub.body);
    } catch (error) {
      childEvidenceError = error.message;
    }
    let hasCurrentRefinement = false;
    if (childEvidenceError) {
      // Strict blocker evidence is required before any child can be admitted.
    } else if (recoveryMarkerPresent && !recovery)
      childEvidenceError = 'unauthorized-close recovery marker malformed';
    else if (projectMatches.length > 1)
      childEvidenceError = 'configured project membership ambiguous';
    else if (!item) childEvidenceError = 'configured project membership missing';
    else if (sub.projectItems?.pageInfo?.hasNextPage)
      childEvidenceError = 'project membership incomplete';
    else if (item.fieldValues?.pageInfo?.hasNextPage)
      childEvidenceError = 'project fields incomplete';
    else if (!labels || labels.pageInfo?.hasNextPage || !Array.isArray(labels.nodes)) {
      childEvidenceError = 'labels incomplete';
    } else if (issueClosed) {
      // Terminal children do not need a still-current refinement snapshot.
      // Their authoritative evidence is the recognized GitHub disposition,
      // raw configured-board Status, and durable recovery phase.
      if (!closeReason) childEvidenceError = 'closed child disposition unreadable';
    } else {
      const verified = verifyRefinementSnapshot(sub.body, {
        labels: labels.nodes.map((label) => label?.name).filter(Boolean),
      });
      const snapshotRank = verified.snapshot?.fields?.rank;
      const snapshotBlocked = String(verified.snapshot?.fields?.blockedBy || '')
        .split(',')
        .map((value) => Number(String(value).trim().replace(/^#/, '')))
        .filter((value) => Number.isSafeInteger(value) && value > 0)
        .sort((a, b) => a - b);
      if (!verified.ok) childEvidenceError = verified.reason;
      else if (!Number.isFinite(rank) || Number(snapshotRank) !== Number(rank)) {
        childEvidenceError = 'live board rank disagrees with refinement snapshot';
      } else if (JSON.stringify(snapshotBlocked) !== JSON.stringify(blockedBy)) {
        childEvidenceError = 'live dependencies disagree with refinement snapshot';
      } else hasCurrentRefinement = true;
    }
    out.push({
      number: sub.number,
      rank,
      state,
      boardState,
      issueState: String(sub.state || '').toLowerCase(),
      closeReason,
      recoveryPhase: pendingRecovery?.phase ?? null,
      recoveryTx: pendingRecovery?.tx ?? null,
      blockedBy,
      hasCurrentRefinement,
      ...(childEvidenceError ? { childEvidenceError } : {}),
    });
  }
  return out;
}
