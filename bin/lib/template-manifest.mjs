// #501 — single source of truth for the markdown template files that are
// mirrored from `templates/` into a project's gitignored `.ai-task-manager/`
// runtime directory.
//
// `installTemplates()` (bin/cli.mjs) and the standalone `sync:templates`
// command (scripts/sync-templates.mjs) both import this list so the two copy
// paths can never diverge. Adding a runtime-mirrored template means editing
// this array and nothing else.
//
// Scope note: this is ONLY the markdown template set. The JSON config defaults
// (`project-fields.json`, `activity-policy.json`, etc.) have bespoke
// merge/preserve semantics in `installTemplates()` and are deliberately NOT
// listed here — they are not a flat overwrite-mirror.
export const TEMPLATE_FILES = [
  'pickup-directive.md',
  'definition-of-done.md',
  'epic-body.md',
  'sub-issue-body.md',
  'solo-issue-body.md',
  'session-boot.md',
  'session-state-template.md',
  'worker-report.md',
];
