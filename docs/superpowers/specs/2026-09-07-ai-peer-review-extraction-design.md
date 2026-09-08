# AI Peer Review Extraction Design

<!-- cspell:words Zenodo licensor relicenses -->

- **Date:** 2026-09-07
- **Status:** Proposed
- **Source:** AI Task Manager at `4b3bcd43cba141a611da4a2b861433b915462806`
- **Repository:** `ai-peer-review`
- **npm package:** `ai-peer-review`
- **CLI and skill:** `peer-review`

## Summary

Extract AITM's co-review engine into a public, independently installable
`ai-peer-review` repository. The package coordinates two registered AI sessions
that collaborate on one specification or implementation plan in the same Git
worktree. It provides a provider-neutral protocol, a `peer-review` CLI, an
installable `peer-review` skill, reusable handoff templates, structured identity
provenance, and bounded human-controlled review loops. The first release uses
manual or official session-resume handoff. A later transport release adds a local
MCP service that blocks without spending model tokens.

The reviewer never edits the authoritative artifact and never commits. During a
revision round, the author commits the reviewer response, updated artifact, and
author response together as one auditable triad. After acceptance, the author
commits the reviewer acceptance and generated review manifest together. AITM may
consume the standalone package, but issue tracking, backlog context, kanban
state, and AITM-specific policy are outside this package.

An explicit `--no-commit` test mode runs the same collaboration without staging
or committing any collateral. It keeps exact artifact snapshots and hashes in
the ignored workspace and terminates as `accepted-uncommitted`, allowing repeated
protocol testing without rewriting Git history.

## Problem

AITM's current co-review implementation is valuable outside AITM, but the engine
is coupled to AITM paths, fleet state, issue metadata, archive layout, and command
routing. Its bounded wake loop also wakes an agent repeatedly to inspect handoff
state, consuming context tokens even when nothing changed.

The existing archive model copies finished collateral out of a scratch protocol
directory. This separates live work from its intended durable location and makes
it harder to keep each review decision adjacent to the artifact revision that
answered it. The current model also assumes provider names more strongly than
necessary, even though useful peer review can come from two sessions on the same
provider, including two sessions using the same model.

## Goals

1. Publish peer review as a standalone public npm package and agent skill.
2. Support any two distinct registered sessions in one physical Git worktree.
3. Keep provider and model identity as provenance, not an eligibility gate.
4. Make reviewer and author responsibilities unambiguous and enforceable.
5. Write durable review collateral directly to a configurable tracked reviews
   directory while keeping coordination state in ignored scratch storage.
6. In normal mode, preserve every revision round as an integrity-bound Git
   commit triad.
7. In the transport release, resume agents only when a real handoff arrives,
   without timer-driven model wake events or mutation of provider session logs.
8. Give agents complete, offline, machine-queryable CLI help and stable recovery
   instructions.
9. Integrate cleanly with AITM without importing AITM concepts into the core.
10. Preserve source history and publish strong independently timestamped release
    provenance.
11. Provide an explicit no-commit mode for protocol testing without weakening or
    silently changing the normal commit-backed workflow.

## Non-goals

- Managing issues, backlogs, project boards, delivery receipts, or AITM states.
- Requiring different providers, different model families, or different models.
- Judging whether a review is substantively correct.
- Letting a reviewer edit the artifact, stage files, create commits, or push.
- Automatically pushing author commits.
- Reaching into or modifying a provider's session log to wake another agent.
- Maintaining `npx aitm co-review` or adding `npx aitm peer-review` compatibility.
- Rewriting previously accepted AITM review archives into the new format.
- Providing cryptographic proof of an agent vendor's claimed runtime identity.
- Treating uncommitted test acceptance as durable committed review evidence.
- Automatically deleting or restoring no-commit test collateral.
- Owning a host project's cross-worktree task or agent occupancy index.

## Naming and Distribution

The public GitHub repository is named `ai-peer-review`. The unscoped npm package
is also `ai-peer-review`, and its installed binary is `peer-review`.

Use these invocation forms:

```text
# Zero-install execution resolves the package by its unique npm name.
npx ai-peer-review --help

# After installing ai-peer-review in a project.
npx peer-review --help
```

The project must never instruct users to run `npx peer-review` before a local
installation is confirmed. That package name belongs to an unrelated npm
package. Documentation, generated prompts, and error recovery always use
`npx ai-peer-review` for zero-install examples and `npx peer-review` only for an
installed local dependency.

The package includes:

```text
bin/
  peer-review.mjs
skills/
  peer-review/
    SKILL.md
src/
  cli/
  git/
  identity/
  manifest/
  mcp/
  protocol/
  templates/
  transport/
schemas/
templates/
test/
LICENSE
CONTRIBUTING.md
README.md
package.json
```

## Core Boundaries

The standalone package owns:

- review lifecycle and role enforcement;
- worktree and artifact integrity checks;
- scratch protocol state and immutable event history;
- response templates and generated frontmatter;
- session, provider, and model provenance;
- reviewer-turn budgets, explicit continuation grants, and supplements;
- per-turn process claims and participant-loss recovery;
- handoff delivery and token-free waiting;
- author-owned exact-path commits and review manifests;
- CLI, JSON contracts, help, diagnostics, and recovery.

The host project owns:

- the artifact's subject matter and quality bar;
- any issue, backlog, board, or delivery lifecycle;
- project-specific review-output configuration;
- installing or invoking the skill;
- supplying additional context to either agent.
- any cross-worktree task or agent occupancy index.

An optional issue ID is opaque host metadata. It may be included in the resolved
output path and the manifest, but it has no effect on protocol eligibility or
state.

## Repository Extraction

Create the new repository from a fresh clone of AITM using a history-preserving
`git filter-repo` extraction. Include the review engine, provider/session
adapters, review tests, templates, and directly relevant documentation history.
Record the exact source AITM commit in the initial extraction manifest and first
release notes.

The current extraction boundary includes `scripts/review/**`, the co-review test
suites, provider session discovery needed by review, and review-specific skill
content. AITM-only imports are replaced rather than copied:

- `scripts/review/lib/index.mjs` currently imports AITM fleet registry and path
  helpers;
- `scripts/review/lib/start.mjs` currently embeds issue/archive paths and bounded
  wake intervals;
- `scripts/review/lib/protocol.mjs` currently uses AITM-named schemas;
- `scripts/review/lib/archive.mjs` implements the old copy-from-scratch archive
  model.

The extracted code is reorganized behind the package layout above. No runtime
module in `src/` may import AITM, inspect `.ai-task-manager`, invoke AITM commands,
or assume a GitHub issue exists.

The direct-write model replaces `archive.mjs`'s final copy/publish step, but not
all of its guarantees. The extraction retains or reimplements canonical path
resolution, destination-absence checks, consistent-snapshot reads,
complete-identical retry recognition, foreign-output inspection, and
deterministic collision recovery. It drops only the
staging-directory-to-archive copy and AITM-specific archive layout/schema.

Before publishing the new history, scan every retained commit for credentials,
private data, generated runtime state, and unrelated AITM content. Rewrite the
filtered repository before public release if the scan finds material that does
not belong in the standalone project.

## Scope and Sequencing

This project contains both a port and new product work. The ported foundation is
the existing lifecycle, turn budget, supplement, good-enough, locking, event,
integrity, Git, recovery, and test behavior under `scripts/review/**`. Its AITM
imports, names, paths, command routing, and copy-based archive publication are
replaced at the extraction boundary.

New work includes the standalone CLI and package layout, setup and doctor
commands, stable `APR_*` errors and offline help, provider-neutral identity
adapters, direct tracked collateral, no-commit mode, transport capability
negotiation, and the MCP handoff server.

Delivery is phased:

1. **Phase 1 — extraction and manual release (`0.1.x`).** Publish the extracted
   package, CLI, skill, bounded lifecycle, identity/provenance, configurable
   tracked output, exact-path commit flow, no-commit mode, offline help, and
   `manual` plus adapter-proven `resume-only` transport. No MCP server or
   automatic-required mode is needed to release this phase.
2. **Phase 2 — automatic transport (`0.2.x`).** Add the local MCP server,
   `live-wait` and official `native-push` adapters, long tool-timeout setup,
   end-to-end transport health checks, and automatic-required mode. This phase
   must preserve Phase 1's manual recovery route and protocol schema
   compatibility.

AITM migrates only after the applicable phase's dependency integration and
parity checks pass. Automatic handoff is not a hidden prerequisite for the
standalone extraction or AITM's initial dependency migration.

## Workspace Model

Every review has two storage surfaces.

### Ignored scratch workspace

The default operational path is:

```text
.scratch/peer-review/<review-id>/
```

It contains only protocol machinery:

```text
protocol.json
events.jsonl
participants.json
author-startup.md
reviewer-invitation.md
deliveries/
handoffs/
locks/
snapshots/
supplements/
```

The CLI resolves canonical paths and refuses symlink escapes. With explicit
confirmation from `setup`, it may add `.scratch/peer-review/` to the exclude file
reported by `git rev-parse --git-path info/exclude`; it never constructs that
path by appending to the textual `.git` entry and does not edit the repository's
tracked `.gitignore` automatically. After repository configuration is applied,
`setup` and every `start` verify a representative path with
`git check-ignore --quiet --no-index`. If Git cannot prove the scratch path is
ignored, startup fails without creating protocol state as
`APR_SCRATCH_NOT_IGNORED`.

`events.jsonl` is append-only authority. `protocol.json` and
`participants.json` are atomic projections that can be rebuilt from events.
Locks protect transitions, and all durable writes use temporary sibling files
plus atomic rename.

Raw provider session IDs, transcript paths, IPC endpoints, and wake handles are
scratch-only. They must never appear in tracked responses or manifests.

### Tracked review collateral

The package defaults are:

```text
reviews root: docs/peer-reviews
path template: <kind>/<date>-<name>-<review-id>
```

Projects configure a repository-contained `--reviews-root` and a constrained
`--review-path-template`. Supported placeholders are `<issue>`, `<kind>`,
`<name>`, `<date>`, and `<review-id>`; substitutions are canonicalized and must
remain beneath the reviews root. A template containing `<issue>` requires an
explicit positive issue ID. Artifact kind is never guessed from the filename:
`start` requires an explicit `--artifact-kind spec|plan`, either on the command
line or in host configuration.

AITM configures:

```text
--reviews-root docs/superpowers/reviews
--review-path-template <issue>/<kind>
```

This exactly preserves AITM's documented issue-first directory convention while
letting unrelated hosts use the package default. A template containing
`<review-id>` creates a review-scoped directory, whose output names are:

```text
reviewer-response-<turn>.md
author-response-<turn>.md
human-decision.md
review-manifest.md
```

For a shared destination template such as AITM's `<issue>/<kind>`, each filename
uses the collision-resistant qualified prefix
`<date>-<name>-<review-id>-`. The human-decision file is created only for
`accepted-over-objections`; ordinary reviewer acceptance does not create one.

The resolved output path must stay inside the repository, and existing files are
never silently overwritten.

Agents write response prose directly to these tracked paths. The scratch
workspace stores delivery receipts and hashes, not duplicate canonical copies.
The sole exception is no-commit test mode, which stores an immutable artifact
snapshot for each handoff because Git commits are unavailable as historical byte
authority.

## Participants and Identity

A review requires exactly two distinct registered sessions: `author` and
`reviewer`. Distinctness is based on a normalized session fingerprint, not on
provider or model. Two sessions from the same provider, using either different
or identical models, are valid.

Each participant record contains:

```yaml
role: author | reviewer
host: codex | claude-code | grok | other
provider: openai | anthropic | xai | other
model_id: provider-runtime-model-id
model_display: human-readable model name
session_fingerprint: one-way stable fingerprint
identity_source: runtime | declared
joined_at: RFC-3339 timestamp
```

The preferred display label combines provider and model, for example `OpenAI
GPT-5.6-Sol`, `Anthropic Claude Opus 5`, or `xAI Grok 5`. A provider's official
runtime surface supplies identity when available. A declared identity is allowed
when no adapter can obtain one, but the record must say `identity_source:
declared`; declared identity cannot bypass the distinct-session gate.

Adapters may use official runtime facilities such as Codex hook or app-server
session metadata, Claude Code status-line and hook metadata, or Grok status-line,
session, and ACP metadata. Each adapter normalizes the data without claiming
stronger attestation than the source provides.

Identity is captured during `start` or `join` before the first turn. It is
refreshed at every `submit`. A model change within the same session appends an
identity-change event and is reflected in that turn's response metadata; it does
not create a new participant.

Stable participant provenance is separate from turn ownership. Every scratch-only
claim contains the session fingerprint, a random claim ID, role, host, claimed
time, last protocol activity, expiry time, and the short-lived CLI PID as a
forensic breadcrumb. In Phase 1 that PID names only the CLI invocation; it is not
the agent session and is never treated as a liveness handle. With no resident
process, Phase 1 provides bounded staleness detection. `--claim-ttl` defaults to
8 hours and is fixed at startup. After that TTL, `status` derives
`intervention-required` with reason `stale-claim`, and the next recovery records
that transition under the lock. The same session fingerprint may reclaim its own
role without a grant when no Human Authority challenge is pending; the package
records a non-revision-advancing `same-session-reclaim` audit event with the old
and new claim IDs and expiry. A different fingerprint is participant replacement
and still requires a signed grant. No stale claim is released or stolen
automatically.

In Phase 2, an adapter may advertise `resident-liveness` only when an official
host runtime or the local MCP service remains resident for the claimed turn. The
adapter returns a process-instance ID, PID or official opaque process handle,
host, observation time, and lease expiry; the resident component refreshes the
heartbeat before expiry. The core validates the adapter capability and lease but
does not infer liveness from a PID alone. Generic `other` adapters default to
`staleness-only` and cannot advertise `live-wait`, `native-push`, or
`resident-liveness` without implementing and testing that contract.

Unsupported, stale, PID-reused, expired, or otherwise ambiguous Phase 2
liveness derives `intervention-required` with reason `participant-loss` and
never permits automatic claim stealing. A signed recovery grant may release or
replace the participant only through an operation that records the old claim,
replacement identity, human attestation, reason, and time.

## Human Authority

The agent under review is inside the threat model for every human-gated action.
Assume it can run arbitrary package commands and read or modify the repository,
scratch workspace, ordinary environment variables, user-writable configuration,
and an attached TTY. Therefore a CLI prompt, TTY detection, `gh api user`, an
`--approved-by` string, or a key stored in agent-readable local state can identify
an account or interaction but cannot prove a separate human authorized the exact
action.

Human Authority has three explicit assurance grades:

- **Prevention-grade** uses a hardware-backed key requiring user presence for
  each signature, a separate signing device, or an official host approval
  service whose credential the agent cannot present. It is intended to prevent
  the agent from minting grants.
- **Detection-grade** uses a same-user software key. It provides a signed signer
  identity and audit trail, but an agent that can read or invoke the key may forge
  a grant. Its manifest strength is `cryptographic-local`, never
  `cryptographic-external`.
- **Test-only** uses a deterministic fixture signer only in no-commit mode. It
  provides protocol coverage, not human attestation.

The package accepts prevention-grade authority by default. A host may explicitly
configure `authority_policy: detection-allowed`; every startup/status display,
protected event, human decision, and manifest then warns that grants are
detection-grade and do not enforce the budget against an agent with same-user key
access. `unverified-test` remains exclusive to no-commit mode. The package cannot
prove that a claimed external key is physically isolated, so the configured
adapter supplies its grade and the manifest records that claim without elevating
it.

Ordinary `start` is not human-gated: starting a review cannot expand the default
budget, replace a participant, or produce acceptance evidence. It pins the
verifier fingerprint, assurance grade, and authority policy from existing setup
configuration, or records `authority_policy: unavailable` for a consensus-only
review. A verifier change is visible in startup output and the manifest. An
optional hardened `start --bootstrap-grant <file>` prevents verifier substitution
by binding the initial configuration to a prevention-grade grant; this adds a
second human relay and is not the default Phase 1 path.

The effective attestation strength is the weaker of the signer boundary and the
verifier-binding boundary. A default start from same-user mutable configuration
is therefore detection-grade even if the later signature claims an external key.
Only a hardened bootstrap grant or an official host configuration channel that
the agent cannot mutate may establish prevention-grade verifier binding. Under
the default `prevention-required` policy, a detection-bound consensus review must
stop at intervention or obtain a prevention-grade verifier bootstrap through a
new review; under explicit `detection-allowed` policy it may proceed with the
manifest warning intact.

Signed Human Authority grants remain mandatory for `continue`, supplement
registration, good-enough finalization, and different-session participant
replacement. Before one of these actions, `request-grant` emits a canonical
challenge:

```yaml
schema: ai-peer-review.grant-challenge/v1
review_id: stable-review-id-or-start-nonce
protocol_revision: exact-revision-or-zero
action: pin-verifier | continue | supplement | accept-over-objections | replace-participant
parameters_digest: sha256
nonce: cryptographically-random-value
expires_at: RFC-3339 timestamp
```

The human may approve that challenge through a prevention-grade boundary or a
detection-grade local signer when policy permits it. The repository and protocol
store only a pinned public verifier or official host identity, never a required
private credential. If authority is unavailable, the review may still reach
ordinary reviewer consensus within its original budget, but protected actions
fail closed and `doctor` reports their unavailability.

The resulting grant may be visible to the agent because it is bound to the exact
review, revision, action, parameter digest, nonce, and expiry. The mutating
command verifies the signature or host receipt under the protocol-pinned
verifier, consumes the nonce atomically with the authorized event, and rejects
expired, replayed, cross-review, cross-revision, or parameter-mismatched grants.
There is no self-declared `--approved-by` fallback and an authenticated GitHub
login alone is insufficient.

Every protected event and the review manifest record the attestation source,
strength, stable signer identity, verifier fingerprint, challenge digest, and
verification time. Strength is exactly `cryptographic-external`,
`hardware-presence`, `host-verified`, `cryptographic-local`, or
`unverified-test`. No-commit mode may explicitly use an `unverified-test` fixture
signer, but every prompt, response, status result, and manifest exposes that
weaker strength and the terminal result remains non-durable.

### Grant parameter binding and intervention freeze

`parameters_digest` is SHA-256 over UTF-8 bytes of
`ai-peer-review.grant-parameters/v1` canonical JSON. Object keys are recursively
sorted, strings are Unicode NFC, repository paths are canonical POSIX-relative
paths, integers are base-10 JSON integers, absent optional values are explicit
`null`, and arrays preserve declared order. Unknown, omitted, duplicate, or
non-canonical fields are rejected before signature verification.

Each action binds exactly:

| Action                   | Canonical parameters                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pin-verifier`           | verifier fingerprint, assurance grade, authority policy, artifact path, artifact kind, reviews root, path template, issue ID, maximum turns, commit mode |
| `continue`               | additional turns, resulting effective maximum, resume role, focus path and content digest or `null`                                                      |
| `supplement`             | supplement content digest, target role, and target turn                                                                                                  |
| `accept-over-objections` | artifact path/blob/digest, final round, reviewer response path/digest, ordered unresolved finding IDs, and human-rationale digest                        |
| `replace-participant`    | role, outgoing claim ID and session fingerprint, incoming session fingerprint                                                                            |

While the protocol is `intervention-required`, agent commands cannot advance
the protocol revision. `status`, help, and challenge generation are read-only
with respect to that revision. A challenge carries the immutable intervention
ID as well as the revision and remains valid until `expires_at`, successful
consumption, or a conflicting Human Authority grant. Once an unexpired challenge
exists, same-session reclaim and abandonment are temporarily refused so an agent
cannot invalidate a grant while the human signs it.

## Startup and Generated Prompts

The user starts a review by asking an agent to peer-review an artifact, supplying
the artifact path and optionally an issue ID. The invoking session is presumed
to be the author.

`peer-review start` performs a non-mutating preflight before it creates anything:

1. resolve the repository, physical worktree, artifact, reviews root, explicit
   artifact kind, and output template;
2. require the artifact to be tracked and clean relative to `HEAD`;
3. capture author identity and session transport capability;
4. verify the scratch path is safe and ignored;
5. reserve the resolved review destination and verify its initial tracked output
   paths are available or are a complete-identical retry;
6. create the scratch workspace and initial event only after all checks pass;
7. hydrate `author-startup.md` and `reviewer-invitation.md` from versioned package
   templates.

The templates include the absolute artifact path, absolute scratch workspace,
tracked response paths, review ID, roles, rules of engagement, required commands,
and recovery instructions. Hydration fails if any placeholder remains. Each
generated file records its template version and content hash.

The author agent reads `author-startup.md` and gives the user the absolute path
to `reviewer-invitation.md`. The user copies that path into the collaborating
agent's chat. This invitation transfer is the only required peer-session relay
for a default consensus review. A protected intervention action adds one signed-
grant relay when it is actually needed; optional hardened bootstrap adds one
before startup.

The reviewer runs `peer-review join <reviewer-invitation.md>`. Join verifies the
same physical worktree, registers a distinct session, records its identity and
transport capability, and gives it the reviewer instructions. It does not
require provider or model diversity.

The invitation is self-contained enough for an agent without AITM or the skill
already loaded: it identifies the package, safe invocation form, artifact,
workspace, role constraints, join command, help command, and recovery command.

## Response Templates and Frontmatter

The package ships versioned templates for:

- `author-startup.md`;
- `reviewer-invitation.md`;
- reviewer response;
- author response;
- human good-enough decision;
- review manifest.

Reviewer responses contain these prose sections:

```text
Summary
Findings
Required changes
Optional suggestions
Decision
```

Every item under `Findings` uses a review-unique heading ID:

```text
### R<reviewer-turn>-F<three-digit-sequence> — <title>
```

For example, the first finding in reviewer turn 2 is `R2-F001`. IDs are never
renumbered or reused. At submission the CLI parses the heading grammar, rejects
missing or duplicate IDs and a mismatched turn prefix, and seals the ordered ID
set into reviewer-response frontmatter. Author responses reference each finding
ID in their dispositions. Optional suggestions that may later be overridden use
the same ID grammar; unnumbered prose cannot appear in
`human-decision.unresolved_findings`.

Author responses contain:

```text
Summary
Finding dispositions
Changes made
Declined changes and rationale
Verification
```

The CLI, not the agent, generates and seals YAML frontmatter. Per-turn
frontmatter contains:

```yaml
schema: ai-peer-review.response/v1
review_id: stable-review-id
role: author | reviewer
turn: positive-integer
commit_mode: normal | no-commit
artifact_path: repository-relative-path
artifact_commit: git-commit | null
artifact_blob: git-blob-id | null
artifact_digest: sha256
agent:
  host: runtime-host
  provider: provider-name
  model_id: runtime-model-id
  model_display: human-readable-name
  session_fingerprint: one-way-fingerprint
  identity_source: runtime | declared
started_at: RFC-3339 timestamp
submitted_at: RFC-3339 timestamp
finding_ids: [review-unique-finding-id] # reviewer responses only
answered_finding_ids: [review-unique-finding-id] # author responses only
```

At turn creation the CLI writes protected metadata and empty prose sections. At
submission it validates that protected fields were not edited, refreshes model
identity, fills `submitted_at`, hashes the result, makes it immutable to protocol
transitions, and emits the handoff event.

The CLI renders `human-decision.md` from its own template after it verifies a
good-enough grant. Its sealed frontmatter contains:

```yaml
schema: ai-peer-review.human-decision/v1
review_id: stable-review-id
decision: accepted-over-objections
artifact_path: repository-relative-path
artifact_commit: git-commit | null
artifact_blob: git-blob-id | null
artifact_digest: sha256
unresolved_findings:
  - reviewer_response_path: repository-relative-path
    reviewer_response_digest: sha256
    finding_ids: [stable-finding-id]
human_attestation:
  source: detached-signature | host-approval | test-fixture
  strength: cryptographic-external | hardware-presence | host-verified | cryptographic-local | unverified-test
  signer_id: stable-human-identifier
  signer_fingerprint: public-key-or-host-principal-fingerprint
  challenge_digest: sha256
  verified_at: RFC-3339 timestamp
decided_at: RFC-3339 timestamp
```

The prose records the human's rationale and enumerates the unresolved findings
being overridden. Protected fields come from the signed grant and protocol
authority, not agent-authored text.

## Lifecycle

The normal state sequence is:

```text
awaiting-reviewer
  -> reviewer-turn
  -> author-revision
  -> reviewer-turn (while budget remains)
  -> acceptance-pending
  -> author-finalization
  -> accepted

final revisions-requested -> author-revision -> intervention-required
intervention-required(turn-budget-exhausted) -> signed continuation -> reviewer-turn
intervention-required(turn-budget-exhausted) -> signed good-enough -> accepted-over-objections
claimed turn -> stale-claim | participant-loss -> intervention-required
intervention-required(stale-claim) -> same-session reclaim -> role turn
intervention-required(participant-loss) -> signed participant replacement -> role turn
intervention-required(any reason) -> participant abandonment -> abandoned
```

On turn 1, the reviewer reads `reviewer-invitation.md` and the current artifact.
On later turns, the reviewer also reads the preceding author response and every
frozen supplement. The reviewer writes one response whose decision is exactly
`revisions-requested` or `accepted`.

For `revisions-requested`, the author reads the response, edits the artifact,
writes one author response, verifies the result, and asks the CLI to commit the
round triad. Control returns to the reviewer only after that commit succeeds.

An acceptance response is sealed but remains uncommitted in
`acceptance-pending`. The author then verifies that the accepted artifact blob is
still current, generates the manifest, and commits the acceptance plus manifest.
Only that successful author commit moves the protocol to `accepted`.

In no-commit mode the conversational turns are identical, but author submission
seals the three logical triad members without staging or committing them. Each
handoff records an immutable scratch snapshot and digest of the working artifact.
Finalization generates the manifest and moves the protocol to
`accepted-uncommitted`; it can never enter `accepted` without a commit-backed
review.

### Turn budgets, intervention, and supplements

`start` accepts `--max-turns <positive-integer>` and defaults to 10 reviewer
responses. Each sealed reviewer response consumes one turn, including an
acceptance response. When the final allowed response requests revisions, the
author may still submit the one answer needed to complete that two-sided round;
the protocol then enters `intervention-required` with reason
`turn-budget-exhausted` instead of starting another reviewer turn.

Only a Human Authority grant may continue from intervention. The `continue`
command records the complete attestation, time, prior maximum, requested
increase, effective maximum, resume role, and optional focus document. It adds
only the number of reviewer turns bound into the grant and never silently resets
usage.

During intervention a signed grant may register immutable Markdown supplements
with `supplement --for author|reviewer`. The package imports each regular file
into `.scratch/peer-review/<review-id>/supplements/<supplement-id>.md`,
canonicalizes and hashes the copied bytes, records the attestation and target
role/turn, freezes it on continuation, and requires the targeted participant's
next response to acknowledge every supplement ID. Supplement content remains
scratch-only and is never copied to tracked collateral automatically. The
manifest records each supplement's ID, digest, target, registering human
attestation, acknowledgment response, and `content_retention: scratch-only` so
the evidentiary limitation is explicit.

If consensus is not reached, a signed Human Authority grant may finalize the
completed two-sided exhausted round as `accepted-over-objections`. This is a
distinct terminal status and manifest acceptance basis, never rewritten as
reviewer `accepted`. In normal mode, the final author-owned commit contains the
sealed human-decision record and manifest, and binds the already committed final
two-sided round against the still-current artifact blob. No-commit mode instead
terminates as `accepted-over-objections-uncommitted` with equivalent scratch
hashes and no Git mutation. No agent may choose this outcome or expand the turn
budget without a valid action-specific grant.

Either registered participant may move any intervention reason to terminal
`abandoned` without a grant when no unexpired Human Authority challenge is
pending. Abandonment records the acting participant identity, reason, and
retained paths in scratch, releases the package's destination reservation, and
emits terminal status so a host may release its own occupancy cache. It creates
no acceptance manifest, deletes nothing, and cannot later resume. Existing
tracked responses remain ordinary incomplete review collateral rather than
acceptance evidence. A host may impose a stricter abandonment policy, but the
package default treats it as evidence-preserving termination rather than an
authority escalation.

## Git Ownership and Integrity

The reviewer is read-only except for its exact generated response path and
scratch transport files written through the protocol. The reviewer must not edit
the artifact, stage files, create commits, amend history, switch branches, or
push. Provider hooks and guards should enforce this boundary where supported;
the CLI independently verifies it on every transition.

For every revision round in normal commit mode, the author creates one commit
containing exactly:

1. the sealed reviewer response;
2. the authoritative specification or plan;
3. the sealed author response.

The CLI tolerates unrelated staged and unstaged changes and leaves their index
and working-tree bytes untouched. It refuses pre-existing changes that overlap a
protocol-owned path and validates only the owned-path delta for the round. A
changed `HEAD`, worktree identity, or unexpected protocol-owned path still fails
closed.

Normal-mode revision commits use this explicit sequence:

1. snapshot unrelated staged index entries and refuse pre-existing overlap on
   the artifact or pending response paths;
2. stage exactly the sealed reviewer response, authoritative artifact, and
   sealed author response with path-limited `git add -- <three-paths>`;
3. verify the index and working-tree bytes for those paths both match the sealed
   bytes and no other index entry was changed by the protocol;
4. create a path-limited `git commit --only -- <three-paths>` with the required
   trailers;
5. inspect the resulting commit tree and refuse completion unless its changed
   path set is exactly the three expected paths; and
6. verify every unrelated staged entry still has its pre-commit object ID and
   remains staged and uncommitted.

Acceptance finalization applies the same sequence to the sealed acceptance
response and manifest. Good-enough finalization applies it to the sealed human
decision and manifest. Recovery recognizes a commit only after the exact path
set, index preservation, trailers, and sealed hashes all agree.

If a finding requires no artifact change, the author must explicitly submit
`--no-artifact-change --reason <text>`. The CLI injects that reason into the
author response's `Declined changes and rationale` section before sealing it, and
the receipt binds the unchanged artifact blob instead of pretending a change
occurred.

Each revision commit includes trailers:

```text
Peer-Review-ID: <review-id>
Peer-Review-Turn: <turn>
Peer-Review-Artifact-Blob: <blob-id>
Peer-Review-Reviewer-Response: <sha256>
Peer-Review-Author-Response: <sha256>
```

In normal commit mode, the final author commit contains exactly the sealed
acceptance response and the generated review manifest. Its trailers bind the
accepted artifact blob, acceptance response hash, and manifest hash. The tool
never pushes.

The manifest summarizes participant identities, identity-source caveats, every
turn and decision, artifact commits and blobs, response paths and hashes, model
changes, recovery or participant-replacement events, acceptance, and final
commit. It contains session fingerprints but no raw session identifiers,
transcript locations, tokens, or IPC details.

### No-commit test mode

`peer-review start <artifact> --no-commit` selects no-commit mode for the entire
review. The initial event records `commitMode: no-commit`; this field is
immutable and cannot be converted after startup. `normal` commit mode remains
the default.

Only no-commit mode may select `--test-human-authority <fixture-id>`. That test
authority choice and its `unverified-test` strength are immutable after startup.
The flag is rejected in normal mode and cannot authorize any committed acceptance
evidence.

The author startup, reviewer invitation, status output, response frontmatter,
next-action text, and manifest display `NO-COMMIT TEST MODE`. This prevents test
collateral from being mistaken for durable review approval.

Startup still requires a tracked artifact that is clean relative to `HEAD`. It
also records the initial Git status, `HEAD`, index tree, artifact blob, and
content digests for pre-existing changes. The protocol then owns only the
evolving artifact and its generated response and manifest paths. Pre-existing
unrelated changes may remain, but their paths and bytes must not change during
the review.

Every transition in no-commit mode verifies that:

- `HEAD` equals the startup commit;
- the index tree equals the startup index tree;
- no protocol command in that mode has staged content;
- only protocol-owned paths differ from their startup state;
- the working artifact matches the digest and scratch snapshot sealed by the
  preceding handoff before the next actor begins.

Author submission validates the same logical triad as commit mode, hashes its
three members, copies the exact artifact bytes to an immutable ignored snapshot,
and appends the handoff event. It runs no Git-mutating command. Reviewer
acceptance similarly remains an uncommitted response.

Finalization writes the ordinary tracked manifest but sets:

```yaml
status: accepted-uncommitted
commit_mode: no-commit
final_commit: null
```

The manifest contains the startup commit and blob, every working-artifact digest,
snapshot hash, response hash, decision, and expected dirty path. It is itself
left uncommitted. The terminal `accepted-uncommitted` state means the protocol
completed successfully as a test; it is not interchangeable with durable
`accepted` evidence.

No automatic cleanup command is provided. Human-readable status and JSON output
list every protocol-owned tracked and scratch path so a test harness or human can
remove or restore them deliberately without resetting Git history.

## CLI Contract

The initial command surface is:

```text
peer-review setup
peer-review doctor
peer-review start <artifact> --artifact-kind <spec|plan> [configuration] [--bootstrap-grant <signed-grant>] [--no-commit [--test-human-authority <fixture-id>]]
peer-review request-grant <workspace> --action <protected-action> [action parameters]
peer-review join <reviewer-invitation.md>
peer-review status <workspace>
peer-review resume <workspace>
peer-review submit <workspace> [--decision revisions-requested|accepted]
peer-review supplement <workspace> <file> --for <author|reviewer> --grant <signed-grant>
peer-review continue <workspace> [--additional-turns <N>] [--focus <file>] --grant <signed-grant>
peer-review finalize <workspace> [--good-enough --grant <signed-grant>]
peer-review recover <workspace> [--reclaim | --replace-participant <role> --grant <signed-grant>]
peer-review abandon <workspace> --reason <text>
```

`setup` supports agent selection, user or project scope, `--dry-run`, and
`--remove`. In Phase 1 it installs the skill and identity/resume adapters. In
Phase 2 it may also install the MCP handoff server and provider-specific timeout
settings. It preserves existing configuration, displays the proposed diff,
creates a backup before edits, and marks only its own reversible additions. It
works in non-Node host projects; Node is a tool runtime, not a project-language
requirement.

`doctor` is read-only. It reports package resolution, skill availability,
identity source, session fingerprint availability, Git/worktree safety, scratch
ignore status, Human Authority verifier and strength, supported wake mode, and
whether the requested review mode is possible. In Phase 1, MCP connectivity,
resident liveness, long tool timeout, and automatic-required rows report
`not-installed (Phase 2 optional)` and do not make manual or resume-only health
fail. In Phase 2 they become active checks; requesting automatic-required mode
makes an unavailable or unhealthy row fail.

`status` and `resume` reconstruct the current actor's exact next action from
events. They do not wake the model by polling. `recover` validates integrity,
rebuilds projections, reconciles idempotent deliveries and Git trailers, and
prints an explicit recovery plan before any approved mutation.

`--no-commit` is valid only on `start`. Passing it to another command or trying
to change the stored mode returns a stable usage or mode-conflict error. Commands
infer the mode from protocol state after startup.

## Agent-Queryable Help

Help is a first-class offline API:

```text
peer-review --help
peer-review <command> --help
peer-review help <command>
peer-review help --all
peer-review help search <term>
peer-review help submit --json
peer-review status <workspace> --json
peer-review status <workspace> --next
peer-review explain <error-code>
```

Every command topic documents:

- purpose, valid roles, and valid states;
- positional arguments, flags, defaults, and environment variables;
- preconditions and fail-closed checks;
- every file, Git, configuration, and transport effect;
- whether it commits, pushes, blocks, wakes, or spends model tokens;
- behavior differences and terminal-state meaning in no-commit mode;
- copyable examples for installed and zero-install use;
- resulting state and exact next action;
- stable errors and their recovery commands;
- the versioned JSON response schema.

Help is offline, read-only, exits zero when the topic exists, and is covered by
golden tests. The skill explicitly tells an agent to query help instead of
guessing syntax. Machine output never mixes prose or ANSI decoration with JSON.

## Phase 2: Token-Free Automatic Handoff

The primary transport is a local MCP tool:

```text
wait_for_handoff(review_id, participant)
```

After submitting a turn, an agent calls this blocking tool. The local MCP server
watches the review's delivery directory using filesystem events. Waiting occurs
inside the tool process, not as repeated model turns, so an unchanged wait spends
no context tokens. When the peer submits a handoff, the tool returns one compact,
structured delivery and the same provider session resumes. The wait is race-safe:
it checks the durable delivery sequence before subscribing, so a handoff that
arrived just before the wait is returned immediately.

The server does not edit session logs or depend on undocumented provider files.
It stores provider resume handles only in scratch state. Setup configures a long
MCP tool timeout where the host exposes one. For example, Codex configuration has
a tool timeout setting and Claude Code permits long-running MCP calls; exact keys
and defaults are adapter-versioned rather than hard-coded into the core protocol.

Each participant advertises one transport capability:

- `live-wait`: the session can remain blocked on the local MCP tool;
- `native-push`: an official provider/app-server event can resume the session;
- `resume-only`: the official CLI can resume the recorded session after a
  delivery, but no automatic push is available;
- `manual`: only the user can return to the session.

Automatic-required mode fails closed during join unless both participants have a
non-manual transport and the end-to-end transport health check passes. Other
modes remain usable with explicit disclosure. A transport failure leaves the
turn in `delivery-pending`; it never loses or repeats the sealed handoff. Manual
resume remains the final recovery route.

## Error and Recovery Contract

Errors use stable `APR_*` (`ai-peer-review`) codes, structured fields, and one
exact recovery command. Representative categories include unsafe paths,
unignored scratch, artifact drift, duplicate session, wrong role, protected
metadata changes, unexpected worktree changes, output collision, stale delivery,
transport unavailable, missing/invalid/replayed Human Authority grant, projection
drift, commit failure, no-commit mode conflict, test baseline drift, stale claim,
and participant loss.

All mutating commands follow this order:

1. read and validate inputs without mutation;
2. acquire the review lock;
3. reread and revalidate authority;
4. write content and event records atomically;
5. update projections;
6. emit or acknowledge a durable delivery;
7. return the new state and exact next action.

Exact retries are idempotent. Conflicting retries fail closed. Event authority
allows `recover` to rebuild projections after interruption. Commit recovery may
recognize only commits whose full trailer set and file hashes agree with the
expected turn. A missing participant may be replaced only through an explicit
recovery operation that records the old and new fingerprints, actor, reason, and
time; replacement never rewrites earlier provenance.

Output recovery distinguishes three cases. A complete-identical file whose
protected metadata and digest match the current review is reused idempotently. An
unsealed same-review draft may be resumed only when event authority identifies it
as the pending turn. A complete foreign review at the configured destination may
cause the new review to select only the deterministic sibling suffix
`-recovery-<review-id>` after foreign-manifest validation. Partial, mixed, or
conflicting content returns
`APR_OUTPUT_COLLISION`, preserves every byte, and prints the inspection and human
recovery command; it is never overwritten or silently renumbered.

In no-commit mode, recovery never searches for or creates commit trailers. It
rebuilds authority from events, content hashes, immutable scratch snapshots, the
unchanged startup `HEAD` and index, and the current protocol-owned paths. Missing
or conflicting snapshots fail closed rather than treating the current artifact
as historical evidence.

## AITM Integration and Migration

AITM adds `ai-peer-review` as a package dependency and invokes its installed
`peer-review` binary or programmatic read-only API. AITM may:

- include its skill in agent bootstrap;
- pass an issue ID as opaque metadata;
- configure its preferred tracked reviews root;
- configure the `<issue>/<kind>` review path template and require both inputs;
- provide richer backlog context in its own author or reviewer prompt;
- read per-review status through the standalone package's read-only API.

AITM continues to own its main-worktree-anchored cross-worktree occupancy index.
It may cache standalone review IDs and status there, but that cache is not review
evidence or package authority. The standalone package does not scan sibling
worktrees or maintain a global occupancy registry.

AITM's governed production workflow may reject `commitMode: no-commit` while its
test harness enables it explicitly. The standalone package does not infer that
policy from the presence of AITM.

AITM does not wrap the CLI with `npx aitm peer-review`. The standalone package's
help and templates remain authoritative, preventing two command surfaces from
drifting.

Migration removes AITM's duplicate co-review command, templates, and runtime only
after dependency integration and parity tests pass. It refuses removal while a
legacy review is active. Existing accepted archives remain immutable in their
current layout. The new package starts only the new schema; it does not silently
upgrade or rewrite legacy protocols.

## Testing Strategy

### Phase 1 suite

The extracted project carries forward applicable tests and adds:

- unit tests for state transitions, identity normalization, hashing, path
  containment, error codes, projections, and manifest generation;
- Git integration tests for reviewer restrictions, exact-path author commits,
  revision triads, no-artifact-change receipts, acceptance finalization, a dirty
  tree whose unrelated staged entry remains staged and uncommitted after the
  review commit, interrupted commits, and trailer recovery;
- lifecycle tests for default and adjusted turn budgets, exhaustion,
  signed continuation, frozen supplement acknowledgment, same-session reclaim,
  participant replacement, abandonment, intervention freeze, and distinct
  accepted-over-objections evidence;
- Human Authority tests for default grant-free startup, optional hardened
  bootstrap, canonical parameters for every protected action, exact
  action/parameter/intervention binding, expiry, replay, signer mismatch,
  verifier pinning, prevention/detection grading, host receipts, and
  no-commit-only test fixtures;
- no-commit integration tests proving unchanged `HEAD` and index, permitted
  working-tree paths, per-turn artifact snapshots, digest mismatch refusal,
  idempotent recovery, no Git-mutating subprocesses, and
  `accepted-uncommitted` finalization;
- adapter tests using fake Codex, Claude Code, Grok, and generic provider
  surfaces, including model changes, declared-identity fallback, and Phase 1
  staleness-only claims;
- golden tests for every template, help topic, JSON schema, generated next
  action, parsed/sealed finding ID set, human-decision record, and `APR_*`
  explanation;
- packaging tests that inspect `npm pack` contents and execute the packed binary;
- macOS, Linux, and Windows smoke tests for installation, setup dry-run,
  `npx ai-peer-review --help`, start, join, one revision triad, and acceptance;
- AITM migration parity tests and the active-legacy-review removal guard.

Phase 1 targets Node.js 22 or later and zero third-party runtime dependencies.

### Phase 2 suite

Phase 2 adds:

- MCP tests for blocking waits, delivery-before-subscribe races, simultaneous
  delivery, timeout, reconnect, duplicate delivery, and token-free idle behavior;
- resident-liveness tests for heartbeat refresh, lease expiry, PID reuse, opaque
  host handles, adapter downgrade, and participant-loss intervention;
- automatic-required setup, doctor, adapter, and cross-platform transport tests.

Phase 2 may add the official MCP SDK if interoperability requires it; every new
runtime dependency requires a recorded necessity, license check, security audit,
and packed-size impact. Test and development dependencies remain separately
audited and are not shipped as runtime dependencies.

Live-provider tests are opt-in and never required for ordinary pull requests.
The default suite uses deterministic fake transports and temporary Git
repositories.

## Security and Privacy

- Canonical containment checks reject traversal and symlink escapes for artifact,
  response, scratch, template, and reviews-root paths.
- Reviewer writes are limited to the exact pending response and protocol-mediated
  scratch delivery.
- Secrets, raw session IDs, transcript paths, wake handles, and provider tokens
  are prohibited from tracked collateral and redacted from diagnostics.
- Prevention-grade deployments keep Human Authority private keys or approval
  credentials outside the agent's usable boundary. The package cannot enforce
  that isolation for same-user software keys: those are detection-grade because
  an agent may read or invoke them and forge grants. Protocol state stores only
  pinned public verifiers, scoped grants, and non-secret attestation metadata,
  and the manifest preserves the configured grade and residual risk.
- Template content is data, never executed shell or JavaScript.
- Configuration edits require explicit setup scope, preserve prior content, and
  are reversible.
- Zero-install commands use the unique `ai-peer-review` package name to avoid
  dependency confusion with the unrelated `peer-review` package.
- The protocol records provenance and hashes, but does not claim that local
  identity metadata is cryptographic vendor attestation.

## License, Relicensing, Publication, and Provenance

Publish the standalone repository under Apache License 2.0. This is an explicit
relicensing of the extracted subset by its copyright holder, not a conclusion
derived from AITM's existing license. Before the extraction commit, preserve the
audit command and normalized result in the extraction manifest:

```text
git log --format='%an <%ae>' -- scripts/review | sort -fu
```

At source commit `4b3bcd43cba141a611da4a2b861433b915462806`, the audit identifies
only Kendrick Burson under two historical email identities. A repository-wide
audit identifies the same copyright holder under three email identities. The
holder must sign the extraction manifest's Apache-2.0 relicensing declaration;
any newly discovered contributor or third-party material blocks publication
until its license grant and required notices are resolved. This design records a
release gate, not legal advice.

The filtered history retains only the selected review source, tests,
documentation, templates, and skill paths, plus AITM's root AGPL `LICENSE`,
`NOTICE`, and `LICENSE-COMMERCIAL` as they existed in each source commit. Those
rewritten historical trees remain available under the original AGPL/commercial
terms; they are not silently presented as Apache-licensed historical releases.
The new repository's bootstrap commit replaces the root licensing files with the
complete Apache-2.0 `LICENSE`, an accurate `NOTICE`, SPDX headers or a documented
header policy, the signed relicensing declaration, and a `CONTRIBUTING.md`
statement that new contributions are Apache-2.0. The declaration identifies the
retained source snapshot covered by the new grant. The standalone repository and
releases are distributed under Apache-2.0 from that first publishable bootstrap
commit onward, while original AITM commits and releases remain under their
existing terms.

The business consequence is intentional and must be approved in the signed
relicensing declaration: Apache-2.0 permits proprietary and closed-source forks
of the standalone engine without AGPL reciprocity, subject to Apache-2.0's terms.
That reduces the exclusive scope of AITM's commercial license for this extracted
component. If the copyright holder does not approve that consequence, Phase 1
must not publish under Apache-2.0 and the license choice returns to design review.
AITM may depend on the Apache-2.0 package while AITM remains AGPL/commercially
dual-licensed.

Apache-2.0 grants recipients a copyright license and an express patent license
for patent claims necessarily infringed by their contributions. Its patent grant
terminates for a party that initiates specified patent litigation over the work.
This reduces contributor patent risk but is not a substitute for legal advice or
a patent-clearance opinion.

Public source is a project requirement for the first npm release. Publication is
also part of the defensive-disclosure strategy: a public, enabling description
with independently verifiable dates is stronger evidence of prior art than local
Git timestamps, whose author and committer dates can be rewritten.

The first and later releases must:

1. publish the GitHub repository before or with the npm package;
2. create a signed, immutable Git tag and GitHub release;
3. publish through npm trusted publishing with provenance when supported;
4. attach the packed tarball, checksums, source AITM commit, and extraction
   manifest to the release;
5. archive the release with an independent durable service such as Zenodo and
   request archival by Software Heritage;
6. record all resulting URLs, identifiers, timestamps, and hashes in the release
   manifest.

These records strengthen authorship and publication evidence; they do not by
themselves guarantee freedom to operate or prevent every later patent claim.

## Acceptance Criteria

Phase 1 extraction and manual release are complete when:

1. `ai-peer-review` is public, Apache-2.0 licensed, and installable from npm.
2. `npx ai-peer-review --help` works without AITM and the installed
   `npx peer-review --help` resolves locally.
3. The `peer-review` skill can initialize a review in a non-AITM repository.
4. Two distinct sessions can join regardless of provider/model equality.
5. Identity and model provenance appear in every response without exposing raw
   session data in Git.
6. The reviewer cannot edit or commit the artifact.
7. In normal commit mode, each revision is one author commit containing reviewer
   response, artifact, and author response, with verified hashes and trailers.
8. In normal commit mode, acceptance becomes final only after the author commits
   the acceptance and manifest against the still-current accepted artifact blob.
9. Scratch protocol state is ignored while review collateral is written directly
   to the configured tracked reviews root.
10. Complete offline and JSON help lets an agent recover syntax and next actions
    without guessing.
11. A default consensus review starts without a signing ceremony, pins and
    displays any configured verifier/grade, and cannot exceed its initial budget
    or create override evidence without Human Authority.
12. Protected actions use one-time action-, parameter-, intervention-, nonce-,
    and expiry-bound grants. Prevention-grade and detection-grade deployments are
    named accurately, and same-user software keys never claim key isolation.
13. Reviewer submission validates review-unique finding headings and seals their
    ordered IDs so author dispositions, manifests, and human decisions have a
    stable reference producer.
14. Review budgets stop an exhausted loop, signed continuation grants add only
    bounded turns, supplements are integrity-bound and acknowledged, and
    accepted-over-objections remains distinct from reviewer acceptance.
15. A good-enough outcome includes a sealed human-decision record naming the
    attestation and every unresolved finding; supplement metadata and its
    scratch-only retention are explicit in the manifest.
16. Phase 1 claims record the CLI PID only as a forensic value, default to an
    eight-hour TTL, describe expiry as staleness rather than liveness, allow only
    same-fingerprint reclaim without a grant, and never steal a stale claim.
17. A participant may terminate intervention as `abandoned` without fabricating
    acceptance or deleting evidence, while an outstanding Human Authority
    challenge freezes agent state changes until it expires or is consumed.
18. AITM consumes the package without retaining a duplicate CLI or schema and
    protects active legacy reviews during migration.
19. Unit, Git integration, manual/resume adapter, golden, packaging,
    cross-platform, and AITM parity suites pass.
20. The public release contains signed relicensing and independently archived
    provenance for the source, package, and extraction history.
21. A `--no-commit` review completes the normal author/reviewer dialogue while
    leaving `HEAD` and the index unchanged, recording immutable scratch snapshots,
    leaving all collateral uncommitted, and terminating as
    `accepted-uncommitted`.

Phase 2 automatic transport is complete when:

1. A live MCP wait resumes on a real handoff without periodic model turns.
2. Delivery-before-subscribe, reconnect, timeout, and duplicate-delivery tests
   prove that sealed handoffs are neither lost nor repeated.
3. Automatic-required mode fails closed unless both adapters and the end-to-end
   health check support it.
4. Manual and resume-only fallbacks recover transport failures without data loss.
5. Resident adapters provide current heartbeat-backed liveness through a tested
   process-instance or official host handle; generic adapters remain
   staleness-only.
6. MCP, automatic adapter, setup, and cross-platform transport suites pass.
