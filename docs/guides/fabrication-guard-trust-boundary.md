# Fabrication-Guard Trust Boundary — Decision Record

**Status:** Accepted
**Issue:** #527 (spike / decision record, child of epic #521)
**Supersedes the deferred fork in:** #522
**Implements the chosen follow-up in:** #536

This record resolves the trust-boundary question that #522 deliberately deferred
when it shipped the in-band fabrication guard. It is a decision record, not code:
the only code #527 ships is the doc-presence test that pins this file's required
sections (`scripts/task-tracker/tests/unit/guard-trust-boundary-doc.test.mjs`).

## Background

The #516 integrity incident was caused by a script that **fabricated
execution-proof markers** (`aitm-verified` with `ts`/`sha`, `aitm-ac-evidence`,
`aitm-dod-evidence`) directly into an issue body to pass a gate, without any
verifier ever running. #522 closed that hole with an in-band guard:
`findNewlyIntroducedExecutionProof(before, after)` in
`scripts/task-tracker/lib/body-invariants.mjs` flags any proof marker present in
`after` but not in `before`, and `mutateIssueBody` throws `FabricatedProofError`
unless the caller passes `evidenceStamp: true`.

Only four sanctioned, in-repo stampers ever pass that flag:

- `ac-stamp` — runs an AC line's declared `aitm-verified cmd="…"` verifier and
  stamps the result.
- `dod-stamp` — the Functional Definition-of-Done equivalent.
- the close pipeline — auto-stamps the two derived DoD keys (`acs`, `checkboxes`)
  from the body itself.
- the **sandbox auto-stamp** — the Test-stage sandbox verb, which stamps
  `sha="sandbox"` after running the Verification Commands in an isolated worktree.

The deferred question: is the `evidenceStamp: true` flag **sufficient**, or must
the guard go further and **re-derive / re-validate the run record** — re-hash HEAD
to confirm a claimed `sha`, or consult a content-addressed verifier cache to
confirm the `ts`/exit — so that even a flag-bearing stamp is rejected when its
claimed evidence is forged?

## Threat model

The asset being protected is the **truth of a tick**: a checked AC or DoD box
must mean its declared verifier actually ran and passed. An execution-proof
marker is the evidence trail for that claim.

Who can set `evidenceStamp: true`? **Only the four sanctioned stampers above**,
and they are ordinary in-repo source. To set the flag falsely an attacker must
**edit repo source** — at which point they can equally edit the guard itself, the
re-derivation logic, or any cache that logic would consult. This is the crux:
re-derivation does not eliminate trust, it only **moves the trust boundary** from
"the four stampers set the flag honestly" to "the four stampers AND the
re-derivation inputs are honest." The same author can corrupt both.

What did #516 actually exploit? A **generic body write** that injected proof
markers — i.e. the un-flagged path. The #522 provenance guard already closes that
path: any newly-introduced proof marker without `evidenceStamp: true` is rejected
outright. The only residual hole re-derivation would close is narrower: a **buggy
or compromised sanctioned stamper** that mints the flag without a real run.

Why full re-derivation is rejected:

1. **Re-hashing HEAD is a correctness trap.** You legitimately stamp, then commit;
   HEAD advances past the stamped `sha`. Asserting `HEAD == claimed sha` produces
   false positives on every honest stamp-then-commit sequence.
2. **A verifier cache relocates the problem.** Whoever can set the flag can write
   the cache entry the check reads, so the cache adds infrastructure without
   adding an independent source of truth.
3. **Re-executing verifiers at guard time is prohibitively expensive.** Every body
   write would re-run `node --test`, which is slow, potentially non-deterministic,
   and defeats the entire point of caching evidence.

## Decision

**Flag-sufficient is the right stopping point.** The provenance flag
(`evidenceStamp: true`, reachable only by the four sanctioned stampers) is the
trust boundary. The guard does not, and will not, attempt to re-derive or
re-execute the run record — doing so **moves the trust boundary** without
eliminating trust, and carries a correctness trap (HEAD re-hashing) and
prohibitive cost (guard-time re-execution) for a threat the provenance guard
already largely covers.

### The one concrete hardening this decision implies

Rather than full re-derivation, the decision sanctions a small, deterministic
**structural-completeness** check on the flag-bearing path, filed as **#536**
(linked under epic #521): when a stamp _is_ flag-bearing, the guard still rejects
it if the marker is structurally malformed — missing `sha`, missing `ts`, or a
`sha` that is neither a 40-hex commit SHA nor the literal `sandbox` sentinel.

This catches a buggy or half-written sanctioned stamper minting a junk marker
**without** pretending to re-verify that the run happened. It needs no cache, no
re-execution, and no HEAD re-hash; it validates the marker's _shape_, not its
_truth_. That is the honest limit of what the guard can cheaply and correctly
assert, and #536 carries it as its own separately-reviewed implementation issue.

## Outcome

This record resolves to outcome **(a)**: a follow-up implementation issue
(**#536**) is filed and linked under epic #521 with concrete acceptance criteria.
Issue #527 itself remains a spike — it ships this decision record and the doc-presence
test, no guard logic. Epic #521 stays open until #536 ships, which is correct:
the trust-boundary question is now _documented and decided_, and the one hardening
it implies is _scheduled_, not silently dropped.
