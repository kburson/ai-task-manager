<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-4cd67a4ac1119dbdc0c89d86ce259a3f"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "f7454015f22b80b382af6003ca91643c62974264"
artifact_blob: "091b3f07b34992a71f1a23b4431abf3a17a74338"
artifact_digest: "sha256:fcc8762927a9569f900b7712601265025624a1e952368a6e861959cda3e23350"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:1d8fcfbc05e44f09e6ee7d4c87c1339449e575ee8235ad1ac4566c064b8d8312"
  identity_source: "runtime"
started_at: "2026-09-14T17:54:40.821Z"
submitted_at: "2026-09-14T18:00:22.772Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed `docs/design/2026-09-14-56-macos-broker-endpoint-design.md` independently
against its own internal consistency, the accepted epic documents it claims to
supersede (`docs/design/2026-09-14-project-local-spr-xpr-broker-design.md`,
`docs/plans/2026-09-14-project-local-spr-xpr-broker.md`), and the currently
implemented path layer (`src/broker/paths.mjs`). I did not read prior review
rounds in this review series, in order to keep the assessment independent.

The core correction is sound and I verified its load-bearing arithmetic and
supersession claims directly:

- Supersession references are accurate. Epic design lines 260–265 are exactly the
  socket/lock/metadata layout block, lines 279–280 are exactly the "user-only
  directory access … refuse symlinked or foreign-owned endpoint and lock
  resources" rule, and lines 335–337 are exactly the stable startup-error list.
  Plan line 172 is Task 3 **Interfaces**, line 192 is the Task 3 layout
  instruction, and line 199 is Task 4 **Interfaces**.
- The defect is real and correctly characterized. `/Users/kpburson/Library/Caches`
  is 30 bytes; the accepted endpoint
  `<user-cache>/ai-peer-review/brokers/<64-hex>/broker.sock` adds 100 bytes for a
  total of 130, and a `/x` home still yields 117 — both over the 103 usable bytes
  left by Darwin's `sun_path[104]`. `src/broker/paths.mjs:56` already measures
  POSIX endpoints with `Buffer.byteLength(endpoint, 'utf8')`, so the shipped
  preflight does reject every conforming macOS home, exactly as the Problem
  section states.
- The encoding is lossless and the budget arithmetic is correct. 256 bits / 5 =
  51.2, so 52 symbols; `/aipr/v1/<token>` is 1+4+1+2+1+52 = 61 bytes; 103−61 = 42
  Darwin root bytes and 107−61 = 46 Linux root bytes; 42−`len("/Library/Caches")`
  = 27 home bytes and 27−`len("/Users/")` = 20 short-name bytes; the real
  reproduction root yields 30+61 = 91 bytes. The stated base32 edge vectors also
  check out: an all-zero digest gives 52 `a`, an all-`ff` digest gives 51 `7`
  then `q` (final group `10000` = index 16 = `q`), and every token must end in
  `a` or `q` because the last symbol carries one data bit plus four zero pads.
- The Windows label `\\.\pipe\ai-peer-review-brokers-<64-hex>-broker.sock` is
  108 units, matching the artifact's claim that it fits the supported 256-unit
  limit, and the `null`/empty-array Windows shape with a forbidden-and-tested
  `dirname` rule is a good defense against the obvious implementation shortcut.
- The security model is coherent where it matters most: lock and metadata
  authority never move with the endpoint-root input, the full-digest lock remains
  the single mutual-exclusion point, cleanup is gated on verified lock ownership
  plus a failed authenticated connection, the record-then-compare post-bind
  contract correctly refuses to invent `bindat` or compare descriptor identity to
  filesystem identity, and the shared-parent blast radius is disclosed as a goal
  rather than hidden.

Three defects remain, all in the specification rather than the approach. F1 is a
direct contradiction between the new canonical-root rule and the input table,
with byte-exact consequences that can produce spurious fail-closed mismatches
between correctly configured participants. F2 is a missing ordering constraint
that the correction itself creates the need for. F3 is an undefined reaction to a
field this correction newly records. F4 is a verification asymmetry. None
requires rethinking the base32-in-`aipr/v1` design.

## Findings

1. **The canonical-root rule contradicts the input table and the failure list for
   `XDG_CACHE_HOME` and `%LOCALAPPDATA%`, and the contradiction is byte-exact
   load-bearing.** Lines 128–134 state a blanket contract: "Every returned root is
   a canonical absolute platform path. POSIX roots contain no trailing separator
   and no `.` or `..` component. A configured value carrying one of those
   noncanonical forms fails with `APR_BROKER_PATH_INVALID` naming its input."
   But the input table rows at lines 141 and 143 enumerate the invalid values for
   `XDG_CACHE_HOME` as only "Empty or relative" and for `%LOCALAPPDATA%` as only
   "Missing, empty, or nonabsolute", and rows 140–142 each assert that this
   "ratifies shipped behavior". The Failure-behavior bullet at lines 489–494
   likewise scopes trailing-separator, dot-component, and dot-dot-component
   rejection to `AI_PEER_REVIEW_ENDPOINT_ROOT` alone, listing only "empty or
   relative `XDG_CACHE_HOME`" and "missing, empty, or nonabsolute
   `%LOCALAPPDATA%`". The verification bullet at lines 581–583 says "configured
   roots with a trailing separator or dot component are rejected" without saying
   whether "configured" means the `configured` endpoint-root source or also the
   `xdg-configured` cache-root source, so it does not resolve the conflict.

   The "ratifies shipped behavior" claim is not accurate for the canonicality
   clause. `src/broker/paths.mjs:15-25` implements `absolute()` as a type,
   nonempty, and `isAbsolute()` check only; `XDG_CACHE_HOME=/home/u/.cache/` and
   `XDG_CACHE_HOME=/home/u/./.cache` are both accepted today. Shipped code only
   escapes visible harm because `path.posix.join` normalizes when deriving
   `directory` (`src/broker/paths.mjs:78`); the raw value is never returned. This
   correction changes that by returning `cacheRoot` and `endpointRoot` as public
   values and by making them comparison and arithmetic operands.

   Three concrete consequences follow if an implementer reads the table and
   failure list as normative and accepts a noncanonical `XDG_CACHE_HOME`:
   - Root equality is "byte-exact UTF-8 comparison of that canonical form" (lines
     131–134), so a participant with `XDG_CACHE_HOME=/home/u/.cache/` and one with
     `/home/u/.cache` derive byte-different `endpointRoot` values for the same
     directory. Under `endpointRootSource: cache-root` with a live lock, the
     client-side rule at lines 405–415 fires `APR_BROKER_ENDPOINT_ROOT_MISMATCH`
     between two correctly configured participants, and its single recovery
     action — set the variable to the recorded root — is the only way out of a
     failure that should never have occurred.
   - The byte budget assumes exact concatenation: "The endpoint is always the
     endpoint root plus the 61-byte `/aipr/v1/<token>` suffix" (lines 228–230). A
     trailing separator makes the effective suffix 62 bytes, so the stated 42-byte
     Darwin and 46-byte Linux maxima and the exact-limit tests at lines 558–560
     are wrong by one byte for that input.
   - A `..` component is security-relevant, not cosmetic. The path layer "never
     resolves symlinks" (line 131), so textually collapsing `..` — which
     `path.posix.join` does today — can silently retarget the authority root
     across a symlink before `openPrivateRoot` ever sees it. The correction
     already forbids this for `AI_PEER_REVIEW_ENDPOINT_ROOT` but leaves the
     authority root, which holds the lock, weaker than the routing root.

2. **The correction makes `broker.json` a fail-closed gate for clients but never
   constrains when the owner publishes it relative to bind, and it does not
   define precedence against its own stale-metadata rule.** Lines 405–415 require
   that "Whenever the lock is live and metadata is readable, the client compares
   its derived endpoint root with the recorded root", producing
   `APR_BROKER_ENDPOINT_ROOT_MISMATCH` "before any endpoint-root traversal or
   connection attempt" (lines 505–511). That is a new hard dependency on metadata
   currency that this correction introduces. Yet the Data flow at lines 476–485
   omits the metadata write entirely — "acquires the full-digest lock, binds the
   compact endpoint, and authenticates the full tuple over live IPC" — and the
   metadata section at lines 348–359 specifies only contents, never ordering. The
   accepted epic design does not supply the missing constraint either; its only
   `broker.json` statements are at lines 251, 264, and 319, none of which is an
   ordering rule.

   Failure scenario: an owner legitimately changes endpoint roots, acquires the
   lock, reconciles the superseded socket per lines 340–347, and binds at its new
   root. Until it rewrites `broker.json`, the lock is live, metadata is readable,
   and metadata records the superseded root. A client that is configured exactly
   correctly reads that window, compares roots, and fails with
   `APR_BROKER_ENDPOINT_ROOT_MISMATCH` whose one action is to set
   `AI_PEER_REVIEW_ENDPOINT_ROOT` to the superseded root — actively wrong advice
   that moves a correct participant to a stale configuration.

   The same observation is also claimed by a second rule: lines 429–431 say
   "Absent, unreadable, or stale metadata under a live lock fails with the
   existing broker-integrity error and never probes another endpoint." Metadata
   that is both stale and root-divergent satisfies the antecedent of both rules,
   and the artifact does not say which wins or how a client establishes that
   readable metadata is current for the live lock instance.

3. **`endpoint_layout_version` is recorded in metadata but no reader behavior is
   defined for an unrecognized value.** Line 352 requires metadata schema v1 to
   record "the path layer's `endpoint_layout_version`", line 626 asserts
   `endpoint_layout_version: 1` in tests, and lines 357–359 note that the metadata
   schema version and the layout version "do not move in lockstep". Lines 468–472
   then defer cross-layout behavior wholesale: "Shipping `v2` requires the
   explicit cross-endpoint discovery and drain design described here."

   The gap is that v1 is the predecessor that a future v2 drain design must
   negotiate with, and v1's behavior is being fixed now. As written, a v1 client
   facing a v2 owner's metadata sees a matching `endpoint_root`, passes the
   mismatch gate, derives a v1 token, finds no socket, and falls into the
   `APR_BROKER_START_FAILED` branch at lines 512–515 whose action is "enter owner
   acquisition" — against a live lock the v2 owner holds. The outcome is still
   fail-closed, but the diagnosis and the single recovery action are both wrong,
   and the recorded field that exists precisely to prevent this is never read.
   Recording a version without defining the reaction to an unknown value forfeits
   most of its forward-compatibility value.

4. **POSIX return-shape verification is weaker than the Windows verification for
   the two new scalar fields.** Lines 585–588 assert Windows output "key-for-key,
   including an empty deeply frozen `endpointDirectories` array, `endpointRoot:
   null`, `endpointRootSource: named-pipe`". The POSIX bullets at lines 573–584
   assert `endpointDirectories` composition, ordering, freezing, and prefix
   relationship; every input-table row, invalid-value outcome, source enum, and
   creation policy; `cacheRoot`; `authorityDirectories`; and byte-stable
   `directory`/`lock`/`metadata`. Nothing asserts the returned
   `maxEndpointRootBytes` or `endpointLayoutVersion` on POSIX. These are new
   public contract values with a normative definition — "the injected endpoint
   limit minus the 61-byte `/aipr/v1/<token>` suffix" and "`endpointLayoutVersion`
   is `1`" at lines 121–126 — and the artifact states "The path layer is the sole
   source for both values." The Darwin 42 / Linux 46 numbers appear in tests only
   as accept/refuse endpoint behavior at lines 558–560, which an implementation
   can satisfy while returning a wrong or absent `maxEndpointRootBytes`. Since
   `APR_BROKER_ENDPOINT_TOO_LONG` recovery text is required to quote those maxima
   (lines 502–503), a wrong value ships directly into user-facing recovery advice.

## Required changes

1. Resolve F1 by making the canonicality contract single-sourced and explicit for
   every root input. Concretely: state in the input table rows at lines 140–146
   and in the Failure-behavior bullet at lines 489–494 that a trailing separator,
   a `.` component, or a `..` component in `XDG_CACHE_HOME`, `%LOCALAPPDATA%`, or
   `AI_PEER_REVIEW_ENDPOINT_ROOT` fails with `APR_BROKER_PATH_INVALID` naming that
   exact variable, on the same footing as empty and relative values. Correct the
   "ratifies shipped behavior" wording in rows 141 and 143 to say that the
   canonicality requirement extends shipped behavior, since
   `src/broker/paths.mjs:15-25` does not implement it today. Restate the
   verification bullet at lines 581–583 so it names each variable rather than the
   ambiguous phrase "configured roots", and add a case asserting that `..` is
   rejected rather than textually collapsed.

2. Resolve F2 by adding an explicit publication-ordering constraint for
   `broker.json` and a precedence rule for the two client-side metadata rules.
   The ordering constraint belongs in the Security and ownership section near
   lines 348–356 and in the Data flow list at lines 476–485, which currently omits
   the metadata write: state that an owner publishes metadata recording the
   endpoint root it will bind before that endpoint can become connectable, and
   state what a client is guaranteed to observe in the interval. The precedence
   rule belongs with lines 405–415 and 429–431: say whether a readable-but-stale
   record under a live lock yields `APR_BROKER_ENDPOINT_ROOT_MISMATCH` or the
   broker-integrity error, and how currency is established for the live lock
   instance. Add a verification bullet covering the crossover window so the
   ordering is tested rather than assumed.

3. Resolve F3 by defining the v1 reaction to an unrecognized
   `endpoint_layout_version` in readable metadata under a live lock. One sentence
   in the Compatibility and migration section near lines 468–472, one entry in the
   Failure behavior list, and one verification bullet are sufficient. The behavior
   must fail closed with an accurate diagnosis and a single correct action, and
   must not route to `APR_BROKER_START_FAILED`'s owner-acquisition advice against
   a lock a newer-layout owner holds. Whether this reuses an existing stable error
   or adds one is the author's call; if it adds one, the "six explicitly
   enumerated new stable errors" count at lines 19–24 and 592 must be updated to
   match.

4. Resolve F4 by adding a POSIX verification bullet asserting the returned
   `maxEndpointRootBytes` — exactly 42 on the injected Darwin limit and 46 on the
   injected Linux limit — and `endpointLayoutVersion: 1`, alongside the existing
   `endpointDirectories` assertions near lines 573–580.

## Optional suggestions

1. Consider a distinct error code, or at minimum a required disambiguating
   prefix in the message, for endpoint-root anchor failures. Lines 292–294 route
   "any unsafe authority or endpoint root" to
   `APR_BROKER_CACHE_ROOT_UNAVAILABLE`, and lines 599–601 test that an unsafe
   configured endpoint root produces that code. The role and source variable are
   required in the context, so this is not ambiguous to a careful reader, but a
   user whose `AI_PEER_REVIEW_ENDPOINT_ROOT` is group-writable is told the *cache
   root* is unavailable while the cache root is in fact fine. Given that this
   correction's whole purpose is separating the two anchors, the error surface
   still merges them.

2. Consider stating explicitly that the endpoint's default residence in a
   platform cache directory — unchanged from the accepted epic, but now the
   shared `aipr/v1` parent for every project of that user — may be subject to
   OS-level or third-party cache eviction, and that the consequence is the
   already-specified `APR_BROKER_ENDPOINT_PARENT_LOST` whole-user fence at lines
   530–538. The mechanism is fully handled; naming eviction as a realistic trigger
   would tell an operator that a cache cleaner can fence every project broker at
   once, which is the practical cost of the shared-parent goal accepted at lines
   55–56.

3. Consider noting in the Length boundary section that a canonical POSIX root of
   `/` is unrepresentable under the no-trailing-separator rule at lines 128–131.
   The practical outcome is correct — `/` would fail the user-ownership check in
   `openPrivateRoot` anyway — but an implementer writing the canonicality
   validator will hit the case and should not have to infer that rejecting it is
   intended.

## Decision

revisions-requested
