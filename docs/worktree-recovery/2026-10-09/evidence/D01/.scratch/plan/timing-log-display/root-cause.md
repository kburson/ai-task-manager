Confirmed: runtime.mjs::flushActiveToGH uses active-time.mjs::readActivityEvidence for transcript-derived activity estimates. Non-observed results become activeSec:null and idleSec:null; gh-timing-comment.mjs::buildRow renders Unknown for attributed rows. Engagement start/end and event timestamps remain available.

The reader requires matching Codex identity and complete coverage from paired task_started/task_complete records. Coverage is created only on completion and trims the unknown subsecond start edge; live current-turn windows can return window-unconfirmed. Non-Codex providers fail its identity condition. Individual historical unavailable reasons are not stored in public markers.

The user clarified that the visible columns should be recalculated from event timestamp deltas and engagement/pause semantics, as in the supplied snippet. The defect is coupling visible event-derived elapsed durations to unavailable transcript heuristic estimates. A missing transcript estimate does not make a valid event-derived interval unknown.

Existing computeStateMoveDelta/computeActiveByPhaseSpans and actor interval algebra provide related timestamp/event accounting patterns. Deep dive must reconcile these with per-row actor attribution, shared boundaries and canonical metadata. Preserve honest unknowns only where the timing history cannot establish an interval.

lib/timing-rows.mjs::formatDurationSeconds emits Xh MMm SSs. Board fields use a separate fixed-width/sorting codec outside this display request.
