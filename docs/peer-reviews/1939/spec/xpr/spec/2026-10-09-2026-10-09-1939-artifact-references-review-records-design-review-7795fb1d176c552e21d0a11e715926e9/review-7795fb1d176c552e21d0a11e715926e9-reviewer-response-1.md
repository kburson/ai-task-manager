<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7795fb1d176c552e21d0a11e715926e9"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-09-1939-artifact-references-review-records-design.md"
artifact_commit: "3621d94ab1f6d276f6558dfa8bb4e3a1ef7c1682"
artifact_blob: "4155688eaaf3686726be0a363f4e30bdec7981c3"
artifact_digest: "sha256:082fe12c903c2b11a51d63dfc99e8fd6606258bc61633cb7e84876c78d98f66a"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:793fb00d66e5548993448a8ead48857597b364e40aa36b2e94411da64b748cfe"
  identity_source: "runtime"
started_at: "2026-10-09T16:25:52.457Z"
submitted_at: "2026-10-09T16:28:42.007Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007","R1-F008","R1-F009","R1-F010"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed the r2 specification bytes (`sha256:082fe12c…f66a`) against the current consumer code on this branch: `decomposition-policy.mjs`, `user-story-quality.mjs`, `split-plan.mjs` (lib and verb), `decomposition-wbs-coverage.mjs`, `decomposition-plan-exit-guard.mjs`, `decomposition-delivery-readiness.mjs`, `plan-exit-plan-metadata-guard.mjs`, `refinement-snapshot.mjs`, `body-invariants.mjs` and the evidence-v2 journal-authority modules. I also read the SAR record README for lineage context.

The design direction holds up. Making a validated machine record the authority and treating the visible display as its projection is the right call. The role/revision separation and the A/B/C conflict fixture are precise. The publication and backheal transactions are honest about GitHub's lack of multi-object CAS. Absence modelling ("never invent a document or decision") is unusually rigorous.

The spec is not ready to accept yet. It misses four concrete platform and code constraints that the implementation will hit on day one:

- The marker size cap equals GitHub's whole-body limit, and the rendered summary comment has no size bound.
- The new authority marker is not protected by the existing marker-loss invariant.
- The legacy role mapping silently changes current Source-plan/Plan precedence, which will refuse children that pass today.
- The legacy inline `path @ <sha>` grammar and abbreviated commits are not mapped.

Two contract gaps also need closing: the rendered Plan Metadata grammar relative to existing flat-field guards, and the digest encoding and `previousRecordDigest` preimage. Each gap is small to fix in prose, but each one would otherwise be settled ad hoc during implementation, in a different way by each consumer.

I did not run any commands or tests. Claims about live GitHub limits come from GitHub's documented 65,536-character body/comment maximum, not from a probe in this session. I could not inspect live #1901/#1939 issue bodies (shell access was not available to this reviewer session), so findings about the #1901 fixture are limited to what is checked into this branch.

## Findings

### R1-F001 — Marker size cap consumes the entire GitHub issue-body budget

Severity: required.

"Artifact-reference contract v1" sets the limit at "64 KiB, 32 artifacts, 64 review references; overflow refuses rather than truncates." GitHub caps an issue body at 65,536 characters, and 64 KiB is 65,536 bytes. A marker at the permitted ceiling leaves no room for the rest of the body: Scope, Acceptance Criteria, the required substantive Deep-Dive prose (which "Rollout" says must remain in the body), DoD and the other `aitm-*` markers. A marker well under the cap can still push an existing large body over GitHub's limit. The spec defines no whole-body budget check, so the failure shows up as a remote 422 in the middle of a governed write or a backheal effect, not as a typed pre-write refusal.

Failure scenario: a root epic with a long deep dive (#1901-class bodies are large) gains enough review references during backheal that body + marker exceeds 65,536 characters. The `issue-body` transaction fails at transport, the journal records an indeterminate effect, and recovery logic designed for ambiguous transport has to reconcile a deterministic refusal.

### R1-F002 — Consolidated review summary comments have no size bound or overflow behavior

Severity: required.

"Consolidated publication" mandates exactly one summary per artifact/kind/method with "never mint keys per round or restart". Each summary must contain an "ordered round table with immutable response/disposition links" across all instances, plus record/manifest links. GitHub comments share the 65,536-character cap. The envelope's size limits ("Strings/document arrays use the artifact-record size limits") bound the manifest, not the rendered comment. Long-running reviews with many rounds, superseded instances and per-round links can exceed the comment cap. The one-summary-per-key invariant then forbids the obvious workaround of a second comment.

Failure scenario: a plan XPR with several superseded instances and 10+ rounds per instance renders past the cap. Publication fails at step 3 or 4 on every retry ("at most three guarded attempts per effect; persistent drift is a conflict"). The issue is permanently stuck in pending publication, and there is no specified degraded rendering.

### R1-F003 — `aitm-artifact-references` is not protected by the marker-loss invariant

Severity: required.

`mutateIssueBody` refuses writes that drop invariant markers via `findLostMarkers` in `scripts/task-tracker/lib/body-invariants.mjs`. The current invariant set (`aitm-fields`, `aitm-body-version`, `aitm-stage-rollup`, `aitm-refine-complete`, `aitm-plan-approved`, deep-dive markers, last-known-state, `aitm-entered-*`, and others) does not include the new `aitm-artifact-references` marker, and the spec does not add it. The spec makes this marker the sole binding authority once visible operational fields are hidden. Any ordinary governed body mutation that regenerates or rewrites Plan Metadata could therefore drop the authority without a refusal. The marker also carries a monotonically increasing revision, and nothing currently refuses a write that lowers that revision or replaces the marker with a lower one.

Failure scenario: after migration hides the bare Source-plan fields, a template-regenerating body write (for example a Plan Metadata normalization pass) omits the HTML comment. `MarkerLossError` does not fire. The child loses its source-plan binding, and the resolver now reports absent authority rather than conflict. Under "Generic specification fallback is permitted only when no reference is declared", that can even re-enable the generic default.

### R1-F004 — Legacy mapping silently changes current Source-plan vs Plan precedence

Severity: required.

Today both `decomposition-policy.mjs::linkedPlanReference` (`PLAN_METADATA_KEYS = ['Implementation-plan', 'Source-plan', 'Plan']`) and `user-story-quality.mjs::planReference` choose **Source-plan ahead of Plan** as the active plan. The spec's legacy table makes `Plan` an implementation-plan alias and says Source-plan "supplies implementation-plan only when neither Implementation-plan nor Plan declares an independent active plan". For a legacy body with both `Source-plan: A` and `Plan: B`:

- Today: the active plan is A. `selectStoryIntentTask` compares active A with source A, they match, and Story Intent resolves.
- Under the spec: the active plan is B and the source is A. Per the consumer table ("source task intent only when active identity equals selected source identity; otherwise conflict"), Story Intent and Plan approval now refuse, and executable-plan consumers read B instead of A.

"Current behavior" names `linkedPlanReference` as selecting "the first substantive Implementation-plan, Source-plan or Plan field", so the author knows the current order, but nowhere is the reversal declared as intentional. "Legacy-only bodies normalize to an in-memory legacy observation without automatic writes" reads as behavior-preserving, which contradicts the table.

### R1-F005 — Legacy inline `path @ <sha>` grammar and abbreviated commits are unmapped

Severity: required.

Both current readers strip a trailing `\s+@\s+[0-9a-f]{7,40}` suffix from plan values (`linkedPlanReference`, `linkedDecompositionPlanPath`, `user-story-quality.mjs::withoutCommit`). That grammar is live legacy data: it embeds a commit pin in the path value itself, and it accepts 7–40 hex abbreviations. The spec's legacy table only names separate commit fields (`Source-plan-commit`, `Accepted-plan-commit`, `Specification-reference-commit`). Resolver step 2 requires "full commit identity", and the spec says "Missing commits remain unpinned", but abbreviated-but-present commits are neither. Nor does the spec say what happens when an inline suffix and a separate `*-commit` field both exist and disagree.

Failure scenario: a legacy child body `Plan: docs/…/plan.md @ 1a2b3c4` hits one of three outcomes depending on the implementer: it is treated as unpinned (the supplied pin is lost, violating "Preserve every supplied commit"), it is refused as malformed (a legacy body that works today now blocks), or it is expanded against today's object database (an ambiguous prefix could resolve differently over time).

### R1-F006 — Rendered Plan Metadata grammar is unspecified relative to existing flat-field guards

Severity: required.

`plan-exit-plan-metadata-guard.mjs` refuses Plan→Develop unless Plan Metadata has at least one substantive non-provenance flat `- **field**: value` entry, and it refuses any nested heading. Its header comment says "Comments and prose are not planning output." The spec puts authority in an HTML comment and says "Hide duplicate bare operational fields only after every consumer supports v1". It also requires "bold Design Specification, Implementation Plan and Backlog Hydration Plan labels" with "Reviews precede accepted artifact metadata", and the durable review record "body points to" the index/manifest. But the spec never states:

- whether the three groups are bold standalone label lines, flat `- **Label**: [link]` fields, or nested lists;
- where in the body the review-summary and record/manifest pointers render, and in what grammar;
- that the generated projection must remain parseable by the existing `metadata-section.mjs` flat-field grammar and pass the no-nested-heading rule.

The plan-exit guard and the body-sections/issue-body verifiers are Plan Metadata *shape* consumers, not plan-*reference* consumers. The "Common authority resolver" inventory ("renderer, governing-spec discovery, plan selection, …") does not obviously cover them.

Failure scenario: an implementer renders groups as `**Design Specification**` label lines followed by bare link lines and hides the old flat fields. Plan Metadata then holds only the HTML marker plus non-field lines. `plan-develop-plan-metadata-empty` blocks every migrated story's Plan→Develop transition, or a nested-list rendering trips the not-flat guard.

### R1-F007 — Digest encoding and `previousRecordDigest` preimage are undefined

Severity: required.

The spec uses "raw-blob SHA-256", "digest" and "previousRecordDigest: SHA-256 or null" without a canonical encoding. Existing records in this very review already disagree: the peer-review response frontmatter uses `sha256:<hex>`, while the SAR README table uses bare hex. More importantly, `previousRecordDigest` chains publication revisions, and the spec does not say what it hashes. It could be the raw committed manifest file bytes, a canonical JSON serialization of the envelope, or the envelope minus its own `previousRecordDigest`. Divergence and stale-revision refusal ("reused revisions with different bytes or mismatched previousRecordDigest are divergent") depend entirely on that preimage being identical between the standalone producer and the AITM manual-record adapter.

Failure scenario: the standalone producer hashes canonical JSON and the AITM adapter hashes file bytes, which include a trailing newline or different key order. Every AITM-validated higher revision then fails the chain check and is refused as divergent. Or worse, each side accepts its own chain and they cannot interoperate under "compatible-v1".

## Required changes

1. **R1-F001:** Replace the 64 KiB marker cap with a marker budget well below GitHub's 65,536-character body limit (for example 16–24 KiB), and define a whole-body pre-write check. The rendered body including the marker must fit under GitHub's limit with a stated headroom, and overflow must be a typed pre-transport refusal, not an indeterminate transport effect. Note that the limit is in characters, while the marker cap is in bytes; state which unit each check uses.
2. **R1-F002:** Define a rendered-summary size budget under the 65,536-character comment cap, and a deterministic degraded rendering when the full round table would exceed it. For example: render the active instance's rounds in full, collapse superseded instances to one row each linking their immutable record, and always keep the File Under Review, outcome and manifest links. State that degradation never drops reachability, because every round stays reachable through the linked manifest. Add an oversize fixture.
3. **R1-F003:** Add `aitm-artifact-references` to the `body-invariants.mjs` invariant set so `mutateIssueBody` raises `MarkerLossError` on drop. Specify that a governed write lowering or reusing the marker revision with different content refuses. Name the test.
4. **R1-F004:** Choose one option and state it explicitly: (a) for legacy-only bodies, preserve today's precedence (`Implementation-plan` > `Source-plan` > `Plan`) and apply the new Plan-alias rule only to v1-written records; or (b) declare the precedence change intentional and specify a typed `legacy-precedence-conflict` diagnostic for bodies with both `Source-plan` and `Plan` declaring different paths. In either case, add a fixture for `Source-plan: A` + `Plan: B` with no `Implementation-plan`, and require the inventory step to enumerate live bodies with that shape before rollout.
5. **R1-F005:** Add the inline `<path> @ <hex7-40>` form to the legacy table. Specify the abbreviated-commit rule: either expand by unique-prefix resolution against the configured repository and refuse ambiguity (recording the abbreviation and expansion in diagnostics), or classify the reference as `legacy-unpinned` while retaining the supplied abbreviation. Specify that an inline suffix and a separate `*-commit` field must agree, or the reference refuses as conflicting.
6. **R1-F006:** Specify the rendered Plan Metadata grammar concretely: the group labels, the per-artifact line shape, and where review-summary and record/manifest pointers render. Require it to stay within the existing flat-field grammar so that `plan-exit-plan-metadata-guard`, the nested-heading refusal and the body-sections/issue-body verifiers keep passing. Add those shape consumers to the checked-in consumer inventory, or state why they are unaffected.
7. **R1-F007:** Fix one digest encoding for every new contract field (recommend `sha256:<64 lowercase hex>`). Define the `previousRecordDigest` preimage exactly, for example the raw committed manifest file bytes at the prior publication's immutable commit. Make both the standalone producer and the AITM adapter conformance tests share a golden fixture for the chain.

## Optional suggestions

### R1-F008 — Cite the existing authority mechanisms and complete the named consumer list

"Publication ordering and concurrency boundary" relies on "existing shared physical authority and its canonical mutation lock across worktrees", but never names the existing evidence-v2 journal authority (`scripts/task-tracker/lib/evidence-v2/journal-authority.mjs`, `runtime-capabilities.mjs`) that appears to provide it. Naming it would stop an implementer from building a second lock. Likewise, "Current behavior" names `story-intent-source.mjs`, but not `user-story-quality.mjs` (`planReference`, `selectStoryIntentTask`, `resolveStoryIntent`), `decomposition-plan-exit-guard.mjs` or `decomposition-delivery-readiness.mjs`, all of which call `linkedPlanReference` or read `Source-plan-section` directly today. The "checked-in consumer/writer inventory" requirement covers this in principle, but seeding it with these known readers lowers the risk that one is missed.

### R1-F009 — Make the #1901 fixture source reproducible on this branch

"Current behavior" points to the pinned reference index and consolidation mapping "under `docs/peer-reviews/1901/` at `5f35cf08…`". That path does not exist in this worktree, and I could not verify whether that commit is an ancestor of this branch. AC10 depends on that fixture, so state that the fixture is captured from that exact commit into tracked test fixtures (with the source commit and digest recorded) rather than read from a path that may not be reachable from trunk.

### R1-F010 — Consider a separate spec for the historical backheal/migration-authorization lane

"Historical backheal transaction" and "Narrow migration admission and authorization" introduce a new destructive capability: a protected authorization record, per-effect branded capabilities, exact-ID retirement and rollback with recreation. They have their own threat model and test matrix. Rollout already gates historical apply behind opt-in and a separate pilot. Splitting these two sections into a follow-on spec, reviewed after the read/render/publish path ships, would cut the review surface of this spec by about a third. It would also let the backheal design use real experience from the publication journal. This is a scoping suggestion, not a correctness defect.

## Decision

revisions-requested
