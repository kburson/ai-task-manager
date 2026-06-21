---
name: Re-pack blocked on Epic 7 (#41)
description: Don't re-pack/publish the ai-task-manager skill until Epic 7 (7-state kanban + verb vocabulary) is complete.
type: project
originSessionId: a2956386-6efd-462f-8527-e3f5a578f958
archived: 2026-05-16
archive-reason: Epic #41 CLOSED — gate no longer applies.
---

No re-pack of the `ai-task-manager` skill until Epic 7 ([#41](https://github.com/kburson/ai-task-manager/issues/41) — "7-state kanban and verb vocabulary review") is fully complete.

**Why:** User wants the kanban + verb vocabulary changes shipped as a single coherent release. Re-packing mid-epic would push partial vocabulary to consumer projects (e.g. ocp-services).

**How to apply:** When migration/cleanup work feels "done" and the next natural step would be `npm pack` + install in a downstream project, stop. Confirm Epic 7 is closed first. Status of #41 as of 2026-05-09: OPEN.
