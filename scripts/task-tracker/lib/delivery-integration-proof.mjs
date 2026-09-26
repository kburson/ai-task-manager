// @story #1811
// Prove the integration that GitHub actually recorded. The requested merge
// method and message are deliberately absent from this interface.

const SHA_RE = /^[0-9a-f]{40}$/;
const sha = (value) => typeof value === 'string' && SHA_RE.test(value);
const fail = (category) => {
  throw new TypeError(`delivery-integration:${category}`);
};

function freeze(value) {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') freeze(child);
  }
  return Object.freeze(value);
}

function validateInventory(sourceCommits, acceptedHeadSha) {
  if (!Array.isArray(sourceCommits) || sourceCommits.length === 0) fail('source-inventory');
  const seen = new Set();
  for (let index = 0; index < sourceCommits.length; index += 1) {
    const commit = sourceCommits[index];
    if (
      !sha(commit?.oid) ||
      seen.has(commit.oid) ||
      !sha(commit.tree) ||
      !Array.isArray(commit.parents) ||
      commit.parents.length !== 1 ||
      !sha(commit.parents[0]) ||
      typeof commit.message !== 'string' ||
      (index > 0 && commit.parents[0] !== sourceCommits[index - 1].oid)
    ) {
      fail('source-inventory');
    }
    seen.add(commit.oid);
  }
  if (sourceCommits.at(-1).oid !== acceptedHeadSha) fail('source-inventory');
}

export async function verifyObservedIntegration({
  repository,
  pullRequest,
  acceptedHeadSha,
  mergedCommitSha,
  sourceCommits,
  inspectCommit,
  isAncestor,
  compareContent,
  trunkRef,
} = {}) {
  if (
    typeof repository !== 'string' ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
    !sha(acceptedHeadSha) ||
    !sha(mergedCommitSha) ||
    !sha(pullRequest?.mergeCommitSha) ||
    typeof inspectCommit !== 'function' ||
    typeof isAncestor !== 'function' ||
    typeof compareContent !== 'function' ||
    !sha(trunkRef)
  )
    fail('input');
  if (
    pullRequest.headRefOid !== acceptedHeadSha ||
    pullRequest.mergeCommitSha !== mergedCommitSha
  ) {
    fail('accepted-head');
  }
  if (
    pullRequest.sourceCommitsComplete !== true ||
    pullRequest.sourceCommitsHeadSha !== acceptedHeadSha
  )
    fail('source-inventory');
  validateInventory(sourceCommits, acceptedHeadSha);
  const inspection = await inspectCommit({ commitSha: mergedCommitSha });
  if (
    !Array.isArray(inspection?.parents) ||
    inspection.parents.some((parent) => !sha(parent)) ||
    !sha(inspection.tree) ||
    typeof inspection.commitTitle !== 'string' ||
    typeof inspection.commitMessage !== 'string'
  )
    fail('merge-commit-evidence');
  if ((await isAncestor({ ancestor: mergedCommitSha, descendant: trunkRef })) !== true) {
    fail('trunk-reachability');
  }
  const parents = inspection.parents;
  const sourceBase = sourceCommits[0].parents[0];
  let method;
  let sourceMapping;
  let contentProof;
  if (parents.length === 2 && parents[1] === acceptedHeadSha && parents[0] !== acceptedHeadSha) {
    const equivalent = await compareContent({
      method: 'merge',
      sourceBase,
      sourceHead: acceptedHeadSha,
      integrationBase: parents[0],
      integrationHead: mergedCommitSha,
    });
    if (equivalent !== true) fail('content-mismatch');
    method = 'merge';
    sourceMapping = sourceCommits.map(({ oid }) => ({ source: oid, integrated: oid }));
    contentProof = {
      kind: 'equivalent-delta',
      sourceBase,
      sourceHead: acceptedHeadSha,
      integrationBase: parents[0],
      integrationHead: mergedCommitSha,
    };
  } else if (parents.length === 1 && mergedCommitSha !== acceptedHeadSha) {
    let replay = null;
    let inspected = null;
    let replayBase = null;
    let matchedSteps = 0;
    if (sourceCommits.length > 1) {
      const reverseReplay = [mergedCommitSha];
      const reverseInspect = [inspection];
      let validChain = true;
      for (let index = 1; index < sourceCommits.length; index += 1) {
        const nextSha = reverseInspect.at(-1).parents[0];
        if (!sha(nextSha) || nextSha === acceptedHeadSha) {
          validChain = false;
          break;
        }
        let next;
        try {
          next = await inspectCommit({ commitSha: nextSha });
        } catch {
          validChain = false;
          break;
        }
        if (
          !Array.isArray(next?.parents) ||
          next.parents.length !== 1 ||
          !sha(next.parents[0]) ||
          !sha(next.tree)
        ) {
          validChain = false;
          break;
        }
        reverseReplay.push(nextSha);
        reverseInspect.push(next);
      }
      if (validChain) {
        replay = reverseReplay.reverse();
        inspected = reverseInspect.reverse();
        replayBase = inspected[0].parents[0];
        if ((await isAncestor({ ancestor: sourceBase, descendant: replayBase })) === true) {
          for (let index = 0; index < sourceCommits.length; index += 1) {
            const source = sourceCommits[index];
            const equivalent = await compareContent({
              method: 'rebase-step',
              sourceBase: source.parents[0],
              sourceHead: source.oid,
              integrationBase: inspected[index].parents[0],
              integrationHead: replay[index],
            });
            if (equivalent === true) matchedSteps += 1;
          }
        }
      }
    }
    if (matchedSteps === sourceCommits.length) {
      const totalEquivalent = await compareContent({
        method: 'rebase-total',
        sourceBase,
        sourceHead: acceptedHeadSha,
        integrationBase: replayBase,
        integrationHead: mergedCommitSha,
      });
      if (totalEquivalent !== true) fail('content-mismatch');
      method = 'rebase';
      sourceMapping = sourceCommits.map(({ oid }, index) => ({
        source: oid,
        integrated: replay[index],
      }));
      contentProof = {
        kind: 'ordered-replay',
        sourceBase,
        sourceHead: acceptedHeadSha,
        integrationBase: replayBase,
        integrationHead: mergedCommitSha,
      };
    } else {
      // A partially matching replay is contradictory evidence, not a squash.
      if (matchedSteps > 0) fail('content-mismatch');
      if ((await isAncestor({ ancestor: sourceBase, descendant: parents[0] })) !== true) {
        fail('merge-topology');
      }
      const equivalent = await compareContent({
        method: 'squash',
        sourceBase,
        sourceHead: acceptedHeadSha,
        integrationBase: parents[0],
        integrationHead: mergedCommitSha,
      });
      if (equivalent !== true) fail('content-mismatch');
      method = 'squash';
      sourceMapping = sourceCommits.map(({ oid }) => ({
        source: oid,
        integrated: mergedCommitSha,
      }));
      contentProof = {
        kind: 'equivalent-delta',
        sourceBase,
        sourceHead: acceptedHeadSha,
        integrationBase: parents[0],
        integrationHead: mergedCommitSha,
      };
    }
  } else {
    fail('merge-topology');
  }
  return freeze({
    method,
    mergeCommitSha: mergedCommitSha,
    parents: [...parents],
    tree: inspection.tree,
    title: inspection.commitTitle,
    message: inspection.commitMessage,
    sourceMapping,
    contentProof,
  });
}

// Evaluate every independent predicate from one already collected observation.
// A failed dependency is indeterminate, never an implicit pass. The caller owns
// fetching and pinning the PR, checks, review, and trunk head before invocation.
export async function diagnoseDeliverySnapshot(snapshot = {}) {
  const failures = [];
  const record = (predicate, status, detail = null) => {
    if (status !== 'passed') failures.push({ predicate, status, detail });
  };
  const { intent, pullRequest } = snapshot;
  if (!intent || !pullRequest) {
    throw new TypeError('delivery-diagnosis:input');
  }
  record('pr-number', pullRequest.number === intent.prNumber ? 'passed' : 'failed');
  record(
    'base-ref',
    pullRequest.baseRefName === undefined
      ? 'indeterminate'
      : pullRequest.baseRefName === intent.baseRef
        ? 'passed'
        : 'failed'
  );
  record('accepted-head', pullRequest.headRefOid === intent.expectedHeadSha ? 'passed' : 'failed');
  record('test-head', snapshot.testReceiptSha === intent.expectedHeadSha ? 'passed' : 'failed');
  record(
    'review-head',
    snapshot.acceptedReviewSha === intent.expectedHeadSha ? 'passed' : 'failed'
  );
  record(
    'review-complete',
    snapshot.agentReviewPassed === true
      ? 'passed'
      : snapshot.agentReviewPassed === false
        ? 'failed'
        : 'indeterminate'
  );
  const checks = snapshot.requiredChecks;
  record(
    'required-checks',
    !Array.isArray(checks)
      ? 'indeterminate'
      : checks.every(
            (check) => check.headSha === intent.expectedHeadSha && check.conclusion === 'SUCCESS'
          )
        ? 'passed'
        : 'failed'
  );
  record(
    'source-attribution',
    snapshot.sourceAttribution === true
      ? 'passed'
      : snapshot.sourceAttribution === false
        ? 'failed'
        : 'indeterminate'
  );
  let reachable;
  try {
    reachable = await snapshot.isAncestor({
      ancestor: snapshot.mergedCommitSha,
      descendant: snapshot.trunkRef,
    });
  } catch {
    reachable = null;
  }
  record(
    'trunk-reachability',
    reachable === true ? 'passed' : reachable === false ? 'failed' : 'indeterminate'
  );
  let proof = null;
  try {
    proof = await verifyObservedIntegration(snapshot);
  } catch (error) {
    const detail = error?.message ?? String(error);
    record(
      'integration-proof',
      detail.startsWith('delivery-integration:') ? 'failed' : 'indeterminate',
      detail
    );
  }
  return freeze({
    schema: 'aitm.delivery-diagnosis/v1',
    ok: failures.length === 0,
    failures,
    proof,
  });
}
