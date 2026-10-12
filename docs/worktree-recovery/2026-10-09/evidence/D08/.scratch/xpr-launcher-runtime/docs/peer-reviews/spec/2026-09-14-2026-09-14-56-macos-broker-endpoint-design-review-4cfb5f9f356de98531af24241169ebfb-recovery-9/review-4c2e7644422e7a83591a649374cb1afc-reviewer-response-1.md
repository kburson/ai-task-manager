<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-4c2e7644422e7a83591a649374cb1afc"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "588735b9e095d524185ca16109e684853a580ace"
artifact_blob: "7e2e5dbd073e6aa78b7facc20c141e769996a49e"
artifact_digest: "sha256:c8a79b34db5435582a1f192b1ae27a8025027fa0c8456aa57153fb34e7b9c1ee"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:92326d5bf498810a1d8be52732f42db9b763ade187086d3065e4c2bef478f0e7"
  identity_source: "runtime"
started_at: "2026-09-14T18:04:48.080Z"
submitted_at: "2026-09-14T18:09:15.957Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed `docs/design/2026-09-14-56-macos-broker-endpoint-design.md` on its own
terms, against the accepted epic documents it claims to supersede
(`docs/design/2026-09-14-project-local-spr-xpr-broker-design.md`,
`docs/plans/2026-09-14-project-local-spr-xpr-broker.md`), and against the shipped
path layer `src/broker/paths.mjs`. I did not read earlier rounds of this review
series, so this assessment is independent of them.

The correction is well-motivated and its load-bearing claims check out. I
verified the following directly rather than accepting them:

- The defect is real. `src/broker/paths.mjs:56` already measures POSIX endpoints
  as `Buffer.byteLength(endpoint, 'utf8')`, and `src/broker/paths.mjs:78-82`
  derives `<user-cache>/ai-peer-review/brokers/<64-hex>/broker.sock`. Under
  `/Users/kpburson/Library/Caches` (30 bytes) that is 130 bytes, and 117 bytes
  even for a `/x` home — both over the 103 usable bytes left by Darwin's
  `sun_path[104]`. The shipped preflight therefore does reject every conforming
  macOS home, exactly as the Problem section states.
- The supersession references are accurate. Epic design lines 260–265 are the
  socket/lock/metadata layout block, lines 279–280 are the user-only-access and
  symlink/foreign-owner rule, and lines 335–337 are the stable startup-error
  list (`APR_BROKER_START_FAILED`, `APR_BROKER_INCOMPATIBLE`, `APR_BROKER_OWNED`,
  `APR_BROKER_STALE`, `APR_PROVIDER_RESOURCE_BUSY`). Plan line 172 is Task 3
  **Interfaces**, line 192 is the Task 3 layout instruction, and line 199 is
  Task 4 **Interfaces**. The six new errors genuinely extend rather than replace
  that list.
- The encoding and every budget number are correct. 256 bits / 5 = 51.2 → 52
  symbols; `/aipr/v1/<token>` is 1+4+1+2+1+52 = 61 bytes; 103−61 = 42 Darwin root
  bytes and 107−61 = 46 Linux root bytes; 42 − len(`/Library/Caches`) = 27-byte
  home and 27 − len(`/Users/`) = 20-byte short name;
  `/Users/kpburson/Library/Caches/aipr/v1/<token>` is 91 bytes. The base32 edge
  vectors are right: an all-zero digest yields 52 `a`, an all-`ff` digest yields
  51 `7` then `q` (last group = `10000` = index 16 = `q`), and every token must
  end in `a` or `q` because its 52nd symbol carries one data bit and four zero
  pad bits. The Windows label `\\.\pipe\ai-peer-review-brokers-<64hex>-broker.sock`
  is exactly 108 units, matching the claim that it fits the 256-unit limit.
- The "extends shipped behavior" qualifiers in the input table are honest.
  `src/broker/paths.mjs:30,35` uses `path.posix.join`, which silently normalizes
  trailing separators and `.`/`..` components today; rejecting them is a real
  behavior change and the design says so. The claim that
  `APR_BROKER_ENDPOINT_TOO_LONG` must stop asserting endpoints are never
  redirected is also accurate — `src/broker/paths.mjs:61` says exactly that.
- Base64url is correctly rejected on case-folding grounds, and case-sensitive
  byte-exact root comparison is a defensible fail-closed choice given that the
  token alphabet is case-fold-safe.

Three gaps remain that I believe block acceptance. One is a liveness defect that
can permanently wedge broker startup; one leaves a security post-condition
undefined and therefore untestable; one makes the mandated macOS integration test
fail on conforming accounts whose only fault is a long home directory. None of
them undermines the chosen approach — each is a hole in a contract the design
otherwise specifies in detail.

## Findings

1. **A superseded endpoint root that is absent or unsafe permanently blocks
   broker startup, with no defined outcome.** Lines 346–349 require that a new
   owner, after taking the lock, read prior metadata and — if it records a
   different endpoint root — "validates that root and its full endpoint-directory
   chain" before probing the prior socket. Lines 293–296 make an absent or unsafe
   endpoint root fail closed with `APR_BROKER_CACHE_ROOT_UNAVAILABLE`, and lines
   364–366 place this reconciliation *before* the owner publishes `starting`
   metadata. Composed, these mean a stale metadata record pointing at a root that
   no longer exists — a removed temporary directory, an unmounted volume, a
   cache-evicted `aipr` under a former `AI_PEER_REVIEW_ENDPOINT_ROOT` — aborts
   every future start of a broker whose *own* endpoint root is perfectly valid.
   The owner cannot rewrite the offending metadata, because it fails before it is
   allowed to publish anything. There is no stated recovery, and
   `APR_BROKER_CACHE_ROOT_UNAVAILABLE`'s single action ("provide a safe root")
   is wrong here: the user is being asked to resurrect a root they deliberately
   abandoned. The verification list (lines 684–685) covers only the success case,
   "a restarting owner ... removes exactly a dead socket recorded under the
   superseded endpoint root", so no test would catch this.

   Proceeding is safe and I think is the right disposition: clients never treat
   metadata as routing authority (lines 429–435, 544–548), so an unreachable or
   even hostile socket under the superseded root cannot be reached by any client
   once the new owner publishes `ready` metadata naming the current root. A
   client still configured for the old root fails `APR_BROKER_ENDPOINT_ROOT_MISMATCH`
   before traversal. The design needs to say this explicitly rather than leave
   the composition to the implementer.

2. **The endpoint socket's allowed mode set is never defined, so a security
   post-condition and its test cannot be pinned.** Line 322 says the owner
   "creates the socket as owner-only where the platform permits", and lines
   403–406 require the post-bind observation to verify "the mode is within the
   allowed set". That set is never enumerated anywhere in the document, unlike
   the directory levels, which are specified concretely as `0700` plus a
   not-group-or-other-writable boundary (lines 282–284, 300–302, 316–318). This
   matters in practice: `node:net`'s Unix listener applies the process umask and
   exposes no mode option, so the observed mode is environment-dependent, and
   "where the platform permits" gives an implementer license to accept whatever
   `bind()` produced. The verification bullet at lines 662–664 ("validates
   owner/type/mode") is unimplementable as written. Containment by the `0700`
   `aipr/v1` parent means a permissive socket mode is not by itself exploitable,
   but that is an argument for stating the intended set and its rationale, not
   for leaving it open.

3. **The mandated macOS integration test fails on conforming accounts with a
   long home directory.** Lines 702–708 require an integration test that calls
   production `brokerPaths` with the *real* home directory and binds at the
   returned endpoint, and that "must fail — not substitute another path — if the
   production-derived endpoint cannot bind". On any macOS account whose home
   exceeds 27 bytes, the production-derived default endpoint cannot bind *by
   design*: the design's own contract (lines 233–248) says preflight must throw
   `APR_BROKER_ENDPOINT_TOO_LONG` and direct the user to configure
   `AI_PEER_REVIEW_ENDPOINT_ROOT`. The test as specified therefore reports a
   correct, intended, fail-closed outcome as a product defect, and offers no
   sanctioned alternative — it forbids substitution and does not permit
   configuring an endpoint root or skipping. A 21-byte macOS short name is
   ordinary, and the design itself devotes a verification bullet (lines 602–603)
   to that exact case. The acceptance gate at lines 726–730 depends on this test
   passing, so the correction cannot be accepted on such a machine even when the
   implementation is correct.

   The fix does not require weakening the no-substitution rule: on a long-home
   account the test can assert the exact `APR_BROKER_ENDPOINT_TOO_LONG` recovery
   and then complete the same real production-derived bind/connect round trip
   through a validated short `AI_PEER_REVIEW_ENDPOINT_ROOT`, which is still the
   production path function's output and still no substitution.

## Required changes

1. Define the outcome of endpoint-root reconciliation when the metadata-recorded
   superseded root is absent, unreachable, or fails `openPrivateRoot`. State
   whether the owner proceeds (recording the unreconciled prior root) or aborts,
   name the error and its single action if it aborts, and add a verification
   bullet for at least the absent-superseded-root and unsafe-superseded-root
   cases alongside the existing dead-socket-removal bullet at lines 684–685. If
   the intent is to proceed, say why that is safe — clients derive routing only
   from their own environment — so the implementer does not conservatively
   inherit the blocking reading.

2. Enumerate the allowed endpoint-socket mode set checked by the post-bind
   observation at lines 403–406, and state the required creation behavior at
   line 322 in terms an implementer can satisfy deterministically (for example,
   an explicit umask discipline or post-bind `fchmod`-equivalent through the
   retained parent handle, or an explicit statement that the mode set is
   permissive because `aipr/v1` is `0700` and containment is the control). Update
   the verification bullet at lines 662–664 to assert the specific set.

3. Amend the macOS integration-test contract at lines 702–708 so that an account
   whose default endpoint is overlong is not reported as a product failure.
   Specify that such an account asserts the exact `APR_BROKER_ENDPOINT_TOO_LONG`
   platform recovery and then performs the same production-derived bind/connect
   round trip under a validated short `AI_PEER_REVIEW_ENDPOINT_ROOT`, keeping the
   existing prohibition on substituting an unrelated path.

4. State that the `APR_BROKER_ENDPOINT_TOO_LONG` error carries the path layer's
   derived endpoint-root budget rather than a literal constant. Lines 124–126
   define `maxEndpointRootBytes` as the injected limit minus 61 and make the path
   layer "the sole source", but `brokerPaths` throws on an overlong endpoint and
   therefore never returns that field in precisely the case where the caller
   needs it; lines 538–539 then quote fixed 42- and 46-byte maxima. Say that the
   error details carry the derived value, so the two cannot diverge if an
   injected `sun_path` limit ever changes.

## Optional suggestions

1. Consider letting an unrecognized `endpoint_layout_version` be reported from a
   current-instance `starting` record, not only from `ready`. All three normative
   passages (lines 426–428, 468–472, 549–552) gate `APR_BROKER_INCOMPATIBLE` on
   `ready`, so a v1 client facing a newer owner that never reaches `ready` — it
   crashes during startup, or hangs holding the lock — receives
   `APR_BROKER_START_FAILED` with "retry the named owner startup" indefinitely
   and is never told the simple truth that it is too old. This is a diagnostic
   quality issue rather than a correctness hole, since the client converges on
   the right error as soon as `ready` is published.

2. Consider noting how `endpointLayoutVersion` applies on Windows. Line 124 makes
   it unconditionally `1` and lines 354–356 record it in metadata on every
   platform, but the Windows named-pipe label (lines 194–196) carries no version
   token and is explicitly retained for compatibility. A single scalar therefore
   versions a POSIX pathname layout and an unversioned Windows label together; a
   future Windows-only label change would have no way to express itself without
   also implying a POSIX `v2`. A sentence scoping the field to the POSIX layout,
   or acknowledging the coupling, would prevent a wrong reading later.

## Decision

revisions-requested
