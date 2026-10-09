**Kind:** epic

**Provenance:** Follow-on epic from spike #680. Design recorded in `docs/superpowers/specs/2026-09-08-aitm-yml-pipeline-engine-design.md`, section "Epic B — Recycle verb", decisions D9 (supersede + clone over rewind in place) and D10 (committed-work refusal).

**Relationships:**

- Origin spike: #680
- Blocks: the pipeline-as-config epic, whose board-drain refusal consumes `recycle --drain`
- Adjacent, deliberately untouched: `shelve` and `park` remain a shallow-state pause with no coupling to recycle

**Discovered how:** surfaced mid-design as a prerequisite for changing the pipeline shape. A pipeline change invalidates every in-flight issue's recorded marker chain, so the board has to be cleared first — and clearing it by rewinding issues in place would leave exactly the incoherent chains this epic avoids.

**Why it stands alone:** returning a story to Backlog cleanly is useful whether or not the pipeline ever becomes configurable. The clone starts with honest history; the closed original keeps its audit trail and its velocity data.

**Size guess:** L
