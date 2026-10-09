# MCP Server Dependency Audit

<!-- cspell:words cfworker eventsource fastify hono jose modelcontextprotocol pkce -->

Date: 2026-09-11

Issue: AITM #1547, Task 16

## Decision

Approve exact-pinned `@modelcontextprotocol/sdk@1.30.0` for the local MCP stdio
boundary. Keep delivery authority, filesystem watching, cursor semantics, and
manual recovery independent of the SDK. Import only the MCP server and stdio
entry points; do not start or expose the package's HTTP, OAuth, client, or
experimental task surfaces.

Reject `@modelcontextprotocol/server@2.0.0` for this release. Although its
declared graph is narrow, its published server bundle eagerly imports an AJV
validator containing vulnerable `fast-uri@3.1.0`. That code is loaded by the
stdio entry point, is omitted from the package's declared dependency graph, and
cannot be replaced by an npm override. The package is not eligible until an
upstream release rebuilds it with a patched `fast-uri`.

Also reject handwritten MCP framing. The official v1 SDK is broader than the v2
server package, but its fully declared, overridable graph resolves to patched
dependencies and preserves standard MCP initialization, discovery, cancellation,
schema validation, error envelopes, and stdio framing.

## Approved Package Identity

| Field             | Audited value                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Package           | `@modelcontextprotocol/sdk`                                                                       |
| Version           | `1.30.0`                                                                                          |
| License           | MIT                                                                                               |
| Node engine       | `>=18`                                                                                            |
| Registry modified | `2026-07-27T17:56:02.091Z`                                                                        |
| Integrity         | `sha512-xKd8OIzlqNzcqcNumGAa6g+PW2kjD5vrpcKOnfldAUPP3j7lnqMPwlTXQm8gF+UwH72z0lqaRbjr9hqGz0eITA==` |
| Registry tarball  | `https://registry.npmjs.org/@modelcontextprotocol/sdk/-/sdk-1.30.0.tgz`                           |

The package's Node floor is below this project's existing Node `>=22` floor.
The published `LICENSE` is MIT and matches the registry metadata.

Official sources:

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP server guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)
- [MCP package layout](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/get-started/packages.md)
- [npm package metadata](https://www.npmjs.com/package/@modelcontextprotocol/sdk)

## Runtime Graph

An isolated archive of exact Phase 1 commit
`f7c535909b6cf5c695459d8537fd61ead0122582` was installed with the approved exact
package and pruned with `npm prune --omit=dev`. Its lockfile contains 96
production install entries representing 92 unique package/version pairs. License
metadata across those entries is 86 MIT, 7 ISC, 2 BSD-3-Clause, and 1
BSD-2-Clause; no unknown or copyleft license was observed.

The approved SDK declares these 17 direct runtime dependencies. This project
also declares exact `zod@4.6.2` directly because `src/mcp/server.mjs` imports it;
the direct declaration prevents reliance on npm hoisting and adds no package to
the already-audited installed graph.

| Package              | Declared range        | Audited resolution |
| -------------------- | --------------------- | ------------------ |
| `@hono/node-server`  | `^1.19.9 \|\| ^2.0.5` | `2.1.1`            |
| `ajv`                | `^8.17.1`             | `8.20.0`           |
| `ajv-formats`        | `^3.0.1`              | `3.0.1`            |
| `content-type`       | `^1.0.5`              | `1.0.5`            |
| `cors`               | `^2.8.5`              | `2.8.6`            |
| `cross-spawn`        | `^7.0.5`              | `7.0.6`            |
| `eventsource`        | `^3.0.2`              | `3.0.7`            |
| `eventsource-parser` | `^3.0.0`              | `3.1.1`            |
| `express`            | `^5.2.1`              | `5.2.1`            |
| `express-rate-limit` | `^8.2.1`              | `8.7.0`            |
| `hono`               | `^4.11.4`             | `4.13.7`           |
| `jose`               | `^6.1.3`              | `6.2.12`           |
| `json-schema-typed`  | `^8.0.2`              | `8.0.2`            |
| `pkce-challenge`     | `^5.0.0`              | `5.0.1`            |
| `raw-body`           | `^3.0.0`              | `3.0.2`            |
| `zod`                | `^3.25 \|\| ^4.0`     | `4.6.2`            |
| `zod-to-json-schema` | `^3.25.1`             | `3.25.2`           |

The lockfile, rather than this summary table, is the exact transitive authority.
There are no native modules or install scripts in the resolved production graph.
HTTP, OAuth, and client packages are installed because the v1 SDK is monolithic;
Task 16 imports only `server/mcp.js` and `server/stdio.js`.

## Security Findings

The isolated exact graph produced:

```text
npm audit --omit=dev
0 vulnerabilities: 0 info, 0 low, 0 moderate, 0 high, 0 critical
```

The approved graph resolves `fast-uri@3.1.7`, the patched v3 line. A full
development audit still reports two pre-existing high-severity findings in
`markdownlint-cli2@0.23.2 -> smol-toml@1.7.0`. That path was present in the Phase
1 baseline, is development-only, and is not reachable from the MCP server
runtime. This audit does not use `npm audit fix` or widen Task 16 into unrelated
toolchain upgrades.

### Rejected v2 bundle finding

The v2 server manifest declares only `@modelcontextprotocol/core` and Zod, so
`npm audit --omit=dev` reports zero findings. Its source maps, however, identify
eight bundled third-party packages:

- `@cfworker/json-schema@4.1.1`
- `ajv@8.18.0`
- `ajv-formats@3.0.1`
- `content-type@1.0.5`
- `fast-deep-equal@3.1.3`
- `fast-uri@3.1.0`
- `json-schema-traverse@1.0.0`
- `json-schema-typed@8.0.2`

The stdio module imports `McpServer`; that module imports the Node shim; and the
shim eagerly imports the bundled AJV provider containing `fast-uri@3.1.0`.
Current high-severity `fast-uri` advisories affect v3 releases before `3.1.7`,
including authority-confusion and path/host parsing defects. Because the bytes
are statically bundled, adding a patched top-level dependency or npm override
does not replace them. The package-level MIT registry label is also incomplete:
its published license describes an Apache-2.0/MIT transition and CC-BY-4.0
documentation, while the embedded packages include six MIT, one BSD-2-Clause,
and one BSD-3-Clause component.

This is why the normal npm audit result does not approve the v2 package.

## Size Findings

The exact Phase 1 project tarball and the approved projected manifest were
measured from isolated archives:

| Measure                | Phase 1 baseline | Approved manifest |     Delta |
| ---------------------- | ---------------: | ----------------: | --------: |
| Packed project tarball |    143,809 bytes |     143,838 bytes | +29 bytes |
| Unpacked project files |    627,837 bytes |     627,902 bytes | +65 bytes |
| Published file count   |               59 |                59 |         0 |

Dependencies are installed by the consumer and are not copied into the
`ai-peer-review` tarball. The approved SDK itself measures 582,844 packed bytes
and 4,322,438 unpacked bytes across 693 files. Its installed directory is about
8,496 KiB; the pruned production `node_modules` graph is about 28,980 KiB.

The size and installed-surface cost is material. It is accepted only because the
alternative v2 bundle is currently vulnerable and a standard MCP server must not
be implemented as project-owned wire protocol. Re-evaluate the server-only
package after an upstream patched release rather than carrying the monolith
indefinitely.

## Alternatives

### `@modelcontextprotocol/server@2.0.0`

Rejected for this release. It is the intended future package and has only three
declared runtime package/version pairs, but its eager stdio path contains bundled
vulnerable code that package-manager audit and overrides cannot govern.

### Handwritten MCP framing

Rejected. It would keep zero dependencies but would make this project own
protocol initialization, discovery, cancellation, error envelopes, stdio
framing, schema validation, and future interoperability changes. Those concerns
are outside the peer-review protocol and are more security-sensitive than the
selected official SDK boundary.

### No MCP dependency

Rejected for Task 16. Manual and resume-only handoff remain supported, but they
do not satisfy the accepted Phase 2 requirement for a standard blocking MCP
tool. They remain the fallback path and are not removed by this decision.

### Vendor or patch the v2 bundle

Rejected. Carrying a locally rebuilt SDK would create a forked security and
license-maintenance obligation. The official v1 SDK already provides a declared,
patched graph and is the narrower governance risk for this release.

## Reproduction

The audit used Git archives of the exact base in ignored project scratch, then
ran:

```bash
npm view @modelcontextprotocol/server@2.0.0 version license engines dependencies \
  dist.unpackedSize dist.integrity time.modified --json
npm view @modelcontextprotocol/sdk@1.30.0 version license engines dependencies \
  dist.unpackedSize dist.integrity time.modified --json
npm install --ignore-scripts --save-exact @modelcontextprotocol/sdk@1.30.0 zod@4.6.2
npm prune --omit=dev
npm ls --omit=dev --all --json
npm audit --omit=dev --json
npm pack --dry-run --json
npm pack --dry-run --json @modelcontextprotocol/sdk@1.30.0
du -sk node_modules node_modules/@modelcontextprotocol/sdk
```

The production package manifest was changed only after independent review of
this revised record approved the exact v1 dependency decision.
