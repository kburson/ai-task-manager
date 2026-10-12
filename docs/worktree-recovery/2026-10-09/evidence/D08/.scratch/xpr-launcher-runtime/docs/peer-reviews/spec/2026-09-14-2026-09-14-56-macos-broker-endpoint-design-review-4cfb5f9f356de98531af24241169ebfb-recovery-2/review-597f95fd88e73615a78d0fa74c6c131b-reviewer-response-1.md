<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-597f95fd88e73615a78d0fa74c6c131b"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "86f4501700c2ebfe307599cf1fb6c010c9ccbf18"
artifact_blob: "8a50527a88e5b537d3b0143cb737d93e2e2fda91"
artifact_digest: "sha256:2feefba2ab210df7efd117ddce2a65e5ac787c0861348bd46deeb2ea8a87664d"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:3af6348d582a1a2ce812bbdd883270a4253144107a4aaad9bc93f91f0710d6b6"
  identity_source: "runtime"
started_at: "2026-09-14T16:56:46.135Z"
submitted_at: "2026-09-14T17:00:56.867Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed `docs/design/2026-09-14-56-macos-broker-endpoint-design.md` at commit
`86f4501` independently, against the shipped `src/broker/paths.mjs`, the accepted
epic design `docs/design/2026-09-14-project-local-spr-xpr-broker-design.md`, and
the accepted plan `docs/plans/2026-09-14-project-local-spr-xpr-broker.md`. I
recomputed every load-bearing number and re-derived every encoding claim rather
than accepting the document's assertions.

Everything quantitative in this revision is correct:

- Accepted layout under the real home:
  `/Users/kpburson/Library/Caches` (30) + `/ai-peer-review` (15) + `/brokers` (8)
  + `/` + 64 hex (65) + `/broker.sock` (12) = **130** UTF-8 bytes. With a `/x`
  home: 2 + 15 + 8 + 65 + 12 = **117**. Since the shortest possible absolute home
  is 2 bytes, the claim that preflight rejects *every* conforming macOS home is
  sound, not merely typical.
- `sockaddr_un.sun_path[104]` leaves **103** usable NUL-terminated bytes, and
  `verifyEndpointLength` (`src/broker/paths.mjs:56`) already measures POSIX with
  `Buffer.byteLength(endpoint, 'utf8')` and Windows in string units, so the
  Length boundary section matches shipped behavior.
- Corrected layout: 30 + `/aipr` (5) + `/v1` (3) + `/` (1) + 52 = **91** bytes.
  A 27-byte home: 27 + 15 + 5 + 3 + 1 + 52 = **103** exactly; 28 bytes = 104 and
  is refused. Both boundary figures are exact.
- 256 bits / 5 = 51.2, so unpadded base32 is exactly **52** symbols for every
  32-byte digest, with a one-bit remainder in the high bit of the final group.
  I re-derived all three required vectors: all-zero → 52 `a`; all-`ff` → the
  first 51 groups are five set bits (index 31 → `7`) and the 52nd is `1` followed
  by four zero pad bits (index 16 → `q`), i.e. 51 `7` then `q`; and the final
  symbol is therefore `a` or `q` and nothing else. Encoding steps 1–5 state this
  correctly and losslessly.
- The base64url rejection is sound: a mixed-case alphabet is not injective under
  case folding, which would silently collapse routing space on the
  case-insensitive filesystems macOS commonly uses.

I verified the three superseded plan citations resolve to the right text:
`:172` is the Task 3 `brokerPaths(...) -> { directory, endpoint, lock, metadata }`
interface, `:192` is the `ai-peer-review/brokers/<digest>/` layout instruction,
and `:199` is the Task 4 `platformSecurity()` interface listing `listenPrivate`.

The selected approach, the encoding, and the numbers are right, and I am not
asking for any of them to be revisited. My findings are all in one place: the
correction introduces a rigorous, explicitly-enumerated protection contract for
the *routing* path chain, and that new rigor makes visible that the adjacent
*authority* path chain — the full-digest lock and metadata directory this
document names as the authority — still has none, and that neither chain says
where its trust anchor begins. Findings 1–3 are that gap and its consequences;
Findings 4–5 are two verification-contract defects, one of which was introduced
by the otherwise-correct implementation of a prior optional suggestion.

Decision: revisions-requested.

## Findings

1. **The endpoint parents now have a full protection contract; the lock and
   metadata parents, which this design names as the authority, still have
   none.** The document is explicit that the token is "routing information, not
   trust evidence" and that the full-digest directory "remains lock and metadata
   authority." It then specifies, for the routing chain only: an ordered frozen
   `endpointDirectories` array, owner/mode/type/no-symlink validation at *every*
   level, per-level `EEXIST` race post-conditions, a named
   `APR_BROKER_ENDPOINT_PARENT_UNSAFE` failure, a named
   `APR_BROKER_ENDPOINT_PARENT_LOST` failure, and a prohibition on `dirname`
   reconstruction. For the authority chain it says only
   `openPrivateDirectory(paths.directory)` — the leaf. Nothing in this document,
   and nothing in the accepted epic design, states any contract for
   `<user-cache>/ai-peer-review` or `<user-cache>/ai-peer-review/brokers`. The
   epic design's only nearby sentence is "Use user-only directory access and
   refuse symlinked or foreign-owned endpoint and lock resources"
   (`docs/design/2026-09-14-project-local-spr-xpr-broker-design.md:279`), which
   names resources, not their parent chains.

   These two chains are siblings under the same `<user-cache>` and are exposed to
   exactly the same threat. Concretely: if `<user-cache>/ai-peer-review/brokers`
   is a symlink, or is foreign-owned, or is group- or world-writable, then
   `broker.lock` and `broker.json` can be redirected or replaced wholesale — and
   the design has just finished assigning `broker.lock` two load-bearing jobs
   that nothing else can do. It is the sole gate on unlinking a stale socket
   ("Without the lock, stale-looking socket state is never removed"), and it is
   the deliberately unversioned cross-layout-version mutual-exclusion point that
   the `v2` migration story in Compatibility and migration depends on. An
   attacker who controls the lock path controls both. The asymmetry is backwards:
   the chain with the weaker stated contract is the one carrying the trust.

2. **No level of either chain is identified as the trust anchor, and an absent or
   unsafe `<user-cache>` has undefined behavior and no error code.**
   `endpointDirectories` is defined as starting at `<user-cache>/aipr`, so
   `<user-cache>` itself — `~/Library/Caches` on macOS, caller-controlled
   absolute `XDG_CACHE_HOME` or `~/.cache` on Linux (`src/broker/paths.mjs:27-36`)
   — is validated by nobody. The design never says whether that is deliberate
   (the cache root is the assumed trust anchor, inherited from the OS or the
   user's environment) or an oversight. On Linux this is not hypothetical:
   `XDG_CACHE_HOME` is environment-supplied and may legitimately point at a path
   the package has never seen.

   Two consequences follow. First, the "validate every level" argument that
   carries the whole security case for the separated socket parent has an
   unstated floor; a reader auditing it cannot tell where validation is supposed
   to stop or why stopping there is safe. Second, the failure taxonomy has a
   hole: if `<user-cache>` does not exist, `mkdir` of `aipr` fails with `ENOENT`,
   and Failure behavior maps no code to that. `APR_BROKER_ENDPOINT_PARENT_UNSAFE`
   is scoped to a path that is "foreign-owned, non-directory, permissive, or
   symlinked" — an absent cache root is none of those. The same question applies
   to the authority chain: `openPrivateDirectory(paths.directory)` is described
   as validating and retaining the full-digest directory, never as creating it or
   its parents, so first-run creation of `<user-cache>/ai-peer-review/brokers/`
   is unassigned as well.

3. **The two-level endpoint parent is validated level by level, but the design
   never pins how each level is reached, so the validated chain can be swapped
   between levels and after bind.** The design correctly establishes that
   `bind(2)` has no `*at` form on Darwin or Linux and that assurance therefore
   "comes from the retained identity handles and post-condition checks for every
   `endpointDirectories` entry." That is the right conclusion, but it is stated
   as an outcome rather than a mechanism, and the operative sentence — that
   `listenPrivate` "creates each absent directory **directly** as owner-only
   (`0700`)" — reads naturally as creation by absolute pathname. Absolute-path
   creation defeats the retained handles: validating `aipr`, then calling
   `mkdir("<user-cache>/aipr/v1")` by absolute path, re-walks `aipr` by name and
   can traverse a different directory than the one that was just validated and is
   still being held.

   The same problem recurs at the last step, where it cannot be designed away.
   Because `bind()` must take the absolute pathname, there is an irreducible
   window between the final validation of `aipr/v1` and the socket appearing, and
   post-condition checks after the fact can only *detect* a swap — which is
   sufficient, but only if the design says what is compared and that the
   comparison is fail-closed. Right now "Owner verification detects replacement or
   unlink of either the lock evidence or endpoint" does not say the bound socket's
   identity is compared against the entry of that name as seen *through the
   retained `aipr/v1` handle*, which is the one check that actually closes the
   window. Without both statements, a conforming implementation can satisfy every
   sentence in this document and still bind into an attacker-substituted
   directory.

4. **Verification pins `endpointDirectories` key-for-key on Windows and not at
   all on POSIX, where the contract is load-bearing.** The Verification list
   requires that "Windows output is asserted key-for-key, including an empty
   deeply frozen `endpointDirectories` array." For POSIX — the platform where the
   array has two entries, a required order, a required frozen-ness, and an
   explicit prohibition on reconstructing it with `dirname(endpoint)` — there is
   no corresponding item. The POSIX items cover the endpoint (distinct digests
   derive distinct endpoints; version inputs do not affect routing) and the
   unchanged `directory`/`lock`/`metadata` paths, but nothing asserts that
   `endpointDirectories` equals exactly
   `[<user-cache>/aipr, <user-cache>/aipr/v1]`, in that order, deeply frozen,
   with each entry a prefix of `endpoint`.

   This is the one field whose contract is stated purely in prose and consumed by
   another task. `brokerPaths` already returns a frozen object
   (`src/broker/paths.mjs:84`), so shallow-vs-deep freezing is observable, and
   order is the difference between creating `aipr` before `aipr/v1` and
   attempting the reverse. A regression that reverses the order, returns a
   shallow-frozen array, or drops the intermediate level would pass every listed
   POSIX assertion.

5. **The Linux boundary requirement states a platform fact that is not true.**
   Verification requires that "absolute Linux `XDG_CACHE_HOME` values pin the
   same exact 103-byte acceptance and 104-byte refusal boundary." 103 is a
   property of Darwin's `sun_path[104]`. Linux's `sockaddr_un.sun_path` is 108
   bytes, giving 107 usable, and the design's own architecture makes the limit an
   injected per-platform value (`platform.maxEndpointLength`,
   `src/broker/paths.mjs:47`) precisely so that it is not hardcoded. As a unit
   test over a platform double the requirement is harmless — the double injects
   whatever limit the test chooses — but as written it asserts that Linux shares
   the macOS boundary, which is wrong and which a Task 4 implementer wiring up
   the real Linux `platformSecurity()` could reasonably read as a specification
   of the production limit.

   This is a regression introduced by an otherwise-correct response to the prior
   round's request for Linux vectors: the vectors are the right thing to add, and
   only the "same exact" framing is wrong. Relatedly, the Length boundary section
   works entirely in macOS terms and never states where the Linux limit comes
   from or that it differs, which is what left room for the ambiguity.

## Required changes

1. State a protection contract for the full-digest authority chain equal in
   strength to the one this design gives the endpoint chain (Finding 1). Say
   explicitly that `<user-cache>/ai-peer-review` and
   `<user-cache>/ai-peer-review/brokers` are validated at every level for owner,
   mode, type, and no-symlink before `broker.lock` or `broker.json` is opened;
   that a pre-existing unsafe level there fails closed with a named error and
   non-destructive recovery; and that mid-lifetime replacement or loss of a level
   there fences the affected brokers. If the intent is that
   `openPrivateDirectory(paths.directory)` already implies this for its parents,
   say so in this document rather than leaving it to inference — this correction
   is the document that elevates the full-digest directory to "lock and metadata
   authority," so it is the right place to state what protects it.

2. Name the trust anchor and close the taxonomy hole (Finding 2). State which
   path is the assumed root of trust — I expect `<user-cache>` — and why
   validation legitimately stops below it, including for the caller-supplied
   Linux `XDG_CACHE_HOME` case. Then assign a failure mode for an absent or
   unusable `<user-cache>`, distinct from `APR_BROKER_ENDPOINT_PARENT_UNSAFE`
   (which is scoped to paths that exist and are unsafe), and say which component
   is responsible for first-run creation of each level of *both* chains.

3. Pin the mechanism, not just the outcome, for reaching each validated level
   (Finding 3). Require that after the first level, each subsequent
   `endpointDirectories` level is created and opened *relative to the retained
   handle for its parent* with no-follow semantics — not by absolute pathname —
   so the validated chain cannot be re-walked by name; and replace "creates each
   absent directory directly" with wording that cannot be read as absolute-path
   creation. Separately, state the post-bind check explicitly: after `bind()`
   returns, the bound socket's identity is compared against the entry of that
   name as observed through the retained `aipr/v1` handle, and any mismatch fails
   closed without unlinking anything. Keep the existing, correct statements that
   the bind uses the absolute pathname measured by preflight and that `chdir` and
   relative binds are forbidden.

4. Add the POSIX counterpart to the existing Windows key-for-key requirement
   (Finding 4): a Verification item asserting that on macOS and Linux
   `endpointDirectories` is exactly
   `[<user-cache>/aipr, <user-cache>/aipr/v1]`, in that order, deeply frozen, and
   that each entry is a byte prefix of `endpoint`.

5. Correct the Linux boundary requirement (Finding 5). Drop "the same exact" and
   state that 103 is Darwin's limit, that Linux `sun_path` is 108 bytes (107
   usable), and that the required Linux test pins an exact accept/refuse pair
   *against its injected limit*, exercising the same off-by-one boundary without
   asserting that the two platforms share a number. Adding one sentence to Length
   boundary recording the Linux limit and its source would prevent the same
   confusion reaching Task 4.

## Optional suggestions

1. Say one sentence about what `<user-cache>/aipr/v1` looks like after a year.
   Every project a user has ever brokered leaves a 52-character socket entry
   there, nothing removes the directory, and the design correctly forbids a
   per-project broker from cleaning it. That is the right default, but a reader
   will ask whether unbounded accumulation of stale socket entries is accepted
   deliberately or deferred; stating "accepted; a separate operator-initiated
   cleanup is out of scope for #56" would settle it. The 0700 mode means this is
   a tidiness question, not a disclosure one.

2. Consider noting the `aipr` name-collision risk in one line of Non-goals or
   Compatibility. `aipr` is a short, unregistered, un-namespaced name in a shared
   per-user cache root, and the design's correct refusal to adopt, repair, or
   relocate a foreign `aipr` means an unrelated tool that claims it first leaves
   the broker permanently unavailable with manual-only recovery. The byte budget
   genuinely does not permit a longer name at a 27-byte home, so I am not asking
   for a rename — only for the residual risk to be recorded as accepted rather
   than unconsidered.

3. Anchor the superseded plan lines to their headings as well as their numbers.
   The Supersedes note cites `docs/plans/2026-09-14-project-local-spr-xpr-broker.md`
   lines 172, 192, and 199; I confirmed all three resolve correctly today, but
   line numbers in a checklist plan drift as soon as any task above them is
   edited. Naming them as "Task 3 **Interfaces**", "the Task 3 layout bullet",
   and "Task 4 **Interfaces**" alongside the numbers makes the reference
   self-healing.

4. Consider stating that the `v1` endpoint-layout version and the `broker.json`
   metadata schema version are independent. The design says `broker.json`
   "remains discovery-only", that version 1 does not record the token, and that
   adding it later "would require an explicit metadata-schema change" — while
   `v1` in the pathname "versions the pathname encoding/layout, not the broker
   protocol or project identity." Two different `v1`/"version 1" references sit
   three paragraphs apart, and a reader can easily fuse them into a single
   version counter that would have to move in lockstep. One clause disclaiming
   that would help.

## Decision

revisions-requested
