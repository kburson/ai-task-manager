// @story #1168
// Read-side backstop for provenance-bearing evidence. Writer-side worktree
// guards can be explicitly overridden; ancestry of the stored artifact cannot.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { parseMarker } from './marker-grammar.mjs';
import { GIT_TIMEOUT_MS } from './process-timeouts.mjs';
import { parseVerificationReceipts } from './verification-receipt.mjs';
import { readWorktreeIdentity } from './worktree-binding-guard.mjs';

const pexec = promisify(execFile);
const PROOF_MARKER_RE = /<!--\s*aitm-verified\s+[\s\S]*?-->/g;
const SHA_RE = /^[0-9a-f]{7,40}$/i;

function proofEvidence(body) {
  const evidence = [];
  for (const claim of String(body || '').match(PROOF_MARKER_RE) || []) {
    const parsed = parseMarker(claim);
    if (parsed?.name !== 'verified') continue;
    const props = parsed.props;
    const provenanceKeys = ['worktree', 'branch', 'bound-issue'];
    const present = provenanceKeys.filter((key) => props[key] !== undefined);
    if (present.length === 0) continue; // additive compatibility for legacy proof
    evidence.push({
      kind: 'evidence marker',
      sha: props.sha,
      branch: props.branch,
      worktreePath: props.worktree,
      boundIssue: Number(props['bound-issue']),
      complete:
        present.length === provenanceKeys.length &&
        typeof props.sha === 'string' &&
        SHA_RE.test(props.sha) &&
        typeof props.branch === 'string' &&
        props.branch.length > 0 &&
        typeof props.worktree === 'string' &&
        props.worktree.length > 0 &&
        Number.isInteger(Number(props['bound-issue'])) &&
        Number(props['bound-issue']) > 0,
    });
  }
  return evidence;
}

function receiptEvidence(body) {
  return parseVerificationReceipts(body)
    .filter((receipt) => receipt.executionContext !== undefined)
    .map((receipt) => {
      const context = receipt.executionContext;
      return {
        kind: `${receipt.stage || 'unknown'} verification receipt`,
        sha: receipt.commitSha,
        branch: context?.branch,
        worktreePath: context?.worktreePath,
        boundIssue: context?.boundIssue,
        complete:
          Boolean(context) &&
          SHA_RE.test(String(receipt.commitSha || '')) &&
          typeof context.branch === 'string' &&
          context.branch.length > 0 &&
          typeof context.worktreePath === 'string' &&
          context.worktreePath.length > 0 &&
          Number.isInteger(context.boundIssue) &&
          context.boundIssue > 0,
      };
    });
}

export function collectEvidenceWithProvenance(body) {
  return [...proofEvidence(body), ...receiptEvidence(body)];
}

async function defaultIsAncestor({ ancestor, descendant, projectDir }) {
  try {
    await pexec('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: projectDir,
      timeout: GIT_TIMEOUT_MS,
    });
    return true;
  } catch (error) {
    if (Number(error?.code) === 1) return false;
    throw new Error(
      `git merge-base --is-ancestor ${ancestor} ${descendant} failed: ${error?.message || error}`
    );
  }
}

function unreachableReason({ item, issueNumber, boundBranch }) {
  return (
    `evidence-branch-unreachable: evidence is genuine but was produced in the wrong tree; ` +
    `${item.kind} branch \`${item.branch}\`; issue #${issueNumber} bound branch ` +
    `\`${boundBranch}\`; sha \`${item.sha}\` is not reachable from the bound branch`
  );
}

export async function auditEvidenceBranchReachability({
  body,
  issueNumber,
  projectDir,
  deps = {},
} = {}) {
  if (issueNumber == null) {
    throw new Error('evidence-branch-reachability: issueNumber is required');
  }
  if (typeof projectDir !== 'string' || projectDir.length === 0) {
    throw new Error('evidence-branch-reachability: projectDir is required');
  }

  const evidence = collectEvidenceWithProvenance(body);
  if (evidence.length === 0) return { ok: true, reasons: [], boundBranch: null, evidence };

  const resolveIdentity = deps.readWorktreeIdentity || readWorktreeIdentity;
  const isAncestor = deps.isAncestor || defaultIsAncestor;
  const reasons = [];
  let boundBranch;
  try {
    boundBranch = resolveIdentity({ projectDir }).worktreeBranch;
    if (typeof boundBranch !== 'string' || boundBranch.length === 0) {
      throw new Error('bound worktree branch is unavailable');
    }
  } catch (error) {
    reasons.push(`evidence-branch-reachability-failed: ${error?.message || error}`);
    return { ok: false, reasons, boundBranch: null, evidence };
  }

  const reachableBySha = new Map();
  for (const item of evidence) {
    if (!item.complete) {
      reasons.push(
        `evidence-branch-provenance-incomplete: ${item.kind} carries partial or malformed provenance`
      );
      continue;
    }
    let reachable = reachableBySha.get(item.sha);
    if (reachable === undefined) {
      try {
        reachable = Boolean(
          await isAncestor({ ancestor: item.sha, descendant: boundBranch, projectDir })
        );
        reachableBySha.set(item.sha, reachable);
      } catch (error) {
        reasons.push(`evidence-branch-reachability-failed: ${error?.message || error}`);
        continue;
      }
    }
    if (!reachable) reasons.push(unreachableReason({ item, issueNumber, boundBranch }));
  }

  return { ok: reasons.length === 0, reasons, boundBranch, evidence };
}
