---
name: project_ai_peer_review_is_sole_review_authority
description: "AITM's own co-review runtime was removed (#1592); the external ai-peer-review package (pinned 0.2.0) is now the sole review-protocol authority."
metadata:
  node_type: memory
  type: project
---

2026-09-11 (#1592): AITM's duplicate co-review runtime and `npx aitm co-review` command were deleted. AITM no longer owns review-protocol discovery, schemas, or compatibility commands — it keeps only strict task occupancy plus a read-only, explicitly non-authoritative status cache. The external `ai-peer-review` package, exact-pinned at `0.2.0`, is the one CLI/protocol authority for spec/plan review rounds (the `peer-review` skill drives it). All historical review collateral under `docs/superpowers/reviews/**` was preserved byte-for-byte; only the live runtime was retired.

**Why:** two parallel review-protocol implementations (AITM's internal one and the standalone package) risked drifting out of sync on schema/behavior. **How to apply:** don't look for or reintroduce `npx aitm co-review`/`npx aitm peer-review` — spec/plan review work goes through the `peer-review` skill / `ai-peer-review` package directly. If a future `ai-peer-review` upgrade is needed, it's a version bump of that external dependency, not AITM code.
