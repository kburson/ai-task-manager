# Cross-Worktree Co-Review Handoff Design

Issue: #1369

## Problem

A fresh #939 co-review was initialized in its linked worktree, but Claude's reviewer session ran from the main checkout. The generated handoff used a relative `--dir`, so the CLI first reported `co-review:not-initialized`. An absolute `--dir` found the real protocol state, but `protocol.mjs` still evaluated artifact and branch integrity against the caller's main-checkout root. That produced false `branch-drift`, caused `statusProtocol` to withhold event-derived terminal evidence, and refused the reviewer handoff without changing state.

The reviewer Bash guard has a related authorization flaw. It filters protocol grants by the caller's worktree before comparing the command's target runtime. From a foreign cwd, the live #939 grant is invisible and a co-review command can fall through as not applicable instead of being evaluated against the held reviewer claim.

## Evidence

- Relative handoff from the Claude session: `co-review:not-initialized:.tmp/co-review/939-governed-pr-delivery-design-claude-3; no state changed`.
- Absolute status from the same session: `Integrity: DRIFT`; the runtime remained at revision 4 with Claude's reviewer claim held and no reviewer-handoff event.
- `protocol.mjs` obtains `root` from `repository.repositoryRoot(cwd)` in read, status, and mutation paths, despite state recording `repositoryRoot` and `worktree`.
- `statusProtocol` intentionally replaces events with an empty array whenever integrity errors exist, explaining the missing terminal evidence as a consequence of false drift.
- `start.mjs` renders lifecycle commands with `state.initialization.runtimeDir`, a relative path.
- `resolveReviewerGrant` pre-filters `row.worktree === worktreePath`, while `bash-guard.mjs` supplies the caller's `projectRoot` as `worktreePath`.

## Decision

Implement option C, weighted toward authoritative runtime resolution:

1. Add one shared runtime-root resolver used by the protocol and reviewer policy. For an absolute runtime directory, derive its actual Git worktree root from the runtime itself, prove that root and the caller share the same Git common directory, and preserve physical containment. For a relative runtime directory, preserve current caller-root behavior.
2. After reading state, require its recorded `repositoryRoot` and `worktree` to canonicalize to the resolved runtime root. Never trust a state-named directory before Git identity is established.
3. Use the resolved root and recomputed protocol paths consistently before locks, integrity checks, artifact reads, and writes. Initialization remains caller-rooted because no state exists yet.
4. Render all generated lifecycle commands with the absolute runtime directory. Render runtime-local response, review, and summary paths as absolute paths where they appear in generated commands.
5. Extend the reviewer command classifier to accept absolute literal paths without weakening its one-command tokenizer or shell-metacharacter rejection.
6. Resolve reviewer authority by canonical command runtime plus provider/session. Treat the row's worktree as a post-resolution verification, not a caller-cwd pre-filter. A command targeting a runtime with a live reviewer claim must refuse on zero, multiple, wrong-session, or wrong-worktree grants; it must not fall through as not applicable.

The shared resolver belongs in a small review-library module. The real repository boundary gains a Git-common-directory observation without changing the existing `identity()` result shape.

## Security Invariants

- An absolute runtime may cross worktrees only when caller and target resolve to the same Git common directory.
- Runtime and state paths must be canonicalized before comparison; `..`, symlink escape, another repository, and unverifiable roots fail closed.
- State confirms the already-derived worktree root; state never selects an arbitrary Git execution directory.
- All protocol files, locks, temporary writes, artifacts, and Git checks use one resolved root. No split-root read/write is permitted.
- Reviewer authority remains bound to exact runtime, provider, session, actor, reviewed commit, review path, decision, and optional summary path.
- A recognized command targeting a live reviewer claim cannot escape the reviewer policy through `not-applicable`.
- The Bash grammar remains one literal `npx aitm co-review` command with no wrappers, composition, expansion, or dynamic path expressions.

## Test Strategy

Write regression tests first at four boundaries:

1. Real linked-worktree protocol tests reproduce foreign-cwd absolute status and reviewer handoff, prove integrity stays healthy, and prove terminal evidence remains visible.
2. Root-security tests reject another repository, mismatched recorded roots, traversal, and symlink escape while preserving relative-dir compatibility.
3. Renderer/classifier tests prove generated commands use absolute runtime-local paths and the classifier accepts those exact paths while retaining all negative shell/path cases.
4. Reviewer-policy and Bash-guard tests prove a foreign-cwd command resolves the correct live grant, while zero/multiple/wrong-session/wrong-worktree cases fail closed and never fall through.

## Compatibility

- Existing relative `--dir` callers from the owning worktree keep their current behavior.
- Relative `--dir` from a foreign cwd remains `not-initialized`; generated handoffs remove that ambiguity by using absolute paths.
- Existing repository test doubles need no new method unless they exercise a cross-worktree absolute path; the shared-root fast path remains unchanged.
- Existing `identity()` consumers keep the current `{ branch, head }` shape.
- No protocol schema migration is required; existing recorded `repositoryRoot` and `worktree` fields become enforced rather than ignored.

## Scope Boundaries

- Do not mutate or reuse #939's preserved co-review evidence while fixing #1369.
- Do not implement #939's governed PR delivery design.
- Do not weaken immutable-artifact, role, session, lock, archive, or command-shape checks.
- Do not add shell wrappers such as `cd`, `git -C`, or composed commands to the reviewer allowlist.

