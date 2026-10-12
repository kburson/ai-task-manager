# Provider-Neutral Runtime Orchestration for Governed AI Peer Review

<!-- cspell:words decorrelate headlessly preauthorized wakeups -->

## Abstract

AI agents can already perform substantive peer review across provider boundaries.
The difficult product problem is not generating criticism. It is preserving role
separation, routing the next turn to the correct session, recovering from partial
failure, and leaving evidence that a person can audit later.

This paper proposes three first-class runtime modes for `ai-peer-review`:
headless-managed, session-managed, and cooperative handoff. The modes share one
provider-neutral review protocol but differ in who owns the reviewer process and
how the reviewer is activated. A lightweight, review-scoped Node.js coordinator
observes durable filesystem events and invokes documented provider control
surfaces or an explicitly selected, conformance-gated cross-window adapter. The
existing MCP wait remains available as a compatibility adapter, not the center
of the architecture.

The result is a design that can run unattended when the selected provider and
permission policy permit it, can incorporate a person without requiring one,
and fails into an explicit recovery state instead of losing a review or leaving
an orphaned process.

## Executive summary

The recommended product direction is:

1. Keep the append-only review workspace as the authority for participants,
   turns, artifacts, deliveries, and decisions.
2. Ask the user to select and pin one runtime mode when the review starts.
3. Treat activation as a separate, ordered wake policy. A runtime may use a
   session API, a conformance-gated cross-window adapter, targeted CLI resume,
   the existing MCP live wait, or a documented user recovery command.
4. Run a small coordinator only for the lifetime of one review. Bind it to an
   exclusive instance lease, its child processes, and its owning host. Shut it
   down deterministically at every terminal or unrecoverable boundary.
5. Support provider differences through capability-negotiated adapters rather
   than provider branches in the protocol.
6. Treat Google's agent products as a provider family, not one interchangeable
   executable. Use Gemini CLI only for eligible enterprise, Google Cloud, or
   paid API-key accounts; prefer Antigravity CLI for consumer accounts; and gate
   desktop cross-window automation on a tested control surface.[^17]

The key distinction is simple:

> Runtime mode answers “who owns the reviewer session?” Wake policy answers
> “how is the next durable handoff delivered to it?”

Conflating those questions produces brittle configuration and unsafe fallback.
Separating them permits new providers and host applications without changing the
review protocol.

## The problem exposed by manual orchestration

The repository's manual cross-provider case study proves that Codex can author a
specification, launch Claude Code headlessly, preserve Claude's provider session
identifier, investigate findings, resume the same reviewer, and obtain terminal
agreement.[^3] It also shows the gap between a successful expert-operated run
and a reusable product:

- the orchestrator had to distinguish an operating-system process handle from
  the provider's durable session identity;
- a long-running turn exposed too little state to diagnose confidently;
- reviewer output was copied into the governed workspace by the author;
- read-only behavior depended partly on prompt and launch configuration;
- session activation and recovery were provider-specific; and
- correct cleanup depended on the orchestrator remembering every step.

The current package already solves many governance concerns. It uses an
append-only event ledger, sealed responses, participant fingerprints,
artifact/commit binding, role-aware state transitions, stable `APR_*` errors,
and explicit recovery. Its `wait_for_handoff` MCP tool uses filesystem events so
an unchanged wait occurs outside model execution. The live-wait implementation
checks durable authority before and after subscription, which closes the classic
“event arrived just before watch began” race.

What remains incomplete is runtime orchestration. The current transport names
(`manual`, `resume-only`, `live-wait`, and `native-push`) mix user experience,
session ownership, and wake mechanism. The `native-push` surface validates an
injected Codex dispatcher but does not itself connect to a running host. The
resume adapter can invoke documented CLI forms for Codex, Claude, and Grok, but
it is not yet an end-to-end session coordinator.

The next version should preserve the protocol strengths and make the runtime
boundary explicit.

## The three runtime modes

### 1. Headless-managed

In headless-managed mode, `ai-peer-review` owns the reviewer process. It creates
the review workspace, constructs a provider-specific but protocol-governed
prompt, launches the provider CLI, parses structured output, records the exact
provider session handle in private scratch state, and manages subsequent turns.

This is the most naturally unattended mode. Codex documents `codex exec` for
non-interactive work, including JSONL output and exact session resume.[^4]
Claude Code documents print mode, JSON/streaming JSON, exact session resume,
turn limits, and unattended permission controls.[^5] Grok Build documents
headless JSON output and exact-ID resume.[^6] Gemini CLI documents `-p`, JSON or
JSONL output, session metadata, tool events, and process exit classes.[^7]
Antigravity CLI separately documents one-shot headless execution, exact
conversation resume, and a persistent NDJSON stdin/stdout session.[^18]

The coordinator owns:

- the exact executable and argument vector;
- canonical repository working directory;
- environment allowlist and credential references;
- stdout/stderr parsing and size limits;
- process cancellation and bounded shutdown;
- provider session identity extraction;
- turn deadline, cost/turn budget where supported, and retry policy; and
- conversion of provider output into a sealed protocol response.

It does **not** own the review decision. Provider telemetry is diagnostic; the
event ledger and sealed response remain authoritative.

Headless mode is not synonymous with unrestricted execution. A reviewer should
receive a read-only sandbox or tool policy. If a provider cannot satisfy that
contract, `doctor` must reject unattended review rather than silently select an
“always approve” or “YOLO” mode. Permission requests that cannot be safely
answered by the configured policy become explicit intervention events.

### 2. Session-managed (cross-window)

In session-managed mode, a reviewer session already exists in another window,
application, IDE, or host process. `ai-peer-review` does not create or own that
session. It holds an opaque handle granted by an official session API or proven
by an approved cross-window adapter, sends a bounded prompt to that exact
session, observes lifecycle evidence, and collects the result.

The control surface matters. An official session API is preferred. Local
experiments now establish that accessibility-based automation can target the
active Antigravity desktop, Antigravity IDE, and VS Code Antigravity surfaces,
submit prompts, capture responses, and retain conversational context. That is a
feasibility result, not yet proof of exact-session safety. A cross-window adapter
is supportable only when it uses a stable session locator, semantic state rather
than cached element positions, and an idempotent submission transaction. Generic
window focus or unverified keyboard injection remains unacceptable, as do
private transcript edits.

Codex App Server is a strong example of the intended surface: it exposes
`thread/start`, `thread/resume`, `turn/start`, streamed item notifications, and
explicit approval/sandbox policy through JSON-RPC.[^8] The Codex SDK can also
resume a thread by ID and run another turn.[^9] Gemini CLI's ACP mode is another
example: a client controls an agent over JSON-RPC on stdio using methods for
initialization, authentication, new/load session, prompt, and cancellation.[^10]
Antigravity Remote Control can drive desktop sessions from a browser, but Google
documents a user-facing dashboard, not a programmatic session API.[^19] The
locally installed native and IDE surfaces are also automation candidates. Each
remains experimental until it proves exact-session selection under multiple
conversations, cold resume, permission mediation, delayed-action recovery, and
fail-closed behavior after UI drift.

This mode may be fully automatic, or a person may also interact with the window.
Human presence is permitted but is not part of the activation contract. The
adapter must detect or prevent concurrent turns, bind every message to an exact
session, and preserve provider-issued identifiers only in untracked scratch.

A pre-existing window is not automatically controllable. Session-managed mode
is available only when an official API or explicitly selected, versioned
cross-window surface passes an end-to-end capability probe. Otherwise the user
must choose headless or handoff. A runtime must never fall back silently from an
API to UI automation, or from one application surface to another.

### 3. Cooperative handoff

In cooperative handoff mode, the author and reviewer are independently owned.
Each agent completes a turn by sealing its result and writing a durable delivery
event that names the recipient and result path. A small external coordinator, a
pending MCP wait, a targeted resume command, or a person then prods the opposite
agent to inspect the log and continue.

This mode is the least coupled and the easiest to recover. Neither agent needs
to share a process tree or vendor API. It is appropriate for long reviews,
different machines that share the governed workspace, providers with only a
resume command, and workflows in which a person wants to inspect the evidence
between turns.

The workspace—not the wake signal—is authoritative. The signal carries only an
invitation such as “review `<workspace>` after sequence 14.” On activation, the
recipient validates the ledger, reads the sealed result, and derives its one
legal next action. Duplicate signals are harmless because delivery consumption
is idempotent and sequence-bound.

The existing MCP `wait_for_handoff` is a good adapter for an agent already
parked in a pending tool call. It eliminates timer-based model wakeups and their
token cost. It is not, however, a general mechanism for injecting a turn into an
arbitrary dormant desktop window. The external coordinator fills that gap by
watching the same durable deliveries and invoking a supported session or resume
surface.

## One protocol, three control planes

```text
                 governed review workspace
        events + seals + artifacts + delivery receipts
                              |
                    re-read and validate
                              v
                 review-scoped coordinator
             capability probe + wake policy + lease
                  /            |             \
                 /             |              \
        headless process   official session   independent session
          owned child           API            or human-owned UI
              |                 |                    |
       structured output   structured events    sealed handoff log
                 \             |              /
                  +------ next protocol event +
```

The protocol core must not import provider process logic. It answers:

- Who are the registered author and reviewer?
- Which immutable artifact or snapshot is under review?
- Who owns the next turn?
- Which response bytes were sealed?
- Has the delivery been acknowledged?
- Is the review agreed, abandoned, or awaiting human authority?

Runtime drivers answer:

- Who owns the session/process?
- How is a turn started, observed, cancelled, and resumed?
- Which permission requests can be handled unattended?

Wake adapters answer:

- How is a durable delivery announced to the recipient?
- What is the next preauthorized fallback?
- What exact recovery command should a person run?

This layering allows a handoff review to use a session API as its primary wake
mechanism or a headless driver to persist provider session continuity without
changing protocol semantics.

## Capability negotiation and fail-closed selection

Runtime support should be declared as tested capabilities, not inferred from a
provider name. At start, `doctor` records a versioned capability observation:

| Capability          | Meaning                                                 |
| ------------------- | ------------------------------------------------------- |
| `launch`            | Start a fresh non-interactive reviewer                  |
| `structured-output` | Parse an unambiguous result/event stream                |
| `exact-resume`      | Continue a recorded provider session by exact ID        |
| `session-inject`    | Send a turn through a documented session API            |
| `ui-session-locate` | Resolve one exact conversation on a selected UI surface |
| `ui-state-observe`  | Read composer, response, busy, and permission states    |
| `idempotent-submit` | Reconcile an uncertain send without duplicating a turn  |
| `turn-observe`      | Observe completion, failure, and permission requests    |
| `cancel`            | Cancel the exact in-flight turn                         |
| `read-only`         | Enforce the configured reviewer non-mutation boundary   |
| `identity`          | Return stable provider/session/model evidence           |
| `eligible-account`  | Prove the selected product accepts the configured auth  |
| `effective-policy`  | Report the permission/trust mode actually in force      |

The selected runtime is pinned in the start event. Capability observations are
diagnostic snapshots and must be refreshed before each activation. If an update
removes a required flag or method, the review enters intervention-required
rather than degrading into a different ownership model.

Fallback is therefore ordered but bounded. A reasonable handoff chain is:

```text
official session API -> approved cross-window adapter -> exact CLI resume ->
MCP live wait -> user recovery
```

Only methods explicitly authorized at review start may run automatically. A
session-managed review may fall back from an app API to an exact resume command
if both target the same recorded session and the user selected that chain. It
must not create a fresh headless reviewer, choose the provider's “latest”
session, or switch identities silently.

## The lightweight coordinator

An external Node.js process is appropriate because the authority is already on
the local filesystem and Node runs on every supported project regardless of the
project's implementation language. `fs.watch()` can observe delivery-directory
changes without model polling, and an `AbortSignal` can close the watcher.[^11]
Node explicitly warns that `fs.watch()` behavior differs across platforms and
can be unreliable on network filesystems. Therefore a notification is only a
hint: every callback re-reads and validates the durable event ledger. Startup
also performs a read-before-subscribe and immediate post-subscribe re-read.

The coordinator should be foreground or host-owned, never an untracked detached
daemon. Exactly one instance may coordinate a review. Its lease contains:

- review ID and canonical workspace identity;
- coordinator instance UUID;
- owning process/IPC identity;
- start time and monotonic heartbeat;
- selected runtime and wake policy digest;
- child process identity, when present; and
- shutdown state.

The PID is diagnostic, not authority. Operating systems reuse PIDs, and Node
warns that signalling a reassigned PID can affect the wrong process.[^12] Before
signalling a child, the coordinator must match its own captured child object,
instance nonce, and lease record.

### No-orphan shutdown contract

Shutdown begins on:

- terminal review state (`AGREED`, `ABANDONED`, or final human disposition);
- retry/fallback exhaustion;
- owner IPC loss or invalid lease;
- `SIGINT`, `SIGTERM`, or supported `SIGHUP`;
- watcher error or workspace identity change;
- protocol integrity/version failure; or
- an explicit, identity-matched `coordinator stop` command.

The ordered shutdown sequence is:

1. Mark the instance `stopping` and reject new activation work.
2. Close the watcher and cancel timers and pending API calls.
3. Request graceful cancellation of the exact active provider turn.
4. For stdin-driven protocols, close stdin and continue draining stdout/stderr.
5. Wait for a bounded provider-specific grace period and the child `close`
   event.
6. Terminate only the exact captured process group or Windows job object still
   owned by this coordinator; signalling a launcher PID alone is insufficient.
7. Flush a final scratch diagnostic and recovery record.
8. Remove the lock/lease only if its instance UUID still matches.
9. Exit with a stable coordinator status code.

Windows signal behavior differs from POSIX and must be tested separately; Node
documents that several familiar signals terminate a Windows child abruptly.[^12]
Crash recovery therefore occurs at `start`, `status`, and `doctor`: inspect a
stale lease, prove the prior instance is absent, reconcile any sealed delivery,
and print an exact recovery action. Never kill a process merely because a stale
file contains its PID.

## Permission and human-interaction model

The modes define ownership, not whether a human is allowed to participate.

- Headless-managed is intended to run without human interaction. A provider
  permission request not covered by policy stops the turn and records
  intervention-required.
- Session-managed can run unattended through a host permission callback, or a
  person can answer in the owning application. The protocol records only the
  resulting authority evidence, not a guess about who clicked.
- Cooperative handoff may be entirely automated by the coordinator or advanced
  manually with the exact recovery command.

The reviewer contract should default to source-only access. Network, shell,
write, secret, and external-system capabilities must be separately declared.
Provider “bypass permissions” modes are not a substitute for a review policy.
Claude offers plan/restricted modes and explicit behavior for unattended
permission prompts.[^5] Gemini has folder-trust and headless behavior that can
override a requested approval mode on an untrusted workspace. The adapter must
verify the effective mode, not merely the requested flag, and must not use
`--skip-trust` to trust an arbitrary directory automatically.[^13] Antigravity
headless mode similarly reports its effective permission mode in the `init`
event; some denied tools are soft failures with exit code zero, so semantic
status and diagnostics are required in addition to the OS exit code.[^18]

Credentials remain in provider-owned stores or environment references. Raw
tokens, desktop cookies, and provider transcript files never enter tracked
review collateral.

## Provider feasibility

| Provider surface              | Headless-managed                        | Session-managed                           | Cooperative handoff  | Recommended first integration                     |
| ----------------------------- | --------------------------------------- | ----------------------------------------- | -------------------- | ------------------------------------------------- |
| Codex CLI / SDK / App Server  | Strong                                  | Strong                                    | Strong               | App Server plus exact `codex exec resume`         |
| Claude Code                   | Strong                                  | Moderate; host/SDK dependent              | Strong               | Print-mode adapter plus exact session resume      |
| Grok Build                    | Strong                                  | Strong where ACP is enabled               | Strong               | Headless JSON, then ACP                           |
| Gemini CLI, eligible account  | Promising; inference unverified locally | ACP structure confirmed; readiness gated  | Promising            | Enterprise/API conformance adapter                |
| Antigravity CLI (`agy`)       | One-shot and resume proven locally      | Owned persistent process, not desktop     | Exact resume proven  | Consumer headless/resume adapter                  |
| Antigravity desktop 2.0       | Not applicable                          | Active-session feasibility proven locally | Automation candidate | Exact-ID and cold-resume conformance              |
| Antigravity IDE               | Not applicable                          | Feasible; permission mediation required   | Automation candidate | Permission and exact-ID conformance               |
| VS Code Antigravity extension | Not applicable                          | Feasible; delayed-action race observed    | Automation candidate | Transactional submission and exact-ID conformance |
| Antigravity Remote Control    | Not applicable                          | Experimental official-browser surface     | Human-assisted       | Exact-session UI-automation spike                 |
| Gemini consumer desktop app   | Interactive only on current evidence    | No documented inbound control surface     | Human-assisted       | No automation until a suitable surface is exposed |

The official Grok Build repository describes the CLI as usable interactively,
headlessly, and through ACP, which makes the session path credible but still
subject to installed-version conformance testing.[^16]

### Google agent-surface assessment

Google now documents native Gemini apps for macOS and Windows. The Mac app
requires Apple Silicon and macOS 15 or later and supports interactive chat,
window sharing, and “Speak to Window”; the Windows app supports interactive
desktop access on Windows 10 or later.[^1][^2] Those applications remain useful
for human-assisted handoff, but their public help does not establish an inbound
session API.

#### Local Gemini CLI experiments, September 11, 2026

The newly installed executable was `/opt/homebrew/bin/gemini`, version `0.46.0`.
For drift comparison, the current npm package `@google/gemini-cli@0.59.0` was
also inspected without installing it globally. Both exposed headless prompting,
JSON/stream-JSON output, exact `--resume`/`--session-id`, project session
listing, approval modes, folder-trust controls, and ACP.[^14]

| Probe                    | Observation                                                                                                                             | Design consequence                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Personal OAuth inference | Both versions rejected the cached individual account with `UNSUPPORTED_CLIENT` before a model turn                                      | Product/account eligibility is a preflight capability, not an authentication footnote |
| Headless JSON failure    | Startup/authentication errors were human-readable diagnostics rather than a JSON result envelope                                        | Parse pre-protocol stderr and plain startup failures before requiring JSON            |
| Folder trust             | In the repository without explicit trust, requested `plan` mode was overridden to `default`                                             | Compare requested and effective policy; reject a weakened reviewer boundary           |
| Session listing          | Sessions were scoped to the canonical project and full UUIDs were exposed; listing could print an auth error and still exit zero        | Use the canonical root and exact IDs; never treat exit code alone as success          |
| ACP initialize           | Versions `0.46.0` and `0.59.0` negotiated protocol version 1 and advertised load-session support plus OAuth/API-key/Vertex auth methods | ACP initialization proves syntax and capability advertisement, not account readiness  |
| ACP session open         | `session/new` returned a structured unsupported-account error                                                                           | Preflight must include a readiness probe beyond `initialize`                          |
| Shutdown                 | Closing ACP stdin drained the process tree and exited cleanly; signalling only the Homebrew wrapper left descendants alive              | Close stdin first, drain, then escalate against the captured process group/job object |

The experiments could not validate model output, read-only enforcement during a
tool turn, cancellation of an active model turn, or resumed conversational
continuity because Google ended Gemini CLI access for individual consumer
accounts on June 18, 2026. Google continues Gemini CLI for enterprise, Google
Cloud, and paid API-key access and directs consumer users to Antigravity
CLI.[^15][^17] Homebrew also reports the installed `gemini-cli` formula as
deprecated with `antigravity-cli` as its replacement. Failed probes created
provider-owned, project-scoped session metadata, another reason diagnostics and
cleanup policy must include provider artifacts without deleting them
automatically.

#### Local Antigravity experiments, September 11, 2026

Follow-up experiments used the same repository in four separately owned
Antigravity surfaces: Antigravity desktop 2.13.0, Antigravity IDE 2.5.5, VS Code
1.137.0 with the Antigravity extension 1.3.0, and `agy` 1.2.1. The three
interactive surfaces displayed Gemini 3.8 Flash High. The automation harness
used exposed accessibility state and direct UI actions; it did not read private
provider state or edit transcripts.

| Probe                     | Observation                                                                                                                           | Design consequence                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Surface targeting         | Each interactive window received a distinct handshake and returned the exact requested token                                          | Application-level targeting and response capture are feasible                                     |
| Read-only workspace check | All three reported the same canonical root, branch, HEAD, package version, and one pre-existing dirty entry                           | Cross-window turns can inspect a shared review workspace without conflating surfaces              |
| Permission behavior       | Desktop and VS Code completed without prompts; IDE required two one-time terminal approvals                                           | Permission state is surface-specific and must be observed explicitly                              |
| Turn latency              | Desktop reported 4 seconds, IDE 35 seconds, and VS Code 6 seconds for the same bounded check                                          | Deadlines and progress policy cannot be inferred from provider identity alone                     |
| Blind continuity          | Every existing conversation recovered its earlier surface, HEAD, and dirty count without using tools or receiving the expected values | Active-session conversational continuity is locally proven on all three surfaces                  |
| Delayed UI action         | A VS Code clipboard operation timed out, completed later, and raced with recovery input, temporarily duplicating a draft              | Timeout means outcome unknown; retry requires settling, state reconciliation, and idempotency     |
| CLI one-shot              | `agy` returned a structured `SUCCESS` result with the exact requested token under sandbox-controlled print mode                       | The consumer headless path is locally viable                                                      |
| CLI exact resume          | A second process resumed the recorded conversation ID and recovered the prior token                                                   | Exact cross-process continuity is locally proven                                                  |
| CLI argument parsing      | Bare `-p` consumed the following option as its prompt; the attached `-p='...'` form succeeded                                         | Build and test an argument vector per supported version; never compose an untested command string |
| CLI policy warning        | `agy` warned that `--mode plan` has no effect when slash expansion is disabled                                                        | Requested and effective policy must be checked together                                           |
| Process ownership         | The one-shot CLI processes exited; host-owned `agy --hub` processes for the IDE/extension remained                                    | No-orphan cleanup must distinguish review-owned children from user/host-owned services            |

The repository remained at
`27739da257a991c6eca23285df0885370f6d1788`; its only dirty entry before and
after the experiments was the pre-existing untracked
`.worktrees/1609-finalize-cli-result/` directory. These results prove
feasibility for an already selected, active conversation. They do not yet prove
cold application restart, exact selection among multiple conversations,
authentication refresh, concurrent human interaction, permission denial,
active-turn cancellation, or recovery after UI-version drift.

#### Antigravity implications

The standalone Antigravity CLI is now available on this host's `PATH` as `agy`
1.2.1. Local one-shot and exact-resume model turns confirm part of the behavior
described by current official documentation. Its `agy` executable offers a
stronger consumer path than the ineligible Gemini CLI login:

- `agy --print=<prompt>` returns text, JSON, or NDJSON and separates response
  stdout from diagnostic stderr; the locally tested attached-value form avoids
  the version 1.2.1 short-flag parsing ambiguity;
- `--conversation <id>` resumes one exact conversation, while `--continue`
  selects the latest and is therefore unsuitable for automatic routing;
- `--input-format stream-json --output-format stream-json` supports multiple
  turns in one owned process, one `result` per turn, with effective permission
  mode in the `init` event; and
- closing stdin is the documented graceful session shutdown.[^18]

The persistent stream is a headless-owned runtime, not proof that `agy` can
inject into an arbitrary desktop window. The local interactive experiments do
prove active-window prompt delivery, response capture, and continuity through a
separate accessibility-based control plane. Antigravity 2.0 also offers an
official Remote Control browser UI that can view and drive desktop
conversations. Its documentation exposes service start/status/stop commands and
browser interaction, but no external session API.[^19]

Both paths should remain explicit experimental cross-window adapters, with
API/CLI exact resume preferred for unattended control. The native desktop
surface exposed a conversation-bearing URL in accessibility state, while the
IDE and VS Code probes did not yet establish a durable externally addressable
conversation ID. Current-window success therefore cannot be promoted to
exact-session support. Antigravity's optional daemon and IDE/extension hub
processes are host-owned services, not review-scoped children;
`ai-peer-review` must neither start or stop them implicitly nor claim ownership
of them.

Google also publishes a stateful Python Antigravity SDK for API-key and Vertex
configurations.[^20] It is a credible future headless adapter, but adding a
Python runtime is unnecessary while the `agy` stream satisfies the lightweight
Node coordinator's process contract.

The Google provider adapter should consequently resolve and pin a product
surface: `gemini-cli` for eligible enterprise/API configurations,
`antigravity-cli` for the consumer headless path, or a future approved
`antigravity-remote-control` adapter. Installation or authentication of one
surface must never be inferred from another.

## Cross-window submission as a transaction

The VS Code delayed-action result changes the retry model. A UI call that
returns a timeout may have failed before delivery, may still be pending, or may
have succeeded after the caller stopped waiting. Immediate retry can therefore
duplicate a draft or submit the same review turn twice.

Each activation needs a unique operation ID bound to the review ID, delivery
ID, recipient, event cursor, target-session digest, and prompt digest. The
cross-window adapter advances through durable diagnostic phases:

1. `prepared`: resolve the exact surface and session locator, then verify that
   the target is idle and the composer is empty or already contains this exact
   operation.
2. `inserting`: inject the prompt and re-read the composer. Cached accessibility
   indexes are never reused after a state transition.
3. `ready`: prove one normalized copy of the prompt is present before sending.
4. `outcome-unknown`: on timeout or control loss, stop all retries and allow a
   bounded settling period.
5. `submitted`: prove that the operation appears once in the conversation log;
   the disappearance of composer text or a successful click is insufficient.
6. `responded`: correlate a terminal response with the submitted operation and
   capture it for protocol validation.
7. `consumed`: advance authoritative review state only after the recipient
   claims or consumes the durable delivery.

If reconciliation finds the prompt in both the composer and conversation log,
or cannot prove one exact target, the adapter stops and prints a recovery
action. It never guesses whether another send is safe. Permission dialogs are
also explicit states: only an exact start-time policy match may be answered
automatically; otherwise the adapter records intervention-required and leaves
the selected session recoverable.

## Recovery as a product surface

Every exhausted activation path should leave the review valid and the next
action obvious. The durable turn remains `delivery-pending`; failure to wake a
session never unseals or reassigns it. The CLI should emit:

- a stable code such as `APR_WAKE_FAILED` or `APR_COORDINATOR_STALE`;
- the failed adapter chain and safe diagnostic facts;
- whether the last submission outcome is known or requires reconciliation;
- whether an exact provider session remains resumable;
- one copyable recovery command; and
- a scratch recovery note that `status --next` can reconstruct.

Representative operator commands are:

```text
peer-review coordinator status <workspace>
peer-review coordinator stop <workspace>
peer-review coordinator recover <workspace>
peer-review status <workspace> --next
peer-review explain APR_WAKE_FAILED
peer-review explain APR_COORDINATOR_STALE
```

The recovery command must target the exact review and participant. “Open the
latest session” is not acceptable because it can violate reviewer identity.

## Why MCP remains optional

MCP is not inherently too heavy for the problem. The current pending-tool wait
is efficient and avoids timer-driven token spend. Its limitation is scope: it
requires each agent host to configure the server, keep a tool call pending, and
support a sufficiently long tool timeout. It wakes the session already blocked
on that call; it does not universally control a session in another application.

The recommended migration is additive:

- preserve `wait_for_handoff` as the `mcp-live-wait` wake adapter;
- move filesystem observation into a reusable delivery source;
- add the standalone review-scoped coordinator over that source;
- add session-API and CLI-resume wake adapters;
- deprecate configuration that treats `live-wait` as a runtime mode; and
- keep manual recovery permanently available.

This retains the token-saving work already built while making MCP one tool in a
broader activation strategy.

## Security and integrity properties

The architecture should preserve these invariants:

1. The ledger, not a process or model transcript, determines review state.
2. Only the current turn owner can submit the next governed response.
3. Wake signals never contain secrets or authority to mutate protocol state.
4. Provider session handles are opaque, untracked, and exact—not “latest.”
5. A reviewer cannot mutate the reviewed repository through the supported
   launch policy.
6. Runtime fallback cannot change participant identity or execution ownership
   silently.
7. Duplicate, delayed, or replayed wake events are idempotent.
8. A transport timeout is an unknown outcome until the target state is
   reconciled; it does not authorize immediate retry.
9. Every cross-window prompt carries one operation ID, and submission is proven
   from the conversation log rather than inferred from a control call.
10. One review has at most one valid coordinator lease.
11. Terminal review state causes deterministic coordinator shutdown.
12. Stale process metadata is inspected and reconciled, never trusted as a kill
    target by itself.

These controls matter more than provider diversity. A different model can
decorrelate reasoning errors, but only protocol evidence makes the exchange
auditable.

## Expected operational impact

The design removes repeated model polling from every mode. Headless and session
drivers wait on provider process/API events; handoff waits on filesystem events
or a pending MCP call. It should therefore reduce idle token consumption while
improving latency over timer-based wake cycles.

The coordinator adds a small resident process during active reviews, but its
state is bounded and observable. The main costs remain provider inference,
review depth, and repository exploration. Provider-reported cost and timing may
be recorded as non-authoritative diagnostics, never as review evidence or a
portable comparison.

## Recommended delivery sequence

1. Separate runtime mode from wake policy in a backward-compatible protocol
   revision.
2. Build coordinator lifecycle, lease, shutdown, recovery, and cross-platform
   tests before connecting provider processes.
3. Deliver cooperative handoff first using the existing event/delivery source,
   targeted resume, MCP compatibility, and user recovery.
4. Add a generic headless driver and conformance harness, then Codex, Claude,
   and Grok adapters.
5. Add session-managed Codex App Server support and a general session adapter
   contract.
6. Add a Google-surface resolver and separate conformance gates for eligible
   Gemini CLI and Antigravity CLI installations.
7. Build the transactional cross-window adapter contract from the local
   Antigravity findings, then conformance-test desktop, IDE, VS Code, and Remote
   Control independently. Promote only surfaces that prove exact identity,
   idempotent submission, permissions, cold resume, and UI-drift failure.

This ordering proves the dangerous lifecycle code independently of provider
quirks and delivers useful no-poll handoff early.

## Conclusion

The three runtime modes are not competing implementations. They are a coherent
set of ownership choices over one governed protocol.

Headless-managed offers the simplest unattended experience. Session-managed
lets an existing agent window participate through a supported control plane.
Cooperative handoff remains the universal, resilient path when sessions are
independently owned. A lightweight Node coordinator can connect all three
without turning the review protocol into a process manager or requiring MCP
everywhere.

The design's most important promise is not that every provider will always wake
automatically. It is that activation failure never corrupts the review, changes
the reviewer, or strands an invisible daemon. The work remains sealed, the
coordinator stops, and the user receives one exact way to continue.

## Sources

[^1]: Google, [Use the Gemini app on Mac](https://support.google.com/gemini/answer/17011627?hl=en), accessed September 11, 2026.

[^2]: Google, [Use the Gemini app for Windows](https://support.google.com/gemini/answer/18263854?hl=en), accessed September 11, 2026.

[^3]: `ai-peer-review`, [Manual Cross-Provider Peer Review](../manual-cross-provider-peer-review.md), repository case study.

[^4]: OpenAI, [Codex CLI reference](https://developers.openai.com/codex/cli/reference) and [Non-interactive mode](https://developers.openai.com/codex/noninteractive), accessed September 11, 2026.

[^5]: Anthropic, [Claude Code CLI reference](https://code.claude.com/docs/en/cli-usage), accessed September 11, 2026.

[^6]: xAI, [Grok Build headless mode](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md), accessed September 11, 2026.

[^7]: Google, [Gemini CLI headless mode reference](https://geminicli.com/docs/cli/headless/), updated March 10, 2026.

[^8]: OpenAI, [Codex App Server](https://developers.openai.com/codex/app-server), accessed September 11, 2026.

[^9]: OpenAI, [Codex SDK](https://developers.openai.com/codex/sdk), accessed September 11, 2026.

[^10]: Google, [Gemini CLI ACP mode](https://geminicli.com/docs/cli/acp-mode/), accessed September 11, 2026.

[^11]: Node.js, [`fs.watch()` documentation](https://nodejs.org/api/fs.html#fswatchfilename-options-listener), accessed September 11, 2026.

[^12]: Node.js, [Child process documentation](https://nodejs.org/api/child_process.html) and [Process signal documentation](https://nodejs.org/api/process.html#signal-events), accessed September 11, 2026.

[^13]: Google, [Gemini CLI trusted folders](https://geminicli.com/docs/cli/trusted-folders/), accessed September 11, 2026.

[^14]: Google, [Gemini CLI session management](https://geminicli.com/docs/cli/session-management/), accessed September 11, 2026.

[^15]: Google, [Gemini CLI authentication setup](https://geminicli.com/docs/get-started/authentication/), updated August 17, 2026.

[^16]: xAI, [Grok Build repository and product documentation](https://github.com/xai-org/grok-build), accessed September 11, 2026.

[^17]: Google, [An important update: Transitioning Gemini CLI to Antigravity CLI](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/), published June 18, 2026.

[^18]: Google, [Antigravity CLI headless mode](https://antigravity.google/docs/cli/headless/), accessed September 11, 2026.

[^19]: Google, [Antigravity Remote Control](https://antigravity.google/docs/remote-control/), accessed September 11, 2026.

[^20]: Google, [Antigravity SDK overview](https://antigravity.google/docs/sdk/overview/), accessed September 11, 2026.
