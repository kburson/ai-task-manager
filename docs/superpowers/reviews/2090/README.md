# Defect #2090: actor-scoped timing cursor repair

The 24-child checkpoint review of epic #2039 found that candidate freezing required a globally unique source cursor even though ingestion accepts equal opaque cursors across independent actors. The correction requires a retained cursor match and preserves the merger's per-actor uniqueness, event identity, interval validation, historical event retention and publication fences. No schema, clock, transport, recovery, coordinator or activation changes are included.

## Source and review

Base and invocation HEAD: `4069e3cbc06b7d89139c2ef3d7d4820132667d65`. Source commit: `5aeb03289ddafd2d858bfc6f1ea2681cedf989ee`. The source patch changes only these two files:

| Path | SHA-256 |
| --- | --- |
| scripts/task-tracker/lib/story-cache/timing-candidate.mjs | 2874e51d7a7955a7a8a6339d0fe67ff67ebb461826ab0cac847978e20cf1fd5a |
| scripts/tests/unit/task-tracker/lib/story-cache/timing-candidate.test.mjs | 74f84760bb1bfc9dc9aee04994359ffd1ce73bded9c10d1471ffd64d83a7e6fa |

Fresh independent GPT-6.1 Sol / medium reviewer `/root/review_2090_cursor_r1` inspected the exact patch and relevant downstream interactions. Its complete returned report is `source-review-r1.raw.txt`. It found no actionable issue. The author accepts its conclusion and all stated limits: review was static, retained test logs were read but not independently executed, native/CI provenance was not authenticated by the reviewer, offline fixture confirmation is not cloud publication, and deferred children plus the DATE and native Refine repairs remain separate. Review grants no lifecycle or delivery authority.

## Actual verification

Local commands ran against the reviewed worktree bytes before the source commit. The file hashes above bind those bytes; these runs are not an exact-head CI or native Test receipt.

- Regression RED: candidate unit exit 1, 29/30 passed; the shared-cursor test failed specifically with `STORY_TIMING_CANDIDATE_INVALID / ingestion-boundary`. Production source was unchanged at that run.
- Corrected declared three-file timing verifier: exit 0, 93/93 passed. It exercises actual durable ingestion, frozen and serialized complete events, offline confirmation, published cursor, and absent-cursor refusal without mutation.
- Full fast lane: exit 0, all 1,003 files passed; 115.3 seconds pooled plus 58.3 seconds subprocess, aggregate 173.6 seconds.
- Full lint and format: both exit 0 before this evidence bundle was added. Targeted source ESLint and Prettier also exited 0. Bundle quality is verified separately before commit.
- Full slow lane: exit 0, all 57 files passed; 209.0 seconds parallel plus 383.6 seconds serial, aggregate 592.6 seconds. Each bounded section stayed below 600 seconds.

Full RED and GREEN streams are stored as deterministic gzip with decoded-byte verification. Original uncompressed files remain in ignored `.tmp/`. Complete fast, slow, lint and format streams were added after their actual successful completion. No exclusion-based whitespace waiver is used.

## Genuine native admission and diagnostic limits

Native Plan approval passed with Full-Auto provenance at 2026-10-23T13:17:01Z. Ordinary Plan to Develop promotion exited 0 and verified all eight saga tail steps. The actual entry start was 2026-10-23T13:20:22.428Z.

The genuine fresh-nonce doctor invocation exited 0 before product edits. Both native hook and independent CLI observations matched all eight fields: actual owning session `01a16382-9511-7401-baed-5dd61fd8a380`, physical b187 checkout, branch `codex/2039-draft`, invocation source HEAD above, issue #2090, generation `98d93a62-cf90-4da9-b213-be792a0793db`, Develop and the entry timestamp above. Nonce: `4dff56f897e8f364bdafb792f79452f380633af70e01b16a`.

`develop-hook-observation.json` copies the original consumed hook record; `develop-doctor-final-tool-result.json` preserves the actual final tool-result chunk containing CLI and hook observations and exit code. The initial invocation notice and genuine hook origin remain in the owning conversation. These local diagnostic records are not cryptographic attestation or mutation authority. Invocation HEAD does not attest which guard module the app loaded.

`deep-dive-original.md` preserves the initial posted and mirrored prose. Native approval first refused because the semantic-review paragraph followed the four Story Intent bullets without a subsection boundary. A governed body operation inserted `### Semantic review`, after which native approval passed. Plan metadata field names were also corrected to the required hyphenated key grammar. The original prose and refused attempts remain historical evidence, not a claim that the original form passed.

Native issue creation, live Backlog reconciliation, story authoring, original pending estimate reconciliation, refinement snapshot and Start time recovery used supported commands. The changed-rationale retry correctly refused while the original publication remained pending. The identical original retry reconciled its recorded effects. Registered `update-event-fields` repaired the missing set-once board Start time without moving Status. All earlier refusals are retained in the owning conversation and native issue history. No override, forged marker, manual binding, state jump, reset, rebase, deletion or cleanup was used.

## Pending boundaries

This is an implementation evidence record, not native Test, Review, Close, checkpoint acceptance or delivery. Epic #2039 remains 24/32 Done with eight children unfinished. Defects #2089 and #2091 remain separate active work. Exact-head CI, strict receipt verification, native acceptance and fresh checkpoint review remain required at their proper boundaries.
