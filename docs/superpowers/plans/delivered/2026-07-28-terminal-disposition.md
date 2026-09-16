# Terminal Disposition Delivery Plan

**Story:** #1035
**Parent:** #1005
**Base:** `8d0391e`
**Goal:** Keep every terminal issue on the project board and classify its
outcome as Delivered, Replaced, Discarded, or Duplicate.

## Contract

Status answers whether an issue is terminal. Disposition answers what terminal
outcome occurred. All terminal issues remain tracked and end in Done.

| Terminal lane                  | Disposition | GitHub state reason |
| ------------------------------ | ----------- | ------------------- |
| verified `/task close`         | Delivered   | COMPLETED           |
| `/task supersede N --by M`     | Replaced    | NOT_PLANNED         |
| `/task close --as not-planned` | Discarded   | NOT_PLANNED         |
| `/task close --as duplicate`   | Duplicate   | DUPLICATE           |

The superseded marker takes precedence over GitHub's coarse NOT_PLANNED reason
during backfill. Missing project field, project item, or option is fail-closed
for new terminal writes.

## Task 1 — Lock the schema and config projections

1. Add failing assertions in
   `scripts/task-tracker/tests/unit/core/disposition-field-contract.test.mjs`
   for the exact field name, type, options, colors, descriptions, local/default
   parity, config-loader projection, and fresh-init persistence.
2. Add Disposition to `config/project-fields.default.json` and the tracked
   `.ai-task-manager/project-fields.json`; include the pre-existing P3 option in
   the tracked Priority definition so the two sources converge.
3. Add `fieldDisposition` to config defaults/types/internal display,
   `fieldIds.disposition` projection, config authoring, and
   `init-project-config.sh` environment/case plumbing.
4. Run the focused contract test and existing config/project-field tests.

## Task 2 — Provision existing installations

1. Add failing tests in
   `scripts/task-tracker/tests/unit/gh/disposition-install-repair.test.mjs` for:
   existing valid field, missing field creation, missing-option repair,
   idempotent rerun, and persistence to both config projections.
2. Extend `init-repair.mjs` with injected, testable project-field discovery and
   creation/update helpers. Load the canonical Disposition definition from the
   declarative field definitions rather than copy its option taxonomy.
3. Preserve the current Status-option repair behavior and its offline fake
   seam.
4. Run focused repair tests plus the existing init-repair suites.

## Task 3 — Centralize terminal board writes

1. Add failing tests in
   `scripts/task-tracker/tests/unit/lib/terminal-disposition.test.mjs` for
   project item lookup, exact option writes, missing field/item/option refusal,
   and all four terminal verb mappings.
2. Add a dependency-light `terminal-disposition.mjs` helper using the existing
   Projects V2 item lookup, option map, and field writer.
3. Wire verified close to write Delivered before the irreversible close.
4. Replace `close --as` board deletion with a fail-closed disposition write and
   explicit Done status write; retain marker, timing, comment, and GitHub
   stateReason behavior.
5. Wire supersede to preflight/write Replaced in the retryable terminal saga
   before the Done bypass and GitHub close.
6. Update existing close/supersede tests and run all focused terminal suites.

## Task 4 — Add idempotent historical backfill

1. Add failing pure and adapter tests in
   `scripts/task-tracker/tests/unit/core/backfill-disposition.test.mjs` for the
   precedence table, dry-run, unchanged items, partial failure reporting, and
   explicit issue selection.
2. Add `scripts/task-tracker/backfill-disposition.mjs` as a strict-argv
   maintenance command. Query closed issues and their project items, derive the
   value, and use the shared terminal writer.
3. Register the entry point in the orchestrator/self-doc maintenance surface.
4. Run the focused backfill and command-surface tests.

## Task 5 — Document and migrate the live project

1. Update `docs/guides/workflow.md` with the four-value contract, retained-board
   behavior, repair/backfill commands, and the positive filter:
   `is:closed Disposition:Delivered`.
2. Add static documentation assertions to the focused contract test.
3. Run init-repair against the configured project and verify
   `fieldDisposition` plus all four options.
4. Run the backfill against #1027–#1032 and verify #1027 is Delivered while
   #1028–#1032 are Replaced.
5. Record the live verification in the issue evidence; do not commit machine-
   local field IDs.

## Task 6 — Verify and integrate

1. Run the combined VC1 command and `npx aitm verify-develop 1035`.
2. Commit with `[#1035]`, request independent review, and resolve any real
   defects before continuing.
3. Stamp all ACs, run the formal Test gate once, pass Agent Review and
   Full-Auto final approval.
4. Verify the exact branch delta, mergeability, and whitespace.
5. Squash the child to `feature/epic/1005` and trunk as one #1035 commit, then
   close #1035.
6. Audit all #1005 descendants before closing #1005.
