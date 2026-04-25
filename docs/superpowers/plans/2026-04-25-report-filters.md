# Report Date Range & State Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--from`, `--to`, and `--state` CLI flags to `generate-value-report.mjs` so reports can be scoped to a date range and/or filtered to open/closed issues.

**Architecture:** All changes are in one file. The `cfg` object gets three new keys; `processItems` gets additional filter predicates; the HTML report header shows the active filters in its metadata line.

**Tech Stack:** Node.js ESM, no new dependencies.

---

## Files

- Modify: `scripts/reports/generate-value-report.mjs`
  - Lines 10–21: usage comment
  - Lines 67–82: `cfg` object (add `fromDate`, `toDate`, `state`)
  - Lines 179–182: `processItems` filter chain (add date + state predicates)
  - Lines 358–367: `buildHtml` header meta (show active filters)

---

### Task 1: Add new flags to the `cfg` object

**Files:**
- Modify: `scripts/reports/generate-value-report.mjs:10-82`

- [ ] **Step 1: Update the usage comment (lines 10–21)**

Replace the `[--project-id PVT_...]` line and the block below it:

```
 *     [--from YYYY-MM-DD]          only issues closed on or after this date
 *     [--to   YYYY-MM-DD]          only issues closed on or before this date
 *     [--state open|closed|all]    filter by issue state (default: all)
 *     [--project-id PVT_...]       override GitHub Projects V2 node ID (default: from .claude/task-tracker.json)
```

Insert those three lines immediately before the `[--project-id` line.

- [ ] **Step 2: Add `fromDate`, `toDate`, and `state` to `cfg` (lines 67–82)**

After the `chatWords` line and before `htmlOnly`, add:

```js
  fromDate:      flag('--from') ? new Date(flag('--from') + 'T00:00:00') : null,
  toDate:        flag('--to')   ? new Date(flag('--to')   + 'T23:59:59') : null,
  state:         (flag('--state') ?? 'all').toLowerCase(),
```

Full `cfg` block after the edit (lines 67–82 become):

```js
const cfg = {
  projectId:     flag('--project-id', ttCfg.projectId ?? ''),
  owner:         ttOwner || null,
  repo:          ttCfg.repo ?? '',
  title:         flag('--title', 'AI Engineering Value Report'),
  output:        flag('--output') ?? path.join(fileCfg.outputDir ?? './reports', 'value-report'),
  issues:        flag('--issues')?.split(',').map(Number) ?? null,
  role:          flag('--role')         ?? fileCfg.role                   ?? 'mid',
  soloRole:      flag('--solo-role')    ?? fileCfg.soloRole               ?? 'senior',
  seniorFactor:  +(flag('--senior-factor') ?? fileCfg.seniorEfficiencyFactor ?? 0.70),
  region:        flag('--region')       ?? fileCfg.region                 ?? 'national',
  focusHours:    +(flag('--focus-hours') ?? fileCfg.focusHoursPerDay ?? RATES.workday?.focusedCodingHoursPerDay ?? 5),
  readingWpm:    +(flag('--reading-wpm') ?? fileCfg.readingWpm ?? 180),
  chatWords:     +(flag('--chat-words') ?? 0),
  fromDate:      flag('--from') ? new Date(flag('--from') + 'T00:00:00') : null,
  toDate:        flag('--to')   ? new Date(flag('--to')   + 'T23:59:59') : null,
  state:         (flag('--state') ?? 'all').toLowerCase(),
  htmlOnly:      has('--html'),
};
```

- [ ] **Step 3: Smoke-test the flag parsing**

```bash
node scripts/reports/generate-value-report.mjs --html --state closed --from 2025-01-01 --to 2025-12-31 2>&1 | head -5
```

Expected: starts fetching (no parse error), may print "0 items" — that's fine, we haven't wired the filter yet.

---

### Task 2: Apply filters in `processItems`

**Files:**
- Modify: `scripts/reports/generate-value-report.mjs:160-183`

- [ ] **Step 1: Replace the `.filter` at the bottom of `processItems` (lines 179–182)**

Current code (lines 179–182):
```js
    .filter(i => cfg.issues
      ? cfg.issues.includes(i.number)
      : (i.estimate != null || i.sessionMin != null || i.contextWords != null))
    .sort((a, b) => a.number - b.number);
```

Replace with:
```js
    .filter(i => {
      // --issues overrides all other filters
      if (cfg.issues) return cfg.issues.includes(i.number);
      // must have at least one data field
      if (i.estimate == null && i.sessionMin == null && i.contextWords == null) return false;
      // --state filter
      if (cfg.state === 'closed' && i.state !== 'CLOSED') return false;
      if (cfg.state === 'open'   && i.state !== 'OPEN')   return false;
      // --from / --to filter: applies to closedAt; open issues have no closedAt
      if (cfg.fromDate || cfg.toDate) {
        if (i.closedAt == null) return false;
        if (cfg.fromDate && i.closedAt < cfg.fromDate) return false;
        if (cfg.toDate   && i.closedAt > cfg.toDate)   return false;
      }
      return true;
    })
    .sort((a, b) => a.number - b.number);
```

- [ ] **Step 2: Verify filters work end-to-end**

Run with `--state closed`:
```bash
node scripts/reports/generate-value-report.mjs --html --state closed 2>&1
```
Expected: "N issues found." where N ≤ total. All issues in the table should show status "Done" or "Closed".

Run with a date range that covers recent months:
```bash
node scripts/reports/generate-value-report.mjs --html --from 2025-01-01 2>&1
```
Expected: only issues closed on or after Jan 1 2025 appear.

Run with both:
```bash
node scripts/reports/generate-value-report.mjs --html --state closed --from 2025-06-01 --to 2025-12-31 2>&1
```
Expected: only closed issues with closedAt in that range.

---

### Task 3: Show active filters in the report header

**Files:**
- Modify: `scripts/reports/generate-value-report.mjs:358-367`

- [ ] **Step 1: Build a filter summary string and inject it into the header meta**

In `buildHtml`, right after `const now = ...` (line 217), add:

```js
  const filterParts = [];
  if (cfg.state !== 'all') filterParts.push(`State: ${cfg.state}`);
  if (cfg.fromDate) filterParts.push(`From: ${cfg.fromDate.toLocaleDateString('en-US', { dateStyle: 'medium' })}`);
  if (cfg.toDate)   filterParts.push(`To: ${cfg.toDate.toLocaleDateString('en-US', { dateStyle: 'medium' })}`);
  const filterLabel = filterParts.length ? filterParts.join(' · ') : null;
```

- [ ] **Step 2: Render the filter label in the header meta block (lines 358–367)**

Current header meta block:
```html
  <div class="meta">
    <span>Project: ${project.title}</span>
    <span>Generated: ${now}</span>
    <span>Issues: ${items.length}</span>
    <span>Repo: ${cfg.repo || 'unknown'}</span>
    <span>Role baseline: ${cfg.role}</span>
    <span>Region: ${reg.label}</span>
  </div>
```

Replace with:
```html
  <div class="meta">
    <span>Project: ${project.title}</span>
    <span>Generated: ${now}</span>
    <span>Issues: ${items.length}</span>
    <span>Repo: ${cfg.repo || 'unknown'}</span>
    <span>Role baseline: ${cfg.role}</span>
    <span>Region: ${reg.label}</span>
    ${filterLabel ? `<span style="color:#fbbf24;font-weight:600">Filters: ${filterLabel}</span>` : ''}
  </div>
```

- [ ] **Step 3: Final end-to-end test — open the report and visually confirm the filter chip**

```bash
node scripts/reports/generate-value-report.mjs --html --state closed --from 2025-01-01
open reports/value-report.html
```

Expected: report opens, header shows "Filters: State: closed · From: Jan 1, 2025" in amber, issue table contains only closed issues closed on or after that date.

- [ ] **Step 4: Commit**

```bash
git add scripts/reports/generate-value-report.mjs
git commit -m "feat(reports): add --from, --to, --state filters to value report"
```

---

## Verification

All three tests from Task 2 Step 2 pass. Visual check: open the HTML report and confirm:
1. No state mismatch in the issue table when `--state closed` is used.
2. No out-of-range `closedAt` dates when `--from`/`--to` are set.
3. Filter chip appears in amber in the report header when any filter is active.
4. No filters = backward-compatible output, no filter chip displayed.
