---
name: Re-sequence sub-issues after deep-dive analysis
description: Sequence (along with Size/Estimate/Priority) is provisional at Groom; deep-dive analysis routinely reveals the right order — update the board to match.
type: feedback
originSessionId: a2956386-6efd-462f-8527-e3f5a578f958
---

Sequence numbers set during Grooming are placeholders (often just numeric/creation order). Deep-dive analysis frequently reveals a better order based on risk-to-fix ratio, dependencies, or shared-file constraints. When the deep-dive recommends an order that differs from the existing sequence, update the `sequence` field on the board (and in each sub-issue's fields-block) to match — don't leave the recommendation in the deep-dive while the board still says something else.

**Why:** The deep-dive sees the real code; grooming saw only the description. Keeping the board in sync prevents future runs (and humans) from following stale sequence numbers when a clearer order has already been argued for.

**How to apply:**

- During Analyze (especially epic-level), if the recommended order differs from `sequence`, update both the body fields-block and the project tether for each affected sub-issue.
- Sequence is one of the things refined at Analyze, alongside Size/Estimate/Priority. Treat it the same way: Groom = rough, Analyze = refined, Review = retrospective-only.
- If you recommend an order in a deep-dive, make the board reflect it before stopping.
