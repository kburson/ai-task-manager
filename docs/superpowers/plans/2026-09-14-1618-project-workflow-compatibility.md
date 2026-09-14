# Project Workflow Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ai-task-manager init` refuse a selected GitHub Project whose enabled workflows can move or close AITM tasks before governed delivery is complete.

**Architecture:** A pure Node module validates and classifies a complete workflow inventory. The existing config-init CLI exposes that policy to the interactive Bash installer, which owns paginated GraphQL reads and renders fail-closed diagnostics before any project or local configuration mutation.

**Tech Stack:** Node.js 24+ ECMAScript modules, `node:test`, Bash, GitHub CLI GraphQL, jq.

**Spec:** `docs/superpowers/specs/2026-09-14-1618-project-workflow-compatibility-design.md`

## Global Constraints

- Compare workflow names case-insensitively after trimming, but preserve original names in diagnostics.
- The incompatible set is exactly `Auto-close issue`, `Pull request linked to issue`, and `Pull request merged`.
- Unknown or disabled workflows do not block initialization.
- Any unproved-complete inventory refuses before repository linking, project-field mutation, config writes, or issue-template writes.
- Do not mutate GitHub Project workflow settings.
- Keep operator scratch under `.scratch/`; production/test sandboxes use repository scratch helpers.

---

### Task 1: Pure workflow compatibility policy and CLI adapter

**Files:**

- Create: `scripts/task-tracker/lib/config-init/project-workflow-compatibility.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/config-init/project-workflow-compatibility.test.mjs`
- Modify: `scripts/task-tracker/config-init.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/config-init/config-init.test.mjs`

**Interfaces:**

- Consumes: `{ workflows: Array<{name: string, number: number, enabled: boolean}>, complete: true }`.
- Produces: `inspectProjectWorkflows(input) -> { workflows, incompatible }`, both stable-sorted arrays.
- Produces: `config-init inspect-workflows`, reading `PROJECT_WORKFLOWS_RAW` and printing compact JSON.

- [ ] **Step 1: Write failing policy tests**

Add tests that import `inspectProjectWorkflows` and assert:

```js
const result = inspectProjectWorkflows({
  complete: true,
  workflows: [
    { name: 'Item added to project', number: 6, enabled: true },
    { name: ' Auto-close issue ', number: 3, enabled: true },
    { name: 'PULL REQUEST MERGED', number: 2, enabled: false },
  ],
});
assert.deepEqual(
  result.incompatible.map((workflow) => workflow.number),
  [3]
);
assert.equal(result.incompatible[0].name, ' Auto-close issue ');
```

Also assert throws for missing `workflows`, `complete !== true`, malformed entries, non-positive/non-integer numbers, and conflicting duplicate numbers. Assert exact duplicate entries collapse and output sorting is deterministic.

- [ ] **Step 2: Run the unit test and confirm RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/config-init/project-workflow-compatibility.test.mjs
```

Expected: failure because the module does not exist.

- [ ] **Step 3: Implement the minimal pure module**

Export a frozen incompatible-name set and `inspectProjectWorkflows`. Validate the top-level object, require `complete === true`, validate every entry, key duplicates by workflow number, reject conflicting duplicates, sort by `number` then `name`, and filter `enabled && incompatibleNames.has(normalize(name))`.

Use error messages prefixed `project-workflow-compatibility:` so the adapter can render one stable diagnostic family.

- [ ] **Step 4: Add failing CLI-adapter tests**

Extend `config-init.test.mjs` to spawn the CLI with:

```js
{
  PROJECT_WORKFLOWS_RAW: JSON.stringify({
    complete: true,
    workflows: [{ name: 'Auto-close issue', number: 3, enabled: true }],
  }),
}
```

Assert exit 0 and parseable JSON for valid input. Assert non-zero and `compatibility could not be verified` for malformed JSON and incomplete input.

- [ ] **Step 5: Expose `inspect-workflows` in config-init.mjs**

Import the pure helper, parse `process.env.PROJECT_WORKFLOWS_RAW`, emit `JSON.stringify(result) + '\n'`, and catch both JSON and validation failures. Add the subcommand to the usage string.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/config-init/project-workflow-compatibility.test.mjs
node --test scripts/tests/unit/task-tracker/lib/config-init/config-init.test.mjs
```

Expected: all tests pass.

- [ ] **Step 7: Commit the policy unit**

```bash
git add scripts/task-tracker/lib/config-init/project-workflow-compatibility.mjs \
  scripts/task-tracker/config-init.mjs \
  scripts/tests/unit/task-tracker/lib/config-init/project-workflow-compatibility.test.mjs \
  scripts/tests/unit/task-tracker/lib/config-init/config-init.test.mjs
git commit -m "[#1618] Classify incompatible project workflows"
```

### Task 2: Paginated init preflight and mutation ordering

**Files:**

- Create: `scripts/tests/integration/task-tracker/lib/init-project-workflow-compatibility.test.mjs`
- Modify: `scripts/gh/init-project-config.sh`

**Interfaces:**

- Consumes: selected `PROJECT_NODE_ID`, `PROJECT_NUMBER`, and `PROJECT_TITLE`.
- Produces: `inspect_project_workflows`, which either returns after a complete compatible inventory or prints a refusal and exits non-zero.
- Produces: `finalize_created_project`, which links and applies the chosen AITM template only after inspection succeeds.

- [ ] **Step 1: Write a deterministic shell-integration harness**

Create a temporary target and mock `gh` executable using `projectScratchDir('test')`. The mock records every call and recognizes workflow queries by `workflows(first: 100`. Return two pages when `after` is absent/present, with compatible workflows on both pages, then satisfy the minimum existing field-discovery path.

Assert the process reaches `Fetching project fields` and the call log orders all workflow queries before any `linkProjectV2ToRepository`, `createProjectV2Field`, `updateProjectV2Field`, `write-config`, or `write-templates` effect.

- [ ] **Step 2: Add refusal cases and confirm RED**

Add test cases for:

```text
enabled Auto-close issue -> exit non-zero, exact name + disable/rerun guidance
disabled Auto-close issue -> initialization continues
workflow GraphQL exit failure -> exit non-zero, compatibility could not be verified
hasNextPage=true with empty endCursor -> exit non-zero before mutation
new project with unsafe default -> project create occurs, but link/template/field/config/template mutation does not
```

Run:

```bash
node --test scripts/tests/integration/task-tracker/lib/init-project-workflow-compatibility.test.mjs
```

Expected: failures because init never queries workflows and mutates immediately.

- [ ] **Step 3: Split project creation from finalization**

Rename `create_and_link_project` to `create_project` and leave it responsible only for `gh project create`, number/title capture, and ProjectV2 node-ID resolution. Set `CREATED_PROJECT_PENDING="true"`.

Add `finalize_created_project` after compatibility inspection:

```bash
if [[ "$CREATED_PROJECT_PENDING" == "true" ]]; then
  link_project_to_repo "$PROJECT_NODE_ID"
  apply_project_template "$PROJECT_TEMPLATE"
fi
```

Preserve `EXISTING_PROJECT_LINK_PENDING` behavior, but ensure its later link call also occurs after inspection.

- [ ] **Step 4: Implement paginated workflow collection**

Add a function that initializes `WORKFLOWS_JSON='[]'`, `WORKFLOWS_CURSOR=''`, and a seen-cursor JSON array. Query the selected node with variables for ID and cursor. Require `.data.node.workflows.nodes` and `.pageInfo.hasNextPage` to have the expected types. Append nodes with jq. When continuing, require a non-empty unseen `endCursor`; otherwise refuse.

After the final page, run:

```bash
WORKFLOW_INSPECTION=$(PROJECT_WORKFLOWS_RAW="$(jq -nc \
  --argjson workflows "$WORKFLOWS_JSON" \
  '{workflows:$workflows,complete:true}')" \
  node "$CONFIG_INIT_CLI" inspect-workflows)
```

If the adapter exits non-zero, print `Could not verify GitHub Project workflow compatibility; no project changes were made.` and exit 1.

- [ ] **Step 5: Render incompatible workflow diagnostics**

Read `.incompatible`. If non-empty, print the project number/title, one bullet per original workflow name, and:

```text
Disable these workflows in the selected project's Workflows settings, then rerun `npx ai-task-manager init`.
No project fields, repository links, local config, or issue templates were changed.
```

Exit 1 before finalizing/linking or entering field discovery.

- [ ] **Step 6: Run the integration test and confirm GREEN**

Run:

```bash
node --test scripts/tests/integration/task-tracker/lib/init-project-workflow-compatibility.test.mjs
```

Expected: all compatibility, pagination, and mutation-order cases pass.

- [ ] **Step 7: Commit the orchestration unit**

```bash
git add scripts/gh/init-project-config.sh \
  scripts/tests/integration/task-tracker/lib/init-project-workflow-compatibility.test.mjs
git commit -m "[#1618] Gate init on project workflow compatibility"
```

### Task 3: Characterization compatibility and full verification

**Files:**

- Modify only as required: `scripts/tests/unit/task-tracker/lib/init-project-config.test.mjs`
- Modify only as required: `scripts/tests/unit/task-tracker/lib/init-project-config-create.test.mjs`
- Modify only as required: `scripts/tests/slow/task-tracker/lib/init-status-palette.test.mjs`

**Interfaces:**

- Consumes: the new workflow query issued by the init wrapper.
- Produces: compatible mock responses without weakening existing assertions.

- [ ] **Step 1: Run the existing init tests**

```bash
node --test \
  scripts/tests/unit/task-tracker/lib/init-project-config.test.mjs \
  scripts/tests/unit/task-tracker/lib/init-project-config-create.test.mjs \
  scripts/tests/slow/task-tracker/lib/init-status-palette.test.mjs
```

Expected: identify only mocks that reject or incorrectly route the new read-only workflow query.

- [ ] **Step 2: Update affected mocks narrowly**

Before broad GraphQL fallback branches, recognize `workflows(first: 100` and return a valid complete page with disabled incompatible workflows:

```json
{
  "data": {
    "node": {
      "workflows": {
        "nodes": [
          { "name": "Auto-close issue", "number": 3, "enabled": false },
          { "name": "Pull request merged", "number": 2, "enabled": false }
        ],
        "pageInfo": { "hasNextPage": false, "endCursor": "2" }
      }
    }
  }
}
```

Do not relax pre-existing assertions about fields, palettes, templates, or config output.

- [ ] **Step 3: Run all focused verifiers**

```bash
node --test scripts/tests/unit/task-tracker/lib/config-init/project-workflow-compatibility.test.mjs
node --test scripts/tests/integration/task-tracker/lib/init-project-workflow-compatibility.test.mjs
node --test scripts/tests/unit/task-tracker/lib/config-init/config-init.test.mjs
node --test scripts/tests/unit/task-tracker/lib/init-project-config.test.mjs \
  scripts/tests/unit/task-tracker/lib/init-project-config-create.test.mjs
```

Expected: all tests pass.

- [ ] **Step 4: Run repository quality verification**

```bash
npm run format:check
npm run lint
npm test
npm run test:slow
```

Expected: every command exits 0.

- [ ] **Step 5: Commit any characterization adjustments**

```bash
git add scripts/tests/unit/task-tracker/lib/init-project-config.test.mjs \
  scripts/tests/unit/task-tracker/lib/init-project-config-create.test.mjs \
  scripts/tests/slow/task-tracker/lib/init-status-palette.test.mjs
git diff --cached --quiet || git commit -m "[#1618] Update init workflow query fixtures"
```

- [ ] **Step 6: Verify final branch scope**

```bash
git status --short --branch
git log --oneline origin/trunk..HEAD
git diff --stat origin/trunk...HEAD
git diff --check origin/trunk...HEAD
```

Expected: only the approved #1618 design, plan, policy, installer, and test changes are present; the worktree is clean after commits.
