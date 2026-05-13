// Wave admission gate for the Grooming → Analysis transition on epic sub-issues.
//
// `admit({ parentEpicNumber, sequence, repo, projectId, fetchSiblings })`
// returns `{ ok, blockers }`.
//
// Pure function modulo the injectable `fetchSiblings`. Tests pass a stub;
// production wiring uses the default GraphQL implementation in
// `defaultFetchSiblings` below.
//
// Semantics:
// - **Solo bypass.** When `parentEpicNumber` is null/undefined, return
//   `{ ok: true, blockers: [] }` without calling `fetchSiblings`.
// - **Wave admission.** A sibling blocks iff its `sequence` is strictly LESS
//   than this issue's `sequence` AND its board state is one of the
//   "in-flight" states. In-flight = past Backlog and before R4R/Done:
//   `grooming | analyze | development | validate | review`.
// - **Same-Sequence siblings (newcomers).** Never block. Members of the same
//   wave advance independently.
// - **Higher-Sequence siblings.** Never block (they are the next wave).
// - **Backlog siblings.** Excluded — backlog is unvetted ideas; not in flight.
// - **Review / Done siblings.** Excluded — terminal states never block.
//
// `fetchSiblings({ parentEpicNumber, repo, projectId })` must return an array
// of sibling descriptors `{ number, sequence, state }` where `state` is one
// of the lower-cased 7-state slugs (or `'backlog'`, `'review'`, `'done'`).

import { gql, splitRepo } from './github-projects.mjs';

const IN_FLIGHT_STATES = new Set(['refine', 'plan', 'develop', 'test', 'review']);

export function admit({
  parentEpicNumber,
  sequence,
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
    const mySeq = Number(sequence);
    for (const sib of siblings || []) {
      if (sib.number === undefined || sib.number === null) continue;
      if (sib.sequence === undefined || sib.sequence === null || sib.sequence === '') continue;
      const sibSeq = Number(sib.sequence);
      if (!Number.isFinite(sibSeq) || !Number.isFinite(mySeq)) continue;
      if (sibSeq >= mySeq) continue; // same wave or later — never blocks
      const state = String(sib.state || '').toLowerCase();
      if (!IN_FLIGHT_STATES.has(state)) continue; // backlog / r4r / done excluded
      blockers.push({ issue: sib.number, sequence: sibSeq, state });
    }
    return { ok: blockers.length === 0, blockers };
  });
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
  const subs = data?.repository?.issue?.subIssues?.nodes || [];
  const out = [];
  for (const sub of subs) {
    if (!sub) continue;
    const item = (sub.projectItems?.nodes || []).find((n) => n?.project?.id === projectId);
    let state = '';
    let sequence = null;
    if (item) {
      for (const fv of item.fieldValues.nodes || []) {
        const fname = fv?.field?.name;
        if (!fname) continue;
        if (fname.toLowerCase() === 'status' && fv.name) state = String(fv.name).toLowerCase();
        else if (fname.toLowerCase() === 'sequence' && fv.number != null)
          sequence = Number(fv.number);
      }
    }
    // GitHub closed sub-issues that aren't on the board count as Done.
    if (!state && sub.state === 'CLOSED') state = 'done';
    out.push({ number: sub.number, sequence, state });
  }
  return out;
}
