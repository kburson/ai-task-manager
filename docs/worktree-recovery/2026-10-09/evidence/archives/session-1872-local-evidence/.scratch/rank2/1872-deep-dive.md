## Deep-Dive Analysis (2026-10-03)

The baseline is 171c7d93866f67b58effa635be5ae737f54ef9eb. The installed sequential WIP rule rejects a second independent child even when the maintainer explicitly authorized rank 2 children #140/#144/#145 in ai-peer-review #107. This issue adds a governed shared admission capability; native hook correlation remains owned by #1841, and no public reviewer protocol changes belong here.

Source inspection identifies independent policy paths in epic-children-gate.mjs, wave-admission.mjs and pull-next.mjs. Existing accepted-terminal behavior permits Not Planned and the wave reader coerces CLOSED to Done; neither proves the requested actual board Done plus COMPLETED closure. The opted-in policy must therefore use a separate strict predicate for every target rank, including targets without a concurrency grant. The frozen child graph must retain refinement and dependency identity while excluding ordinary lifecycle progress.

Existing issue locks are worktree-local, so equal parent issue numbers do not share a physical lock across linked worktrees. Direct Promote holds a child lock before its runner, while pull-next holds parent then child. The implementation must introduce one physical Git-common-directory parent admission lock before child locks at both entry points. Record, refresh, revoke and Plan-to-Develop must serialize on that same lock. Tests will use real linked worktrees and independent contenders, including revoke racing Develop admission.

Authorization reuses existing host-backed human source validation with bounded ordered message references and exact hashes. Persistent authentic prior scope and clarification can authorize the exact proposal without a new approval phrase. The scope normalizer must reject unrelated intent, agent relay, ambiguous choices or missing repository/epic linkage. A current immutable record and matching governed body pointer must both be read back before admission; same-operation resume repairs only the exact existing record after partial publication and never invents another comment or receipt.

Binding observations are phase-aware. R4P targets and Plan/Develop members require genuine distinct child sessions and occupancy generations in physically distinct worktrees/branches. Test/Review uses existing sanctioned parent lifecycle handoff. Strictly completed members retain authenticated physical lineage without a live worker lease. Generation refresh must prove old-claim discharge and preserve scope; otherwise a finished peer or ordinary handoff could deadlock the wave or weaken implementation isolation.

The accepted design SHA256 is 3ad25cfed0936e0c66326ab96a35a9f541063c8951f44ebe261b679ea7e4635a. Root accepted this exact draft after story_145's final read-only design critique found no remaining actionable risks. The concrete implementation plan SHA256 is b854b7a615117581dd4436a81ae19a7d39ed1cd6d04fb177bc6af1f125cdc630; its independent check corrected canonical integration test paths and named direct Plan/Explain parity seams. These are planning review dispositions, not passing code tests or owner adoption.

The source delivery estimate starts L/16 human hours. Detailed Plan estimation will enumerate policy, authority, isolation, locks, publication/recovery, command parity and verification risks; its generated forecast remains separate from observed work. Consumer delivery remains pending until exact-head source CI and the single Claude Opus 5.5 high PR diff review pass, the reviewed tarball is built, and the governed consumer issue replaces and verifies package integrity and actual #107 wave admission.

### Story Intent

- **Beneficiary:** Epic orchestrators delivering independent stories.
- **Capability:** Run an explicitly authorized rank level in isolated child worktrees while enforcing every lower-rank completion barrier.
- **Need:** The installed sequential WIP gate refuses a second same-rank child even when the maintainer explicitly authorized independent parallel delivery.
- **Value or failure prevented:** Reduce delivery time without admitting unfinished dependencies, sharing authority identities, or weakening review and verification.

Semantic review: the beneficiary is the operational epic orchestrator, the capability is concrete equal-rank admission, the need is the observed sequential refusal, and the value is reduced delivery time with completion/isolation safeguards. Scope and ACs ground these claims. Native hook #1841 contributes a different safeguard, while #1872 controls rank-wave admission. The live three-line story is independently understandable. All seven questions are satisfied by the inspected evidence.
