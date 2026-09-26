// @story #1825
// Pure local-trunk close decision plus read-only observation helpers.
import { buildDeliveryScope } from './workflow-policy/delivery-scope.mjs';

const SHA = /^[0-9a-f]{40}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const OPERATION = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const validBranch = (value) =>
  typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) &&
  !value.includes('..') &&
  !value.includes('//') &&
  !value.endsWith('/');
const result = (outcome, reasonId) => Object.freeze({ outcome, reasonId });
const missing = (reasonId) => result('missing', reasonId);
const unknown = (reasonId) => result('indeterminate', reasonId);

/** A complete PR inventory is explicit; a failed or partial read is never an empty list. */
export function parseCompletePullRequestPages(pages, branch, acceptedSha = null) {
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page)))
    throw new TypeError('local-trunk-proof:pr-pages');
  if (typeof branch !== 'string' || !branch) throw new TypeError('local-trunk-proof:branch');
  const values = [];
  const seen = new Set();
  for (const pr of pages.flat()) {
    if (
      !Number.isSafeInteger(pr?.number) ||
      pr.number <= 0 ||
      typeof pr?.head?.ref !== 'string' ||
      !SHA.test(pr?.head?.sha ?? '') ||
      typeof pr?.base?.ref !== 'string' ||
      seen.has(pr.number)
    )
      throw new TypeError('local-trunk-proof:pr-record');
    seen.add(pr.number);
    if (pr.head.ref === branch || pr.head.sha === acceptedSha)
      values.push({
        number: pr.number,
        headRefName: pr.head.ref,
        headRefOid: pr.head.sha,
        baseRefName: pr.base.ref,
      });
  }
  return Object.freeze({ complete: true, values });
}

/** Observe named local and remote refs using complete local objects. The caller separately proves remote freshness. */
export async function observeLocalTrunkGraph({ acceptedSha, localRef, remoteRef, run }) {
  if (
    !SHA.test(acceptedSha ?? '') ||
    !validBranch(localRef) ||
    !remoteRef ||
    typeof run !== 'function'
  )
    throw new TypeError('local-trunk-proof:graph-input');
  const shallow = (await run(['rev-parse', '--is-shallow-repository'])) === 'true';
  if (shallow)
    return Object.freeze({
      complete: false,
      shallow: true,
      localContains: false,
      remoteContains: false,
    });
  const [localSha, remoteSha] = await Promise.all([
    run(['rev-parse', '--verify', `refs/heads/${localRef}^{commit}`]),
    run(['rev-parse', '--verify', `${remoteRef}^{commit}`]),
  ]);
  if (!SHA.test(localSha) || !SHA.test(remoteSha))
    throw new TypeError('local-trunk-proof:ref-object');
  await run(['cat-file', '-e', `${acceptedSha}^{commit}`]);
  const contains = async (tip) => {
    try {
      await run(['merge-base', '--is-ancestor', acceptedSha, tip]);
      return true;
    } catch (error) {
      if (Number(error?.code) === 1) return false;
      throw error;
    }
  };
  return Object.freeze({
    complete: true,
    shallow: false,
    localRef,
    remoteRef,
    localSha,
    remoteSha,
    localContains: await contains(localSha),
    remoteContains: await contains(remoteSha),
  });
}

/** Verify scope and delivery facts without reading GitHub, Git, or the exception journal. */
export function evaluateLocalTrunkCloseProof(facts) {
  if (!facts || typeof facts !== 'object') return unknown('facts-unavailable');
  if (facts.ordinaryDeliverySatisfied === true) return result('satisfied', null);
  if (facts.state !== 'review') return missing('issue-not-review');
  if (facts.topLevel !== true || facts.commitBearing !== true) return missing('issue-kind');
  if (facts.branchBound !== true || facts.worktreeBound !== true)
    return unknown('binding-unavailable');
  if (!SHA.test(facts.acceptedSha ?? '')) return unknown('accepted-sha-unavailable');
  if (facts.testSha !== facts.acceptedSha) return missing('test-sha-mismatch');
  if (facts.reviewSha !== facts.acceptedSha) return missing('review-sha-mismatch');
  const inventory = facts.pullRequests;
  if (inventory?.complete !== true || !Array.isArray(inventory.values))
    return unknown('pr-inventory-incomplete');
  if (
    inventory.values.some(
      (pr) => !Number.isSafeInteger(pr?.number) || !SHA.test(pr?.headRefOid ?? '')
    )
  )
    return unknown('pr-inventory-malformed');
  if (inventory.values.length > 0) return missing('pr-candidate');
  const graph = facts.graph;
  if (graph?.shallow === true) return unknown('graph-shallow');
  if (graph?.complete !== true || graph.shallow !== false) return unknown('graph-incomplete');
  if (graph.localRef && graph.localRef !== facts.localRef) return unknown('local-ref-mismatch');
  if (graph.remoteRef && graph.remoteRef !== facts.remoteRef) return unknown('remote-ref-mismatch');
  if (graph.localContains !== true) return missing('local-unreachable');
  if (graph.remoteContains !== true) return missing('remote-unreachable');
  if (facts.grant?.active !== true) return missing('grant-inactive');
  if (
    !OPERATION.test(facts.deliveryOperationId ?? '') ||
    !HASH.test(facts.waiverScopeDigest ?? '') ||
    !HASH.test(facts.scopeIdentity ?? '')
  )
    return unknown('scope-facts-unavailable');
  let scope;
  try {
    scope = buildDeliveryScope(facts.grant.scope).scope;
  } catch {
    return unknown('grant-malformed');
  }
  if (
    scope.exceptionKind !== 'delivery.local-trunk-close-authorization' ||
    scope.requirementId !== 'delivery.local-trunk-close-authorization' ||
    scope.pullRequest !== null ||
    scope.repository !== facts.repository ||
    scope.issue !== facts.issue ||
    scope.acceptedHeadSha !== facts.acceptedSha ||
    scope.baseRef !== facts.localRef ||
    scope.resolvedTrunkRef !== facts.remoteRef ||
    scope.deliveryOperationId !== facts.deliveryOperationId ||
    buildDeliveryScope(scope).waiverScopeDigest !== facts.waiverScopeDigest ||
    facts.grant.scopeIdentity !== facts.scopeIdentity
  )
    return missing('grant-scope-mismatch');
  return result('authorized-local-trunk-close', null);
}

/** Resolve a remote branch independently of its potentially stale tracking ref. */
export async function observeFreshLocalTrunkGraph({
  acceptedSha,
  localRef,
  remote,
  branch,
  run,
  fetchRemoteTip,
}) {
  if (
    !remote ||
    !validBranch(branch) ||
    !validBranch(localRef) ||
    !SHA.test(acceptedSha ?? '') ||
    typeof run !== 'function'
  )
    throw new TypeError('local-trunk-proof:remote-input');
  const remoteRef = `${remote}/${branch}`;
  const line = await run(['ls-remote', '--exit-code', remote, `refs/heads/${branch}`]);
  const parts = line.trim().split(/\s+/);
  if (parts.length !== 2 || !SHA.test(parts[0]) || parts[1] !== `refs/heads/${branch}`)
    throw new TypeError('local-trunk-proof:remote-ref');
  const remoteSha = parts[0];
  const shallow = (await run(['rev-parse', '--is-shallow-repository'])) === 'true';
  if (shallow) return Object.freeze({ complete: false, shallow: true, localRef, remoteRef });
  const localSha = await run(['rev-parse', '--verify', `refs/heads/${localRef}^{commit}`]);
  if (!SHA.test(localSha)) throw new TypeError('local-trunk-proof:local-ref');
  const ensureCommit = async (sha) => run(['cat-file', '-e', `${sha}^{commit}`]);
  await ensureCommit(acceptedSha);
  try {
    await ensureCommit(remoteSha);
  } catch (error) {
    if (typeof fetchRemoteTip !== 'function') throw error;
    await fetchRemoteTip({ remote, branch, expectedSha: remoteSha });
    await ensureCommit(remoteSha);
  }
  const contains = async (tip) => {
    try {
      await run(['merge-base', '--is-ancestor', acceptedSha, tip]);
      return true;
    } catch (error) {
      if (Number(error?.code) === 1) return false;
      throw error;
    }
  };
  return Object.freeze({
    complete: true,
    shallow: false,
    localRef,
    remoteRef,
    localSha,
    remoteSha,
    localContains: await contains(localSha),
    remoteContains: await contains(remoteSha),
  });
}

/** Both advisory and effect-time callers use this collector; the caller chooses whether remote objects may be fetched. */
export async function collectLocalTrunkCloseProof({
  facts,
  branch,
  remote,
  remoteBranch,
  runGit,
  listPullRequestPages,
  fetchRemoteTip,
}) {
  if (typeof listPullRequestPages !== 'function' || typeof runGit !== 'function')
    return unknown('read-port-unavailable');
  let pullRequests;
  try {
    pullRequests = parseCompletePullRequestPages(
      await listPullRequestPages(),
      branch,
      facts?.acceptedSha
    );
  } catch {
    return unknown('pr-inventory-incomplete');
  }
  let graph;
  try {
    graph = await observeFreshLocalTrunkGraph({
      acceptedSha: facts?.acceptedSha,
      localRef: facts?.localRef,
      remote,
      branch: remoteBranch,
      run: runGit,
      fetchRemoteTip,
    });
  } catch {
    return unknown('graph-incomplete');
  }
  return evaluateLocalTrunkCloseProof({ ...facts, pullRequests, graph });
}
