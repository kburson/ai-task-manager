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
import { locateLifecycleSection } from './lifecycle-dod.mjs';
import {
  parseFunctionalDodKeys,
  stampEvidenceMarker,
  deriveAcsStatus,
  deriveCheckboxesStatus,
} from './functional-dod-evidence.mjs';

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
    mutate: (base) => {
      const items = parseFunctionalDodKeys(base);
      const acsItem = items.find((it) => it.key === 'acs');
      const cbItem = items.find((it) => it.key === 'checkboxes');
      let next = base;

      // 1. acs
      if (acsItem) {
        const ac = deriveAcsStatus(next);
        if (ac.allTicked && !acsItem.evidenceMarker) {
          next = stampEvidenceMarker(next, 'acs', {
            cmd: 'derive:all-acceptance-criteria-ticked',
            sha,
            ts: stampTs,
            exit: 0,
          });
        }
        if (ac.allTicked && !acsItem.checked) {
          next = next.replace(/^(- \[) (\]\s+Acceptance criteria met\b)/m, '$1x$2');
        }
      }

      // 2. checkboxes — must run AFTER acs so the acs tick is counted.
      if (cbItem) {
        const lifecyclePresent = Boolean(locateLifecycleSection(next));
        const cb = deriveCheckboxesStatus(next, { lifecyclePresent });
        if (cb.allTicked && !cbItem.evidenceMarker) {
          next = stampEvidenceMarker(next, 'checkboxes', {
            cmd: 'derive:all-non-self-non-lifecycle-checkboxes-ticked',
            sha,
            ts: stampTs,
            exit: 0,
          });
        }
        if (cb.allTicked && !cbItem.checked) {
          next = next.replace(/^(- \[) (\]\s+Issue body checkboxes ticked\b)/m, '$1x$2');
        }
      }

      return next;
    },
  });
}
