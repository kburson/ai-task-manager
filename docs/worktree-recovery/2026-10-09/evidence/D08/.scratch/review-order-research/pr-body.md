Preserve the reverse review experiment and whitepaper alongside the selected SAR → SPR → XPR architecture. The canonical spec and original review collateral remain byte-for-byte identical to trunk; the alternative spec is not merged.

This copies the second experiment's review logs, adds the research and stage-one comparison, and archives its exact Git history so cited revisions remain retrievable. The reverse branch is retained as `archive/XPR-SPR-SAR-experiment`. Narrow sealed-review lint exclusions and three dictionary entries accompany the copied evidence.

Validation: `npm run quality` passed, including all 872 fast test files. A clean repository containing only trunk recovered all seven baseline/stage snapshots from the archive with matching hashes and without creating an experiment branch. All 34 copied review files match their original blobs. JSON, links, archive checksum, and whitespace checks passed.

The selected architecture was previously merged in #1724. This PR adds experiment evidence and research only; it does not implement the architecture or close the SAR feature request.
