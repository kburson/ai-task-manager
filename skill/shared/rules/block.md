<!-- aitm-skill-version: 1.1.0 -->

# rules/block.md

Tier-2 rule file. Loaded JIT on `/task block`, `/task unblock`, or any time a defect is spawned mid-task that must be resolved before the current issue can proceed. On first read, emit a single line in your reply:

```
aitm-skill-loaded:rules/block:1.1.0
```

If the sentinel is already present in context, do not re-read.

## Why this exists

## Full-Auto defect discovery

Full-Auto does not leave a newly discovered local defect untracked. Before applying the parent blocker protocol, create the defect through the sanctioned shape and capture its issue number:

```bash
npx aitm create-issue --shape defect <required-and-optional-fragment-flags>
npx aitm block <A> --by <B>
```

Bind to `#B`, drive it deepest-first to Done, and only then resume `#A`. The creation must succeed before the parent can name `#B` as its blocker.

When work on issue `#A` discovers a defect that must be fixed before `#A` can proceed and you file a new issue `#B` for that defect, `#A` must be annotated as blocked **in three places** so the board, the body, and the search labels all agree:

1. The `BLOCKED` label on `#A`
2. The `Blocked By` project-board field on `#A` (text value, e.g. `"#341"` or `"#3, #7, #11"`)
3. The body marker `<!-- aitm-blocked-by: #B -->` inside `#A`'s issue body

Missing any one of those three breaks a different consumer:

- Missing **label** → board filters and `gh issue list -l BLOCKED` lie
- Missing **field** → the project-board "Blocked By" column is empty; humans scanning the board see no dependency
- Missing **body marker** → `pull-next` cannot auto-unpark `#A` when `#B` reaches Done

The lesson, learned the hard way: **all three are mandatory, every time.** Do not declare an issue blocked until all three are in place.

## The only sanctioned path

Always go through the `block` verb:

```bash
npx aitm block <A> --by <B>
```

The verb writes all three annotations atomically. Do **not** hand-roll any of:

- `gh issue edit <A> --add-label BLOCKED` (label only — incomplete)
- `gh project item-edit ...` directly (field only — incomplete)
- Body-marker injection via `mutateIssueBody` (marker only — incomplete)

If you find yourself reaching for one of those three directly, stop and use `block` instead.

## Halt on `no-field-id`

The Blocked By mirror reads `cfg.fieldBlockedBy` from `.ai-task-manager/task-tracker.json`. If that key is absent, the field-write helper fails-soft and logs:

```
{skipped: 'no-field-id'}
```

or a `WARN: configuration is missing 1 known project field id(s): fieldBlockedBy` line. This is **not** a recoverable warning — it means the board mirror was silently skipped and the issue is only partially blocked. When you see it:

1. STOP. Do not continue with downstream verbs.
2. Run `node scripts/gh/init-project-config.sh` (or the local equivalent that discovers and writes project field ids) to repopulate `cfg.fieldBlockedBy`.
3. Re-run `/task block <A> --by <B>`. Verify the mirror returns `{"ok":true,"value":"#B"}`.
4. Only then resume.

If init does not populate `fieldBlockedBy`, file a defect against the init script and treat that defect as a deepest-first blocker on whatever you were doing.

## Drive deepest-first

Once `#A` is blocked by `#B`:

1. Switch the active timer to `#B`: `/task #B`.
2. Drive `#B` (and any defect `#B` itself spawns, recursively) all the way to Done.
3. When `#B` reaches Done, `pull-next` auto-unparks `#A` and clears the `BLOCKED` label. If it does not, run `/task unblock <A> --of <B>` explicitly and verify all three annotations are removed.
4. Resume `#A`.

Never close a higher-level issue while one of its blockers is still open. Never advance `#A`'s state past where it was when the block was applied; the block is the floor, not a checkpoint.

## Retroactive correction

If you neglected to annotate at spawn time and only catch the omission later:

1. Post a correction comment on `#A` recording the omission (what was missed, when caught, why it happened).
2. Run `/task block <A> --by <B>` to apply all three annotations now.
3. Do not silently fix — the audit trail matters.

## Reference

- Verb implementation: `scripts/task-tracker/verbs/block.mjs`, `scripts/task-tracker/verbs/unblock.mjs`
- Field-mirror helper: `scripts/task-tracker/lib/blocked-by-field.mjs` (`formatBlockedByValue`, `writeBlockedByField`)
- Config schema: `scripts/task-tracker/config.mjs` — `fieldBlockedBy` must be in both `DEFAULTS` and `TYPES` or it will be stripped on load
- Field-config warning helper: `scripts/task-tracker/lib/field-config-warn.mjs` — `selfCheckFieldConfig` reports missing well-known field ids at session start
