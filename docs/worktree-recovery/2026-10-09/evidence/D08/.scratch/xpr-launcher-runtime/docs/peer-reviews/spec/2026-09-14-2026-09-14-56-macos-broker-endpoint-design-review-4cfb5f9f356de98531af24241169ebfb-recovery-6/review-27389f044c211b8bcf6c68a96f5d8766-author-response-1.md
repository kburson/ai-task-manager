<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-27389f044c211b8bcf6c68a96f5d8766"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "aab85a7f0930438f0baf937bde5d7ad988f0dd23"
artifact_blob: "5848d2146da6917a92babef7759ca136b7ac823f"
artifact_digest: "sha256:1f7cc14f60ec8df6d293a2c44d143342baa29c45394ef28beebbd6816549018d"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:6fb402d9aaaee78b6d6cc7660d9c4397dcb9a9ba2810d0d15bb7cf930fc1d6ab"
  identity_source: "runtime"
started_at: "2026-09-14T17:28:55.760Z"
submitted_at: "2026-09-14T17:34:53.595Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Closed the final endpoint-root lifecycle edges. Clients now diagnose a root
mismatch before touching a stale derived socket, and a lock-holding owner can
reconcile exactly the previously recorded endpoint during a root change. The
configured-root byte budgets and unsupported-account outcome are explicit, and
the six new stable errors are enumerated without a drifting count.

## Finding dispositions

1. Accepted. The client compares derived and recorded endpoint roots whenever
   the stable lock is live, independent of derived-socket presence and before
   connection. The lock holder may validate, probe, and remove exactly the dead
   prior-root socket for its own digest after authority reconciliation. A live
   project's prior-root socket is therefore not an accepted orphan.
2. Accepted. The suffix is explicitly 61 bytes, giving configured-root maxima
   of 42 bytes on Darwin and 46 on Linux. Direct boundary tests are required. If
   no safe conforming root exists beneath the home, the error gives one
   administrator-provisioning action and otherwise names the account as an
   unsupported fail-closed configuration.
3. Accepted. The Supersedes clause enumerates all six new identifiers, and the
   registry verification cites that exact set rather than a detached numeral.

Optional 1 is accepted with the same-user safe-directory behavior stated
accurately. Optional 2 is accepted by repairing conjunctions. Optional 3 is
accepted as an explicit Goal. The prior round already accepted optional 4 and
5 by declaring closed enum sets and naming Windows null/source outputs.

## Changes made

- Added presence-independent client mismatch diagnosis and prior-root owner
  cleanup under the stable lock.
- Added exact Darwin/Linux configured-root budgets, terminal unsupported
  behavior, and direct off-by-one tests.
- Enumerated the six new stable errors and aligned registry verification.
- Tightened orphan scope, same-user namespace sharing, blast-radius disclosure,
  and checklist punctuation.

## Declined changes and rationale

None.

## Verification

- Recomputed the 61-byte suffix and 42/43 Darwin plus 46/47 Linux root
  boundaries.
- Traced client mismatch and owner cleanup ordering against the stable lock,
  metadata, retained-root, and no-auto-reroute rules.
- Ran Prettier over the revised design.
