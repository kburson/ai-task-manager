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

export async function deriveAndRescan({ issueNumber, repo, deps = {} } = {}) {
  if (typeof deps.refreshAndEvaluate !== 'function') {
    throw new TypeError('deriveAndRescan: complete fresh guard evaluator is required');
  }
  const pexec = deps.pexec || sharedPexec;
  let head;
  try {
    const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], { timeout: 5000 });
    head = String(stdout ?? '').trim();
  } catch (cause) {
    throw new NormalizationRefusalError('normalization-authority-drift', cause);
  }
  const result = await persistReadyNormalizations({
    issueNumber,
    repo,
    head,
    evaluatedAt: (deps.nowIso || (() => new Date().toISOString()))(),
    refreshAndEvaluate: deps.refreshAndEvaluate,
    mutateBody: deps.mutateBody,
    deps: { pexec },
    readBack:
      deps.readBack ||
      (async () => {
        const body = await fetchLiveBody({ pexec, issueNumber, repo });
        const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], { timeout: 5000 });
        return { body, head: String(stdout ?? '').trim() };
      }),
  });
  return {
    scanBody: result.body,
    derived: { status: result.persisted ? 'ok' : 'noop' },
    errors: [],
    persisted: result.persisted,
    decision: result.decision,
  };
}
