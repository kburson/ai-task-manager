# Custom Project Fields Management Plan

**Goal:** Make AI Task Manager project fields portable, configurable, and event-driven across GitHub Projects.

## Plan

1. Add package defaults:
   - `config/project-fields.default.json`
   - `config/project-field-events.default.json`

2. Install project-local customizable copies:
   - `.ai-task-manager/project-fields.json`
   - `.ai-task-manager/project-field-events.json`

3. Preserve user edits on reinstall:
   - Copy missing files on first install.
   - If an existing project-local file differs from the bundled default, keep it and write a timestamped `.default.YYYY-MM-DD-HHMMSS.json` sidecar for review.

4. Update `init`:
   - Read project-local field definitions first.
   - Iterate field definitions to map or create each field.
   - Support `single_select`, `number`, and `date`.
   - Store mapped field IDs in a generic `fieldIds` object keyed by definition key.
   - Continue writing legacy config keys for existing scripts.

5. Update task events:
   - On move to `in-progress`, set `startDate` once.
   - On move to `done`, set `endDate` every time.
   - On `/task log` and close timing flush, update `engagedTime`, `sessionTime`, and `contextLength`.

6. Keep issue body metadata as the portable record:
   - Backlog generation should include an `AI Task Manager Fields` block later.
   - Project fields remain board indexes populated from issue/task events.

## Default Fields

- Priority
- Size
- Estimate
- Engaged Time
- Session Time
- Context Length
- Sequence
- Start date
- End date

## Compatibility

- `Engaged Time` replaces `Actual Hours`.
- `Session Time` replaces `Actual Session Time`.
- Existing old field names are aliases during mapping.
- Existing config keys remain populated where possible.
