# XPR-first / SPR / SAR evidence index

This is the same GPT-6 Astra Author's high-effort Single Agent Review after this
side's accepted XPR and SPR. Three complete passes produced findings `4, 1, 0`
and two correction cycles. The terminal pass changed no specification bytes.

- [Experiment log](experiment-log.md): baseline, isolation, findings provenance,
  commit mappings, observed checkpoints, tooling failures, and stopping boundary.
- [SAR r1](self-review-r1.md): four findings and corrections; one is explicitly
  carried forward from an earlier optional XPR observation.
- [SAR r2](self-review-r2.md): one interaction introduced by r1, with correction.
  Its prematurely recorded validation success is superseded explicitly in the log.
- [SAR r3](self-review-r3.md): complete terminal pass, zero findings, no spec edits.
- [Provenance](provenance.json): per-input/result hashes and review-file hashes.
- [Final specification](../../../../specs/2026-09-20-aitm-mcp-adapter-architecture-design.md).

Final spec commit: `20412884a31fc353096f826430c9da7962516792`.
SHA256: `99c5ca567e533e6b1b7913dc98b2723b1f561ab5a0903cfa5d6fe227b449fddf`.

These observations do not imply independent review, human approval, runtime
implementation, or comparative superiority. Cost and active reasoning duration
are unknown. Prior XPR/SPR evidence is preserved. Work stops here for the user's
next decision; no automatic comparison, implementation, push, or merge follows.
