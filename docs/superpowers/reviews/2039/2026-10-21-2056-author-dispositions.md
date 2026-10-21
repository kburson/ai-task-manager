# #2056 author dispositions

## Independent round 1

The fresh GPT-6.1 Sol / medium reviewer inspected base `7fb170042a19bd42560b39ca0c2b487f6402d717` through `2b2a8f52bc02b1cd62949f1ef7128ee3151e5250` and independently ran 133 passing focused tests. Its complete report is retained verbatim. It found no Critical or Important runtime defect and two Minor coverage findings. The owner requires resolution of review findings, so both coverage findings are addressed rather than deferred.

1. Accepted: semantic corruption fixtures previously omitted native canonical encoding and could stop before the named guards. They now write canonical JSON plus its newline. Explicit duplicate-key and malformed-JSON tests remain separate. Malformed native identities additionally run against a real valid registry in integration. These are coverage corrections; no runtime fix or new RED-to-GREEN claim is inferred.
2. Accepted: the prior worktree removal test exercised the observer's root. It remains as that useful case. A new fixture acquires in a linked owning worktree and resolves from the main observer; it then unregisters the owner while retaining its physical cache bytes and verifies both resolution and registration refuse. No production behavior changed.

## Explicit rulings on every declined boundary

1. Handoff, export acknowledgment and release remain Task 9. This story adds no transfer operation. Cost if wrong: a caller must wait for the explicit handoff slice rather than improvise release.
2. Registration acknowledges the exact existing acquired pointer. Acquisition already persists authority under the native issue lock; a second creation route would duplicate that responsibility. Cost if wrong: a caller with a tuple that has no acquired claim receives refusal and must acquire normally.
3. Resolution does not refresh cloud assignment. Acquisition and transition admission own that bounded authority read. Cost if wrong: a displayed local pointer may precede a remote assignment change, but cannot authorize publication.
4. A resolved pointer is not publication permission. The caller still requires local session ownership and native transition checks. Cost if wrong: a future caller that omits those checks would violate its own integration contract.
5. Payload, manifest, generation and journal integrity remain store/manifest responsibilities. Pointer resolution verifies identity and physical directories only. Cost if wrong: content corruption is reported by the content consumer, not this lookup.
6. Arbitrarily deleted files beneath retained directories are likewise checked by the store. No complete content-survival claim is made. Cost if wrong: consumers must open and validate contents before mutation.
7. Destruction of all registry/cache evidence cannot be recovered from this pointer. The specification explicitly disclaims that backup guarantee. Cost if wrong: unpublished evidence may need external recovery and publication remains refused.
8. Independent-machine exclusion and foreign-host adoption remain outside a shared local registry. Explicit cross-host handoff is required. Cost if wrong: external editors remain within the disclosed provider race limitation.
9. Same-user filesystem replacement between observation and use cannot become a lock guarantee. Mutation boundaries must revalidate. Cost if wrong: stale observations can be displayed, but are not valid authorization.
10. Task 7 acquisition and lock algorithms remain accepted predecessor behavior. This extraction preserves public exports and reruns its regressions. Cost if wrong: a predecessor defect must be repaired with its own concrete evidence; this review does not certify every possible lock race.
11. PID age, fleet TTL and process liveness never release persistent ownership. The explicit fleet-prune regression protects that separation. Cost if wrong: a stale claim requires governed handoff/recovery rather than automatic takeover.
12. Public lifecycle writer/reader activation belongs to later pinned slices. These are library APIs and fleet reexports only. Cost if wrong: no end-to-end traffic or transition improvement can yet be claimed.
13. Externally reformatted registry JSON is refused. Native immutable writers already emit the canonical encoding; rejecting alternate encodings prevents duplicate-key ambiguity without changing a supported writer. Cost if wrong: unsupported manual edits require explicit investigation, not silent hydration.
14. Bare repositories, Windows and unusual Git layouts gain no support claim here. Existing root/storage APIs define supported identity. Cost if wrong: unsupported roots refuse rather than publish from uncertain identity.
15. Collector/timing/lifecycle evidence is owned by genuine local/native receipts, not the offline reviewer. The committed audit retains its observed cutoffs, Unknown timing and capture gap. Cost if wrong: these operational claims require reconciliation independently of code review.
16. Whole-repository performance and end-to-end publication budgets are not established by pointer tests. Later integrated acceptance must measure them. Cost if wrong: no speed, quota or physical-request savings claim can be derived from this slice.
