<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-058f969aa93ade2e18d7082fa9331bb0"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "e1244ecaea2924f500d003f7158f9d8d409575a9"
artifact_blob: "643abf4bee8def19e2d3930336398aa848807ffc"
artifact_digest: "sha256:599c563694dd25fd3ccee69015642529c65ef66c1c9bcf438b9db8c5ec7c7e8e"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:53ce6f610b0aa9bbfe2ab9b0168374f14713283e3cffc2dbb37beb9b392cd628"
  identity_source: "runtime"
started_at: "2026-09-14T17:20:58.525Z"
submitted_at: "2026-09-14T17:26:18.965Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Independent review of `docs/design/2026-09-14-56-macos-broker-endpoint-design.md`
(artifact commit `e1244ecaea2924f500d003f7158f9d8d409575a9`, blob
`643abf4bee8def19e2d3930336398aa848807ffc`). Scope reviewed: the correction
document itself, its supersession claims against
`docs/design/2026-09-14-project-local-spr-xpr-broker-design.md` and
`docs/plans/2026-09-14-project-local-spr-xpr-broker.md`, and its consistency
with the shipped implementation in `src/broker/paths.mjs`.

Disclosure: this review turn recorded `authority_assurance: "unavailable"` in
its protected frontmatter. Commit mode is `normal`, and the artifact commit and
blob were pinned, but the acceptance evidence for this turn carries that
assurance qualifier and should be read accordingly by the author and by anyone
relying on this response downstream.

The core thesis is correct and the arithmetic is sound. I independently verified
the following claims rather than accepting them:

- The defect is real. The accepted layout
  `/Users/kpburson/Library/Caches/ai-peer-review/brokers/<64-hex>/broker.sock`
  is 30 + 15 + 8 + 65 + 12 = 130 UTF-8 bytes, and with a two-byte home `/x` it
  is 17 + 100 = 117 bytes. Both exceed the 103 usable bytes implied by Darwin's
  `sun_path[104]`. The document's numbers are exact.
- Base32 sizing is exact. 256 bits / 5 = 51 full groups (255 bits) plus one
  residual data bit, so every digest emits exactly 52 symbols. The stated
  vectors hold: an all-zero digest yields 52 `a`; an all-`ff` digest yields 51
  `7` (index 31) followed by `10000` = index 16 = `q`. The claim that every
  valid token ends in only `a` or `q` follows directly, because the final group
  is one data bit plus four zero pad bits. This is a genuine property worth
  pinning in tests, not a restatement.
- The alphabet `abcdefghijklmnopqrstuvwxyz234567` is the RFC 4648 base32
  alphabet rendered lowercase, it is 32 symbols, and it is case-fold injective.
  The rejection of base64url on case-insensitive filesystems is correct.
- The length boundary is exact. The macOS default endpoint is
  `home + 15 ("/Library/Caches") + 9 ("/aipr/v1/") + 52 = home + 76`, so a
  27-byte home lands on exactly 103 and a 28-byte home on 104. Since
  `/Users/` is 7 bytes, the 20-byte / 21-byte short-name boundary follows
  arithmetically. The reproduced path is 30 + 9 + 52 = 91 bytes. All four
  verification bullets that pin these numbers are internally consistent.
- Linux `sun_path[108]` → 107 usable is correct, and the document is right to
  insist the two platform limits be exercised separately rather than sharing a
  constant.
- "Five new stable errors" is accurate. `APR_BROKER_PATH_INVALID`,
  `APR_BROKER_ENDPOINT_UNSUPPORTED`, `APR_BROKER_ENDPOINT_LIMIT_INVALID`, and
  `APR_BROKER_ENDPOINT_TOO_LONG` already exist in `src/broker/paths.mjs`; the
  five genuinely new codes are `APR_BROKER_CACHE_ROOT_UNAVAILABLE`,
  `APR_BROKER_AUTHORITY_PARENT_UNSAFE`, `APR_BROKER_AUTHORITY_PARENT_LOST`,
  `APR_BROKER_ENDPOINT_PARENT_UNSAFE`, and `APR_BROKER_ENDPOINT_PARENT_LOST`.
- The Linux and Windows rows of the input-mapping table correctly ratify shipped
  behavior. `src/broker/paths.mjs:32` branches on `!== undefined`, so a defined
  empty or relative `XDG_CACHE_HOME` reaches `absolute()` and throws
  `APR_BROKER_PATH_INVALID`, exactly as the table states; `src/broker/paths.mjs:37`
  gives `%LOCALAPPDATA%` the same treatment.
- The plan citations at lines 172, 192, and 199 are accurate, and the socket
  layout citation at design lines 260–265 is accurate fence to fence.
- The decision to keep the lock and metadata at the unversioned full-digest path
  under `cacheRoot`, so that the endpoint-root setting can never split mutual
  exclusion, is the right call and is argued well.

The document is also candid about its real costs: moving the socket into a
per-user shared `aipr/v1` directory widens the blast radius of a lost endpoint
parent from one project to every project for that user, and it accepts orphan
socket accumulation for v1. Both are disclosed explicitly rather than glossed,
and the forward-attribution procedure that avoids shipping a production base32
decoder is a good answer to the resulting diagnostic problem.

What blocks acceptance is not the encoding or the arithmetic. It is that the
newly introduced endpoint-root indirection — the document's own single
documented recovery for the exact macOS homes that motivated this correction —
is under-specified at its seams. The endpoint-root handle has no specified
producer, the client cannot reach a broker that used a non-default endpoint root
through any interface this document defines, and the pre-existing error whose
recovery text now contradicts the design is not in scope for update. Required
changes 1–3 are all on that one seam. Required change 4 is a narrower conflict
between the normative table and shipped behavior the document elsewhere claims
to ratify.

## Findings

1. **The retained endpoint-root handle has no specified producer, and the
   contract reuses one name for both a path string and a handle.** The path
   contract returns `endpointRoot` as an absolute POSIX path string. The
   security contract then requires
   `listenPrivate(paths.endpointDirectories, paths.endpoint, { lock, endpointRoot })`
   to receive "the retained endpoint-root handle" and states that "an
   endpoint-root or lock pathname is not sufficient." Two problems follow.
   First, the only specified opener is
   `openPrivateDirectory(paths.cacheRoot, paths.authorityDirectories)`, which
   returns "retained cache-root and leaf-directory handles." When
   `endpointRootSource` is `configured`, `endpointRoot !== cacheRoot`, and no
   function this document defines opens, validates, or retains the endpoint-root
   anchor. The document asserts that validation happens ("`endpointRoot` is the
   POSIX routing trust anchor… must be an absolute, user-owned, non-symlink
   directory…") without naming the operation that performs it or returns its
   handle. Second, the option key `endpointRoot` is spelled identically to the
   path-layer string field `paths.endpointRoot`, so the most natural reading of
   the call site is to pass the string — precisely the error the design forbids.
   The verification bullet that would have caught this instead names the wrong
   resource: "`listenPrivate` rejects cache-root and lock pathnames where
   retained live handles are required." `listenPrivate` never receives a cache
   root; its options are `{ lock, endpointRoot }`. As written, the one test
   guarding this rule does not test it.

2. **A client cannot reach a broker that used a non-default endpoint root
   through any interface this document specifies.** The path contract derives
   `endpointRoot` solely from the client's own `AI_PEER_REVIEW_ENDPOINT_ROOT`.
   The security contract separately says a POSIX client "reads any endpoint-root
   metadata only as a routing hint, independently opens and validates that
   endpoint-root anchor, and then reaches every `endpointDirectories` entry."
   Three things are missing to make that executable. (a) There is no precedence
   rule for the case where the client's own `AI_PEER_REVIEW_ENDPOINT_ROOT`
   differs from `broker.json`'s recorded `endpoint_root`. (b) `brokerPaths`
   accepts only `{ identity, platform, env, home }`, so there is no specified
   way to re-derive `endpointDirectories` and `endpoint` from a
   metadata-supplied root; `connectBroker({ identity, paths, versions }, platform)`
   receives `paths` already fixed by the client's environment. (c) There is no
   stated behavior when `broker.json` is absent, unreadable, or stale while a
   broker is nonetheless live — a real window, since metadata is written by
   Task 4 after lock acquisition.

   Concrete failure: a macOS user whose short name is 21 bytes cannot use the
   default endpoint root at all, so `AI_PEER_REVIEW_ENDPOINT_ROOT` is mandatory
   for them. They export it in the shell that runs `peer-review start`. A later
   CLI invocation from a shell that does not export it derives
   `~/Library/Caches/aipr/v1/<token>`, which is 104 bytes, so that client fails
   preflight with `APR_BROKER_ENDPOINT_TOO_LONG` and never reads the metadata
   hint at all — because the document places length preflight before any
   resource is opened. If instead the short name is 19 bytes and the user set an
   endpoint root only for convenience, the non-exporting client derives a valid
   but empty default path, finds no socket, and proceeds to contend for the
   full-digest lock the live broker holds, surfacing `APR_BROKER_OWNED` rather
   than connecting. Neither outcome is the intended one, and the document's
   claim that "the new endpoint-root setting cannot create that split because it
   never relocates the lock" is true only of mutual exclusion, not of
   reachability.

3. **The recovery text for `APR_BROKER_ENDPOINT_TOO_LONG` is now contradicted by
   this design and is not in scope for update.** The shipped registry entry at
   `src/broker/paths.mjs:61` reads "Use a shorter supported user cache path;
   broker endpoints are never truncated or redirected." This correction
   introduces exactly such a redirect: `AI_PEER_REVIEW_ENDPOINT_ROOT` relocates
   the endpoint while leaving the cache path — and therefore lock and metadata
   authority — where it was. After this change the shipped sentence is wrong on
   both clauses: the recommended action is no longer "a shorter user cache path,"
   and endpoints are redirectable. The document's own prose is careful here ("A
   longer default path is not silently redirected"), but the registry text is
   unqualified, and the Verification section never lists it for update. There is
   a second problem underneath: the accepted epic requires each stable error's
   offline `explain` entry to give "one exact recovery action," and this error's
   correct action is now platform-dependent — configure an endpoint root on
   macOS and Linux, but that variable is ignored entirely on Windows, where the
   same code also covers an overlong named-pipe label. The document states the
   macOS recovery and says "Linux recovery likewise may select a shorter endpoint
   root," and says nothing about the Windows recovery for this code.

4. **The input-mapping table records `N/A` for invalid values on the two rows
   where shipped code does throw, and Verification demands those rows be
   asserted.** The macOS `~/Library/Caches` row and the Linux `absent
   XDG_CACHE_HOME, then ~/.cache` row both carry `N/A` in the "Invalid defined
   value" column. Both derive from `home`, and `src/broker/paths.mjs:30` and
   `src/broker/paths.mjs:35` pass `home` through `absolute(home, platform,
   'home')`, which throws `APR_BROKER_PATH_INVALID` with `label: 'home'` for a
   missing, empty, or relative home. So an invalid defined value exists on both
   rows and has a defined outcome. This matters beyond bookkeeping because the
   Verification section requires that "every input-table row, invalid-value
   outcome, source enum, and creation policy is asserted per platform." With
   `N/A` in those cells, the table instructs the implementer that there is
   nothing to assert for the most common misconfiguration on the platform this
   correction exists to fix. The document is otherwise scrupulous about
   ratifying shipped behavior — it does so explicitly for `XDG_CACHE_HOME` — so
   this reads as an omission rather than an intended narrowing.

5. **Two supersession line citations are off by one line.** The document claims
   it "extends the security rule at line 279 plus the stable-error list at lines
   335–336." The security rule is a single sentence spanning lines 279–280 ("Use
   user-only directory access and refuse symlinked or foreign-owned endpoint /
   and lock resources."), so the citation stops mid-sentence. The stable-error
   list spans lines 335–337; line 337 carries `APR_PROVIDER_RESOURCE_BUSY`, so
   the cited range omits the fifth accepted error. Neither error changes the
   outcome here, because this correction extends rather than replaces the list
   and does not narrow the security rule. But this document asserts that it "has
   precedence only for the clauses named here," which makes the line citations
   load-bearing for scope, and both the socket-layout citation (260–265) and all
   three plan citations (172, 192, 199) are exact — so these two stand out as
   transcription slips rather than a deliberate convention.

6. **Endpoint-root ancestor safety is neither validated nor mentioned in the
   recovery guidance that steers users toward short paths.** Anchor checks apply
   to the endpoint root itself; the document states that "the package never
   creates their arbitrary ancestors" but never addresses their safety. The
   documented recovery asks the user to "configure an existing shorter, private
   absolute directory," and the byte budget pushes that directory close to the
   filesystem root, which is where world-writable ancestors such as `/tmp` and
   `/var/tmp` live. The retained-handle discipline means a post-validation swap
   cannot redirect a running broker, and a user-owned-directory requirement means
   an attacker cannot pre-create a passing substitute, so I do not believe this
   is a confidentiality or integrity break — the realistic outcome is a
   fail-closed denial of service. It is still worth one sentence, because the
   guidance actively directs users toward the risky region of the filesystem and
   currently says nothing about it.

7. **"Unlinks neither observed entry" is ambiguous in the post-bind paragraph.**
   In the pre-cleanup paragraph the phrase is clear, because two entries are in
   play: the recorded baseline and the current observation. In the immediate
   post-bind paragraph only one entry has been observed, so "neither" has no
   antecedent. I read the intent as covering both the entry reached through the
   retained `aipr/v1` handle and the entry at the absolute `paths.endpoint`
   pathname, which is a meaningful distinction worth stating outright given that
   the whole paragraph exists because `bindat` does not exist on Darwin or
   Linux. Editorial, but this is a rule about when a broker may remove a socket,
   which is the area where ambiguity is least affordable.

## Required changes

1. Name the operation that opens, validates, and retains the endpoint-root
   anchor, and specify its return shape, for both `endpointRootSource:
   configured` and `endpointRootSource: cache-root` (where it may reuse the
   cache-root handle). Disambiguate the `listenPrivate` option key from the
   path-layer string field `paths.endpointRoot` — for example
   `endpointRootHandle` — so that passing the string is a visible error at the
   call site. Correct the verification bullet to read that `listenPrivate`
   rejects **endpoint-root** and lock pathnames where retained live handles are
   required, since `listenPrivate` never receives a cache root. (Finding 1)

2. Specify client endpoint-root resolution end to end: the precedence between a
   client's own `AI_PEER_REVIEW_ENDPOINT_ROOT` and `broker.json`'s recorded
   `endpoint_root`; the interface by which a metadata-sourced root reaches path
   derivation, given that `brokerPaths` currently takes only `{ identity,
   platform, env, home }` and `connectBroker` receives an already-derived
   `paths`; and the behavior when metadata is absent, unreadable, or stale while
   a broker is live. State explicitly whether a client whose own derived default
   endpoint fails length preflight must still be able to read the metadata hint,
   since the current ordering rule ("preflight runs before any resource is
   opened") forecloses that. Add verification that a broker started under a
   configured endpoint root is reachable from a client process whose environment
   does not set that variable. (Finding 2)

3. Bring `APR_BROKER_ENDPOINT_TOO_LONG` into scope. Supersede its shipped
   recovery text, which now asserts that endpoints are "never truncated or
   redirected" and directs users to a shorter cache path rather than a shorter
   endpoint root. State the platform-correct recovery for macOS, Linux, and
   Windows, and reconcile that with the accepted epic's one-exact-recovery-action
   contract — either by keeping one action phrased to hold on all three
   platforms, or by saying that this code's recovery is platform-selected and
   how. Add it to the Verification list alongside the five new codes.
   (Finding 3)

4. Replace `N/A` in the "Invalid defined value" column for the macOS
   `~/Library/Caches` row and the Linux `absent XDG_CACHE_HOME, then ~/.cache`
   row with the actual shipped outcome: a missing, empty, or relative `home`
   fails `APR_BROKER_PATH_INVALID`. Note that this ratifies shipped behavior, as
   the document already does for `XDG_CACHE_HOME`, so the per-row verification
   requirement has something to assert on the platform this correction targets.
   (Finding 4)

## Optional suggestions

1. Correct the two supersession citations: the security rule spans design lines
   279–280, and the stable-error list spans 335–337. (Finding 5)

2. Add one sentence to the `AI_PEER_REVIEW_ENDPOINT_ROOT` recovery guidance
   stating that the chosen root must not sit beneath a world-writable ancestor,
   and note that the package validates the anchor itself but not its ancestors.
   (Finding 6)

3. Replace "unlinks neither observed entry" in the immediate post-bind paragraph
   with the two entries actually meant — the entry reached through the retained
   `aipr/v1` handle and the entry at the absolute `paths.endpoint` pathname.
   (Finding 7)

4. Consider stating the closed value sets for `cacheRootSource`
   (`platform-default`, `xdg-configured`, `home-default`) and `endpointRootSource`
   (`configured`, `cache-root`, `named-pipe`) in one place. They are currently
   derivable only by reading every table row, and Verification requires each
   "source enum" to be asserted per platform.

5. The Windows bullet in the Verification section lists `endpointDirectories`,
   `authorityDirectories`, `directory`, and the named pipe, but the contract also
   adds `endpointRoot: null` and `endpointRootSource: 'named-pipe'` to the return
   shape. "Asserted key-for-key" arguably covers them; naming them would remove
   the doubt, since a null-valued key is the kind a key-for-key assertion is
   easiest to write around.

## Decision

revisions-requested
