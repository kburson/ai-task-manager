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

| Round  | Reviewed HEAD                              | Reviewed artifact SHA256                                           | Findings | Correction result commit                   | Result artifact SHA256                                             |
| ------ | ------------------------------------------ | ------------------------------------------------------------------ | -------- | ------------------------------------------ | ------------------------------------------------------------------ |
| SAR r2 | `8e5fb7cf5886f8577f4de53d254ae26bd32fa2c5` | `72b8730f8e4b41db6c3f7e888403428f363ef66555278a8b4176b9ec4dde0613` | 1        | `20412884a31fc353096f826430c9da7962516792` | `99c5ca567e533e6b1b7913dc98b2723b1f561ab5a0903cfa5d6fe227b449fddf` |
| SAR r3 | `20412884a31fc353096f826430c9da7962516792` | `99c5ca567e533e6b1b7913dc98b2723b1f561ab5a0903cfa5d6fe227b449fddf` | 0        | No spec change                             | Same as input                                                      |

### Correction to r2's validation prose

The original r2 record is preserved, including its premature statement that no
validation failure occurred and that JSON/link validation had already passed.
In the command that appended that statement and committed the correction, an
ad hoc checker attempted to parse every line beginning with an opening brace.
It failed on the first line of a multiline JSON example with Python
`JSONDecodeError: Expecting property name enclosed in double quotes`. The shell
continued to the subsequent formatting and commit commands because that batch
did not enable immediate exit on error. This was a verification-script error,
not invalid specification JSON, but the success statement preceded verification
and was inaccurate when committed. It is superseded by this explicit record.

The corrected checker parses complete JSON/text code blocks and the embedded
learning object. It passed all seven JSON objects and local Markdown links
at the observed 2026-09-20T22:47:48Z checkpoint, after commit
`20412884a31fc353096f826430c9da7962516792` and before the r3 full pass. The
artifact was unchanged. Later verification batches use immediate error exit.
R1's separate CSpell failures and truncated tool output remain in its record.
No other tool interruption was observed during SAR.

### Terminal observation and counts

At 2026-09-20T22:48:19Z, r3 completed with zero substantive findings and no
specification changes. The worktree was clean at review input and at completion
before terminal collateral was created. [self-review-r3.md](self-review-r3.md)
records the full-pass coverage and qualifications.

- Three complete SAR review passes: findings per pass `4, 1, 0`.
- Two substantive correction cycles and five total finding records.
- Four findings on the SPR-accepted input: one carried-forward XPR optional
  observation and three identified during SAR r1.
- One follow-up finding concerned an interaction introduced by SAR r1; do not
  count it as a fifth surviving baseline defect.
- All five findings were accepted for correction; no unresolved disagreement
  or new optional design request remains from SAR.
- Final specification commit: `20412884a31fc353096f826430c9da7962516792`.
- Final specification SHA256:
  `99c5ca567e533e6b1b7913dc98b2723b1f561ab5a0903cfa5d6fe227b449fddf`.

The sequence remains XPR then SPR then same-author SAR. There is no claim that
SAR is independently blinded or statistically superior. Prior SPR incidental
unrelated design/plan exposure remains disclosed in frozen SPR collateral;
no new cross-experiment exposure was observed in SAR. Token/cost totals and
active reasoning time remain unknown. Timestamps identify wall-clock events.
Human approval and implemented runtime tests are not implied.

The final evidence commit contains this terminal record and provenance manifest;
its own SHA is discoverable from Git history and reported to the coordinator,
rather than placed inside itself. This is the authorized stopping point. Any
comparison with frozen trunk, implementation, push, or merge requires a later
user request.

### Final evidence QA

Exact SAR-file Prettier, Markdown lint, and CSpell checks passed. Provenance JSON
parsed; all three review-file hashes, reviewed artifact hashes at their exact
commits, result mappings, and local Markdown links verified. R1 and r2 records
match their original committed bytes. The final spec matches the r3 input and
has no terminal-pass edits. XPR and SPR Git trees match the stage-start trees;
no prior collateral changed. Diff whitespace checks passed. The terminal commit
adds evidence only; post-commit Git cleanliness is checked and reported by the
Author without creating another self-referential evidence commit.
