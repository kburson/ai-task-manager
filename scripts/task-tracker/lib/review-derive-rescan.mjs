import { sourceCommit, validateArtifactSubject } from './artifact-subject.mjs';
import { captureArtifactOperator } from './artifact-execution.mjs';
// @story #502 #1732
// Shared Test-to-Review and close seam. The old derive-before-readiness path
// and stale-body fallback are deliberately absent: callers supply the complete
// guard evaluator for the projected body, then execution may persist it.

import { pexec as sharedPexec } from '../../gh/lib/gh-client.mjs';
import {
  NormalizationRefusalError,
  persistReadyNormalizations,
} from './action-decision/normalization.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

async function fetchLiveBody({ pexec, issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return String(stdout || '');
}

export async function deriveAndRescan({
  issueNumber,
  repo,
  projectDir,
  artifactSubject,
  deps = {},
} = {}) {
  if (typeof deps.refreshAndEvaluate !== 'function') {
    throw new TypeError('deriveAndRescan: complete fresh guard evaluator is required');
  }
  if (typeof projectDir !== 'string' || !projectDir) {
    throw new TypeError('deriveAndRescan: projectDir is required');
  }
  const pexec = deps.pexec || sharedPexec;
  let head;
  try {
    const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], {
      timeout: 5000,
      cwd: projectDir,
    });
    head = String(stdout ?? '').trim();
  } catch (cause) {
    throw new NormalizationRefusalError('normalization-authority-drift', cause);
  }
  const operatorHead = head;
  let operatorContext;
  const capture = deps.captureArtifactOperator ?? captureArtifactOperator;
  const assertCurrent = () => {
    if (!artifactSubject) return;
    validateArtifactSubject({ projectDir, artifactSubject });
    if (JSON.stringify(capture({ projectDir, issueNumber })) !== JSON.stringify(operatorContext))
      throw new NormalizationRefusalError('normalization-authority-drift');
  };
  if (artifactSubject) {
    validateArtifactSubject({ projectDir, artifactSubject });
    operatorContext = structuredClone(capture({ projectDir, issueNumber }));
    head = sourceCommit({ artifactSubject, operatorHead });
  }
  const readBack =
    deps.readBack ||
    (async () => {
      const body = await fetchLiveBody({ pexec, issueNumber, repo });
      const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], {
        timeout: 5000,
        cwd: projectDir,
      });
      return { body, head: String(stdout ?? '').trim() };
    });
  const result = await persistReadyNormalizations({
    issueNumber,
    repo,
    head,
    evaluatedAt: (deps.nowIso || (() => new Date().toISOString()))(),
    refreshAndEvaluate: async (input) => {
      assertCurrent();
      return deps.refreshAndEvaluate(input);
    },
    mutateBody: deps.mutateBody,
    deps: { pexec },
    readBack: async () => {
      const observed = await readBack();
      if (artifactSubject) {
        assertCurrent();
        if (observed.head !== operatorHead)
          throw new NormalizationRefusalError('normalization-authority-drift');
        return { ...observed, operatorHead: observed.head, head: artifactSubject.commitSha };
      }
      return observed;
    },
  });
  return {
    scanBody: result.body,
    derived: { status: result.persisted ? 'ok' : 'noop' },
    errors: [],
    persisted: result.persisted,
    decision: result.decision,
    warnings: result.warnings,
  };
}
