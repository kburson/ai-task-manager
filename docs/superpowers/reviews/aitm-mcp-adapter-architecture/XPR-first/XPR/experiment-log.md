# XPR-first fresh-context experiment evidence

## Initial conditions

- Started: 2026-09-20T21:47:49.645965+00:00.
- Original checkout: `c2e33f4d0ae704900437a0659119bad6eb30dc01`.
- Original artifact: `docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md`.
- Original SHA256: `7066ff40fdfffa399d279f453b3e4ee7dd0e26f96effcc2dff0475b76c2cf783`.
- Author: fresh `gpt-6-astra`, high effort. Its real runtime thread identity
  was verified against only its own session metadata: distinct spawned Author
  agent with the coordinator as parent. No session history was read.
- Reviewer: fresh `claude-opus-5`, medium effort, launched by the package.
  Project fallback identity is declared model identity, not runtime attestation.
- Protocol: global `ai-peer-review` 0.2.2, normal commit mode, manual transport.
- Runtime: Node v26.8.1, Claude Code 2.1.278, Codex
  0.155.0-alpha.9.2. Manual doctor must pass before start; no automatic-required
  readiness claim is made.

## Isolation and stopping boundary

The Author and Reviewer may use the original spec and its requirements,
repository ADRs and implementation in this checkout, and newly produced review
responses. No initial self architecture review is performed. No memory files,
prior review collateral, historical corrections, other worktrees, or trunk
content may be read. Reviewer isolation instructions are present in the project
Claude instructions before the sealed review starts. The original spec remains
byte-identical at startup.

This is context isolation, not a claim of perfect experimental blinding. Both
participants retain model training and host/system instructions. The Author
received operational protocol instructions and runtime-confounder details from
the coordinator. The coordinator prepared a runtime-only local launcher copy
under ignored scratch: its resume builder uses the event-derived pending turn
and existing permission encoders to avoid a stale original-invitation response
path. This is local runtime carryover, not an upstream release or architecture
finding. Global protocol authority and submit/finalize remain unchanged.

The experiment stops after genuine XPR acceptance, evidence preservation, and
local commits. A later human discussion decides whether to run SPR/SAR. No push,
merge, architecture implementation, or claim of human approval is authorized by
this review. Runtime tests proposed in the spec are not implemented by this work.

## Operational record

- Verified clean starting worktree and original artifact hash.
- Loaded applicable instructions and peer-review, receiving-code-review, and
  verification-before-completion skills.
- `peer-review --version` returned `APR_USAGE` (unsupported command); verified
  version 0.2.2 directly from the installed package metadata instead.
- Project setup completed for Codex and Claude; preserved setup backup privately
  under ignored scratch. JSON formatted before commit.

Further timestamps, input/result commits, hashes, findings, dispositions,
verification, and tool failures are consolidated here after terminal protocol
state; during active review they remain in exact protocol records and runtime
evidence to preserve the ownership boundary.

## Terminal outcome

The genuine Reviewer accepted XPR r3. Global protocol finalization reports
`accepted`, acceptance basis `reviewer-consensus`, with no next action. There
were three Reviewer rounds, two Author revisions, and eight required finding
IDs (seven in r1; one in r2; none in r3). No unresolved required finding remains.

The final Reviewer preserved two optional suggestions: extension promotion
routing and prose wrapping. Both remain in the accepted review copy for later
human discussion. The accepted spec was not edited after acceptance. No SPR,
SAR, push, merge, architecture implementation, or new runtime test was started.

Human authority assurance is `unavailable` in the protocol. The terminal
manifest has no human decision or acceptance attestation. Reviewer consensus is
not human approval and does not authorize the next review level.

## Artifact and commit provenance

| Stage                                          | Commit                                     | Artifact SHA256                                                    |
| ---------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| Frozen original baseline                       | `c2e33f4d0ae704900437a0659119bad6eb30dc01` | `7066ff40fdfffa399d279f453b3e4ee7dd0e26f96effcc2dff0475b76c2cf783` |
| Protocol input after setup                     | `93a2c790be8c771324ae51eaf35b41bf029dd6ea` | `7066ff40fdfffa399d279f453b3e4ee7dd0e26f96effcc2dff0475b76c2cf783` |
| Author revision 1 / Reviewer r2 input          | `718fc30a2791b9399f1ec37e2c15815633a74806` | `69c3813323e010d70d3e97ca6ce4e5cbce65cc964a1123b582f6a45b861f2ee4` |
| Author revision 2 / accepted Reviewer r3 input | `09551213ec6ee18e90d2d6d39f3fff00e9ade055` | `1912963ac7bfa0f7565e3cb1758a0dc27c0695712db1b22612ffb8207ece8c1e` |

The protocol terminal evidence commit is
`49f0c84274ef4116523784f64e51e0de8cc0caad`. It preserves the acceptance response
and manifest without changing the accepted artifact. Publication collateral is
committed afterward; its Git commit is discoverable from this file's history.
Every input/result hash above was independently checked against the artifact
bytes at that exact local commit.

## Observed protocol timeline

Times below are emitted protocol events in UTC. They are not measured thinking
time, active compute time, or token/cost estimates. The template's `started_at`
field repeats participant startup across later rounds; it must not be treated
as a fresh round start. All Author/Reviewer handoffs used manual transport.

| Sequence | Timestamp                  | Event                          |
| -------- | -------------------------- | ------------------------------ |
| 1        | `2026-09-20T21:48:14.763Z` | `review-created`               |
| 2        | `2026-09-20T21:48:53.668Z` | `reviewer-joined`              |
| 3        | `2026-09-20T21:48:53.668Z` | `turn-claimed`                 |
| 4        | `2026-09-20T21:54:14.764Z` | `reviewer-revisions-requested` |
| 5        | `2026-09-20T21:54:14.764Z` | `turn-claimed`                 |
| 6        | `2026-09-20T21:54:14.764Z` | `delivery-written`             |
| 7        | `2026-09-20T22:00:06.168Z` | `author-revision-committed`    |
| 8        | `2026-09-20T22:00:06.168Z` | `delivery-written`             |
| 9        | `2026-09-20T22:02:52.913Z` | `reviewer-revisions-requested` |
| 10       | `2026-09-20T22:02:52.913Z` | `delivery-written`             |
| 11       | `2026-09-20T22:04:49.031Z` | `author-revision-committed`    |
| 12       | `2026-09-20T22:04:49.031Z` | `delivery-written`             |
| 13       | `2026-09-20T22:06:31.126Z` | `reviewer-accepted`            |
| 14       | `2026-09-20T22:06:31.126Z` | `delivery-written`             |
| 15       | `2026-09-20T22:07:39.218Z` | `finalization-started`         |
| 16       | `2026-09-20T22:07:39.218Z` | `acceptance-committed`         |

## Participant and runtime provenance

- Author: GPT-6 Astra (`gpt-6-astra`), high effort requested by the coordinator;
  protocol identity source `runtime`. Session fingerprint:
  `sha256:d9ed2486be1a86d7a3a8e60d0f84b083a8d1e3e2364c316fe5c18126f2576ed7`.
- Reviewer: Claude Opus 5 (`claude-opus-5`), medium effort passed to the fresh
  official launcher and retained across resumes; identity source `declared`.
  Session fingerprint:
  `sha256:7269798814f6e42c7dbd35031039451c136e87664d5bf2159f1e59823321f699`.
- Distinct fingerprints were verified. The Author's real spawned-thread identity
  was checked from only its own session metadata. No raw session handle is copied
  into this evidence. Model/effort configuration is not independent model-runtime
  attestation. The Reviewer had one genuine new Claude session reused for r2/r3.
- Global package 0.2.2 performed setup, doctor, start, r1 launch, Author submit,
  and finalize. The declared local 0.2.2 resume-only launcher copy performed
  r2/r3 launches using event-derived current response permissions. All three
  launcher outcomes were `submitted` with the same Reviewer fingerprint. No
  permission broadening, participant impersonation, or protocol-authority edit
  was used.
- Manual doctor was healthy; automatic readiness was unavailable. No
  automatic-required claim or unattended coordination claim is made.
- Token usage and cost coverage are unknown. No totals, inferred billing, or
  duration-derived token estimates are reported.

## Isolation observations and tooling limitations

No memory files, prior review prose, prior findings, historical correction
collateral, other worktrees, or trunk content were deliberately read. The
Author used current-checkout sources to evaluate new Reviewer findings only.
The first Reviewer report names the checkout ADRs and implementation it used.
The Reviewer reported no isolation breach; this is not a full external audit of
all provider internals or auto-loaded host context.

The host supplies system guidance and a generic memory-summary block outside
this experiment's control. No memory file was opened or queried, and no prior
architecture review findings were supplied through the coordinator. Treat this
as fresh conversational review context with disclosed host context, not perfect
blinding. Operational runtime-confounder details were supplied in advance.

The initial Markdown CLI2 run unexpectedly inherited repository globs (550
files, zero reported issues). A second attempted scoped run also inherited
globs (554 files) and reported 19 issues in this run's sealed response metadata.
Thus the lint tool may have read files outside the intended narrow document
scope; it did not return prior architecture-review content to the Author. The
Author switched to standalone markdownlint with exact file arguments and the
repository's same rules. Sealed originals remain untouched. This limitation
must remain visible in any whitepaper characterization of isolation.

Document executables were absent from seeded node_modules; npx resolved them
without changing package files. The observed tools include markdownlint-cli2
0.23.3 / markdownlint 0.41.1 and CSpell 10.3.3. The Author recorded the initial
unsupported version command, the broad lint behavior, and a spelling failure on
"retarget" corrected to "redirect" in its response. A terminal evidence probe
also tried a nonexistent local runtime `lib` directory (exit 1); the runtime uses
`src`. This was a read-only inventory error, not a review or architecture defect.
Claude's native binary stayed available (2.1.278); no native repair was needed.

## Preservation and verification contract

The sealed protocol responses and manifest are original immutable evidence.
They retain package metadata exactly, including its non-leading frontmatter.
Publication copies start with the user-requested YAML fields and preserve the
original response prose byte-for-byte after the protected metadata block.
`source_file` and `source_sha256` identify each original; the provenance JSON
records a separate body digest. Author copies distinguish input `commit_sha`
from `result_commit_sha`. No fictitious Author r3 is created after acceptance.

All finding dispositions and partial disagreements are preserved in the two
Author copies, not compressed into an agreement-only narrative. Round 2
explicitly resolves the round-1 findings; round 3 explicitly resolves R2-F001.
Proposed runtime verification remains design text. Targeted documentation
checks cover formatting, Markdown, spelling, JSON examples, local links,
repository guide anchors, source/copy hashes, and exact Git artifact hashes.

The local launcher implementation SHA256 used for resume was
`07523d933dc6ba593c4c8c6b37a26639cb91e0594db9c6f0c1d4cc1f8e045b59`. This identifies the disclosed runtime
confounder without publishing private transport state.

## Final collateral checks

The five publication bodies and their immutable sources are hash-checked and
byte-compared. Every required leading YAML field is present, including reviewed
input commits and separate Author result commits. Exact-file Markdown lint
passes on all seven human-readable publication/index/log documents.

CSpell first reported three immutable-prose vocabulary terms (`overclaims`,
`retarget`, `retrievability`), plus two ordinary log wording choices. The log
wording was simplified; only the three exact immutable-prose words were added
to the project dictionary. The sealed protocol directory for this exact run is
excluded from repository Markdown and spelling lint because its package-owned
metadata layout is immutable; publication copies remain checked. Prettier
already excludes review collateral repository-wide. Editable index/log/JSON
collateral receives explicit formatting checks; immutable prose is verified by
exact equality rather than reformatted.
