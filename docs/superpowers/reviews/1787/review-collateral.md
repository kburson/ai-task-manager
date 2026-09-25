# Issue 1787 Review Collateral

This index distinguishes archived review evidence from current acceptance.
Committing a generated response or invitation does not submit a protocol turn
or confer acceptance.

## Specification

- Review `review-5c1846703362de090f3843bf4a5f75e8` is the superseded GPT-5 author
  run. Its startup, invitation, submitted second reviewer response, and untouched
  unfinished second author-response template are preserved as historical
  collateral. The unfinished response has no author disposition or submission;
  it is not acceptance evidence and must not be completed retroactively.
- Review `review-341532c92eac97134dfede8a4f29fba6` is the subsequent Astra 6 /
  Opus 5 spec review. Its existing manifest is the acceptance record, not the
  startup or invitation files. It accepted spec blob
  `4a6fa02c2c951899117601caa47697d167a42b6d` at artifact commit
  `b02b4b2660caac4ca2df31570d2cee44a1c6a1b0`; finalization commit is `3358b074`.

Generated protocol collateral is preserved byte-for-byte. Scratch events,
provider session handles, and transient transport state are not included.

## Plan

The [implementation plan](../../plans/2026-09-24-1787-delivery-waiver.md) was
initially committed in `f3f27345`. Author SAR ran four rounds with finding
counts 2, 2, 2, 0. The [final SAR](plan/SAR/self-review-r4.md) reviews plan commit
`825cf5a750ccdf857c9da20f5e45f9104df1f59a`, SHA-256
`3d513a3943596389d27e283b93bdec93dd51638e3c502993947804ea4ce42618`.
SAR evidence was committed through `72d1ce79`.

The user authorized plan XPR with Claude Opus 5 after all existing collateral
was committed. That is a separate plan review, not an extension or alteration
of the finalized spec review. SAR convergence alone does not confer independent
plan acceptance or implementation approval. The new XPR's event authority and
eventual manifest determine its status.
