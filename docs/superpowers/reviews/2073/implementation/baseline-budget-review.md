# Retained-source baseline budget review

Reviewed before any production edit or optimized-source measurement. Source commit: `52ff0fe734cf682c604695ab0c7b005f512c2844`.

The first successful production publication emitted 313 transport dispatches: 127 membership, 80 projection, 96 opaque issue-body reads, eight body writes and two project-field writes. Two independent reruns have byte-identical outcomes, durable snapshots and classified ledgers. No fallback PATH calls occurred. The driver operates the real writer and collector; it does not substitute policy verdicts.

The accepted plan's 96 membership ceiling is inconsistent with its 96 full-projection ceiling. A complete authority observation can resolve the subject's membership and read project values through membership separately; `readEstimateWriterAuthority` calls `resolveEstimateWriterSubject` before `runtime.collect`, while nested `runtime.collect` reads the project again. Membership is therefore not one-for-one with projections. Treating bare resolver queries as free would hide the drain.

The baseline-only membership ceiling is amended to 196: two membership dispatches per independently allowed 96 full observations, plus four bootstrap resolutions. The baseline total stays 512 and every other original per-family ceiling stays unchanged. Optimized membership stays 96 and optimized total stays 384. This structural bound is deliberately larger than the observed 127; it is not a measured-count-plus-one budget. No production observation, ownership checkpoint or recovery check is removed to meet it.

This is an author review of an implementation-plan defect, not a new independent SAR acceptance. The final whole-branch reviewer must assess this amendment. The accepted source plan and earlier review snapshots remain byte-for-byte unchanged. If the structural bound is wrong, a family-specific regression could pass beneath the unchanged total cap; exact before/after ledgers and the strict-improvement assertion remain mandatory.
