// Resolve a gate boolean by precedence: session override > project config > default true.
// (#89) — used by approve.mjs (analysisToDevelopment) and close path (reviewToDone).

const DEFAULTS = {
  analysisToDevelopment: true,
  reviewToDone: true,
};

const PROJECT_KEY = {
  analysisToDevelopment: 'gateAnalysisToDevelopment',
  reviewToDone: 'gateReviewToDone',
};

export function resolveGate(name, { session = null, projectConfig = {} } = {}) {
  const sessionVal = session?.gates?.[name];
  if (sessionVal === true || sessionVal === false) return sessionVal;
  const projKey = PROJECT_KEY[name];
  if (projKey && Object.prototype.hasOwnProperty.call(projectConfig, projKey)) {
    return Boolean(projectConfig[projKey]);
  }
  return DEFAULTS[name] ?? true;
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
    return Object.freeze({ mode: 'human', standing: true, source: 'human-evidence' });
  }
  return Object.freeze({ mode: 'missing', standing: false, source: 'none' });
}

// Detects whether BOTH project-config gate keys are explicitly present in raw
// project JSON. Used by the prompt trigger: when both are set the user has
// already declared a policy and the prompt is skipped.
export function bothGatesExplicit(rawProjectConfig = {}) {
  return (
    Object.prototype.hasOwnProperty.call(rawProjectConfig, PROJECT_KEY.analysisToDevelopment) &&
    Object.prototype.hasOwnProperty.call(rawProjectConfig, PROJECT_KEY.reviewToDone)
  );
}
