# Reviewer response r-3 — #1861 explicit empty runtime amendment

## Reviewer, inputs and limits

- **Reviewer:** Claude Opus 5.5 (`claude-opus-5-5`), the same session as r-1 and r-2. Requested effort: high. The session cannot observe its own effort setting, so this review claims nothing beyond the request.
- **Target:** `docs/superpowers/specs/2026-10-02-1861-explicit-empty-runtime-design.md`. I read all 120 lines in this round.
- **Target SHA-256 (independently recomputed this round):** `fa2f1291dc351f1d9c543b73ae73777774b768abcc14d061c5d69cd6e6d0a94c`. It matches the author-reported hash, and this verdict is bound to it.
- **Also read in full:** `author-response-r2.md` and `verification-integrity-r2.md`. Both are collateral and not part of the accepted bytes.
- **Scope:** read-only. No edits to the target, source, Git state or lifecycle. No suites, package tooling or approvals.

## Verdict

**Manual document acceptance of the exact target bytes at SHA-256 `fa2f1291dc351f1d9c543b73ae73777774b768abcc14d061c5d69cd6e6d0a94c`.**

This acceptance covers only the document. It is not human design/Plan approval, implementation authority, package-authenticated XPR acceptance, a forecast, verification or delivery. Those gates stay as stated in target lines 3 and 115-119.

## R2 finding closure

| Finding | Target evidence | Result |
| --- | --- | --- |
| R2-1: v2 journal path and reader rule | Line 55 uses the same root-keyed path as v1: `initializations/<runtimeInitializationId(projectRoot)>.json`. The operation UUID is inside the plan, and resume derives the path from the invoking physical root. Line 57 gives an ordered classification: main state first, then `originalRoots` and v1/v2 history. Only a nonoriginal root with no history and no residue returns `RUNTIME_INITIALIZATION_REQUIRED`. A prepared journal is never treated as fresh. Line 80 names the code, and line 107 adds branch tests. | Closed |
| R2-2: same-path re-creation | Line 59 picks option (b). The refusal is explicit, with a typed code and the journal path. It holds even with a changed `gitDir` or a C3 retirement receipt. Supported dispositions are named, and C4 documents them. Line 107 adds the refusal test. | Closed |
| R2-3: control v2 variants | Line 53 defines closed main and linked variants. Main requires equal roots and forbids `initialization`. Linked requires unequal roots and a matching `{ id, operationId, digest }`. v1 keeps its migration binding. | Closed |
| R2-4: incident attribution and enforcement | `verification-integrity-r2.md` attributes the retained files to two specific fixture writers: `foreign-session-refusal.test.mjs:16-34` and `test-verb-entry-interlock.test.mjs:148-164`. The cause is a non-Git scratch root walking up to the enclosing 8dae store. Fixture conversion is routed to C2, and C1 keeps safe-verification admission. Picking the macOS enforcement mechanism is explicitly deferred to revised Plan admission, before any affected TIA run, with no automatic waiver. | Closed, by explicit deferral |
| R2-5: created ancestors | Line 76 derives the ancestor set only from the fixed layout and operation ID, and records it in the first journal. Residue left by a crash before that first journal stays as refused, unbound artifacts. Line 107 adds tests for this. | Closed |

**Consistency check.** I cross-read three groups of target lines together:

- lines 33, 37 and 76: the whole-prefix absence rule, the coordinator exemption and the ancestor exemption;
- lines 53, 55, 57, 72 and 80: control variants, journal path, reader order, publication order and typed outcomes;
- lines 13-15 and 27: the scenarios and main-only publication.

I found no contradictions. The protocol surface has not grown beyond what F3 and recovery force.

## Non-blocking observations for Plan (not acceptance conditions)

1. **Same-path refusal will cause operational friction.** Worktrees are commonly recreated at the same conventional path, for example `.worktrees/<slug>`. Once the line 59 limitation ships, every such reuse hits a permanent refusal. When C3 and C4 are planned, decide whether to file a governed follow-up for a history/retirement-epoch contract, rather than leaving users to discover it.
2. **C2 has two new acceptance items that must be formally accepted.** The C2 rows in target lines 91 and 97 add (a) reconciliation and (b) the conversion of two specific fixtures, the fixture-writer attributions in `verification-integrity-r2.md`. Both must enter the C2 issue through the governed decomposition amendment, which the author already states. C2 has not accepted them yet.
3. **Repository instruction drift (outside this amendment).** This repository's `CLAUDE.md` "Blocked-Task Annotation" section still prescribes the legacy `BLOCKED` label, `Blocked By` field and body marker. Delivered `skill/shared/rules/block.md` v1.2.0 forbids that procedure. Correct `CLAUDE.md` separately, so future agents do not follow the stale procedure.

## Remaining disagreements

None.

This review claims no verification, approval or lifecycle status beyond the manual document acceptance stated above.
