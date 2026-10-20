# #2073 plan SAR round 1

Reviewed input: plan.r0.md, SHA256 `362eeb126a4236fea6090613fa0aae8da5f1427f95c5640531805ddd31d38d22`. Full plan and accepted specification read, then source checked at collector, concrete writer, publication, strict kind, field config/parser, transport and native fixture boundaries. This is the same persistent author/reviewer, requested gpt-6-astra/high dispatch, not independent review or per-turn provider attestation.

## Findings

### P2073-01 — High: offline flag prevents the measured hook from running

Task 1 sets TT_SKIP_NETWORK=1 while measuring real evaluateHookDecomposition. Both decomposition-activity.mjs:97 and decomposition-hook-authority.mjs:43 immediately refuse on sessionNetworkSkipped, whose implementation is exactly that flag check. Replacing transport ports cannot overcome it. The baseline would fail before dispatch and violate successful equivalent boundaries. Install the existing fail-closed PATH shim, intercept all three ports, unset the skip flag only inside the isolated controlled subprocess, and verify the shim records no escapes. Keep production policy intact.

### P2073-02 — High: executable examples and result contracts disagree with real code

The malformed-kind sample uses aitm:issue-kind, whereas genuineKind recognizes aitm-issue-kind; this sample is treated as absent and the assertion fails. cfg.fields.estimate does not exist in the observed field resolution contract (fieldIdFor uses fieldIds or fieldEstimate). The publication protocol returns recorded and persists complete, not completed. Task 5 also passes an operation result to a helper described as taking a state snapshot. Specify exact imports, signatures, native statuses and wrapper shapes, and resolve examples before implementation. Source: decomposition-authority.mjs:447–469, project-fields.mjs:31–36, decomposition-publication.mjs:95–180.

### P2073-03 — Medium: tasks separate scaffolding and verification from their owning deliverables

The five tasks isolate reusable baseline setup, shared recovery verification and final checks as if each were a separate business deliverable. The writing-plans right-sizing rule calls for folding setup and verification into independently rejectable changes. The accepted spec also orders admission, field observations, integrated proof. Restructure into admission with its retained baseline foundation, concrete observations with recovery, and integrated traffic proof. Preserve every test and the full honest 6.5h allocation; do not suppress genuinely independent work to satisfy native decomposition policy. The owner chose full scope, not a fabricated task count.

### P2073-04 — High: target transport and null contracts remain underspecified

createFieldEffectReaders has graphql without a defined request/response shape, then receives deps.graphql although current callers supply other ports. Hook uses an envelope, github-projects.gql returns unwrapped data, and callback execFile requires promisify.custom. Without explicit adaptation the proposed helper can silently mismatch production or fixture APIs. Present typed values must distinguish missing selected properties from explicit null; Size null cannot be validated as an ordinary option. Define one target transport signature and default wrapper, exact null rules, type fragments, and fieldIdFor usage. Preserve old complete collector seams only as compatibility fixtures, never as traffic evidence.

### P2073-05 — Medium: required route and ceiling coverage is incomplete

The plan omits explicit native activity/source-hook and plan-exit smoke commands. Only changed publication gets per-family caps, and pagination/failure cases lack independent declared caps and phase identity. The hook 1,217 calculation assumes no separate first-phase child continuation, while prose says complete presence before any decision. Explain that nonempty epic presence delegates inventory completion to graph; otherwise increase the bound. Assign caps and oracle negatives for every measured boundary and adverse fixture, and retain repository identity in root/continuation/fence selections. Source: accepted spec sections 1 and 3; current hook query lacks repository echo and item content identity.

### P2073-06 — Medium: strict body block parsing is specified only as intent

The general parser accepts the last recognized block and can ignore malformed delimiters. Task 3 says inventory delimiters but provides no concrete parsing sequence for malformed current/legacy fragments or explicit null. Specify marker inventory, recognized range/count matching, JSON value-envelope validation, exact scalar domain checks and tests for dangling delimiters alongside one valid block. Do not change general-parser behavior for unrelated callers. Source: issue-field-db.mjs collectMatches and parseIssueFieldDb.

### P2073-07 — Medium: source inventory misses compatibility fixture adaptation

New reads run in every concrete writer invocation; existing estimation-publication fixtures replace full readers and lack a narrow transport. Running only new provider tests will not preserve existing project-tether/recovery cases. The file map excludes estimation-publication.mjs and publication-subprocess.fixture.mjs, both affected by actual writer use. Add exact fixture adaptation scope for the new target transport while retaining old full-reader semantics, and distinguish these compatibility doubles from measurement evidence. Preserve existing uncertain-outcome and predecessor tests rather than replacing them with new happy-path samples.

## Estimate challenge and verdict

The owner-approved 6.5h remains a low-end working forecast within the acknowledged 6–9h risk range; it is not validated by these detailed steps. Query-aware driver implementation and legacy fixture migration are substantial known risks. No evidence supports restoring the original four-hour target. Restructuring tasks must not delete this work or relabel it as free overhead.

Verdict: revise. Seven actionable findings, none deferred or rejected. No implementation or product tests run. Document writes encountered local guard parser false positives on regex and append code; normal exact-path Markdown redirection worked without changing guards.
