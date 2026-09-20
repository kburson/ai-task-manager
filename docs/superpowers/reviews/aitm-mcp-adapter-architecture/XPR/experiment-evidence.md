---
record_type: experiment-evidence
model: gpt-6-astra
effort: high
filepath: docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md
commit_sha: 359bcf188b8e2dd63f8bce96f562c32775e532da
reviewed_file_sha256: 58a41985ff691814e0374a27e32d097a34ed95390d459321c0391121cec1b125
turn_ordinal: XPR setup
turn_description: Cross Provider Review setup and experiment evidence
---

# XPR experiment evidence

The user requested GPT-6 Astra as Author and Claude Opus 5 at medium effort as
Reviewer. The Author continues at high effort. This stage receives the spec
accepted after SPR, with the content hash above. The [prior experiment log](../SPR/experiment-evidence.md)
records the SAR and SPR baseline and methodological limitations.

This remains a sequential case study, not a comparison of three methods on
identical starting artifacts. XPR sees corrections made during SAR and SPR.
The Reviewer should begin in a fresh Claude session; the Author retains prior
context. Repository access means this is not a blinded experiment.

## Setup observations

- Installed review package: `ai-peer-review` 0.2.2. Claude Code: 2.1.273.
- Claude reports an authenticated first-party session. No credentials are
  copied into these records.
- Project-scoped Claude review setup is installed. Manual-mode Author doctor
  reports healthy. Automatic-required transport is unavailable.
- Requested launch model ID: `claude-opus-5`; requested effort: `medium`.
  These are requested settings until a provider launch confirms them. The
  project identity fallback declares this model when Claude exposes a genuine
  session identity without runtime model metadata; such identity must remain
  labeled declared, not promoted to independently attested runtime identity.
- The supported package launcher will be used with the exact generated
  invitation. Author-specific Codex identity environment variables must be
  removed from its child environment so Claude cannot inherit the Author's
  protocol identity. No Claude session ID will be invented or supplied.
- If direct launch cannot complete, retain the failure and provide the generated
  invitation for the user's manual Claude Desktop handoff. A process exit alone
  is not evidence of review submission.

## Evidence contract

Retain submitted findings, Author dispositions, spec revisions, decisions,
provenance hashes, observed timestamps, launch or handoff failures, and recovery
steps here. Keep sealed protocol originals unchanged. Publication copies may
add the requested frontmatter (model, effort, reviewed filepath and commit,
content hash, and XPR round ordinal) while identifying their sealed source and
source hash, as in SPR.

Token totals and monetary cost are unknown until reliable provider evidence is
available. Separate wall-clock intervals from active reasoning time. Record
runtime and transport differences alongside finding counts. Peer consensus
will not constitute human ratification or implementation approval.

No XPR finding or outcome has been observed at setup. Append subsequent
observations without erasing this initial state.

Setup correction: the first start attempt rejected incomplete Claude identity
configuration (`APR_CONFIG_INVALID`, missing provider and host). The declared
identity was completed and revalidated before retry; no review had been created.

## Finalized XPR outcome

The protocol reached `accepted` through reviewer consensus in normal commit
mode. Human authority remains `unavailable`; this is AI peer acceptance of the
architecture document, not human ratification or implementation approval. Phase 0
feasibility is still unexecuted. The final spec remains exactly the reviewed bytes,
including three optional follow-ups recorded by the accepting reviewer.

| Exchange    | Recorded result                                                         | Evidence                      |
| ----------- | ----------------------------------------------------------------------- | ----------------------------- |
| Reviewer r1 | Nine findings, revisions requested                                      | [Reviewer r1](reviewer-r1.md) |
| Author r1   | Nine actionable gaps accepted with qualifications; spec revised         | [Author r1](author-r1.md)     |
| Reviewer r2 | All nine resolved; four new findings; four earlier premises withdrawn   | [Reviewer r2](reviewer-r2.md) |
| Author r2   | Four findings and four optional suggestions addressed; spec revised     | [Author r2](author-r2.md)     |
| Reviewer r3 | All four resolved; no findings; accepted with three optional follow-ups | [Reviewer r3](reviewer-r3.md) |

These are thirteen recorded actionable findings across two revision cycles, not
thirteen independently established or statistically independent defects. Round 2
specifically identifies gaps introduced by the first correction, including a new
internal inconsistency. Repeated acceptance therefore captures convergence after
revision, rather than a fixed-snapshot defect count. Four withdrawn premises in
round 1 concerned inevitable recovery deadlock, throttle rejection versus lost
response, indistinguishable request intent, and staging-directory write exclusion.
The sealed reports retain those disagreements rather than rewriting history.

| Finding | Subject                                           | Disposition                                                                      |
| ------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| R1-F001 | Default-provider execution feasibility            | Added mandatory Phase 0 proof; rejected weaker fencing                           |
| R1-F002 | Stale-state recovery reachability                 | Added narrow evidence-only exception; qualified original deadlock claim          |
| R1-F003 | Version equality versus compatibility             | Added compatibility classification, refined in round 2                           |
| R1-F004 | Quotas, write amplification, retry semantics      | Added numeric-budget obligations and distinct uncertainty cases                  |
| R1-F005 | Advisory memory blocks mutations                  | Separated advisory drift from authoritative policy drift                         |
| R1-F006 | Initiating principal and key namespace            | Defined authentication and random caller keys; retained correct replay semantics |
| R1-F007 | Exclusive bindings and target selection           | Made writable role selection and target resolution explicit                      |
| R1-F008 | Verified loader feasibility                       | Added snapshot candidate and writer-exclusion qualifications                     |
| R1-F009 | Learning tests and acceptance traceability        | Added verification coverage and criterion mapping                                |
| R2-F001 | Dispatcher requirements contradict clone promises | Qualified usability and documented co-located worker topology                    |
| R2-F002 | Generator cannot certify future consumers         | Moved format-support guarantee to installed core                                 |
| R2-F003 | Snapshot loader omits SDK peer edge               | Bound exact public SDK to one verified live kernel instance                      |
| R2-F004 | Evidence-only recovery lacks callable route       | Defined CLI/MCP mode, scoped authority, and execution target                     |

The accepting reviewer retained three optional follow-ups: an editorial fragment
in the install-manifest list, finer traceability for checks 8a–8d, and a more
explicit destination/consumer for unsupported Phase 0 outcomes. They are not
silently recorded as fixed. The accepted snapshot is preserved; later edits
should identify their own revision and review status.

## Artifact and participant provenance

- Frozen XPR entry commit: `98bdbb4ea6dd00468886a38c4150d9d8049a44c3`.
  Its spec content equals the accepted SPR baseline in the setup frontmatter.
- First correction: `db28996eeeaa3e290d2b2c18457becaf4f462607`;
  SHA-256 `8e1096146ddd98be877b8f56a1ac8a3b54fd73c22f49da4c0dbc73427ec7ac12`.
- Accepted correction: `267b91b9218b59342a0d70e0859a0e38523a3923`;
  SHA-256 `4c3e51d93861e93ced662efbdbd551221be1e5e114fe0c68c3d3219d822f2382`.
- Protocol acceptance commit: `54d6daa3337ef4b2cde4e1bda8c103f4b5a0bd1d`.
- Author: GPT-6 Astra, high effort, continuing context. Reviewer: Claude Opus 5,
  medium effort, initially fresh context, then the same genuine provider session
  resumed through all rounds. The reviewer had repository access.
- The protocol retains Claude's identity source as `declared`, because model
  fields came from the project fallback alongside a genuine runtime session.
  Separately, the local provider transcript reported `claude-opus-5` on all 82
  assistant model-bearing records inspected after round 3. Those records include
  tool continuation messages and are not 82 independent reviews or unique model
  requests. Effort is the explicit launcher setting, not independently attested
  reasoning intensity. Raw provider handles and transcripts remain private.
- The Author and Reviewer have distinct session fingerprints, recorded in the
  sealed manifest. No reviewer was substituted during recovery.

Publication copies add model, effort, filepath, input commit SHA, content digest,
role, and the descriptive XPR ordinal while preserving response prose. Author
copies also identify the resulting correction commit. Their hashes link them to
unchanged protocol originals. The package's closed protected schema does not
allow these additional publication fields in the originals.

## Observed timeline

| Event sequence | Event                        | Observed UTC time        |
| -------------- | ---------------------------- | ------------------------ |
| 1              | review-created               | 2026-09-20T20:51:09.520Z |
| 2              | reviewer-joined              | 2026-09-20T20:51:32.153Z |
| 4              | reviewer-revisions-requested | 2026-09-20T20:56:03.182Z |
| 7              | author-revision-committed    | 2026-09-20T21:04:15.738Z |
| 9              | reviewer-revisions-requested | 2026-09-20T21:19:16.206Z |
| 11             | author-revision-committed    | 2026-09-20T21:25:45.383Z |
| 13             | reviewer-accepted            | 2026-09-20T21:27:27.734Z |
| 16             | acceptance-committed         | 2026-09-20T21:27:56.112Z |

Creation to finalization took 2206.592 seconds. This is wall-clock time,
including tool failures, human handoff delay, debugging, author work, and review;
it is not active reasoning time. In particular, the interval from the first
Author submission to Reviewer r2 includes failed continuation and local launcher
repair. Response `started_at` is participant registration time, not the start of
each round. Token and monetary totals remain unknown; no zero-cost inference is
valid. The [recovery record](launcher-recovery.md) separates operational events
from design findings.

## Cross-stage observation

SAR recorded 11 findings across five passes, ending with zero in r5. SPR then
recorded four findings and accepted on r2. XPR recorded nine first-round findings,
four second-round findings, and accepted on r3. Later stages received improved,
different artifacts and different reviewer models, effort settings, and context.
The XPR runtime also changed during the exchange and required a local repair.
These results support a descriptive account of additional findings after prior
convergence, not a causal ranking of SAR, SPR, or XPR. Human adjudication and
controlled repetitions would be needed for stronger claims.

The initial SPR log's statements that XPR had not started are historical setup
observations, superseded by this outcome rather than rewritten retroactively.

## Validation and remaining scope

Author revisions passed document formatting and spelling, Markdown lint,
documentation anchors, response parsing, JSON-example parsing, and whitespace
checks. These checks establish document consistency only. The proposed runtime
conformance tests have not been implemented or run. The launcher repair had
16 passing focused tests before resuming round 2, and both later rounds submitted
through that repair with the same reviewer fingerprint. The installed review
package was not patched globally. All work remains local; nothing was pushed.

Final publication verification checked all five copies against their exact source
prose, source hashes, and Git artifact hashes; all five sealed response digests
matched the terminal manifest. Thirteen local document links resolved. The
accepted spec digest was unchanged. Repository Markdown lint passed on 572 files,
and 38 indexed documentation anchors passed.
