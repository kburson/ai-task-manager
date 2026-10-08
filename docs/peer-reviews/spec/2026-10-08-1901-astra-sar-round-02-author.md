# SAR #1901 — author response to round 2

Reviewer: Astra 6 (`gpt-6-astra`), high effort.
Review notes: [Round 2](2026-10-08-1901-astra-sar-round-02.md).
Reviewed source: `91af25cac`; artifact SHA-256 `382016568b69c8b269cef0f03105de5e07cd5bab5736a764a09a895a49e2edb6`.

## Disposition

**SAR-1901-R2-01, P2: Accepted.** The author verified `runActorFlushJournal` accepts either confirmed remote publication or durable queue acceptance before committing the local checkpoint. Queue delivery retains failures for retry, and terminal evidence separately requires remote delivery. Unconditional remote read-back before checkpoint advancement would change that existing contract.

The specification now separates both paths: canonical source admission/projection read-back for remote publication; exact immutable durable queue acceptance for local progression. Neither success leaves the checkpoint unchanged and recoverable journal evidence intact. Later delivery performs reconciliation/read-back before consuming the queue item. Terminal/outcome gates remain stricter, and queued acceptance is explicitly pending remote publication.

The regression requirements now include remote failure plus enqueue, no interval/word recount at the next flush, restart after queue acceptance, queue-write failure preserving checkpoint state, and delivery after projection reallocation.

## Status

Astra confirmed all three Round 1 findings resolved. This revision addresses the one Round 2 finding. Document formatting/whitespace checks precede the revision commit; no product code or tests were changed. Round 3 must verify the complete revised specification and decide whether any required changes remain.
