# Native hook selected-transport proof

Allow uses the native silent-success contract (exit zero, no JSON); all cases require a nonempty successful provider ledger.

```json
{
  "surface": "source-edit-gate",
  "drift": false,
  "result": {
    "code": 0,
    "stdout": "",
    "stderr": "",
    "decision": null
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
      "serializedResponseBytes": 3692,
      "family": "hook-root",
      "kind": "query",
      "operation": null,
      "queryFingerprint": "sha256:6c50814dc16a5f4394d9f9a12fd2879476feb6e26d2f2fb61d2a868291d0a1e6",
      "fingerprintVersion": "v1",
      "transport": "graphql",
      "selectedChildProjectFields": false
    }
  ]
}
```
