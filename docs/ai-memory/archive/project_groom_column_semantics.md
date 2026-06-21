---
name: Groom column is intentionally overloaded (grooming + groomed)
description: explains why Groom holds both in-progress and completed grooming, and the responsibility moving to Groom incurs
type: project
originSessionId: 435187f1-5a33-4750-a0e4-d4a4398ac3f0
---

The `Groom` column means BOTH "currently being groomed" (present) and "groomed, awaiting analyze" (past). One column on purpose — splitting into "Grooming" / "Groomed" / "Ready to Analyze" proliferates columns around verbs/nouns and makes the process untenable.

**Rules that follow from this:**

1. **Moving an issue to Groom incurs an immediate responsibility:** perform the grooming activity now. Don't move-then-walk-away.
2. **Grooming artifacts required before leaving Groom-as-todo state:** size estimate, sequence number, labels. Without these you cannot plan execution.
3. **Sub-issues stay in Groom until ready for Analyze.** Analyze is just-in-time before Development. Don't promote sub-issues to Analyze just because grooming finished — promote them when you're about to start development on them.
4. **Epics have their own sequence queue, separate from sub-issues.** Epic-level sequencing planning is independent of sub-issue sequencing.
5. **An epic in Groom requires the epic itself to have estimate + sequence + labels** — not just its sub-issues.

**Why:** kept the kanban from sprawling. Stated by user 2026-05-10 after I incorrectly treated the Groom column as a pure "in-progress" signal and moved epic #61 there without performing the grooming work.

**How to apply:**

- Before moving anything to Groom, be ready to do the grooming work in the same turn (or pause and queue it explicitly).
- When asked "is X groomed?" check artifacts (size, sequence, labels) — not just column.
- For epics: epic-level sequence ≠ sub-issue sequence; they're parallel queues.
- Don't auto-promote groomed items to Analyze; wait for the JIT signal that development is about to start.
