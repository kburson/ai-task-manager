// #545/#1130 — Reconcile parent Epic metadata on first child link.
//
// Epic-ness is dynamic: an issue becomes an epic the moment it gains its first
// sub-issue. The two `addSubIssue`/`linkSubIssue` call sites
// (`ensure-wave-parent.mjs`, `lib/project-tether.mjs`) call this after the link
// mutation succeeds. The compatibility export now delegates to the canonical
// metadata boundary so body kind/DoD, label, and title converge together.
//
// `runGql(query, variables) => Promise<data>` resolves the parent issue identity;
// the reconciler is injected so the adapter remains unit-testable offline.

import { EPIC_PREFIX } from './kind-prefix.mjs';
import { reconcileEpicMetadata as defaultReconcileEpicMetadata } from './epic-metadata.mjs';

export async function ensureParentEpicTitle({
  parentId,
  issueNumber,
  repo,
  runGql,
  reconcileEpicMetadata = defaultReconcileEpicMetadata,
}) {
  if (!parentId) throw new Error('ensureParentEpicTitle: parentId is required');
  if (typeof runGql !== 'function') {
    throw new Error('ensureParentEpicTitle: runGql function is required');
  }

  const data = await runGql(
    `query($id:ID!){ node(id:$id){ ... on Issue { number title repository { nameWithOwner } } } }`,
    { id: parentId }
  );
  const current = data?.node?.title;
  if (typeof current !== 'string') {
    return { status: 'no-title', parentId };
  }
  const resolvedIssueNumber = Number(issueNumber ?? data?.node?.number);
  const resolvedRepo = repo || data?.node?.repository?.nameWithOwner;
  if (!Number.isInteger(resolvedIssueNumber) || !resolvedRepo) {
    throw new Error('ensureParentEpicTitle: parent issue identity is incomplete');
  }
  const result = await reconcileEpicMetadata({
    issueNumber: resolvedIssueNumber,
    repo: resolvedRepo,
    forceEpic: true,
  });
  if (result.status === 'already-converged' && current.startsWith(EPIC_PREFIX)) {
    return { status: 'already-epic', parentId };
  }
  return {
    status: 'reconciled',
    parentId,
    issueNumber: resolvedIssueNumber,
    repo: resolvedRepo,
  };
}
