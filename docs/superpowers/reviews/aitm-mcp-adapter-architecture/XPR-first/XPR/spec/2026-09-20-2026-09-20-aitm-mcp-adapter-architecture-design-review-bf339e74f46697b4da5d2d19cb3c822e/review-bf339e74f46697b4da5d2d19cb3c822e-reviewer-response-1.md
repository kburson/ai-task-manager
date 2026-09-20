<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-bf339e74f46697b4da5d2d19cb3c822e"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
artifact_commit: "93a2c790be8c771324ae51eaf35b41bf029dd6ea"
artifact_blob: "a076d41e917efa17d7a23de75d139f1d898cef43"
artifact_digest: "sha256:7066ff40fdfffa399d279f453b3e4ee7dd0e26f96effcc2dff0475b76c2cf783"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:7269798814f6e42c7dbd35031039451c136e87664d5bf2159f1e59823321f699"
  identity_source: "declared"
started_at: "2026-09-20T21:48:53.667Z"
submitted_at: "2026-09-20T21:54:14.764Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed `docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md`
at blob `a076d41e`, against `docs/decisions/0002-github-native-authority-records.md`,
`docs/decisions/0001-test-tree-convention.md`, and the implementation present in
this checkout (`package.json`, `scripts/task-tracker/verbs/`,
`scripts/task-tracker/lib/`, `scripts/task-tracker/lib/github-records/`,
`scripts/gh/`, `scripts/providers/`).

The core thesis is sound and well-argued. Moving workflow policy, action
semantics, evidence, and recovery into a headless kernel, and confining provider
identifiers and APIs to capability-scoped adapters, is the correct response to
the motivating defect (a GitHub GraphQL node ID escaping the GitHub integration
and becoming an agent responsibility). The separation of `discoverable` /
`compatible` / `trusted`, the refusal to build an allowlist, the refusal to add a
private database, the staleness classification table, the diagnostic-only
fail-closed mode, and the honest `strict` / `guarded` / `behavioral` assurance
ladder are all strong decisions that I would not change.

The design is not yet accept-ready. Seven issues are structural rather than
editorial: the MCP surface as specified cannot invoke most of the portable action
vocabulary that exists in this repository today; the design claims to preserve
ADR 0002 while silently dropping two of ADR 0002's explicitly *required*
mitigations, which are precisely the mitigations that make concurrent writers
safe on a provider without compare-and-swap; the recovery mechanism is specified
only for mutations that can carry an idempotency marker, which excludes the
single most common mutation class in this codebase; the adapter ABI has no stated
version baseline or package entry point and the current package cannot express
either; `strict` assurance rests on an unbounded negative with no stated
mechanism; and the word "provider" already means something else in this tree.

Each of these is resolvable inside the current architecture. None of them
requires abandoning the approach. Findings R1-F001 through R1-F007 have
corresponding required changes; the three suggestions are optional.

## Findings

### R1-F001 — No MCP invocation path exists for portable actions outside the seven typed tools

The MCP surface (lines 290-326) is: five read-only discovery tools, seven typed
mutation tools (`aitm_start_work`, `aitm_record_evidence`, `aitm_transition`,
`aitm_verify`, `aitm_deliver`, `aitm_close`, `aitm_recover`), and
`aitm_invoke_extension`. The extension tool is scoped explicitly and only to
"uncommon namespaced adapter extensions" (line 322), whose examples are all
vendor-namespaced (`github:`, `gitlab:`, `bitbucket:`, `jira:`, lines 250-256).

That leaves portable, non-namespaced core actions with no route. The spec names
one itself: `work-item.create` (line 561) is a portable kernel action, is not one
of the seven typed tools, and is not a namespaced adapter extension. It is
therefore undiscoverable-to-invocable over MCP as written. This is not a corner
case. This checkout has 66 verb modules under `scripts/task-tracker/verbs/`,
including `new`, `block`, `unblock`, `split-plan`, `shelve`, `park`, `supersede`,
`reopen`, `assign`, `kind`, `workflow-exception`, `decompose-check`, and
`epic-reconcile`. None maps cleanly onto the seven typed tools, and none is a
vendor extension.

Two readings are possible and the spec does not choose between them:

1. The portable vocabulary really is approximately seven actions, and the other
   ~59 verbs collapse into them as parameterized variants. If so, the spec must
   say so and must show the collapse, because that is a very large claim about
   the existing surface and it drives Phase 1's inventory step (line 736).
2. The portable vocabulary is large and MCP needs a generic
   `aitm_invoke_action`-style tool alongside the typed ones. If so, the tiering
   rationale ("hosts can display precise intent and approvals", line 318) must be
   restated, because the generic tool reintroduces exactly the opacity the typed
   tier exists to avoid.

This gap also weakens the release gates. "Undocumented or undiscoverable actions"
and "CLI and MCP behavioral divergence" (lines 721-724) are listed as rejections,
but transport parity is only specified to cover "common actions" (line 697). An
action reachable from the CLI and unreachable from MCP is the definition of
behavioral divergence, and the parity test as scoped would not catch it.

Related, and smaller: `orchestrator-only` actions are said to have "no directly
callable MCP tool" (line 260). Once `aitm_invoke_extension` exists, that property
must be enforced by policy inside the extension tool rather than asserted by the
absence of a dedicated tool. The spec should state that
`aitm_invoke_extension` refuses `orchestrator-only` identifiers.

### R1-F002 — ADR 0002's required coordinator and epoch-fencing mitigations are dropped while the spec claims preservation

Lines 584-593 state that this design "preserves [ADR 0002's] storage-neutral
principles—external durable authority, append-first mutation, immutable capsules,
rebuildable projections, and no required AITM database—but generalizes the
authority."

ADR 0002 lists nine items under **Required mitigations** (lines 138-148 of the
ADR). Two of them do not appear anywhere in this design:

- "one authoritative coordinator per governed scope"; and
- "epoch-fenced grants and assignments".

ADR 0002 also devotes a full decision subsection to **Scoped coordination**
(ADR lines 60-65): one coordinator per governed epic or standalone issue, nested
delegation via a scoped epoch-fenced grant, workers append submissions, and
*only the active coordinator* may accept submissions and update authoritative
projections.

This design replaces that entire mechanism with a single sentence: "Concurrent
writers use an expected-head precondition. An adapter with conditional-update
support performs compare-and-append. Other adapters reread and verify around the
append" (lines 628-631).

Three problems follow.

First, GitHub — the built-in default, and the only adapter that exists — has no
conditional-update support for issue comments. `updateIssueComment` in
`scripts/task-tracker/lib/github-records/github-comment-store.mjs` takes `id` and
`body` and nothing else; there is no `If-Match`, no expected-version argument, no
CAS. So the GitHub adapter falls into the "reread and verify around the append"
branch, which is a read-modify-write race, not a precondition. The spec
acknowledges the resulting forks are possible ("Detected forks remain visible and
are joined by an explicit reconciliation record", line 630) but treats forking as
an acceptable steady state rather than as the failure mode ADR 0002 designed the
coordinator to prevent.

Second, the forking rate is not incidental in this project. The design introduces
a *project-level* control stream (lines 560-565) that holds setup, plugin,
cross-item, and bootstrap events — a single shared append point. This repository
routinely runs multiple concurrent sessions: linked worktrees
(`scripts/task-tracker/cut-child-worktree.mjs`,
`ensure-worktree-seeded.mjs`, `worktree-binding-guard.mjs`), a fleet registry
(`scripts/task-tracker/fleet-registry.mjs`, `verbs/fleet.mjs`), and parallel
agents. Every one of those sessions contends on the same control stream through a
read-modify-write with no CAS. ADR 0002's coordinator exists precisely to
serialize that.

Third, the omission is undisclosed. The spec presents itself as generalizing
ADR 0002, and commits to "add a replacement ADR before activating a non-GitHub
backlog" (line 592). A reader comparing the two documents should be told which
ADR 0002 mechanisms are retained, which are deliberately superseded and by what,
and which are deferred to a later phase. Right now a required mitigation
disappears without a note.

I am not asserting the coordinator model must be retained verbatim. It may well
be right to replace scoped coordination with optimistic append plus explicit
fork-join, especially since the new design admits non-GitHub authorities. But
that is a deliberate reversal of an Accepted ADR's required mitigation and it
needs to be argued, not omitted.

### R1-F003 — Interrupted-write recovery is specified only for mutations that can carry an idempotency marker

The recovery flow depends on a marker search: "If execution stops between
provider mutation and the outcome receipt, recovery finds the unmatched request.
The adapter searches using the idempotency marker" (lines 616-618). The `observe`
method is defined as "Determine which external effects occurred" (line 212).

This works when the external mutation has a body AITM controls — an issue comment
can embed an `actionId`, and this repo already relies on that pattern heavily
(`scripts/task-tracker/lib/evidence-markers.mjs`,
`stage-entry-markers.mjs`, the `aitm-*` HTML-comment marker family enforced by
`lib/body-invariants.mjs`).

It does not work for mutations with no marker-carrying surface. The clearest
example is the one this project performs most: setting the GitHub Projects
`Status` field (`scripts/gh/move-state.mjs`,
`scripts/task-tracker/lib/move-state/github-mutation.mjs`). A ProjectV2 field
value is a bare value. There is nowhere to stamp an `actionId`. The same applies
to label add/remove (`gh issue edit --add-label`, used by the BLOCKED-annotation
flow), assignee changes (`lib/assignee-guard.mjs`), priority and rank
(`scripts/gh/set-priority.mjs`, `set-rank.mjs`), and milestone edits.

For all of those, `observe` after a crash can read the current value and find it
equal to the intended value — but equality does not establish authorship. A
concurrent human or a second agent may have made the identical change. The
adapter cannot distinguish "my write landed" from "someone else's write landed"
from "the value was already correct". The spec's own principle, "AITM never
blindly repeats an ambiguous mutation" (line 626), is correct but gives no
classification rule for this case, and the three available reconciliation
outcomes (lines 620-624) do not obviously cover it:
`action.reconciled` overclaims, `action.retry-authorized` is unsafe for
non-idempotent effects, and `action.intervention-required` would fire on a very
large fraction of ordinary board moves if chosen as the default. Note also that
this is the dominant mutation class in this repository, not a corner case.

The spec needs an explicit taxonomy of mutation observability and a stated
outcome per class. At minimum: marker-attributable, value-attributable (the
observed value uniquely implies our write given the recorded prior value),
and non-attributable. The third class also interacts with R1-F002: without an
authoritative coordinator, "the prior value was X and is now Y so it must have
been us" is not sound under concurrency.

### R1-F004 — The adapter ABI has no version baseline and no package entry point

The ABI examples assert a v2 compatibility line:
`"peerDependencies": { "@kburson/ai-task-manager": "^2.0.0" }` (line 185) and
`"coreApi": "^2"` (line 197). The import path is
`@kburson/ai-task-manager/adapter-sdk` (line 177). Migration promises "Existing
CLI verbs remain supported for at least one major-version transition" (line 811),
and the staleness table keys on "generator package version and setup ABI"
(line 507).

`package.json` in this checkout declares `"version": "0.1.0"`, no `main`, no
`module`, and no `exports` map. Its `files` array ships `bin/`, `config/`,
`skill/`, `hooks/`, `scripts/` (minus tests and maintenance), `statusline/`,
selected docs, and `templates/` — nothing that resolves as
`@kburson/ai-task-manager/adapter-sdk`, and with no `exports` field there is no
subpath map to make one resolve.

Three consequences:

1. Under semver, `^0.1.0` permits only patch-level drift, and there is no
   "major-version transition" available from 0.1.0 that means what line 811 needs
   it to mean. Every compatibility statement in the spec presumes a >=1.0.0
   world that does not yet exist. The spec should state the version baseline
   explicitly and tie it to phases — for example, which phase exit publishes
   1.0.0, and which publishes the 2.0.0 that plugin authors are shown peering
   against.
2. Publishing a *stable public ABI* (Goal 8, AC 3, AC 4) requires an `exports`
   map that distinguishes the public surface from the ~281 modules currently
   under `scripts/task-tracker/lib/`. Without one, every internal module is a de
   facto public entry point and the "stable adapter SDK" cannot be held stable.
   The spec should make adding a deliberate `exports` map a Phase 5 deliverable
   and a release gate.
3. `coreApi: "^2"` in the manifest duplicates the npm `peerDependencies` range.
   The spec should say which is authoritative when they disagree, since the
   compatibility check reads the manifest (line 227) while npm enforces the peer
   range.

### R1-F005 — The `strict` assurance level has no stated mechanism and rests on an unbounded negative

`strict` means "Only AITM can access provider write credentials or channels"
(line 654), and requires "provider write credentials to be isolated to the MCP
process, no alternate write-enabled provider tool, enforceable network or
credential boundaries where applicable, and a successful startup probe"
(lines 665-667). Full-Auto then records the assurance level in durable receipts
and "guarded execution is never described as strict" (line 671).

The truthfulness commitment is exactly right. The problem is that the spec does
not say how `strict` is established, and two of its four conditions are not
decidable by a startup probe:

- "no alternate write-enabled provider tool" is an unbounded negative over the
  agent's whole environment. In this project's normal configuration, the agent
  has a Bash tool and an authenticated `gh` CLI on `PATH`. The kernel itself
  reaches GitHub that way. Any credential the kernel can use, a sibling process
  in the same session can also use. Isolating writes to the MCP process is
  therefore not achievable by the MCP process asserting it; it requires a
  different credential topology (a credential helper the agent cannot invoke, a
  scoped token minted per action, a separate sandbox or network boundary), and
  the spec proposes none.
- "enforceable network or credential boundaries where applicable" defers the
  entire question to an unspecified "where applicable".

Given that the whole point of the ladder is honest reporting, the risk is
specific: an implementation ships a startup probe that checks something weaker
(say, that `GH_TOKEN` is unset in the agent environment), reports `strict`, and
writes `strict` into durable Full-Auto receipts that the design elsewhere treats
as authoritative assurance evidence.

Either name the mechanism that makes `strict` provable, or narrow `strict` to a
claim that a probe can actually establish and say plainly that stronger
isolation is host-dependent and out of scope for version one. The current text
sits between the two.

### R1-F006 — "provider" and "adapter" already mean something else in this tree

The spec uses "provider" exclusively for external systems (GitHub, GitLab,
Bitbucket, Jira) and "adapter" for the modules that wrap them, reserving
"agent-host bridge" for Claude/Codex integration (lines 398-403).

This checkout uses the same two words for the opposite concept.
`scripts/providers/provider-adapter.mjs` defines `ProviderAdapter` as, in its own
words, a shape that "describes a vendor (AI provider or local agent)", with
concrete implementations `scripts/providers/claude.mjs`,
`scripts/providers/codex.mjs`, and `scripts/providers/grok.mjs`. Its fields are
`skillAdapterPath`, `installRecipe`, `hookCapability`, `transcriptSchema`. There
are also `scripts/task-tracker/lib/verification-provider-registry.mjs` and
`scripts/task-tracker/lib/delivery-provider-action.mjs`.

So after Phase 1, a reader in this repository will find `ProviderAdapter`
meaning "Claude" and `adapter` meaning "GitHub", with `skillAdapterPath` on the
first kind. That is a durable comprehension hazard for exactly the audience —
future agents reading the tree — the design exists to serve.

This is cheap to fix now and expensive later. The spec should pick and record the
disambiguating vocabulary (for example: `external-system adapter` vs
`agent-host adapter`, or rename the existing concept to `host`), and Phase 1's
inventory step should include the rename.

### R1-F007 — The discovery example contradicts the discover/describe tiering, and no payload budget is stated

`aitm_discover` and `aitm_describe` are separate tools (lines 296-297), which
implies discovery returns summaries and describe returns detail. The contextual
discovery record at line 381 does the opposite: each action entry inlines `why`,
`when`, `effects`, `inputSchemaRef`, and `helpRef`. The surrounding prose then
requires that "Every action record describes" twelve attribute groups
(lines 384-396), including examples and valid next actions, with no statement
that the discovery record carries a subset.

Combined with "Unavailable actions remain visible" (line 284) and a portable
vocabulary that may be large (see R1-F001), a single `aitm_discover` call could return
a very large object on every session. The design's stated motivation is to remove
procedural knowledge from the agent's context (line 758); a discovery payload
that is itself large trades one context cost for another.

State which fields belong to the discovery record versus the describe record, and
state a bounded budget or pagination/filtering contract for discovery, so the
release gates can test it. The `aitm://project/capabilities` resource already
gives a natural home for the full catalog.

## Required changes

1. **(R1-F001)** Specify the MCP invocation path for every portable action not in the
   seven typed tools. Either enumerate the portable vocabulary and show that it
   is the seven typed tools (demonstrating how the existing 66 verbs collapse
   into them, with `work-item.create` worked as an example), or add a generic
   portable-action tool and restate the tiering rationale. Additionally, extend
   the transport-parity gate (line 697) from "common actions" to *every* action
   whose status is not `orchestrator-only`, and state that
   `aitm_invoke_extension` refuses `orchestrator-only` identifiers.

2. **(R1-F002)** In "Relation to ADR 0002", state explicitly which ADR 0002 required
   mitigations are retained, which are superseded, and by what. In particular,
   address "one authoritative coordinator per governed scope" and "epoch-fenced
   grants and assignments". If they are superseded by optimistic append plus
   explicit fork-join, argue it; if they are deferred, name the phase. Then
   specify the concurrency contract for the project-level control stream under
   an adapter without conditional update — this is the GitHub adapter, which has
   no CAS on `updateIssueComment` — including the behavior when multiple
   worktrees or fleet sessions append concurrently.

3. **(R1-F003)** Add a mutation-observability taxonomy to the recovery section, with a
   stated reconciliation outcome for each class. It must cover the
   non-marker-carrying case (ProjectV2 field values, labels, assignees,
   milestone), state how `observe` classifies a value that matches intent but
   cannot be attributed, and state how that classification interacts with the
   concurrency answer from required change 2.

4. **(R1-F004)** State the version baseline and tie it to the delivery phases: which
   phase exit publishes which major version, and what `^2.0.0` in the plugin
   example refers to relative to the current `0.1.0`. Make a deliberate
   `exports` map defining the public SDK surface (and its inclusion in `files`) a
   Phase 5 deliverable and a release gate. State whether `coreApi` or the npm
   peer range is authoritative on conflict.

5. **(R1-F005)** Either specify the credential/network mechanism by which `strict`
   becomes provable, or narrow the `strict` definition to conditions a startup
   probe can actually establish and state that stronger isolation is
   host-dependent and out of scope for version one. Add a release gate asserting
   that a host cannot report `strict` without the named mechanism present.

6. **(R1-F006)** Record the disambiguating vocabulary for "provider"/"adapter" against
   the existing `scripts/providers/provider-adapter.mjs` meaning, and add the
   rename to Phase 1's inventory scope.

7. **(R1-F007)** State the field-level difference between the `aitm_discover` record
   and the `aitm_describe` record, correct the line 381 example to match, and
   state a bounded size/pagination/filtering contract for discovery.

## Optional suggestions

1. **Git-resident evidence sits outside the hash-linked chain.** The design says
   the backlog authority holds "canonical references to repository, forge, CI, and
   identity evidence" (line 548) and that the chain "detects partial or accidental
   history modification" (line 580). But this project's primary deliverable
   evidence is the `[#N]` commit-attribution trail in Git (see
   `scripts/task-tracker/lib/commit-attribution-format.mjs` and
   `trunk-ref.mjs`), and Git history is rewritable. A reference into rewritable
   storage inherits that mutability. Consider stating explicitly what the chain
   does and does not cover, so a reader does not over-read the tamper-evidence
   claim.

2. **Cross-provider reference lifecycle.** With Jira as `work-items` and GitHub as
   `forge`, evidence envelopes accumulate typed cross-system references. The
   staleness table (lines 519-528) covers a removed provider workflow field but
   not a deleted or moved referent (force-deleted branch, renamed repository,
   deleted PR), nor what happens to historical references when a `forge` binding
   is replaced. Worth a row or a short paragraph.

3. **Per-phase rerun contract for `aitm setup`.** Ten phases are described as
   "independently repeatable" (line 438) with `aitm install`, `aitm host attach`,
   and `aitm init` as reruns (lines 453-455). Since phase 5 mutates
   `package.json` and the lock and phase 7 touches the external authority,
   stating each phase's idempotency and partial-failure contract would make the
   "a failed migration leaves the previous installation operational" promise
   (line 809) testable.

## Decision

revisions-requested
