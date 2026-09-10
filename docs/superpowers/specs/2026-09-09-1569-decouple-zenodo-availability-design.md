# Decouple Zenodo Availability from Release Authority Design

<!-- cspell:words Zenodo zenodo dois -->

## Problem

The `ai-peer-review` release verifier currently asks one question of every archival URL: does a live HTTP request succeed now? It treats a false result as a hard release failure for both Zenodo and Software Heritage.

That makes Zenodo landing-page availability part of release authority. The distinction matters because the published `v0.1.0` release already has an immutable signed tag, matching GitHub and npm tarball checksums, npm provenance, a Software Heritage identifier, and a registered Zenodo DOI. A transient Zenodo timeout or 5xx response says nothing about whether those durable records are authentic.

## Decision

Separate Zenodo verification into two independent observations:

1. **Archival authority:** hard-validate the registered DOI and its release metadata through DataCite.
2. **Service health:** probe the Zenodo landing page and classify only transport failures, timeouts, and HTTP 5xx responses as retryable warnings.

The authority check runs first. A warning can never compensate for missing or mismatched DOI authority. Software Heritage reachability and every existing signed-tag, repository, release, npm, checksum, provenance, commit-boundary, and manifest-byte check remain hard gates.

## Authority Contract

`scripts/verify-release.mjs` will obtain the DataCite record for `manifest.archives.zenodo.doi` through an injected observer. The observed record must satisfy every condition below:

- the resource type is `dois`;
- both `data.id` and `attributes.doi` equal the manifest DOI, case-insensitively;
- `attributes.state` is exactly `findable`;
- `attributes.publisher` is exactly `Zenodo`;
- `attributes.version` is exactly `v${manifest.version}`;
- `attributes.titles` contains the exact title `kburson/ai-peer-review: v${manifest.version}`;
- `attributes.relatedIdentifiers` contains an `IsSupplementTo` URL equal to `${manifest.repository.url}/tree/v${manifest.version}` with `resourceTypeGeneral: Software`;
- the numeric identifier in the manifest DOI suffix `zenodo.<record-id>` equals the identifier in the manifest URL path `/records/<record-id>`.

Missing, unavailable, malformed, draft/non-findable, or mismatched DataCite evidence is a hard verifier failure. The verifier does not accept title-only, publisher-only, or URL-resolution-only evidence.

The default observer uses `https://api.datacite.org/dois/<encoded-doi>`. It returns parsed JSON only after an HTTP success response. Network, timeout, non-success, and JSON-shape failures propagate as archival-authority failures without including provider response bodies in diagnostics.

## Zenodo Health Contract

After authority passes, a separate observer probes `manifest.archives.zenodo.url` with redirects enabled and a finite timeout. It returns a normalized observation rather than a boolean:

```js
{
  status: 200;
}
{
  status: 504;
}
{
  error: 'timeout';
}
{
  error: 'network';
}
```

Classification is closed and deterministic:

| Observation                                                      | Result                                                |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| HTTP 2xx                                                         | Healthy; no warning                                   |
| HTTP 5xx                                                         | Verification succeeds with a retryable Zenodo warning |
| Timeout or transport failure                                     | Verification succeeds with a retryable Zenodo warning |
| HTTP 4xx                                                         | Hard failure                                          |
| Redirect or any other unexpected status after redirect-following | Hard failure                                          |
| Malformed observation                                            | Hard failure                                          |

The successful verifier result adds a `warnings` array. A transient Zenodo failure contributes one record with provider `zenodo`, category `temporary-unavailability`, and only the normalized status or error category. Healthy verification returns an empty array. The CLI continues to emit the verifier result as JSON, so automation can distinguish authority success from degraded service health without parsing prose.

This is not a retry engine or availability monitor. The warning reports the observed condition once; a caller may decide when to retry.

## Components and Data Flow

All behavior remains in `scripts/verify-release.mjs` to avoid introducing another runtime or package boundary.

`defaultObservers(root)` gains two narrow observers:

- `zenodoDoi(doi)` fetches and parses the DataCite resource;
- `zenodoHealth(url)` returns a normalized health observation and catches only the expected timeout/transport classes.

`validateZenodoAuthority({ manifest, record })` is a pure fail-closed validator for the DOI and metadata contract. `classifyZenodoHealth(observation)` is a pure classifier that returns either no warning, a normalized warning, or a hard failure. Both are exported for focused testing, while `verifyRelease()` remains the orchestration boundary.

The archive phase becomes:

1. observe and validate the DataCite DOI record;
2. observe and classify Zenodo landing-page health;
3. preserve the existing hard Software Heritage reachability check;
4. return the existing release identity fields plus `warnings`.

No earlier verifier phase changes ordering or semantics.

## Immutable Release Boundary

The change must not modify:

- `provenance/release-manifest.json` or its `ai-peer-review.release/v1` schema;
- the signed `v0.1.0` tag or release commit `1c86f21a8aacca77dc7ebdc8299606fabfaa7e50`;
- the evidence commit `5b06e29a54ddac959f6b3d8c90c3fea8737d2766`;
- the GitHub release, npm package, Zenodo deposit/DOI, or Software Heritage archive;
- any existing public Git history.

Implementation lands as exactly one new descendant of the existing evidence commit. The release-delta verifier will require this fixed two-commit sequence after the signed release commit:

1. evidence commit `5b06e29a54ddac959f6b3d8c90c3fea8737d2766`, changing only `provenance/release-manifest.json`;
2. the #1569 correction at `HEAD`, changing exactly `scripts/verify-release.mjs` and `test/unit/verify-release.test.mjs`.

No third descendant is accepted. The observer must return ordered commit identities and per-commit paths rather than only an aggregate count/path set. The manifest bytes at the evidence commit, index, and working tree must remain identical. A negative regression will prove that an unexpected commit, reordered history, substituted evidence commit, manifest change, or unrelated path still fails.

## Error Handling

Authority failures remain prefixed `release verification failed:` and name the violated field or boundary. They do not echo complete remote payloads.

Zenodo health warnings contain no fetched body, headers, request identifiers, tokens, or raw exception messages. The normalized error category is limited to `timeout` or `network`; an unexpected exception remains a hard failure.

DataCite service unavailability remains a hard failure. This release did not previously commit a signed DataCite metadata receipt, and the design will not rewrite the existing evidence commit to fabricate one retroactively.

## Testing

`test/unit/verify-release.test.mjs` will use injected observers only. It will cover:

- exact valid DataCite metadata with healthy Zenodo;
- valid authority with Zenodo timeout, transport failure, and HTTP 5xx, each succeeding with one normalized warning;
- missing, malformed, non-findable, wrong-publisher, wrong-version, wrong-title, wrong-repository-link, and DOI/record-ID mismatch failures;
- Zenodo HTTP 4xx and malformed-health-observation failures;
- unchanged Software Heritage hard failure;
- unchanged signed-tag, GitHub/npm checksum, provenance, repository, manifest-byte, and unrelated-post-release-path failures;
- exact ordered release delta: signed release, immutable evidence commit, one verifier correction, and no further descendant;
- no live provider dependency.

The governed verification commands are the focused unit test, formatting, lint, full tests, integration tests, whitespace check, clean-status check, and commit-trail check recorded on issue #1569.

## Scope Boundaries

This defect does not replace Zenodo, mint another DOI, change archive providers, add a general retry framework, or weaken non-Zenodo release validation. It does not add a release-manifest schema revision or a retroactive cached authority receipt. Any future signed metadata-receipt design requires a separate issue and release-version policy.

## Dependency Map

Depends on no unfinished implementation issue. It consumes the already-published `v0.1.0` evidence.

It blocks #1545 until the corrected verifier passes against the public release evidence.
