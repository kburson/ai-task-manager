# Codex Archive Trim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tested local `trim-archive` command and schedule it to manage Codex archived session storage.

**Architecture:** A small Node.js CLI scans `$CODEX_HOME/archived_sessions`, moves old JSONL transcripts to `$CODEX_HOME/archived_sessions_quarantine`, records each move in a JSONL manifest, and permanently deletes quarantined files whose original archive age exceeds the delete threshold. A Codex cron automation runs the command daily.

**Tech Stack:** Node.js standard library, `node:test`, Codex cron automation.

## Global Constraints

`--delete` is total file age, not days after quarantine.

The command must refuse `--delete` values less than `--trash`.

The command must support `--dry-run` with no filesystem mutations.

The command must use `CODEX_HOME` when provided, otherwise `~/.codex`.

---

### Task 1: Cleanup Policy Tests

**Files:**
- Create: `/Users/kpburson/.codex/tools/trim-archive/trim-archive.test.mjs`
- Create: `/Users/kpburson/.codex/bin/trim-archive`

**Interfaces:**
- Produces executable command: `/Users/kpburson/.codex/bin/trim-archive --trash <days> --delete <days> [--dry-run] [--verbose]`

- [ ] **Step 1: Write tests that create temporary archive/quarantine directories**

Use `node:test` to verify moving, deleting by original mtime, invalid retention rejection, and dry-run behavior.

- [ ] **Step 2: Run tests and verify they fail because the command does not exist**

Run: `node --test /Users/kpburson/.codex/tools/trim-archive/trim-archive.test.mjs`

Expected: failure because `/Users/kpburson/.codex/bin/trim-archive` is missing or not executable.

- [ ] **Step 3: Implement the CLI**

Create an executable Node.js script that parses arguments, validates thresholds, scans only direct files in the archive/quarantine directories, moves old archived files, appends manifest rows, deletes quarantined files by original mtime, supports dry-run, and prints a compact summary.

- [ ] **Step 4: Run tests and verify they pass**

Run: `node --test /Users/kpburson/.codex/tools/trim-archive/trim-archive.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Run a real dry run**

Run: `/Users/kpburson/.codex/bin/trim-archive --trash 14 --delete 21 --dry-run`

Expected: prints a summary and changes no archived session files.

### Task 2: Scheduled Cleanup

**Files:**
- No repository files.

**Interfaces:**
- Consumes executable command: `/Users/kpburson/.codex/bin/trim-archive --trash 14 --delete 21`
- Produces Codex automation named `Trim archived Codex sessions`

- [ ] **Step 1: Create a daily local cron automation**

Create a Codex cron automation that runs once per day early in the morning.

- [ ] **Step 2: Configure failed-runs-only notifications**

Set the automation notification policy to failed runs only.

- [ ] **Step 3: Verify automation exists**

View the automation after creation and confirm name, command, schedule, and notification policy.
