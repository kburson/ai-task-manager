<!-- @story #1295 -->
<!-- cspell:ignore backchannel -->

# Temporary GitHub Action Capture

AITM can temporarily observe the GitHub CLI calls made by its public `aitm`
dispatcher. The resulting machine-local corpus is intended for measuring a
future offline outbox or cloud-agent return package. It is not a queue, is not
replayed, and never replaces GitHub issues, Project fields, or Git history as
authority.

## Enable capture

Bind the task normally, then opt in for that repository and issue:

```bash
npx aitm capture-actions on
npx aitm capture-actions status
```

Use `--issue N` to select an issue other than the active binding. Capture is
disabled by default. While disabled, normal `aitm` commands do not create
capture files.

The enable marker and corpus are anchored in the repository's main worktree,
so linked worktrees and separate agents working on different issues share the
same repository-level root without sharing an append file.

## Inspect the experiment

```bash
npx aitm capture-actions summary
npx aitm capture-actions summary --issue 1295 --json
```

The summary reports complete and interrupted action counts, counts by mutation
kind, serialized corpus bytes, original payload bytes, and the largest action.
Inspect individual records beneath:

```text
.tmp/aitm/action-capture/
  enabled/<owner>__<repo>/issue-<N>.json
  repositories/<owner>__<repo>/issue-<N>/
    000001-<ulid>/
      intent.json
      argv.json
      stdin.bin
      request-01.bin
      outcome.json
      stdout.bin
      stderr.bin
```

Only files applicable to a call are present. `intent.json` is atomically
published before the real `gh` process runs. `outcome.json` is atomically
written after it exits. An intent without an outcome identifies an interrupted
or still-running call.

Safe request files include issue-body files, `gh api --input` files, and typed
`gh api -F name=@file` values. Argument arrays, piped input, stdout, and stderr
are also measured. Size and SHA-256 metadata always describe the original
bytes. Raw bytes are omitted when AITM's credential policy detects a secret;
the process environment is never serialized.

## Disable capture

```bash
npx aitm capture-actions off
```

Disabling removes only the per-issue enable marker. It preserves the corpus for
analysis. The operator may remove the temporary corpus later using the normal
workspace cleanup policy after the experiment is complete.

## Behavioral boundary

The dispatcher resolves the installed `gh` executable before placing AITM's
observation shim first on `PATH`. The shim invokes that exact executable with
the original arguments and input, tees its output to the caller, and returns
its exit status. Capture failures emit a warning and fail open so the original
GitHub operation still runs.

This spike deliberately does not provide offline task pickup, mutation replay,
conflict reconciliation, local lifecycle authority, Git transport, archival,
or a cloud-agent backchannel. Those decisions should be based on the measured
corpus.
