# Guided Co-Review Startup and Agent Handoffs

**Issue:** #1269

**Status:** Approved design

**Depends on:** #1268

**Surface:** `npx aitm co-review start`

## Provenance

This design follows the reusable co-review handshake delivered by #1266 and the
finalization, budget-control, and recovery extensions approved and merged for
issue #1268. It does not reopen or revise either design. It adds an onboarding layer
above the existing protocol primitives so a human can initialize a review and
hand each configured agent a complete, durable role directive.

The approved product decisions are:

- add a human-friendly `start` command while preserving `init` as the low-level
  primitive;
- run an interactive wizard by default and support equivalent flags for
  automation;
- generate one detailed handoff document for the author and one for the reviewer;
- print only a thin copy/paste prompt for each agent;
- default the review budget to 10 reviewer turns; and
- default waiting to 20 individually observed intervals of 60 seconds.

## Purpose

The existing command surface is intentionally explicit: callers initialize a
protocol, inspect status, claim a role, wait, and hand off immutable artifacts.
That is a strong recovery model but a poor first-run experience. A human must
currently assemble command flags, role instructions, paths, lifecycle rules, and
wait behavior by hand. Small omissions can leave an agent waiting for too little
time, acting under the wrong role, or depending on chat context that disappears
during compaction.

`co-review start` makes startup simple without weakening the underlying protocol.
It initializes the same state as `init`, derives two self-contained handoffs from
validated protocol data, and prints two minimal prompts that tell the agents where
to find their instructions.

## Selected Architecture

### Friendly wrapper over the existing protocol

`start` is an onboarding wrapper, not a second protocol implementation. It reuses
the existing initialization API for repository validation, ignored-runtime
validation, identities, artifact hashing, initial state, events, and mutex
semantics. It must not duplicate or subtly vary `init` lifecycle logic.

After initialization succeeds, a focused handoff generator renders role-specific
documents from the validated state and the startup wait configuration. Startup
publishes the generated files atomically inside the ignored protocol directory.
The normal co-review state and event schemas remain authoritative for lifecycle
recovery.

The protocol retains the established `owner` identity and state terminology.
Generated human-facing output labels that role **Author**, because that is the
clearest description of the agent that owns and commits the reviewed artifact.

### Boundary

`start` does not:

- launch, message, or authenticate an agent;
- edit or commit the authoritative artifact;
- create a branch, worktree, issue, task timer, push, or pull request;
- interpret the quality of a review or author response;
- replace `status`, `claim`, `wait`, `handoff`, budget controls, or finalization;
  or
- make accepted or intervention-required lifecycle decisions for the human.

Its only repository-local mutations are the same ignored protocol state created by
`init` plus its generated startup materials.

## Command Contract

### Interactive form

```text
npx aitm co-review start
```

When required values are absent and standard input is interactive, the wizard
collects:

1. authoritative tracked artifact path;
2. protocol directory, with the derived default offered;
3. owner identity, labeled Author;
4. reviewer identity;
5. maximum reviewer turns, default `10`;
6. wait cycles, default `20`; and
7. wait interval in seconds, default `60`.

The wizard displays the complete resolved configuration and requires confirmation
before mutation. Cancellation exits successfully with a clear `no state changed`
message.

### Flag form

```text
npx aitm co-review start \
  --artifact <tracked-repository-path> \
  --owner <author-identity> \
  --reviewer <reviewer-identity> \
  [--dir <ignored-runtime-path>] \
  [--max-turns <positive-integer>] \
  [--wait-cycles <positive-integer>] \
  [--wait-interval <seconds>]
```

Supplying every required value bypasses the wizard and is safe for automation.
When standard input is non-interactive, a missing required value is invalid usage;
the command does not attempt to prompt.

Omitting an optional limit applies its default:

| Option            | Default | Meaning                                      |
| ----------------- | ------: | -------------------------------------------- |
| `--max-turns`     |      10 | Maximum successful reviewer handoffs         |
| `--wait-cycles`   |      20 | Maximum bounded waits in one waiting episode |
| `--wait-interval` |      60 | Seconds in each bounded wait                 |

An option token supplied without a value remains invalid usage. Defaults apply
when the option is omitted, not when a malformed option is supplied.

`--max-turns` retains the initialization minimum of one. `--wait-cycles` must be
a positive integer. `--wait-interval` must be an integer from 1 through 60 so each
generated wait remains within the existing bounded `wait` contract.

### Derived protocol directory

When `--dir` is omitted, `start` derives a unique ignored path below:

```text
.tmp/co-review/<artifact-slug>-<creation-id>
```

The slug comes from the artifact filename and the creation identifier prevents an
unrelated existing review from being selected implicitly. The resolved absolute
directory is embedded in both generated handoffs and their terminal prompts.

If startup fails after resolving or creating the directory, its diagnostic prints
the exact directory and an exact retry command. A retry uses that explicit
`--dir`; it never derives a second directory and silently abandons recoverable
state.

## Generated Materials

Successful startup adds these files beneath the ignored protocol directory:

```text
author-handoff.md
reviewer-handoff.md
start-manifest.json
```

`start-manifest.json` is startup metadata, not lifecycle authority. It records:

- a startup schema identifier;
- protocol ID and runtime directory;
- artifact, owner, and reviewer values;
- review-turn and wait defaults or overrides;
- generated handoff paths and SHA-256 values; and
- creation timestamp.

The manifest makes exact retry and conflict detection deterministic without adding
onboarding fields to `aitm.co-review/v1`. Protocol state remains authoritative for
role, claim, round, artifact commit, budget use, immutable artifacts, lifecycle,
and integrity.

### Common handoff content

Both role documents are repository-ready Markdown generated with concrete values,
not placeholders. Each includes:

- repository root, worktree, branch, protocol directory, protocol ID, and artifact
  path;
- configured owner and reviewer identities and the recipient's exact actor value;
- the configured review-turn budget and wait policy;
- a direction to treat repository and protocol state as authoritative after chat
  loss or compaction;
- immediate `status` and integrity checks;
- exact `claim`, `wait`, and role-appropriate `handoff` command shapes;
- immutable-artifact and non-stealing-lock rules;
- exit-code handling;
- accepted and intervention-required terminal behavior; and
- the boundary between agent actions and human-authorized budget/finalization
  decisions.

The generated documents use the installed #1268 command surface and recovery
semantics. Help and template tests prevent the handoffs from silently drifting
away from command-specific help.

### Author handoff

The author document additionally requires the agent to:

- edit and commit only the authoritative artifact when changes are required;
- read the complete immutable reviewer document for the current turn;
- verify each finding against repository evidence;
- write one response marker and allowed disposition for every finding;
- provide evidence for rejection and a governed follow-up plus safe boundary for
  deferral;
- verify artifact, index, committed blob, and response before handoff; and
- transfer the turn to the reviewer, then enter the bounded wait discipline.

### Reviewer handoff

The reviewer document additionally requires the agent to:

- review the exact artifact commit recorded by the owner handoff;
- preserve author/reviewer role separation and avoid editing the artifact;
- write a new immutable review with unique finding identifiers;
- make the decision explicit as `accepted` or `changes-requested`;
- acknowledge any required supplemental context;
- provide required exhaustion evidence when the current command surface demands
  it; and
- hand off the completed review, then enter the bounded wait discipline when the
  lifecycle remains active.

## Thin Terminal Prompts

The command prints prompts only after protocol initialization, the manifest, and
both handoff documents are complete and hash-verified. Normal successful output is
limited to two labeled copy/paste blocks:

```text
AUTHOR PROMPT
Read and follow this handoff completely, then begin:
<absolute-path-to-author-handoff.md>

REVIEWER PROMPT
Read and follow this handoff completely, then begin:
<absolute-path-to-reviewer-handoff.md>
```

The terminal does not separately list generated paths, repeat commands, summarize
the handoffs, or print a tutorial. The prompt stays intentionally thin because the
durable file is the recovery surface.

## Bounded Wake Discipline

When the other role owns the turn, each handoff directs its agent to run:

```text
npx aitm co-review wait \
  --dir <resolved-protocol-directory> \
  --actor <configured-actor> \
  --timeout <wait-interval>
```

The default episode is at most 20 waits of 60 seconds each. Every wait is a
separate observed agent tool call; the instructions must not hide all cycles in an
unobserved shell loop.

After each result, the agent:

1. records progress as `wait cycle N/20` using the configured maximum;
2. treats exit 3 as an ordinary timeout and starts the next wait only when cycles
   remain;
3. treats exit 0 as a wake event, runs `status`, and claims or handles the reported
   terminal state;
4. treats exit 1 or 2 as a refusal, reports the exact diagnostic, and stops; and
5. after the final ordinary timeout, runs `status`, reports it to the human, and
   stops without starting another batch automatically.

After compaction, the agent rereads its handoff, runs `status`, and resumes from the
last visible `wait cycle N/<max>` marker. If the completed-cycle count cannot be
recovered reliably, the agent stops and reports that ambiguity instead of resetting
the counter and exceeding the configured maximum.

Any successful handoff starts a new waiting episode for the role that just handed
off. Wait progress is operational agent context and does not mutate co-review
protocol state.

## Validation, Retry, and Failure Atomicity

Before mutation, `start` validates:

- Git repository and worktree identity;
- tracked, regular, repository-contained artifact;
- ignored, repository-contained runtime directory without symbolic-link escape;
- distinct nonempty owner and reviewer identities;
- numeric option bounds;
- compatibility with any existing protocol and startup manifest; and
- absence of conflicting generated documents.

The generator renders complete bytes in memory before publication. Files use
same-directory temporary writes and atomic rename. No prompt is printed until all
three startup files exist with the hashes recorded in the manifest.

An exact retry against the same directory is idempotent:

- identical initialized state, settings, documents, and hashes print the same two
  prompts without adding protocol events;
- a missing generated file may be reconstructed only when validated protocol state
  and all surviving startup material match the retry inputs;
- changed bytes, changed settings, changed identities, a different artifact, or an
  incompatible lifecycle refuse without overwriting anything; and
- a partially initialized protocol is recovered through the exact printed command,
  never by deleting or rewriting protocol files manually.

The command follows the existing exit model: 0 for success or cancellation, 1 for
runtime/integrity/protocol refusal, and 2 for invalid usage. Diagnostics include
`no state changed` when no mutation occurred and distinguish a recoverable
post-initialization publication failure from a pre-initialization refusal.

## Help and Documentation

The command is added to top-level co-review help in lifecycle order before the
low-level primitives. `co-review help start` documents:

- interactive and flag forms;
- required values and all defaults;
- derived directory behavior;
- generated file names and thin output;
- role and lifecycle boundaries;
- wait-cycle semantics and compaction recovery;
- exact retry and partial-failure recovery; and
- explicit non-goals, especially that no agents are launched.

Examples cover an interactive start, a fully flagged automated start, an exact
retry using a printed directory, and the two prompts handed to separate agents.

## Testing Strategy

Focused automated coverage uses temporary Git repositories and injected input,
clock, filesystem, and initialization dependencies. Tests cover:

- interactive answers, confirmation, and cancellation;
- complete non-interactive invocation;
- missing required input without a TTY;
- defaults of 10 reviewer turns, 20 wait cycles, and 60 seconds;
- every numeric override and invalid boundary;
- unique ignored directory derivation and symbolic-link/path refusal;
- delegation to existing initialization semantics;
- concrete author and reviewer handoff content;
- exact thin prompt output with absolute paths;
- separate observed wait-cycle instructions, exhaustion, compaction recovery, and
  exit-code handling;
- startup manifest paths and hashes;
- exact retry with no duplicate protocol event;
- conflicting retry and changed generated bytes;
- injected failure before initialization, after initialization, and between
  generated-file publications;
- preservation of runtime originals and unrelated dirty repository files;
- top-level, command-specific, and package-facing help; and
- compatibility of all existing `init`, `status`, `claim`, `wait`, `handoff`,
  budget-control, and finalization forms.

The documentation-only delivery of this design is verified with focused Prettier,
CSpell, Markdownlint, `git diff --check`, and an exact one-file diff review. The
later implementation remains a separate governed delivery after the specification
is reviewed and approved on trunk.
