# XPR-first then SPR experiment evidence

## Stage and input

- Stage: `XPR -> SPR`; this is not a standalone SPR experiment.
- Stage preparation observed at: 2026-09-20T22:18:50.061421+00:00.
- User authorized this next stage after the XPR stopping point.
- Starting checkout HEAD: `626f862973a33f616a3a56670e02a790f62617a5`.
- Accepted XPR artifact commit: `09551213ec6ee18e90d2d6d39f3fff00e9ade055`.
- Input artifact: `docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md`.
- Input SHA256: `1912963ac7bfa0f7565e3cb1758a0dc27c0695712db1b22612ffb8207ece8c1e`.
- Prior XPR ID: `review-bf339e74f46697b4da5d2d19cb3c822e`; its evidence is
  frozen. No XPR optional suggestion was applied before the new review.

## Participants and context

The Author remains the same genuine GPT-6 Astra (`gpt-6-astra`) agent at high
effort. It retains this experiment side's completed XPR context. Its runtime
thread identity is unchanged, and manual doctor reports the same Author
fingerprint with runtime identity source. The Reviewer will be a fresh spawned
GPT-5.6 Sol (`gpt-5.6-sol`) agent at medium effort, with no forked conversation.
This is same-provider review across different models, not cross-provider review.

The Reviewer receives only the generated invitation and operational identity,
role, and isolation instructions. It may inspect the accepted input, repository
ADRs and implementation at this checkout, and subsequently its own SPR reports
and new Author responses. It must not read XPR reports, any memory files, other
worktrees, historical diffs, trunk, or another experiment's evidence. The Author
must likewise avoid the other experiment and coordinator history. No initial
self-review or speculative revision precedes Reviewer findings.

Fresh reviewer context does not establish statistical independence. Host/system
instructions and model training remain outside the experiment's control. Any
observed isolation limitation or breach will be recorded rather than hidden.
The Author's inherited XPR knowledge is an intentional treatment difference.

## Protocol and stopping rule

Use global `ai-peer-review` 0.2.2 in normal commit mode with manual native-agent
handoffs. Existing project Codex setup is retained. Fresh manual doctor passed;
automatic-required readiness is unavailable and is not claimed. Node runtime is
v26.8.1 and Codex runtime is 0.155.0-alpha.9.2. No Claude process or modified
Claude resume launcher is used in this SPR stage. Participants use their own
genuine runtime identity with explicit matching model environment variables.

Only package-generated Author commits occur during the active protocol. The
Reviewer cannot run Git or mutate anything except its exact pending response and
package-owned scratch transition. Sealed originals are immutable. Publication
copies receive leading YAML provenance after terminal acceptance while retaining
original prose exactly. All required findings, optional suggestions, Author
dispositions and disagreements, hashes, commits, observed event timestamps, tool
failures, and validation limits are preserved. Token/cost coverage is unknown
unless reliable evidence is later available; duration is not active reasoning
time and does not imply cost.

Stop after genuine Reviewer consensus, Author finalization, evidence checks, and
local collateral commits. The user decides whether to proceed to SAR. No push,
merge, implementation, human acceptance claim, or SAR is authorized by this
stage. Runtime tests proposed in the design remain unimplemented.

## Preparation observations

Verified clean Git status, exact starting HEAD, unchanged accepted XPR artifact
hash, retained genuine Author runtime identity, and healthy manual doctor. Read
installed help for start, join, submit, resume, and status. No tool failure has
occurred in stage preparation. Further lifecycle evidence will be consolidated
after protocol termination to preserve active-turn ownership.

## Terminal outcome

SPR r2 was genuinely submitted as accepted and global Author finalization reports
`accepted`, with acceptance basis `reviewer-consensus` and no next action. The
sequence is XPR followed by SPR: two SPR Reviewer rounds and one SPR Author
revision. The accepted artifact remains frozen at its reviewed digest.

SPR r1 contains one blocking prose finding, F1, with three required change items.
Its protected `finding_ids` is empty, so the machine field cannot be used to
claim there were zero findings. The Author explicitly addressed F1 and all three
changes; the Reviewer explicitly closed F1 in r2. No sealed metadata was changed
to invent a machine ID. The optional setup/lifecycle-script suggestion was also
addressed; r2 lists no required or optional changes. This prose-versus-machine
count limitation remains visible in publication provenance.

The Author did not apply any earlier XPR optional suggestion speculatively before
the fresh SPR report. No XPR evidence was edited during this stage. No SAR, push,
merge, or runtime implementation was started. This terminal state is not human
approval; the manifest has no human decision and authority assurance remains
`unavailable`. The next review level is reserved for user discussion.

## Input and result provenance

| Stage                                              | Commit                                     | Artifact SHA256                                                    |
| -------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| Accepted XPR input                                 | `09551213ec6ee18e90d2d6d39f3fff00e9ade055` | `1912963ac7bfa0f7565e3cb1758a0dc27c0695712db1b22612ffb8207ece8c1e` |
| SPR protocol input after setup log                 | `e83599d8450faba1bebc813c4c4e514c05518ee7` | `1912963ac7bfa0f7565e3cb1758a0dc27c0695712db1b22612ffb8207ece8c1e` |
| SPR Author revision 1 / accepted Reviewer r2 input | `6edf917bdd2d0441ad9c296f69419da08307f758` | `dd2d36956fec9dabb3427429b23541ea5733ce50dd00560bdff4bb22de266c23` |

Starting stage HEAD was `626f862973a33f616a3a56670e02a790f62617a5`. The protocol
finalization commit is `4693327ee3638cb5cee94265465dddfa01d5c475`. Publication
collateral is committed afterward; its commit is discoverable from this file's
Git history. Each reviewed artifact hash was checked against its exact local
Git commit. No accepted spec edit was made after Reviewer acceptance.

## Observed protocol timestamps

These are observed event timestamps in UTC, not active reasoning time, measured
compute duration, or inferred token/cost usage. Participant `started_at` fields
repeat original startup on later rounds and must not be treated as fresh round
start times. Manual native-agent follow-up retained the same Sol Reviewer.

| Sequence | Timestamp                  | Event                          |
| -------- | -------------------------- | ------------------------------ |
| 1        | `2026-09-20T22:18:52.612Z` | `review-created`               |
| 2        | `2026-09-20T22:19:59.416Z` | `reviewer-joined`              |
| 3        | `2026-09-20T22:19:59.416Z` | `turn-claimed`                 |
| 4        | `2026-09-20T22:23:29.253Z` | `reviewer-revisions-requested` |
| 5        | `2026-09-20T22:23:29.253Z` | `turn-claimed`                 |
| 6        | `2026-09-20T22:23:29.253Z` | `delivery-written`             |
| 7        | `2026-09-20T22:27:32.071Z` | `author-revision-committed`    |
| 8        | `2026-09-20T22:27:32.071Z` | `delivery-written`             |
| 9        | `2026-09-20T22:29:20.717Z` | `reviewer-accepted`            |
| 10       | `2026-09-20T22:29:20.717Z` | `delivery-written`             |
| 11       | `2026-09-20T22:29:47.813Z` | `finalization-started`         |
| 12       | `2026-09-20T22:29:47.813Z` | `acceptance-committed`         |

## Identity and transport evidence

- Author: GPT-6 Astra, high effort, same spawned runtime and inherited XPR-side
  context; protocol source `runtime`, fingerprint
  `sha256:d9ed2486be1a86d7a3a8e60d0f84b083a8d1e3e2364c316fe5c18126f2576ed7`.
- Reviewer: fresh GPT-5.6 Sol, medium effort, spawned with no forked conversation;
  protocol source `runtime`, fingerprint
  `sha256:6871f401f6a72a646720760c9a4ccfdcbb3db5fc8e76888427a8d96a3ae73429`.
- Distinct fingerprints were verified. The Reviewer reported verifying its own
  genuine `CODEX_THREAD_ID`, and manual doctor accepted its runtime identity.
  No raw runtime handles are published here. Model and effort reflect requested
  launch configuration and protocol identity, not independent runtime attestation.
- Both participants use OpenAI through Codex. A fresh Reviewer was created for
  this SPR and resumed by the exact event-derived native-agent handoff; the Author
  is intentionally not fresh relative to the preceding XPR. Statistical
  independence is neither assumed nor claimed.
- Global peer-review 0.2.2 handled all stage transitions in normal/manual mode.
  No modified Claude launcher, Claude session, automatic-required mode,
  participant impersonation, or manual protocol-authority edit was used.
- Token and cost coverage remain unknown; no estimates are derived from these
  timestamps.

## Isolation disclosure and operational limitations

The first Reviewer report preserves an observed breach of the narrow file-access
restriction: two intentionally broad repository `rg` searches for implementation
evidence automatically returned excerpts from unrelated specifications and plans
under `docs/superpowers/specs/**` and `docs/superpowers/plans/**`. The returned
paths included unrelated delivered designs/plans and `replacement`, `r2`, or
`r3` variants. Those snippets entered Reviewer context even though it did not
intentionally open the files.

The Reviewer states it did not use those snippets in its finding or decision.
Both searches excluded review paths. Its disclosure explicitly states that no
prior review findings, XPR reports, SPR experiment log, Author/Reviewer response,
or corrected version of this target artifact was exposed; no memory file, other
worktree, historical diff, trunk, other agent history, or coordinator history was
read. This is a reported scope limit, not an independent forensic audit.

The coordinator requested operational clarification and directed continuation
with disclosure intact and future searches scoped. Classify this as incidental
exposure to other repository design/plan snippets: it weakens narrow file-access
isolation, while the reported facts do not establish cross-experiment
contamination. Do not describe the run as perfectly blinded. The second Reviewer
report states that it used only the new Author response, revised artifact, and
previously permitted evidence, with no new breach or tool failure.

Author searches stayed scoped to the affected target and the cited current
implementation. The host's generic system guidance and memory-summary context
remain outside experiment control; no memory file was opened or queried by the
Author. No prior comparison-side history or evidence was read.

No stage-transition or launch failure was observed. The empty r1 machine
finding-ID list is a protocol evidence limitation and is preserved, not silently
repaired. Other tooling/validation findings, if any, are recorded below.

## Preservation and validation

Three publication copies begin with the requested YAML provenance. Their prose
after metadata matches the sealed original body byte-for-byte. `source_file` and
`source_sha256` identify the original; publication provenance records an
additional body digest. Author `commit_sha` is its reviewed input and
`result_commit_sha` is its protocol result commit. No fictitious Author r2 is
created after acceptance. Sealed originals retain their package-owned metadata.

Targeted spec formatting, Markdown, spelling, seven JSON-example parses, local
Markdown links, and diff whitespace checks passed before Author submission.
Validation is documentary: no invocation implementation, schema validator,
adapter conformance runner, runtime test, or architectural behavior was built or
executed. The proposed recovery tests remain implementation requirements.
Publication QA separately verifies metadata, source/body hashes, Git artifact
hashes, links, and the frozen accepted digest. Existing XPR evidence is checked
for no change from this stage's starting HEAD.

## Final collateral QA

Exact-file Markdown lint and CSpell passed on all five SPR publication/index/log
documents. No new dictionary words were needed. Editable log/index/provenance
JSON received explicit Prettier checks. The exact SPR sealed protocol directory
is excluded from repository Markdown and spelling lint to preserve package-owned
metadata and original prose; publication copies remain checked. No existing XPR
exclusion or evidence was altered. Prettier already excludes review collateral
repository-wide, so immutable copies are verified for exact equality rather than
reformatted.

A comparison against stage-start HEAD confirmed no change under the XPR evidence
root. Source digests, exact publication bodies, required YAML metadata, reviewed
Git artifact hashes, local links, and the terminal accepted digest were verified.
The final Git check is performed after committing this collateral. No additional
operational failure was observed during publication QA.
