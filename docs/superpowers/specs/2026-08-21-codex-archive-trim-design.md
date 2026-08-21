# Codex Archive Trim Design

## Goal

Provide a local cleanup command and scheduled run that keep Codex archived session transcripts from growing indefinitely while preserving a short recovery window.

## Command

The command is `trim-archive`.

The primary invocation is:

```bash
trim-archive --trash 14 --delete 21
```

`--trash DAYS` moves archived session transcript files older than `DAYS` from the archive folder into quarantine.

`--delete DAYS` permanently deletes quarantined transcript files older than `DAYS`.

`--delete` is total age from the original archived file timestamp, not a duration added to `--trash`.

The command refuses invalid retention policies where `--delete` is less than `--trash`.

## Paths

The command uses `CODEX_HOME` when set and otherwise uses `~/.codex`.

It reads archived sessions from:

```text
$CODEX_HOME/archived_sessions
```

It quarantines files under:

```text
$CODEX_HOME/archived_sessions_quarantine
```

It records quarantine metadata in:

```text
$CODEX_HOME/archived_sessions_quarantine/manifest.jsonl
```

## Quarantine Manifest

Each moved file appends one JSON line with:

- `originalPath`
- `quarantinePath`
- `originalMtime`
- `quarantinedAt`
- `sizeBytes`

Permanent deletion uses `originalMtime` from the manifest when present. If the manifest entry is missing, deletion falls back to the quarantined file mtime and reports that fallback in the summary.

## Safety

The command supports:

```bash
trim-archive --trash 14 --delete 21 --dry-run
trim-archive --trash 14 --delete 21 --verbose
```

Dry runs perform no file changes.

Each run prints a compact summary with scanned count, moved count and bytes, deleted count and bytes, skipped count, and fallback count.

## Scheduled Run

Codex should run this once per day in the early morning on the local machine:

```bash
trim-archive --trash 14 --delete 21
```

Successful runs should not notify. Failed runs should notify.

## Known Tradeoff

Memory summaries may contain provenance pointers to raw archived transcript paths. This cleanup does not remove memory summaries, but it can make old deep transcript links stale after the delete threshold. That is accepted because memory summaries are durable and raw transcripts are disposable after the configured retention period.
