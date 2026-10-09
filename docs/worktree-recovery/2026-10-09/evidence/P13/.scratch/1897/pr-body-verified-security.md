Embedded source-plan headings could hide an issue’s canonical Acceptance Criteria and block evidence stamping. The shared locator now prefers live level-two criteria, excludes fenced/commented examples, and retains the supported legacy fallback and existing verifier grammar. The comment scan recognizes both standard and alternate HTML closing forms.

Refs #1897

Validation at source `344a6abb3dbf6d0a3f5ab4037b1bd78b0cabd86e`:
- 68 affected AC lookup, stamping and evidence-gate tests passed. The two alternate-comment regressions first failed against the previous source.
- Lint, format and diff checks passed.
- Full hosted CI [run 37390801786](https://github.com/kburson/ai-task-manager/actions/runs/37390801786) passed. Both CodeQL analyses and the security aggregate passed.
- Native Test accepted exact-head receipt `01M4787KST9ZVD8XMF5S5EEHSG`. Genuine CI artifacts cover both declared full suites; the host executed affected tests and static checks.
- Independent complete source review and focused corrections rechecks found no unresolved actionable findings. The approved plan and downstream accepted contract bytes remain unchanged.

The earlier interrupted whole-host Test attempt and its sandbox are preserved as failed historical evidence. They are not used for this accepted Test receipt.
