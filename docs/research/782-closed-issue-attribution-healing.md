# Closed-Issue Attribution Healing Analysis

_Generated 2026-07-11. Scope: the 93 closed issues with **no issue-number token in any trunk commit subject** (of 733 closed total). The other 640 are already attributed by commit-log message token._

## Method

Each candidate scored on three independent attribution signals, unioned:

1. **Commit-log token** — `[#N]`/`#N` in a trunk commit subject (this is what excluded the other 640; none of these 93 have it).
2. **`### 🔗 Commits` comment marker** — the durable `<!-- aitm-commits shas="…" -->` written by `lib/commit-trail.mjs`; recorded SHAs are cross-checked against trunk.
3. **`aitm-deliverable-posted` marker** — sanctioned no-commit completion lane (epics/spikes).

Dead detection: GitHub `stateReason` = `NOT_PLANNED`/`DUPLICATE`.

## Summary

| Class | Count | Metrics verdict |
|---|---|---|
| HEALABLE | 41 | **Include** — attribution recoverable now |
| COMMITS_OFFTRUNK | 11 | **Include after SHA re-trace** |
| DELIVERABLE | 7 | **Include** — no-commit delivered value |
| DEAD | 19 | **Exclude** — correctly dead |
| UNKNOWN | 15 | **Manual review** |

## HEALABLE (41)

| Issue | stateReason | SHAs (on-trunk/total) | deliverable | Title |
|---|---|---|---|---|
| [#81](https://github.com/kburson/ai-task-manager/issues/81) | COMPLETED | 1/1 `0b46223` | — | Rename task move to task promote/demote; amend #61 plan + sub-issues |
| [#94](https://github.com/kburson/ai-task-manager/issues/94) | COMPLETED | 1/1 `6ec9190` | — | fix(activity-guard): write state field to tracker-state on every kanba |
| [#119](https://github.com/kburson/ai-task-manager/issues/119) | COMPLETED | 1/1 `16fbaa5` | — | Prune MEMORY.md; add memory/archive/ for incident-specific entries |
| [#143](https://github.com/kburson/ai-task-manager/issues/143) | COMPLETED | 1/1 `47e8c02` | — | EPIC: Vocabulary codification + /task refine + /task discover |
| [#151](https://github.com/kburson/ai-task-manager/issues/151) | COMPLETED | 1/1 `c022739` | — | 🐞 Epic: Post-#107 lifecycle audit fixes |
| [#167](https://github.com/kburson/ai-task-manager/issues/167) | COMPLETED | 2/2 `a37fde2 313b690` | — | EPIC: Re-entry support for aitm-entered-* markers (loops + retrace) |
| [#172](https://github.com/kburson/ai-task-manager/issues/172) | COMPLETED | 1/1 `efa3fa8` | — | 🐞 EPIC: Chain-integrity heal + structural prevention (entry-marker mo |
| [#185](https://github.com/kburson/ai-task-manager/issues/185) | COMPLETED | 1/1 `313b690` | — | Test migration sweep: visit-aware entry-marker fixtures |
| [#192](https://github.com/kburson/ai-task-manager/issues/192) | COMPLETED | 2/2 `743fb10 39ef941` | — | Epic: Context management and parallel-worker orchestration |
| [#194](https://github.com/kburson/ai-task-manager/issues/194) | COMPLETED | 1/1 `d1bd29c` | — | EPIC: Code Quality Update |
| [#225](https://github.com/kburson/ai-task-manager/issues/225) | COMPLETED | 1/1 `b1e699f` | — | EPIC: defects surfaced while shipping #220 |
| [#238](https://github.com/kburson/ai-task-manager/issues/238) | COMPLETED | 1/1 `782f7da` | — | EPIC: Update project timing measurements |
| [#244](https://github.com/kburson/ai-task-manager/issues/244) | COMPLETED | 1/1 `f3025bf` | — | EPIC: Epic/child sequencing — discovered work, WIP limits, blocked dep |
| [#269](https://github.com/kburson/ai-task-manager/issues/269) | COMPLETED | 1/1 `bf1dd04` | — | EPIC: Migrate cross-cutting guards (contiguity, drift, child-cannot-le |
| [#276](https://github.com/kburson/ai-task-manager/issues/276) | COMPLETED | 1/1 `ff7cde0` | — | Migrate backlog→refine + refine→plan entry-field gates into guard regi |
| [#292](https://github.com/kburson/ai-task-manager/issues/292) | COMPLETED | 1/1 `ac2365c` | — | State-object refactor: collapse guard-registry into per-state containe |
| [#294](https://github.com/kburson/ai-task-manager/issues/294) | COMPLETED | 1/1 `988e355` | — | Script-level Deep-Dive gate on plan→develop promote |
| [#295](https://github.com/kburson/ai-task-manager/issues/295) | COMPLETED | 2/2 `e17cb33 80df1a6` | — | Migrate pushIssueBody({body}) callers to mutateIssueBody |
| [#297](https://github.com/kburson/ai-task-manager/issues/297) | COMPLETED | 1/1 `f1b6fa3` | — | 🐞 Plan→Develop gate must require Deep-Dive Analysis + Deep dive compl |
| [#298](https://github.com/kburson/ai-task-manager/issues/298) | COMPLETED | 1/1 `0eaae98` | — | 🐞 create-issue.mjs body shape fails entry gates (duplicate H2s, numbe |
| [#302](https://github.com/kburson/ai-task-manager/issues/302) | COMPLETED | 1/1 `1f22872` | — | 🐞 lifecycle-tick-noop warning false-positives on every Full-Auto appr |
| [#304](https://github.com/kburson/ai-task-manager/issues/304) | COMPLETED | 2/2 `fed2d72 e99b3d0` | — | Migrate scratch dirs off system /tmp to project-local ./.tmp/ (+ lint  |
| [#314](https://github.com/kburson/ai-task-manager/issues/314) | COMPLETED | 1/1 `b8dee99` | — | 🐞 Defect: silent skip when project-field id missing — warn user + sug |
| [#315](https://github.com/kburson/ai-task-manager/issues/315) | COMPLETED | 2/2 `a8a84db 5588601` | — | 🐞 Defect: review.mjs missing derived-key auto-stamp pass — refuses pr |
| [#322](https://github.com/kburson/ai-task-manager/issues/322) | COMPLETED | 1/1 `5588601` | — | 🐞 Defect: slow/cli.test.mjs test 10b stale — fails post-#299 plan/dis |
| [#328](https://github.com/kburson/ai-task-manager/issues/328) | COMPLETED | 1/1 `054a2fc` | — | EPIC: deep-dive lifecycle hardening (consolidation + gate alignment +  |
| [#340](https://github.com/kburson/ai-task-manager/issues/340) | COMPLETED | 1/1 `35dab94` | — | EPIC: bidirectional parent/child state-guard completion |
| [#341](https://github.com/kburson/ai-task-manager/issues/341) | COMPLETED | 1/1 `c9273fd` | — | 🐞 DEFECT: move-state-gate.test.mjs deep-dive-complete vs deep-dive-pl |
| [#367](https://github.com/kburson/ai-task-manager/issues/367) | COMPLETED | 1/1 `ccf7da8` | — | EPIC: Standardize hidden-marker grammar to key="value" |
| [#369](https://github.com/kburson/ai-task-manager/issues/369) | COMPLETED | 1/1 `ccf7da8` | — | EPIC: marker corpus migration + parser hardening |
| [#387](https://github.com/kburson/ai-task-manager/issues/387) | COMPLETED | 1/1 `45768b3` | — | 🐞 fix parseFullAutoApprovedMarker ISO-timestamp split for legacy sign |
| [#417](https://github.com/kburson/ai-task-manager/issues/417) | COMPLETED | 1/1 `0c13004` | — | EPIC: retire writer-side aitm-verified-by; consolidate declarations to |
| [#431](https://github.com/kburson/ai-task-manager/issues/431) | COMPLETED | 1/1 `f7e0501` | — | EPIC: Test execution optimization — lint-first, targeted Develop runs, |
| [#458](https://github.com/kburson/ai-task-manager/issues/458) | COMPLETED | 1/1 `2ab1809` | — | Complete achievable Codex parity with Claude workflow |
| [#462](https://github.com/kburson/ai-task-manager/issues/462) | COMPLETED | 1/1 `e308b4b` | — | 🐞 [Bug]  task binder fails to properly record which task is active |
| [#508](https://github.com/kburson/ai-task-manager/issues/508) | COMPLETED | 1/1 `5df09e3` | — | Codex Code Review |
| [#571](https://github.com/kburson/ai-task-manager/issues/571) | COMPLETED | 1/1 `51729f0` | — | 🧑‍🧒‍🧒 [Epic] Partition aitm storage — tracked config vs machine-loc |
| [#585](https://github.com/kburson/ai-task-manager/issues/585) | COMPLETED | 1/1 `43bff6b` | — | 🧑‍🧒‍🧒 [Epic] test: unit tests for 7 zero-coverage verb files (ac-st |
| [#587](https://github.com/kburson/ai-task-manager/issues/587) | COMPLETED | 1/1 `75e8a92` | — | 🧑‍🧒‍🧒 [Epic] test: coverage for Group G — bin/cli (71 %), hook-hand |
| [#591](https://github.com/kburson/ai-task-manager/issues/591) | COMPLETED | 11/11 `15e0a22 c24b4f9 4f9d6ec f692538 82689f2 b016dee d657694 b450ccf 5b90f7f 4a4388d cfdc0bc` | — | 🧑‍🧒‍🧒 [Epic] test: fixture-based unit tests for heal/backfill scrip |
| [#592](https://github.com/kburson/ai-task-manager/issues/592) | COMPLETED | 1/1 `59aa918` | — | 🧑‍🧒‍🧒 [Epic] test: coverage for GH scripts — list-issues (30 %), di |

## COMMITS_OFFTRUNK (11)

| Issue | stateReason | SHAs (on-trunk/total) | deliverable | Title |
|---|---|---|---|---|
| [#107](https://github.com/kburson/ai-task-manager/issues/107) | COMPLETED | 0/2 `SHA1 ...` | — | Stage-machine teeth: exit gates, audit-trail integrity, sandboxed Test |
| [#280](https://github.com/kburson/ai-task-manager/issues/280) | COMPLETED | 0/1 `2b05ca1` | — | EPIC: Support for Blocked Tasks |
| [#285](https://github.com/kburson/ai-task-manager/issues/285) | COMPLETED | 0/1 `2c8a57e` | — | block/unblock verbs + always-mirror BLOCKED label |
| [#286](https://github.com/kburson/ai-task-manager/issues/286) | COMPLETED | 0/1 `fb908df` | — | Universal blocked-by-not-done exit-guard at all exit slots |
| [#287](https://github.com/kburson/ai-task-manager/issues/287) | COMPLETED | 0/1 `2b05ca1` | — | Blocked By Project field (init-side) + marker-driven mirror write |
| [#288](https://github.com/kburson/ai-task-manager/issues/288) | COMPLETED | 0/1 `ad91d22` | — | EPIC: Optimistic concurrency for issue body writes |
| [#289](https://github.com/kburson/ai-task-manager/issues/289) | COMPLETED | 0/1 `8f9c4c0` | — | Add lib/body-version.mjs — parser/stamper/bumper for aitm-body-version |
| [#290](https://github.com/kburson/ai-task-manager/issues/290) | COMPLETED | 0/1 `ef49a88` | — | Add lib/versioned-issue-write.mjs — optimistic-concurrency helper |
| [#291](https://github.com/kburson/ai-task-manager/issues/291) | COMPLETED | 0/2 `ef49a88 ad91d22` | — | Wire up versionedWriteBody across all body-write sites |
| [#521](https://github.com/kburson/ai-task-manager/issues/521) | COMPLETED | 0/1 `a518566` | — | EPIC: Honest, demonstrable-AC engineering discipline + fabrication gua |
| [#760](https://github.com/kburson/ai-task-manager/issues/760) | DUPLICATE | 0/2 `4f84eb6 3d4f9db` | — | Record atomic-move design spec + stand up epic #754 tree |

## DELIVERABLE (7)

| Issue | stateReason | SHAs (on-trunk/total) | deliverable | Title |
|---|---|---|---|---|
| [#371](https://github.com/kburson/ai-task-manager/issues/371) | COMPLETED | — | Y | [Spike] Can a GitHub App installation token edit and move issues on a  |
| [#451](https://github.com/kburson/ai-task-manager/issues/451) | COMPLETED | — | Y | 🐞 EPIC: customer beta report channel (defect + feature) |
| [#528](https://github.com/kburson/ai-task-manager/issues/528) | COMPLETED | — | Y | 🧑‍🧒‍🧒 [Epic] 🔎 change the `aitm-stage-rollup` metrics to seconds,  |
| [#685](https://github.com/kburson/ai-task-manager/issues/685) | COMPLETED | — | Y | SPIKE: first-class the spike issue kind — label, task-new --kind, lane |
| [#727](https://github.com/kburson/ai-task-manager/issues/727) | COMPLETED | — | Y | 🧑‍🧒‍🧒 [Epic] VCS-process-agnostic commit attribution (message-based |
| [#766](https://github.com/kburson/ai-task-manager/issues/766) | COMPLETED | — | Y | 🧑‍🧒‍🧒 [Epic] Prepare for first npm publish (AGPL relicense + scoped |
| [#771](https://github.com/kburson/ai-task-manager/issues/771) | COMPLETED | — | Y | 🧑‍🧒‍🧒 [Epic] VC citation id-scheme + Refine-exit guardrail |

## DEAD (19)

| Issue | stateReason | SHAs (on-trunk/total) | deliverable | Title |
|---|---|---|---|---|
| [#16](https://github.com/kburson/ai-task-manager/issues/16) | NOT_PLANNED | — | — | I8: Fix appendRow to handle empty-body timing comments |
| [#25](https://github.com/kburson/ai-task-manager/issues/25) | NOT_PLANNED | — | — | [security] C1: allowlist verification commands in /task review |
| [#26](https://github.com/kburson/ai-task-manager/issues/26) | NOT_PLANNED | — | — | [security] C2: parameterize GraphQL queries in task-tracker.mjs |
| [#30](https://github.com/kburson/ai-task-manager/issues/30) | NOT_PLANNED | — | — | set-priority.mjs picks wrong project item when issue is on multiple pr |
| [#48](https://github.com/kburson/ai-task-manager/issues/48) | NOT_PLANNED | — | — | Update move-state.mjs verb vocabulary for 7-state names (with backcomp |
| [#108](https://github.com/kburson/ai-task-manager/issues/108) | NOT_PLANNED | — | — | Require committed artifacts and canonical commit trace before Review |
| [#264](https://github.com/kburson/ai-task-manager/issues/264) | NOT_PLANNED | — | — | Migrate backlog→refine + refine→plan entry-field gates into guard regi |
| [#265](https://github.com/kburson/ai-task-manager/issues/265) | NOT_PLANNED | — | — | Migrate plan→develop aitm-plan-approved + planEpicDevelopChildrenGate  |
| [#266](https://github.com/kburson/ai-task-manager/issues/266) | NOT_PLANNED | — | — | Migrate develop→test CODE_COMPLETE / AC verification into guard regist |
| [#268](https://github.com/kburson/ai-task-manager/issues/268) | NOT_PLANNED | — | — | Migrate review→done close-gates + parent-admission/children-closed int |
| [#350](https://github.com/kburson/ai-task-manager/issues/350) | NOT_PLANNED | — | — | Migrate contiguity guard into registry |
| [#351](https://github.com/kburson/ai-task-manager/issues/351) | NOT_PLANNED | — | — | Migrate drift-detection guard into registry |
| [#352](https://github.com/kburson/ai-task-manager/issues/352) | NOT_PLANNED | — | — | Migrate child-cannot-lead-epic guard into registry |
| [#353](https://github.com/kburson/ai-task-manager/issues/353) | NOT_PLANNED | — | — | Migrate child-refine-plan-wip guard into registry |
| [#354](https://github.com/kburson/ai-task-manager/issues/354) | NOT_PLANNED | — | — | Post-migration cleanup: dead-code sweep + registry README refresh |
| [#364](https://github.com/kburson/ai-task-manager/issues/364) | NOT_PLANNED | — | — | --help |
| [#457](https://github.com/kburson/ai-task-manager/issues/457) | DUPLICATE | — | — | Complete achievable Codex parity with Claude workflow |
| [#461](https://github.com/kburson/ai-task-manager/issues/461) | NOT_PLANNED | — | — | [Spike] timing log columns idle, word delta, word marker appear useles |
| [#744](https://github.com/kburson/ai-task-manager/issues/744) | NOT_PLANNED | — | — | Wire ai-memory-parity.mjs --mode index into CI Fast lane (enforce memo |

## UNKNOWN (15)

| Issue | stateReason | SHAs (on-trunk/total) | deliverable | Title |
|---|---|---|---|---|
| [#4](https://github.com/kburson/ai-task-manager/issues/4) | COMPLETED | — | — | EPIC: Reliability & Correctness — data loss and silent failure risks |
| [#9](https://github.com/kburson/ai-task-manager/issues/9) | COMPLETED | — | — | EPIC: Structural Refactoring |
| [#36](https://github.com/kburson/ai-task-manager/issues/36) | COMPLETED | — | — | docs(body): canonize Deep-Dive Analysis placement (after Pickup Direct |
| [#37](https://github.com/kburson/ai-task-manager/issues/37) | COMPLETED | — | — | feat(timing): store Start/End as date+time (sub-day precision) on boar |
| [#72](https://github.com/kburson/ai-task-manager/issues/72) | COMPLETED | — | — | Epic: Three-stage estimation — relocate mutation to Analysis, add read |
| [#96](https://github.com/kburson/ai-task-manager/issues/96) | COMPLETED | — | — | EPIC: Rename kanban states to Scrum terms + retire alias verbs |
| [#164](https://github.com/kburson/ai-task-manager/issues/164) | COMPLETED | — | — | 🐞 fix(pickup-directive): sync runtime copy with canonical template (i |
| [#274](https://github.com/kburson/ai-task-manager/issues/274) | COMPLETED | — | — | EPIC: Test suite reorganization & convention |
| [#428](https://github.com/kburson/ai-task-manager/issues/428) | COMPLETED | — | — | resolve spike 403 |
| [#434](https://github.com/kburson/ai-task-manager/issues/434) | COMPLETED | — | — | [Bug]  Issue 409 timing table has an entry "switch out -> 409" |
| [#437](https://github.com/kburson/ai-task-manager/issues/437) | COMPLETED | — | — | 🐞 versionedWriteBody post-push verify throws false max-retries when p |
| [#470](https://github.com/kburson/ai-task-manager/issues/470) | COMPLETED | — | — | Wave: Full-auto bug sweep — drive all 5 open bug issues to Done |
| [#471](https://github.com/kburson/ai-task-manager/issues/471) | COMPLETED | — | — | Wave: Full-auto bug sweep — drive all 5 open bug issues to Done |
| [#485](https://github.com/kburson/ai-task-manager/issues/485) | COMPLETED | — | — | [Request]  Audit the aitm skill for context bloat |
| [#726](https://github.com/kburson/ai-task-manager/issues/726) | COMPLETED | — | — | EPIC: VCS-process-agnostic commit attribution (message-based, not SHA- |

## Recommended healing design

- **Primary (no mutation):** extend the attribution resolver behind `scripts/reports/generate-value-report.mjs` to union all three signals. Recovers the HEALABLE set immediately — those issues already carry durable `aitm-commits` markers; the generator just never reads them.
- **Secondary:** a `heal-commit-attribution` pass that re-traces the COMMITS_OFFTRUNK SHAs (rebase/squash churn) to their current trunk commits and rewrites the markers.
- **Residue:** hand-adjudicate UNKNOWN (mostly pre-mechanism real deliveries + orchestration waves; none look genuinely dead).
- **Dead:** the DEAD set stays excluded via `stateReason`; no new marker required.
