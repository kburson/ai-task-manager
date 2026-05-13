# GitHub Script Refactor Plan

**Goal:** Reduce large script context by moving repeated GitHub Projects operations into focused modules that can be reused by init, migration, logging, and event updates.

## Plan

1. Add `scripts/gh/lib/github-projects.mjs`.
   - Shared `gh` and GraphQL helpers.
   - Project item lookup.
   - Add issue to project.
   - Read project field values for an issue.
   - Read single-select option IDs.
   - Write typed field values.

2. Refactor Node scripts to use the helper.
   - `log-issue-time.mjs`
   - `update-event-fields.mjs`
   - `migrate-project.mjs`

3. Keep `init-project-config.sh` as the stable interactive wrapper for now.
   - It remains large, but less future logic should be added there.
   - Next extraction target is project field configuration into a Node script.

4. Verify after each extraction.
   - Unit tests for field DB and field sync planning.
   - Syntax checks for changed Node scripts.
   - Init regression tests.
