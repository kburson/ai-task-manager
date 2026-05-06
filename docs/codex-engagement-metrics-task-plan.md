# Codex Engagement Metrics Task Plan

**Goal:** Determine the best Codex-compatible data source for session content length and use it to separate engaged project time from true idle time.

**Core problem:** Claude timing can derive word markers and idle gaps from session JSONL. Codex currently has no wired metrics source, so `Word Marker`, `Delta Words`, and `Idle Min` can appear as zero even when the values are actually unknown. The extension must stop treating unsupported data as measured zero and must estimate human review time when visible assistant output can be counted.

## Metric Model

Track these values independently:

- `agentActiveMinutes` - time the agent is actively producing output or running tools.
- `humanReviewMinutes` - time plausibly spent reading visible assistant output before responding.
- `trueIdleMinutes` - response gap beyond plausible review/input time.
- `engagedMinutes` - project time that includes agent active time and human review time, but excludes true idle.
- `visibleAssistantWords` - words in assistant output that the human could reasonably read.
- `metricQuality` - `measured`, `estimated`, or `unsupported`.

Default review estimate:

```text
estimatedReviewMinutes = visibleAssistantWords / configuredWpm
reviewMinutes = min(responseGapMinutes, estimatedReviewMinutes + reviewGraceMinutes)
trueIdleMinutes = max(0, responseGapMinutes - reviewMinutes)
engagedMinutes = wallMinutes - trueIdleMinutes
```

## Capture Options To Evaluate

### Option A - Official Codex API or documented export

Use this if OpenAI documents a stable session/transcript/event surface.

Research checks:

- [ ] Review official Codex CLI and Codex app docs for transcript/session persistence.
- [ ] Confirm whether a stable transcript export, hook payload, or event stream exists.
- [ ] Confirm whether timestamps, visible assistant messages, user messages, and tool events are exposed.
- [ ] Record whether this is supported API behavior or implementation detail.

Decision rule:

- [ ] Prefer this option if it exposes visible assistant output and timestamps with documented stability.

### Option B - Local Codex rollout JSONL parser

Parse local Codex session files if no official API exists but local rollout files expose enough structured data.

Research checks:

- [ ] Inspect `~/.codex/session_index.jsonl` for project/thread/session mapping.
- [ ] Inspect `~/.codex/sessions/**/*.jsonl` schema without copying real transcript content into fixtures.
- [ ] Identify records for visible assistant messages, user messages, timestamps, tool calls, token counts, and session metadata.
- [ ] Identify fields to exclude: system messages, developer messages, reasoning, encrypted payloads, command output unless visibly printed to the user.
- [ ] Determine how to resume from a line marker without re-counting old records.

Decision rule:

- [ ] Use this option if active-session discovery is reliable enough and parser tests can be built from synthetic fixtures.

### Option C - Codex hook-based capture

Install a lightweight hook if Codex can emit real-time events with the needed payloads.

Research checks:

- [ ] Inspect Codex config and hook support in `~/.codex/config.toml` or related files.
- [ ] Determine available hook events and payload fields.
- [ ] Confirm whether hooks include visible assistant text or only lifecycle/tool metadata.
- [ ] Compare installation complexity against rollout parsing.

Decision rule:

- [ ] Use this option only if hooks are stable, easy to install, and expose enough content/timing data.

### Option D - Unsupported source with explicit fallback

Use this when Codex content cannot be safely captured.

Required behavior:

- [ ] Mark word metrics as `unsupported`, not `0`.
- [ ] Keep wall-clock timing available.
- [ ] Avoid claiming idle metrics are measured.
- [ ] Show reports with quality notes so old Codex rows are not overinterpreted.

## Backlog Structure

### Phase 1 - Research Fan-Out

These tasks can run in parallel.

- [ ] **Research official Codex observability surfaces**
  - Review official OpenAI docs/help for Codex session persistence, hooks, logs, transcript access, and token/session metadata.
  - Review Codex repository docs or source references for rollout/session storage.
  - Output: short design note distinguishing documented support from observed behavior.

- [ ] **Inspect local Codex rollout/session schema**
  - Map top-level JSONL record types and payload shapes from local Codex files.
  - Output: schema note listing candidate visible-text fields, timestamps, session ids, and excluded private/internal fields.

- [ ] **Research Codex hook feasibility**
  - Determine whether hooks can capture real-time user/assistant/session events.
  - Output: feasibility note comparing hooks with rollout parsing.

- [ ] **Define target metrics schema**
  - Add schema proposal for `agentActiveMinutes`, `humanReviewMinutes`, `trueIdleMinutes`, `visibleAssistantWords`, and quality flags.
  - Output: schema note and expected table/report compatibility.

### Phase 2 - Decision Gate

These tasks depend on Phase 1.

- [ ] **Determine active Codex session discovery strategy**
  - Decide whether `session_index.jsonl`, rollout `session_meta`, cwd matching, newest active file, or explicit config is safest.
  - Output: failure modes for no match, multiple matches, and resumed sessions.

- [ ] **Choose Codex metrics source of truth**
  - Compare official API/export, rollout parsing, hooks, and unsupported fallback.
  - Output: architecture decision record with selected source and fallback order.

### Phase 3 - Adapter Boundary

These tasks start after the source-of-truth decision.

- [ ] **Add agent metrics adapter interface**
  - Route metrics collection through a Claude/Codex adapter boundary.
  - Preserve existing Claude behavior.
  - Allow tests to inject fake metric sources.

- [ ] **Represent unsupported and estimated metrics**
  - Store and report `measured`, `estimated`, and `unsupported`.
  - Ensure unknown word/idle data cannot be displayed as real zero.

### Phase 4 - Codex Capture Implementation

These tasks depend on Phase 3 and the selected capture source.

- [ ] **Implement selected Codex extractor**
  - If rollout parsing is selected, read JSONL incrementally from a marker and parse only approved visible fields.
  - If hooks are selected, capture events into an AI Task Manager-owned state file.
  - Use synthetic fixtures only.

- [ ] **Add visible-output review budget tracking**
  - Count visible assistant words.
  - Estimate review time from `wpm`.
  - Add `reviewGraceMinutes` config with a conservative default.
  - Avoid double-counting multiple assistant outputs.

- [ ] **Compute true idle and engaged time**
  - Split response gaps into review time and true idle.
  - Cover short response, exact budget, and one-hour walk-away cases.

### Phase 5 - Reporting, Docs, and Validation

These tasks complete the feature.

- [ ] **Update timing rows and value reports**
  - Surface metric quality in timing rows or adjacent notes.
  - Keep existing timing comments parseable.
  - Include engaged time in value reports using the selected calculation.

- [ ] **Document Codex metric behavior**
  - Explain Agent Active, Human Review, True Idle, and Engaged Time.
  - Explain Codex fallback behavior and why older rows may show zero markers.
  - Document `wpm` and `reviewGraceMinutes`.

- [ ] **Validate end to end**
  - Run existing task-tracker tests.
  - Add Codex fixture tests for no-source, estimated review, visible-output counting, and long true-idle gaps.
  - Confirm no test fixture contains real transcript content.

## Recommended Initial Direction

Start with research, but expect rollout JSONL parsing plus explicit unsupported fallback to be the likely first implementation path. It appears to require no network service, can be tested with synthetic JSONL fixtures, and can degrade cleanly when Codex changes its local storage. Treat rollout parsing as an observed implementation detail unless official documentation confirms it as stable.

