# #2066 single-attempt resource publisher

Source candidate: `fcdf5a243911eeea70247cae5372eb9e78c1ab4a` (follow-up to preserved failed candidate `03f608911194eb00b0b0ab6a16b92491b64da39a`), based on `c67d1dc49f44cef34991df5727273263b8074960`. Current source tree: `41f9515eb3aa14bc13845d9ae934902a72948b89`; root Sol/medium follow-up accepted this exact source statically. This delivers the unexposed Task 23 publisher/adapters and its named offline verifier. It does not activate recovery, the final coordinator or public writers.

## Source behavior

`publishResourceEffects({store,claim,batch,snapshot,ports})` consumes a full verified store record, an acquired persistent writer claim, native issue lock, #2047 frozen batch, complete current snapshot and native validation/transport ports. It reconstructs and checks the frozen intent before any effect, compares all retained target resources/title/inventory/assignment/fields, persists each dispatching attempt before transport and makes at most one attempt per declared resource. Complete exact mutation results can confirm; incomplete results spend one targeted readback. Any unresolved write stops dependencies without replay. Final issue slots use verified created IDs and persist exact realized bytes/digest before dispatch.

Creation readback checks the expected inventory after prior confirmed effects, including exact IDs and existing comment bytes. Confirmed resource baselines and timing publication cursors are checkpointed while the original batch baseline and pending intent remain retained. The publisher returns resource confirmation and leaves aggregate transition completion to #2068. Provider writes remain non-atomic and local readbacks cannot establish server-side exactly-once creation or eliminate lost-update races.

Only these product paths changed:

- `scripts/task-tracker/lib/story-cache/publisher.mjs`
- `scripts/task-tracker/lib/story-cache/provider-adapters.mjs`
- `scripts/tests/unit/task-tracker/lib/story-cache/publisher.test.mjs`

## Verification and outstanding integration

| Check | Actual result |
| --- | --- |
| Named publisher verifier after final source change | Exit 0; 27 passed, zero failed |
| Independent Sol/medium named verifier | Exit 0; 27 passed, zero failed |
| Final post-transport-fix `npm test` | Exit 1; 2 of 1003 files failed: package boundary and GraphQL source inventory |
| `npm run test:slow` | Exit 0; all 57 files passed. Started before the final transport change; the unexposed modules have no slow-lane consumers |
| Final `npm run lint` | Exit 0 |
| Final `npm run format:check` | Exit 0 |
| `git diff --cached --check` before source commit | Exit 0 |
| `npm pack --dry-run --json` | Exit 0; 980 entries, exactly two new owned production modules |

The shared package ceiling remains 978. The new planned GraphQL dispatch is `scripts/task-tracker/lib/story-cache/provider-adapters.mjs|121|gh-api-graphql|planned`. The controller must inspect and register the two module entries/980 ceiling and the real GraphQL site under the proper child binding, then run integrated exact-head verification. Neither shared inventory was edited here. No all-suite-green or native Test/Review/Close acceptance is claimed.

Earlier failures remain retained: initial missing implementation RED; first implementation's template-shape mismatch; a fixture-only registry-drift assertion error; numeric transport-variable RED; creation inventory/reused-ID RED; the original full fast failure; a test-comment spell failure; collateral blank-line lint failure. The initial fast run overlapped module creation and observed 979 entries; it is not a clean c67 baseline. The post-review fast run observed the final 980 entries and exactly the two declared integration failures. The first package-summary parser assumed array-shaped npm JSON and failed; the retained JSON is keyed by package name and the corrected read measured 980. The pack command itself exited 0.

## Review and source hashes

The first independent fresh-context reviewer used `gpt-6-sol` / `medium` on tree `462262d2e9553c098b730f23fcb599364d727ff1`. It found two Important creation-confirmation defects. Both were reproduced RED, fixed, and passed the 27-test verifier. A controller-requested later review of `f31c2922cabef1474cdbc5ff748fe9579e6a801d` found no new source issues and independently ran all 27 tests. Full reports, response and independent raw test output are preserved in [review-disposition.md](review-disposition.md) and `raw/`.

| Source | Final SHA-256 |
| --- | --- |
| publisher.mjs | `e4bd0b3191834b87b1ad73a9d4792891c5b2644d724f66db21e1b1cdeec4200b` |
| provider-adapters.mjs | `22967c6d95f2b8d128794615542be58662059973a0c0e3cddb72be70220eb85a` |
| publisher.test.mjs | `c243a3edd50732430a1d98e1a1c95b4706e4e1394ab3686d11631a27126c191d` |

## Native provenance and evidence limits

Actual chat/session: `01a16877-b4b6-7b83-adf6-0e9e2209c25a`; actual worktree: `/Users/kpburson/.codex/worktrees/438b/ai-task-manager`. Both environment identity commands independently returned that SID. Canonical setup ran once as the exact standalone command and exited 0 with the own-worktree self-link verified. Native Start requested relocation with exit 12/no effects, then the authorized confirmed rerun exited 0. The original doctor nonce was `ca714ec8bac02e72abc8ee41aa7591e75d1e3752f6460515`, with all eight actual hook/CLI fields matching on detached HEAD at c67, Ready for Planning, generation `b9c009f5-cca1-42de-bd4b-139b2be27b85`, entry `2026-10-23T11:14:51.851Z`.

Native Plan exited 0. Draft branch first refused exit 1 because the issue was unassigned. After controller authorization, native assign exited 0 and live readback showed exactly kburson; native draft-branch then exited 0 and renewed binding on `codex/2066-draft`. Plan-estimate, deep-dive comment/mirror/completion and Full-Auto Plan approval exited 0. Native Develop promotion exited 0. Before product edits, genuine doctor nonce `a3cf97c51a7028e063e7d7002895649d9bed4c8cf4c695d4` exited 0 with all eight fields matching this branch/c67/#2066/generation above/develop/entry `2026-10-23T11:24:45.167Z`. The native actor-state API independently returned active #2066 and a null pause timestamp; the native occupancy API matched this SID/root/generation.

The original hook additionalContext JSON and CLI outputs are copied verbatim from actual conversation tool events into the named raw files. They are local diagnostic transport, not cryptographic attestations or mutation authority. Original full native invocation records remain in this chat; copied excerpts are labeled as excerpts. All raw verification files copied from `.tmp/2066-evidence` preserve their bytes with `.raw.txt` suffixes. `evidence-sha256.txt` records the collateral payload hashes.

Other preserved refusals: an unsupported occupancy JSON query returned usage exit 1; a help query during branch renewal was hook-blocked for stale HEAD binding; a redirected baseline command in Plan was hook-blocked as WRITE_CODE before execution; the patch tool rejected the scratch payload parser and the ordinary scratch-file write succeeded. No override, identity substitution, foreign-worktree flag or guard removal was used.

## Root review follow-up

The controller independently found fractional NUMBER values were still strings through gh -F. That Important finding superseded the earlier source verdict and was closed by the final root review after the JSON-input correction. The corrected JSON-stdin boundary test failed before the fix and passed afterward. See [root-review-response.md](root-review-response.md) for the full response, preserved failed candidate, current hashes and raw review. No live mutation ran.

## Handoff boundary

Native commit-trace updated on the follow-up source commit; the source AC was stamped by its actual named verifier and checked through ensureChecked on that source SHA. Functional full-suite, lifecycle and housekeeping items remain unchecked for integrated controller acceptance. Source-only fast verification remains RED for the two explicit shared inventories. The controller must refresh exact-head evidence after companion registration and any integration/collateral commits. No native Test, Review, task approval, Close, push or merge was invoked by this worker.

The final root review is preserved in [the final raw review](raw/root-sol-medium-final-review-fcdf.raw.txt). It accepted the follow-up source statically, with no remaining required source findings, while explicitly excluding test execution and integrated workflow acceptance. The final worker fast result remains exactly two failed files out of 1003; final lint and format returned 0. No exact-final-source slow claim is made.

Verbatim raw command output contains trailing whitespace and terminal blank lines. The full staged collateral diff check returned 2 for those raw bytes; the same check excluding raw/ returned 0. Raw bytes were preserved deliberately rather than reformatted. This is separate from the clean source diff check and is recorded in raw/collateral-full-diff-check.log.raw.txt.
