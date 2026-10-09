# #1918 Criteria Revision Repair Delivery Implementation Plan

> **For agentic workers:** Use the executing-plans skill for each accepted child plan and the task skill for the ancestor orchestration. Same-rank parallel candidates require approved ownership and admission records before dispatch.

**Goal:** Complete the retained Task 5 revision protections through the sixteen existing bounded repair stories, producing verified integrated behavior without losing historical evidence.

**Architecture:** The native delivery hierarchy is #1847 → #1855 → #1918 → repair children. #1847 and #1855 remain active while #1918 orchestrates the repairs; #1919 is first. Reuse the implementation already preserved on feature/epic/1918/parent, qualify changes on each child's HEAD, and integrate each completed wave before pulling the next.

**Tech Stack:** Node.js scripts, node:test, GitHub-native issue relationships, Markdown, and the repository's configured verification provider.

**Spec:** docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md

## Scope

This is the execution and orchestration plan for the remaining Task 5 protections already split into #1918. The original Task 5 implementation plan remains docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md. Per-child implementation plans must specify their current source interfaces and exact tests before implementation. This document does not transfer historical passing receipts onto new commits or approve the new event-body predicate owned by #1922.

## Context

The user confirmed the multi-generational hierarchy on October 8, 2026: #1847 → #1855 → #1918 → #1919. GitHub previously placed #1918 alongside #1855 under #1847, causing WIP admission to interpret an ancestor as a competing sibling. Native reparenting of #1918 under #1855 corrected that relationship; fresh admission guidance became ready. #1855 remains in Develop with its retained implementation and whole-contract obligations. This supersedes earlier instructions describing #1918 as a sibling epic. Do not create a new prerequisite issue chain or reopen completed #1851–#1854.

The current branch contains checkpoint 14f6c5589724e9d2a33c2353c19f0c793bfe6033 and the subsequent preserved 58-path checkpoint. See docs/superpowers/plans/2026-10-08-1918-preserved-implementation-checkpoint.md for exact blob provenance. These are repair inputs, not green integration evidence.

## Global Constraints

- Preserve the original algorithms, authority and current-source checks, body invariants, and common lock order.
- Use Node.js scripts and Markdown only; no compiled binaries or addons.
- Never delete tests, shrink fixtures, increase timeouts, weaken guards, add authority caches, or manufacture proof.
- Preserve the existing 600000ms per-file and semantic-section budgets, 20-minute verifier budget, and 45-minute lifecycle sandbox budget.
- All declared focused, full-suite, lint, format, package, and exact-head CI obligations remain binding.
- Any individual story forecast at or above 24 human hours must be decomposed; aggregate epic rollups may exceed that threshold.
- Existing policy grants for original steps 13 and 15 remain bounded; #1922 needs exact separate authorization for its event-body predicate.
- Keep inherited failures explicit. Final #1917 qualifies the composed consumer union and exact-head integration; it does not absorb unfinished earlier implementation.

## Plan Metadata

- Issue: #1918
- Parent-epic: #1855
- Outer-epic: #1847
- Priority: P1
- Size: XL
- Estimate: 144 human hours of remaining repair scope, not measured productive time
- Labels: epic
- Source HEAD: 9ab45fbbede83dc1148203ddb9fe64019bf8ed87
- Hydration: docs/superpowers/plans/2026-10-08-1918-criteria-revision-repair-hydration.md
- Delivery handoff: docs/superpowers/plans/2026-10-08-1918-delivery-handoff.md

## Story Intent

- **Beneficiary:** delivery owner
- **Capability:** finish the remaining revision protections through bounded repair stories
- **Need:** the existing oversized story cannot produce clear delivery checkpoints
- **Value or failure prevented:** each repair can be reviewed and the complete original capability reaches verified green integration without losing historical evidence

## Review Focus

- A blocked ancestor must remain active while its descendant executes; only competing siblings consume the same immediate-parent WIP slot.
- Existing source corrections need current-HEAD and Linux qualification; inherited local receipts cannot stand in for CI.
- Five-state consumer, ordered-lock, source-drift, effect-spy, and actual reentry cases remain owned by their original repair slices.
- Shared-file waves require exclusive function ownership, explicit interface contracts, and integration order before edits.
- Fresh exact authorization for event-body admission is distinct from ordinary execution or Plan approval.

## Implementation Tasks

### Task 1: Deliver the bounded repair waves

#### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** complete and verify each retained revision-protection repair before dependent work starts
- **Need:** inherited implementation and partial verification do not prove the complete original capability
- **Value or failure prevented:** independently reviewable repair checkpoints prevent false completion and evidence laundering

**Files:** Each child owns the exact surfaces declared in its live Scope and accepted child plan. The preserved source inventory and governing Task 5 plan define the complete delivery boundary.

**Interfaces:** Each child consumes the preceding integrated wave and its native blockers. It produces a reviewed implementation commit plus current verification and delivery evidence. #1917 consumes the complete integrated result; #1855 and #1847 retain their original aggregate obligations.

| Wave | Children            | Remaining human hours | Native blockers     |
| ---: | ------------------- | --------------------: | ------------------- |
|    1 | #1919               |                     6 | #1854               |
|    2 | #1909               |                     8 | #1919               |
|    3 | #1910, #1911        |                 8 + 8 | #1909               |
|    4 | #1912               |                     6 | #1910, #1911        |
|    5 | #1916, #1920        |                12 + 4 | #1912               |
|    6 | #1913, #1915, #1924 |            8 + 14 + 6 | #1920               |
|    7 | #1921               |                    10 | #1913               |
|    8 | #1914               |                    12 | #1921               |
|    9 | #1922               |                    10 | #1914               |
|   10 | #1923               |                     8 | #1915, #1922        |
|   11 | #1925               |                    16 | #1923               |
|   12 | #1917               |                     8 | #1916, #1924, #1925 |

- [ ] Inspect the current child's live scope, source, dependency status, and verification declarations; publish its exact Plan and deep dive before implementation.
- [ ] Reproduce the owned failure, preserve existing coverage, apply the smallest scoped source repair, and prove the changed behavior with meaningful red-to-green evidence.
- [ ] Run the child's required verification at its accepted HEAD, report inherited failures explicitly, and satisfy the configured provider's delivery checks.
- [ ] Review and integrate the current wave through the supported delivery path; complete its lifecycle before pulling the next wave.
- [ ] Before waves 3, 5, or 6, partition file/function ownership and establish real admission records. Equal ranks alone do not authorize concurrent edits.
- [ ] At #1917, reconcile independent consumer discovery, all children’s coverage, package/quality commands, and exact-head Linux CI without weakening the contract.
- [ ] Reconcile the historical Draft PR1907 and #1855 delivery disposition only after the complete integration is verified.

**Verification Commands:** Preserve the exact eight parent commands in #1918's live Verification Commands. Child verification uses each child's live declarations and approved Plan. No checkbox in this document is execution evidence until its corresponding work actually passes.

## Acceptance Criteria

- [ ] The original complete Task 5 protection contract is satisfied across actual writer, lifecycle, proof, hook, and session consumers.
- [ ] The original 24-step Node.js transition and real retry, repair, compensation, and truthful partial results are complete.
- [ ] Required focused, full-suite, package, lint, formatting, and exact-head integration CI checks pass within unchanged budgets.
- [ ] Historical #1855 work and Draft PR1907 have an explicit verified reconciliation, with no inherited false-green claims.
