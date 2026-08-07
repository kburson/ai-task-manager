# Numeric Timing Issue Identifier Design

## Problem

AITM lifecycle verbs parse issue references into numbers. The Timing Log read
path normalizes those numbers before calling its GitHub helper, but the write
path passes them directly to `findTimingComment` and `createTimingComment`.
Those helpers call `.replace()` on the value and therefore reject numeric
identifiers. Full-Auto approval of #1133 reproduced the failure after its
approval marker was durably persisted.

## Goals

- Accept numeric, plain-string, and `#`-prefixed issue identifiers throughout
  Timing Log lookup and creation.
- Preserve the exact numeric argument sent to `gh issue view` and
  `gh issue comment`.
- Allow an already-approved #1133 retry to project its immutable approval
  marker into the Timing Log.
- Add a regression that exercises the production writer boundary rather than
  replacing it with an injected no-op.

## Non-goals

- Change approval authority, markers, or Full-Auto policy.
- Rewrite or squash the existing #1133 commit.
- Change Timing Log chronology, deduplication, or rollup behavior.
- Broaden accepted issue identifiers beyond values whose string form is an
  existing issue reference.

## Approaches

### Normalize at the leaf GitHub helpers (selected)

Convert the value with `String(issueNumber)` in `findTimingComment` and
`createTimingComment` before stripping an optional `#`. These are the shared
boundaries that render the GitHub argument, so every direct and indirect caller
receives one consistent contract.

### Normalize only in `postTimingEvent`

This would repair #1133, but the exported lookup helper would still reject a
numeric identifier. It leaves two contracts for the same Timing Log resource.

### Normalize only in the approval reconciler

This is the smallest local patch, but it duplicates conversion policy in a
single verb path and leaves every other numeric writer caller exposed.

## Components and Data Flow

`postTimingEvent({ issueNumber: 1133, ... })` enters its existing lock, calls
`findTimingComment`, and either updates the matching comment or calls
`createTimingComment`. Both helpers normalize to the string `1133`, strip no
prefix, and pass `1133` to `gh`. Inputs `'1133'` and `'#1133'` produce the same
GitHub argument. No timing-row bytes or locking behavior change.

## Failure and Recovery

Missing or invalid repository data keeps the existing GitHub error behavior;
normalization only prevents a JavaScript type error before GitHub is called.
Issue #1133 already contains the approval marker timestamp
`2026-08-07T04:40:19Z`. Once this fix is available, an approval retry follows
the already-approved branch and reconciles the missing row at that timestamp.

## Testing

A focused `node:test` file controls the GitHub executable at the helper boundary
and verifies numeric, string, and hash-prefixed inputs render the same issue
number for lookup and creation. The numeric case must fail with
`issueNumber.replace is not a function` before implementation and pass after the
two coercions. Existing Timing Log and approval suites, then all fast/slow and
static lanes, guard the surrounding behavior.
