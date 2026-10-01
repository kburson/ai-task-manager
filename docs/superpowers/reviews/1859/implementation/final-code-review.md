# Issue 1859 final implementation review

Reviewed checkpoint: 487b810ce25ca1e9ce94fb450ce85a7af7efebe8. Two independent read-only reviewers ran in parallel: reviewed Scope authoring/readiness and blocked normalization/incoming dependency readiness. Sol 6.1 evaluated and implemented the findings.

The normalization reviewer found no actionable defect. The Scope reviewer reproduced two P2 parser defects: bare verifier names in ordinary prose were treated as declarations, allowing adopted narrative targets to avoid reviewed evidence; and fence syntax inside a terminated multiline HTML comment incorrectly opened an unterminated fence.

Three regression cases failed before production edits. The fix recognizes verifier declaration names only at actual HTML marker prefixes, retaining malformed-prefix refusal and visible VC citations. The scanner handles an active comment before a new fence opener while preserving active fence handling. The final focused scanner/readiness/recording/CLI/generated-flow verification passed 99 tests with zero failures. Focused ESLint and Git whitespace checks passed. Retained red and green logs are adjacent. The accepted spec and plan remain unchanged.

The prior Test attempt stopped during spelling lint on the opaque workflow record identifier. Exact machine record responses are retained as .log files; the prose has a local spelling annotation. A subsequent Test attempt was deliberately interrupted when these confirmed review findings required a new commit. Neither attempt is Test acceptance. Fresh exact-head Test, Review and delivery remain required.

## Sandboxed Test integration fixture repair

The complete Test attempt at e19b7f6b passed lint, formatting, unit, slow and targeted issue commands, but failed integration. The legacy npm test result is a derived aggregate of unit and integration, so its empty failure tail was not a second execution failure. The actual summary is GitHub issue comment 5942260422.

The guidance source-trust fixture copied the entire current catalog into a relocated package but copied only the old three-guide set. The newly referenced reviewed Scope evidence guide was missing, producing documentation-path-missing. Direct reproduction failed four cases; adding that exact guide to the fixture made all 13 cases pass. An independent adjacent-fixture audit found no other whitelist requiring repair. No source catalog or validation behavior changed. Fresh exact-head Test remains required after this test-only commit.

## Complete integration evidence recovery

The next complete Test at 41caaccf again failed integration (issue comment 5942499401); the short failure tail exposed recertification but hid other failing files. A separate complete integration run retained all output and identified three additional failing files among 216. The log is retained as integration-recovery-red.log.

The recertification test had rerun a frozen maintenance fixture against current runtime and compared current authority snapshot bytes to an old capture. It now preserves the archive, validates its original runner bytes at its source commit and its previously certified whole-file digest, and uses the maintained release helper for two deterministic current replays. Current simulated authority is ready; every transition is fixture injection with no executed action and explicitly grants no delivery GO. The frozen runner and archival capture remain unchanged.

The residual fallback inventory now includes the reviewed Scope guard with a reviewed manual-investigation rationale. The pre-close completeness site hash is refreshed for its new typed per-checkbox refusals; exact registry coverage, source-site digests and unknown/malformed fallback refusal assertions remain enforced. Historical static measurements are reconstructed from the archived capture's declared source commit instead of today's shim. The final paired comparison was regenerated through its normal builder: only the budget-file digest changed to match the committed formatted bytes. Budget values and installed release certification assertions remain unchanged.

Two independent reviewers inspected these repairs in parallel and found no actionable concerns. Fresh targeted verification covers all four affected integration files. Exact-head governed Test and Review are still required after committing these repairs.
