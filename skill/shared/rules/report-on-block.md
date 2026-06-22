<!-- aitm-skill-version: 1.0.0 -->

# rules/report-on-block.md

Tier-2 rule file. Loaded JIT whenever a skill script blocks you — a PreToolUse Bash hook returns `{decision:"block"}`, or a `node scripts/task-tracker/...` command exits non-zero and prints an error to stderr. On first read, emit a single line in your reply:

```
aitm-skill-loaded:rules/report-on-block:1.0.0
```

## Purpose

This repo ships a `report` verb (#496) that lets a downstream beta user file a defect or feature UPSTREAM to the public `kburson/ai-task-manager` repo. This rule closes the loop: when one of the skill's own guards or scripts blocks you, surface the option to report it, so a genuine false-block becomes a one-step upstream defect instead of silent friction.

## Directive 1 — structured hint (preferred)

Some block paths emit a machine-readable trailer of the exact form:

```
aitm-defect-hint: <verb> <reason>
```

It appears in the hook `block` reason text or on stderr (emitted by `lib/defect-hint.mjs` from the gh-edit-guard `--body`/`--body-file` refusal and from the `MarkerLossError` / `SeederMarkerMissingError` error classes via the top-level catch).

When you see an `aitm-defect-hint:` line, **offer** — do not auto-run — to file it:

```
/task report --kind defect --from-hint "<verb> <reason>"
```

Lift the `<verb> <reason>` text verbatim from the trailer (everything after the `aitm-defect-hint:` prefix). The `report` verb's two-phase mandatory-review gate still applies — it drafts, you confirm, the user approves the actual submission. Never auto-submit, and never offer a _feature_ report off a block hint (blocks are defects).

## Directive 2 — behavioral fallback (no structured hint)

Most block paths — verb gate refusals, ad-hoc throws — do **not** carry a structured hint in this pass. When a skill script blocks you and there is no `aitm-defect-hint:` trailer, still offer a defect report, synthesizing the hint yourself:

- `<verb>` = the failing command (e.g. `task promote`, the verb you ran)
- `<reason>` = a one-line summary of the refusal message

```
/task report --kind defect --from-hint "<failing-command> <one-line refusal summary>"
```

Same gate, same rule: offer, never auto-submit. Only raise this when the block plausibly reflects a tool defect rather than expected user error — do not nag on every routine gate refusal (e.g. an unchecked-AC block that you can simply satisfy).
