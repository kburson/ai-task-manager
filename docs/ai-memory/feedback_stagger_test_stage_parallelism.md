---
name: feedback-stagger-test-stage-parallelism
description: Cap/stagger concurrent Test-stage agents to avoid CPU lockup — test:all forks a node child per test file
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 807f2606-8e44-43a5-b226-7be16b4de3b1
  modified: 2026-07-24T13:54:07.388Z
---

Don't fan out unlimited parallel agents into the Test stage at once. `npm run test:all` (invoked by the `test` verb) spawns a separate `node` child process per test file, so N parallel Test-stage agents means N× that fork fan-out on top of each other.

**Why:** user flagged mid-run (2026-07-24) that 6 parallel Test-stage agents (Phase 2 Group A tail, driving #899/#819/#855/#847/#853/#854 through Test→Review→Done) were pushing CPU load to ~5.8 on a 10-core machine. Not a hard lockup that time, but headroom was thin and it would tip over with more lanes or a bigger machine load already in use.

**How to apply:** when dispatching multiple agents that will each independently run the full `test:all` suite (Develop→Test promotion, or any Test-stage gate-walk), stagger them — e.g. batches of 2-3 concurrent rather than all at once — or serialize if the batch is small enough that wall-clock cost is acceptable. Refine/Plan/Review/Done-only fan-outs (no `test:all` invocation) don't need this — the risk is specific to the Test-stage full-regression run, not parallel agents in general. See [[project_epic_912_state]] and related epic-drive memories for prior batch patterns.
