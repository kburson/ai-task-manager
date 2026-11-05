<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-f700e910260bcf2a23f0d2fc5932a15e"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "2d33eb2a044ee28ee0390484fda2536c967c80c8"
artifact_blob: "a11c29289193e65a36b98a66c3704c4bf925ec66"
artifact_digest: "sha256:5cc4427c2230b5bee0b4367b19fc798ec328b77bdcd87d09808f54fdcd7bf165"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:e69b79183e89bdfec340fa683c792c616bc76c181f668a55ee514af58fb2a8e1"
  identity_source: "runtime"
started_at: "2026-09-14T17:12:26.941Z"
submitted_at: "2026-09-14T17:17:10.876Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed `docs/design/2026-09-14-56-macos-broker-endpoint-design.md` at `2d33eb2`
independently. I re-derived every load-bearing number rather than accepting the
design's arithmetic, and checked the document against the shipped
`src/broker/paths.mjs`, the epic design
`docs/design/2026-09-14-project-local-spr-xpr-broker-design.md`, and the plan
`docs/plans/2026-09-14-project-local-spr-xpr-broker.md`.

Independently confirmed:

- `sockaddr_un.sun_path[104]` is the active declaration. I read it directly at
  line 79 of
  `/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/sys/un.h`:
  `char sun_path[104]; /* [XSI] path name (gag) */`. 103 usable NUL-terminated
  bytes is the correct reading, and 107 for Linux's `sun_path[108]` is correct.
- The accepted layout
  `/Users/kpburson/Library/Caches/ai-peer-review/brokers/<64-hex>/broker.sock`
  is 130 UTF-8 bytes (30 + 15 + 8 + 1 + 64 + 12) and 117 bytes for a `/x` home
  (2 + 115). The defect is real and live: `verifyEndpointLength` at
  `src/broker/paths.mjs:56` measures POSIX endpoints with
  `Buffer.byteLength(endpoint, 'utf8')` against `platform.maxEndpointLength`, so
  it rejects every conforming macOS home today.
- 256 / 5 = 51.2, so unpadded base32 emits exactly 52 characters for every
  32-byte digest, with a 1-bit remainder in the high bit of the final group.
  All-zero encodes to 52 `a`; all-`ff` encodes to 51 `7` (value 31) followed by
  `10000` = 16 = `q` in `abcdefghijklmnopqrstuvwxyz234567`; every token must end
  in `a` or `q`. All four encoding vector claims are correct, and step 4 of the
  encoding contract is now unambiguous.
- `/Users/kpburson/Library/Caches/aipr/v1/<52>` is 91 UTF-8 bytes
  (30 + 5 + 3 + 1 + 52). The post-`$HOME` suffix is invariant at 76 bytes, so a
  27-byte home lands at exactly 103, a 28-byte home at 104, and the
  `/Users/<short-name>` boundary is exactly 20 UTF-8 bytes. Every Length-boundary
  and Verification figure holds.
- The base64url rejection is sound: a mixed-case alphabet is not injective under
  case folding on a case-insensitive filesystem.
- The "five new stable errors" count is exact.
  `APR_BROKER_PATH_INVALID`, `APR_BROKER_ENDPOINT_LIMIT_INVALID`,
  `APR_BROKER_ENDPOINT_TOO_LONG`, and `APR_BROKER_ENDPOINT_UNSUPPORTED` already
  exist in `src/broker/paths.mjs`; the five cache-root, authority-parent, and
  endpoint-parent codes are genuinely new and none appear in the epic's
  enumeration at lines 335-336.
- The prior review cycle's five findings are all substantively addressed: the
  20-byte macOS username boundary is now stated in user-visible terms with a
  real remedy, the Linux `home-default` creation exception exists, the anchor now
  requires non-group/other-writability, the Verification section covers the new
  error codes and the Windows no-`dirname` assertion, and the Supersedes clause
  names the epic layout block and stable-error list.

The selected encoding needs no change, and none of my findings ask for a
different approach. All three concern edges introduced by the two mechanisms this
revision added: the post-bind identity comparison, and the new
`AI_PEER_REVIEW_CACHE_HOME` cache-root selection input.

Decision: revisions-requested, on three findings. F1 and F2 are correctness
defects in newly added normative text; F3 is specification completeness in a
normative return value.

## Findings

1. **The post-bind identity comparison has no defined source for the expected
   device and inode, and as written is not implementable.** Lines 304-311 require
   that immediately after `bind()` succeeds the security layer "observes the
   socket entry relative to the retained `aipr/v1` handle with no-follow
   semantics and compares its device, inode/file identity, socket type, owner,
   and allowed mode **against the listener it just created**," and line 441-443
   makes that five-property comparison a mandatory test. Owner, socket type, and
   mode have well-defined expected values (the process's own UID, `S_IFSOCK`, the
   allowed mode). Device and inode do not. The only candidate source is the
   listening socket file descriptor, and POSIX explicitly states that for a file
   descriptor referring to a socket, `fstat()` shall set `st_mode` to indicate a
   socket and **the values of all other members are unspecified**. In practice
   the kernel's socket object and the filesystem entry `bind()` created are
   distinct objects with distinct identity, so an `fstat(listenFd)` versus
   `fstatat(dirfd, name, AT_SYMLINK_NOFOLLOW)` equality test does not hold on
   either target platform. (I could not execute a probe in this session to
   confirm the exact Darwin and Linux values; the POSIX "unspecified" guarantee
   is sufficient on its own, because a comparison against unspecified data is not
   a contract an implementation can satisfy.)

   This matters beyond phrasing, because device and inode are load-bearing later.
   Line 309 requires "the same retained-parent comparison" before
   ownership-sensitive cleanup, and line 265-270 permits unlinking a socket only
   under retained lock ownership. Device and inode are exactly what makes that
   second check able to detect replacement. An implementer following lines
   304-311 literally writes a first-check assertion that cannot pass, discovers
   it, and then has two bad options: drop device and inode from both checks —
   silently deleting the replacement detection the design depends on — or invent
   an undocumented baseline. The design must specify the baseline itself.

   The correct formulation is a record-then-compare contract: the immediate
   post-bind observation **establishes** the device and inode baseline while
   verifying only the properties that have an independent expected value (owner
   is the calling UID, type is a socket, mode is within the allowed set), and the
   later cleanup observation **compares** against that recorded baseline. The
   design's own conclusion at line 310-311 — that this "makes the unavoidable
   absolute-bind race detectable without pretending that `bindat` exists" —
   remains true under that formulation, but only the record-then-compare version
   is achievable.

2. **`AI_PEER_REVIEW_CACHE_HOME` relocates the lock directory, so the
   unversioned full-digest lock is not the single mutual-exclusion point the
   design claims, and two brokers can own one project concurrently.** Lines
   332-336 state unconditionally that "The full-digest lock directory
   intentionally remains unversioned. It is the cross-layout-version
   mutual-exclusion point," and close by forbidding a future design from
   versioning the lock directory "and thereby allow two layout versions to own
   one project concurrently." That invariant is already broken by this document,
   one layout version earlier.

   `authorityDirectories` — and therefore `directory`, `lock`, and `metadata` —
   are all rooted at `<user-cache>` (lines 116-120, 122-128), and lines 106-114
   make `<user-cache>` itself selectable through `AI_PEER_REVIEW_CACHE_HOME`. The
   canonical root tuple deliberately excludes the cache root, so two processes
   for the same project root compute the **same** digest but **disjoint** absolute
   lock, metadata, and endpoint paths. Each acquires a real `broker.lock`, binds a
   real endpoint, and serves the same canonical project. The epic's ownership
   machinery never fires, because `APR_BROKER_OWNED` and `APR_BROKER_STALE` are
   keyed on a lock path the second broker never opens.

   This is materially worse than the discovery failure the design does
   acknowledge. Line 113-114 says only that "both owner and client processes must
   use the same setting," framed as a routing requirement; a client that gets it
   wrong merely fails to connect. A second *broker* that gets it wrong violates
   the epic's core one-broker-per-canonical-root invariant and the rule at epic
   lines 283-289 that provider leases and review ownership must be revalidated
   before any delivery — two owners can hold leases and deliver for the same
   project simultaneously. There is no stable error for this condition, no
   detection mechanism, and no verification bullet; lines 425-426 pin
   cache-root precedence and `cacheRootSource` exactness but not this.

   The risk is not exotic: the offline recovery at lines 192-197 actively
   instructs long-home macOS users to adopt the variable, so the population most
   likely to run with a non-default cache root is precisely the population the
   design is steering there, and a shell that exports the variable in one session
   but not another reproduces it.

3. **The `cacheRootSource` enum has no complete input-to-value mapping, and it
   carries policy.** Lines 109-112 define the fixed enum `configured`,
   `platform-default`, `home-default` and state its purpose plainly: "allowing the
   security layer to apply the creation policy without reinterpreting env or path
   text." The policy attached to it is consequential — lines 220-227 make
   `home-default` the sole creation exception and everything else a fail-closed
   `APR_BROKER_CACHE_ROOT_UNAVAILABLE`. But three inputs have no stated
   classification:

   - **Windows `%LOCALAPPDATA%`.** Line 146-147 says Windows `cacheRoot` and the
     authority chain "have the same filesystem contract as on Unix" without
     naming a source value. `%LOCALAPPDATA%` is env-derived like `configured` but
     is the platform's only supported root like `platform-default`. Line 429's
     "Windows output is asserted key-for-key" would pin whatever the
     implementation happens to choose rather than a decided contract.
   - **Whether `AI_PEER_REVIEW_CACHE_HOME` is honored on Windows.** Line 106-109
     reads naturally as macOS/Linux-only ("Windows retains `%LOCALAPPDATA%`"), but
     line 146-147's "same filesystem contract as on Unix" reads the other way.
     One of these must be stated normatively, and it interacts with F2.
   - **Linux `XDG_CACHE_HOME`.** Line 215-217 calls selecting it "configuration,
     not proof of safety," implying `configured`, which would make one enum value
     cover two different variables. Since the `APR_BROKER_CACHE_ROOT_UNAVAILABLE`
     recovery must "identif[y] the exact root and one recovery action" (line
     226-227), the recovery text has to name *which* variable to change, and a
     conflated value cannot carry that.

   Separately, both variables are specified only for the absolute case — lines
   106-109 say "an absolute `AI_PEER_REVIEW_CACHE_HOME` takes precedence when
   present" and "absolute `XDG_CACHE_HOME` when present" — leaving the relative
   and empty-string cases undefined. The two defensible readings diverge
   observably: ignore the value and fall through to the default (what the XDG
   Base Directory specification requires for a relative `XDG_CACHE_HOME`), or
   throw. The shipped code takes the second path today —
   `src/broker/paths.mjs:32-34` branches on `env.XDG_CACHE_HOME !== undefined` and
   then throws `APR_BROKER_PATH_INVALID` for a relative or empty value — so this
   document, which supersedes the path contract, either ratifies that behavior or
   changes it, and currently does neither. The choice also determines the
   resulting `cacheRootSource`.

## Required changes

1. (F1) Restate lines 304-311 and the verification bullet at lines 441-443 as a
   record-then-compare contract. Specify that the immediate post-bind observation
   is taken relative to the retained `aipr/v1` handle with no-follow semantics,
   verifies owner equals the calling UID, type is a socket, and mode is within
   the allowed set, and **records** the observed device and inode as the endpoint
   identity baseline; and that the pre-cleanup observation compares all five
   properties against that recorded baseline. State explicitly that no expected
   device or inode is derivable from the listening socket descriptor, so that a
   future implementer does not reintroduce the impossible comparison. Keep the
   existing fail-closed behavior unchanged: a mismatch closes the listener and
   unlinks neither observed entry. Split the verification bullet to cover the
   record step and the compare step separately, including a mismatch injected at
   the compare step.

2. (F2) Resolve the contradiction between the cache-root selection input and the
   mutual-exclusion claim at lines 332-336. At minimum, scope that claim
   truthfully — the full-digest lock is the mutual-exclusion point **within a
   single resolved `<user-cache>`** — and state plainly, in Security and
   ownership rather than only as a routing note at lines 113-114, that two
   brokers for one canonical project root under different cache roots do not
   mutually exclude, naming the provider-lease and delivery consequence. Then
   either:
   (a) add detection: record the resolved `cacheRoot` and `cacheRootSource` in a
   project-scoped, cache-root-independent location that every broker for that
   project already consults, so a second broker under a different root observes
   the conflict and fails closed with a stable error and one exact recovery
   action; or
   (b) record it as an explicitly accepted residual risk, state that the operator
   is responsible for setting the variable identically for every process touching
   the project, and say why detection is out of scope for this correction.
   Either way, add a verification bullet covering two brokers for one digest under
   two cache roots, and extend the non-goal at lines 57-59 — which currently
   distinguishes the cache-root input from an endpoint override on identity
   grounds — to acknowledge that it does relocate the mutual-exclusion point.

3. (F3) Give `cacheRootSource` a complete input-to-value mapping as an explicit
   table covering, per platform: `AI_PEER_REVIEW_CACHE_HOME` (including whether
   it is honored on Windows), Linux `XDG_CACHE_HOME`, Windows `%LOCALAPPDATA%`,
   macOS `~/Library/Caches`, and Linux `~/.cache`, with the creation policy each
   value implies. Define the relative and empty-string cases for both variables —
   ignore-and-fall-through versus fail-closed — and state which error code
   results and what `cacheRootSource` the fall-through produces, confirming
   whether this ratifies or changes `src/broker/paths.mjs:32-34`. If one enum
   value covers more than one variable, state how the
   `APR_BROKER_CACHE_ROOT_UNAVAILABLE` recovery names the specific variable to
   change. Extend the verification bullets at lines 425-426 and 429 to assert the
   mapping per input rather than only precedence, and to pin the Windows
   `cacheRootSource` value.

## Optional suggestions

1. State the orphaned-socket lifecycle for the shared `aipr/v1` directory. Lines
   262-264 correctly forbid a per-project broker from removing a shared directory
   even when it appears empty, and lines 265-270 permit unlinking a socket only
   under the matching full-digest lock — which means a socket for a project that
   was deleted from disk, or whose digest changed because the project moved, is
   never reclaimed, since nothing will ever acquire that lock again. The cost is
   trivial in bytes, but `aipr/v1` is per-user and shared across every project, so
   it grows monotonically. A sentence recording this as accepted, or pointing at
   the epic's cleanup story, would close the loop. The forward-attribution
   mechanism at lines 463-466 already provides the enumeration needed to identify
   such entries.

2. Record the resolved `cacheRoot` and `cacheRootSource` in `broker.json` schema
   v1 alongside `endpoint_layout_version`. This is diagnostic, not routing
   identity, so it does not conflict with the rule at lines 272-278 against
   duplicating the derived token, and it makes an F2-class split-root incident
   diagnosable after the fact even if option (b) is taken. If F2 is resolved via
   option (a), this may become the mechanism rather than a suggestion.

3. Consider having Windows pass `paths.endpointDirectories` rather than a literal
   `[]`. Lines 255-257 write the Windows call as
   `listenPrivate([], paths.endpoint, { lock, cacheRoot })` while the POSIX call
   at lines 241-243 passes `paths.endpointDirectories`. Since line 152-153 already
   guarantees Windows returns a deeply frozen empty `endpointDirectories` array,
   passing it uniformly keeps one call shape, lets the empty-array assertion at
   line 428-429 do real work at the call site, and removes a place where a caller
   could construct a fresh mutable array instead of using the frozen path-layer
   value.

## Decision

revisions-requested
