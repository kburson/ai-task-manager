# #1861 revised Plan admission evidence

Status: revised Plan draft prepared; production implementation and revised approval remain unadmitted. [Plan](../../superpowers/plans/2026-10-03-1861-empty-runtime-revised-plan.md). The user's execution request authorized preparing the missing revised Plan and its admission evidence. No production source, live runtime activation, child graph, issue body or approval marker was changed by this preparation.

## Accepted input and actual binding

Amendment SHA-256 remains `fa2f1291dc351f1d9c543b73ae73777774b768abcc14d061c5d69cd6e6d0a94c`, accepted manually by Claude/author r3 and committed/pushed at `c9e87d4a70dad4391a98e7d7cc98a1bbd9f217fe`. Historical spec/Plan and all manual round files remain unchanged. The unresolved package review is preserved; no ai-peer-review launch/resume/join occurred.

Default shell cwd and supplied chat workspace agree on `/Users/kpburson/.codex/worktrees/8dae/ai-task-manager`, branch `codex/1857-continuation`. Native `.codex/hooks.json` routes first to the delivered scoped package, resolving `.scratch/1857-delivered-control`. Commands use `node node_modules/@kburson/ai-task-manager/bin/aitm.mjs`. The genuine current session resumed #1861; queued timing publication/readback reported minutes Unknown. No previous actor/session was impersonated.

Live #1861 remains Develop, all five ACs unticked, and Explain blocks Develop exit. The historical implementation plan lacks the accepted empty-runtime protocol and enforced isolation. Manual document consensus does not approve a revised Plan, code, verification, delivery or live activation.

## Confinement feasibility qualification

A newly allocated disposable real-Git canary root was created under the task-owned runtime test-fixtures namespace; no existing fixture was reused, cleared or overwritten. The profile grants writes only to that new root's exact `output/` subtree. The enclosing 8dae tree, existing runtime, delivered control, genuine Git common directory, private fixtures and candidate source/dependencies receive no writable grant. No genuine provider/session identity was copied into the canary environment.

Profile:

```scheme
(version 1)
(allow default)
(deny file-write*)
(allow file-write* (subpath "<exact new disposable canary output root>"))
```

The concrete profile uses the physically allocated absolute output path; this displayed path label grants no authority. Initial invocation inside the default desktop sandbox failed, exit 71, `sandbox-exec: sandbox_apply: Operation not permitted`. A reviewed host execution applied the same profile. The canary executed through the actual `runDevelopVerification` iteration runner, its canonical Node provider and `selectAffectedTests`, with one declared harmless canary-trigger manifest rule. The verifier subprocess was actual `node --test scripts/tests/unit/admission/isolation.test.mjs`.

Actual result: outer exit 0, no signal, canonical runner `ok: true`, selection one canary test, no lane escalation, command exit 0; node:test 1 pass, 0 failures/skips. Node/direct and spawned Node, shell and cp helper attempts to write the denied canary were refused. mkdir, chmod, unlink, rename into the denied subtree, hard-link of its protected file and write through an allowed symlink targeting it were refused. A write inside the allowed output root succeeded. The denied canary retained `preserve-canary\n`.

This demonstrates host mechanism feasibility and process-tree/path coverage on harmless disposable files. It is not an affected candidate TIA run, kernel acceptance, or proof that every future candidate profile/grant is correct. The declared synthetic trigger applies only to qualification; real candidate coverage must preserve canonical discovery, manifest and complete selection. Final candidate fixture/output grants, byte manifests and canaries must be qualified before its tests; denied test writes remain failures, never permission to broaden to preserved roots.

Private evidence:

- `.scratch/gh/1861-isolation-root.json`: disposable physical root and observed Node executable.
- `.scratch/gh/1861-isolation-launch.json`: initial nested-profile refusal.
- `.scratch/gh/1861-isolation-launch-escalated.json`: canonical selector/provider/shared verifier qualification.
- `.scratch/gh/1861-isolation-canonical-launch.json`: actual Develop runner stdout/stderr/exit.
- The disposable root retains exact profile, worker, manifest and `output/canonical-qualification.json`.

| Qualification artifact                          | SHA-256                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| profile.sb                                      | fb6de33b54f278f63e5ed3cdf0cdd98b1a7438060bd0f00d9ee8727beca35345 |
| canonical-runner.mjs                            | b3a428f62dc6fb8c5b02d83afaa43de4a33eb54fa80c18e73e6bcd80ededaa1f |
| scripts/tests/unit/admission/isolation.test.mjs | e13c63b9ec0907db7777a1657ac08ed2348a44f6ad84e726efc79d3a5d510790 |
| scripts/task-tracker/test-impact-manifest.json  | 6b8886403d7c168ef81047847b030ef02205f86b295fd3916b78bf0c7ac3e57c |
| output/canonical-qualification.json             | 7908f6998be5b461f709d697ca192e78769f23887ecf9699cf8a244a9ea838e1 |

No affected source test population, broad local lane or live authority probe was executed. The earlier two incident additions remain preserved and continue to block any live total-absence claim. Static source attribution/consumer conversion ownership remains in the immutable [r2 integrity record](../../superpowers/reviews/1861-empty-runtime-amendment-manual-review/verification-integrity-r2.md).

## Whole-child estimate and actual lifecycle refusal

Read the complete latest available rubric envelope from [#1091 comment](https://github.com/kburson/ai-task-manager/issues/1091#issuecomment-5962598198): record `01M3ZCCKBVEY3HYS94J584FKX4`, v289, generated October 2. Private exact envelope and JSON estimation input are retained. The canonical `buildEstimationForecast` preview uses Refine L/12h, current rubric and the complete C1 outcome; no comparable outcomes or actual time are invented. Governed execution may refresh the rubric/comparables; the preview is not final authority.

| Outcome component                              | Canonical preview human hours |
| ---------------------------------------------- | ----------------------------: |
| Original kernel/batches/read fencing/recovery  |                           7.5 |
| Original killed-process migration/kernel proof |                           4.5 |
| Transferred prerequisite closure               |                           4.5 |
| Shared absence census/empty plan               |                           3.5 |
| Empty main publication/recovery                |                             5 |
| Activation/linked-v2/history                   |                             4 |
| Registered bootstrap union                     |                           3.5 |
| Exact candidate/confinement integration        |                             3 |
| Revised Plan/review/ownership                  |                             3 |
| Cloud classification/attributable repair       |                             3 |
| Unavoidable repository verification            |                             1 |
| **Whole C1 outcome**                           |                      **42.5** |

Result: XL/42.5h, AI P50 11.5h/P80 12.5h. This is a whole-outcome forecast, not remaining duration, additional historic engagement or measured time. Current governed fields remain XL/20.5h. Forecast model recommends split: dependency breadth 9 exceeds 8.

Actual command:

```sh
node node_modules/@kburson/ai-task-manager/bin/aitm.mjs plan-estimate 1861 --evidence-file .scratch/gh/1861-revised-plan-estimation-input.json
```

Exit 1: `plan-estimate-authority:not-in-plan`. No revised forecast convergence is claimed. Scoped `plan-approve help` confirms ordinary approval requires Plan; later-stage repair requires explicit Full-Auto, a revoked exception chain and edit history proving no semantic scope drift. This amendment is new scope, so repair/adopt-legacy flags cannot create approval. `demote help` offers Test/Review to Develop, not Develop to Plan; no direct state jump was attempted.

A rubric-read command with a shell output redirect was classified by the native activity guard as prohibited WRITE_OTHER and did not execute. The read was performed separately, and its exact returned envelope was persisted through an admitted evidence write. No activity policy or hook was edited.

## Decomposition and concrete review decision

Canonical `classifyDecomposition` on the actual revised Plan returns `must-split`: estimate 42.5h ≥ 24h, five tasks ≥ four, and XL with five verification groups ≥ two. XL and five groups also generate review signals. All task Story Intents pass the objective parser; governed Plan content validation passes. These checks do not constitute human semantic review or approval.

A. Recommended: agree a governed decomposition/remapping of independently useful outcomes, preserving explicit-empty acceptance and native dependencies. No sibling creation is authorized by this report; accepted amendment requires explicit agreement before removing C1 scope or changing the graph. #1862 remains paused.

B. Keep #1861's full outcome together only with explicit human approval of a complete visible decomposition waiver (rationale, expected focused duration, milestone checkpoints, why no nested children, approved-by/approved-at) and a supported revised forecast/Plan authority route. No waiver is generated or recorded as approved here.

Either decision must preserve source/Plan approval integrity; a human review of this draft cannot by itself fabricate the unavailable Develop-state convergence route. Resolve that authority route through sanctioned workflow mechanisms before implementation.

## Preservation and remaining gates

Private starting manifest `.scratch/gh/1861-revised-plan-preservation.json` retains 359 pre-existing paths with bytes/mode/link/presence, exact staged rename entries, protected refs and accepted spec hash. Final preservation/readback evidence belongs in `.scratch/gh/1861-revised-plan-verification.json`. Newly allocated canaries/evidence and these two draft documents are intentional additions; existing WIP and fixtures remain protected.

Remaining: human revised Plan review; ownership/matrix agreement; decomposition decision; supported governed forecast/approval; final exact-candidate confinement qualification; implementation and genuine applicable verification; exact-head cloud evidence/lifecycle ingestion; requested independent PR review; separate delivery/operational gates. Pause #1861 on a blocking decision and do not start #1862.
