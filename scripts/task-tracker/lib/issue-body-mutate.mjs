// Canonical high-level helper for issue-body writes (#293).
//
// `mutateIssueBody` is a thin pass-through to `versionedWriteBody` whose
// signature DELIBERATELY OMITS a `body:` parameter. The omission is the
// point: it forces callers to express their write as a `mutate(base) →
// newBody` closure that derives its result from the freshly-fetched remote
// base, rather than a pre-computed snapshot that may have grown stale while
// the caller did other work.
//
// This closes the structural gap that broke #292: a `pushIssueBody({ body:
// <captured-snapshot> })` invocation reduces internally to `versionedWriteBody({
// mutate: () => body })` — an arrow function that ignores its `base` argument
// and clobbers every marker the live body acquired since the snapshot was
// captured. There is no equivalent escape hatch here.
//
// Counterpart enforcement lives at the `versionedWriteBody` layer
// (`checkStaleInput` in `versioned-issue-write.mjs`): if a caller's mutate
// returns a body still carrying an `aitm-body-version: N` marker AND
// `N < remoteVersion`, the write is refused with `reason: 'stale-input'`.
// That gate catches the snapshot pattern even when callers go around this
// wrapper directly.
//
// #361 — marker-loss invariant. Even when callers correctly use
// `mutateIssueBody`, a buggy `mutate` can return a string that drops hidden
// markers (a regex replacement that overshoots, a chain-of-replace that
// fails to account for one marker). Before the write hits the wire, the
// mutated body is diffed against `base` for the invariant markers defined in
// `lib/body-invariants.mjs`. If any marker disappears, the call throws
// `MarkerLossError` listing each lost marker. Pass `allowMarkerLoss: true`
// to bypass the check for the rare legitimate-strip case (correcting a
// typo'd marker; intentional reset). The override is explicit, audited, and
// counted at error-construction time.
//
// Returns the same shape as `versionedWriteBody`:
//   { status: 'ok' | 'no-op', attempts, version }
//
// Throws `BodyWriteRefusalError` on stale-input, overlapping-diff, or
// max-retries-exceeded; `MarkerLossError` on dropped invariant markers.

import { versionedWriteBody } from './versioned-issue-write.mjs';
import {
  findLostMarkers,
  findCheckboxesTickedWithoutProof,
  CheckboxProofMissingError,
  findNewMalformedVerifiedCmds,
  MalformedDeclarationCmdError,
} from './body-invariants.mjs';
import { findUnboldPlanMetadataLabels } from './plan-metadata.mjs';

export { CheckboxProofMissingError, MalformedDeclarationCmdError } from './body-invariants.mjs';

export class MarkerLossError extends Error {
  constructor(issueNumber, lostMarkers) {
    const list = Array.isArray(lostMarkers) ? lostMarkers : [];
    const msg =
      `mutateIssueBody on #${issueNumber}: mutate dropped invariant marker(s): ${list.join(', ')}.\n` +
      `  Re-write the mutate to preserve these markers, or pass \`allowMarkerLoss: true\` if the removal is intentional (correcting a typo'd marker, intentional reset).`;
    super(msg);
    this.name = 'MarkerLossError';
    this.issueNumber = issueNumber;
    this.lostMarkers = list.slice();
  }
}

export async function mutateIssueBody({
  issueNumber,
  repo,
  mutate,
  deps = {},
  maxRetries,
  allowMarkerLoss = false,
  allowUnverifiedTicks = false,
} = {}) {
  const warn = deps.warn || ((msg) => console.error(msg));
  if (issueNumber == null) throw new Error('mutateIssueBody: issueNumber is required');
  if (!repo) throw new Error('mutateIssueBody: repo is required');
  if (typeof mutate !== 'function') {
    throw new TypeError('mutateIssueBody: mutate must be a function (baseBody) => newBody');
  }

  // Wrap caller's mutate with a marker-loss check. The wrapper runs the
  // original mutate, diffs invariant markers between `base` and `next`,
  // throws `MarkerLossError` when any marker disappears (unless explicitly
  // overridden). Returning `next` preserves `versionedWriteBody`'s retry
  // semantics — the check runs on every retry's fresh base.
  const guardedMutate = (baseBody) => {
    const next = mutate(baseBody);
    if (typeof next === 'string') {
      if (!allowMarkerLoss) {
        const lost = findLostMarkers(baseBody, next);
        if (lost.length > 0) throw new MarkerLossError(issueNumber, lost);
      }
      // #362 — checkbox proof-marker invariant. Runs after marker-loss so
      // catastrophic invariant drops surface first.
      if (!allowUnverifiedTicks) {
        const offenders = findCheckboxesTickedWithoutProof(baseBody, next);
        if (offenders.length > 0) throw new CheckboxProofMissingError({ lines: offenders });
      }
      // #423 — malformed-declaration invariant. A write may not INTRODUCE an
      // `aitm-verified cmd="…"` declaration whose cmd is a placeholder or prose
      // rather than a real command. Diff-based so pre-existing markers and the
      // (non-mutateIssueBody) corpus migration are unaffected.
      const malformed = findNewMalformedVerifiedCmds(baseBody, next);
      if (malformed.length > 0) throw new MalformedDeclarationCmdError({ offenders: malformed });
      // #488 — Plan Metadata bold-label enforcement. Non-fatal: the pre-#416
      // corpus is unbold until the back-fill runs, so a hard refusal would
      // block every edit to a stale issue (including back-fill itself). A
      // stderr warning makes a plan-stage regression visible instead of silent.
      const unbold = findUnboldPlanMetadataLabels(next);
      if (unbold.length > 0) {
        warn(
          `mutate: plan-metadata-unbold-labels on #${issueNumber}: ${unbold
            .map((u) => u.label)
            .join(
              ', '
            )} — run \`node scripts/task-tracker/backfill-plan-metadata.mjs --apply\` to bold Plan Metadata labels`
        );
      }
    }
    return next;
  };

  return versionedWriteBody({ issueNumber, repo, mutate: guardedMutate, deps, maxRetries });
}
