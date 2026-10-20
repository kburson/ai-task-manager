# Fixed traffic budgets

Frozen before final comparison. SHA256 `1c309dd0062f1be6f3cfaef2d5c9d818e6ca70c426dad37b82cd812670cae49a`. The baseline-only membership amendment is reviewed in baseline-budget-review.md; no other caps derive from observed output.

```json
{
  "changedPublication": {
    "baseline": {
      "total": 512,
      "families": {
        "membership": 196,
        "projection": 96,
        "issue-body-read": 160,
        "body-write": 32,
        "project-field-write": 8,
        "repository-link": 4,
        "target-binding": 0,
        "target-project": 0,
        "target-body": 0,
        "field-options": 4
      }
    },
    "optimized": {
      "total": 384,
      "families": {
        "membership": 96,
        "projection": 96,
        "issue-body-read": 160,
        "body-write": 32,
        "project-field-write": 8,
        "repository-link": 4,
        "target-binding": 1,
        "target-project": 80,
        "target-body": 40,
        "field-options": 4
      }
    }
  },
  "unchanged": {
    "total": 16,
    "families": {
      "membership": 4,
      "projection": 4,
      "issue-body-read": 8
    }
  },
  "emptyLeaf": {
    "total": 1,
    "families": {
      "hook-root": 1
    }
  },
  "parent": {
    "total": 3,
    "families": {
      "hook-root": 1,
      "hook-graph": 1,
      "hook-fence": 1
    }
  },
  "comments": {
    "total": 3,
    "families": {
      "hook-root": 1,
      "hook-root-continuation": 1,
      "hook-fence": 1
    }
  },
  "parent51": {
    "total": 5,
    "families": {
      "hook-root": 1,
      "hook-graph": 2,
      "hook-fence": 2
    }
  },
  "hookMaximum": {
    "total": 1217,
    "families": {
      "hook-root": 1,
      "hook-root-continuation": 6,
      "hook-graph": 3,
      "hook-child-continuation": 1200,
      "hook-fence": 7
    }
  },
  "target": {
    "total": 7,
    "families": {
      "target-binding": 1,
      "target-project": 5,
      "target-body": 1
    }
  },
  "recovery": {
    "total": 768,
    "families": {
      "membership": 192,
      "projection": 192,
      "issue-body-read": 320,
      "body-write": 64,
      "project-field-write": 16,
      "repository-link": 8,
      "target-binding": 2,
      "target-project": 160,
      "target-body": 80,
      "field-options": 8
    }
  },
  "publicRoute": {
    "total": 2048,
    "families": {
      "membership": 384,
      "projection": 384,
      "issue-body-read": 640,
      "body-write": 128,
      "project-field-write": 32,
      "repository-link": 16,
      "target-binding": 4,
      "target-project": 320,
      "target-body": 160,
      "field-options": 16,
      "route-read": 128,
      "route-write": 64
    }
  }
}
```
