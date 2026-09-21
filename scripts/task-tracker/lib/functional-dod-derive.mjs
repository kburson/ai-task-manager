// #315 — Shared helper: parse → derive → stamp → tick for the two derived
// Functional DoD keys (`acs`, `checkboxes`). Extracted from verbs/close.mjs
// so verbs/review.mjs can run the same pass before its `uncheckedPreCloseCheckboxes`
// parity scan. Without this, review refuses promotion on stories whose every
// AC + every non-self checkbox is genuinely complete but whose two derived
// keys haven't been auto-stamped yet (close.mjs would have done it).
//
// Behavior contract (must match the inline close.mjs block byte-for-byte at
// the body-mutation level):
//
//   1. `acs` is derived first. If `deriveAcsStatus(body).allTicked` is true and
//      no `aitm-dod-evidence:acs` marker exists, stamp one and tick the
//      "Acceptance criteria met" box.
//   2. `checkboxes` is derived second — must run AFTER `acs` so the newly
//      ticked `acs` box is counted by `deriveCheckboxesStatus`. Same stamp +
//      tick contract using the `checkboxes` key.
//   3. All mutations happen inside a single `mutateIssueBody` call so the body
//      version increments once.
//
// Idempotency: if a derived key already has its evidence marker, no re-stamp.
// If the box is already ticked, no re-tick. Safe to call multiple times.

import { mutateIssueBody } from './issue-body-mutate.mjs';
import { projectFunctionalDod } from './functional-dod-project.mjs';

/**
 * Derive and stamp the two auto-derived Functional DoD keys on an issue body.
 *
 * @param {object} args
 * @param {number} args.issueNumber       — GitHub issue number to mutate.
 * @param {string} args.repo              — `owner/name` repo slug.
 * @param {string} [args.sha]             — Short HEAD SHA to record in the
 *                                          evidence marker. Defaults to
 *                                          `'unknown'` when omitted; callers
 *                                          that have a SHA (e.g. close.mjs
 *                                          already shelling out to git)
 *                                          should pass it.
 * @param {string} [args.ts]              — ISO timestamp for the marker.
 *                                          Defaults to `new Date().toISOString()`.
 * @param {object} [args.deps]            — Injected dependencies (pexec, etc.)
 *                                          forwarded to `mutateIssueBody`.
 * @returns {Promise<{status:'ok'|'noop',attempts:number,version:number}|null>}
 *          The `mutateIssueBody` result. `null` only if the helper itself
 *          early-returns (currently it does not).
 */
export async function deriveAndStampFunctionalDod({
  issueNumber,
  repo,
  sha = 'unknown',
  ts,
  deps = {},
} = {}) {
  if (issueNumber == null) {
    throw new Error('deriveAndStampFunctionalDod: issueNumber is required');
  }
  if (!repo) {
    throw new Error('deriveAndStampFunctionalDod: repo is required');
  }
  const stampTs = ts || new Date().toISOString();
  return mutateIssueBody({
    issueNumber,
    repo,
    deps,
    // #522 — sanctioned close-pipeline auto-stamp: the derived `acs`/`checkboxes`
    // evidence is computed from the body's own ticked state at close time, so the
    // proof-introduction guard is bypassed for this minting site.
    evidenceStamp: true,
    mutate: (base) => projectFunctionalDod({ body: base, head: sha, evaluatedAt: stampTs }).body,
  });
}
