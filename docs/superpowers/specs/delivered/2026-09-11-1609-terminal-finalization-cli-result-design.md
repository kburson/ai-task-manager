# #1609 Terminal Finalization CLI Result Design

## Context

`ai-peer-review@0.2.0` completes ordinary author finalization correctly, then
fails while rendering the successful terminal result. Terminal results carry
`next_action: null`; the generic text renderer dereferences
`value.next_action.command` before applying its fallback. The CLI therefore
returns `APR_INTERNAL` and exit 1 after its terminal commit and event exist.

This is dangerous because the caller cannot distinguish a failed transaction
from a successful transaction followed by an output failure.

## Decision

Repair the renderer in the owning `ai-peer-review` repository and publish the
smallest patch release. AITM will consume that release exactly and guard the
behavior through the installed package's public CLI.

The upstream renderer will choose the next-action display without
dereferencing null. Nonterminal results retain their exact command display;
terminal results render their null terminal action without throwing. No state,
authority, transaction, or retry semantics change.

## Release boundary

The repair will be reviewed and merged in the public package repository. The
release commit will carry version `0.2.1` in both package manifests and be
identified by a signed immutable `v0.2.1` tag. The repository's release workflow
must publish or verify the npm tarball and create or verify the matching GitHub
release before AITM changes its dependency.

AITM will pin `ai-peer-review` to exact version `0.2.1`; ranges and local package
links are not acceptable delivery evidence.

## Host verification

The AITM integration test will create an isolated Git repository, start and
accept a normal review through the installed CLI, and observe only public
results and Git effects. It will prove:

- acceptance routes finalization to the registered author without publishing
  the terminal manifest;
- reviewer, foreign-author, and missing-identity attempts fail before mutation;
- registered-author finalization exits zero and reports accepted;
- the final commit changes only the accepted reviewer response and terminal
  manifest; and
- an identical retry exits zero without another commit or protocol event.

The test will not import private package modules or duplicate the protocol
reducer.

## Non-goals

This repair does not change finalization authority, good-enough policy,
transaction recovery, review states, or the AITM adapter API. It does not create
another wrapper around `peer-review`.
