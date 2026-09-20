# AITM MCP and External-System Adapter Architecture

**Date:** 2026-09-20

**Status:** Proposed architecture approved in conversation; implementation and
provider-plugin delivery remain separately gated

## Summary

AI Task Manager will become a headless orchestration kernel with two peer
interfaces:

- an MCP server as the primary agent-facing interface; and
- a CLI as the first-class human, CI, diagnostic, and recovery interface.

Both interfaces call the same application services. Workflow policy, action
semantics, evidence, recovery, and adapter selection live in the kernel rather
than in CLI scripts, MCP handlers, skills, or provider integrations.

External systems are accessed through capability-specific ports. A project may
combine GitHub, GitLab, Bitbucket, and Jira in any compatible arrangement while
retaining exactly one writable backlog authority. GitHub remains the built-in
default adapter. Other providers may be implemented in independent projects and
published as npm plugins with a peer dependency on AI Task Manager.

AITM remains lightweight. It does not introduce a private workflow database or
hosted control plane. The configured backlog authority stores durable lifecycle
state, journals, approvals, receipts, recovery records, and cross-system
references. Local AITM storage contains only rebuildable caches, locks, queues,
fingerprints, and generated projections.

Every agent-facing instruction, capability record, help record, action result,
error, recovery response, and generated memory directive is schema-validated,
minified JSON. Human CLI output is rendered from those same canonical objects.

## Motivation

The current script-backed skill asks an agent to remember which command owns a
provider operation and how outputs from one command must be transformed before
being passed to another. That boundary is too weak. A recent example returned a
GitHub GraphQL node ID from one governed command while a related command accepted
only a REST comment ID or URL. The external-system distinction escaped the
GitHub integration and became an agent responsibility.

That failure should have been structurally impossible. An agent should express
the intent to persist and project an analysis. The orchestrator should select a
governed domain action, and the GitHub adapter should resolve every GitHub ID,
API, marker, and storage rule internally. The action result should state which
effects committed, whether retry is safe, and what may happen next.

The same boundary is required to support Jira with Bitbucket, GitLab alone,
GitHub alone, or mixed provider deployments without duplicating vendor rules in
skills and workflow code.

## Goals

1. Make every portable AITM action agent-discoverable and schema-invocable.
2. Keep provider APIs, identifiers, limits, and recovery behavior inside
   provider adapters.
3. Allow provider-specific extensions without allowing them to bypass AITM
   governance.
4. Preserve one external writable backlog authority and avoid a required AITM
   database or hosted service.
5. Give agents contextual help describing what is possible, when and why to use
   it, why it may be unavailable, and how to recover.
6. Project small, fingerprinted learning directives into agent-host-specific
   memory without making memory authoritative.
7. Make a committed installation consumable by a fresh clone or cloud worker
   after only `npm ci`.
8. Permit independently built community and experimental adapters through a
   public ABI and conformance suite.
9. Prevent or disclose direct-provider mutation bypass according to the host's
   enforceable capabilities.
10. Preserve current workflows and evidence during incremental migration.

## Non-goals

- A hosted multi-tenant AITM service.
- A private database that competes with the selected backlog authority.
- An AITM-controlled allowlist of acceptable community plugins.
- Automatic recursive activation of packages found in `node_modules`.
- Storing provider credentials in tracked project configuration.
- Requiring an always-running local daemon for normal use.
- Rewriting existing issue comments, receipts, or historical evidence in bulk.
- Treating MCP transport state as workflow authority.
- Removing the CLI or making human operators consume minified JSON by default.

## Architectural decisions

### Headless kernel with peer transports

```text
Agent ──► MCP server ─┐
                     │
Human/CI ──► CLI ────┼──► Application services ──► Policy engine
                     │                              │
Tests/integrations ──┘                              ▼
                                             Adapter resolver
                                                    │
                                      External-system adapters
```

MCP handlers and CLI commands perform transport parsing and rendering only.
They may not implement workflow policy, call provider APIs directly, or create
transport-specific action semantics.

Given the same action and authoritative starting state, CLI and MCP calls must
produce the same domain request, external effects, evidence, result envelope,
and recovery classification.

### Capability-specific ports

The kernel defines these initial ports:

| Port         | Responsibility                                                  |
| ------------ | --------------------------------------------------------------- |
| `work-items` | Backlog items, lifecycle, fields, journals, approvals, receipts |
| `repository` | Git state, branches, commits, worktrees, and ancestry           |
| `forge`      | Pull or merge requests, review metadata, and integration        |
| `ci`         | Runs, checks, logs, and verification status                     |
| `identity`   | Provider principals, attribution, and permission observations   |

The user-facing setup experience may offer provider bundles, but bundles are
configuration presets rather than new architectural layers. A Jira plus
Bitbucket bundle might bind Jira to `work-items` and Bitbucket to `forge` and
`ci`. Each binding remains independently visible and replaceable.

Each exclusive role has one active writable binding. In particular, a project
has exactly one writable `work-items` authority. Supporting providers may be
configured for read-only observations when an action explicitly names them.

### Provider targets

The current provider targets are:

| Provider  | Packaging        | Candidate ports                         |
| --------- | ---------------- | --------------------------------------- |
| GitHub    | Built-in default | `work-items`, `forge`, `ci`, `identity` |
| GitLab    | External plugin  | `work-items`, `forge`, `ci`, `identity` |
| Bitbucket | External plugin  | `work-items`, `forge`, `ci`, `identity` |
| Jira      | External plugin  | `work-items`, `identity`                |

The following are valid examples:

- GitHub Issues, GitHub forge, and GitHub Actions;
- GitLab Issues, GitLab forge, and GitLab CI;
- Jira, Bitbucket forge, and Bitbucket Pipelines;
- Jira, GitHub forge, and GitHub Actions; and
- Jira, GitLab forge, and GitLab CI.

Provider variants such as cloud and self-managed installations are expressed as
adapter capabilities or separate plugin packages. They do not change the port
contract.

### Adapter ownership

Provider-specific behavior stays inside its adapter, including:

- REST, GraphQL, and other provider APIs;
- opaque identifiers and identifier conversion;
- workflow-transition and field identifiers;
- pagination, rate limits, and provider retries;
- authentication and permission probes;
- issue, merge-request, pull-request, and pipeline semantics;
- evidence-storage selection and retention limits; and
- provider-error translation and interrupted-write reconciliation.

The kernel sees canonical authority references, actions, effects, capabilities,
and errors. An adapter may not return an untyped provider identifier and require
the agent, CLI, MCP handler, or another adapter to interpret it.

### Vocabulary and existing host integrations

In new code and documentation, an **external-system adapter** integrates GitHub,
GitLab, Bitbucket, Jira, or another authority; an **agent-host bridge** integrates
Codex, Claude, or another agent runtime. Bare `ProviderAdapter` is not a new SDK
name. The existing `scripts/providers/provider-adapter.mjs` describes AI vendors
and local agents; Phase 1 inventories its callers and migrates that internal
concept to `AgentHostBridge`, retaining compatibility exports and configuration
keys where needed. Verification providers and delivery-provider actions retain
explicitly qualified names and are mapped by responsibility, not bulk-renamed.

## Adapter ABI and plugin model

AITM exports a stable adapter SDK:

```javascript
import { defineAdapter } from '@kburson/ai-task-manager/adapter-sdk';
```

An external plugin declares its compatibility statically:

```json
{
  "name": "@community/aitm-adapter-gitlab",
  "peerDependencies": { "@kburson/ai-task-manager": "^1.0.0" },
  "aitm": { "kind": "adapter", "manifest": "./aitm-adapter.json", "entry": "./dist/adapter.mjs" }
}
```

The referenced manifest is data rather than executable code:

```json
{
  "schema": "aitm.adapter-manifest/v1",
  "id": "community-gitlab",
  "version": "1.2.0",
  "coreApi": "^1",
  "ports": ["work-items", "forge", "ci", "identity"],
  "extensions": ["gitlab:epic-link"],
  "entry": "./dist/adapter.mjs"
}
```

These examples describe the planned first stable release, not today's package.
The current checkout is `0.1.0` with no `exports` map or adapter SDK entry point.
Phases 1-4 develop on the unstable `0.x` line; their exits do not promise a stable
external plugin ABI. Phase 5 publishes core `1.0.0` and adapter ABI `1` only after
its release gates pass. Phases 6-7 target compatible `1.x` additions; a breaking
core or ABI change requires its own major release and migration decision.

The npm peer range constrains the installed package version; `coreApi` constrains
the separately versioned adapter ABI advertised by that package. Both must
match. Neither overrides the other: a conflict makes the plugin incompatible,
even if npm installation succeeded. Setup and runtime validate both.

Phase 5 adds a deliberate package `exports` map for the public adapter SDK and
schemas, includes their runtime files and declarations in the npm `files` set,
and documents the supported compatibility entries for existing consumers.
Internal script paths are not promised as SDK APIs. A packed-package consumer
fixture must resolve every public entry without a source checkout, reject
unexported internals, and verify supported CLI compatibility before publication.

The adapter runtime contract is intentionally small:

| Method      | Responsibility                                                |
| ----------- | ------------------------------------------------------------- |
| `manifest`  | Describe capabilities, schemas, limits, and learning guidance |
| `probe`     | Inspect configuration, authentication, and live availability  |
| `read`      | Read authority state through canonical references             |
| `execute`   | Perform an authorized domain action                           |
| `observe`   | Determine which external effects occurred                     |
| `reconcile` | Resolve an interrupted or ambiguous action                    |
| `evidence`  | Append and retrieve canonical evidence envelopes              |
| `doctor`    | Return typed diagnostics and remediation                      |

GitHub is bundled for zero-configuration adoption, but it implements this same
public contract and passes the same conformance suite. It has no privileged
route into the kernel.

### Open plugin discovery

AITM does not maintain an approval list. Setup separates three concepts:

- **discoverable** means the installed package declares an AITM adapter;
- **compatible** means its manifest, peer dependency, schemas, and required
  runtime features match the installed kernel; and
- **trusted** means the project maintainer selected it for this project.

`aitm setup` inspects direct dependencies, development dependencies, and local
workspace packages for the static `aitm.kind: "adapter"` declaration. It does
not recursively scan transitive packages. Explicit npm package names, workspace
references, and filesystem paths are also accepted for experimentation.

Discovery reads static JSON only. Setup imports executable plugin code only
after presenting its package source, version, integrity, requested ports,
declared effects, lifecycle scripts, compatibility, and manifest hash to the
maintainer for selection. Selection is a code-trust decision: once imported, a
Node plugin executes with the permissions of the AITM process.

The selected plugins are committed in project configuration and restored by the
package lock. Cloud consumers load only the committed selection; they neither
scan nor prompt.

## Action registry and capability graph

The core owns a portable domain-action vocabulary. Adapters implement those
actions and may add namespaced extensions such as:

```text
github:project-field-query
gitlab:epic-link
bitbucket:deployment-environment-promote
jira:sprint-assign
```

Extensions use the same schemas, policy evaluation, effects, evidence,
idempotency, and recovery contracts as portable actions. Low-level adapter
operations remain discoverable for diagnostics but are marked
`orchestrator-only` and have no directly callable MCP tool.

The capability resolver combines:

- the core action registry;
- installed adapter manifests and versions;
- project port bindings and feature flags;
- host enforcement capabilities;
- live authentication and authorization observations;
- external-system compatibility; and
- work-item context and workflow preconditions.

Every discovered action reports one of at least these statuses:

```text
available
blocked
unconfigured
unauthorized
unsupported
temporarily-unavailable
orchestrator-only
```

Unavailable actions remain visible. Their records explain why they cannot run
and how to enable or recover them. The resolver must distinguish unsupported
behavior from missing configuration, revoked authorization, temporary provider
failure, stale setup metadata, and policy refusal.

## MCP surface

The MCP server exposes a tiered hybrid surface.

### Stable discovery tools

```text
aitm_discover
aitm_describe
aitm_inspect
aitm_explain
aitm_recommend
```

`aitm_recommend` is read-only and deliberately distinct from the current
mutating `next` alias.

### Typed common mutation tools

```text
aitm_start_work
aitm_record_evidence
aitm_transition
aitm_verify
aitm_deliver
aitm_close
aitm_recover
```

Widely used portable actions receive explicit tools with JSON Schema inputs and
outputs so hosts can display precise intent and approvals.

### Portable action invocation

`aitm_invoke_action` invokes portable core actions without a dedicated typed tool,
including `work-item.create`, blocking, assignment, shelving, and workflow
exception actions. This route is exclusive: an action with a dedicated typed
tool is rejected by `aitm_invoke_action`, even if the host disables or withholds
permission for that typed tool. The registry assigns each externally callable
core action exactly one MCP invocation route, which discovery reports. The seven
typed tools are dedicated projections of selected canonical actions; the generic
route serves the remaining portable vocabulary. Phase 1 maps every existing CLI
verb to a canonical action or a documented host-local compatibility operation; Phase 3 must cover
every portable action over MCP.

The generic input names an exact action ID, action-schema version, capability
fingerprint, and payload. The server resolves the action, validates its exact
payload schema, and applies the same policy, approvals, effects, and recovery as
the typed route. An earlier describe/discover response grants no authority; live
preconditions are checked again at invocation. Unknown, unavailable, or
`orchestrator-only` actions are refused. Core IDs and namespaced extension IDs
have distinct registries, so the portable route cannot bypass extension policy.

Typed tools let hosts render precise static intent. Generic invocation supplies
runtime intent and effects from the exact described action. A host that cannot
display that detail must use a governed approval flow which does, or refuse an
action requiring informed approval. Generic invocation never converts a broad
tool permission into approval for its payload's effects.

### Extension invocation

Uncommon namespaced adapter extensions use `aitm_invoke_extension`. The agent
must first discover or describe the extension. The server validates the payload
against the extension's exact schema and policy before invocation. An extension
may be promoted to a typed tool without changing its domain contract. The
extension route rejects `orchestrator-only` identifiers and core action IDs;
server policy enforces that boundary even when no dedicated tool exists.

### MCP resources

```text
aitm://project/capabilities
aitm://actions/{action-id}
aitm://schemas/{schema-id}
aitm://errors/{error-code}
aitm://work-items/{authority-ref}
aitm://work-items/{authority-ref}/evidence/head
aitm://setup/status
```

Resources are content-addressed where practical and return cache metadata.
Long-running workflows use explicit AITM action or workflow handles. An MCP task
may project that lifecycle for a capable client, but MCP transport state is
never authoritative.

## Machine-readable help and learning plane

All agent-facing instructions and help use schema-validated minified JSON.
This requirement applies to:

- tool inputs and outputs;
- capability and action catalogs;
- action and error help;
- recovery instructions;
- adapter guidance;
- setup diagnostics;
- receipts and journal envelopes; and
- generated local-memory directives.

Serialization uses UTF-8 JSON with no insignificant whitespace. Schemas and
field names remain descriptive; minification must not replace them with cryptic
abbreviations. Optional absent values are omitted rather than emitted as
`null`. Repeated explanations are replaced by stable `helpRef` and `schemaRef`
references. Records used for content hashes use deterministic canonical key
ordering. A CLI `--json` mode emits the same minified representation; human
formatting is selected separately.

MCP tools use native `structuredContent` with declared output schemas. A
compatibility text block, when required by a client, contains the identical
minified `JSON.stringify` representation rather than independent prose.

One canonical object model feeds both audiences:

```text
Canonical domain object ──► minified JSON ──► agents and automation
                       └──► human renderer ─► CLI, reports, diagnostics
```

### Contextual discovery record

```text
{"schema":"aitm.discovery/v1","fingerprint":"sha256:...","context":{"workItem":"github://org/repo/issues/45","state":"Plan"},"actions":[{"id":"work-item.record-analysis","tool":"aitm_record_evidence","status":"available","purpose":"Persist analysis.","helpRef":"aitm://actions/work-item.record-analysis"}],"complete":true}
```

Discovery returns only action ID, invocation tool, status, a short purpose,
`helpRef`, and a reason code when unavailable, plus bounded context, capability
fingerprint, completion flag, and an opaque next-page cursor when needed.
`aitm_describe` returns the full versioned record below and its schema references.
Unavailable actions remain reachable through filters and pagination; they need
not all be inlined into the first response.

Every discovery response is capped at 50 actions and 32 KiB of serialized UTF-8
JSON, including its envelope. Pagination is mandatory when either limit would
be exceeded. Filters include action namespace, port, status, and work-item
context. Cursors bind the query and capability fingerprint; stale cursors return
a structured restart instruction rather than silently mixing snapshots. Short
fields have schema length bounds; an oversized single record is a catalog
validation error, not an unbounded page. The full capabilities resource uses the
same pagination contract. Description and schema resources are fetched on demand.
Release gates exercise large catalogs, unavailable entries, byte bounds, and
cursor invalidation.

Every full description record describes:

- portability and adapter ownership;
- purpose, when to use it, and when not to use it;
- availability and reason code;
- input and output schema references;
- preconditions and required capabilities;
- expected and prohibited effects;
- authority writes;
- approval requirements;
- idempotency and recovery behavior;
- examples; and
- valid next actions.

### Agent-host memory bridges

Adapters emit provider-neutral learning directives. The orchestrator resolves
them, and agent-host bridges project them into protected generated sections of
Codex, Claude, or other memory files. Adapters never edit agent memory, and host
bridges never interpret provider semantics.

A generated section contains one replaceable minified object:

```text
<!-- aitm:learning:start -->
{"schema":"aitm.learning/v1","fingerprint":"sha256:...","directives":[{"code":"use-mcp","when":"AITM MCP is available","action":"Call discover before using vendor tools."},{"code":"no-raw-backlog","when":"A governed AITM action exists","action":"Do not call the backlog provider directly."}],"catalog":"aitm://project/capabilities"}
<!-- aitm:learning:end -->
```

Human-authored memory outside the managed markers is never changed. The memory
projection contains durable operating guidance and references only. It contains
no credentials, live issue state, or copied provider documentation.

Setup writes the canonical learning-directive set and its compact fingerprint.
The fingerprint covers core and schema versions, adapter identities and
manifests, project bindings and feature flags, and the projection format.

For an untracked host-local memory target, session boot compares the fingerprint
and regenerates only the protected section when it changes. For a tracked
project memory target, session boot validates but never rewrites it; a mismatch
enters diagnostic-only mode and directs a maintainer to rerun setup. This keeps
cloud consumers read-only while preserving automatic refresh for genuinely
local derived memory.

## Setup and adoption

AITM retains the npm package as the project-pinned delivery unit. The normal
fresh-project entry point is:

```bash
npm install --save-dev @kburson/ai-task-manager
npx aitm setup
```

`aitm setup` is a single guided front door over independently repeatable phases:

1. inspect the repository, package manager, installed hosts, credentials, and
   existing AITM state;
2. select a provider bundle or independent port bindings;
3. discover installed compatible plugins and ask which to trust;
4. preview repository, host, package, and external-authority effects;
5. after confirmation, add or normalize selected external plugins in project
   dependencies and the package lock;
6. install portable project integration and host bridges;
7. initialize or bind the selected external authority;
8. resolve and lock the capability graph;
9. generate host configuration and learning projections; and
10. verify the exact committed runtime through `aitm doctor`.

Advanced users may rerun individual phases through commands such as
`aitm install`, `aitm host attach`, and `aitm init`, but normal adoption does not
require understanding that decomposition.

Setup is maintainer-owned and intent-changing. It never runs implicitly during
package installation.

Each phase has a stable operation ID, input fingerprint, declared effects,
read-back checks, and retry classification. Read-only phases may rerun freely;
file/package phases stage and validate changes before activation, preserving a
rollback snapshot. External writes use the same requested/outcome and recovery
contract as other governed actions. A rerun observes prior effects and resumes
incomplete steps; it does not blindly replay package installation, lifecycle
scripts, or external initialization. Bootstrap creates or locates the selected
control stream under an explicit maintainer grant before other external writes;
an ambiguous control-stream creation requires discovery and reconciliation.

Activation is the final step after runtime and parity checks. Partial failures
report exact committed effects and recovery steps. External evidence is retained;
it is not erased to simulate rollback. The previous installation remains the
active configuration while activation is incomplete; if an external effect makes
it incompatible, governed mutations pause with diagnostics until reconciled.

### Tracked portable output

Setup writes and owns tracked files such as:

```text
.ai-task-manager/
  project.json
  adapters.lock.json
  capabilities.lock.json
  install-manifest.json

host-specific project files
  MCP server registration
  lightweight skill bootstrap
  learning-projection declaration
  hooks or mutation-routing policy
```

Generated commands use repository-relative package paths and invoke the
workspace-local MCP binary. They never contain the maintainer's absolute path.

### Cloud and clone contract

After setup output, `package.json`, and the package lock are committed, a fresh
clone or cloud worker requires only:

```bash
npm ci
```

The agent host reads the committed project integration and launches the
workspace-local AITM MCP server. The cloud consumer does not run setup, install,
init, migration, external-system configuration, or tracked-file regeneration.

A host may claim zero-bootstrap cloud compatibility only when it can consume
tracked project-local MCP configuration. Setup reports a host that requires
uncommitted machine-global registration as `host-local-required`; AITM does not
pretend that integration is portable.

Credentials come from provider-native authentication, cloud secret stores, or
workload identity. They are not tracked.

## Installation staleness

Setup writes a content-addressed install manifest containing:

- generator package version and setup ABI;
- normalized setup-intent hash;
- configuration and capability schema versions;
- selected adapter packages, versions, integrity, and manifest hashes;
- selected host bridges and enforcement-policy fingerprints; and
- generated artifact paths and content hashes.

MCP startup performs a fast read-only comparison against installed packages and
tracked files. It runs again before the first governed action and whenever an
adapter reports that an external assumption no longer holds.

Staleness is classified rather than flattened:

| Observation                            | Classification               |
| -------------------------------------- | ---------------------------- |
| Core differs from setup generator      | Portable metadata stale      |
| Adapter version or manifest differs    | Capability metadata stale    |
| Generated file is missing or modified  | Installation drift           |
| Configuration schema is unsupported    | Migration required           |
| Capability fingerprint differs         | Capability projection stale  |
| Credential or scope is missing         | Runtime unauthorized         |
| Provider workflow field was removed    | External compatibility drift |
| Work item moved to another valid state | Normal live state            |

Stale installation metadata enters diagnostic-only mode. Read-only discovery,
help, and diagnosis remain available; mutating tools are disabled. The error
identifies the mismatch, whether any effects committed, the maintainer action,
and whether a new commit is required. A cloud consumer never repairs or
regenerates tracked integration files.

## Durable authority, journals, and receipts

The configured `work-items` adapter is the only writable backlog authority for
the project. It provides a project-level control stream plus per-work-item
streams. Together they store:

- lifecycle state;
- action requests and outcomes;
- journals and analysis;
- approvals and review decisions;
- verification and delivery receipts;
- recovery and reconciliation records; and
- canonical references to repository, forge, CI, and identity evidence.

The core defines canonical minified envelopes. Each adapter stores the exact
envelope through the provider's most suitable durable mechanism and maintains a
small indexed projection on the work item. GitHub may use marker-owned comments
plus a bounded body projection; Jira may use issue properties and comments. The
mechanism differs, but the record semantics do not.

Provider records contain typed authority references. An adapter never exposes a
bare opaque ID across its boundary.

The project-level control stream holds setup, plugin, cross-item, and bootstrap
events that do not yet have a work-item target. For example, `work-item.create`
records its request in the control stream, creates the provider item, then
records the typed item reference and starts that item's evidence stream. An
adapter may use a provider-native project property or a dedicated managed
backlog record, but it must expose the same canonical stream contract and must
report its visibility and retention characteristics during setup.

### Append-only integrity

The project control stream and each work item have append-only, hash-linked
evidence streams. Records contain a stable event ID, action ID, actor,
timestamp, input or result hash, effects, predecessor hash, and record hash.
Corrections, reversals, reconciliations, and fork joins append new records that
supersede prior facts; they do not rewrite history.

The bounded head projection contains the latest event reference, chain hash,
lifecycle summary, and unresolved recovery actions. It is derived and
rebuildable from the event stream.

A hash chain detects partial or accidental history modification. It does not by
itself prevent a provider administrator from replacing an entire history;
provider audit controls and future optional signatures address stronger threat
models without making signature infrastructure a version-one dependency.

A chain protects the recorded reference and content digest, not the continued
availability or immutability of the referenced system. Git evidence records full
commit/object IDs and relevant content digests, not branch names alone. Force
pushes, deletion, or retention expiry can make an object unavailable even though
the recorded digest is intact; a receipt must not treat that as freshly verified
evidence. Typed references retain authority identity, binding generation, stable
provider ID where supported, and the original locator. Renames may be resolved
only with verified identity continuity. Deleted, moved without proof, or
unavailable referents return typed diagnostics; a new forge binding does not
redirect historical evidence. Historical observations remain readable, while
new gates requiring live proof fail closed when that proof cannot be obtained.

### Relation to ADR 0002

ADR 0002 made GitHub Issues and comments the sole durable authority. This design
generalizes that storage choice to the selected `work-items` adapter. It retains
all nine required mitigations: one authoritative coordinator per scope;
epoch-fenced grants and assignments; immutable predecessor-linked records;
canonical JSON, hashes, and read-back verification; coarse capsules and batched
or cached reads; fail-closed conflicts; sealed Delivery Contracts; versioned
schemas and legacy adapters; and crash, fork, deletion, and rebuild tests.

Workers append submissions, not authoritative acceptances. Only the active
scoped coordinator accepts them and updates the corresponding authoritative
projection. The project control stream is itself a governed scope with its own
coordinator and fenced grant. Separate worktrees and fleet sessions submit
requests to that scope; they do not independently advance its accepted head.
Nested delegation retains the existing parent/child scope and epoch rules.

Phase 1 preserves these mitigations in the extracted kernel and GitHub adapter;
they are not deferred until plugins or Full-Auto. Provider-neutral record
encoding and the added project control scope extend the existing mechanism.
There is no intended replacement of scoped coordination by optimistic races.
A replacement ADR must enumerate these retained mitigations and the generalized
storage decision before a non-GitHub backlog is activated.

## Governed action and recovery flow

Every mutation follows this sequence:

```text
discover action
  └─► validate capability and policy
        └─► rehydrate authority state and evidence head
              └─► append action.requested
                    └─► execute through adapter
                          └─► observe external effects
                                └─► append outcome
                                      └─► update projection
                                            └─► return result
```

Before mutation, AITM creates a stable `actionId` and idempotency key. The
request event records the intended operation, input hash, expected evidence
head, authority target, and retry contract.

After mutation, AITM appends `action.completed` or `action.failed` with observed
typed effects. If execution stops between provider mutation and the outcome
receipt, recovery finds the unmatched request. The adapter observes using its
declared evidence class and appends one of:

```text
action.reconciled
action.retry-authorized
action.intervention-required
```

AITM never blindly repeats an ambiguous mutation.

### Mutation observability

Each action declares one of these proof classes before execution:

| Class                               | Proof and recovery outcome                                                                                                                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marker-attributable                 | A durable provider marker or operation receipt uniquely binds the effect to the action. Verified read-back permits `action.reconciled` with attributed effects.                                                                                      |
| Exclusively attributable transition | A recorded prior value plus provider audit identity or enforced exclusive writer conditions proves the transition belongs to this action. The receipt states that proof and permits attributed reconciliation. Value equality alone is insufficient. |
| State-only observable               | A field, label, assignee, or milestone matches intent but causation cannot be proved. Reconciliation may record `state-satisfied`, `attribution: unknown`, and `execution: unknown`; it must not assert that AITM performed the write.               |
| Unobservable or conflicting         | Evidence is unavailable, contradictory, or shows unresolved concurrent changes. Append `action.intervention-required`; no success or automatic retry is inferred.                                                                                    |

For state-only observations, an action whose contract requires only a desired
state may finish with a truthful `state-satisfied` reconciliation and no duplicate
write, after all other policy and evidence requirements pass. An approval,
integration, accounting, or lifecycle rule requiring proof of actor or occurrence
cannot be satisfied that way and requires intervention. Matching board status
alone does not establish an authorized lifecycle transition. If intent is not
satisfied, retry needs a fresh authority/policy check and an explicit adapter
proof that replay is safe despite intervening changes; otherwise intervention is
required. Setting a value is not automatically replay-safe when it can overwrite
another actor's decision. The original action ID is retained across recovery.

An active AITM coordinator serializes governed actors; it does not establish
exclusive control over humans or other provider clients. Thus ProjectV2 Status,
labels, assignees, and milestones default to state-only observability unless the
adapter supplies stronger proof. The conformance kit covers identical human
writes, value changes and reversals, crash-after-write, missing audit evidence,
and action contracts that require attribution.

### Concurrency and fencing

All authoritative operations carry the scope, coordinator grant ID, epoch,
expected accepted head, and action ID. The kernel validates authority before
execution and before accepting a result. Worker submissions are durable inputs
and do not compete to publish a new accepted head. The coordinator serializes
acceptance and projection writes within its scope; multi-scope actions name
all required authorities and pause if any are ambiguous.

When a provider supports atomic conditional append and fencing, the adapter uses
it. GitHub issue-comment updates in this checkout provide no such CAS. Rereading
before and after append is detection, not atomic exclusion. On a non-CAS adapter,
a coordinator grant must have one active serialized executor; two clones may not
activate the same grant concurrently. Initial activation and handoff require
externally serialized execution or an explicit maintainer-controlled quiescent
handoff that confirms the previous executor and in-flight writes have stopped.
A timeout or an unreadable process is not proof of quiescence. Automatic failover
is unavailable without an enforceable exclusion/fencing mechanism; an adapter
must report that limitation rather than offer race-prone distributed activation.
This does not require a hosted AITM service or permanent daemon: a bounded
coordinator invocation can drain pending external submissions under that rule.

For the project control stream, concurrent sessions may append independent
request submissions; only its single executor appends accepted control events
and updates its head. Submissions are linked to their own IDs and observed head,
not falsely represented as concurrent accepted successors. On conflict, stale
epoch, duplicate executor, or fork detection, affected governed mutations stop.
No contender wins merely by writing last. Preserve competing records and observed
effects; an authorized reconciliation joins them only after restoring unique
coordination and resolving any ambiguous effects. Local worktree locks alone
cannot prove exclusion across clones. These constraints and interrupted handoffs
are Phase 1 conformance gates, including the GitHub path.

Every action returns the same result shape:

```text
{"schema":"aitm.result/v1","ok":true,"actionId":"01K...","action":"work-item.record-analysis","effects":[{"type":"journal.appended","ref":"github://issues/45/comments/123"}],"evidence":{"head":"sha256:..."},"retry":{"safe":true,"mode":"idempotent"},"next":[{"action":"work-item.approve-plan","status":"available"}]}
```

Errors use the same principles:

```text
{"schema":"aitm.error/v1","ok":false,"code":"AITM_SETUP_STALE","effects":{"committed":false},"retry":{"safe":false},"reason":{"code":"adapter-manifest-mismatch","expected":"0.2.0","observed":"0.3.0"},"recovery":{"actor":"maintainer","action":"setup","command":"npx aitm setup","commitRequired":true},"helpRef":"aitm://errors/AITM_SETUP_STALE"}
```

## Host enforcement and Full-Auto

An MCP surface does not prevent an agent from using a raw provider tool, CLI,
HTTP request, or credential. Agent-host bridges therefore report and, where
possible, enforce mutation routing.

| Level        | Meaning                                                          |
| ------------ | ---------------------------------------------------------------- |
| `strict`     | Only AITM can access provider write credentials or channels      |
| `guarded`    | Host policy blocks known mutation tools, commands, and endpoints |
| `behavioral` | The skill requests compliance, but the host cannot enforce it    |

Provider reads may remain available. Any observation used for a governed
decision must be normalized through AITM before becoming durable evidence.

Adapter manifests declare their mutation surfaces. Host bridges translate those
declarations into host-specific policy rather than maintaining a hard-coded
GitHub command list. A blocked attempt returns a minified policy error and the
governed replacement action.

Strict mode is a bounded claim about an explicitly declared execution boundary,
not a startup scan of an arbitrary workstation. A supporting host must place the
agent and its child processes inside an enforced sandbox without provider write
secrets or access to credential helpers; a separately isolated AITM executor
holds those credentials. Egress rules prevent direct provider writes and access
to other credential brokers. The only permitted write route crosses a validated
AITM action boundary. A CLI caller can use the same isolated executor without
receiving its credentials.

The host supplies verifiable boundary configuration and an attestation bound to
the current process tree, credential policy, egress policy, and configuration
fingerprint. Startup probes exercise denied direct-write and credential-access
paths; probes corroborate the mechanism rather than proving an unbounded
negative. Policy change, attestation expiry, or boundary loss disables strict
execution and requires reevaluation before another governed mutation. Receipts
record the boundary and assurance fingerprint. No claim covers a compromised
host administrator outside that declared trust boundary.

The first host-bridge release defaults to guarded or behavioral; it does not
promise this strict isolation mechanism on ordinary developer desktops. An agent
with Bash and accessible authenticated `gh` cannot report strict. A host may add
strict certification only in Phase 7 after mechanism-specific positive and
negative isolation tests pass. Merely unsetting `GH_TOKEN` is insufficient.

Full-Auto requires `guarded` or `strict`. A behavioral-only host may run
supervised workflows but cannot activate Full-Auto. Every durable Full-Auto
receipt records the exact assurance level; guarded execution is never described
as strict.

## Verification

### Core domain tests

Test lifecycle and policy independently of providers, including action schemas,
effects, retry classification, evidence replay, correction, reconciliation,
fork handling, and canonical minified JSON.

### Adapter conformance kit

The public SDK ships a runner:

```bash
npx aitm-adapter-conformance ./dist/adapter.mjs
```

It verifies manifest and port schemas, identifier round trips, capability
reporting, idempotent replay, interrupted-write recovery, error normalization,
evidence preservation, unauthorized behavior, minified JSON, and prohibited
effects.

### Transport parity

Invoke every externally callable portable action through CLI and its single
registry-assigned MCP route, and assert identical domain requests, authority
effects, receipts, errors, and next-action recommendations. For actions with a
dedicated typed tool, also prove that `aitm_invoke_action` rejects their IDs,
including when the host withholds that typed tool. Test extension routes against
the same policy contract, and verify every route rejects `orchestrator-only`
actions. The action inventory drives the coverage
matrix; missing invocation coverage is a release failure, not an exemption.

### Portable-install test

An isolated fixture runs setup, commits the generated integration, clones the
fixture, runs `npm ci`, starts the MCP server, and performs read-only discovery.
The fresh clone must not run setup, install, init, or tracked-file generation.

### Host-policy tests

Each bridge proves that governed mutations remain available, known raw provider
mutations are blocked at the declared assurance level, configured reads remain
available, reported assurance matches actual enforcement, and behavioral-only
hosts cannot activate Full-Auto.

### Live provider certification

GitHub, GitLab, Bitbucket, and Jira have separate opt-in suites against
disposable provider fixtures. A failure disables only the affected capability
and returns structured diagnostics.

Release gates reject:

- undocumented or undiscoverable actions;
- actions without input and output schemas;
- mutations without declared effects and recovery semantics;
- CLI and MCP behavioral divergence;
- generated-file changes absent from the install manifest;
- adapters that fail their declared-port conformance suite;
- cloud fixtures that require setup after `npm ci`;
- discovery pages beyond their action or byte bounds, or stale-cursor mixing;
- missing or incorrectly packaged public SDK exports;
- incompatible peer/ABI combinations accepted by the resolver;
- non-CAS concurrent executor activation or unsafe automatic takeover; and
- strict assurance without the named isolation mechanism and current attestation.

## Migration and rollout

This architecture is an umbrella initiative and must be decomposed into
implementation-sized specifications and plans.

### Phase 1: Headless kernel and built-in GitHub adapter

- Inventory every current action and direct provider mutation, mapping each CLI
  verb to a portable action or documented host-local compatibility operation.
- Disambiguate external-system adapters and agent-host bridges, including the
  existing internal `ProviderAdapter` name and compatibility mapping.
- Preserve scoped coordinators, epoch fencing, and fail-closed conflicts; prove
  serialized non-CAS acceptance and safe handoff before enabling the new path.
- Define canonical action, result, error, effect, and evidence schemas.
- Route the current CLI through application services and policy.
- Move GitHub behavior behind the public adapter contract.

Exit when the existing CLI suite passes through the kernel without MCP.

### Phase 2: Discovery and self-help

- Generate the action registry from executable definitions.
- Add capability resolution, descriptions, errors, and recommendations.
- Emit canonical minified JSON and render human help from it.

Exit when every action and error is discoverable and schema-linked.

### Phase 3: MCP and lightweight skill

- Add the tiered MCP tools and resources.
- Add host bridges.
- Replace detailed workflow prose with the lightweight MCP bootstrap.
- Retain the CLI compatibility path.

Exit on CLI/MCP parity and successful agent use without procedural knowledge in
the skill. MCP Full-Auto remains disabled during this phase; the existing
compatibility route remains available until host enforcement reaches its own
exit gate.

### Phase 4: Setup, portability, and staleness

- Make `aitm setup` the authoring-time front door.
- Generate tracked project, adapter, capability, host, and learning config.
- Add staleness detection and diagnostic-only mode.
- Prove fresh-clone operation after only `npm ci`.

### Phase 5: Public plugin SDK

- Publish the adapter ABI, manifest schema, fixtures, and conformance runner.
- Discover direct dependencies and workspace plugins.
- Add and package the public SDK/schema exports, explicit compatibility entries,
  and packed-package consumer tests.
- Prove that an independently built reference adapter requires no core changes.

Exit publishes the first stable core `1.0.0` with adapter ABI `1`, after peer/ABI
compatibility and package export gates pass.

### Phase 6: Provider plugins

Develop GitLab, Bitbucket, and Jira adapters in separate projects and packages.
They release independently with an AITM peer dependency and pass the shared
conformance suite.

### Phase 7: Host enforcement and Full-Auto assurance

- Generate mutation guards from selected adapter manifests.
- Report strict, guarded, or behavioral assurance.
- Enforce the guarded-or-strict Full-Auto threshold.
- Record assurance in durable receipts.

Only after this exit gate does the MCP path replace the legacy Full-Auto entry
path. Both paths use the same kernel during the transition, so compatibility
does not create a second policy implementation.

## Existing-project migration

`aitm setup` detects a current GitHub installation and previews a non-destructive
migration. It:

- imports existing configuration into the built-in GitHub adapter;
- preserves issue, board, field, branch, PR, journal, and receipt references;
- creates a `legacy-evidence-checkpoint` containing hashes and locators rather
  than rewriting historical records;
- starts the canonical chain from that checkpoint;
- preserves existing CLI commands as compatibility aliases;
- replaces generated skills only after MCP startup and parity checks pass; and
- leaves external GitHub state unchanged unless the reviewed setup plan names a
  required compatible mutation.

A failed migration does not activate a partially installed configuration. It
retains the previous configuration, records any external effects truthfully, and
pauses mutations if those effects prevent safe continued operation. Recovery
resumes or rolls back reversible installation effects without deleting evidence.

Existing CLI verbs remain supported throughout `0.x`, the first stable `1.x`
line, and the following `2.x` major line. Removal can occur no earlier than `3.0.0`
and requires its own approved migration decision; this defines the promised
major-version transition relative to today's `0.1.0`.
Old evidence remains readable after its writer is no longer installed. A
migration never silently changes the writable backlog authority. Rollback may
restore generated integration files but never deletes durable external
evidence.

## Acceptance criteria

1. The CLI and MCP invoke one headless kernel with no duplicated workflow
   policy.
2. GitHub, GitLab, Bitbucket, and Jira can participate through independent port
   bindings, with one writable backlog authority.
3. GitHub uses the same public adapter contract and conformance suite as
   external plugins.
4. Separately published npm plugins can declare a compatible peer dependency,
   be discovered from direct dependencies or workspaces, and be selected
   without an AITM-controlled allowlist.
5. Every action, extension, error, and unavailable capability is discoverable
   with purpose, preconditions, effects, retry, recovery, and help references.
   Discovery uses bounded summaries, 50-action / 32-KiB pages, and
   query/fingerprint-bound cursors; full descriptions are fetched on demand.
6. Agent-facing instructions and results are schema-validated minified JSON;
   human output is rendered from the same canonical model.
7. `aitm setup` writes reviewable tracked integration files; a committed clone
   becomes usable after only `npm ci`.
8. A stale clone enters diagnostic-only mode and provides exact maintainer
   remediation without modifying tracked files.
9. Durable journals, approvals, receipts, and recovery records live in the
   selected external backlog authority as canonical append-only hash-linked
   envelopes.
10. Interrupted mutations are observed and reconciled before retry using their
    declared observability class. State satisfaction without causal proof is
    recorded with unknown attribution and cannot satisfy actor-sensitive gates.
11. Generated agent memory is fingerprinted, replaceable, and non-authoritative.
12. Full-Auto is unavailable under behavioral-only enforcement and records its
    actual guarded or strict assurance level. Strict requires the named sandbox,
    isolated executor, egress mechanism, and current boundary attestation.
13. Existing GitHub projects migrate without bulk evidence rewrites or silent
    external mutation.
14. Each delivery phase has its own bounded specification, plan, tests, and
    approval before implementation.
15. Scoped coordinators, epoch-fenced grants, and fail-closed conflicts are
    retained. Non-CAS adapters require one serialized executor per coordinator
    grant and proven quiescence or enforceable fencing for handoff.
16. Every portable action has one registry-assigned MCP invocation route with CLI
    parity; generic invocation rejects actions assigned a dedicated typed tool.

## Consequences

### Positive

- Agents interact through intentions instead of provider mechanics.
- Provider-specific defects are localized to one adapter.
- Discovery and help are executable, contextual, and self-consistent.
- Jira plus Bitbucket and other mixed deployments become normal composition.
- Community adapters can evolve independently without central approval.
- Cloud environments inherit a complete installation from version control.
- Durable audit and recovery remain available without an AITM service.

### Negative

- Extracting the current script-oriented implementation is a multi-phase major
  architectural migration.
- MCP client behavior and host enforcement capabilities differ and require
  explicit compatibility reporting.
- External authorities do not provide uniform transactions, retention, or
  conditional updates.
- Non-CAS authorities require one serialized executor per coordinator grant;
  linked worktrees and fleet sessions submit to it. Without enforceable fencing,
  handoff requires maintainer-confirmed quiescence and automatic failover is
  unavailable, adding coordination latency and operator responsibility.
- Plugin execution expands the trusted code base selected by a project.
- Strong enforcement requires credential and network isolation that some hosts
  cannot provide.
- Maintaining both CLI and MCP parity adds a permanent conformance obligation.

### Mitigations

- Keep policy and effects in one kernel.
- Use static plugin discovery before executable import.
- Pin selected plugins through project configuration and the package lock.
- Fail closed with diagnostic-only discovery when setup or capabilities drift.
- Require idempotency, observation, and reconciliation in every mutating
  adapter action.
- Report enforcement truthfully and bar behavioral-only Full-Auto.
- Deliver the architecture through independently approved phases rather than a
  single rewrite.
