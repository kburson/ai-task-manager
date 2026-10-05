// @story #1811 #1873 #1892
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
  const seen = new Map();
  for (let index = 0; index < sourceCommits.length; index += 1) {
    const commit = sourceCommits[index];
    if (
      !sha(commit?.oid) ||
      seen.has(commit.oid) ||
      !sha(commit.tree) ||
      !Array.isArray(commit.parents) ||
      (commit.parents.length !== 1 && commit.parents.length !== 2) ||
      commit.parents.some((parent) => !sha(parent) || parent === commit.oid) ||
      new Set(commit.parents).size !== commit.parents.length ||
      typeof commit.message !== 'string'
    ) {
      fail('source-inventory');
    }
    seen.set(commit.oid, { commit, index });
  }
  if (sourceCommits.at(-1).oid !== acceptedHeadSha) fail('source-inventory');
  // Both sides of child merges belong to the inventory. Internal parent edges
  // must precede their children; this also refuses cycles without recursive DFS.
  for (const { commit, index } of seen.values()) {
    if (commit.parents.some((parent) => seen.has(parent) && seen.get(parent).index >= index)) {
      fail('source-inventory');
    }
  }
  const reached = new Set();
  const pending = [acceptedHeadSha];
  while (pending.length > 0) {
    const oid = pending.pop();
    if (!seen.has(oid) || reached.has(oid)) continue;
    reached.add(oid);
    pending.push(...seen.get(oid).commit.parents);
  }
  if (reached.size !== seen.size) fail('source-inventory');
  // The earliest provider entry may be an older child fork, rather than the
  // first commit on the epic's own first-parent path.
  let sourceBase = acceptedHeadSha;
  while (seen.has(sourceBase)) sourceBase = seen.get(sourceBase).commit.parents[0];
  return { sourceCommitsById: seen, sourceBase };
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
  const inventory = validateInventory(sourceCommits, acceptedHeadSha);
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
  let sourceBase = inventory.sourceBase;
  const hasSourceMerges = sourceCommits.some((commit) => commit.parents.length === 2);
  const hasChildMerges = sourceCommits.some(
    (commit) => commit.parents.length === 2 && inventory.sourceCommitsById.has(commit.parents[1])
  );
  for (const commit of sourceCommits) {
    // A child fork can start from older trunk history. Every external boundary
    // of a child graph must belong to the actual integration base; missing child
    // commits cannot be treated as an already-integrated base merge.
    if (hasChildMerges) {
      for (const parent of commit.parents) {
        if (
          !inventory.sourceCommitsById.has(parent) &&
          (await isAncestor({ ancestor: parent, descendant: parents[0] })) !== true
        ) {
          fail('source-inventory');
        }
      }
    }
    if (commit.parents.length !== 2 || inventory.sourceCommitsById.has(commit.parents[1])) {
      continue;
    }
    const secondary = commit.parents[1];
    if ((await isAncestor({ ancestor: secondary, descendant: parents[0] })) !== true) {
      fail('source-inventory');
    }
    if ((await isAncestor({ ancestor: sourceBase, descendant: secondary })) === true) {
      sourceBase = secondary;
    } else if ((await isAncestor({ ancestor: secondary, descendant: sourceBase })) !== true) {
      fail('source-inventory');
    }
  }
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
    if (sourceCommits.length > 1 && !hasSourceMerges) {
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
  const observation = {
    ...snapshot,
    intent: structuredClone(snapshot.intent),
    pullRequest: structuredClone(snapshot.pullRequest),
    sourceCommits: structuredClone(snapshot.sourceCommits),
    requiredChecks: structuredClone(snapshot.requiredChecks),
  };
  const failures = [];
  const record = (predicate, status, detail = null) => {
    if (status !== 'passed') failures.push({ predicate, status, detail });
  };
  const { intent, pullRequest } = observation;
  if (!intent || !pullRequest) {
    throw new TypeError('delivery-diagnosis:input');
  }
  record('pr-number', pullRequest.number === intent.prNumber ? 'passed' : 'failed');
  record(
    'pr-merged',
    pullRequest.merged === true
      ? 'passed'
      : pullRequest.merged === false
        ? 'failed'
        : 'indeterminate'
  );
  record(
    'base-ref',
    pullRequest.baseRefName === undefined
      ? 'indeterminate'
      : pullRequest.baseRefName === intent.baseRef
        ? 'passed'
        : 'failed'
  );
  record('accepted-head', pullRequest.headRefOid === intent.expectedHeadSha ? 'passed' : 'failed');
  record('test-head', observation.testReceiptSha === intent.expectedHeadSha ? 'passed' : 'failed');
  record(
    'review-head',
    observation.acceptedReviewSha === intent.expectedHeadSha ? 'passed' : 'failed'
  );
  record(
    'review-complete',
    observation.agentReviewPassed === true
      ? 'passed'
      : observation.agentReviewPassed === false
        ? 'failed'
        : 'indeterminate'
  );
  const checks = observation.requiredChecks;
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
    observation.sourceAttribution === true
      ? 'passed'
      : observation.sourceAttribution === false
        ? 'failed'
        : 'indeterminate'
  );
  let reachable;
  try {
    reachable = await observation.isAncestor({
      ancestor: observation.mergedCommitSha,
      descendant: observation.trunkRef,
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
    proof = await verifyObservedIntegration(observation);
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
