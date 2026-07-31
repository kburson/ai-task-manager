// #545 — Re-title a parent issue with the epic prefix on first child link.
//
// Epic-ness is dynamic: an issue becomes an epic the moment it gains its first
// sub-issue. The two `addSubIssue`/`linkSubIssue` call sites
// (`ensure-wave-parent.mjs`, `lib/project-tether.mjs`) call this after the link
// mutation succeeds. Idempotent — a parent already carrying `🧑‍🧒‍🧒 [Epic] ` is
// left untouched, so re-linking further children never re-titles.
//
// `runGql(query, variables) => Promise<data>` is injected so the helper rides
// each caller's existing GraphQL client (and is unit-testable offline).

import { EPIC_PREFIX, ensureEpicPrefix } from './kind-prefix.mjs';

export async function ensureParentEpicTitle({
  parentId,
  runGql,
  withGovernedEffect,
  authorityIssueId,
}) {
  if (!parentId) throw new Error('ensureParentEpicTitle: parentId is required');
  if (typeof runGql !== 'function') {
    throw new Error('ensureParentEpicTitle: runGql function is required');
  }

  const data = await runGql(`query($id:ID!){ node(id:$id){ ... on Issue { title } } }`, {
    id: parentId,
  });
  const current = data?.node?.title;
  if (typeof current !== 'string') {
    return { status: 'no-title', parentId };
  }
  if (current.startsWith(EPIC_PREFIX)) {
    return { status: 'already-epic', parentId };
  }

  const next = ensureEpicPrefix(current);
  const update = () =>
    runGql(
      `mutation($id:ID!,$title:String!){ updateIssue(input:{id:$id,title:$title}){ issue { id } } }`,
      { id: parentId, title: next }
    );
  if (typeof withGovernedEffect === 'function') {
    if (!authorityIssueId) {
      throw new Error('ensureParentEpicTitle: authorityIssueId is required');
    }
    await withGovernedEffect(
      {
        issueId: String(authorityIssueId).replace(/^#/, ''),
        operation: 'evidence-mutation',
        heartbeat: true,
      },
      update
    );
  } else {
    await update();
  }
  return { status: 're-titled', parentId, title: next };
}
