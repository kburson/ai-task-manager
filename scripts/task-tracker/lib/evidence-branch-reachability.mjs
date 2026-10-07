// @story #1168
// Read-side backstop for provenance-bearing evidence. Writer-side worktree
// guards can be explicitly overridden; ancestry of the stored artifact cannot.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';

import { parseMarker } from './marker-grammar.mjs';
import { GIT_TIMEOUT_MS } from './process-timeouts.mjs';
import { parseVerificationReceipts } from './verification-receipt.mjs';
import { readWorktreeIdentity } from './worktree-binding-guard.mjs';

const pexec = promisify(execFile);
const nativeReadData = new WeakMap();
export function readEvidenceBranchReadData(result) {
  return result && typeof result === 'object' ? nativeReadData.get(result) ?? null : null;
}
const PROOF_MARKER_RE = /<!--\s*aitm-verified\s+[\s\S]*?-->/g;
const SHA_RE = /^[0-9a-f]{7,40}$/i;

function completeProvenance(item) {
  const sha = item.kind === 'evidence marker' ? item.sha : String(item.sha || '');
  return typeof sha === 'string' && SHA_RE.test(sha) &&
    typeof item.branch === 'string' && item.branch.length > 0 &&
    typeof item.worktreePath === 'string' && item.worktreePath.length > 0 &&
    Number.isInteger(item.boundIssue) && item.boundIssue > 0;
}
function withCompleteness(item) {
  return { ...item, complete: completeProvenance(item) };
}

function proofEvidence(body) {
  const evidence = [];
  for (const claim of String(body || '').match(PROOF_MARKER_RE) || []) {
    const parsed = parseMarker(claim);
    if (parsed?.name !== 'verified') continue;
    const props = parsed.props;
    const provenanceKeys = ['worktree', 'branch', 'bound-issue'];
    const present = provenanceKeys.filter((key) => props[key] !== undefined);
    if (present.length === 0) continue; // additive compatibility for legacy proof
    evidence.push(withCompleteness({
      kind: 'evidence marker',
      sha: props.sha,
      branch: props.branch,
      worktreePath: props.worktree,
      boundIssue: Number(props['bound-issue']),
    }));
  }
  return evidence;
}

function receiptEvidence(body) {
  return parseVerificationReceipts(body)
    .filter((receipt) => receipt.executionContext !== undefined)
    .map((receipt) => {
      const context = receipt.executionContext;
      return withCompleteness({
        kind: `${receipt.stage || 'unknown'} verification receipt`,
        sha: receipt.commitSha,
        branch: context?.branch,
        worktreePath: context?.worktreePath,
        boundIssue: context?.boundIssue,
      });
    });
}

export function collectEvidenceWithProvenance(body) {
  return [...proofEvidence(body), ...receiptEvidence(body)];
}

async function defaultIsAncestor({ ancestor, descendant, projectDir }, capture = null) {
  try {
    const result = await pexec('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: projectDir,
      timeout: GIT_TIMEOUT_MS,
    });
    if (capture) capture.reads.push(Object.freeze({ ancestor, descendant, cwd: projectDir,
      stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? ''), exitCode: 0 }));
    return true;
  } catch (error) {
    if (capture) capture.reads.push(Object.freeze({ ancestor, descendant, cwd: projectDir,
      stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? ''),
      exitCode: typeof error.code === 'number' ? error.code : null }));
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

// Captured original data only. This does not perform Git reads or grant readiness.
export function qualifyEvidenceBranchItem(input) {
  const closed = (value, names) => value && typeof value === 'object' &&
    !Array.isArray(value) && Object.keys(value).sort().join(',') === names.sort().join(',');
  if (!closed(input, ['item', 'issueNumber', 'boundBranch', 'ancestryExitCode']) ||
      !closed(input.item, ['kind', 'sha', 'branch', 'worktreePath', 'boundIssue']) ||
      typeof input.item.kind !== 'string' || typeof input.boundBranch !== 'string' ||
      !input.boundBranch || input.issueNumber == null ||
      ![null, 0, 1].includes(input.ancestryExitCode)) throw new TypeError('evidence-branch-data');
  const { item, issueNumber, boundBranch, ancestryExitCode } = input;
  if (!completeProvenance(item)) return [
    `evidence-branch-provenance-incomplete: ${item.kind} carries partial or malformed provenance`,
  ];
  if (ancestryExitCode === null) throw new TypeError('evidence-branch-data');
  return ancestryExitCode === 1 ? [unreachableReason({ item, issueNumber, boundBranch })] : [];
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

  let capture = null;
  try {
    if (Object.getPrototypeOf(deps) === Object.prototype && Reflect.ownKeys(deps).length === 0)
      capture = { identity: null, identityError: null, reads: [] };
  } catch { /* Optional introspection does not alter ordinary injected reads. */ }
  const finish = result => {
    if (capture) nativeReadData.set(result, Object.freeze({ issue: Number(issueNumber), projectDir,
      bodyHash: createHash('sha256').update(String(body || '')).digest('hex'),
      identity: capture.identity, identityError: capture.identityError, reads: Object.freeze(capture.reads) }));
    return result;
  };
  const evidence = collectEvidenceWithProvenance(body);
  if (evidence.length === 0) return finish({ ok: true, reasons: [], boundBranch: null, evidence });

  const resolveIdentity = deps.readWorktreeIdentity || readWorktreeIdentity;
  const isAncestor = deps.isAncestor || defaultIsAncestor;
  const reasons = [];
  let boundBranch;
  try {
    const identity = resolveIdentity({ projectDir });
    if (capture) capture.identity = Object.freeze({ ...identity });
    boundBranch = identity.worktreeBranch;
    if (typeof boundBranch !== 'string' || boundBranch.length === 0) {
      throw new Error('bound worktree branch is unavailable');
    }
  } catch (error) {
    if (capture) capture.identityError = String(error?.message || error);
    reasons.push(`evidence-branch-reachability-failed: ${error?.message || error}`);
    return finish({ ok: false, reasons, boundBranch: null, evidence });
  }

  const reachableBySha = new Map();
  for (const item of evidence) {
    const { complete, ...original } = item;
    if (!complete) {
      reasons.push(...qualifyEvidenceBranchItem({ item: original, issueNumber, boundBranch, ancestryExitCode: null }));
      continue;
    }
    let reachable = reachableBySha.get(item.sha);
    if (reachable === undefined) {
      try {
        reachable = Boolean(
          await (isAncestor === defaultIsAncestor
            ? defaultIsAncestor({ ancestor: item.sha, descendant: boundBranch, projectDir }, capture)
            : isAncestor({ ancestor: item.sha, descendant: boundBranch, projectDir }))
        );
        reachableBySha.set(item.sha, reachable);
      } catch (error) {
        reasons.push(`evidence-branch-reachability-failed: ${error?.message || error}`);
        continue;
      }
    }
    reasons.push(...qualifyEvidenceBranchItem({ item: original, issueNumber, boundBranch, ancestryExitCode: reachable ? 0 : 1 }));
  }

  return finish({ ok: reasons.length === 0, reasons, boundBranch, evidence });
}
