// @story #2153
// Pure consumer: source HEAD is the selected acceptance subject, never an operator lookup.
import { parsePlanApprovedMarker, PLAN_APPROVED_RE, stripFencedCodeBlocks } from './markers.mjs';
import { computeScopeIdentity } from './workflow-policy/scope-identity.mjs';
import { linkedPlanReference } from './decomposition-policy.mjs';
import { readCurrentPlanApprovalAuditComment } from './plan-approval-audit.mjs';
import { readCurrentForecastId } from './plan-approval-current-source.mjs';

export function hasCurrentApprovalDigestSyntax(body) {
  return /\bcurrent-approval-digest\s*=/i.test(stripFencedCodeBlocks(body));
}
export function validateCurrentScopeApproval({
  body = '',
  comments = [],
  repository,
  issue,
  acceptedSourceHead,
} = {}) {
  const visible = stripFencedCodeBlocks(body);
  const approved = parsePlanApprovedMarker(body);
  const list = Array.isArray(comments) ? comments : [];
  const currentComments = list.filter((c) =>
    /<!--\s*aitm-current-plan-approval\b/i.test(String(c?.body ?? ''))
  );
  const relevant = currentComments.filter((c) =>
    String(c.body).includes(`Plan approval was recorded at \`${approved?.ts}\``)
  );
  if (!hasCurrentApprovalDigestSyntax(body))
    return { applicable: relevant.length > 0, pass: relevant.length === 0 };
  const fail = () => ({ applicable: true, pass: false });
  if (
    !approved ||
    approved.mode !== 'full-auto' ||
    approved.repairRecordId ||
    !approved.currentApprovalDigest ||
    ![...visible.matchAll(new RegExp(PLAN_APPROVED_RE.source, 'gi'))].length
  )
    return fail();
  const markers = [...visible.matchAll(new RegExp(PLAN_APPROVED_RE.source, 'gi'))];
  if (
    markers.length !== 1 ||
    (markers[0][0].match(/\bcurrent-approval-digest\s*=/gi) || []).length !== 1 ||
    relevant.length !== 1
  )
    return fail();
  const audit = readCurrentPlanApprovalAuditComment(relevant[0].body);
  if (
    !audit ||
    audit.digest !== approved.currentApprovalDigest ||
    audit.issueNumber !== Number(issue) ||
    audit.ts !== approved.ts
  )
    return fail();
  const record = audit.evidence;
  try {
    if (
      record.repository !== String(repository).toLowerCase() ||
      record.issue !== Number(issue) ||
      record.sourceHead !== acceptedSourceHead ||
      record.scopeIdentity !== computeScopeIdentity({ repository, issue: Number(issue), body }) ||
      record.planPath !== linkedPlanReference(body)?.path ||
      record.forecastRecordId !== readCurrentForecastId(body) ||
      record.trunkSha !== approved.trunkSha
    )
      return fail();
    for (const [key, value] of Object.entries(record.storyBinding))
      if (approved[key] !== value) return fail();
  } catch {
    return fail();
  }
  return { applicable: true, pass: true };
}
