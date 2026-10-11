<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-2cf594a8a446f9552e00ecc0ef920a86"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-11-1908-reestimate-decomposition-design.md"
artifact_commit: "83d422e92cf5f1ca95a5ef9ebd514c85698ee72e"
artifact_blob: "d777a17ac10117677f65776a55adc04e230900d8"
artifact_digest: "sha256:20b29a899742f77244f1a910bc1363f5fee8901f4f595e94bd9be46198f1fcc2"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6.1-sol"
  model_display: "gpt-6.1-sol"
  session_fingerprint: "sha256:bb64d972c6bc68752b59e43a1a4695d2a21a337d0c59b14ae9cfa0490cbaee42"
  identity_source: "runtime"
started_at: "2026-10-11T14:27:06.305Z"
submitted_at: "2026-10-11T14:33:11.260Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Addressed all three required changes in the first reviewer response, and settled the three optional suggestions. The additions define all supported issue kinds, bind exact governed recovery entrypoints to the assessment contract, and retire misleading waiver remediation. Existing classifier compatibility and effective proposal normalization are explicit. No product implementation, test execution, live incident change, human approval or lifecycle transition is claimed.

## Finding dispositions

The submitted reviewer response has no sealed finding IDs. The numbered dispositions below identify its prose findings without inventing protocol IDs.

1. **Kind taxonomy — accepted and addressed.** Confirmed `VALID_KINDS` and `NO_COMMIT_KINDS` in `scripts/task-tracker/lib/issue-kind.mjs`. Every supported non-epic kind, including `docs-only`, receives mandatory normalized >=24-hour assessment; only epic aggregate estimates are exempt. Defect is a shape/label with code runtime kind, not a new kind. No-commit lanes restrict new substantive scoped deliverable writes/publication and completion evidence while preserving reads, historical checkpointing, and spec/decomposition preparation. Explicit malformed kinds are indeterminate; genuine unmarked legacy issues retain default code. Added the AC1 and admission kind matrix.
2. **Recovery entrypoint coverage — accepted and addressed, with authority qualification.** Confirmed `verbs/kind.mjs` routes epic conversion through `scripts/gh/lib/epic-metadata.mjs` and other kind changes through governed body/DoD updates. Confirmed `verbs/split-plan.mjs` composes shared assessment, plan reads and sanctioned creator calls. Added them and child creation to the mandatory adapter/verifier table with existing `coverage-kind.test.mjs` and `split-plan.test.mjs`. Kind changes refresh assessment without pretending to revise an estimate. The permitted lane includes must-decompose, pending and indeterminate only when the operation's required underlying authorities are available; it cannot perform a split using unreadable scope/ownership. Pending intents survive conversion and require their normal reconciliation or supersession. Conversion retains unresolved readiness until reviewed children are actually materialized; it grants no product admission by itself.
3. **Obsolete waiver remediation — accepted and addressed.** Verified the literal waiver recommendation at `decomposition-plan-exit-guard.mjs:122` and prose-waiver admission/warning branch. Required removal of that recommendation/branch from current composition and audit of related guidance. Added concrete output regressions for Plan-exit, Explain and continuation. Historical waiver prose and unrelated independently authorized exceptions remain evidence/policy, not a recommendation to evade estimate enforcement.
4. **Vocabulary distinction — optional suggestion accepted.** Preserve pure classifier `must-split` and signal severity for compatibility; map centrally to assessment `must-decompose`. State precisely which statuses are assessment overlays. Guard/Explain/visible output share the mapping.

## Changes made

Added two complete contract sections to the canonical specification:

- “XPR clarification: issue kinds and classifier vocabulary” defines taxonomy, no-commit capabilities, classifier mapping and proposal ceiling normalization.
- “XPR clarification: governed recovery and guidance adapters” adds exact adapter/verifier rows, conditional recovery admission, pending-intent preservation, converted-epic readiness, and no-waiver remediation obligations.

Also stated that Ready for Planning is the current stage name and the historical On Deck storage slot creates no extra stage.

## Declined changes and rationale

No required correction was declined. Two details were qualified by repository evidence and the spec's fail-closed contracts:

- A request to permit recovery verbs under indeterminate cannot waive the operation's own unreadable ownership/scope/plan preconditions. Capability permission and usable operation authority remain separate; read-only preparation stays available.
- Compatibility proposal parsing uses `parseFloat`, but `runPlanEstimate` already applies `normalizeEstimateProjection`/`ceilEstimateHours` before append/repopulation. The spec preserves and tests that existing effective normalization rather than claiming it is absent.

## Verification

Read the complete reviewer response and checked the relevant source: issue-kind taxonomy/parser, kind conversion/body/DoD composition, split-plan assessment/creator adapters, literal Plan-exit waiver recommendation/admission branch, compatibility parsing and effective normalization. Verified existing kind and split-plan unit-suite paths.

Ran targeted Prettier write/check for the canonical spec, Markdown lint with the repository config, and `git diff --check`. All document checks passed. The revised spec retains the exact two requested regression paths, existing verifier mapping, source baseline, truthful estimate/history preservation, and separation from implementation/Plan approval. No implementation tests were run; the required regressions remain future delivery obligations.
