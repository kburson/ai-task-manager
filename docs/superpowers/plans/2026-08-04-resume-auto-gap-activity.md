# Resume Auto-Gap Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent resume from synthesizing whole-gap idle time over durable same-issue commits or verification activity while preserving genuine no-activity recovery.

**Architecture:** Reuse the comments already fetched by the timing reader, collect narrowly authorized same-issue activity in a new leaf module, and feed its timestamps into the pure gap detector. Resume performs the lookup only for a suspicious candidate and fails closed against fabricating idle when attribution is unavailable.

**Tech Stack:** Node.js ES modules, `node:test`, Git message attribution, GitHub CLI comment records, AITM timing rows.

## Global Constraints

- No extra GitHub comments API call during resume.
- Only canonical `[#N]` commits and structured verification comments count as activity.
- Existing three-argument `detectUnmarkedDepartureGap` callers retain current behavior.
- A complete lookup with no activity preserves #981 recovery.
- An unavailable lookup never asserts that the candidate interval was idle.
- Historical timing rows and the eight-hour threshold remain unchanged.

---

### Task 1: Activity-aware pure gap classification

**Files:**

- Modify: `scripts/task-tracker/lib/bind-event.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/bind-event.test.mjs`

**Interfaces:**

- Consumes: timing-log body, bind timestamp, threshold, optional `{ activityTimestamps }`.
- Produces: the existing gap record or `null` when an in-window activity timestamp exists.

- [ ] **Step 1: Write the failing detector tests**

Add cases equivalent to:

```js
assert.equal(
  detectUnmarkedDepartureGap(body, nowTs, SUSPICIOUS_GAP_SEC, {
    activityTimestamps: ['2026-08-04T01:00:00Z'],
  }),
  null
);
assert.ok(
  detectUnmarkedDepartureGap(body, nowTs, SUSPICIOUS_GAP_SEC, {
    activityTimestamps: ['2026-08-03T18:00:00Z', 'invalid'],
  })
);
```

- [ ] **Step 2: Run RED**

Run: `node --test scripts/task-tracker/tests/unit/lib/bind-event.test.mjs`

Expected: FAIL because the detector ignores the fourth argument.

- [ ] **Step 3: Implement the minimal boundary check**

After parsing `lastMs` and `nowMs`, parse each optional activity timestamp and return `null` when `activityMs > lastMs && activityMs <= nowMs`. Do not reorder or mutate caller input.

- [ ] **Step 4: Run GREEN**

Run: `node --test scripts/task-tracker/tests/unit/lib/bind-event.test.mjs`

Expected: all detector tests pass.

### Task 2: Collect authoritative resume activity

**Files:**

- Create: `scripts/task-tracker/lib/resume-activity-evidence.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/resume-auto-gap-activity.test.mjs`

**Interfaces:**

- Consumes: `{ issueNumber, projectDir, comments, attributingCommits }`.
- Produces: frozen `{ status: 'found'|'none'|'unknown', timestamps, reason? }`.

- [ ] **Step 1: Write RED classifier and collector tests**

Pin these shapes:

```js
{ body: '### Verification report — checkpoint', createdAt: '2026-08-04T01:00:00Z' }
{ body: '## ✓ Sandboxed verification passed', createdAt: '2026-08-04T02:00:00Z' }
{ body: 'ordinary discussion', createdAt: '2026-08-04T03:00:00Z' }
```

Inject attributed commits with canonical timestamps, then assert unique numeric ordering and the `found`, `none`, and `unknown` dispositions.

- [ ] **Step 2: Run RED**

Run: `node --test scripts/task-tracker/tests/unit/lib/resume-auto-gap-activity.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the collector**

Use exact heading regexes for verification reports, sandbox results, and new automated tests. Call `attributingCommits(issueNumber, { cwd: projectDir })`. If commit lookup throws and no comment already proves activity, return `unknown`; otherwise return `found` or `none`. Deduplicate timestamps by millisecond value and return frozen copies.

- [ ] **Step 4: Run GREEN**

Run: `node --test scripts/task-tracker/tests/unit/lib/resume-auto-gap-activity.test.mjs`

Expected: all collector tests pass.

### Task 3: Reuse the timing-reader comments fetch

**Files:**

- Modify: `scripts/task-tracker/gh-timing-comment.mjs`
- Modify: `scripts/task-tracker/tests/unit/core/read-timing-comment-body.test.mjs`

**Interfaces:**

- Consumes: the existing `gh issue view --json comments` response.
- Produces: successful timing records with `comments`, preserving `status`, `body`, and `error`.

- [ ] **Step 1: Write RED compatibility tests**

Assert that a found timing result exposes the original comments array, while absent/error results expose an empty array and retain their current discriminants.

- [ ] **Step 2: Run RED**

Run: `node --test scripts/task-tracker/tests/unit/core/read-timing-comment-body.test.mjs`

Expected: FAIL because the result has no `comments` field.

- [ ] **Step 3: Retain comments without another API call**

Return `{ id, url, body, comments }` from a found `findTimingComment` result and propagate `comments` through `readTimingCommentBody`. Do not change `bodyOf`.

- [ ] **Step 4: Run GREEN**

Run: `node --test scripts/task-tracker/tests/unit/core/read-timing-comment-body.test.mjs`

Expected: all timing-comment tests pass.

### Task 4: Integrate evidence into resume

**Files:**

- Modify: `scripts/task-tracker/verbs/resume.mjs`
- Modify: `scripts/task-tracker/tests/fixtures/state-engine-policy-baseline.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/resume-auto-gap-activity.test.mjs`

**Interfaces:**

- Consumes: `tcResult.comments` and injectable `ctx.collectResumeActivityEvidence`.
- Produces: no synthetic departure for `found` or `unknown`; current departure/resume pair for `none`.

- [ ] **Step 1: Write RED #1077 orchestration tests**

Use a timing row before an eleven-hour candidate interval. Inject each disposition and inspect `safePostTiming` calls:

```js
assert.equal(
  posts.some(({ row }) => row.includes('pause:auto-detected-gap')),
  false
);
assert.equal(
  posts.some(({ row }) => row.includes('| resumed |')),
  true
);
```

The `none` case must assert both rows. The `unknown` case must also capture a diagnostic naming unavailable same-issue activity evidence.

- [ ] **Step 2: Run RED**

Run: `node --test scripts/task-tracker/tests/unit/lib/resume-auto-gap-activity.test.mjs`

Expected: FAIL because resume still posts the synthetic departure.

- [ ] **Step 3: Implement minimal orchestration**

Detect the candidate first. Only then call the injected/default collector. Re-run the pure detector with timestamps for `found`, leave the candidate for `none`, and clear it with a warning for `unknown`. Keep binding successful in every case.

- [ ] **Step 4: Run GREEN and focused regression**

Run:

```bash
node --test \
  scripts/task-tracker/tests/unit/lib/resume-auto-gap-activity.test.mjs \
  scripts/task-tracker/tests/unit/lib/bind-event.test.mjs \
  scripts/task-tracker/tests/unit/lib/resume-fresh-bind-no-switch.test.mjs \
  scripts/task-tracker/tests/unit/lib/verb-start-resume-stop.test.mjs \
  scripts/task-tracker/tests/unit/core/read-timing-comment-body.test.mjs \
  scripts/task-tracker/lib/commit-attribution.test.mjs
```

Expected: all focused tests pass.

### Task 5: Repository verification and delivery evidence

**Files:**

- Verify all files changed above plus this plan and its design document.

**Interfaces:**

- Consumes: exact committed #1095 candidate SHA.
- Produces: focused proof, full repository proof, commit trace, and exact-SHA review evidence.

- [ ] **Step 1: Run the AC verifier**

Run: `node --test scripts/task-tracker/tests/unit/lib/resume-auto-gap-activity.test.mjs`

Expected: pass.

- [ ] **Step 2: Run static checks**

Run:

```bash
npm run lint
npm run format:check
git diff --check
```

Expected: all pass with no output from `git diff --check`.

- [ ] **Step 3: Run repository lanes**

Run:

```bash
npm run test:unit
npm run test:integration
npm run test:slow
```

Expected: every lane passes within its configured ceiling.

- [ ] **Step 4: Commit and trace**

```bash
git add docs/superpowers/specs/2026-08-04-resume-auto-gap-activity-design.md \
  docs/superpowers/plans/2026-08-04-resume-auto-gap-activity.md \
  scripts/task-tracker/gh-timing-comment.mjs \
  scripts/task-tracker/lib/bind-event.mjs \
  scripts/task-tracker/lib/resume-activity-evidence.mjs \
  scripts/task-tracker/verbs/resume.mjs \
  scripts/task-tracker/tests/fixtures/state-engine-policy-baseline.mjs \
  scripts/task-tracker/tests/unit/core/read-timing-comment-body.test.mjs \
  scripts/task-tracker/tests/unit/lib/bind-event.test.mjs \
  scripts/task-tracker/tests/unit/lib/resume-auto-gap-activity.test.mjs
git commit -m 'fix(timing): preserve active resume gaps [#1095]'
npx aitm commit-trace 1095
```

Expected: a clean worktree and a canonical commit-trail entry for the exact SHA.

- [ ] **Step 5: Obtain exact-SHA review and run governed Test**

Review the exact SHA for correctness, scope, and fail-closed behavior. Resolve every Critical or Important finding with a new commit and fresh review. Then run `TT_FULL_AUTO=1 npx aitm test 1095`.

Expected: issue moves from Develop to Test with a valid exact-SHA receipt.
