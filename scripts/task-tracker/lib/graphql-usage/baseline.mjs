// @story #1839
// Pure offline qualification. The run manifest is operator evidence, not a signed uptime receipt.
const pair = (p) => JSON.stringify([p.worktreeId, p.sessionId]);
function instant(s) {
  const n = typeof s === 'string' ? Date.parse(s) : NaN;
  if (!Number.isFinite(n) || new Date(n).toISOString() !== s)
    throw new TypeError('invalid timestamp');
  return n;
}
const text = (s) => typeof s === 'string' && s.length > 0;
const count = (n) => Number.isSafeInteger(n) && n >= 0;
export function qualifyBaseline(report, run) {
  const result = {
    schema: 'aitm.graphql-usage.baseline/v1',
    status: 'preliminary',
    workloadKind: 'controlled',
    organicUsageSupported: false,
    pointSavingsSupported: false,
    pointRankingSupported: false,
    overlapSeconds: 0,
    completedWorkflows: 0,
    excludedParticipants: 0,
    findings: [],
    normalized: null,
    authority:
      'Offline assessment of operator-supplied evidence; timestamps and workflow outcomes are not independently authenticated.',
  };
  const finding = (s) => result.findings.push(s);
  try {
    if (
      report?.schema !== 'aitm.graphql-usage.report/v1' ||
      !report.coverage ||
      !report.totals ||
      !report.breakdowns?.worktree ||
      !report.breakdowns?.session ||
      !report.declaration ||
      !Array.isArray(report.comparisons) ||
      !Array.isArray(report.coverage.collectorVersions)
    )
      throw new TypeError('invalid report');
    if (
      run?.schema !== 'aitm.graphql-usage.baseline-run/v1' ||
      run.workloadKind !== 'controlled' ||
      !text(run.commonRootId) ||
      !text(run.collectorVersion) ||
      !text(run.recipeId) ||
      !text(run.configurationId) ||
      !Array.isArray(run.participants) ||
      !Array.isArray(run.workflows)
    )
      throw new TypeError('invalid run manifest');
    const start = instant(run.startedAt),
      end = instant(run.endedAt),
      declared = instant(run.declaredAt);
    if (end <= start || declared > start) finding('invalid or late declared interval');
    if (end - start < 3_600_000) finding('declared window is shorter than 60 minutes');
    if (
      report.interval?.startedAt !== run.startedAt ||
      report.interval?.endedAt !== run.endedAt ||
      report.interval?.boundary !== '[start, end)'
    )
      finding('report interval differs from run');
    if (
      report.commonRootId !== run.commonRootId ||
      report.declaration.commonRootId !== run.commonRootId
    )
      finding('root identity mismatch');
    if (
      report.declaration.sha256 !== run.declarationSha256 ||
      report.declaration.declaredAt !== run.declaredAt
    )
      finding('predeclaration identity mismatch');
    if (
      report.coverage.collectorVersions.length !== 1 ||
      report.coverage.collectorVersions[0] !== run.collectorVersion
    )
      finding('collector version is missing or mismatched');
    for (const field of [
      'observations',
      'httpAttempts',
      'opaqueInvocations',
      'knownPointSubtotal',
      'unknownCostObservations',
    ])
      if (!count(report.totals[field])) throw new TypeError('invalid totals');
    const participants = run.participants.filter((p) => p.permitted === true);
    result.excludedParticipants = run.participants.length - participants.length;
    for (const p of run.participants) {
      if (
        !text(p.worktreeId) ||
        !/^sha256:[a-f0-9]{64}$/.test(p.sessionId || '') ||
        !text(p.commonRootId) ||
        !['enrolled', 'denied', 'unknown'].includes(p.outcome) ||
        typeof p.permitted !== 'boolean'
      )
        throw new TypeError('invalid participant');
    }
    if (new Set(run.participants.map(pair)).size !== run.participants.length)
      finding('duplicate participant identities');
    if (new Set(participants.map((p) => p.worktreeId)).size < 2)
      finding('fewer than two permitted worktrees');
    const declaredPairs = report.declaration.participants?.map(pair);
    if (
      !declaredPairs ||
      declaredPairs.length !== participants.length ||
      new Set(declaredPairs).size !== declaredPairs.length ||
      participants.some((p) => !declaredPairs.includes(pair(p)))
    )
      finding('participant sample differs from predeclaration');
    let overlapStart = start,
      overlapEnd = end;
    for (const p of participants) {
      if (p.commonRootId !== run.commonRootId) finding('participant root mismatch');
      if (p.outcome !== 'enrolled' || !text(p.enrollmentId) || instant(p.enrolledAt) > start)
        finding('participant enrollment is unsuccessful or late');
      const begun = instant(p.collectorStartedAt),
        stopped = instant(p.collectorEndedAt);
      if (stopped <= begun) finding('collector interval is reversed or empty');
      overlapStart = Math.max(overlapStart, begun);
      overlapEnd = Math.min(overlapEnd, stopped);
      const tree = report.breakdowns.worktree[p.worktreeId]?.counts;
      const session = report.breakdowns.session[p.sessionId]?.counts;
      if (
        !count(tree?.observations) ||
        tree.observations === 0 ||
        !count(session?.observations) ||
        session.observations === 0
      )
        finding('participant has no observed traffic');
    }
    result.overlapSeconds = Math.max(0, (overlapEnd - overlapStart) / 1000);
    if (result.overlapSeconds < 3600)
      finding('actual declared collector overlap is shorter than 60 minutes');
    const workflowIds = new Set(),
      issues = new Set();
    for (const w of run.workflows) {
      if (
        !text(w.id) ||
        !Number.isSafeInteger(w.issueNumber) ||
        w.issueNumber <= 0 ||
        !Array.isArray(w.steps)
      )
        throw new TypeError('invalid workflow');
      if (workflowIds.has(w.id) || issues.has(w.issueNumber))
        finding('duplicate workflow denominator');
      workflowIds.add(w.id);
      issues.add(w.issueNumber);
      const ws = instant(w.startedAt),
        we = instant(w.endedAt);
      const owner = participants.find((p) => pair(p) === pair(w));
      const stages = ['create', 'refine', 'ready-for-plan', 'plan'];
      const success =
        w.steps.length === stages.length &&
        stages.every((action, i) => w.steps[i]?.action === action && w.steps[i].exitCode === 0);
      if (owner && ws >= start && we <= end && we >= ws && success) result.completedWorkflows++;
      else
        finding(
          'workflow is incomplete, unsuccessful, outside the interval or outside the participant sample'
        );
    }
    if (!result.completedWorkflows) finding('no completed creation-to-planning workflow');
    if (
      !report.declaration.groups?.length ||
      report.comparisons.length !== report.declaration.groups.length ||
      new Set(report.comparisons.map((g) => g.id)).size !== report.comparisons.length ||
      report.declaration.groups.some((g) => !report.comparisons.some((c) => c.id === g.id))
    )
      finding('candidate group evidence is missing or mismatched');
    if (
      !report.comparisons.length ||
      report.comparisons.some(
        (g) =>
          !['volume-ranking', 'complete-point-ranking'].includes(g.status) ||
          g.volumeSufficient !== true ||
          !count(g.denominator) ||
          !g.denominator
      )
    )
      finding('candidate group coverage is preliminary');
    result.pointRankingSupported =
      report.comparisons.length > 0 && report.comparisons.every((g) => g.pointSufficient === true);
    if (result.completedWorkflows)
      result.normalized = {
        httpAttemptsPerWorkflow: report.totals.httpAttempts / result.completedWorkflows,
        opaqueInvocationsPerWorkflow: report.totals.opaqueInvocations / result.completedWorkflows,
        knownPointsPerWorkflow: report.totals.knownPointSubtotal / result.completedWorkflows,
        unknownCostObservationsPerWorkflow:
          report.totals.unknownCostObservations / result.completedWorkflows,
        interpretation:
          'Raw report totals divided by completed declared workflows; known points remain lower bounds. This is not a matched before/after savings comparison.',
      };
    if (!result.findings.length) result.status = 'decision-grade-controlled';
  } catch (error) {
    finding(`malformed baseline evidence: ${error.message}`);
  }
  if (result.status === 'preliminary') result.pointRankingSupported = false;
  return result;
}
