<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-3cf82db24943e1c081143f5497f81378"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-11-06-2071-public-activation-integration.md"
artifact_commit: "3ac32b471cf600bb4150e7a9c05cd703cc34d7b5"
artifact_blob: "06fe72af7fc3c8befd411a205a56c40720d50274"
artifact_digest: "sha256:9c8833850257118e4950cba64877b1bd89d346925c321ae80784d19e4606f81d"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:977913bd10ef40ca0a51ac9b802d94daa6446ab6a17ce166fcbc3e042ef8cb82"
  identity_source: "runtime"
started_at: "2026-11-06T12:08:05.478Z"
submitted_at: "2026-11-06T12:41:11.691Z"
finding_ids: ["R3-F001","R3-F002","R3-F003","R3-F004","R3-F005"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

This round reviews revised artifact blob `06fe72af7fc3c8befd411a205a56c40720d50274` (commit `3ac32b47`) against author response 2. Claims about K were checked in the current worktree without Git; O/H claims remain unverified by this reviewer.

Disposition of R2 findings:

- **R2-F001: resolved.** Plan line 199 now uses `tmpAitmDir(projectRoot)/native-operation-evidence`, with `projectRoot` from `resolveRuntimeRoot({cwd,env:{}})`, and drops `assertRuntimeReadable`. That matches what story-cache already does:
  - `store.mjs:57–61` checks `resolveRuntimeRoot({cwd: projectRoot, env: {}}).projectRoot`;
  - `writer-registry.mjs:90,384` and `timing-stage.mjs:38` use the same call;
  - `paths.mjs:139–147` puts `tmpAitmDir` at `<projectRoot>/.tmp/aitm`, where the verifier cache already lives.

  The family is registered LOCAL in FAMILY_SCOPES and inventory-only. Relocation is explicitly blocked, and the fixture is limited to production-created state.
- **R2-F002: resolved.** Plan lines 225–235 add reference-closure GC under claim and lock, with dry-run and recheck. Age, SHA and Closed are explicitly insufficient. Retention and cleanup-base-aware gain native-retention input. Handoff v2 binds receipt bytes, and v1 refuses when receipts exist.
- **R2-F003: partially resolved.** The design now denies Full-Auto conflict discard and overwrite, which is correct. But the chosen human-direction mechanism (line 332) is TTY-only and overstates its assurance. See R3-F001.
- **R2-F004: resolved.** The blanket stale-after-commit rule is removed. Rebind defers to the actual K consumer decision (line 207), and the mandatory case is restated (line 215).
- **R2-F005, R2-F006: resolved.** The Task to C-unit map, the C9a–c pre-split and the 39–52 h total are in place.

Coordinator title finding verified in K:

- `verbs/kind.mjs:87` and `scripts/gh/lib/epic-retitle.mjs:43` pass `forceEpic: true`. The second is reached from `project-tether.mjs:161` and `ensure-wave-parent.mjs:325`.
- That reaches `epic-metadata.mjs:41,51` `ensureEpicPrefix`.
- `decomposition-wbs-coverage.mjs:9,144` compares the trimmed literal child title with the task title.

The plan now records this correctly as an unresolved Phase6 route blocker outside this design (line 96).

One required change remains, and it is small in scope.

## Findings

### R3-F001 — Conflict-resolution human direction repeats K's #979 TTY defect class and overstates its assurance

Severity: major.

Plan line 332 says the confirmation "asks the human in an actual interactive terminal", and that no CLI yes flag, environment mode, supplied approval boolean or Full-Auto context counts. It also says "A headless/Full-Auto attempt returns STORY_CONFLICT_HUMAN_DIRECTION_REQUIRED". K already learned that TTY presence is the wrong human signal:

- `verbs/approve.mjs:294–307` `detectFullAuto` treats `process.stdin.isTTY === false` as a Full-Auto signal.
- `approve.mjs:493–500` documents #979: env and TTY-only detection "misclassifies a genuinely human-approved review". `--human` (chat-relayed approval) and the published UI checkbox were added as the independent human signals.
- `approve.mjs:252–254` `defaultPromptDrivers` silently returns `[]` without a TTY, so K never makes a TTY a hard requirement for human action.

Failure scenarios:

- **(a) Agent-driven sessions dead-end.** In the supported Claude Code and Remote Control workflow, every command runs through the agent's non-TTY shell, including when the human drives from a phone. A human edit in the GitHub UI is exactly the trigger the plan names. It yields a retained conflict that the human cannot resolve by telling the agent, and the issue stays stuck until the human reaches a local terminal. K has no such dead end, because it auto-rebases (spec S line 34).
- **(b) The claimed boundary can be bypassed.** "No … Full-Auto context counts" is not enforceable by an isTTY check. An agent with shell access can allocate a pseudo-terminal (for example with a `script` wrapper) and type the digest. The plan's trust-boundary paragraph (line 213) honestly limits native evidence claims, but line 332 presents the TTY prompt as a hard boundary against Full-Auto. Tests written to that sentence will certify a guarantee the implementation does not provide.

### R3-F002 — Handoff v2 with receipts can exceed the retained 4 MiB bound

Severity: optional.

Line 231 keeps the 4 MiB handoff manifest bound while adding every referenced receipt's bytes. A long Develop visit with many stamps and renewals, plus the transitive `previousReceiptRef` chain, could exceed it. Per the plan, handoff then refuses rather than dropping receipts, which is safe. It would help to state that this outcome is the intended behavior, and to give the remedy: publish first, then hand off with a smaller closure.

### R3-F003 — Name the escalation route if no native decomposition route exists

Severity: optional.

Line 96 establishes, from verified K behavior, that kind conversion and child tethering force the Epic title, while outer WBS compares titles literally. Line 98 holds Phase6 until a route is found and proposes no waiver. If the separate route plan proves no compliant route exists, #2071 can never reach Phase6 under the current rules. Name the escalation explicitly, for example a Root decision on a separately reviewed framework story for sanctioned outer-WBS title reconciliation, so the hold has a defined exit.

## Required changes

1. R3-F001: Replace the TTY-only confirmation with human direction at the same assurance level K already accepts for Review approval. One option: a chat-relayed `--human`-equivalent conflict-resolution issuance plus a mandatory audit comment, mirroring `approve --human` (#979), with TTY confirmation as one accepted channel rather than the only one. Then:
   - keep the Full-Auto prohibition on discarding or overwriting externally observed changes, independent of the channel;
   - reword line 332 (and the matching integration assertion on line 336) to state the real assurance: it records the native confirmation event, it is not proof against an agent that deliberately simulates a terminal or fabricates the flag, and the project's never-fabricate rule governs, as the line 213 trust boundary already says for evidence;
   - if a stronger boundary is intended, name the enforcing mechanism, for example a bash-guard refusal of pty-wrapped `issue-body --conflict-resolution`, and test it.

   Either way, add an integration case: a human-directed resolution from a non-TTY agent session publishes, and a Full-Auto-context discard of a UI tick refuses.

## Optional suggestions

### R3-F004 — State the handoff overflow behavior

See R3-F002. One sentence: receipts exceeding the 4 MiB handoff bound cause a typed refusal, and the remedy is to publish first and hand off a smaller closure.

### R3-F005 — Name the Root escalation for a no-route outcome

See R3-F003. Name the Root escalation path for a "no native route" outcome of the separate decomposition/route plan.

## Decision

revisions-requested
