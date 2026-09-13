# Node 24 Runtime Floor Design

## Goal

Require Node.js 24 LTS or newer throughout AITM's live package, development,
and CI contracts, while making Node.js 26 the preferred development runtime.

## Scope

Update the root package engine and lockfile root metadata, both CI Node pins,
the cloud and local-worktree environment checks, package self-documentation,
current installation and environment guides, and the automated tests that pin
those contracts.

Node.js 23 and earlier must be rejected. Node.js 24 and 25 remain supported and
may emit a recommendation to use Node.js 26. Node.js 26 and later are supported
without a preference warning. CI proves the minimum supported version by using
Node.js 24.

## Provenance Boundary

Historical specifications, plans, review records, research measurements,
fixtures, and memory records retain the Node versions that were true when they
were written. Dependency-owned `engines` entries in `package-lock.json` also
remain unchanged; only the root package entry represents AITM's runtime floor.

## Verification

Repository contract tests must pin `package.json`, the root lockfile entry, and
all CI setup-node uses to Node.js 24. Environment tests must prove rejection of
Node.js 23, support for Node.js 24, and the Node.js 26 preference boundary.
Current live surfaces must contain no remaining Node 22 floor or Node 25
preference language.

Packaging tests run under the preferred Node.js 26 toolchain and must accept
both the legacy array and npm 12 keyed-object forms of `npm pack --json` output.
Each test file should generate the expensive package manifest only once.
