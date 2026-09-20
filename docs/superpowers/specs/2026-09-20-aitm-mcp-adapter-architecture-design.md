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
3. Route provider-specific extensions through the same AITM governance as
   portable actions, with selected executable plugins explicitly inside the
   trusted kernel boundary.
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

For this architecture, each project has exactly one active writable binding
for each of `work-items`, `repository`, `forge`, and `ci`; an optional port may
be unconfigured, which blocks actions requiring it. `work-items` is the sole
backlog authority. The local Git `repository` binding may resolve multiple
explicit clone/worktree targets, but those are targets of one binding, not
competing writable providers. `identity` is non-mutating and may have multiple
provider/account observers. Other provider bindings are observation-only and
must be named explicitly when read.

An action resolves an omitted forge or CI destination only from that port's one
active binding and an unambiguous configured target mapping. An explicit target
must belong to the same binding. Missing, ambiguous, or conflicting mappings
block admission; there is no first-match selection or transport-specific default.
Switching a writable provider uses the configuration-generation and recovery
rules below. Concurrent writes to multiple forges or CI bindings are outside
this version's scope.

Identity observations are scoped to the provider instance and account. A shared
display name across providers does not establish the same actor. The kernel
keeps the initiating actor, each provider execution principal, and any approver
distinct; explicit verified delegation or account mappings relate them.

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

### Local repository binding

A built-in local Git adapter supplies the `repository` port through the same
public ABI and conformance requirements. Remote forge selection does not select
the caller's checkout implicitly. Each local effect binds the canonical
repository, clone and worktree identity, affected refs, and expected revisions.
Linked worktrees share the relevant Git mutation scopes; distinct clones do
not become the same local target merely because their remotes match.

Portable configuration describes repository roles and relative locations.
Runtime binding resolves and verifies the actual checkout; machine paths are
locators, not portable identity or authority. Missing, ambiguous, or relocated
bindings block affected mutations until an explicit verified rebind. Neither
CLI `cwd` nor MCP server startup location overrides the recorded target.

Local commits, worktrees, and uncommitted user data are original repository
artifacts, not disposable AITM cache. Their governance and recovery receipts
remain in external authority, but recovery can inspect a local effect only at
its verified target or through an explicitly authorized, verified transfer.
An unavailable original clone means unknown effects, not proof of absence. A
fresh clone may inspect the action but cannot replay its local mutation against
itself. Publishing a local object, moving user data, or replacing a checkout
requires a separately declared and authorized effect; recovery does not silently
push, discard, or recreate it. AITM supports intervention when the original
artifact cannot be recovered and does not promise to reconstruct lost user data.

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

The `^2.0.0` package and `^2` ABI values above are illustrative future versions,
not a claim about today's `0.1.0` release. The SDK delivery specification must
choose the actual first public ABI version and publish its compatibility matrix
against package versions; ABI and package major numbers need not be identical.

The adapter runtime contract is intentionally small:

| Method      | Responsibility                                                |
| ----------- | ------------------------------------------------------------- |
| `manifest`  | Describe capabilities, schemas, limits, and learning guidance |
| `probe`     | Inspect configuration, authentication, and live availability  |
| `read`      | Read authority state through canonical references             |
| `execute`   | Perform an authorized domain action                           |
| `observe`   | Determine which external effects occurred                     |
| `reconcile` | Resolve an interrupted or ambiguous action                    |
| `evidence`  | Active `work-items` binding only: store canonical evidence    |
| `doctor`    | Return typed diagnostics and remediation                      |

Methods are supported according to declared ports. Only the active writable
`work-items` binding implements canonical evidence persistence for the project.
The kernel sends every request, progress, outcome, approval, and recovery
envelope through that binding, including actions whose business effects occur
in another provider. Other adapters return typed observations and effect
receipts to the kernel; their native logs and referenced artifacts are source
evidence, not separate AITM authority streams. A package implementing multiple
ports receives evidence calls only in its active `work-items` binding context.

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

Selected executable plugins and their runtime dependencies are part of the
fully trusted computing base. This version does not sandbox them or prevent
buggy or malicious trusted code from bypassing the ABI, reading process
credentials, or making undeclared effects. Conformance tests detect violations;
they do not establish containment. A maintainer who does not trust a plugin with
the kernel's privileges must not activate it. Supporting less-trusted code
would require a separately specified isolation boundary.

The selected plugins are committed in project configuration and restored by the
package lock. Cloud consumers load only the committed selection; they neither
scan nor prompt.

Portable selection requires either a pinned package retrievable by the target
environment or a repository-contained, tracked package. A workspace or relative
filesystem adapter must include its runtime artifacts or reproducibly generate
them during the declared `npm ci` step. Its resolved entry and required assets
cannot depend on files outside the clone, escaping symlinks, or an uncommitted
build. Registry credentials, when needed, are runtime prerequisites supplied
through the environment rather than tracked secrets.

An external filesystem selection remains available for local experimentation,
but setup reports `adapter-local-required` and cannot certify that installation
as portable. The maintainer must publish or vendor the package, normalize the
dependency and lockfile, and pass isolated-clone verification before portability
is claimed. A package-lock entry alone is not proof of reproducibility.

Every selected adapter also has an executable content identity covering its
resolved entry, complete executable dependency closure, runtime assets, and
loader/build inputs that determine those bytes. Verified package integrity
alone is sufficient only when it covers the complete closure actually loaded;
dependencies and generated outputs outside that coverage need their own
verified identities. Workspace and relative-filesystem adapters use a
deterministic digest of a reviewed runtime artifact and its complete closure.
Undeclared dynamic imports, escaping paths, or unverified downloaded code cannot
extend that identity. An unverifiable closure blocks activation.

Setup records that identity with the maintainer's trust selection. Runtime
loading uses the verified artifact and holds an immutable view, or equivalent
certified exclusion of concurrent writes, for as long as it can dispatch.
Hashing a pathname and later loading mutable bytes is insufficient. Changing
code without changing a package version or manifest still requires a new
verified selection and installation fingerprint.

The reference loading approach materializes the declared closure into a new,
private content-addressed staging directory, verifies every staged byte against
the selected identity, and atomically publishes it for read-only loading. It
never imports from the mutable source checkout or a shared package tree. Relative
imports and asset lookup resolve within the staged closure; undeclared or
escaping resolution is rejected. Active snapshots are neither updated in place
nor removed until their users release them. This cache is disposable: a fresh
process can reconstruct it from the selected, verified package artifacts.

Snapshot ownership must be enforceable under the host's stated threat model.
The kernel serializes its own publishers and garbage collection, and the host
must exclude other writers throughout loading and use. A directory name, chmod,
or advisory lock alone does not establish this when another process retains
write capability. Strict hosts require actual access isolation; other hosts
must certify the narrower trusted-writer assumptions they rely on. If a host,
loader, native dependency, or dynamic asset cannot satisfy the closure and
ownership contract, that runtime is unsupported until an alternative verified
loading mechanism is certified. Phase 0 proves at least one supported mechanism
before later phases can promise general portability.

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
`orchestrator-only` and have no directly callable MCP tool. Core-reviewed action
metadata assigns this classification to internal protocol primitives with a
named portable parent action; adapters cannot use it to hide an end-user action
from invocation coverage. Registry tests audit those assignments and parents.

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
The fingerprint covers core and schema compatibility identities, adapter identities, executable
content identities and manifests, project bindings and feature flags, and the
projection format.

For an untracked host-local memory target, session boot compares the fingerprint
and regenerates only the protected section when it changes. For a tracked
project memory target, session boot validates but never rewrites it; an isolated
learning-projection mismatch produces a warning and a maintainer setup diagnostic.
It does not disable mutation when authoritative configuration, schemas, bindings,
executable identities, and actual host enforcement remain valid. The kernel
continues to consult those validated sources rather than stale memory. Drift in
a hook or enforcement policy remains blocking even when co-located with learning
text. This keeps cloud consumers read-only and memory advisory while preserving
automatic refresh for genuinely local derived memory.

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

The same claim requires every selected adapter to satisfy portable selection.
An `adapter-local-required` installation must report that limitation even when
its host configuration is portable.

Credentials come from provider-native authentication, cloud secret stores, or
workload identity. They are not tracked.

## Installation staleness

Setup writes a content-addressed install manifest containing:

- generator package version as provenance, the setup ABI, and an explicit
  certified compatibility declaration for consuming core versions;
- normalized setup-intent hash;
- configuration and capability schema versions;
- selected adapter packages, versions, integrity, manifest hashes, and complete
  executable content identities;
- selected host bridges and enforcement-policy fingerprints; and
- generated artifact paths and content hashes.

CLI and MCP startup perform a fast read-only comparison against installed
packages and tracked files. Each mutation admission validates the active
configuration generation and installation fingerprints; a long-lived server
cannot rely on its first successful check. Dispatch remains bound to that
validated generation under execution ownership. Drift before dispatch blocks
new effects, and an adapter report that an external assumption changed triggers
fresh compatibility resolution. Implementations may cache immutable data by
fingerprint, but a cache cannot establish that its generation is still active.
These checks cover the executable identity selected by setup and the code
actually loaded at startup, admission, dispatch, and recovery. A changed runtime
closure is installation drift even if package versions and manifests match.
The immutable execution view prevents an edit after validation from silently
changing the implementation used for an admitted action.

Staleness is classified rather than flattened:

| Observation                                         | Classification                      |
| --------------------------------------------------- | ----------------------------------- |
| Core crosses certified setup compatibility          | Portable metadata stale             |
| Adapter version or manifest differs                 | Capability metadata stale           |
| Authoritative generated file is missing or modified | Installation drift                  |
| Only advisory learning content differs              | Warning; mutation remains available |
| Core version differs within certified compatibility | Advisory; other checks still apply  |
| Configuration schema is unsupported                 | Migration required                  |
| Capability fingerprint differs                      | Capability projection stale         |
| Credential or scope is missing                      | Runtime unauthorized                |
| Provider workflow field was removed                 | External compatibility drift        |
| Work item moved to another valid state              | Normal live state                   |

A core version difference alone is an advisory when an explicit certified
compatibility declaration covers the installed version and all setup ABI,
schema, capability, generated-policy, and executable-identity checks still pass.
Semver ranges alone cannot grant that compatibility. Producer-version provenance
is distinct from semantic fingerprints, so an unchanged learning format does
not drift solely because that provenance changed. Changed adapter executable
content still requires verified selection; compatibility does not waive its
content-identity check. Generated files are classified by purpose: drift solely
in advisory learning content warns, while authoritative integration drift blocks.

Stale authoritative installation metadata enters diagnostic-only mode. Read-only
discovery, help, and diagnosis remain available; ordinary business mutations are
disabled. The error
identifies the mismatch, whether any effects committed, the maintainer action,
and whether a new commit is required. A cloud consumer never repairs or
regenerates tracked integration files.

A maintainer can enter a narrowly scoped recovery mode while ordinary dispatch
is disabled. It requires a currently trusted, verified runtime with certified
support for the recorded action and journal schemas, authenticated recovery
authority, and exclusive recovery ownership. Unsupported schemas or unverified
code do not receive this exception. It may observe original targets and append
verified `action.reconciled`, `action.retry-authorized`,
`action.intervention-required`, or completion of an already-observed outcome,
including recovery of an uncertain evidence append. It cannot admit new business
actions or dispatch business effects; retry authorization records permission
for later revalidation, not immediate execution. Conflicting effects stay blocked.

Setup may validate and stage a compatible recovery runtime before activation
without changing the active destinations or configuration generation. It then
settles pending actions or verifies a continuing authorized recovery path before
activating the new generation. Reinstalling the last verified committed runtime
is another route when it remains compatible and trusted. If neither path can be
proved, setup explicitly stops for intervention. Staleness alone must not prevent
this governed evidence repair, and recovery never silently repairs tracked
configuration in a cloud consumer.

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

The core defines canonical minified envelopes. The active `work-items` binding
stores the exact envelope through the provider's most suitable durable mechanism and maintains a
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

### Retention and retrieval contract

A writable `work-items` binding must preserve and retrieve the canonical
payloads needed for complete replay, approval provenance, request-key
deduplication, and recovery for the lifetime of the configured authority.
Automatic expiry cannot remove those payloads or request-key tombstones. A
finite live-store retention window is acceptable only with a verified,
provider-native durable archive inside the same logical authority and governed
ownership boundary. Moving records there preserves exact envelopes, stable
identity, complete predecessor traversal, and lookup; hashes or locators without
retrievable payloads are insufficient. An independent local archive cannot
satisfy this contract.

Setup certifies retention, enumeration, lookup, and deletion-detection behavior
before activating writable capabilities. Each admission validates the current
retention policy and the completeness needed to establish its authoritative
state and request-key reservation, including archive coverage. Certified
completeness evidence may avoid a full scan, but a stale projection or absent
search result cannot supply it. Expiry, deletion, inaccessible archives, or
policy drift that breaks this proof blocks affected admission and dispatch;
uncertainty spanning the project request-key scope blocks project mutations.
Read-only diagnosis and governed evidence recovery remain available.

A reviewed archive transfer or authority migration must verify full payload and
request-key/tombstone continuity, including pending actions, under the same
writer barrier and durable cutover rules as existing-project migration. There
is only one active writable authority; an old store may be retained read-only
as part of verified historical retrieval. If required history is already lost,
recovery requires an authentic retained copy. Rebinding a container or inventing
a genesis cannot certify missing history or release ambiguous effects. When no
copy exists, intervention remains blocked rather than promising reconstruction
or uninterrupted availability. Whole-history replacement by a trusted provider
administrator remains outside the hash-chain threat model stated below.

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
timestamp, input or result hash, effects, predecessor references, and record
hash. Ordinary records have one predecessor; genesis has none. Corrections,
reversals, reconciliations, and fork joins append new records that supersede
prior facts; they do not rewrite history.

A fork join uses an explicitly versioned multi-parent envelope whose hash covers
a canonical ordered set of all joined head IDs and hashes. It includes the
authorized disposition of competing evidence and effects, rather than treating
all branch contents as accepted. The new replay contract preserves the full
graph, validates every parent and disposition, and derives one authoritative
state from the join. A join must cover the complete conflicting frontier under
exclusive recovery ownership. Missing parents, conflicting joins, unresolved
effects, or a subsequently discovered branch keep or return the scope to a
blocked state; selecting one branch is never implicit recovery.

The current single-predecessor capsule reader does not implement this contract.
Implementation must version the envelope and replay rules and certify both
before enabling joins. Older readers must refuse the new schema, not silently
ignore extra parents. Historical single-predecessor evidence stays readable;
ordinary traversal cannot resume through a fork just because an event is named
`conflict-resolution`.

The bounded head projection contains the latest event reference, chain hash,
lifecycle summary, and unresolved recovery actions. It is derived and
rebuildable from the event stream.

A hash chain detects partial or accidental history modification. It does not by
itself prevent a provider administrator from replacing an entire history;
provider audit controls and future optional signatures address stronger threat
models without making signature infrastructure a version-one dependency.

### Evidence append recovery

Evidence append is an internal protocol primitive, not a domain action that
recursively requires another `action.requested` record. This is a layering
boundary, not an exemption from execution ownership, authorization, integrity,
or read-back verification. Only the kernel's authorized protocol path may use
it; neither generic invoker exposes arbitrary journal writes.

Before submission, each logical append has a stable event identity and a fixed
canonical envelope, including its predecessor and content hash. The adapter
must provide lookup and retry semantics for that identity. The request key and
principal scope must locate an uncertain initial request from a fresh process;
subsequent appends are recoverable by action and event identity. A retry cannot
invent a new event ID or predecessor to hide an uncertain prior append.

If creation or read-back loses its response, the adapter reports an unknown
append outcome. Recovery verifies the stored envelope under current ownership
before treating the append as committed. Resubmission requires safe native
idempotency or proof that the earlier append did not commit and cannot still
complete. Search absence alone is insufficient. Conflicting contents, duplicate
physical records, or competing predecessors block dependent effects and require
explicit reconciliation; they are not silently removed or counted twice.

No business effect may dispatch until its request record is verified. If an
outcome append is uncertain after business effects occurred, recovery observes
those effects and completes the evidence protocol without repeating completed
effects. Success requires a verified durable outcome. Unresolved evidence writes
remain visible as recovery work and block conflicting successors. Conformance
must prove this protocol for request, outcome, and reconciliation records,
including restart without local append state.

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

### Initiating principal authentication

Each transport authenticates a caller to a stable, project-scoped principal
reference before mutation admission. The namespace includes the identity issuer
and stable subject, never just a display name, raw token, process ID, or MCP
session ID. A local CLI or stdio host uses a verified operating-system identity
mapped by trusted project policy, or a provider-authenticated account/service
identity verified by the identity adapter. A remote transport, when supported,
requires a verified credential and an explicit mapping to that same namespace.
Credential rotation and transport changes must preserve the subject mapping.
Absent or ambiguous authenticated identity blocks mutation; the namespace never
degrades silently to an anonymous project-wide scope.

Initiator, execution principal, and approver are distinct roles; one verified
identity may occupy more than one role without proving human approval. Sessions
sharing an authenticated service identity share its request-key namespace.
They must generate distinct keys for distinct intent. If they deliberately reuse
a key with identical canonical input, replay of the same logical action is the
correct result; different input is a conflict. No transport can infer two
independent intentions from an identical principal, key, and payload. An
untrusted actor string cannot split or impersonate namespaces. Authorization
for inspection and recovery is checked independently of knowledge of a key.

### Request identity and retry

Every mutating CLI and MCP request requires a caller-supplied `requestKey`,
chosen and retained before submission. Independently initiated actions use keys
with at least 122 bits of cryptographic randomness (for example, random UUIDv4 keys),
not natural-language labels or locally incremented counters. Any display label
is separate from this key. Interactive CLI use may generate and
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

The request also preserves its non-secret resolved execution context: the
active configuration generation and hash, selected port bindings, canonical
provider instances and target references, adapter identities and versions,
executable content identities, recovery-contract versions, and expected target
revisions. An effect whose target does not exist yet records the destination container and its stable
creation key. Implicitly selected forge or CI destinations must be recorded as
explicitly as the work-item authority. Secrets are referenced by runtime
credential requirements, never copied into this snapshot.

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

### Quota, backpressure, and evidence volume

A governed action requires verified request and outcome records in addition to
its business effects and any necessary observation. Phase-specific action
profiles must count authority creates, verification reads, business calls,
projection writes, bytes retained, and cold-replay reads. The provider binding
certification sets explicit workload assumptions and numeric operating budgets
for these counts, sustainable action rate, recovery latency, and evidence volume;
there is no provider-independent throughput promise. Phase 0 measures the GitHub
reference profile and agrees these budgets before approving Phase 1 delivery.

Adapters enforce backpressure across every shared provider quota scope, including
cross-item workloads using the same execution principal. They honor provider
retry delays, use bounded backoff, and expose temporary unavailability and the
same resumable request identity. Read batching and coalescing derived projection
updates may reduce load, but cannot skip verified requests or durable outcomes.
Actions are coarse domain operations, not one action per internal SDK call.

An unsent request or an authoritative rejection proven to have applied no effect
may retry under its original key after the required delay and fresh authorization.
A rate-limit status by itself is not proof for every endpoint: the adapter
certifies that classification. A lost response or uncertain write instead enters
observation with its original stable event marker and canonical envelope.
Temporary inability to read does not imply a human decision is immediately
required; bounded deferred observation may continue under recovery ownership.
Persistently unresolvable uncertainty requires intervention. No backoff, quota
increase, or expired timer authorizes blind resubmission of an ambiguous write.

Certification reports retained-record growth and cold-rebuild cost, including
multi-year workloads and shared account pressure. Capacity thresholds trigger
backpressure or a reviewed archive/container rotation before loss of evidence.
Such rotation preserves the complete logical authority and request-key history
under the retention contract; deleting old comments to reduce cost is not an
acceptable substitute. No fixed GitHub quota is assumed by this umbrella design.

### Recovery across configuration changes

Recovery uses the recorded destinations and effect identities, not the current
default port bindings. Current policy and permissions still apply; an old
execution snapshot is evidence of intent, not a continuing authorization grant.
An installed adapter may recover an older action only when it is selected and
trusted and its conformance contract supports the recorded recovery version.
Recovery validates the current selected executable identity and its certified
compatibility with the recorded implementation identity and recovery contract;
a matching package version alone is insufficient. A compatible upgrade may
recover the action without reinstalling old code, but cannot silently treat
changed bytes as the original implementation.
Missing credentials, an unavailable adapter, or incompatible semantics require
intervention. A record naming an old package never authorizes automatically
installing or executing it.

Setup inventories pending actions before changing a binding or recovery
contract. It must either settle them or verify a continuing, authorized
recovery path to their original targets. An incompatible replacement is blocked.
Binding changes serialize with admission and dispatch, record a new active
configuration generation in the control stream, and fence dispatch under the
retired generation. Historical targets may remain available for observation;
any required recovery mutation needs an explicit scoped grant under current
ownership, without creating a second writable backlog authority.

Changing a target or the meaning of an effect is not a retry. It requires a new,
separately authorized action linked to the resolved or explicitly disposed
original action. Outstanding ambiguous effects continue to block conflicting
successors. Reacquiring credentials or resuming through another transport never
silently changes the recorded initiating identity or destination.

### Approval authority and provenance

Provider authentication proves access by an execution principal; it does not
prove that a human reviewed or approved an action. The kernel records the
initiating actor, execution principals, approver, and any delegation separately.
An approval must have verifiable provenance from a trusted human interaction or
an authenticated approval source supported by the project. An agent-supplied
actor name, `approved: true`, environment label, or access to a human's provider
credential is not sufficient proof of a human decision.

Approval records identify the governed requirement, authority and work scope,
approved subject and revision or digest, decision, approval mode, actor,
provenance reference, and any expiry or revocation. Subject binding follows the
action's schema: for example, a plan approval binds its plan and relevant story
intent, while delivery authority binds the repository, PR, and expected commit.
Admission and dispatch reject missing, stale, revoked, or mismatched evidence.
A prior approval cannot authorize changed content merely because it concerns
the same work item.

Host permission to invoke a tool and workflow approval are separate checks.
One human interaction may satisfy both only when its verified evidence covers
the resolved action, payload, subject, and required approval scope. A blanket
permission for `aitm_invoke_action` or `aitm_invoke_extension` is insufficient.
Bridges that cannot establish the required provenance must direct the user to a
supported approval path; the kernel must not manufacture that evidence.

Authorized Full-Auto decisions retain their automated mode and policy authority.
Workflow exceptions retain their distinct disposition and scope. Neither is
relabeled as human approval or satisfies a requirement reserved for an explicit
human decision. Legacy evidence retains its original provenance, including
unknown provenance; migration cannot upgrade an unverified assertion into a
verified human decision. Phase-specific schemas and conformance tests must
preserve the existing approval and content-binding guards.

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
{"schema":"aitm.result/v1","ok":true,"requestKey":"91b2b7a5-46b7-4c7a-94a7-6aafde380255","actionId":"01K...","action":"work-item.record-analysis","effects":[{"type":"journal.appended","ref":"github://org/repo/issues/45/comments/123"}],"evidence":{"head":"sha256:..."},"retry":{"safe":true,"mode":"idempotent","requiresSameRequestKey":true},"next":[{"action":"work-item.approve-plan","status":"available"}]}
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
| `strict`     | Only the isolated AITM kernel can use governed write channels    |
| `guarded`    | Host policy blocks known mutation tools, commands, and endpoints |
| `behavioral` | The skill requests compliance, but the host cannot enforce it    |

Provider reads may remain available. Any observation used for a governed
decision must be normalized through AITM before becoming durable evidence.

Adapter manifests declare their mutation surfaces. Host bridges translate those
declarations into host-specific policy rather than maintaining a hard-coded
GitHub command list. A blocked attempt returns a minified policy error and the
governed replacement action.

Strict mode requires provider credentials and governed local Git write access
to be isolated to the kernel execution boundary reached by either transport.
The CLI remains a governed entry point; it cannot expose those credentials or
write capabilities to the calling agent. No alternate provider or local Git
mutation channel may bypass that boundary. Enforceable filesystem, process,
network, or credential controls and a successful startup probe must establish
the claim. A host with an unrestricted shell sharing writable Git metadata
cannot claim strict assurance solely by hiding provider credentials.

Strict assurance describes isolation from the calling agent and other
untrusted host processes, conditional on the selected kernel and plugins being
trusted. It does not claim containment of malicious kernel or adapter code.
Every assurance receipt identifies the trusted executable adapter set and its
content identities, trust basis, and enforcement boundary. Unknown executable
identity or missing explicit trust excludes an adapter from activation and thus
from Full-Auto at either assurance level. Certification of a declared mutation
surface is necessary but is not proof that arbitrary Node code cannot evade it.

Guarded mode covers declared local Git mutation commands as well as provider
tools and endpoints. Read-only Git inspection and source editing allowed by the
workflow are distinct from governed repository mutations. Each bridge states
its actual coverage; CLI and MCP use the same assurance classification. The
minimum assurance across the action's participating ports governs Full-Auto.

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
- forged approver fields, a shared human/agent provider credential, tool
  permission without workflow approval, changed approved content, and automated
  evidence offered for an explicit human gate;
- a successful effect whose response is lost, followed by the same request key
  from a fresh process through the other transport;
- simultaneous retries using one key, conflicting payloads under one key, and
  intentionally distinct keys with identical payloads;
- recovery using only external authority after local state is deleted;
- lost append responses and interrupted read-back for request, outcome, and
  reconciliation records, including delayed visibility and conflicting copies;
- recovery after a binding change, adapter upgrade or removal, and a runtime
  configuration change after the first successful action;
- interrupted local Git effects inspected from another clone, missing or
  relocated checkout bindings, and preservation of uncommitted user data;
- incomplete observations that must not authorize duplicate effects; and
- fork reconciliation that preserves competing evidence and blocks conflicting
  execution until every outstanding effect is resolved.

Fork tests include omitted or tampered join parents, competing joins, a late
branch, legacy-reader refusal, and deterministic replay from the complete graph.

Evidence ordering follows authenticated predecessor relationships and ownership
epochs, not wall-clock timestamps. Test skewed clocks and delayed delivery;
local expiry estimates never establish takeover safety or proof of absence.
Also test authenticated principal resolution across transports, credential
rotation, missing identity, forged caller labels, and parallel sessions sharing
a service identity. Distinct generated keys must create independent actions;
identical principal/key/input must replay once, and changed input under that
same key must conflict. These outcomes are deliberate, not identity inference.

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
Search visibility delays must preserve unknown outcomes and block unsafe
resubmission; bounded observation may defer a human intervention when the
certified visibility contract still permits automatic resolution. A manifest declaration without a passing proof does not enable the
corresponding mutation capability.

Evidence-port certification separately proves stable event lookup, uncertain
append recovery, and exact-envelope read-back. A successful business mutation
followed by an uncertain outcome append must never lead to repeating that
mutation or reporting an unverified success.

Recovery compatibility tests use recorded execution contexts from supported
older adapter versions. Composed-port fixtures change the forge binding while
retaining the backlog authority and verify observation at the original target,
stable effect keys, and refusal of unsupported recovery or redirected dispatch.
Passing each adapter's standalone suite does not replace these composition
checks.

Mixed-provider tests route every canonical request, progress, outcome, and
recovery envelope exclusively to the active authority: for example, Jira in a
Jira-plus-Bitbucket fixture. Forge and CI adapters return observations only;
attempts to persist independent authoritative envelopes must fail the contract.

Retention certification exercises expiry or deletion of intermediate requests,
approvals, outcomes, and request-key tombstones; inaccessible archives; and
retention-policy changes. It must prove refusal of unsafe admission and dispatch,
exact payload retrieval through any claimed archive, and complete replay and
key continuity after a governed transfer. Where no authentic copy survives,
the passing result is explicit unrecoverable intervention with mutations still
blocked, never a fabricated repair or a durable-retention capability claim.

The local Git adapter must prove target binding and shared-worktree conflict
scopes, interruption recovery, and refusal to treat another clone's filesystem
as evidence that an original local effect did not occur.

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

Both transports must reject forged or stale workflow approval evidence and an
inactive configuration generation, including after their initial startup checks.

### Portable-install test

An isolated fixture runs setup, commits the generated integration, clones the
fixture, runs `npm ci`, starts the MCP server, and performs read-only discovery.
The fresh clone must not run setup, install, init, or tracked-file generation.

Run the fixture with a pinned published plugin and a tracked workspace plugin.
Reject a portable-install claim for an external filesystem dependency, an
escaping symlink, or a runtime entry requiring an undeclared build step. The
fixture has no access to the maintainer's checkout or local plugin directories.

Change a workspace entry, imported dependency, generated runtime output, or
asset without changing its version or manifest. Startup and existing runtimes
must detect the executable identity mismatch and block new effects. Exercise
an edit between validation and loading or dispatch to prove the immutable
execution view, and recover a pending action only with a verified, certified
compatible executable identity.

Exercise a certified compatible core patch with unchanged semantic setup
outputs: version provenance alone must warn rather than disable business actions.
Exercise a schema/ABI boundary crossing, changed executable closure, and modified
authoritative generated policy: these must still block ordinary dispatch.
Create an ambiguous action before the upgrade and prove recovery-mode evidence
repair or a staged compatible recovery runtime can resolve it while new business
effects remain disabled. Reject the exception for untrusted code or unsupported
journal schemas; authorization recorded for retry cannot dispatch while stale.

### Learning-plane tests

Test preservation of all human text outside managed markers, including adjacent,
duplicate, nested, malformed, and adversarially placed markers. Ambiguous marker
ownership fails without writes. Tracked targets are never regenerated at session
boot; untracked targets refresh only their owned projection on semantic
fingerprint change. Reject credentials, live issue state, and copied provider
documentation in generated content. Pure advisory fingerprint drift produces a
warning while authoritative policy remains enforced. Co-located enforcement
policy drift must still block; stale learning must never supply a gate decision.

### Migration cutover tests

Exercise an older CLI racing checkpoint capture, an in-flight legacy effect,
crashes on both sides of durable activation, and recovery from another clone.
Restoring pre-migration generated files after a new action must not resume old
authority writes. Verify that an unprovable old-writer barrier blocks activation,
unresolved effects remain visible, and exactly one authority is writable.

### Host-policy tests

Each bridge proves that governed mutations remain available, known raw provider
mutations are blocked at the declared assurance level, configured reads remain
available, reported assurance matches actual enforcement, and behavioral-only
hosts cannot activate Full-Auto.

Verify separately that host tool permissions cannot fabricate workflow approval
and that approval provenance distinguishes human decisions from automated ones,
even when both use the same provider account.
Include raw local Git mutation channels, an unrestricted shell with writable
Git metadata, and the CLI route in assurance tests. Strict mode must refuse a
claim that is established only for remote provider credentials.

Inject an adapter mutation outside its declared method or port. Certification
must report the violation and reject that implementation's capability claim;
the test cannot be presented as proof of arbitrary-code isolation. Verify that
strict receipts name the fully trusted plugin content identities and accurately
limit their guarantee to the enforced host boundary.

Quota fixtures distinguish unsent writes, proven rejection, response loss,
read throttling, and unresolved uncertain appends. Verify shared-principal
backpressure, bounded observation/backoff, retry-delay compliance, and unchanged
logical keys. Measure the approved action profiles and retained-volume/cold-read
budgets; excessive load cannot be hidden by dropping evidence. Exercise safe
container/archive rotation with complete retrieval and tombstone continuity.

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
- mutations that omit required approval provenance or subject bindings;
- pending-action recovery that redirects targets or lacks adapter compatibility;
- evidence appends without stable identity and certified response-loss recovery;
- fork recovery without a versioned, certified multi-parent replay contract;
- local repository effects without verified target binding and recovery scope;
- automatic authority bootstrap without verified genesis and safe recovery;
- migration activation without a verified old-writer barrier and durable cutover;
- CLI and MCP behavioral divergence;
- generated-file changes absent from the install manifest;
- adapters that fail their declared-port conformance suite;
- executable adapters without a verified complete runtime content identity;
- assurance claims that omit trusted plugins or imply they are sandboxed;
- default-provider rollout without the Phase 0 feasibility and quota proof;
- learning bridges without protected-marker and advisory-drift tests;
- caller identity or port selection without transport-parity tests;
- stale-state recovery without a verified evidence-only repair path;
- writable authorities without certified retention and complete retrieval; and
- cloud fixtures that require setup after `npm ci` or depend on local adapter
  files unavailable in the clone.

## Migration and rollout

This architecture is an umbrella initiative and must be decomposed into
implementation-sized specifications and plans.

### Phase 0: Feasibility and operating-envelope proof

Neither ADR 0002 nor this umbrella document demonstrates a certified execution
mode for GitHub. Issue/comment journals are evidence storage, not a presumed
conditional mutation or stale-dispatch fence. The built-in packaging default
therefore does not imply zero-configuration governed-write readiness.

Before approving Phase 1 implementation, a bounded feasibility specification
must prototype and certify a concrete reference execution topology. The candidate
is one explicitly provisioned dispatcher per conflicting scope on a verified
execution target, with other workers lacking its governed write channels.
The supervisor serializes dispatcher lifetimes and proves the old instance
stopped before another starts; outstanding provider effects must also be settled.
This requires real host/credential enforcement across all participating clones,
not just an epoch recorded in GitHub or a local lock shared by willing callers.
One-shot supervised execution is allowed; no hosted AITM service or always-on
local daemon is introduced. GitHub remains the durable record authority.

The proof covers initial provisioning, parallel requests from independent
clones, process pause/resume, target loss, credential changes, stale-generation
dispatch, takeover refusal, and local Git effects. It also demonstrates at least
one verified plugin-loading snapshot and measures the protocol's quota/retention
operating envelope. These are feasibility results to establish, not claims that
the candidate already passes on all supported hosts.

If no permitted topology passes, new mutations remain unavailable and the
architecture returns for explicit revision before kernel rollout or migration
activation. Existing projects retain their prior installation until cutover;
that is not certification of the legacy path against the new guarantees.
Fresh installations offer diagnostics and read-only discovery, with the missing
execution capability and provisioning requirements explicit. There is no reduced
assurance tier that permits duplicate or unfenced effects. The Phase 1 gate is
conditional on this earlier proof, so default-provider feasibility is not first
discovered after the kernel has been built.

### Phase 1: Headless kernel and built-in GitHub adapter

- Inventory every current action and direct provider mutation.
- Define canonical action, result, error, effect, and evidence schemas.
- Establish durable request keys, scoped execution ownership, and bootstrap
  recovery before enabling the new mutation path.
- Certify evidence-append recovery and the shared migration cutover before
  activating the new authority path in an existing project.
- Preserve approval provenance and content bindings, and persist resolved
  execution context for recovery across configuration changes.
- Route the current CLI through application services and policy.
- Move GitHub behavior behind the public adapter contract.
- Assign all canonical evidence writes exclusively to the active `work-items`
  binding and certify retention, retrieval, and mixed-port evidence routing.
- Supply the local Git port, certify its binding and recovery boundaries, and
  version and certify fork-join replay before enabling those capabilities.

Exit when the existing CLI suite passes through the kernel without MCP and the
new admission, response-loss, evidence-append, stale-owner, bootstrap, and
migration-cutover failure cases pass in the topology certified by Phase 0.
Its implementation plan must split the work into independently approved kernel,
authority/recovery, and migration increments; later increments cannot activate
before their predecessor gates pass.
Approval-provenance, stale-subject, and changed-binding recovery cases are also
required before replacing the corresponding existing guards or mutation paths.

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
- Distinguish local adapter experiments from reproducible portable selections.
- Gate configuration activation on pending-action recovery compatibility and
  verify generation checks in long-lived runtimes.
- Bind plugin trust and staleness to the complete executable runtime identity
  and prove dispatch cannot switch to unverified bytes after validation.

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
- Identify the fully trusted plugin code in receipts and distinguish host
  isolation from the unsupported containment of in-process plugins.

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

Migration separates staging from durable authority activation. Before capturing
the final checkpoint, it obtains exclusive migration ownership, fences or
verifiably stops all old writers, and settles their in-flight effects. The
barrier covers other clones, unattended commands, and legacy Full-Auto entry
paths. A new local configuration file or a marker that old binaries ignore is
not a writer fence. Where old writers cannot honor the protocol, their write
access must be isolated or revoked, or their dispatchers verifiably stopped;
otherwise activation is blocked.

Under that barrier, migration verifies checkpoint parity and writes and reads
back a durable activation record naming the migration identity, selected
authority locator, epoch, checkpoint hash, and minimum compatible writer
protocol. New CLI and MCP writers check this shared authority selection before
dispatch. A partially written or ambiguous activation blocks both paths until
reconciled. Compatibility aliases are supported entry points in the new kernel;
they do not authorize old binaries to continue writing obsolete authority.

Before durable activation, a failed migration leaves the previous installation
selected and does not activate partially generated integration files or claim
success. Compatible external effects already committed are preserved and
reported in the control stream with recovery instructions. First-container
provisioning uses the bootstrap recovery contract when that stream is not yet
verified. If an unresolved effect makes continued mutation unsafe, affected
actions remain blocked until reconciliation.

After durable activation, failure recovery retains the new authority selection
even when local file activation failed. Restoring old generated files cannot
roll back that selection or resume legacy writes. Any reverse cutover requires
an explicitly reviewed migration that fences current writers, reconciles all
effects and evidence, and records a new activation epoch. Rollback never erases
external effects or promises to keep unsafe actions operational.

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
   becomes usable after only `npm ci`. Local-only adapter selections are
   explicitly classified and cannot pass portable-install certification.
8. A stale clone enters diagnostic-only mode and provides exact maintainer
   remediation without modifying tracked files when authoritative metadata is
   stale. Certified compatible core differences and isolated advisory learning
   drift warn without disabling business actions. Verified evidence-only recovery
   remains available under the defined stale-state exception. Executable plugin content
   changes trigger drift even when the version and manifest are unchanged;
   loading, dispatch, and recovery use verified implementation identities.
9. Durable journals, approvals, receipts, and recovery records live in the
   selected external backlog authority as canonical append-only hash-linked
   envelopes. Only its active `work-items` binding writes canonical evidence.
   Certified retention and retrieval preserve replay and request-key continuity;
   missing required payloads block mutations until authentic recovery.
10. Interrupted mutations are observed and reconciled before retry. Caller-held
    request keys resolve to the same durable action across process and transport
    changes; changed payloads under the same key fail without new effects.
11. Generated agent memory is fingerprinted, replaceable, and non-authoritative.
    Its isolated drift is advisory; managed-marker updates preserve human content
    and never rewrite tracked targets at session boot.
12. Full-Auto is unavailable under behavioral-only enforcement and records its
    actual guarded or strict assurance level, trusted executable adapter
    identities, and enforcement boundary. Strict host isolation does not claim
    to contain the fully trusted in-process plugins.
13. Existing GitHub projects migrate without bulk evidence rewrites or silent
    external mutation. A shared, verified cutover fences old writers before the
    final checkpoint; restoring local files cannot reactivate obsolete authority.
14. Each delivery phase has its own bounded specification, plan, tests, and
    approval before implementation. Phase 0 proves default-provider execution,
    verified runtime loading, and the operating envelope before Phase 1 rollout
    can be approved; failed feasibility returns the architecture for revision.
15. Concurrent execution uses certified scoped ownership and fencing or
    exclusive coordination; journal rereads alone never authorize dispatch.
    Stale owners, unresolved conflicting effects, and forks block execution.
16. First authority bootstrap verifies a durable genesis and reconciles lost
    responses or duplicate roots before enabling workflows. Unsupported safe
    provisioning requires explicit binding, and partial effects remain visible.
17. Journal append failures have stable event identity and explicit recovery.
    Unverified requests cannot authorize business effects; uncertain outcome
    writes cannot justify repeating completed effects or reporting success.
18. Workflow approvals have verified provenance and bind the exact governed
    subject. Human, automated, and exception authority remain distinguishable;
    provider credentials and blanket tool permissions cannot substitute for a
    required human decision.
19. Pending actions retain their resolved targets and recovery contracts across
    configuration changes. Incompatible recovery or retired configuration
    generations block dispatch; retries never redirect effects to new defaults.
20. Fork joins authenticate every joined head and its disposition through a
    versioned replay contract. Incomplete or conflicting joins remain blocked;
    old readers cannot silently accept a schema they do not understand.
21. Local Git mutations bind the correct clone, worktree, refs, and revisions.
    Recovery elsewhere cannot infer absence or replay against a different
    checkout, and host assurance covers both local and remote mutation channels.

### Acceptance-to-verification traceability

These are required verification obligations, not evidence that implementations
already pass. Each phase specification maps its applicable criteria to named
executable tests and retained results before approval.

| Criterion | Required verification coverage                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------- |
| 1         | Core domain tests and transport parity: one service path and equivalent effects                           |
| 2         | Adapter conformance: exclusive bindings, deterministic targets, and mixed-provider composition            |
| 3         | Adapter conformance and live GitHub certification without privileged bypass                               |
| 4         | Portable-install and SDK conformance with independent and workspace plugins                               |
| 5         | Registry enumeration, schema/help availability, invocation coverage, and internal-action classification   |
| 6         | Core canonical JSON tests and CLI/MCP schema parity                                                       |
| 7         | Isolated portable-install fixture, runtime closure, and host compatibility checks                         |
| 8         | Staleness classification, compatible upgrade, immutable loading, and recovery-mode tests                  |
| 9         | Exclusive evidence routing, replay, retention, archive, and missing-payload tests                         |
| 10        | Request-key replay, shared-principal concurrency, principal authentication, and uncertain-effect recovery |
| 11        | Learning-plane marker, privacy, tracked/untracked, and advisory-drift tests                               |
| 12        | Host-policy tests of assurance, trusted identities, and Full-Auto refusal                                 |
| 13        | Migration cutover, old-writer fencing, checkpoint, and reverse-cutover tests                              |
| 14        | Phase 0 feasibility results plus phase approval and criterion-to-test evidence gates                      |
| 15        | Stale-owner, cross-clone, in-flight, clock-skew, and conflicting-scope tests                              |
| 16        | Bootstrap concurrency, lost creation, duplicate roots, and genesis verification                           |
| 17        | Evidence-port append identity, read-back, and response-loss certification                                 |
| 18        | Approval provenance, content binding, forged evidence, and host/workflow separation                       |
| 19        | Recorded execution context, changed bindings, executable compatibility, and retired generation tests      |
| 20        | Versioned multi-parent replay, omitted/late parents, conflicting joins, and old-reader refusal            |
| 21        | Local Git target binding, cross-clone recovery, user-data preservation, and local enforcement tests       |

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
  conditional updates. Default-provider write readiness remains conditional on
  the Phase 0 execution proof.
- Durable per-action evidence increases API writes, retained volume, latency,
  and cold-rebuild cost; quota backpressure can limit otherwise valid work.
- Fail-closed integrity checks create operational recovery work. Advisory
  learning drift and certified compatible core upgrades must not create the
  same block as authority or executable drift.
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
