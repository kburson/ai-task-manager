---
name: PBI Refine entry/exit gate fields
description: Definitive field requirements for Assigned→Refine entry and Refine→Plan exit gates on PBIs
type: feedback
originSessionId: e96a51b2-052b-40ba-8357-84786b2b5e77
---
Assigned → Refine entry requires **Priority only**. The `/task refine` verb may begin in Backlog, but it first takes the gateless Backlog → Assigned edge. Size/Estimate/Sequence/Labels/StartTime are NOT required at entry — they get filled in during Refine. PBIs are refined in priority order.

Refine → Plan exit requires **all six fields**: Priority, Sequence, Size, Estimate, Labels (≥1), Start Time (= timestamp of the Refine→Plan transition itself — stamped automatically at promote-time once the field check passes; pinned on the board).

If the PBI is an epic (has sub-issues), Refine→Plan also requires every child to be past Refine.

**Why:** discovered 2026-05-16 that #107's children all have `sequence = null` because `/task refine` writes Priority+Size+Estimate via tetherIssueToProject but not Sequence/Labels/Start Time, and refine→plan was never gated on those fields. This silently breaks `findNextEligibleChild` (filters null sequences) and any priority-ordered refinement workflow.

**How to apply:** when implementing or extending refine-state gates (#147 and any successor), match this field split exactly — don't require Size/Estimate at assigned→refine; when `/task refine` begins in Backlog, it first crosses the gateless Backlog→Assigned edge. Do require all six at refine→plan. Start Time is stamped by the Assigned→Refine transition itself (clarified after the second state landed; the earlier backlog→refine shorthand is no longer an executable edge). Backfill any pre-existing PBIs that left Refine before the gate landed; for those, best-effort use the earliest `aitm-entered-plan` marker.
