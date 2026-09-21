# Reverse-experiment history archive

The reverse experiment is evidence, not the selected architecture. The canonical specification is the SAR → SPR → XPR result already merged through PR #1724. This archive preserves the second experiment's exact Git objects without merging its branch. The original branch is renamed to `archive/XPR-SPR-SAR-experiment` for historical reference.

`xpr-first-history.bundle` contains the 15 commits from the common baseline through `8acc023b25be38f57abf418bdda54a8248e6e7a9`. Its only prerequisite is baseline commit `c2e33f4d0ae704900437a0659119bad6eb30dc01`, already in trunk's history. [manifest.json](manifest.json) records the archive checksum, size, prerequisite, and tip.

From the repository root, verify and import the historical objects:

```bash
git bundle verify docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/archive/xpr-first-history.bundle
git bundle unbundle docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/archive/xpr-first-history.bundle
```

The import writes Git objects only. It does not create or check out a branch, merge the experiment, or change the working-tree specification. The historical commits can then be read with `git show` using the research source map. Because imported objects need not have live refs, repeat the import if a later Git garbage collection removes them; the tracked bundle remains the durable archive.

Review records outside this archive retain their original bytes and historical statements. References to the reverse branch describe the experiment at the time it ran, not an active competing design. No provider sessions, private scratch transcripts, credentials, or usage-account data were added to this archive; its contents are the previously committed experiment and research history.
