# #2073 planning usage checkpoint

Raw per-call records remain in the native local usage store. The complete checkpoint payload follows.

```json
{
  "capturedAt": "2026-10-20T13:12:17.129Z",
  "since": "2026-10-20T12:25:54.070Z",
  "through": "2026-10-20T13:08:30.127Z",
  "worktreeId": "sha256:3f43960145f2d2ac9ac8ae49565355849bf915411d7f360e371d80965b68cd56",
  "scope": "Observed #2073 rows in this worktree; includes native authority reads, bind, reconciliation, ownership, refinement attempts, Start time recovery and Plan entry. Shared-worktree activity may overlap. Later issue metadata, commit trace and pause calls remain in raw capture after this checkpoint.",
  "observations": 733,
  "knownPointSubtotal": 518,
  "unknownCostObservations": 257,
  "failedObservations": 0,
  "limits": "Observations are not exact HTTP counts. Opaque CLI expansion is unknown. This collector does not measure payload bytes or record exact caller stacks. Point costs are reported subtotals, not globally reconciled quota charges. No historical cloud tasks were read for estimation.",
  "groups": {
    "gh.issue.view": {
      "observations": 223,
      "knownPoints": 0,
      "unknownCosts": 223,
      "failures": 0,
      "fingerprints": []
    },
    "anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96": {
      "observations": 15,
      "knownPoints": 15,
      "unknownCosts": 0,
      "failures": 0,
      "fingerprints": [
        "sha256:cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96"
      ]
    },
    "anonymous.cf1d97f59243f1991a8ca4b9b4c343c88023dc66f9b7701a65eaae7b2a8d1dc4": {
      "observations": 23,
      "knownPoints": 23,
      "unknownCosts": 0,
      "failures": 0,
      "fingerprints": [
        "sha256:cf1d97f59243f1991a8ca4b9b4c343c88023dc66f9b7701a65eaae7b2a8d1dc4"
      ]
    },
    "anonymous.ff0fe7b2e4472490bcf64ede1f2294284949c8f594bc90380291abfe561b6250": {
      "observations": 12,
      "knownPoints": 0,
      "unknownCosts": 12,
      "failures": 0,
      "fingerprints": [
        "sha256:ff0fe7b2e4472490bcf64ede1f2294284949c8f594bc90380291abfe561b6250"
      ]
    },
    "anonymous.2e9aad4db59390fe2f25c72aaa36d8e8e6ed8581fe8d2b70d99485749761286f": {
      "observations": 112,
      "knownPoints": 112,
      "unknownCosts": 0,
      "failures": 0,
      "fingerprints": [
        "sha256:2e9aad4db59390fe2f25c72aaa36d8e8e6ed8581fe8d2b70d99485749761286f"
      ]
    },
    "anonymous.e613994d2fa7cba1d9e5a6598c647317c8c623a6d6783e097b5a6fb81d9c748a": {
      "observations": 16,
      "knownPoints": 16,
      "unknownCosts": 0,
      "failures": 0,
      "fingerprints": [
        "sha256:e613994d2fa7cba1d9e5a6598c647317c8c623a6d6783e097b5a6fb81d9c748a"
      ]
    },
    "anonymous.eb74807a6a65f2b6bd97223fe7b3dde004d1f6b6c2b5baa8d00570dc8acd446a": {
      "observations": 136,
      "knownPoints": 136,
      "unknownCosts": 0,
      "failures": 0,
      "fingerprints": [
        "sha256:eb74807a6a65f2b6bd97223fe7b3dde004d1f6b6c2b5baa8d00570dc8acd446a"
      ]
    },
    "AitmEstimationProjection": {
      "observations": 136,
      "knownPoints": 136,
      "unknownCosts": 0,
      "failures": 0,
      "fingerprints": [
        "sha256:87086ba6edb8800812251828ad095552d6cdbc08f264be0952a1a07ae46b874f"
      ]
    },
    "gh.issue.edit": {
      "observations": 21,
      "knownPoints": 0,
      "unknownCosts": 21,
      "failures": 0,
      "fingerprints": []
    },
    "anonymous.3d423b50b18e2ea11895a8a084163f313b876e1be8a5494a7bd173636edee235": {
      "observations": 1,
      "knownPoints": 1,
      "unknownCosts": 0,
      "failures": 0,
      "fingerprints": [
        "sha256:3d423b50b18e2ea11895a8a084163f313b876e1be8a5494a7bd173636edee235"
      ]
    },
    "anonymous.b2ea38f9b2b4ebe5107b7877ff3aaf76a634ace6dad36d9164ef3eb134d67cd1": {
      "observations": 14,
      "knownPoints": 14,
      "unknownCosts": 0,
      "failures": 0,
      "fingerprints": [
        "sha256:b2ea38f9b2b4ebe5107b7877ff3aaf76a634ace6dad36d9164ef3eb134d67cd1"
      ]
    },
    "anonymous.a014cc2aaca3fbe84458a73fe515a579e6094c88053337b28c2db11050b6ebf9": {
      "observations": 2,
      "knownPoints": 2,
      "unknownCosts": 0,
      "failures": 0,
      "fingerprints": [
        "sha256:a014cc2aaca3fbe84458a73fe515a579e6094c88053337b28c2db11050b6ebf9"
      ]
    },
    "anonymous.6e738cbdb4bd0d44c4a01ca0d81f8fa0348800f4dc296173a88ea8333220bcf7": {
      "observations": 6,
      "knownPoints": 6,
      "unknownCosts": 0,
      "failures": 0,
      "fingerprints": [
        "sha256:6e738cbdb4bd0d44c4a01ca0d81f8fa0348800f4dc296173a88ea8333220bcf7"
      ]
    },
    "anonymous.0a09de4dc0c3072fa1bffa3c9d52090ba6de709e96569dbaa94614e5cfdb252b": {
      "observations": 6,
      "knownPoints": 6,
      "unknownCosts": 0,
      "failures": 0,
      "fingerprints": [
        "sha256:0a09de4dc0c3072fa1bffa3c9d52090ba6de709e96569dbaa94614e5cfdb252b"
      ]
    },
    "anonymous.bddfdc412573bfcc8558eba33c15f1223649fd07508197f3d973ed99763d9d46": {
      "observations": 5,
      "knownPoints": 5,
      "unknownCosts": 0,
      "failures": 0,
      "fingerprints": [
        "sha256:bddfdc412573bfcc8558eba33c15f1223649fd07508197f3d973ed99763d9d46"
      ]
    },
    "gh.issue.comment": {
      "observations": 1,
      "knownPoints": 0,
      "unknownCosts": 1,
      "failures": 0,
      "fingerprints": []
    },
    "anonymous.c5c67459578b61e62839b31a93bde9e289768e55b7c7daace9629c295c299580": {
      "observations": 2,
      "knownPoints": 44,
      "unknownCosts": 0,
      "failures": 0,
      "fingerprints": [
        "sha256:c5c67459578b61e62839b31a93bde9e289768e55b7c7daace9629c295c299580"
      ]
    },
    "anonymous.5947c36c187a469f79ab955f1eb875572b63c5d4b7a7cd53b0e3921e257ad39e": {
      "observations": 2,
      "knownPoints": 2,
      "unknownCosts": 0,
      "failures": 0,
      "fingerprints": [
        "sha256:5947c36c187a469f79ab955f1eb875572b63c5d4b7a7cd53b0e3921e257ad39e"
      ]
    }
  },
  "integrity": {
    "partial": 0,
    "malformed": 0,
    "unreadable": 0
  }
}
```
