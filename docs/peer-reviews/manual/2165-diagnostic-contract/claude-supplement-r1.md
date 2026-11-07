# Manual supplemental SAR: #2165 diagnostic contract revision (option A)

**Label:** This is a manual supplemental review in the same Claude session that served as reviewer for the original XPR. It is not a new XPR event and does not reopen `review-a8582e8562b81f1bf8569c28c6e579a2`, which stays terminal-accepted as history. No protocol, private, artifact or source state was modified. Only Read was used (Grep was unavailable this turn). I accept the authority to perform this review as a labeled manual supplemental SAR.

**Reviewer:** claude-opus-5-5, the same session that produced XPR reviewer responses 1–4.

## Artifacts as read

| Artifact | Hash |
|---|---|
| `docs/superpowers/specs/2026-11-05-2165-diagnostic-contract-revision-design.md` | Hash verification unavailable with Read only. Reviewed against the author-supplied SHA256 snapshot `6dafbf1bfe3b9d78bd788d0d1e10d5bcf628f540c75c3b3c0394842c6c2f869b`. |
| `docs/superpowers/specs/2026-11-05-2165-close-cumulative-proof-design.md` | Hash verification unavailable; read in this session's earlier turns. Accepted XPR blob `c1560f38…` (digest `sha256:2b320807…`). |
| `docs/superpowers/plans/2026-11-05-2165-close-cumulative-proof.md` | Hash verification unavailable; read in this session's earlier turns. Accepted XPR blob `b13afd97…` (digest `sha256:4a0491af…`). |
| `.scratch/plan/2165-retained-2161-trace.md` | Hash verification unavailable. |
| `scripts/task-tracker/lib/action-decision/close.mjs` | Lines 1–658 and 660–1209 read. |
| `scripts/task-tracker/lib/project-dir.mjs` | Read in full. |

I did not read the original sibling #2161 checkout or its binding file.

## Summary

**What the amendment gets right**

- **Evidence classes.** It keeps three classes separate: the live-host refusal, the optional lower-level content replay, and the mandatory provider-isolated public replay plus the lifecycle fixture.
- **Live refusal.** It retains the observed `BoundWorktreeMissingError` (`project-dir.mjs:80`, reached from `close.mjs:140-144` via `readWorktree`) as immutable evidence.
- **No retries.** It forbids retrying the sibling read through any carrier.
- **#2161 untouched.** It keeps #2161 un-started and un-mutated.
- **Accepted requirements kept.** All of these remain mandatory: Task 1 Steps 1–4a, receipt-identity split, stale-receipt refusal, dirty/source/generation negatives, the integration trail, both public Explain forms, unchanged-state snapshots, and the deferred genuine #2161 activation.
- **Lower-level replay limits.** The replay is explicitly incapable of substituting for option A, native authority, a public regression RED or AC satisfaction ("Lower-level proof alone never satisfies an AC or authorizes shipping"; "the optional lower-level trace cannot replace this gate").
- **No new surface.** It adds no public command, product API or alternate authority route.

**Why the root cause is right.** Reaching the comparator through the default path requires a successful `worktree` observation. The SHA check `SHA.test(head ?? '')` at `close.mjs:885` uses `worktree?.headSha` (line 722). Guards run only behind that check, and the comparator is reached only through `runReadOnlyGuards` → `verifyDeliveryAuthority` (`close.mjs:483`). The live failure stopped exactly there.

**Why I am requesting revision.** The mandatory public replay, which is the gate itself, is not yet specified tightly enough for a builder to execute safely without settling authority questions on their own:

- which pre-comparator reads it must answer, and where those answers come from;
- how the fixture Start obtains a session identity and binding without touching host state or using a root override;
- which operator, ref and artifact state the replay runs under.

## Required findings

### R1. The public replay's pre-comparator authority reads are not enumerated or sourced, and the capture lacks one of them

**Locations:**

- Amendment §"Mandatory public-entry qualification", paragraph 1.
- Trace capture: "It contains no … read-only guard authority observation."
- `close.mjs:1119-1131`: the default `runGuards` observes `evidence:${issue}:4` first.
- `close.mjs:331-377`: `readGuardAuthority`.
- `close.mjs:715-720` and `732-747`: earlier observations, plus the board and last-known-state `review` check.

**Problem.** In the default path, `production.runReadOnlyGuards` (and therefore `verifyDeliveryAuthority` and the comparator) runs only after `readGuardAuthority` succeeds. That function performs these reads before any comparator entry:

- the paginated `issues/2161/comments`;
- `cat-file -e` plus `show --name-only` on every commit-trail SHA;
- `observeDependencyReadiness`, which needs native dependency and board reads (it must not return `unknown`);
- `git status`;
- a parent board read when lineage has a parent.

The live capture never reached evidence:4, so the retained bytes do not contain those responses. The amendment says to replay "the complete retained PR2164/intent/receipt/inventory", but it does not say where the strict provider gets the comment pages, dependency and board answers, or the trail objects. It also does not say whether a value absent from the capture may be fixture-synthetic. The lower-level section forbids "invented comment/dependency/file/approval evidence", but the public-replay section is silent. A builder must then either invent pass-shaped provider answers, which is forbidden, or make an unauthorized extra live read.

**Fix:**

1. Add an explicit read inventory for the default path up to `verifyDeliveryAuthority`: issue-body ×2, project-board, worktree, delivery evidence:1–3, and evidence:4 sub-reads.
2. Map each read to exactly one source:
   - **(a)** byte-retained response from the 30-command capture;
   - **(b)** state produced by a fixture-owned native action (for example Start's body and timing writes), labeled as such;
   - **(c)** a genuine source not yet available.
3. For any class (c) read, either:
   - authorize one bounded, additional read-only live capture of exactly those resources (#2161 comments, dependency/board/parent snapshots), using the same unchanged-state snapshot discipline as Step 0, with that authority stated explicitly; or
   - declare it a prerequisite refusal before product edits.
4. State that the strict provider serves only mapped responses, and that every unmapped request fails closed.
5. Copy every trail SHA object into the fixture from this checkout's object store.

### R2. Fixture Start identity and binding isolation are unspecified, and leakage is only detected, not prevented

**Locations:**

- Amendment §"Mandatory public-entry qualification" ("actual public Start producing its native binding").
- Amendment §"Lower-level diagnostic contract", paragraph 2 (snapshots "to detect accidental host writes").
- `project-dir.mjs:26-43`: the binding is resolved from `currentSessionId()` + `getActiveTask(sid, invokingDir)`, with fallback through `resolveRegisteredWorkspaceForIssue`.
- `project-dir.mjs:54-65`: `resolveRuntimeRootOverride` honors a validated env alias before any binding lookup.
- Accepted plan, Task 1 Step 2 ("remove synthetic root/session aliases for this one path").

**Problem.** `readWorktree` succeeds only if resolution yields the fixture worktree. That can happen two ways: through a real session binding for `currentSessionId()`, or through the runtime-root override alias. The global constraint forbids "identity or root environment overrides". The amendment does not say:

- which SID the fixture Start runs under (the inherited host SID, or the existing test-harness session mechanism);
- that the session, active-task, occupancy and registered-workspace stores resolve inside the fixture common directory *before* Start runs;
- that no runtime-root override env alias may satisfy `readWorktree`.

Shared cross-worktree occupancy is exactly the mechanism that made #2161's generation stale. If a fixture Start under the host SID can write a user-global or host-common occupancy row, it could displace the real #2165 binding. Detecting that afterwards does not undo it.

**Fix:**

1. Name the session-identity mechanism the fixture uses, and reconcile it explicitly with the "no identity override" constraint. For example: the existing harness session mechanism already used by the artifact-lifecycle fixtures, cited by file. Or: inherited host SID only when every store resolves fixture-local.
2. Require a pre-Start containment assertion that fails closed. Every store that Start, `getActiveTask` and `resolveRegisteredWorkspaceForIssue` touch must resolve inside the fixture common or runtime root.
3. Require that `resolveRuntimeRootOverride` returns null in the replay process. Assert that the override env aliases are absent, and log the `readWorktree` resolution path, so `matches: true` comes from the binding, not an alias.
4. Keep the host snapshots as a second layer, not the only protection.

### R3. The replay's operator, ref and artifact state, and its expected pre-comparator outcome, are ambiguous

**Locations:**

- Amendment §"Mandatory public-entry qualification", paragraphs 1–2.
- `close.mjs:732-747`: last-known-state and board `review` check.
- `close.mjs:885-888`: `sourceCommit({artifactSubject, operatorHead})`.
- `close.mjs:244-261`: `resolveTrunkRef` and remote-ref parsing.
- `close.mjs:1057-1087`: exact trunk attribution against `refs/heads/${target}` through a remote.
- Spec "Intent and evidence": the original symptom came from both exact-artifact Explain forms.

**Problem.** The amendment does not fix:

- the fixture operator checkout's HEAD and branch (890 on `codex/2156-draft`?);
- the fixture `origin/<trunk>` remote-tracking ref value (the captured attribution tip?) and the remote name and URL the collector parses;
- whether the fixture issue's last-known-state and board are `review` after Start;
- whether the default `evaluateCloseReadiness` replay passes `artifactSubject` = 890.

It also does not say whether this replay runs immediately after Start with the retained, now operator-stale, receipts, or only after fixture renewal. It requires renewal "through actual native verification", but Test cannot run in Review, so renewal implies the Task 1 demote/integration/Test route. Two failure modes follow:

- If the replay runs before renewal and some lifecycle-evidence check in `readDelivery` (`close.mjs:297-303`, `resolveCloseLifecycleEvidence`) rejects the fixture-root operator context, the replay stops before the comparator and triggers a revision. That outcome is foreseeable and currently unplanned.
- If the replay runs only after renewal, it becomes the same thing as Task 1 Step 4, and the "retained immutable evidence" distinction blurs.

**Fix:**

1. State the replay's fixture state exactly: HEAD and branch, trunk remote, remote-tracking ref equal to the captured tip, and the issue state after Start.
2. State the `artifactSubject` selection: 890, matching the exact-artifact Explain forms that produced the original symptom.
3. State the ordering: replay A runs directly after Start against retained receipts, and renewal belongs to Task 1 Steps 2–4.
4. Predict which pre-comparator reads accept the retained, operator-stale evidence (cite `resolveCloseLifecycleEvidence`'s operator checks). If any is predicted to refuse, decide now whether A requires renewal first. Do not leave that to the builder.

## Optional findings

1. **Wording.** The amendment calls `runReadOnlyGuards` an "existing exported" entry. It is a property returned by the exported `createCloseReadOnlyPorts` (`close.mjs:653`), not a module export; reword it to avoid implying a new export.
2. **Lower-level capture fidelity.** `verifyDeliveryAuthority` derives `receiptGate` from `requireDeliveryReceipt(gateInput)` (`close.mjs:382-386`) and reads `gateInput.pullRequest`, `records.liveIntent` and `lineage`. To support "byte-preserved", require a canonical-JSON round-trip equality check on the captured `gateInput`. Refuse if the capture shows any non-JSON-representable field (Map, undefined, function) at capture time.
3. **Expected post-comparator terminal under empty authority.** In the lower-level path with an empty synthetic authority, a successful content proof leads `runReadOnlyGuards` to dereference `authority.dependency.states` (`close.mjs:491`), which throws. Name that as the expected post-comparator terminal so it is not misread as either a RED or readiness.
4. **Fixture slug safety.** The fixture uses the real slug `kburson/ai-task-manager` and issue 2161, which `close.mjs:785` requires to match the receipt. State that the strict executable `gh` provider is first on PATH, and that a startup self-test proves an unmapped request fails before any network attempt.

## Answers to the required review focus

- **Retained evidence, binding and default-path trace before product edits:** Yes in intent, but not executable as written. See R1 (unsourced pre-comparator reads), R2 (binding mechanism and isolation) and R3 (replay state and order).
- **Fixture-owned labeling and native renewal:** Yes as a principle. Renewal timing relative to replay A is ambiguous (R3).
- **Lower-level replay limits:** Yes. The limits are explicit, and it cannot substitute for option A, authority, the RED or the ACs.
- **Old tests and #2161 activation still mandatory:** Yes. All are retained.
- **Hidden authority or ambiguous interfaces:** Yes:
  - the evidence:4 sources missing from the capture (R1);
  - the session identity and override path (R2);
  - the replay state, artifact selection and renewal order (R3).

## Verdict

**revise.** Three required findings: R1, R2, R3. This evaluates the proposed contract only; no claim is made that any future test passed. On revision, resume this same session with the exact revised artifacts and dispositions.
