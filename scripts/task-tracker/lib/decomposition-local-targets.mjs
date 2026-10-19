// @story #2006 — derive preparation only from physically resolved bound targets.
export function isDecompositionPreparationTargets(targets, issue) {
  if (!Number.isSafeInteger(issue) || issue <= 0 || !targets.length) return false;
  const planningPath = new RegExp(
    '^docs/superpowers/(?:plans|specs)/[0-9]{4}-[0-9]{2}-[0-9]{2}-' + issue + '-[^/]+\\.md$'
  );
  return targets.every(
    (target) => target.activity === 'WRITE_DOCS' && planningPath.test(target.relative)
  );
}
export function decompositionTargetActivity({ activity, targets, issue, exactBinding }) {
  if (!['WRITE_CODE', 'WRITE_DOCS'].includes(activity)) return activity;
  const physical = targets.some((target) => target.activity === 'WRITE_CODE')
    ? 'WRITE_CODE'
    : targets.length && targets.every((target) => target.activity === 'WRITE_DOCS')
      ? 'WRITE_DOCS'
      : activity;
  return exactBinding && isDecompositionPreparationTargets(targets, issue)
    ? 'decomposition-prepare'
    : physical;
}
