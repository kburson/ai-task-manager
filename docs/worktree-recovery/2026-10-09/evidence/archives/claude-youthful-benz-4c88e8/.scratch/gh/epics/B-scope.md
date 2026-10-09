Backlog return becomes supersede-plus-clone instead of a rewind in place.

Today `shelve` and `park` move an issue back to Backlog while leaving its `aitm-entered-*` markers intact. When that issue later re-walks, its chain carries repeat visits and arcs that `verifyChainIntegrity` has to be taught to forgive — `OPTIONAL_CONTIGUITY_STAGES` is a scar from exactly this class of problem. Both verbs are capped at `refine` and `ready-for-plan` for that reason, so there is no sanctioned way to reclaim a story from Plan or deeper.

A clean clone sidesteps chain integrity entirely: the replacement's history starts at Backlog and is honest, while the closed original keeps its full audit trail and its velocity data.

**In scope**

- A `recycle <N>` verb: supersede the original, emit a `--shape stub` clone carrying title, story text, scope text, and parent link, and cross-link the two. Legal from every state except Done; a clean Backlog item with no stage history refuses as a no-op.
- Story and Scope extraction across every body shape — solo, sub-issue, epic, defect, and legacy — into the stub's idea text.
- Edge repointing: swap the parent's `subIssues` entry and repoint every `aitm-blocked-by` referrer at the clone. Without this, superseding a blocker reads as unblocked to `blocked-by-guard` and silently releases its dependents.
- A committed-work guard: refuse when `[#N]` commits exist on any ref, and offer the three-way disposition — finish (drive to Done), drop (supersede as not planned, no clone), or recycle (explicit, audited override).
- A `--drain` batch mode that triages a set into recyclable, needs-disposition, and blocked, and is transactional across the recyclable set.

**Out of scope**

- `shelve` and `park` are untouched. They are a pause, not a replacement, and nothing here needs to change them.
- The `aitm.yml` pipeline configuration itself. This epic is independently useful; the config epic consumes `--drain` for its board-drain refusal.

**Deliberate design constraints**

- The clone carries no Priority, Size, Estimate, Rank, or assignee — it is a hand-written backlog item, and Refine regenerates the rest.
- `aitm-recycled-from` is a protected body invariant so Refine cannot strip provenance.
- Committed-work detection queries all refs, not the trunk-scoped range `close` uses. Work stranded on an unmerged branch is the case most likely to look empty and least safe to recycle.

Design: `docs/superpowers/specs/2026-09-08-aitm-yml-pipeline-engine-design.md` (Epic B section, decisions D9 and D10).
