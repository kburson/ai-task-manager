<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-ceeecb3db9ae33154a3aa9cd648031fd"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-24-1787-delivery-waiver.md"
artifact_commit: "7caf638d4aea750e86a8fd5d6745c4c5f89342c7"
artifact_blob: "d4a8d182ad8340452f61d410df19e12d8eb80042"
artifact_digest: "sha256:3d513a3943596389d27e283b93bdec93dd51638e3c502993947804ea4ce42618"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:015bfd8c5a7e03183ff143d1019edf10c1146f744166fa600689464d04103b2b"
  identity_source: "runtime"
started_at: "2026-09-25T02:03:05.987Z"
submitted_at: "2026-09-25T02:18:01.377Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Accepted all four required changes and addressed all five optional suggestions.
The accepted spec remains unchanged. The input-contract ID uses its explicitly
permitted finer-split rule; the remaining changes clarify plan verification,
failure precedence, and an explicit fail-closed availability limitation.

The submitted reviewer response uses numbered findings and its package-sealed
`finding_ids` list is empty. The dispositions below address every numbered
finding without inventing IDs or changing protected protocol metadata.

## Finding dispositions

1. **Finding 1, integration gate: accepted.** Task 11 now runs
   `npm run test:integration` as well as the focused three-file integration
   command, fast/unit lane, and slow lane. No existing integration suite is
   intentionally excluded. The ordinary delivery-close, #1755, external recovery,
   workflow-exception/preflight, and package regression obligations are explicit.
2. **Finding 2, structural-input capability collision: accepted, option (a).**
   `input` and `input-keys` now map to new non-waivable
   `delivery.verification.input-contract`, in `delivery-waiver-guardrail` with
   both flags false. The eight eligible IDs remain; guardrails increase to four.
   Task 2 tests every described raising-site class even with a valid
   intent-integrity grant. Task 8 runs structural validation before eligibility.
3. **Finding 3, error-precedence contradiction: accepted.** Task 1 distinguishes
   single-failure baseline guarantees from three explicitly reorder-sensitive
   multiple-failure cases. Task 8 owns their rebaseline in the reorder commit:
   invalid merge SHA -> `merge-commit-sha`, invalid timestamp -> `merged-at`,
   valid-but-unknown topology -> `merge-method-unknown` under the hard evidence
   ID. The method-only refusal remains exactly `merge-method`. No fixture may
   become successful or write a terminal receipt as part of this rebaseline.
4. **Finding 4, unresolved-publication recovery: accepted, explicit terminal
   automated-progress contract.** The serialization decision and Tasks 6/10/11
   now require a typed `indeterminate` ambiguity with stage, operation, burned
   versus reserved state, and bounded human escalation. There is no force-POST,
   timeout takeover, new operation, or administrator-assertion override. A later
   exact original comment can reconcile; otherwise preserve evidence and escalate
   through the defect/incident workflow to the repository administrator. A new
   recovery mechanism requires separate design and explicit authorization.
   This is a disclosed availability limitation, not a claim that arbitrary
   distributed-write uncertainty can be safely resolved by this issue.

## Changes made

- Tightened Task 1's characterization assertion to exact `error.category`.
- Named the separate exact generic-waiver input-key set and the forbidden
  v2/generic, v3/missing-evidence, and mixed-evidence combinations.
- Renamed the new authority module to `workflow-policy/delivery-waiver-authority.mjs`
  throughout the plan; the existing delivery-authority module is not renamed.
- Named fixture-only helper files for authority, consumption, and the two-clone
  harness. Kept the named suite entrypoints and explicit 800-code-line test cap.
- Added journal namespace growth, branch-display filtering, explicit journal
  fetch requirements, and no automatic cleanup/configuration-change guidance.
- Preserved the SAR-reviewed reservation/burn distinction, immutable `burnOid`,
  v1-to-v3 graph restriction, pinned historical verification, and #1783 boundary.

## Declined changes and rationale

None of the required changes was declined. For Finding 4, selected the reviewer's
explicit terminal-state/escalation option rather than inventing evidence that an
unknown POST definitely did not occur. This protects at-most-once publication;
the documentation must disclose the resulting recovery limitation.

## Verification

- Inspected `package.json` lane scripts and the verifier's input guards, early
  method comparison, and exact-key schema dispatch. They support the findings.
- Targeted plan Prettier formatting, Markdown lint, and `git diff --check` passed.
- The exact-category characterization passed with `error.category` equal to
  `merge-method` and no additional comment write.
- All 51 existing record/verifier/close/envelope tests passed, with zero failures
  or skipped tests.
- Revised plan SHA-256 is
  `785478b50d21c6001388c6edabca76470d99569f5cdde11be5dc326f2d09a6c0`.
- Proposed new schemas, journal transport, and integration tests remain future
  implementation work. No full implementation suite, real journal ref, or live
  waiver was executed for this document revision.
- Accepted spec digest remains
  `bcc6d2bf1f6b8ff50d3c1de1e38e3079a749ce3d7ead82656fba987e742f8ddb`.
