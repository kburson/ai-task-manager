<!-- @story #1806 -->

# Shared Codex and Claude Hook Launcher Design

Date: 2026-09-25. Issue: #1806. Status: proposed for specification review.

## Purpose and boundary

AITM currently stores repeated Node programs in `.codex/hooks.json` and
`.claude/settings.json`. Those programs choose an installed package handler or
a repository source handler, set up `process.argv`, and distinguish a missing
lifecycle hook from a missing security guard. They are hard to inspect in JSON
and depend on command-string quoting. The same handler modules already serve
both providers; this design centralizes only their launch and resolution.

The outcome is a readable, shared, project-local launcher. This specification
is a Backlog design artifact. It does not authorize implementation or an
implementation plan. Issue #1806 stays in Backlog with a user story, a link to
the ratified specification, and its creation/Backlog timing evidence. Existing
AITM-required stub placeholders may remain until Refine; priority, size,
estimate, labels, and implementation acceptance collateral are deferred.

## Observed constraints

- The current `scripts/task-tracker/lib/guard-entrypoint.mjs` tries
  `node_modules/@kburson/ai-task-manager/<handler>` before `<handler>` in this
  repository. The installed consumer has the former; an unseeded AITM worktree
  can have only the latter.
- A lifecycle hook gates its main block on `process.argv[1]`; `on-ask.mjs`
  also needs a phase argument. A launcher must preserve both and forward the
  provider JSON on stdin and handler stdout/stderr without a subprocess.
- A missing PreToolUse guard currently exits 2, while a missing lifecycle
  handler exits 0 after a diagnostic. The provider matcher, payload, output,
  timeout, trust, and permission contracts remain provider-specific.
- A direct `node <missing-launcher>` exits before launcher code can deny the
  tool. Claude Code documents that exit codes other than 2 usually do not
  block; Codex documents exit 2 as a blocking PreToolUse result. The design
  cannot call a missing launcher itself fail closed.
- Codex says project hook commands inherit the session working directory,
  which may be a subdirectory. Claude's `${CLAUDE_PROJECT_DIR}` can remain on
  the original checkout after entering a worktree while hook input `cwd`
  follows the worktree. A literal relative launcher path is therefore not yet
  proved worktree-safe for either provider.

Primary references: [Codex hooks](https://learn.chatgpt.com/docs/hooks),
[Claude hook exit codes and worktree paths](https://code.claude.com/docs/en/hooks).

## Proposed architecture

One tracked launcher source lives at
`.ai-task-manager/hooks/hook-launcher.mjs` in the AITM repository. The npm
package includes that file. The installer copies the same version to the same
project-relative location in consumer repositories and records it as a
required, digest-checked install artifact. Consumers commit the installed file
with their hook configuration so Git worktrees and fresh clones contain it.
The installer and doctor refuse or report drift when config points at a
missing or stale launcher. No handler scripts are copied to that directory.
The launcher is security infrastructure when a guard uses it: the existing
pre-tool self-modification interlock must protect the installed project-local
launcher before guard commands migrate. That protection runs ahead of chore
mode and other edit bypasses, covers all supported edit tools and patch paths,
and distinguishes an installed consumer copy from editable AITM source.
Installer upgrades replace owned bytes through an atomic, verified path; an
agent edit to the installed launcher is denied even if the file currently
exists and passes a simple path check.

Both provider configs pass a closed logical handler ID to the launcher, for
example `timing`, `memory-index`, `bash-guard`, `activity-guard`,
`source-edit-gate`, `on-stop`, `on-user-prompt`, or
`codex-prompt-timestamp`. The launcher maps each ID to a fixed handler path
and fail policy. It never interprets an ID as an arbitrary path. For each
invocation it resolves the scoped package candidate first, then the
repository-source candidate, using the active worktree root rather than an
unrelated checkout. After launch, it derives and validates that root from the
physical launcher location and the invocation directory; a launcher anchored
to a different checkout is refused for a guard and skipped with a diagnostic
for a lifecycle hook. It records the original invocation directory for any
handler that needs it, changes `process.cwd()` to the active project root
before importing existing handlers, and audits handlers for assumptions about
the old directory. This keeps `memory-index.mjs` and state paths rooted in the
active worktree even when a session starts from a nested directory. It imports
the selected handler in the same Node process, normalizes `process.argv` for
the handler's `isMain` gate, retains phase arguments, and leaves
stdin/stdout/stderr intact.

The provider hook engine still invokes each matching entry separately. The
launcher does not combine timing and memory hooks or idle-resume and prompt
stamp hooks, and it does not add another Node process. Claude and Codex share
launcher and handlers; their event matchers and output envelopes remain
specific to each provider. Grok is out of scope because its bridge owns a
separate deny envelope.

## Security and portability gate

The desired configuration is a short, platform-neutral direct Node command.
That command is approved for a lifecycle hook only after tests show it finds
the tracked launcher from the project root, a nested working directory, an
AITM worktree before self-link seeding, and a downstream consumer worktree on
macOS, Linux, and Windows. The implementation may use provider-supported exec
arguments, root variables, or OS-specific command fields, but must not depend
on a POSIX `sh -c` check in a Windows configuration. The test must exercise
the actual provider command parser, not only direct Node execution.

Security guards have an additional gate: removing the launcher itself must
block the matched tool call with a clear diagnostic in both providers on each
supported OS. An in-launcher check cannot satisfy this. Until a provider-native
command form or a tested platform-specific bootstrap proves that property,
keep the existing guard bootstrap commands for that provider/OS. Do not
substitute an exit-1 missing-file failure, an installer check, or a doctor
warning for runtime denial. Once the launcher runs, missing/unknown guard IDs
or handler files deny with the provider's supported blocking output/exit code;
missing lifecycle handlers remain diagnostic, non-blocking events. A partial
migration is explicit and reported by installer/doctor, never silently
presented as complete parity.

Claude's positive Bash permission allowlist and Codex trust controls remain in
force. The launcher is not a substitute for either. Windows PowerShell is a
separate guard-policy surface: the current `activity-guard.mjs` passes unknown
tool names, and Bash command analysis cannot be treated as PowerShell policy.
The implementation must either add and test PowerShell-aware deny behavior
through the shared launcher or mark the Windows guard path unsupported and
leave its existing configuration unchanged. A matcher firing or a launcher
exit code alone does not certify PowerShell enforcement. Installer and doctor
must report the unsupported state; no successful cross-platform guard-parity
claim is permitted until prohibited PowerShell operations are blocked.

## Installer and migration contract

The installer owns the launcher copy, package inclusion, content digest,
provider commands, and exact migration of known AITM inline and bare-path
commands. It installs and verifies the self-modification interlock before any
guard command cutover, preserving old guards if that protection is unavailable.
It preserves unrelated user hooks. Reinstalling twice yields
byte-identical launcher and hook config. A new installation and an upgrade from
the tracked 2026-09-25 configurations produce the same managed hook contract,
subject to the explicit security portability gate above. Doctor distinguishes
missing launcher, stale launcher, unresolved handler, legacy managed command,
unsupported host command, and untrusted Codex hook. It never treats an
unproved guard migration as healthy.

The repository's persisted `.codex/hooks.json` and `.claude/settings.json`
are regenerated from the same contract as downstream installs. The migration
includes the current Codex edit-tool `activity-guard`; it does not revive the
retired worktree seed-check hook. Installer ownership and uninstall remove only
AITM-owned launcher bytes and managed entries, refusing an altered launcher
instead of deleting user changes.

## Verification required before implementation acceptance

1. Unit tests prove closed ID dispatch, candidate order, path containment,
   argv/phase normalization, stdin/stdout/stderr behavior, authoritative
   handler working directory, original-directory retention, and distinct
   missing-handler policies.
2. Integration tests invoke every managed hook command from project root and
   nested directories in a seeded checkout, unseeded worktree, and packed
   downstream consumer, on macOS/Linux and Windows runners. Assert the actual
   memory-index output and state location, not merely that a command exited 0.
3. For each security guard, remove launcher and then handler independently;
   observe the provider-level tool decision and exact blocking reason. If a
   provider/OS cannot block on missing launcher, that guard stays on its
   current command and the test records the intentional mixed state.
4. Verify the launcher cannot be edited by an agent in a consumer checkout,
   including patch, chore mode, and a replacement-with-no-op attempt, while
   legitimate AITM source edits and verified installer upgrades remain possible.
5. Verify Claude Bash and, when claimed supported, PowerShell policy denial
   on prohibited operations; also verify Codex Bash and edit matchers,
   lifecycle event counts, memory index opt-in, Codex timestamp context, and
   existing hook outputs remain behaviorally equivalent. An unsupported
   PowerShell path is reported explicitly and never counted as a pass.
6. Run installer twice, doctor, package/clone tests, fresh-worktree setup,
   uninstall ownership checks, format/lint, and targeted hook suites. Assert
   that no managed hook has duplicate command entries and no obsolete AITM
   command remains after migration.

## Deferred decisions

The implementation plan must select and prove the provider/OS root-aware
command form before changing any guard. If no short portable form can meet the
missing-launcher security gate, ship the shared launcher only for the proven
lifecycle subset and retain the existing guard bootstrap. Any weaker guard
policy requires a separate explicit design and approval. This specification
makes no claim that a single command syntax works on every host today.
