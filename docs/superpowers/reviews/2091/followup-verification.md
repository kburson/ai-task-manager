# Canonical verifier invocation follow-up

This is a correction and additional evidence after original collateral commit `d28eab0bff3ac6c331bf3e0102dca1e718cb268b`. The original source commit `a71997b22528b96a707730afc77b03c3753c05e6`, prior collateral, original red outputs and prior claims are preserved. No source code changed.

The owning chat corrected its original “EVERY CLI” wording: mandatory GraphQL usage flags apply to native AITM commands and real standalone GitHub operations, not offline verification commands. Its full correction is retained in the raw evidence. The previous full slow run and isolated reproduction were noncanonical invocations with unnecessary flags. Enabling `AITM_GRAPHQL_USAGE=1` on the outer offline test caused the fake-GH capture fixture to emit `invalid-inherited-context` stderr. Those failures remain valid observations of those invocations; they do not establish failure of the exact declared bare verifier.

Native `resume 2091` succeeded with the required tracking prefix. Fresh Explain confirmed Develop with the expected pending AC evidence and Develop finalization; no native Test or acceptance action was attempted. `printenv AITM_GRAPHQL_USAGE TT_FULL_AUTO` produced no output and exited 1, confirming both ambient variables were unset. Nothing was unset, replaced or stripped.

The exact bare command `node --test scripts/tests/slow/task-tracker/lib/action-capture-integration.test.mjs` passed 5/5 with exit 0. An output-storage serialization error after the first launch lost its process handle before the result was retained; the same short bare command was repeated to obtain the complete recorded output. No outcome is claimed for that unrecorded first launch. The retained run's complete output is in `bare-capture-verifier.log`.

After that genuine pass, the exact bare declared `npm run test:slow` was launched once. Its actual final result will be appended below. No environment workaround, fixture edit, source modification, instrumentation disablement or threshold change was used.

The earlier independent exact-source review remains applicable because both source hashes are unchanged. A separate artifact review will check the correction, new verification evidence, preserved prior records and updated manifest. Native Test, Review, approval, Close, source adoption and #2089 recovery remain owned by the root.

## Actual canonical outcome

The exact bare declared `npm run test:slow` completed with exit 0: all 57 test files passed. The runner reported slow-parallel 153.5s/600s, serial 377.6s/600s and aggregate 531.1s. The complete stdout and timing artifact are retained as `bare-slow.log` and `bare-slow-timing-artifact.json`; the separate exit record is 0.

The canonical slow validation is green. The previous red slow invocations remain preserved as noncanonical observations with unnecessary flags, not an unresolved rank-fix failure. The original source review, 73/73 focused pass, 1003 fast-file pass, full lint pass and format pass remain unchanged evidence. No code, fixture, instrumentation, environment or threshold repair was performed for this correction.

## Artifact review ownership

The root dispatched its own fresh GPT-6.1 Sol / medium committed-artifact reviewer and directed this worker to avoid a redundant review. A worker artifact reviewer had just been launched before that direction arrived; it was interrupted without a verdict. No worker artifact acceptance is claimed. Root will review the final committed follow-up bytes before native acceptance, genuine Stop/release and source adoption.
