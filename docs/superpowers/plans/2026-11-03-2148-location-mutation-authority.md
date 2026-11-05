# Issue location authority implementation plan (#2148)

Use executing-plans and test-driven-development in the bound native worktree.

**Goal.** When Start refuses the operator, preserve the issue's authorized checkout, binding and timer.

**Architecture.** Read actor and semantic authority before accepting or changing a durable location. The existing issue lock serializes cooperating local writers. The body writer revalidates at every fresh base before a provider write. Existing verbs retain their lifecycle effects.

**Stack.** Node.js ES modules, node:test, Git, and the public AITM CLI.

**Specification.** Task 1 of the owner-approved [#2146 plan](https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6618563606) follows the [public Start reproduction](https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6618558333).

## Story Intent

- **Beneficiary:** native-session operator
- **Capability:** prevent an unauthorized session from recording a checkout
- **Need:** a refused Start can overwrite the apparent location of my work
- **Value or failure prevented:** I can resume from the last authorized checkout with my binding and timer intact

## Global constraints

Use actual native actor evidence for native success. Keep old markers verbatim. Work inside independent physical Git fixtures for destructive cases. Restrict GitHub calls to fixture data when running the integration suite. Leave original #2145 and #2146 worktrees untouched. The local lock cannot lease GitHub state.

## Starting state and remaining work

The production baseline is `2fd89e1103a0ee1976e0e1a1210c2d4e1bb57de0`. The original sealed planning commit `7ffd955205c6c2034ea39a08bdf2d6463dd2a38e` adds only this plan. Source visible during the first Claude review is the later unstaged implementation authorized while that review awaited admission. It is the 16-file V3 patch with SHA-256 `7c63d99504498051b50a7033c548220812f2145a18bc0013db975767883c1637` and manifest SHA-256 `c6eabac9d1b34993109b437eebf0554108b7b05e2d9862c281a5f9d2893fd1dc`. Its patch, manifest and logs are retained in `.scratch/plan/location-authority/`. The issue checkpoint records independent source approval and author-run results. [V3 checkpoint](https://github.com/kburson/ai-task-manager/issues/2148#issuecomment-6621311036)

A1 and A2 are implemented in V3. The authority module, guard and dispatcher integration, provider-specific actor checks, combined GitHub observation, native renewal revalidation and public integration suite already exist. Recorded results are 37 focused checks, 157 related regressions and 7,193 configured Develop tests across 712 files, each with zero skips, plus passing lint and formatting. These results identify the unstaged patch and do not establish implementation evidence at the plan-only HEAD.

The initial failing-first work preceded V3. The #2146 reproduction records the baseline unauthorized append. The retained `2148-races-red.log` records two failed authority-race assertions against the intermediate entry-only implementation. `2148-review-red.log` and `2148-legacy-binding-red.log` retain later failures. Those intermediate source states were uncommitted, so their logs are historical execution evidence rather than reproducible commit snapshots. V1 and V2 patches remain retained separately. [Baseline reproduction](https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6618558333)

Execute the tasks below as verification and correction of observed gaps in V3. Preserve the existing candidate. A new implementation finding requires a failing test, a minimal fix, affected verification, a new patch digest and renewed source review. Remaining work is to finish this original plan XPR, make authorized implementation commits after protocol finalization, and satisfy the ordinary Test and delivery gates against those source commits. Protocol-owned plan and response commits may occur during review.

## Task 1. Verify actor and target authority (A1)

**Production files already changed.** `scripts/task-tracker/lib/location-mutation-authority.mjs`, `assignment-snapshot.mjs`, `issue-worktree-location.mjs`, `occupancy.mjs`, `verb-preflight.mjs`, `worktree-binding-guard.mjs`, `worktree-relocation-guard.mjs` in the same library directory, and `scripts/task-tracker/task-tracker.mjs`. A2 shares the authority, relocation and dispatcher files. Keep edits sequential within the owning worktree.

- [ ] Verify the existing `scripts/tests/integration/task-tracker/location-mutation-authority.test.mjs` cases use `createRuntimeRootFixture` and issue-scoped provider transport. From public Start with a terminal environment stripped of actor identity, assert a nonzero exit, unchanged issue body and no binding, timing or occupancy write. Compare with the retained baseline append evidence. Repeat with the actual native actor and foreign or multiple fixture owners. Include an existing matching location.
- [ ] Exercise malformed, default and unknown IDs at the actor decision. Reuse native identity corroboration for Codex. Preserve the supported Claude, Grok and non-native orchestration routes under their actual contracts. Verify denied actors cannot adopt a trusted actor merely by supplying a syntactically valid correlation key. A foreign occupancy check must be read-only.
- [ ] Verify `readLocationMutationAuthority(context)` returns issue, repo, actor, physical root and branch, owner and live state plus the observed body version, digest and relevant markers. Honor existing lifecycle ownership rules, including unassigned early stages and marker-free first bind. Refuse unavailable required observations. Read authority before returning a matching location or proposing a write. Preserve the existing relocation prompt and established refusal exit codes.
- [ ] Run the qualified focused command below and the relocation and verb-preflight unit suites when changed inputs or unresolved findings require verification. Retain pass, fail and skip counts with the candidate digest. Reuse unchanged candidate evidence. Hold implementation commits until protocol finalization.

## Task 2. Verify locked location revalidation (A2)

**Production files already changed.** `scripts/task-tracker/lib/location-mutation-authority.mjs`, `worktree-relocation-guard.mjs`, `native-branch-renewal.mjs`, `versioned-issue-write.mjs` in the same library directory, and `scripts/task-tracker/task-tracker.mjs`. Test changes are the public integration suite, `scripts/tests/helpers/location-authority-fixture.mjs`, `scripts/tests/fixtures/location-authority-gh.mjs`, the native branch observation integration suite, and the assignment snapshot and relocation guard unit suites.

- [ ] Compare the retained failing races with current tests. Change owner, state, local authority or location between entry and the locked writer. Cause a versioned write conflict, then change authority on the fresh base. Count write attempts and verify no additional write after refusal.
- [ ] Verify the ordinary shared per-issue lock and `assertLocationMutationAuthority(expected, fresh)`. The callback signature is `validateFreshBaseAsync(strippedBase, next, rawRemote)`. Pass `rawRemote`, including the version marker, to the authority reader for exact body equality and version comparison. Re-read actor, target, physical checkout, owner, state and occupancy. Compare location and state history while allowing unrelated concurrent text.
- [ ] On retry, the writer rebases the earlier edit without rerunning `mutate`. Compare authority on that fresh base and require `recordIssueWorktreeLocationOnChange(strippedBase, entry).body === next`. A concurrent location append changes authorized history even when its path and branch match, and must refuse before another write. An overlapping edit may refuse earlier. Post-write verification of exactly the submitted bytes can return success without another write.
- [ ] Check first bind and confirmed relocation through the original CLI and ordinary writers in the disposable fixture. Verify append count, SID, physical location, preserved history and local records. Distinguish newly executed observations from retained evidence.
- [ ] Require zero failed and zero skipped native-dependent cases before claiming A1 actor/owner adoption or A2 lock, retry and checkout guarantees. Failed identity qualification or skipped native cases leave those claims unproven. Revalidate changed source, retain exact patch review, finish the plan protocol, then make authorized implementation commits and acquire ordinary source-bound stage evidence.

The first-attempt no-op path validates authority before returning. The generic writer also has a defensive no-op retry branch with the same async validation. For the current pure location mutator, a first attempt with no edit returns immediately, so that retry branch has no reachable public Start scenario. Existing first-no-op writer tests and fresh-base retry tests cover their public contracts. Do not force a private branch by fabricating an actor or mutating writer internals.

## Review focus

Test a matching location with an invalid actor, a first bind without a recorded state marker, a same-session branch change, a disjoint retry whose owner changed, and a dropped provider read. Native-dependent claims include first bind and relocation, refusal under foreign or multiple owners, authority changes while waiting for the lock or provider, native renewal and binding preservation. A two-host native occupancy positive requires an independently corroborated second native session and remains unproven. The actual Claude handoff demonstrates sequential cross-provider occupancy only.

## Verification commands

```sh
node --input-type=module -e 'import { assertNativeSession } from "./scripts/task-tracker/lib/native-worktree-bootstrap.mjs"; assertNativeSession(process.env.CODEX_SESSION_ID); if (process.env.CODEX_SESSION_ID !== process.env.CODEX_THREAD_ID) throw new Error("Both native host IDs must agree");' &&
  node --test --test-reporter=tap scripts/tests/integration/task-tracker/location-mutation-authority.test.mjs
node --test --test-reporter=tap scripts/tests/unit/task-tracker/lib/worktree-relocation-guard.test.mjs scripts/tests/unit/task-tracker/lib/verb-preflight.test.mjs
```

Retain each TAP summary with its `# pass`, `# fail` and `# skipped` counts. The first command refuses absent or inconsistent native identity before launching tests. The fixture's native skips use the same two-ID condition. Require `# skipped 0` for the native-dependent claims above. Reviewers on another provider may run the unit suite and inspect the native author's evidence, explicitly identifying integration cases they did not execute.
