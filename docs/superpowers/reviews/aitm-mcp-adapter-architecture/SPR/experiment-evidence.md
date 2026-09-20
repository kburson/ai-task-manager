---
record_type: experiment-evidence
model: gpt-6-astra
effort: high
filepath: docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md
commit_sha: 559df32bb43eb07dc26212c708847ef2fe9be7c8
reviewed_file_sha256: 5c3907545d5d3b12738b72b85d8afaa0bea5cdd12f4592e418ed2ec17798825b
turn_ordinal: SPR setup
turn_description: Same Provider Review setup and experiment evidence
---

# SAR, SPR, and XPR experiment evidence

This log preserves evidence for a future paper. It is an observation record,
not a review decision or an implementation approval. Append results and
corrections without erasing earlier observations.

## Study design and limits

The requested sequence is Single Agent Review (SAR), Same Provider Review
(SPR), and later Cross Provider Review (XPR). Each stage receives the artifact
improved by the preceding stage. Consequently, finding counts cannot establish
which method would perform best on an identical starting artifact. This is one
sequential case study, with model, effort, context, order, and artifact changes
as potential confounders.

The SPR has two participants: the existing GPT-6 Astra Author at high effort
and a fresh GPT-5.6 Sol Reviewer at medium effort. Medium is the peer-review
package default, selected explicitly for reproducibility. Both models are from
OpenAI. The Reviewer receives the generated invitation without the Author's
conversation history. Repository access remains available; this is not a
blinded experiment. The Author continues with prior SAR context.

No XPR has started. Its runtime configuration and entry revision must be
recorded when it starts. A terminal clean review means that the reviewer found
no further substantive defects under that review's scope; it does not prove
the design is defect-free.

## SAR baseline

The tracked SAR records identify GPT-6 Astra at high effort. SAR r1 ran in a
session attached to another project, but its edits and commit were made in this
AITM worktree. Later rounds used the correct worktree explicitly.

| Round  | Findings recorded and corrected | Evidence                       | Resulting commit                           |
| ------ | ------------------------------: | ------------------------------ | ------------------------------------------ |
| SAR r1 |                               4 | [Review](../self-review.md)    | `3d61deb4e5bb0d65258cfd0116fdfd4e541682cb` |
| SAR r2 |                               3 | [Review](../self-review-r2.md) | `21778cf5535b055ad9a42131df9b9d471b428f6e` |
| SAR r3 |                               2 | [Review](../self-review-r3.md) | `21778cf5535b055ad9a42131df9b9d471b428f6e` |
| SAR r4 |                               2 | [Review](../self-review-r4.md) | `c5cff0e6ce254cb8872d28fd24ecadc932d9b0a0` |
| SAR r5 |                               0 | [Review](../self-review-r5.md) | `559df32bb43eb07dc26212c708847ef2fe9be7c8` |

These are recorded findings, not an independently adjudicated count of unique
defects. SAR r3 reviewed uncommitted r2 changes; its frontmatter includes the
content digest needed to distinguish that snapshot from its base commit.
The five rounds recorded eleven findings in total. The spec last changed at
`c5cff0e6ce254cb8872d28fd24ecadc932d9b0a0`; the r5 commit added the clean-review
record. The SPR entry content is the SHA-256 in this document's frontmatter.

## SPR setup observations

- Date: 2026-09-20. Author and Reviewer roles were assigned by the user.
- Installed protocol package: `ai-peer-review` 0.2.2.
- Project-scoped Codex setup completed. User-scoped setup was not applied
  because the existing user skill was not package-owned.
- Manual-mode doctor reported healthy. Automatic-required transport and MCP
  connectivity were unavailable. The planned delivery is a native Codex
  subagent with explicit manual handoffs through the review protocol; this
  is not an automatic broker test.
- The Author identity was resolved from runtime session metadata with verified
  model metadata supplied to the CLI. Reviewer identity and launch success
  remain to be observed. No raw session handles belong in tracked documents.
- Spec changes, findings, responses, decisions, and terminal verification will
  be retained under this SPR directory. Protocol-generated records carry their
  own integrity metadata. Human-readable review responses also retain model,
  effort, artifact path, reviewed commit, content digest, and turn ordinal.

## Evidence to retain as the exchange proceeds

For each review turn retain its immutable submitted response, stable finding
IDs, affected sections, severity, reasoning, and proposed correction. For each
Author turn retain each finding's disposition and supporting rationale, the
exact artifact changes, validation performed, and resulting revision. Distinguish
new defects from duplicates, regressions, clarifications, and rejected findings.
Record disagreements and reversals as well as agreement.

Record observed launch, submission, handoff, and completion times from protocol
events when available. Keep setup failures and recovery events separate from
design findings. Preserve the baseline and terminal commit and content hashes.
Token usage, elapsed active reasoning time, and monetary cost are currently
unknown; do not infer zero or reconstruct them from wall-clock time. Any later
measurements must identify their source and coverage.

Protocol scratch state remains local and ignored. Durable review records and
this log are the publication evidence. While a Reviewer holds the turn, the
Author must preserve its sealed Git and worktree boundary; append consolidated
experiment observations after the protocol allows those writes.
