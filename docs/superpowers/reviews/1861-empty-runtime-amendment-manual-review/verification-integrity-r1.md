# #1861 verification isolation record — manual review r1

Status: preserved test-integrity incident and unresolved verification prerequisite. This is durable review collateral, not a new GitHub issue, repaired harness or lifecycle BLOCKED annotation. No test suite ran in this author round.

## Historical observation and current verification

The original amendment reported that a 917-file continuation TIA run had 712 passing and 205 failing files, overwrote three preserved private fixtures, and created two fixture records in the actual candidate. It reported restoring the three originals after retaining test-produced bytes/hashes. Those execution/restoration claims remain historical evidence; this round did not rerun TIA or independently reconstruct the overwritten bytes.

This round hashed the current files and compared exact Git blob contents at both the protected recovery ref `refs/codex/snapshots/232c87b2fd75d966c874bf2b4db40e126d3826ce` and recovered snapshot `bec7e45429838dcc7123283dddb69001720dc2c1`. Both snapshots give the same observations below. Paths are relative to `/Users/kpburson/.codex/worktrees/8dae/ai-task-manager`.

| Path                                                                    | Current SHA-256                                                    | Bytes | Snapshot observation                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ | ----- | ---------------------------------------------- |
| `.ai-task-manager/runtime/store/sessions/fresh/pending-pause.json`      | `91fec2019e7460ea46fe466656e78d78f8818dc8b5aa07e9926ca845c9518a64` | 98    | Present; exact match.                          |
| `.ai-task-manager/runtime/store/sessions/mine/pending-pause.json`       | `36372e2a0350b880f324566ad00b3c206e4908ffc3e292c799e3e7a3f5bf1743` | 81    | Present; exact match.                          |
| `.ai-task-manager/runtime/store/sessions/corrupt/pending-pause.json`    | `194e7b064ddb269a8a1088e80bf01b947cc11da445afc0135e524b96a2a3f30f` | 12    | Present; exact match.                          |
| `.ai-task-manager/runtime/store/sessions/caller-sid/pending-pause.json` | `825a95fda499eb613558d5c898c54cfbbc2a79d212ac4ae8b45feda5ed1d3444` | 102   | Absent from both snapshots; retained addition. |
| `.ai-task-manager/runtime/store/locks/issue-6561169.lock/holder.json`   | `19a1b1409d243f41672a0256775e8339631b52e343e94b2ee308dc349586bce5` | 170   | Absent from both snapshots; retained addition. |

The similar `.ai-task-manager/runtime/store/locks/issue-1261.lock/holder.json` is an original preserved file, not one of the two additions: SHA-256 `c92511089dadd3cba9e75fc5295481b46bcaf602fd1823e6241aba695cd107e8`, 172 bytes, matching both snapshots. Do not misclassify it based on its name.

All these files remain untouched. The two additions are excluded from authored source/review commits and the admitted disposable candidate's executable source/test population. Their exclusion must be explicit in any future candidate manifest; retain them in preservation and operational authority inventories. Their presence blocks an empty-init absence claim for the live worktree. No cleanup, trust or authority is inferred from fixture contents.

## Required mechanism before affected TIA execution

1. Create a byte-matched disposable candidate from an explicit source/test manifest in a real isolated Git root. Preserve its exact candidate/base identity. Keep genuine author/native lifecycle context bound to 8dae; test input must not copy another actor's identity or enable a production bypass.
2. Require explicit test-owned roots or injected unit adapters for every selected fixture callback. Characterize the resolved physical authority paths; a source search alone is not isolation proof.
3. Enforce write access only to declared disposable fixture/output roots for test children. The preserved worktree, delivered control, genuine authority and private fixtures must be read-only or inaccessible. If this cannot be enforced, do not run the affected set against those assets.
4. Compare the protected-path manifest before/after, including bytes, mode, symlink targets and presence/absence; new files count as changes. Retain raw failures and outside-write attempts. Hash comparison detects a breach and complements enforced isolation; it does not prevent one alone.
5. Use canonical `discoverTestFiles({ projectRoot })`/TIA selection against the disposable candidate, with the full selected population and no scratch stable-image collection. Broader lanes remain PR/cloud CI. No local full suites, live activation or manual genuine-authority repair.

## Scope disposition

The incident blocks unsafe verification, not read-only design analysis or admitted documentation edits. The accepted decomposition assigns C1-caused repair to C1 and uncertain attribution to epic triage, and prohibits hiding overruns in small nested defects. A governed separate defect may be warranted if triage proves an independent outcome; this manual document-review round does not create one, change dependencies or disposition, or drive another issue to Done. The incident remains unresolved. Future implementation/verification owners must admit the repair/isolation route before claiming acceptance.

Private author-round baseline: `.scratch/gh/1861-manual-author-r1-preservation.json`. Historical preservation: `.scratch/gh/1861-empty-xpr-preservation.json`. These are preservation evidence, not Test receipts, timing measurements or package review acceptance.
