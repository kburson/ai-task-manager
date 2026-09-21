<!-- cspell:words unblinding -->

# Review-order experiment research

This directory contains the publication draft and reproducible evidence for the comparison of `SAR → SPR → XPR` with `XPR → SPR → SAR` on the AITM MCP adapter architecture.

- [Whitepaper](whitepaper.md): conclusions, method interpretation, cost-quality policy, limitations, and methods appendix.
- [Comparison matrix](comparison.md): rubric results, exact artifact evidence, trajectory accounting, and stopping rule.
- [Stage-one comparison](stage-1-comparison.md): retrospective, not-blinded comparison of the terminal SAR-first and XPR-first stage-one artifacts.
- [Assessment protocol](assessment-protocol.md): rubric and procedure frozen before specimen inspection.
- [Preliminary blinded assessment](preliminary-blinded-assessment.md): A/B judgment frozen before method unblinding.
- [Provenance](provenance.json): source hashes, participants, sequence, and classified counts.
- [Source map](source-map.md): immutable Git paths, protocol IDs, elapsed-time boundaries, and reproduction commands.
- [Stage artifacts](stage-artifacts.json): byte-exact provenance for the common baseline and all six terminal stage snapshots.
- [Cost evidence](cost-evidence.md): measured coverage, rate-card calculations, and cost limitations.
- [Cost evidence data](cost-evidence.json): structured inputs and calculations for the cost analysis.

The paper names an artifact-level winner while rejecting a universal causal order claim from two nonrandom sequential trajectories. Review consensus is not human approval, and no reviewed runtime architecture was implemented by this research.

Integration preserves one canonical SAR → SPR → XPR specification. The reverse experiment remains historical evidence. Its exact Git revisions are recoverable from the [history archive](../../superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/archive/README.md) without merging or creating that branch; see the source map before retrieving snapshots in a fresh clone.
