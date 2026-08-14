<!-- aitm-skill-version: 0.0.0 -->

# Deep-Dive Procedure & Epic Fan-Out

Expanded procedure for steps 3 and 5 of "Required steps before writing any
code" in `.ai-task-manager/templates/pickup-directive.md`.

## Step 3 — Append the deep dive to the issue body

> ⚠️ **Never use `gh issue edit --body "..."`** — it replaces the entire body.
> Always use `--body-file`.

> 📐 **Placement is mandatory.** Append the `## Deep-Dive Analysis (YYYY-MM-DD)`
> section AFTER the `## Pickup Directive` heading block (after its trailing
> `- [ ] Deep dive complete` checkbox) and BEFORE the
> `<!-- ai-task-manager:fields:start -->` marker. The canonical body order is
> Scope → Acceptance Criteria → Definition of Done → Pickup Directive →
> Deep-Dive Analysis → fields-block. The `deep-dive-placement` body gate
> refuses test/review/done moves when the Deep-Dive heading is present in
> any other position.

Run this command and save its output to `./.tmp/gh/<this-issue-#>-body.md` via your agent's
file-editing tool — do not use a `>` shell redirect:

```
gh issue view <this-issue-#> --json body --jq .body
```

Append the `## Deep-Dive Analysis (YYYY-MM-DD)` section after the Pickup
Directive block and before any `<!-- ai-task-manager:fields:start -->`
marker. Then post the updated body:

```bash
gh issue edit <this-issue-#> --body-file ./.tmp/gh/<this-issue-#>-body.md
```

Then flip the checkpoint: `/task ensureChecked "Deep dive complete"`.

The deep-dive section must include:

- **Files to edit** (full repo-relative paths).
- **Step-by-step implementation plan**.
- **Test additions** — list each test file with a one-line description;
  append as new acceptance-criteria checkboxes.
- **Verification Commands** — issue-specific commands to prove criteria
  that are not already covered by the standard DoD commands. Append them
  as checkboxes and check them only after successful execution and output
  review:

  ```markdown
  ### Verification Commands

  - [ ] `node --test scripts/tests/unit/task-tracker/lib/config.test.mjs`
  - [ ] `node --test scripts/tests/unit/task-tracker/lib/state.test.mjs`
  ```

  Do not add words like `PASS`; the checked box is the proof.

  **Ordering convention.** When the VC block lists the standard heavy
  commands, order `npm run lint` and `npm run format:check` **before**
  `npm run test:all`. Lint/format autofixes must land before the full
  suite runs, so the suite reflects the committed shape rather than a tree
  that a later autofix would still change:

  ```markdown
  ### Verification Commands

  - [ ] `npm run lint`
  - [ ] `npm run format:check`
  - [ ] `npm run test:all`
  ```

  Bind each Acceptance Criterion to its proof command with an inline
  marker:

  ```markdown
  - [ ] Config loads from project root. <!-- aitm-verified-by: `node --test scripts/tests/unit/task-tracker/lib/config.test.mjs` -->
  ```

  If an AC is proved by a standard DoD command, reference that command in
  the marker but do not duplicate the command under `### Verification
Commands`.

- **Identified risks** beyond the Scope.
- **Sibling sub-issues to spawn** (if any).
- **Dependency map** (always include, even if no dependencies):

  ```
  ## Dependency Map
  Depends on: #N (reason), #M (reason)   ← or "none"
  Blocks: #P (reason), #Q (reason)        ← or "none"
  ```

## Appendix root-only rule (#301)

**The Deep-Dive Analysis appendix is narrative-only.** It MUST NOT contain
`Acceptance Criteria`, `Verification Commands`, or `Definition of Done`
sub-section headings at any level (H2/H3/H4). These three section names
each bear a gate; the gate reads ONLY the root-level section. Mirroring
them inside the `<details>` appendix has caused two real bugs:

1. A partially-complete story can look ready in the collapsed appendix
   (boxes ticked) while the gate is still refusing (root boxes unticked).
2. `String.replace` body-mutations against an exact-match pattern silently
   target the wrong section when the heading appears twice (the #294 bug).

Enforcement:

- `scripts/task-tracker/lib/gh-edit-guard.mjs` refuses any `gh issue
edit`/`gh issue create` whose body embeds a banned heading inside a
  `<details>...</details>` block. Refusal code:
  `deep-dive-embedded-checkbox-section`.
- `assertDeepDiveAppendixClean` (called by `buildDeepDiveBlock`) throws
  `TypeError` if the appendix contains a banned heading. The failure
  surfaces at the call site, before any write.

### Worked example — root-only

During deep dive, you discover a new AC: "Refusal message must name the
offending heading + line number." Do NOT add it to the appendix. Instead:

1. Append the AC to the root-level `## Acceptance Criteria` section with
   an `aitm-verified cmd="…"` marker bound to a test file:

   ```
   - [ ] **Refusal names heading + line.** ... <!-- aitm-verified cmd="`node --test scripts/tests/unit/task-tracker/lib/gh-edit-guard-body.test.mjs`" -->
   ```

2. In the appendix prose, reference the root entry without a checkbox:

   > Verification: see `### Acceptance Criteria` above ("Refusal names
   > heading + line") and the corresponding `### Verification Commands`
   > entry.

This keeps the gate's view authoritative and prevents wrong-target
mutations.

## Step 5 — Epic ranking & fan-out

Skip this step for plain sub-issues. Only run it when picking up an issue
whose title begins with `🧑‍🧒‍🧒 [Epic]` or that has linked sub-issues.

a. Fetch all open sub-issues and read their Scope sections.

b. Validate each sub-issue's `Rank` field against actual code
dependencies found in the deep dive. If a value is wrong, update it:

```bash
gh project item-edit \
  --project-id <projectId> \
  --id <item-id> \
  --field-id <rankFieldId from .ai-task-manager/task-tracker.json> \
  --number <N>
```

c. Post a validated dependency map comment on the epic:

```markdown
## Dependency Map (validated YYYY-MM-DD)

Rank 1 — start immediately, parallel: #N, #M
Rank 2 — after all Rank 1 close: #P, #Q
Rank 3 — after all Rank 2 close: #R
```

d. Fan out in rank order. Spawn agents for all Rank-1 sub-issues
simultaneously. Stay anchored to the epic (`/task #<epic>`) while agents
work. When an agent returns, it will report `CODE_COMPLETE`,
`ISSUE_READY_FOR_REVIEW`, or `BLOCKED`. For `CODE_COMPLETE`: extract
`duration_minutes` and `words_delta`, call `/task review #N
--duration-minutes M --words W` — on failure post a comment with failed
criteria, revert to In Progress, and re-dispatch; on success the
sub-issue moves to Review. For `ISSUE_READY_FOR_REVIEW`: the sub-issue is
already in Review — do NOT run `/task close`.

**When every sub-issue in the current rank reaches Review, the
orchestrator must immediately call `/task review #<epic>` on the parent
epic.** This is orchestrator work, not human work. Running `/task review`
on the epic is what moves the epic to Review and gates the human
notification. Do not notify the human until the epic itself is in Review.

Once the epic reaches Review, report `ISSUE_READY_FOR_REVIEW` and notify
the human: "Epic #X and sub-issues #A–#Z are in Review awaiting your
review and `/task close`." Do NOT run `/task close`. Only after every
Rank-N issue reaches Done via human-approved `/task close` should you
spawn Rank-(N+1). Do not pick up work from other epics or solo tasks
while this epic is in progress.
