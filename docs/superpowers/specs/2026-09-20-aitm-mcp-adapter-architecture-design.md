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

## Adapter ABI and plugin model

AITM exports a stable adapter SDK:

```javascript
import { defineAdapter } from '@kburson/ai-task-manager/adapter-sdk';
```

An external plugin declares its compatibility statically:

```json
{
  "name": "@community/aitm-adapter-gitlab",
  "peerDependencies": { "@kburson/ai-task-manager": "^2.0.0" },
  "aitm": { "kind": "adapter", "manifest": "./aitm-adapter.json", "entry": "./dist/adapter.mjs" }
}
```

The referenced manifest is data rather than executable code:

```json
{
  "schema": "aitm.adapter-manifest/v1",
  "id": "community-gitlab",
  "version": "1.2.0",
  "coreApi": "^2",
  "ports": ["work-items", "forge", "ci", "identity"],
  "extensions": ["gitlab:epic-link"],
  "entry": "./dist/adapter.mjs"
}
```

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

### Portable and extension invocation

Every agent-callable portable action has an MCP invocation route. Common actions
use the typed tools above; remaining portable actions use `aitm_invoke_action`
with a registry action name, schema version, and action payload. Discovery reports the
exact tool and argument mapping for each action. Typed tools and the generic
portable invoker resolve to the same executable action definition.

Uncommon namespaced adapter extensions use `aitm_invoke_extension`. The agent
must first discover or describe the extension. The server validates the payload
against the extension's exact schema and policy before invocation. An extension
may be promoted to a typed tool without changing its domain contract.

Both generic invokers validate the exact action schema, current availability,
policy, and approvals in the kernel. Portable actions and extensions cannot be
routed through the other namespace. Unknown and `orchestrator-only` actions
are rejected by every agent-callable route. Generic invocation never grants
low-level adapter access or weakens host approval and mutation-routing policy;
hosts must authorize the resolved action and payload before dispatch.

All mutation routes carry the same caller-supplied `requestKey` described under
governed action and recovery flow. Transport request IDs are not substitutes.

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
{"schema":"aitm.discovery/v1","context":{"workItem":"github://org/repo/issues/45","state":"Plan"},"actions":[{"id":"work-item.record-analysis","tool":"aitm_record_evidence","status":"available","why":"Persist analysis before implementation.","when":["Analysis is complete and must become durable."],"effects":["journal.append","projection.update"],"inputSchemaRef":"aitm://schemas/actions/work-item.record-analysis/v1","helpRef":"aitm://actions/work-item.record-analysis"}]}
```

Every action record describes:

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

### First authority bootstrap

Creating the first control-stream container is the sole external provisioning
exception to append-before-mutation: the stream does not yet exist. Only an
explicitly confirmed maintainer setup operation may use this exception. It may
create or bind the control container, but cannot perform ordinary work-item,
forge, CI, or lifecycle mutations until the root is verified.

Setup derives a stable bootstrap key from the canonical provider instance,
project identity, and control-stream purpose. It searches for that key before
provisioning. Safe automatic creation requires provider-enforced uniqueness or
a demonstrably exclusive provisioning owner, and must store the bootstrap key
and canonical `authority.genesis` envelope in the initial creation payload. The
envelope records the setup intent hash, actor, and schema version. A title or
search result alone is not authority. Adapters that cannot meet these conditions
require a maintainer-provisioned container and an explicit typed reference;
they do not attempt best-effort automatic creation.

Setup reads back and verifies the container identity and genesis before locking
its locator into project configuration. Binding an existing container verifies
its ownership and existing genesis, or initializes and reads back the genesis
under exclusive provisioning ownership. Subsequent setup effects follow the
normal request/outcome protocol in that stream. Bootstrap selection does not
silently replace an existing configured authority.

After response loss, setup reconciles the same bootstrap key and intent rather
than generating a new key or blindly creating another container. One verified
match permits continuation. Multiple matches or conflicting genesis records
block setup for explicit maintainer reconciliation; no candidate is elected or
deleted automatically. Zero visible matches permit retry only when the adapter
can establish that the earlier creation did not occur and cannot still complete;
otherwise setup reports `action.intervention-required`. Concurrent setup must
either share the verified root or stop before further effects.

Local setup output is staged until verification succeeds. A partially created
external container is reported as a durable provisioning effect with its known
reference or bootstrap key and recovery instructions. It is neither called a
successful installation nor erased to simulate rollback. Failure-injection and
concurrency certification are required before an adapter enables automatic
bootstrap.

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

### Relation to ADR 0002

ADR 0002 made GitHub Issues and comments the sole durable authority. This design
preserves its storage-neutral principles—external durable authority,
append-first mutation with read-back verification, scoped coordinators and epoch
fencing, fail-closed conflict handling, immutable capsules, rebuildable
projections, and no required AITM database—but generalizes the authority from
GitHub to the selected `work-items` adapter. The explicit first-container
bootstrap exception does not relax ordinary action admission or execution.

Implementation must add a replacement ADR before activating a non-GitHub
backlog. Until then, the built-in GitHub adapter preserves ADR 0002 behavior.

## Governed action and recovery flow

After first authority bootstrap, every governed mutation follows this sequence:

```text
discover action
  └─► validate schema, caller identity, and request key
        └─► serialize admission under scoped execution ownership
              └─► rehydrate authority and resolve any existing request
                    └─► validate current capability, policy, and approvals
                          └─► append and read back action.requested
                                └─► verify dispatch ownership and preconditions
                                      └─► execute through adapter
                                            └─► observe external effects
                                                  └─► append and verify outcome
                                                        └─► update projection
                                                              └─► return result
```

### Request identity and retry

Every mutating CLI and MCP request requires a caller-supplied `requestKey`,
chosen and retained before submission. Interactive CLI use may generate and
display the key before sending, but unattended callers must supply it explicitly
and reuse it after timeout or response loss. The key is not derived solely from
the payload: two intentionally distinct operations may have identical inputs.

The deduplication scope is the canonical project authority and authenticated
initiating principal, independent of host, process, transport, or MCP session.
Under serialized admission, AITM resolves the key in the project's authority
streams and durably associates it with one stable `actionId`, action name,
target, schema version, canonical input hash, and adapter effect keys. An index
may accelerate lookup but is rebuildable and cannot decide that a request is
new. Work-item creation uses the project control stream before an item exists.
Admission ownership includes the project request-key reservation as well as the
affected action scopes, so requests naming different targets cannot race to
claim the same key.

Reusing the same key and canonical request returns the recorded outcome or
existing in-progress/recovery handle; it never creates another logical action.
Reusing the key with a different action, target, or payload returns
`AITM_REQUEST_KEY_CONFLICT` without new mutation. Discovery and `aitm_inspect`
support authorized lookup by request key when the caller never received the
action ID. Another authorized principal may inspect or recover the original
action by its handle under policy, but cannot silently rebind its request key.
Retention and migration must preserve these mappings or durable tombstones;
missing or unreadable history must not be interpreted as an unused key.

The `action.requested` record includes the expected evidence head, execution
owner and epoch, retry contract, and non-secret canonical inputs or immutable,
hash-verified references sufficient for observation and recovery from a fresh
process. An input hash alone is insufficient. Credentials are reacquired at
runtime and are never journaled. If required input cannot be recovered, the
action requires intervention rather than guessing it from local cache.

Each external effect has a stable key derived from the action ID and effect
identity. The adapter maps that key to native idempotency or a durable searchable
marker and defines observation guarantees. Multiple adapter effects in one
action retain distinct keys and progress; recovery cannot repeat a completed
effect merely because a later effect failed.

After mutation, AITM appends `action.completed` or `action.failed` with observed
typed effects. If execution stops between provider mutation and the outcome
receipt, recovery finds the unmatched request. The adapter searches using the
idempotency marker and appends one of:

```text
action.reconciled
action.retry-authorized
action.intervention-required
```

AITM never blindly repeats an ambiguous mutation.

Absence from an eventually visible search, timeout, or expired owner lease is
not proof that a mutation did not occur or cannot still complete. Retry requires
safe native idempotency or authoritative observation establishing that the
effect was not applied and no earlier attempt remains in flight. Otherwise the
result explicitly reports unknown effects and requires intervention. Recovery
retains the original action and effect keys, runs under current execution
ownership, and revalidates policy before any newly authorized provider mutation.

### Concurrent execution and authority fencing

Journal conflict detection and permission to execute are separate guarantees.
Each affected scope has one authoritative coordinator with an epoch-fenced
grant, preserving ADR 0002. Workers may submit requests or evidence; only the
current execution owner admits actions and dispatches their external effects.
Cross-scope actions declare every conflicting scope, acquire ownership in a
canonical order, and release it only after outcomes or unresolved effects are
durably recorded. A pending ambiguous effect blocks conflicting successors.

Adapters declare and certify an execution mode: provider-conditional admission
with fenced dispatch, or an exclusive coordinator that serializes admission and
dispatch without overlapping ownership. Conditional append alone is insufficient
unless the execution boundary also rejects a stale owner or stale request.
Exclusive coordination must cover all participating clones and workers; a local
process lock, elapsed lease, or reread-and-append loop does not prove exclusivity.
Where an adapter cannot fence an old owner at the effect boundary, takeover is
blocked until the old dispatcher is verifiably stopped and in-flight effects
are settled. If neither safe mode is available, the affected mutation capability
is blocked with a structured reason; it does not fall back to optimistic writes.

Admission checks the expected evidence head under that ownership, reads fresh
authority state, and evaluates current policy and approvals before recording
the request. Immediately before each dispatch, the kernel verifies ownership,
epoch, and action preconditions, including provider-native expected revisions
where available. The adapter must document how a change between that check and
dispatch is fenced; a check alone is not the execution guarantee. Detailed
provider proofs and failure tests belong to the phase-specific specifications.

Detected forks block new governed effects in the affected scope. Reconciliation
preserves every competing record and observes already-dispatched effects before
an authorized reconciliation record joins the branches. A join records the
conflict and its disposition; it neither retroactively authorizes effects nor
silently chooses a winning request. Observation and reconciliation evidence may
be recorded under exclusive recovery ownership while ordinary dispatch remains
blocked.

Every action returns the same result shape:

```text
{"schema":"aitm.result/v1","ok":true,"requestKey":"analysis-45-01","actionId":"01K...","action":"work-item.record-analysis","effects":[{"type":"journal.appended","ref":"github://org/repo/issues/45/comments/123"}],"evidence":{"head":"sha256:..."},"retry":{"safe":true,"mode":"idempotent","requiresSameRequestKey":true},"next":[{"action":"work-item.approve-plan","status":"available"}]}
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

Strict mode additionally requires provider write credentials to be isolated to
the MCP process, no alternate write-enabled provider tool, enforceable network
or credential boundaries where applicable, and a successful startup probe.

Full-Auto requires `guarded` or `strict`. A behavioral-only host may run
supervised workflows but cannot activate Full-Auto. Every durable Full-Auto
receipt records the exact assurance level; guarded execution is never described
as strict.

## Verification

### Core domain tests

Test lifecycle and policy independently of providers, including action schemas,
effects, retry classification, evidence replay, correction, reconciliation,
fork handling, and canonical minified JSON.

Required adversarial cases include:

- two workers admitting conflicting requests from the same evidence head;
- a former coordinator resuming after ownership changes, including a pause
  between the final ownership check and provider dispatch;
- takeover while an earlier provider request is still in flight;
- policy or approval changes between discovery and action admission;
- a successful effect whose response is lost, followed by the same request key
  from a fresh process through the other transport;
- simultaneous retries using one key, conflicting payloads under one key, and
  intentionally distinct keys with identical payloads;
- recovery using only external authority after local state is deleted;
- incomplete observations that must not authorize duplicate effects; and
- fork reconciliation that preserves competing evidence and blocks conflicting
  execution until every outstanding effect is resolved.

### Adapter conformance kit

The public SDK ships a runner:

```bash
npx aitm-adapter-conformance ./dist/adapter.mjs
```

It verifies manifest and port schemas, identifier round trips, capability
reporting, idempotent replay, interrupted-write recovery, error normalization,
evidence preservation, unauthorized behavior, minified JSON, and prohibited
effects.

Each adapter must prove its declared admission and execution mode, including
stale-owner rejection or safe refusal of takeover. Built-in GitHub is subject to
the same gate. The suite also exercises automatic bootstrap or its explicit
unsupported result, concurrent provisioning, lost creation responses, duplicate
roots, genesis read-back failure, and recovery by binding an existing container.
Search visibility delays must produce intervention when absence cannot be
established. A manifest declaration without a passing proof does not enable the
corresponding mutation capability.

### Transport parity

Invoke common actions through CLI and MCP and assert identical domain requests,
authority effects, receipts, errors, and next-action recommendations.

Enumerate the executable registry and require a tested MCP route for every
agent-callable action, including uncommon portable actions through
`aitm_invoke_action`. Exercise typed and generic routes with the same logical
request and request key, verifying that retries resolve to the same action.
Reject unknown actions, namespace mismatches, invalid schemas, and
`orchestrator-only` invocations through every public dispatcher. Verify that host
approval applies to the resolved generic action and payload.

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
- agent-callable actions without a tested MCP invocation route;
- actions without input and output schemas;
- mutations without declared effects and recovery semantics;
- mutations without certified execution ownership and durable request identity;
- automatic authority bootstrap without verified genesis and safe recovery;
- CLI and MCP behavioral divergence;
- generated-file changes absent from the install manifest;
- adapters that fail their declared-port conformance suite; and
- cloud fixtures that require setup after `npm ci`.

## Migration and rollout

This architecture is an umbrella initiative and must be decomposed into
implementation-sized specifications and plans.

### Phase 1: Headless kernel and built-in GitHub adapter

- Inventory every current action and direct provider mutation.
- Define canonical action, result, error, effect, and evidence schemas.
- Establish durable request keys, scoped execution ownership, and bootstrap
  recovery before enabling the new mutation path.
- Route the current CLI through application services and policy.
- Move GitHub behavior behind the public adapter contract.

Exit when the existing CLI suite passes through the kernel without MCP and the
new admission, response-loss, stale-owner, and bootstrap failure cases pass.

### Phase 2: Discovery and self-help

- Generate the action registry from executable definitions.
- Add capability resolution, descriptions, errors, and recommendations.
- Emit canonical minified JSON and render human help from it.

Exit when every action and error is discoverable and schema-linked.

### Phase 3: MCP and lightweight skill

- Add the tiered MCP tools and resources.
- Prove complete invocation coverage, including uncommon portable actions.
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
- Prove that an independently built reference adapter requires no core changes.

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

A failed migration does not activate partially generated integration files or
claim success. The previous installation remains selected; compatible external
effects already committed are preserved and reported in the control stream with
recovery instructions. First-container provisioning uses the bootstrap recovery
contract when that stream is not yet verified. If an unresolved effect makes
continued mutation unsafe, affected actions are blocked until reconciliation;
rollback never promises to erase an external effect or to keep unsafe actions
operational.

Existing CLI verbs remain supported for at least one major-version transition.
Compatibility aliases use the same request-key contract. The migration preview
identifies unattended callers that must supply a stable key; a missing key fails
before provider effects, rather than silently inventing a fresh key on retry.
Interactive CLI key generation remains available as specified above.
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
   Every agent-callable action has a tested MCP invocation route, including
   uncommon portable actions; orchestrator-only actions cannot use those routes.
6. Agent-facing instructions and results are schema-validated minified JSON;
   human output is rendered from the same canonical model.
7. `aitm setup` writes reviewable tracked integration files; a committed clone
   becomes usable after only `npm ci`.
8. A stale clone enters diagnostic-only mode and provides exact maintainer
   remediation without modifying tracked files.
9. Durable journals, approvals, receipts, and recovery records live in the
   selected external backlog authority as canonical append-only hash-linked
   envelopes.
10. Interrupted mutations are observed and reconciled before retry. Caller-held
    request keys resolve to the same durable action across process and transport
    changes; changed payloads under the same key fail without new effects.
11. Generated agent memory is fingerprinted, replaceable, and non-authoritative.
12. Full-Auto is unavailable under behavioral-only enforcement and records its
    actual guarded or strict assurance level.
13. Existing GitHub projects migrate without bulk evidence rewrites or silent
    external mutation.
14. Each delivery phase has its own bounded specification, plan, tests, and
    approval before implementation.
15. Concurrent execution uses certified scoped ownership and fencing or
    exclusive coordination; journal rereads alone never authorize dispatch.
    Stale owners, unresolved conflicting effects, and forks block execution.
16. First authority bootstrap verifies a durable genesis and reconciles lost
    responses or duplicate roots before enabling workflows. Unsupported safe
    provisioning requires explicit binding, and partial effects remain visible.

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
