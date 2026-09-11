# #1516 Author-Owned Finalization Contract Design

## Context

Issue #1516 was opened when AITM still contained its co-review runtime. Current
trunk delegates that runtime to the exact `ai-peer-review` package dependency.
AITM configures and consumes the package but must not duplicate its protocol,
identity, or publication authorities.

The installed package already separates reviewer consensus from terminal
publication. An accepted reviewer submission reaches `acceptance-pending` and
routes the next action to the registered author. Only that author may finalize
the review, publish the terminal manifest, and create the terminal review
commit. Identity failures are checked before repository mutation, and an
identical successful retry is idempotent.

## Decision

AITM will preserve this boundary as a host/package contract rather than restore
the removed runtime. A host integration test will exercise the installed
package through its public CLI and public adapter surface in a real isolated Git
fixture. Operator documentation will describe the same action boundary.

This keeps one source of protocol truth:

- `ai-peer-review` owns review state, participant identity, handoffs,
  finalization, evidence bytes, commit behavior, retry behavior, and human
  good-enough authority.
- AITM owns package configuration, dependency pinning, task lifecycle, and a
  compatibility test that detects a package contract regression.

## Observable contract

For an ordinary accepted review:

1. Reviewer submission records acceptance and produces
   `acceptance-pending`.
2. Reviewer submission does not advance Git HEAD or create the terminal
   `review-manifest.md`.
3. Status names the author as the current actor and exposes the exact
   `finalize` action.
4. Reviewer, foreign-author, and missing-identity finalization attempts fail
   before HEAD or the manifest changes.
5. The registered author finalizes once. The terminal commit changes only the
   accepted reviewer response and the manifest.
6. Repeating the same finalization returns the same terminal result without a
   new commit or protocol event.

The package's authenticated human good-enough path remains distinct. It does
not grant ordinary publication authority to the reviewer.

## Compatibility boundary

The test will assert only public outputs and repository effects. It will not
import reducers, rewrite protocol files, or restate private package algorithms.
AITM therefore detects a broken dependency contract without becoming a second
implementation of that contract.

## Failure behavior

Identity refusals must be deterministic package errors and must precede tracked
mutation. Artifact drift, destination collision, and recovery remain package
responsibilities covered by the pinned package's own suite; AITM's host test
keeps the higher-value role and publication boundary in scope.

## Documentation behavior

The GitHub-native coordination guide will instruct a reviewer to stop when
status reaches `acceptance-pending`. The registered author reads the exact next
action from `peer-review status <workspace> --next` and runs the returned
`finalize` command. Human approval and human good-enough authority remain
explicit and cannot be inferred from routing.
