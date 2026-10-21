# ai-peer-review

Two AI agents, one document, and a set of rules that keeps them honest.

`ai-peer-review` sets up a real peer review between two AI sessions: one wrote
the spec, the other pulls it apart. The reviewer can raise findings but cannot
touch the document or the Git history. The author makes every change and owns
every commit. What you get back is the review itself, committed next to the work
it reviewed.

It works with Claude Code, Codex, Grok, or any agent that can run a shell
command. It requires Node.js 24 or later, recommends Node.js 26 or later, and
uses two exact-pinned runtime dependencies for its MCP transport and closed
validation boundary.

## Why bother

An agent asked to review its own spec will usually tell you it looks great. A
second session — one that did not write it and has nothing to defend — gives you
a genuinely different read.

Left alone, though, two agents in one repository get creative. The reviewer
starts "helpfully" editing the document it is supposed to be reviewing. Nobody
can say which version was actually agreed on. The reasoning lives in a chat log
that vanishes when the window closes.

So this package gives them lanes:

- The **reviewer** reads, and writes findings into one file. No edits to the
  artifact, no commits, no pushes.
- The **author** makes every change and creates every commit.
- Every step is appended to an event ledger, so the state of the review is
  something you can check rather than something an agent remembers.

Chat is the operational notification channel: a short status, a pointer to the
relevant review document, the exact next action, or a concise blocker. Generated
reviewer and author response documents are the authoritative communication
channel for complete findings, dispositions, revisions, rationale, decisions,
and verification evidence. Participants read those durable documents instead
of relying on chat summaries, and do not paste their contents back into chat
unless the human asks.

## The short version

Once your project is set up, the whole thing is three things you say out loud.

In your first agent session:

> Start a peer review of `docs/spec.md` and show me the reviewer invitation.

Open a second session — new terminal, new window, same repository — and hand it
the invitation path your first agent printed:

> Join the peer review at `<invitation path>` and review this spec properly.

Then, back in the first session, whenever the reviewer hands work back:

> Read the review findings, revise the spec, and submit the round.

The two agents pass the document back and forth until the reviewer accepts it.
Manual and resume-only modes keep you as the courier. With two healthy resident
adapters, `automatic-required` can use a host-owned durable coordinator to wake
the exact dormant participant once per actionable revision, with no polling or
idle model turns. You remain the tie-breaker when they cannot agree.

## Setting it up

Ask your agent to do it:

> Install `ai-peer-review` as a dev dependency and run its project setup for
> Claude Code.

Setup is deliberately boring and fully reversible. It writes four things:

| File                                  | What it is for                  |
| ------------------------------------- | ------------------------------- |
| `.ai-peer-review.json`                | project configuration           |
| `.claude/skills/peer-review/SKILL.md` | the skill your agent reads      |
| `.claude/config.json`                 | a single `ai_peer_review` key   |
| `.git/info/exclude`                   | ignores `.scratch/peer-review/` |

Swap `.claude` for `.codex`, `.grok`, or `.agents` depending on the agent;
`--agent claude|codex|grok|generic` chooses. `--scope user` installs into your
home directory instead of the project.

Two things worth knowing before you run it:

- Editing `.git/info/exclude` needs your explicit go-ahead, so project setup
  asks for `--confirm-scratch-exclude`. Run it with `--dry-run` first and you
  will see the exact diff before a byte is written.
- `--remove` takes back everything the package installed, and leaves alone
  anything it did not.

That skill file is what makes the rest of this README work. Once it is in place,
your agent knows the commands, the role boundaries, and what it is not allowed
to do — so you can talk about reviews in plain language instead of quoting
flags at it.

Worth doing once before you rely on it:

> Run the peer-review doctor and tell me whether anything needs fixing.

`doctor` only reads. It reports whether your agent host is exposing session
identity, whether the scratch directory is ignored, and whether the transport
you asked for is actually available. For `automatic-required`, it also checks
MCP connectivity, a current resident lease, the configured long timeout, and an
end-to-end transport probe. Anything it calls out, it also tells you how to fix.

Claude Code must expose a genuine current session through
`CLAUDE_CODE_SESSION_ID` (or `CLAUDE_SESSION_ID`). When the host does not expose
model metadata, declare only the model fields in the project or user
`.ai-peer-review.json`:

```json
{
  "schema": "ai-peer-review.config/v1",
  "hosts": {
    "claude": {
      "identity": {
        "provider": "anthropic",
        "host": "claude-code",
        "model_id": "claude-opus-5",
        "model_display": "Claude Opus 5"
      }
    }
  }
}
```

The session fingerprint still derives only from the genuine current Claude
session. Configuration cannot supply a session ID, and the package never
guesses the active model. A runtime session combined with configured model
metadata is labeled `identity_source: declared`; complete runtime session and
model metadata remains `runtime`. Doctor, start, join, submit, finalize, grant,
recovery, and abandonment all use this same resolution contract.

Codex and Claude Code setup install package-owned versioned settings for the
`peer-review-mcp` server, an eight-hour tool timeout, and a lease heartbeat.
Grok and generic hosts remain manual unless a future official adapter implements
and passes the same contract. Setup does not install a Claude identity hook or
status-line bridge. Preview, apply, and removal preserve all foreign hooks,
status-line configuration, and other settings.

## Running a review

### 1. The author starts it

The document has to be tracked and committed first — the review binds to an
exact blob, so a dirty file is refused rather than quietly reviewed.

> Start a peer review of `docs/spec.md` as a spec.

Your agent gets back a workspace, a brief of its own, and a reviewer invitation
containing every path the second agent needs.

### 2. The reviewer joins

Open a second session in the same worktree and give it the invitation path. It
has to be a genuinely distinct session — that is the whole point, and the
package enforces it rather than trusting anyone to remember.

> Join the peer review at `<invitation path>` and review this spec properly.

The reviewer reads the artifact, writes a structured response — summary,
findings, required changes, optional suggestions — and closes with a decision of
either `revisions-requested` or `accepted`.

### 3. They go back and forth

Each round, the author reads the findings, edits the artifact, writes its own
response, and submits. The reviewer response, the updated document, and the
author's reply are committed together as one triad, so every decision sits next
to the revision that answered it.

> Read the latest reviewer response, address the required changes, and submit
> the round.

If either agent loses the thread, `status` and `resume` reconstruct exactly
where things stand and what the one next action is:

> What is the current state of the peer review, and whose turn is it?

### 4. Acceptance

When the reviewer accepts, the author verifies the accepted content is still
current, generates a manifest, and commits:

> Finalize the peer review.

## What you end up with

Review collateral is written straight into your tracked tree, not copied out of
a scratch folder at the end:

```text
docs/peer-reviews/spec/2026-09-10-spec-record-554e80ec.../
├── review-7a1...-reviewer-invitation.md
├── review-7a1...-author-startup.md
├── review-7a1...-reviewer-response-1.md
├── review-7a1...-author-response-1.md
├── review-8b2...-reviewer-response-1.md   # replacement attempt
├── ...
└── review-8b2...-review-manifest.md       # terminal attempt authority
```

Coordination state — the event ledger, claims, snapshots — stays in the ignored
`.scratch/peer-review/` directory. Only the human-readable record gets
committed.

`review_id` names one immutable protocol attempt and its scratch workspace.
`record_id` names the human review-of-record and its tracked collateral folder.
The first attempt defaults both IDs to the same value. A replacement gets a new
`review_id` and explicitly reuses the original `record_id`, so protocol authority
never overlaps while the human evidence stays together.

## Phased specification and plan reviews

One review can govern an immutable ordered artifact sequence. Phase authority
comes only from `events.jsonl`; provider transcripts are never consulted:

```bash
peer-review start docs/spec.md --artifact-kind spec --phases spec,plan
# review and finalize the specification, then follow status --next:
peer-review advance .scratch/peer-review/<review-id> docs/plan.md
# review and finalize the plan normally
```

Non-final acceptance writes a phase manifest and returns control to the
registered author. `advance` derives the next kind and cursor from authority,
binds the exact artifact, and resumes the same reviewer with a fresh phase turn
budget. The final phase retains the ordinary terminal manifest and archive
contract. Omitting `--phases` preserves the single-artifact workflow.

## Recovering one review across attempts

If an attempt cannot finish, preserve it and start the replacement under the
same record identity:

```bash
peer-review start docs/spec.md --artifact-kind spec --record-id record-554e80ec
peer-review supersede .scratch/peer-review/review-old \
  --reason "Replacement attempt started" --by review-new
```

`supersede` is a terminal, non-accepting disposition. It retains the failed
attempt's event authority and collateral; accepting prose in a draft with
`submitted_at: null` remains `not-submitted`, and an untouched generated draft
remains `incomplete`.

Repositories with older `<review-id>` directories can build one record bundle
without rewriting sealed bytes. Inspect every mapping, collision, and expected
SHA-256 digest first, then apply the exact same operation:

```bash
peer-review consolidate \
  .scratch/peer-review/review-old \
  .scratch/peer-review/review-new \
  --destination docs/peer-reviews/spec/record-554e80ec --dry-run

peer-review consolidate \
  .scratch/peer-review/review-old \
  .scratch/peer-review/review-new \
  --destination docs/peer-reviews/spec/record-554e80ec --apply
```

Apply publishes and verifies every destination before removing any source,
writes `review-history.md` plus `relocation-receipt.json`, and commits only the
tracked relocation delta in normal mode. Historical paths inside sealed
responses and manifests stay unchanged; the receipt is the additive path map.

## When they cannot agree

Reviews between two agents can loop, so they come with a budget: ten reviewer
responses by default, tunable with `--max-turns`. When it runs out, the review
stops and asks for you rather than grinding on.

From there you can extend the budget, optionally pointing the next round at one
specific sticking point (`continue --additional-turns 3 --focus <file>`), hand
in extra context both sides are missing (`supplement`), or accept the document
over the reviewer's remaining objections with a written rationale
(`finalize --good-enough`). All three take a signed human grant — an agent
cannot decide on its own that it has argued long enough. If the review is simply
not worth continuing, `abandon` ends it with a stated reason and keeps every
piece of evidence in place.

The same escape hatches cover the boring failures: a session that dies
mid-turn can be reclaimed, and a participant that is not coming back can be
replaced, both through `recover`.

## Try it without touching your Git history

If you want to watch the whole protocol run before you trust it with real work,
start a review with `--no-commit`. The conversation is identical, but nothing is
staged or committed — artifact snapshots and digests are kept in the ignored
workspace instead, and the review ends as `accepted-uncommitted`.

Every handoff in that mode is stamped `NO-COMMIT TEST MODE`, and both agents are
told to disclose it. It is a rehearsal, and it is labeled as one; it never
counts as acceptance evidence.

## The guardrails

The things that stop this quietly going wrong:

- Review state is derived from an append-only event ledger, not from whatever an
  agent believes.
- Reviewer code receives read-only observations of the repository, and cannot
  commit or push through the package API.
- Author commits use exact-path transactions and leave unrelated staged work
  untouched.
- Nothing is ever pushed for you.
- Human authority is graded as the weaker of signer isolation and verifier
  binding — it will not flatter itself.
- `--no-commit` is explicitly non-durable and never implies Git evidence.
- Automatic handoff blocks inside the local MCP tool, not in model turns; there
  is no background prompt polling while it waits.
- Durable coordination runs outside participant context, persists one immutable
  wake operation per revision and recipient, and never treats delivery as review
  authority.
- Resident liveness comes from a process instance or official opaque handle plus
  a refreshed lease. A bare PID is never treated as authority.
- Manual recovery remains available after every transport failure.

### Reviewer Git ref policy

The reviewer boundary retains every Git ref except the exact package-defined
namespaces `refs/codex/turn-diffs/checkpoints/**` and
`refs/codex/turn-diffs/captures/**`. Codex creates those private refs as
author-session bookkeeping; they cannot change the reviewed artifact,
checked-out `HEAD`, branch, index, or worktree. Creating or advancing one
therefore does not invalidate an otherwise unchanged reviewer turn.

Every other ref remains part of the sealed digest, including branches, remote
tracking refs, tags, replacement refs, notes, stash refs, worktree refs, and
lookalikes such as `refs/codex/turn-diffs/checkpoints-evil/**` and
`refs/codex/turn-diffs/captures-evil/**`. The exclusions are frozen package
constants. Repository configuration, environment variables, command flags,
and ref contents cannot widen them.

Reviews joined with 0.2.1 may have sealed the former all-ref aggregate digest.
That digest does not retain enough evidence to prove that only a Codex private
ref changed, so it cannot be migrated safely. For a ref-only failure, preserve
the existing review workspace and its not-yet-submitted response, upgrade, and
start a replacement attempt under the same `record_id`. The old response
remains draft evidence, not accepted review authority: recreate or copy its text
only into the new protocol-authorized reviewer response, then submit normally
from the distinct reviewer session.

Commands fail closed. When one refuses, it returns a stable `APR_` code, and
`peer-review explain <code>` says what to do about it — which is usually the
fastest way to unstick an agent:

> That failed with an APR error. Explain the code and recover.

## Driving it yourself

The agent-facing path above is the intended one, but everything is an ordinary
CLI and nothing is hidden from you.

After a confirmed local installation, the short binary name works:

```bash
npm install --save-dev ai-peer-review
npx peer-review --help
```

The bare `peer-review` name only resolves to this package once it is installed
locally. Before that — or if you would rather install nothing at all — call it
by its full registry name:

```bash
npx --yes ai-peer-review@0.2.2 --help
npx --yes ai-peer-review@0.2.2 setup --scope project --agent claude --dry-run
npx --yes ai-peer-review@0.2.2 start docs/spec.md --artifact-kind spec
npx --yes ai-peer-review@0.2.2 status .scratch/peer-review/<review-id> --next
```

| Command         | Role            | What it does                                    |
| --------------- | --------------- | ----------------------------------------------- |
| `setup`         | you             | install or remove the agent integration         |
| `doctor`        | anyone          | read-only readiness check                       |
| `start`         | author          | begin a review of a tracked artifact            |
| `advance`       | author          | bind the next phased artifact and resume review |
| `join`          | reviewer        | join from an invitation                         |
| `status`        | anyone          | current state and the single next action        |
| `resume`        | anyone          | rebuild the current actor's instructions        |
| `submit`        | author/reviewer | seal and hand off the current response          |
| `finalize`      | author          | commit acceptance and the review manifest       |
| `continue`      | author/reviewer | extend the turn budget under a signed grant     |
| `supplement`    | author/reviewer | register human-authorized extra context         |
| `recover`       | author/reviewer | reclaim a stale turn or replace a participant   |
| `abandon`       | author/reviewer | end a stuck review, keeping the evidence        |
| `supersede`     | author/reviewer | terminate a replaced attempt without acceptance |
| `consolidate`   | anyone          | verify and relocate one multi-attempt record    |
| `request-grant` | author/reviewer | raise a human authority challenge               |
| `coordinator`   | host            | run, reconcile, inspect, or stop durable wakes  |
| `help`          | anyone          | the complete offline command contract           |
| `explain`       | anyone          | what one `APR_` error means and how to recover  |

`doctor`, `status`, `help`, `explain`, and bounded coordinator operations take
`--json`, and
`peer-review help --all` prints the full contract offline — roles, valid states,
flags, effects, and error codes for every command. Agents should query it rather
than guess; so can you.

Two habits are worth keeping either way: use the absolute paths the tool prints
rather than reconstructing them, and let `status --next` tell you the next
command instead of assuming. Argument quoting in generated commands is
POSIX-safe on macOS and Linux and PowerShell-safe on Windows.

### Durable wake coordination

An official host integration supplies the exact validated resident observation
and wake adapter, then keeps the coordinator in the foreground:

```bash
peer-review coordinator run .scratch/peer-review/<review-id>
```

Filesystem hints and an out-of-context timer both use the same one-shot path:

```bash
peer-review coordinator reconcile .scratch/peer-review/<review-id> --json
peer-review coordinator status .scratch/peer-review/<review-id> --json
peer-review coordinator stop .scratch/peer-review/<review-id> --json
```

`stop` records a request for only the matching owned instance. Wake operations
contain a pointer capsule, revision, target role, and session fingerprint—not a
raw provider handle or review prose. A host without a current `live-wait` or
official `native-push` capability is refused visibly. Its bounded manual
fallback is `peer-review status <workspace> --next`; participant-side repeated
polling is never an automatic mode.

## Public API

The supported programmatic surface keeps protocol mutation in the CLI while
exposing the adapter validation needed by official host integrations:

```js
import {
  applyReviewRecord,
  coordinatorStatus,
  createNativePushTransport,
  decideWake,
  explainError,
  reconcileWake,
  negotiateAutomaticRequired,
  planReviewRecord,
  renderReviewHistory,
  residentHealth,
  runCoordinator,
  statusReview,
  validateResidentLease,
} from 'ai-peer-review';
```

Protocol mutation is routed through the CLI. Coordinator exports are narrow
host-integration seams: authority selection, ledger operations, owned leases,
one-shot reconciliation, and the foreground loop. The record helpers expose the same
frozen plan, deterministic index, and verified relocation transaction used by
`consolidate`, so official integrations do not need to recreate those safety
checks.

## Verification

Releases run unit, golden, integration, MCP, packaging, installed-host smoke,
format, spelling, and lint gates on the minimum supported Node 24 across Ubuntu,
macOS, and Windows, plus the preferred Node 26 and current Node releases on
Ubuntu. Release publication and Phase 2 boundary checks use Node 26. Production
dependencies are exact-pinned and audited.

Locally:

```bash
npm test
npm run test:integration
npm run test:mcp
npm run test:packaging
npm run test:smoke
npm run lint
npm run format:check
```

Contributions are welcome under Apache-2.0; see `CONTRIBUTING.md`. Security
reports should go through the private vulnerability-reporting surface on the
GitHub repository rather than a public issue.

## Provenance and licensing

This repository was extracted from `kburson/ai-task-manager`. Its retained
history ends at filtered tip
`bfc6f9ffabd8281a815c7bd0e0824f3bacb84d9d`, derived from AITM source commit
`4b3bcd43cba141a611da4a2b861433b915462806`. The first standalone bootstrap
commit is `fd2e636356b6b8049930d5dc6bddf383c6d56c8d`.

Ancestors through the filtered history tip retain the AGPL-3.0-or-later and
commercial terms that applied in AITM. The standalone bootstrap commit and its
descendants are Apache-2.0 under the independently verified declaration in
`provenance/relicensing-declaration.json`. See `NOTICE`, `LICENSE`, and
`docs/spdx-policy.md` for the exact boundary.
