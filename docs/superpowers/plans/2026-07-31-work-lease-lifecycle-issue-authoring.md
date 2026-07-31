# Work-Lease Lifecycle Decomposition Issue-Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the repository `task` skill
> and execute this plan sequentially. This plan performs governed backlog
> authoring only; it does not authorize implementation of any created issue.

**Goal:** Re-scope #1049 to its delivered foundation, create a nested epic and
13 bounded Backlog children for the remaining work, and update #1048's active
mapping with immutable provenance and verified hierarchy.

**Architecture:** Commit the approved decomposition first, then use its exact
SHA in file-backed AITM issue fragments. Render and inspect every body before
mutation. Use versioned `mutateIssueBody` closures for #1048, #1049, and the
nested epic, and use `npx aitm create-issue` for every new issue.

**Tech Stack:** Markdown, Node.js ESM, AITM issue templates,
`mutateIssueBody`, GitHub GraphQL read-back, GitHub Project fields.

## Global Constraints

- Work only in the existing #1048 orchestration worktree on
  `feature/epic/1048`.
- The original reference commit is
  `b4f278d92b2c27fd7ed381e56bb2a047f7936cc9`.
- The successful #1049 foundation commit is
  `86d3723aba76ee2c6bf7da709e7eec74c4b37a0e`.
- Do not resume implementation, integrate code, move #1049 state, or start any
  created issue.
- Use only `npx aitm create-issue` for creation and `mutateIssueBody` for body
  mutations.
- Use `.tmp/plan/`, `.tmp/gh/`, and `.tmp/inspect/` for transient artifacts.
- Dry-run every body before its first live write and again after any material
  final-body amendment.
- Create every issue in Backlog without `--size`, `--estimate`, `--rank`, or a
  state argument.
- Preserve every hidden AITM marker in #1048 and #1049.
- Apply no implementation estimate to the nested epic.
- Stop after exhaustive read-back verification.

---

### Task 1: Commit immutable decomposition provenance

**Files:**

- Create:
  `docs/superpowers/specs/2026-07-31-work-lease-lifecycle-decomposition-design.md`
- Create:
  `docs/superpowers/plans/2026-07-31-work-lease-lifecycle-issue-authoring.md`

**Interfaces:**

- **Consumes:** Original #1048/#1049 bodies, reference commit `b4f278d9`, and
  #1049 completion commit `86d3723a`.
- **Produces:** One immutable commit SHA used by every new issue's Plan
  Metadata.

- [ ] Verify both files name all 13 slices, exact delivery caps, the sequential
      dependency policy, and the hybrid review policy.
- [ ] Search both files for `TBD`, `TODO`, unexpanded placeholders, conflicting
      task numbers, estimates at or above four hours, or permission to begin
      implementation. Expected: no matches.
- [ ] Run Markdown lint and `git diff --check` on the two files. Expected: exit
      `0`.
- [ ] Commit only the two files with:

  ```bash
  git add \
    docs/superpowers/specs/2026-07-31-work-lease-lifecycle-decomposition-design.md \
    docs/superpowers/plans/2026-07-31-work-lease-lifecycle-issue-authoring.md
  git commit -m "[#1048] docs(lease): decompose lifecycle backlog"
  ```

- [ ] Capture `PROVENANCE_SHA` from `git rev-parse HEAD` and verify both files
      are present in `git show --name-only "$PROVENANCE_SHA"`.

### Task 2: Prepare canonical issue fragments and mutation transforms

**Files:**

- Create transient fragments under `.tmp/plan/work-lease-decomposition/`.
- Create transient rendered bodies under `.tmp/gh/work-lease-decomposition/`.
- Create transient inspection/mutation tooling under
  `.tmp/inspect/work-lease-decomposition/`.

**Interfaces:**

- **Consumes:** `PROVENANCE_SHA`, live #1048/#1049 bodies, and the committed
  decomposition documents.
- **Produces:** Deterministic scope, AC, Plan Metadata, and sub-issue-list
  fragments plus pure section transforms used identically by dry-run and
  `mutateIssueBody` apply modes.

- [ ] Build the nested epic fragments. Its Scope must say coordination-only,
      cite #1049 as the completed foundation, exclude implementation, and name
      the sequential and hybrid review policies. Its Plan Metadata must cite
      both original documents, `b4f278d9`, both decomposition documents,
      `PROVENANCE_SHA`, and `86d3723a`.
- [ ] Build one fragment set per child. Each Scope must contain its exact
      approved delivery cap, predecessor dependency, bounded deliverable, explicit
      exclusions, and review tier. Each Plan Metadata section must contain the
      same immutable provenance plus its order and original-plan mapping.
- [ ] Build #1049 and #1048 transforms as functions over the freshly fetched
      base body. Replace only named active sections and insert the dated
      historical section without deleting any hidden marker.
- [ ] Make the transforms idempotent: a second dry-run over their own output
      must produce byte-identical output.

### Task 3: Dry-run the parent bodies and nested epic

**Files:**

- Read: live #1048 and #1049 bodies.
- Read: all Task 2 fragments and transforms.

**Interfaces:**

- **Consumes:** Pure transforms and the nested epic fragment set.
- **Produces:** Reviewed no-write previews for #1048, #1049, and the nested
  epic.

- [ ] Run the #1049 transform in dry-run mode. Verify the active title, Scope,
      ACs, and verification mapping end at Task 6B1, and the dated historical
      section retains the prior title, Scope, Plan Metadata, ACs, and commands.
- [ ] Run the #1048 transform in dry-run mode. Verify original provenance and
      markers remain and the active sub-issue mapping distinguishes foundation
      from remaining program.
- [ ] Run:

  ```bash
  npx aitm create-issue \
    --shape epic \
    --title "Complete work-lease lifecycle and integration" \
    --scope-file .tmp/plan/work-lease-decomposition/epic/scope.md \
    --ac-file .tmp/plan/work-lease-decomposition/epic/acs.md \
    --plan-metadata-file .tmp/plan/work-lease-decomposition/epic/plan-meta.md \
    --sub-issue-list-file .tmp/plan/work-lease-decomposition/epic/sub-issues.md \
    --kind epic \
    --parent 1048 \
    --assignee kburson \
    --dry-run
  ```

  Expected: canonical epic body, parent #1048, no estimate/size/rank fields,
  and no network mutation.

### Task 4: Create the nested epic and dry-run every child

**Interfaces:**

- **Consumes:** Dry-run-approved epic and child fragments.
- **Produces:** One Backlog nested epic ID and 13 child no-write previews using
  that exact parent ID.

- [ ] Re-run the Task 3 epic command without `--dry-run`; capture `EPIC_ID`
      from the returned URL. Do not bind to it.
- [ ] Read back `EPIC_ID` immediately and verify its title, body, parent #1048,
      Project board tether, and Backlog state before continuing.
- [ ] For children 1 through 13 in exact order, run:

  ```bash
  npx aitm create-issue \
    --shape sub-issue \
    --title "$CHILD_TITLE" \
    --scope-file "$CHILD_DIR/scope.md" \
    --ac-file "$CHILD_DIR/acs.md" \
    --plan-metadata-file "$CHILD_DIR/plan-meta.md" \
    --parent "$EPIC_ID" \
    --assignee kburson \
    --dry-run
  ```

  Expected for each: canonical sub-issue body, exact delivery cap and predecessor,
  immutable provenance, no board estimate/size/rank, and no live mutation.

### Task 5: Create the 13 sequential Backlog children

**Interfaces:**

- **Consumes:** `EPIC_ID` and 13 dry-run-approved child fragment sets.
- **Produces:** `CHILD_IDS[1..13]`, each a direct child of `EPIC_ID`.

- [ ] Create each child with the corresponding Task 4 command minus
      `--dry-run`.
- [ ] After every creation, capture its issue ID and URL, then verify title,
      body, parent edge, board tether, Backlog state, exact delivery cap, review tier,
      provenance SHA, and predecessor reference before creating the next child.
- [ ] Stop immediately on a duplicate-child refusal, missing tether, wrong
      parent, non-Backlog state, or body mismatch. Do not create later children
      after a failed invariant.

### Task 6: Apply governed live-body mutations

**Interfaces:**

- **Consumes:** `EPIC_ID`, `CHILD_IDS[1..13]`, live #1048/#1049 bodies, and the
  dry-run-approved pure transforms.
- **Produces:** Updated #1048, #1049, and nested epic bodies with exact issue
  links and preserved hidden markers.

- [ ] Substitute actual IDs into the moved-scope and child-mapping tables, then
      re-run dry-run transforms for #1048, #1049, and `EPIC_ID`.
- [ ] Apply each body with:

  ```js
  await mutateIssueBody({
    issueNumber,
    repo: 'kburson/ai-task-manager',
    mutate: (freshBase) => transform(freshBase, exactIssueMap),
  });
  ```

- [ ] Change #1049's title through the sanctioned metadata edit path only
      after its body mutation succeeds. Do not change its state, assignee,
      labels, or project fields.
- [ ] Verify each returned `body` and a second live fetch are identical on all
      authored sections and retain every pre-mutation hidden marker.

### Task 7: Exhaustive backlog read-back and stop

**Interfaces:**

- **Consumes:** Live #1048, #1049, nested epic, and all 13 child issues.
- **Produces:** A final backlog-only verification report.

- [ ] Fetch the full 16-issue set and verify exact titles and open state.
- [ ] Query parent/sub-issue edges with GraphQL. Verify the nested epic is a
      direct child of #1048 and all 13 children are direct children of the
      nested epic, with no missing or extra edge introduced by this phase.
- [ ] Verify every new issue is tethered to the configured Project and has
      status Backlog.
- [ ] Verify the nested epic has no Size or Estimate value and every child has
      no raw Backlog Size or Estimate value.
- [ ] Verify every child body contains a delivery cap below four hours, the exact
      provenance SHA, its order, its predecessor or foundation dependency, and
      the correct one- or two-review policy.
- [ ] Verify #1049 remains in its original workflow state and commit
      `86d3723a` remains not integrated by this phase.
- [ ] Run `git status --short` and report the planning commit plus any expected
      task-tracker metadata separately from unplanned changes.
- [ ] Stop. Do not bind, refine, promote, implement, integrate, or restart any
      new issue or #1049.
