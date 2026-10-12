### #1904 Deep-Dive Analysis
Actual delivered e802e425 and restored public ai-peer-review #144 v102 reproduce deriveAcsStatus total 0 despite one checked root AC. The approved Scope must remain byte-identical; renaming its embedded H4 is not a repair.

The functional DoD projector calls deriveAcsStatus before deriving checkbox completion. Both body-invariant AC finders also use first-match H1-H4 lookup, potentially skipping root verifier/citation offenders. Existing ac-evidence canonical precedence is independent and working. Use one small pure locator for these affected consumers; prefer live H2 AC, preserve legacy H1-H4 fallback/offsets and original section termination. Retain canonical duplicate/malformed body validation rather than weakening it. No general Markdown parser or unrelated readers are in scope. Exclude literal fenced/comment headings from canonical selection using the existing owned pattern without importing reviewed-scope (circular dependency).

### Story Intent
- **Beneficiary:** Release operators delivering issues whose Scope embeds accepted source requirements
- **Capability:** Evaluate the formal acceptance criteria without confusing embedded source headings with the governed checklist
- **Need:** Functional completion currently reports zero criteria for the restored approved #144 Scope and can inspect the wrong verifier section
- **Value or failure prevented:** Prevent false completion refusals and skipped verifier checks while preserving immutable approved requirements

### Semantic review
1. Stakeholder: yes, release operators consume the completion/evidence decision.
2. Capability: yes, selecting the formal checklist is an operational safeguard.
3. Need: yes, actual delivered source/public issue reproduce zero criteria.
4. Counterfactual: yes, avoiding false refusal and hidden root verifier checks is concrete.
5. Grounding: yes, live issue, exact source and private reproduction support every claim.
6. Distinctness: yes, historical #1897/#1899 repair the evidence locator, not this derivation/body-invariant seam.
7. Standalone: yes, this narrative names trigger, defect and intended safe outcome.

### Verification
TDD new root-ac-consumers unit tests call real deriveAcsStatus, projectFunctionalDod and both body guards; exercise embedded headings, literal canonical examples, proof/source byte preservation, legacy forms and existing canonical shape refusal. Run issue VC1 and affected/TIA only locally; lint/format/diff complete. Full hosted exact-head CI including slow required before root Test/Review/delivery. No provider action or installed module patch. Source-only repair depends on no unfinished work; APR delivery waits for normal upstream installation.

### Bounded plan
One independently reviewable unit owns pure locator, the three consumers and regression tests. Estimate XS refinement 2 human hours; native forecast will derive approved effort. Full-Auto is requested by existing delivery authorization; this semantic review is machine review, not a new human approval.
