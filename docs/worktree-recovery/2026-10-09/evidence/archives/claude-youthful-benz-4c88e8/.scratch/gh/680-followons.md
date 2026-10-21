### Follow-on epics

The recommendation in the `spike-deliverable` comment proposed four follow-on epics. All four
are filed, unassigned, in Backlog. Each records this spike as its origin in its Story Origin
section.

| Epic | Scope | Size |
| --- | --- | --- |
| #1558 | Ask-the-script — replace rule-file prose with a queryable gate-state API | M |
| #1559 | Recycle verb — backlog return as supersede plus clean clone | L |
| #1560 | Pipeline as config — `aitm.yml`-driven state machine | XL |
| #1561 | Gate and action plugin API for external verification scripts | L |

**Sequencing.** #1558 is fully independent and intended to ship first. #1559 is independent of
#1558 but blocks #1560, whose board-drain refusal consumes `recycle --drain`. #1561 depends on
#1560 for the gate resolution registry and edge-bound guard binding, and couples to #1558
because the Guard `remediation` field must be shaped against #1561's verdict schema rather than
retrofitted to it.

These are follow-on work rather than sub-issues, so they are deliberately not linked as children
of this spike. The spike's deliverable is the recommendation; the epics are what the
recommendation recommends.

Because they sit under no common parent epic, they are tied together by the
**`plan:pipeline-engine`** label, following the existing `plan:` convention in this repository.
This spike carries the label too, so the whole initiative — origin and follow-ons — is one
query.

**Design of record:** `docs/superpowers/specs/2026-09-08-aitm-yml-pipeline-engine-design.md`,
landed on trunk via #1556.

<!-- aitm-spike-followons -->
