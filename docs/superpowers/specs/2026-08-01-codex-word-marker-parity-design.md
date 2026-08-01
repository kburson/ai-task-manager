# Codex Word-Marker Transcript Parity Design

**Status:** Approved under the operator's standing Full-Auto instruction

**Issue:** #1092

## Problem

Codex Desktop exposes `CODEX_THREAD_ID`, but the Codex provider adapter recognizes
only `CODEX_SESSION_ID` and `CODEX_HOME`. AITM therefore detects Claude, resolves
`default-session`, writes session state beneath `.tmp/aitm/app/claude`, and cannot
find the date-bucketed Codex rollout. Explicit overrides find the rollout, but the
counter still returns zero because it only understands Claude message records.

Codex's authoritative visible records are `response_item` payloads:

- `message` with `role=user|assistant` and `input_text|output_text` content;
- `custom_tool_call` and `function_call` for visible tool chips and inputs;
- `custom_tool_call_output` and `function_call_output` for expanded results.

`event_msg` mirrors, reasoning, developer/system messages, and Desktop-injected
user context are not reader effort and must remain excluded.

## Constraints

- Preserve Claude counts and cursor behavior.
- Keep provider detection and transcript layout declarative in provider adapters.
- Keep normalization pure; it must not read files or timing state.
- Keep the three existing effort tiers: prose, stay-abreast, and full expansion.
- Do not backfill historical timing rows.
- Never represent an unavailable Codex measurement as an unqualified successful
  zero.

## Considered Approaches

### Inline Codex branches in `word-counter.mjs`

This is the smallest patch, but it makes the shared counter own vendor schemas and
turns every future provider change into another branch in timing code.

### Pre-convert Codex rollouts into Claude JSONL

This reuses the existing counter but creates another mutable transcript, adds
cursor synchronization, and risks counting stale or partially copied data.

### Provider schema plus pure normalization (selected)

Provider adapters declare their transcript schema. A pure normalizer translates
Claude or Codex records into the same event vocabulary. `countWords()` retains one
tier calculator over those events. This isolates vendor drift, avoids copied
transcripts, and lets existing Claude fixtures remain the compatibility oracle.

## Architecture

```text
environment
  -> provider registry (Codex thread/session identity)
  -> transcript resolver (flat or date-bucketed path)
  -> JSONL reader
  -> transcript normalizer (Claude/Codex -> neutral events)
  -> three-tier counter + cursor
  -> runtime timing row + session-reference marker
```

The provider-neutral event types are:

```js
{ kind: 'text', text: string }
{ kind: 'tool-call', name: string, chip: string, input: unknown }
{ kind: 'tool-result', text: string }
```

`normalizeTranscriptRecord(record)` returns `{ events, recognized, schema }`.
Unknown and malformed records return no events and do not throw. The counter applies
the shared injection filter to every text/result before adding words.

## Identity and Path Resolution

The Codex adapter registers `CODEX_THREAD_ID` before `CODEX_SESSION_ID`. Either key
detects Codex; the thread key wins when both exist because it is the suffix of the
native Desktop rollout filename. `AI_TASK_MANAGER_SESSION_ID` remains the global
highest-precedence orchestrator override.

Once Codex is detected, existing adapter data selects:

- state: `.tmp/aitm/app/codex`;
- native root: `~/.codex/sessions`;
- layout: `YYYY/MM/DD/rollout-<timestamp>-<thread>.jsonl`.

The date-bucket resolver remains bounded and matches the complete thread suffix.
Claude's flat-path behavior is unchanged.

## Counting Semantics

For Codex messages, only `response_item.payload.type === 'message'` with role
`user` or `assistant` is authoritative. `input_text` and `output_text` contribute
to prose after injection filtering. Developer/system roles, `event_msg` mirrors,
reasoning, and sub-agent metadata are ignored.

Desktop-generated user blocks beginning with `<recommended_plugins>`,
`# AGENTS.md instructions`, or `<environment_context>` join the existing injection
prefixes. Actual user messages in adjacent content blocks still count.

A tool call contributes a short chip (normally its displayed name plus a concise
target when present) to stay-abreast. Recursively collected string leaves from its
input contribute only to full expansion. Tool output text contributes only to full
expansion. Custom and function call families use identical rules.

## Diagnostics

Transcript resolution and counting expose structured availability:

```js
{
  status: 'ok' | 'unavailable',
  code: null | 'codex-session-unresolved' |
    'codex-transcript-unresolved' | 'codex-schema-unrecognized'
}
```

Backward-compatible numeric fields remain present, but a Codex unavailable result
is accompanied by a deduplicated `⚠ [aitm:word-measurement] <code>` diagnostic on
stderr. Deduplication is keyed by code/session/path for the process lifetime so a
long lifecycle command is observable without flooding output.

## Testing

- Provider tests pin Desktop detection, session precedence, Codex state location,
  and date-bucket path resolution.
- Codex counter fixtures pin prose, injections, tools, outputs, malformed records,
  line cursors, and diagnostic codes.
- Existing Claude counter fixtures must retain their exact results.
- A runtime integration test appends Codex records between multiple flushes and
  proves positive segment deltas, increasing markers, and the native session path.
- Full unit, integration, slow, lint, and format gates run through AITM Test.

## Out of Scope

- Historical timing-log repair or backfill.
- New timing columns or revised tier weights.
- Parsing hidden reasoning or developer/system context.
- Supporting arbitrary future Codex schemas without an explicit normalizer update.
