// @story #1500
import { canonical, fail, frozen, hash, repository } from './value.mjs';
import { parseProtocolMarker, PROTOCOL_MARKER_RE } from './protocol.mjs';

function requireReadPorts(ports) {
  for (const name of [
    'readIssue',
    'readSourceFacts',
    'readRuntimeCapability',
    'listResidentEntries',
  ])
    if (typeof ports?.[name] !== 'function') fail(`migration-${name}-port`);
}

function importRecord(kind, locator, raw) {
  return frozen({
    schema: 'aitm.legacy-import/v2',
    kind,
    locator,
    rawDigest: hash(String(raw)),
    claims: [],
  });
}

function missingEvidence(issue) {
  const bytes = [issue.body, ...(issue.comments || []).map((comment) => comment.body)].join('\n');
  const missing = [];
  if (!/aitm-test-receipt/.test(bytes)) missing.push('verification');
  if (!/aitm-(?:review|final-review|accepted)/.test(bytes)) missing.push('review-acceptance');
  if (!/aitm-(?:delivery-receipt|delivered-close)/.test(bytes)) missing.push('provider-delivery');
  return missing;
}

export async function inspectEnrollment({ repositoryId, issueNumber, ports }) {
  repository(repositoryId);
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) fail('migration-issue');
  requireReadPorts(ports);
  const issue = await ports.readIssue({ repositoryId, issueNumber });
  if (issue?.number !== issueNumber || canonical(issue.repositoryId) !== canonical(repositoryId))
    fail('migration-identity');
  if (!Array.isArray(issue.comments)) fail('migration-comments');
  if (PROTOCOL_MARKER_RE.test(issue.body || '')) {
    parseProtocolMarker(issue.body);
    fail('migration-already-enrolled');
  }
  const source = await ports.readSourceFacts({ repositoryId, issueNumber, issue });
  const runtime = await ports.readRuntimeCapability({ repositoryId, issueNumber, issue });
  const residentEntries = await ports.listResidentEntries({ repositoryId, issueNumber, issue });
  const imports = [
    importRecord('issue-body', `github:issue/${issueNumber}/body`, issue.body),
    ...issue.comments.map((comment) =>
      importRecord('issue-comment', `github:comment/${comment.id}`, comment.body)
    ),
  ];
  const predicateSources = [
    {
      source: 'issue',
      digest: hash({
        state: issue.state,
        stateReason: issue.stateReason,
        body: issue.body,
        comments: issue.comments,
      }),
    },
    { source: 'source', digest: hash(source) },
    { source: 'runtime', digest: hash(runtime) },
    { source: 'resident-entries', digest: hash(residentEntries) },
  ];
  const proposal = {
    schema: 'aitm.enrollment-plan/v2',
    repositoryId,
    issueNumber,
    predicateSources,
    imports,
    missingEvidence: missingEvidence(issue),
    runtimeRequirements: {
      protocol: 'v2',
      recordSchema: 'aitm.evidence-record/v2',
      authorityHostId: runtime?.authorityHostId ?? null,
      providerMode: runtime?.providerMode ?? null,
      entries: Array.isArray(residentEntries) ? [...residentEntries].sort() : residentEntries,
    },
  };
  return frozen({ ...proposal, digest: hash(proposal) });
}
