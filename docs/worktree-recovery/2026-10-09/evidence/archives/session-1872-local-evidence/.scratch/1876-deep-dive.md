The verified #1872 delivery is blocked by legacy actor timing replay. Its source remains 87f3e5e9eab41ff100367eb7a2eb71de444671bd. Canonical Test receipt 01M43SV1TBD7C64G81PNQT2F1V and cloud run 37212706089 are green. Review reported 168 duplicate actor starts; delivery refused agent-review-evidence. Defect #1876 isolates the repair at trunk 171c7d93866f67b58effa635be5ae737f54ef9eb. Broader runtime adoption remains with #1862.

Inspection traced the failure through appendActorRow, postTimingEvent, the durable queue and deriveActorEngagement. The publisher compares raw input, then changes its derived Delta Words cell. Runtime openers explicitly supply zero, rendered blank; stored rows receive an em dash or a delta from the actor prior cursor. Canonical read-back applies the original again. Starts throw as duplicates and resumed events append again, so accepted publication remains uncertain and queued originals survive. Existing replay coverage omits deltaWords and happens to match the first stored row. Regression coverage must exercise explicit-zero input, canonical remote read-back and actual queue draining.

Replay identity will ignore only the publisher-derived delta. Every other cell and marker, including actor, timestamp, word and full-word cursors, description, durations and engagement payload, must match, with equal cell counts. Conflicting interval refusal remains intact. The canonical timing reader remains strict; it correctly rejects stacked openers and must not hide corrupted history.

The existing heal-timing-log maintenance entrypoint gains an explicit per-issue actor opener replay mode, leaving its default historical transform unchanged. It retains the original opener and removes only copies with identical durable fields and blank, zero or em-dash delta. Same actor/event/timestamp with changed payload, nonzero replay delta, engagement-bearing opener or malformed evidence refuses. Every surviving row stays byte-identical. Before and after canonical accounting must retain intervals, actor and phase totals, cursors, unknown rows and incomplete actors, while removing only proven duplicate-opener failures. No departure, duration, identity or cursor is invented.

Dry-run reports complete unique canonical source identity, exact body hash and removal audit. Apply requires the reviewed source hash, preserves original and candidate bodies with hashes and provenance before mutation, and repeats the source observation immediately before the sanctioned timing-comment update. Source drift or ambiguous census refuses without a remote write. Exact canonical read-back is mandatory before reporting healed. Preserved evidence supports investigation of uncertain publication. Original pending events must drain through the corrected publisher, never by manual queue deletion.

Implementation begins with failing publisher/read-back/queue tests and the minimal correction, then failing recovery and command tests, constrained transform and maintenance-driver integration. Targeted TIA tests run locally; full suites run in cloud CI. Operational recovery uses fresh #1872 evidence while its verified source remains frozen. The focused defect does not activate a runtime, change timing algebra, remove stale tests, rewrite fixtures for speed, or take over broader adoption work. Preservation, source drift and conflict refusal are the main risks. One independently reviewable small defect remains appropriate.

### Story Intent

- **Beneficiary:** task owner recording observed engagement
- **Capability:** replay and reconcile original timing events without duplicate actor openers
- **Need:** derived delta formatting prevents canonical read-back from acknowledging published rows
- **Value or failure prevented:** interrupted publication can recover without corrupting timing evidence or blocking a verified delivery

### Semantic review

All seven story questions were checked against live Scope, four ACs, actual publisher and reader. The beneficiary receives the safeguard; capability addresses the confirmed gap; avoided failure is corrupted timing evidence and blocked delivery. The story is source-grounded, readable alone and distinct from broader #1862 adoption. No governed plan is linked, so the mirrored deep dive supplies the sole authoritative Story Intent.
