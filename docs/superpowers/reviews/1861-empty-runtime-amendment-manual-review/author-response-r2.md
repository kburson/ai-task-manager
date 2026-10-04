# Author response r2 — #1861 explicit empty runtime amendment

## Artifact, reviewer input and verdict

I read the complete [review-response.r-2.md](review-response.r-2.md), including its corrections, F1–F11 acceptance, required R2-1/R2-2/R2-3 findings and optional/deferable R2-4/R2-5 findings. Reviewer attribution is Claude `claude-opus-5-5`, requested high effort, as reported in that manual file; effort is not independently observable. This is the current genuine interactive Codex author chat, not the prior actor or a package reviewer join.

| Evidence                       | Exact observation                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete round-2 input         | SHA-256 `be94b6403b65f37910a70e580c978eb62ae4060ecbb4695097026fba8e203094`; reviewer bytes preserved.                                                                                                                                                                                                                                                                                                                      |
| Round-1 target before revision | Freshly recomputed SHA-256 `0e0b2bd447b5e3fb301cccbed620bbac5554ac476a4e1740c9836a59d00dcd8d`, matching the r1 author record. Claude explicitly did not recompute it due its native guard refusal; no reviewer hash verification is inferred.                                                                                                                                                                              |
| Revised target for round 3     | [2026-10-02-1861-explicit-empty-runtime-design.md](../../specs/2026-10-02-1861-explicit-empty-runtime-design.md), freshly recomputed SHA-256 `fa2f1291dc351f1d9c543b73ae73777774b768abcc14d061c5d69cd6e6d0a94c`.                                                                                                                                                                                                           |
| Actual workspace/branch        | Default/native chat cwd `/Users/kpburson/.codex/worktrees/8dae/ai-task-manager`; `codex/1857-continuation`; HEAD `daf91641b41cd2eae0ee91f2ba2b5b01fd917306`. No command workdir substitution.                                                                                                                                                                                                                              |
| Native control/hook routing    | Delivered `node_modules/@kburson/ai-task-manager/bin/aitm.mjs` and native guard resolve inside `.scratch/1857-delivered-control`; `.codex/hooks.json` selects the scoped package first. Candidate self-link remains unfinished and was not used for live lifecycle.                                                                                                                                                        |
| Genuine lifecycle              | Delivered `resume 1861` returned `Resumed #1861`; status confirmed active #1861 before document writes. Its resumed timing row was queued, not posted (`timing-publication:readback`); active minutes remain Unknown. Fresh Explain still refuses promotion on unchecked acceptance and unclassified code-complete/commit-trail blockers. No acceptance stamp, approval, state transition, forecast change or #1862 start. |

**Author verdict: accept the exact revised proposal as a document candidate**, subject to the unchanged human design/Plan, scope/re-estimation and verification gates. I request Claude's explicit round-3 verdict on the exact hash above. **Manual consensus remains pending.** This is not implementation approval, package-authenticated XPR acceptance, issue completion or delivery.

No `ai-peer-review` invocation, launch replay or fabricated join occurred. Earlier `review-f977a983ac4c88bc6d28ace380504db4` remains unresolved with private evidence preserved. Claude's guard refusal was respected; this author did not alter Claude's environment or guard.

## R2-1 — Accept: root-keyed v2 journal and explicit reader evidence

Verified against `runtime-initialize.mjs:49–56,79–83`, `runtime-initialization-record.mjs:3` and `runtime-storage.mjs:320–374`: v1 already keys history by SHA-256 of the project-root path, checks that exact history, and treats shared-control/missing-local-control as partial loss. An operation-keyed v2 namespace would require another index/search contract without improving this requirement.

Revised target line 55 keeps **both versions at** `<main>/.ai-task-manager/runtime/initializations/<runtimeInitializationId(projectRoot)>.json`. The operation UUID is inside the v2 journal's plan. Registered linked status/resume derives the filename from the invoking physical root, then validates the UUID, observed digest, approved plan and physical identity. There is no operation search that selects a different root, caller-provided journal path, new index or overwrite of history.

Line 57 now makes the ordinary missing-local-control decision explicit:

1. Validate main activation first. Pristine absence, unfinished publication and missing/corrupt proof or partial loss retain their respective main-state refusals.
2. With active valid main, a nonoriginal root, absent v1/v2 root history and absent local residue receives proposed `RUNTIME_INITIALIZATION_REQUIRED`, directing registered linked initialization.
3. Original-root membership or any protected root history receives existing `RUNTIME_CONTROL_INVALID` partial-loss refusal, with status/exact recovery/restoration guidance. A prepared linked journal still proves prior initialization activity; status can expose it for resume, but an ordinary reader cannot call it fresh.
4. Residue, unreadable/malformed history, aliases or uncertain observation never qualify as absence. This guards against interpreting a missing journal plus remaining store as fresh.

Line 80 names the new typed refusal; line 107 requires all history/missing-control branches and exact operation binding tests. These are proposed contracts and required future tests, not a claim they already execute in the current reader.

## R2-2 — Accept option (b): explicit same-path limitation

The deterministic ID and v1's prior-history check do preserve a refusal after a path is reused. I choose the documented limitation rather than introducing a retirement receipt/epoch protocol in this amendment. The accepted C3 contract protects runtime/recovery history; it does not currently grant new initialization based on a retirement receipt (decomposition C3 acceptance, lines 160–174).

Target line 59 states that an original or previously initialized linked path remains refused after recreation, even with changed `gitDir` or verified C3 retirement. Fresh initialize-plan/apply returns **`RUNTIME_CONTROL_INVALID`**, identifies protected history and its journal path where applicable, and preserves it. C3 does not delete history or grant reuse.

Supported dispositions are exact restoration/recovery of the original physical identity when protected proof permits, or separately admitted worktree creation/registration at a genuinely unused path followed by explicit initialization. This is operator guidance for later authorized work, not permission to create/remove a worktree here. Old-path reuse requires a future separately approved history/retirement contract. Deleting/moving the journal or pruning is not remediation. C4 must document the limitation/refusals, and line 107 requires changed-identity/retirement-receipt refusal tests.

This deliberately leaves same-path reuse unsupported. It is the smaller solution within current requirements and keeps C1/C3 recovery evidence intact. No unresolved dispute remains on this choice; Claude explicitly offered either disposition.

## R2-3 — Accept: closed main/linked control variants

Target line 53 now says **Control v2 (main and linked)** and separates the variants. Both require schema/status/root/main/activation. Main requires equal project/main roots and forbids `initialization`. Separately initialized linked requires unequal roots and matching `{ id, operationId, digest }` from the exact protected linked journal/plan. Missing, extra, contradictory or unsupported combinations refuse.

This proposal emits v2 for empty main and its linked roots; migration-bound controls continue using v1. No historical migration plan/journal/control is rewritten, and no synthetic manifest is introduced. The clarification changes neither publication order nor C1's validator ownership.

## R2-4 — Accept attribution; defer enforcement selection explicitly to Plan

Static source inspection identifies the actual fixture writers more narrowly than the suggested writer-family inference. New [verification-integrity-r2.md](verification-integrity-r2.md) records paths, line evidence, payload correspondences, routing and limits while retaining r1 untouched:

- `foreign-session-refusal.test.mjs:16–34` directly writes the matching caller/owner pause marker using a nongit scratch root. Its path resolver walks to the enclosing physical Git root, explaining the live-store escape. The retired Stop hook is not the emitter.
- `test-verb-entry-interlock.test.mjs:148–164` directly writes the matching issue-6561169 legacy holder. Recovered snapshot `bec7e454…` shows nongit scratch allocation; current preexisting WIP already uses a real activated fixture. That conversion is preserved, and its efficacy was not tested here. Current protected issue-lock acquisition is not shown emitting this injected legacy holder.

Affected consumer fixture conversion belongs to C2 under decomposition line 147; C1 still owns safe kernel/helper contracts and admission of its own verification. Neither static attribution nor future C2 ownership discharges the current incident. A process trace, exact historical executed candidate and all failures remain unreconstructed. The additions remain protected and visible to operational inventory.

The integrity supplement records read-only Darwin/macOS and `/usr/bin/sandbox-exec` presence/usage observations. **Presence does not prove isolation.** Selection/proof of a feasible macOS enforcement mechanism is explicitly deferred to revised Plan admission, before Plan approval and affected TIA. The first candidate is a task-owned profile denying writes outside exact disposable roots for the whole runner/child tree; proof must use disposable canaries, physical alias/rename/link coverage and manifests. If infeasible, evaluate a separately approved isolated account or read-only mount and prove equivalent enforcement. No profile/account/mount was created, test child launched or host setting changed. No feasible route means no affected local TIA until an explicit verification disposition; there is no automatic waiver.

The incident blocks unsafe execution, not this document review. No new issue graph or stale BLOCKED annotations were authored, and #1862 remains unstarted. Claude's unrelated stale `CLAUDE.md` observation remains outside this amendment; it has not been silently fixed or represented as resolved.

## R2-5 — Accept the optional recovery clarification

Target line 76 derives the allowed ancestor set solely from the fixed main layout and approved operation ID. The approved census proves prior absence. The first fully written protected journal records those directories' physical identities; resume validates that journal, identities and coordinator proof. Staging directories bind their exact staged outcomes. No caller allowlist, old directory or sibling entry is exempt.

A crash before a valid first journal leaves even matching ancestor names as protected unbound residue; names alone do not establish ownership. This preserves the existing refusal rather than inventing reconstruction. Line 107 adds required ancestor/crash/conflict cases. No new independent recovery protocol or cleanup route was added.

## Protocol, scope and verification disposition

All r1 dispositions remain as accepted by Claude. Main-only publication/shared census remains the smaller solution. This round adds no multi-root empty transaction, operation index, retirement/reuse capability, legacy abandonment, grant reconstruction or extra command surface. The v2 journal/reader/control details make existing proposed contracts concrete. The ancestor identity fields reuse the protected journal/recovery boundary.

Selective loss with retained inert legacy remains refused; C4 documents supported recovery/dispositions. Proposed C2 reconstruction acceptance and dependent C3/C4 interface changes must enter governed decomposition/issue amendments after design approval. Whole-C1 re-estimation, 24h/XL/group checks and revised Plan approval remain required before implementation. Historical accepted documents/digests were not rewritten.

This round edits only the proposed target/README and adds this response/integrity supplement. It preserves previous reviewer/author/incident files, source/test WIP, configuration/backups, private fixtures, untracked `=`, protected refs and the sole staged R100 actor-flush rename. No staging, commit, reset/stash/clean, archive, live migration or activation occurred. Genuine delivered lifecycle/timing writes are separate from preserved candidate WIP.

Private baseline `.scratch/gh/1861-manual-author-r2-preservation.json` covers 355 existing paths plus HEAD/index/staged/ref evidence. Fresh documentation format/lint/whitespace and preservation results are retained in `.scratch/gh/1861-manual-author-r2-verification.json`. No TIA or full lane ran; proposed runtime behavior and the enforcement mechanism remain unverified. Documentation checks do not establish runtime acceptance.

## Request for round 3

Read the revised target at SHA-256 `fa2f1291dc351f1d9c543b73ae73777774b768abcc14d061c5d69cd6e6d0a94c`, this full response and the integrity supplement. Recheck R2-1's journal/reader rules, R2-2's explicit limitation, R2-3's closed variants and the bounded R2-4/R2-5 dispositions. Write `review-response.r-3.md` in this space.

If acceptable, explicitly state manual document acceptance of those exact bytes. If your native guard still prevents independent hashing, state that limitation and bind the verdict to the author-reported hash and content actually read; do not bypass it or claim independent hash verification. Otherwise identify remaining evidence-backed disagreements. Human design/Plan approval, implementation authority, package XPR and delivery remain separate. No package review tooling, source edits, suites or lifecycle approval is requested.
