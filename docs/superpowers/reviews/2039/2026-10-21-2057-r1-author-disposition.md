# Issue #2057 — independent review R1 author disposition

The complete raw report is retained verbatim in
`2026-10-21-2057-reviewer-r1-review.md`. The reviewer independently ran 83 tests
and three disposable-fixture probes against commit
`7698014fa784d63d24bba1113a4ecdf9e5e7f9de`. No reviewer lifecycle or cloud
verification is inferred. The reviewer's clean-checkout observation describes
its reviewed checkpoint; the author subsequently added repair tests and audit
updates without moving that reviewed HEAD.

## Findings

1. **Important — interrupted acknowledgment publication: accepted and repaired.**
   The author reproduced the after-link failure: a legitimate two-link receipt
   caused `file` refusal before reconciliation. An ordinary sender read can now
   defer only an exact scoped two-link acknowledgment to the actual recipient;
   it produces neither proof nor cleanup. The named recipient reconciles only
   the known stage alias after exact metadata validation, then ordinary strict
   archive/working-byte read-back produces the proof. Unknown acknowledgment
   hardlinks remain untouched and refuse. The lost-response regression observed
   RED, then GREEN. A separate unknown-alias regression passed with both the
   original owner and alias retained.
2. **Important — same-cache former-session binding: accepted and repaired.**
   The author reproduced `binding-opaque-directory` after a successful A-to-B
   session transfer in one cache. Current-owner dispatch now requires both the
   worktree and requesting session. A former session follows exact completed
   transfer/native pointer/retained archive verification. Same-cache working
   bytes now belong to the recipient and need not remain identical to the old
   archive; different-cache source bytes still must match. The paired regression
   observed RED, then GREEN: former A may settle, while current B's pending work
   remains protected.
3. **Important — asynchronous recipient mutation: accepted and repaired.**
   The author reproduced an ownership commit after the second assignment
   callback changed the recipient human and returned that replacement's
   assignment. Every assignment result now validates the captured destination
   human and rechecks the full captured target tuple after the await. The test
   observed a missing rejection before repair and a preserved original owner
   afterward. Native lock/context checks remain in place.

The three repair regressions passed together, zero failures or skips. The
additional unknown acknowledgment alias test passed separately. Fresh broader
regressions and independent repair review remain required; these focused
results alone are not final acceptance.

## Explicit rulings on every declined boundary

1. **Public writer activation, cloud publication and model calculation:** agree
   with deferral. Active Task 9 owns local acknowledged handoff and native binding
   protection. Later pinned tasks own public activation and model calculation;
   no public route was added here.
2. **Actual remote assignment freshness, authentication and captured cloud-read
   provenance:** agree with the local/caller boundary. The primitive requires
   observations at entry and release, validates the captured human, and checks
   native authority after awaits. Public callers must provide actual bounded
   captured current-target observations; offline arrays are not cloud evidence.
3. **Arbitrary foreign-host adoption and independent-machine serialization:**
   agree with exclusion. Registry host/common-directory identity and actual
   worktree roots remain mandatory. No lease/PID expiry grants takeover.
4. **Hostile same-user filesystem fabrication and direct invocation of internal
   helpers:** accept the cooperative local ownership boundary, without relaxing
   safe file/path validation or branded proof requirements. This implementation
   does not provide cryptographic external recipient attestation. Findings that
   reproduce with ordinary supported callbacks remain in scope, as R1-3 shows.
5. **Destruction of all retained cache/registry evidence:** agree with exclusion.
   Missing known authority refuses; no bytes or ownership are reconstructed from
   a PID, clock or stale preview. No survival claim is made after all evidence is
   destroyed.
6. **Hardware power loss and filesystem-specific fsync guarantees:** accept the
   verification limitation. Native publication flushes files/directories and
   injected crash boundaries exercise retained writes. Those tests do not prove
   physical hardware persistence. No stronger claim is made.
7. **Multi-hop transfer with delayed earlier-source cleanup:** retain conservative
   refusal when the current pointer no longer matches the exact acknowledged
   recipient. This task does not authorize deleting prior exports or rewriting
   proof to follow an arbitrary transfer chain. Normal completion settles the
   old binding at its explicit handoff boundary. An unresolved older chain can
   remain protected; no automatic recovery or acceptance is claimed for it.
8. **Pure unacquired claim-validation seed redesign:** agree with deferral.
   Its accepted semantics were extracted unchanged and compatibility tests pass.
   Acquired registry claims additionally require native authority and freeze
   validation; a structural seed grants no persistent ownership.
9. **Live admission, issue state, commit tracing, cloud CI and Close readiness:**
   executor-owned and still required. Each commit receives native tracing;
   final exact-head full CI must pass before native Test. Agent CODE_COMPLETE
   precedes same-target orchestrator Review, approval and fresh native Close.
   This disposition and the review do not themselves certify those gates.

No finding was waived, no deadline or cap was widened, and no unknown timing,
cost or historical pause evidence was manufactured. Aggregate PR #2081 remains
unmerged pending all 32 children, root acceptance and governed delivery.
