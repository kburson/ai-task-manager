---
artifact: Cost evidence for the review-order experiment
status: observational-evidence-with-hypothetical-valuation
model: gpt-6-astra
effort: high
role: coordinator-and-telemetry-auditor
as_of: 2026-09-20
actual_billed_cost: unknown
---

# Observed usage and hypothetical cost

This supplement reports locally observed model usage for the two review trajectories. It does **not** report actual money spent, complete experiment cost, or a cost-efficiency winner. The companion [JSON evidence](cost-evidence.json) contains exact counts, attribution windows, audit totals, rates, and unrounded valuations. The paper-writing agent and this research turn are excluded.

## Scope and attribution

Arm A is SAR → SPR → XPR; arm B is XPR → SPR → SAR. We inspected usage metadata for the continuing Astra author/coordinator, both dedicated Sol reviewers, the fresh Astra author, and both genuine Opus reviewers. Model and effort for Codex actors come from session turn metadata; Opus model comes from response usage, with medium effort declared by the launch/protocol. The research writer is a separate GPT-5.6 Sol agent at **low** effort, independently observed in turn metadata; it is not either experimental Sol reviewer, both of which ran at medium.

Each stage's window begins with the user's stage instruction (B XPR begins with the fresh author's first task) and ends at the next stage or unrelated instruction. The JSON records exact UTC boundaries. These wider windows include setup, checks, archival, status, and runtime repair performed in that stage; they are not pure review-compute benchmarks. Dedicated reviewers' entire observed stage sessions are included. Attribution uses the timestamp at which usage was recorded; a request spanning a boundary can be assigned imperfectly. The protocol create-to-finalize durations elsewhere are a different clock and must not be confused with these cost windows.

For A, author and coordinator are the same actor. For B, the fresh author and parent coordinator are separate actors and are separately listed. The parent continued to inspect progress and preserve evidence, creating a material orchestration asymmetry. A's initial SAR r1 usage was not found in the inspected sources, so its SAR row covers **r2–r5 only**. A preflight and inter-stage gaps, folder organization, feature-request creation, integration/CI, the abandoned contaminated reverse attempt, original-spec authoring, and paper research are excluded. They are not assigned zero cost.

## Deduplication and token semantics

For Codex, repeated identical cumulative counters were ignored. Every remaining cumulative increment matched its corresponding last-request usage, with no counter resets or discrepancies. Thus last-request usage can be summed within the stated windows. Cached input is a subset of input; uncached input equals input minus cached input. All observed OpenAI cache-write counters were zero. Reasoning tokens are an output subset and are not charged again.

For Claude, split assistant records can repeat one message's usage. We retained one usage record per message ID: A had 82 records representing 40 unique messages; B had 97 representing 46. Repeated IDs had identical usage. Cache creation is separate from ordinary input and cache reads. The reported five-minute and one-hour cache-write counts reconcile exactly to total cache creation. One-hour writes were preserved at their own rate. Both transcripts report standard speed/service tier; server-side web search/fetch usage counters are zero in these observed messages. That does not prove all possible tool charges were zero.

Only sanitized aggregates and metadata digests are published. Private provider session handles, transcript text, reasoning content, account balances, and credentials are excluded. The digests attest to the particular metadata extraction, not to independent billing reconciliation. Public readers can reproduce the arithmetic from the aggregates; raw telemetry validation requires access to the retained private local logs.

## Rate-card scenario

The baseline uses the official public USD rates observed on 2026-09-20, per million tokens:

| Model         | Uncached input | Cached input |            Cache writes | Output |
| ------------- | -------------: | -----------: | ----------------------: | -----: |
| GPT-6 Astra   |         $10.00 |        $1.00 |                  $12.50 | $50.00 |
| GPT-5.6 Sol   |          $4.00 |        $0.40 |                   $5.00 | $20.00 |
| Claude Opus 5 |          $5.00 |        $0.50 | $6.25 / 5m; $10.00 / 1h | $25.00 |

OpenAI values use Standard short-context pricing. Each observed request's input was below 272,000 tokens. The current Codex host advertises priority service, while individual usage records do not identify a billed tier. A second scenario therefore doubles OpenAI rates for Fast mode while retaining Anthropic standard rates. These are sensitivity scenarios, **not a billed-cost interval**. OpenAI's table identifies priority as the previous name for Fast mode and Sol's price as promotional. [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [Astra model details](https://developers.openai.com/api/docs/models/gpt-6-astra), [Sol model details](https://developers.openai.com/api/docs/models/gpt-5.6-sol).

Anthropic's first-party standard rates distinguish cache-write duration and apply standard Opus pricing across its supported context window. [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing).

For each row, the baseline formula is:

```text
USD = (uncached_input × input_rate
     + cached_input × cache_read_rate
     + cache_write_5m × write_5m_rate
     + cache_write_1h × write_1h_rate
     + output × output_rate) / 1,000,000
```

OpenAI cache writes use their own listed rate, but the observed count is zero. Tool outputs already included in model input must not be charged a second time as model tokens. Any separate provider, MCP, infrastructure, or runtime charges require their own evidence and remain outside these subtotals. Human labor is excluded. Fixed subscriptions belong in a separate utilization ledger and are not allocated to reviews.

## Observed usage by actor and stage

The dollar column is **hypothetical Standard API equivalent**, not cash expenditure. Counts reflect repeated context processing across requests, not unique words in a document.

| Arm | Stage     | Actor                   | Usage observations | Uncached input | Cached input | Cache writes | Output | API equivalent |
| --- | --------- | ----------------------- | -----------------: | -------------: | -----------: | -----------: | -----: | -------------: |
| A   | SAR-r2-r5 | author-and-orchestrator |                 55 |        157,526 |    6,303,616 |            0 | 30,901 |          $9.42 |
| A   | SPR       | author-and-orchestrator |                 64 |        128,093 |    5,845,120 |            0 | 24,655 |          $8.36 |
| A   | XPR       | author-and-orchestrator |                 91 |        196,880 |   11,993,728 |            0 | 46,171 |         $16.27 |
| B   | XPR       | parent-orchestrator     |                 18 |        153,952 |    2,756,992 |            0 |  3,115 |          $4.45 |
| B   | SPR       | parent-orchestrator     |                 33 |         18,009 |    5,664,256 |            0 |  4,366 |          $6.06 |
| B   | SAR       | parent-orchestrator     |                 27 |         17,466 |    4,909,440 |            0 |  5,890 |          $5.38 |
| A   | SPR       | reviewer                |                 25 |        125,878 |    2,163,072 |            0 | 14,846 |          $1.67 |
| B   | XPR       | author                  |                 83 |        139,225 |    8,011,392 |            0 | 28,161 |         $10.81 |
| B   | SPR       | author                  |                 46 |         46,489 |    7,437,568 |            0 | 19,382 |          $8.87 |
| B   | SAR       | author                  |                 37 |        109,802 |    4,376,576 |            0 | 24,768 |          $6.71 |
| B   | SPR       | reviewer                |                 30 |        104,124 |    2,772,096 |            0 | 14,919 |          $1.82 |
| A   | XPR       | reviewer                |                 40 |             80 |    4,901,357 |      204,897 | 52,250 |          $5.81 |
| B   | XPR       | reviewer                |                 46 |             92 |    4,536,276 |      157,027 | 43,189 |          $4.92 |

## Stage subtotals and sensitivity

| Arm | Stage     | Standard API equivalent | OpenAI Fast + Anthropic Standard |
| --- | --------- | ----------------------: | -------------------------------: |
| A   | SAR-r2-r5 |                   $9.42 |                           $18.85 |
| A   | SPR       |                  $10.02 |                           $20.05 |
| A   | XPR       |                  $22.08 |                           $38.35 |
| B   | XPR       |                  $20.18 |                           $35.45 |
| B   | SPR       |                  $16.76 |                           $33.52 |
| B   | SAR       |                  $12.09 |                           $24.18 |

These subtotals do not support a total-cost ranking. A lacks SAR r1 and other intervals; B pays for a separate parent coordinator; A's runtime failure and repair occur within its XPR window, whereas B reused that repaired machinery. Context sizes, cache reuse, and growing histories differ. Request counts, tokens, and elapsed time are descriptive resource measures, not interchangeable quality measures.

The reviewer-only observations are useful for budgeting a similar run: Sol SPR reviewers correspond to about $1.67 and $1.82 under Standard rates; Opus XPR reviewers correspond to about $5.81 and $4.92. The work being reviewed differed, so these are not controlled prices per defect. Author repair and orchestration account for most of the observed stage valuation and cannot be omitted from a practical budget.

## What can and cannot be concluded

The evidence supports planning for the whole cycle: review, author adjudication, repair, verification, re-review, and coordination. It supports testing whether a small self-review budget followed by an independent reviewer avoids expensive late repair. It does not establish the cheapest review model, an optimal round count, a dollars-per-quality-point score, or an actual return on investment. A stopping rule based on remaining material risk is a proposed decision policy, not an optimum estimated from this pair of trajectories.

A stronger next experiment should collect event-keyed usage and runtime/tool charges from the start, preserve effective service tiers, reconcile usage against provider billing where available, track subscription capacity separately, apply equal coordination budgets, and evaluate remaining defects with independent judges. Unknown or unreconciled entries should remain explicit. An economic optimum also requires the expected consequence of an escaped defect; this experiment did not estimate it.
