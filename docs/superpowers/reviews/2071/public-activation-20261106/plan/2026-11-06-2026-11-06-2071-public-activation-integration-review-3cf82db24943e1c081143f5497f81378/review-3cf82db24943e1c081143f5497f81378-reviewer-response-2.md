<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-3cf82db24943e1c081143f5497f81378"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-11-06-2071-public-activation-integration.md"
artifact_commit: "6f3b945b7c4bf171d471fe354d631d5f11cf7ed3"
artifact_blob: "284824831887a3df1ca9698c7797bf8a29d7e617"
artifact_digest: "sha256:6873dcf3d9fa24517db79e9a2aa5e23be13f58ee0a5ce8fd26bebf5de09bc6ce"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:977913bd10ef40ca0a51ac9b802d94daa6446ab6a17ce166fcbc3e042ef8cb82"
  identity_source: "runtime"
started_at: "2026-11-06T12:08:05.478Z"
submitted_at: "2026-11-06T12:30:20.672Z"
finding_ids: ["R2-F001","R2-F002","R2-F003","R2-F004","R2-F005","R2-F006"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

This round reviews revised artifact blob `284824831887a3df1ca9698c7797bf8a29d7e617` (commit `6f3b945b`) against author response 1. Claims about K were checked against the current worktree sources; Git was not used. O/H claims remain unverified by this reviewer, including the O transition-journal three-way package at O lines 571–586 and 740–756.

Disposition of R1 findings:

- **R1-F001 and R1-F002: design accepted, but not functional as specified.** The new durable native issuance, the same-issuer approval rebind and the four mandatory two-process integration cases close the livelock correctly. But R2-F001 shows the chosen persistence root is inactive in K production, so the fix cannot work as written.
- **R1-F003: resolved.** Working-chain derivation, the replay no-op, zero-provider staging, bounded capsule admission and the demote consumer are all now specified (plan lines 263, 272 and 441).
- **R1-F004: mostly resolved.** The conflict path now has a reconciliation contract and an integration case. R2-F003 is the remaining gap: human direction of the merge.
- **R1-F005, R1-F006, R1-F008, R1-F010: resolved.**
- **R1-F007, R1-F009: resolved.** The estimate is 33–44 h across C1–C11, and Phase6 is explicitly blocked on decomposition.

New K claims verified:

- `decomposition-policy.mjs:17,19`: splitEstimateHours=24 and splitTaskCount=4.
- `decomposition-authority.mjs:132–149`: for an epic, the Decomposition-plan path is selected with `key:null`, while the commit comes from `Source-plan-commit ?? Plan-commit`. That confirms the dual-lineage trap.
- `plan-approve-current-scope.mjs:94–110`: current-scope approval refuses when epic children exist.
- `runtime-storage.mjs` exports `resolveRuntimeRoot` (line 172), `assertRuntimeReadable` (line 309) and `sharedRoot` (line 243).

The remaining blocker is in the storage root of the R1 fix itself.

## Findings

### R2-F001 — Native issuance store depends on runtime storage that no production command activates

Severity: blocking.

Plan line 197 places `native-operation-evidence/<identityHash>/<receiptDigest>.json` under `resolveRuntimeRoot`/`assertRuntimeReadable` and their `sharedRoot`. It says this needs "no new root, setup, key, DB engine or runtime repair". Line 430 lists runtime-storage among leaves that "remain K". In K this layer is not active:

- `runtime-storage.mjs:309–318`: `assertRuntimeReadable` throws `RUNTIME_MIGRATION_REQUIRED` ("Explicit runtime migration or initialization required") whenever the local `control.json` is absent. It also requires a matching shared control and a migration manifest (lines 319–337).
- Repository-wide, `assertRuntimeReadable(` has no caller outside its definition.
- `sharedRoot` and `runtimeStoragePaths(` appear only in runtime-storage, the runtime-migration-* modules and test helpers.
- `runtime-migration.mjs` is imported only by tests (`package-boundary.test.mjs`, `runtime-migration*.test.mjs`). No CLI or verb ever creates the control.
- Existing native evidence and the story cache live elsewhere: the verifier cache is at `<projectRoot>/.tmp/aitm/cache` (`paths.mjs:139–147`), and the story store is under the project's private `.tmp` tree (`story-cache/store.mjs:45,94`).

Failure scenario: in any normally installed project, the first `ac-stamp`, `plan-approve` or `approve` hits `assertRuntimeReadable` and gets `RUNTIME_MIGRATION_REQUIRED`. Plan line 205 says "Receipt persistence failure means no staged success", so every privileged operation refuses, and the R1-F001/R1-F002 fix is unusable. The Task 2 integration fixture would pass only if it initializes runtime control, which production never does. That would hide the defect, as the R1 cache-eligible verifier did.

The storage scope is also inconsistent:

- `sharedRoot` sits under `mainRoot`, shared across worktrees, while issuer and claim are worktree-bound.
- `runtime-migration-plan.mjs:27–44` FAMILY_SCOPES registers no family for the new store, so migration inventory and cleanup semantics for it are undefined.

### R2-F002 — Immutable issuance receipts have no retention or cleanup contract

Severity: major.

Line 203 says receipts "are not pruned on a new SHA". Every stamp and approval writes a new immutable file (line 199 retains each run). No section defines when a receipt may be removed. Options include: once no retained generation, unpublished operation or publication evidence references it; at issue close; or under worktree cleanup and handoff.

The `retention.mjs` row (line 345) protects unpublished generations only. The census row for `cleanup-base-aware`/`runtime-migration-*` (line 500) does not mention the new store. Without a rule, the store grows without bound per issue and per run. Cleanup implementers will either never delete, or delete receipts still referenced by a pending generation, which breaks rebind with renewal-required.

### R2-F003 — Conflict resolution has no native human-direction admission

Severity: major.

Spec S line 160 requires "Discuss the diff with the user before merging … User-directed merge creates explicitly reviewed working content". Plan lines 312–321 make `issue-body --conflict-resolution <file>` the sole route and call the file "user-reviewed input". But nothing admits human direction natively: the verb is agent-invocable, and the agent can write the file.

The dispositions include `discard-approved`, and `resourceValues` can replace the conflicted current value. Concrete failure: a human ticks "Passed final human review" or edits the body in the GitHub UI, which causes the conflict. A Full-Auto agent then authors a resolution whose `resourceValues` drop that edit, and the reconciliation publishes over a human's change. That violates the spec and the project's never-demote-human-sign-off rule. The plan defines issuance evidence for approvals, but not for the merge decision that can overwrite them.

### R2-F004 — The intervening-commit staleness rule is not tied to an existing K validator

Severity: minor.

Line 203 and the mandatory integration case on line 211 assert that an intervening source commit invalidates old evidence. K does enforce exact-head for DoD normalization stamps (`action-decision/normalization.mjs:44`, `evidence.sha !== head`). This reviewer did not find the validator that decides Develop→Test AC-evidence staleness, so whether K treats an older-sha AC marker as stale is **unsure**.

If K accepts it today, the mandatory case makes Develop→Test stricter than K: every post-stamp commit, such as a docs fix or a lint auto-fix, would force a restamp. Line 203 already says "Native exact-source/declaration validation still applies".

## Required changes

1. R2-F001: Choose an issuance-evidence root that is active in K production today. The likely candidate is a private, owner-only, no-symlink sibling of the story-cache store under the project `.tmp` tree, reusing store.mjs semantics. Alternatively, bring runtime-storage activation explicitly into #2071 scope, with its own manifest row, migration/initialization route and estimate, and remove "runtime-storage remains K" (line 430). In either case:
   - state local versus shared scope and justify it against the worktree-bound issuer and handoff;
   - register the family wherever runtime inventory and cleanup enumerate families;
   - make the Task 2 integration fixture use only production-initialized state, so the test cannot pass on a layout production never creates.
2. R2-F002: Define the receipt retention contract, covering:
   - which references keep a receipt alive (pending generations, unpublished operations and publication evidence);
   - when it becomes collectable, and by which owner;
   - interaction with retention.mjs, worktree cleanup and acknowledged handoff, including whether receipts transfer, stay with the issuer or are refused;
   - a test that cleanup never removes a receipt referenced by a pending generation.
3. R2-F003: Add native admission for the conflict-resolution purpose. One option: resolution issuance evidence recorded like approval-issued, with the issuer's native mode. Then specify:
   - Full-Auto resolution may not discard or overwrite any remote-observed change authored outside the current issuer, in particular human approval checkboxes and markers;
   - such conflicts require human-mode issuance.

   Add an integration case: a Full-Auto agent attempts `discard-approved` or an overwrite of a UI-ticked review box and is refused with zero effects.
4. R2-F004: Cite the exact K validator that makes AC/VC/DoD evidence stale across a commit at Develop→Test, and phrase the mandatory case as "whatever that validator decides". Alternatively, mark this as an intentional tightening with rationale; it would then be a behavior change needing owner sign-off.

## Optional suggestions

### R2-F005 — Map work packages to decomposition units

Add a table mapping Task 1–9 to C1–C11. Task 2 now spans C3/C4, and Task 6 spans C8 plus reconciliation, so the eventual split-plan author can carry the verifiers over without re-deriving them.

### R2-F006 — Pre-split C9

C9 covers about 150 census paths with a per-entry route table. Pre-split it by census family (proof/result, lifecycle, timing/repair, admin/creation) now, instead of deferring with "subdivide if needed". That makes the 33–44 h total more credible.

## Decision

revisions-requested
