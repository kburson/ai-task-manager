# Author Response — Round 3 — #1219 Specification Only

Author: `codex`
Protocol: `c1655cdd-f0c8-48fd-95e3-57af190d9f0c`
Response to: `round-2-reviewer-review.md`
Previous reviewed commit: `3370ccb8cafb42b629de1561094310f72d2b35a4`
Revised specification commit: `1375edfd4b29c98e407ae428a15f992dbdff2cd6`

## Dispositions

- [finding:F-001] [disposition:accepted] **Corrected.** The new receipt is now
  `aitm.delivery-receipt/v2`; lines 489-491 reserve v1 as closed legacy evidence
  that cannot authorize an enrolled candidate.
- [finding:F-002] [disposition:accepted] **Corrected.** Lines 136-138 define a recorded
  branch as the latest valid, unambiguous `aitm-worktree-location` authority
  record and exclude synthesized fallback. Lines 341-348 require fail-closed
  resolution and pin both refs and the tier classification in the trusted
  enrollment manifest for one generation.
- [finding:F-003] [disposition:accepted-with-modification] **Corrected.** Lines 322-327 define the narrow
  collapsed-tier close lane using terminal child receipts plus the existing
  no-commit authorization. Lines 498-522 make both the normal and collapsed
  implementation-record variants representable and mutually exclusive.
- [finding:F-004] [disposition:accepted] **Corrected.** Lines 732-735 now target the
  existing Full-Auto Doctrine in `docs/guides/workflow.md` and its actual
  contract test. No nonexistent `full-auto.md` is named.
- [finding:F-005] [disposition:accepted] **Corrected.** Lines
  727-729 add `state-walk.md` and the related `functional-dod.md` Review guidance
  while preserving the explicitly declared legacy path.
- [finding:F-006] [disposition:accepted] **Corrected.** Lines 409-425 and 561-563 define
  `aitm.runtime-capability/v3` as a strict successor rather than extending v2 in
  place. V2 remains legacy-readable but cannot authorize an enrolled candidate.
- [finding:F-007] [disposition:accepted] **Corrected.** Lines 580-584 define the
  incumbent v2 runtime and installed execution context on `authorityHostId` as
  the first activation's genesis authority, with no candidate authorization.
- [finding:F-008] [disposition:accepted] **Corrected.** Lines 556-559 require
  realpath-resolved bidirectional containment refusal, not mere inequality.
- [finding:F-009] [disposition:accepted] **Corrected.** Lines 759-762 make hosted CI
  workflow, exact required contexts, and rehearsal observation separate
  fail-closed pilot prerequisites.
- [finding:F-010] [disposition:accepted] **Corrected.** Acceptance test 24
  at lines 703-705 proves all three #1512 controls independently and confirms
  the Full-Auto defaults.
- [finding:F-011] [disposition:accepted] **Corrected.** Lines 13-21 name #1512 in the
  authority clause and define the amendment's additive flow-review ordering
  without changing any enabled human gate.

## Reviewer questions

1. The authority source for the recorded branch is the existing durable
   `aitm-worktree-location` record, not a new parallel schema. The trusted
   enrollment manifest snapshots the resolved literal refs and classification;
   canonical fallback is prohibited for enrolled delivery.
2. A collapsed tier reuses `aitm.no-commit-delivery/v1`. The implementation
   record explicitly binds that authorization and the terminal child receipts,
   so no new aggregation-delivery schema is required.
3. `aitm.runtime-capability/v3` is the intended strict successor. It preserves
   v2's semantic identity fields, adds the root binding and new inventory, and
   keeps the v2 validator closed.
4. Yes. Live issue-body evidence shows #1219 and each immediate child #1220-#1225
   currently record `cloud-test-automation`. The rule remains generic and
   applies only when the trusted enrollment snapshot proves equality.

## #1486 sequencing

Lines 386-390 now record the agreed verdict: #1486 is advisable cleanup before
or alongside enrolled merge-back work, but is not a prerequisite for accepting
or implementing this specification. Every consumer must satisfy the same
fail-closed branch-authority contract whether consolidation happens first or
later.

## Verification

- Prettier check: pass
- markdownlint: pass
- cspell: pass
- `git diff --check`: pass
- Author-turn diff: only the specification file
- Worktree after commit: clean

Please review the complete specification at
`1375edfd4b29c98e407ae428a15f992dbdff2cd6`, not only this response or its diff.
