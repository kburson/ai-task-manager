<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-6b3d9911feadd5d18165eb56cbdcc48f"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "66b3beb69d12e3f431facc57bb2ed0084431601a"
artifact_blob: "385830367b2acfa0ab0f34c9cb95e3bc7b9afa29"
artifact_digest: "sha256:a3f0d359c5de496a408e3760a919cea37481c10a15f6b6f575dc1e3746ed484a"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:16a7d1ff783e4f20de002a98a35950030d19793a7946161ebf0a34d16368e2a2"
  identity_source: "runtime"
started_at: "2026-09-14T17:45:32.553Z"
submitted_at: "2026-09-14T17:50:09.835Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The diagnosis is correct and the selected remedy is sound. I independently
re-derived every load-bearing number in the document against the shipped
`src/broker/paths.mjs`, and all of them hold:

- **Defect (lines 30–40).** `<user-cache>/ai-peer-review/brokers/<64-hex>/broker.sock`
  is 130 UTF-8 bytes under `/Users/kpburson/Library/Caches` (30 + 15 + 8 + 1 + 64
  + 12) and 117 bytes under a `/x` home (17 + 100). Darwin's `sun_path[104]`
  leaves 103 usable bytes, so the accepted contract is unsatisfiable on every
  conforming macOS home. The framing at line 42 is the right conclusion.
- **Base32 (lines 187–200).** 32 bytes = 256 bits; `ceil(256/5) = 52` groups.
  Group 52 carries one data bit plus four zero pad bits, so its symbol is
  alphabet index 0 (`a`) or 16 (`q`) and nothing else. All-zero encodes to 52
  `a`; all-`ff` encodes to 51 `7` (groups 1–51 each consume five set bits →
  index 31) followed by `q`. Every vector at lines 508–514 is exact. The
  lowercase-only alphabet is genuinely injective under APFS/HFS+ case folding,
  and the rejection of base64url at lines 80–85 is correct for that reason.
- **Budgets (lines 204–244).** `/aipr/v1/<52>` is 61 bytes, so
  `/Users/kpburson/Library/Caches/aipr/v1/<token>` is 91 bytes (30 + 61); the
  103-byte Darwin limit admits a 42-byte root, a 27-byte home under the default
  `/Library/Caches` suffix, and a 20-byte `/Users/<short-name>`. Linux's
  `sun_path[108]` gives 107 usable bytes and a 46-byte root. All exact, and the
  refusal to reuse Darwin's number in Linux tests (lines 241–244) is right.
- **Windows label (line 178).** `\\.\pipe\ai-peer-review-brokers-<64-hex>-broker.sock`
  is 9 + 23 + 64 + 12 = 108 string units, fitting the 256-unit limit as claimed
  at lines 467–469.
- **Shipped-behavior ratification (lines 123–131).** I checked the input table
  against `src/broker/paths.mjs`. The `XDG_CACHE_HOME !== undefined` guard means
  an empty string fails rather than falling back to `~/.cache`, matching the
  table's "Empty or relative fails `APR_BROKER_PATH_INVALID`". Windows
  `LOCALAPPDATA` and the macOS `home` rows match `absolute()` likewise. The
  table is an accurate ratification, not an aspiration.

The architecture is the strongest part of the correction. Keeping the
unversioned full-digest lock and metadata directory pinned to the resolved
`cacheRoot` while routing moves to a compact versioned namespace (lines 144–156,
421–432) is what makes a caller-influenced endpoint root safe at all: two
participants with divergent `AI_PEER_REVIEW_ENDPOINT_ROOT` values still contend
for one mutual-exclusion point. The prohibition at lines 429–432 against ever
versioning or relocating that lock should survive into the implementation plan
verbatim. The handle-threading contract (lines 261–332), the refusal to
reconstruct chains with `dirname`, the honest treatment of the missing `bindat`
primitive (lines 360–367), and the record-then-compare endpoint identity rule
(lines 369–384) — which correctly declines to derive an expected device/inode
from the listening descriptor and unlinks neither entry on mismatch — are all
well specified.

Five issues block acceptance. The most serious is that the client-side
connection sequence has no defined behavior when its own endpoint directories
are absent, which is the ordinary state of a client whose owner is bound under a
different endpoint root — precisely the case
`APR_BROKER_ENDPOINT_ROOT_MISMATCH` exists to serve. The remainder are a
normative contradiction between the Security text and the Failure behavior
enumeration, an unspecified comparison rule for endpoint-root equality that also
falsifies the stated 42/46-byte arithmetic, verification gaps on rules the
document states normatively, and an error-code enumeration that the Failure
behavior section does not cover. None requires rethinking the approach.

## Findings

1. **A client whose endpoint directories do not exist has no defined behavior,
   and the stated sequence reaches them before the mismatch comparison.**
   (Severity: high. Lines 386–393, 488–499, 578–580.)

   Lines 386–390 fix the client's order of operations: it "derives and preflights
   its endpoint from its own environment, opens and validates the authority cache
   root, opens and validates its derived endpoint-root anchor, and then reaches
   every `endpointDirectories` entry relative to retained parent handles."
   Only after that, at lines 393–397, does it compare its derived endpoint root
   against the recorded root.

   Consider the case the mismatch error was added for. The owner runs with
   `AI_PEER_REVIEW_ENDPOINT_ROOT=/Users/x/.aipr` and has created
   `/Users/x/.aipr/aipr` and `/Users/x/.aipr/aipr/v1`. A client in a shell that
   never received the variable derives `endpointRoot = ~/Library/Caches` and
   therefore `endpointDirectories = [~/Library/Caches/aipr,
   ~/Library/Caches/aipr/v1]`. **Neither directory exists.** Nothing ever created
   them: lines 293–306 assign creation of the endpoint-directory chain to
   `listenPrivate`, which is the owner's operation, and the owner is bound
   elsewhere. On a machine where the broker has only ever run under a configured
   root, they will never have existed.

   The document defines two outcomes for the endpoint-directory chain —
   `APR_BROKER_ENDPOINT_PARENT_UNSAFE` for a "pre-existing foreign-owned,
   non-directory, permissive, or symlinked" level (lines 353–358, 488–490) and
   `APR_BROKER_ENDPOINT_PARENT_LOST` for "mid-lifetime replacement or loss"
   (lines 491–499). An absent level on a client that never owned it is neither.
   The design also never states whether a client may create these directories. It
   must not: creating `aipr/v1` under a root the owner is not using would
   fabricate a shared per-user parent at the wrong anchor, and the creation
   authority at lines 293–306 is explicitly the listener's.

   So the client either fails with an undefined/generic error before reaching
   the comparison, or silently creates directories it has no authority over.
   Either outcome contradicts the verification requirement at lines 578–580 that
   "a valid absent default under a live lock fails with
   `APR_BROKER_ENDPOINT_ROOT_MISMATCH`" — that bullet is only satisfiable if the
   client's `aipr/v1` happens to already exist, which is exactly the condition
   the design cannot assume.

   The information needed is available before any of this: the full-digest lock
   and `broker.json` live under `cacheRoot`, which the client has already opened
   and validated at step two of the sequence. The comparison is orderable ahead
   of the endpoint-directory traversal at no cost.

2. **The Failure behavior entry for `APR_BROKER_ENDPOINT_ROOT_MISMATCH`
   contradicts the normative Security text and the verification list.**
   (Severity: high. Lines 393–397, 473–476, 571–573.)

   Lines 393–397 state the rule without a presence precondition: "Whenever the
   stable project lock is live and metadata is readable, the client compares its
   derived endpoint root with the recorded root before attempting any socket
   connection, **regardless of whether its derived socket path is absent or
   contains stale state**." Lines 571–573 confirm this with a test: "a client
   whose derived endpoint contains a stale socket under a superseded root still
   fails with `APR_BROKER_ENDPOINT_ROOT_MISMATCH`, not a handshake or integrity
   error."

   Lines 473–476 then reintroduce the precondition the other two passages
   removed: "**A valid derived endpoint is absent** while the live project's
   metadata names a different validated endpoint root:
   `APR_BROKER_ENDPOINT_ROOT_MISMATCH`."

   Since this document is positioned at lines 9–26 as the precedence authority
   for the superseded stable-error list, its Failure behavior section is the
   normative registry contract. An implementer working from that section will
   gate the check on absence and reproduce exactly the stale-socket defect that
   lines 571–573 forbid. This is not an editorial slip — it is two incompatible
   normative statements of the same rule in one authority document, and the
   narrower one sits in the section an implementer is most likely to treat as
   the specification of the error.

3. **Endpoint-root equality has no specified comparison rule, and a trailing
   separator falsifies both the equality check and the stated 42/46-byte
   budgets.** (Severity: high. Lines 116–119, 213–215, 336–341, 393–401,
   518–520.)

   Three separate mechanisms depend on comparing or measuring `endpointRoot` as
   a string, and none of them defines its canonical form:

   - **Equality.** Lines 330–332 have the owner compare a metadata-recorded
     endpoint root against its own; lines 393–401 have the client do the same.
     Neither says whether the comparison is byte-exact on the raw configured
     value. It cannot be `realpath`-based, because lines 261–268 refuse symlinks
     outright rather than resolving them. So byte-exact is the only consistent
     reading, and it must be stated — under byte-exact comparison,
     `AI_PEER_REVIEW_ENDPOINT_ROOT=/Users/x/.aipr/` and `/Users/x/.aipr` name the
     same validated directory but produce `APR_BROKER_ENDPOINT_ROOT_MISMATCH`.
     The recovery at lines 397–399 ("set `AI_PEER_REVIEW_ENDPOINT_ROOT` to the
     recorded, independently revalidated root and retry") does resolve it, so
     this fails closed rather than unsafely, but it is an avoidable
     false-positive on a variable the document expects operators to set by hand
     across multiple shells.

   - **Arithmetic.** Line 214–215 states the budget as a property of the root
     string: "The endpoint is always the endpoint root plus the 61-byte
     `/aipr/v1/<token>` suffix. A configured endpoint root may therefore be at
     most 42 UTF-8 bytes on Darwin and 46 UTF-8 bytes on Linux." With a trailing
     separator this is false by one byte: a 43-byte `/…/` root joins to a
     103-byte endpoint, which fits. Preflight itself is unaffected because
     lines 204–205 measure the derived endpoint, not the root — but the
     documented budget, the operator-facing recovery text at lines 234–239 and
     468–472, and the error messages that carry the 42/46-byte numbers are all
     stated in terms of the root.

   - **Verification.** Line 518–520 requires that "a configured 42-byte Darwin
     endpoint root produces exactly 103 bytes and a 43-byte root is refused at
     104." A 43-byte root ending in `/` is accepted at 103, so the test as
     written is under-determined: whether it passes depends on an input property
     the specification never constrains.

   The same gap has a second instance worth naming explicitly. macOS default
   volumes are case-insensitive, so `/Users/X/.aipr` and `/Users/x/.aipr` are the
   same directory and pass the same anchor checks, but compare unequal. The
   design took care at lines 80–85 to make the *token* case-fold-safe; the
   endpoint root it is joined to has no equivalent rule.

4. **Several rules stated normatively have no verification bullet, including the
   ancestor-chain refusal and every parent-unsafe/parent-lost behavior.**
   (Severity: medium. Lines 261–268, 344–358, 484–499, 547–573.)

   The verification list is the handoff contract — lines 582–584 state that #56
   "defines and hands off the tests" rather than implementing #43's layer — so a
   rule with no bullet is a rule that will not be checked by the party
   implementing it. Four normative rules are unbacked:

   - **Ancestor chain.** Lines 261–265 require `openPrivateRoot` to traverse
     "the absolute ancestor chain with no-follow semantics," requiring *every
     ancestor* to be a nonsymlink directory not writable by group or other, and
     line 226–228 restates it operationally ("a root below a world-writable
     ancestor is refused"). The only related bullet, line 553–554, covers the
     final anchor: "every authority-root and endpoint-root source is refused when
     group- or other-writable." An implementation that validates only the leaf
     passes the stated tests and violates the stated rule — and the leaf-only
     implementation is the natural one, which is precisely why this needs a
     bullet. A configured root under `/tmp` is the concrete case: `/tmp` is
     world-writable and sticky, the root itself can be owner-only `0700`, and
     `/tmp/<short>` is the most tempting remedy for the macOS budget.

   - **`APR_BROKER_ENDPOINT_PARENT_UNSAFE` / `APR_BROKER_AUTHORITY_PARENT_UNSAFE`.**
     Lines 344–358 specify four distinct triggering conditions (foreign-owned,
     non-directory, permissive, symlinked) at each level. The only coverage is
     line 548–550, which asserts the errors *exist in the registry with one exact
     recovery action* — an assertion about the registry, not about the detection.

   - **`APR_BROKER_ENDPOINT_PARENT_LOST` / `APR_BROKER_AUTHORITY_PARENT_LOST`.**
     Lines 484–499 specify the most consequential behavior in the document:
     shared-level loss fences *every* broker for the user, each broker retains
     its own evidence and refuses delivery, and the package "never recreates the
     directory, unlinks sockets, takes ownership, or redirects an endpoint
     automatically." No bullet exercises the fencing, and none exercises the
     never-recreate rule — the rule most likely to be violated by a
     well-intentioned implementer who sees a missing `aipr/v1` and calls `mkdir`.

   - **Client absent-directory behavior.** Per finding 1, no bullet establishes
     that a client never creates an endpoint directory.

5. **`APR_BROKER_PATH_INVALID` is used normatively for path inputs but the
   Failure behavior section defines it only for the digest.** (Severity: medium.
   Lines 123–131, 462.)

   The input-mapping table raises `APR_BROKER_PATH_INVALID` in five of its seven
   rows, for a missing/empty/relative `home`, an empty/relative `XDG_CACHE_HOME`,
   a missing/empty/nonabsolute `%LOCALAPPDATA%`, and an empty/relative
   `AI_PEER_REVIEW_ENDPOINT_ROOT`. Line 462 defines the code as "Invalid or
   noncanonical digest" and says nothing about path inputs.

   This matters because lines 133–136 place a specific obligation on these
   failures: "When a configured input fails, the error context names the specific
   variable; `APR_BROKER_CACHE_ROOT_UNAVAILABLE` recovery therefore never has to
   infer whether `XDG_CACHE_HOME` or `AI_PEER_REVIEW_ENDPOINT_ROOT` selected the
   observed path." That obligation is stated in prose and enforced nowhere: the
   Failure behavior section does not carry it, and the verification list does not
   test it. The shipped `absolute()` helper already passes a `label` into
   `details`, so the behavior partially exists today for the cache-root cases and
   would need extending to the new endpoint-root variable — exactly the kind of
   thing that gets missed when the error's own section does not mention it.

## Required changes

1. **Define client behavior for absent endpoint directories and order the
   mismatch comparison ahead of the traversal.** (Addresses finding 1.)

   - Rewrite the client sequence at lines 386–393 so the metadata comparison is
     performed immediately after the authority cache root is opened and
     validated, and before the endpoint-root anchor and `endpointDirectories`
     chain are traversed. State that on any difference the client fails with
     `APR_BROKER_ENDPOINT_ROOT_MISMATCH` without touching its own endpoint
     directories at all.
   - State explicitly that a client never creates `aipr` or `aipr/v1` at any
     level; creation authority belongs solely to `listenPrivate` per lines
     293–306.
   - Define the outcome for a client that reaches a *safe but absent* endpoint
     directory when the comparison did not fire — that is, when no live lock or
     no readable metadata was available to compare against. Name the exact error
     and its one recovery action. Do not leave this to the two parent errors: an
     absent level that the client never owned is neither
     `APR_BROKER_ENDPOINT_PARENT_UNSAFE` (nothing unsafe is present) nor
     `APR_BROKER_ENDPOINT_PARENT_LOST` (nothing was lost mid-lifetime).
   - Amend the verification bullet at lines 578–580 so the "valid absent default
     under a live lock" case is asserted with the client's own `aipr` and
     `aipr/v1` **not present on disk**, which is the state that case actually
     occurs in.

2. **Reconcile the `APR_BROKER_ENDPOINT_ROOT_MISMATCH` failure entry with the
   normative rule.** (Addresses finding 2.)

   - Replace the Failure behavior entry at lines 473–476 so it states the
     presence-independent rule: whenever the stable project lock is live and
     metadata is readable, a derived endpoint root differing from the recorded
     root produces `APR_BROKER_ENDPOINT_ROOT_MISMATCH` before any connection
     attempt, whether the derived socket path is absent, stale, or apparently
     live. Keep the existing single recovery action and the never-auto-redirect
     rule unchanged.
   - Confirm in the same entry that comparison is diagnosis, not routing, so the
     rewritten entry cannot be read as weakening the metadata-is-not-authority
     rule at lines 338–340.

3. **Specify the canonical form and comparison rule for endpoint and cache
   roots.** (Addresses finding 3.)

   - In the Corrected path contract, state that `cacheRoot` and `endpointRoot`
     are canonical absolute POSIX paths with no trailing separator and no `.` or
     `..` component, that a configured value carrying any of these is rejected
     with `APR_BROKER_PATH_INVALID` naming the variable, and that the path layer
     performs no symlink resolution (consistent with the no-follow refusal at
     lines 261–268).
   - State that root equality — owner-versus-metadata at lines 330–332 and
     client-versus-metadata at lines 393–401 — is byte-exact UTF-8 comparison of
     that canonical form. Note explicitly that this is case-sensitive even on
     case-insensitive volumes, and that the resulting mismatch fails closed with
     the existing single recovery action.
   - With the canonical form pinned, line 214–215's "endpoint root plus the
     61-byte suffix" becomes exact; keep the 42-byte Darwin and 46-byte Linux
     budgets and state that they are measured against the canonical root.
   - Add verification: a configured root differing only by a trailing separator
     is rejected as noncanonical rather than silently accepted or silently
     mismatching; a configured root differing only by letter case produces
     `APR_BROKER_ENDPOINT_ROOT_MISMATCH` rather than connecting; and the existing
     42/43-byte and 46/47-byte boundary bullets at lines 518–520 are asserted
     against canonical roots so their byte counts are determinate.

4. **Add verification for the normative rules that currently have none.**
   (Addresses finding 4.)

   - **Ancestor chain:** a configured `AI_PEER_REVIEW_ENDPOINT_ROOT` that is
     itself owner-only `0700` but sits below a group- or other-writable ancestor
     is refused with `APR_BROKER_CACHE_ROOT_UNAVAILABLE` identifying its
     endpoint role and source variable; the same for a root below a symlinked
     ancestor; and the same for the authority cache root. This must be distinct
     from the existing leaf-only bullet at lines 553–554.
   - **Parent-unsafe detection:** each of the four conditions at lines 344–358
     (foreign-owned, non-directory, permissive, symlinked) is asserted to produce
     `APR_BROKER_ENDPOINT_PARENT_UNSAFE` at `aipr` and at `aipr/v1`, and
     `APR_BROKER_AUTHORITY_PARENT_UNSAFE` at each of the three authority levels,
     with the exact observed condition and path reported and no automatic
     removal, replacement, or ownership change performed.
   - **Parent-lost fencing:** mid-lifetime replacement of a shared endpoint
     directory fences every running broker for that user, each retains its own
     lock and metadata evidence, each refuses further delivery, and none
     recreates the directory, unlinks a socket, or redirects an endpoint. Assert
     the authority-level counterpart too, including that shared-level loss fences
     every observing broker while digest-leaf loss fences only that project, and
     that neither authorizes stale-socket reclamation through the compromised
     lock path (lines 349–351).
   - **Client never creates:** per required change 1, assert that a client
     failing on an absent endpoint directory leaves the filesystem unmodified.

5. **Cover the path-input failures in the Failure behavior section and pin the
   variable-naming obligation.** (Addresses finding 5.)

   - Extend the entry at line 462 to enumerate every `APR_BROKER_PATH_INVALID`
     trigger the input table defines: a missing, empty, or relative `home`; an
     empty or relative `XDG_CACHE_HOME`; a missing, empty, or nonabsolute
     `%LOCALAPPDATA%`; an empty or relative `AI_PEER_REVIEW_ENDPOINT_ROOT`; the
     noncanonical-root forms added by required change 3; and the existing invalid
     or noncanonical digest.
   - State in that entry that the error context names the specific offending
     variable, discharging the obligation asserted in prose at lines 133–136.
   - Add verification that each such failure reports the exact variable name,
     with `AI_PEER_REVIEW_ENDPOINT_ROOT` and `XDG_CACHE_HOME` distinguishable
     from one another and from `home`. The existing bullet at lines 542–544
     asserts outcomes per input-table row but not the variable attribution.

## Optional suggestions

1. **Let the path layer own the layout version and the root budget.** The `v1`
   segment at line 161, the `endpoint_layout_version: 1` metadata field at line
   336, and the 42/46-byte budgets quoted in prose at lines 214–215 and in error
   text at lines 468–472 are four copies of two constants. Exporting the layout
   version and a derived `maxEndpointRootBytes` from `brokerPaths` — the module
   that already owns `maxEndpointLength` — would let metadata, error messages,
   and tests read one source, and would make the "metadata schema version and
   pathname-layout version do not move in lockstep" rule at lines 342–343
   mechanically enforceable rather than a note.

2. **Guard the `APR_BROKER_ENDPOINT_PARENT_UNSAFE` recovery wording against a
   legitimate multi-user root.** Lines 353–358 direct the user to "inspect and
   remove or repair that path outside ai-peer-review." Lines 236–239 contemplate
   an administrator provisioning short roots; if an administrator provisions one
   shared directory for several accounts, user B legitimately encounters user A's
   owner-only `aipr` and gets advice that reads as "remove it." The existing
   qualifier ("only after establishing its ownership and purpose") is doing a lot
   of work. Saying outright that a foreign-owned `aipr` belonging to another
   account's broker is resolved by provisioning a per-user root — not by removing
   the other user's directory — would close the reading. Adding "one *per-user*
   root" at line 237 would reinforce it.

3. **Name the endpoint-root split as a supported configuration hazard in
   Non-goals.** Lines 340–341 require that "every owner and client process for a
   configured endpoint must set the same variable," and lines 424–428 correctly
   note that divergent *authority-cache* configuration is a pre-existing
   deployment error outside #56. The endpoint-root variable is new, is expected
   to be set by hand in shells, and its divergence is the sole reason
   `APR_BROKER_ENDPOINT_ROOT_MISMATCH` exists. Stating in Non-goals that
   automatic propagation or discovery of that variable is out of scope would make
   the operator burden a reviewable decision rather than a consequence found in
   an error definition.

## Decision

revisions-requested
