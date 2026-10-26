# Native hook selected-transport proof

Allow uses the native silent-success contract (exit zero, no JSON); all cases require a nonempty successful provider ledger.

```json
{
  "surface": "source-edit-gate",
  "drift": true,
  "result": {
    "code": 0,
    "stdout": "{\"decision\":\"block\",\"reason\":\"[task-tracker] Decomposition authority unavailable for #107: root ownership drift\",\"code\":\"decomposition-authority-unavailable\",\"args\":{\"issue\":107,\"operationId\":null}}",
    "stderr": "",
    "decision": {
      "decision": "block",
      "reason": "[task-tracker] Decomposition authority unavailable for #107: root ownership drift",
      "code": "decomposition-authority-unavailable",
      "args": {
        "issue": 107,
        "operationId": null
      }
    }
  },
  "ledger": [
    {
      "index": 1,
      "phase": "hook-root",
      "target": "ISSUE_107",
      "byteLayer": "serialized-graphql-response-envelope",
      "cost": null,
      "costStatus": "unknown-offline",
      "outcome": "success",
      "serializedResponseBytes": 32568,
      "family": "hook-root",
      "kind": "query",
      "operation": null,
      "queryFingerprint": "sha256:6c50814dc16a5f4394d9f9a12fd2879476feb6e26d2f2fb61d2a868291d0a1e6",
      "fingerprintVersion": "v1",
      "transport": "graphql",
      "selectedChildProjectFields": false
    },
    {
      "index": 2,
      "phase": "hook-root-continuation",
      "target": "ISSUE_107",
      "byteLayer": "serialized-graphql-response-envelope",
      "cost": null,
      "costStatus": "unknown-offline",
      "outcome": "success",
      "serializedResponseBytes": 3257,
      "family": "hook-root-continuation",
      "kind": "query",
      "operation": null,
      "queryFingerprint": "sha256:a561834dbdee72ab47060d605d2fb9d45db082fa4bbabe67c69fe8d078a1e467",
      "fingerprintVersion": "v1",
      "transport": "graphql",
      "selectedChildProjectFields": false
    },
    {
      "index": 3,
      "phase": "hook-fence",
      "target": "ISSUE_107",
      "byteLayer": "serialized-graphql-response-envelope",
      "cost": null,
      "costStatus": "unknown-offline",
      "outcome": "success",
      "serializedResponseBytes": 3621,
      "family": "hook-fence",
      "kind": "query",
      "operation": null,
      "queryFingerprint": "sha256:46291e7acd08033044a88f377e85a135e1a9b007d844290a40a8104722d6125b",
      "fingerprintVersion": "v1",
      "transport": "graphql",
      "selectedChildProjectFields": false
    }
  ]
}
```
