<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-eb1be65b9cdf02d104b74a5db558e7be"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "63d97aff0225ea28c46e668efcb87fa88383d6e7"
artifact_blob: "07b56298b851927826278d8c78ee2e0ddec47a5b"
artifact_digest: "sha256:3156738879af852cf4d0a0b1c05ab5ab90dd7ee806e6a46a73d1258cf3433a47"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:78f56cb3ec9c9c55cf8992a4ed0acbd4bb64a3ebd0a16e3753eacab8ed652f52"
  identity_source: "runtime"
started_at: "2026-09-14T18:26:34.675Z"
submitted_at: "2026-09-14T18:30:16.433Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed `docs/design/2026-09-14-56-macos-broker-endpoint-design.md` independently
against its own stated goals, non-goals, superseded clauses, and verification list.

The core of the correction is sound and I verified its arithmetic directly:

- The `/aipr/v1/<token>` suffix is 61 bytes (`/aipr` 5 + `/v1` 3 + `/` 1 + 52-character
  token), so the stated Darwin budget of 103 − 61 = 42 and Linux budget of 107 − 61 = 46
  are correct, as are the derived 27-byte home limit (42 − 15 for `/Library/Caches`) and
  the 20-byte `/Users/<short-name>` limit (27 − 7).
- `/Users/kpburson/Library/Caches` is 30 bytes, so the corrected endpoint is 30 + 61 = 91
  bytes as claimed, and the superseded layout's 100-byte suffix
  (`/ai-peer-review` 15 + `/brokers` 8 + `/` + 64 hex + `/broker.sock` 12) reproduces both
  the stated 130-byte and 117-byte (`/x` home) figures.
- The base32 claims hold: 256 bits over 5-bit groups is 52 symbols with exactly one data
  bit in the final group, so every token necessarily ends in `a` (index 0) or `q`
  (index 16) of `abcdefghijklmnopqrstuvwxyz234567`; an all-`ff` digest is 51 `7`
  characters then `q`, and an all-zero digest is 52 `a` characters. Base64url's 43
  characters and its case-folding hazard are also correctly characterized, so rejecting
  approach 2 is justified.
- Lock and metadata authority genuinely stays pinned to the full 64-hex digest directory
  under `cacheRoot` and does not move with the endpoint-root input, which is what keeps
  the mutual-exclusion argument in "Compatibility and migration" intact.

The security posture is also generally well-constructed: handle-relative no-follow
traversal, transport-refusal-only stale-socket reclamation, refusal to treat any
handshake failure as unlink authority, and the explicit acknowledgement that `bindat`
does not exist on Darwin or Linux are all correct and appropriately conservative.

The problems I found are not in the encoding or the byte budget. They are in places where
the prose gives an implementer two different answers to the same question, or where a
state the design itself newly makes reachable has no specified outcome. Because the
design hands its error registry and post-conditions to Task 4 as a tested contract,
these ambiguities will be resolved by whoever writes the code rather than by this
document, and at least one of them is already resolved the wrong way inside the
verification list. Findings 1 and 2 are the material ones; the remainder are smaller but
still concrete underspecifications.

Decision is revisions-requested.

## Findings

1. **The immediate post-bind mode post-condition is specified two incompatible ways, and
   the verification list encodes the unimplementable one.**

   "Security and ownership" (bullet on POSIX `listenPrivate`) sequences the bind this way:
   bind under a restrictive umask, *then* use the retained parent handle to "set its
   filesystem entry to exactly `0600` before publishing `ready`", and states "The
   immediate observation must verify exact `0600`".

   The later paragraph beginning "Immediately after `bind()` succeeds" describes an
   observation taken at a different point: it "observes the socket entry relative to the
   retained `aipr/v1` handle", verifies owner and socket type, and verifies that "the mode
   is within the allowed set", then records the device and inode baseline.

   Both are called the immediate observation, but they cannot be the same observation and
   also both be correct. A Unix socket created under umask `0077` materializes as `0700`
   (`srwx------`); the execute bit is cleared only by the subsequent `chmod`. So an
   observation taken literally "immediately after `bind()` succeeds" cannot verify exact
   `0600`, and an observation taken after the `chmod` is not immediately after `bind()`.
   "Within the allowed set" and "exactly `0600`" are also not the same predicate, and the
   design never enumerates the allowed set.

   This is not merely editorial, because the verification list already picks the wrong
   reading. It requires that "the immediate post-bind observation validates owner/type/mode
   and records its exact `0600` mode plus owner/type, and records its device and inode/file
   identity without comparing them to the listener descriptor". That single sentence fuses
   the baseline-recording observation with the exact-`0600` assertion. An implementer
   following it will either write a test that fails against the specified umask-then-chmod
   sequence, or will satisfy the test by loosening the sequence, which is the outcome the
   fail-closed rule exists to prevent.

   The design needs to name the two observations distinctly and say, for each: when it is
   taken relative to `bind()` and the `chmod`, which of owner/type/mode/identity it checks,
   what the mode predicate is at that point (and, if "allowed set" survives anywhere, what
   that set contains), and which one records the device/inode baseline. The verification
   bullet then needs to be split to match, so that the exact-`0600` assertion is attached
   to the post-`chmod` observation and the baseline-recording assertion to the post-`bind()`
   one.

2. **A bind-time `EADDRINUSE` under a validly held lock has no specified outcome, in
   exactly the topology this correction newly creates.**

   The design is explicit that separating `endpointRoot` from `cacheRoot` "can now make two
   such lock domains converge on one socket pathname", and it handles the *probe* path for
   that case thoroughly: the second owner probes a present socket, the first peer accepts,
   the authenticated handshake compares `cacheRoot`, and the result is
   `APR_BROKER_AUTHORITY_CACHE_MISMATCH` with the live socket preserved. The verification
   list exercises precisely this sequence.

   It does not cover the interleaving where no socket is present at probe time. Two owners
   in distinct cache-root domains each legitimately acquire their *own* full-digest lock
   (the design states they can: "two owners for one digest under different cache roots but
   one configured endpoint root can each hold its own lock"). Both reconcile, both publish
   `starting` metadata, and both probe before either has bound. Both probes correctly find
   no socket. One binds; the other's `bind()` then fails with `EADDRINUSE`.

   The loser is at that point holding a valid lock, has already published current-instance
   `starting` metadata, and has an error that appears nowhere in "Failure behavior". Every
   nearby rule is about a socket that was observed *before* bind, so none of them applies.
   The specified recovery actions are unreachable from here: `APR_BROKER_AUTHORITY_CACHE_MISMATCH`
   is defined as the outcome of an accepting-peer probe, not of a `bind()` return value, and
   the loser has no authenticated evidence about the winner at that instant.

   Left unspecified, the two plausible implementations are both bad. Retrying the
   probe-and-reclaim sequence after `EADDRINUSE` risks the loser probing a socket the
   winner is still bringing up between `bind()` and `listen()`, where a transport-level
   refusal is a real possibility and would be misread as no-listener removal authority
   against a live peer — the exact unlink the design forbids. Failing with a generic error
   loses the one diagnosis that makes this state comprehensible, which is that two cache-root
   domains are colliding on one endpoint root, and leaves stale `starting` metadata behind
   under the loser's lock.

   The design should specify: that the owner must handle `EADDRINUSE` (and any
   platform-equivalent already-bound result) at `bind()` as a distinct fail-closed outcome;
   that this outcome never confers unlink authority over the pathname regardless of what a
   subsequent probe returns; what the loser does with its already-published `starting`
   metadata; and which stable error is reported, whether that is
   `APR_BROKER_AUTHORITY_CACHE_MISMATCH` reached through a post-bind authenticated probe or
   a separate code. It should add a verification bullet forcing this interleaving, since the
   existing two-cache-root test only covers the present-socket ordering.

3. **`APR_BROKER_ENDPOINT_PARENT_UNSAFE` recovery forbids and then mandates the same
   action.**

   In consecutive sentences the design says its recovery "never suggests an endpoint
   override, recursive deletion, ownership takeover, or automatic replacement", and then:
   "If the foreign-owned path belongs to another account's legitimate broker, the only
   recovery is provisioning a distinct safe per-user endpoint root."

   Provisioning a distinct per-user endpoint root *is* setting `AI_PEER_REVIEW_ENDPOINT_ROOT`.
   I can infer the intent — "endpoint override" is probably meant in the narrow non-goal
   sense of a caller-selected endpoint *pathname*, which the Non-goals section does
   distinguish from the endpoint-*root* input. But this is the paragraph that defines the
   registry text for a stable error, and the verification list requires that error to carry
   one exact recovery action. As written, whoever writes that registry entry has to decide
   whether mentioning `AI_PEER_REVIEW_ENDPOINT_ROOT` is required or prohibited, and the
   design supports both readings equally.

   Resolve the terminology in this paragraph: state plainly that the prohibited override is
   a caller-selected endpoint pathname, and that relocating the endpoint *root* is permitted
   for the foreign-owned-legitimate-broker case only, with the unsafe path itself still never
   removed, modified, or taken over.

4. **Owner-side reconciliation has no layout-version guard, so it can discard the only
   record of a superseded endpoint.**

   The client path is careful here: an unrecognized non-null `endpoint_layout_version` in
   current-instance metadata produces `APR_BROKER_INCOMPATIBLE` before root comparison,
   endpoint traversal, or owner-election advice, and the client never probes an unknown-layout
   endpoint.

   The owner path has no equivalent. A new owner "reads any existing metadata from the same
   full-digest authority directory", and if it records a different endpoint root, it validates
   that root, "derives only its own digest token, and probes that exact prior socket". If the
   prior record was written under a layout this package does not recognize, that derivation is
   wrong by construction: the v1 owner computes a v1 token under a root whose actual endpoint
   lives elsewhere. The probe then finds nothing, which is harmless in itself, but the owner
   proceeds to publish its own `starting` and `ready` metadata over the prior record.

   The lock does prevent two *live* owners across layouts, so this is not a concurrency
   defect. The loss is diagnostic and it is permanent: after the overwrite, the superseded
   endpoint root and its layout are gone from the only place that recorded them, and the
   orphaned socket under the unknown layout can never be attributed. That directly undercuts
   the design's own position that v2 requires "explicit cross-endpoint discovery and drain",
   since such a design would depend on this metadata still existing.

   The fix should mirror the rule the design already states for an unreconciled prior root:
   when prior metadata carries an unrecognized non-null layout version, the owner must not
   derive a token for it or traverse it, must record the prior root and its layout version as
   unreconciled in current-instance `starting` and `ready` metadata, and may then proceed at
   its own valid current root. A verification bullet should assert that the superseded root
   and layout survive the overwrite.

5. **`maxEndpointRootBytes` can be published as zero or negative.**

   `maxEndpointRootBytes` is defined as `platform.maxEndpointLength` minus the 61-byte
   suffix, and `APR_BROKER_ENDPOINT_LIMIT_INVALID` is specified only for a "missing,
   noninteger, or nonpositive platform limit". Any positive limit at or below 61 therefore
   passes validation and yields a non-positive budget. Because no absolute endpoint root is
   representable in fewer than 2 bytes (`/` being explicitly rejected), every limit at or
   below 62 is in fact unusable.

   The consequence is not just an odd return value. The design requires that
   `APR_BROKER_ENDPOINT_TOO_LONG` details "carry the path layer's derived
   `maxEndpointRootBytes` on POSIX, never a duplicated literal", so a non-positive budget is
   rendered into user-facing recovery text that instructs the user to provision a root of at
   most, say, −21 bytes. This is reachable through the injected-limit mechanism the
   verification list itself depends on.

   Extend the limit validation so that a POSIX limit that cannot accommodate the 61-byte
   suffix plus a minimal 2-byte root fails with `APR_BROKER_ENDPOINT_LIMIT_INVALID` before
   any path is derived, and add a verification bullet pinning that boundary.

## Required changes

1. Disambiguate the two post-bind observations (Finding 1). Give each a distinct name and
   specify, per observation, its position relative to `bind()` and the `chmod`, the fields it
   checks, its exact mode predicate, and whether it records the device/inode baseline. Split
   the corresponding verification bullet so the exact-`0600` assertion attaches to the
   post-`chmod` observation and the baseline-recording assertion to the post-`bind()` one.
   If "within the allowed set" is retained anywhere, enumerate that set.

2. Specify bind-time already-bound handling (Finding 2). Define `EADDRINUSE` and
   platform-equivalent results at `bind()` as a distinct fail-closed outcome that never
   confers unlink authority over the pathname; state what becomes of the loser's already-published
   `starting` metadata; name the stable error reported and the exact recovery; and add a
   verification bullet covering the no-socket-at-probe-time interleaving between two owners in
   distinct cache-root domains sharing one endpoint root.

3. Resolve the `APR_BROKER_ENDPOINT_PARENT_UNSAFE` recovery contradiction (Finding 3) so the
   registry entry has one unambiguous action, distinguishing the prohibited caller-selected
   endpoint *pathname* from the permitted relocation of the endpoint *root*, while keeping the
   unsafe path itself untouched.

4. Add an owner-side layout-version guard to metadata reconciliation (Finding 4): no token
   derivation or traversal for an unrecognized non-null prior layout, and preservation of the
   superseded root and layout version as unreconciled in current-instance `starting` and `ready`
   metadata, with a verification bullet asserting survival across the overwrite.

5. Close the `maxEndpointRootBytes` lower bound (Finding 5) by rejecting any POSIX
   `platform.maxEndpointLength` that cannot accommodate the 61-byte suffix plus a minimal
   2-byte root, with `APR_BROKER_ENDPOINT_LIMIT_INVALID` raised before derivation, and pin the
   boundary in verification.

## Optional suggestions

1. `APR_BROKER_START_FAILED` is assigned three distinct recovery actions in this document:
   enter `acquireBrokerOwnership` when no live lock exists; retry the named owner reconciliation
   when the lock is live and an endpoint directory is absent; and retry the named owner startup
   when current-instance `starting` metadata is observed. The design requires each of the eight
   new stable errors to have one exact recovery action, and reusing an existing code for three
   situations sits awkwardly beside that rule. Consider stating explicitly that this error's
   recovery text is situation-selected and enumerating the three variants, so the registry and
   its tests have a single source for them.

2. The failure list covers a client facing an absent endpoint *directory* under a live lock,
   but not a client facing present directories with an absent *socket* under a live lock and
   matching current-instance `ready` metadata. That state is reachable if an owner is lost
   after publishing `ready`, or if the entry is removed out from under it. The client would
   currently reach a bare `ENOENT` at connect with no specified mapping. Consider folding it
   into the existing owner-reconciliation variant of `APR_BROKER_START_FAILED`.

3. POSIX endpoint-root and cache-root comparison is byte-exact and case-sensitive by design,
   and the document is clear that this is deliberate. Worth noting the one consequence it does
   not mention: on a case-insensitive macOS volume, two participants whose `home` or
   `XDG_CACHE_HOME` differ only in case resolve to the *same* physical lock directory and are
   therefore genuinely in one lock domain, yet the handshake comparison will report
   `APR_BROKER_AUTHORITY_CACHE_MISMATCH` and refuse a safe connection. The recovery ("converge
   `XDG_CACHE_HOME` or `home`") is correct and actionable, so this is fail-closed in the right
   direction; a sentence acknowledging the false positive would keep it from being diagnosed as
   a bug later.

4. The design states that a shared `aipr`/`aipr/v1` parent lost to macOS cache eviction fences
   every broker for that user, and accepts that. Since `~/Library/Caches` eviction is a routine
   macOS behavior rather than an exceptional one, it may be worth recording in the design how
   often this is expected to be hit in practice and what the operator-facing restore step is,
   so the accepted blast radius is a measured tradeoff rather than one discovered in the field.

## Decision

revisions-requested
