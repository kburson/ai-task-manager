<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7ac84e67eb2cc40db4f3229984135e27"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "19652556bd2d660672e42f732efc52706a8f7b16"
artifact_blob: "b2d4edfdc2f1ad40c4f8459588af3462d84faa2e"
artifact_digest: "sha256:dbab9eb52d4c97e982576564a134d50daf9a44d190af27cbfbb295c7298124dc"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:3abf03850b6f9e3627cbf433da2b011bd9ce300d21af853dcde6a28af7bc823a"
  identity_source: "runtime"
started_at: "2026-09-14T16:46:31.206Z"
submitted_at: "2026-09-14T16:51:00.091Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed `docs/design/2026-09-14-56-macos-broker-endpoint-design.md` at
`1965255` independently against the shipped `src/broker/paths.mjs`, the accepted
epic design `docs/design/2026-09-14-project-local-spr-xpr-broker-design.md`, the
accepted plan `docs/plans/2026-09-14-project-local-spr-xpr-broker.md`, and the
existing `test/unit/broker-identity.test.mjs`. I recomputed every load-bearing
number rather than accepting it.

Arithmetic confirmed by direct calculation:

- Accepted layout
  `/Users/kpburson/Library/Caches/ai-peer-review/brokers/<64-hex>/broker.sock`
  = 30 + 15 + 8 + 65 + 12 = **130** UTF-8 bytes. With a `/x` home:
  2 + 15 + 8 + 65 + 12 = **117**. Both Problem-section figures are exact, and the
  minimum possible 2-byte home still exceeds 103, so the claim that preflight
  rejects *every* conforming macOS home is correct.
- `sockaddr_un.sun_path[104]` on the active Darwin SDK leaves **103** usable
  NUL-terminated bytes. `verifyEndpointLength` in `src/broker/paths.mjs:56`
  already measures POSIX endpoints with `Buffer.byteLength(endpoint, 'utf8')`
  and Windows with string units, so the Length boundary section matches shipped
  behavior.
- 256 bits / 5 = 51.2, so unpadded base32 is exactly **52** characters for every
  32-byte digest, with a one-bit remainder in the high bit of the final group and
  zeros in its low four bits. Encoding step 4 states this correctly.
- `/Users/kpburson/Library/Caches/aipr/v1/<52>` = 30 + 5 + 3 + 1 + 52 = **91**
  bytes. A 27-byte home = 27 + 15 + 5 + 3 + 1 + 52 = **103** exactly; 28 bytes
  = 104 and is refused. All three figures in Length boundary are correct, and
  they were correctly recomputed after the `apr` → `aipr` rename (the 3-character
  namespace produced 90 bytes and a 28-byte boundary).
- The base64url rejection is sound: a mixed-case alphabet is not injective under
  case folding, which would silently collapse routing space on the
  case-insensitive filesystems macOS commonly uses.

The selected approach is correct and I am not asking for it to be revisited. The
prior turn's six required changes are all visibly discharged in this revision:
`endpointDirectory` is now an explicit contract field, the shared parent's
per-user nature and `EEXIST` race outcome are stated, stale reclamation is bound
to the full-digest lock, `APR_BROKER_ENDPOINT_PARENT_UNSAFE` exists with
non-destructive recovery, the unversioned lock directory is documented as the
deliberate cross-layout mutual-exclusion point, and the 27/28-byte boundary is a
required vector.

My findings are on what the newly separated, newly *shared* endpoint parent
implies for contracts the design hands to other layers and other documents. Four
of the five are places where the design states a rule for one case and leaves the
adjacent case undefined; the fifth is an accepted-plan inconsistency that this
correction creates and does not record.

Decision: revisions-requested. No finding affects the encoding, the numbers, or
the choice of layout.

## Findings

1. **`endpointDirectory` is undefined on Windows, and so is the `listenPrivate`
   contract there.** The Corrected path contract presents one uniform return
   shape `{ directory, endpointDirectory, endpoint, lock, metadata }`, then
   defines `endpointDirectory` only for the POSIX case: "`endpointDirectory` is
   exactly `<user-cache>/aipr/v1`." On Windows the endpoint is
   `\\.\pipe\ai-peer-review-brokers-<64-hex>-broker.sock`, which has no
   filesystem parent at all. The design does not say whether Windows returns
   `null`, omits the key, or returns the full-digest `directory`, and it does not
   say what `listenPrivate(paths.endpointDirectory, paths.endpoint, { lock })`
   means when the first argument has no meaningful value. This matters
   concretely: `brokerPaths` returns a frozen object
   (`src/broker/paths.mjs:84`), so the difference between "key absent" and "key
   present and `null`" is observable to every consumer and to the packaging and
   unit tests, and Task 4 must branch on it. The design's own instruction that
   "the security layer must not reconstruct it with `dirname(endpoint)`" is
   unenforceable on POSIX, where `dirname(endpoint)` is byte-identical to
   `endpointDirectory`; the rule only earns its place once the Windows case makes
   `dirname` actually wrong. Stating that case is what makes the rule testable.

2. **The endpoint parent is two directory levels, but the contract names one.**
   `endpointDirectory` is `<user-cache>/aipr/v1`, so a first run must create both
   `<user-cache>/aipr` and `<user-cache>/aipr/v1`. The Security section states
   the validation rule for both levels — "A pre-existing foreign-owned,
   non-directory, permissive, or symlinked `aipr` or `aipr/v1` path fails with
   `APR_BROKER_ENDPOINT_PARENT_UNSAFE`" — and the non-removal rule for both
   levels, but states the *creation* rule for only one: `listenPrivate` "creates
   or validates the compact endpoint parent as owner-only (`0700` on POSIX)",
   singular, receiving a single path. The `EEXIST` race paragraph is likewise
   written for one directory ("the shared parent", "the winner's directory").
   With two levels and concurrent first-run brokers, the interleavings are not
   symmetric: one process can win `aipr` and lose `aipr/v1`, or observe `aipr`
   created by a racer that has not yet finished setting its mode. An
   implementation reading this literally could create the intermediate `aipr`
   with the process umask rather than `0700`, or could treat a partial race as an
   integrity failure. The rule the design clearly intends — every created level
   is created owner-only, and at every level a lost creation race is success only
   after the full owner, mode, type, and no-symlink post-conditions pass — needs
   to be stated per level.

3. **Mid-lifetime loss of the shared parent has stated blast radius but no error
   code and no recovery.** The design says replacement or unlink of the shared
   endpoint parent "fences every broker that observes it; each preserves its own
   lock/metadata evidence and refuses further delivery." That is the right
   behavior and it is a genuine change in kind: under the accepted layout the
   socket lived inside the per-project full-digest directory, so this failure was
   scoped to one project; it is now a single path whose loss simultaneously
   fences every broker the user is running. Yet Failure behavior assigns
   `APR_BROKER_ENDPOINT_PARENT_UNSAFE` only to the *pre-existing* unsafe path
   case, with recovery text written for an operator inspecting a path before
   startup. The mid-lifetime case falls into the catch-all "the existing Task 4
   integrity and authentication errors", which are phrased around live peer and
   lock integrity, not around a shared directory disappearing underneath N
   healthy brokers. The operator whose cache cleaner just removed
   `~/Library/Caches/aipr` gets N simultaneous integrity errors with no
   indication they share one cause or one fix. Given that this is now the highest
   blast-radius failure the design introduces, it deserves its own named outcome
   and its own recovery text.

4. **The correction changes an accepted plan contract without recording it.** The
   Supersedes note scopes this document to "Only the Unix socket pathname layout
   in `docs/design/2026-09-14-project-local-spr-xpr-broker-design.md`". But the
   accepted implementation plan also records the affected contracts, and this
   correction invalidates three specific lines:
   - `docs/plans/2026-09-14-project-local-spr-xpr-broker.md:172` pins the Task 3
     interface as `brokerPaths({ identity, platform, env, home }) -> { directory,
     endpoint, lock, metadata }` — the exact shape this design extends.
   - `:192` instructs Task 3 to derive "`ai-peer-review/brokers/<digest>/`" as
     the endpoint location, which is precisely what is being corrected.
   - `:199` lists `listenPrivate` among the `platformSecurity()` exports without
     the endpoint-parent argument or the `{ lock }` option this design now
     threads through it.

   This repository works from exact-path task commits against that plan, so a
   stale accepted plan is not a documentation nit — it is the instruction an
   implementer follows. The Acceptance section says the correction is accepted
   only after review of "this design and its implementation plan", which implies
   the plan moves, but the design never says which lines or that the plan is in
   scope at all.

5. **Whether the endpoint is bound by absolute pathname is left open, and the
   preflight's correctness depends on it.** The entire correction rests on
   preflight measuring the same bytes the kernel will see, and the design pins
   that to `Buffer.byteLength(endpoint, 'utf8')` over the absolute endpoint. But
   the accepted plan requires Task 4 to use "directory-relative no-follow file
   operations" (`docs/plans/2026-09-14-project-local-spr-xpr-broker.md:212`),
   and this design reinforces the no-symlink requirement for the endpoint parent.
   Those two disciplines cannot both be satisfied the usual way: `bind(2)` has no
   `*at` variant on either Darwin or Linux, so a Unix socket cannot be bound
   relative to a retained directory descriptor, and the absolute pathname is what
   is measured against `sun_path`. The design should say so, and should say that
   the no-symlink and ownership assurance for `aipr/v1` therefore comes from the
   retained endpoint-parent identity handle and its post-condition checks — which
   it already requires — rather than from a relative bind. Without that sentence,
   an implementer reconciling the two documents may reach for `chdir`-based
   shortening to satisfy both, which would change the bytes the kernel sees and
   silently invalidate the 103-byte boundary this correction exists to establish.

## Required changes

1. Define `endpointDirectory` for Windows in the Corrected path contract:
   its exact value or explicit absence, and the corresponding
   `listenPrivate` contract when there is no filesystem parent. State the
   `dirname(endpoint)` prohibition's rationale in terms of that case, so the rule
   is testable rather than tautological on POSIX. Add the matching Verification
   item: Windows `brokerPaths` output is asserted key-for-key, alongside the
   existing "Windows directory and named-pipe results are unchanged." Resolves
   Finding 1.

2. State the endpoint-parent creation contract per level in Security and
   ownership (Finding 2): both `<user-cache>/aipr` and `<user-cache>/aipr/v1` are
   created owner-only (`0700` on POSIX) when absent; at each level a lost
   creation race with `EEXIST` is success only after that level passes the
   complete owner, mode, type, and no-symlink post-condition checks; and identify
   which levels `listenPrivate` is responsible for creating given that it
   receives only the leaf path.

3. Add a distinct failure mode and recovery for mid-lifetime replacement or
   unlink of the shared endpoint parent (Finding 3), separate from the
   pre-existing-unsafe-path case, in Failure behavior. The recovery text must
   account for the multi-broker blast radius — that every broker for that user is
   fenced by one event, that each retains its own lock and metadata evidence, and
   what the operator does to return to service — while keeping the existing
   prohibition on automatic removal, ownership takeover, and endpoint override.

4. Bring the accepted implementation plan into scope explicitly (Finding 4).
   Either extend the Supersedes note to name
   `docs/plans/2026-09-14-project-local-spr-xpr-broker.md` lines 172, 192, and
   199, or add a section listing the exact plan amendments this correction
   requires. An implementer must not be able to follow the accepted plan and
   build the superseded contract.

5. State that the Unix endpoint is bound by its absolute pathname — the same
   bytes preflight measures — and that no-symlink and ownership assurance for the
   endpoint parent comes from the retained identity handle and post-condition
   checks rather than a directory-relative bind, since `bind(2)` has no `*at`
   form on the supported platforms (Finding 5). Note the interaction with the
   plan's directory-relative no-follow requirement so the two documents do not
   read as contradictory.

## Optional suggestions

1. Add a cheap total-function invariant to Verification: because the final base32
   symbol carries exactly one data bit followed by four zero pad bits, every
   valid token's last character is `a` or `q` and nothing else. Asserting that
   over the existing vectors plus random digests catches bit-order, padding-
   direction, and off-by-one-group errors that the all-`ff` and leading-zero
   vectors alone can miss. For reference, an all-`ff` digest must encode to 51
   `7` characters followed by `q`, and an all-zero digest to 52 `a` characters.

2. Extend the boundary vectors to Linux. The required tests pin the macOS 27/28-
   byte home boundary, but the Linux cache root can come from an absolute
   `XDG_CACHE_HOME` (`src/broker/paths.mjs:32`), which is caller-controlled and
   arbitrarily long, and is the one input that can produce an overlong endpoint
   on a machine whose home path is short. A matching exact-boundary pair there
   would close the same defect class on the other POSIX platform.

3. Add a regression vector pinning the unchanged paths. The correction's safety
   argument depends on `directory`, `lock`, and `metadata` staying at
   `<user-cache>/ai-peer-review/brokers/<64-hex>/`, because that is the
   cross-layout-version mutual-exclusion point. Verification currently lists only
   what changes. A test that pins the three unchanged paths makes the invariant
   explicit and guards the `v2` migration story the Compatibility section relies
   on.

4. Say one sentence about the connecting side. Security and ownership describes
   only the owner path (`openPrivateDirectory` / `listenPrivate`). A client now
   connects to a socket sitting in a directory shared with every other project's
   socket, so it is worth stating explicitly whether `connectBroker` applies the
   same endpoint-parent validation or relies solely on peer-credential
   verification plus the nonce-proof handshake. I believe the latter is
   sufficient and consistent with "the compact token is routing information, not
   trust evidence" — but a reader auditing the shared directory will ask, and the
   answer should not have to be inferred.

5. Tighten the RFC 4648 wording. The document calls the token "the canonical
   unpadded RFC 4648 base32 encoding" while mandating the lowercase alphabet;
   RFC 4648's base32 alphabet is uppercase, and its base32hex and base64
   variants are distinct. "RFC 4648 base32 with the lowercase alphabet
   `abcdefghijklmnopqrstuvwxyz234567` and no padding" says exactly the same thing
   without implying an uppercase canonical form that the design then contradicts.

6. Note the tension with the epic design's discoverability statement. That
   document says "An incompatible live broker remains discoverable at the same
   endpoint after a package upgrade"
   (`docs/design/2026-09-14-project-local-spr-xpr-broker-design.md:304`). That
   holds for every package upgrade within layout `v1`, which is all that exists
   today, but it stops holding the moment a `v2` layout ships. Compatibility and
   migration already handles the substance by deferring `v2` to an explicit
   discovery/drain design; a one-line forward reference from here would keep a
   future reader from treating the epic sentence as an unconditional invariant.

## Decision

revisions-requested
