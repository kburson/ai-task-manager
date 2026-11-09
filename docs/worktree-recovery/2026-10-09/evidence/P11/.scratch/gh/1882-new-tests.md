### New Automated Tests

Seventeen new merge-back regressions protect project verification, failed and stale evidence, source mutation, invalid provider/declaration configuration, explicit checkout preservation, strict boolean admission, malformed child JSON, authoritative parent routing, changed parent checkout, verified-head drift and integration of the exact tested commit. Fixtures run actual Git worktrees and configured Node commands; default Node suite probes are tiny fixture scripts rather than this repository's full host lanes.

The genuine failing runs are retained under `.scratch/1882/`: preservation-red (3 assertion failures), provider-red (6), cli-red (4), and head-guards-red (3). The final focused execution 7a9772c9-b2f1-409c-9a3c-237dcada92d8 passed all 42 tests with zero failures, cancellations or skips. AITM independently executed that root verifier and stamped acceptance evidence at source `112988f8e68b59ac3080e775ad97c5507f263eb8`.

TIA also exposed the frozen admission import inventory. Its narrow update preserves `enforceDirectGuidance` and every operational route; the affected admission file passed all 17 existing tests in genuine run 0631a289-1630-4129-b24e-2cb4df6fcf60. Full canonical TIA and complete cloud lanes remain in progress.
