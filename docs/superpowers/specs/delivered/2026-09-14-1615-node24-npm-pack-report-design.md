# Node 24 and npm Pack Report Compatibility Design (#1615)

## Goal

Complete AITM's Node.js 24 migration by making every repository-owned consumer
of `npm pack --json` accept the two supported single-package report shapes
without weakening package identity or manifest validation.

## Existing Baseline

Issue #1617 already established Node.js `>=24` in the root package and lockfile,
updated current runtime documentation, and moved active CI lanes to Node 24.
This story preserves that baseline and adds regression coverage so those policy
decisions cannot silently drift back to Node 22.

The paired `ai-peer-review` migration is tracked independently at
<https://github.com/kburson/ai-peer-review/issues/17>. AITM owns its helper,
fixtures, tests, CI evidence, and release decisions locally.

## Parser Contract

Add one test helper that receives raw `npm pack --json` output plus an explicit
expected package name. The helper recognizes structure rather than querying or
branching on the installed npm version:

- npm 11: an array containing exactly one report object;
- npm 12: an object with exactly one key matching the expected package name and
  one report object as its value.

The normalized return value is the inner report object. The parser fails closed
when JSON is malformed, the outer shape is unsupported, zero or multiple
reports are present, either package identity is unexpected, `files` is not an
array, or a filename-dependent caller receives no non-empty `filename`.

All five named pack consumers import this helper. Four consume `files`; the
packaged tail-profile consumer also opts into filename validation.

## Deterministic Evidence

Fixture-backed unit tests record both supported shapes and every rejection
boundary. Consumer tests continue to execute real `npm pack --dry-run --json`
commands, so the helper is proven against the active local npm as well as the
literal compatibility fixtures.

A dedicated hosted matrix installs pinned npm 11 and npm 12 versions on
supported Node 24-or-newer runtimes, verifies the installed npm version, and
runs the helper plus all five affected consumer tests. The general CI lanes
remain responsible for the broader repository suite.

## Runtime Policy Evidence

A focused policy test parses package metadata and active CI workflow data. It
proves that the package and lockfile declare Node.js `>=24`, the minimum active
CI runtime is Node 24, later/current coverage remains present, Node 22 is absent,
and the npm pack compatibility matrix exercises both npm major versions.

Historical specifications, plans, reviews, and dependency-owned lockfile
engine declarations remain unchanged.

## Verification

Run the two focused contract tests, the five consumer tests, the fast and slow
suites, lint, format checking, and diff hygiene. Hosted GitHub checks provide
the authoritative cross-runtime npm 11/npm 12 execution evidence before merge.
