<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-c07dd9fe67f293cd31248e6d408a8b37"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-11-03-2148-location-mutation-authority.md"
artifact_commit: "7ffd955205c6c2034ea39a08bdf2d6463dd2a38e"
artifact_blob: "8869564648c1fd36014756089fb28b2af89467ea"
artifact_digest: "sha256:63fc3df473ff99f25747185ab5bb32973d325f8bb09b8c2bb9c7bfc676613847"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:120b897078ed9d7b673ab842ca4659d6c82aea68f2e1bdd29d2c6b08e3227c13"
  identity_source: "declared"
started_at: "2026-11-05T02:45:22.559Z"
submitted_at: "2026-11-05T02:46:52.379Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed the sealed plan (`docs/superpowers/plans/2026-11-03-2148-location-mutation-authority.md`, artifact commit `7ffd955`) against the worktree at that commit. I read the code and ran tests. I used no Git commands.

The security intent is sound: read actor and semantic authority at entry, take the per-issue lock, then revalidate on every fresh base before the provider write. The task split (A1 entry authority, A2 locked revalidation) is coherent. The review focus covers the right adversarial cases: invalid actor on a matched location, marker-free first bind, same-session branch change, disjoint retry after an owner change, and a dropped provider read.

The plan does not match the state of the tree it governs. It is written as greenfield, failing-first work ("Add `location-mutation-authority.mjs`", "Observe the baseline location append", "Observe a failing race"). But the module, its integration into the relocation guard and CLI, and a 530-line integration suite already exist in the checkout. As written, the TDD steps cannot be carried out and the plan does not define the remaining delta. Smaller issues: the callback contract is described imprecisely, and the plan does not make native-actor test skips visible in its verification commands.

Evidence gathered:

- `scripts/task-tracker/lib/location-mutation-authority.mjs` (211 lines, `// @story #2148`) already exports `LocationPreflightError`, `readLocationActor`, `readLocationMutationAuthority` (line 123) and `assertLocationMutationAuthority` (line 204).
- `scripts/task-tracker/lib/worktree-relocation-guard.mjs:181-243` already imports both functions. It reads authority at entry, re-reads on the matched path, takes `withIssueLock`, asserts lock ownership and passes `validateFreshBaseAsync` into `mutateIssueBody`.
- `scripts/task-tracker/task-tracker.mjs:526` already handles `LocationPreflightError`.
- `scripts/tests/integration/task-tracker/location-mutation-authority.test.mjs` (530 lines) already has about 30 cases. They cover terminal-fallback Start refusal (line 91), matched location with a terminal actor (98), malformed or reserved actor IDs (111), foreign provider adopting an occupied SID (261), locked-writer change races (25), unknown or disagreeing native IDs (497) and registered non-native actors (414).
- `node --test scripts/tests/unit/task-tracker/lib/worktree-relocation-guard.test.mjs scripts/tests/unit/task-tracker/lib/verb-preflight.test.mjs`: 11 pass, 0 fail. I did not run the integration suite: the plan restricts it to fixture-scoped GitHub transport, and I could not confirm that isolation as the reviewer.

## Findings

1. **Severity: major. The plan describes work as not yet done when it is already implemented, so its failing-first steps cannot be executed.** Task 1 says "Add" a file that already exists with both prescribed functions. Task 1 step 1 and Task 2 step 1 call for observing the baseline append and a failing race before implementing. With the implementation present, those observations cannot be made on this tree. The plan does not say:
   - what baseline commit failing-first evidence should come from;
   - which parts are already done and which remain;
   - whether the job is to verify and close gaps in an existing candidate, or to start over.

   An executor following it literally will either fake the "observe failure" steps or rewrite working code. This conflicts with the evidence-integrity rules the project enforces. I cannot tell from the tree alone whether the code came in with commit `7ffd955` or earlier, because Git was out of scope for this review. The plan needs to state that itself.

2. **Severity: minor. The `validateFreshBaseAsync` callback contract is misstated.** Task 2 says "The callback receives the version-stripped body." `versioned-issue-write.mjs:361,394,402` actually calls it with `(strippedBase, next, rawRemote)`. The existing guard re-reads authority from the third argument, the raw body (`worktree-relocation-guard.mjs:230-234`). That is required, because `readLocationMutationAuthority` compares `snapshot.body !== body` and computes `parseBodyVersion(body)`, and both need the version marker. An implementer who follows the plan's wording and passes the stripped base would get a spurious "body changed during provider read" refusal and lose the version comparison in `assertLocationMutationAuthority`.

3. **Severity: moderate. Native-actor proof can silently pass as skipped.** The locked-writer race cases are declared with `{ skip: !hasNativeActor }` (integration test line 25), and other cases are probably gated the same way. The plan's verification command (`node --test …location-mutation-authority.test.mjs`) exits 0 when those cases are skipped. "Keep unavailable native proof visible in the report" is in Review focus, but neither the verification commands nor the Task 2 step 4 commit gate require reporting skip counts or naming which acceptance claims depend on skipped cases. So the A2 race guarantees could be recorded as verified on a host with no native actor.

4. **Severity: minor. The retry-path semantics are not stated.** On a versioned-write retry, `versionedWriteBody` rebases the earlier edit by diff (`rebaseOnto`) and does not re-run `mutate`, so the relocation-required check inside `writeLocation.mutate` runs only on the first attempt. Safety on retry therefore rests entirely on two checks: `assertLocationMutationAuthority` comparing `history` and the marker, and the `recordIssueWorktreeLocationOnChange(base, entry).body !== next` check. The current code does this, but the plan's Task 2 text ("Check that each proposed result still expresses the authorized append") does not say that this replaces the relocation prompt on retries, or that a concurrent writer recording the same or a different location must cause a refusal rather than a merge. The no-op retry branch (`validateFreshBaseAsync(remoteBase, remoteBase, remote)`, line 393-394) also has no named test case.

## Required changes

1. (Finding 1) Add a "Starting state" section. It should name the commit or tree the plan starts from and list what is already implemented: the authority module and its exports, the guard integration, the CLI error handling and the integration suite. Then rewrite Tasks 1 and 2 against that starting state. Either:
   - (a) reframe them as verification and gap-closing, with failing-first evidence taken from a named pre-implementation parent; or
   - (b) state that the existing code is discarded and restarted, and say why.

   Remove "Add" for a file that exists.
2. (Finding 2) Correct the callback description to `(strippedBase, next, rawRemote)`. State that the authority re-read must use the raw remote body so that the body-equality and version checks hold.
3. (Finding 3) Change the verification commands and the A2 commit gate to report node:test `skipped` counts. List which acceptance claims (actor adoption, locked-writer races) depend on native-actor cases. Treat a skip on any of those as "unproven", not "pass", in the handoff.

## Optional suggestions

1. (Finding 4) Add an explicit Task 2 case: a concurrent writer appends a different location between the first attempt and the retry, and the guard must refuse with no second provider write. Also cover the no-op retry branch where the fresh base already contains the identical entry.
2. Task 1's file list mentions only the new module, but the code already touches `worktree-relocation-guard.mjs` and `task-tracker.mjs`. List every touched production file under each task so the shared-file surface is visible before any parallel work.
3. The integration suite imports only `readLocationActor` directly (line 21). Consider direct unit coverage of `assertLocationMutationAuthority` for the `liveVersion < bodyVersion` regression branch, which is otherwise reachable only through end-to-end races.

## Decision

revisions-requested
