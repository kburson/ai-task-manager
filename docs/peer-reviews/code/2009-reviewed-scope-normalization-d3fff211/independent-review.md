# Independent review — AITM #2009

**Specification: PASS. Code quality: Approved. Isolated local runtime adoption: Approved for the exact tarball below after Root verifies and admits its bytes. Actionable findings: none.**

This is code/specification review, not AITM Task Review, a complete Test receipt, upstream merge approval, or Done.

## Identity and independence

- Reviewed source: `d3fff21188461a900065e4636bf7a8b75d36a642`.
- Base: `909e35f1db8c85dc218d69b80dd5167e3c0987f6`.
- Branch: `codex/2009-reviewed-scope-normalization`.
- Worktree: `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/2009-reviewed-scope-normalization`.
- Author: Sol 6.1/high; session `01a137c4-2a47-7120-b5d3-df2c4b24dffd`.
- Reviewer: Astra 6/high; native session `01a137f9-6f7f-73d1-b9f3-9829f2283d65`.
- Reviewer normal binding generation: `eea8992e-4761-49f0-b70a-bf4e48338c48`.
- [Issue #2009](https://github.com/kburson/ai-task-manager/issues/2009), [draft PR #2011](https://github.com/kburson/ai-task-manager/pull/2011), stacked on #2008 / PR #2010.

Root confirmed actual dispatch `gpt-6-astra/high/fork_turns:none`; model identity is dispatch provenance. Native environment and normal `start 2009 --role orchestrator` independently establish reviewer identity. Current Tier-1, pickup, boot, live issue and preferences were read. Author occupancy was discharged before reviewer start. Explain returned ready with `test-develop-finalization-pending`. Initial transport attempts were refused by inherited AIVC hook context; the explicit foreign-worktree exception was outer-transport-only. Inner normal CLI retained genuine environment and exact source cwd. No identity override was used.

## Assessment

No actionable severity/file/line finding was identified. At `scripts/task-tracker/lib/epic-rank-wave-refinement.mjs:26`, normalization is confined to Scope. Existing strict `stripReviewedPointer` runs per line, supporting separate canonical pointers on multiple Scope rows. Its unchanged parser validates pointer syntax and refuses malformed or duplicate pointer-shaped data.

All three acceptance criteria pass code inspection and fresh regressions:

1. Addition, update and removal preserve identity, including real mapping and adopted graph reconciliation across Plan/Develop/Test/Review.
2. Scope/AC prose, verifier declarations, snapshot digest/provenance and labels remain semantic inputs. Policy/other comments and AC pointer text remain. Snapshot fields and rank/priority checks are unchanged.
3. Malformed/duplicate pointers throw; real mapping yields null identity and graph freezing refuses incomplete identity.

The seven-line production diff changes attribution, one import and Scope normalization only. Authentication, native binding, graph publication, authority grammar and inherited #2008 schema-1 repair are unchanged. Normalizing pointers does not authenticate evidence or bypass reviewed-evidence readiness.

## Fresh independent verification

- Exact source head and clean tracked source confirmed before adding collateral.
- Eight focused refinement tests passed.
- **226/226 tests passed**, zero failed/skipped: all `epic-rank-wave-*.test.mjs`, `reviewed-scope-*.test.mjs`, and `epic-orchestration-plan.test.mjs` under `scripts/tests/unit/task-tracker/lib/`. See [full output](independent-focused.log).
- Fresh read-only AIVC bodies/labels reproduce frozen digests:
  - #4: `0fb942813b30c18877c07de31bb70d128886a07a41fc22020a5c5a96c4b0f96f`
  - #6: `64d758f4eb7e21215af75c7e1087372411e912e845bf2c0b2259ebcdc82a8c58`
- Recomputed tarball SHA-256, SHA-512 SRI and byte size; extracted refinement, orchestration and reviewed-scope model modules equal the reviewed Git commit byte for byte.

[Machine-readable provenance](independent-provenance.json) records binding, preferences, verification time, live body hashes and package identity.

## Validation limits

Author logs were inspected, not full-suite rerun by this reviewer: base and candidate fast suites each passed 959 files, relevant suite passed 123 tests, lint/format passed, and RED had exactly three intended failures.

Initial complete slow lane passed 55/56 files. Two cases in `frozen-worktree-rehearsal.test.mjs` failed through `integration/task-tracker/lib/evidence-v2/isolation.test.mjs:155`, with `ERR_ACCESS_DENIED` for parent `node_modules/js-yaml/package.json`. Author normal dependency bootstrap followed by unchanged-source targeted isolation/rehearsal passed 7/7. This supports an environment explanation; no ancestor full-slow reproduction was run.

Complete slow rerun, canonical `aitm test 2009`, and exact-head accepted Test receipts remain pending. No upstream CI success is asserted. Issue remains Develop. The corrected Full-Auto Plan approval and [audit history](https://github.com/kburson/ai-task-manager/issues/2009#issuecomment-6158162306) remain intact.

Bounded isolated adoption is justified by the small diff, independent affected/adjacent tests, live identity reproduction and package-byte verification. This does not establish upstream Test/Review/Done.

## Exact approved local package

- Source head: `d3fff21188461a900065e4636bf7a8b75d36a642`.
- Worktree-relative path: `.scratch/runtime/2009-d3fff211/kburson-ai-task-manager-0.1.0.tgz`.
- Size: 3,004,437 bytes.
- SHA-256: `9dcb289ab72a0207d2b4c916bde90c0262c47558c5acc1d0ae3835e8fb14c460`.
- SRI: `sha512-HSij3ssmvEgCsGlWDJTgOF3cjYlcS57IjqfPComZ5oVOpNWsszwVqc7ownj5k54UOfLd4m5P1DvXERx1Jf+m7A==`.

The review documentation commit descends from reviewed source; it is not the tarball build identity. Rebuilding under a later documentation commit requires fresh provenance verification. Root owns admission/installation. Reviewer changed no production code, installed runtime, AIVC evidence/binding, or global AIPR.
