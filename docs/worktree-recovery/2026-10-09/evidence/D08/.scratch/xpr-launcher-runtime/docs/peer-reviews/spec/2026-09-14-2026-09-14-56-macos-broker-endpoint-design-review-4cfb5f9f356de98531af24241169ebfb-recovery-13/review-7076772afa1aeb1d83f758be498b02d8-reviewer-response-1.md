<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7076772afa1aeb1d83f758be498b02d8"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "806897b31341f78a5f74ed8c7b25f1a12f7aa829"
artifact_blob: "e836d1fb646dd8b1e55ba03b7d7597f9cee5abad"
artifact_digest: "sha256:19e292736896bafd1d120048bd56a826537f0c79ac5356717fad7bffdc7cb813"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:2fc4b3bf97e10270ca4e8b7047d4c8b298c412b44ee133e591ac4f050bf39e99"
  identity_source: "runtime"
started_at: "2026-09-14T18:41:01.981Z"
submitted_at: "2026-09-14T18:46:51.970Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed `docs/design/2026-09-14-56-macos-broker-endpoint-design.md` independently
against the accepted epic design
(`docs/design/2026-09-14-project-local-spr-xpr-broker-design.md`), the accepted plan
(`docs/plans/2026-09-14-project-local-spr-xpr-broker.md`), and the shipped path layer
(`src/broker/paths.mjs`).

The core correction is sound. I re-derived every numeric claim in the document and all
of them check out:

- RFC 4648 base32 over 32 bytes yields `ceil(256 / 5) = 52` symbols, with the 52nd
  group carrying one data bit plus four zero pad bits. The all-zero vector is 52 `a`;
  the all-`ff` vector is 51 `7` followed by `q` (`10000` = index 16 = `q`); every valid
  token therefore ends in `a` or `q`. The document's stated vectors are correct.
- The suffix `/aipr/v1/<token>` is `1 + 4 + 1 + 2 + 1 + 52 = 61` bytes. Darwin
  `103 - 61 = 42`; Linux `107 - 61 = 46`. Both stated budgets are correct.
- `/Users/kpburson/Library/Caches` is 30 bytes, so the corrected endpoint is
  `30 + 61 = 91` bytes, as claimed.
- macOS default: `cacheRoot = home + 15`, so the 42-byte root budget yields a 27-byte
  home and a 20-byte `/Users/<short-name>` name limit. `27 + 15 + 61 = 103` exactly,
  and 28 bytes gives 104. Correct.
- The stated defect magnitudes reproduce: the accepted layout is
  `30 + 15 + 8 + 65 + 12 = 130` bytes under the real home and
  `17 + 15 + 8 + 65 + 12 = 117` bytes under home `/x`.
- `61 + 2 = 63` is the correct floor for a POSIX limit that can hold the suffix plus
  the shortest permitted two-byte root, and limit `63` with root `/a` does yield
  `maxEndpointRootBytes: 2` at an exact-limit endpoint.
- The "nine new stable errors" count is exact, and the four errors the document treats
  as pre-existing (`APR_BROKER_PATH_INVALID`, `APR_BROKER_ENDPOINT_LIMIT_INVALID`,
  `APR_BROKER_ENDPOINT_TOO_LONG`, `APR_BROKER_ENDPOINT_UNSUPPORTED`) do exist in
  shipped `src/broker/paths.mjs`. The document is also correct that the shipped
  `APR_BROKER_ENDPOINT_TOO_LONG` recovery text ("broker endpoints are never truncated
  or redirected") must change, and it requires that change in Verification.
- Rejecting base64url as non-injective on case-insensitive volumes is correct, and the
  selected lowercase base32 alphabet (`a-z2-7`) has no case-fold collisions.

The separation of `cacheRoot` (authority) from `endpointRoot` (routing), the retention
of the unversioned full-digest lock as the single mutual-exclusion point, and the
transport-failure-only unlink rule are all well reasoned, and the cross-cache-root
collision analysis in "Compatibility and migration" is the strongest part of the
document.

Four issues need resolution before acceptance. Two are substantive: the
`unreconciled_predecessor` field cannot carry the evidence chain it is introduced to
preserve, and the mandated no-follow mechanism for the socket entry itself is not
realizable on Linux as written. The other two are specification gaps that this
document's own standard of precision demands be closed.

## Findings

1. **`unreconciled_predecessor` is a single slot with no carry-forward rule, so the
   drain evidence it exists to preserve is destroyed after two endpoint-root changes.**
   Lines 405–409 define the field as `null` or a single object. Lines 384–391 and
   392–398 both write that one slot. Neither those paragraphs nor the metadata schema
   says what an owner does when the prior metadata it reads *already* carries a
   non-null `unreconciled_predecessor`.

   Concretely, with endpoint roots A → B → C: the owner starting at C reads B's
   metadata, which records `endpoint_root: B` and
   `unreconciled_predecessor: {endpoint_root: A, ...}`. Whether B reconciles or not,
   C's new metadata can name at most B. A is dropped, and with it the only record that
   a socket may still exist there.

   This directly contradicts the stated purpose at lines 396–398: "A later migration
   implementation therefore retains the evidence needed to discover and drain the
   unknown layout." Under any repeated change, it does not.

   The forward-attribution fallback at lines 884–889 does not cover this. It enumerates
   the full-digest authority directories and "re-derive[s] its endpoint token through
   the canonical path function" — but that function derives tokens under the *current*
   environment-derived endpoint root, so it cannot reach a socket orphaned under a
   forgotten root A. The gap is real and unmitigated.

   This matters most in exactly the situation the document creates: the explicit
   `AI_PEER_REVIEW_ENDPOINT_ROOT` setting is the *supported* macOS recovery for a long
   home, so operators changing it more than once is an expected path, not an exotic one.

2. **The post-bind and secure-ready observations and the endpoint `chmod` are specified
   as operations that cannot be performed on a socket inode, and the `chmod` form
   mandated is unsupported on Linux.** Lines 479–495 require that the observation
   "opens the socket entry relative to the retained `aipr/v1` handle with no-follow
   semantics", and lines 349–352 require that `listenPrivate` "uses the retained parent
   handle with no-follow semantics to set the same filesystem entry to exactly `0600`".

   Neither is realizable as written:

   - `open()` on a UNIX-domain socket file fails with `ENXIO` on both Darwin and Linux.
     The socket entry cannot be opened at all, by any descriptor-relative or absolute
     form. The fields the observation actually needs — owner, type, mode, device,
     inode — are available from `fstatat(dirfd, name, &st, AT_SYMLINK_NOFOLLOW)`, which
     is not an open.
   - `fchmodat(dirfd, name, 0600, AT_SYMLINK_NOFOLLOW)` returns `ENOTSUP` on Linux;
     glibc does not implement the no-follow flag for `fchmodat`. Darwin supports it.
     There is therefore no single portable descriptor-relative no-follow `chmod`.
   - Node core exposes no `*at` family at all — no `openat`, `mkdirat`, `fstatat`, or
     `fchmodat` — so every retained-handle operation in this design requires the native
     layer from issue #43. That is presumably intended, but the design never says so,
     and issue #43 is the layer this document defers to.

   Read literally against line 353 ("Any platform that cannot enforce the sequence fails
   closed"), Linux fails closed unconditionally, which would defeat the correction.

   This is a gap in an area the author clearly reasoned about: lines 469–476 explicitly
   acknowledge that "Darwin and Linux provide no `bindat` operation" and substitute
   retained identity handles and post-conditions. The same class of problem applies to
   `open` and `chmod` on the socket entry and is not acknowledged.

3. **Parent and anchor safety is defined purely in mode bits, which is not sufficient on
   macOS — the one platform this document exists to correct.** Lines 296–299 and
   301–308 define the contract as "an absolute, user-owned, non-symlink directory that
   is not writable by group or other", and every `*_PARENT_UNSAFE` condition is stated
   in terms of owner, mode, type, and symlink status. ACLs are never mentioned; the only
   ACL in the document is the Windows named-pipe DACL.

   On macOS APFS, extended ACLs are independent of the permission bits. A directory can
   be `drwx------` by `stat()` and still carry, for example,
   `user:bob allow write,add_file,delete_child`. Such an endpoint root passes
   `openPrivateRoot`, and the inheritable form propagates into the `aipr` and `aipr/v1`
   children the package creates at `0700`. `APR_BROKER_ENDPOINT_PARENT_UNSAFE` would not
   fire.

   I want to be precise about the blast radius, because it is bounded: impersonation is
   still blocked, since the handshake requires the kernel-reported peer user (lines
   287–291), and a foreign user pre-creating `aipr` would be caught as foreign-owned.
   The residual is that a foreign local user can unlink or replace the socket entry,
   which the identity observations convert into a fail-closed fence — denial of service
   and spurious `APR_BROKER_ENDPOINT_PARENT_LOST`, not a trust break.

   Bounded is not the same as out of scope. Every other trust boundary in this document
   is stated explicitly, and a macOS-specific correction should not leave the macOS
   ACL question unstated.

4. **The client's gating rule for endpoint-root traversal has no defined outcome when no
   live lock exists, yet the no-live-lock path is described as if traversal happened.**
   Line 533 states the gate as universal: "Only after that comparison passes does the
   client open and validate its derived endpoint-root anchor and reach existing
   `endpointDirectories` entries relative to retained parents."

   The comparison at lines 525–531 can only be reached by "current-instance,
   supported-layout `ready` metadata" (line 524), and metadata currency is established
   "from the live lock instance and nonce binding" (lines 519–520). With no live lock,
   currency can never be established, so the comparison can never pass, so the gate can
   never open.

   But lines 538–540 describe an outcome that presupposes traversal: "If an
   endpoint-directory level is safely absent and no live lock is available,
   `connectBroker` reports the existing `APR_BROKER_START_FAILED` owner election
   outcome." Under the gate, a client with no live lock can never observe whether an
   endpoint-directory level is absent.

   Verification line 857–859 implies the intended behavior — "without a live lock, the
   client reports owner election/start failure and likewise creates nothing" — i.e. the
   no-live-lock case short-circuits to owner election *before* any traversal. The
   normative prose does not say this, and lines 538–540 say something that contradicts
   it.

## Required changes

1. Resolve finding 1. Define what an owner does with a non-null
   `unreconciled_predecessor` inherited from prior metadata. Any of the following is
   acceptable, but the document must pick one and say so normatively in both the
   metadata schema (lines 400–424) and the owner reconciliation rules (lines 384–398):

   - change the field to a bounded ordered list of unreconciled predecessors, with an
     explicit cap and an explicit rule for what is dropped at the cap;
   - keep the single slot but require the inherited predecessor to be carried forward
     unchanged whenever the immediately prior root reconciles cleanly, and state what
     happens when two roots are simultaneously unreconciled; or
   - keep the single slot and state explicitly, in "Failure behavior" and in the orphan
     paragraph at lines 891–896, that evidence depth is one and that a socket orphaned
     under a twice-superseded root is permanently unattributable.

   Whichever is chosen, add a Verification bullet exercising the A → B → C sequence and
   asserting the resulting predecessor content, and correct or qualify the claim at
   lines 396–398 so it is true of the chosen rule.

2. Resolve finding 2. Replace "opens the socket entry relative to the retained
   `aipr/v1` handle" in both observations (lines 479–495) with the primitive actually
   being specified — a directory-relative no-follow `stat` of the entry — and specify
   the endpoint `chmod` mechanism concretely, given that
   `fchmodat(..., AT_SYMLINK_NOFOLLOW)` is unavailable on Linux. State the accepted
   Linux form and the residual window it leaves, in the same register as the existing
   `bindat` paragraph at lines 469–476: the preceding no-follow `stat` establishes that
   the entry is a socket rather than a symlink, and the secure-ready device/inode
   comparison at lines 488–493 closes the window by detecting any substitution. Also
   state explicitly that the retained-handle model across this design requires issue
   #43's native layer, since Node core exposes no `*at` family.

3. Resolve finding 3. State the ACL scope decision explicitly in "Security and
   ownership". Either require that `openPrivateRoot` and the per-level validation reject
   an anchor or package-owned directory carrying an extended ACL on platforms that
   support one, or state that ACLs are out of scope for v1, name the residual exposure
   (a foreign local user granted write on a mode-0700 parent can unlink or replace the
   endpoint entry), and name the mitigations that remain (peer-credential
   authentication blocks impersonation; the identity observations convert replacement
   into a fail-closed fence). If ACLs are checked, add the corresponding Verification
   bullet; if they are not, the exclusion belongs in "Non-goals".

4. Resolve finding 4. Make the no-live-lock short-circuit normative in the client
   paragraph at lines 515–546: state that absence of a live lock terminates in the owner
   election outcome before the endpoint-root anchor is opened or any
   `endpointDirectories` entry is reached, and rewrite lines 538–540 so the
   directory-absence branch is scoped to the live-lock case only. The intent already in
   Verification lines 857–859 is correct; the normative prose must match it.

## Optional suggestions

1. **Pin the precedence between `APR_BROKER_ENDPOINT_LIMIT_INVALID` and
   `APR_BROKER_PATH_INVALID`.** Lines 131–134 and 641–643 require the below-63 limit
   check to fire "before any path is derived" / "before path derivation", but in shipped
   `src/broker/paths.mjs` the root inputs are validated inside `cacheRoot()` as part of
   derivation, and `verifyEndpointLength` runs after. A process with both a below-63
   limit and a noncanonical `home` has two applicable errors, and nothing says which is
   reported. Since derivation is side-effect-free string work, "before derivation" is
   only observable as a precedence claim, so state it as one. This document pins
   precedence carefully everywhere else — `APR_BROKER_INCOMPATIBLE` over root mismatch
   over `APR_BROKER_START_FAILED` — and this is the one place it is left open.

2. **`ENOENT` in the removal-authorizing list at lines 370–373 is vacuous.** A connect
   that fails with `ENOENT` proves the socket entry does not exist, so there is nothing
   to unlink; the clause "permits removal of that exact stale socket" cannot apply to
   it. Listing it alongside `ECONNREFUSED` invites an implementation to treat `ENOENT`
   as a removal path and attempt an unlink that can only race. Either drop it or state
   that `ENOENT` terminates the reconciliation branch with no removal.

3. **Note that `process.umask(0077)` is process-global.** Line 349 mandates binding
   "under process umask `0077`". In Node this mutates state shared by all concurrently
   executing async work, including the atomic metadata publication this design requires.
   The direction is fail-safe — concurrent creations become more restrictive, not less —
   and the explicit `chmod` plus post-conditions are the real guarantee. Saying so, and
   requiring save/restore around the bind, would keep an implementer from either
   omitting the restore or treating the umask as the security control.

4. **Say that macOS `TMPDIR` is not a usable endpoint root.** The recovery at lines
   260–277 tells an operator to provision "an existing shorter, private absolute
   directory", and the obvious macOS candidate is the per-user `$TMPDIR` under
   `/var/folders/...`. It is excluded twice over: it runs about 49 bytes against a
   42-byte budget, and `/var` is a symlink to `/private/var`, which `openPrivateRoot`
   refuses during ancestor traversal. An operator who tries it gets
   `APR_BROKER_ENDPOINT_ROOT_UNAVAILABLE` with no indication that the whole approach is
   a dead end. One sentence naming `TMPDIR` and `/tmp` as unusable would save that loop.

5. **Disambiguate the Linux `home-default` post-conditions.** Lines 310–316 say the
   created `.cache` child gets "the identical root owner, mode, type, and no-symlink
   post-conditions". If "identical mode post-condition" means exactly `0700`, it
   conflicts with lines 296–298, which accept a shared platform cache that "need not be
   `0700`" so long as it is not group- or other-writable — and a pre-existing `~/.cache`
   is conventionally `0755`. Stating which of the two rules applies to the created child
   versus a pre-existing one would remove the ambiguity.

6. **Consider stating that `endpoint_root_source` is excluded from the mismatch
   comparison.** Lines 654–661 define `APR_BROKER_ENDPOINT_ROOT_MISMATCH` on the root
   value, and metadata records the source enum alongside it. A client that reaches the
   cache root by explicit `AI_PEER_REVIEW_ENDPOINT_ROOT` configuration and an owner that
   reached the byte-identical path by default have equal roots and different sources.
   Connecting is the right behavior; making the exclusion explicit prevents an
   implementer from comparing the recorded pair.

## Decision

revisions-requested
