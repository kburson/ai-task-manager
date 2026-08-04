# Resume Auto-Gap Activity Design

## Problem

`npx aitm resume` currently treats every unmarked timing gap longer than eight hours as idle. That is unsafe when durable same-issue work occurred during the interval. On #1077, issue-attributed commits and verification reports spanned the candidate gap, yet resume inserted `pause:auto-detected-gap` and reclassified the entire interval as idle.

## Decision

AITM will suppress whole-gap idle synthesis when at least one authoritative same-issue activity timestamp falls strictly after the last timing row and at or before the resume time. The existing recovery remains unchanged when activity lookup succeeds and finds no evidence.

Activity evidence is deliberately narrow:

- commit timestamps returned by the existing message-attribution engine for canonical `[#N]` commit subjects;
- GitHub comment `createdAt` timestamps for established verification-report, sandbox-verification, and new-automated-tests headings.

Ordinary discussion comments, unrelated commits, labels, wall-clock input order, and malformed timestamps do not count.

## Architecture

The existing timing-comment GitHub read already fetches every issue comment. It will retain those records on the successful result instead of issuing another API call. A new `resume-activity-evidence.mjs` leaf module will classify verification comments, collect attributed commits, normalize timestamps, and return one of `found`, `none`, or `unknown`.

`detectUnmarkedDepartureGap` remains the pure timing classifier and gains an optional activity-timestamp input. Existing callers keep current behavior. Resume first detects whether an expensive lookup is needed, collects evidence only for a suspicious candidate, then re-evaluates the candidate with timestamps. An `unknown` lookup fails closed against minting idle and emits a diagnostic; it does not block binding.

## Data Flow

1. Read the timing comment and retain the already-fetched issue comments.
2. Detect a suspicious unmarked gap using current #981 behavior.
3. If no candidate exists, do no activity lookup.
4. For a candidate, collect structured verification-comment timestamps and local `[#N]` commit timestamps.
5. `found`: pass timestamps to the detector and suppress the synthetic row.
6. `none`: preserve the synthetic departure plus resumed pair.
7. `unknown`: emit a warning and suppress synthetic idle classification.

## Error Policy

A failed timing-comment read already suppresses the #981 repair. A failed commit lookup is not equivalent to no commits. If recognized verification evidence already proves activity, the result is still `found`; otherwise the collector returns `unknown`, and resume refuses to fabricate idle while continuing the bind.

## Test Strategy

- Pure detector tests pin interval boundaries and malformed/out-of-window values.
- Evidence tests pin canonical commit attribution, exact verification headings, generic-comment rejection, timestamp normalization, and lookup failure.
- Resume orchestration tests reproduce the #1077 timeline and prove `found`, `none`, and `unknown` dispositions.
- Timing-reader tests preserve the existing `status`, `body`, and `error` contract while adding retained comments.

## Scope Boundaries

This change does not rewrite historical timing rows, change the eight-hour threshold, infer activity from unrelated repository work, or split a candidate gap into invented sub-intervals.
