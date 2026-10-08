<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7ab4a2020215fd8c5d63b00c7253dcdb"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md"
artifact_commit: "bb24dd7ec75c43e3cb0acfbe4803d51a58ef3cd8"
artifact_blob: "b47734b6626d971a5d67a879c03bebc2c928c84f"
artifact_digest: "sha256:6e6e0aae4f1764850701f4f0be0b4593dfde8f1b84e968652b6cdf7b7bcd958f"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:bd6c5d5a4a396b3f569c9b1acf45178ef4500e8f19a591d7de0d825207730f55"
  identity_source: "runtime"
started_at: "2026-10-08T21:01:26.774Z"
submitted_at: "2026-10-08T21:43:27.288Z"
finding_ids: ["R3-F001","R3-F002"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Round 3 reviews the revised spec at artifact commit `bb24dd7e`, checked against author response 2. I re-read the full post-round-1 tail, sections "Publication identity, reallocation and sealed-source compatibility" through "Pending versus terminal availability", for consistency with the earlier body.

**R2-F001: resolved.** "Model activation belongs to the shared comment" moves model authority onto one immutable `aitm-duration-model:v1` marker in the canonical Timing Log. The marker carries the effective stable source tuple, operation identity, minimum reader release and the actual recording time:

- Every release-N participant must honor the marker regardless of local `timingDurationModel`, or refuse with `duration-model-unsupported`. A kill switch refuses and never downgrades.
- Local configuration only authorizes requesting activation.
- Post-activation legacy-grammar rows are diagnosed as `post-activation-legacy-row` and are never silently accepted.
- Mixed-segment scalars report a `legacy-segment-unconverted` remainder instead of blending heuristic and event totals.
- Historical apply writes or validates the same marker in the same mutation and cannot move an immutable tuple.

That closes the participant-local scope gap. It also composes with the full-projection convergence contract: a release-N writer whose stale snapshot predates activation sees the marker on read-back and rederives under the logged model.

**R2-F002: resolved.** "Ordinary appends preserve unfillable protected slices" states that an ordinary append is never refused over an unfillable pending slice on a protected row:

- The uncredited pre-cutoff portion becomes terminal-unavailable (`sealed-source-protected`) in the successor's reason and known-subtotal payload.
- The new row owns only its post-cutoff window, and protected bytes stay exact.
- Refusal is reserved for true late insertions inside the region.
- Previously credited protected slices are not re-marked.
- Conservation explicitly accounts for unassigned protected extent.

The cross-reference added near line 193 removes the earlier contradiction.

**R2-F003 and R2-F004: resolved.** The closing-evidence rule is now symmetric for Idle. The availability states `known`, `fillable-pending` and `terminal-unavailable` are defined. Existing recovery and finalize events terminalize unknown tails without inventing an end. Board fields persist only complete values and keep null/Unknown otherwise, with provenance in the projection. Close and calibration keep existing incomplete-outcome handling. Deferring a dead-session operator command to the #1858/#1857 runtime scope is reasonable and consistent with the issue's Out of Scope.

I found no remaining correctness, consistency or scope defects that require another revision. The spec is internally consistent, matches the #1901 Scope and AC1–AC6, preserves the #1854 required results (51 / 453660 / 133 / 5 / 901), and leaves implementation, Plan approval and historical apply authority with their governed gates. Two non-blocking clarity suggestions follow.

## Findings

None.

## Required changes

None.

## Optional suggestions

### R3-F001 — Consolidate or add a precedence note before writing the implementation plan

The spec now spreads normative rules across the original body and three appended "XPR clarifications" and "XPR round 2" sections. Several early sentences are correct only together with a later override:

- line 93: boundaries partition only evidenced lanes;
- line 151: rollout under the later contract;
- line 193: ordinary appends defer to the protected-pending rule;
- line 219's review-choices list, which still names "partitioned shared boundaries" and omits the canonical activation marker.

An implementer reading top-down can miss the binding later text. Before or during implementation planning, consider one of two fixes. Either fold the XPR sections into their topical sections, or add a one-line precedence statement at the top saying the XPR sections are normative and override earlier wording where they are more specific. Also refresh the line-219 review-choices summary.

### R3-F002 — State what carries the marker on a future-only activation

The text says that "admits the activating source row and marker together" and that the tuple "is not a newly invented timing event". For historical conversion, the activating row is an existing unprotected row whose suffix the repair rewrites. For a future-only activation, it is not explicit whether either of these holds:

- the marker rides on the next ordinary producer row that the rollout action publishes, which then needs a real triggering event;
- the rollout action itself emits a sanctioned row.

State which one applies, so the implementation plan does not have to choose between delaying activation until the next organic row and inventing a row.

## Decision

accepted
