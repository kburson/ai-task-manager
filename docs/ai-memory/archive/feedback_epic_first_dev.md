---
name: Epic must be in Development before sub-issues
description: Parent epic must reach Development state before any sub-issue can leave Backlog/Groom/Analyze. Drive the epic through analyze→approve→development FIRST.
type: feedback
originSessionId: a2956386-6efd-462f-8527-e3f5a578f958
---

The parent epic must be in **Development** (or later) before any of its sub-issues can be moved out of Backlog/Groom/Analyze. When orchestrating an epic with multiple sub-issues:

1. `/task start <epic>` → `/task analyze <epic>` → post epic-level deep-dive → `/task approve <epic>` to land it in Development.
2. ONLY THEN drive sub-issues (W1, then W2 parallel, then W3 parallel, etc.).

**Why:** The hierarchy invariant — sub-issues represent decomposed work of an active epic. A child being further along the board than its parent is a category error: it means the orchestrator dispatched work before the epic was admitted to active development. This breaks roll-up status reporting, makes the kanban misleading, and means the epic's deep-dive (which should set wave structure + shared-file risk) was skipped.

**How to apply:** First action on any new epic ticket is to drive the EPIC through analyze→approve→development. Treat any "start a sub-issue" instruction as implicitly requiring the parent epic to be in Development first; if it isn't, drive the parent first, no exceptions. A code gate (sub-issue under #61) will eventually enforce this, but until then this rule is the operator-side guardrail.
