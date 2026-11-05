# Provider-Neutral Runtime Orchestration Design

<!-- cspell:words preauthorized wakeups -->

## Document status

- **Date:** 2026-09-11
- **Status:** Research-updated draft for human review
- **Scope:** Design only; no runtime implementation or backlog issues are
  authorized by this document
- **Related evidence:**
  [manual cross-provider case study](../manual-cross-provider-peer-review.md),
  [runtime orchestration white paper](../whitepapers/2026-09-11-provider-neutral-runtime-orchestration-white-paper.md),
  and
  [original extraction design](2026-09-07-ai-peer-review-extraction-design.md)

## Summary

Extend `ai-peer-review` with three explicit, start-time runtime modes:

1. `headless`: the package launches and owns a provider CLI agent;
2. `session`: the package addresses an existing agent session through an
   official session API or an explicitly approved, conformance-gated
   cross-window surface; and
3. `handoff`: independently owned agents exchange sealed results through the
   review workspace and are activated by a configured wake chain.

All modes use the current event-authorized review protocol. Runtime ownership
and wake delivery become separate configuration axes. A review-scoped Node.js
coordinator observes durable deliveries, drives only documented provider
surfaces, and shuts down deterministically. Existing MCP live-wait behavior is
retained as an optional wake adapter.

The design adds a Google provider-family resolver and separate, conformance-
gated adapters for eligible Gemini CLI and Antigravity CLI installations. Local
experiments prove Antigravity headless exact resume and active-conversation
automation on the desktop app, Antigravity IDE, and VS Code extension. These UI
surfaces remain experimental until they prove exact-session selection, cold
resume, transactional submission, permission mediation, and fail-closed UI
drift. Gemini consumer desktop UI automation remains unsupported.

## Goals

- Let a user choose a runtime protocol explicitly when a review begins.
- Explain the three modes, their requirements, and their recovery behavior in
  offline CLI help that an agent can query.
- Run headless reviews without human interaction when provider authentication,
  reviewer permissions, and review policy permit it.
- Allow session and handoff reviews to run without a person while retaining the
  option for human participation.
- Remove timer-driven model wakeups from normal orchestration.
- Preserve exact provider-session continuity without publishing raw handles in
  tracked collateral.
- Treat a cross-window timeout as an unknown outcome and reconcile target state
  before any retry.
- Correlate every automated prompt, submission, response, and retry with one
  idempotent activation operation.
- Provide an automatic, preauthorized wake fallback chain that never changes
  participant identity or runtime ownership silently.
- Leave one exact recovery action when automatic activation fails.
- Guarantee that a coordinator and its owned child processes are shut down at
  the end of a review or on unrecoverable failure.
- Add provider support through capability-tested adapters, beginning with the
  current Codex, Claude, and Grok surfaces and adding eligible Gemini CLI and
  Antigravity CLI surfaces without conflating them.
- Preserve all protocol invariants, reviewer non-mutation checks, sealed
  responses, and event-derived recovery behavior.

## Non-goals

- Treating generic window focus, cached coordinates, cached accessibility
  indexes, or an unverified active conversation as exact-session authority.
- Treating any native, IDE, extension, or vendor remote-control UI as supported
  until a versioned adapter proves exact-session binding, transactional
  submission, terminal observation, permission handling, and fail-closed layout
  detection.
- Reading or editing private provider transcript/session storage to compensate
  for a missing public session locator.
- Creating a universal provider transcript format.
- Treating provider telemetry, process status, or session files as protocol
  authority.
- Silently approving tool access or bypassing provider security controls.
- Running a detached, machine-wide peer-review daemon.
- Replacing provider authentication or storing provider secrets.
- Automatically changing from an existing reviewer to a fresh reviewer when a
  wake attempt fails.
- Moving the review workspace to a database or remote service.
- Removing manual recovery or the existing MCP wait.
- Creating backlog issues or implementing the design before human ratification
  and peer review of this specification.

## Definitions

### Runtime mode

The ownership model for the agent session that performs review turns. A session
runtime may use an API or approved cross-window adapter, but neither changes the
fact that the provider/host owns the existing session.

### Wake adapter

A mechanism that announces an already-sealed delivery to the exact registered
recipient session. A wake adapter does not create protocol state or decide turn
ownership.

### Runtime driver

A component that starts or addresses a provider session, sends a bounded turn,
observes provider events, and returns normalized output.

### Provider adapter

A versioned implementation of provider-specific launch, session, identity,
permission, output, and cancellation behavior.

### Cross-window adapter

A versioned session driver for one named application surface. It locates an
exact conversation through exposed UI state, observes composer/turn/permission
states, and performs an idempotent prompt-submission transaction. Application
focus or a visible title alone is not a session locator.

### Activation operation

One attempt to deliver one governed invitation to one exact recipient session.
It has a unique ID and immutable prompt, target-session, delivery, and cursor
digests. A timeout can leave its outcome unknown; a new operation is forbidden
until the old one is reconciled.

### Coordinator

A foreground or host-owned Node.js process scoped to one review. It observes the
workspace, executes the configured runtime/wake policy, owns any child processes
it launches, and exits at the end of the review.

### Human participation

An allowed but mode-independent interaction. A person may inspect state, answer
an authorized provider permission request, manually run a recovery command, or
make a protocol Human Authority decision. Runtime selection does not imply that
a person is or is not present.

## Required invariants

1. The append-only event ledger remains the sole review-state authority.
2. Runtime configuration is sealed in the review-created event and cannot
   change after startup.
3. A fallback may change wake mechanism only. It may not change the registered
   participant, provider session, or runtime mode.
4. Every programmatic activation targets an exact opaque session handle or a
   conformance-approved UI session locator. No automatic path may select
   “latest,” rely on application focus, or use a title when an exact ID exists.
5. Provider handles and process metadata remain under ignored review scratch.
6. Wake notifications contain a review ID, recipient, and event cursor—not
   response content or secrets.
7. The recipient revalidates event authority and sealed content after every
   activation.
8. Delivery retries are idempotent and never create a second protocol turn.
9. Every activation has one operation ID. A timeout becomes
   `outcome-unknown`; it never authorizes immediate repeated injection.
10. Cross-window submission is proven by one matching conversation-log entry,
    not by a successful click, an empty composer, or a transport return value.
11. Accessibility indexes and screen coordinates are ephemeral observations,
    not persisted target identity.
12. Exactly one valid coordinator lease may exist for one review.
13. The coordinator removes only its own matching lease and terminates only its
    own exact child instances.
14. Terminal review state and unrecoverable coordinator state trigger shutdown.
15. An activation failure leaves the sealed turn recoverable and emits one exact
    next action.
16. The reviewer non-mutation boundary applies equally in all runtime modes.
17. Session/API capability must be documented and probed. A cross-window UI may
    be selected only through a conformance-approved adapter; UI automation is
    never an implicit fallback.

## Architecture

```text
CLI / package API
       |
       +-- protocol core ------------------------------+
       |   event validation, reducer, seals, recovery  |
       |                                               |
       +-- orchestration service                       |
           runtime selection, capability plan          |
                    |                                  |
             review coordinator                        |
          /             |             \                |
 runtime driver     wake policy     recovery reporter  |
       |                |                    |          |
 provider adapter  wake adapters       CLI/help        |
       |                |                               |
 headless/ACP/API   session API -> cross-window ->      |
                    CLI resume -> MCP -> user recovery  |
                        |                               |
                        +---- durable workspace --------+
```

### Protocol core

The current event store, reducer, path validation, response seals, role checks,
claims, delivery receipts, and recovery projections remain provider-neutral.
The core gains orchestration metadata validation but never launches a process.

### Orchestration service

The service resolves the sealed runtime descriptor, obtains a fresh capability
observation, selects the next preauthorized activation method, and starts the
coordinator. It returns a stable result before any long-running work begins.

### Runtime driver interface

```js
RuntimeDriver = {
  mode: 'headless' | 'session' | 'handoff',
  async preflight(context): CapabilityObservation,
  async activate(turn, signal): ActivationResult,
  async cancel(reason): CancellationResult,
  async close(): CloseResult,
}
```

`activate` receives only normalized protocol context and scratch references. It
does not receive authority to append events directly. It returns a result for
the orchestration service to validate and seal.

### Provider adapter interface

```js
ProviderAdapter = {
  provider: 'codex' | 'claude' | 'grok' | 'gemini',
  surface: '<versioned product/control surface>',
  version: '<adapter-semver>',
  async inspect(runtime): CapabilityObservation,
  buildLaunch(turn): { executable, args, cwd, env },
  parseEvent(record): ProviderEvent,
  extractIdentity(events): ProviderIdentity,
  async connect(handle, signal): SessionConnection,
  async cancel(target): CancellationResult,
  recovery(target): RecoveryInstruction,
}
```

Methods not supported by a provider are absent and reflected in capability
observation. `buildLaunch` returns an argument vector; it never returns a shell
command string. The child process is launched without a shell.

### Wake adapter interface

```js
WakeAdapter = {
  name:
    | 'session-api'
    | 'cross-window'
    | 'cli-resume'
    | 'mcp-live-wait'
    | 'user-recovery',
  async inspect(recipient): WakeObservation,
  async deliver(invitation, signal): DeliveryAttempt,
  async close(): CloseResult,
}
```

A `delivered` result means the target surface acknowledged the invitation. It
does not mean the agent read or accepted the review result. The subsequent
protocol event supplies that evidence.

### Cross-window adapter interface

```js
CrossWindowAdapter = {
  surface: '<application-and-extension-version>',
  async locate(sessionReference): UiSessionObservation,
  async observe(target): UiTurnObservation,
  async prepare(operation): PreparedUiActivation,
  async submit(prepared, signal): UiSubmissionResult,
  async reconcile(operation): UiReconciliationResult,
  recovery(operation): RecoveryInstruction,
}
```

`locate` must return a stable conversation locator at the adapter's declared
evidence strength. `prepare` proves the exact target is idle and normalizes the
composer to zero or one copy of the operation prompt. `submit` never retries
internally after an ambiguous timeout. `reconcile` re-reads fresh semantic UI
state and proves `not-submitted`, `submitted-once`, `responded`, or
`intervention-required`; it may not infer success from a control call alone.

### Recovery reporter

Every failure path produces a stable `APR_*` code, structured details safe for
display, the next permitted adapter, and one exact recovery command. The
reporter writes no event unless the protocol service authorizes the transition.

## Configuration and protocol versioning

### New configuration schema

New configuration uses `ai-peer-review.config/v2`:

```yaml
schema: ai-peer-review.config/v2
review:
  runtime:
    mode: handoff
    reviewer_provider: gemini
    reviewer_surface: auto
    session_handle: null
  wake:
    primary: cli-resume
    fallbacks:
      - mcp-live-wait
      - user-recovery
    attempts_per_adapter: 1
    activation_timeout_ms: 30000
    unknown_outcome_settle_ms: 3000
  coordinator:
    owner_loss_grace_ms: 5000
    provider_shutdown_grace_ms: 10000
    heartbeat_interval_ms: 5000
    lease_stale_after_ms: 20000
```

Project configuration may set defaults, but the CLI resolves and displays the
complete runtime descriptor before `start`. The normalized descriptor is sealed
into startup authority:

```yaml
schema: ai-peer-review.orchestration/v2
runtime_mode: handoff
reviewer_provider: gemini
provider_surface: antigravity-cli@1.2.0
session_handle_digest: null
wake_chain:
  - cli-resume
  - mcp-live-wait
  - user-recovery
policy_digest: sha256:...
adapter_requirements:
  protocol: '>=1'
  exact_resume: true
  read_only: true
  idempotent_submit: true
```

`reviewer_surface: auto` is resolved before mutation using account eligibility,
installed executable, supported version, and required capabilities. Startup
displays the choice and seals the exact product surface; it never re-resolves a
different Google product during fallback.

The raw session handle is stored separately as
`ai-peer-review.session-handle/v2` in ignored scratch. The startup event stores
only its digest and provider/session fingerprint binding.

### Backward compatibility

The package continues to read `config/v1`, `protocol/v1`, and existing reviews.
It projects existing transport modes as follows:

| Existing value                       | Compatibility projection                             |
| ------------------------------------ | ---------------------------------------------------- |
| `manual`                             | `handoff` with `user-recovery`                       |
| `resume-only`                        | `handoff` with `cli-resume`, then `user-recovery`    |
| `automatic-required` + `live-wait`   | `handoff` with `mcp-live-wait`, then `user-recovery` |
| `automatic-required` + `native-push` | `handoff` with `session-api`, then `user-recovery`   |

Compatibility projection is read-time only. It does not rewrite event logs or
claim that old reviews selected the new semantics. New reviews write v2. The CLI
prints a deprecation notice for v1 configuration with an exact `config migrate
--check` command. Migration never edits an active review.

## CLI experience

### Start commands

```text
peer-review start <artifact> --runtime headless --reviewer claude
peer-review start <artifact> --runtime session \
  --reviewer codex --reviewer-session <opaque-reference>
peer-review start <artifact> --runtime session \
  --reviewer gemini --reviewer-surface antigravity-desktop \
  --reviewer-session <opaque-reference> \
  --wake cross-window,cli-resume,user-recovery
peer-review start <artifact> --runtime handoff \
  --reviewer gemini --reviewer-surface antigravity-cli \
  --wake cli-resume,mcp-live-wait,user-recovery
```

`--runtime` is required for interactive and agent-driven starts unless project
configuration declares exactly one default. Startup output always states:

- who owns the reviewer process/session;
- whether an existing session is required;
- whether unattended progress is possible;
- required provider capabilities and authentication;
- resolved executable, version, product surface, and account eligibility;
- reviewer permission boundary;
- exact wake chain and fallback limit;
- whether the coordinator will launch;
- where private handles and diagnostics are stored; and
- the exact stop/recovery commands.

### Help and explain

```text
peer-review help runtimes
peer-review help runtime headless
peer-review help runtime session
peer-review help runtime handoff
peer-review help wake cross-window
peer-review explain runtime:handoff
peer-review explain APR_WAKE_FAILED
peer-review explain APR_COORDINATOR_STALE
```

Help topics are offline, available in prose and `--json`, and golden-tested.
Each runtime topic documents ownership, session prerequisites, human
interaction, permission behavior, wake/fallback, evidence, failure states,
security boundary, examples, and recovery. Cross-window help additionally
explains exact session locators, ephemeral UI indexes, operation IDs,
outcome-unknown settling, permission intervention, and the prohibition on blind
retry.

### Coordinator commands

```text
peer-review coordinator start <workspace>
peer-review coordinator status <workspace> [--json]
peer-review coordinator stop <workspace>
peer-review coordinator recover <workspace>
peer-review coordinator run <workspace> # foreground host integration
```

Normal `start` launches `coordinator run` as an owned foreground/host child when
automation is required. `coordinator start` is explicit and refuses to detach.
`stop` validates review, instance UUID, and lease before signalling. It does not
accept a PID argument.

`status --next` remains the universal recovery entry point.

## Runtime behavior

### Headless runtime

1. Preflight validates provider product/account eligibility, executable,
   version, authentication state, canonical repository root, structured output,
   exact resume, and the effective read-only permission policy.
2. Coordinator acquires the review lease.
3. Driver writes the complete prompt to a protected scratch file when the
   provider supports prompt files; otherwise it supplies the prompt through
   stdin or an argument without using a shell.
4. Coordinator launches one child process with bounded stdout/stderr capture and
   an abort controller.
5. Adapter parses pre-protocol stderr/startup failures and then structured
   events, records the exact session handle privately, and emits non-
   authoritative progress.
6. On success, the protocol service requires both a successful semantic result
   and an acceptable exit/close outcome before it seals the response bytes.
7. On a recoverable interruption, the next turn uses the exact session ID.
8. On provider or permission failure, the review enters intervention-required;
   it does not relaunch a fresh reviewer automatically.

The child inherits only an allowlisted environment plus provider-required
credential references. Secrets are redacted from diagnostics. Output limits
prevent an unbounded provider stream from exhausting memory or disk.
An exit code of zero is never sufficient when the provider emits semantic
status or can soft-deny a permission request.

### Session runtime

1. User or host supplies an opaque exact-session reference or an approved UI
   session locator.
2. Adapter establishes a documented API or approved cross-window connection
   and proves the session is addressable and idle.
3. The session identity is normalized and compared with the registered reviewer
   fingerprint.
4. Driver creates an immutable activation operation naming the review, delivery,
   cursor, governed result paths, target-session digest, and prompt digest.
5. API drivers send the bounded prompt once. Cross-window drivers prepare and
   re-read the composer until exactly one normalized prompt is visible, then
   submit it once.
6. A transport timeout becomes `outcome-unknown`. The driver stops retrying,
   allows a bounded settling period, and reconciles the composer and
   conversation log from fresh UI state.
7. Submission is proven only when the conversation log contains one matching
   activation operation. A cleared composer or successful UI action is not
   proof.
8. Adapter streams turn lifecycle and handles permission requests according to
   the sealed policy.
9. Output is correlated with the activation operation and returned to the
   protocol service for validation and sealing.
10. Loss of the control connection may use an authorized exact-resume fallback
    only when it addresses the same provider session.

A native app, IDE, extension, or vendor remote-control UI may implement this
runtime only through a separately named experimental adapter. It must bind an
immutable session identifier or approved UI locator before sending input,
reacquire semantic UI state after every transition, detect layout/version drift
before every turn, observe terminal state, and stop on ambiguous focus,
authentication, permission, composer, or submission state. Cached accessibility
indexes and coordinates are never reused as identity. Generic window automation
without this contract is not a session driver.

Concurrent external interaction is allowed between turns. If a person starts a
turn while the coordinator is activating the session, the adapter returns
`APR_SESSION_BUSY`; it never steers or interrupts the person's turn unless that
behavior was explicitly selected and the host provides exact active-turn
identity.

### Handoff runtime

1. Current participant submits and seals its result.
2. Protocol service appends `delivery-written` and creates the matching receipt.
3. Coordinator's filesystem notification triggers a full authority re-read.
4. Wake policy tries each preauthorized adapter once, in order.
5. Acknowledged delivery records a diagnostic attempt; protocol state advances
   only when the recipient claims/consumes the delivery.
6. Duplicate filesystem events or wake acknowledgments are deduplicated by
   review ID, delivery ID, sequence, recipient fingerprint, and adapter attempt.
7. If the chain exhausts, coordinator writes the recovery note, marks
   intervention-required through the protocol service, shuts down, and exits.

The filesystem watcher implements read-before-subscribe and post-subscribe
re-read. Every notification is a hint. The event ledger and receipt bytes are
revalidated even if the watcher supplies a filename.

## Wake and fallback policy

The supported ordered adapters are:

1. `session-api`: inject through an official host/provider session API;
2. `cross-window`: automate an explicitly selected, conformance-approved native,
   IDE, extension, or vendor remote-control surface;
3. `cli-resume`: invoke the provider's exact resume form with a bounded prompt;
4. `mcp-live-wait`: satisfy the current pending `wait_for_handoff` call; and
5. `user-recovery`: print and persist the exact manual continuation command.

Rules:

- `user-recovery` is always the final logical path, even if omitted from config.
- Automatic adapters must be explicitly listed or implied by the selected
  runtime's documented default and confirmed in startup output.
- Each adapter has a bounded attempt count and timeout.
- A timeout after a potentially side-effecting API or UI action is
  `outcome-unknown`, not transient failure. Reconciliation must prove
  `not-submitted` before retry.
- A proven pre-submission transient failure may use capped exponential backoff
  within the same adapter and does not wake the model between attempts.
- Permanent capability, identity, integrity, or permission errors skip retry.
- No adapter can target a session whose handle digest/fingerprint differs from
  startup authority.
- Successful API/CLI invocation without subsequent protocol consumption before
  the activation deadline becomes `APR_WAKE_UNCONFIRMED`, not success.
- A cross-window adapter may fall back only before submission or after proving
  the recorded operation was not submitted. An unknown or submitted outcome
  blocks another wake adapter from injecting the same turn again.
- Fallback attempts are append-only scratch diagnostics. A final
  intervention-required transition is authoritative.

## Coordinator lifecycle and no-orphan guarantee

### Lease

The coordinator acquires an exclusive file lock under the review workspace and
atomically writes:

```yaml
schema: ai-peer-review.coordinator-lease/v1
review_id: <id>
instance_id: <random UUID>
owner:
  kind: cli | app-host
  pid: <diagnostic PID>
  nonce: <random nonce>
process:
  pid: <diagnostic PID>
  started_at: <RFC-3339>
  executable_digest: <digest>
heartbeat:
  sequence: <integer>
  observed_at: <RFC-3339>
runtime_mode: <mode>
policy_digest: <sha256>
state: starting | active | stopping
```

The process also holds the open lock/IPC resource. File contents alone never
prove liveness. Heartbeat replacement uses atomic rename and a monotonic
sequence.

### Shutdown triggers

- protocol terminal state;
- final delivery/fallback exhaustion;
- explicit identity-matched stop;
- owner IPC loss after its grace period;
- lock/lease replacement or workspace identity change;
- filesystem watcher error;
- provider protocol/parser integrity error;
- incompatible protocol or adapter version;
- `SIGINT`, `SIGTERM`, and POSIX `SIGHUP`; or
- internal uncaught/fatal error after diagnostic preservation.

### Shutdown sequence

1. Atomically set local state to `stopping`; reject new work.
2. Abort filesystem watcher, timers, session requests, and pending backoff.
3. Ask the exact provider turn/session to cancel when supported.
4. For stdin-driven providers, close stdin, continue draining stdout/stderr,
   and wait the configured bound for the child `close` event.
5. If graceful close fails, escalate only against the still-matching captured
   POSIX process group or Windows job object. Signalling a launcher PID alone is
   not sufficient because package-manager and provider wrappers may have
   descendants.
6. Verify the owned process tree/job is gone without treating an OS exit code as
   semantic provider success.
7. Write final scratch status with reason, last authoritative cursor, active
   delivery, child result, and recovery command.
8. Release the lock and remove the lease only when `instance_id` and nonce match.
9. Exit with zero for normal terminal review, a stable nonzero coordinator code
   for recovery-required outcomes.

Shutdown is idempotent. A second trigger joins the in-progress shutdown promise.
No signal handler calls `process.exit()` before cleanup completes; a hard upper
bound remains to prevent shutdown from hanging forever.

### Crash recovery

`start`, `status`, `doctor`, and `coordinator recover` inspect stale leases.
Recovery:

1. validates workspace containment and physical directory identity;
2. checks lock/IPC absence and lease age;
3. treats PID existence as diagnostic only;
4. reconciles sealed deliveries and provider session scratch;
5. refuses to kill an ambiguous process;
6. archives the stale diagnostic under the review scratch directory;
7. removes a lease only after proving no matching live instance owns it; and
8. emits the exact safe next action.

## Provider requirements

### Codex

- Headless: `codex exec` with JSONL and exact `codex exec resume <id>`.
- Session: Codex App Server `thread/resume` and `turn/start`, or the Codex SDK
  resume/run contract.
- Handoff: exact CLI resume, current MCP wait, or host-injected App Server wake.
- Use configured read-only sandbox and approval policy for reviewer turns.

### Claude

- Headless: `claude -p` with JSON/stream JSON, exact `--resume <id>`, bounded
  turns, read-only tools, and unattended permission behavior.
- Session: supported Agent SDK/host connection only; do not assume an arbitrary
  desktop window can be injected.
- Handoff: exact CLI resume or MCP live wait.
- Never use `--continue` for automatic routing.

### Grok

- Headless: `grok -p` with JSON/streaming JSON and exact `--resume <id>`.
- Session: ACP/agent stdio only after versioned conformance testing.
- Handoff: exact resume or MCP live wait.
- Never use `--continue` for automatic routing.
- Map the exact resume syntax by tested adapter version; do not preserve a
  static command form after current provider help or documentation changes.

### Google agent surfaces

The provider identity is `gemini`, but the adapter pins one independently
versioned surface. Capabilities, authentication, session IDs, and lifecycle
behavior are never inferred across surfaces.

#### Gemini CLI (`gemini-cli`)

- Eligibility: accept only enterprise, Google Cloud, or paid API-key
  configurations. Detect the consumer `UNSUPPORTED_CLIENT` response as a
  permanent product-eligibility failure and recommend `antigravity-cli`.
- Version: the locally observed Homebrew `0.46.0` and npm `0.59.0` surfaces are
  evidence inputs, not an approved support range. Story 9 pins the range.
- Headless: use `gemini -p` with JSON/stream JSON only after readiness succeeds.
  Parse plain stderr/startup failures that occur before a JSON envelope.
- Session: ACP requires `initialize`, supported authentication, and a successful
  non-model readiness/session-open probe. Advertised `loadSession` capability
  alone is insufficient.
- Resume: invoke from the canonical project root with the full UUID. Never use
  a latest-session selector. Treat project-scoped session listing as diagnostic
  and parse semantic errors even when the command exits zero.
- Trust: compare requested and effective approval modes. Fail if an untrusted
  workspace weakens `plan`/read-only to `default`; do not automatically use
  `--skip-trust` for an arbitrary repository.
- Shutdown: close ACP stdin, drain streams, await `close`, then escalate against
  the exact captured process group/job object. A Homebrew wrapper PID is not the
  whole owned process tree.

#### Antigravity CLI (`antigravity-cli`)

- Availability: use executable `agy`. Version 1.2.1 is installed on this host;
  sandbox-controlled JSON one-shot and exact-ID cross-process resume both completed
  successful model turns during the September 11 experiment.
- Headless one-shot: use `--print=<prompt> --output-format stream-json` and
  require a terminal `result.status` in addition to the exit code.
- Arguments: use a non-shell argument vector and the tested attached-value form
  for short print syntax. Version 1.2.1 treated bare `-p` followed by another
  option as that option being the prompt. Conformance fixtures must verify the
  exact vector used by each supported version.
- Headless multi-turn: use streaming input and output (`--input-format
stream-json` and `--output-format stream-json`), hold stdin open, and submit
  the next prompt only after one terminal `result` for the current turn.
- Resume: use `--conversation <exact-id>` across processes. Never use
  `--continue` automatically because it selects the latest conversation.
- Permissions: validate `init.permission_mode`; a soft-denied tool can leave
  exit code zero and must become permission intervention when it violates the
  reviewer contract. Version 1.2.1 also warned that `--mode plan` has no effect
  when slash-command expansion is disabled. Never use
  `--dangerously-skip-permissions` for review, and fail preflight when requested
  and effective controls differ.
- Shutdown: close stdin and drain the final `result`/process close within the
  configured bound before process-group/job-object escalation.
- Ownership: the locally exercised one-shot processes exited normally. Existing
  `agy --hub` processes owned by Antigravity IDE or the VS Code extension are
  outside the review process tree and must never be stopped as orphan cleanup.

#### Desktop and Remote Control

- Gemini consumer desktop remains `interactive-only`; no documented inbound
  session-control surface was found.
- Antigravity desktop 2.13.0, Antigravity IDE 2.5.5, and VS Code 1.137.0 with
  Antigravity extension 1.3.0 all passed local active-conversation prompt,
  response-capture, read-only workspace, and blind-continuity probes.
- The IDE required two one-time approvals for read-only terminal commands while
  desktop and VS Code required none. Permission mediation is therefore a
  surface capability, not a provider-wide default.
- VS Code produced a delayed-success race: a clipboard operation timed out and
  later altered the composer while recovery was underway. Its adapter must use
  activation IDs, outcome-unknown settling, fresh state reads, draft
  normalization, and conversation-log confirmation before retry or fallback.
- The desktop accessibility state exposed a conversation-bearing URL. The IDE
  and VS Code probes did not establish a durable externally addressable
  conversation ID. None of the three surfaces is approved for exact-session
  automation until multi-conversation and cold-resume tests pass.
- Antigravity Remote Control is a separately gated experimental session adapter.
  It may automate only Google's official browser dashboard, must prove exact
  conversation binding and terminal observation, and must fail closed on UI
  drift. It is never an implicit fallback.
- The optional `agy remote-control` daemon is a persistent OS service. The
  review coordinator must not start it implicitly, stop a user-managed service,
  or include it in the review-owned no-orphan process tree.

## Permission requests

Provider events normalize to:

```yaml
schema: ai-peer-review.permission-request/v1
provider: <provider>
session_fingerprint: <digest>
turn_id: <provider turn reference>
capability: filesystem-write | shell | network | external-system | secret | other
target: <redacted normalized target>
provider_request_digest: <digest>
```

The coordinator may answer only when sealed startup policy contains an exact
matching allow or deny rule. An unmatched request records
`APR_PERMISSION_INTERVENTION_REQUIRED`, preserves the provider session, writes
the recovery action, and stops automatic progress. Headless mode does not wait
indefinitely for a person who may be absent.

Cross-window adapters normalize visible application permission dialogs into the
same record. They may choose a one-time allow/deny action only when the request,
capability, target, and action exactly match sealed policy. They must not choose
“always allow,” change application trust settings, or infer approval from a
previous surface. A dialog that cannot be parsed unambiguously stops automatic
progress without dismissing it.

Reviewers default to deny filesystem write, external mutation, secret access,
and unbounded shell. A provider without enforceable read-only capability fails
the corresponding unattended preflight.

## State and diagnostics

New scratch records are versioned and canonical JSON despite YAML examples in
this design:

```text
.scratch/peer-review/<review-id>/
├── coordinator/
│   ├── lease.json
│   ├── final-status.json
│   └── stale/<instance-id>.json
├── sessions/
│   └── <participant>.json
├── activation/
│   └── <operation-id>.json
└── providers/
    └── <provider>/<turn-id>.jsonl
```

Provider streams are size-limited, redacted, ignored, and diagnostic. The
sealed tracked response and protocol event digest remain authoritative. A user
can opt out of raw provider diagnostics without weakening the review.

Each activation record contains the delivery ID, recipient fingerprint, event
cursor, target-session digest, prompt digest, adapter/surface version, phase,
attempt timestamps, last observed composer digest, matching conversation-log
count, response digest when present, and recovery instruction. It never stores
raw session handles or accessibility indexes.

## Stable errors

| Code                                   | Meaning                                               | Default recovery                                               |
| -------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| `APR_RUNTIME_REQUIRED`                 | Runtime was not selected                              | Re-run `start --runtime <mode>`                                |
| `APR_RUNTIME_UNAVAILABLE`              | Required provider capability failed preflight         | Run `doctor --runtime <mode> --provider <name>`                |
| `APR_SESSION_HANDLE_INVALID`           | Exact handle is missing, mismatched, or stale         | Re-register through explicit participant recovery              |
| `APR_SESSION_BUSY`                     | Another turn owns the session                         | Wait for or explicitly resolve the active turn                 |
| `APR_WAKE_FAILED`                      | Authorized wake chain exhausted                       | Run `status <workspace> --next`                                |
| `APR_WAKE_UNCONFIRMED`                 | Invocation succeeded but delivery was not consumed    | Inspect exact session, then run the printed resume command     |
| `APR_ACTIVATION_OUTCOME_UNKNOWN`       | A send may still complete after the control timeout   | Reconcile the printed operation; do not retry                  |
| `APR_UI_SESSION_AMBIGUOUS`             | UI adapter cannot prove one exact conversation        | Select/register the exact session or use another runtime       |
| `APR_UI_DRAFT_CONFLICT`                | Composer does not contain zero or one expected prompt | Inspect the draft and run the printed normalization recovery   |
| `APR_UI_PERMISSION_AMBIGUOUS`          | Permission dialog cannot be matched to sealed policy  | Resolve it in the owning app, then resume the exact operation  |
| `APR_COORDINATOR_ACTIVE`               | A valid instance already owns the review              | Run `coordinator status <workspace>`                           |
| `APR_COORDINATOR_STALE`                | Lease exists without proven owner liveness            | Run `coordinator recover <workspace>`                          |
| `APR_COORDINATOR_OWNER_LOST`           | Host/CLI ownership channel ended                      | Run `status <workspace> --next`                                |
| `APR_COORDINATOR_SHUTDOWN_FAILED`      | Exact child did not close cleanly                     | Inspect final status; do not kill by recorded PID alone        |
| `APR_PERMISSION_INTERVENTION_REQUIRED` | Provider requested unmatched authority                | Inspect request and resume only with explicit policy/authority |
| `APR_PROVIDER_PROTOCOL_INVALID`        | Structured provider output violated adapter contract  | Preserve diagnostic and run provider doctor                    |
| `APR_PROVIDER_ACCOUNT_UNSUPPORTED`     | Product does not accept the configured account tier   | Select the printed eligible surface or configure eligible auth |
| `APR_PROVIDER_POLICY_MISMATCH`         | Effective trust/permission mode is weaker than sealed | Correct trust/policy, then run the printed exact resume action |
| `APR_CROSS_WINDOW_STATE_AMBIGUOUS`     | UI adapter cannot prove target, submission, or state  | Stop automation and use the printed exact resume/handoff path  |
| `APR_GEMINI_DESKTOP_UNSUPPORTED`       | Gemini desktop has no supported inbound control       | Use Antigravity CLI, eligible Gemini CLI, or human handoff     |

Each `explain` topic contains safe structured details and exactly one primary
recovery command.

## Testing strategy

### Unit tests

- configuration v1 projection and v2 validation;
- runtime/wake separation and forbidden fallback transitions;
- provider event parsers with captured, redacted fixtures;
- exact-session identity binding;
- activation operation identity, phase transitions, and prompt/target digests;
- adapter timeout/retry classification, including outcome-unknown reconciliation;
- composer normalization and duplicate-submission prevention;
- coordinator lease acquisition, heartbeat, and identity match;
- idempotent shutdown under every trigger pair;
- stale lease reconciliation and PID-reuse simulation;
- permission normalization and policy decisions;
- help JSON/prose schemas and all stable errors.

### Integration tests

- `fs.watch` race: delivery before subscribe, between initial read and
  subscribe, after subscribe, duplicate event, dropped filename, directory
  replacement, and watcher error;
- headless child success, malformed JSONL, partial stdout, stderr flood,
  pre-JSON startup/authentication failure, exit-zero semantic failure, timeout,
  cancellation, and child/wrapper descendants ignoring graceful termination;
- session API disconnect, busy turn, permission request, wrong handle, and exact
  resume fallback;
- cross-window stale element indexes, layout drift, ambiguous focus, empty or
  conflicting composers, delayed clipboard success after timeout, duplicate
  draft insertion, click-without-frame, keyboard submission fallback, response
  correlation, and concurrent human input;
- cross-window permission absent, one-time allow, persistent allow offered,
  unmatched request, and unparsable dialog;
- handoff session API -> approved cross-window -> CLI resume -> MCP -> user
  recovery chain;
- terminal review and failure paths leave no coordinator or owned child alive;
- stdin EOF drains the final result and closes nested launchers before bounded
  process-group/job-object escalation;
- stale lease recovery never signals an unrelated reused PID;
- POSIX and Windows shutdown behavior;
- spaces and Unicode in repository paths without shell interpretation.

### Provider conformance tests

Tests run against supported installed-version ranges behind explicit environment
gates. Each adapter must prove:

- launch/connect and identity extraction;
- exact resume;
- structured completion and error parsing;
- cancellation;
- reviewer read-only enforcement;
- permission-request behavior;
- no secret leakage in diagnostics; and
- upgrade failure is fail-closed.

Google-surface conformance additionally tests:

- surface resolution and permanent consumer-account rejection by Gemini CLI;
- project-root Gemini session scoping, full UUID resume, ACP readiness after
  initialization, folder trust, requested/effective policy, and exit-zero
  diagnostics;
- Antigravity exact conversation resume, one-result-per-turn streaming, stdin
  EOF shutdown, print-argument ordering, requested/effective permission
  mismatch, host-owned hub exclusion, permission soft-denial, and terminal
  semantic status;
- Antigravity desktop, IDE, and VS Code extension exact-session selection among
  multiple conversations, cold application restart, active-session continuity,
  busy/permission states, delayed-action recovery, layout drift, auth refresh,
  and fail-closed fallback; and
- Remote Control exact-session selection, busy/permission states, layout drift,
  reconnect behavior, and fail-closed recovery before any cross-window surface
  can leave experimental status.

### Packaging and smoke tests

- zero-install and installed CLI behavior;
- Node 22 minimum runtime;
- MCP remains optional and setup remains valid;
- coordinator exits when parent process/IPC closes;
- package uninstall during no active review leaves no daemon;
- review cleanup leaves host-owned Antigravity IDE/extension hub processes
  untouched;
- all example/help commands parse;
- release package contains no test credentials, provider transcripts, or local
  session handles.

## Observability

`coordinator status --json` returns:

- authoritative review state and cursor;
- runtime mode and wake chain;
- provider product surface, executable/version, account eligibility, and
  requested versus effective permission mode;
- coordinator instance state and lease age;
- current adapter, activation operation, phase, attempt, settling bound, and
  deadline;
- cross-window target-locator evidence strength, composer digest, matching
  conversation-log count, and permission state;
- provider child/API state at the adapter's stated evidence strength;
- last delivery acknowledgment and consumption evidence;
- shutdown status; and
- exact next action.

It must label inference. “Process exists” is not “agent is reasoning,” and “API
acknowledged” is not “delivery consumed.” Provider token, time, and cost data are
optional diagnostics and never used to decide agreement.

## Reconciled transport and identity findings

A Claude Code investigation performed against the shipped `0.1.0` CLI found two
gaps that remain relevant to this design. The investigation belongs to the
[original Claude Code session](https://claude.ai/code/session_01Ugy1ph5Fq611yMbe2RdqzR)
and is preserved by commits
[`9c07577`](https://github.com/kburson/ai-peer-review/commit/9c07577ba01c4326a7fe2eb25c764609e35561f0),
[`2594677`](https://github.com/kburson/ai-peer-review/commit/2594677d128043c90c60fbe6f05ab6e150f23904),
and
[`01183ad`](https://github.com/kburson/ai-peer-review/commit/01183ada4ec32c36743921363c627430630c36d8).

The original branch document is not normative. Its statements that MCP waiting
and resident automatic handoff had not landed were superseded by
kburson/ai-task-manager#1547 and #1548. The following two observations are
carried forward against the current code and architecture instead.

### Executable identity recovery

The v1 generic adapter accepts caller-injected declared identity, but the CLI has
no declared-identity option. `APR_IDENTITY_REQUIRED` therefore names a declared
fallback that a CLI user cannot execute. Compatibility work must make that
recovery truthful: either expose a deliberately restricted CLI declaration path
or direct the user to a supported, conformance-approved provider adapter.

Any declaration path remains `identity_source: declared`, exposes only `manual`
and `staleness-only`, keeps raw session handles in scratch, and cannot claim
runtime, wake, or provider-conformance capabilities. Arbitrary identity JSON
must never become a shortcut around provider validation.

### Evidence for resume acknowledgment

The v1 resume adapter reports `delivered` when an official resume command exits
zero, after which the CLI appends `delivery-acknowledged`. A no-op command stub
demonstrated that process success alone does not prove that the exact target
surface acknowledged the invitation or that the recipient consumed the sealed
delivery.

The v2 wake model must not inherit that inference. Exit zero without stronger
adapter evidence is a wake attempt with an unconfirmed outcome. It leaves the
durable delivery pending, records bounded diagnostics, and produces
`APR_WAKE_UNCONFIRMED` plus exact recovery. `delivery-acknowledged` requires
authenticated or otherwise conformance-approved adapter evidence;
claim/consumption remains a separate later fact.

## Delivery backlog

The following issue-ready stories are ordered by dependency. Issue IDs are not
assigned in this design.

### Story 1: Runtime schema and compatibility projection

Add config/protocol orchestration v2, runtime/wake separation, immutable startup
descriptor, raw-handle digest binding, and v1 read-time projection. Include
migration `--check` and golden help updates.

**Acceptance:** existing v1 reviews remain readable/resumable; new reviews seal
one mode and ordered wake chain; runtime ownership cannot change through
fallback or recovery. Every identity recovery printed by the CLI is executable
from the CLI or directs the user to a supported adapter, and declared identity
cannot acquire runtime or automatic-wake capabilities.

### Story 2: Coordinator lifecycle foundation

Build the review-scoped foreground coordinator, exclusive lease, heartbeat,
owner connection, status, stop, and recover commands without provider launch.

**Acceptance:** exactly one instance owns a review; every terminal/error/signal
path is idempotently shut down; stale PID data can never kill an unrelated
process; POSIX and Windows lifecycle tests pass.

### Story 3: Durable delivery source and wake policy engine

Extract/reuse the current race-safe filesystem delivery source. Add ordered,
bounded adapter attempts, consumption confirmation, scratch diagnostics, and
stable recovery errors.

**Acceptance:** no timer wakes the model; missed/duplicate watcher events do not
lose or duplicate a turn; exhausted fallback leaves a sealed delivery and one
exact manual action. A no-op or exit-zero-only wake cannot create
`delivery-acknowledged`; acknowledgment and later consumption expose distinct,
reviewable evidence.

### Story 4: Cooperative handoff runtime

Deliver `handoff` using exact CLI resume, existing MCP live wait, and user
recovery. Add start/help/doctor behavior and end-to-end two-session fixtures.

**Acceptance:** a complete review can advance unattended where exact resume is
available, or recover manually without changing the reviewer; the coordinator
exits at terminal agreement. CLI resume sends the bounded invitation to the
exact registered session, and an exit-zero result without target evidence
returns `APR_WAKE_UNCONFIRMED` while preserving `delivery-pending`.

### Story 5: Generic headless driver

Implement safe child process ownership, non-shell arguments, environment
allowlist, bounded output, event normalization, cancellation, exact session
scratch, and permission intervention.

**Acceptance:** provider fixture adapters complete/recover multi-turn reviews;
all abnormal child exits drain and close; no launched child survives
coordinator shutdown.

### Story 6: Codex, Claude, and Grok headless adapters

Implement and conformance-test documented CLI launch, structured output, exact
resume, identity, read-only policy, and recovery for the three current provider
identities.

**Acceptance:** each provider passes the shared conformance suite for a declared
version range; an unsupported version fails before a review turn is launched.

### Story 7: Session-managed runtime and Codex App Server adapter

Implement the session driver, exact-handle registration, busy-turn behavior,
stream observation, permission callbacks, disconnect recovery, and the first
official Codex App Server adapter.

**Acceptance:** an existing Codex thread in another host window can receive and
complete a review turn without UI automation; wrong/busy sessions fail closed;
fallback targets only the same session.

### Story 8: Transactional cross-window adapter foundation

Implement the cross-window interface, activation operation state machine,
semantic state observation, exact UI locator contract, composer normalization,
outcome-unknown settling, conversation-log submission proof, response
correlation, permission normalization, and recovery reporting. Build a fake UI
surface that can delay a successful action beyond its caller's timeout.

**Acceptance:** delayed success, dropped acknowledgments, duplicate draft
insertion, stale element indexes, click-without-frame, concurrent human input,
and ambiguous permission dialogs never create a duplicate governed turn. A
retry occurs only after `not-submitted` is proven; every other ambiguous state
ends with one exact recovery action.

### Story 9: Google agent-surface safety and conformance spike

Turn both September 11 experiment sets into a repeatable harness. Pin candidate
version ranges and validate eligible Gemini CLI authentication, headless/ACP
model turns, full UUID resume, read-only behavior, trust, cancellation, semantic
errors, and process-tree shutdown on macOS and Windows. Expand the proven `agy`
1.2.1 one-shot/exact-resume baseline to continuous streaming, argument-vector
fixtures, permissions, errors, cancellation, and EOF shutdown. Evaluate
Antigravity desktop, IDE, VS Code extension, and Remote Control separately for
exact-session selection, multiple conversations, cold restart, permission
states, delayed-action recovery, authentication refresh, and layout drift
without reading private app state.

**Acceptance:** commit redacted fixtures and a per-surface capability matrix.
Every untested or failed capability is disabled. The report distinguishes local
observation, official documentation, successful model-turn proof, active-window
continuity, and exact-session proof; it gives a go/no-go decision for each
runtime/control surface.

### Story 10: Approved Google provider-family adapters

Implement the surface resolver and only the modes approved by Story 9:
`gemini-cli` for eligible enterprise/API accounts, `antigravity-cli` for its
approved headless/resume paths, and each cross-window surface independently only
if its exact-session adapter passes the session contract. Include precise
install/auth/help and surface-specific recovery guidance.

**Acceptance:** approved Google surfaces pass the shared provider suite;
consumer Gemini CLI receives `APR_PROVIDER_ACCOUNT_UNSUPPORTED` with an
Antigravity recovery path; Gemini desktop-only systems receive
`APR_GEMINI_DESKTOP_UNSUPPORTED`; no private app-state automation exists;
review cleanup leaves host-owned `agy --hub` processes untouched; and no
review-owned process survives shutdown.

### Story 11: Migration, documentation, and release hardening

Update setup, full help, security model, architecture docs, examples, package
smoke tests, and deprecation messaging. Validate the complete fallback and
no-orphan matrix on supported platforms.

**Acceptance:** all old examples are either valid or carry exact migration
guidance; MCP continues to work as an optional adapter; release verification
proves no coordinator remains after all terminal scenarios.

## Acceptance criteria for the complete capability

- User can start any new review with exactly one of `headless`, `session`, or
  `handoff`, and CLI help explains the consequences before mutation.
- Headless review can complete author/reviewer turns without human input when
  provider policy permits and stops cleanly on an unmatched permission request.
- Session review can address an exact existing supported session through an
  official API or an explicitly selected, conformance-approved cross-window
  adapter without relying on generic window focus or cached UI coordinates.
- Handoff review can use a Node filesystem coordinator with no model polling and
  preserve the MCP wait as an optional fallback.
- Every automatic fallback is visible, bounded, preauthorized, and identity
  preserving.
- Every cross-window activation has one operation ID. A timeout is reconciled as
  an unknown outcome, and no retry or fallback can duplicate a submission.
- Every failed activation leaves the ledger and sealed response valid and
  provides one exact recovery command.
- Review completion, abandonment, unrecoverable transport failure, owner loss,
  signal, watcher failure, and protocol failure all stop the coordinator and its
  exact owned children.
- Stale coordinator recovery does not kill by PID alone.
- Codex, Claude, Grok, and each approved Google product surface pass a common
  provider conformance suite.
- Gemini desktop is reported accurately as interactive-only. Antigravity
  desktop, IDE, VS Code extension, and Remote Control remain independently
  experimental unless each passes the same exact-session adapter contract.
- Existing v1 reviews and MCP live-wait installations remain usable.

## Decisions captured for peer review

- The three runtime modes are explicit and immutable at review start.
- Runtime ownership and wake mechanism are separate concepts.
- The external Node.js coordinator is the default handoff orchestrator.
- MCP live wait is retained as an optional adapter, not removed.
- Fallback is automatic only inside a start-time authorized chain and may not
  switch reviewer or ownership mode.
- Manual exact-session recovery is always available.
- Cross-window automation is a supported architecture category but every
  application surface is disabled until its versioned adapter proves exact
  identity, transactional submission, permissions, and fail-closed recovery.
- The coordinator is review-scoped and non-detached with deterministic,
  identity-matched cleanup.
- Google delivery resolves and pins eligible Gemini CLI or Antigravity CLI;
  their authentication, sessions, and lifecycle semantics are not conflated.
- Gemini desktop is not automated. Antigravity desktop, IDE, VS Code extension,
  and Remote Control may be evaluated only as separately named, explicit,
  fail-closed adapters.
- This design is ready for human review, then independent peer review. It does
  not authorize implementation.
