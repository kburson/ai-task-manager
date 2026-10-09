<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-4ff08b002a59a1db716139830c763e1b"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "23b9f849c1aebff7a13b90c2b1aaadcec5ef3539"
artifact_blob: "e30ce667425c3dd6c956d95ee227816c0a2ea123"
artifact_digest: "sha256:34086abb9f80aa9e4731e0f43986c9969c95ae65cf23058a20fa7e5c833e9ec7"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:3802c7d1004d0d124dc99ae567e4f8ff80822c8cb6bb210d406e19929f3f4a60"
  identity_source: "runtime"
started_at: "2026-09-14T18:34:13.961Z"
submitted_at: "2026-09-14T18:38:04.443Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Independent review of `docs/design/2026-09-14-56-macos-broker-endpoint-design.md`
at artifact commit `23b9f849c1aebff7a13b90c2b1aaadcec5ef3539`, blob
`e30ce667425c3dd6c956d95ee227816c0a2ea123`. I read the artifact in full, the
superseded clauses of the accepted epic design and plan, and the shipped
`src/broker/paths.mjs`. Findings below are my own; I did not read prior-round
reviewer or author responses for this review.

The core correction is sound and I verified its arithmetic and encoding claims
independently:

- `/Users/kpburson/Library/Caches` is 30 UTF-8 bytes; the `/aipr/v1/<52-char>`
  suffix is 9 + 52 = 61 bytes; the reproduced endpoint is 91 bytes. Matches the
  artifact's line 250 claim.
- `103 - 61 = 42` (Darwin) and `107 - 61 = 46` (Linux) confirm the
  `maxEndpointRootBytes` derivation at lines 250–252.
- `/Library/Caches` is 15 bytes, so a 42-byte cache root implies a 27-byte home,
  and `/Users/` is 7 bytes, so a 20-byte short name. The lines 252–255 chain and
  the 27/28-byte and 20/21-byte boundary tests at lines 713–719 are correct.
- The 61-byte suffix plus the shortest permitted two-byte root such as `/a` is
  exactly 63, so the lines 132–133 `APR_BROKER_ENDPOINT_LIMIT_INVALID` threshold
  and the limit-62/limit-63 tests at lines 727–729 are correct, and consistent
  with POSIX `/` being rejected at lines 144–146.
- Base32 over 32 bytes: 256 data bits fill 51 full 5-bit groups (255 bits) with
  one residual data bit plus four zero pad bits, giving exactly 52 symbols. The
  all-`ff` digest is therefore 51 `7` symbols followed by index 16 = `q`, the
  all-zero digest is 52 `a`, and every token's final symbol is necessarily `a`
  or `q`. Lines 228–237 and the vectors at lines 705–710 are all correct.
- Unpadded base64url of 32 bytes is `ceil(256/6) = 43` characters, confirming the
  rejected-alternative count at line 89; the case-folding injectivity argument at
  lines 90–93 holds and the selected lowercase `a-z2-7` alphabet is case-fold
  safe on a case-insensitive volume.
- The retained Windows pipe label is `\\.\pipe\` (9) + `ai-peer-review-brokers-`
  (23) + 64 hex + `-broker.sock` (12) = 108 units, confirming the line 630 claim
  that it fits the supported 256-unit limit.

Supersession bookkeeping is accurate. Epic design lines 260–265 are the
superseded socket layout, lines 279–280 the extended security rule, lines
335–337 the extended stable-error list, and lines 242–244 the preserved
identity-tuple canonicalization; plan lines 172, 192, and 199 are the matching
Task 3/Task 4 instructions. The new error list at lines 22–30 contains exactly
the nine errors the verification bullet at lines 757–758 counts.
`APR_BROKER_PATH_INVALID`, `APR_BROKER_ENDPOINT_LIMIT_INVALID`,
`APR_BROKER_ENDPOINT_TOO_LONG`, and `APR_BROKER_ENDPOINT_UNSUPPORTED` all exist
in shipped `src/broker/paths.mjs`, so "extends shipped behavior" in the input
table is accurate, and the deliberate rewrite of the shipped
`APR_BROKER_ENDPOINT_TOO_LONG` recovery string is correctly pinned by the test
at lines 730–732.

Three defects block acceptance. All three are internal-coherence defects in an
otherwise complete specification, not disagreements about the chosen approach:
the metadata schema v1 enumeration is not exhaustive over the fields other
normative clauses require writing; `openPrivateDirectory` is given a pathname
where every parallel clause requires a retained handle; and the
`APR_BROKER_ENDPOINT_PARENT_LOST` absence branch has normative behavior with no
verification bullet.

## Findings

1. **Metadata schema v1 enumeration is not exhaustive over its own required
   writers.** Lines 396–408 enumerate what "Task 4 writes metadata schema v1":
   the full root tuple and digest, `cache_root`, `cache_root_source`,
   `endpoint_root`, `endpoint_root_source`, `endpoint_layout_version`,
   `instance_id`, nonce binding, and publication state. The closing sentence
   "Adding the token later would require an explicit metadata-schema change"
   establishes that this enumeration is meant to be closed. But three other
   normative clauses require writing fields that appear nowhere in it:

   - Lines 385–387 require the owner to record "the exact unreconciled prior root
     and observed condition in current-instance `starting` and `ready` metadata".
   - Lines 391–395 require preserving "the prior endpoint root and layout version
     as an unreconciled predecessor" in the same records.
   - Lines 483–487 require the losing owner to "atomically annotate its
     already-published `starting` metadata with the collision code, exact
     endpoint, local cache root, local lock path, and endpoint root".

   The corresponding test bullets at lines 786–787 and 815–818 assert those
   writes happen, so the gap is the schema paragraph, not the behavior. The
   consequence is concrete: plan Task 4 (line 197) creates
   `schemas/broker-v1.json`, and this codebase validates schema objects against
   exact-key lists (plan line 163 pins that convention for `validateStartup`). An
   implementer following lines 396–408 will ship a schema that rejects the very
   writes lines 385–395 and 483–487 mandate, and the fail-closed collision and
   unreconciled-predecessor paths will fail on metadata publication instead of
   producing their specified diagnostics. There is also no verification bullet
   requiring these field groups to be present in schema v1; line 805 asserts only
   the roots, source enums, and layout version.

2. **`openPrivateDirectory` receives a pathname where the retained cache-root
   handle is required.** Lines 300–307 establish `openPrivateRoot` as "the single
   root-anchor operation", returning `{ handle, identity }` and retaining the
   validated anchor. Line 323 then calls
   `openPrivateDirectory(paths.cacheRoot, paths.authorityDirectories)` — a
   pathname — yet lines 326–329 say that same call "returns retained cache-root
   and leaf-directory handles" and that "the first level is opened relative to
   the retained cache-root handle". No handle is passed in, so the retained
   cache-root handle the body depends on is never supplied.

   This is not a cosmetic signature detail, because the design forbids exactly
   this pattern on the endpoint side. Lines 333–336 specify
   `listenPrivate(paths.endpointDirectories, paths.endpoint, { lock, endpointRootHandle })`
   and state that "an endpoint-root or lock pathname is not sufficient", and the
   verification bullet at line 802 makes rejecting pathnames-where-handles-are-
   required a tested contract for `listenPrivate` only. As written, the authority
   side must re-resolve `paths.cacheRoot` by name, which either duplicates the
   anchor validation that lines 300–307 declare single, or performs it once and
   then reopens by name — reintroducing a TOCTOU window between `openPrivateRoot`
   validating the anchor and `openPrivateDirectory` reopening it, which is the
   precise hazard the retained-handle discipline exists to close. The
   `APR_BROKER_AUTHORITY_PARENT_UNSAFE` and `APR_BROKER_AUTHORITY_PARENT_LOST`
   guarantees at lines 432–438 depend on that discipline holding on the authority
   chain.

3. **The `APR_BROKER_ENDPOINT_PARENT_LOST` absence branch has normative behavior
   and no verification bullet.** Lines 675–685 require the error to "distinguish
   a safely absent parent, consistent with cache eviction, from an unsafe
   replacement", and specify two different recoveries for the two branches:
   absence restores the exact owner-only directory chain and reconciles affected
   projects, while unsafe replacement requires full inspection before restoring
   both shared directories and reconciling every affected project's lock,
   metadata, endpoint, review registry, and provider state. Lines 585–591
   separately argue that OS or third-party cache eviction is "a realistic
   trigger" for this error, precisely because the default shared endpoint parent
   lives in a platform cache.

   The verification list covers only the replacement branch. Lines 773–776 test
   "mid-lifetime endpoint-parent replacement" and, for the authority side, both
   shared-level and digest-leaf loss. Nothing exercises a mid-lifetime endpoint
   parent that is safely absent, so neither the whole-user fence on eviction, the
   branch discrimination in the error, nor the guarantee that the package "never
   recreates the directory" on eviction is pinned by a test. Given that the
   design names eviction the most likely real-world trigger and that field
   incidence is supposed to inform a future non-cache default (lines 589–591),
   the untested branch is the one most likely to execute in production.

## Required changes

1. Make the metadata schema v1 enumeration at lines 396–408 exhaustive. Add the
   unreconciled-predecessor fields required by lines 385–387 and 391–395 (prior
   endpoint root, prior `endpoint_layout_version`, and the observed condition)
   and the collision-annotation fields required by lines 483–487 (collision code,
   exact endpoint, local cache root, local lock path, endpoint root), each with
   its null/absent semantics when there is no predecessor or no collision.
   Alternatively, state explicitly that these are a named, schema-declared
   optional extension group and name it. Then add a verification bullet near line
   805 requiring schema v1 to accept and round-trip both field groups, so an
   exact-key validator cannot be shipped without them.

2. Change the `openPrivateDirectory` signature at line 323 to take the retained
   cache-root handle returned by `openPrivateRoot`, mirroring `listenPrivate`'s
   `endpointRootHandle` at line 334 — for example
   `openPrivateDirectory(cacheRootHandle, paths.authorityDirectories)` — and
   state that a cache-root pathname is not sufficient, matching the wording at
   lines 334–336. Extend the verification bullet at line 802 to cover
   `openPrivateDirectory` as well as `listenPrivate`, so the authority chain has
   the same tested pathname-rejection contract as the endpoint chain. If the
   intent really is that `openPrivateDirectory` re-resolves the root by name,
   then lines 300–307 must stop calling `openPrivateRoot` the single root-anchor
   operation and the design must state what closes the resulting TOCTOU window.

3. Add a verification bullet for the safely-absent endpoint-parent branch: a
   mid-lifetime endpoint parent that is absent rather than replaced must produce
   `APR_BROKER_ENDPOINT_PARENT_LOST` reporting the absence condition and the
   absence-specific recovery from lines 680–684, must fence every observing user
   broker with each retaining its own lock and metadata evidence, and must not
   recreate the directory, unlink a socket, or redirect an endpoint. Pair it with
   the existing replacement bullet at lines 773–776 so both branches of the
   documented discrimination are pinned.

## Optional suggestions

1. Lines 146–154 document the byte-exact UTF-8 comparison rule and explicitly
   accept the case-only false positive on a case-insensitive volume, and line 748
   tests it. The same rule produces an identical false positive for Unicode
   normalization: two participants whose `AI_PEER_REVIEW_ENDPOINT_ROOT` spellings
   differ only by NFC versus NFD name the same physical directory on APFS but
   fail the byte-exact comparison with `APR_BROKER_ENDPOINT_ROOT_MISMATCH`. The
   behavior already follows from "byte-exact UTF-8 comparison of that canonical
   input form", so nothing needs to change; consider acknowledging it in the same
   sentence as the case-only clause, with the same "converge the input spelling,
   never silently normalize" resolution. The Unicode test at line 723 currently
   covers only byte-length measurement, not comparison.

2. The layout-version precedence rules at lines 504–506, 645–648, and 812
   consistently qualify the incompatibility trigger as an "unrecognized non-null"
   layout version, and lines 751–753 require Windows metadata to carry `null`.
   POSIX metadata carrying `null` or omitting `endpoint_layout_version` is
   therefore neither recognized nor "unknown non-null" and falls outside the
   stated precedence ladder. It is presumably schema-invalid and reaches the
   broker-integrity error at line 532 via "unreadable", but given how carefully
   every other precedence edge is pinned, consider saying so directly in the
   schema paragraph.

3. Data flow step 5 (lines 607–609) reads "validates the cache-root anchor and
   both protected directory chains, acquires the full-digest lock" — placing
   endpoint-chain creation before lock acquisition. The normative text at lines
   333–350 creates the endpoint directory chain inside `listenPrivate`, which
   receives the live lock handle and therefore runs after acquisition. Consider
   splitting the endpoint chain out of step 5 into step 6 so the summary cannot
   be implemented as written.

## Decision

revisions-requested
