# AI Peer Review Extraction Design

<!-- cspell:words Zenodo -->

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
provenance, and a local MCP handoff service that blocks without spending model
tokens.

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
7. Resume agents only when a real handoff arrives, without timer-driven model
   wake events or mutation of provider session logs.
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
- handoff delivery and token-free waiting;
- author-owned exact-path commits and review manifests;
- CLI, JSON contracts, help, diagnostics, and recovery.

The host project owns:

- the artifact's subject matter and quality bar;
- any issue, backlog, board, or delivery lifecycle;
- project-specific review-output configuration;
- installing or invoking the skill;
- supplying additional context to either agent.

An optional issue ID is opaque host metadata. It may be included in filenames
and the manifest, but it has no effect on protocol eligibility or state.

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

Before publishing the new history, scan every retained commit for credentials,
private data, generated runtime state, and unrelated AITM content. Rewrite the
filtered repository before public release if the scan finds material that does
not belong in the standalone project.

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
```

The CLI resolves canonical paths and refuses symlink escapes. It verifies that
the scratch directory is not tracked. With explicit confirmation from `setup`,
it may add `.scratch/peer-review/` to the worktree's `.git/info/exclude`; it does
not edit the repository's tracked `.gitignore` automatically.

`events.jsonl` is append-only authority. `protocol.json` and
`participants.json` are atomic projections that can be rebuilt from events.
Locks protect transitions, and all durable writes use temporary sibling files
plus atomic rename.

Raw provider session IDs, transcript paths, IPC endpoints, and wake handles are
scratch-only. They must never appear in tracked responses or manifests.

### Tracked review collateral

The default output root is:

```text
docs/superpowers/reviews/<spec|plan>/
```

Projects may configure another repository-contained root. The artifact kind is
derived or explicitly selected as `spec` or `plan`. Output names are:

```text
YYYY-MM-DD-<name>-reviewer-response-<turn>.md
YYYY-MM-DD-<name>-author-response-<turn>.md
YYYY-MM-DD-<name>-review-manifest.md
```

When an issue ID is supplied, insert `<issue-id>-` before `<name>`. The resolved
output path must stay inside the repository, and existing files are never
silently overwritten.

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

## Startup and Generated Prompts

The user starts a review by asking an agent to peer-review an artifact, supplying
the artifact path and optionally an issue ID. The invoking session is presumed
to be the author.

`peer-review start` performs a non-mutating preflight before it creates anything:

1. resolve the repository, physical worktree, artifact, and output root;
2. require the artifact to be tracked and clean relative to `HEAD`;
3. capture author identity and session transport capability;
4. verify the scratch path is safe and ignored;
5. verify every intended tracked output path is available;
6. create the scratch workspace and initial event only after all checks pass;
7. hydrate `author-startup.md` and `reviewer-invitation.md` from versioned package
   templates.

The templates include the absolute artifact path, absolute scratch workspace,
tracked response paths, review ID, roles, rules of engagement, required commands,
and recovery instructions. Hydration fails if any placeholder remains. Each
generated file records its template version and content hash.

The author agent reads `author-startup.md` and gives the user the absolute path
to `reviewer-invitation.md`. The user copies that path into the collaborating
agent's chat. This invitation transfer is the only required manual relay.

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
- review manifest.

Reviewer responses contain these prose sections:

```text
Summary
Findings
Required changes
Optional suggestions
Decision
```

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
commit_mode: enabled | disabled
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
```

At turn creation the CLI writes protected metadata and empty prose sections. At
submission it validates that protected fields were not edited, refreshes model
identity, fills `submitted_at`, hashes the result, makes it immutable to protocol
transitions, and emits the handoff event.

## Lifecycle

The normal state sequence is:

```text
awaiting-reviewer
  -> reviewer-turn
  -> author-revision
  -> reviewer-turn
  -> acceptance-pending
  -> author-finalization
  -> accepted
```

The reviewer reads the current artifact and the preceding author response, then
writes one reviewer response. Its decision is exactly
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

The CLI uses exact path arguments and refuses staged or unstaged changes outside the
expected paths. Unrelated worktree changes remain untouched. If a finding
requires no artifact change, the author must explicitly submit
`--no-artifact-change --reason <text>`; the receipt then binds the unchanged
artifact blob instead of pretending a change occurred.

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
review. The initial event records `commitMode: disabled`; this field is immutable
and cannot be enabled, disabled, or converted after startup. Normal commit mode
remains the default.

The author startup, reviewer invitation, status output, response frontmatter,
next-action text, and manifest display `NO-COMMIT TEST MODE`. This prevents test
collateral from being mistaken for durable review approval.

Startup still requires a tracked artifact that is clean relative to `HEAD`. It
also records the initial Git status, `HEAD`, index tree, artifact blob, and
content digests for pre-existing changes. The protocol then owns only the
evolving artifact and its generated response and manifest paths. Pre-existing
unrelated changes may remain, but their paths and bytes must not change during
the review.

Every transition verifies that:

- `HEAD` equals the startup commit;
- the index tree equals the startup index tree;
- no protocol command has staged content;
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
commit_mode: disabled
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
peer-review start <artifact> [--issue-id <id>] [--reviews-root <path>] [--no-commit]
peer-review join <reviewer-invitation.md>
peer-review status <workspace>
peer-review resume <workspace>
peer-review submit <workspace> [--decision revisions-requested|accepted]
peer-review finalize <workspace>
peer-review recover <workspace>
```

`setup` supports agent selection, user or project scope, `--dry-run`, and
`--remove`. It can install the skill, identity adapter, MCP handoff server, and
provider-specific timeout settings. It preserves existing configuration,
displays the proposed diff, creates a backup before edits, and marks only its own
reversible additions. It works in non-Node host projects; Node is a tool runtime,
not a project-language requirement.

`doctor` is read-only. It reports package resolution, skill availability,
identity source, session fingerprint availability, Git/worktree safety, scratch
ignore status, MCP connectivity, timeout configuration, supported wake mode,
and whether automatic-required review is possible.

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

## Token-Free Automatic Handoff

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

Errors use stable `APR_*` codes, structured fields, and one exact recovery
command. Representative categories include unsafe paths, unignored scratch,
artifact drift, duplicate session, wrong role, protected metadata changes,
unexpected worktree changes, stale delivery, transport unavailable, projection
drift, commit failure, no-commit mode conflict, test baseline drift, and
participant loss.

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
- provide richer backlog context in its own author or reviewer prompt;
- read active review occupancy through the standalone package's read-only API.

AITM's governed production workflow may reject `commitMode: disabled` while its
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

The extracted project carries forward applicable tests and adds:

- unit tests for state transitions, identity normalization, hashing, path
  containment, error codes, projections, and manifest generation;
- Git integration tests for reviewer restrictions, exact-path author commits,
  revision triads, no-artifact-change receipts, acceptance finalization, dirty
  worktrees, interrupted commits, and trailer recovery;
- no-commit integration tests proving unchanged `HEAD` and index, permitted
  working-tree paths, per-turn artifact snapshots, digest mismatch refusal,
  idempotent recovery, no Git-mutating subprocesses, and
  `accepted-uncommitted` finalization;
- MCP tests for blocking waits, delivery-before-subscribe races, simultaneous
  delivery, timeout, reconnect, duplicate delivery, and token-free idle behavior;
- adapter tests using fake Codex, Claude Code, Grok, and generic provider
  surfaces, including model changes and declared-identity fallback;
- golden tests for every template, help topic, JSON schema, generated next
  action, and `APR_*` explanation;
- packaging tests that inspect `npm pack` contents and execute the packed binary;
- macOS, Linux, and Windows smoke tests for installation, setup dry-run,
  `npx ai-peer-review --help`, start, join, one revision triad, and acceptance;
- AITM migration parity tests and the active-legacy-review removal guard.

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
- Template content is data, never executed shell or JavaScript.
- Configuration edits require explicit setup scope, preserve prior content, and
  are reversible.
- Zero-install commands use the unique `ai-peer-review` package name to avoid
  dependency confusion with the unrelated `peer-review` package.
- The protocol records provenance and hashes, but does not claim that local
  identity metadata is cryptographic vendor attestation.

## License, Publication, and Provenance

Publish the standalone repository under Apache License 2.0. Include the complete
license text and a `CONTRIBUTING.md` statement that submitted contributions are
licensed under Apache-2.0. Before extraction, confirm that retained source is
owned by contributors who can license it and preserve required notices for any
third-party material.

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

The extraction is complete when:

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
9. A live MCP wait resumes on a real handoff without periodic model turns, and
   documented fallback modes recover without data loss.
10. Scratch protocol state is ignored while review collateral is written directly
    to the configured tracked reviews root.
11. Complete offline and JSON help lets an agent recover syntax and next actions
    without guessing.
12. AITM consumes the package without retaining a duplicate CLI or schema and
    protects active legacy reviews during migration.
13. Unit, Git integration, transport, adapter, golden, packaging, cross-platform,
    and AITM parity suites pass.
14. The public release contains signed, independently archived provenance for the
    source, package, and extraction history.
15. A `--no-commit` review completes the normal author/reviewer dialogue while
    leaving `HEAD` and the index unchanged, recording immutable scratch snapshots,
    leaving all collateral uncommitted, and terminating as
    `accepted-uncommitted`.
