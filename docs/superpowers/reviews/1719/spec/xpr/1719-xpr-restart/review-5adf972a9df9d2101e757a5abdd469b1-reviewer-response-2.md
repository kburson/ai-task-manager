<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-5adf972a9df9d2101e757a5abdd469b1"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-20-1719-story-token-cost-design.md"
artifact_commit: "51fa447740becf3e90b1ee90c76158b5c4e8ab60"
artifact_blob: "561cdfaf5b2fa547eaa156ffbc420eaca86f97b5"
artifact_digest: "sha256:1a47930a8c54c29d64b6b06abca9f1291d3d6f9362e6d7289b58ef18e9b990a9"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:ec62c7cc672ee56180cc262823c862e792b2aaf047d5580768ebf905d74b4a6e"
  identity_source: "declared"
started_at: "2026-09-21T05:09:59.239Z"
submitted_at: "2026-09-21T05:24:50.134Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Turn 2 of review `review-5adf972a9df9d2101e757a5abdd469b1`, reviewing artifact
commit `51fa447740becf3e90b1ee90c76158b5c4e8ab60`.

**R1-F001 is fixed, with a better resolution than either option I offered.** I
proposed a tolerant cost read (option a) or an honest scoping of the claim
(option b). The author correctly rejected both as insufficient and chose
transport isolation instead, and the reasoning in the disposition is right: a
tolerant catch confined to the cost report would have left
`resolveLifecycleGateEvidence`, workflow-preflight, and the estimation
projections exposed, because those readers fail during the shared parse and
never reach a cost-specific code path; and a tolerant shared reader would have
weakened the governance fail-closed contract that the store's existing test at
`github-comment-store.test.mjs:115` deliberately pins. Putting cost evidence in
a disjoint `aitm-cost-record` namespace removes the failure domain rather than
catching inside it. That is the stronger fix and I accept it.

I verified the load-bearing claim — "Its name cannot match the existing generic
`claimsAitmRecord` predicate" — by hand against every live generic claimant
predicate in the repository. There are exactly three, and they are the same
shape: `github-comment-store.mjs:158`, `record-envelope.mjs:36` (`MARKER_RE`,
with the additional `(?=\s)` lookahead), and an independent copy at
`scripts/reports/generate-value-report.mjs:307`. All three require the literal
`aitm-record` immediately after the comment opener and optional whitespace. A
body whose marker reads `aitm-cost-record` cannot match any of them: after the
opener, `\s*` consumes the space and the matcher then requires `aitm-record`
against the text `aitm-cost-record`, which fails at the fifth character, and
backtracking `\s*` to zero width only fails sooner. No other position in a
well-formed cost body can supply a second opener, because the existing
canonicalization at `record-envelope.mjs:266` rewrites every double hyphen —
and the artifact now additionally requires the rendered comment, escaped JSON
included, to be tested against that constraint before publication, with a
matching security-and-compatibility test.

I also confirmed the ordering of the generic reader is safe for the new
namespace. `listIssueCommentsSince:350-357` and
`parsePreloadedIssueComments:204-210` call `validateCommentNode` on **every**
node before the claim check, but that function inspects only GraphQL node shape
and issue/repository correlation, never body content, so a cost-namespace
comment passes it and is then skipped at the `claimsAitmRecord` guard before any
envelope parsing. Cost comments therefore cannot reach `parseComment`, which is
the sole throw site that aborted the whole-issue read. The isolation holds at
the exact line where the original defect lived.

The rest of the fix is complete and the parts I would have checked for
over-reach are handled:

- The stale reuse claim is gone. The Agent Cost Ledger section now says the
  generic comment-store reader "must not be reused unchanged for cost
  evidence," replacing the earlier text that asserted reuse of the comment-store
  contract wholesale. I found no remaining sentence in the artifact that claims
  cost evidence rides the generic reader.
- The isolation is not a blanket error swallow. "Do not globally catch record
  errors or trust a malformed payload's claimed record type to exempt it from
  governance validation" forecloses the naive implementation, and "Governance
  records must never be accepted through this tolerant namespace" closes the
  inverse direction.
- Tolerance does not become false completeness. An unparseable cost candidate
  with unproven attribution blocks certifying coverage, and a transport-wide
  enumeration or provenance failure yields unavailable coverage, never
  complete. That preserves the design's central honesty invariant, which was my
  main concern about any tolerant read.
- The residual is scoped honestly rather than papered over. Deliberate external
  relabeling of a comment into a generic governance claimant retains the
  existing fail-closed policy, and the artifact says so explicitly. That
  residual is a pre-existing property of the store, independent of this design;
  my finding was that this design must not enlarge the failure domain or assert
  a property the foundation does not provide, and both are now true.
- Acceptance case 12 is the case I asked for and then some: it names all four
  consumers, requires governance results identical to an issue without cost
  comments, covers noncanonical, oversized, missing-marker, and quoted-marker
  variants, and adds the negative control that malformed **generic** claimants
  must still fail closed. The quoted-marker variant covers the sharpest trigger
  I described, and the "cost-generated diagnostics/projections cannot emit
  either raw marker" clause closes the self-poisoning route through the
  projection comment.

All three optional suggestions were adopted, and two were strengthened beyond
what I suggested:

1. The secret-policy section now names the `auth`/`pat` key-fragment trap
   alongside the existing `sourcePath` example and, better than a rename
   guideline, requires a bounded non-secret capability projection with safe keys
   instead of serializing an adapter configuration object. That removes the
   class of problem rather than one instance of it, and keeps credential setup
   out of durable evidence entirely.
2. The size bound is now stated against the complete canonical
   HTML-comment-escaped envelope and the final rendered body including marker
   and visible prose, with "Raw payload size is not sufficient: escaping can
   expand bytes" made explicit. That matches where the ceilings are actually
   enforced (`record-envelope.mjs:279` and `:281`).
3. The frozen identity is now enumerated — `recordId`, `createdAt`,
   `authority.grantId`, `authority.epoch`, `authority.actor`, links, payload,
   visible prose, marker version, and exact rendered body — and the Duplicate
   event section now says an equal payload hash alone cannot prove write
   completion. That is the correct strengthening given the byte-exact comparison
   at `github-comment-store.mjs:223`, and acceptance case 13 pins it. The source
   vs. envelope epoch ambiguity is called out in the outbox section.

On the author's verification note about the escape example: my turn-1 text
spelled the replacement as the seven-character sequence and stated the
two-bytes-to-seven expansion, so we agree on the behavior and on its
consequence for the bound. The revised specification states it unambiguously,
which is what matters.

The five findings from the prior review `review-bd4fbcca64d8f812251c3846d92bb100`
remain resolved. I re-read the sections carrying those resolutions — Existing
AITM foundations, Timing Log authority, Secret-policy-compatible
representation, Event identity, and Observation and delta — and found no
regression from this revision. The accounting architecture is unchanged and I
continue to have no objection to it.

I have no findings and no required changes. Three optional suggestions follow;
none is blocking, none needs a further review round, and all three are safe to
fold into implementation planning. **Decision: accepted.**

### Verification method and limits

I read the revised specification in full, the author response, and current local
source in this worktree. As in turn 1, my session was permission-scoped to the
`peer-review` join and submit commands, so I could not execute `node` to run the
predicates against candidate bodies; every claim above is derived by source
reading and hand trace, with the exact file, line, and predicate stated so the
author can reproduce it. I ran no Git command and do not independently attest
the commit or the blob. I made no network call and did not recheck the provider
documentation links. I did not verify the author's Prettier, Markdown-lint, or
whitespace results.

This response deliberately avoids reproducing bare HTML-comment opener
sequences in prose; marker grammars are cited by name and source line instead.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. **Duplicate-event phrasing in the Capture transaction now lags the
   strengthened rule.** The Duplicate event section correctly requires "the
   intended record identity and exact frozen body" and states that an equal
   payload hash alone cannot prove write completion. The Capture transaction
   retry paragraph still carries the pre-revision phrasing: "Retries replay the
   frozen identifiers and payload without resampling … An exact duplicate is an
   idempotent success. A conflicting payload for an existing event/source
   identity fails closed." Read alone, "exact duplicate" and "conflicting
   payload" invite exactly the payload-only comparison the other section now
   forbids, and "the frozen identifiers and payload" is narrower than the frozen
   identity the outbox section enumerates. Nothing here is contradictory and
   acceptance case 13 forces the correct behavior regardless, so this is
   consistency rather than correctness — but pointing the retry paragraph at the
   enumerated frozen identity would remove the ambiguity for whoever writes the
   plan from that section.

2. **The rollout sequence does not name its two hard prerequisites.** This
   design now carries two sequencing constraints that are stated as absolutes in
   their own sections: the composed trailing-suffix grammar must land in
   `lib/timing-row-reader.mjs` "before any writer emits it," and the
   `aitm-cost-record` transport and codec must exist "before enabling any cost
   writer." Both are correctly stated where they are. Neither appears in the
   six-step Migration and rollout list, whose step 2 ("Add the durable outbox
   and immutable ledger records") is precisely the step both constrain. An
   implementation plan drafted from the rollout list alone would sequence the
   writers ahead of the reader work and hit the live
   `timing-row-reader:estimation-row-sec` throw and the unisolated transport.
   Adding both as explicit predecessors to steps 2 and 3 would make them
   impossible to miss.

3. **State that the cost record-type allowlist must be disjoint from the
   existing record-type sets.** The isolation section says only an allowlisted
   cost record type may use the cost namespace, but does not constrain the names
   themselves. The repository already attaches behavior to specific `recordType`
   values: `CAPSULE_TYPES` at `capsule-chain.mjs:5-20` (fourteen names, swept
   into the capsule chain by `isCapsuleRecordType`), the delivery-contract
   branch at `record-envelope.mjs:131-133`, and the forecast, outcome, and
   rubric branches at `:151-163`. Plausible cost names such as
   `agent-cost-event` collide with none of them today, so this is prophylactic
   rather than a live defect — but a one-line disjointness requirement would
   ensure that a cost envelope which ever lands in the generic namespace by
   mistake is inert there instead of being swept into the capsule chain or
   routed through a contract validator. It also documents the constraint for
   whoever adds the next cost record type.

## Decision

accepted
