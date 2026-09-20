# XPR-first then SPR then SAR experiment evidence

## Setup and authorized boundary

- Sequence: `XPR -> SPR -> SAR`.
- Setup observed at: 2026-09-20T22:36:24.666837+00:00.
- Starting HEAD: `d9bc49d5d79f6c903af961439df4753127d45d6c`.
- SPR-accepted spec commit: `6edf917bdd2d0441ad9c296f69419da08307f758`.
- Artifact: `docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md`.
- Baseline SHA256: `dd2d36956fec9dabb3427429b23541ea5733ce50dd00560bdff4bb22de266c23`.
- Model: same GPT-6 Astra Author (`gpt-6-astra`), high effort, same genuine
  runtime session as this side's XPR and SPR.
- Initial Git status: clean; starting HEAD and exact baseline hash verified.

The user authorized iterative Single Agent Review after SPR. The same Author
retains this side's XPR and SPR context and conducts each pass alone. No reviewer
is spawned, no peer-review consensus protocol is imitated, and no Sol or Claude
review is invoked. The requesting-code-review skill was inspected; its generic
subagent recommendation is superseded here by the user's explicit single-agent
method. Evidence evaluation and verification-before-completion still apply.

Every round records a full substantive pass, findings and dispositions, exact
reviewed HEAD and artifact digest, clean-versus-dirty input evidence, observed
wall-clock timestamps, and validation limits. Substantive corrections and their
review records are committed before the next round. Result commit mappings are
appended in a subsequent record rather than inventing a self-referential hash.
A terminal pass has zero substantive findings and no spec changes. There is no
defect quota or presumption that two SPR rounds establish SAR value. Review-pass
counts and correction-cycle counts are reported separately.

## Isolation and limitations

Use only this artifact, its requirements, repository ADRs/current implementation,
and this experiment side's inherited context. Do not read memory files, the other
experiment, trunk, other worktrees, unrelated historical corrections, or other
agent histories. Keep searches scoped to specific implementation/ADR paths to
avoid incidental exposure. Preserve XPR and SPR collateral byte-for-byte. Any
observed failure or isolation issue is recorded. Host/system guidance and model
training remain outside the experiment's control; this is not perfect blinding
or statistical independence. The Author intentionally retains prior-stage
findings and choices.

Times are observed wall-clock events, not active reasoning time. Token/cost
coverage is unknown. The prior SPR's incidental unrelated design/plan exposure
remains disclosed in its frozen evidence; SAR does not erase that limitation.
No design-superiority or cross-sequence comparison is inferred from this run.

## Stopping rule

After a complete clean pass, commit all SAR evidence, verify the final artifact
digest, clean Git status, and unchanged prior-stage collateral, then stop for
user discussion. No implementation, runtime tests for these document changes,
issue mutation, push, merge, or comparison with frozen trunk is authorized.
This same-author review is not independent Reviewer consensus or human approval.

## Operational record

Preparation checks passed with no tool interruption or error. Review records
and subsequent commit mappings follow after the first pass.

## Round mapping and observed events

| Round  | Reviewed HEAD                              | Reviewed artifact SHA256                                           | Findings | Correction result commit                   | Result artifact SHA256                                             |
| ------ | ------------------------------------------ | ------------------------------------------------------------------ | -------- | ------------------------------------------ | ------------------------------------------------------------------ |
| SAR r1 | `0d2033b854e46db4bbab4424a2e798bc347f78a3` | `dd2d36956fec9dabb3427429b23541ea5733ce50dd00560bdff4bb22de266c23` | 4        | `8e5fb7cf5886f8577f4de53d254ae26bd32fa2c5` | `72b8730f8e4b41db6c3f7e888403428f363ef66555278a8b4176b9ec4dde0613` |

R1 findings/dispositions and validation failures are preserved in
[self-review-r1.md](self-review-r1.md). F1 is explicitly carried forward from an
earlier optional XPR observation; it is not an independent discovery. The other
three findings were identified during this SAR pass. No cross-sequence conclusion
is drawn from those counts.

R2 input clean HEAD was verified at 2026-09-20T22:45:39Z. The complete pass found
one interaction introduced by r1's repository-context correction. Its reasoning,
disposition, and qualifications are in [self-review-r2.md](self-review-r2.md).
This is a follow-up correction cycle, not evidence of another defect in the
original SPR-accepted input. R1 evidence remains unchanged after its commit.
