<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-49caf706a41c040538343545ff0d9c6b"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "1ed9b97ee986c25820f47e825f8126f07ec2ffbe"
artifact_blob: "af7ed317df55622f96b8482adaca69b3858a1953"
artifact_digest: "sha256:9240394a169ff008ab6133476c3f8b4d7e8ec0b06496d9db5ced6a28be11d8cc"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:1553fcfe892fc4b5013942c9ddf8e5cb9a844a4b73457aa647af94c71b310924"
  identity_source: "runtime"
started_at: "2026-09-14T18:12:12.225Z"
submitted_at: "2026-09-14T18:17:55.321Z"
finding_ids: ["R1-F001","R1-F002","R1-F003"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The correction diagnoses a real defect and selects a sound encoding. I
independently verified the arithmetic that the whole proposal rests on, and all
of it is correct:

- 32 digest bytes at 5 bits/symbol require `ceil(256/5) = 52` unpadded base32
  symbols; 51 symbols cover 255 bits, so the final symbol carries exactly one
  data bit plus four zero pad bits. The stated `a`/`q` terminal-symbol rule
  follows, and `alphabet[16] == 'q'` confirms the all-`ff` vector of 51 `7`
  characters followed by `q`.
- The suffix `/aipr` (5) + `/v1` (3) + `/` (1) + token (52) is 61 bytes.
  Darwin 103 - 61 = 42; Linux 107 - 61 = 46. Both budgets are right.
- Under the macOS default, 42 - `len("/Library/Caches")` (15) = 27-byte home,
  and 27 - `len("/Users/")` (7) = a 20-byte short name. Both derivations hold.
- The reproduction figures check out: `/Users/kpburson/Library/Caches` (30) +
  `/ai-peer-review` (15) + `/brokers` (8) + `/` (1) + 64 + `/broker.sock` (12)
  = 130 bytes, and 117 bytes for a two-byte home. The retained Windows label
  is 108 units, within the stated 256-unit limit.
- `sun_path[104]` on Darwin and `sun_path[108]` on Linux yielding 103 and 107
  usable bytes is correct for NUL-terminated pathnames.

The rejection of base64url on case-folding grounds is correct, the full digest
is preserved, and keeping lock/metadata authority immovable at the full-hex
directory is the right structural choice.

My substantive concern is not with the encoding but with the *separation* of
`endpointRoot` from `cacheRoot`. That separation decouples the mutual-exclusion
domain (the lock, under `cacheRoot`) from the collision domain (the socket
pathname, under `endpointRoot`). The design argues at lines 488-498 that this
is safe because the lock never moves. That argument is necessary but not
sufficient: it establishes that one cache root cannot host two owners, and says
nothing about two *distinct* cache roots converging on one endpoint root. That
configuration is not merely possible, it is the configuration the design itself
mandates ("Every owner and client process for a configured endpoint must set
the same variable", line 372-373) applied to a host where the authority-cache
variable diverges. Finding 1 traces the consequence to a specified code path
that unlinks a live peer's socket.

The remaining findings are precision and scoping defects in a document whose
stated authority model ("has precedence only for the clauses named here", line
17-18) depends on exactness.

Decision: revisions-requested.

## Findings

### R1-F001 — Divergent cache roots sharing one configured endpoint root cause a live broker's socket to be unlinked by a second owner (severity: high)

**Where:** lines 340-345 ("Only the verified holder of the full-digest
`broker.lock` may unlink the endpoint whose token derives from that same
digest… a failed authenticated connection plus retained lock ownership permits
removal of that exact stale socket before bind"), interacting with lines
487-498 (compatibility argument) and lines 371-373 (every participant sets the
same endpoint-root variable).

**Why this is new to this correction.** Before the correction, the endpoint was
derived from `cacheRoot`:
`<user-cache>/ai-peer-review/brokers/<digest>/broker.sock`. Two processes that
resolved different cache roots therefore derived *different* endpoints. The
result was a split-brain — two brokers, two locks, two sockets — but each
client consistently reached the broker in its own cache domain, and neither
broker could ever observe the other's socket. The correction moves the endpoint
under an independently configurable `endpointRoot` while leaving the lock under
`cacheRoot`. Two distinct lock domains can now map onto one identical socket
pathname. The design creates this reachability; it is not pre-existing.

**Concrete failure sequence (Linux, but the Darwin analogue holds whenever
`home` diverges between a login shell and a launchd/`sudo -H` context):**

1. User `u`, project `P`, canonical root digest `D`.
2. Process A runs with `XDG_CACHE_HOME` unset, so `cacheRoot` is
   `/home/u/.cache` (`cacheRootSource: home-default`).
3. Process B runs with `XDG_CACHE_HOME=/tmp/u-cache`
   (`cacheRootSource: xdg-configured`). Per lines 493-495 the design classifies
   this as a pre-existing deployment error and takes no action on it.
4. Both processes set `AI_PEER_REVIEW_ENDPOINT_ROOT=/run/user/1000`, exactly as
   lines 371-373 require. Both derive
   `endpoint = /run/user/1000/aipr/v1/<token(D)>` — byte-identical.
5. A acquires `/home/u/.cache/ai-peer-review/brokers/D/broker.lock`, validates
   both chains, binds, publishes `ready` metadata under *its* cache root, and
   serves clients.
6. B acquires `/tmp/u-cache/ai-peer-review/brokers/D/broker.lock`. This is a
   different file. Nothing serializes B against A.
7. B reads prior metadata from *its own* full-digest authority directory
   (lines 346-353). That directory is empty, so there is no recorded endpoint
   root, no `APR_BROKER_ENDPOINT_ROOT_MISMATCH`, and no reconciliation signal of
   any kind. The metadata mechanism is structurally blind here because metadata
   lives under the diverged root.
8. B validates `/run/user/1000/aipr` and `/run/user/1000/aipr/v1`. Both are
   owner-only, non-symlink, user-owned directories created by A, so every
   `*_PARENT_UNSAFE` check passes.
9. B observes a present socket at its derived endpoint and probes it under
   lines 342-344. The handshake compares the full canonical root tuple, package
   version, broker-protocol version, Node major, instance ID, nonce proof, and
   peer UID. Root tuple, versions, and UID all match — A and B are the same user
   serving the same project. **Instance ID and nonce do not match**, because B
   compares against the instance recorded in B's own lock and metadata.
10. The probe therefore terminates as "a failed authenticated connection".
    B holds its lock. Lines 343-344 explicitly authorize it: B unlinks A's
    **live** socket and binds its own.
11. A's owner verification (lines 333-339) subsequently detects unlink of its
    endpoint, fences itself, and refuses further delivery. In-flight reviews on
    A are dropped mid-flight.

**Root cause.** The stale/live discriminator is instance-and-nonce equality
against the observer's own lock. That predicate can only answer "is this socket
*mine*", never "is this socket *live and owned by someone else*". Under a single
cache root the distinction is unnecessary, because the exclusive lock makes a
live foreign owner unreachable. Separating `endpointRoot` from `cacheRoot`
removes that guarantee while leaving the predicate unchanged.

**This defeats several of the design's own stated invariants:** "Without the
lock, stale-looking socket state is never removed" (line 345) is satisfied —
B *does* hold a lock — yet the outcome is exactly the unlink of a live peer
that the sentence exists to prevent. "The owner never uses recursive, wildcard,
age-based, or cross-digest cleanup" (line 352-353) is likewise satisfied and
likewise insufficient: this is same-digest, exact-path cleanup of a live
endpoint. Non-goal line 63 ("Weakening owner, symlink, peer-credential, lock,
nonce, or handshake checks") is violated in effect, since the nonce check now
produces a destructive false negative.

### R1-F002 — The blanket "never resolves symlinks" rule is outside the declared supersession scope and contradicts the accepted epic's canonicalization contract (severity: medium)

**Where:** line 132 ("the path layer never resolves symlinks"), against the
Supersedes list at lines 9-24.

The correction declares precedence "only for the clauses named here" and names
the socket layout at lines 260-265, the security rule at lines 279-280, and the
stable-error list at lines 335-337 of
`docs/design/2026-09-14-project-local-spr-xpr-broker-design.md`. Line 242-244 of
that accepted design is **not** in the list and states the opposite rule:
"Paths come from the same package canonicalization routine: physical absolute
paths with symlinks resolved; on Windows use the canonical volume/path spelling
returned by the filesystem, not caller-supplied casing."

In context, the accepted clause governs the identity tuple that feeds
`rootDigest`, whereas line 132 governs the cache and endpoint root *inputs*.
The two are reconcilable — but the correction never says so, and line 132 is
written as an unqualified property of "the path layer". `brokerPaths` is the
path layer, and it consumes `identity`. An implementer applying line 132
literally would stop resolving symlinks in identity canonicalization, silently
changing every project-root digest and breaking the epic's explicit fixture
requirement for "symlink aliases" (plan line 174). Because the correction's
authority model is clause-scoped, an unscoped sentence is a real defect in it,
not a stylistic one.

The same ambiguity affects the byte-exact, case-sensitive root-equality rule at
lines 133-137 ("It remains case-sensitive even on a case-insensitive volume"),
which reads as universal but cannot govern Windows `cacheRoot` without
colliding with the accepted Windows canonical-spelling clause. Its practical
impact on Windows is nil today — `endpointRoot` is `null` there and no
cross-process `cacheRoot` comparison is specified — but the text does not say
that, and a later reader cannot tell whether the omission is deliberate.

### R1-F003 — Normative contradiction on whether an unknown layout version applies to `starting` metadata (severity: low, but blocking for a normative document)

Three passages disagree on the precedence rule for an unrecognized
`endpoint_layout_version`:

- Line 438-439 (Security and ownership): "an unrecognized non-null layout
  version produces `APR_BROKER_INCOMPATIBLE` **regardless of `starting` or
  `ready`**".
- Line 564-567 (Failure behavior): "Current-instance **`starting` or `ready`**
  metadata names an unrecognized endpoint layout: existing
  `APR_BROKER_INCOMPATIBLE`… This takes precedence over root mismatch and
  `APR_BROKER_START_FAILED` owner-election advice."
- Line 481-485 (Compatibility and migration): "A v1 client that observes
  current-instance, **`ready`** metadata with an unrecognized
  `endpoint_layout_version` fails with existing `APR_BROKER_INCOMPATIBLE`…"

The third passage silently narrows the rule to `ready`. Under that reading, a
client seeing unknown-layout `starting` metadata would take the
`APR_BROKER_START_FAILED` branch (line 568-571) and be told to enter owner
acquisition or retry the named owner startup — which is precisely the
owner-election advice the other two passages say must be pre-empted, and which
would drive a v1 client to contend for a lock held by a future-layout owner.
The verification list at line 694-696 asserts the broader rule, so the
Compatibility paragraph is the outlier, but the document must not carry two
readings of a precedence rule.

## Required changes

1. **Close the cross-cache-root endpoint collision identified in Finding 1.**
   The design must not leave this to the "pre-existing deployment error"
   classification at lines 493-495, because the correction is what makes two
   lock domains share one socket pathname. Any one of the following is
   sufficient; I recommend (a) and (b) together, as (a) is a one-line
   strengthening of an existing rule and (b) makes the condition diagnosable:

   a. **Narrow the unlink precondition from "failed authenticated connection"
      to "failed *transport* connection."** Amend lines 342-345 so a socket may
      be removed only when the connect attempt itself fails at the transport
      layer (`ECONNREFUSED`, `ENOENT`, or the platform equivalent indicating no
      listener). A peer that accepts the connection and speaks the broker
      protocol is live by definition and must never be unlinked, whatever its
      instance ID or nonce. Instance/nonce mismatch against a *live accepting*
      peer must become a fail-closed integrity error, not removal authority.
      This preserves every intended stale-socket recovery — a genuinely dead
      owner leaves a socket that refuses connections — while removing the
      destructive false negative.

   b. **Add `cache_root` to the live handshake tuple** (lines 266-269) and
      require the responder to report it. A probe that authenticates the project
      tuple but reports a different `cache_root` is then positively identifiable
      as a foreign-authority live broker, and should produce a new fail-closed
      stable error naming both cache roots, both authority lock paths, and the
      shared endpoint root, with one action: converge the authority-cache
      configuration (`XDG_CACHE_HOME` / `home`) across every participant. Today
      this condition is silently indistinguishable from a stale socket.

   c. Alternatively, if divergent cache roots are to remain unhandled, the
      design must forbid the enabling configuration outright: require that when
      `endpointRootSource` is `configured`, the owner records `cache_root` in a
      marker under the shared `aipr/v1` parent keyed by the digest token, and
      refuse to bind when a present marker names a different cache root. This is
      strictly more machinery than (a)+(b) and adds shared-parent write
      traffic, so I raise it only for completeness.

   Whichever route is taken, the compatibility argument at lines 487-498 must
   be amended: the sentence "The new endpoint-root setting cannot create that
   split because it never relocates the lock" is the incorrect step and should
   be replaced with an explicit statement of what the lock does and does not
   guarantee once the endpoint is no longer under the lock's root.

2. **Scope the symlink and case-sensitivity rules (Finding 2).** Rewrite line
   132 to name its subjects explicitly — for example, "the path layer never
   resolves symlinks *in the `home`, `XDG_CACHE_HOME`, `LOCALAPPDATA`, or
   `AI_PEER_REVIEW_ENDPOINT_ROOT` inputs*; identity-tuple canonicalization under
   the accepted design is unchanged" — and add the same scoping to the
   root-equality rule at lines 133-137, stating that it governs endpoint-root
   comparison on POSIX and does not alter the accepted Windows canonical-spelling
   contract. Add a sentence to the Supersedes block (lines 9-24) confirming that
   line 242-244 of the accepted design is **not** superseded.

3. **Resolve the `starting`-versus-`ready` contradiction (Finding 3).** Amend
   line 481 to read "current-instance `starting` or `ready` metadata", matching
   lines 438-439, 564-567, and the verification requirement at line 694-696.

## Optional suggestions

1. **Name the recorded endpoint root in the client's overlength recovery.**
   Lines 432-435 have the client preflight its derived endpoint before touching
   anything, and line 707-709 requires an overlong client default to fail with
   `APR_BROKER_ENDPOINT_TOO_LONG`. That is the exact scenario this correction
   exists to fix, so it will be the common case on a long-home macOS account:
   the owner runs under a configured short root, the client is unconfigured, and
   the client is told only to "configure a shorter validated
   `AI_PEER_REVIEW_ENDPOINT_ROOT`" without being told which root the owner
   actually chose. That value is already recorded in `broker.json` under the
   always-reachable `cacheRoot`, and reading it requires no endpoint-root
   traversal and no relaxation of the "metadata is diagnostic evidence only"
   rule (lines 446-448). Consider specifying that on this path the client may
   open and validate the authority cache root, read current-instance `ready`
   metadata, and include the recorded `endpoint_root` in the recovery text as a
   suggested value to validate — while still refusing to route to it
   automatically. Note this interacts with required change 3's ordering: the
   layout-version check would need to precede the suggestion.

2. **Introduce a distinct error for endpoint-root anchor failure.** Lines
   295-297 and 661-663 route an unsafe or absent *endpoint* root to
   `APR_BROKER_CACHE_ROOT_UNAVAILABLE`, mitigated by "identifies its
   authority/endpoint role and source variable". Given that the correction
   already adds two dedicated endpoint-parent codes
   (`APR_BROKER_ENDPOINT_PARENT_UNSAFE`/`_LOST`) for the `aipr` and `aipr/v1`
   levels, a cache-named code for the endpoint anchor one level above them is an
   avoidable inconsistency in offline `explain` matching. An
   `APR_BROKER_ENDPOINT_ROOT_UNAVAILABLE` code would make the six-error
   enumeration at lines 19-24 symmetric across the two anchors. I mark this
   optional because the role/source context does carry the necessary
   information.

3. **Soften the "detects later replacement" claim for the device/inode
   baseline.** Lines 426-430 record device and inode at bind and compare before
   ownership-sensitive cleanup. Inode numbers are reusable after unlink on most
   filesystems, so an unlink-and-rebind by a racing same-user process can
   reproduce the same `(dev, ino)` pair and pass the comparison along with
   owner, type, and mode. The threat model is same-user only — the 0700 parent
   excludes everyone else — so this is not a security hole, but "detects later
   replacement" overstates it. Suggest "detects replacement that changes the
   observed filesystem identity" and, if cheap on the native layer, additionally
   recording the entry's creation/change timestamp in the baseline.

4. **Record where the platform endpoint limit enters `brokerPaths`.** Lines
   125-127 make the path layer "the sole source" of `maxEndpointRootBytes`,
   derived from "the injected endpoint limit", and the verification list at
   lines 632-634 asserts the value "for an injected Darwin limit". The signature
   at line 98 is unchanged from the accepted plan's Task 3 interface
   (`brokerPaths({ identity, platform, env, home })`, plan line 172), and the
   failure list at lines 544-545 calls it "platform limit", which implies it
   rides on the injected `platform` double. That inference is almost certainly
   right, but since the correction newly makes the limit *mandatory* inside
   `brokerPaths` rather than only at the preflight caller, naming the exact
   field would remove the guess for the implementer and for the tests at line
   632-634.

5. **Reconsider the recovery text for benign shared-parent eviction.** Lines
   508-512 correctly anticipate that OS cache eviction is a realistic trigger
   for `APR_BROKER_ENDPOINT_PARENT_LOST`, and lines 55-56 accept the whole-user
   blast radius as a deliberate goal. I do not contest the tradeoff — the
   byte budget forces it, and the accepted epic's "Cache deletion is not
   authority to launch another broker" (accepted design line 285) makes the
   conservative response consistent. The suggestion is narrower: the recovery at
   lines 586-594 directs the operator to reconcile "every affected project's
   lock, metadata, endpoint, review registry, and provider state" in language
   that reads as a possible-compromise procedure, and a routine macOS purge will
   hit it. Consider having the error distinguish *absence* (the parent is simply
   gone, consistent with eviction) from *unsafe replacement* (a foreign-owned,
   permissive, non-directory, or symlinked entity now occupies the path), and
   give the absence case a correspondingly lighter, clearly-labelled recovery.
   Both remain fail-closed and neither recreates the directory; only the operator
   guidance differs. This is presentation, not mechanism, which is why it is
   optional.

6. **Windows detail for `APR_BROKER_ENDPOINT_TOO_LONG`.** Line 553-555 requires
   error details to carry the derived `maxEndpointRootBytes` "never a duplicated
   literal", but lines 548-550 establish that Windows cannot reach this error
   (its fixed 108-unit label fits the 256-unit limit, so an overlong condition
   there means an invalid platform limit or unsupported runtime), and Windows
   returns `maxEndpointRootBytes: null` per lines 125-127 and 647-650. The
   requirement is vacuous rather than wrong on Windows; a half-sentence scoping
   it to POSIX would keep the bullet self-consistent.

## Decision

revisions-requested
