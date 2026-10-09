# Manual Cross-Provider Peer Review: What It Proves—and What the Tool Still Adds

<!-- cspell:words Anthropic API's argv Codex decorrelate decorrelation dont etime headlessly inspectable JSONL OpenAI performatively pgrep reprioritize stderr stdin stdout tfvars toolchain worktree -->

Two AI agents can conduct a serious, evidence-producing peer review without a
dedicated peer-review application. I know because I just orchestrated one.

Codex authored a consequential infrastructure specification. Claude Opus
reviewed it from a headless Claude Code session. Codex investigated every
finding, revised the specification, committed the review record, resumed the
same Claude session, and obtained terminal agreement. The process found a
critical defect that would have made the proposed Terraform operation
unimplementable.

That success raises a fair question: if a capable agent can coordinate the
whole review with ordinary Git and a provider CLI, is `ai-peer-review` still
needed?

My conclusion is yes—but for a narrower and more important reason than “two
agents need help talking.” They do not. The tool is useful because communication
is not the hard part. Durable authority, role enforcement, exact state,
recovery, and repeatability are the hard parts.

This is a case study, not a controlled benchmark. It documents exactly how the
manual review worked, compares cross-provider review with a same-provider
spawned reviewer, and separates what one successful run proves from what it
does not.

## The review in one picture

```text
committed author artifact
        |
        v
headless Claude review session -- reviewer findings --> tracked review file
        ^                                                   |
        |                                                   v
same provider session ID                         Codex verifies each finding
        |                                                   |
        +-- resume with revised commit <--- triad commit <--+
                                        |
                                        v
                              terminal AGREED response
                                        |
                                        v
                          separate agreement commit
```

The roles remained asymmetric:

- Claude could inspect and criticize, but was told not to edit or commit.
- Codex owned every repository write and every commit.
- The original specification was committed before review.
- The first review, revised specification, and author response were committed
  together.
- Claude's final agreement was committed separately.
- Human ratification remained a later gate. Reviewer agreement did not replace
  it.

## What was being reviewed

The artifact was an issue-numbered design for repairing a greenfield Terraform
sequencing defect. The exact domain is less important than the risk profile:

- it governed a future cloud mutation;
- it involved Terraform state ownership and targeted plans;
- it handled the boundary before importing an OAuth provider secret;
- it needed explicit approval, receipt, recovery, and secrecy contracts; and
- an internally consistent but unimplementable design could waste a full
  release cycle or encourage an unsafe workaround.

The review was source-only. Neither agent was authorized to mutate cloud state,
run a lifecycle operation, import a credential, publish an image, or change an
issue during review.

## The procedural memory that helped

Codex did not invent the process from nothing. Persistent memory from earlier
manual peer reviews supplied a procedural pattern:

1. Codex is the author and Claude is the reviewer.
2. The reviewer remains read-only.
3. The author commits the initial artifact before review.
4. The author independently verifies findings instead of accepting them
   performatively.
5. The reviewer response, revised artifact, and author response form one commit
   triad.
6. The same reviewer is asked to verify the response and revision.
7. Terminal agreement is committed alone.
8. Specification agreement and human ratification precede implementation-plan
   creation.

Memory supplied the choreography, not current truth. Codex reread the present
repository, current branch, source files, tests, and prior review artifacts
before applying it. This distinction matters: remembered procedure can save
time; remembered code facts can silently become stale.

A lightweight memory lookup can look like this:

```bash
rg -n 'peer.review|Claude reviewer|author response|terminal agreement' \
  "$CODEX_HOME/memories/MEMORY.md"
```

The memory record should never be treated as proof that the current artifact,
source, or Git state still matches a prior run.

## Step 1: isolate the author work

The author created an isolated Git worktree and branch from the current remote
trunk. The exact artifact was written, self-reviewed, and committed before
Claude saw it.

The important preconditions were:

- the artifact was a regular tracked file;
- the worktree was clean after the author commit;
- the reviewed commit had an unambiguous parent;
- unrelated work was absent from the branch; and
- baseline tests had already established that the starting repository was
  healthy.

The initial author commit played two roles. It made the reviewer target stable,
and it made later revisions inspectable as a delta from a known baseline.

## Step 2: inspect the reviewer CLI before using it

Codex did not assume the installed Claude interface. It checked the executable,
version, and current flags first:

```bash
command -v claude
claude --version
claude --help
```

The relevant capabilities were:

- `-p` or `--print` for a non-interactive headless turn;
- `--output-format json` for a machine-readable result envelope;
- `--model opus` and `--effort max|high` for explicit reviewer selection;
- `--permission-mode` and `--tools` for constraining tool access; and
- `-r` or `--resume <session-id>` for continuing the same Claude session.

Checking help at runtime avoided relying on remembered flags from an older
Claude Code release.

## Step 3: construct an evidence-oriented review prompt

The first reviewer handoff named five things explicitly:

1. **Identity and role:** Claude was the independent reviewer; Codex remained
   the author.
2. **Immutable target:** the exact artifact path and author commit.
3. **Evidence sources:** the actual Terraform declarations, operator commands,
   approval validators, adapters, tests, runbooks, and package scripts Claude
   needed to inspect.
4. **Authority boundary:** no editing, commit, push, issue mutation, cloud call,
   secret access, or lifecycle operation.
5. **Response contract:** findings ordered by severity, each with a stable ID,
   precise reference, source evidence, consequence, recommendation, and a final
   `AGREED` or `REVISE` verdict.

The reusable shape was:

```text
Act as the independent peer reviewer for <issue> in this repository.
Review <artifact-path> at commit <author-commit>.

Inspect <enumerated source contracts>. Do not edit files, commit, push,
mutate external systems, access secrets, or run operational commands.

Evaluate correctness, completeness, security, ownership, approval and receipt
closure, recovery, downstream compatibility, and testability.

Report Critical, Important, and Minor findings. For each finding include a
stable ID, precise artifact reference, repository evidence, consequence, and
an actionable recommendation. Identify contradictions or unimplementable
requirements. End with exactly AGREED or REVISE. Return Markdown only.
```

This was not a generic “review this” request. Enumerating likely evidence and
requiring consequences made it harder for the review to drift into style
preferences or unsupported architectural taste.

## Step 4: launch Claude headlessly

The initial launch used this command shape:

```bash
claude -p \
  --model opus \
  --effort max \
  --permission-mode plan \
  --tools "Read,Grep,Glob,Bash" \
  --output-format json \
  '<review prompt>'
```

Codex launched it through a process runner that could yield a local process
handle while Claude continued. That created two identifiers with different
meanings:

| Identifier           | Purpose                                                    | Durable reviewer identity?                 |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| Local process handle | Poll stdout or send an interrupt to the running OS process | No                                         |
| Claude `session_id`  | Resume Claude's conversation and accumulated context       | Yes, within Claude Code's session contract |

Confusing these would have broken recovery. The process handle existed only in
Codex's runner. The provider session ID arrived in Claude's JSON result.

While the command ran, Codex yielded output in bounded intervals rather than
using a long blocking wait. It also checked the process without killing it:

```bash
ps -o pid,etime,state,%cpu,%mem,command -p <pid>
pgrep -P <pid>
```

These checks showed the Claude process alive, but eventually idle, with no
child shell command running.

## Step 5: recover from the long first turn

The first attempt did not return a review after more than thirteen minutes. A
human observer reasonably wondered whether Claude was waiting for permission to
run a command. Codex had made the same inference.

The process was interrupted with `Ctrl-C`. Claude then returned a JSON error
envelope containing the facts that were not visible during the wait:

```json
{
  "subtype": "error_during_execution",
  "stop_reason": "tool_use",
  "terminal_reason": "aborted_streaming",
  "session_id": "<claude-session-id>",
  "permission_denials": [],
  "num_turns": 25
}
```

The empty `permission_denials` array matters. The permission-wait theory was
plausible, but the returned evidence did not confirm it. The precise conclusion
was only that the turn remained in tool use until interrupted.

This is an instructive weakness in manual orchestration: while the process was
running, the orchestrator and human had incomplete state and began reasoning
from symptoms.

Instead of discarding the expensive investigation, Codex resumed the provider
session and narrowed its capabilities:

```bash
claude -r <claude-session-id> -p \
  --model opus \
  --effort high \
  --permission-mode dontAsk \
  --tools "Read,Grep,Glob" \
  --output-format json \
  'Continue from the evidence already collected. Use no shell. Finish and
  return only the required Markdown review.'
```

The second command retained Claude's original context but removed Bash
entirely. It completed in about 100 seconds and returned the first review.

This was better than starting a fresh reviewer because the initial session had
already spent substantial context inspecting the repository. It was also safer
than restoring broad tools merely to preserve momentum.

## Step 6: collect the review as governed evidence

The successful JSON envelope contained:

- `subtype: "success"`;
- the same provider `session_id`;
- the Markdown review in `result`;
- model and token usage;
- duration and reported cost; and
- `permission_denials: []`.

Codex extracted only the Markdown review and wrote it to the repository's
tracked review directory. The provider session ID, raw result envelope, process
handle, cost telemetry, and local transcript details did not enter the governed
review artifact.

This separation kept the durable artifact readable and avoided publishing raw
provider-session identity. It also exposed another manual weakness: Codex was
responsible for copying the review result accurately. Git could prove what was
committed, but there was no protocol-generated hash proving the tracked file
was byte-for-byte identical to the provider result.

Claude's first verdict was `REVISE`. It reported:

- one Critical finding;
- two Important findings; and
- four Minor findings.

The Critical finding was material. The design required
`deployment_phase=full` for a targeted Terraform plan, but full-phase variable
validation required immutable release images that did not yet exist. Terraform
evaluates those variable validations even with `-target`, so the proposed
greenfield operation could not run as designed.

That is exactly the kind of defect peer review should find: locally plausible,
internally consistent prose contradicted by the executable source contract.

## Step 7: treat findings as hypotheses, not orders

Codex read the complete review, restated each requirement, and verified it
against the repository before editing the specification.

The findings were mostly correct, but two recommendation details needed
correction:

- Claude described the live bootstrap `.tfvars` as committed. The repository
  committed only an example and ignored the live file.
- Claude suggested verifying Terraform `prevent_destroy` from the plan's
  configuration representation. The repository's Terraform JSON plan did not
  expose that lifecycle meta-argument.

Codex accepted the intended outcomes while correcting the mechanisms:

- use the existing bootstrap phase and digest-bind the ignored validated input
  file;
- verify real provider/API metadata fields from the plan and live object; and
- verify `prevent_destroy` through a source-structure assertion bound to the
  exact source SHA and hosted CI.

This is why a second agent should not be treated as an oracle. Cross-provider
diversity can produce better challenge, but every finding still needs evidence.

Codex then produced three tracked changes:

1. Claude's reviewer response;
2. the revised specification; and
3. Codex's author response, with a disposition for every finding.

Those three files were committed together. The commit made “the revision that
answered this review” one inspectable unit.

## Step 8: resume the same reviewer for agreement

Codex resumed the same Claude session again, pointing it at the triad commit and
the three exact files:

```bash
claude -r <claude-session-id> -p \
  --model opus \
  --effort high \
  --permission-mode dontAsk \
  --tools "Read,Grep,Glob" \
  --output-format json \
  'Read the revised artifact, preserved review, and author response at
  <triad-commit>. Verify every finding disposition against repository source.
  Report unresolved or new findings. End with exactly AGREED or REVISE.'
```

The session continuity was real: Claude referred to its original findings,
verified the author's two evidence corrections, and checked every disposition.
It returned `AGREED` with no new findings or unresolved disagreements.

Codex saved that response as a terminal agreement artifact and committed it
alone. The worktree was then checked for:

- no uncommitted changes;
- only specification and specification-review paths relative to remote trunk;
- no implementation plan;
- no source implementation;
- no whitespace errors; and
- an explicit terminal `AGREED` marker.

Only then was the specification presented to the human for ratification.

## The exact evidence shape

The manual process produced this durable structure:

```text
docs/superpowers/specs/<issue-numbered-design>.md
docs/superpowers/reviews/specs/<review-name>/
├── <review-01>.md
├── <author-response-01>.md
└── <review-02-agreed>.md
```

And this Git history:

```text
commit A  author baseline specification
commit B  reviewer response + revised specification + author response
commit C  reviewer terminal agreement
```

The artifact history was strong enough for a human to reconstruct the argument.
It was not a complete machine-governed protocol record. There was no append-only
event ledger, response seal, participant fingerprint manifest, formal turn
claim, maximum-turn policy, or human-authority challenge.

### Recovery attempts belong to one review record

An interrupted provider process, a failed submission boundary, and a fresh
inspection are separate protocol attempts even when a human experiences them as
one review. The package therefore uses two identities:

- `review_id` is the immutable event, claim, participant, and scratch-workspace
  boundary for one attempt.
- `record_id` is stable routing and lineage metadata for the complete
  human-facing review record. It is never acceptance authority.

A replacement attempt starts with a new `review_id` and the prior `record_id`.
The predecessor is explicitly `superseded`, which terminates it without
fabricating acceptance. A completed-looking response with `submitted_at: null`
is indexed as `not-submitted`; an untouched generated template is `incomplete`.
Only sealed submission events and terminal protocol authority establish a
decision.

For legacy per-attempt directories, `consolidate` first produces a non-mutating
map of every old path, new path, collision, and SHA-256 digest. Apply then
publishes all destination bytes, verifies them, writes an ordered
`review-history.md` and additive `relocation-receipt.json`, and only afterward
removes sources. Sealed response and manifest bytes—including their historical
internal paths—remain unchanged. The receipt resolves old paths to the current
review-of-record folder, and the normal-mode commit is restricted to that exact
relocation delta.

## Time and cost observed in this case

Claude Code's JSON envelopes reported approximately:

| Provider turn                        |                 Wall time | Reported cost | Outcome                     |
| ------------------------------------ | ------------------------: | ------------: | --------------------------- |
| Initial maximum-effort investigation |     13 minutes 44 seconds |         $4.20 | Interrupted during tool use |
| Resumed first review                 |       1 minute 40 seconds |         $1.97 | `REVISE`                    |
| Resumed disposition verification     |      2 minutes 23 seconds |         $5.33 | `AGREED`                    |
| **Total**                            | **17 minutes 47 seconds** |    **$11.50** | Ratification-ready review   |

These numbers are one provider's reported telemetry from one unusually deep
review. They are not a price guarantee or a fair benchmark against a spawned
Codex reviewer. They do show that cross-provider review has real latency and
cost, especially when a headless turn spends a long time gathering evidence.

The human and Codex time spent writing, verifying, committing, and relaying the
artifacts is not included.

## Does cross-provider review add value?

Yes, especially for consequential designs—but not because a different logo
automatically makes a review independent.

A cross-provider reviewer can bring different:

- training and post-training choices;
- model architecture and inference behavior;
- system instructions and tool-use conventions;
- failure habits and safety boundaries;
- context-selection heuristics; and
- tendencies around confidence, literalness, and architectural complexity.

Those differences can reduce correlated blind spots. In this case, Claude
challenged a phase-selection assumption that had survived Codex's own design
and self-review. Claude also made two inaccurate implementation suggestions,
which Codex caught. That combination is healthy: useful disagreement followed
by source-grounded resolution.

Cross-provider review also creates a stronger social and cognitive boundary.
The reviewer is not a child process produced by the same provider's orchestration
stack, and it does not automatically inherit the author's hidden reasoning.
That can make it easier to question framing assumptions instead of merely
checking execution details.

But provider diversity is only a proxy for independent error. Both agents still
read the same repository, received the same problem framing, and optimize for
similar software-engineering norms. They can agree and still be wrong. A vague
prompt can make two different models repeat the same superficial review. A
careful same-provider reviewer can outperform a poorly instructed
cross-provider reviewer.

The practical rule is:

> Different providers can decorrelate reasoning errors. Evidence and role
> separation determine whether the review is trustworthy.

## What a same-provider spawned reviewer provides

A spawned reviewer from the same provider is still valuable. A distinct agent
can have:

- a fresh context window;
- a narrower reviewer role;
- different reasoning effort or model tier;
- independent repository exploration;
- no emotional or argumentative investment in the draft; and
- lower launch and coordination overhead.

For routine code and document checks, those benefits may be enough. Spawning is
fast, integrated with the author's environment, and easier to parallelize. The
parent can receive the result directly without launching an external CLI,
managing another provider's authentication, or translating handoffs.

The limitation is correlated behavior. If author and reviewer share the same
model family, system instructions, tool implementation, memory conventions, and
provider training, they may share the exact heuristic that created the defect.
Forking the author's entire conversation can also leak the author's framing and
make the reviewer less independent.

For a stronger same-provider review:

- create a genuinely distinct session;
- pass only the artifact, exact commit, review rubric, and necessary evidence
  paths—not the author's full reasoning transcript;
- use a different model or reasoning profile when practical;
- prohibit edits and commits;
- require stable finding IDs and source evidence; and
- have the author verify every finding before revising.

Same-provider spawning buys contextual independence. Cross-provider review adds
the possibility of model and toolchain independence.

## Comparison

| Dimension                | Same-provider spawned reviewer | Manual cross-provider reviewer                       | `ai-peer-review` protocol                                   |
| ------------------------ | ------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------- |
| Separate context         | Yes, if deliberately isolated  | Yes                                                  | Required as distinct registered sessions                    |
| Different model family   | Optional                       | Usually                                              | Optional; recorded as provenance                            |
| Different provider stack | No                             | Yes                                                  | Supported but not required                                  |
| Reviewer read-only rule  | Prompt/tool configuration      | Prompt/tool configuration                            | Protocol and repository boundary checks                     |
| Session identity         | Host-dependent agent identity  | Raw provider session ID managed manually             | Normalized one-way session fingerprint                      |
| Turn ownership           | Parent/orchestrator convention | Orchestrator convention                              | Explicit claims and event-derived state                     |
| Artifact binding         | Whatever the parent records    | Exact commit named in prompts                        | Exact tracked artifact/commit or no-commit snapshot digest  |
| Response integrity       | Parent receives result         | Author copies provider result                        | Sealed response and event digest                            |
| Handoff continuity       | Integrated agent messaging     | Provider `--resume` plus manual relay                | Manual, resume-only, or resident MCP handoff                |
| Failure recovery         | Parent-specific                | Manual process and provider session                  | Stable errors, reclaim/replacement, and recorded recovery   |
| Loop limit               | Parent policy                  | None unless manually imposed                         | Bounded turns plus human-approved continuation              |
| Human override           | Conversation instruction       | Conversation instruction                             | Explicit challenge/grant and manifest evidence              |
| Audit manifest           | Usually none                   | Git artifacts only                                   | Generated manifest with participant and decision provenance |
| Setup overhead           | Lowest                         | Moderate                                             | Highest initially; repeatable afterward                     |
| Best fit                 | Routine or low-risk review     | Consequential one-off with an attentive orchestrator | Repeated, consequential, team, or audit-sensitive review    |

The third column is not inherently “smarter” than the first two. It is more
governed.

## What the manual run did well

The manual process succeeded because the orchestrator supplied discipline that
software would otherwise supply:

- exact author and reviewer roles;
- a committed baseline;
- an evidence-specific review prompt;
- bounded, read-only reviewer tooling after recovery;
- persistent provider-session reuse;
- skeptical evaluation of every finding;
- explicit finding dispositions;
- coherent Git commit choreography; and
- a final human ratification gate.

For an experienced operator, this can be a legitimate workflow. It may be the
right choice for a one-off review where installing or configuring another tool
would cost more than the review itself.

## What the manual run could not prove

The same success depended on several facts that existed only as orchestrator
behavior:

- Claude's first launch included Bash, broader than the final review needed.
- Reviewer non-mutation was a prompt and tool-selection promise, not a
  package-enforced repository boundary.
- The review text was transferred into a tracked file by the author; no seal
  proved exact correspondence to provider output.
- Session continuity depended on preserving a raw provider session ID.
- The running turn exposed too little state to distinguish a permission wait
  from another tool-use delay.
- There was no formal maximum-turn budget.
- There was no append-only event ledger identifying the one legal next action.
- The reviewer agreement proved only Claude's conclusion, not human approval.
- Repeating the process required Codex to remember every convention correctly.

None of these caused corruption in this run. All are opportunities for drift in
the next one.

## So, is `ai-peer-review` still needed?

The manual run argues for the tool rather than against it.

It demonstrates that the core user need is real and that provider CLIs already
offer enough session capability to participate. The tool does not need to make
models intelligent, teach them how to read files, or invent a messaging system
for every review. It needs to turn a successful expert-operated pattern into a
deterministic protocol.

`ai-peer-review` adds value where failure has consequences:

1. **Distinct participant enforcement.** It checks session fingerprints instead
   of trusting role claims.
2. **Immutable state.** It derives review state from an append-only event ledger,
   not conversation memory.
3. **Repository boundaries.** It detects reviewer changes outside the one
   authorized response path.
4. **Artifact and response binding.** It records exact commits, paths, snapshots,
   and digests.
5. **Turn and recovery semantics.** It makes stale claims, participant loss,
   replacement, continuation, and abandonment explicit states.
6. **Human authority.** It distinguishes reviewer acceptance from human
   override or ratification.
7. **Repeatability.** A new operator or project can reconstruct the one next
   action without knowing this case's oral history.
8. **Provider neutrality.** The same protocol can use two Codex sessions, two
   Claude sessions, Codex and Claude, or another supported pair without making
   provider brand an eligibility rule.

The product question is therefore not “Can agents peer-review without this
tool?” They can.

The better question is:

> When the review matters, do we want correctness to depend on the orchestrator
> remembering and faithfully reenacting a manual protocol?

For low-risk work, that dependence may be acceptable. For infrastructure,
security, data migration, public releases, or a review process reused across
teams, it is a weak foundation.

## A practical selection rule

Use a same-provider spawned reviewer when:

- the artifact is low or moderate risk;
- fast feedback matters more than provider diversity;
- the author can cheaply verify every finding; and
- a durable review manifest is unnecessary.

Use a manually orchestrated cross-provider reviewer when:

- the decision is consequential enough to benefit from a different model
  family;
- the review is unusual or one-off;
- an experienced orchestrator will remain present;
- exact Git artifacts are sufficient evidence; and
- manual latency, provider authentication, and recovery are acceptable.

Use `ai-peer-review` when:

- the workflow will be repeated;
- reviewer non-mutation must be checked rather than requested;
- participant identity, turn ownership, and artifact digests matter;
- a review may survive session loss or operator handoff;
- human intervention needs an auditable grant;
- the review has a bounded escalation policy; or
- another person must be able to prove what was reviewed and accepted.

## What this suggests for the tool roadmap

The current package now has a narrower durable-wake coordinator for already
resident participants. It does not launch a headless provider. Instead, it
observes event authority outside both model contexts, reserves one immutable
wake operation per revision and recipient, and invokes only a validated
`live-wait` or official `native-push` adapter. Filesystem hints and periodic
reconciliation share that path, so missed notifications and process replacement
do not require a human to relay a prompt.

When this coordinator is active, neither participant should reproduce the
bounded process polling used in the historical case study above. The host runs
`peer-review coordinator run <workspace>` or schedules `coordinator reconcile`
outside participant context. `peer-review status <workspace> --next` remains a
single bounded manual fallback after a visible capability refusal; it is not a
polling loop.

The remaining roadmap boundary is provider launch and long-running headless
turn observability:

The case study suggests a useful integration direction without changing the
protocol's provider-neutral core: make external headless sessions easier to
operate as adapters.

A future adapter could:

- construct a provider-specific read-only launch profile;
- distinguish the local process handle from provider session identity;
- ingest the provider's structured result and seal the exact response bytes;
- record duration, tool state, termination class, and bounded cost telemetry as
  non-authoritative diagnostics;
- detect a long-running tool turn and present evidence-based recovery choices;
- resume the exact provider session without exposing its raw identifier in
  tracked collateral; and
- fall back to the existing manual invitation and recovery path when the
  provider CLI changes.

That would automate the awkward part of this case without making provider
launching a requirement for the protocol. The protocol should continue to
support human-opened interactive sessions and same-provider pairs.

## Reproducing the manual pattern

The packaged protocol also supports a phased `spec,plan` session without adding
participant polling. `start --phases spec,plan` freezes the order in event
authority. A non-final `finalize` writes phase evidence, and the registered
author then runs the exact `advance <workspace> <artifact>` action returned by
`status --next`. That handoff resumes the same reviewer and resets the bounded
turn budget for the new phase; final-phase acceptance keeps the existing
terminal record behavior.

For a one-off review without `ai-peer-review`, use this checklist:

1. Start from a clean isolated worktree.
2. Commit the author artifact alone.
3. Inspect the reviewer CLI's current help and version.
4. Give the reviewer the exact artifact path, commit, evidence files, authority
   restrictions, finding schema, and terminal verdict values.
5. Prefer `Read`, `Grep`, and `Glob`; add shell access only for a concrete
   read-only need.
6. Request structured output and preserve the provider session ID privately.
7. Poll with bounded waits and distinguish process state from provider-session
   state.
8. Preserve the reviewer response before changing the artifact.
9. Verify each finding independently against current source.
10. Commit the reviewer response, revised artifact, and author response
    together.
11. Resume the same reviewer session against that exact commit.
12. Commit terminal agreement separately.
13. Verify the final path set, Git state, verdict, and absence of unauthorized
    changes.
14. Ask the human to ratify the artifact before planning or implementation.

This checklist can reproduce the behavior. It cannot, by itself, provide the
machine-enforced guarantees of a protocol engine.

## Final assessment

The most important result was not that Codex could open Claude Code. It was that
two different agents disagreed productively, checked each other against source,
and left a review record that a human could inspect.

The same-provider versus cross-provider choice is a risk and economics decision,
not a purity test. A fresh same-provider agent is far better than unchallenged
self-review. A cross-provider agent can add valuable error decorrelation. Neither
substitutes for evidence.

Manual orchestration proves the workflow is possible. `ai-peer-review` exists to
make it dependable when nobody should have to rely on the orchestrator having a
particularly good day.
