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

// Detects whether BOTH project-config gate keys are explicitly present in raw
// project JSON. Used by the prompt trigger: when both are set the user has
// already declared a policy and the prompt is skipped.
export function bothGatesExplicit(rawProjectConfig = {}) {
  return Object.prototype.hasOwnProperty.call(rawProjectConfig, PROJECT_KEY.analysisToDevelopment)
    && Object.prototype.hasOwnProperty.call(rawProjectConfig, PROJECT_KEY.reviewToDone);
}
