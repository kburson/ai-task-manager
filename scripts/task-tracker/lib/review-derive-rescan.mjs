// #502 — derive-and-rescan seam for the `test → review` completeness gate.
//
// Bug this fixes: `review.mjs` captured `rawBody` once at verb start, then ran
// the `#315` `deriveAndStampFunctionalDod` pass (which ticks the derived
// `acs`/`checkboxes` Functional-DoD keys into the LIVE issue body) but only
// refreshed the scan body inside a narrow `status === 'ok'` branch, all wrapped
// in a bare `catch { /* best-effort: failure must not abort the primary operation */ }`. Three independently-sufficient paths — derive returns
// `noop`, derive throws, or the post-derive refresh throws — left the scan body
// stale, so the completeness parity gate read un-ticked `acs`/`checkboxes` and
// falsely refused promotion with `test-to-review-incomplete`.
//
// `deriveAndRescan` makes the seam correct and observable:
//   - it runs the derive and LOGS (never silently swallows) any derive failure;
//   - it ALWAYS re-fetches the live issue body before returning, independent of
//     the derive result, so the gate scans ground truth;
//   - a failed refresh is logged and falls back to the caller's `scanBody`.
//
// All I/O is injected via `deps` so the path is unit-testable offline.

import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

// Re-fetch the live issue body. Throws on failure (caught by the caller).
async function fetchLiveBody({ pexec, issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return String(stdout || '');
}

// Run the `#315` derive pass, then ALWAYS re-fetch the live body for the gate.
//
// Params:
//   - issueNumber, repo: target issue.
//   - scanBody: the pre-derive body to fall back to if the live refresh fails.
//   - deps: { pexec, deriveAndStampFunctionalDod, nowIso, log } — all injectable.
//     `log` defaults to `console.error`; `nowIso` to `() => new Date().toISOString()`.
//
// Returns `{ scanBody, derived, errors }`:
//   - scanBody: the body the caller should scan (live body, or the fallback).
//   - derived:  the `deriveAndStampFunctionalDod` result, or null if it threw.
//   - errors:   array of { phase, message } for every non-fatal failure logged.
export async function deriveAndRescan({ issueNumber, repo, scanBody, deps = {} } = {}) {
  const pexec = deps.pexec;
  if (typeof pexec !== 'function') {
    throw new TypeError('deriveAndRescan: deps.pexec is required');
  }
  const deriveAndStampFunctionalDod = deps.deriveAndStampFunctionalDod;
  if (typeof deriveAndStampFunctionalDod !== 'function') {
    throw new TypeError('deriveAndRescan: deps.deriveAndStampFunctionalDod is required');
  }
  const nowIso = deps.nowIso || (() => new Date().toISOString());
  const log = deps.log || ((msg) => console.error(msg));

  const errors = [];
  let derived = null;
  let resultBody = String(scanBody ?? '');

  // 1. Derive pass — log (never swallow) any failure.
  try {
    let derivedHeadSha = 'unknown';
    try {
      const { stdout: shaOut } = await pexec('git', ['rev-parse', '--short', 'HEAD'], {
        timeout: 5000,
      });
      derivedHeadSha = (shaOut || '').trim() || 'unknown';
    } catch (shaErr) {
      const message = shaErr?.message ?? String(shaErr);
      errors.push({ phase: 'rev-parse', message });
      log(`[review] derive-rescan: git rev-parse failed (using sha=unknown): ${message}`);
    }
    derived = await deriveAndStampFunctionalDod({
      issueNumber,
      repo,
      sha: derivedHeadSha,
      ts: nowIso(),
      deps: { pexec },
    });
  } catch (derErr) {
    const message = derErr?.message ?? String(derErr);
    errors.push({ phase: 'derive', message });
    log(
      `[review] derive-rescan: #315 derive pass failed (non-fatal, rescanning live body): ${message}`
    );
  }

  // 2. ALWAYS re-fetch the live body, regardless of the derive outcome. This is
  //    what makes the gate read ground truth even when the derive returned
  //    `noop` or threw above.
  try {
    resultBody = await fetchLiveBody({ pexec, issueNumber, repo });
  } catch (refErr) {
    const message = refErr?.message ?? String(refErr);
    errors.push({ phase: 'refresh', message });
    log(`[review] derive-rescan: live-body refresh failed; scanning pre-derive body: ${message}`);
  }

  return { scanBody: resultBody, derived, errors };
}
