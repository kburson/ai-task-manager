<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7795fb1d176c552e21d0a11e715926e9"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-09-1939-artifact-references-review-records-design.md"
artifact_commit: "a4bae019462b8771dbf97fbed6f8f7152f9e263b"
artifact_blob: "1df9dbd96db98a6ec8b8dabf01b7058046aa2be3"
artifact_digest: "sha256:9726515d37326409d7df925043ac15d5f111946d9b739710a5e9c0a7b13c56b9"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:793fb00d66e5548993448a8ead48857597b364e40aa36b2e94411da64b748cfe"
  identity_source: "runtime"
started_at: "2026-10-09T16:25:52.457Z"
submitted_at: "2026-10-09T16:45:09.857Z"
finding_ids: ["R2-F001","R2-F002"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed revision `sha256:9726515d…56b9` against author response 1 and the current branch code. I checked each R1 disposition against the revised text and, where the author cited code, against the source.

R1 dispositions, verified:

- **R1-F001 (resolved).** The marker is capped at 16 KiB. The whole-body ceiling is 57,344 bytes and 57,344 scalars. Typed pre-reservation refusals are `artifact-reference-body-budget-exceeded` and `artifact-reference-marker-budget-exceeded`. The GitHub limit is honestly qualified as observed rather than officially documented.
- **R1-F002 (resolved).** There is a 32,768-byte/scalar summary cap, deterministic three-tier compaction that keeps every round reachable, and a `review-summary-budget-exceeded` refusal before any effect.
- **R1-F003 (resolved).** The marker is registered in `body-invariants.mjs` and mirrored in `gh-edit-guard.mjs`, which already holds a mirror registry (`gh-edit-guard.mjs:104-118`). Revision-advance validation is specified, and lost authority on enrolled issues reports `artifact-authority-lost` instead of reopening fallback. The named test files exist: `body-invariants.test.mjs` and `gh-edit-guard-body.test.mjs`.
- **R1-F004 (resolved).** The precedence change is now declared as an intentional, stricter `legacy-precedence-conflict` that reports the former selection, with an inventory step and fixtures.
- **R1-F005 (resolved).** The inline `@ hex7-40` grammar is recognized. Unique-prefix expansion is recorded with provenance, and ambiguous or missing pins refuse rather than becoming absent. Inline and separate pins must agree or raise `artifact-reference-pin-conflict`.
- **R1-F006 (mostly resolved).** The grammar is now concrete. Standalone bold group labels such as `**Design Specification**` contain a space, so `metadata-section.mjs` `FIELD_RE` (`[\w][\w-]*`) does not parse them as fields. They are inert, and the hyphenated field keys parse as flat fields. The shape consumers and their tests are inventoried; `plan-metadata-exit-guard.test.mjs` and `body-sections.test.mjs` exist. One residual defect remains, which I file as R2-F001 below.
- **R1-F007 (resolved).** Digests use `sha256:` plus lowercase hex. The `previousRecordDigest` preimage is the raw prior manifest blob, with a `previousRecord` reference, no self-hash, and shared golden fixtures.
- **R1-F008.** The author's correction is accurate. `journal-authority.mjs:92` calls `assertSyntheticContext` (`protocol.mjs:51-56`), which rejects issue numbers below 1,000,000, so reusing it directly for live publication would be wrong. The named production seams exist: `runtime-storage.mjs`, `evidence-v2/execution-context.mjs` and `issue-mutator-lock.mjs`.
- **R1-F009 (resolved).** Fixtures are captured from the exact commit with recorded digests. I did not independently recompute the two #1901 digests, because the GitHub API was not available to this session.
- **R1-F010.** Decline accepted. #1939 requires backheal, and the revision now gates it behind later decomposed stories, independent JIT review and a separate pilot.

One new required defect remains. The display grammar reuses legacy *operational* field keys (`Decomposition-plan`, `Accepted-specification`, `Accepted-plan`) as display keys whose values are Markdown links. The rollout explicitly has display and bare operational fields coexisting until every consumer migrates. At least one unmigrated gate, `decomposition-plan-exit-guard.mjs`, reads the visible `Decomposition-plan` value directly as a filesystem path today. That collision breaks epic Plan→Develop admission during rollout, and the spec does not resolve it.

I did not run commands or tests.

## Findings

### R2-F001 — Display field keys collide with legacy operational keys during the coexistence window

Severity: required.

"Concrete flat display grammar" puts `Accepted-specification` under Design Specification, `Accepted-plan` under Implementation Plan, and `Hydration-record` and `Decomposition-plan` under Backlog Hydration Plan. Their values are "meaningful links": summary-comment, immutable-record and blob URLs. Three of those keys are also legacy operational authority fields in the legacy mapping table (`Accepted-specification`, `Accepted-plan`, `Decomposition-plan`). "Human metadata" and "Rollout" keep "duplicate bare operational fields" visible until "every consumer supports v1", and roll consumers forward incrementally ("Ship read support … first … Then ship dual-compatible writers and migrate every inventoried consumer"). So a body can carry both the display field and the bare operational field under the same key, while some consumers still use the legacy string readers.

Concrete current code path: `decomposition-plan-exit-guard.mjs:76` and `:160` call `linkedDecompositionPlanPath(body)`. That function (`decomposition-policy.mjs:193-196`) takes `visibleMetadataFieldValue(body, 'Plan Metadata', 'Decomposition-plan')`, strips only an `@ sha` suffix, and passes the result as `overridePath` to `resolvePlanPath`. `metadataFieldValue` returns the **first** matching line in section order.

Failure scenarios:

1. **Display before bare field.** The spec orders groups display-first ("Reviews precede accepted artifact metadata"; "The single machine marker follows the projection"), so an epic renders `- **Decomposition-plan**: [plan](https://github.com/<repo>/blob/<sha>/docs/…/plan.md)` ahead of the bare `- **Decomposition-plan**: docs/…/plan.md`. The unmigrated guard then resolves the Markdown link text as a repository-relative path, `resolvePlanPath` returns "plan path is not a readable file", and epic Plan→Develop decomposition evaluation fails, or classifies an empty plan. The same happens after bare fields are hidden if any reader was missed.
2. **Bare field first.** The legacy reader works, but the v1 resolver now sees two substantive `Decomposition-plan` values (a path and a link). Under resolver step 4 ("conflicting substantive values refuse") and "Conflicting substantive legacy keys still refuse", it must either refuse or apply an unstated link-vs-path equivalence rule. The "Accepted Markdown links are recognized only after … immutable blob identity validates and agrees with explicit fields" rule covers Accepted-* links, but it does not cover `Decomposition-plan`, and it does not define how a display line is distinguished from a legacy operational line with the same key.
3. **Human edits a display link.** "Human reordering and decorative links do not change bindings" holds for the v1 resolver. But a legacy reader consuming the same key *does* change behavior, so the display projection is not actually authority-inert during rollout.

The spec states "Recognized visible labels remain cross-checks; machine roles supply authority", but it never says which lines are projection and which are legacy input when keys coincide.

## Required changes

1. **R2-F001:** Choose one option and state it:
   - (a) Give display fields a namespace disjoint from every legacy operational key in the mapping table. For example, `Decomposition-plan-link`, `Accepted-plan-link` and `Accepted-specification-link`, or a `Display-` prefix. Require legacy string readers and the v1 legacy-key parser to ignore the display namespace.
   - (b) Forbid emitting a display field whose key matches a legacy operational key until that key's bare field is removed *and* every inventoried reader of that key uses the common observation, and enforce this in the renderer.

   Either way, add the consumer `decomposition-plan-exit-guard.mjs` (`linkedDecompositionPlanPath`) to the coexistence-window test matrix. Add a fixture in which an epic body carries both the display and bare forms (in each order) and still passes or refuses Plan→Develop exactly as before. Add a fixture proving that a hand-edited display link changes neither v1 nor legacy resolution.

## Optional suggestions

### R2-F002 — State that the 57,344 whole-body ceiling scopes to artifact-reference and backheal effects only

"Whole-body and summary budgets" says "the final issue body must fit 57,344 UTF-8 bytes" without naming which writers enforce it. If ordinary governed body writers (lifecycle markers, AC stamping, deep-dive posting) also adopt the ceiling, existing legacy bodies between 57,344 and 65,536 characters would start refusing routine lifecycle writes that succeed today. Say explicitly that the ceiling gates artifact-reference marker writes, v1 enrollment and backheal effects only. Say that an over-ceiling legacy body is reported as `artifact-reference-body-budget-exceeded` for enrollment but never blocks ordinary lifecycle mutation.

## Decision

revisions-requested
