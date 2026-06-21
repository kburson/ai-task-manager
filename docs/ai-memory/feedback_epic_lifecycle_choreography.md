---
name: epic-lifecycle-choreography
description: 'Epic state choreography — parent reaches Plan, then children reach Refine, then parent moves to Develop, then children walk down per epic plan.'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6c03579a-29a6-4861-9ec3-09e7be4f8f66
---

For an EPIC and its sub-issues:

1. **Parent reaches Plan first** (refine→plan). At this point the epic carries the rollup plan and the children are still being shaped.
2. **All children reach Refine.** Each sub gets sized/estimated/prioritized.
3. **Parent moves to Develop.** This authorizes children to leave Refine.
4. **Children walk down the line** (Plan → Develop → Test → Review → Done), either sequentially or fanned out in parallel according to the epic plan.

**Why:** This is the gate-respecting cadence the kanban gates encode. It keeps the epic body coherent with children, lets the parent plan drive parallelism decisions, and makes Done-rollup detection accurate.

**How to apply:** Before promoting any child past Refine, verify the parent is at Develop. If the parent isn't there yet, promote the parent (which usually needs all children at Refine first). Never force-promote a child past its parent — see [[no-child-leads-parent]].

Related: [[no-child-leads-parent]], [[wave-newcomer-semantics]] (which lives at project_wave_newcomer_semantics.md).
