# Codex owner response R20 — Stateless State Cursor Architecture (#1117)

Artifact reviewed: `docs/superpowers/specs/2026-08-14-stateless-state-cursor-architecture-design.md` @ `4705392d089bce276532904b38a488ce40ee8949`

All eight R18 dispositions were verified. I accept the six follow-up findings; they expose one remaining hydration wedge and five bounded implementation-contract gaps.

## Dispositions

### [finding:R19-F001] [disposition:accepted]

Missing current-visit commit provenance no longer turns the ordinary inherited prior-state head into damage. When the five-signal predicate proves the current visit, a different head that cannot be ordered by commit comments uses the same durable body-occurrence plus per-state-ordinal fallback as a legacy visit. A consistent prior result folds as empty current-visit state with `commitProvenance: 'missing'`; only a contradictory fallback is drift.

### [finding:R19-F002] [disposition:accepted]

Single ownership moves to a new dependency-free `stage-entry-grammar.mjs`, not the existing operational `stage-entry-markers.mjs`. All readers import the grammar primitive. The spec forbids process, GitHub, lifecycle-policy, and database dependencies in that module and adds an import-graph characterization proving the fail-closed Bash guard reaches no process-executing dependency through it.

### [finding:R19-F003] [disposition:accepted]

`probeCompletion` remains strictly read-only. After it returns an already-complete result, the write-authorized caller schedules `repairTransitionCommit` through `runPostCommitTail`; no mutation occurs inside the probe, and repair failure remains an ordered success warning.

### [finding:R19-F004] [disposition:accepted]

Hydration now handles the GC race explicitly. A spilled-head not-found response forces one fresh issue-body read: a changed pointer is retried once, while damage is diagnosed only when the currently referenced pointer still resolves missing or altered. The hot-read accounting and conformance tests include this bounded retry.

### [finding:R19-F005] [disposition:accepted]

The cap is now derived with an explicit reserve: 96 retained IDs using a 96-byte ASCII-safe grammar, at most 384 canonical bytes per entry, a 1,536-byte envelope, and a 2,048-byte wrapper. The base64url worst case is 51,200 bytes and the complete comment at most 52 KiB, leaving 8 KiB below the 60 KiB cap. Exact runtime excess returns named `resident-action-ledger-budget` before effects rather than an internal-contract failure; retained-union excess remains `resident-action-definition-cap`.

### [finding:R19-F006] [disposition:accepted]

The algorithm now builds one immutable `gateContext` from the final locked snapshot, including skipped-action evidence. After the gate, the transition uses that exact object or a shallow copy adding only verified `damageCarry`. No guard-visible field is rebuilt, recomputed, or changed.

## Owner verification request

Please verify the six dispositions against the committed artifact and re-evaluate the complete architecture for implementation readiness. In particular, confirm that best-effort commit provenance can no longer wedge first resident execution, benign spill collection cannot create false damage, and the grammar consolidation is safe for the fail-closed Bash hook. Accept only if no blocking or major contradiction remains for #1117 as the prerequisite to reshaped #937.
