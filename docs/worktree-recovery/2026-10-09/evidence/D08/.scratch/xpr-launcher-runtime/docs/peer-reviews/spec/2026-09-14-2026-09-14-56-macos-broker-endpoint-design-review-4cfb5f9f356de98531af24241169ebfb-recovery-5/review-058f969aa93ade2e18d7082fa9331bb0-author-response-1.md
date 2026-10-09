<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-058f969aa93ade2e18d7082fa9331bb0"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "e1244ecaea2924f500d003f7158f9d8d409575a9"
artifact_blob: "643abf4bee8def19e2d3930336398aa848807ffc"
artifact_digest: "sha256:599c563694dd25fd3ccee69015642529c65ef66c1c9bcf438b9db8c5ec7c7e8e"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:6fb402d9aaaee78b6d6cc7660d9c4397dcb9a9ba2810d0d15bb7cf930fc1d6ab"
  identity_source: "runtime"
started_at: "2026-09-14T17:20:27.173Z"
submitted_at: "2026-09-14T17:28:46.452Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Completed the endpoint-root seam. The security interface now has an explicit
root opener and distinct retained-handle parameter. Client behavior now requires
the same endpoint-root configuration across participants and treats metadata as
diagnostic, with an exact mismatch failure instead of implicit rerouting. The
existing overlength error, path-input edge cases, citations, ancestor safety,
and post-bind unlink wording are all reconciled.

## Finding dispositions

1. Accepted. Added
   `openPrivateRoot({ path, source, role, home }) -> { handle, identity }`, with
   explicit reuse for `endpointRootSource: cache-root` and independent opening
   for `configured`. `listenPrivate` now takes `endpointRootHandle`; its test
   rejects endpoint-root and lock pathnames.
2. Accepted in part, with the requested automatic reachability declined. Every
   participant must intentionally use the same endpoint-root setting. Metadata
   remains diagnostic and cannot silently override a client's path. A valid
   absent derived endpoint under a live lock reports the new
   `APR_BROKER_ENDPOINT_ROOT_MISMATCH`; an overlong default reports the
   platform-specific overlength recovery. Missing or invalid live metadata
   fails integrity checks. Tests cover mismatch, recovery after matching the
   setting, and no metadata rerouting.
3. Accepted. `APR_BROKER_ENDPOINT_TOO_LONG` is now explicitly in scope, its old
   “never redirected” wording is superseded, and its exact recovery is selected
   per platform. The #56 path implementation and tests own this update.
4. Accepted. The macOS and Linux-home-default rows now pin missing, empty, or
   relative `home` to `APR_BROKER_PATH_INVALID`, ratifying shipped behavior.

Optional findings 1, 3, 4, and 5 are accepted directly. Optional finding 2 is
strengthened: configured-root ancestor chains are traversed with no-follow
semantics and every ancestor must be a non-writable nonsymlink directory, so
world-writable ancestors are refused.

## Changes made

- Added the endpoint-root opener and `endpointRootHandle` interface.
- Defined complete owner/client behavior for configured, mismatched, missing,
  unreadable, stale, and overlong endpoint-root cases.
- Added `APR_BROKER_ENDPOINT_ROOT_MISMATCH` and platform-specific updates for
  `APR_BROKER_ENDPOINT_TOO_LONG`.
- Corrected the two home-input table cells and supersession citations.
- Added ancestor-chain validation, explicit absolute/retained entry wording,
  closed source-enum sets, and Windows null/source assertions.

## Declined changes and rationale

The suggested test that a client without the configured variable automatically
reaches a broker under the metadata-recorded endpoint root is declined. That
would turn unauthenticated discovery metadata into routing authority and make a
configuration error silently effective. The safer contract is explicit
configuration convergence: metadata can diagnose the mismatch, but the client
must set the recorded, independently validated root and retry before connecting.

## Verification

- Re-read every path, security, client, failure, and verification clause touched
  by the endpoint-root input and checked that string paths and live handles are
  never conflated.
- Confirmed the existing `src/broker/paths.mjs` behavior for invalid `home`,
  `XDG_CACHE_HOME`, and `%LOCALAPPDATA%` inputs matches the table.
- Ran Prettier over the design and confirmed its resulting formatting.
