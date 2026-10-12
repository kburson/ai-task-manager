# Claude Reviewer Launch Permissions Design

Issue: #37

Status: approved for implementation

## Context

`ai-peer-review` already generates the exact reviewer invitation and pending response path before a reviewer joins. It also owns protocol authority, reviewer identity, response sealing, the reviewer operation guard, official resume commands, and durable coordinator outcomes. It does not own a Claude launch adapter.

That gap caused the confirmed incident. An author agent built a Claude Code allow rule as `Edit(/absolute/path)`. Claude interpreted the single-leading-slash pattern relative to the project root, so `dontAsk` denied edits to the actual pending response. The reviewer finished its analysis but could not write or submit it, and the author did not surface the stalled exit until asked.

Claude Code's documented Edit permission grammar uses `//path` for a filesystem-root absolute path and `/path` for a project-relative path. Edit rules apply to its built-in editing tools, including both Edit and Write behavior. `dontAsk` denies operations not matched by an allow rule.

## Goals

- Provide one package-owned way to build a Claude reviewer launch from a sealed invitation.
- Prove before launch that the permission matches exactly the pending response and not the artifact or a neighboring response.
- Keep process execution injectable and host-owned while making argument construction and outcome interpretation package-owned.
- Distinguish provider completion from protocol submission.
- Surface permission-blocked exits immediately with an exact same-session recovery command.
- Preserve the reviewer identity, accumulated analysis, Git boundary, and protocol state during recovery.
- Freeze the contract in unit, integration, boundary, skill, and help tests.

## Non-goals

- Implement the general SPR/XPR runtime broker.
- Add a provider-neutral process supervisor.
- Change protocol transitions, Git seals, reviewer identity, or human authority.
- Grant directory-wide, repository-wide, wildcard, Bash-write, or bypass permissions.
- Probe a live review response by modifying it before substantive work.
- Publish provider transcripts or raw session handles.

## Architecture

### Package-owned Claude adapter

Add `src/provider/claude-launch.mjs` as the only component that understands Claude launch permission syntax. It has three responsibilities:

1. Build and statically validate an immutable launch contract from a sealed reviewer invitation.
2. Run the contract through an injected process executor and retain private runtime evidence in the review's ignored scratch workspace.
3. Re-read protocol authority after the process returns and classify the observable outcome.

The protocol and reviewer guard remain provider-neutral. The adapter consumes their results; it does not duplicate their authority checks.

The supported public surface will expose pure construction and classification functions plus one executor-oriented function. The CLI will use the same functions. Tests inject a conformant provider executable or process function; production uses a literal argv array with shell execution disabled.

### Launch command

Add one closed CLI command:

```text
peer-review launch-reviewer <reviewer-invitation> --host claude --model <id> --effort <level>
```

Only `claude` is supported by this story. The explicit host flag leaves room for a later separately governed provider-neutral broker without pretending one exists now.

The command reads the sealed invitation payload, resolves the existing startup authority, and derives:

- physical repository and worktree roots;
- absolute review workspace;
- exact pending response path;
- reviewed artifact path;
- expected review ID and protocol revision;
- requested model and effort; and
- whether this is a fresh launch or an exact resume using package-owned scratch state.

The generated Claude invocation uses `--permission-mode dontAsk`, a literal argv array, and an allow list containing read-only tools, exact Bash rules for only the package-generated `join` and `submit` commands, plus one exact Edit rule for the pending response. It does not add a generic Write rule: Claude's Edit rule governs all built-in file-editing operations. It does not enable Bash as a way to write the response, use Git, or run any other command.

### Exact path encoding

The adapter resolves the pending future response using the repository's existing contained-path machinery. The parent chain must resolve physically inside the exact worktree; neither the response nor a parent may escape through a symlink. The normalized absolute path must equal the event-authorized invitation value.

Native filesystem paths and Claude permission paths are separate namespaces. The adapter first validates and retains the canonical native path for filesystem containment, then translates that path to Claude's forward-slash provider form before constructing or comparing a permission rule. It must not feed a Windows-native path directly into POSIX normalization or compare a Claude-reported denial path directly with a native path.

For POSIX paths, the provider form is unchanged and the Claude pattern is constructed by prefixing the normalized absolute path with one additional slash:

```text
/work/repo/reviewer-response-1.md
-> Edit(//work/repo/reviewer-response-1.md)
```

For Windows drive paths, the canonical native path remains the filesystem authority while the provider form lowercases the drive letter, removes the colon, and replaces separators:

```text
C:\work\repo\reviewer-response-1.md
-> /c/work/repo/reviewer-response-1.md
-> Edit(//c/work/repo/reviewer-response-1.md)
```

The same translation is applied to Claude-reported Edit/Write denial paths before exact-response comparison. Portable package command arguments use forward slashes but retain the drive prefix (`C:/work/...`); permission grammar and command argv are intentionally not conflated.

Spaces remain literal because each rule and command argument is passed as one argv element without a shell. Permission-pattern metacharacters are not escaped speculatively. Because Claude documents Edit patterns as gitignore-style patterns, a provider-form path containing an unproven literal metacharacter is rejected as unrepresentable. The closed rejection set includes `*`, `?`, `[`, `]`, and a backslash after native-to-provider translation. Support can expand only with provider-conformance evidence proving literal matching.

The static preflight applies the same closed matcher used by the conformant fixture and must prove all of the following:

- the generated rule matches the exact pending response;
- the reproduced single-slash rule does not match it;
- the rule does not match the artifact;
- the rule does not match a sibling response name; and
- re-parsing produces the same canonical path.

Any failure stops before the provider process starts with a stable `APR_CLAUDE_PERMISSION_INVALID` error and bounded recovery. Doctor health and reviewer join state do not satisfy this readiness check.

### Provider execution and private state

The host supplies a process executor; the adapter supplies the complete executable and argv. The production CLI executor launches Claude with shell disabled and requests structured result output. Tests supply a conformant fake executable that enforces the documented permission mode and rule semantics.

Private launch state is stored under the ignored review workspace in a package-owned `provider/claude/` directory. It may contain the raw Claude session ID and sanitized process metadata. Public CLI results, durable events, help output, and errors expose only a session fingerprint or opaque scratch-relative recovery reference.

A fresh launch records the returned session handle only after it parses as a valid Claude result for the expected invocation. An exact resume reads that same private handle and invokes Claude's official resume form. A caller cannot supply or replace the raw session ID through a CLI flag.

### Outcome classification

Provider process exit is evidence, not protocol authority. After every launch or resume, the adapter re-reads the review and returns one of four closed statuses:

- `submitted`: protocol authority advanced through a reviewer submission by the expected reviewer identity.
- `permission-blocked`: structured provider evidence shows the response edit was denied and protocol authority did not advance.
- `failed`: the provider reported a definite non-permission failure and protocol authority did not advance.
- `outcome-unknown`: the process ended ambiguously or its structured result cannot be authenticated, and protocol authority does not prove submission.

Completed analysis, a zero process exit, doctor success, join success, or the existence of response bytes does not produce `submitted`.

For `permission-blocked`, the CLI result names the exact authorized response path and prints one recovery command:

```text
peer-review launch-reviewer <invitation> --host claude --resume
```

The command resolves the private handle, preserves the configured model and effort from the launch record, regenerates and revalidates the exact permission contract, and resumes the same session. It does not accept replacement model, effort, response, workspace, or session flags in resume mode.

The adapter never submits for the reviewer. The resumed Claude session must update its own authorized response and run the normal reviewer submit command. Existing protocol idempotency prevents duplicate transitions.

### Prompt and operator contract

The generated prompt tells Claude to:

- join using the exact command embedded in the invitation;
- read the durable invitation and artifact;
- write only the exact pending response;
- submit using the exact package command;
- avoid Git and artifact writes; and
- report a permission denial through structured provider output rather than silently ending.

The installable `peer-review` skill requires `launch-reviewer` for unattended Claude review work. It forbids freehand `Edit(...)`/`Write(...)` rules and states that a provider exit without a protocol transition is blocked or unknown, never submitted.

Help output documents the absolute `//` rule, the `dontAsk` behavior, exact-path rejection, private handle policy, and same-session recovery. Golden tests prevent the single-slash example from returning.

## Verification strategy

### Unit contract

`test/unit/claude-launch-permissions.test.mjs` covers canonical POSIX and Windows absolute encoding, provider/native namespace comparison, Claude-normalized Windows denial recognition, portable command argv, immutable argv, spaces, rejected metacharacters, symlink/containment failures, single-slash mismatch, artifact and neighbor negative controls, and sanitized results.

### Conformant integration

`test/integration/claude-launch-permissions.test.mjs` creates a disposable repository and review. Its provider fixture implements the documented `dontAsk` and absolute/project-relative distinction. The test first injects the reproduced bad rule and observes a denied response write with no submission. It then uses the package-generated rule, preserves the same fixture session/model/effort and accumulated analysis, writes the exact response, and submits through the real protocol service.

The fixture must attempt the artifact and a neighboring response and prove both remain denied. It must also prove that process completion before submit is not reported as submission and that blocked recovery exposes only the bounded resume command.

### Existing boundaries

`test/integration/reviewer-boundary.test.mjs` and `test/integration/reviewer-guard.test.mjs` prove the launch adapter and operation guard select the same response and preserve the artifact, Git, worktree, and identity seals.

### Optional live conformance

A separately gated live-Claude check may run in CI or manually when credentials and a supported Claude runtime are available. It uses a disposable review fixture and its own generated response. It is never part of the deterministic default suite, never edits an active review, and never makes hosted release success depend on third-party availability unless policy explicitly changes.

## Failure handling

- Unsupported path: refuse before launch and name the exact unrepresentable character class.
- Provider unavailable: return a definite failed launch with the existing manual-review fallback.
- Permission denial: retain review and private session handle; return `permission-blocked` and exact resume command.
- Missing or malformed session result: retain all evidence and return `outcome-unknown`; do not invent a handle.
- Protocol already advanced: recompute authority and return the idempotent submitted outcome only when the expected reviewer transition is proven.
- Identity mismatch: fail closed through the existing reviewer guard; never replace or reclaim the participant implicitly.

## Compatibility and rollout

Existing manual, resume-only, live-wait, native-push, coordinator, and direct reviewer flows remain unchanged. `launch-reviewer` is additive and Claude-specific. No configuration migration is required.

The implementation lands with the new deterministic tests and documentation. Live-provider conformance remains opt-in and reports its runtime/version evidence separately. A future provider-neutral broker may consume the public adapter contract, but #37 does not add that broker or generalize beyond demonstrated Claude behavior.

## References

- [Claude Code permission rules](https://code.claude.com/docs/en/permissions)
- GitHub issue #37 and its mirrored deep-dive analysis
