Approved requirement changes can leave acceptance criteria tied to obsolete protected verifier annotations, blocking legitimate corrections. This PR preserves the reviewed #1847 design and implementation plan on trunk as the baseline for implementation in a separate branch and worktree.

Includes the specification, scoped six-child implementation plan, Refine evidence, and SAR/XPR reports and manifests. The branch contributes Markdown documentation and seven accepted technical terms in the spell-check dictionary. The trunk merge commits only incorporate existing trunk changes. Implementation and epic completion remain separate.

Refs #1847

Validation: inspected the branch contribution and confirmed there are no implementation or test changes. The branch diff passes whitespace checks, and all 22 changed documents pass Prettier. Repository-configured Markdown lint and spell-checking also passed; the dictionary fix resolves the seven CSpell findings from CI. Implementation tests were not run for this documentation-only PR.
