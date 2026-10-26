# #2073 specification SAR — round 5, reopened by final lint evidence

Reviewed input: [spec.r3.md](spec.r3.md), SHA256 `32d1f1e733600c1c71797fb0f549d5734eeb34bcae3bbe4b3a7cf64721fb0600`.

Verdict: **Revise.** Parent final markdownlint verification supplied new evidence after round 4: MD034 rejects the bare tracking-story URL at canonical line 5. Round 4's convergence was based on source review, hashes and Prettier; it did not claim markdownlint success. Preserve that historical verdict and reopen the record rather than rewriting it.

## F12 — P3: Bare tracking-story URL fails repository markdownlint

The canonical document uses a bare GitHub issue URL on line 5. The parent's final markdownlint check reports MD034 there and in the preserved r0–r3 snapshots. Inspection confirms the bare URL. This is a document lint defect, not a substantive design defect or a change of tracking issue.

Required revision: replace the canonical line with a Markdown link to the same issue, retain the resulting bytes as spec.r4.md, and rerun applicable document checks. Historical r0–r3 inputs remain byte-identical with their known MD034 findings. Do not weaken lint configuration or silently repair reviewed historical evidence. The parent will disclose the historical-only full-root warnings separately.

No substantive design change is requested. The complete next input must receive another terminal reread. No source, configuration, tests, binding or lifecycle work is authorized by this correction.
