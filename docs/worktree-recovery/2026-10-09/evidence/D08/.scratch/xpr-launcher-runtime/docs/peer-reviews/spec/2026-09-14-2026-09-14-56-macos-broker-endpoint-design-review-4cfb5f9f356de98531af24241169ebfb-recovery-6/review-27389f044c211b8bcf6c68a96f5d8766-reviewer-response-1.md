<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-27389f044c211b8bcf6c68a96f5d8766"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "aab85a7f0930438f0baf937bde5d7ad988f0dd23"
artifact_blob: "5848d2146da6917a92babef7759ca136b7ac823f"
artifact_digest: "sha256:1f7cc14f60ec8df6d293a2c44d143342baa29c45394ef28beebbd6816549018d"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:b7efa0647fb7b34eb337c607d57352a31b27d6907504e15504b4adbb9c207dc4"
  identity_source: "runtime"
started_at: "2026-09-14T17:29:30.004Z"
submitted_at: "2026-09-14T17:33:09.886Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

This correction diagnoses a real, reproducible defect and selects a sound remedy.
I independently verified the load-bearing arithmetic and encoding claims, and all
of them hold:

- **Problem statement (lines 31–35).** The accepted layout
  `<user-cache>/ai-peer-review/brokers/<64-hex>/broker.sock` is 130 UTF-8 bytes
  under `/Users/kpburson/Library/Caches` (30 + 15 + 8 + 65 + 12 = 130) and 117
  bytes under a `/x` home (17 + 15 + 8 + 65 + 12 = 117). Both figures are exact.
  Darwin's `sun_path[104]` leaves 103 usable bytes for a NUL-terminated
  pathname, so the accepted contract is indeed unsatisfiable on every conforming
  macOS home. The framing at line 37 — "the rejection is correct, the pathname
  contract is not" — is the right conclusion.
- **Base32 encoding (lines 180–193).** 32 bytes = 256 bits; `ceil(256/5) = 52`
  groups. Group 52 carries exactly one data bit plus four zero pad bits, so the
  final symbol is alphabet index 0 (`a`) or index 16 (`q`) and nothing else. The
  all-zero vector is 52 `a`; the all-`ff` vector is 51 `7` (groups 1–51 each
  consume five set bits → index 31) followed by `q` (bit 256 set → index 16).
  Every stated test vector at lines 473–478 is correct as written.
- **Injectivity.** The alphabet `abcdefghijklmnopqrstuvwxyz234567` contains no
  uppercase characters, so case-folding on APFS/HFS+ cannot merge two distinct
  tokens. This is a genuine advantage over the rejected base64url option
  (lines 73–78), and the rejection rationale is correct. ASCII-only output also
  sidesteps Unicode normalization on case-insensitive volumes.
- **Length boundary (lines 200–206).** `/Users/kpburson/Library/Caches/aipr/v1/<52>`
  is 91 bytes (30 + 5 + 3 + 1 + 52). The endpoint is always
  `endpointRoot + 61` bytes, so the 103-byte limit admits a 42-byte endpoint
  root; under the macOS default that is a 27-byte home (42 − 15) and therefore a
  20-byte short name (27 − 7). Both derived boundaries are exact.
- **Windows label.** `\\.\pipe\ai-peer-review-brokers-<64-hex>-broker.sock` is
  9 + 23 + 64 + 12 = 108 string units, matching line 437's claim against the
  256-unit limit.
- **Linux limit.** `sun_path[108]` → 107 usable bytes, and the design correctly
  refuses to reuse Darwin's number in tests (lines 224–227, 486–488).

The separation of concerns is the strongest part of the design: routing moves to
a compact, versioned, per-user namespace while lock and metadata authority stay
pinned at the unversioned full-digest directory under the resolved `cacheRoot`
(lines 143–149, 391–402). Because the lock never moves with the endpoint-root
input, two participants with divergent `AI_PEER_REVIEW_ENDPOINT_ROOT` settings
still contend for one mutual-exclusion point, which is exactly the property that
makes a caller-influenced endpoint root safe at all. The explicit warning at
lines 399–402 against ever versioning or relocating the lock directory is
well-placed and should survive into the implementation plan verbatim.

The handle-based security contract is likewise well specified. Threading
retained parent handles through `openPrivateRoot`, `openPrivateDirectory`, and
`listenPrivate` rather than pathnames (lines 244–294), forbidding the security
layer from reconstructing chains with `dirname`, and the honest treatment of the
missing `bindat` primitive (lines 335–342) are all correct. The
record-then-compare endpoint identity contract (lines 344–359) deserves specific
praise: refusing to derive an expected device/inode from the listening
descriptor is the right call, because POSIX does not define those descriptor
fields as the filesystem entry's identity, and the "unlinks neither observed
entry" failure rule avoids the classic confused-deputy unlink.

Three issues block acceptance. One is a correctness gap in the client and owner
handling of a socket left behind under a previously configured endpoint root;
one is an unstated byte budget that makes the sole prescribed macOS recovery
unachievable for a class of homes without any defined outcome; and one is an
enumeration ambiguity in the new stable-error set that the verification list
itself contradicts. None requires rethinking the approach — base32 in a compact
versioned namespace remains the right choice — and all three are fixable within
the current structure.

## Findings

1. **A stale socket under a non-owner endpoint root is neither detected nor
   reclaimable, defeating `APR_BROKER_ENDPOINT_ROOT_MISMATCH` in the case it
   most needs to fire.** (Severity: high. Lines 302–307, 311–315, 361–376,
   438–441, 558–563.)

   The client-side mismatch check at lines 367–371 is gated on absence: "If the
   derived endpoint is valid but absent while the stable project lock is live,
   metadata with a different endpoint root produces
   `APR_BROKER_ENDPOINT_ROOT_MISMATCH`." Consider the ordinary sequence in which
   a user adopts the documented macOS recovery:

   - A broker previously ran with `endpointRootSource: cache-root` and bound
     `~/Library/Caches/aipr/v1/<token>`. That socket persists (nothing unlinks
     it on a crash or SIGKILL).
   - The user hits `APR_BROKER_ENDPOINT_TOO_LONG` or simply follows the
     recovery, sets `AI_PEER_REVIEW_ENDPOINT_ROOT=~/.aipr`, and restarts the
     owner. The owner acquires the stable full-digest lock, binds
     `~/.aipr/aipr/v1/<token>`, and rewrites `broker.json` with
     `endpoint_root: ~/.aipr`.
   - A client in a shell that never received the new variable derives
     `~/Library/Caches/aipr/v1/<token>`. That path is valid *and present* — the
     orphaned socket from step one is still there. The absence precondition is
     false, so the mismatch branch never runs. The client connects to a dead
     socket and fails with the generic Task 4 integrity/authentication error
     (line 466–467), which tells the operator that a tuple, nonce, or peer check
     failed and says nothing about the endpoint-root split that actually caused
     it.

   The design has the information needed to diagnose this correctly and declines
   to use it. `broker.json` records `endpoint_root` and `endpoint_root_source`
   (lines 311–315) and the lock is live, so the client can compare its derived
   root against the recorded root directly. The comparison does not depend on
   whether a socket happens to exist at the client's derived path. I read lines
   313–315 — "The recorded endpoint root is diagnostic and never overrides a
   client's environment-derived path" — as the correct anti-redirection rule,
   and it is fully compatible with using the same field as *evidence for an
   error message*. Diagnosing a mismatch is not rerouting to it.

   The owner side has the complementary gap. Lines 302–307 authorize the
   verified full-digest lock holder to probe and unlink "a present socket," but
   the only socket in scope is the one "whose token derives from that same
   digest" reached through the holder's *current* endpoint root. Nothing
   authorizes the holder to reconcile the endpoint recorded under the
   *previous* root, even though the holder is the single party entitled to do
   so and holds the one lock that makes the act safe. The orphan therefore
   survives every subsequent run.

   Line 561–563 accepts orphan accumulation only for "a socket whose project is
   permanently deleted or moved," on the stated grounds that "no future broker
   can safely acquire and reconcile its former project authority." That
   rationale does not extend here. The project is alive, its digest is
   unchanged, and a future broker *does* acquire exactly that authority on every
   start. This case is not covered by the accepted limitation; it is an
   unhandled one that the new endpoint-root feature introduces, and it will
   recur every time an operator follows the documented recovery.

2. **The configured endpoint-root byte budget is never stated, and the single
   prescribed macOS recovery is unachievable for long homes with no defined
   outcome.** (Severity: high. Lines 126–131, 195–222, 433–437.)

   Because the endpoint is always `endpointRoot + 61` bytes (`/aipr` 5 + `/v1` 3
   + `/` 1 + 52), a conforming endpoint root on Darwin must be at most **42 UTF-8
   bytes**. The design never states this number. It states only the two figures
   derived from it under the default layout — the 27-byte home (line 206) and the
   20-byte short name (lines 206–208) — both of which are consequences of the
   42-byte budget after subtracting the fixed `/Library/Caches` suffix. An
   operator configuring `AI_PEER_REVIEW_ENDPOINT_ROOT` is given no budget at all
   and must reverse-engineer it from a home-directory example that no longer
   applies to their case.

   The omission is not merely editorial, because the prescribed recovery is not
   always satisfiable. Lines 213–218 give exactly one action and one preference:
   configure an existing shorter private absolute directory, where "a short
   owner-only directory below the validated home is preferred; a root below a
   world-writable ancestor is refused." Now take a macOS home longer than 42
   bytes — `/Users/` plus a 36-byte account name, which is unusual but permitted:

   - Every directory below that home is strictly longer than the home itself, so
     no path under the home can fit the 42-byte budget. The preferred remedy is
     arithmetically impossible.
   - The obvious short alternatives are excluded by the design's own rules.
     `/tmp` and `/Users/Shared` sit below world-writable ancestors and are
     refused (line 218). Darwin's per-user `$TMPDIR`
     (`/var/folders/<xx>/<yyyy…>/T/`) is owner-only but roughly 49 bytes, over
     budget on its own.
   - The package never creates arbitrary roots (lines 253–254), so the operator
     cannot be told to let the tool make one, and creating a short top-level
     directory requires privileges the design does not assume.

   The result is a user who receives `APR_BROKER_ENDPOINT_TOO_LONG` with "one
   action" (line 434–436) that cannot be carried out, and no error that names
   the actual condition. Line 129–130's claim that the endpoint-root setting "is
   the supported recovery for a macOS home whose default endpoint would be too
   long" is therefore true only up to an unstated bound. A fail-closed design
   should name the bound and define the terminal outcome when no conforming safe
   root exists, rather than emitting an instruction that silently has no
   solution.

3. **"The five new stable errors" is never enumerated, and the verification list
   contradicts its own count.** (Severity: medium. Lines 17–19, 509–514.)

   Line 18–19 says "The new stable errors extend rather than replace the accepted
   list" without naming them, and the document never enumerates the set anywhere
   else. Verification bullet one (lines 511–512) requires that "each of the five
   new stable errors exists in the offline registry with one exact recovery
   action." Verification bullet two (lines 513–514) then separately requires
   that "`APR_BROKER_ENDPOINT_ROOT_MISMATCH` exists in the offline registry with
   its exact same-setting recovery action."

   Reading the Failure behavior section, the identifiers plausibly new to this
   correction are `APR_BROKER_ENDPOINT_ROOT_MISMATCH`,
   `APR_BROKER_AUTHORITY_PARENT_UNSAFE`, `APR_BROKER_AUTHORITY_PARENT_LOST`,
   `APR_BROKER_ENDPOINT_PARENT_UNSAFE`, and `APR_BROKER_ENDPOINT_PARENT_LOST` —
   exactly five. But if `APR_BROKER_ENDPOINT_ROOT_MISMATCH` is one of the five,
   bullet two is redundant; if it is not, the fifth member is unidentified and
   the true total is six. An implementer cannot tell which registry entries to
   create, and a reviewer of the implementation cannot tell whether the registry
   is complete. Since line 9–19 positions this document as the precedence
   authority for the superseded stable-error list, the enumeration is exactly the
   kind of clause that must be explicit rather than inferred.

## Required changes

1. **Make endpoint-root mismatch detectable and the orphan reclaimable.**
   (Addresses finding 1.)

   - Rewrite the client rule at lines 367–371 so the comparison is
     presence-independent: whenever the stable full-digest lock is live and
     `broker.json` is readable, the client compares its derived `endpointRoot`
     against the recorded `endpoint_root` and fails with
     `APR_BROKER_ENDPOINT_ROOT_MISMATCH` on any difference, **before** attempting
     to connect to whatever happens to sit at its derived endpoint. Keep the
     existing recovery text (set `AI_PEER_REVIEW_ENDPOINT_ROOT` to the recorded,
     revalidated root and retry) and keep the never-auto-redirect rule at lines
     440–441 unchanged. State explicitly that using the recorded root as
     *diagnostic evidence* is distinct from using it as *routing authority*, so
     the new rule cannot be misread as weakening lines 313–315.
   - Extend the lock-holder authority at lines 302–307 so that, after acquiring
     the full-digest lock and reconciling project/provider authority, the holder
     also reconciles the endpoint recorded in the existing `broker.json` when
     that record names a different, revalidated endpoint root: probe it, and on
     a failed authenticated connection unlink that exact socket. Bound the
     authority precisely — only the socket whose token derives from the holder's
     own digest, only under an endpoint root that passes the full
     `openPrivateRoot` anchor checks and both `endpointDirectories`
     post-conditions, only while the lock is held, and never by recursive or
     pattern-based removal.
   - Amend line 561–563 so the accepted orphan limitation is scoped to its
     stated rationale: a project permanently deleted or moved, whose authority
     no future broker can acquire. Say explicitly that a live project's socket
     under a superseded endpoint root is reconciled by the mechanism above and is
     not an accepted orphan.
   - Add verification: a client whose derived endpoint is *present but stale*
     under a superseded root fails with `APR_BROKER_ENDPOINT_ROOT_MISMATCH` and
     not with a handshake or integrity error; and an owner restarting under a
     changed endpoint root unlinks exactly the superseded socket while holding
     the lock, leaving the shared `aipr` and `aipr/v1` directories in place per
     lines 299–301.

2. **State the endpoint-root byte budget and define the no-conforming-root
   outcome.** (Addresses finding 2.)

   - In the Length boundary section, state the general rule directly: the
     endpoint is `endpointRoot + 61` UTF-8 bytes, so a conforming endpoint root
     is at most 42 bytes on Darwin and 46 bytes on Linux (107 − 61). Present the
     existing 27-byte home and 20-byte short-name figures as what the budget
     yields under the macOS default, rather than as the primary statement.
   - Carry the budget into the `APR_BROKER_ENDPOINT_TOO_LONG` recovery text at
     lines 213–222 and 433–437, so the operator is told the maximum root length
     alongside the instruction to configure one, and does not have to derive it.
   - Define what happens when no safe conforming root exists — specifically when
     the home itself exceeds the budget, so the preferred under-home remedy is
     arithmetically impossible and the short alternatives are excluded by the
     world-writable-ancestor rule at line 218. Either name a terminal
     unsupported-configuration failure for that case, or state the exact
     additional condition under which an operator may provision a conforming
     root outside the home and how it must satisfy `openPrivateRoot`. Whichever
     is chosen, the error must name the real condition rather than repeating an
     instruction that has no solution.
   - Add verification pinning the configured-root boundary directly: a 42-byte
     `AI_PEER_REVIEW_ENDPOINT_ROOT` is accepted at exactly 103 bytes and a
     43-byte root is refused at 104, mirroring the existing home-length
     off-by-one tests at lines 482–485 but exercising the configured path.

3. **Enumerate the new stable errors.** (Addresses finding 3.)

   - In the Supersedes paragraph (lines 17–19), replace "The new stable errors
     extend rather than replace the accepted list" with the explicit identifier
     list this correction adds to the accepted registry.
   - Reconcile the verification list so the count and the bullets agree: either
     fold `APR_BROKER_ENDPOINT_ROOT_MISMATCH` into the enumerated set and delete
     the redundant bullet at lines 513–514, or keep the separate bullet and
     state the total as six. Prefer replacing the bare numeral "five" with the
     enumeration itself, so the requirement cannot drift out of sync again if a
     later revision adds or removes an error.

## Optional suggestions

1. **Soften the `aipr` collision claim at lines 404–408.** The text says that if
   an unrelated application has already created an incompatible path there, "the
   broker refuses it and requires manual inspection." The refusal rules at lines
   328–333 trigger on foreign-owned, non-directory, permissive, or symlinked
   paths. An unrelated application owned by the *same user* that creates a plain
   `0700` directory at `<cache>/aipr` passes every check and is adopted silently.
   That outcome is defensible — same trust domain, and the never-remove rule at
   lines 299–301 prevents the broker from damaging the other application's state
   — but it is not what the sentence promises. Restating the residual risk as
   "an unsafe path is refused; a same-user safe path is shared and never
   modified" would describe the actual behavior.

2. **Repair the trailing-conjunction structure in the Verification list.** Line
   492 ends a bullet with "and" but three further bullets follow (lines 493–507);
   line 532 does the same with two bullets following (lines 533–538). The list
   reads as though it terminates twice. Moving the "and" to the genuine final
   item in each block would make the enumerations unambiguous for an implementer
   working through them as a checklist.

3. **Consider stating the blast radius of the shared `aipr/v1` directory in the
   Goals or Non-goals.** The `APR_BROKER_ENDPOINT_PARENT_LOST` handling at lines
   456–464 is thorough and correctly refuses automatic recreation, but the
   design's acceptance of a single per-user path whose loss fences *every*
   project broker is a deliberate trade made in exchange for the byte budget
   (line 407–408). Naming that trade where the goals are set, rather than only
   where the error is defined, would make it reviewable as a decision rather than
   discoverable as a consequence.

## Decision

revisions-requested
