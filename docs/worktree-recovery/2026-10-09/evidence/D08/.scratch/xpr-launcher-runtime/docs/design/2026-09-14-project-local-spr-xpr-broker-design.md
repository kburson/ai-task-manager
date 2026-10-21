# Project-Local SPR/XPR Broker Design

## Document status

- **Date:** 2026-09-14
- **Status:** Draft for human review
- **Scope:** Design reconciliation only; no implementation or backlog mutation is
  authorized by this document
- **Supersedes in part:**
  [provider-neutral runtime orchestration design](2026-09-11-provider-neutral-runtime-orchestration-design.md)
- **Supersedes/replaces as product design:**
  [durable co-review wakeups design](2026-09-13-9-durable-co-review-wakeups-design.md)

## Summary

`ai-peer-review` remains one npm package. Cross-provider orchestration uses a
project-local broker shipped inside that package, not a separate npm package and
not a machine-wide daemon. The broker exists only while one canonical project
root has active cross-provider review work or pending recovery state.

The agent-facing startup API is author/reviewer intent, not runtime mechanics:

```text
peer-review start <artifact> \
  --artifact-kind <spec|plan> \
  --reviewer-provider <provider> \
  --reviewer-model <model> \
  [--reviewer-effort <effort>]
```

The invoking agent session is the author by default. The user is the requester,
sponsor, or operator, but not a protocol participant unless a later Human
Authority decision says so. Reviewer provider and model are required. Reviewer
effort defaults to `medium`.

Startup classifies the requested review:

- `SPR`: single-provider review. Author and reviewer are different sessions or
  models under the same provider family.
- `XPR`: cross-provider review. Author and reviewer use different providers.

SPR should prefer provider-native orchestration. New XPR startup under this
design requires the project-local broker because no single provider owns both
sides. Existing manual reviews retain their recorded protocol and recovery
commands; this proposal does not retrospectively require a broker for them.

## Startup contract and version boundary

This is a proposed replacement startup contract, not documentation of the
currently installed CLI. The inspected source still declares version `0.2.2`
and lacks the three reviewer-selection flags. `start <artifact>` denotes the
entrypoint, not a complete invocation: `--artifact-kind` remains required.

The first release implementing this contract must use a new minor version
above `0.2.x` and explain the startup migration. It must not republish `0.2.2`.
Old startup commands missing reviewer selection fail before mutation with a
usage error showing the missing fields; they must not select a default reviewer.
Existing reviews continue from their sealed descriptor and do not acquire new
startup requirements when read, resumed, submitted, advanced, or finalized.

| Existing start flag                                                  | Disposition in the proposed contract                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `--artifact-kind`                                                    | Retained, required, `spec` or `plan`. No filename inference.                    |
| `--phases`                                                           | Retained with its current ordered-phase semantics and artifact-kind validation. |
| `--reviews-root`, `--review-path-template`, `--record-id`, `--issue` | Retained with current containment, reservation, and identity rules.             |
| `--max-turns`, `--claim-ttl`                                         | Retained with current budget and claim validation.                              |
| `--transport-mode`                                                   | Retained as an explicit constraint with the mapping below.                      |
| `--bootstrap-grant`                                                  | Retained with exact protected-action authorization.                             |
| `--no-commit`, `--test-human-authority`                              | Retained with existing test-mode and assurance restrictions.                    |

The new required flags are `--reviewer-provider` and `--reviewer-model`;
`--reviewer-effort` defaults to `medium`. Generated commands print the resolved
effort explicitly. Unsupported effort or model choices fail preflight without
substitution. A model alias is resolved by its provider adapter and the exact
model ID is sealed and displayed before reviewer work begins.

`--transport-mode manual` requests human-relayed protocol handoffs and never
claims automatic wake. `resume-only` requires doctor-validated official resume;
`automatic-required` retains all existing capability, lease, and end-to-end
health gates and cannot degrade silently. When the flag is omitted, selection
comes from project policy and provider capabilities and is reported explicitly;
without a viable selection, preflight fails. These constraints are inputs to
the sealed runtime descriptor; `--runtime` is not required. Runtime ownership,
transport capability, and SPR/XPR classification are distinct fields.

For a new XPR, even explicit manual transport uses the broker to register and
route startup while handoffs remain manual. Broker unavailability prevents
that new startup and prints a recovery action; it does not change provider,
model, or transport. This deliberately changes new-start behavior. Manual
`status --next`, response submission, and recovery for an already registered
review remain available without a live broker, including reviews started by
older packages. A broker must stop automatic delivery before manual recovery
can take over an unresolved operation; an ambiguous delivery still requires
reconciliation. Manual recovery never grants permission to duplicate a wake.

## Decisions

1. `peer-review start <artifact>` remains the durable entrypoint.
2. `spr` and `xpr` may exist as help topics or aliases, but they are not the
   primary API and must not make `start` ambiguous.
3. The invoking runtime session is the default author.
4. Reviewer provider and reviewer model are required for agent-driven starts.
5. Reviewer effort defaults to `medium`.
6. Runtime mode remains an internal sealed descriptor, derived from provider
   capabilities, project config, and explicit flags when present.
7. A project-local broker is an included runtime helper in `ai-peer-review`.
8. The broker manages XPR startup and active-review routing for one canonical
   project root.
9. Issue #9 is superseded as a product design. Its wake ledger, capsule, and
   idempotent delivery mechanics may be reused only where they fit the
   project-local broker architecture. Its public coordinator-first CLI/API
   surface must be removed before its first publication, with no backward compatibility
   requirement.
10. A project-local broker is not a detached machine-wide service and is not
    useful outside `ai-peer-review`.

## Goals

- Let a user ask an active agent for peer review without teaching the user
  runtime vocabulary.
- Teach agents the complete CLI contract through offline help and examples.
- Keep same-provider review lightweight where one provider interface can spawn,
  resume, and monitor its own sessions.
- Require a broker only when review crosses provider boundaries or otherwise
  needs cross-provider coordination.
- Allow two different projects on one laptop to run independent XPR sessions
  without sharing package versions, IPC endpoints, review queues, or broker
  state.
- Preserve exact participant identity, sealed responses, reviewer non-mutation,
  event authority, durable wakeups, and fail-closed recovery.
- Remove documentation ambiguity left by earlier `--runtime`-first startup
  examples.

## Non-goals

- Creating a global broker package.
- Installing a global npm dependency, daemon, scheduler, or launch agent.
- Making one broker coordinate multiple project roots.
- Preserving the issue #9 public coordinator surface for backward
  compatibility.
- Treating MCP as a universal desktop-controller or session-injection system.
- Inferring author identity from the human requester.
- Falling back from XPR to SPR, or from one reviewer identity to another,
  without an explicit new review request.

## Role model

The initiating agent is the author. It owns artifact changes, author responses,
finalization, and any commits. The reviewer is selected by provider, model, and
effort from the user's request or project policy.

If runtime identity cannot identify the invoking agent, startup fails closed
unless a restricted declared-identity path is explicitly supported. Declared
identity cannot claim runtime, automatic wake, or provider-conformance
capabilities.

The reviewer selection contract is:

```text
reviewer_provider: required
reviewer_model: required
reviewer_effort: optional, default medium
```

Examples:

```bash
peer-review start docs/design/foo.md \
  --artifact-kind spec \
  --reviewer-provider claude \
  --reviewer-model opus \
  --reviewer-effort high

peer-review start docs/design/foo.md \
  --artifact-kind spec \
  --reviewer-provider codex \
  --reviewer-model gpt-5.6-sol
```

## SPR and XPR classification

The first implementation accepts the following exact provider selectors.
Selectors identify an adapter; classification uses the mapped sealed provider,
not the selector spelling or the model name.

| Reviewer selector | Sealed provider / family | Sealed host   |
| ----------------- | ------------------------ | ------------- |
| `codex`           | `openai`                 | `codex`       |
| `claude`          | `anthropic`              | `claude-code` |
| `grok`            | `xai`                    | `grok`        |

Startup resolves the author's verified family and the requested reviewer's
expected family before broker selection. It seals the requested adapter, exact
model, product surface, and expected identity; reviewer registration must match
these values before a turn is claimed. Unexpected identity fails closed.
Unknown or `other` families cannot be compared as if they were one vendor and
are refused by this startup path. Existing generic manual reviews are preserved.
Classification is derived from the resolved families:

```text
same provider family      -> SPR
different provider family -> XPR
```

Classification alone does not prove orchestration compatibility. Different
surfaces of the same vendor are SPR, but native orchestration is eligible only
when the adapter proves exact-session control across both selected surfaces.
Otherwise broker orchestration is required, or startup is refused if no
conformant path exists; classification stays SPR.

Gemini CLI and Antigravity are not supported selectors in this first release.
They must not be encoded as `other` to bypass the existing sealed identity
schema. A later Google addition must version the identity schema and reader
compatibility first. Both would map to family `google` and classify as SPR,
while retaining distinct surface identities and independent conformance gates.
They cannot share a native driver merely because their vendor is the same.

SPR can still use the same protocol ledger, response seals, reviewer
non-mutation checks, and review-of-record flow. Its runtime path may use a
provider-native API to create a second session or model turn under the same
provider. It requires a broker only for the capability mismatch above or when
the implementation reuses broker plumbing internally.

New XPR startup must use the project-local broker. If the broker cannot start or connect,
startup returns `APR_BROKER_START_FAILED` or a more specific stable error and
does not create an ambiguous partially automated review.

## Project-local broker

The broker is included in the `ai-peer-review` package and launched from the
current project's installed package. It is addressed by canonical project
identity, not by a global port or package singleton.

Routing identity is stable across package upgrades. Define the root digest as
the lowercase SHA-256 of the UTF-8 compact JSON array, in this exact order:

```text
["ai-peer-review.broker-root/v1", physical_project_root,
 physical_git_common_directory_or_null, operating_system_user_id]
```

Paths come from the same package canonicalization routine: physical absolute
paths with symlinks resolved; on Windows use the canonical volume/path spelling
returned by the filesystem, not caller-supplied casing. The user ID is the UID
on POSIX or SID on Windows encoded as a string. Do not use a display name.
The physical project root is the worktree top level, not the Git common
directory. Linked worktrees therefore have separate brokers even when they
share Git storage. Review participants still join in the same physical worktree.

Package version, broker protocol version, and Node major version are mandatory
handshake fields in `broker.json`, not inputs to the root digest. Initially all
three must match exactly; no conditional Node-version rule is permitted.
The broker also verifies the full root tuple, peer OS user, instance ID, and
nonce through the live endpoint. Metadata files alone do not establish trust.

The derived IPC endpoint lives outside the repository so deletion of ignored
scratch files does not orphan a socket path, but it includes the project root
digest so Project A and Project B never collide:

```text
<user-cache>/ai-peer-review/brokers/<project-root-digest>/
  broker.sock
  broker.lock
  broker.json
```

The broker serves only its own canonical project root. A CLI invocation from
Project B must compute Project B's endpoint and must not connect to Project A's
broker.

Use the following per-user runtime directory (`<user-cache>` above):

| Platform | Base directory                                  |
| -------- | ----------------------------------------------- |
| macOS    | `~/Library/Caches`                              |
| Linux    | Absolute `XDG_CACHE_HOME`, otherwise `~/.cache` |
| Windows  | `%LOCALAPPDATA%`                                |

Use user-only directory access and refuse symlinked or foreign-owned endpoint
and lock resources. POSIX uses a Unix socket; Windows uses a named pipe whose
name includes the same root digest and whose ACL admits only that user.
`broker.sock` denotes the logical endpoint on Windows, not a filesystem socket.
An overlong or unsupported endpoint fails preflight; it never falls back to a
shared port. Cache deletion is not authority to launch another broker: provider
leases and review ownership must be revalidated before any delivery.

## Broker lifecycle

`peer-review start` starts or connects to the project-local broker only when the
request needs XPR. The command is idempotent for the current project root:

1. compute canonical project identity;
2. probe the project-scoped broker endpoint;
3. connect if a live compatible broker owns that identity;
4. recover or refuse stale ownership according to lease evidence;
5. start a broker from the current package when none is live;
6. register the XPR startup request; and
7. return stable review status and next action.

"Idempotent" here describes broker acquisition, not implicit deduplication of
two independent review requests for the same file. The existing review-output
reservation and sealed request identity govern review creation and retries.

An incompatible live broker remains discoverable at the same endpoint after a
package upgrade. Return `APR_BROKER_INCOMPATIBLE` with its versions and an exact
recovery instruction; do not start a second broker or kill the current one.
The old broker retains active work and drains using its pinned runtime. An
installation must preserve the old runtime and its module files until drain;
if that cannot be proved, automation stops in explicit recovery-required state.
Resume/finalize with the recorded compatible package, or use explicit manual
protocol recovery; startup never downloads, replaces, or repins a runtime to
solve a mismatch. A new broker may acquire ownership only after the prior
exclusive lock is released and pending wake operations are reconciled.

Ownership retains the #9 invariants: an exclusive lock resource plus a diagnostic
lease, no liveness inference from lease contents or PID alone, stop only by a
verified instance and nonce, and never removal of a foreign lock. Stale or
indeterminate ownership is a refusal requiring the recorded recovery procedure.
Deleting scratch or cache metadata cannot authorize ownership theft.

The broker may manage more than one active XPR for the same project. Each review
still has its own review workspace, participant registry, coordinator lease,
provider handles, wake operations, and terminal state.

The broker shuts down after 60 seconds with no runnable work, resetting the
timer whenever runnable work arrives. Accepted reviewer responses are not
terminal until author finalization completes. For review state, the broker uses
the protocol reducer's terminal result rather than inventing new protocol
states. Recovery-required with no live automatic work is a broker suspension
condition, not acceptance or abandonment of the review. Before exit, pending
recovery and unresolved operations remain durable and discoverable; the next
compatible broker must reconcile them before delivering anything. An active
nonterminal review awaiting a supported automatic handoff keeps its worker live.

Stable startup errors distinguish `APR_BROKER_START_FAILED`,
`APR_BROKER_INCOMPATIBLE`, `APR_BROKER_OWNED`, `APR_BROKER_STALE`, and
`APR_PROVIDER_RESOURCE_BUSY`. Their offline `explain` entries give one exact
recovery action. Existing identity, integrity, and outcome-unknown errors pass
through unchanged. None authorizes automatic retry of an ambiguous delivery.

## Relationship to the issue #9 implementation

Issue #9 delivered unpublished review-scoped durable wakeups: one coordinator
watches one review workspace, reserves idempotent wake operations, and invokes
validated wake adapters without consuming model turns while idle.

Release evidence checked on 2026-09-14 distinguishes local source from npm:
the public `ai-peer-review@0.2.2` tarball contains neither `src/coordinator/`
nor coordinator entries in `src/public-api.mjs` or `src/cli/parse.mjs`.
The local checkout still declares `0.2.2` but includes later #9 and #10 commits.
Thus the package is published, while this coordinator surface is not published
in that version. A local help example naming the npm version is not proof that
the registry contains the local source. Recheck the registry before release;
if the surface has since shipped, stop release for an explicit compatibility
decision instead of silently changing this design's removal policy.

This design supersedes #9 as the product design. It keeps only the #9 mechanics
that still fit the project-local broker architecture and retires the public
coordinator-first shape. The broker becomes the user-facing orchestration
runtime for XPR. Wake decision, capsule, ledger, and adapter reconciliation
become internal broker machinery rather than a separate public command family:

```text
project-local broker
  routes XPR startup and active review management for one project
  owns per-review wake workers using the #9 idempotent wake mechanics
```

The event ledger remains review authority. Broker wake workers may still be
review-scoped internally, but they should not be exposed as the primary CLI,
help, README, or public API surface.

Issue #10's phase handling remains in scope for integration: its wake consumer must
use the internal broker service boundary instead of the public coordinator
exports. Preserve ordered phases, author-only finalize/advance, per-phase
acceptance, exact recipient routing, and terminal agreement semantics. Adapt
its tests and generated handoffs in the same delivery before removing the
exports. No duplicate wake implementation or published coordinator shim is
required. This document authorizes no implementation or issue mutation itself.

## Multi-project behavior

Two projects on one laptop run independently:

```text
Project A -> broker A -> review A1, review A2
Project B -> broker B -> review B1
```

Each broker runs from its project's local `ai-peer-review` package. Different
projects may therefore use different package versions. Cross-project broker
protocol compatibility is not required because brokers do not route review work
across project roots. The passive provider-resource lock contract below is the
one shared compatibility requirement; it is independent of broker versions.

A later discovery command may list all live project brokers by scanning
user-cache identity files, but discovery is diagnostic. It is not a routing
authority and does not turn brokers into a machine-wide service.

## Provider resource leases

Broker isolation does not guarantee provider isolation. Two brokers may contend
for the same provider account, desktop application, CLI session, or external API
quota.

Provider adapters must report whether their surface supports concurrent
sessions. Headless CLI sessions with exact resume may support parallel runs.
Desktop-window or UI-session adapters are exclusive unless conformance tests
prove exact-session targeting under concurrency.

Exclusive provider resources use passive locks shared by projects of the same
OS user at `<user-cache>/ai-peer-review/provider-resources/<resource-digest>/`.
This is runtime state outside version control. It adds no machine-wide daemon,
queue, provider session manager, or cross-project review routing.

The resource key is the SHA-256 of a compact JSON array containing
`ai-peer-review.provider-resource/v1`, OS user ID, canonical provider family,
and an adapter-defined stable exclusive-resource ID. The latter identifies the
actual shared desktop surface, account/session, or other exclusive resource;
it must be identical across projects and package versions and contain no secret
or raw provider handle. It cannot be derived from a project path. Adapters that
cannot establish a trustworthy stable resource identity are unavailable for
automated use of that exclusive surface.

All broker versions supporting exclusive surfaces must honor the same lock
namespace and `ai-peer-review.provider-resource/v1` schema. Each record contains
the resource digest, schema, owner project-root digest, instance ID, nonce
digest, and heartbeat/diagnostic timestamps alongside the exclusive lock.
Unknown schemas, malformed records, foreign ownership, or indeterminate liveness
fail closed; version skew never permits ignoring a lock. Acquire the exclusive
resource before acting on a provider, and release only one's own verified lock
after operations finish or enter reconciled recovery. A timed-out heartbeat
alone never permits stealing. OS lock ownership and exact-instance checks are
required, including stale recovery after cache removal.

These locks coordinate cooperating package processes for one user, not unrelated
applications or other users. Adapters must also inspect live provider state and
refuse ambiguous or busy surfaces immediately before delivery. Concurrent-safe
headless surfaces retain distinct session identities; account quota failures
remain provider errors rather than promises made by a local lock.

## Documentation reconciliation

The September 11 runtime orchestration design remains useful for provider
capabilities, runtime/wake separation, session-managed safety, and adapter
conformance. Its `--runtime`-first agent startup examples are superseded by this
design's author/reviewer startup contract.

The issue #9 durable wake design is historical implementation input only. Its
idempotent wake mechanics may be retained where useful, but its public
coordinator command model is superseded by project-local broker orchestration
and should not be preserved for compatibility.

The README should present:

- `peer-review start <artifact>` as the primary entrypoint;
- invoking agent equals author;
- reviewer provider/model/effort selection;
- SPR versus XPR classification;
- XPR starts or connects to the project-local broker; and
- broker commands as XPR orchestration/status operations.

## Open questions

- Should `spr` and `xpr` be command aliases, help topics only, or both?

## Acceptance criteria

- Agent-facing help states that the invoking session is the author.
- Agent-facing help requires reviewer provider and model and defaults reviewer
  effort to `medium`.
- A complete `start <artifact> --artifact-kind spec --reviewer-provider claude
--reviewer-model <supported-model>` succeeds in a conformant fixture without
  `--runtime`. Golden help tests cover all retained and new flags, explicit
  generated effort, and pre-mutation rejection of missing reviewer selection.
- Startup classifies SPR versus XPR from resolved participants.
- Offline tests cover every selector mapping, unknown-family refusal,
  same-family/different-surface capability refusal, and no classification from
  the generic `other` value. Future Google selectors remain rejected until
  their versioned identity support is delivered.
- XPR starts or connects only to the current project's broker endpoint.
- New XPR startup fails without a broker, including explicit manual transport;
  existing manual reviews can resume, submit, and finish with no broker. A
  broker loss leaves exact manual recovery available without duplicate wake.
- Project A and Project B can run simultaneous brokers without endpoint
  collision or package-version negotiation.
- Root digest fixtures cover symlinks, Windows canonical paths, distinct linked
  worktrees, and stable routing across upgrades. A mismatched live broker is
  refused at the same endpoint and cannot be replaced until ownership releases.
- Two projects with different broker versions contend for one exclusive
  provider-resource lock; unknown schema, stale/foreign ownership, and cache
  deletion never authorize concurrent delivery or lock stealing.
- With a fake clock the broker exits at 60 seconds of no runnable work, resets
  the timer on new work, and preserves recovery state. Pending author
  finalization remains actionable; reviewer acceptance alone cannot end service.
- Public coordinator entries are absent from help, README, generated handoffs,
  and the package export surface before their first publication. #10 phase
  transition and wake tests pass using the internal broker service.
- Older runtime docs clearly point to this design for agent-facing startup and
  project-local broker semantics.
