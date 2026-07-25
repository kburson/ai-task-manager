# AI Engineering Value Framework

This document defines how to estimate, record, and report the economic value of software built with AI assistance. Its purpose is to give engineering managers and stakeholders a defensible, repeatable way to quantify what AI-assisted development delivers compared to a fully-staffed human engineering team.

---

## Why This Matters

Enterprise software teams rarely measure the _cost of the work itself_ — they measure headcount and budget. When AI delivers the same output at a fraction of the cost, the value is invisible unless you translate it into the language finance and management understand: **dollars and hours**.

This framework does that translation — honestly. We cannot prove what a human engineer would have actually taken; we can only compare the pre-execution estimate against what we measured. The acceleration ratio is therefore labeled "estimated" and treated as directionally correct, not exact.

---

## Enterprise Cost Model

These are fully-burdened costs — salary + benefits + equity + tooling + management overhead — not just raw salary.

| Region                       | Mid ($/hr) | Senior ($/hr) | Staff ($/hr) |
| ---------------------------- | ---------- | ------------- | ------------ |
| SF Bay Area / Silicon Valley | `$210`     | `$275`        | `$340`       |
| New York City / Boston       | `$190`     | `$250`        | `$315`       |
| Seattle / Denver / Austin    | `$170`     | `$225`        | `$285`       |
| Chicago / D.C. / Los Angeles | `$160`     | `$210`        | `$265`       |
| South / Midwest / Mountain   | `$135`     | `$180`        | `$230`       |
| **National Average (US)**    | **`$150`** | **`$200`**    | **`$255`**   |

All estimates use **mid-level engineer hours** as the baseline — what a developer with 3–6 years of experience would take. This is the value denominator.

### Team overhead multiplier

A team of engineers is not N times as productive as one engineer. Coordination costs compound:

| Team size | Effective productivity per engineer |
| --------- | ----------------------------------- |
| 1         | 100%                                |
| 3–5       | 75–85%                              |
| 10–15     | 60–70%                              |
| 50+       | 40–55%                              |

The enterprise cost scenario models a large team at 50% efficiency (2× hours billed) with 30% coordination overhead on top.

---

## Task Sizing Guide

Use these reference points when estimating hours for a GitHub issue. Estimates represent what a **mid-level human engineer** would take. Be honest — estimates are for value reporting, not commitments.

| Task type                            | Human hours   | Notes                                   |
| ------------------------------------ | ------------- | --------------------------------------- |
| Bug fix (isolated, well-understood)  | 2–4h          | Includes investigation                  |
| Bug fix (systemic, cross-file)       | 6–16h         | Includes regression testing             |
| New API endpoint (CRUD)              | 4–8h          | Schema + route + validation             |
| New API endpoint (complex logic)     | 8–24h         | Aggregation, joins, business rules      |
| New UI page (simple)                 | 6–12h         | Layout + data fetch + basic state       |
| New UI page (interactive, real-time) | 16–40h        | WebSocket, charts, complex state        |
| Schema migration                     | 4–12h         | Includes backfill script + rollback     |
| Refactor: rename/move (mechanical)   | 1–4h per file | Import fixes, rename cascades           |
| New service + data layer             | 6–12h         | Schema read, method design, type safety |
| Documentation (architecture)         | 4–8h          | Per major doc                           |
| CI script / guardrail                | 2–6h          | Script + integration into pipeline      |
| Full feature (design → test → ship)  | 40–120h       | Small feature; includes review cycles   |
| Epic (multi-week, multi-file)        | 160–400h      | Includes planning + coordination        |

Size buckets for the GitHub Projects `Size` field:

| Size | Hours  | Single-select option |
| ---- | ------ | -------------------- |
| XS   | 1–2h   | Set in init config   |
| S    | 3–4h   | Set in init config   |
| M    | 6–10h  | Set in init config   |
| L    | 12–20h | Set in init config   |
| XL   | 24h+   | Set in init config   |

---

## Measurement Model

### What we measure

Two measurement fields are recorded per issue on the GitHub Projects board:

| Field       | Type                     | What it captures                            |
| ----------- | ------------------------ | ------------------------------------------- |
| **Session** | Text (`DDd HHh MMm SSs`) | Active AI-assisted session engagement       |
| **Engaged** | Text (`DDd HHh MMm SSs`) | Report-ready active/review engagement total |

> **Unit note (#243).** The four board "actuals" fields — **Engaged**, **Session**, **Review**, and **Plan** — are GitHub Project **Text** fields holding fixed-width `DDd HHh MMm SSs` duration strings whose canonical stored unit is **integer seconds**. Zero-padding makes lexical sort equal numeric sort. Always render a second count with the shared `formatDuration(totalSeconds)` and read a board string back with `parseDuration(str)` (both in [`scripts/task-tracker/lib/duration.mjs`](../../scripts/task-tracker/lib/duration.mjs)); never hand-format or hand-parse these strings, and never treat the field as float-hours or raw minutes. `Estimate` remains a **Number** field in **hours** — it is the value denominator and is not a duration field.

### Engaged Hours formula

```
Engaged Hours = (session_minutes / 60) + (context_words / reading_wpm / 60)
```

- **Session hours**: active AI compute time converted to hours
- **Reading hours**: time the human spent reading AI output (`context_words ÷ reading_wpm ÷ 60`)
- **reading_wpm default**: 180 (configurable via `wpm` in `.ai-task-manager/task-tracker.json`)

### Estimated Acceleration

```
Estimated Acceleration = Estimate (hours) / Engaged Hours
```

This is labeled **estimated** because estimates are best guesses at planning time, not ground truth. The acceleration ratio is directionally meaningful at the aggregate level.

### Cost comparison

```
Human cost (estimated)  = Σ(estimate hours) × hourly_rate
Measurable AI cost      = (context_words / reading_wpm / 60) × hourly_rate
Value ratio             = Human cost / Measurable AI cost
```

Claude Code uses a flat subscription — the only measurable human cost is time spent reading Claude's output.

---

## Rules for Estimating Issues

1. **Every issue gets an estimate before work starts.** Set the `Estimate` field (hours) immediately after creating an issue.
2. **Estimate mid-level human hours.** This is the value denominator.
3. **Round to meaningful increments:** 1, 2, 3, 4, 6, 8, 10, 14, 20, 28, 40h. Don't use 7h or 11h — false precision misleads.
4. **Sub-issues inherit complexity from their scope, not their parent.** A 200h epic broken into 10 sub-issues should have sub-issue estimates that sum to ~200h.
5. **Don't adjust estimates after the fact.** Note surprises in comments but leave the original estimate intact.
6. **Epics get a separate orchestration estimate** (typically 5–10% of sum of children) for coordination, final verification, and cleanup.
7. **Set session time at issue close.** Log it in a comment using the session log template below, then update the board field.

---

## Setting Board Fields via GraphQL

After running `npx ai-task-manager init`, your `.ai-task-manager/task-tracker.json` will contain the project and field IDs for your board. Use them in these mutations:

```bash
# Get the project item ID for an issue
ITEM_ID=$(gh api graphql -f query='
{
  repository(owner: "<owner>", name: "<repo>") {
    issue(number: <N>) {
      projectItems(first: 1) {
        nodes { id }
      }
    }
  }
}' --jq '.data.repository.issue.projectItems.nodes[0].id')

PROJECT_ID=$(cat .ai-task-manager/task-tracker.json | python3 -c "import json,sys; print(json.load(sys.stdin)['projectId'])")

# Set Estimate (hours) — replace FIELD_ID with your fieldEstimate value
gh api graphql -f query="mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: \"$PROJECT_ID\"
    itemId: \"$ITEM_ID\"
    fieldId: \"<ESTIMATE_FIELD_ID>\"
    value: { number: <hours> }
  }) { projectV2Item { id } }
}"

# Set Session — a Text duration string `DDd HHh MMm SSs` (integer seconds,
# produced by formatDuration). Replace FIELD_ID with fieldSessionTime.
gh api graphql -f query="mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: \"$PROJECT_ID\"
    itemId: \"$ITEM_ID\"
    fieldId: \"<SESSION_TIME_FIELD_ID>\"
    value: { text: \"<DDd HHh MMm SSs>\" }
  }) { projectV2Item { id } }
}"
```

The `/task close` command and review/log helpers handle these mutations automatically when the task skill is active.

---

## Session Log Template

At cleanup time, post a comment on each completed issue, then update the board fields:

```
## Session log

| Date | Session type | Active time (min) | Context words | Notes |
|------|-------------|------------------|---------------|-------|
| 2026-04-25 | Implementation | 90 min | 18,000 | Initial build |
| 2026-04-25 | Cleanup | 30 min | 5,000 | Testing + docs |

**Total session time:** 120 min
**Total context words:** ~23,000
**Estimate:** 8h
**Engaged hours:** (120/60) + (23000/180/60) = 2.0 + 2.1 = 4.1h
**Estimated acceleration:** 8h / 4.1h = 2.0×
```

### What counts as "active session time"

Claude's active session time is the reliable proxy for AI compute time. Claude stops consuming tokens when waiting for user input — so active time is wall-clock implementation time minus idle gaps. Reading long AI responses is a common source of those gaps; the context words ÷ WPM term in the Engaged Hours formula recovers that time. The task skill tracks all of this automatically.

### Planning time: keep it separate

Log planning and design sessions against a dedicated **planning issue**, not the implementation issue. This keeps the `Estimate / Engaged Hours` ratio clean for implementation work.

```bash
npx aitm create-issue \
  --shape solo \
  --title "Planning: <epic title>" \
  --scope-file ./.tmp/gh/planning-scope.md \
  --ac-file ./.tmp/gh/planning-acs.md \
  --plan-metadata-file ./.tmp/gh/planning-meta.md \
  --label planning \
  --assignee <your-login>
```

Use `/task plan` to open an untracked planning bucket; use `/task new <title>` to promote it when scope is clear.

---

## Feature Value Summary Template

At the end of every feature or epic, post this summary as a comment on the parent epic issue:

```
## Feature: <name> (issue #<n>)
**Completed:** <date>
**Scope:** <one-line description>

| Sub-issue | Title | Est. hours | Status |
|-----------|-------|-----------|--------|
| #N        | ...   | 10h        | Done   |
| #M        | ...   | 14h        | Done   |

**Total estimated hours:** XXh
**Total session time:** XXX min
**Total context words:** ~XX,000
**Engaged hours:** XX.Xh (session + reading time)
**Estimated acceleration:** XX× (estimate ÷ engaged — assumes estimates were accurate)
**Human cost equivalent (mid-level, national avg):** $XX,XXX
**Measurable AI-assisted cost (reading time only):** ~$XXX
**Value delivered / reading-time cost:** ~XXX×
```

Run the report script to pull estimates and measurements automatically and produce a print-ready PDF:

```bash
# HTML only (no dependencies)
node scripts/reports/generate-value-report.mjs --html

# PDF (requires puppeteer)
node scripts/reports/generate-value-report.mjs

# Closed issues, Q1 only
node scripts/reports/generate-value-report.mjs --html --state closed --from 2026-01-01 --to 2026-03-31
```

The report produces a multi-page landscape document:

- **Page 1** — branded header + executive summary with methodology note
- **Page 2** — Agentic AI Accelerator section (human vs. AI cost side-by-side) and all six comparison rows (Budget Baseline, Solo Senior, Enterprise Team, AI-Assisted Actual, Human Leverage, AI Leverage)
- **Pages 3+** — Product Backlog per-issue table with rollup epics, Engineering Cost by US Region, Timeline Analysis with pre-work lag and in-flight duration

Output defaults to `./reports/value-report.html` / `.pdf`. Configure defaults in `scripts/reports/value-report-config.json`. See [README.md](../README.md#value-report) for all flags.

Or query the board directly:

```bash
gh api graphql -f query='
{
  user(login: "<your-login>") {
    projectV2(number: <project-number>) {
      items(first: 100) {
        nodes {
          content { ... on Issue { number title state } }
          fieldValues(first: 20) {
            nodes {
              ... on ProjectV2ItemFieldNumberValue {
                number
                field { ... on ProjectV2Field { name } }
              }
              ... on ProjectV2ItemFieldTextValue {
                text
                field { ... on ProjectV2Field { name } }
              }
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2SingleSelectField { name } }
              }
            }
          }
        }
      }
    }
  }
}' --jq '
  [.data.user.projectV2.items.nodes[]
  | {
      number: .content.number,
      title: .content.title,
      state: .content.state,
      estimate: (.fieldValues.nodes[] | select(.field.name == "Estimate") | .number) // null,
      sessionTime: (.fieldValues.nodes[] | select(.field.name == "Session") | .text) // null,
      status: (.fieldValues.nodes[] | select(.field.name == "Status") | .name) // null
    }
  | select(.estimate != null or .sessionTime != null)
  ]'
```

> `Session` is a Text field (`DDd HHh MMm SSs`, integer seconds); select `.text` and parse with `parseDuration` rather than reading `.number`.
