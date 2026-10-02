# Issue 1859 implementation progress

<!-- cspell:ignore WRQE -->

Execution plan: `docs/superpowers/plans/2026-10-01-1859-reviewed-scope-evidence.md`. Technical plan and spec remain the accepted inputs. Sol 6.1 drives implementation; subagents are used only for concurrent independent work.

## Checkpoints

- Task 1: strict manifest/record/pointer model, live Scope scanner, conservative verifier predicate and generated child policy are implemented. Regression tests were written and observed failing before implementation. Focused model/targets/split-plan suites and ESLint passed before this checkpoint.
- Task 2: runtime authority, physical bounded artifact validation and immutable same-issue comment reconciliation implemented; 40 focused tests and ESLint/Prettier passed. Committed and pushed as `5c935352`.
- Task 3: narrow branded transaction and early reviewed CLI route implemented. Focused checkbox/invariant/record suites pass (58 tests); existing body-writer plus transaction regression suites pass (34 tests). Parallel review identified a same-target race and whitespace route bypass; regression fixes also close the asynchronous generic writer bypass. ESLint/Prettier and diff checks pass.
- Task 5: complete non-ready normalization envelopes now survive initial evaluation, retries and successful-write readback. Typed completeness labels flow through Promote, Review and Close; explicit Git cwd is supplied. Worker verification: 148 focused tests, 46 adjacent contract/completeness tests, ESLint and refusal inventory lint passed.
- Task 4: adoption-aware readiness is registered only at Test exit with five typed refusal codes. Explicit execution/invoking directories and authority ports survive explanation, Review, Promote and the lower in-process host. Parallel review fixes cover duplicate labels, manifest labels and phase-owned targets. Combined focused suites pass (249 tests); the lower-host suite passes (9 tests), and ESLint passes.
- Task 6: generated six-target flow passes with artifact drift/recovery and 20 HEAD refresh rounds. Shipped guidance and fresh installed release certification pass. Seven negative recording paths assert zero comment/body writes; the eight flow tests pass. New normalization/consumer tests are split into files within the repository line cap. Full fast QA passes (921 files); full lint, exact issue verifiers (45 tests), new integration verification (27 tests), and consumer release certification (10 tests) pass. Slow QA identified two old consumer fixtures; their repairs pass focused verification (37 tests), and the complete slow lane passes (55 files). Task 6 and QA collateral are committed and pushed as `ae9e2ca8600cda57e7753c03ec441809c21c7075`. Final command results and retained logs are indexed in `verification.json`.

## Initial lifecycle admission

The sanctioned refine verbs advanced Backlog to Refine to Ready for Planning using initial XL/40h human sizing. Plan entry refused `native-dependencies:blocking-repository`: incoming blockedBy is empty, but outgoing blocking points to `kburson/ai-peer-review#132`. The current native dependency reader rejects that cross-repository identity. The relation is preserved and no stage jump or false approval was recorded. Implementation is explicitly authorized by the user; lifecycle admission remains unresolved separately.

## Final verification

All required commands pass: 921 fast files, 55 slow files, the exact first three issue verifiers (45 tests), new flow/consumer integration verification (27 tests), installed guidance consumer certification (10 tests), full lint and formatting. Focused suite counts overlap. The accepted specification and plan hashes are unchanged. Parallel implementation reviews found and resolved race, routing, context-forwarding and negative-test gaps; final guidance review found no actionable defect.

The initial draft retained temporary peer-review setup/hook changes and exact backups from `c4d0f60a`. The authorized delivery recovery now restores all seven files byte for byte and removes the duplicate backups; originals remain recoverable in Git history. No live reviewed Scope record, lifecycle approval, Test acceptance or delivery receipt has been fabricated.

## Delivery recovery on 2026-10-01

The incoming dependency readiness repair passes its red/green regression: outgoing cross-repository dependents no longer govern readiness, while incoming blockers remain validated. The native relation to ai-peer-review issue 132 is unchanged. All seven original setup files match the tracked backups exactly. The generated guidance fixture now supports the actual incoming-only query and final captures are regenerated from real CLI output without weakening validation. Fresh QA passes: 921 fast files, 26 dependency tests, 41 consumer tests, 32 adjacent Close/move-state tests, 10 installed guidance consumer tests, full lint and formatting. Counts overlap; `admission-verification.json` retains scope and log digests.

The sanctioned Plan transition completed. The legacy estimate appendix retains XL/40h. Retrospective deep-dive findings were authored and completed through the supported writer/verb. Plan approval refuses because there is no converged adaptive forecast; the linked accepted plan also lacks Story Intent metadata required by current approval. The XL decomposition gate still refuses. The attached recovery proposal is proposed only; no waiver or new approval has been recorded. The issue is currently Plan, not Develop, Test, Review or Done.

## Approved recovery checkpoint

The user approved option A on 2026-10-01T22:14:00.411Z. Workflow exception record 01M3WRQE3PWY7G256B1SKM42VX explicitly waives only planning.forecast and approval.plan until 2026-10-03T23:59:59.000Z. The complete visible Decomposition Waiver retains XL/40h. Fresh Explain reported ready and the sanctioned promote completed Plan to Develop with all eight tail steps verified. Earlier admission paragraphs above describe prior checkpoints. Test, Review, completion and delivery authority remain required. The recovery record checkpoint is pushed at 2fb889538.
