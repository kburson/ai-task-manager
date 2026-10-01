# Issue 1859 implementation progress

Execution plan: `docs/superpowers/plans/2026-10-01-1859-reviewed-scope-evidence.md`. Technical plan and spec remain the accepted inputs. Sol 6.1 drives implementation; subagents are used only for concurrent independent work.

## Checkpoints

- Task 1: strict manifest/record/pointer model, live Scope scanner, conservative verifier predicate and generated child policy are implemented. Regression tests were written and observed failing before implementation. Focused model/targets/split-plan suites and ESLint passed before this checkpoint.
- Task 2: runtime authority, physical bounded artifact validation and immutable same-issue comment reconciliation implemented; 40 focused tests and ESLint/Prettier passed. Committed and pushed as `5c935352`.
- Task 3: narrow branded transaction and early reviewed CLI route implemented. Focused checkbox/invariant/record suites pass (58 tests); existing body-writer plus transaction regression suites pass (34 tests). Parallel review identified a same-target race and whitespace route bypass; regression fixes also close the asynchronous generic writer bypass. ESLint/Prettier and diff checks pass.
- Task 5: complete non-ready normalization envelopes now survive initial evaluation, retries and successful-write readback. Typed completeness labels flow through Promote, Review and Close; explicit Git cwd is supplied. Worker verification: 148 focused tests, 46 adjacent contract/completeness tests, ESLint and refusal inventory lint passed.
- Task 4: adoption-aware readiness is registered only at Test exit with five typed refusal codes. Explicit execution/invoking directories and authority ports survive explanation, Review, Promote and the lower in-process host. Parallel review fixes cover duplicate labels, manifest labels and phase-owned targets. Combined focused suites pass (249 tests); the lower-host suite passes (9 tests), and ESLint passes.
- Task 6: generated six-target flow passes with artifact drift/recovery and 20 HEAD refresh rounds. Shipped guidance and fresh installed release certification pass. Seven negative recording paths assert zero comment/body writes; the eight flow tests pass. New normalization/consumer tests are split into files within the repository line cap. Full fast QA passes (921 files); full lint, exact issue verifiers (45 tests), new integration verification (27 tests), and consumer release certification (10 tests) pass. Slow QA identified two old consumer fixtures; their repairs pass focused verification (37 tests). The full slow lane is rerunning before the final QA evidence checkpoint.

## Lifecycle admission

The sanctioned refine verbs advanced Backlog to Refine to Ready for Planning using initial XL/40h human sizing. Plan entry refused `native-dependencies:blocking-repository`: incoming blockedBy is empty, but outgoing blocking points to `kburson/ai-peer-review#132`. The current native dependency reader rejects that cross-repository identity. The relation is preserved and no stage jump or false approval was recorded. Implementation is explicitly authorized by the user; lifecycle admission remains unresolved separately.
