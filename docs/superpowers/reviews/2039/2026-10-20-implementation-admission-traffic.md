# #2039 captured implementation-admission traffic

Scope: this worktree, observations started since 2026-10-20T23:58:13.401Z. Local collector snapshot; no cloud history lookup.

```json
{
  "observations": 2776,
  "knownPoints": 2444,
  "unknownCost": 1088,
  "first": "2026-10-20T23:59:01.744Z",
  "last": "2026-10-21T01:14:30.527Z",
  "malformed": 0,
  "unreadable": 0,
  "partial": 0,
  "unclosed": 426
}
```

## Highest observation counts

| Observation kind, operation, issue | Observations | Known points | Unknown costs |
| --- | ---: | ---: | ---: |
| opaque-cli-invocation  /  anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96  /  2054 | 93 | 93 | 0 |
| opaque-cli-invocation  /  anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96  /  2059 | 90 | 90 | 0 |
| opaque-cli-invocation  /  anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96  /  2061 | 89 | 89 | 0 |
| opaque-cli-invocation  /  anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96  /  2055 | 86 | 86 | 0 |
| opaque-cli-invocation  /  anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96  /  2073 | 82 | 82 | 0 |
| opaque-cli-invocation  /  gh.issue.view  /  2039 | 72 | 0 | 72 |
| opaque-cli-invocation  /  anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96  /  2041 | 62 | 62 | 0 |
| opaque-cli-invocation  /  anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96  /  2040 | 61 | 61 | 0 |
| opaque-cli-invocation  /  anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96  /  2062 | 60 | 60 | 0 |
| opaque-cli-invocation  /  anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96  /  2065 | 59 | 59 | 0 |
| opaque-cli-invocation  /  anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96  /  2048 | 57 | 57 | 0 |
| opaque-cli-invocation  /  anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96  /  2071 | 56 | 56 | 0 |

Retained baseline: 8,028 observations, 3,648 known returned-cost points, 4,590 unknown costs. This window is bootstrap and admission work against the parent and its current children, not a controlled repeat of that baseline workflow. No causal reduction or full HTTP quota consumption can be inferred. Wire bytes and hidden CLI requests remain unknown. Unclosed writers are collector coverage warnings, not proof that those processes remain active.

Native captured commands retain AITM_GRAPHQL_USAGE=1. The current refusal is a bounded decomposition authority remote deadline; native Explain is indeterminate, so Develop admission has not occurred.
