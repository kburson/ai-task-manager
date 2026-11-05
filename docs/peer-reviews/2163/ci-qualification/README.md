# #2163 CI collection qualification evidence

These are preserved GitHub Actions timing records and a separately labeled analysis. They are not native AITM receipts, a successful complete CI run, or prospective runtime acceptance.

The original run [42118894140](https://github.com/kburson/ai-task-manager/actions/runs/42118894140) on source `3990a4b41d07980876d4044c123fc3d73094a292` completed group 3 with one failed file: the repository residue audit. All nine inflation entrypoints passed. Its runner wrote timing before exiting on the failed-file block, so it did not execute its later section-ceiling check. `3990a4-group3-timing.json` and `3990a4-shard-plan.json` retain the exact bytes extracted from artifact 13459023710 through the supported GitHub artifact tool. ZIP and extracted-file digests are in `provenance-and-evaluation.json`.

The unchanged production evaluator, applied to recorded integration serial time 1,934,152.8 ms, reports a breach of the unchanged 600,000 ms section ceiling. This is a derived finding from actual timing; it is not the original run's emitted failure reason. Reproduce the pure evaluation from the repository root:

```sh
node --input-type=module -e "import fs from 'node:fs'; import {evaluateSections} from './scripts/run-tests-ceiling.mjs'; const t=JSON.parse(fs.readFileSync('docs/peer-reviews/2163/ci-qualification/3990a4-group3-timing.json','utf8')); console.log(evaluateSections({lane:t.lane,env:{},sections:[{name:'serial',count:t.count,elapsedMs:t.elapsed.serialMs}]}));"
```

The newer fixture-corrected run [42122846359](https://github.com/kburson/ai-task-manager/actions/runs/42122846359) on source `1a7f187c50598f95cf34d04ad1f344058668bc7c` passed groups 1 and 2. Their exact extracted timing bytes are also retained. Combining these 198 costs with the old group 3's 99 costs creates an explicitly mixed-run planning model, never a lane receipt. The proposed nine-group replay maximum is 427,128.6 ms at those measured rates. Actual final-head CI must establish future runtime compliance.

The coordinator authorized nine test entrypoint moves, integration cardinality nine in the existing workflow and native receipt bridge, and current documentation/verifier-path updates. Unit remains one group and slow remains three. No test case, assertion, helper, production inflation behavior, generic sharder, scheduler, timeout, source-identity gate or receipt-integrity check is relaxed. The nine moves retain their parsed test bodies and resolve to the original modules. Canonical integration inventory remains 297 files; the unchanged planner assigns nine groups of 33, one inflation entrypoint each.

The native bridge requires successful exact-head CI plus exact tested commit/merge provenance, run/attempt, complete inventory, zero exits and worker/aggregate agreement. It relies on the runner's exit verdict to enforce timing. Failed runs and the pure evaluator analysis here cannot satisfy it.

The six historical source inventories that triggered the residue audit remain byte-identical. Their exact-path/count allowances are accompanied by full-reference validation and extra-line, same-count insertion/replacement, and unlisted-sibling refusal cases. The round-04 reviewer report remains historically REVISIONS_REQUIRED; its finding is corrected in subsequent source and awaits retained review. No historical report or original RED bytes are rewritten.

## Later completed-run observation

Run 42122846359 subsequently completed group 3 with the same sole residue-audit failure and all nine inflation files passing. Artifact 13462935644 is 11,746 bytes, ZIP SHA-256 `2bfb4d785bd5968c31720145499087ea3df0e12b1111c7d3115eecb1c9b00aac`. Its exact extracted timing is `1a7f18-group3-timing.json`; the separate source-pinned evaluator result and complete same-run replay model are `1a7f18-complete-run-evaluation.json`.

Actual serial time was 2,625,080.8 ms. As in the first run, its actual failure was residue and the runner exited before evaluating the section ceiling. The unchanged evaluator separately reports that recorded time over 600,000 ms. Replaying all 297 costs from this one completed run through the new nine-group layout estimates a maximum **557,186.7 ms**, leaving 7.1 percent margin. This later observation supersedes the older mixed-run projection for planning; the older record is preserved unchanged. Neither projection qualifies future CI. Final-head jobs must all pass their existing limits.

These later two evidence files and this addendum were added after the source freeze for tree `511ae78baa64846f5173ece1e4f4c0e207147d87` ended. That frozen tree passed both complete public commands: 110/110 in 947.527 seconds and 30/30 in 389.238 seconds. The later evidence additions require explicit documentation carryforward review and do not change tested executable bytes.
