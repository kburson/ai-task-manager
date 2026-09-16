---
name: project_238_duration_format
description: EPIC
metadata:
  node_type: memory
  type: project
  originSessionId: 210617c1-1292-410a-8f23-eed58036fb4b
---

EPIC #238 ("Update project timing measurements") pivoted 2026-06-13 away from float-hours/seconds toward a true duration-string format. **Locked design (full user agreement):**

- **Format:** `DDd HHh MMm SSs` (e.g. `00d 02h 03m 45s`). All four components ALWAYS present, each 2-digit fixed-width. Max `99d 23h 59m 59s`. Fixed width is mandatory because the board Text fields sort lexically — fixed-width makes lexical sort == numeric sort. Parser: `/^(\d{2})d (\d{2})h (\d{2})m (\d{2})s$/` → `d*86400 + h*3600 + m*60 + s`. Canonical stored unit = integer seconds derived from the ISO timing table; the string is the rendered form.
- **Fields that get the string format:** `Engaged`, `Session`, `Review`, `Plan` (renamed from `Engaged Time`/`Session Time`/`Review Time`/`Plan Time`). All four are re-derivable from the issue's ISO timing table. (Plan Time inclusion confirmed by user 2026-06-13 — the locked memo originally listed only three; Plan Time is migrated identically as the 4th measured duration.)
- **Estimate: untouched.** Stays a Number field, float hours, half-hour granularity (`3.0`/`3.5`). It is an AI pre-work estimate (present tense, solo-mid-dev hours) used to measure AI speedup — semantically distinct from the measured past-tense durations. No collision, no migration.
- **Started:** rename `Start Time` → `Started` (in-place, type-preserving, keeps field ID). Stays a timestamp (matches native `Created`/`Closed`). No duration formatting.
- **Migration approach:** re-DERIVE the four duration fields from timing tables, never copy old→new. Number→Text is a type change so it's new-field + delete-old; all three change name so no collision. Update field IDs in `.claude/task-tracker.json`.
- **Formatter scope:** ONE shared `formatDuration`/`parseDuration` lib used everywhere a duration displays — board fields + timing-log rows + aggregates.
- **Sequence = Option A (format-first):** none of the impacted display children (#230, #243) have landed, so build against the final format once. Re-scope #230 (write duration strings to new Text fields; Estimate writer unchanged) and #243 (consumers parse the string / read canonical seconds). New foundation child (shared formatter, supersedes closed #237's formatter) + new field-migration child. #239/#240/#241/#242 proceed as-is; their displayed row durations adopt the shared formatter.

#238 open children at pivot: #230, #239, #240, #241, #242, #243 (#237 closed). See [[feedback_no_chips_only_issues]] — new work files as GitHub issues, left in Backlog, not driven without go-ahead.
