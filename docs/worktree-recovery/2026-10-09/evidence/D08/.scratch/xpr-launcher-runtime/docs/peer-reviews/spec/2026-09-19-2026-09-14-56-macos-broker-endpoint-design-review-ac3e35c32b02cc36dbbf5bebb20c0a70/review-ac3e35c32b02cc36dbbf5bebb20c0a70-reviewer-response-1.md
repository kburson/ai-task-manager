<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-ac3e35c32b02cc36dbbf5bebb20c0a70"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "ce566ab6b16da78b546d184eb6862e601d0f5387"
artifact_blob: "4cb0d0b2a1add9d6367d89dbdf0809be65c39d7e"
artifact_digest: "sha256:ae5b023ce0d532cf6a9d45273b9bce71f035bf56a8423f57c141de74f36dc463"
agent:
  host: "grok"
  provider: "xai"
  model_id: "grok-4.6"
  model_display: "Grok 4.6"
  session_fingerprint: "sha256:6e38e20db3f9790942d546708b8e4ed7fed8b07c4f9ed8b10603bdb0ec52c1cb"
  identity_source: "runtime"
started_at: "2026-09-19T21:08:22.756Z"
submitted_at: "2026-09-19T21:17:32.979Z"
finding_ids: ["R1-F001","R1-F002"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Independent spec review of `docs/design/2026-09-14-56-macos-broker-endpoint-design.md` (blob `4cb0d0b2a1add9d6367d89dbdf0809be65c39d7e`) against the named clauses of `docs/design/2026-09-14-project-local-spr-xpr-broker-design.md` and `docs/plans/2026-09-14-project-local-spr-xpr-broker.md`.

The core correction is sound. Darwin `sys/un.h` in the active SDK declares `sun_path[104]`. Independently verified:

- Old pathname `/Users/kpburson/Library/Caches/ai-peer-review/brokers/<64-hex>/broker.sock` is 130 UTF-8 bytes; `/x/Library/Caches/.../broker.sock` is 117.
- `/aipr/v1/<52-char-token>` is 61 UTF-8 bytes, so Darwin `maxEndpointRootBytes` is `103 - 61 = 42` and Linux is `107 - 61 = 46`.
- Default `/Users/kpburson/Library/Caches/aipr/v1/<token>` is 91 bytes. A 27-byte home plus `/Library/Caches` (15) is a 42-byte root and a 103-byte endpoint; a 28-byte home is 104 and must be refused. `/Users/` is 7 bytes, so the default short-name limit is 20.
- 32 digest bytes are 256 bits = 51 full 5-bit groups plus one leftover bit, hence 52 RFC 4648 base32 characters with four zero pad bits. All-zero encodes to 52 `a`; all-`ff` encodes to 51 `7` then `q`.
- Windows `\\.\pipe\ai-peer-review-brokers-<64-hex>-broker.sock` is 108 units (9 + 23 + 64 + 12).
- Named `Supersedes` targets exist and match: accepted design 260–265 (combined sock/lock/json layout), 279–280 (owner-only/symlink rule), 335–337 (stable-error list); plan 172 (Task 3 `brokerPaths` shape), 192 (Task 3 layout), 199 (Task 4 interface paragraph). Identity-tuple canonicalization at accepted design 242–244 is correctly left untouched.

I also checked the four defects that blocked the prior draft of this correction. In this artifact they are resolved: known-layout absent predecessors discharge without unlink; `starting` is published only after the current endpoint root validates; the 16-entry overflow is `APR_BROKER_PREDECESSOR_LIMIT` rather than a fourth `APR_BROKER_START_FAILED` recovery; package-owned levels are pinned to exact `0700` with same-user `0755` refused as permissive; post-bind success correlates retained-parent and absolute parent/endpoint device/inode.

Two remaining defects block acceptance. Both are closed-contract conflicts created by this correction: one against a non-superseded Task 4 handshake clause, and one against the document’s own Windows cache-root mapping in the new cross-domain recoveries.

## Findings

### R1-F001 — Required live `cacheRoot` handshake field contradicts the non-superseded closed handshake

This correction adds a required live handshake field while declaring that handshake requirements remain in force and while giving itself precedence only for named clauses that do not include the closed handshake.

Lines 17–18 state that this correction has precedence only for the clauses named in the `Supersedes` paragraph. Lines 32–33 then say the handshake requirements remain in force. The named plan clauses are only 172, 192, and 199. They do not include plan line 213:

> The handshake contains the full root tuple, versions, instance ID, and nonce proof and compares the kernel-reported user. Reject unknown fields, truncated frames, wrong project, and all version mismatches before accepting any command.

Accepted design 253–254 is the matching live-endpoint list: full root tuple, peer OS user, instance ID, and nonce. Neither list contains an authority cache root.

This artifact nevertheless requires that field. Lines 290–295: authentication continues to require “the authority `cacheRoot`” in the live handshake; “A responder reports its canonical authority cache root as part of the authenticated handshake; it is never inferred from the shared socket pathname.” Lines 460–468 make that report the sole input to `APR_BROKER_AUTHORITY_CACHE_MISMATCH`, and they refuse to treat metadata as a substitute.

Those two contracts cannot be implemented together. A Task 4 owner following sealed plan 213 must reject a `cacheRoot` member as an unknown handshake field. A Task 4 owner following lines 290–295 must send and require that member. Because lines 17–18 deny this document precedence over unnamed clauses, the sealed epic plan wins and the new mismatch error cannot be produced from a trusted peer report.

This is not a future-plan detail. The issue #56 plan is authorized to replace only lines 172, 192, and 199. Line 213 remains executable epic-plan authority unless this spec names it.

The security claim at lines 625–630 depends on the missing supersession: lock exclusivity is per resolved cache root, so two cache-root domains can share one socket, and only live handshake comparison of `cacheRoot` distinguishes that collision from a same-domain instance/nonce disagreement. Metadata cannot carry that comparison (lines 452–457, 577–578). The field has to be in the closed handshake, and the closed handshake has to be named as superseded.

### R1-F002 — New cross-domain recoveries omit Windows `%LOCALAPPDATA%`

`APR_BROKER_AUTHORITY_CACHE_MISMATCH` and `APR_BROKER_ENDPOINT_COLLISION` exist to diagnose two lock domains that share one endpoint. Their one-exact recoveries name only `XDG_CACHE_HOME`, `home`, and (for collision) `AI_PEER_REVIEW_ENDPOINT_ROOT`.

Lines 465–466: CACHE_MISMATCH’s sole action is to converge `XDG_CACHE_HOME` or `home`. Lines 750–754 repeat that. Lines 545–547: COLLISION recovery is to converge `XDG_CACHE_HOME` or `home` and `AI_PEER_REVIEW_ENDPOINT_ROOT`. Lines 755–759 repeat that.

Windows cache-root input is `%LOCALAPPDATA%` (input table, line 165). Windows ignores `AI_PEER_REVIEW_ENDPOINT_ROOT` (line 168). The Windows endpoint is the digest-only named pipe at lines 214–218, so two Windows processes for one digest always share the endpoint even when their cache roots differ. That is the cross-domain case these errors exist to cover. Verification 860–868 requires both the authenticated CACHE_MISMATCH path and the bind-time COLLISION path.

An operator on Windows who follows the stated recovery cannot repair the condition: neither named POSIX variable selects `cacheRoot` on that platform. The accepted design’s one-exact-recovery rule at lines 335–337 remains in force for these extended errors (this document extends the list rather than replacing that rule). A recovery that names the wrong platform variables is not an exact recovery.

## Required changes

1. Name the closed handshake as superseded (R1-F001). Add plan line 213 and the live-endpoint verify sentence at accepted design 253–254 to the named `Supersedes` clauses. State the expanded closed handshake field set: full root tuple, package version, broker protocol version, Node major, authority `cacheRoot`, instance ID, nonce proof, and kernel-reported peer user, still rejecting unknown fields. Keep the rule that `cacheRoot` is never inferred from the socket pathname or from metadata. Add a verification bullet that a handshake omitting `cacheRoot`, or containing an extra field, fails closed with the existing broker-integrity error and never yields `APR_BROKER_AUTHORITY_CACHE_MISMATCH`.

2. Name `%LOCALAPPDATA%` in the CACHE_MISMATCH and COLLISION recoveries (R1-F002). The sole CACHE_MISMATCH action must converge the cache-root inputs the input table actually reads: `home` on macOS, `XDG_CACHE_HOME` or `home` on Linux, `%LOCALAPPDATA%` on Windows. COLLISION recovery must include that same cache-root convergence, plus `AI_PEER_REVIEW_ENDPOINT_ROOT` only on POSIX. Add a verification bullet that the Windows offline `explain` text for both errors names `%LOCALAPPDATA%` and does not instruct the operator to set `AI_PEER_REVIEW_ENDPOINT_ROOT`.

## Optional suggestions

1. Line 199 is superseded as a whole Task 4 **Interfaces** paragraph, but the replacement restates only `openPrivateRoot`, the new `openPrivateDirectory` handle requirement, and the new `listenPrivate` signatures. Restating the unchanged `platformSecurity()` exports (`canonicalPath`, `userId`, `acquireExclusive`, `peerUser`) and the `acquireBrokerOwnership` / `connectBroker` argument objects would make the replacement closed, matching how line 172 restates the full `brokerPaths` shape.

2. Lines 506–513 correctly carve an absolute-bind exception because Darwin and Linux have no `bindat`. Plan line 212 still says the native helper uses directory-relative no-follow file operations with no exception. Naming 212 as partially superseded, or stating that 212 remains except for the socket bind, would keep that exception inside the precedence rule at lines 17–18.

## Decision

revisions-requested

