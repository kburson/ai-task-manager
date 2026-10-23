# CODE_COMPLETE — native acceptance pending

Source correction: `a71997b22528b96a707730afc77b03c3753c05e6` on `codex/2091-draft`, based on accepted epic source `4069e3cbc06b7d89139c2ef3d7d4820132667d65`.

The source supplies rank and its override key only when explicitly provided. Omission preserves the fresh body rank; the sealed operation key still carries null. Required snapshot rank validation is unchanged. Production ownership is only `scripts/task-tracker/verbs/refine.mjs`. Eight real-publication/snapshot regressions were added to the existing publication cases; no new production module or shared configuration changed.

## Verification

| Run | Exit | Result |
| --- | --- | --- |
| RED real publication harness | 1 | 55/61 pass; six omission failures at refinement-snapshot:field-rank |
| GREEN real publication harness | 0 | 61/61 pass |
| Declared focused vc:1 | 0 | 73/73 pass |
| npm test | 0 | All 1003 fast test files passed |
| npm run test:slow | 1 | 56/57 files passed; capture fixture failed two stderr assertions |
| Exact slow-failure reproduction | 1 | Same two stderr assertions with required flags |
| Initial lint | 1 | Four Markdown formatting issues in collateral |
| Lint after Markdown repair | 1 | Three opaque GitHub ID fragments in ledger spelling |
| Full lint after collateral repairs | 0 | All stages passed |
| Format check | 0 | All matched files conform |
| Final collateral Markdown/spelling | 0 | No issues before packaging |
| Source commit trace | 0 | Native canonical trace created |
| Fresh source-head doctor | 0 | Bound, healthy, all eight hook/CLI fields match |

The slow failure is in unchanged `scripts/tests/slow/task-tracker/lib/action-capture-integration.test.mjs`: “shim preserves exact request, stdout, stderr, and exit while recording body-file bytes” and “shim does not wait for EOF on an unused execFile stdin pipe.” With required `AITM_GRAPHQL_USAGE=1`, the fake-GH fixtures receive `[aitm graphql-usage] invalid-inherited-context` on stderr. Both required flags were retained for the full run and exact reproduction. No unrelated capture code, environment substitutions or threshold changes were used. The timing artifact records slow parallel 265.7s and serial 480.5s, each below 600s. The runner's full run remains red; no passing native Test receipt is claimed.

Independent GPT-6.1 Sol / medium accepted the exact source with no findings. Full raw report and rulings are preserved. This is bounded implementation review, not whole-branch review or production runtime proof.

## Evidence and limits

`evidence-manifest.json` lists source hashes and byte lengths plus every compressed raw artifact's original/compressed SHA-256 and byte lengths. Gzip uses mtime 0 and no filename header; decompressed copies are verified byte-for-byte. Ignored originals remain in `.scratch/2091`. No output was truncated for preservation, no diff check exclusion was added, and all earlier failed outputs remain.

The genuine native bootstrap/Plan/Develop tool invocations and hook observations remain in this app transcript. `native-admission.md` indexes them; the final doctor stdout is also preserved. These are local diagnostics, not cryptographic attestation or source activation.

The issue remains in Develop. AC/VC/DoD acceptance boxes, Develop finalization, native Test, Review, approval, Close, whole-branch review, source adoption, and #2089 recovery remain pending the owning chat's serialized acceptance. This worker must pause after collateral commit and await root-directed genuine Stop/release. No other chat was messaged, no history/worktree/branch/evidence was deleted, and nothing was pushed or merged.

## Rulings

All decisions and costs are in `progress.md`: preserve existing evidence instead of skill cleanup; execute the explicitly authorized native approach; expand the existing cited focused verifier; use the assigned artifact directory; accept the finding-free bounded source review; and retain the reproduced out-of-scope slow validation failure for root acceptance. Deferred minors: none.
