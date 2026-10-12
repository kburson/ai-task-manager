# #1915 formatted design: review-runtime recovery

The existing formatted-design XPR stopped after its original Claude reviewer joined
without a decision. Its launch ledger retained an unknown outcome. User-authorized
runtime recovery was performed in the existing review, without creating a story or
defect, replacing either participant, discarding history or injecting identity.

The source repair is preserved in [ai-peer-review PR #206](https://github.com/kburson/ai-peer-review/pull/206),
branch `codex/1915-review-runtime-recovery`, behavioral source commit
`d48b882c957e7e1a0891c5b116a1e9e25766510e`; documentation location was corrected in
`7734853` without runtime behavior changes. It authenticates exact native terminal
session evidence, retains append-only settlement receipts, protects later resumes
with operation markers, handles legacy policy inventory/migration, validates native
host checks against disposable candidates and restores exact registered-session
finalization without refreshing model provenance. Meaningful regressions and
independent code review preceded installation. No package release was published;
normal source PR CI/CodeQL and merge gates remain required.

Native primary-policy migration was committed as `44764b614` on the existing physical
checkout's native issue branch `feature/epic/1918/child/1915` and pushed to origin.
The existing review was held through the package-owned command, migrated, activated
and released with unchanged exact held snapshot. Foreign hooks were preserved and
the invoking workspace's disabled-hook preferences stayed disabled. Global user
preferences were unchanged. Installed native security was built for selected
Node 26.8.1 darwin/arm64; package installation doctor passed.

Claude resumed its original registered session and submitted acceptance against
`55d540975484f12c61c37d6488964d6104b2fb73eb074bcbe90edb5439e963ac`, without findings.
The sealed response retains Claude Opus 5.5 provenance and requested HIGH effort.
The same registered Astra author finalized the native review in normal mode with
reviewer-consensus acceptance at commit `b1b654c064216623c9b678f19048680b5b386550`.
Root verified the accepted artifact commit/current bytes, sealed response digest,
distinct participants and high-effort selections in the manifest. The fresh manual
same-author SAR continuity record found zero issues on these exact bytes and
independently proved the eight changed lines were table formatting only.

- [Native manifest](../../peer-reviews/1915/spec/completed16-format-xpr-20261011/spec/2026-10-11-2026-10-11-1915-completed16-resumption-design-review-efeda328cf3fbcf87107748d2a8d62a5/review-efeda328cf3fbcf87107748d2a8d62a5-review-manifest.md)
- [Accepted Claude response](../../peer-reviews/1915/spec/completed16-format-xpr-20261011/spec/2026-10-11-2026-10-11-1915-completed16-resumption-design-review-efeda328cf3fbcf87107748d2a8d62a5/review-efeda328cf3fbcf87107748d2a8d62a5-reviewer-response-1.md)
- [Renewed manual SAR](acceptance-post-format-xpr.md)

The current native manifest retains declared model/session assurance, unavailable
human authority and `human_decision: null`. This recovery does not elevate those
assurances or substitute reviewer consensus for human approval.

The portable primary-policy files from `44764b614` are folded into existing PR #1983. Its existing Codex hook file remains unchanged: this worktree had
already removed the optional review hook, and both local hook-disable overrides
remain intact. This avoids adding an enabled hook while preserving the native
primary checkout's committed migration and activated policy.

Final runtime verification includes 623/623 unit checks, 12/12 finalization checks
and 22/22 identity/provider checks. Rejected authentication leaves events unchanged.
The full unit suite caught a standalone documentation-path boundary violation;
the recovery report was moved into the existing allowed documentation directory
and the full suite then passed. No extraction rule was relaxed.

This is design/review recovery under #1915 and orchestration #1918, continuing the #1957 repair train. It does not implement completed16 resumption, complete #1915,
waive #1928's full CI, grant #1922 event-body authority or authorize a plan.
Human design approval remains pending.
