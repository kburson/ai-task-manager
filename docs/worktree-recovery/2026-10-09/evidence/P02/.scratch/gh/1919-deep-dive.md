## Deep-Dive Analysis (2026-10-08)

Current implementation source: docs/superpowers/plans/2026-10-08-1919-ci-checkpoint-repair.md @ 5177aa40f1c34facec6bd51f26bd71066a5c348b.

Preserve and qualify only the UTC signed-zero producer correction and synchronous DATA-validation work in audit-timing.mjs, schema.mjs and records.mjs. Add the already-declared missing focused checkpoint verifier. Do not reimplement headless actor lifetime changes, alter transition tails, replace real fixtures with mocks, or claim inherited CI failures fixed by unrelated local success.

The committed #1855 checkpoint 14f6c5589724e9d2a33c2353c19f0c793bfe6033 produces the native phase offset by negating getTimezoneOffset; UTC produces negative zero and its original Linux job reports canonical-json:invalid:number. The retained parent source uses subtraction from positive zero and preserves the strict raw-negative-zero validator. The actual UTC phase-11 case passed locally in about 72 seconds; its existing timeout remains 600000ms.

The retained schema suite passed all 19 cold/warm, mutation, recovery, accessor, throw and real-await cases. The existing linked-plan source suite passed all five genuine native source/approval/drift cases. These are pre-implementation observations on the retained source, not exact-head child delivery or Linux evidence.

The declared focused checkpoint file is absent. On this installed Node version, the declared two-path command nevertheless runs only the 19 schema cases and exits zero. That result cannot prove the UTC or linked-source obligations. The new checkpoint entrypoint must visibly execute those behaviors and refuse zero selected tests.

The inherited failing Linux job is run 37724695483, integration job 113140086190, at checkpoint 14f6. Its log reports 92 failing files, including native actor/phase failures. It reports the linked-source transaction file passing in 173.3 seconds and the basic linked-source file passing in 7.5 seconds. Preserve that distinction; do not fabricate a historical timeout from this job. The first repair still must qualify current Linux execution under the unchanged budget.

- Node.js scripts and Markdown only; no compiled binaries/addons.
- Preserve original algorithms, current-source/authority checks, input identity, errors, and lock/resource ordering.
- Successful DATA validation may be reused only inside one synchronous validation call. Never cache authority or readiness across awaits, effects, returns, throws or later observations.
- Never delete tests, shrink fixtures, raise timeouts, weaken raw-zero refusal, or copy prior receipts onto new HEADs.
- Keep the existing 600000ms per-file and semantic-section budgets, 20-minute verifier ceiling, and 45-minute lifecycle sandbox budget.
- Preserve all six live Verification Commands, including npm test, slow, lint, format and commit-trail obligations. Report inherited failures by name and scope; no global-green claim without actual evidence.
- Re-estimate from incremental work only; any individual forecast at or above 24 human hours must split again.

- UTC is canonical positive zero while caller-supplied negative zero still refuses through real actor/schema validation.
- Chicago control uses the same original phase-11 case; a wrapper must not overwrite its requested timezone back to UTC.
- Warm DATA validation preserves original objects, accessors, error types, changed/repaired inputs and cleanup at return/throw/await.
- The new focused entrypoint runs actual complete owned cases, detects empty selection, isolates mutable test globals, and respects original budgets.
- Historical Linux failures and current local passing cases remain separate from new exact-head Linux CI and full-suite results.

Source inspection confirms that audit-timing.mjs already contains the positive-zero subtraction producer, while schema.mjs and records.mjs already contain the private synchronous DATA-only scope. Existing tests exercise invalid and repaired DATA, native request/proposal identity, nested accessors without getter effects, throw/return/real-await expiration, cold error parity and changed archived data. The child will preserve and qualify these implementations rather than rebuild them or copy old receipts. The missing checkpoint entrypoint will execute the actual complete actor and linked-source cases in separate processes; it cannot substitute another transition constructor or share their mutable process globals. A Chicago control invokes the original phase-11 file directly so the UTC wrapper cannot overwrite its requested timezone. Real Linux qualification must still use the unchanged 600000ms budget. The exact old job log distinguishes actual UTC failures from linked-source cases that already passed; no fictional historical timeout is claimed. Unknown or remaining failures stay explicit rather than being repaired outside this bounded slice. The beneficiary is the delivery owner, the capability is restoring actor and linked-source checks without relaxing validation, the need is unpublished/unqualified retained corrections, and the value is defensible bounded CI progress. Scope, accepted Task 5, the original design, current retained source and actual test outputs ground all claims. This story differs from sibling #1909 writer admission and later transition completion. It is readable independently. All seven semantic story questions pass on these inspected sources.

### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** restore the existing actor and linked-source checks without relaxing validation
- **Need:** the preserved local checkpoint contains corrections that have not been published or qualified on Linux
- **Value or failure prevented:** the first repair can demonstrate bounded CI progress over the exact published baseline
