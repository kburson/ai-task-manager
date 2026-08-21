# Reviewer Co-Review Command Guard Design

- **Issue:** #1365
- **Date:** 2026-08-21
- **Status:** Approved in discussion; awaiting written-spec review
- **Branch:** `codex/1365-reviewer-bash-guard`

## Problem

AITM grants a co-review reviewer one deliberately narrow write capability: the
exact pending review file for the active protocol, provider, and session. After
the reviewer writes that file, the generated reviewer handoff requires the
reviewer to run AITM lifecycle commands such as:

```text
npx aitm co-review status --dir <runtime>
npx aitm co-review help handoff
npx aitm co-review handoff --dir <runtime> --actor <reviewer> ...
```

The Bash pre-tool guard makes these commands impossible after the reviewer
claims the turn. `extractBashWriteTargets()` treats every executable outside its
small read-only allowlist as an ambiguous mutation. Because `npx` is not on that
allowlist, the command yields no concrete write targets and
`ambiguousMutation=true`.

When `evaluateCoReviewWrite()` resolves a live reviewer grant, it rejects an
ambiguous Bash mutation before AITM can execute:

```text
[task-tracker] reviewer mutation destinations are incomplete or ambiguous
```

The denial is correct for arbitrary shell commands but wrong for the exact
AITM protocol commands the same repository generated. The guard and protocol
contracts therefore contradict each other.

The defect was reproduced in the #939 specification review. Claude claimed the
reviewer turn, wrote an accepted review, and then received the refusal above for
both `handoff` and `status`. The protocol remains integrity-valid at
reviewer/claimed, but the accepted decision is not durable.

## Goals

1. Permit the active reviewer session to run only the co-review commands needed
   to inspect and complete its claimed turn.
2. Preserve the exact pending-review-file boundary for direct write tools.
3. Keep arbitrary `npx`, AITM verbs, co-review authority commands, dynamic
   shell, composition, and unbounded destinations fail-closed.
4. Make the trusted transition explicit and testable rather than treating an
   AITM command as ordinary read-only Bash.
5. Preserve provider/session identity, protocol integrity, role separation,
   immutable evidence, locking, and archive behavior.

## Non-goals

- Broadly allowlisting `npx`, Node, or the `aitm` executable.
- Letting a reviewer run `start`, `init`, `claim`, `continue`, `finalize`,
  `supplement`, `set-max-turns`, or any non-co-review AITM verb while its grant
  is active.
- Reimplementing co-review protocol validation in the Bash guard.
- Letting Codex, a human, or another provider record a handoff as Claude.
- Modifying the reviewed #939 artifact or importing its unrecorded review into a
  replacement protocol.
- Fixing the separate #1331 bounded-wait startup defect.

## Decision

Add a strict classifier for session-bound reviewer co-review commands. The Bash
guard will pass the classifier's structured result to `evaluateCoReviewWrite()`
alongside ordinary mutation targets.

The classifier recognizes only one literal command with no shell composition whose entrypoint
resolves to the repository's local AITM executable and whose command form is one
of:

1. `co-review status` for the granted runtime;
2. `co-review help handoff`;
3. reviewer `co-review handoff` for the granted runtime and pending review.

The policy may authorize that structured command for the matching live
reviewer grant. The co-review CLI remains the sole authority for acquiring the
protocol mutex, rereading state, verifying artifact and Git integrity, hashing
the review, validating decision semantics, appending the event, updating state,
projecting the index, and publishing terminal evidence.

This is a trusted-command allowance, not a write-target allowance. Direct file
writes continue through the existing exact pending-path logic.

## Command Classification

### Common shell constraints

Every recognized command must satisfy all of these conditions:

- exactly one shell command;
- no pipes, command separators, background execution, or redirects;
- no command, process, parameter, glob, brace, or tilde expansion;
- no environment-variable prefix or alternate shell wrapper;
- no `eval`, inline Node/Python/Ruby/Perl, aliases, or command substitution;
- no unrecognized, abbreviated, duplicated, or conflicting flags;
- literal paths with no traversal components;
- the repository-local AITM executable is present, so `npx` cannot resolve or
  install a remote package.

The parser returns one of:

```js
{ kind: 'status', runtimeDir, json }
{ kind: 'help-handoff' }
{
  kind: 'reviewer-handoff',
  runtimeDir,
  actor,
  reviewPath,
  reviewOf,
  decision,
  summaryPath,
  message,
}
```

Anything else returns an explicit unrecognized or malformed result and follows
the existing ambiguous-mutation denial.

### Status

Accepted grammar:

```text
npx aitm co-review status --dir <literal-runtime> [--json]
```

The canonical runtime must equal the live grant's protocol directory. No other
flags or positional arguments are allowed.

### Help

Accepted grammar:

```text
npx aitm co-review help handoff
```

This exact read-only command is allowed because the generated next action tells
a claimed reviewer to consult it. Other help targets and top-level AITM help do
not need a reviewer-grant exception.

### Reviewer handoff

Accepted grammar:

```text
npx aitm co-review handoff \
  --dir <literal-runtime> \
  --actor <configured-reviewer> \
  --review <exact-pending-review> \
  --review-of <exact-owner-handoff-commit> \
  --decision <accepted|changes-requested> \
  [--summary <literal-summary-path>] \
  --message <literal-nonempty-message>
```

The guard validates only facts already carried by the live session grant and
protocol projection:

- runtime equals the granted protocol directory;
- actor equals the configured reviewer;
- review path equals the exact pending review path;
- reviewed commit equals the last owner-handoff commit;
- decision is one of the protocol's two reviewer decisions;
- optional summary stays inside the same runtime;
- message is present and literal.

The guard does not decide whether a summary is currently permitted, whether the
review has unique findings, whether supplements were acknowledged, whether the
budget is exhausted, or whether acceptance can publish. Those remain protocol
checks under the mutex.

## Policy Ordering

The Bash guard evaluates in this order:

1. resolve repository, provider, and session identity;
2. extract ordinary mutation targets and shell ambiguity;
3. classify a possible reviewer co-review command from the original bytes;
4. resolve and live-validate the reviewer grant;
5. reject authority-file targets before every allowance;
6. if the structured command exactly matches the grant, return the dedicated
   `session-bound-co-review-command` allowance;
7. otherwise apply the existing read-only Bash, exact pending-review target,
   ambiguous mutation, other-session, and protocol-file rules unchanged.

A command that resembles co-review but fails classification is not downgraded
to ordinary read-only Bash. It remains ambiguous and denied.

## Authority Boundary

The components have distinct responsibilities:

- the command classifier owns literal shell grammar;
- the co-review index plus live protocol owns provider/session grant identity;
- `evaluateCoReviewWrite()` owns the pre-tool authorization decision;
- the co-review CLI owns lifecycle semantics and protocol mutation;
- the pending review file owns reviewer-authored bytes;
- the authoritative artifact and Git `HEAD` own what was reviewed;
- the archive owns terminal accepted evidence.

The classifier never edits state and its output is not proof that a handoff
occurred.

## Security Properties

1. No generic `npx` or AITM allowlist is introduced.
2. A different provider or session cannot use the claimed reviewer's command
   allowance.
3. `--actor` text alone cannot grant access; it must agree with the live
   provider/session-bound grant.
4. Runtime, pending review, and reviewed commit are compared against canonical
   protocol authority rather than trusted from command text.
5. Shell composition and expansion remain rejected before semantic allowance.
6. Human-authority co-review commands remain unavailable to the reviewer.
7. Direct reviewer writes remain limited to one exact file.
8. The protocol revalidates all state under its non-stealing mutex after the
   guard permits execution.

## Testing Strategy

### Parser tests

- accept the exact generated `status`, `help handoff`, accepted handoff, and
  changes-requested handoff forms;
- accept supported flag order only if the CLI itself supports that order and
  the parser can prove uniqueness;
- reject missing, duplicated, abbreviated, conflicting, and unknown flags;
- reject other AITM/co-review verbs;
- reject shell composition, redirects, substitutions, expansions, environment
  prefixes, wrappers, and alternate executables;
- reject non-literal, traversing, or out-of-runtime paths;
- reject the `npx` entrypoint when the local AITM executable is unavailable.

### Policy tests

- matching Claude provider/session plus live reviewer claim allows exact status,
  help, and handoff commands;
- wrong provider, session, actor, runtime, pending path, commit, or decision
  denies;
- malformed co-review commands retain the ambiguous-mutation refusal;
- authority files and direct non-pending writes still deny;
- an inert or terminal grant supplies no command allowance.

### Boundary regression

A fixture-backed reviewer session performs the real sequence:

```text
reviewer claim
  -> write exact pending review
  -> status through Bash-guard classification
  -> reviewer handoff through Bash-guard classification
  -> accepted protocol state and archive evidence
```

The regression invokes the actual guard classification and co-review CLI
boundary rather than asserting only a fabricated policy result.

## Suspended #939 Recovery

The #939 protocol pins the reviewed artifact commit as the worktree `HEAD` while
the reviewer turn is active. Installing repaired tracked code into that
dogfooding worktree would create branch or source drift, and redirecting its
required self-link would violate the worktree environment contract.

Therefore the existing runtime remains immutable forensic evidence of the
defect. After #1365 is integrated:

1. preserve the old protocol directory and Claude's unrecorded review bytes;
2. do not run its handoff as Claude from another provider or human shell;
3. synchronize #939 through its governed branch procedure after the old
   protocol is no longer authoritative;
4. start a new ignored co-review runtime with Codex as author and Claude as
   reviewer;
5. require Claude to review the exact then-current artifact again;
6. do not import, copy, or count the old accepted review as a reviewer turn;
7. verify the new reviewer can run status and its own handoff, then verify
   accepted archive publication.

This sacrifices reuse of one completed review to preserve actor provenance,
Git integrity, and the self-link invariant.

## Documentation

Update the co-review operator documentation and generated reviewer handoff to
state that claimed reviewer lifecycle commands are narrowly authorized by the
session-bound command guard. Document that arbitrary Bash remains blocked and
that a refusal names which command field disagreed with live authority without
exposing secrets.

## Acceptance Criteria

1. The exact generated reviewer `status` and `help handoff` commands pass the
   Bash guard only for the live provider/session-bound reviewer claim.
2. The exact generated reviewer handoff command passes the guard only when its
   runtime, actor, pending review, reviewed commit, and bounded decision fields
   agree with live protocol authority.
3. Arbitrary `npx`, other AITM/co-review verbs, ambiguous shell, wrong-session
   commands, authority writes, and non-pending direct writes remain denied.
4. The real co-review boundary regression reaches durable accepted state and
   archive publication through the reviewer command path.
5. The old #939 review is not impersonated or imported; a fresh Claude review
   proves the repaired workflow after integration.

## Scope

This is one medium, security-sensitive defect. The command classifier, policy
allowance, guard wiring, generated handoff wording, focused unit tests, one
boundary regression, and operator documentation share the same authorization
boundary and should be delivered together. No additional decomposition is
needed.
