// Agent Review Gate — V5 ac-dod-vc-attributes validator (#814, epic #808).
//
// Backstops the resolvable-verifier-citation invariant at Review. The same
// invariant is enforced once at the Refine→Plan exit gate; V5 re-checks it at
// Review and extends it to the Functional-DoD block, so an issue cannot reach
// Done with an Acceptance-Criteria or stampable Functional-DoD item that lacks a
// runnable verifier — or that cites a `vc:N` resolving to no `## Verification
// Commands` entry.
//
// Two halves, composing the existing lib helpers (no new parsing primitives):
//
//   AC half (`body-invariants.mjs`):
//     - findAcsWithoutVerifierOrInvalidTag — ACs with no verifier, a malformed
//       verifier, or only the `npm run test:all` regression floor (which proves
//       nothing specific to the AC), unless honestly tagged non-demonstrable or
//       waived.
//     - findAcsWithLegacyVerificationForm — ACs on a deprecated `cmd` attribute
//       or a `vc-list` naming a `vc:N` with no matching live VC id
//       (`dangling-vc-list`).
//
//   DoD half (`functional-dod-evidence.mjs`):
//     - parseFunctionalDodKeys enumerates `dod:functional:KEY` items. Only
//       *stampable* keys (tests, lint, commits) must carry a resolvable verifier
//       — a literal `cmd="`…`"` or a resolvable `vc-list`, surfaced as
//       `evidenceCommands`. *Derived* keys (acs, checkboxes) are computed from the
//       body and carry no verifier by design, so they are skipped.
//
// Absence defers. A body with no `## Acceptance Criteria` heading, or no
// Functional DoD block, is V1 body-sections' concern — V5 returns a vacuous pass
// for the missing section so the demotion reason is not mis-attributed (mirrors
// V4's absence-defers-to-V2 rule). Each helper already returns [] when its
// section is absent, so composition yields the vacuous pass for free.
//
// Consumes `context.body` — the raw issue-body string. Pure, no side effects.

import { registry } from '../registry.mjs';
import {
  findAcsWithoutVerifierOrInvalidTag,
  findAcsWithLegacyVerificationForm,
} from '../../body-invariants.mjs';
import { parseFunctionalDodKeys } from '../../functional-dod-evidence.mjs';

// Human-readable rendering of a body-invariants offender `{ label, reason }`.
function acFailure({ label, reason }) {
  return `Acceptance Criteria item lacks a resolvable verifier (${reason}): ${label}`;
}

export function validate({ body } = {}) {
  const src = String(body || '');
  const failures = [];

  // AC half — union of the two finders. An AC can appear in both (a dangling
  // vc-list resolves to no command, so it is `no-verifier` in the first finder
  // AND `dangling-vc-list` in the second); dedupe by line, listing the
  // legacy-form finder first so the more specific reason (`dangling-vc-list`,
  // `ordinal-cmd-citation`, `backtick-embedded-cmd`) wins over the generic
  // `no-verifier` when both fire.
  const seenAcLines = new Set();
  for (const off of [
    ...findAcsWithLegacyVerificationForm(src),
    ...findAcsWithoutVerifierOrInvalidTag(src),
  ]) {
    if (seenAcLines.has(off.lineIndex)) continue;
    seenAcLines.add(off.lineIndex);
    failures.push(acFailure(off));
  }

  // DoD half — every present stampable key whose line resolves to no verifier
  // command. Derived keys (acs/checkboxes) are exempt by classification.
  for (const item of parseFunctionalDodKeys(src)) {
    if (item.classification !== 'stampable') continue;
    if (item.evidenceCommands.length > 0) continue;
    failures.push(`Functional DoD item "${item.key}" lacks a resolvable verifier: ${item.label}`);
  }

  return { pass: failures.length === 0, failures };
}

export const acDodVcAttributesValidator = {
  id: 'ac-dod-vc-attributes',
  describe: () =>
    'V5: every AC and stampable Functional-DoD item carries a resolvable verifier citation',
  validate,
};

registry.register(acDodVcAttributesValidator);

export default acDodVcAttributesValidator;
