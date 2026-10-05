# #1857 revised plan — SAR round 1

Mode: single-actor review and revision (SAR), genuine existing GPT-6 Astra author session, medium requested effort. This is self-review, not independent approval or an APR protocol review. The installed peer-review binary returned APR_USAGE / unknown help topic: sar; no SPR/XPR, broker or provider launch was substituted.

Input: draft commit 56a56cd67487ef8df8ac7fafb4087ff4382fa944; plan SHA256 7055ed409a2dc3f2c504292a9ef13ff53eb8d8615985965da73a71d1c3c31642. Source baseline c096289ab7fae845871a2eafb471b2e34f842349 plus the six preserved uncommitted provenance paths. Original accepted spec/plan/addendum remain immutable.

Review scope: all R1–R9, current implementation versus proposed work, three-outcome dependency/order, fixture/runtime inventory, actor-to-Close compatibility, migration/bootstrap/recovery, cleanup/host/proof/skill parity and final authority. Read the actual runtime-storage, outcome record/runtime adapter, delivery contracts and preserved WIP; reconciled accepted spec, prior plan, actor addendum and stopping document. No production edit or test execution.

## Required findings

### SAR1-F1 — The upfront mechanical census omits package entrypoint/hook roots

Evidence: the appendix explicitly scans scripts/task-tracker, scripts/providers and scripts/gh. A fresh read-only scan of bin, hooks, scripts/lib, scripts/maintenance and config found root forwarding/selection references in hooks/commit-trail.sh, hooks/task-tracker.sh, bin/cli.mjs and two guidance capture scripts. The narrative names bin/cli and registered entrypoints but a purported one-pass inventory should include these package surfaces from the beginning, including shell hooks. Otherwise a later hook/default mismatch recreates the piecemeal discovery the user is trying to avoid.

Required revision: widen the upfront candidate census contract to all shipped/operational entrypoint roots and shell/JSON configuration where relevant; explicitly classify the five observed additional paths and follow indirect imported writers to publication. Preserve the original 122/147 scan as a historical bounded scan, not full-package proof. No production changes.

Disposition: accepted. Extend the plan's upfront inventory and add the observed non-ESM entrypoint/config census boundaries. Validation is read-only path existence and document reconciliation; no tests are needed to validate a planning inventory correction.

### SAR1-F2 — Strict v2 schema evolution needs an explicit persisted-record compatibility decision

Evidence: committed outcome-record defines aitm.estimation-outcome/v2 with a strict telemetry key set. Uncommitted WIP adds mandatory verification and forecastStatus keys while retaining v2. The plan preserves complete v1 and requires immutable v2 retries, but does not explicitly address a genuine already-persisted v2 payload without those new keys. Reinterpreting that schema in place could reject historical records and strand a lawful retry; assuming no such records exist is not evidence.

Required revision: inventory canonical existing outcome schemas before live adoption. Preserve the accepted meaning of existing v1 and any genuine existing v2. Select a new explicit schema version or a documented, unambiguous compatible reader transition for the added fields; never synthesize missing verification/forecast authority or silently rewrite existing records. Add predecessor-version read/retry/correction cases to the Outcome 1 exit matrix.

Disposition: accepted. Add the versioning decision to the single harmonized Outcome 1 contract and require coexistence tests before emitter adoption. This is the same complete timing outcome, not a new issue or implementation slice.

## Other reviewed boundaries

- Artifact policy and root identity helpers are correctly labeled targeted completed behavior; storage defaults and migration registration are explicitly unfinished.
- Source-story Test classification/fingerprint requirements remain mandatory. No-command Test/Review head authority, root epic merged-PR evidence and real zero-commit Git inventory are preserved.
- Unknown projection includes upstream estimation sample/comparable ingress, board/CLI/report/calibration and no stale numeric substitution.
- Migration includes real SIGKILL, coordinator owner publication, full sync/async leases, completed retry versus retained fence, new-worktree initialization and genuine timing coverage.
- Cleanup keeps native host capability/attachment/snapshot authority separate from caller JSON, protects local work when origin disappears and uses substantive full-content proof.
- Budget rebaseline is an explicit pre-source decision rather than invented remaining cost. SAR does not satisfy the future independent plan review or normal lifecycle authority.

## Round decision and engagement

Decision: revisions required, limited to the two plan-level findings above. No implementation authorized. Review/revision/check work is inside the genuine active author span beginning 2026-10-01T05:28:21.981Z. Round 1 decision was observed at approximately 05:30:35Z; no fabricated exact round-start timestamp or separate additive charge is claimed. The same actor will revise and perform a second full-plan pass.
