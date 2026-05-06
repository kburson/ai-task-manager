# Issue Field DB and Migration Plan

**Goal:** Treat GitHub issue bodies as the portable source of truth for AI Task Manager field values, and treat GitHub Projects custom fields as rebuildable indexes.

## Plan

1. Add an embedded machine field DB at the bottom of issue bodies.
   - Use start/end HTML sentinels.
   - Store compact JSON inside a fenced block.
   - Keep canonical AITM keys only; do not store project-specific field aliases.

2. Add healing logic.
   - Parse existing field DB if valid.
   - If missing or invalid, infer values from visible issue text and current project custom fields.
   - Append or replace the DB at the bottom of the issue body.

3. Update field-changing events.
   - `/task log` updates `engagedTime`, `sessionTime`, and `contextLength` in the issue DB and project fields.
   - Move to `In Progress` sets `startDate` once in the issue DB and project field.
   - Move to `Done` sets `endDate` in the issue DB and project field.

4. Add project migration.
   - Select or create a target project.
   - Reuse the field definition map/create flow.
   - Iterate repo issues.
   - Heal each issue DB.
   - Add issue to the target project.
   - Sync issue DB values into target project fields.
   - Write local config to point at the target project after confirmation.

5. Keep mappings in config/schema, not issue bodies.
   - `.ai-task-manager/project-fields.json` owns canonical fields and aliases.
   - `.ai-task-manager/task-tracker.json` owns active project field IDs/names.
   - Issue body DB owns only canonical values.

