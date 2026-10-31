# Disposable workspace lifecycle implementation plan (#2134)

> For agentic workers: use executing-plans to implement this plan task by task with test-driven-development. The orchestrator owns independent whole-branch review and terminal delivery.

**Goal:** Let delivery maintainers retire completed workspaces and replace epic operators while durable custom Git branches and accepted evidence remain usable.

**Architecture:** Reuse append-only issue location history, existing terminal Close transaction, main-anchored binding ledger, occupancy, lineage and ordinary Git integration. Separate historical evidence from current operational authority. Repair the closed native branch setup seam required by managed replacement checkouts.

**Tech stack:** Node.js ES modules, node:test, real Git fixtures, existing AITM native commands and GitHub Cloud verification.

**Spec:** docs/superpowers/specs/2026-10-31-2134-disposable-workspace-design.md

## Scope

This standalone defect is based on trunk. No unfinished epic source, new authority store, historical rewrite, general override or R1 activation. Source, review, timing and terminal proof remain independently verifiable after source branch and checkout deletion. Do not silently synthesize a canonical branch when a custom durable target is recorded.

## Plan Metadata

- **Priority:** P0
- **Size:** L
- **Estimate:** 12 hours
- **Execution:** Single implementation agent; independent orchestrator review

## Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** retire completed workspaces and continue epic integration from durable Git branches
- **Need:** historical checkout paths currently block later stories
- **Value or failure prevented:** clean up finished work and replace agents without losing delivery continuity

## Global Constraints

Genuine native session identity only. Preserve clean index and worktree checks, singleton issue ownership, existing lineage and accepted-source gates. Use project-local .scratch for operator evidence and .tmp for machine artifacts. Never erase ignored evidence. Targeted verifiers may run locally; npm test and npm run test:slow run only in GitHub Cloud. Every changed source invalidates prior exact-source acceptance. The implementation agent stops at CODE_COMPLETE.

## Implementation Tasks

### Task 1: Separate temporary ownership from durable lifecycle evidence

#### Story Intent

- **Beneficiary:** delivery maintainer
- **Capability:** release obsolete workspace authority while retaining completed delivery evidence
- **Need:** append-only location records currently outlive their bindings and source checkout
- **Value or failure prevented:** completed stories remain auditable without keeping retired agent directories

#### Files and interfaces

Modify issue-worktree-location.mjs and graph-node-authority.mjs to expose strict historical evidence separately from current operational location. Update the bounded consumers that require current write authority. Reuse worktree-binding-lifecycle.mjs and Close transaction release inspection; strengthen read-back or resume only where regression evidence shows a gap. Tests live in their existing unit/integration files and disposable-worktree-lifecycle.test.mjs.

1. Add failing tests that resolve terminal history after source branch and worktree deletion while retaining exact accepted-source, review, timing and terminal records. Add interrupted release and newer reopened binding tests using real registered Git worktrees.
2. Run the focused files and record the expected failure in .scratch/2134/progress.md before production changes.
3. Implement strict history parsing plus terminal-aware operational authority without rewriting historical records or introducing a parallel store. Keep unknown timing unknown.
4. Verify release read-back and interruption recovery through existing transaction seams; preserve newer legitimate binding and occupancy rows.
5. Add failing native bootstrap tests for detached initial naming and custom durable branch replacement. Repair only the closed admission and ordinary binding-writer seam, preserving exact source, issue, owner, clean checkout and live-writer checks. Refuse occupied targets and foreign repositories.
6. Run targeted regressions and commit with [#2134]. Record changed interfaces and red/green evidence.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/issue-worktree-location.test.mjs scripts/tests/unit/task-tracker/lib/graph-node-authority.test.mjs scripts/tests/integration/task-tracker/lib/worktree-binding-lifecycle.test.mjs scripts/tests/integration/task-tracker/disposable-worktree-lifecycle.test.mjs
```

### Task 2: Integrate through durable custom refs with safe checkout replacement

#### Story Intent

- **Beneficiary:** epic delivery maintainer
- **Capability:** integrate the next accepted child through the existing durable epic branch
- **Need:** the prior parent checkout or operator can be retired before the next child lands
- **Value or failure prevented:** delivery continues without restoring obsolete chats or losing dirty or concurrent work

#### Files and interfaces

Modify merge-back-cli.mjs and the bounded merge-back protocol seams. Resolve the real shared Git repository and target branch independently of historical directories; use an actual clean registered target checkout or an operation-local temporary checkout. Reuse occupancy and issue-lock primitives. Tests extend merge-back-cli.test.mjs and disposable-worktree-lifecycle.test.mjs. Native branch adoption from Task 1 must preserve the same custom ref selected here.

1. Add a failing real-Git fixture that removes the former parent checkout, retains its custom target branch, supplies a replacement or creates a temporary integration checkout, and integrates a subsequent accepted child.
2. Add refusal tests for foreign repositories, dirty target/source work, target advancement during verification, another live writer, and concurrent integration. Assert preserved commits and files, not just error strings.
3. Implement checkout selection and short integration exclusion. Capture target/source identity before verification and revalidate immediately before mutation. Use ordinary Git merges; never directly move a checked-out ref while its index is stale.
4. Preserve existing verification-provider and exact-source acceptance behavior. Ensure terminal evidence is retained by its existing owner before disposable cleanup. Re-run existing live-workspace, merged-history and divergence fixtures.
5. Run targeted tests, lint and formatting. Commit [#2134], push the isolated branch, open a PR to trunk using Refs #2134, and run complete exact-source GitHub Cloud CI including slow groups.
6. Record exact head, cloud run, tests and remaining native lifecycle gates; report CODE_COMPLETE for orchestrator review.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/merge-back-cli.test.mjs scripts/tests/integration/task-tracker/disposable-worktree-lifecycle.test.mjs
```

## Review Focus

- Terminal history must remain strictly parsed even though it grants no live write authority.
- A reopened binding newer than the closing generation must survive cleanup and retry.
- A custom epic ref must survive retirement of its prior checkout and cannot be replaced by a synthesized canonical ref.
- A target changed or dirtied during verification must refuse before integration and preserve files.
- Native initial naming and replacement must use genuine identity and ordinary binding read-back; no environment override or hook bypass.

## Semantic review

All seven Story Intent questions pass: the beneficiary is a real delivery role; capability describes behavior; the observed failure supplies the need; continued delivery is the counterfactual value; Scope and reproduced source ground every claim; the two tasks cover distinct ownership and integration boundaries; the root story reads independently. Estimate remains 12 hours based on two coupled implementation units and local plus cloud verification.
