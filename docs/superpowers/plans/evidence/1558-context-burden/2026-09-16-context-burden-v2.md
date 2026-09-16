# #1558 Context-Burden Transcript Baseline V2

> **Research snapshot, not an acceptance baseline.** Read the [author assessment](README.md) before using these totals or scenario labels. The extractor has confirmed counting/classification defects. Original findings below are preserved as research, not endorsed measurements.

Generated: 2026-09-16T12:16:08.355Z

This baseline refines the earlier quick count into an auditable, event-level ledger for evaluating the current AITM Markdown/tool workflow. It does not predict a percentage reduction. It identifies measured current burden, categories likely addressable by #1558, and gaps that still require running the replacement workflow against equivalent scenarios.

## Inputs

- Prior quick note: `.tmp/review-stats/1558-context-burden-transcript-stats.md`
- Spec: `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`
- Plan: `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md`
- Codex logs: `~/.codex/sessions/**/rollout-*.jsonl`, `~/.codex/archived_sessions/**/rollout-*.jsonl`
- Claude logs: `~/.claude/projects/**/*ai-task-manager*/**/*.jsonl`

## Method

The extractor records one ledger row per visible tool, lifecycle, instruction, hook/host, compaction, or other traffic event. It stores source-log path plus line locator, provider, session ID, timestamp, context segment, issue attribution, category, command/tool, instruction path when identifiable, visible input/output character counts, UTF-8 byte counts, completeness, close outcome, and duplicate status.

Issue attribution is command-target first. If an event has no explicit issue but follows an explicit bind/start/resume in the same observable context segment, it is attributed to that active binding; if the session has multiple issue targets, the method is marked active-binding-shared-session. Otherwise it remains unattributed. Whole-corpus activity is not divided by only the subset of issues with close commands.

Close outcomes are separated as confirmed successful close, failed close, attempted close with unknown output/outcome, and not-close. A confirmed close requires visible output with success language; missing or truncated output is not treated as success.

Deduplication uses exact visible-content hashes across provider, session, category, input, and output. This removes exact repeated/imported log events where visible content matches, but forked or semantically repeated work with different text remains counted and is labeled as remaining uncertainty.

Character counts and bytes are raw visible transcript counts. Proxy tokens use `Math.ceil(chars / 4)` and are labeled only as proxy. No real tokenizer was run.

The extraction cutoff is `2026-09-16T12:00:00.000Z`, which excludes this audit/extraction session from the measured historical baseline. Re-run with a different `--cutoff=<ISO>` only if intentionally changing the evidence window.

## Category Totals

### Codex

| Category             | Events | Input chars | Output chars | Proxy chars/4 | Complete | Truncated | Unavailable |
| -------------------- | -----: | ----------: | -----------: | ------------: | -------: | --------: | ----------: |
| instruction_loading  |   1179 |      819867 |     15205405 |       4006318 |     1098 |        81 |           0 |
| help_discovery       |   1167 |      604183 |     14987225 |       3897852 |     1032 |       135 |           0 |
| lifecycle_command    |    749 |      594502 |      1668153 |        565664 |      739 |        10 |           0 |
| host_hook_injected   |    301 |     4756727 |            0 |       1189182 |      251 |        50 |           0 |
| other_unattributable |  21144 |    15371860 |    106987160 |      30589755 |    20207 |       937 |           0 |
| compaction_reset     |     29 |           0 |            0 |             0 |       29 |         0 |           0 |

### Claude

| Category             | Events | Input chars | Output chars | Proxy chars/4 | Complete | Truncated | Unavailable |
| -------------------- | -----: | ----------: | -----------: | ------------: | -------: | --------: | ----------: |
| instruction_loading  |    523 |      108712 |      1837543 |        486564 |      523 |         0 |           0 |
| help_discovery       |  11897 |     2062170 |     14888012 |       4237546 |    11789 |       108 |           0 |
| lifecycle_command    |   2660 |      628985 |      1973091 |        650519 |     2660 |         0 |           0 |
| host_hook_injected   |   3307 |     4154173 |            0 |       1038544 |     3218 |         0 |          89 |
| other_unattributable |  48109 |     9737429 |     69327246 |      19766169 |    47897 |       204 |           8 |
| compaction_reset     |     50 |           0 |            0 |             0 |       50 |         0 |           0 |

## Cohorts

- Unique events: 91115
- Exact duplicate visible-content events: 157858
- Source logs: 308
- Attributed issues: 177
- Confirmed completed issue workflows: 36
- Partial/no-confirmed-close issue workflows: 141
- Close outcomes in unique lifecycle rows: 36 confirmed successful close, 5 failed close, 25 attempted close with unknown outcome. Generic failed/refused tool rows are retained separately and are not treated as failed closes.

Per-session and per-issue distributions are in `1558-context-burden-v2-cohorts.json`. Distributions include n, min, median, p75, p90, and max per category. Sparse tails should not be interpreted as universal maxima.

## Compaction And Context Segments

Codex compaction is detected from explicit `type=compacted` records. Claude compaction detection is limited to visible `PreCompact`/`PostCompact` hook names; absence of those hook names is undetectable, not evidence that no compaction occurred. Each detected boundary starts a new context segment and clears active issue binding for attribution.

Within each segment, instruction reads are labeled first-in-segment or repeat-in-segment by exact instruction path. The cohort JSON includes the first instruction-load and help/discovery burden before the next lifecycle command for observable segments. These are temporal associations only; they do not prove compaction caused a reload.

## Representative Scenario Candidates

The scenario candidates are stored in `1558-context-burden-v2-scenarios.json`.

- Ordinary near median: claude #855 (confirmed-completed-observed-close)
- Substantial help/discovery: claude #1490 (confirmed-completed-observed-close)
- Observed compaction/instruction reload: claude #854 (confirmed-completed-observed-close)
- Reachable heavy/repeated remediation: claude #1490 (confirmed-completed-observed-close)

These are candidates for the plan's paired baseline. They preserve observed event order through event IDs and source locators; they are not selected to maximize apparent savings.

## Validation Notes

The extraction was run twice with the recorded cutoff and produced identical counts: 248,973 total ledger rows, 91,115 unique visible-content rows, 157,858 exact duplicates, and 308 source logs. The cutoff prevents this audit/extraction session from changing the historical baseline while the script is being rerun.

Manual validation inspected raw source JSON at the ledger locators for a stratified sample from both providers:

- Codex positive matches: `ev-0000035` instruction load, `ev-0000037` workflow-guidance search, `ev-0000043` lifecycle command, `ev-0000001` host instructions, `ev-0000015` compaction record.
- Claude positive matches: `ev-0026126` instruction load, `ev-0025658` workflow-guidance search, `ev-0026608` lifecycle command, `ev-0025541` hook-injected instruction/guard text, `ev-0026865` compact hook boundary.
- Excluded near-matches: Codex `ev-0000005` patch text mentioning lifecycle concepts is `other_unattributable`; Claude `ev-0025551` environment/status probe is `other_unattributable`; ordinary implementation searches such as spec reads and spelling/test-code searches remain outside help/discovery unless workflow guidance terms are present.

Validation found and corrected four extraction errors before final output: patch/documentation text was too easily classified as lifecycle/help, `--help` and `aitm help` rows were being mixed into lifecycle rows instead of help/discovery, shell redirection like `2>&1` could create a phantom issue `#2`, and duplicate hashes originally ignored returned output. The final ledger includes input line and output line locators where output is visible.

Fail-open checks: unavailable content remains `completeness=unavailable` rather than zero burden; missing tool output remains `outcome=pending-output` or an attempted-close unknown outcome; duplicate rows are marked `duplicateStatus=exact-duplicate-visible-content`; unknown issue attribution remains `attributionMethod=unattributed`. In the final all-row ledger, these checks surface 65,496 unavailable rows, 1,562 truncated rows, 157,858 exact duplicates, 229,093 unattributed rows, and 8 command-like rows with no output locator. These are retained as uncertainty, not silently converted to zero.

## Potentially Addressable Burden

Measured current burden falls into addressable buckets: repeated instruction loading, workflow help/discovery, lifecycle command input/output chatter, and host/hook-injected instruction text. The replacement workflow still needs its own paired run against equivalent scenarios before any reduction percentage can be claimed.

## Artifacts

- Event ledger: `1558-context-burden-v2-events.jsonl`
- Cohort summaries: `1558-context-burden-v2-cohorts.json`
- Source manifest: `1558-context-burden-v2-source-manifest.json`
- Scenario candidates: `1558-context-burden-v2-scenarios.json`
- Extraction script: `extract-1558-context-burden-v2.mjs`
- Invocation: `node .tmp/review-stats/extract-1558-context-burden-v2.mjs --cutoff=2026-09-16T12:00:00.000Z`
