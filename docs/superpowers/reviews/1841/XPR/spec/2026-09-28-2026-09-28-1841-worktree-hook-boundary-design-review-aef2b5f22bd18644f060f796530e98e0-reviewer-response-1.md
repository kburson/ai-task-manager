<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-aef2b5f22bd18644f060f796530e98e0"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-28-1841-worktree-hook-boundary-design.md"
artifact_commit: "72563c04c7b0f7d2b2e11ec26627be8c36e22628"
artifact_blob: "3c4be2fe41c54b883444830db9e53d6ed79af8fc"
artifact_digest: "sha256:fb1b7559711ef0fc7e0affec55aea80c755d56b0f7cb752bb88ef41c9d0f1276"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:288f3207d915df07056a572513bf9c52b45927c09ec4b0d8ff9efd0823d4b36e"
  identity_source: "declared"
started_at: "2026-09-28T19:35:31.484Z"
submitted_at: "2026-09-28T19:40:47.933Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Cross-provider review of `docs/superpowers/specs/2026-09-28-1841-worktree-hook-boundary-design.md` at artifact digest `sha256:fb1b7559711ef0fc7e0affec55aea80c755d56b0f7cb752bb88ef41c9d0f1276`, commit `72563c04c7b0f7d2b2e11ec26627be8c36e22628`. Read-only method: the full specification, the three SAR records under `docs/superpowers/reviews/1841/SAR/`, and the cited implementation sources — `scripts/task-tracker/bash-guard.mjs`, `scripts/task-tracker/activity-guard.mjs`, `scripts/task-tracker/activity-policy.mjs`, `scripts/task-tracker/lib/apply-patch-targets.mjs`, `scripts/task-tracker/lib/worktree-binding-guard.mjs`, `.codex/skills/peer-review/SKILL.md`, and the working-tree `.claude/settings.json` / `.codex/hooks.json`. No Git commands were run and no file other than this response was modified.

The central decision is sound and I do not contest it. A checkout boundary plus operation-level governance is the right replacement for a stage-indexed tool-permission matrix, the document is honest about what a command-string regex cannot enforce, and the refusal to claim confinement AITM does not have is the strongest part of the design. The three SAR rounds resolved the host-authorized Git metadata path, the peer-review ownership dependency, and the local-work versus governed-mutation split; none of the findings below duplicate SAR1-01, SAR1-02, or SAR1-03.

What this review adds is verification of the specification's factual claims against the code it cites. Three of the document's load-bearing evidence statements do not survive that check as written, and two design paragraphs are under-specified in ways that will produce a wrong implementation rather than a debatable one. Evidence item 2 (`.scratch` classified under Bash while file tools exempt it) and evidence item 3 (`extractApplyPatchText` key set) both verified exactly as the spec states, as did the peer-review seal described in §4 and every provenance commit date and task ID I sampled.

Verification performed, with result:

| Spec claim | Source checked | Result |
| --- | --- | --- |
| `.scratch` Bash writes are classified while file tools exempt them | `activity-guard.mjs:167-177` (carve-out is inside the Edit/Write/NotebookEdit/apply_patch branch only), `activity-policy.mjs:279-322`, `STATE_MATRIX.backlog = ['WRITE_ISSUE','READ_*']` at `activity-policy.mjs:101` | Confirmed exactly as written |
| `extractApplyPatchText` accepts only `patch`, `input`, `text` | `lib/apply-patch-targets.mjs:30` | Confirmed |
| `bash-guard.mjs` does not pass payload `session_id` | `bash-guard.mjs:146` calls `resolveCurrentSessionWorktreeBinding({ invokingDir })` with no `deps.sessionId` | Confirmed, but see R1-F002 |
| Fleet search selects the newest binding | `lib/worktree-binding-guard.mjs:156-163` seeds candidates from the fleet registry; line 193 keeps the highest timestamp | Confirmed |
| "quoted prose is refused" | `bash-guard.mjs` `stripQuotedRegions` (applied at the `scanned` assignment before all path extraction) and `activity-policy.mjs:234-257` | **Not confirmed** — see R1-F001 |
| Installed peer-review skill seals reviewer Git and writes worktree-wide | `.codex/skills/peer-review/SKILL.md:44-61` | Confirmed |
| Provenance table dates and task IDs | `2ecf0db08` 2026-05-08, `664e3fa3c` 2026-05-21 (#199), `65fb2e3c8` 2026-08-09 (#1166), `cabc09855` 2026-08-09 (#1165), `0ce327a45` 2026-05-11 (#63), `fdacfd9fd` 2026-06-03 (#281), `320b705a3` 2026-05-11 (#65) | Confirmed for the sampled rows |

## Findings

### R1-F001 — P1: The "quoted prose is refused" justification is contradicted by the code it cites

Line 33, the `bash-guard.mjs` provenance row, gives as its reason to change: "Shell text cannot establish file effects: quoted prose is refused and wrappers bypass checks."

The second clause is correct and is the real argument. The first clause is not correct as stated. Both scanners already strip quoted regions specifically to prevent that failure. `bash-guard.mjs` builds `scanned` by replacing every single- and double-quoted region with same-length spaces before any of `redirectRe`, `teeRe`, `writeCommandRe`, or `absPathRe` runs, and its inline comment names the exact scenario ("a `/task` mentioned inside a `/task ensureChecked` label"). `activity-policy.mjs:234-257` carries an independent copy of the same function with the same rationale. A path or a slash inside quotes is therefore invisible to both path scanners. An implementer or a later reviewer who tries to reproduce "quoted prose is refused" will find it does not reproduce, and the credibility of the surrounding evidence section drops with it.

There is a genuine residual defect in the same area, and it is narrower and more precise than the claim made. Both strippers are naive quote scanners: no backslash-escape handling, no `$'...'` handling, and no recovery from an unbalanced quote. An apostrophe inside a double-quoted argument, or any unbalanced quote character, desynchronises the mask for the remainder of the command string, so regions the author intended as prose are scanned as code and regions that are code are masked as prose. That is a real and demonstrable false-refusal mechanism, and it also demonstrates the deeper point the spec is making: correctness here requires a shell parser, not a mask.

Impact: an inaccurate premise in the evidence that justifies removing a guard. The conclusion survives on the wrapper-bypass argument alone, so this is a correction, not a reversal.

### R1-F002 — P1: Evidence item 1 fuses two independent defects, and §1's remedy addresses the weaker one explicitly while leaving the stronger one implicit

Line 21 states: "`resolveCurrentSessionWorktreeBinding` scans candidate fleet worktrees for a session id and selects the newest binding. `bash-guard.mjs` does not pass the hook payload's `session_id`."

Both sentences are individually true, but they describe two defects with different severities and different fixes, and the specification treats them as one.

The session-id omission is conditional. `resolveCurrentSessionWorktreeBinding` resolves `deps.sessionId ?? currentSessionId()` (`lib/worktree-binding-guard.mjs:141`), and `currentSessionId()` (`word-counter.mjs:109-115`) delegates to the shared resolver over `process.env` and the transcript directory. The omission only matters when the environment-derived session id diverges from the payload's — real, but not self-evidently the cause of the observed refusal.

The selection defect is unconditional. Lines 148-163 seed the candidate set from the invoking directory, two environment variables, *and* every `worktreePath` in the fleet registry; the loop at 166-194 then keeps whichever surviving record has the highest `worktreeResolvedAt`/`boundAt` timestamp. With a perfectly correct session id, a newer record belonging to a foreign checkout still wins. That is the mechanism that refused the fresh #1841 checkout in favour of the #1837 record, and it is the defect the design must eliminate.

§1 does say "Do not search the fleet for a newer binding," so the intent is present. What is missing is the explicit statement that these are two separable fixes with two separable regression tests — passing the payload session id alone would leave the refusal intact, and a test that only asserts session-id propagation would be false green.

§1 also leaves a concrete question unanswered. The candidate set today includes `AI_TASK_MANAGER_PROJECT_DIR` and `TASK_TRACKER_PROJECT_DIR` (lines 150-153). "Read only that root's active record for the exact session" does not say whether those environment overrides are dropped, retained as a deliberate operator escape hatch, or retained only when they resolve to the invoking root. Since an environment variable is exactly the kind of ambient state that reintroduces cross-checkout selection through the back door, the design must answer this rather than leave it to the implementer.

### R1-F003 — P1: The linked-worktree Git-metadata rule inverts the specification's own unverified-capability principle

§2 establishes a clear and correct principle for the filesystem boundary: where AITM cannot verify host confinement, it reports "filesystem boundary not verified" and does not claim a boundary it lacks. Unverified capability is reported, not enforced. Line 99 and §Scope and ownership both state this.

Line 101 applies the opposite rule to Git metadata. It requires "an explicit host VCS capability or per-operation host authorization for ordinary `git add` and `git commit`," and closes: "If the host cannot authorize Git metadata writes, report that limitation and the host approval path instead of promising a working local commit."

On a host that expresses no such capability, the design therefore reports that commit does not work — even where it works today. Nothing in the current Bash guard touches Git metadata: `WRITE_ALLOWED` is `projectRoot + '/'` and the write-target extraction only ever sees literal path arguments in the command text, which `git add` and `git commit` do not carry for the per-worktree Git directory or the common directory. Today those writes are governed solely by the host, and on a permissive host they succeed.

So the same input — a host that cannot express a capability — yields "report and permit" for the sandbox boundary and "report and do not promise" for Git metadata. Either the asymmetry is intentional and needs its justification stated, or the Git-metadata paragraph should adopt the same rule: report the unverified capability, do not convert unverified into an AITM-side refusal or an AITM-side warning that a working operation is broken.

This is the one place in the document where the design could leave an operator worse off than the status quo it replaces, which is why I rate it P1 despite being a single paragraph.

### R1-F004 — P2: The `apply_patch` remedy is under-specified against the existing parser contract it must amend

Evidence item 3 is accurate. The remedy at §2 — "accept actual `tool_input.command` payload" — does not say enough to implement correctly, because `extractApplyPatchText` is not a simple key lookup.

Two existing behaviours constrain any new key. First, the function collects *every* supplied key from `['patch','input','text']`, rejects a non-string among them, and throws `conflicting patch payload fields` when the surviving values disagree (`lib/apply-patch-targets.mjs:30-42`). Adding `command` requires stating its precedence and whether it participates in the conflict rule; if `command` carries the argv form while `patch` carries the text, a naive addition converts today's silent miss into a hard `MutationParseError` on a well-formed in-root patch. Second, the spec does not state the expected shape of `command`. If Codex supplies an argv array rather than a string, the current type check at line 33 rejects it before any of this matters.

Relatedly, `safePatchPath` (lines 9-20) already rejects any target containing a backslash and any path with a `.` or `..` segment, so a `./`-prefixed or absolute target throws before containment is ever evaluated. §2's "reject ambiguous or escaping targets atomically" reads as new behaviour, but atomic rejection is already the status quo. State whether that pre-existing strictness is preserved as-is, since a containment check written against absolute resolved paths would otherwise be dead code behind it.

### R1-F005 — P2: Nothing is assigned ownership of commit attribution after the Bash commit lock is removed

The provenance row at line 41 moves the local-edit and commit assignee locks to "governed remote mutation and evidence attribution." §3 restates it: "Exact issue/assignee checks belong to remote mutations and evidence attribution, not every local edit."

`bash-guard.mjs` currently enforces this at commit time. `checkCommitAssigneeLock` inspects `git commit` invocations, extracts the `[#N]` attribution token, and fails closed unless the issue has exactly one owner matching the authenticated clone identity; the guard also refuses `eval` because a deferred shell can hide the commit and its attribution from inspection. A commit is a purely local operation. It is not a remote mutation, and it is not a state transition, so neither destination named in the spec receives it.

The migration sequence does not close the gap either: step 3 moves "remote-command checks" out of the Bash path, step 4 validates "governed remote mutations and state-transition evidence." An attributed local commit is neither. The acceptance mapping has no row for commit attribution or ownership at all.

Given that the repository's commit-attribution contract is load-bearing for `commit-trace`, `review-preflight`, and `close`, the design should name the mechanism that enforces single-owner attribution after the Bash lock is gone — whether that is a lint gate on the subject line, a check inside `commit-trace`, a deliberate acceptance that attribution becomes advisory until a transition validates it, or something else — and add the corresponding acceptance-mapping row.

### R1-F006 — P3: "The seven new #1841 criteria" is unenumerated and does not reconcile with the six-row acceptance mapping

Line 142 says "The seven new #1841 criteria currently cite a focused command that must gain the new cases during implementation." The criteria are not enumerated anywhere in the document, and the acceptance mapping has six rows. A reader cannot determine which mechanism covers which criterion, nor which criterion has no row. The mapping table is the document's acceptance contract, so this is the one place completeness must be demonstrable rather than asserted. Enumerate the seven, or cite the exact issue-comment anchor that does, and make the mapping's row-to-criterion correspondence explicit.

### R1-F007 — P3: Migration step 5 has no recorded restore target, and the present-tense description of the current worktree is imprecise

Line 123 describes "temporary, uncommitted removals of three PreToolUse registrations," and step 5 ends with "restore this worktree's temporary uncommitted hook configuration to the intended generated result."

The intended generated result is not recorded anywhere in the specification, so step 5 is not verifiable from the document. That matters more than usual here, because the two provider configurations are currently asymmetric in a way the "three registrations" phrasing does not convey: the working-tree `.claude/settings.json` retains a `PreToolUse` block wiring `agent-guard.mjs`, while `.codex/hooks.json` has no `PreToolUse` section whatsoever — its only remaining hooks are `hook-handler.mjs`, `commit-trail-handler.mjs`, `memory-index.mjs`, `on-stop.mjs`, `on-user-prompt.mjs`, `stop-audit-pause-resume.mjs`, and `codex-prompt-timestamp.mjs`. Whatever Codex-side PreToolUse coverage existed at the baseline is entirely absent, including any hook the spec places outside this change's scope.

Separately, line 17's present tense ("The current Codex and Claude installations wire `bash-guard.mjs`, `activity-guard.mjs`, and `source-edit-gate.mjs` into PreToolUse") is true of the intended installed state but not of the worktree the reviewer is reading. Line 123 discloses this, 106 lines later. Scoping line 17 to the installed baseline would remove an apparent contradiction for anyone who checks the files.

Recording the intended generated hook set per provider — as a short table or an explicit pointer to the installer template that produces it — makes step 5 checkable and gives the installer-durability acceptance row something concrete to assert against.

## Required changes

1. **R1-F001** — Correct line 33. Remove "quoted prose is refused" or replace it with the demonstrable failure mode: both `bash-guard.mjs` and `activity-policy.mjs:234-257` already mask quoted regions, and the real defect is that the masks are naive scanners that desynchronise on an escaped or unbalanced quote. Keep the wrapper-bypass argument as the primary justification; it is sufficient on its own.
2. **R1-F002** — Split evidence item 1 into its two distinct defects: (a) `bash-guard.mjs:146` omits the payload `session_id`, and (b) `resolveCurrentSessionWorktreeBinding` seeds candidates fleet-wide and selects by newest timestamp (`lib/worktree-binding-guard.mjs:156-163`, `:193`). State that (b) alone explains the observed #1837 refusal and that fixing (a) alone leaves it intact, so migration step 1 carries a separate regression fixture for each. Additionally, state in §1 what becomes of the `AI_TASK_MANAGER_PROJECT_DIR` and `TASK_TRACKER_PROJECT_DIR` candidate seeds at lines 150-153.
3. **R1-F003** — Reconcile line 101 with §2's unverified-capability principle. Either state explicitly why Git metadata warrants the opposite treatment from the filesystem boundary, or align it so an unverifiable host capability is reported without AITM refusing, or declaring broken, a `git add` / `git commit` that succeeds today under host permissions alone.
4. **R1-F004** — Specify the `apply_patch` payload contract: the accepted shapes of `tool_input.command` (string and/or argv array), its precedence relative to `patch`/`input`/`text`, and whether it participates in the existing `conflicting patch payload fields` rule at `lib/apply-patch-targets.mjs:40-42`. State whether `safePatchPath`'s existing rejection of backslashes and `.`/`..` segments is preserved, since it fires before any containment check.
5. **R1-F005** — Name the mechanism that enforces single-owner commit attribution once `checkCommitAssigneeLock` leaves the Bash path, and add the corresponding row to the acceptance mapping. A local commit is neither a remote mutation nor a state transition, so neither of the two destinations currently named in §3 receives it.

## Optional suggestions

1. **R1-F006** — Enumerate the seven new #1841 criteria in the document, or cite the exact issue-comment anchor, and make the acceptance mapping's criterion-to-row correspondence explicit so the six-row table is demonstrably complete.
2. **R1-F007** — Record the intended generated PreToolUse set per provider so migration step 5's restore target is verifiable, and note the current Codex/Claude asymmetry (`.codex/hooks.json` has no `PreToolUse` section; `.claude/settings.json` retains `agent-guard.mjs`). Scope line 17's present tense to the installed baseline so it does not read as contradicting line 123.
3. Consider naming the duplicated `stripQuotedRegions` implementations (`bash-guard.mjs` and `activity-policy.mjs:234`) as evidence for the design's central claim. Two independently maintained copies of the same heuristic, each with a comment explaining a different false positive it was added to suppress, is the strongest available argument that command-string scanning is the wrong layer — stronger than the assertion currently at line 138.
4. §2 states `.scratch/**` needs no special gate because it is inside the checkout, which is right. It is worth adding that this deletes a carve-out rather than adding one: `activity-guard.mjs:167-177` currently exempts `.scratch` and `.tmp` only within the file-tool branch, so removing the Bash classifier makes the exemption unnecessary rather than merely broader. That framing makes the dead-code removal in migration step 3 unambiguous.

## Decision

revisions-requested
