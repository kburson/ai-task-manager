<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7f960d0baa0c582f580431012d7adcd6"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "02ce8817e03954bd7d0132e1e1062672c185a861"
artifact_blob: "368526689a2bbe10e25551c3c2de69f7ef4b5faa"
artifact_digest: "sha256:465eb23a800d7728cf55aeefffb03a67e5c00d63740fc66596d1dd48fa38ac95"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:b8ba691f691ae33fc99d2405f27cd8bed6f89d09a6fb6cf4717d5a19e2abb601"
  identity_source: "runtime"
started_at: "2026-09-14T17:04:36.231Z"
submitted_at: "2026-09-14T17:08:47.050Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed `docs/design/2026-09-14-56-macos-broker-endpoint-design.md` at
`02ce881` independently, re-deriving every load-bearing number rather than
accepting the design's arithmetic, and checking it against the shipped
`src/broker/paths.mjs`, the epic design
`docs/design/2026-09-14-project-local-spr-xpr-broker-design.md`, and the plan
`docs/plans/2026-09-14-project-local-spr-xpr-broker.md`.

Independently confirmed:

- `sockaddr_un.sun_path[104]` is the active declaration. I read it directly at
  line 79 of `/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/sys/un.h`:
  `char sun_path[104]; /* [XSI] path name (gag) */`. 103 usable
  NUL-terminated bytes is the correct reading.
- The accepted layout
  `/Users/kpburson/Library/Caches/ai-peer-review/brokers/<64-hex>/broker.sock`
  is 130 UTF-8 bytes (30 + 15 + 8 + 1 + 64 + 12), and 117 bytes for a `/x` home
  (2 + 115). Both Problem-section figures are exact, and the defect is real:
  `verifyEndpointLength` in `src/broker/paths.mjs:56` measures POSIX endpoints
  with `Buffer.byteLength(endpoint, 'utf8')`, so it rejects every conforming
  macOS home today.
- 256 / 5 = 51.2, so unpadded base32 emits exactly 52 characters for every
  32-byte digest, with a 1-bit remainder in the high bit of the final group.
  All-zero encodes to 52 `a`. All-`ff` encodes to 51 `7` (value 31) followed by
  `10000` = 16 = `q` in `abcdefghijklmnopqrstuvwxyz234567`. Every token must end
  in `a` or `q`. All four vector claims in Verification are correct.
- `/Users/kpburson/Library/Caches/aipr/v1/<52>` is 91 UTF-8 bytes
  (30 + 5 + 3 + 1 + 52). A 27-byte home lands at exactly 103 (27 + 15 + 9 + 52)
  and a 28-byte home at 104. Both Length-boundary claims hold.
- The Windows pipe label is 108 string units
  (9 + 23 + 64 + 12), far inside the 256-character named-pipe limit, so leaving
  it unchanged is safe.
- The base64url rejection is sound: a mixed-case alphabet is not injective under
  case folding on a case-insensitive filesystem.
- Plan lines 172, 192, and 199 are the correct citations for the Task 3
  `brokerPaths` return shape, the Task 3 layout instruction, and the Task 4
  `platformSecurity`/`listenPrivate` interfaces respectively.

The selected encoding is lossless, deterministic, case-fold-safe, and needs no
change. None of my findings ask for a different approach. They are about the
edges the compact layout creates: the shrunken byte budget now excludes
realistic macOS accounts with no stated remedy, the new cache-root trust anchor
is specified in a way that is macOS-shaped and blocks ordinary Linux first runs,
its permission contract omits the one property that matters for substitution,
and the Verification section does not cover the five error codes and several
"forbidden and tested" behaviors this design newly introduces.

Decision: revisions-requested, on five findings. F1 and F2 are correctness and
supportability defects; F3 is a security-contract gap; F4 and F5 are
specification completeness.

## Findings

1. **The 103-byte budget silently excludes realistic macOS accounts, and the
   stated recovery is not actionable there.** On macOS the cache root is fixed
   at `~/Library/Caches` by the accepted platform rules, and the endpoint suffix
   after `$HOME` is invariant at 76 bytes (`/Library/Caches` 15 + `/aipr` 5 +
   `/v1` 3 + `/` 1 + token 52). So the design's "27-byte absolute home path" is
   equivalently a hard cap of **20 UTF-8 bytes of macOS short username**
   (`/Users/` is 7). That excludes ordinary directory-bound accounts:
   `/Users/first.last@company.com` is a 29-byte home and fails at 105 bytes;
   `/Users/firstname.lastname` fails as soon as the name exceeds 20 bytes.
   The design never states this constraint in user-visible terms — it gives only
   the abstract byte count — and the recovery text for
   `APR_BROKER_ENDPOINT_TOO_LONG` ("direct the operator to a shorter supported
   user cache path", lines 170-171) has **no macOS mechanism behind it**. Unlike
   Linux, macOS in this design has no `XDG_CACHE_HOME` equivalent and no
   cache-root selection input, and "shorten your home directory" is not an
   action a user can take. An operator on such a machine hits a fail-closed
   error whose one exact recovery action cannot be performed, which violates the
   epic's stable-error contract at lines 337-338 of the epic design ("Their
   offline `explain` entries give one exact recovery action").
   This is not hypothetical headroom worry; it is the same class of defect as
   the one #56 exists to fix, one order of magnitude smaller.

2. **The cache-root anchor rule is macOS-shaped and blocks ordinary Linux first
   runs.** Lines 187-195 require `<user-cache>` to already exist and state "The
   package never creates arbitrary cache-root ancestors," failing closed with
   `APR_BROKER_CACHE_ROOT_UNAVAILABLE` otherwise. On macOS this is free —
   `~/Library/Caches` is created by the OS. On Linux the default root is
   `~/.cache` (epic design line 276; `src/broker/paths.mjs:35`), which the XDG
   Base Directory specification expects applications to create on demand with
   permission `0700`, and which is routinely absent in fresh containers, CI
   images, and newly provisioned accounts. Under this rule the first
   `peer-review start` on such a host fails with an operator-intervention error
   for a directory inside the user's own home that the package is conventionally
   entitled to create. `~/.cache` is also not "arbitrary": it is package-derived
   from a `$HOME` that the design is already willing to trust as the basis for
   the anchor. The rule as written converts a normal first-run condition into a
   support ticket on the platform most likely to run this in automation.

3. **The cache-root permission contract constrains the wrong property.** Lines
   189-190 explicitly decline to require `0700` on the anchor "because it is a
   platform or user-selected cache shared by applications." That reasoning is
   correct as far as it goes, but `0700` is not the property that matters here.
   What matters for the safety of the `aipr` child is whether the anchor is
   **writable by group or other**, because that is what lets a non-owner unlink
   or rename `aipr` and substitute a directory between validation and use. The
   design's response to that is detection (retained handles, post-conditions,
   `APR_BROKER_ENDPOINT_PARENT_LOST` fencing), which is correct but converts a
   preventable condition into a fenced-broker availability failure that,
   per lines 349-357, requires reconciling every affected project for that user.
   The anchor check enumerates absolute, user-owned, non-symlink, directory —
   and stops one property short.

4. **Verification does not cover the error codes and forbidden behaviors this
   design newly introduces.** The design adds five stable errors —
   `APR_BROKER_CACHE_ROOT_UNAVAILABLE`, `APR_BROKER_AUTHORITY_PARENT_UNSAFE`,
   `APR_BROKER_AUTHORITY_PARENT_LOST`, `APR_BROKER_ENDPOINT_PARENT_UNSAFE`,
   `APR_BROKER_ENDPOINT_PARENT_LOST` — none of which appear in the epic design's
   stable-error enumeration at lines 335-336. The Verification section (lines
   363-405) covers `brokerPaths` shape, encoding vectors, and length boundaries
   thoroughly, then hands three ownership behaviors to #43, and never requires:
   - that each new code exists in the error registry with an offline `explain`
     entry giving one exact recovery action;
   - the post-`bind()` retained-parent comparison of device, inode, socket type,
     owner, and mode, including that a mismatch closes the listener and unlinks
     **neither** entry (lines 271-278);
   - that `listenPrivate` rejects a cache-root or lock *pathname* where a live
     handle is required (lines 210-211) — a contract that is easy to satisfy
     accidentally and silently;
   - the Windows assertion the design itself claims exists. Line 136 says
     applying `dirname` to the logical pipe label is "forbidden and **tested**,"
     but the Windows verification bullet at lines 389-391 asserts only output
     keys. The design contradicts itself on a behavior it names as tested.

5. **The Supersedes clause understates the scope of what this design replaces.**
   Lines 9-14 scope supersession to the Unix socket pathname layout plus plan
   lines 172, 192, and 199. Two epic-design passages are also superseded or
   extended and are not named:
   - the layout block at epic lines 260-265, which places `broker.sock` **inside**
     `<user-cache>/ai-peer-review/brokers/<project-root-digest>/`. That is
     precisely the placement this design moves, and a reader applying the
     Supersedes clause literally would leave it standing;
   - the stable-error enumeration at epic lines 335-336, which this design
     extends by five codes (F4).
   Epic line 279 ("Use user-only directory access and refuse symlinked or
   foreign-owned endpoint and lock resources") also now governs two additional
   shared chains plus a trust anchor. Leaving these unnamed risks the plan edits
   landing while the epic design still documents the defective layout as
   accepted.

## Required changes

1. (F1) State the macOS constraint in user-visible terms — the 103-byte budget
   permits a home path of at most 27 UTF-8 bytes, i.e. a macOS short username of
   at most 20 UTF-8 bytes — and resolve the unactionable recovery. Either:
   (a) make the `APR_BROKER_ENDPOINT_TOO_LONG` recovery honest on macOS by
   stating plainly that no supported remedy exists for such accounts and that
   project-local brokering is unsupported there, and record that as an accepted
   limitation with the affected population named; or
   (b) introduce a validated cache-root selection input for macOS, subject to
   the same anchor checks as `XDG_CACHE_HOME`. Note this is a *cache-root*
   input, not the endpoint override excluded by the non-goals at line 48 — if
   the author considers it in scope of that non-goal, say so explicitly and take
   option (a). Add a verification bullet pinning the exact username boundary.

2. (F2) Define a narrow, explicit exception for the package-derived default
   cache root: when `<user-cache>` is the default derived from a validated,
   user-owned, non-symlink `$HOME` (`~/.cache` on Linux), create it `0700`
   relative to a retained home handle and apply the identical anchor
   post-conditions before use. Keep the fail-closed rule for an explicitly
   configured `XDG_CACHE_HOME`, for `%LOCALAPPDATA%`, and for macOS. If the
   author prefers to keep the absolute rule, the design must instead state that
   a missing `~/.cache` is a supported operator-intervention condition, give the
   exact command in the `APR_BROKER_CACHE_ROOT_UNAVAILABLE` recovery text, and
   acknowledge the container/CI first-run cost. Either way, add a verification
   bullet for an absent Linux default cache root.

3. (F3) Extend the cache-root anchor checks to require that the anchor is not
   group- or other-writable, or state explicitly that a writable anchor is an
   accepted residual risk whose only mitigation is post-hoc fencing, and name
   the availability consequence from lines 349-357. Add the corresponding
   verification bullet.

4. (F4) Add verification obligations for: each of the five new stable errors
   present in the error registry with a single exact `explain` recovery action;
   the post-`bind()` retained-parent device/inode/type/owner/mode comparison
   including the no-unlink-on-mismatch behavior; `listenPrivate` rejecting a
   pathname where a live handle is required; and the Windows no-`dirname`
   assertion that line 136 already claims is tested.

5. (F5) Extend the Supersedes clause to name the epic design's layout block
   (lines 260-265) and its stable-error enumeration (lines 335-336), stating
   that the new codes extend rather than replace that list, and confirm whether
   the epic document itself is to be edited or annotated.

## Optional suggestions

1. Make the attribution mechanism for `APR_BROKER_ENDPOINT_PARENT_LOST` recovery
   explicit. The recovery text at lines 352-356 requires reconciling "every
   affected project's lock, metadata, endpoint," which needs a token-to-project
   mapping. The design requires only an encoder plus a test-oracle decoder, so
   state that attribution is performed in the forward direction — enumerate the
   full-digest authority directories and re-derive each token through the same
   canonical path function — which avoids requiring a production decoder at all.

2. Record the pathname-layout version in `broker.json` v1. The design correctly
   declines to duplicate the derived token (lines 240-245), but the layout
   version is not routing identity and is cheap to record, and a future v2 drain
   design (lines 311-314) needs to know which layout a live broker bound without
   probing. This is a different field from the token and does not weaken the
   "never replaces live authentication" rule.

3. Tighten step 4 of the encoding contract (line 147). "Encode the final one-bit
   remainder with zero padding in its low four bits" is correct but reads
   ambiguously; "place the final data bit in the most-significant bit of the
   last 5-bit group and zero the remaining four bits" is unambiguous and matches
   the `a`/`q` terminal-symbol claim two sections later.

4. Consider stating that the Supersedes clause's "issue #56 implementation plan"
   does not yet exist under `docs/plans/`. Acceptance at line 410 requires peer
   review of "this design and its implementation plan," so the forward reference
   is fine, but naming it as the current replacement authority for plan lines
   172/192/199 while it is unwritten is worth a one-line note.

## Decision

revisions-requested
