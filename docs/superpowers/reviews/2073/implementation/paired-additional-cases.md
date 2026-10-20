# Additional paired traffic cases

The 51-child case preserves the existing readiness-children refusal. All other hook cases allow; unchanged publication returns unchanged.

```json
[
  {
    "fixtureId": "empty-leaf",
    "boundary": "hook",
    "baseline": {
      "outcome": {
        "decision": "allow",
        "reason": "current-decomposition-capability",
        "signals": {
          "state": null,
          "body": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind=\"code\" -->\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
          "hasPostedMarker": false,
          "hasCompleteMarker": false,
          "assignees": [
            "operator"
          ],
          "currentUser": "operator",
          "source": "fresh-combined-snapshot"
        }
      },
      "snapshot": {
        "issueBody": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind=\"code\" -->\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
        "projectValues": {
          "estimate": 2,
          "size": "S"
        },
        "publication": null,
        "before": null,
        "subject": {
          "repository": "o/r",
          "issue": 2073,
          "projectId": "P",
          "projectItemId": "ITEM"
        }
      },
      "ledger": [
        {
          "index": 1,
          "phase": "hook-root",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 1266,
          "family": "hook-root",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:d4b2726f69bd13920fe64631b1b0ee3471373a4728e44a448ffd4382b392f9f3",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": true
        }
      ],
      "sourceManifest": {
        "scripts/task-tracker/lib/decomposition-field-writer.mjs": "5215a5efcfd3571bfd902579a637217ed57f67739c0e1e10c2432c6864adc283",
        "scripts/task-tracker/lib/decomposition-kind.mjs": null,
        "scripts/task-tracker/lib/decomposition-target-observation.mjs": null,
        "scripts/task-tracker/lib/decomposition-hook-authority.mjs": "ba9721201c7f7819b160a7e35ba1b5501c3202eaa31bacb087d5bda9867c4822",
        "scripts/task-tracker/lib/estimate-writer-publication.mjs": "d599f890598046df62d5aec66fecd2dc9315ca5dc536e939382cf852420dc163",
        "scripts/task-tracker/lib/decomposition-publication.mjs": "b0b2e63180319dee11f0777a1d82c329048582725a39f81de6ada59f0ff614e6",
        "scripts/task-tracker/lib/decomposition-projection.mjs": "dd53bf522d89e414d2ee191e597069a8512828f83c5129a8cb72ed0195c7dac5",
        "scripts/task-tracker/lib/decomposition-authority.mjs": "ae38df2877233e89a73a23464371245f2b766bf18f68c6f454680b736774c968"
      },
      "sourceHash": "9819b9d4342d255be601f5a706b9def7bf0ebc44ebe8476d30c935744c67837c",
      "fixtureManifest": {
        "refinement-traffic-cases.mjs": "7be708b33d0c4adb52f977d5c00504a69ca7cf6c18a5a600814a5ffdd0a09a19",
        "refinement-hook-population.mjs": "8e22289507fff1efc620386f21d69c673a576655c9c0044a2e8640d46da6a4da",
        "refinement-target-shapes.mjs": "e1c7e684ed2a51ebad6a2dd8ff1d8209d6311e870028bf920d091e59dbdee765",
        "refinement-target-fixture.mjs": "2b2a1ff2a7dfa0b24d3a61c92d326c33d74679eed6fd2973b4833a6e4fa49e5e",
        "estimation-publication.mjs": "0b44de93ce487a62d324b064a1bd70170277304bdcc769906aa7679944146133",
        "refinement-traffic-shapes.mjs": "6ae2123d702311adec3b513e2153b38d1e369a7044092bc9eb4b071ff81315a1",
        "refinement-traffic-runner.mjs": "ac4774a84401ca89f3fbacfeb33c4bca66af90ce60251ed8779563f41cf5c46e",
        "../helpers/refinement-traffic-provider.mjs": "4f97f47fef563b2c4bf6f659d79b9007edbb9c6f80b1b014a52f52a5cb7e0fa6",
        "../helpers/refinement-query-selection.mjs": "a822c832d68306f50b26e2f7cf3530cfa4ee8d4c117bb939b5903a956622a730"
      },
      "fixtureHash": "4d28c651081f56615f99ea62e35e19b0faca6cbcab08a2dd10e1ca089b7b6081",
      "configurationHash": "d4d585eea6e0455180a23ded613312603ace5e7f6514bb07c87cc1ea835341bd"
    },
    "optimized": {
      "outcome": {
        "decision": "allow",
        "reason": "current-decomposition-capability",
        "signals": {
          "state": null,
          "body": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind=\"code\" -->\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
          "hasPostedMarker": false,
          "hasCompleteMarker": false,
          "assignees": [
            "operator"
          ],
          "currentUser": "operator",
          "source": "fresh-combined-snapshot"
        }
      },
      "snapshot": {
        "issueBody": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind=\"code\" -->\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
        "projectValues": {
          "estimate": 2,
          "size": "S"
        },
        "publication": null,
        "before": null,
        "subject": {
          "repository": "o/r",
          "issue": 2073,
          "projectId": "P",
          "projectItemId": "ITEM"
        }
      },
      "ledger": [
        {
          "index": 1,
          "phase": "hook-root",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 1303,
          "family": "hook-root",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:6c50814dc16a5f4394d9f9a12fd2879476feb6e26d2f2fb61d2a868291d0a1e6",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": false
        }
      ],
      "sourceManifest": {
        "scripts/task-tracker/lib/decomposition-field-writer.mjs": "b0cf5f02885af38384ca8dff834cff84ab13bcd94c3759cd990015026230f05e",
        "scripts/task-tracker/lib/decomposition-kind.mjs": "0e8c15639efba720e548ccb2b9cec39e7471c521f94c6c1ad19b981542a029af",
        "scripts/task-tracker/lib/decomposition-target-observation.mjs": "c5c5caa7c4045adb63c51296fa1f9cb7a56c6df80cb4743e719177b7b0e9d7e3",
        "scripts/task-tracker/lib/decomposition-hook-authority.mjs": "ae7b3a15cc508d6c3de4790fe0f844dda49b912cc5315d3f8aae62c07ea266c1",
        "scripts/task-tracker/lib/estimate-writer-publication.mjs": "d599f890598046df62d5aec66fecd2dc9315ca5dc536e939382cf852420dc163",
        "scripts/task-tracker/lib/decomposition-publication.mjs": "b0b2e63180319dee11f0777a1d82c329048582725a39f81de6ada59f0ff614e6",
        "scripts/task-tracker/lib/decomposition-projection.mjs": "dd53bf522d89e414d2ee191e597069a8512828f83c5129a8cb72ed0195c7dac5",
        "scripts/task-tracker/lib/decomposition-authority.mjs": "cc01521652dd0bd3dccad801eae1edea8ce39242df94e8f55dfa65baabada4f6"
      },
      "sourceHash": "8a97a9cca584032cae6e25a8364558d789ba153408b6a440e02a327c6958527e",
      "fixtureManifest": {
        "refinement-traffic-cases.mjs": "7be708b33d0c4adb52f977d5c00504a69ca7cf6c18a5a600814a5ffdd0a09a19",
        "refinement-hook-population.mjs": "8e22289507fff1efc620386f21d69c673a576655c9c0044a2e8640d46da6a4da",
        "refinement-target-shapes.mjs": "e1c7e684ed2a51ebad6a2dd8ff1d8209d6311e870028bf920d091e59dbdee765",
        "refinement-target-fixture.mjs": "2b2a1ff2a7dfa0b24d3a61c92d326c33d74679eed6fd2973b4833a6e4fa49e5e",
        "estimation-publication.mjs": "0b44de93ce487a62d324b064a1bd70170277304bdcc769906aa7679944146133",
        "refinement-traffic-shapes.mjs": "6ae2123d702311adec3b513e2153b38d1e369a7044092bc9eb4b071ff81315a1",
        "refinement-traffic-runner.mjs": "ac4774a84401ca89f3fbacfeb33c4bca66af90ce60251ed8779563f41cf5c46e",
        "../helpers/refinement-traffic-provider.mjs": "4f97f47fef563b2c4bf6f659d79b9007edbb9c6f80b1b014a52f52a5cb7e0fa6",
        "../helpers/refinement-query-selection.mjs": "a822c832d68306f50b26e2f7cf3530cfa4ee8d4c117bb939b5903a956622a730"
      },
      "fixtureHash": "4d28c651081f56615f99ea62e35e19b0faca6cbcab08a2dd10e1ca089b7b6081",
      "configurationHash": "d4d585eea6e0455180a23ded613312603ace5e7f6514bb07c87cc1ea835341bd"
    }
  },
  {
    "fixtureId": "empty-unmarked-leaf",
    "boundary": "hook",
    "baseline": {
      "outcome": {
        "decision": "allow",
        "reason": "current-decomposition-capability",
        "signals": {
          "state": null,
          "body": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## AITM Progress Markers\n\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
          "hasPostedMarker": false,
          "hasCompleteMarker": false,
          "assignees": [
            "operator"
          ],
          "currentUser": "operator",
          "source": "fresh-combined-snapshot"
        }
      },
      "snapshot": {
        "issueBody": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## AITM Progress Markers\n\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
        "projectValues": {
          "estimate": 2,
          "size": "S"
        },
        "publication": null,
        "before": null,
        "subject": {
          "repository": "o/r",
          "issue": 2073,
          "projectId": "P",
          "projectItemId": "ITEM"
        }
      },
      "ledger": [
        {
          "index": 1,
          "phase": "hook-root",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 1228,
          "family": "hook-root",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:d4b2726f69bd13920fe64631b1b0ee3471373a4728e44a448ffd4382b392f9f3",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": true
        }
      ],
      "sourceManifest": {
        "scripts/task-tracker/lib/decomposition-field-writer.mjs": "5215a5efcfd3571bfd902579a637217ed57f67739c0e1e10c2432c6864adc283",
        "scripts/task-tracker/lib/decomposition-kind.mjs": null,
        "scripts/task-tracker/lib/decomposition-target-observation.mjs": null,
        "scripts/task-tracker/lib/decomposition-hook-authority.mjs": "ba9721201c7f7819b160a7e35ba1b5501c3202eaa31bacb087d5bda9867c4822",
        "scripts/task-tracker/lib/estimate-writer-publication.mjs": "d599f890598046df62d5aec66fecd2dc9315ca5dc536e939382cf852420dc163",
        "scripts/task-tracker/lib/decomposition-publication.mjs": "b0b2e63180319dee11f0777a1d82c329048582725a39f81de6ada59f0ff614e6",
        "scripts/task-tracker/lib/decomposition-projection.mjs": "dd53bf522d89e414d2ee191e597069a8512828f83c5129a8cb72ed0195c7dac5",
        "scripts/task-tracker/lib/decomposition-authority.mjs": "ae38df2877233e89a73a23464371245f2b766bf18f68c6f454680b736774c968"
      },
      "sourceHash": "9819b9d4342d255be601f5a706b9def7bf0ebc44ebe8476d30c935744c67837c",
      "fixtureManifest": {
        "refinement-traffic-cases.mjs": "7be708b33d0c4adb52f977d5c00504a69ca7cf6c18a5a600814a5ffdd0a09a19",
        "refinement-hook-population.mjs": "8e22289507fff1efc620386f21d69c673a576655c9c0044a2e8640d46da6a4da",
        "refinement-target-shapes.mjs": "e1c7e684ed2a51ebad6a2dd8ff1d8209d6311e870028bf920d091e59dbdee765",
        "refinement-target-fixture.mjs": "2b2a1ff2a7dfa0b24d3a61c92d326c33d74679eed6fd2973b4833a6e4fa49e5e",
        "estimation-publication.mjs": "0b44de93ce487a62d324b064a1bd70170277304bdcc769906aa7679944146133",
        "refinement-traffic-shapes.mjs": "6ae2123d702311adec3b513e2153b38d1e369a7044092bc9eb4b071ff81315a1",
        "refinement-traffic-runner.mjs": "ac4774a84401ca89f3fbacfeb33c4bca66af90ce60251ed8779563f41cf5c46e",
        "../helpers/refinement-traffic-provider.mjs": "4f97f47fef563b2c4bf6f659d79b9007edbb9c6f80b1b014a52f52a5cb7e0fa6",
        "../helpers/refinement-query-selection.mjs": "a822c832d68306f50b26e2f7cf3530cfa4ee8d4c117bb939b5903a956622a730"
      },
      "fixtureHash": "4d28c651081f56615f99ea62e35e19b0faca6cbcab08a2dd10e1ca089b7b6081",
      "configurationHash": "d4d585eea6e0455180a23ded613312603ace5e7f6514bb07c87cc1ea835341bd"
    },
    "optimized": {
      "outcome": {
        "decision": "allow",
        "reason": "current-decomposition-capability",
        "signals": {
          "state": null,
          "body": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## AITM Progress Markers\n\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
          "hasPostedMarker": false,
          "hasCompleteMarker": false,
          "assignees": [
            "operator"
          ],
          "currentUser": "operator",
          "source": "fresh-combined-snapshot"
        }
      },
      "snapshot": {
        "issueBody": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## AITM Progress Markers\n\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
        "projectValues": {
          "estimate": 2,
          "size": "S"
        },
        "publication": null,
        "before": null,
        "subject": {
          "repository": "o/r",
          "issue": 2073,
          "projectId": "P",
          "projectItemId": "ITEM"
        }
      },
      "ledger": [
        {
          "index": 1,
          "phase": "hook-root",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 1265,
          "family": "hook-root",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:6c50814dc16a5f4394d9f9a12fd2879476feb6e26d2f2fb61d2a868291d0a1e6",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": false
        }
      ],
      "sourceManifest": {
        "scripts/task-tracker/lib/decomposition-field-writer.mjs": "b0cf5f02885af38384ca8dff834cff84ab13bcd94c3759cd990015026230f05e",
        "scripts/task-tracker/lib/decomposition-kind.mjs": "0e8c15639efba720e548ccb2b9cec39e7471c521f94c6c1ad19b981542a029af",
        "scripts/task-tracker/lib/decomposition-target-observation.mjs": "c5c5caa7c4045adb63c51296fa1f9cb7a56c6df80cb4743e719177b7b0e9d7e3",
        "scripts/task-tracker/lib/decomposition-hook-authority.mjs": "ae7b3a15cc508d6c3de4790fe0f844dda49b912cc5315d3f8aae62c07ea266c1",
        "scripts/task-tracker/lib/estimate-writer-publication.mjs": "d599f890598046df62d5aec66fecd2dc9315ca5dc536e939382cf852420dc163",
        "scripts/task-tracker/lib/decomposition-publication.mjs": "b0b2e63180319dee11f0777a1d82c329048582725a39f81de6ada59f0ff614e6",
        "scripts/task-tracker/lib/decomposition-projection.mjs": "dd53bf522d89e414d2ee191e597069a8512828f83c5129a8cb72ed0195c7dac5",
        "scripts/task-tracker/lib/decomposition-authority.mjs": "cc01521652dd0bd3dccad801eae1edea8ce39242df94e8f55dfa65baabada4f6"
      },
      "sourceHash": "8a97a9cca584032cae6e25a8364558d789ba153408b6a440e02a327c6958527e",
      "fixtureManifest": {
        "refinement-traffic-cases.mjs": "7be708b33d0c4adb52f977d5c00504a69ca7cf6c18a5a600814a5ffdd0a09a19",
        "refinement-hook-population.mjs": "8e22289507fff1efc620386f21d69c673a576655c9c0044a2e8640d46da6a4da",
        "refinement-target-shapes.mjs": "e1c7e684ed2a51ebad6a2dd8ff1d8209d6311e870028bf920d091e59dbdee765",
        "refinement-target-fixture.mjs": "2b2a1ff2a7dfa0b24d3a61c92d326c33d74679eed6fd2973b4833a6e4fa49e5e",
        "estimation-publication.mjs": "0b44de93ce487a62d324b064a1bd70170277304bdcc769906aa7679944146133",
        "refinement-traffic-shapes.mjs": "6ae2123d702311adec3b513e2153b38d1e369a7044092bc9eb4b071ff81315a1",
        "refinement-traffic-runner.mjs": "ac4774a84401ca89f3fbacfeb33c4bca66af90ce60251ed8779563f41cf5c46e",
        "../helpers/refinement-traffic-provider.mjs": "4f97f47fef563b2c4bf6f659d79b9007edbb9c6f80b1b014a52f52a5cb7e0fa6",
        "../helpers/refinement-query-selection.mjs": "a822c832d68306f50b26e2f7cf3530cfa4ee8d4c117bb939b5903a956622a730"
      },
      "fixtureHash": "4d28c651081f56615f99ea62e35e19b0faca6cbcab08a2dd10e1ca089b7b6081",
      "configurationHash": "d4d585eea6e0455180a23ded613312603ace5e7f6514bb07c87cc1ea835341bd"
    }
  },
  {
    "fixtureId": "two-child-ready-epic",
    "boundary": "hook",
    "baseline": {
      "outcome": {
        "decision": "allow",
        "reason": "current-decomposition-capability",
        "signals": {
          "state": null,
          "body": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: 1111111111111111111111111111111111111111\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind=\"epic\" -->\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
          "hasPostedMarker": false,
          "hasCompleteMarker": false,
          "assignees": [
            "operator"
          ],
          "currentUser": "operator",
          "source": "fresh-combined-snapshot"
        }
      },
      "snapshot": {
        "issueBody": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: 1111111111111111111111111111111111111111\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind=\"epic\" -->\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
        "projectValues": {
          "estimate": 2,
          "size": "S"
        },
        "publication": null,
        "before": null,
        "subject": {
          "repository": "o/r",
          "issue": 2073,
          "projectId": "P",
          "projectItemId": "ITEM"
        }
      },
      "ledger": [
        {
          "index": 1,
          "phase": "hook-root",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 4590,
          "family": "hook-root",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:d4b2726f69bd13920fe64631b1b0ee3471373a4728e44a448ffd4382b392f9f3",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": true
        }
      ],
      "sourceManifest": {
        "scripts/task-tracker/lib/decomposition-field-writer.mjs": "5215a5efcfd3571bfd902579a637217ed57f67739c0e1e10c2432c6864adc283",
        "scripts/task-tracker/lib/decomposition-kind.mjs": null,
        "scripts/task-tracker/lib/decomposition-target-observation.mjs": null,
        "scripts/task-tracker/lib/decomposition-hook-authority.mjs": "ba9721201c7f7819b160a7e35ba1b5501c3202eaa31bacb087d5bda9867c4822",
        "scripts/task-tracker/lib/estimate-writer-publication.mjs": "d599f890598046df62d5aec66fecd2dc9315ca5dc536e939382cf852420dc163",
        "scripts/task-tracker/lib/decomposition-publication.mjs": "b0b2e63180319dee11f0777a1d82c329048582725a39f81de6ada59f0ff614e6",
        "scripts/task-tracker/lib/decomposition-projection.mjs": "dd53bf522d89e414d2ee191e597069a8512828f83c5129a8cb72ed0195c7dac5",
        "scripts/task-tracker/lib/decomposition-authority.mjs": "ae38df2877233e89a73a23464371245f2b766bf18f68c6f454680b736774c968"
      },
      "sourceHash": "9819b9d4342d255be601f5a706b9def7bf0ebc44ebe8476d30c935744c67837c",
      "fixtureManifest": {
        "refinement-traffic-cases.mjs": "7be708b33d0c4adb52f977d5c00504a69ca7cf6c18a5a600814a5ffdd0a09a19",
        "refinement-hook-population.mjs": "8e22289507fff1efc620386f21d69c673a576655c9c0044a2e8640d46da6a4da",
        "refinement-target-shapes.mjs": "e1c7e684ed2a51ebad6a2dd8ff1d8209d6311e870028bf920d091e59dbdee765",
        "refinement-target-fixture.mjs": "2b2a1ff2a7dfa0b24d3a61c92d326c33d74679eed6fd2973b4833a6e4fa49e5e",
        "estimation-publication.mjs": "0b44de93ce487a62d324b064a1bd70170277304bdcc769906aa7679944146133",
        "refinement-traffic-shapes.mjs": "6ae2123d702311adec3b513e2153b38d1e369a7044092bc9eb4b071ff81315a1",
        "refinement-traffic-runner.mjs": "ac4774a84401ca89f3fbacfeb33c4bca66af90ce60251ed8779563f41cf5c46e",
        "../helpers/refinement-traffic-provider.mjs": "4f97f47fef563b2c4bf6f659d79b9007edbb9c6f80b1b014a52f52a5cb7e0fa6",
        "../helpers/refinement-query-selection.mjs": "a822c832d68306f50b26e2f7cf3530cfa4ee8d4c117bb939b5903a956622a730"
      },
      "fixtureHash": "4d28c651081f56615f99ea62e35e19b0faca6cbcab08a2dd10e1ca089b7b6081",
      "configurationHash": "c4fb1acab5261f66cd1ea310b3b6b087127a0e91b5af6fd6ac5a8ad49fe48d11"
    },
    "optimized": {
      "outcome": {
        "decision": "allow",
        "reason": "current-decomposition-capability",
        "signals": {
          "state": null,
          "body": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: 1111111111111111111111111111111111111111\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind=\"epic\" -->\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
          "hasPostedMarker": false,
          "hasCompleteMarker": false,
          "assignees": [
            "operator"
          ],
          "currentUser": "operator",
          "source": "fresh-combined-snapshot"
        }
      },
      "snapshot": {
        "issueBody": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: 1111111111111111111111111111111111111111\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind=\"epic\" -->\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
        "projectValues": {
          "estimate": 2,
          "size": "S"
        },
        "publication": null,
        "before": null,
        "subject": {
          "repository": "o/r",
          "issue": 2073,
          "projectId": "P",
          "projectItemId": "ITEM"
        }
      },
      "ledger": [
        {
          "index": 1,
          "phase": "hook-root",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 1457,
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
          "phase": "hook-graph",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 4040,
          "family": "hook-graph",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:fbd69fa6a252537d392d73cf28e590b97db7d625c0f4fce5ee134f852c400e5f",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": true
        },
        {
          "index": 3,
          "phase": "hook-fence",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 1383,
          "family": "hook-fence",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:46291e7acd08033044a88f377e85a135e1a9b007d844290a40a8104722d6125b",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": false
        }
      ],
      "sourceManifest": {
        "scripts/task-tracker/lib/decomposition-field-writer.mjs": "b0cf5f02885af38384ca8dff834cff84ab13bcd94c3759cd990015026230f05e",
        "scripts/task-tracker/lib/decomposition-kind.mjs": "0e8c15639efba720e548ccb2b9cec39e7471c521f94c6c1ad19b981542a029af",
        "scripts/task-tracker/lib/decomposition-target-observation.mjs": "c5c5caa7c4045adb63c51296fa1f9cb7a56c6df80cb4743e719177b7b0e9d7e3",
        "scripts/task-tracker/lib/decomposition-hook-authority.mjs": "ae7b3a15cc508d6c3de4790fe0f844dda49b912cc5315d3f8aae62c07ea266c1",
        "scripts/task-tracker/lib/estimate-writer-publication.mjs": "d599f890598046df62d5aec66fecd2dc9315ca5dc536e939382cf852420dc163",
        "scripts/task-tracker/lib/decomposition-publication.mjs": "b0b2e63180319dee11f0777a1d82c329048582725a39f81de6ada59f0ff614e6",
        "scripts/task-tracker/lib/decomposition-projection.mjs": "dd53bf522d89e414d2ee191e597069a8512828f83c5129a8cb72ed0195c7dac5",
        "scripts/task-tracker/lib/decomposition-authority.mjs": "cc01521652dd0bd3dccad801eae1edea8ce39242df94e8f55dfa65baabada4f6"
      },
      "sourceHash": "8a97a9cca584032cae6e25a8364558d789ba153408b6a440e02a327c6958527e",
      "fixtureManifest": {
        "refinement-traffic-cases.mjs": "7be708b33d0c4adb52f977d5c00504a69ca7cf6c18a5a600814a5ffdd0a09a19",
        "refinement-hook-population.mjs": "8e22289507fff1efc620386f21d69c673a576655c9c0044a2e8640d46da6a4da",
        "refinement-target-shapes.mjs": "e1c7e684ed2a51ebad6a2dd8ff1d8209d6311e870028bf920d091e59dbdee765",
        "refinement-target-fixture.mjs": "2b2a1ff2a7dfa0b24d3a61c92d326c33d74679eed6fd2973b4833a6e4fa49e5e",
        "estimation-publication.mjs": "0b44de93ce487a62d324b064a1bd70170277304bdcc769906aa7679944146133",
        "refinement-traffic-shapes.mjs": "6ae2123d702311adec3b513e2153b38d1e369a7044092bc9eb4b071ff81315a1",
        "refinement-traffic-runner.mjs": "ac4774a84401ca89f3fbacfeb33c4bca66af90ce60251ed8779563f41cf5c46e",
        "../helpers/refinement-traffic-provider.mjs": "4f97f47fef563b2c4bf6f659d79b9007edbb9c6f80b1b014a52f52a5cb7e0fa6",
        "../helpers/refinement-query-selection.mjs": "a822c832d68306f50b26e2f7cf3530cfa4ee8d4c117bb939b5903a956622a730"
      },
      "fixtureHash": "4d28c651081f56615f99ea62e35e19b0faca6cbcab08a2dd10e1ca089b7b6081",
      "configurationHash": "c4fb1acab5261f66cd1ea310b3b6b087127a0e91b5af6fd6ac5a8ad49fe48d11"
    }
  },
  {
    "fixtureId": "two-page-comments-leaf",
    "boundary": "hook",
    "baseline": {
      "outcome": {
        "decision": "allow",
        "reason": "current-decomposition-capability",
        "signals": {
          "state": null,
          "body": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind=\"code\" -->\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
          "hasPostedMarker": false,
          "hasCompleteMarker": false,
          "assignees": [
            "operator"
          ],
          "currentUser": "operator",
          "source": "fresh-combined-snapshot"
        }
      },
      "snapshot": {
        "issueBody": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind=\"code\" -->\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
        "projectValues": {
          "estimate": 2,
          "size": "S"
        },
        "publication": null,
        "before": null,
        "subject": {
          "repository": "o/r",
          "issue": 2073,
          "projectId": "P",
          "projectItemId": "ITEM"
        }
      },
      "ledger": [
        {
          "index": 1,
          "phase": "hook-root",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 31332,
          "family": "hook-root",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:d4b2726f69bd13920fe64631b1b0ee3471373a4728e44a448ffd4382b392f9f3",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": true
        },
        {
          "index": 2,
          "phase": "hook-root-continuation",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 427,
          "family": "hook-root-continuation",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:a8029dbfa58f93415dead76bc3be92c3d25fc2ea1b07eedb4d2bda4de373cd7a",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": false
        }
      ],
      "sourceManifest": {
        "scripts/task-tracker/lib/decomposition-field-writer.mjs": "5215a5efcfd3571bfd902579a637217ed57f67739c0e1e10c2432c6864adc283",
        "scripts/task-tracker/lib/decomposition-kind.mjs": null,
        "scripts/task-tracker/lib/decomposition-target-observation.mjs": null,
        "scripts/task-tracker/lib/decomposition-hook-authority.mjs": "ba9721201c7f7819b160a7e35ba1b5501c3202eaa31bacb087d5bda9867c4822",
        "scripts/task-tracker/lib/estimate-writer-publication.mjs": "d599f890598046df62d5aec66fecd2dc9315ca5dc536e939382cf852420dc163",
        "scripts/task-tracker/lib/decomposition-publication.mjs": "b0b2e63180319dee11f0777a1d82c329048582725a39f81de6ada59f0ff614e6",
        "scripts/task-tracker/lib/decomposition-projection.mjs": "dd53bf522d89e414d2ee191e597069a8512828f83c5129a8cb72ed0195c7dac5",
        "scripts/task-tracker/lib/decomposition-authority.mjs": "ae38df2877233e89a73a23464371245f2b766bf18f68c6f454680b736774c968"
      },
      "sourceHash": "9819b9d4342d255be601f5a706b9def7bf0ebc44ebe8476d30c935744c67837c",
      "fixtureManifest": {
        "refinement-traffic-cases.mjs": "7be708b33d0c4adb52f977d5c00504a69ca7cf6c18a5a600814a5ffdd0a09a19",
        "refinement-hook-population.mjs": "8e22289507fff1efc620386f21d69c673a576655c9c0044a2e8640d46da6a4da",
        "refinement-target-shapes.mjs": "e1c7e684ed2a51ebad6a2dd8ff1d8209d6311e870028bf920d091e59dbdee765",
        "refinement-target-fixture.mjs": "2b2a1ff2a7dfa0b24d3a61c92d326c33d74679eed6fd2973b4833a6e4fa49e5e",
        "estimation-publication.mjs": "0b44de93ce487a62d324b064a1bd70170277304bdcc769906aa7679944146133",
        "refinement-traffic-shapes.mjs": "6ae2123d702311adec3b513e2153b38d1e369a7044092bc9eb4b071ff81315a1",
        "refinement-traffic-runner.mjs": "ac4774a84401ca89f3fbacfeb33c4bca66af90ce60251ed8779563f41cf5c46e",
        "../helpers/refinement-traffic-provider.mjs": "4f97f47fef563b2c4bf6f659d79b9007edbb9c6f80b1b014a52f52a5cb7e0fa6",
        "../helpers/refinement-query-selection.mjs": "a822c832d68306f50b26e2f7cf3530cfa4ee8d4c117bb939b5903a956622a730"
      },
      "fixtureHash": "4d28c651081f56615f99ea62e35e19b0faca6cbcab08a2dd10e1ca089b7b6081",
      "configurationHash": "d4d585eea6e0455180a23ded613312603ace5e7f6514bb07c87cc1ea835341bd"
    },
    "optimized": {
      "outcome": {
        "decision": "allow",
        "reason": "current-decomposition-capability",
        "signals": {
          "state": null,
          "body": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind=\"code\" -->\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
          "hasPostedMarker": false,
          "hasCompleteMarker": false,
          "assignees": [
            "operator"
          ],
          "currentUser": "operator",
          "source": "fresh-combined-snapshot"
        }
      },
      "snapshot": {
        "issueBody": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind=\"code\" -->\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
        "projectValues": {
          "estimate": 2,
          "size": "S"
        },
        "publication": null,
        "before": null,
        "subject": {
          "repository": "o/r",
          "issue": 2073,
          "projectId": "P",
          "projectItemId": "ITEM"
        }
      },
      "ledger": [
        {
          "index": 1,
          "phase": "hook-root",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 31369,
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
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 1019,
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
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 1229,
          "family": "hook-fence",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:46291e7acd08033044a88f377e85a135e1a9b007d844290a40a8104722d6125b",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": false
        }
      ],
      "sourceManifest": {
        "scripts/task-tracker/lib/decomposition-field-writer.mjs": "b0cf5f02885af38384ca8dff834cff84ab13bcd94c3759cd990015026230f05e",
        "scripts/task-tracker/lib/decomposition-kind.mjs": "0e8c15639efba720e548ccb2b9cec39e7471c521f94c6c1ad19b981542a029af",
        "scripts/task-tracker/lib/decomposition-target-observation.mjs": "c5c5caa7c4045adb63c51296fa1f9cb7a56c6df80cb4743e719177b7b0e9d7e3",
        "scripts/task-tracker/lib/decomposition-hook-authority.mjs": "ae7b3a15cc508d6c3de4790fe0f844dda49b912cc5315d3f8aae62c07ea266c1",
        "scripts/task-tracker/lib/estimate-writer-publication.mjs": "d599f890598046df62d5aec66fecd2dc9315ca5dc536e939382cf852420dc163",
        "scripts/task-tracker/lib/decomposition-publication.mjs": "b0b2e63180319dee11f0777a1d82c329048582725a39f81de6ada59f0ff614e6",
        "scripts/task-tracker/lib/decomposition-projection.mjs": "dd53bf522d89e414d2ee191e597069a8512828f83c5129a8cb72ed0195c7dac5",
        "scripts/task-tracker/lib/decomposition-authority.mjs": "cc01521652dd0bd3dccad801eae1edea8ce39242df94e8f55dfa65baabada4f6"
      },
      "sourceHash": "8a97a9cca584032cae6e25a8364558d789ba153408b6a440e02a327c6958527e",
      "fixtureManifest": {
        "refinement-traffic-cases.mjs": "7be708b33d0c4adb52f977d5c00504a69ca7cf6c18a5a600814a5ffdd0a09a19",
        "refinement-hook-population.mjs": "8e22289507fff1efc620386f21d69c673a576655c9c0044a2e8640d46da6a4da",
        "refinement-target-shapes.mjs": "e1c7e684ed2a51ebad6a2dd8ff1d8209d6311e870028bf920d091e59dbdee765",
        "refinement-target-fixture.mjs": "2b2a1ff2a7dfa0b24d3a61c92d326c33d74679eed6fd2973b4833a6e4fa49e5e",
        "estimation-publication.mjs": "0b44de93ce487a62d324b064a1bd70170277304bdcc769906aa7679944146133",
        "refinement-traffic-shapes.mjs": "6ae2123d702311adec3b513e2153b38d1e369a7044092bc9eb4b071ff81315a1",
        "refinement-traffic-runner.mjs": "ac4774a84401ca89f3fbacfeb33c4bca66af90ce60251ed8779563f41cf5c46e",
        "../helpers/refinement-traffic-provider.mjs": "4f97f47fef563b2c4bf6f659d79b9007edbb9c6f80b1b014a52f52a5cb7e0fa6",
        "../helpers/refinement-query-selection.mjs": "a822c832d68306f50b26e2f7cf3530cfa4ee8d4c117bb939b5903a956622a730"
      },
      "fixtureHash": "4d28c651081f56615f99ea62e35e19b0faca6cbcab08a2dd10e1ca089b7b6081",
      "configurationHash": "d4d585eea6e0455180a23ded613312603ace5e7f6514bb07c87cc1ea835341bd"
    }
  },
  {
    "fixtureId": "51-child-ready-epic",
    "boundary": "hook",
    "baseline": {
      "outcome": {
        "decision": "block",
        "code": "decomposition-authority-unavailable",
        "args": {
          "issue": 2073,
          "operationId": null
        },
        "reason": "[task-tracker] Decomposition authority unavailable for #2073: decomposition:readiness-children"
      },
      "snapshot": {
        "issueBody": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: 1111111111111111111111111111111111111111\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind=\"epic\" -->\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
        "projectValues": {
          "estimate": 2,
          "size": "S"
        },
        "publication": null,
        "before": null,
        "subject": {
          "repository": "o/r",
          "issue": 2073,
          "projectId": "P",
          "projectItemId": "ITEM"
        }
      },
      "ledger": [
        {
          "index": 1,
          "phase": "hook-root",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 81814,
          "family": "hook-root",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:d4b2726f69bd13920fe64631b1b0ee3471373a4728e44a448ffd4382b392f9f3",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": true
        },
        {
          "index": 2,
          "phase": "hook-root-continuation",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 1733,
          "family": "hook-root-continuation",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:27e32c79859c9d075d4cbc07ec0d5ed5a1492cd09aac168280d9ec7dc1aa3513",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": true
        }
      ],
      "sourceManifest": {
        "scripts/task-tracker/lib/decomposition-field-writer.mjs": "5215a5efcfd3571bfd902579a637217ed57f67739c0e1e10c2432c6864adc283",
        "scripts/task-tracker/lib/decomposition-kind.mjs": null,
        "scripts/task-tracker/lib/decomposition-target-observation.mjs": null,
        "scripts/task-tracker/lib/decomposition-hook-authority.mjs": "ba9721201c7f7819b160a7e35ba1b5501c3202eaa31bacb087d5bda9867c4822",
        "scripts/task-tracker/lib/estimate-writer-publication.mjs": "d599f890598046df62d5aec66fecd2dc9315ca5dc536e939382cf852420dc163",
        "scripts/task-tracker/lib/decomposition-publication.mjs": "b0b2e63180319dee11f0777a1d82c329048582725a39f81de6ada59f0ff614e6",
        "scripts/task-tracker/lib/decomposition-projection.mjs": "dd53bf522d89e414d2ee191e597069a8512828f83c5129a8cb72ed0195c7dac5",
        "scripts/task-tracker/lib/decomposition-authority.mjs": "ae38df2877233e89a73a23464371245f2b766bf18f68c6f454680b736774c968"
      },
      "sourceHash": "9819b9d4342d255be601f5a706b9def7bf0ebc44ebe8476d30c935744c67837c",
      "fixtureManifest": {
        "refinement-traffic-cases.mjs": "7be708b33d0c4adb52f977d5c00504a69ca7cf6c18a5a600814a5ffdd0a09a19",
        "refinement-hook-population.mjs": "8e22289507fff1efc620386f21d69c673a576655c9c0044a2e8640d46da6a4da",
        "refinement-target-shapes.mjs": "e1c7e684ed2a51ebad6a2dd8ff1d8209d6311e870028bf920d091e59dbdee765",
        "refinement-target-fixture.mjs": "2b2a1ff2a7dfa0b24d3a61c92d326c33d74679eed6fd2973b4833a6e4fa49e5e",
        "estimation-publication.mjs": "0b44de93ce487a62d324b064a1bd70170277304bdcc769906aa7679944146133",
        "refinement-traffic-shapes.mjs": "6ae2123d702311adec3b513e2153b38d1e369a7044092bc9eb4b071ff81315a1",
        "refinement-traffic-runner.mjs": "ac4774a84401ca89f3fbacfeb33c4bca66af90ce60251ed8779563f41cf5c46e",
        "../helpers/refinement-traffic-provider.mjs": "4f97f47fef563b2c4bf6f659d79b9007edbb9c6f80b1b014a52f52a5cb7e0fa6",
        "../helpers/refinement-query-selection.mjs": "a822c832d68306f50b26e2f7cf3530cfa4ee8d4c117bb939b5903a956622a730"
      },
      "fixtureHash": "4d28c651081f56615f99ea62e35e19b0faca6cbcab08a2dd10e1ca089b7b6081",
      "configurationHash": "c4fb1acab5261f66cd1ea310b3b6b087127a0e91b5af6fd6ac5a8ad49fe48d11"
    },
    "optimized": {
      "outcome": {
        "decision": "block",
        "code": "decomposition-authority-unavailable",
        "args": {
          "issue": 2073,
          "operationId": null
        },
        "reason": "[task-tracker] Decomposition authority unavailable for #2073: decomposition:readiness-children"
      },
      "snapshot": {
        "issueBody": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: 1111111111111111111111111111111111111111\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind=\"epic\" -->\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":2,\"size\":\"S\"}} -->\n",
        "projectValues": {
          "estimate": 2,
          "size": "S"
        },
        "publication": null,
        "before": null,
        "subject": {
          "repository": "o/r",
          "issue": 2073,
          "projectId": "P",
          "projectItemId": "ITEM"
        }
      },
      "ledger": [
        {
          "index": 1,
          "phase": "hook-root",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 2317,
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
          "phase": "hook-graph",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 81264,
          "family": "hook-graph",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:fbd69fa6a252537d392d73cf28e590b97db7d625c0f4fce5ee134f852c400e5f",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": true
        },
        {
          "index": 3,
          "phase": "hook-graph",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 2446,
          "family": "hook-graph",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:90eda87b7789580b14c11d7445e35ba8c72c2d1b894a24972c04765875e6b230",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": true
        },
        {
          "index": 4,
          "phase": "hook-fence",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 2243,
          "family": "hook-fence",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:46291e7acd08033044a88f377e85a135e1a9b007d844290a40a8104722d6125b",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": false
        },
        {
          "index": 5,
          "phase": "hook-fence",
          "target": "I",
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 854,
          "family": "hook-fence",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:505534db57db5d0da1bf6c361a40c069fd7fe9f6c342753db73de3cbbe012716",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": false
        }
      ],
      "sourceManifest": {
        "scripts/task-tracker/lib/decomposition-field-writer.mjs": "b0cf5f02885af38384ca8dff834cff84ab13bcd94c3759cd990015026230f05e",
        "scripts/task-tracker/lib/decomposition-kind.mjs": "0e8c15639efba720e548ccb2b9cec39e7471c521f94c6c1ad19b981542a029af",
        "scripts/task-tracker/lib/decomposition-target-observation.mjs": "c5c5caa7c4045adb63c51296fa1f9cb7a56c6df80cb4743e719177b7b0e9d7e3",
        "scripts/task-tracker/lib/decomposition-hook-authority.mjs": "ae7b3a15cc508d6c3de4790fe0f844dda49b912cc5315d3f8aae62c07ea266c1",
        "scripts/task-tracker/lib/estimate-writer-publication.mjs": "d599f890598046df62d5aec66fecd2dc9315ca5dc536e939382cf852420dc163",
        "scripts/task-tracker/lib/decomposition-publication.mjs": "b0b2e63180319dee11f0777a1d82c329048582725a39f81de6ada59f0ff614e6",
        "scripts/task-tracker/lib/decomposition-projection.mjs": "dd53bf522d89e414d2ee191e597069a8512828f83c5129a8cb72ed0195c7dac5",
        "scripts/task-tracker/lib/decomposition-authority.mjs": "cc01521652dd0bd3dccad801eae1edea8ce39242df94e8f55dfa65baabada4f6"
      },
      "sourceHash": "8a97a9cca584032cae6e25a8364558d789ba153408b6a440e02a327c6958527e",
      "fixtureManifest": {
        "refinement-traffic-cases.mjs": "7be708b33d0c4adb52f977d5c00504a69ca7cf6c18a5a600814a5ffdd0a09a19",
        "refinement-hook-population.mjs": "8e22289507fff1efc620386f21d69c673a576655c9c0044a2e8640d46da6a4da",
        "refinement-target-shapes.mjs": "e1c7e684ed2a51ebad6a2dd8ff1d8209d6311e870028bf920d091e59dbdee765",
        "refinement-target-fixture.mjs": "2b2a1ff2a7dfa0b24d3a61c92d326c33d74679eed6fd2973b4833a6e4fa49e5e",
        "estimation-publication.mjs": "0b44de93ce487a62d324b064a1bd70170277304bdcc769906aa7679944146133",
        "refinement-traffic-shapes.mjs": "6ae2123d702311adec3b513e2153b38d1e369a7044092bc9eb4b071ff81315a1",
        "refinement-traffic-runner.mjs": "ac4774a84401ca89f3fbacfeb33c4bca66af90ce60251ed8779563f41cf5c46e",
        "../helpers/refinement-traffic-provider.mjs": "4f97f47fef563b2c4bf6f659d79b9007edbb9c6f80b1b014a52f52a5cb7e0fa6",
        "../helpers/refinement-query-selection.mjs": "a822c832d68306f50b26e2f7cf3530cfa4ee8d4c117bb939b5903a956622a730"
      },
      "fixtureHash": "4d28c651081f56615f99ea62e35e19b0faca6cbcab08a2dd10e1ca089b7b6081",
      "configurationHash": "c4fb1acab5261f66cd1ea310b3b6b087127a0e91b5af6fd6ac5a8ad49fe48d11"
    }
  },
  {
    "fixtureId": "unchanged-publication",
    "boundary": "publication",
    "baseline": {
      "outcome": {
        "status": "unchanged"
      },
      "snapshot": {
        "issueBody": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind=\"code\" -->\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":3,\"size\":\"M\"}} -->\n",
        "projectValues": {
          "estimate": 3,
          "size": "M"
        },
        "publication": null,
        "before": null,
        "subject": {
          "repository": "o/r",
          "issue": 2073,
          "projectId": "P",
          "projectItemId": "ITEM"
        }
      },
      "ledger": [
        {
          "index": 1,
          "phase": "authority-observation",
          "target": 2073,
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 366,
          "family": "membership",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:1f7cc4181d94045e64b26e014cdac111512bfd0823dc56a49c9685d3642691ee",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": false
        },
        {
          "index": 2,
          "phase": "authority-observation",
          "target": "I",
          "byteLayer": "serialized-cli-result-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 637,
          "family": "issue-body-read",
          "transport": "opaque-cli"
        },
        {
          "index": 3,
          "phase": "authority-observation",
          "target": 2073,
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 489,
          "family": "membership",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:eedaf4ce2816b269de5092ffd1077261918578dbbee3c6b7e845eb7040e079e7",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": false
        },
        {
          "index": 4,
          "phase": "authority-observation",
          "target": 2073,
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 807,
          "family": "projection",
          "kind": "query",
          "operation": "AitmEstimationProjection",
          "queryFingerprint": "sha256:4e17bd6d0357a98a1ca871798020ee4dd1a658bdcda60f858ac60e781ffa6614",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": false
        }
      ],
      "sourceManifest": {
        "scripts/task-tracker/lib/decomposition-field-writer.mjs": "5215a5efcfd3571bfd902579a637217ed57f67739c0e1e10c2432c6864adc283",
        "scripts/task-tracker/lib/decomposition-kind.mjs": null,
        "scripts/task-tracker/lib/decomposition-target-observation.mjs": null,
        "scripts/task-tracker/lib/decomposition-hook-authority.mjs": "ba9721201c7f7819b160a7e35ba1b5501c3202eaa31bacb087d5bda9867c4822",
        "scripts/task-tracker/lib/estimate-writer-publication.mjs": "d599f890598046df62d5aec66fecd2dc9315ca5dc536e939382cf852420dc163",
        "scripts/task-tracker/lib/decomposition-publication.mjs": "b0b2e63180319dee11f0777a1d82c329048582725a39f81de6ada59f0ff614e6",
        "scripts/task-tracker/lib/decomposition-projection.mjs": "dd53bf522d89e414d2ee191e597069a8512828f83c5129a8cb72ed0195c7dac5",
        "scripts/task-tracker/lib/decomposition-authority.mjs": "ae38df2877233e89a73a23464371245f2b766bf18f68c6f454680b736774c968"
      },
      "sourceHash": "9819b9d4342d255be601f5a706b9def7bf0ebc44ebe8476d30c935744c67837c",
      "fixtureManifest": {
        "refinement-traffic-cases.mjs": "7be708b33d0c4adb52f977d5c00504a69ca7cf6c18a5a600814a5ffdd0a09a19",
        "refinement-hook-population.mjs": "8e22289507fff1efc620386f21d69c673a576655c9c0044a2e8640d46da6a4da",
        "refinement-target-shapes.mjs": "e1c7e684ed2a51ebad6a2dd8ff1d8209d6311e870028bf920d091e59dbdee765",
        "refinement-target-fixture.mjs": "2b2a1ff2a7dfa0b24d3a61c92d326c33d74679eed6fd2973b4833a6e4fa49e5e",
        "estimation-publication.mjs": "0b44de93ce487a62d324b064a1bd70170277304bdcc769906aa7679944146133",
        "refinement-traffic-shapes.mjs": "6ae2123d702311adec3b513e2153b38d1e369a7044092bc9eb4b071ff81315a1",
        "refinement-traffic-runner.mjs": "ac4774a84401ca89f3fbacfeb33c4bca66af90ce60251ed8779563f41cf5c46e",
        "../helpers/refinement-traffic-provider.mjs": "4f97f47fef563b2c4bf6f659d79b9007edbb9c6f80b1b014a52f52a5cb7e0fa6",
        "../helpers/refinement-query-selection.mjs": "a822c832d68306f50b26e2f7cf3530cfa4ee8d4c117bb939b5903a956622a730"
      },
      "fixtureHash": "4d28c651081f56615f99ea62e35e19b0faca6cbcab08a2dd10e1ca089b7b6081",
      "configurationHash": "d4d585eea6e0455180a23ded613312603ace5e7f6514bb07c87cc1ea835341bd"
    },
    "optimized": {
      "outcome": {
        "status": "unchanged"
      },
      "snapshot": {
        "issueBody": "## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list=\"vc:1\" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind=\"code\" -->\n<!-- aitm-fields: {\"schema\":1,\"values\":{\"estimate\":3,\"size\":\"M\"}} -->\n",
        "projectValues": {
          "estimate": 3,
          "size": "M"
        },
        "publication": null,
        "before": null,
        "subject": {
          "repository": "o/r",
          "issue": 2073,
          "projectId": "P",
          "projectItemId": "ITEM"
        }
      },
      "ledger": [
        {
          "index": 1,
          "phase": "authority-observation",
          "target": 2073,
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 366,
          "family": "membership",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:1f7cc4181d94045e64b26e014cdac111512bfd0823dc56a49c9685d3642691ee",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": false
        },
        {
          "index": 2,
          "phase": "authority-observation",
          "target": "I",
          "byteLayer": "serialized-cli-result-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 637,
          "family": "issue-body-read",
          "transport": "opaque-cli"
        },
        {
          "index": 3,
          "phase": "authority-observation",
          "target": 2073,
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 489,
          "family": "membership",
          "kind": "query",
          "operation": null,
          "queryFingerprint": "sha256:eedaf4ce2816b269de5092ffd1077261918578dbbee3c6b7e845eb7040e079e7",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": false
        },
        {
          "index": 4,
          "phase": "authority-observation",
          "target": 2073,
          "byteLayer": "serialized-graphql-response-envelope",
          "cost": null,
          "costStatus": "unknown-offline",
          "outcome": "success",
          "serializedResponseBytes": 807,
          "family": "projection",
          "kind": "query",
          "operation": "AitmEstimationProjection",
          "queryFingerprint": "sha256:4e17bd6d0357a98a1ca871798020ee4dd1a658bdcda60f858ac60e781ffa6614",
          "fingerprintVersion": "v1",
          "transport": "graphql",
          "selectedChildProjectFields": false
        }
      ],
      "sourceManifest": {
        "scripts/task-tracker/lib/decomposition-field-writer.mjs": "b0cf5f02885af38384ca8dff834cff84ab13bcd94c3759cd990015026230f05e",
        "scripts/task-tracker/lib/decomposition-kind.mjs": "0e8c15639efba720e548ccb2b9cec39e7471c521f94c6c1ad19b981542a029af",
        "scripts/task-tracker/lib/decomposition-target-observation.mjs": "c5c5caa7c4045adb63c51296fa1f9cb7a56c6df80cb4743e719177b7b0e9d7e3",
        "scripts/task-tracker/lib/decomposition-hook-authority.mjs": "ae7b3a15cc508d6c3de4790fe0f844dda49b912cc5315d3f8aae62c07ea266c1",
        "scripts/task-tracker/lib/estimate-writer-publication.mjs": "d599f890598046df62d5aec66fecd2dc9315ca5dc536e939382cf852420dc163",
        "scripts/task-tracker/lib/decomposition-publication.mjs": "b0b2e63180319dee11f0777a1d82c329048582725a39f81de6ada59f0ff614e6",
        "scripts/task-tracker/lib/decomposition-projection.mjs": "dd53bf522d89e414d2ee191e597069a8512828f83c5129a8cb72ed0195c7dac5",
        "scripts/task-tracker/lib/decomposition-authority.mjs": "cc01521652dd0bd3dccad801eae1edea8ce39242df94e8f55dfa65baabada4f6"
      },
      "sourceHash": "8a97a9cca584032cae6e25a8364558d789ba153408b6a440e02a327c6958527e",
      "fixtureManifest": {
        "refinement-traffic-cases.mjs": "7be708b33d0c4adb52f977d5c00504a69ca7cf6c18a5a600814a5ffdd0a09a19",
        "refinement-hook-population.mjs": "8e22289507fff1efc620386f21d69c673a576655c9c0044a2e8640d46da6a4da",
        "refinement-target-shapes.mjs": "e1c7e684ed2a51ebad6a2dd8ff1d8209d6311e870028bf920d091e59dbdee765",
        "refinement-target-fixture.mjs": "2b2a1ff2a7dfa0b24d3a61c92d326c33d74679eed6fd2973b4833a6e4fa49e5e",
        "estimation-publication.mjs": "0b44de93ce487a62d324b064a1bd70170277304bdcc769906aa7679944146133",
        "refinement-traffic-shapes.mjs": "6ae2123d702311adec3b513e2153b38d1e369a7044092bc9eb4b071ff81315a1",
        "refinement-traffic-runner.mjs": "ac4774a84401ca89f3fbacfeb33c4bca66af90ce60251ed8779563f41cf5c46e",
        "../helpers/refinement-traffic-provider.mjs": "4f97f47fef563b2c4bf6f659d79b9007edbb9c6f80b1b014a52f52a5cb7e0fa6",
        "../helpers/refinement-query-selection.mjs": "a822c832d68306f50b26e2f7cf3530cfa4ee8d4c117bb939b5903a956622a730"
      },
      "fixtureHash": "4d28c651081f56615f99ea62e35e19b0faca6cbcab08a2dd10e1ca089b7b6081",
      "configurationHash": "d4d585eea6e0455180a23ded613312603ace5e7f6514bb07c87cc1ea835341bd"
    }
  }
]
```
