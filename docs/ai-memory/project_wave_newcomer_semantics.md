---
name: Wave model — same-wave newcomers
description: Discovered sub-issues joining the current wave do not block flowing wave members; the epic's next-wave admission waits for all current-wave members to reach Done.
type: project
originSessionId: a2956386-6efd-462f-8527-e3f5a578f958
---

In the 7-state kanban Sequence-driven wave model (issue #41 epic), when a deep-dive discovers a new sub-issue and slots it into the _current_ wave (same `Sequence` as already-flowing members), the gate behavior is asymmetric:

- **In-flight wave members are NOT blocked.** They continue through Develop → Test → Review → Done on their own timing.
- **The epic's next-wave admission IS blocked.** The epic waits until every member of the current wave (including the newcomer, after it fully traverses Refine → Plan → Develop → Test → Review → Done) reaches Done. Only then can the next Sequence-numbered wave promote.

**Why:** Newcomers must extend the wave's wall-clock duration without stalling work that is already correct and progressing. Stalling flowing work to "wait for" a discovered sibling would punish good in-flight work for orchestrator decisions made later.

**How to apply:** When implementing sub-issue 3 (Grooming → Analysis gate) and sub-issue 8 (E2E test) of issue #41, ensure the wave-admission predicate operates only on the _epic-level next-wave_ admission check, not on the per-issue forward-state transitions. The E2E test should explicitly cover: a wave-1 member already in Review, a wave-1 newcomer just entering Refine, and verify that (a) the in-flight member can still move Review → Done, and (b) wave-2 admission stays blocked until the newcomer also reaches Done.
