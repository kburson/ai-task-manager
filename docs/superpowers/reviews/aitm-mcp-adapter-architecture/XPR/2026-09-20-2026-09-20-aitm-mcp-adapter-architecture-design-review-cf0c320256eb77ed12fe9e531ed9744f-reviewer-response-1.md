<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-cf0c320256eb77ed12fe9e531ed9744f"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md"
artifact_commit: "98bdbb4ea6dd00468886a38c4150d9d8049a44c3"
artifact_blob: "0fb2aaeb4955afb41629e9b2e4f3de930fb9be33"
artifact_digest: "sha256:58a41985ff691814e0374a27e32d097a34ed95390d459321c0391121cec1b125"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:456928280c0bc2616a47beee48666759265dd646d2bd64bbb311fe952beb12b3"
  identity_source: "declared"
started_at: "2026-09-20T20:51:32.151Z"
submitted_at: "2026-09-20T20:56:03.182Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007","R1-F008","R1-F009"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Scope of review: the complete artifact
`docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md`
(1509 lines, digest `sha256:58a41985…`), read end to end. I cross-checked three
external facts inside the repository: the published package identity in
`package.json` (`@kburson/ai-task-manager`, version `0.1.0`), and the inherited
concurrency and durability claims in `docs/decisions/0002-github-native-authority-records.md`
(scoped coordination, epoch-fenced grants, append-first mutation, required
mitigations list). No other reviewer or author document was consulted; the
analysis below is independent.

Overall assessment: the architecture is sound and unusually rigorous. The
headless-kernel-with-peer-transports decomposition is the right shape, the
capability-port model correctly generalizes ADR 0002 without inventing a
database or a hosted control plane, and the failure-semantics sections
(request identity and retry, evidence append recovery, recovery across
configuration changes, approval provenance) are materially stronger than what
this codebase runs today. The document's characteristic strength is that it
refuses to launder uncertainty into success: "absence from an eventually
visible search … is not proof that a mutation did not occur," and the repeated
insistence that conformance detects violations but does not establish
containment, are exactly the right instincts and should be preserved verbatim.

The defects I found are not in the architecture's shape. They fall into three
groups. First, the document states several safety rules so strictly that its
own built-in default adapter has no demonstrated way to satisfy them, and the
document never closes that gap — most acutely the certified-execution-mode
requirement against a GitHub authority that offers no compare-and-swap
primitive on issue comments (Finding 1). Second, the fail-closed posture is
applied with a single coarse granularity, so ordinary, high-frequency,
non-safety events — a patch-level dependency bump, a stale memory hint,
a normal secondary rate-limit response — are routed into the same
blocking state as genuine integrity violations, and in one case into a
circular block with no exit (Findings 2, 3, 4, 5). Third, a handful of
load-bearing terms and obligations are asserted without a definition or a
mechanism: the authenticated initiating principal that scopes request-key
deduplication (Finding 6), the set of roles that are actually exclusive
(Finding 7), and the immutable execution view that Phase 4 must prove
(Finding 8).

Findings 1 through 4 are, in my assessment, blocking for Phase 1 scoping,
because each one determines whether a Phase 1 exit gate is reachable at all.
Findings 5 through 9 are correctness and completeness defects in the
specification that should be resolved before the phase specifications are
authored, since each would otherwise be rediscovered as rework inside a phase.

## Findings

### R1-F001 — No GitHub-native mechanism is shown for the certified execution mode the design requires, and the design's own fallback blocks every governed mutation in the default configuration

Severity: blocking for Phase 1.

Under "Concurrent execution and authority fencing," the artifact requires that
"Adapters declare and certify an execution mode: provider-conditional admission
with fenced dispatch, or an exclusive coordinator that serializes admission and
dispatch without overlapping ownership." It then closes the two escape hatches
an implementer would reach for first: "Conditional append alone is insufficient
unless the execution boundary also rejects a stale owner or stale request," and
"Exclusive coordination must cover all participating clones and workers; a local
process lock, elapsed lease, or reread-and-append loop does not prove
exclusivity." The stated consequence of failing both is total: "If neither safe
mode is available, the affected mutation capability is blocked with a structured
reason; it does not fall back to optimistic writes." "Adapter conformance kit"
makes this a gate rather than an aspiration: "Each adapter must prove its
declared admission and execution mode, including stale-owner rejection or safe
refusal of takeover. Built-in GitHub is subject to the same gate."

The artifact never identifies a GitHub primitive that satisfies either mode for
the `work-items` authority. This is not an oversight the implementation can
quietly absorb, because the relevant GitHub surfaces do not offer the needed
primitive. Issue-comment creation has no compare-and-swap and no conditional
write; `If-Match` is not honored on issue or comment mutation; conditional
requests via `If-None-Match` affect read caching and rate-limit accounting, not
write admission; and Projects v2 GraphQL field mutations expose no optimistic
concurrency token. The one GitHub surface that does offer a genuine
compare-and-swap is ref update with an expected head OID — which serves the
`repository` port, not the backlog authority where the evidence stream lives.
ADR 0002 does not close this either: it asserts "one authoritative coordinator
per governed scope" and "epoch-fenced grants and assignments" in its required-
mitigations list, and acknowledges under Negative that "Issue-comment updates
are not multi-object transactions," but it never names the mechanism that
enforces the fence. The new artifact inherits that gap and simultaneously
raises the bar, because ADR 0002's coordinator could plausibly have been
implemented as a reread-and-append loop, which this artifact now explicitly
rejects as insufficient.

Failure scenario, concrete: Phase 1 ships the kernel and the built-in GitHub
adapter. The adapter author must declare an execution mode. Provider-conditional
admission is unavailable, because no GitHub write against issue comments or
project fields can be made conditional on an expected evidence head. Exclusive
coordination is available only as a lease recorded in the evidence stream —
which is precisely the "elapsed lease" and "reread-and-append loop" the artifact
names as non-proof. The conformance kit therefore fails the built-in adapter's
declared mode. Per "Concurrent execution and authority fencing," the affected
mutation capability is blocked with a structured reason. Since the `work-items`
port owns every canonical evidence append, and since "No business effect may
dispatch until its request record is verified," the blocked capability is not a
narrow one: the default, zero-configuration AITM installation reaches a state in
which no governed mutation can be admitted at all, while read-only discovery
works fine. The Phase 1 exit condition — "the existing CLI suite passes through
the kernel … and the new admission, response-loss, evidence-append, stale-owner,
bootstrap, and migration-cutover failure cases pass" — is then unreachable, and
the failure surfaces only after the kernel, the schemas, the request-key
machinery, and the GitHub adapter have all been built.

Note that this finding is not a request to weaken the rule. The rule is correct.
What is missing is the demonstration that the rule is satisfiable by the default
provider, or an explicit statement that it is not and what AITM does about that.

### R1-F002 — Installation staleness and pending-action recovery deadlock each other, with no specified exit

Severity: blocking for Phase 1 and Phase 4.

"Installation staleness" states without qualification: "Stale installation
metadata enters diagnostic-only mode. Read-only discovery, help, and diagnosis
remain available; mutating tools are disabled." "Recovery across configuration
changes" states: "Setup inventories pending actions before changing a binding or
recovery contract. It must either settle them or verify a continuing, authorized
recovery path to their original targets."

These two rules form a cycle whenever staleness and an ambiguous pending action
coexist. Settling a pending action is a mutation: the recovery path appends
`action.reconciled`, `action.retry-authorized`, or `action.intervention-required`
to the evidence stream, and "Evidence append recovery" confirms that these
appends are governed protocol writes subject to execution ownership, not
exempt operations. But mutating tools are disabled while the installation is
stale. The only route out of staleness is `aitm setup` — which must first
settle the pending actions. Nothing in the artifact breaks the cycle.

That the document knows this carve-out is needed is visible two sections
earlier. "Retention and retrieval contract" ends: "Expiry, deletion,
inaccessible archives, or policy drift that breaks this proof blocks affected
admission and dispatch; uncertainty spanning the project request-key scope
blocks project mutations. Read-only diagnosis and governed evidence recovery
remain available." The staleness section grants no equivalent
governed-evidence-recovery exception.

Failure scenario, concrete: a maintainer commits the setup output. A teammate
pulls and runs a governed action that dispatches a GitHub mutation successfully,
then loses the response before `action.completed` is appended — the exact case
"Request identity and retry" is designed to handle. Before anyone reconciles it,
an unrelated `npm ci` on a rebuilt machine, or a Dependabot bump of the AITM
devDependency, changes the core version. The staleness table classifies "Core
differs from setup generator" as "Portable metadata stale," so every clone
enters diagnostic-only mode and mutating tools are disabled. The pending action
is now permanently unreconcilable by AITM: recovery requires a mutation,
mutation requires a fresh installation, and setup requires the pending action to
be settled first. The artifact's own guidance — "The error identifies the
mismatch, whether any effects committed, the maintainer action, and whether a
new commit is required" — produces an instruction the maintainer cannot follow.
The GitHub effect that already committed remains unattributed in the evidence
stream indefinitely, which is the precise outcome the recovery protocol exists
to prevent.

### R1-F003 — Staleness is classified by exact version rather than by compatibility, so routine patch upgrades disable mutation for every consumer

Severity: high.

"Installation staleness" specifies that the install manifest contains
"generator package version and setup ABI," and the classification table maps
"Core differs from setup generator" to "Portable metadata stale." Combined with
"Stale installation metadata enters diagnostic-only mode … mutating tools are
disabled," the trigger for globally disabling mutation is a version difference,
not a compatibility judgment. The same coarseness appears in the learning-plane
fingerprint, which "covers core and schema versions, adapter identities,
executable content identities and manifests, project bindings and feature flags,
and the projection format."

The artifact elsewhere demonstrates that it has the finer-grained vocabulary
needed here and chooses to use it: adapter manifests carry `"coreApi": "^2"`,
and "Recovery across configuration changes" explicitly reasons in terms of
certified compatibility rather than version equality — "A compatible upgrade may
recover the action without reinstalling old code, but cannot silently treat
changed bytes as the original implementation." Staleness classification does not
apply that same distinction, so it cannot express the common and safe case of a
core patch release that changes no schema, no ABI, and no generated artifact.

Failure scenario, concrete: AITM publishes a patch release fixing an unrelated
CLI rendering bug. No schema version, adapter manifest, generated file, or
capability fingerprint changes. A developer runs `npm ci` after the lockfile
updates. Startup compares the installed core version against the setup
generator version recorded in the install manifest, finds a difference, and
classifies the installation as portable-metadata stale. Every mutating tool is
disabled across CLI and MCP for every consumer of that commit, including cloud
workers — and cloud workers cannot self-repair, since "A cloud consumer never
repairs or regenerates tracked integration files." Work stops until a maintainer
reruns `aitm setup` and lands a commit whose only content is a regenerated
version stamp. Repeated across a normal dependency-update cadence, this trains
maintainers to route around the staleness gate, which degrades the genuine
integrity signal the gate exists to carry.

### R1-F004 — The mandated append-read-back-dispatch-append-project sequence has no stated cost or rate-limit budget, and normal GitHub secondary rate limiting is routed into the intervention path

Severity: high.

"Governed action and recovery flow" mandates, for every governed mutation:
append and read back `action.requested`; execute through the adapter; observe
external effects; append and verify the outcome; update the projection. Against
a GitHub `work-items` binding this is, at minimum, two comment creations, two
read-backs, the business mutation itself, and an issue-body projection edit —
five to six API calls per governed action, of which four are content-creating
writes, and of which at least three writes target the same issue. The artifact
places rate limits inside adapter ownership ("pagination, rate limits, and
provider retries"), but the write amplification is imposed by the kernel
protocol and cannot be traded away by the adapter. ADR 0002 anticipated the
pressure — "GitHub latency and rate limits constrain record granularity and
polling," mitigated by "coarse capsule writes and batched/cached reads" — but
the new protocol makes fine-grained per-action appends mandatory and does not
restate the mitigation or set a budget.

The interaction with the recovery rules is where this becomes a correctness
problem rather than a performance one. GitHub applies secondary rate limits to
content creation, including a limit on concurrent and rapid successive writes to
the same resource, and returns 403 or 429 with `Retry-After`. Under "Evidence
append recovery," a lost or ambiguous append response is not a soft failure:
"If creation or read-back loses its response, the adapter reports an unknown
append outcome … Resubmission requires safe native idempotency or proof that the
earlier append did not commit and cannot still complete. Search absence alone is
insufficient." GitHub comment creation has no native idempotency key.

Failure scenario, concrete: a Full-Auto session drives several stories, issuing
governed actions against the same issue a few seconds apart. The third
`action.requested` append is throttled by the secondary limit after the comment
has been created but before the response is returned — the ordinary
throttle-plus-timeout shape, not an exotic partition. The adapter cannot prove
the append did not commit; comment search may not yet show it, and the artifact
forbids treating search absence as proof. The action escalates to
`action.intervention-required`. Because "Unresolved evidence writes remain
visible as recovery work and block conflicting successors," the work item is now
blocked pending a human. A routine, expected, documented provider behavior has
become a blocking human-intervention event, and its frequency scales with the
very automation Full-Auto is meant to enable. Separately, since "Automatic
expiry cannot remove those payloads or request-key tombstones," a long-running
epic accrues an unbounded and un-prunable comment population on a single issue,
which degrades both the GitHub UI and cold-read cost — a consequence the
Negative list does not mention.

### R1-F005 — A non-authoritative memory projection can disable all governed mutation, contradicting Goal 6 and acceptance criterion 11

Severity: medium-high.

"Agent-host memory bridges" states: "For a tracked project memory target,
session boot validates but never rewrites it; a mismatch enters diagnostic-only
mode and directs a maintainer to rerun setup." Diagnostic-only mode is defined
under "Installation staleness" as the state in which "mutating tools are
disabled."

This contradicts the document's own repeated commitment that memory is not
authoritative. Goal 6 is to "Project small, fingerprinted learning directives
into agent-host-specific memory without making memory authoritative."
Acceptance criterion 11 reads: "Generated agent memory is fingerprinted,
replaceable, and non-authoritative." The section itself reiterates that "The
memory projection contains durable operating guidance and references only."
A projection that can withhold permission to mutate the backlog is, by the
plain meaning of the term, authoritative over execution — regardless of what it
contains.

Failure scenario, concrete: a project commits its learning projection into a
tracked `CLAUDE.md`. A maintainer changes a port binding and reruns setup on
their machine, which updates the capability fingerprint, but the commit lands
with the tracked memory block un-regenerated — plausible, since the block is a
protected region inside a file dominated by human prose and easy to miss in
review. Every teammate and every cloud worker that pulls the commit validates
the projection, observes a fingerprint mismatch, and enters diagnostic-only
mode. All governed mutation stops across the project because a documentation
hint is out of date. The blast radius of a stale advisory equals the blast
radius of a detected integrity violation, and cloud consumers cannot
self-repair.

### R1-F006 — The authenticated initiating principal that scopes request-key deduplication is never defined, and the artifact elsewhere rules out the only identity an MCP caller can supply

Severity: medium-high.

"Request identity and retry" specifies: "The deduplication scope is the
canonical project authority and authenticated initiating principal, independent
of host, process, transport, or MCP session." The principal is therefore
load-bearing: it partitions the key space, and it determines whether a reused
key returns a recorded outcome or raises `AITM_REQUEST_KEY_CONFLICT`. The
artifact never says what authenticates it at the CLI or MCP boundary.

The obvious candidates are each closed off by the document's own rules.
"Approval authority and provenance" establishes that "Provider authentication
proves access by an execution principal; it does not prove that a human reviewed
or approved an action," and that "An agent-supplied actor name … is not
sufficient proof of a human decision" — and "Capability-specific ports" keeps
the roles apart: "The kernel keeps the initiating actor, each provider execution
principal, and any approver distinct." So the initiating principal is
definitionally not the provider execution principal, and it cannot be an
agent-asserted string. A local MCP server started by an agent host has no
third source of authenticated caller identity; the stdio transport carries none,
and "Transport request IDs are not substitutes" forecloses deriving one from the
session.

Failure scenario, concrete: two agent sessions work the same repository
concurrently — the repository's own documented parallel-agent fan-out makes this
routine, and both sessions authenticate to GitHub with the same token. If the
principal collapses to that shared provider identity, the two sessions share one
deduplication namespace, and a naturally-chosen key such as `analysis-45-01`
generated independently by both sessions resolves as a reuse. The second session
either receives the first session's recorded outcome as if it were its own — a
silent false success for an action it never performed — or receives
`AITM_REQUEST_KEY_CONFLICT` for a legitimate distinct action. If instead the
principal is agent-asserted to keep the namespaces apart, then any agent can
address another's pending actions by asserting its identity, and the guarantee
in "Another authorized principal may inspect or recover the original action by
its handle under policy, but cannot silently rebind its request key" rests on an
unauthenticated claim. Both branches are wrong, and the artifact does not say
which branch it intends.

### R1-F007 — The set of exclusive roles is left undefined, and forge/CI selection is described as possibly implicit, which conflicts with the single-binding model

Severity: medium.

"Capability-specific ports" states: "Each exclusive role has one active writable
binding. In particular, a project has exactly one writable `work-items`
authority." The phrase "In particular" signals that `work-items` is one member
of a larger set, but the set is never enumerated. Nothing in the artifact says
whether `forge`, `ci`, `identity`, or `repository` are exclusive.

The document then leans both ways. "Local repository binding" plainly
contemplates multiple concurrent repository targets: "Linked worktrees share the
relevant Git mutation scopes; distinct clones do not become the same local
target merely because their remotes match." And "Request identity and retry"
says: "Implicitly selected forge or CI destinations must be recorded as
explicitly as the work-item authority" — an instruction that only makes sense if
forge and CI selection can be implicit, which in turn presupposes more than one
candidate binding and a resolution rule. No such resolution rule appears
anywhere in the artifact. Meanwhile "Adapter conformance kit" requires
"Composed-port fixtures change the forge binding while retaining the backlog
authority," establishing that forge bindings do change over time.

Failure scenario, concrete: a project mirrors to two forges, or migrates from
GitHub to GitLab while both remain configured — the latter is a case the
composed-port fixtures explicitly exercise. An agent invokes `aitm_deliver`.
Because no rule selects among forge bindings and none is declared exclusive, the
resolution is left to the implementation, and the two transports may resolve it
differently — which directly violates the parity guarantee in "Headless kernel
with peer transports" that "CLI and MCP calls must produce the same domain
request, external effects, evidence, result envelope, and recovery
classification." The pull request lands on the wrong forge. Recovery then
compounds the error rather than catching it: "Recovery uses the recorded
destinations and effect identities, not the current default port bindings," so
the mis-selected destination is faithfully preserved as intent, and the
misroute becomes durable evidence.

### R1-F008 — The immutable execution view is required and gated but no feasible mechanism is specified, leaving a Phase 4 exit gate without a path

Severity: medium.

"Open plugin discovery" requires: "Runtime loading uses the verified artifact and
holds an immutable view, or equivalent certified exclusion of concurrent writes,
for as long as it can dispatch. Hashing a pathname and later loading mutable
bytes is insufficient." "Installation staleness" restates the guarantee: "The
immutable execution view prevents an edit after validation from silently
changing the implementation used for an admitted action." "Portable-install
test" makes it a gate: "Exercise an edit between validation and loading or
dispatch to prove the immutable execution view."

The requirement is correct and the threat is real. The problem is that Node
provides no portable way to satisfy it as written. An open file descriptor pins
inode contents for that descriptor, but ESM `import()` resolves and reads by
path, so the loader does not consult a descriptor the kernel is holding. A
plugin's dependency closure is loaded lazily across many files over the process
lifetime, so nothing is fully loaded at validation time. POSIX filesystems offer
no portable advisory or mandatory lock that excludes writes to a subtree, and no
portable snapshot primitive. A workspace or relative-filesystem adapter — a case
the artifact explicitly supports — sits in a writable working tree the
maintainer edits by design.

Failure scenario, concrete: Phase 4 implements the loader by hashing the
resolved closure at startup and importing by path. The mandated test edits a
transitive dependency of a workspace adapter between validation and the lazy
import that first reaches it. The edited bytes load. The test fails, and no
amount of work inside the stated design closes it, because the gap is in the
loader contract rather than in the implementation. The likely field response is
to weaken the test to hash-at-startup only, which reintroduces exactly the
time-of-check-to-time-of-use gap that "Hashing a pathname and later loading
mutable bytes is insufficient" was written to forbid — and the acceptance
criterion 8 claim that "loading, dispatch, and recovery use verified
implementation identities" becomes untrue while still reading as satisfied.

### R1-F009 — Acceptance criterion 11 has no verification coverage, and the artifact provides no criterion-to-test traceability

Severity: low-medium.

"Verification" enumerates seven test categories: core domain tests, adapter
conformance kit, transport parity, portable-install test, migration cutover
tests, host-policy tests, and live provider certification. None of them
exercises the learning plane. Acceptance criterion 11 — "Generated agent memory
is fingerprinted, replaceable, and non-authoritative" — has no corresponding
test, even though "Agent-host memory bridges" makes several behavioral promises
that are precisely the kind that regress silently: "Human-authored memory
outside the managed markers is never changed"; "It contains no credentials, live
issue state, or copied provider documentation"; and the asymmetry between
untracked targets, which regenerate, and tracked targets, which validate but
never rewrite.

Failure scenario, concrete: a bridge implementation has an off-by-one in
protected-marker parsing and rewrites several lines of a maintainer's
hand-authored `CLAUDE.md` below `<!-- aitm:learning:end -->`. No test in the
artifact's verification plan would catch it, and no release gate in the
"Release gates reject" list covers the memory projection either. The user's
authored content is destroyed by a generator that the document promises will
never touch it.

More generally, the artifact carries 21 acceptance criteria and seven test
categories with no mapping between them, so a gap like this is discoverable only
by manual cross-reading. Given that the acceptance criteria are the approval
surface for each phase, the absence of traceability is itself a defect in a
document whose central discipline is refusing unverified claims.

## Required changes

1. Resolve Finding 1 before Phase 1 is scoped. Either name the concrete GitHub
   mechanism by which the built-in adapter certifies one of the two execution
   modes — including how a stale owner is rejected at the effect boundary, given
   that issue-comment and Projects v2 mutations expose no compare-and-swap — or
   state plainly in the artifact that GitHub cannot certify either mode, and
   specify what AITM does in that case. If the honest answer is a reduced
   assurance tier for providers without a conditional-write primitive, say so
   explicitly and define what that tier permits, rather than leaving the
   implementation to discover at the conformance gate that the default
   configuration blocks all mutation. Add the resolution to the Phase 1 exit
   conditions.

2. Break the deadlock in Finding 2. Extend the staleness section with the same
   carve-out the retention section already grants, in equivalent language: read-
   only diagnosis and governed evidence recovery remain available under
   diagnostic-only mode. Enumerate exactly which appends are permitted while
   stale — at minimum `action.reconciled`, `action.retry-authorized`, and
   `action.intervention-required` — and state that they run under recovery
   ownership without admitting new business effects. Correspondingly, soften
   "Setup inventories pending actions … It must either settle them" so that
   settling is reachable from the stale state.

3. Replace exact-version staleness with compatibility-range staleness
   (Finding 3). Classify "Core differs from setup generator" as stale only when
   the difference crosses a declared compatibility boundary — the setup ABI, a
   configuration or capability schema version, or a generated-artifact content
   hash. A core version difference that crosses none of those should be reported
   as an advisory in `aitm doctor` and must not disable mutating tools. The
   `coreApi` range already present in the adapter manifest is the right model to
   extend to the core itself.

4. Add an explicit cost and quota budget for the governed action protocol
   (Finding 4). State the per-action write amplification the protocol imposes,
   require each `work-items` adapter to declare its sustainable governed-action
   rate and its evidence-volume characteristics during setup certification, and
   specify how provider throttling is classified. In particular, distinguish a
   throttled-but-unsent write from a genuinely uncertain append, so that an
   ordinary `Retry-After` response does not escalate to
   `action.intervention-required`. If the GitHub adapter needs a durable
   client-side idempotency marker embedded in the comment body to make throttled
   appends recoverable by search, specify it here rather than deferring it. Add
   the unbounded per-issue comment growth to the Negative consequences list with
   its mitigation.

5. Remove the ability of a memory-projection mismatch to disable mutation
   (Finding 5). A tracked-target fingerprint mismatch should produce a warning
   in results and a `doctor` diagnostic, not diagnostic-only mode. Reconcile the
   text with Goal 6 and acceptance criterion 11 so the projection is
   non-authoritative over execution as well as over state.

6. Define the authenticated initiating principal (Finding 6). Specify its
   source at the CLI and MCP boundaries, how it is authenticated, and what
   happens when no authenticated principal is available — for example, whether
   the deduplication scope degrades to the project authority alone, and what
   that implies for concurrent sessions sharing one provider credential. Add an
   adversarial case to "Core domain tests" covering two concurrent sessions
   under a shared provider credential submitting the same request key for
   distinct actions, asserting neither a false success nor a spurious conflict.

7. Enumerate the exclusive roles explicitly (Finding 7), replacing "Each
   exclusive role has one active writable binding. In particular …" with the
   actual set and the rationale for each. If `forge` or `ci` may have multiple
   concurrent writable bindings, specify the destination-resolution rule and
   require it to be identical across CLI and MCP; if they may not, remove
   "Implicitly selected forge or CI destinations" and require explicit selection.

8. Specify a feasible mechanism for the immutable execution view (Finding 8),
   or restate the requirement as something achievable. The workable approach is
   to materialize the verified closure into a content-addressed staging
   directory that the kernel owns and no other party writes, and to load
   exclusively from that path — which makes "holds an immutable view" an
   ownership property rather than an unavailable filesystem primitive. Whatever
   mechanism is chosen, name it in the artifact so the Phase 4 gate has a path.

9. Add learning-plane verification (Finding 9): protected-marker preservation
   against adversarial marker placement, non-rewriting of tracked targets,
   regeneration of untracked targets on fingerprint change, and absence of
   credentials and live state in the projection. Add a corresponding release
   gate.

10. Add an acceptance-criterion-to-verification traceability mapping covering
    all 21 criteria (Finding 9), so that coverage gaps are visible at approval
    time rather than by manual cross-reading.

## Optional suggestions

1. The artifact specifies `"peerDependencies": { "@kburson/ai-task-manager":
   "^2.0.0" }` and `"coreApi": "^2"` while the package is at `0.1.0`
   (verified in `package.json`). Add a short note on the versioning plan —
   whether the ABI ships with a 2.0.0 major, and how `coreApi` relates to the
   package's semver — so plugin authors targeting the SDK know what to declare.

2. Phase 1 currently carries the kernel extraction, canonical schemas, request
   keys, execution ownership, bootstrap recovery, evidence-append certification,
   migration cutover, approval provenance, the GitHub adapter, the local Git
   port, and fork-join replay. That is in tension with acceptance criterion 14
   ("Each delivery phase has its own bounded specification, plan, tests, and
   approval"). Consider splitting it — for example, kernel plus schemas plus
   GitHub reads; then durable request identity and execution ownership; then
   evidence-append and bootstrap recovery; then migration cutover — so each has
   an independently approvable exit gate.

3. "Portable and extension invocation" requires that every agent-callable
   portable action have an MCP route, and "Release gates reject" bars
   "agent-callable actions without a tested MCP invocation route." Consider
   stating how `orchestrator-only` is assigned and reviewed, since it is the
   one classification that exempts an action from that gate and is therefore the
   natural place for coverage to quietly erode.

4. Consider adding an adversarial case for clock skew across clones. Evidence
   records carry a timestamp, and several rules reason about ordering, lease
   expiry, and "an earlier attempt remains in flight." Making explicit that
   ordering derives from the hash chain rather than from wall-clock timestamps
   would close a plausible misimplementation.

5. The Negative consequences list is honest and useful. Consider adding two
   entries surfaced above: the per-action write amplification against external
   authorities, and the operational cost of a fail-closed posture whose trigger
   granularity is coarse — both are real costs a maintainer should see before
   approving the architecture.

## Decision

revisions-requested
