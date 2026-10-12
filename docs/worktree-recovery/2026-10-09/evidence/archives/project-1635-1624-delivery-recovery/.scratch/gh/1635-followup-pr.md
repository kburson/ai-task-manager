## Summary

- absorb the Node 24 `child.stdin` EPIPE race discovered while validating the
  preserved #1624 delivery branch
- retain fail-closed handling for every non-EPIPE stdin error and nonzero child
  exit
- isolate #1635's one-entry package allowance so the exact accepted #1624
  history merges cleanly and produces the combined ceiling of 785

## Governance

- Recovery issue: #1635
- Prior capability delivery: #1637
- Exact source HEAD: `32dba438ecfc47d2f7a4e95d7f58cf42fde19e5a`
- Preserved #1624 HEAD remains unchanged:
  `2158a289a63b27b9b4d08b8701a16f0b9d3e805d`

## Verification

- `npm test` — all 850 files passed
- `npm run test:slow` — all 52 files passed
- `npm run lint` — passed
- `npm run format:check` — passed
- `git merge-tree --write-tree --messages HEAD feature/epic/1624` — clean
- independent re-review — no Critical or Important findings; ready to merge
