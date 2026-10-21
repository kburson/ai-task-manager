# #2039 source reconciliation quota incident

Current active issue #2057 remains R4P. Native pause for switch-out to #2058 refused with exit 10 / `PROMPT_REQUIRED: assignee-unverifiable`: GitHub reported its API rate limit exceeded for user ID 1082467. No ownership bypass or offline override was used. Eighteen child source bindings are reconciled. Product implementation has not begun. #2079 remains Develop pending native Test/Review/delivery; #2039 remains Plan. Remaining root collateral/configuration is preserved.

## Direct quota evidence

At 2026-10-21T04:22:56Z, REST `/rate_limit` reported GraphQL remaining 4449, used 551, reset 1792557793; core remaining 4906. Native Explain for #2057 returned indeterminate / authority-read-failed.

At 04:24:03Z, a single quota-only GraphQL request returned HTTP 200 with GraphQL-resource headers and response body agreeing on remaining 0, used/limit 5000, reset 1792557737 / 2026-10-21T04:42:17Z, cost 1. Request ID: F39E:20EFC1:1BDA7F5:5ACF008:6AD83E63. The explicit native capture shim retained this read with an invalid-inherited-context diagnostic; its session attribution is unknown, not claimed complete.

At 04:24:58Z, REST `/rate_limit --include` still reported GraphQL remaining 4447, used 553, reset 1792557793, while its own headers described the core resource (remaining 4905). Request ID: F3EB:30C0E6:1415971:41070EF:6AD83E99. Cache-Control was no-cache. Both direct responses reported public OAuth client ID 178c6fc778ccc68e1d6a and the same OAuth scopes; executable resolution was /opt/homebrew/bin/gh, and REST identity was kburson / 1082467. No credentials were printed, replaced or rotated. The underlying endpoint-counter discrepancy is unexplained; alternative authentication is not established.

The actual GraphQL headers govern the refusal. No further GitHub request should run before that reset. GitHub documents that response headers are authoritative when the rate-limit overview disagrees: [REST rate limits](https://docs.github.com/en/rest/rate-limit/rate-limit). Its GraphQL guidance requires waiting until the reset when remaining is zero: [GraphQL rate limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api). These sources determine handling, not the unexplained cause of the discrepancy.

## Independent local capture audit, verbatim

Canonical `readUsage` aggregation for **03:42:17–04:24:58.999Z**:

| Operation | Calls | Known points | Unknown cost |
|---|---:|---:|---:|
| Assignment/status snapshot (`cc1b2b…`) | 1,718 | 1,716 | 2 |
| Parent child inventory (`c5c674…`) | 52 | 1,100 | 2 |
| `AitmEstimationProjection` | 157 | 157 | 0 |
| Membership with fields (`eb7480…`) | 157 | 156 | 1 |
| Other operations | 2,055 | 396 | 1,659 |
| **Total** | **4,139** | **3,525** | **1,664** |

All captured records belong to the current `bc8d` worktree. Of these, 4,138 belong to session hash `62b71c14…`; one has unknown session. No other captured worktree traffic appears in this interval. This is **not full account coverage**: 1,443 opaque issue-view calls alone have unknown cost, and no records contain response-header budget samples.

Both fingerprints were reproduced offline from source after normal cost augmentation:

- `cc1b2b…`: `fetchAssignmentSnapshot`, checking assignment and project Status.
- `c5c674…`: `fetchAllSubIssueNodes`, enumerating a specified epic’s direct children. Fifty successful calls cost 22 points each; two failed without reported cost.

**No historical estimation-corpus queries appeared in this window.** Those named queries exist in older retained records, last observed October 20 at 13:38:15Z. Source connects corpus loading to adaptive plan estimation; the repeated child query is current WBS authority.

Authentication flows through the launchers and shim without a token or host rewrite. No local quota comparison causes this refusal: failed assignment transport is caught and reported as ownership unverifiable. Your direct GraphQL response showing zero remaining supports real GraphQL exhaustion despite the contradictory REST overview. The underlying counter discrepancy remains unexplained.

The next bounded probe should occur after the actual GraphQL reset: one minimal assignment/status query with response headers through the same native environment, retaining sanitized endpoint, identity, request ID and quota evidence. Preserve ownership checks; no token substitution or quota bypass.

No raw records, source, bindings or remote state were changed. Whole-store parsing reported zero malformed, conflicting, duplicate, partial or unreadable records; its 428 unclosed writers were not attributed to this interval.

## Author disposition

Accepted. The two identified read families account for 2816/3525, about 80 percent of known cost. Unknown costs remain unknown; do not infer they are zero or claim whole-account coverage. The report is descriptive, not a controlled baseline comparison or a claim of savings. Retain the original raw captures and the frozen baseline. An intermediate compact message misstated the remaining known points as 374; the corrected subtotal is 214 after the separately listed six detailed operations, consistent with the final table above. No raw operation total changed.

## Independent operator-adjustment review, verbatim

**The adjustment is supported**, with a narrower interpretation of the result.

`explain N --action bind --json` evaluates bind readiness through `evaluateSessionReadiness`. It retains fresh body/board consistency, ownership, worktree, occupancy, migration and decomposition observations. It does not request a lifecycle transition. Default Explain requests `promote` and evaluates the applicable stage-exit readiness.

Two qualifications matter:

- Bind readiness does **not prove an existing binding**: its collector permits `stateBefore.active === null`. Retain the native bind result and local session record for that evidence.
- It does **not verify intended metadata bytes were published**. Retain the metadata writer’s guarded write/read-back evidence. Decomposition restrictions remain bind warnings under the existing policy; a ready bind result is not implementation or promotion approval.

This command choice leaves native metadata-write guards intact. It may reduce irrelevant stage-exit work, but epic bind readiness still collects decomposition/WBS authority, so savings are unmeasured.

For polling, an empty `write_stdin` call reads output from the existing process; it does not launch another CLI invocation. The process can continue making its own reads while the tool waits. Source shows shared preflight per native command and repeated authority collection at internal checkpoints, but I found **no evidence attributing the observed assignment-read count to output polling**.

Existing tests explicitly cover read-only Explain, skipped-authority refusal, bind observations and per-invocation read reuse. I inspected them without running tests, changing files or making network requests.

## Author disposition of operator adjustment

Use the registered bind-readiness Explain for remaining metadata-only switches after reset, retaining actual bind and guarded metadata-write/read-back results. Use full promotion Explain before real stage changes. This changes no source, configuration, provider identity, guard or required execution predicate. Savings remain unmeasured. The output-polling hypothesis is unsupported and is not presented as the cause.

## Reset and recovery observation

No further GitHub query was made before the actual reset. At 2026-10-21T04:42:29Z, one direct GraphQL viewer/quota request returned `kburson`, used 1, remaining 4999, limit 5000, next reset 2026-10-21T05:42:29Z. Body and GraphQL-resource headers agreed. Request ID: F677:28F350:152B735:446E1FF:6AD842B5; public OAuth client ID remained 178c6fc778ccc68e1d6a. The explicit capture shim again recorded invalid-inherited-context / unknown-session provenance; no complete session/header coverage is claimed by the canonical usage schema. Fresh native bind-readiness validation follows before retrying the previously refused switch. This is quota recovery, not task completion.

## Second exhaustion during root admission preparation

After the 04:42:29Z recovery, all 32 source bindings and the three fulfilled #2073 dependency removals completed. Native Plan approval refreshed the orchestration record. The guard-directed native `ensureDeepDive` helper confirmed body version 69, and the guard-directed `appendPlannedEstimate` helper confirmed operation `8ef121e6-1956-4ca3-a96c-06d47d5dad82` with the agent-produced XL/106h local proposal in existing comment 6283665492. Neither helper used injected authority dependencies or an offline flag. Fresh promotion Explain reported ready, no blockers, no warnings.

The subsequent native `promote 2039` refused because GraphQL quota was exhausted; recorded state remained Plan. The 2026-10-21T05:13:04Z quota-only response and GraphQL headers agreed: used/limit 5000, remaining 0, reset 1792561349 / 05:42:29Z, response cost 1. Request ID `CD12:26D630:172A683:4AFED30:6AD849E0`; public OAuth client ID `178c6fc778ccc68e1d6a`. The quota probe is captured with unknown inherited-session provenance. Native Explain then returned indeterminate/state-unavailable; native pause refused exit 10, assignee-unverifiable. The local #2039 timer therefore remains active pending connectivity; no pause, state change or offline timing repair is claimed.

Canonical `readUsage` audit of **04:42:29.000Z–05:13:59.999Z**, performed locally after the refusal:

| Family | Observations | Known points | Known costs | Unknown costs |
| --- | ---: | ---: | ---: | ---: |
| Assignment snapshot (`cc1b2b…`) | 1989 | 1987 | 1987 | 2 |
| Current parent-child inventory (`c5c674…`) | 41 | 880 | 40 | 1 |
| Project membership/fields (`eb7480…`) | 146 | 146 | 146 | 0 |
| AitmEstimationProjection | 146 | 146 | 146 | 0 |
| Other families | 2070 | 239 | 239 | 1831 |
| Total | 4392 | 3398 | 2558 | 1834 |

The 40 cost-bearing current-parent inventories cost 22 points each. Assignment snapshots plus inventories account for 2867/3398 known points (about 84%). The window also includes 1640 opaque `gh.issue.view` observations, all with unknown cost. Unknown cost is not zero; the captured 3398 known points do not account for the complete account quota. This is an observation count, not a complete HTTP request count. It is not a wire-byte measurement, nor a controlled before/after claim.

All window rows have this worktree's recorded identity; session identities are the current session hash and null. Assignment snapshot launch attribution is 817 `aitm-cli` and 1172 null; current-parent inventory attribution is 16 `aitm-cli` and 25 null. Explicit shim use on guard-directed helper diagnostics retained traffic but did not establish a complete native root launch context, so null launch attribution must remain unknown. Whole-store malformed, conflicting, duplicate, partial and unreadable-record counts were all zero at this read. The first table's independent source mappings remain applicable; this second table is an author-run local aggregation, not a new independent reviewer report.

Diagnostic-output limitation: native `decompose-check --json` calls exited with a large, truncated JSON string before its readiness tail could be parsed. Three attempted output inspections were retained rather than discarded; a read-only call to the same native helper then exposed planning=true/completion=false, and a separate current child-admission read returned all 32 children R4P with current refinement and valid ranks. These diagnostic calls add real traffic and are not implementation savings. Future diagnostics should project bounded output before process exit in a separately governed change; no diagnostic source was modified here.

## Second recovery

No further GitHub probe was made before reset. At 05:42:44Z, one captured GraphQL viewer/quota request returned `kburson`, remaining 4999, used 1, limit 5000 and next reset 06:42:44Z. GraphQL headers and body agreed. Request ID `D01E:ED4B5:21798E6:6D0EC4A:6AD850D4`; public OAuth client remained `178c6fc778ccc68e1d6a`. The probe again retained unknown inherited-session provenance. Fresh native readiness validation follows before promotion; this recovery alone grants no state change or completion claim.
