# #2073 native forecast input

The owner authorized required native adaptive forecast historical reads for #2073 only. Base work hours are copied from the reviewed plan. Signals identify logical module areas, not a source-file count. Native breadth and repository costs may yield a separate calibrated forecast. No historical task was used to create the original local estimate.

```json
{
  "schema": "aitm.plan-estimation-input/v1",
  "wbs": [
    {
      "id": "conditional-admission",
      "description": "Conditional admission with retained-source baseline and bounded phase safety tests",
      "baseHumanHours": 2.25,
      "independentlyReviewable": true,
      "signals": {
        "modules": [
          "admission",
          "traffic-fixtures"
        ],
        "dependencies": []
      }
    },
    {
      "id": "typed-effect-observations",
      "description": "Fresh typed target observations and exact recovery compatibility",
      "baseHumanHours": 2.25,
      "independentlyReviewable": true,
      "signals": {
        "modules": [
          "target-observation",
          "field-publication"
        ],
        "dependencies": []
      }
    },
    {
      "id": "integrated-traffic-proof",
      "description": "Paired source traffic proof, public routing, repository checks and review",
      "baseHumanHours": 2,
      "independentlyReviewable": true,
      "signals": {
        "modules": [
          "traffic-fixtures",
          "verification"
        ],
        "dependencies": []
      }
    }
  ],
  "testImpact": {
    "expectedMinutes": 30,
    "isolation": "Offline isolated provider fixtures and native exact-head verification sandbox",
    "lanes": [
      "unit",
      "integration",
      "slow"
    ]
  },
  "risks": [
    "Local owner-approved forecast 6.5h with 6-9h risk remains separate from calibrated native forecast",
    "Query-aware baseline and legacy caller compatibility may exceed forecast",
    "Historical cloud reads allowed only for required native #2073 forecast by owner answer A"
  ],
  "comparableIssueIds": []
}
```
