# #2073 refinement traffic evidence

## Retained source before production changes

Boundary: real publishFieldEstimateRevision → executeEstimateWriter → native collectors, guarded body writes and board field writes. Binding, launch, timing and whole-refine promotion are excluded. No source overlay or policy-success substitution was used.

Source: local commit `52ff0fe734cf682c604695ab0c7b005f512c2844`. Exact source/driver/population/configuration hashes, complete selected-response dispatch ledgers and successful durable snapshots are in [run 1](baseline-run1.md) and [run 2](baseline-run2.md). Both produced 313 dispatches and byte-identical business snapshots and outcomes. All production source is still unchanged at this checkpoint.

| Family | Baseline dispatches |
| --- | ---: |
| Membership | 127 |
| Estimation projection | 80 |
| Opaque issue-body read | 96 |
| Body write | 8 |
| Project field write | 2 |
| Total | 313 |

The [baseline budget review](baseline-budget-review.md) documents the discovered plan defect and structural baseline-only amendment before optimized measurement. Baseline remains below 512 total. Optimized ceilings are unchanged.

Offline costs are unknown, not zero and not synthetic live savings. GraphQL dispatches are transport invocations; opaque CLI observations can hide multiple HTTP requests. Payload sizes are UTF-8 serialized decoded response bytes at the exposed adapter, not compressed wire bytes. Real native workflow calls continue to use GraphQL usage capture separately.

Regenerate before/after evidence with the same external driver:

```sh
mkdir -p .scratch/2073-baseline
git archive 52ff0fe734cf682c604695ab0c7b005f512c2844 | tar -x -C .scratch/2073-baseline
node scripts/tests/fixtures/refinement-traffic-runner.mjs --source-root .scratch/2073-baseline --fixture changed-publication --boundary publication --report .scratch/2073-baseline-run1.md
node scripts/tests/fixtures/refinement-traffic-runner.mjs --source-root .scratch/2073-baseline --fixture changed-publication --boundary publication --report .scratch/2073-baseline-run2.md
```

Optimized implementation, safety/routing/recovery checks and live-comparison status remain pending.

## Conditional admission implementation checkpoint

The real offline admission route now admits explicit and unmarked complete empty leaves with one shallow request. A two-page comment leaf uses three requests including the final root fence. A two-child parent uses three requests (root, graph, fence). The 51-child fixture completes five requests and retains the pre-existing readiness-children refusal: the readiness schema caps children at 50, while collector connections permit 150. Expanding readiness is explicitly outside #2073. The final reviewer must assess this plan correction.

The focused test checks kind ambiguity, unexpected children, four comment pages, observed body/owner/item/field/child drift, empty/unready parent refusals and strict shared kind grammar. Existing native source/activity hooks, Plan observer, completion, recovery and preparation cases passed 136/136 after updating provider identity and phase expectations. Additional classifier/traffic and authority checks passed 66/66. These results do not establish completed #2073 acceptance; targeted scalar readers and paired optimized publication remain pending.

The root fence deliberately excludes comments and nested child authority. It detects observed root continuity failures, and does not provide an atomic snapshot of independently changing child/comment content.

## Final paired comparison

Same external driver/population/configuration hash: `4d28c651081f56615f99ea62e35e19b0faca6cbcab08a2dd10e1ca089b7b6081` / `d4d585eea6e0455180a23ded613312603ace5e7f6514bb07c87cc1ea835341bd`. Fixed-budget content hash: `1c309dd0062f1be6f3cfaef2d5c9d818e6ca70c426dad37b82cd812670cae49a`. [Baseline one](paired-baseline-1.md), [baseline two](paired-baseline-2.md), [optimized](paired-optimized.md) retain every dispatch and all durable bytes. The two baseline results are identical in full; optimized result and snapshot are identical to baseline without excluding business timestamps, operation/subject identity or any digest. Earlier baseline-run1/run2 files retain the pre-production foundation checkpoint; final savings use these paired files and their shared driver.

| Family | Baseline | Optimized |
| --- | ---: | ---: |
| membership | 127 | 37 |
| issue-body-read | 96 | 51 |
| projection | 80 | 35 |
| body-write | 8 | 8 |
| project-field-write | 2 | 2 |
| target-binding | 0 | 1 |
| target-project | 0 | 31 |
| target-body | 0 | 14 |
| Total | 313 | 179 |

Reduction: 134 exposed dispatches (42.8%). This is the publication boundary, not a whole-refinement or live-point-cost claim. Aggregate serialized adapter-return envelopes: baseline 1328201 bytes, optimized 742970 bytes. GraphQL and opaque CLI envelope layers are labeled per entry; neither is compressed wire coverage. All offline point costs remain null/unknown.

- empty-leaf: 1 → 1 dispatches; allow.
- empty-unmarked-leaf: 1 → 1 dispatches; allow.
- two-child-ready-epic: 1 → 3 dispatches; allow.
- two-page-comments-leaf: 2 → 3 dispatches; allow.
- 51-child-ready-epic: 2 → 5 dispatches; block.
- unchanged-publication: 4 → 4 dispatches; unchanged.

Additional raw paired outputs are in [paired cases](paired-additional-cases.md). [Pre-change pending record](legacy-pending-baseline.md) is generated by unmodified source and recovers in the optimized integration test without subject, operation, intent or before-record migration.

The publication protocol modules estimate-writer-publication, decomposition-publication, decomposition-projection and decomposition-assessment remain unchanged. The new reader reacquires binding once per effects construction and reads fresh every invocation. No checkpoint sharing or cross-invocation authority cache is claimed.

## Live comparison

Live point savings remain unverified. No safe comparable story transition was selected for an A/B run, and #2039 bulk refinement remains paused. Native #2073 lifecycle calls continue to be captured separately; those observations are not represented as a comparable before/after experiment. Opaque CLI expansion and uninstrumented transport activity remain unknown.

## Verification before implementation review

The declared focused verifier passed 69 tests. Native selected-byte route proofs are retained for [activity allow](native-activity-guard-leaf.md), [activity drift](native-activity-guard-drift.md), [source allow](native-source-edit-gate-leaf.md) and [source drift](native-source-edit-gate-drift.md). Real Plan-exit tests allow a current leaf and refuse observed drift through the same collector. Actual runRefine route proof reaches completed publication and the explicit promotion sentinel; whole-command success remains unclaimed.

`npm run quality` passed all formatting/lint/audit gates and all 975 fast-lane files. The standalone required recovery set and the task-completion verifiers also passed. Exact-head cloud/Test evidence and implementation review remain separate governed steps.
