<!-- aitm-skill-version: 0.0.0 -->

# Deep-Dive Procedure & Epic Fan-Out

Expanded procedure for steps 3 and 5 of "Required steps before writing any
code" in `.ai-task-manager/pickup-directive.md`.

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

Run this command and save its output to `./tmp/body.md` via your agent's
file-editing tool — do not use a `>` shell redirect:

```
gh issue view <this-issue-#> --json body --jq .body
```

Append the `## Deep-Dive Analysis (YYYY-MM-DD)` section after the Pickup
Directive block and before any `<!-- ai-task-manager:fields:start -->`
marker. Then post the updated body:

```bash
gh issue edit <this-issue-#> --body-file ./tmp/body.md
```

Then flip the checkpoint: `/task check "Deep dive complete"`.

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

  - [ ] `node scripts/task-tracker/tests/config.test.mjs`
  - [ ] `node scripts/task-tracker/tests/state.test.mjs`
  ```

  Do not add words like `PASS`; the checked box is the proof.

  Bind each Acceptance Criterion to its proof command with an inline
  marker:

  ```markdown
  - [ ] Config loads from project root. <!-- aitm-verified-by: `node scripts/task-tracker/tests/config.test.mjs` -->
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

## Step 5 — Epic sequencing & fan-out

Skip this step for plain sub-issues. Only run it when picking up an issue
whose title begins with `EPIC:` or that has linked sub-issues.

a. Fetch all open sub-issues and read their Scope sections.

b. Validate each sub-issue's `Sequence` field against actual code
dependencies found in the deep dive. If a value is wrong, update it:

```bash
gh project item-edit \
  --project-id <projectId> \
  --id <item-id> \
  --field-id <sequenceFieldId from .ai-task-manager/task-tracker.json> \
  --number <N>
```

c. Post a validated dependency map comment on the epic:

```markdown
## Dependency Map (validated YYYY-MM-DD)

Sequence 1 — start immediately, parallel: #N, #M
Sequence 2 — after all Seq 1 close: #P, #Q
Sequence 3 — after all Seq 2 close: #R
```

d. Fan out in sequence order. Spawn agents for all Sequence-1 sub-issues
simultaneously. Stay anchored to the epic (`/task #<epic>`) while agents
work. When an agent returns, it will report `CODE_COMPLETE`,
`ISSUE_READY_FOR_REVIEW`, or `BLOCKED`. For `CODE_COMPLETE`: extract
`duration_minutes` and `words_delta`, call `/task review #N
--duration-minutes M --words W` — on failure post a comment with failed
criteria, revert to In Progress, and re-dispatch; on success the
sub-issue moves to Review. For `ISSUE_READY_FOR_REVIEW`: the sub-issue is
already in Review — do NOT run `/task close`.

**When every sub-issue in the current sequence reaches Review, the
orchestrator must immediately call `/task review #<epic>` on the parent
epic.** This is orchestrator work, not human work. Running `/task review`
on the epic is what moves the epic to Review and gates the human
notification. Do not notify the human until the epic itself is in Review.

Once the epic reaches Review, report `ISSUE_READY_FOR_REVIEW` and notify
the human: "Epic #X and sub-issues #A–#Z are in Review awaiting your
review and `/task close`." Do NOT run `/task close`. Only after every
Sequence-N issue reaches Done via human-approved `/task close` should you
spawn Sequence-(N+1). Do not pick up work from other epics or solo tasks
while this epic is in progress.
