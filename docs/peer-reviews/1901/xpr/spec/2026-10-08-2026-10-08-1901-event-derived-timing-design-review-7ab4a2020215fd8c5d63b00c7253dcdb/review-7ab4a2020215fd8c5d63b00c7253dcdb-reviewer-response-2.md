<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7ab4a2020215fd8c5d63b00c7253dcdb"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md"
artifact_commit: "1e6f2461a1db7b2ab07119cdc57447fd60b2eb9d"
artifact_blob: "db7201ee19f1e08c7507d157c80f03861921d3b7"
artifact_digest: "sha256:c05810c5daa57b3a63663b938f36161574e97cd81b3f32a5e848222747329767"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:bd6c5d5a4a396b3f569c9b1acf45178ef4500e8f19a591d7de0d825207730f55"
  identity_source: "runtime"
started_at: "2026-10-08T21:01:26.774Z"
submitted_at: "2026-10-08T21:35:20.539Z"
finding_ids: ["R2-F001","R2-F002","R2-F003","R2-F004"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Round 2 reviews the revised spec at artifact commit `1e6f2461`, checked against author response 1 and the baseline source.

Round-1 dispositions:

- **R1-F001: resolved.** The "XPR clarifications: live convergence and evidence bounds" section replaces own-row read-back with:
  - one complete-body mutation;
  - full-projection read-back;
  - a merge of retained immutable source events on drift;
  - three bounded attempts, then typed refusal/pending with journal retention;
  - reader-side `projection-stale` refusal of authoritative totals.

  It honestly disclaims compare-and-swap. A writer whose row a stale overwrite deletes now detects that through source-inventory retention, which closes the lost-row case.
- **R1-F002: resolved in principle.** A boundary can no longer turn another lane's lone opener into an end. Only the publisher may attest its own continued engagement. Dead tails stay uncredited. Bounded observed slices survive later recovery. The legacy lane retires through the bridge. Lines 79 and 93 were rewritten, not left contradictory.
- **R1-F003: partially resolved.** The release-N reader-first approach, the explicit suffix order, the honest declaration of baseline-reader incompatibility and the list of display-sensitive consumers are good. The activation gate has the wrong scope (R2-F001).
- **R1-F004: resolved.** "Matching actor-owned closing observation" replaces the undefined phrase. The threshold and transcript heuristics are estimate-only. Preview categories and board deltas are specified, and the long-gap regression is added.
- **R1-F005: resolved.** The pre-flush is retained as an independent journaled event that owns duration up to its own tick. The pair is a separate atomic admission unit. Partial-failure retry, restart and replay cases are specified.
- **R1-F006 to R1-F008:** acceptable as dispositioned.

Revisions are still requested for two gaps introduced by the new mechanisms:

- The activation gate is participant-local, while the model change it governs is a property of a shared comment.
- R1-F002's pending-boundary fill is now routine reallocation of earlier rows, and the spec does not reconcile it with the sealed-source protected-region refusal.

## Findings

### R2-F001 — The `timingDurationModel` activation gate is participant-local, but model state belongs to the shared Timing Log

**Severity:** High.

**Spec text** ("Mixed-version rollout"): "New emission and live reallocation remain disabled by default through the repository-level setting `timingDurationModel` ... Every public producer, repair apply path and runtime adapter checks this setting."

**Baseline evidence:** `config.mjs` resolves settings through layered defaults, user and project files. `setConfigValue` writes the project JSON. The candidate key would sit beside `idleThresholdMinutes`, which is a user-overridable key in `USER_KEYS`. The effective value is therefore decided per checkout and per user. Sibling worktrees on different branches, a user-level override, or a project file not yet updated in one worktree all give different answers for the same GitHub comment.

**Problem:** Activation is described as a one-time operator rollout, but nothing records it on the shared artifact. After activation:

- A release-N writer whose local setting is still `legacy` behaves correctly by its own rules. It keeps appending legacy-model rows into a log whose other rows carry `aitm-duration:v1` projections. Examples are a stale branch worktree, a user override, or a project file not yet pulled.
- Enabled readers rederive the full projection. They then see newly appended rows with transcript-derived or Unknown cells and no duration suffix, after the activation point. The spec does not say whether those are legacy rows to reconcile, malformed rows, or `projection-stale`. Each choice gives different totals.
- The reverse also happens: an enabled writer emits into a log that other release-N participants still treat as legacy.

The operational participant inventory guards against pre-N binaries, which cannot be helped. It cannot guard against release-N participants disagreeing, because they disagree by design under a local setting.

**Required resolution:** Make the active model a property of the canonical Timing Log. One option is an immutable activation marker in the comment, written once by an explicit rollout action. It would record the model, its activation source order or tick, and the operator or operation identity. Then:

- Every release-N writer honors the marker regardless of its local setting. It emits the logged model, or refuses with a typed diagnostic if it cannot.
- The local or repository setting only authorizes placing the marker on a log. It may also serve as a kill switch that refuses publication, never one that silently downgrades.
- Readers apply the legacy model to source rows before the marker and event-delta/v1 to rows after it. Define how a legacy-grammar row appended after the marker is classified: a typed diagnostic, not silent acceptance.
- Repair apply that converts history also writes or validates the same marker.

Add tests:

- Two release-N writers with different local settings on one log.
- A legacy-grammar row appended after activation.
- A marker-present log read by a reader whose setting is disabled.

### R2-F002 — Pending-boundary fill and sealed-source protected regions conflict for ordinary appends

**Severity:** Medium.

**Spec text:**

- "Which lanes a boundary can credit": "When such evidence arrives, deterministic reallocation splits that observed window at the already recorded boundaries under the publication convergence contract."
- "Publication identity ...": "An insertion requiring protected-prefix reallocation is refused; never move its timestamp or credit it elsewhere." Also: "A proposed change intersecting those protected bytes is preview/export only."

**Problem:** After R1-F002, reallocation of earlier rows is no longer limited to rare late insertions. Every ordinary in-order append whose closing evidence spans an earlier shared boundary triggers it. A typical case is another actor's update after a lifecycle pair it did not publish. If that boundary row lies inside a protected sealed-source region, the spec gives two incompatible readings:

- (a) The ordinary append is "an insertion requiring protected-prefix reallocation" and is refused. That blocks live timing publication for that actor indefinitely, which turns a duration-projection limitation into a lost event.
- (b) The append proceeds and the protected boundary keeps its pending slice. The spec then never says which row, if any, owns the portion before the boundary. It also does not say whether that portion becomes terminally unavailable, or whether the new row may absorb it. Absorbing it would be "credit it elsewhere", which is forbidden.

Sealed approval and outcome records cover the timing prefix in exactly the Review/close window, where multiple sessions are most likely. So this is a realistic path, not an edge case.

**Required resolution:** State that an ordinary append is never refused because a pending slice on a protected row cannot be filled. Treat the slice up to the last protected boundary tick as terminally unavailable with reason `sealed-source-protected`, carried on the new row's known-subtotal and reason payload, because the protected row's bytes cannot change. The appended row owns only its observed window after that boundary. Totals expose the protected remainder as unavailable and never credit it elsewhere.

Reserve "refused" for true late insertions whose own position falls inside the protected region. Add a regression test: an actor opens before a sealed `review:approved` pair and posts its first closing update after it. The update publishes, the protected bytes are unchanged, the pre-boundary slice is reported as protected-unavailable, and conservation holds over the known windows.

## Required changes

1. R2-F001: Move the active-model decision from participant configuration onto the canonical Timing Log. Use an immutable activation marker that every release-N writer honors, refusing rather than downgrading. Readers apply per-segment models. Define how legacy-grammar rows appended after activation are diagnosed. Repair apply writes or validates the marker. Add tests for divergent local settings and post-activation legacy rows.
2. R2-F002: Specify that ordinary appends are never refused over unfillable pending slices on protected rows. Make the protected pre-boundary portion terminally unavailable (`sealed-source-protected`), never credited elsewhere, and give the new row only its post-boundary window. Restrict "refused" to true late insertions inside the protected region. Add the sealed `review:approved` spanning-update regression.

## Optional suggestions

### R2-F003 — State that the boundary-credit rule applies symmetrically to interrupted lanes

"Which lanes a boundary can credit" speaks only of engagement and closing observations. An interrupted lane crossing a shared boundary has the same issue for Idle: its partition is pending until its own `resume` arrives. A lane paused and never resumed accrues no Idle through unrelated boundaries. One sentence would stop an implementer from crediting open-interruption Idle at every boundary. That would be the Idle analogue of the round-1 inflation.

### R2-F004 — Distinguish fillable-pending from terminal-unavailable, and state the close/board behavior for permanently incomplete logs

A lane whose session never returns leaves its boundary slices pending indefinitely. The baseline already returns null totals when an actor log is incomplete (`timing-rollup.mjs:311`, `:325`; `timing-rows.mjs:421`). Under the revised rule, though, any dead foreign session that was open across a lifecycle pair makes the issue's Engaged/Plan/Review projections permanently null.

Consider these additions:

- An availability state that separates pending (a later own observation can still fill it) from terminal (protected, or closed by an explicit operator or orphan-finalize action).
- An explicit operator action that converts a dead lane's pending tail to terminal unavailable, without inventing an end.
- A statement of what close and board-field updates record when only a known subtotal exists.

## Decision

revisions-requested
