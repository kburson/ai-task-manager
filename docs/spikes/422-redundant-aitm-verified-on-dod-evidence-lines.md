# #422 — redundant `aitm-verified` declaration on lines already carrying `aitm-dod-evidence`

**Status:** complete (2026-06-16)
**Type:** defect analysis + writer-side fix
**Trigger:** on every functional-DoD checklist line two markers coexist —
`<!-- aitm-dod-evidence key="…" cmd="…" exit="0" sha="…" ts="…" -->` (rich
execution proof) and `<!-- aitm-verified cmd="…" -->` (cmd-only declaration).
The declaration's `cmd` is a strict content subset of the evidence marker, so on
those lines it is redundant. Observed live on closed `#325` line 89 and `#328`
line 63.

This doc records the reader audit (AC1) and the chosen fix decision (AC2). The
code change lives behind AC3–AC6 (test-verified).

## Summary

No reader independently requires an `aitm-verified` declaration on a checklist
line that already carries an `aitm-dod-evidence` marker. The declaration is
redundant on functional-DoD lines and, worse, latently hazardous (it can trip a
spurious pre-tick detection). Decision: **suppress** — guard the per-line
declaration append so the writer skips any line already carrying an
`aitm-dod-evidence` marker; plain checklist lines (ACs with no evidence) still
get the declaration exactly as before.

<!-- AC1-anchor: reader-audit-complete -->

## AC1 — Reader audit

Audited every gate/reader that consumes the `aitm-verified` declaration to
determine whether any of them requires it on a line that already carries
`aitm-dod-evidence`. None do.

- **`hasExecutionProof`** — `scripts/task-tracker/lib/proof-marker.mjs:143`.
  Parses ONLY the `aitm-verified`/`aitm-verified-at`/`aitm-verified-by` grammar
  and returns true only when a ts/sha/evidence key is present. It does NOT parse
  `aitm-dod-evidence`. So a functional-DoD line proven via `aitm-dod-evidence`
  but stripped of the `aitm-verified` declaration reads as `hasExecutionProof =
false` — but nothing on a functional-DoD line consults `hasExecutionProof` to
  gate its tick (that gate runs through the functional-DoD evidence reader
  below), so suppression is safe.
- **Functional-DoD reader** — `scripts/task-tracker/lib/functional-dod-evidence.mjs:54`
  (`extractCommands`) + `parseEvidence` (77) read `aitm-dod-evidence`
  (new + legacy forms); the declaration is consulted only as a fallback guarded
  by `!hasExecutionProof`. The `check` verb's functional-DoD gate ticks from the
  `aitm-dod-evidence` marker, not the declaration.
- **`review.mjs`** — `scripts/task-tracker/verbs/review.mjs:340`. The prose
  checkbox audit only covers sections `acceptance criteria` and
  `definition of done`; functional lines live in section
  `functional (verified at test)` and never enter `proseCheckboxes`, so review
  does not require the declaration on them.
- **approve verb** — posts review notes + stamps `aitm-full-auto-approved`; reads
  no per-line `aitm-verified` declaration on functional-DoD lines.
- **evidence-markers audit** — `scripts/task-tracker/lib/evidence-markers.mjs:101`
  (`auditEvidenceMarkers`). `missingEvidence` is computed over
  `acceptanceCriteria` only, not functional-DoD lines.

**Latent hazard reinforcing suppression:** `detectFunctionalPretick`
(`scripts/task-tracker/lib/lifecycle-dod.mjs:207`) un-ticks any ticked functional
line where `hasVerifiedDeclaration(rest)` is true. A proof-bearing line that
still carries the redundant declaration can therefore be spuriously un-ticked —
another reason to stop emitting the declaration on evidence-bearing lines.

<!-- AC2-anchor: decision-suppress -->

## AC2 — Decision: suppress at the declaration writer

- **`keep` rejected:** no reader requires the declaration on evidence-bearing
  lines (AC1), and keeping it risks the `detectFunctionalPretick` spurious-untick
  hazard.
- **Chosen: suppress.** Guard the per-line declaration append in
  `buildEvidenceBackfill` (`scripts/task-tracker/lib/evidence-markers.mjs`, the
  sole call site of `buildMarker`) with an existing-`aitm-dod-evidence` check: if
  the target line already carries an `aitm-dod-evidence` marker, do not append the
  `aitm-verified` declaration. Lines with no evidence marker (ACs) still receive
  the declaration unchanged.

**Out of scope** (per issue): changing the marker grammar, rewriting the
historical corpus, and the template/heal double-stamp in
`heal-functional-dod.mjs` (the issue scopes the fix to the declaration writer in
`evidence-markers.mjs`).
