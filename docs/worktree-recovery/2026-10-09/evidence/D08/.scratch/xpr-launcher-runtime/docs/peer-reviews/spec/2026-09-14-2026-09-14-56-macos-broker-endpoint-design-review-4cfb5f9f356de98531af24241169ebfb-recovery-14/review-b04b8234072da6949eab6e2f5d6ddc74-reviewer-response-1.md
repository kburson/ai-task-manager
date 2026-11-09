<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-b04b8234072da6949eab6e2f5d6ddc74"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "ea599d7c65341a4754a1ed97d7b7ba97be262ae2"
artifact_blob: "cf31df7eaa64783782c60b63daabf80a2a759e92"
artifact_digest: "sha256:2de6551fc7df755e846cc918a7d369e1b83a7e5dc31a8f7db430c3b8531ded7b"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:98d33f92a528cc80ae8f37019bef859688fac17467225d470b4e19bb39193a05"
  identity_source: "runtime"
started_at: "2026-09-14T18:52:02.017Z"
submitted_at: "2026-09-14T18:56:45.710Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed `docs/design/2026-09-14-56-macos-broker-endpoint-design.md` independently
against its stated goals, its `Supersedes` clause, and the non-superseded clauses of
`docs/design/2026-09-14-project-local-spr-xpr-broker-design.md` and
`docs/plans/2026-09-14-project-local-spr-xpr-broker.md`.

The core proposal is sound and the arithmetic is correct. I independently verified:

- `/aipr/v1/<token>` is 61 UTF-8 bytes (5 + 3 + 1 + 52), so the Darwin root budget
  is `103 - 61 = 42` and the Linux budget is `107 - 61 = 46`, matching lines 251-253,
  130-134, and 780-782.
- `/Users/kpburson/Library/Caches` is 30 bytes, so the reproduced endpoint is
  `30 + 61 = 91` bytes, matching line 251.
- The 42-byte root budget minus the 15-byte `/Library/Caches` component yields a
  27-byte home, and minus the 7-byte `/Users/` component yields a 20-byte short name,
  matching lines 253-256 and 756-757.
- A 61-byte suffix plus the shortest permitted two-byte root `/a` is exactly 63, so
  limit 62 must fail and limit 63 must yield `maxEndpointRootBytes: 2`, matching
  lines 131-134, 666-668, and 770-773.
- Base32 over 32 bytes is 256 bits, which is 51 full 5-bit groups plus a 52nd group
  carrying exactly one data bit and four zero pad bits. That confirms the 52-character
  length, the lossless round trip, the all-zero token of 52 `a`, the all-`ff` token of
  51 `7` followed by `q`, and the claim that every valid token ends in only `a` or `q`
  (lines 225-238, 747-753).
- The retained Windows label `\\.\pipe\ai-peer-review-brokers-<64hex>-broker.sock`
  is 108 units (9 + 23 + 64 + 12), matching line 673.
- The `Supersedes` targets exist and say what the correction claims. The accepted
  design's lines 260-265 do carry the `broker.sock` layout, lines 279-280 do carry the
  ownership/symlink rule, and lines 335-337 do carry the stable-error list. The plan's
  lines 172, 192, and 199 do carry the Task 3 interface, the Task 3 layout instruction,
  and the Task 4 interface. The accepted identity-tuple canonicalization at lines
  242-244 is correctly left untouched.

Four defects block acceptance. One is a reachable permanent-brick condition created
by the new predecessor-tracking rules. One is a conflict with a non-superseded clause
of the accepted design. One is an unpinned security predicate that the design states
three incompatible ways. One is a security assurance the design claims but does not
actually establish.

## Findings

### R1-F001 — Unreconciled-predecessor cap is a reachable permanent brick with an unactionable recovery

Lines 411-421 cap `unreconciled_predecessors` at 16, fail startup with
`APR_BROKER_START_FAILED` when a seventeenth would be added, and state that recovery
"is to inspect and reconcile the oldest recorded predecessor, then retry." Three other
rules combine to make that state both reachable and unrecoverable.

First, entries are created readily. Lines 460-462 and Data flow steps 5-6 (lines
649-655) publish current-instance `starting` metadata *before* the endpoint-root anchor
is validated. So a start that then fails endpoint-root validation with
`APR_BROKER_ENDPOINT_ROOT_UNAVAILABLE` leaves durable `starting` metadata naming a root
that was never validated. Lines 411-414 then require the next owner to append that
record "only when that record remains unreconciled" — and it always remains
unreconciled, because lines 396-404 say an absent, unreachable, or validation-failing
prior root is recorded as unreconciled and never traversed.

Second, entries can never be discharged. Line 412 removes an entry "only after its
exact root/layout socket is positively reconciled," and positive reconciliation is
defined at lines 388-395 as probing that exact prior socket. For a prior root that is
absent or unsafe, lines 396-404 forbid the owner from traversing it at all, so the probe
that would discharge the entry is the one action the design prohibits. The entry is
permanent by construction. Line 421 reinforces this: "No unreconciled evidence is
silently dropped."

Third, deduplication does not save it. Line 413 deduplicates "by the byte-exact root
plus layout version," so 16 *distinct* roots suffice.

The failure scenario is the exact workflow this design mandates. Lines 260-269 and
274-280 instruct a macOS user with a long home to recover by configuring
`AI_PEER_REVIEW_ENDPOINT_ROOT` to a short, private, anchor-passing absolute directory.
Finding such a root is trial and error under a 42-byte budget with ancestor-chain,
ownership, symlink, mode, and ACL constraints. A user or CI harness that tries 16
distinct candidate roots — each failing anchor validation after `starting` metadata is
already published, or each valid at the time but later removed, as with a per-run
temporary root — accumulates 16 permanent unreconciled predecessors. The seventeenth
attempt fails with `APR_BROKER_START_FAILED` before prior metadata is overwritten
(line 417), and the project's broker is then unstartable at *any* root, including the
correct one, forever.

At that point the stated recovery is unactionable. There is no documented operator
command, flag, or supported mutation that marks a predecessor reconciled or clears the
list. `broker.json` is package-written and line 423 designates it discovery-only. The
package itself refuses to traverse the absent roots that fill the list. "Inspect and
reconcile the oldest recorded predecessor" names no mechanism the user or the package
possesses.

The design's own justification for the cap (lines 419-421) is retaining evidence for
"a later migration implementation ... to discover and drain an unknown layout." That
rationale applies to *unknown-layout* predecessors (lines 405-410), where the evidence
genuinely cannot be discharged by this version. It does not apply to a
*known-layout, absent-root* predecessor, where there is provably nothing left to drain
and the entry is pure accumulation.

### R1-F002 — `APR_BROKER_START_FAILED` gains a fourth recovery, conflicting with a non-superseded accepted clause

Lines 692-699 enumerate the situation-selected recoveries for this existing error as
exactly three: enter `acquireBrokerOwnership` when no live lock exists; retry the named
owner reconciliation when a live lock accompanies an absent directory or socket; retry
the named owner startup when current-instance `starting` metadata is observed. Line 468
repeats the third. Line 417 introduces a fourth — inspect and reconcile the oldest
recorded predecessor — that appears in none of those enumerations and is not a client
routing condition at all but an owner-side metadata-capacity failure.

This collides with an accepted clause the correction does not supersede. Lines 335-337
of `docs/design/2026-09-14-project-local-spr-xpr-broker-design.md` name
`APR_BROKER_START_FAILED` among the stable startup errors and require that "their
offline `explain` entries give one exact recovery action." The correction's
`Supersedes` clause (lines 9-32) extends the stable-error *list* and explicitly states
that the new errors "extend rather than replace the accepted list"; it does not
supersede the one-exact-recovery rule. Three situation-selected recoveries already
strain that rule; a fourth in an unrelated failure class breaks it.

The verification section compounds this. Line 802 requires only that "the nine
explicitly enumerated new stable errors each exist in the offline registry with one
exact recovery action" — `APR_BROKER_START_FAILED` is not among those nine, so nothing
tests its recovery text. Line 878-879 asserts that the seventeenth append "fails before
overwriting prior metadata" but asserts nothing about what recovery the user is given.

### R1-F003 — Mode predicate for package-owned directories is never pinned and is stated three incompatible ways

Lines 296-305 correctly and explicitly pin the predicate for the *root anchors*: "A
platform cache may be shared by applications and need not be `0700`, but it must satisfy
those non-writable mode and ACL boundaries." No equivalent sentence exists for the
package-owned levels below the anchor, and the three places that discuss them disagree.

- Lines 330-343 and 344-353 say each *absent* level is created "owner-only (`0700`)",
  and that "A pre-existing level is accepted only after owner, mode, directory type,
  and no-symlink validation" — without saying which mode passes.
- Lines 472-474 and 480-482 reject a pre-existing "permissive" `ai-peer-review`,
  `brokers`, full-digest, `aipr`, or `aipr/v1` level. "Permissive" is never defined
  anywhere in the document.
- Lines 620-623 state that for the shared `aipr` level, "A plain owner-only directory
  created by another same-user application passes the shared trust checks." Read
  strictly, that implies the bar is exactly owner-only, i.e. `0700`.

The two candidate predicates disagree on a case the design itself says is realistic.
A same-user third-party application that creates `<user-cache>/aipr` as `0755` — a
completely ordinary mode for an application cache directory — passes "no group/other
write bit" and fails "exactly `0700`". Under the first reading the broker proceeds;
under the second it fails with `APR_BROKER_ENDPOINT_PARENT_UNSAFE` (lines 480-486) and
sends the user into a manual-inspection recovery for a directory that is not actually
unsafe. The whole point of lines 618-624 is to bound the `aipr` name-collision risk, and
that bound is undecidable as written.

The verification section does not resolve it either. Line 810-811 pins the predicate
for *roots* ("refused when group- or other-writable"), but line 816-819 only requires
that "permissive" conditions be "exercised" at the package-owned levels, inheriting the
same undefined term.

This also affects the Linux `home-default` exception. Lines 318-323 require the
newly created `.cache` child "to remain exactly `0700`" while a pre-existing `~/.cache`
"may be more permissive." That is a deliberate asymmetry between created and
pre-existing levels, but the design never says whether that same created-versus-existing
asymmetry governs `ai-peer-review`, `brokers`, the digest directory, `aipr`, and
`aipr/v1`.

### R1-F004 — Post-bind observation does not establish that the bound socket is the entry it observes

Lines 493-500 require the owner to bind "a Unix socket with the absolute
`paths.endpoint` pathname" and forbid `chdir` or a relative bind. Lines 502-512 then
validate through a *different* resolution path: directory-relative
`fstatat(endpointParentFd, token, AT_SYMLINK_NOFOLLOW)` against the retained
`aipr/v1` handle. Nothing correlates the two. The design states the assurance comes
"from the retained identity handles and post-condition checks for every
`endpointDirectories` entry" (lines 496-500), but re-validating the retained handle
proves a property of the retained directory, not of wherever the kernel actually
resolved the absolute pathname at `bind()` time.

The design already knows the two can diverge. Line 510-512 says a post-condition failure
"unlinks neither the entry reached through the retained `aipr/v1` handle nor the entry
at the absolute `paths.endpoint` pathname" — explicitly contemplating two distinct
entries. It contemplates that divergence only on the failure path and assumes
convergence on success.

Concrete scenario, entirely inside the design's own threat model, which treats
same-user replacement of the shared endpoint parent as in scope (lines 369-375,
718-728): the owner validates and retains `aipr/v1` at T0; another same-user process
replaces `<endpoint-root>/aipr/v1` with a different directory at T1, leaving in the
original, still-retained directory a user-owned `0600` socket entry named `<token>`;
the owner binds by absolute path at T2 and the listener is created under the *new*
`v1`. The post-bind `fstatat` through the retained handle observes the decoy: owner
matches, type is socket, mode is `0600`, no unsafe ACL. Every post-condition at lines
505-509 passes. The owner records the *decoy's* device and inode as "the owned-lifetime
cleanup baseline" and publishes `ready`.

The impersonation consequence is contained — an attacker cannot complete the handshake
without the lock's instance ID and nonce proof (lines 289-294), so clients fail closed.
But three specified guarantees do not hold. The design asserts the bound endpoint is
validated as the calling user's `0600` socket; it is not, and no check ever inspects it.
`ready` is published for an endpoint that passed no post-condition. And the pre-cleanup
contract at lines 533-538, which compares device and inode against the recorded
baseline, compares the decoy against itself — it passes, and clean release then unlinks
the decoy while the real listener's socket is orphaned at the absolute path, defeating
the cleanup contract at lines 927-932.

The design correctly explains at lines 508-510 why the listening descriptor cannot
supply the expected identity, since `fstat` on a bound Unix socket descriptor returns
the socket object's identity rather than the filesystem entry's. That constraint is
real, but it rules out only one correlation mechanism, not all of them. It does not
justify leaving the two resolution paths uncorrelated.

## Required changes

1. Resolve the predecessor-cap brick (R1-F001). Define a discharge path for
   predecessors this version can provably never reconcile. Concretely: distinguish a
   *known-layout, absent-root* predecessor — where the probe would return `ENOENT` and
   there is nothing to drain — from an *unknown-layout* or *unsafe-root* predecessor,
   and allow the former to be reconciled and removed without traversal. Separately,
   narrow entry creation by publishing `starting` metadata only after the endpoint-root
   anchor validates, or by not inheriting a predecessor from a `starting` record whose
   root never passed validation. If the cap is retained as a hard stop for the residual
   genuinely-unreconcilable cases, specify the exact operator mechanism that clears the
   list, and state which component owns it.

2. Resolve the `APR_BROKER_START_FAILED` overload (R1-F002). Either give the
   predecessor-cap overflow its own stable error with one exact recovery action, added
   to the `Supersedes` list at lines 22-30 and to the nine-error verification bullet at
   line 802, or state explicitly in the `Supersedes` clause that the accepted
   one-exact-recovery rule at lines 335-337 of the accepted design is superseded for
   `APR_BROKER_START_FAILED`, and add a verification bullet asserting each
   situation-selected recovery text.

3. Pin the mode predicate for package-owned directories (R1-F003). Add a normative
   sentence, parallel to the anchor sentence at lines 302-304, stating the exact mode
   condition under which a pre-existing `ai-peer-review`, `brokers`, full-digest,
   `aipr`, or `aipr/v1` level is accepted, and define "permissive" in terms of it. State
   whether created and pre-existing levels use the same predicate or the asymmetry at
   lines 318-323 generalizes. Then decide the `0755` same-user `aipr` case explicitly at
   lines 618-624 and add a verification bullet asserting that exact outcome.

4. Close the bind/observation correlation gap (R1-F004). Require the success path to
   prove the bound entry is the observed entry. Any of the following is sufficient, and
   the design should pick one: re-verify the retained `aipr/v1` handle's device and
   inode against a `fstatat`/`lstat` of the absolute `paths.endpoint` parent immediately
   after bind, before recording the cleanup baseline; or additionally `lstat` the
   absolute `paths.endpoint` and require its device and inode to equal those observed
   through the retained handle; or state explicitly that same-user replacement of the
   shared endpoint parent between validation and bind is out of scope, and reconcile
   that with lines 369-375 and 718-728, which currently treat it as in scope. Whichever
   is chosen, add a verification bullet under the existing post-bind bullet at lines
   846-850 asserting that an injected mid-bind parent swap is detected and that neither
   entry is unlinked.

## Optional suggestions

1. Line 788-793 requires that `home`, `XDG_CACHE_HOME`, `LOCALAPPDATA`, and
   `AI_PEER_REVIEW_ENDPOINT_ROOT` values with trailing separators or `.`/`..` components
   "are rejected rather than collapsed, with the exact variable named." The bullet is
   unscoped, but the Windows input-table row at line 167 ignores all
   `AI_PEER_REVIEW_ENDPOINT_ROOT` values, and the Windows row at line 164 has no
   `XDG_CACHE_HOME`. Scope the bullet to the platforms where each variable is read, so
   it does not contradict the input table it is meant to verify.

2. Line 321-322 says a pre-existing `~/.cache` "may be more permissive for its owner."
   `0700` is already maximal for the owner, so the qualifier is not meaningful. The
   intended sense appears to be "more permissive than `0700` in its group and other
   read and execute bits." Rewording would remove an ambiguity in exactly the sentence
   that carries the Linux creation exception.

3. Line 682-684 describes the mismatch trigger as `ready` metadata that "names a
   different validated endpoint root." At that point the client has deliberately not
   validated the recorded root — lines 560-561 state it "touches neither endpoint root
   until configuration converges," and the recovery at lines 558-560 defers validation
   to a later retry. Dropping "validated" here would keep the Failure behavior wording
   consistent with the client contract at lines 553-561.

4. Lines 356-361 state that the `0177` umask window "can only make unrelated concurrent
   creations more restrictive." That holds for the window itself, but the `finally`
   restore at line 358 writes a process-global value and would clobber a umask set by a
   worker thread during the window. Node worker threads share the process umask. The
   design's defenses do not depend on umask, since every package-owned directory is
   created with an explicit mode and validated by post-condition, so this is a wording
   precision issue rather than a security gap. Narrowing the claim to the window, and
   noting that the restore is unconditional, would make the reasoning exact.

## Decision

revisions-requested
