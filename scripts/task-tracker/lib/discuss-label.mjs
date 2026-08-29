// Discuss-label IO helper (#486).
//
// The hidden `aitm-discuss-requested` body marker is the AUTHORITATIVE durable
// state for "needs pre-implementation discussion." The configured project label
// (default "Discuss", `task-tracker.json#discussLabel`) is its VISIBLE mirror on
// boards and tables. This module is the thin shell that keeps the label in sync
// with the marker; all marker logic lives in `discuss-marker.mjs`.
//
// Label sync is a pure status mirror: present ⟺ `isDiscussPending(body)`. v1 has
// NO label-based cancel — removing the label by hand does not cancel a pending
// request; the next reconcile re-adds it from the surviving marker. Cancellation
// is only via completing the discussion (`markDiscussed`).

import { pexec as defaultPexec } from '../../gh/lib/gh-client.mjs';
import { mutateIssueBody } from './issue-body-mutate.mjs';
import { convergeDiscuss, isDiscussPending } from './discuss-marker.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

// Resolve the configured label name, falling back to the package default.
export function getDiscussLabel(cfg) {
  const name = cfg && typeof cfg.discussLabel === 'string' ? cfg.discussLabel.trim() : '';
  return name || 'Discuss';
}

// Add or remove the configured label to match `present`. Modeled on
// `refine.mjs::defaultAddLabels`. A repo that has never defined the label makes
// `--remove-label` fail with "label not found"; that is swallowed (removing an
// absent label is already the desired state). An add of a missing label is a
// real misconfiguration and is NOT swallowed.
export async function syncDiscussLabel({ issueNumber, repo, label, present, deps = {} } = {}) {
  const pexec = deps.pexec || defaultPexec;
  const name = (label || '').trim();
  if (!name) return { ok: false, skipped: 'no-label' };
  const flag = present ? '--add-label' : '--remove-label';
  const args = ['issue', 'edit', String(issueNumber), '-R', repo, flag, name];
  try {
    await pexec('gh', args, { timeout: GH_API_TIMEOUT_MS });
    return { ok: true, action: present ? 'added' : 'removed' };
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    // Removing a label the repo never defined is a no-op, not a failure.
    if (!present && /not found|does not exist|could not add label/i.test(msg)) {
      return { ok: true, action: 'noop', swallowed: msg };
    }
    throw err;
  }
}

// Reconcile one issue: converge its body to the canonical resting state (strip
// the visible `{discuss}` token, ensure exactly one `aitm-discuss-requested`
// marker) in a single `mutateIssueBody` transaction, then sync the label to the
// resulting pending state. Idempotent and safe to run on every bind / sweep.
export async function reconcileDiscuss({ issueNumber, repo, cfg, deps = {} } = {}) {
  const pexec = deps.pexec || defaultPexec;
  const ts = deps.ts;
  const label = getDiscussLabel(cfg);

  let pending = false;
  await mutateIssueBody({
    issueNumber,
    repo,
    deps,
    mutate: (base) => {
      const next = convergeDiscuss(base, ts ? { ts } : {});
      pending = isDiscussPending(next);
      return next;
    },
  });

  const labelResult = await syncDiscussLabel({
    issueNumber,
    repo,
    label,
    present: pending,
    deps: { pexec },
  });

  return { pending, label, labelResult };
}
