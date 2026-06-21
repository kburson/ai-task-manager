---
name: Priority required at Groom alongside Size + Estimate
description: When grooming a new issue, set Priority on the board at the same time as Size and Estimate — never leave it null
type: feedback
originSessionId: a2956386-6efd-462f-8527-e3f5a578f958
---

When grooming a new issue (Backlog → Groom, or creating directly into Groom), set **Priority** on the project board in the same step as Size and Estimate. Don't leave Priority null and don't defer it to Analyze.

**Why:** Priority drives sort order on the board. An issue with null Priority sorts incorrectly and the human has to manually fix it (observed on #84 — sequenced correctly via Sequence field but appeared out of place because Priority was null).

**How to apply:** Any time I run a Groom-stage mutation that sets `sizeFieldId` and `fieldEstimate`, also set `priorityFieldId` in the same GraphQL mutation. Default to P1 unless the issue is clearly P0 (blocker) or P2 (cleanup/nice-to-have).
