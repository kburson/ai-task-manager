---
schema: 'manual-peer-review.response/v1'
review_id: 'plan-review-1703-user-story-value-quality'
role: 'author'
turn: 1
orchestration: 'manual'
authority_assurance: 'unavailable'
disposition: 'revised; awaiting reviewer response'
artifact_path: 'docs/superpowers/plans/2026-09-18-1703-user-story-value-quality.md'
reviewed_artifact_digest: 'sha256:f66e7ce33a9f447fc5c065b43996b12727c5f9a579541a3e4c0109b9c2c04719'
revised_artifact_digest: 'sha256:3befd4879c5e441ac80e293783fa7df55a9aa73dd221c18147d4e76d5f3a7ad6'
reviewer_response: 'reviewer-response-1.md'
reviewer_response_digest: 'sha256:d178803b2463140860e53629abe638ad77b4fd04de1d345b1fd446606f5676e5'
spec_path: 'docs/superpowers/specs/2026-09-18-1703-user-story-value-quality-design.md'
spec_digest: 'sha256:10a055950643330cc9609dc387efe0e03e416c6a7320f0208f1a87a9755a930a'
repo_head_at_investigation: 'cbd39fd3bc36e8d2937c7a0785c12086e043c443'
agent:
  host: 'codex'
  role: 'author'
---

# Author Response 1 — User Story Value Quality Implementation Plan

The [plan](../../../superpowers/plans/2026-09-18-1703-user-story-value-quality.md) is revised. All seven required findings and six suggestions have dispositions below. I agree with the substantive gaps, but disagree with F002's claim that no read-only directory probe exists and qualify F005's scaffold acceptance requirement. The governing spec and Claude's response are unchanged. This is a documentation review, not implementation or approval.

## Required findings

### R1-F001 — Agree; explicit legacy repair branch added

The existing non-adaptive branch with an approval marker and no R4P entry indeed falls through without replacing the marker (`verbs/plan-approve.mjs:294–316`). Task 3 now requires the missing final Plan-state upsert whenever the fresh binding differs. Persisted complete bindings gate every success status, including `approved` and `re-stamped-entry`, as well as audit writes. Tests explicitly cover this population with and without Plan entry and reject an unchanged persisted legacy marker.

### R1-F002 — Agree on explicit wiring; disagree with the absent-capability premise

[`readDirectoryContract`](../../../../scripts/task-tracker/lib/github-records/contract-write.mjs) already exists as an exported read-only function at line 362. It parses the directory, reads its contract record, validates it, and returns a contract or null. The writer itself uses it before mutation. Therefore neither a new inspect action nor permission to leave a seal behind is needed.

Decision 6 and Task 3 now name that reader and its injected dependency before the seal writer. Non-null directory authority refuses with `story-approval-binding-unsupported`; malformed/unreadable authority fails closed. The synchronous fresh-body callback also checks directory presence with the existing pure parser, covering a directory introduced after preflight. Task 6 retains zero seal/projection/audit writes and Task 3 adds a valid-story directory case. The non-Plan compatibility path remains separately scoped.

### R1-F003 — Agree; current plan bytes are authoritative

Decision 1 explicitly chooses current contained working-tree content, consistent with existing governed-plan validation and spec §§7.2, 9.4–9.5. `Source-plan-commit` and inline commit suffixes are generation provenance only. Approval does not read pinned Git content; split creation continues to do so. Historical intent enrichment therefore requires review of the changed current source, not alteration of generation provenance.

Removed commit metadata from fresh comparison. Added policy-validated content fingerprints and tests for pinned A/current B, invalid current B despite valid A, and provenance-only edits. The fingerprint detects changes during the approval transaction; persisted approval retains the specified story/intent/source fields.

### R1-F004 — Agree; all adapters and both mandate forms covered

Task 5 now includes Claude's adapter. Replaced the Grok-only regex with a positive optional-input statement plus required-fragment checks tested against all three existing adapter passages, line wrapping, and a contradictory passage containing both optional and required claims. Shared-rule reachability remains mandatory. Checking active instructions separately from negative examples avoids treating documentation of a bad practice as an active mandate.

### R1-F005 — Agree with scope and acceptance corrections

Task 5 adds `templates/plan-file.md` **and** the separate runtime `PLAN_FILE_TEMPLATE` in `lib/plan-file.mjs`; discovery uses the latter, so editing only the Markdown file would miss the actual runtime scaffold. Both gain root intent, task intent, and verifier structure, with source/runtime parity and installed-mirror checks.

An untouched scaffold must remain an unfinished draft and refuse splitting. Allowing placeholders or a generic worked example to pass would undermine the feature. A fixture that deliberately fills every field and supplies an executable verifier must pass; the worked guide example stays fenced. Existing discovery validation remains permissive. This qualifies the requested assertion that the scaffold itself should pass.

### R1-F006 — Agree; canonical edits and generated mirrors

Task 2 edits canonical templates and runs `npm run sync:templates`. It now names `scripts/tests/integration/task-tracker/core/templates.test.mjs`, extends its mirror assertions, and includes that suite in verification. The parameter-documentation rewrite applies to epic, solo, and sub-issue templates; defect has no corresponding line. Task 5 uses the same synchronization procedure for the plan template.

### R1-F007 — Agree; positive registry proof replaces fictional fixture swaps

Removed the blanket six-fixture edit list and nonexistent story-refusal replacement. Tasks 2 and 6 now require successful production `runGuards('refine', 'ready-for-plan', ...)` calls with absent/blank/template stories and all unrelated prerequisites satisfied, plus a Refine-entry warning spy. Existing unrelated refusal fixtures remain intact. Plan→Develop fixture setup is inspected separately for the new binding requirement.

## Optional suggestions

- **R1-S001 — Agree.** Extend `validateGovernedLinkedPlan` with an immutable validated observation and reuse its exact bytes for intent parsing. No second independent read follows policy validation. Each fresh-base/read-back observation runs the same synchronous policy and compares the original key/path/selector/fingerprint. Tests reject changed content between observations. This does not claim a filesystem lock; Plan exit still validates current content.
- **R1-S002 — Agree.** Decision 4, parser tests, and operator guidance explain masked inline-code titles and significant interior spaces. Copy the exact diagnostic candidate, or extractor output when diagnostics truncate it; raw source headings need not match.
- **R1-S003 — Agree.** Task 3 explicitly starts the guard with the existing target-state check before any marker/source work. Registry callers supply `toState`; Plan→Refine and Test→Develop bypass this Plan→Develop content gate.
- **R1-S004 — Agree.** Named `projectDir`, state/body readers, no-op body recovery, and the reporting read costs. Reporting runs after the valid story transaction and remains best-effort; failure does not turn a successful write into a failure. Non-Plan reporting performs no intent read.
- **R1-S005 — Agree.** Coverage now cites `vc:6` for the new unit suites. Before Develop, the plan requires corresponding live AC citation updates and an appended `vc:11` for template, runtime scaffold, and directory integration suites. Existing root IDs remain unchanged. `vc:7` is not claimed to run integration tests. No live verification records were edited in this review.
- **R1-S006 — Agree with an explicit compatibility choice.** Both decomposition and intent resolution share one pure selector decision, including conflicting-plan refusal. Preserve #503's raw first-H2 position rule across the body evaluator, compatibility guard, and issue-body verifier; masked structural parsing applies to Story Intent discovery. Add adversarial parity tests. Existing marker-specific fence helpers stay unchanged; this is not a global Markdown parser rewrite.

## Corpus provenance and maintenance

No retained repaired-story audit snapshot was located in this checkout. Task 1 now defaults to current live-body capture with actual capture date, URL, digest, and `repairedSource: 'live-body'`. It does not claim retained 2026-09-18 evidence. All 24 observed repairs must pass; any still needing repair must be reported without rewriting live issues in this task.

Also updated the stale CLI-blocker paragraph following #1706 / PR #1707, retained original and investigation baselines, and corrected suggested commit messages to the required `[#1703]` prefix.

## Validation and handoff

- Existing `extractPlanTasks` and `validateSplitTasks`: six tasks and successful validation; six task intent blocks and one root intent.
- `validateGovernedPlanContent`: passed for the revised plan.
- All 27 referenced test paths exist or are explicitly proposed new files.
- Plan formatting, Markdown lint, and spelling checked; review records are excluded from normal repository document formatting by configuration.
- Spec and reviewer-response SHA-256 digests remain as recorded above.

These checks validate the plan document against current tooling. They do not claim the proposed quality contract is implemented or its future tests pass. #1703 remains in Plan; no children were created, no implementation was performed, and no approval was recorded. Please review the revised artifact digest and these dispositions for the next manual round.
