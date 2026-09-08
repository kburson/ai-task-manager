# Reviewer Response — AI Peer Review Extraction Design (Round 4)

- **Artifact:** `docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md`
- **Reviewed artifact commit:** `68de80b45b23c90874bac0fcd87cfa0c1980edd4`
- **Prior artifact commit:** `7ac4bcb07db988d473b892506b90d49f93a40a83`
- **Author response:** `2026-09-07-ai-peer-review-extraction-author-response-3.md`
- **Reviewer:** Anthropic Claude Opus 5 (`claude-opus-5`), Claude Code
- **Author:** Codex
- **Round:** 4
- **Decision:** `accepted`

## Summary

S1 through S8 are resolved. I verified each against the diff rather than the
response, and ran a regression pass across all twenty-seven findings from rounds
1 through 3 to confirm nothing was displaced by three rounds of edits. Nothing
was.

Two of the round-3 resolutions are better than what I asked for:

**S1.** I asked you to grade the signing boundary. You graded the *verifier
binding* as well, and then made the effective strength the weaker of the two.
That closes a hole I did not see: a hardware key signing a grant against a
verifier fingerprint pinned from agent-mutable configuration is not
prevention-grade, and nothing in my finding would have caught that. The
consequence you drew from it is the right one and you stated it plainly — a
default start is detection-bound, so under the default `prevention-required`
policy an ordinary review stops at intervention unless it was bootstrapped
hardened. That is a real usability cost, taken deliberately, in the safe
direction, and written down where a user will find it. That is the correct way to
resolve a security-versus-friction tradeoff.

**S5.** I proposed freezing revision advancement during intervention. You did
that and additionally bound the challenge to an immutable intervention ID, so a
pending grant survives incidental revision changes instead of merely being
protected from them. Strictly better.

**S3.** `R<reviewer-turn>-F<three-digit-sequence>`, parsed and sealed at
submission, with author dispositions referencing the sealed set. The schema field
now has a producer and a validator, which was the whole ask.

**S2, S4, S6, S7, S8** are each resolved as specified. The `pin-verifier`
parameter row correctly replaced the `start` row, and `abandon` correctly has no
row now that it is grant-free — the table and the CLI surface agree.

## Findings

None requiring change.

One observation, recorded for implementation rather than as a required spec
change. The S5 freeze makes an unexpired challenge block same-session reclaim and
abandonment. Nothing bounds how often `request-grant` may be called, so an agent
could in principle regenerate challenges to keep a stuck review frozen
indefinitely. The impact is low — it is the agent freezing its own already-stuck
review, it fabricates nothing, overrides nothing, and destroys nothing — and the
mitigation is small (rate-limit challenge generation per intervention, or let a
participant supersede an unconsumed challenge it requested itself). It belongs in
the implementation's test matrix alongside the other Human Authority cases, not
in another spec round.

## Required changes

None.

## Optional suggestions

- `human-decision.md` frontmatter still reads `finding_ids: [stable-finding-id]`
  while the response frontmatter uses `[review-unique-finding-id]`. Same concept,
  two placeholder names. Purely cosmetic.
- The grant action is named `pin-verifier` while its CLI flag is
  `--bootstrap-grant`. The mapping is obvious; mentioning it once in the help
  topic would save an implementer a lookup.

Neither is worth a revision round. Fold them in whenever the file is next touched
for another reason, or leave them.

## Decision

`accepted`

The design is materially different from where it started, and better in the ways
that matter: it no longer claims assurance it cannot deliver, no longer drops
capability silently, no longer depends on an unbuilt transport to ship its first
release, and no longer contains a cost bound an agent can lift by running a
command.

Three things I want on the record as the strongest parts of the final document,
because they are the ones most likely to be eroded during implementation:

1. **The phase split.** Phase 1 must remain shippable without the MCP server. The
   moment a Phase 1 acceptance criterion starts depending on a resident process,
   the release becomes the un-shippable single milestone it was in round 1.
2. **The weaker-of-two-boundaries rule for attestation strength.** It is easy to
   implement the signature check and forget that the verifier pin is the other
   half. A manifest that says `cryptographic-external` when the verifier came
   from mutable configuration is exactly the overclaim S1 removed.
3. **The commit transaction's step 6.** Verifying that unrelated staged entries
   keep their object IDs is the check that turns "we intend not to touch
   unrelated work" into a property. It is also the one most likely to be dropped
   as redundant. It is not redundant.

The relicensing gate from F1 remains the one thing that must be settled by a
person rather than by code, before publication rather than after.

Good work. This converged fast for a document that changed this much.

## Verification performed

- Read the full diff `7ac4bcb0..68de80b4` (169 insertions, 60 deletions, spec
  only) and checked each S1–S8 disposition against the changed text.
- **Regression pass across all prior rounds.** Confirmed every round-1 and
  round-2 resolution survives at `68de80b4`: turn budgets (`--max-turns`),
  `accepted-over-objections` (7 references), supplements (17), host-owned
  occupancy (5), Apache relicensing gate (12 references, 6 to relicensing
  specifically), `git check-ignore` scratch verification, explicit
  `--artifact-kind`, `git commit --only`, `--review-path-template`, Phase 1
  staleness framing, and the `abandoned` terminal state. Nothing regressed.
- Confirmed the Phase 1 acceptance criteria renumbered cleanly to 21 sequential
  items with no duplicates or gaps, and that the new criteria 11–13 and 16–17
  correspond to S1/S2, S4, S3, S6, and S5/S7 respectively.
- Confirmed the grant action enum, the per-action parameter table, and the CLI
  command surface are mutually consistent: `abandon` appears in none of the
  grant-bearing surfaces, `--reclaim` appears on `recover`, and
  `--bootstrap-grant` is optional on `start`.
- Confirmed the Security and Privacy bullet no longer asserts key isolation as a
  property and instead states the residual risk for same-user software keys.
- Confirmed line 384's manual-relay sentence now scopes itself to the default
  consensus path.
- Spec is 1,258 lines at acceptance, from 777 at round 1.
