### Timing-log repair — overnight AFK interval

The Agent Review Gate objected to a 23h 22m wall-clock gap between `plan:started` and
`plan:completed` carrying no departure boundary. The gap was real; the classification was not.
The whole interval was recorded as **active**, which inflates this issue's velocity data and
would corrupt any estimate calibrated against it.

**Repaired** with `heal-timing-interval`, which inserts an authoritative
`pause:retroactive` / `resumed` bracket and reconciles the cached durations:

```
#1562 [apply] healed plan:started: 83372s; active 88886s → 5514s; idle 0s → 83372s
```

Plan-stage active time: **24h 41m → 1h 32m**. Idle: **0 → 23h 09m**.

**Boundary evidence.** Both endpoints come from durable artifacts, not recollection:

| Boundary | Timestamp | Evidence |
| --- | --- | --- |
| Departure | 2026-09-08 23:15:00 -05:00 | commit `0ddb747a` — the last durable activity of that session |
| Re-engagement | 2026-09-09 22:24:32 -05:00 | @kburson's reply resuming the session; first commit after it is `06cdcad5` at 22:27:10 |

The session had halted at a STOP report awaiting a human decision about corrupted Verification
Commands sections, and stayed halted until that decision arrived. The elapsed time is genuine
wall-clock idle, not unlogged work.

**Why repaired rather than annotated.** A missing departure row makes an idle gap indistinguishable
from sustained effort in the velocity ledger. A comment alone would leave the corrupt numbers in
place for every future reader and every estimate derived from them. The rows are now correct and
this comment records how the boundaries were established.

<!-- aitm-timing-heal-record -->
