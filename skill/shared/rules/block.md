<!-- aitm-skill-version: 1.2.0 -->

# rules/block.md

Tier-2 rule file. Loaded JIT on `/task block`, `/task unblock`, or any time a defect is spawned mid-task that must be resolved before the current issue can proceed. On first read, emit a single line in your reply:

```
aitm-skill-loaded:rules/block:1.2.0
```

If the sentinel is already present in context, do not re-read.

## Why this exists

## Full-Auto defect discovery

Full-Auto does not leave a newly discovered local defect untracked. Before applying the parent blocker protocol, create the defect through the sanctioned shape and capture its issue number:

```bash
npx aitm create-issue --shape defect \
  --user-story-file ./.scratch/plan/user-story.md \
  --scope-file ./.scratch/plan/scope.md \
  --ac-file ./.scratch/plan/acs.md \
  --story-origin-file ./.scratch/plan/story-origin.md \
  <optional-defect-fragment-flags>
npx aitm block <A> --by <B>
```

Bind to `#B`, drive it deepest-first to Done, and only then resume `#A`. The creation must succeed before the parent can name `#B` as its blocker.

When issue `#A` depends on `#B`, GitHub native issue dependencies are the sole
live graph authority. AITM considers the edge satisfied only when `#B` has AITM
Status Done. GitHub issue closure, commit ancestry, and legacy carrier values do
not substitute for that state.

AITM projects the graph onto the Project Disposition field: any unfinished or
unreadable edge produces `BLOCKED`; no edges or all-Done edges produce an empty
Disposition. Terminal delivery dispositions are preserved.

## The only sanctioned path

Always go through the `block` verb:

```bash
npx aitm block <A> --by <B>
```

The verb performs a set union, so repeated calls append unique blockers and are
idempotent. Do not hand-roll native graph edits, the Disposition projection, or
any legacy `BLOCKED` label, `Blocked By` field, or body marker.

Use `npx aitm unblock <A> --by <B>` to subtract one edge idempotently. Use bare
`npx aitm unblock <A>` to clear every native dependency.

## Drive deepest-first

Once `#A` is blocked by `#B`:

1. Switch the active timer to `#B`: `/task #B`.
2. Drive `#B` (and any defect `#B` itself spawns, recursively) all the way to Done.
3. When `#B` reaches Done, AITM reconciles every native dependent and clears
   `#A`'s Disposition once all of its dependencies are Done. The edge remains as
   useful GitHub history until `unblock` explicitly removes it.
4. Resume `#A`.

For an epic child, Done may mean the issue landed on the epic feature branch;
downstream children can proceed before the aggregate epic PR reaches trunk.
Never advance `#A` while any native dependency is not Done.

## Retroactive correction

If you neglected to annotate at spawn time and only catch the omission later:

1. Post a correction comment on `#A` recording the omission (what was missed, when caught, why it happened).
2. Run `/task block <A> --by <B>` to add the native edge and reconcile Disposition.
3. Do not silently fix — the audit trail matters.

## Reference

- Verb implementation: `scripts/task-tracker/verbs/block.mjs`, `scripts/task-tracker/verbs/unblock.mjs`
- Native adapter: `scripts/task-tracker/lib/native-dependencies.mjs`
- Projection: `scripts/task-tracker/lib/dependency-disposition.mjs`
- Legacy migration: `npx aitm migrate-dependencies --dry-run`, then explicit `--apply`
