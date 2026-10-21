<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-4cfb5f9f356de98531af24241169ebfb"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "c03814267c704f89c554ce57626a1d87896bf4a3"
artifact_blob: "7c2caefbe54419f5c8b683920da740a0b0981ab1"
artifact_digest: "sha256:b0b57391c3672d1b45828bf533ec80349a8dfc3d792d1c3f5d100222be673b34"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:3fa7a07cf1083b075eb301034c51b39ce30ea967725db6db3a874a7b1426a568"
  identity_source: "runtime"
started_at: "2026-09-14T16:36:29.321Z"
submitted_at: "2026-09-14T16:38:25.664Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The core diagnosis and the chosen encoding are correct, and I verified the
design's load-bearing arithmetic independently rather than accepting it.

Confirmed by direct calculation against `src/broker/paths.mjs` as it stands at
`c038142`:

- The accepted layout
  `/Users/kpburson/Library/Caches/ai-peer-review/brokers/<64-hex>/broker.sock`
  is 130 UTF-8 bytes (30 + 15 + 8 + 65 + 12), and 117 bytes for a `/x` home
  (2 + 15 + 100). Both figures in the Problem section are exact.
- `sockaddr_un.sun_path[104]` leaving 103 usable NUL-terminated bytes is the
  correct reading, and `verifyEndpointLength` already measures POSIX endpoints
  with `Buffer.byteLength(endpoint, 'utf8')` and Windows with string units, so
  the Length boundary section matches shipped behavior.
- 256 bits / 5 = 51.2, so unpadded base32 yields exactly 52 characters for every
  32-byte digest, with a 1-bit remainder occupying the high bit of the final
  group and zero in its low four bits. Step 4 of the encoding contract states
  this correctly.
- `/Users/kpburson/Library/Caches/apr/v1/<52>` is 90 UTF-8 bytes, and a 28-byte
  home lands at exactly 103 (28 + 15 + 8 + 52). Both claims hold.
- The rejection of base64url is sound: a mixed-case alphabet is not injective
  under case folding on a case-insensitive filesystem, which would silently
  collapse routing space.

The encoding decision is lossless, deterministic, case-fold-safe, and needs no
change. My findings are not about the token. They are about a consequence the
design introduces but does not finish specifying: the socket has been moved out
of the per-project full-digest directory into a *shared, per-user* parent, and
the lifecycle, contention, and failure semantics of that shared parent are
underspecified. Goal 8 — "one unambiguous security contract for the separated
socket parent" — is stated but not yet met.

Decision: revisions-requested, on three substantive findings. None require
revisiting the selected approach.

## Findings

1. **`brokerPaths` returns no handle for the separated endpoint parent.** The
   Corrected path contract keeps the return shape exactly
   `{ directory, endpoint, lock, metadata }`. Before this change that shape was
   sufficient, because the socket lived inside `directory`, so validating
   `directory` validated the socket's parent. After this change `directory` is
   `<user-cache>/ai-peer-review/brokers/<64-hex>/` while the endpoint parent is
   `<user-cache>/apr/v1/` — a directory the contract never names. Task 4 is
   nonetheless required to "create or validate the compact endpoint parent as
   owner-only." The only way to obtain it is `dirname(paths.endpoint)`, an
   implicit derivation performed by the security layer on a string the path
   layer owns. That is precisely the ambiguity Goal 8 exists to remove.

2. **The endpoint parent is shared across every project of the user, and the
   design treats it as if it were per-project.** `<user-cache>/apr/v1/` holds
   the sockets of *all* projects for that user; only the leaf token is
   per-project. Three consequences are unaddressed:
   - **Creation race.** Concurrent first-run brokers for different projects will
     race to create the same parent. The design says `listenPrivate` "creates or
     validates" it, but does not state that a lost creation race (`EEXIST`)
     followed by a passing ownership/symlink check is success rather than an
     integrity failure. A fail-closed implementation read literally could reject
     a perfectly legitimate concurrent start.
   - **Blast radius.** The Security section says owner verification "detects
     replacement or unlink of either the lock evidence or endpoint." Replacement
     of the *shared parent* affects every project's broker at once, not one, and
     the design does not say what a broker owes its peers on detecting it.
   - **Cleanup.** Removing an empty `apr/v1/` on last-broker-exit is unsafe for
     the same reason; the design should state that the shared parent is never
     removed by a per-project broker.

3. **Stale-endpoint reclamation is unspecified after the separation.** Under the
   accepted layout, the socket and `broker.lock` were co-located in one
   per-project directory, so lock ownership arbitrated the socket's lifetime.
   Splitting them breaks that coupling, and the design covers only one direction:
   "A missing compact endpoint never authorizes lock theft." It does not cover
   the inverse, which is the common crash case — a *present but stale* socket
   file whose owning process is gone. `bind(2)` fails with `EADDRINUSE` against a
   leftover socket inode, so without a stated rule the broker is permanently
   unable to start. The design must say who may unlink a stale endpoint and on
   what proof. The natural rule, consistent with the rest of the document, is
   that only the holder of the full-digest `broker.lock` may unlink the endpoint
   whose token derives from that same digest — making the lock, not the socket's
   presence, the sole reclamation authority. That rule should be written down
   rather than inferred.

4. **`apr` is a collision-prone namespace, and the resulting failure has no
   code or recovery text.** `apr` is the established abbreviation for the Apache
   Portable Runtime, and a three-letter directory in a shared user cache is
   plausible squatting territory generally — `~/.cache/apr` on Linux especially.
   If a foreign-owned directory or a symlink already occupies that path, the
   fail-closed checks correctly refuse, but the Failure behavior list has no
   entry for it: it falls into "the existing Task 4 integrity and authentication
   errors," which are phrased around *live peer* integrity, not around
   pre-existing filesystem occupancy. The operator gets an integrity error with
   no guidance and no way to proceed, since the design also forbids an endpoint
   override. This needs its own error code and recovery text.

5. **Lock authority is unversioned while the endpoint is versioned.** The
   metadata/lock directory stays `ai-peer-review/brokers/<64-hex>/` with no
   layout version, while the endpoint carries `v1`. A future `v2` layout would
   therefore produce brokers that bind *different* endpoints but contend on the
   *same* `broker.lock`. That is arguably the safe outcome — it preserves mutual
   exclusion across a layout migration instead of letting v1 and v2 brokers run
   concurrently against one project — but it is load-bearing and currently
   accidental. The Compatibility section defers layout changes to "an explicit
   discovery/drain design"; it should record that the unversioned lock is the
   intended cross-version mutual-exclusion point, so a future author does not
   "fix" the asymmetry by versioning the lock directory too.

## Required changes

1. Add an explicit field for the endpoint parent to the `brokerPaths` return
   shape (`endpointDirectory`, or equivalent) and update the Corrected path
   contract, which currently asserts the shape is unchanged. Task 4 must receive
   the protected path from the path layer, not recompute it with `dirname`.
   Resolves Finding 1 and satisfies Goal 8.

2. Specify the shared-parent semantics in the Security and ownership section
   (Finding 2): that `<user-cache>/apr/v1/` is per-user and shared across all
   projects; that a lost creation race is success provided the post-condition
   ownership, mode, and symlink checks pass; and that a per-project broker never
   removes the shared parent.

3. State the stale-endpoint reclamation rule (Finding 3): only the holder of the
   full-digest `broker.lock` may unlink the endpoint derived from that digest,
   and a stale endpoint is reclaimed under that lock rather than treated as a
   permanent bind failure. Add the corresponding unit coverage — bind over a
   leftover socket inode, with and without the lock held.

4. Add a dedicated failure mode and recovery for a pre-existing foreign-owned or
   symlinked `apr` / `apr/v1` path (Finding 4), with its own error code
   alongside the others in Failure behavior. The recovery text must be actionable
   given that endpoint overrides are a stated non-goal.

5. Record in Compatibility and migration that the unversioned full-digest lock
   directory is the deliberate cross-layout-version mutual-exclusion point
   (Finding 5).

6. Add exact-boundary vectors to Verification. The design asserts a 28-byte home
   fits at exactly 103 bytes; that exact case and its 104-byte neighbor should be
   required test vectors, not left to "realistic macOS cache roots fit 103
   bytes." Boundary-off-by-one is the specific defect class this correction
   exists to fix, so it warrants a pinned vector.

## Optional suggestions

1. Make the `broker.json` endpoint-token field mandatory or forbidden rather
   than "may additionally record." An optional diagnostic field produces two
   valid shapes for a discovery file and invites readers to depend on a token
   that is sometimes absent. The security argument for it is already sound —
   it is routing data, not trust evidence — so recording it always, explicitly
   labeled non-authoritative, is the cleaner contract.

2. Consider naming the namespace something less collision-prone than `apr`
   (`aipr`, `ai-pr`). At 52 characters for the token, the byte budget is not
   tight: the stated 90-byte real-world path has 13 bytes of headroom, so one or
   two extra characters cost little and materially reduce Finding 4's likelihood.
   Left optional because `apr` is already load-bearing in the surrounding design
   and the fail-closed checks do prevent the unsafe outcome.

3. The Windows endpoint retains the `-broker.sock` suffix on a named pipe, which
   now reads oddly since no Unix endpoint has a suffix at all. Explicitly out of
   scope per the Non-goals, and I would not change it in this correction — worth
   a one-line note that the suffix is retained deliberately for compatibility so
   a later reader does not file it as an inconsistency.

## Decision

revisions-requested
