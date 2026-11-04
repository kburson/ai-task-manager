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

## Task 1. Read actor and target authority (A1)

**Files.** Add `scripts/task-tracker/lib/location-mutation-authority.mjs`. Reuse provider identity, ownership-policy, assignment-snapshot, physical worktree, occupancy and last-known-state readers. Keep the real Start entry in `scripts/task-tracker/task-tracker.mjs`.

- [ ] In `scripts/tests/integration/task-tracker/location-mutation-authority.test.mjs`, use `createRuntimeRootFixture` and issue-scoped provider transport. From public Start with a terminal environment stripped of actor identity, assert a nonzero exit, unchanged issue body and no binding, timing or occupancy write. Observe the baseline location append. Repeat with the genuine actor and foreign or multiple fixture owners. Include an existing matching location.
- [ ] Exercise malformed, default and unknown IDs at the actor decision. Reuse native identity corroboration for Codex. Preserve the supported Claude, Grok and non-native orchestration routes under their actual contracts. Verify denied actors cannot adopt a trusted actor merely by supplying a syntactically valid correlation key. A foreign occupancy check must be read-only.
- [ ] Implement `readLocationMutationAuthority(context)` to return issue, repo, actor, physical root and branch, owner and live state plus the observed body version, digest and relevant markers. Honor existing lifecycle ownership rules, including unassigned early stages and marker-free first bind. Refuse unavailable required observations. Call this decision at entry before returning a matching location or proposing a write. Preserve the existing relocation prompt and established refusal exit codes.
- [ ] Run the focused integration suite, then the relocation and verb-preflight unit suites. Commit the first green checkpoint with an issue-prefixed subject.

## Task 2. Revalidate when recording a location (A2)

**Files.** Integrate the authority reader in `scripts/task-tracker/lib/worktree-relocation-guard.mjs` and narrowly adjust dispatch if needed. Extend the same integration suite and update the historical empty-SID expectation in `scripts/tests/unit/task-tracker/lib/worktree-relocation-guard.test.mjs`.

- [ ] Observe a failing race between entry and the locked writer. Change owner, state, local authority or authoritative location while waiting. In a separate case cause a versioned write conflict, then change authority on the fresh base. Count provider write attempts and verify no additional write after refusal.
- [ ] Serialize the location mutation with the ordinary shared per-issue lock. Implement `assertLocationMutationAuthority(expected, fresh)`. Re-read actor, target, physical checkout, owner, state, occupancy and body authority at each `validateFreshBaseAsync` callback. Check that each proposed result still expresses the authorized append against that base. The callback receives the version-stripped body. Treat body/version changes as a reason to revalidate. Preserve unrelated concurrent text while rejecting stale location or state decisions.
- [ ] Run valid first bind and confirmed relocation with the original CLI and ordinary writers in the disposable fixture. Check the append count, SID, physical location, prior history and corresponding local records. Observe failures and subsequent passes for each new behavior.
- [ ] Run both issue verifiers and applicable Develop checks. Commit the passing A2 change. Review the exact local candidate independently and address substantive findings with failing-first tests. Record applicable checks on the final SHA and hand off any cloud or delivery gates held by the local-only scope.

## Review focus

Test a matching location with an invalid actor, a first bind without a recorded state marker, a same-session branch change, a disjoint retry whose owner changed, and a dropped provider read. A genuine independent actor test requires an actual independent provider session. Keep unavailable native proof visible in the report.

## Verification commands

```sh
node --test scripts/tests/integration/task-tracker/location-mutation-authority.test.mjs
node --test scripts/tests/unit/task-tracker/lib/worktree-relocation-guard.test.mjs scripts/tests/unit/task-tracker/lib/verb-preflight.test.mjs
```
