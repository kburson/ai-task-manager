// @story #1859
import path from 'node:path';
import { parseIssueDirectory } from '../github-records/issue-directory.mjs';
import { stripMarkers } from '../ac-evidence.mjs';
import { liveLines, scanScope, isEligibleNarrativeScopeTarget } from './targets.mjs';
import { readEvidenceContext, validateArtifacts } from './runtime.mjs';
import { readCurrentRecord } from './comments.mjs';
import { ReviewedScopeError } from './model.mjs';

function blocker(label, code, detail) {
  const reason = `${code}: ${label}: ${detail}. In Develop or Test, run npx aitm ensureChecked ${JSON.stringify(label)} --reviewed-evidence <manifest-path>; if already in Review, return to Test first.`;
  return { label, code, reason };
}
function result(blockers) {
  return { ok: blockers.length === 0, blockers };
}
function lineLabel(raw) {
  return stripMarkers(raw.replace(/^\s*[-*+] \[[ xX]\]\s*/, '')) || '<Scope>';
}
function unavailable(error) {
  return error?.message ?? String(error);
}
function isMissing(error) {
  return (
    error?.cause?.status === 404 ||
    error?.cause?.statusCode === 404 ||
    /\(HTTP 404\)/.test(String(error?.cause?.stderr ?? error?.cause?.message ?? ''))
  );
}
function observedCommentError(error) {
  if (error instanceof ReviewedScopeError) {
    if (error.code === 'reviewed-scope-comment-unreadable')
      return isMissing(error)
        ? 'reviewed-scope-current-missing'
        : 'reviewed-scope-read-unavailable';
    return 'reviewed-scope-comment-invalid';
  }
  return 'reviewed-scope-read-unavailable';
}
function observedArtifactError(error) {
  if (
    !(error instanceof ReviewedScopeError) ||
    /\b(?:EACCES|EPERM|EIO|EMFILE|ENFILE)\b/.test(error.message)
  )
    return 'reviewed-scope-read-unavailable';
  return 'reviewed-scope-stale';
}
function validAuthority(authority) {
  return (
    authority &&
    typeof authority.repository === 'string' &&
    Number.isSafeInteger(authority.issue) &&
    authority.issue > 0 &&
    typeof authority.worktree === 'string' &&
    path.isAbsolute(authority.worktree) &&
    typeof authority.branch === 'string' &&
    authority.branch &&
    authority.branch !== 'HEAD' &&
    typeof authority.head === 'string' &&
    /^[a-f0-9]{40}$/.test(authority.head)
  );
}
/** Current evidence is a live Test-to-Review obligation, independent of accepted
 * machine Test evidence. Legacy targets and directory contracts retain their
 * existing completeness routes. Never inspect historical comments here. */
export async function evaluateReviewedScope({
  body,
  repository,
  issue,
  projectDir,
  invokingDir,
  lifecycleEvidence: _lifecycleEvidence,
  deps = {},
}) {
  if (typeof body !== 'string')
    return result([
      blocker('<Scope>', 'reviewed-scope-read-unavailable', 'authoritative body unavailable'),
    ]);
  try {
    if (parseIssueDirectory({ issueBody: body }) !== null) return result([]);
  } catch (error) {
    return result([blocker('<Scope>', 'reviewed-scope-read-unavailable', unavailable(error))]);
  }
  if (!/<!--\s*aitm-(?:reviewed-scope-evidence|scope-evidence-policy)/.test(body))
    return result([]);
  let lines, scan;
  try {
    lines = liveLines(body);
    if (
      !lines.some(({ raw }) =>
        /<!--\s*aitm-(?:reviewed-scope-evidence|scope-evidence-policy)/.test(raw)
      )
    )
      return result([]);
    scan = scanScope(body);
  } catch (error) {
    const raw =
      lines?.find(({ raw }) =>
        /<!--\s*aitm-(?:reviewed-scope-evidence|scope-evidence-policy)/.test(raw)
      )?.raw ?? '';
    return result([blocker(lineLabel(raw), 'reviewed-scope-comment-invalid', unavailable(error))]);
  }
  const blockers = [];
  const invalidLines = new Set();
  const lineageOwners = new Map(),
    commentOwners = new Map();
  const duplicated = new Set();
  for (const location of scan.pointers) {
    for (const [owners, key] of [
      [lineageOwners, location.pointer.lineage],
      [commentOwners, location.pointer.commentId],
    ]) {
      if (owners.has(key)) {
        duplicated.add(owners.get(key));
        duplicated.add(location.lineIndex);
      } else owners.set(key, location.lineIndex);
    }
  }
  for (const location of scan.pointers) {
    const target = scan.allTargets.find((x) => x.lineIndex === location.lineIndex);
    if (
      duplicated.has(location.lineIndex) ||
      !location.inScope ||
      !scan.targets.includes(target) ||
      !isEligibleNarrativeScopeTarget(target.raw)
    ) {
      invalidLines.add(location.lineIndex);
      blockers.push(
        blocker(
          target?.label ?? '<Scope>',
          'reviewed-scope-comment-invalid',
          duplicated.has(location.lineIndex)
            ? 'reviewed pointer or lineage was copied to multiple targets'
            : 'reviewed pointer is outside an eligible root Scope target'
        )
      );
    }
  }
  const labelCounts = new Map();
  for (const target of scan.allTargets)
    labelCounts.set(target.label, (labelCounts.get(target.label) ?? 0) + 1);
  for (const target of scan.targets) {
    if (
      !invalidLines.has(target.lineIndex) &&
      isEligibleNarrativeScopeTarget(target.raw) &&
      (target.pointer || scan.policy === 'v1') &&
      labelCounts.get(target.label) !== 1
    ) {
      invalidLines.add(target.lineIndex);
      blockers.push(
        blocker(
          target.label,
          'reviewed-scope-comment-invalid',
          'adopted target label is duplicated among live issue checkboxes'
        )
      );
    }
  }
  const adopted = scan.targets.filter(
    (target) =>
      !invalidLines.has(target.lineIndex) &&
      isEligibleNarrativeScopeTarget(target.raw) &&
      (target.pointer || scan.policy === 'v1')
  );
  if (!adopted.length) return result(blockers);
  if (
    typeof projectDir !== 'string' ||
    !projectDir.trim() ||
    typeof invokingDir !== 'string' ||
    !invokingDir.trim() ||
    typeof repository !== 'string' ||
    !repository.trim() ||
    !Number.isSafeInteger(issue) ||
    issue < 1
  ) {
    return result([
      ...blockers,
      ...adopted.map((target) =>
        blocker(
          target.label,
          'reviewed-scope-read-unavailable',
          'explicit authoritative context (repository, issue, projectDir and invokingDir) is required'
        )
      ),
    ]);
  }
  let authority;
  try {
    authority = await (deps.readEvidenceContext ?? readEvidenceContext)({
      projectDir,
      invokingDir,
      issueNumber: issue,
      cfg: { repo: repository },
      deps,
    });
    if (
      !validAuthority(authority) ||
      authority.repository !== repository ||
      authority.issue !== issue
    )
      throw new Error('authoritative context is incomplete or disagrees with the requested issue');
  } catch (error) {
    const code =
      error instanceof ReviewedScopeError &&
      ['reviewed-scope-worktree', 'reviewed-scope-branch', 'reviewed-scope-issue'].includes(
        error.code
      )
        ? 'reviewed-scope-wrong-checkout'
        : 'reviewed-scope-read-unavailable';
    return result([
      ...blockers,
      ...adopted.map((target) => blocker(target.label, code, unavailable(error))),
    ]);
  }
  for (const target of adopted) {
    if (!target.pointer) {
      blockers.push(
        blocker(
          target.label,
          'reviewed-scope-current-missing',
          target.checked
            ? 'checked narrative target has no current reviewed record'
            : 'narrative target remains unchecked'
        )
      );
      continue;
    }
    let record;
    try {
      record = await (deps.readCurrentRecord ?? readCurrentRecord)({
        repository,
        issue,
        pointer: target.pointer,
        deps,
      });
    } catch (error) {
      blockers.push(blocker(target.label, observedCommentError(error), unavailable(error)));
      continue;
    }
    if (
      record.targetDigest !== target.contentDigest ||
      record.manifest.label !== target.label ||
      ['repository', 'issue', 'worktree', 'branch', 'head'].some(
        (field) => record.manifest[field] !== authority[field]
      )
    ) {
      blockers.push(
        blocker(
          target.label,
          'reviewed-scope-stale',
          'current record no longer matches target content or visible label, repository, issue, checkout, branch or HEAD'
        )
      );
      continue;
    }
    try {
      await (deps.validateArtifacts ?? validateArtifacts)({
        manifest: record.manifest,
        authority,
        deps,
      });
    } catch (error) {
      blockers.push(blocker(target.label, observedArtifactError(error), unavailable(error)));
      continue;
    }
    if (!target.checked)
      blockers.push(
        blocker(
          target.label,
          'reviewed-scope-current-missing',
          'reviewed target remains unchecked and requires a validated recheck'
        )
      );
  }
  return result(blockers);
}
