// @story #1839
// Offline evidence consistency, not independent authentication of operator claims.
import { createHash } from 'node:crypto';
import { qualifyBaseline } from './baseline.mjs';
import { validateObservation } from './records.mjs';
const digest = (v) => 'sha256:' + createHash('sha256').update(JSON.stringify(v)).digest('hex');
const pair = (p) => JSON.stringify([p.worktreeId, p.sessionId]);
export function qualifySavedEvidence({ report, run, declaration, preflight, smoke } = {}) {
  const result = qualifyBaseline(report, run);
  const finding = (s) => result.findings.push(s);
  try {
    if (
      preflight?.schema !== 'aitm.graphql-usage.preflight/v1' ||
      preflight.workloadKind !== 'controlled' ||
      !declaration
    )
      throw Error('missing preflight');
    const sha = digest(declaration);
    if (
      sha !== preflight.declarationSha256 ||
      sha !== run.declarationSha256 ||
      sha !== report.declaration.sha256 ||
      preflight.declaredAt !== declaration.declaredAt
    )
      finding('frozen declaration digest or timestamp differs');
    const { sha256: _sha, authority: _authority, ...reportedDeclaration } = report.declaration;
    if (JSON.stringify(reportedDeclaration) !== JSON.stringify(declaration))
      finding('report declaration differs from frozen input');
    if (
      !/^[a-f0-9]{40}$/.test(preflight.sourceCommit || '') ||
      run.sourceCommit !== preflight.sourceCommit
    )
      finding('source commit differs');
    if (run.recipeId !== preflight.recipeId) finding('recipe identity differs');
    if (
      !Array.isArray(preflight.configurationHashes) ||
      preflight.configurationHashes.length !== declaration.participants.length ||
      preflight.configurationHashes.some((s) => !/^sha256:[a-f0-9]{64}$/.test(s)) ||
      run.configurationId !== digest(preflight.configurationHashes)
    )
      finding('configuration identity differs');
    if (
      !Number.isSafeInteger(preflight.plannedWorkflows) ||
      preflight.plannedWorkflows < 1 ||
      !Number.isSafeInteger(preflight.repetitionsPerWorktree) ||
      preflight.repetitionsPerWorktree < 1 ||
      preflight.plannedWorkflows !==
        preflight.repetitionsPerWorktree * declaration.participants.length ||
      run.workflows.length !== preflight.plannedWorkflows ||
      result.completedWorkflows !== preflight.plannedWorkflows
    )
      finding('matched workload denominator differs from preflight');
    for (const p of declaration.participants)
      if (
        run.workflows.filter((w) => pair(w) === pair(p)).length !== preflight.repetitionsPerWorktree
      )
        finding('participant repetition count differs');
    if (
      smoke?.schema !== 'aitm.graphql-usage.smoke/v1' ||
      !Array.isArray(smoke.observations) ||
      smoke.observations.length !== 3
    )
      throw Error('invalid smoke evidence');
    const rows = smoke.observations.map(validateObservation);
    const ordered = [...rows].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
    if (
      ordered[0].kind !== 'query' ||
      ordered.slice(1).some((r) => r.kind !== 'mutation') ||
      ordered.slice(1).some((r, i) => Date.parse(ordered[i].endedAt) > Date.parse(r.startedAt))
    )
      finding('smoke query, mutation and cleanup order differs');
    const queries = rows.filter((r) => r.kind === 'query'),
      mutations = rows.filter((r) => r.kind === 'mutation');
    if (
      new Set(rows.map((r) => r.callId)).size !== 3 ||
      rows.some(
        (r) =>
          r.commonRootId !== run.commonRootId ||
          r.repository !== smoke.repository ||
          r.issueNumber !== smoke.issueNumber ||
          r.observationKind !== 'http-attempt' ||
          r.dispatchStatus !== 'sent' ||
          r.outcome !== 'success' ||
          Date.parse(r.endedAt) > Date.parse(declaration.declaredAt)
      )
    )
      finding('smoke identity, outcome, timing or transport differs');
    if (queries.length !== 1 || mutations.length !== 2)
      finding('smoke lacks query, mutation or cleanup');
    const query = queries[0];
    if (
      !query ||
      query.pointCost === null ||
      query.costSource !== 'same-response-rate-limit' ||
      query.pointCost !== smoke.sameResponseQueryCost ||
      query.pointCost !== smoke.recordedQueryCost ||
      smoke.queryCostMatches !== true
    )
      finding('smoke query same-response cost differs');
    if (
      smoke.mutationCostUnavailable !== true ||
      mutations.some(
        (r) => r.pointCost !== null || r.costUnknownReason !== 'mutation-cost-unavailable'
      )
    )
      finding('smoke mutation cost is not explicitly unavailable');
    if (smoke.cleanupSucceeded !== true) finding('smoke cleanup was not verified');
  } catch (error) {
    finding('malformed saved evidence: ' + error.message);
  }
  if (result.findings.length) {
    result.status = 'preliminary';
    result.pointRankingSupported = false;
  }
  return result;
}
