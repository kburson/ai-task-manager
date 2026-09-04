// Resolve a gate boolean by precedence: session override > project config >
// Full-Auto default. (#89/#1512)

const DEFAULTS = {
  analysisToDevelopment: false,
  pullRequestReview: false,
  reviewToDone: false,
};

const PROJECT_KEY = {
  analysisToDevelopment: 'gateAnalysisToDevelopment',
  pullRequestReview: 'gatePullRequestReview',
  reviewToDone: 'gateReviewToDone',
};

export function resolveGate(name, { session = null, projectConfig = {} } = {}) {
  const sessionVal = session?.gates?.[name];
  if (sessionVal === true || sessionVal === false) return sessionVal;
  const projKey = PROJECT_KEY[name];
  if (projKey && Object.prototype.hasOwnProperty.call(projectConfig, projKey)) {
    return Boolean(projectConfig[projKey]);
  }
  return DEFAULTS[name] ?? false;
}

function currentEvidence(value, acceptedHeadSha) {
  return (
    /^[0-9a-f]{40}$/.test(String(acceptedHeadSha || '')) &&
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.accepted === true &&
    value.approvedSha === acceptedHeadSha
  );
}

// Shared review authorization used by approve/deliver/close doctrine. A live
// session override is authoritative over project policy. Full-Auto is standing
// authorization only while the Review gate is disabled; stale body evidence
// cannot survive `auto off`. Human evidence remains independent.
export function resolveReviewAuthorization({
  session = null,
  projectConfig = {},
  acceptedHeadSha = null,
  humanApprovalEvidence = null,
  fullAutoApprovalEvidence = null,
} = {}) {
  const sessionValue = session?.gates?.reviewToDone;
  const sessionDecides = sessionValue === true || sessionValue === false;
  const gateEnabled = resolveGate('reviewToDone', { session, projectConfig });
  if (!gateEnabled && currentEvidence(fullAutoApprovalEvidence, acceptedHeadSha)) {
    return Object.freeze({
      mode: 'full-auto',
      standing: true,
      source: sessionDecides ? 'session' : 'project',
    });
  }
  if (currentEvidence(humanApprovalEvidence, acceptedHeadSha)) {
    const source =
      humanApprovalEvidence.source === 'directory-human-evidence'
        ? 'directory-human-evidence'
        : 'human-evidence';
    return Object.freeze({ mode: 'human', standing: true, source });
  }
  return Object.freeze({ mode: 'missing', standing: false, source: 'none' });
}

// Compatibility export for callers that still inspect the two original keys.
// Binding no longer prompts when keys are absent; Full-Auto is deterministic.
export function bothGatesExplicit(rawProjectConfig = {}) {
  return (
    Object.prototype.hasOwnProperty.call(rawProjectConfig, PROJECT_KEY.analysisToDevelopment) &&
    Object.prototype.hasOwnProperty.call(rawProjectConfig, PROJECT_KEY.reviewToDone)
  );
}
