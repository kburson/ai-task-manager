# #2042 — singleton story-cache writer implementation audit

## Scope and baseline

Task 7, wave 5 of the accepted execution plan at `0ad57329a5eb4e3aec395adb06a6216178e45c87`; technical Task 3 at `f2894455a97bb80f6afb82ce5ff722cad2a46c2b`; specification at `dafb1d276036ddc17490f76329f6aa2c09732a15`. BASE `bcdbb85ff2527eefdea62cf5ebe84740e22e87a8`. Native singleton assignment, audited relocation, Plan entry, genuine deep-dive comment `6324264187` and mirror/completion, supplied local 3h estimate, Plan approval and Develop admission all succeeded before product implementation. No historical cloud estimation inputs were used.

## Delivered foundation

The separate cache-writer ownership decision requires exactly one valid assigned human matching the authenticated writer. The existing team-unassigned read decision remains unchanged. Persistent ownership pointers live in the Git common directory's private `aitm/story-writers` namespace, shared by registered worktrees. A retained registry identity prevents missing shared state from being silently treated as new. No body, baseline, timing or journal is duplicated there; those remain in the owning worktree's canonical `.tmp/gh` store.

Acquisition validates the canonical native issue identity, physical worktree/cache path, singleton assignment and a genuinely owned native issue lock. Native lock owner capability now also identifies its session; inherited environment text and sibling contexts cannot mint it. Claim publication uses private complete staged bytes, file sync, non-overwriting atomic link, directory sync and exact read-back. Repeated acquisition by the exact owner retains the same claim. Another session/worktree, changed project identity, unsupported stale-process/lease fields, corrupt or missing registry/cache evidence and host changes refuse automatic takeover. Native PID/TTL lock recovery never releases a persistent writer claim.

The original pure assertion seed still validates its supplied session/worktree tuple. Acquired claims carry a registry key and automatically re-read persistent ownership locally, even when the optional registry argument is absent; no network poll is introduced. Transition callers can supply their current bounded assignment observation to the same assertion. The registry capability is factory-issued and rejects a copied plain object. Future public staging/publication and explicit export/handoff remain in their accepted owning slices; no live public writer is claimed migrated by this foundation alone.

## TDD and verification

- Initial missing-module bootstrap failure was observed separately from behavior evidence.
- Defined permissive interface: 29 pure tests, 3 passed / 26 failed. Strict assignment and local-claim implementation: 29/29 passed.
- Initial persistence integration failed because its new acquisition interface did not exist; subsequent complete real-filesystem cases passed.
- Added malformed/local-registry boundary tests: 51 passed / 6 failed, then 57/57 passed.
- Registry-loss tests: 24 passed / 2 failed, then combined 59/59 passed.
- Acquired-claim implicit persistent recheck: 26 passed / 1 failed, then passed after the repair.
- Added fresh-process restart and same-login contention verification. Actual file/process fixtures remain in integration; the required unit entrypoint is pure.
- Real package inventory initially refused 954 entries against 953. Added exactly one reviewed runtime module and its explicit presence assertion; no exclusions or spare capacity were added.
- Targeted ownership, store, cache, native-lock and package selection: 453 tests passed, zero failures. A later cleanup-only refactor removes an unsafe `finally` throw while preserving refusal after persistence/cleanup failure; the final targeted run and independent review follow below.

Raw local outputs remain under `.scratch/2042-*.log`. Independent review, its findings and explicit author dispositions must be committed before final-head CI. Native Test, Review, approval and Close are not claimed by this implementation record.

## Previous child and timing integrity

Child #2055 is CLOSED and board Done, verified at `2026-10-21T19:01:25Z`, with final head `bcdbb85ff2527eefdea62cf5ebe84740e22e87a8`, full CI run `39654719625` successful, native Test, orchestrator Review, approval at `2026-10-21T18:57:59.548Z`, fresh Close Explain ready and actual Close exit zero. Its timing remains Unknown (`legacy-attribution-unknown`), with latest known engagement lower bound 6722.674 seconds. Its old actor endpoint was never fabricated. #2082 is separately delivered and Done; neither prerequisite is redone. Root #2039 remains Develop; PR #2081 waits for all 32 children and final root acceptance.

## Retained traffic window

For this 7f44 worktree, after `2026-10-21T17:45:10.965Z` through `2026-10-21T18:43:06.418Z`: 1415 opaque CLI observations; 991 known points across 655 known-cost observations; 760 unknown-cost observations; zero failures and observed retries. All 1415 observations have incomplete cost coverage. The offline collector read 124468 files; all six integrity-corruption counters were zero; 434 writers were globally active or unclean. This window is disjoint from the retained earlier cutoff and is descriptive, not a matched savings benchmark.

The original standalone #2055 recovery dry-run/apply omitted the `gh` wrapper PATH despite retaining `AITM_GRAPHQL_USAGE=1`. Their original raw request coverage and costs remain unverified; the later captured read-only canonical check does not retroactively fill that gap. No synthetic observations were added. Canonical raw evidence and frozen baseline remain retained, with collection enabled and advisory caps unchanged. Observation count does not prove complete physical HTTP coverage, and wire sizes remain unmeasured. Unknown costs are not zero.

## Pre-review verification checkpoint

After the cleanup refactor, targeted ESLint passed and all 61 writer unit/integration tests passed. The broader 453-test selection above included the complete new tests and the unchanged cache/store/ownership/native-lock/package regressions before that cleanup-only refactor. The package inventory is exactly 954 entries. No final-head CI or native acceptance is inferred from these local checks.

## Independent round 1 and repairs

Fresh Sol / medium review found three Important gaps: expired detached async lock capability, missing owned cache accepted by local assertion, and individual claim-file loss permitting another worktree's first-acquisition path. All were reproduced with failing tests and repaired; the complete verbatim review and explicit author rulings on all findings and declined boundaries are retained separately. The repair selection passed 81 writer/native-lock tests. Per-issue presence now persists before cache creation/final claim publication, and unresolved presence refuses automatic retry. Native acceptance and final CI remain pending a repair review and final verification.
