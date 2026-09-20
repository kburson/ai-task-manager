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

## SPR outcome recorded after finalization

The normal-mode protocol reached `accepted`, with `reviewer-consensus` as its
acceptance basis. No human acceptance attestation was configured:
`authority_assurance` is `unavailable`, as recorded by the package. This is
AI peer consensus, not human ratification or permission to implement. The
session used native subagent launch and explicit manual handoffs, not a resident
broker. The joined runtime session fingerprints were distinct. Model selection
and effort came from the launch configuration; the CLI model labels were
supplied through environment variables matching that configuration. The package
identity record does not independently attest the model's execution or effort.

The frozen SPR entry revision was
`6891473eb0dca09b0c88d0745f2039c35c82249a`, whose spec content is identical to the
SAR r5 baseline. That commit added project review setup and this evidence log.
The spec revision accepted by Sol is
`0a7e3c6a6283feddd4a7d7f16d81ac856cc5f1eb`, with SHA-256
`58a41985ff691814e0374a27e32d097a34ed95390d459321c0391121cec1b125`.
Protocol finalization was committed as `7a0b08c7`.

| Exchange    | Recorded result                                                                                | Durable evidence              |
| ----------- | ---------------------------------------------------------------------------------------------- | ----------------------------- |
| Reviewer r1 | Four findings: three high, one medium; revisions requested                                     | [Reviewer r1](reviewer-r1.md) |
| Author r1   | Four accepted; trust-boundary and irrecoverable-loss qualifications documented; spec corrected | [Author r1](author-r1.md)     |
| Reviewer r2 | All four resolved; no additional findings; accepted                                            | [Reviewer r2](reviewer-r2.md) |

| Finding | Subject                                                    | Author disposition and experimental interpretation                                                                           |
| ------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| R1-F001 | In-process plugin trust versus strict assurance            | Accepted claim clarification: narrow assurance to host isolation conditional on a fully trusted plugin set; no sandbox added |
| R1-F002 | Workspace executable bytes omitted from staleness identity | Accepted content-identity gap; require complete runtime identity and a verified immutable execution view                     |
| R1-F003 | Retention limits versus sole durable authority             | Accepted durability-contract gap; require retrievable payloads and safe transfer, while permanent loss remains blocked       |
| R1-F004 | Ambiguous ownership of the ABI evidence method             | Accepted composition-contract ambiguity; only active `work-items` binding writes canonical evidence                          |

The Author also corrected the Reviewer's overbroad attribution of explicit
provider-retention language to ADR 0002. The Reviewer retained its original
report and accepted the resulting design without requiring a sandbox or an
impossible reconstruction guarantee. There were no rejected findings or
recorded reversals. Related SAR subjects include plugin portability, evidence
recovery, and host enforcement, so these counts should not be described as four
statistically independent defects. The pair treated them as additional
actionable gaps at the SPR entry revision; no independent human adjudication
has yet classified them.

### Observed timeline

The following UTC timestamps are observations from local protocol events, not
measurements of active model reasoning. They include scheduling and tool time.
Later response `started_at` fields retain participant registration time, so they
must not be used as per-round start times.

| Event sequence | Event                                     | Observed UTC time        |
| -------------- | ----------------------------------------- | ------------------------ |
| 1              | Review created                            | 2026-09-20T20:27:05.409Z |
| 2              | Distinct Reviewer joined                  | 2026-09-20T20:28:22.129Z |
| 4              | Reviewer r1 submitted                     | 2026-09-20T20:31:53.451Z |
| 7              | Author revision committed and handed back | 2026-09-20T20:36:44.753Z |
| 9              | Reviewer r2 accepted                      | 2026-09-20T20:38:05.868Z |
| 12             | Acceptance committed                      | 2026-09-20T20:38:25.400Z |

Creation to protocol finalization took 679.991 seconds, about 11 minutes
20 seconds. This excludes setup before protocol creation and evidence
consolidation afterward. Reviewer registration to first submission took
211.322 seconds; Author handoff to the second submission took 81.115 seconds.
These intervals cannot be compared directly with SAR reasoning time or cost.
Token and monetary totals remain unknown.

### Record format and verification

The package's response schema has closed protected metadata and cannot accept
additional effort or descriptive ordinal keys. The original sealed response
files remain byte-preserved. The linked publication copies add the requested
YAML frontmatter: model, effort, artifact path, reviewed commit SHA, content
digest, turn ordinal and description, role, and source-file hash. Their response
prose is unchanged. Author frontmatter identifies its reviewed input revision;
`result_commit_sha` identifies the committed correction. These copies are
derived evidence and do not replace the protocol manifest.

The [protocol manifest](2026-09-20-2026-09-20-aitm-mcp-adapter-architecture-design-review-1ea55e3127774ff3817f44752efcbc79-review-manifest.md)
preserves identities, artifact history, response hashes, findings, decisions,
and the absence of human authority. The generated invitation and Author startup
instructions are retained alongside it. Additional native-agent instructions
are recorded in [reviewer instructions](reviewer-instructions.md).

Document validation covered spec formatting and spelling, repository Markdown
lint and indexed documentation anchors, response structure, JSON examples, and
whitespace. No provider runtime, plugin isolation, or archive behavior was
tested. The new conformance cases are design requirements for later approved
implementation work. All commits remain local; this session did not push.

XPR has not started. Use the accepted content hash above as the next
sequential entry baseline if that is the user's selected experiment design.
