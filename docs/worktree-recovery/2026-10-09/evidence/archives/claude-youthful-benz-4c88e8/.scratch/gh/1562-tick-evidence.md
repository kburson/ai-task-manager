### Unverified-tick disclosure — two duplicate VC entries

Two Verification Commands entries were ticked with `allowUnverifiedTicks`. This comment records
the real evidence behind them so the bypass is auditable rather than bare.

**The lines:**

```
- [ ] `npm test`
- [ ] `npm run test:slow`
```

**Why they lack proof markers.** They carry no `id=N` and were appended automatically by the
Test sandbox, which adds the commands cited by the `dod:functional:tests` Definition-of-Done
item to the Verification Commands list. The sandbox ticks the entries it runs itself; these two
are meant to be proven by `dod-stamp tests`, which stamps the DoD line rather than these
duplicates. So the commands are cited twice and evidenced once.

**The runs did happen.** `/task dod-stamp tests` executed both against the current head
`f0a11c21` immediately before this tick:

```
[task-tracker] dod-stamp tests on #1562: running 2 verifier(s)…
  ✓ npm test (exit=0)
  ✓ npm run test:slow (exit=0)
[task-tracker] ✓ dod-stamp tests on #1562: run-props upserted onto the
  dod:functional:tests line's aitm-verified marker (sha=f0a11c21).
```

That evidence is recorded on the `All automated tests pass` DoD line with its
`aitm-verified` marker. These two entries duplicate that citation, so the bypass records a
*second* tick of an *already-proven* fact — it does not assert anything unproven.

**What was not done.** No `aitm-verified` marker was hand-written onto either line. Forging a
proof marker for a run — even a run that genuinely happened — is not a path this project
sanctions, and the explicit, grep-able override exists precisely so the bypass stays visible
instead of being disguised as verified evidence.

The next Test sandbox run at `f0a11c21` will re-evaluate these entries with its own evidence.

<!-- aitm-unverified-tick-disclosure -->
