<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-49caf706a41c040538343545ff0d9c6b"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "1ed9b97ee986c25820f47e825f8126f07ec2ffbe"
artifact_blob: "af7ed317df55622f96b8482adaca69b3858a1953"
artifact_digest: "sha256:9240394a169ff008ab6133476c3f8b4d7e8ec0b06496d9db5ced6a28be11d8cc"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:6fb402d9aaaee78b6d6cc7660d9c4397dcb9a9ba2810d0d15bb7cf930fc1d6ab"
  identity_source: "runtime"
started_at: "2026-09-14T18:11:36.586Z"
submitted_at: "2026-09-14T18:25:13.268Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The revision closes the cross-cache-root collision by making endpoint
reclamation transport-failure-only and authenticating the authority cache root
in the live handshake. It also scopes root-input canonicalization separately
from project-identity canonicalization and makes unknown-layout precedence
consistent for both `starting` and `ready` metadata.

## Finding dispositions

- `R1-F001` — accepted. A process holding a different authority lock can no
  longer unlink an accepting peer. The handshake now reports and authenticates
  `cacheRoot`; divergence produces the new fail-closed
  `APR_BROKER_AUTHORITY_CACHE_MISMATCH` diagnostic.
- `R1-F002` — accepted. The no-symlink-resolution rule now applies only to the
  four cache/endpoint root inputs. The accepted physical project-root and
  Windows spelling canonicalization remains explicit and unsuperseded.
- `R1-F003` — accepted. Compatibility now applies unknown-layout refusal to
  current-instance `starting` and `ready` metadata identically.

## Changes made

- Restricted stale-socket unlink to transport-level no-listener results such as
  `ECONNREFUSED` and `ENOENT`. Any accepting transport is live for reclamation
  purposes; later authentication failure preserves the socket.
- Added `cacheRoot` to the authenticated handshake, defined
  `APR_BROKER_AUTHORITY_CACHE_MISMATCH`, specified its exact diagnostics and
  recovery, corrected the lock-domain compatibility argument, and added the
  divergent-cache-root verification scenario.
- Scoped symlink and case-sensitive equality statements to root inputs and
  POSIX comparison, while explicitly preserving accepted identity-tuple and
  Windows canonicalization.
- Applied unknown-layout precedence to both metadata publication states.
- Adopted five optional precision improvements: a distinct
  `APR_BROKER_ENDPOINT_ROOT_UNAVAILABLE` error, softer device/inode replacement
  wording, the exact `platform.maxEndpointLength` field, eviction-versus-unsafe
  endpoint-parent recovery text, and POSIX scoping for
  `maxEndpointRootBytes` error details.

## Declined changes and rationale

The optional overlength diagnostic lookup was not adopted. Endpoint preflight
remains guaranteed to fail before resource access; opening the authority cache
and metadata solely to suggest a configured root would weaken that simple
boundary and add a second precedence path. The stable error already gives the
supported administrator-provisioning action without treating metadata as
routing authority.

## Verification

- Rechecked all three sealed findings against the accepted epic design and the
  current `brokerPaths` interface.
- Ran `npx prettier --check` on the correction design and this author response.
- Scanned the revised design for the superseded contradictory phrases and old
  six-error count.
