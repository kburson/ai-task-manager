<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-a57fb56728281f6213185bbfbf7f4964"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-30-1857-durable-runtime-cleanup-design.md"
artifact_commit: "9a566c7fb2d089c1a58726e01d555822abd08df3"
artifact_blob: "f13a8ff2ea605a8b6f526ed70dcc2f242fb6a177"
artifact_digest: "sha256:461dd50267576fb12d19b8ac58ea308e1654f3d204234834e92cd6880820c250"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:fd23d8eb24ff8e74c4729551cf966b917897fb1bf8a48b6a7ffcc9059e2c5032"
  identity_source: "runtime"
started_at: "2026-09-30T20:47:30.467Z"
submitted_at: "2026-09-30T20:49:06.408Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The design is directionally sound: a single durable runtime namespace under `.ai-task-manager/runtime/`, explicit operator-approved migration with no volatile fallback, guard precedence of runtime protection over artifact allowances, and conservative, evidence-bound cleanup that reuses the existing delivery integration proof. Verified against the tree at the artifact commit: `scripts/task-tracker/paths.mjs` is the central resolver (state/queue/sessions/locks/gates/cache under `.tmp/aitm/`, fleet/occupancy/closed-bindings/orchestrator lock main-anchored), `verifyObservedIntegration` exists in `scripts/task-tracker/lib/delivery-integration-proof.mjs`, and the `merge-tree` virtual-merge comparison exists in `scripts/task-tracker/verbs/deliver.mjs` (~line 2638). Four gaps need closing before planning is safe: a recovery deadlock in the fail-closed partial-publication rule, an unaddressed project-dir environment override that can relocate the entire runtime into volatile space, an under-specified cleanup skill packaging/naming contract that does not match how the task skill is actually installed, and unstated project-root anchoring for Test sandboxes nested under the new runtime prefix. The native-host archive dependency also needs a defined fallback.

## Findings

1. **Recovery deadlock during partial publication (High, R3/R4).** "During any partial publication, normal runtime access fails closed against the main transaction state." Every Bash call in every session passes through the PreToolUse guard (`scripts/task-tracker/bash-guard.mjs`), which reads runtime state for binding/gate decisions. If the migrate-runtime process crashes mid-publication, the guard fails closed for all sessions, including the one that must run `migrate-runtime resume`. The spec defines no admitted path for the resume/inspect invocation (or a human-run out-of-band command) while the transaction is partial. As written, a crash can leave the operator unable to recover through the registered route, pressuring them to delete `control.json` or edit runtime files by hand — exactly the unregistered mutation the design forbids.

2. **Project-dir environment overrides bypass the volatile-path refusal (High, R4).** `getProjectDir()` resolves `AI_TASK_MANAGER_PROJECT_DIR > CLAUDE_PROJECT_DIR > cwd`, and every worktree-local resolver (`tmpAitmDir`, `sessionDir`, `gatesDir`, `locksDir`, `statePath`, `queuePath`) derives from it. The spec refuses state/queue/transcript *config* overrides into `.tmp`/`.scratch`/aliases, but says nothing about these environment variables. Setting either to a directory under `.scratch/` or `.tmp/` places the whole "durable" store (and its `control.json` activation record) in a freely writable volatile tree, where an artifact-allowed write could forge an activated store with arbitrary bindings/gates. Tests legitimately use this variable for isolation, so the rule must distinguish test isolation roots from production resolution rather than simply banning it.

3. **Cleanup skill packaging does not match the existing install model (Medium, R5/R8).** The spec says "Ship skill/cleanup/SKILL.md … beside the existing task skill. Use existing provider installTarget parents and stub/symlink modes." The task skill is not a single file: symlink mode links `<installTarget>` (e.g. `.claude/skills/task`) to `dirname(adapter.skillAdapterPath)` — a per-provider directory under `skill/adapters/<provider>/` — and stub mode writes provider-specific stubs (`claudeStub`, `codexStub`, `grokStub`) in `bin/cli.mjs` (~lines 885–960). `skill/cleanup/` would also sit inside the tree that is currently the task skill's source root. The spec does not say whether cleanup gets per-provider adapters, what each provider's symlink target is, or the discovery name. A generic directory name such as `.claude/skills/cleanup` also risks colliding with a user- or third-party-owned skill of the same name, which the "safe owned uninstall" check would then have to refuse or, worse, overwrite on install.

4. **Project-root anchoring for Test sandboxes nested under the runtime prefix is unspecified (Medium, R2).** `projectDirForState()` in `scripts/task-tracker/state.mjs` (~line 192) anchors on the rightmost `/.tmp/aitm/` segment first, then the rightmost `/.ai-task-manager/`, with a special-case skip for `.claude/worktrees/` host paths (#332, #486). Moving governed Test worktrees to `<main>/.ai-task-manager/runtime/...` makes each sandbox path contain the main worktree's `/.ai-task-manager/` segment plus the sandbox's own. Rightmost-wins likely still resolves correctly, but the removal of the `.tmp/aitm` anchor, the loadState legacy fallback (`legacyPathFor`), and the new nesting are exactly where #332-class contamination (sandbox state resolving to main) has recurred. The spec lists "sandbox placement" in adversarial coverage but does not state the anchoring invariant the new resolver must satisfy.

5. **Native-host archive capability is assumed, not established (Medium, R6).** "For native managed worktrees, use the host's recoverable archive operation and attachment safeguards." The spec does not identify which hosts (Codex `.codex/worktrees/`, Claude `.claude/worktrees/`) expose an archive operation that AITM can invoke non-interactively, nor what happens when none is available. Without a defined fallback, implementers will either fall through to ordinary `git worktree remove` on host-managed trees (breaking host attachment state) or silently skip them.

6. **"Durable" is relative to guard policy only (Low).** `.ai-task-manager/runtime/` is gitignored, so `git clean -fdX` or a fresh clone wipes it together with `.tmp`/`.scratch`. After such a wipe, a missing `control.json` plus missing store is indistinguishable from a fresh install and would initialize an empty valid store. That is probably the correct outcome, but the spec should say so explicitly so it is not later mistaken for a durability defect, and so the cleanup command is explicitly forbidden from ever targeting runtime roots.

7. **Estimate looks optimistic for the declared scope (Low).** A multi-root, crash-resumable, hash-journaled migration touching every path consumer (paths.mjs plus the listed out-of-band paths: config overrides, provider stateDir, draft-branch journals, hook idempotency, action capture, sandbox reaper), plus a new skill with provider parity, plus worktree retirement and OID-leased origin pruning with adversarial tests, is budgeted at 16–24 h. The runtime slice alone (8–12 h) is thin given the adversarial matrix. This does not block the design but affects forecast honesty (R9).

## Required changes

1. Define a recovery admission for partial-publication state: the guard must admit the registered `migrate-runtime` plan/resume/status invocations (identified by exact registered command form, not by a free-text allowance) while refusing all other runtime-dependent work, and the spec must state the out-of-band recovery path if even that invocation cannot run. Add a crash-mid-publication-then-resume-from-a-hooked-session scenario to the adversarial coverage.
2. Extend the volatile-path refusal to project-root resolution: specify how `AI_TASK_MANAGER_PROJECT_DIR` / `CLAUDE_PROJECT_DIR` are treated when they resolve (physically, after alias resolution) into `.tmp/`, `.scratch/`, or other artifact-allowed trees, and how test isolation roots remain supported without granting production authority. Add a corresponding adversarial VC.
3. Specify the cleanup skill's source layout (per-provider adapters or a single shared source, and where it lives relative to the task skill's `skill/` tree), the symlink target and stub contents per provider, and a namespaced install name (e.g. `aitm-cleanup`) with collision behavior against a pre-existing unowned skill directory.
4. State the project-root anchoring invariant for runtime paths and nested Test sandboxes under `.ai-task-manager/runtime/`, including removal of the `.tmp/aitm` anchor and the `loadState` legacy fallback, and require a regression proving sandbox state never resolves to the main worktree.
5. For native managed worktrees, name the supported hosts and their invocable archive operation, and define the behavior when no such operation is available (recommended: classify as protected/report-only, never fall back to `git worktree remove`).

## Optional suggestions

1. State explicitly that `git clean -X`/fresh-clone loss of the ignored runtime is outside the durability guarantee and yields a fresh empty store, and that the cleanup command never proposes runtime-root deletions.
2. Note in the storage contract that corrupt JSON currently loads as `{}` in `loadState` (`scripts/task-tracker/state.mjs` ~line 230); the activated-store rule ("missing/corrupt required records never cause … implicit grant") should explicitly replace that silent-empty behavior with a refusal.
3. Revisit the runtime-migration slice of the estimate (or record it as a known forecast risk) before it becomes the Plan input.
4. Consider sequencing the delivery so the runtime migration lands and is verified before the cleanup/branch-pruning units, since cleanup's protections depend on reading the new store authoritatively.

## Decision

revisions-requested
