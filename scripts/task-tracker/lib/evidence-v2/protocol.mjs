// @story #1497
import { canonical, exact, fail, repository, uuidValue, digestValue, frozen } from './value.mjs';
import { resolveEvidenceExecutionContext } from './execution-context.mjs';
export const PROTOCOL_MARKER_RE = /<!--\s*aitm-evidence-v2\b[^]*?-->/i;
export function renderProtocolMarker(value) {
  exact(
    value,
    ['schema', 'repositoryId', 'issueNumber', 'cycleId', 'headId', 'authorityHostId'],
    'projection-keys'
  );
  if (
    value.schema !== 'aitm.evidence-projection/v2' ||
    !Number.isSafeInteger(value.issueNumber) ||
    value.issueNumber <= 0
  )
    fail('projection-schema');
  repository(value.repositoryId);
  uuidValue(value.cycleId);
  uuidValue(value.authorityHostId);
  digestValue(value.headId);
  return `<!-- aitm-evidence-v2 data="${Buffer.from(canonical(value)).toString('base64url')}" -->`;
}
export function parseProtocolMarker(body) {
  const claims = String(body || '').match(/<!--\s*aitm-evidence-v2\b/g) || [];
  if (!claims.length) return null;
  if (claims.length !== 1) fail('projection-ambiguous');
  const match = PROTOCOL_MARKER_RE.exec(body)?.[0];
  const data = /^<!-- aitm-evidence-v2 data="([A-Za-z0-9_-]+)" -->$/.exec(match || '')?.[1];
  if (!data) fail('projection-malformed');
  let value;
  try {
    value = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    fail('projection-json');
  }
  if (renderProtocolMarker(value) !== match) fail('projection-noncanonical');
  return frozen(value);
}
export function validateProtocolAdvance({ baseMatch, nextMatch }) {
  const before = parseProtocolMarker(baseMatch);
  const after = parseProtocolMarker(nextMatch);
  if (!after) fail('projection-missing');
  if (
    before &&
    (canonical(before.repositoryId) !== canonical(after.repositoryId) ||
      before.issueNumber !== after.issueNumber ||
      before.authorityHostId !== after.authorityHostId)
  )
    fail('projection-identity');
}
export function assertSyntheticContext(context, repositoryId, issueNumber) {
  const resolved = resolveEvidenceExecutionContext(context);
  if (
    repositoryId.nameWithOwner !== resolved.repositoryId ||
    repositoryId.nodeId !== `R_rehearsal_${resolved.runId}` ||
    issueNumber < 1000000
  )
    fail('synthetic-identity');
  return resolved;
}
export function assertEvidenceContext(context, repositoryId, issueNumber, authorityHostId) {
  const resolved = resolveEvidenceExecutionContext(context);
  if (resolved.schema === 'aitm.rehearsal-context/v1')
    return assertSyntheticContext(context, repositoryId, issueNumber);
  if (
    canonical(resolved.repositoryId) !== canonical(repositoryId) ||
    resolved.issueNumber !== issueNumber ||
    resolved.authorityHostId !== authorityHostId
  )
    fail('installed-identity');
  return resolved;
}
export function selectEvidenceProtocol({ body, context } = {}) {
  const projection = parseProtocolMarker(body);
  if (!projection) return frozen({ protocol: 'v1' });
  const executionContext = assertEvidenceContext(
    context,
    projection.repositoryId,
    projection.issueNumber,
    projection.authorityHostId
  );
  return frozen({ protocol: 'v2', projection, executionContext });
}
