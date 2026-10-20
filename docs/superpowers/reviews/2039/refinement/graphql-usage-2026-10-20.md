# #2039 GraphQL usage checkpoint

Native offline telemetry snapshot. No GitHub requests were made to generate this report.

## Capture and limits

- Requested capture start: 2026-10-20T05:36:01.227Z.
- First captured invocation: 2026-10-20T05:37:25.689Z. Last completion: 2026-10-20T05:39:32.789Z.
- Telemetry uses the repository measurement launcher and inherited gh shim. It records CLI observations, not a complete count of HTTP requests hidden inside gh.
- Same-response query costs are measured where returned; mutation and opaque-command costs remain unknown. Known points are a lower bound.
- Request and response byte sizes and exact source call stacks are not recorded by this collector. A supplemental tracer was refused by the Backlog activity guard and was not installed.
- All rows in this capture have unknown lifecycle attribution; issue targets and operation identities remain available. Query-template source matches below are static candidate matches, not recorded runtime stacks.
- Earlier work in this worktree was not enrolled: no retrospective per-call measurements are available. Account-wide clients outside this collector remain unobserved.
- The final native start 2043 failed during #2042 timing-field synchronization with GitHub GraphQL API rate limit already exceeded. #2042 scope write succeeded at body version 5 before that failure.

## Captured totals

```json
{
  "endedAt": "2026-10-20T05:41:16.051Z",
  "worktreeId": "sha256:3f43960145f2d2ac9ac8ae49565355849bf915411d7f360e371d80965b68cd56",
  "sessionIds": [
    "sha256:6d90ef771e9ff9614059b8fdf66ad634565d4d3fa2b1c9afd042a1fad17d2e5d"
  ],
  "totals": {
    "observations": 81,
    "knownPoints": 25,
    "knownCostObservations": 25,
    "unknownCosts": 56,
    "failures": 4
  },
  "operations": [
    {
      "key": "gh.issue.view",
      "observations": 32,
      "knownPoints": 0,
      "knownCostObservations": 0,
      "unknownCosts": 32,
      "failures": 3
    },
    {
      "key": "gh.issue.edit",
      "observations": 8,
      "knownPoints": 0,
      "knownCostObservations": 0,
      "unknownCosts": 8,
      "failures": 1
    },
    {
      "key": "anonymous.ff0fe7b2e4472490bcf64ede1f2294284949c8f594bc90380291abfe561b6250",
      "observations": 8,
      "knownPoints": 0,
      "knownCostObservations": 0,
      "unknownCosts": 8,
      "failures": 0
    },
    {
      "key": "anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96",
      "observations": 5,
      "knownPoints": 5,
      "knownCostObservations": 5,
      "unknownCosts": 0,
      "failures": 0
    },
    {
      "key": "anonymous.cf1d97f59243f1991a8ca4b9b4c343c88023dc66f9b7701a65eaae7b2a8d1dc4",
      "observations": 4,
      "knownPoints": 4,
      "knownCostObservations": 4,
      "unknownCosts": 0,
      "failures": 0
    },
    {
      "key": "anonymous.2a108f03695f1a3a168dc11c6d75923edcd55dcc5ea3f7599049b62759094c83",
      "observations": 4,
      "knownPoints": 0,
      "knownCostObservations": 0,
      "unknownCosts": 4,
      "failures": 0
    },
    {
      "key": "anonymous.2e9aad4db59390fe2f25c72aaa36d8e8e6ed8581fe8d2b70d99485749761286f",
      "observations": 4,
      "knownPoints": 4,
      "knownCostObservations": 4,
      "unknownCosts": 0,
      "failures": 0
    },
    {
      "key": "AitmEstimationProjection",
      "observations": 3,
      "knownPoints": 3,
      "knownCostObservations": 3,
      "unknownCosts": 0,
      "failures": 0
    },
    {
      "key": "anonymous.eb74807a6a65f2b6bd97223fe7b3dde004d1f6b6c2b5baa8d00570dc8acd446a",
      "observations": 3,
      "knownPoints": 3,
      "knownCostObservations": 3,
      "unknownCosts": 0,
      "failures": 0
    },
    {
      "key": "anonymous.32ecad6249ae0c14e4090a0e5f8a98bdebbec4e8332fde2807fe2d48ad9e4f81",
      "observations": 2,
      "knownPoints": 0,
      "knownCostObservations": 0,
      "unknownCosts": 2,
      "failures": 0
    },
    {
      "key": "anonymous.6bf74b7b91641249fdcc9802ee06265f7f39a10ca7d5a03495c7ff38a978543f",
      "observations": 2,
      "knownPoints": 2,
      "knownCostObservations": 2,
      "unknownCosts": 0,
      "failures": 0
    },
    {
      "key": "gh.issue.comment",
      "observations": 1,
      "knownPoints": 0,
      "knownCostObservations": 0,
      "unknownCosts": 1,
      "failures": 0
    },
    {
      "key": "anonymous.e613994d2fa7cba1d9e5a6598c647317c8c623a6d6783e097b5a6fb81d9c748a",
      "observations": 1,
      "knownPoints": 1,
      "knownCostObservations": 1,
      "unknownCosts": 0,
      "failures": 0
    },
    {
      "key": "anonymous.3d423b50b18e2ea11895a8a084163f313b876e1be8a5494a7bd173636edee235",
      "observations": 1,
      "knownPoints": 1,
      "knownCostObservations": 1,
      "unknownCosts": 0,
      "failures": 0
    },
    {
      "key": "anonymous.b2ea38f9b2b4ebe5107b7877ff3aaf76a634ace6dad36d9164ef3eb134d67cd1",
      "observations": 1,
      "knownPoints": 1,
      "knownCostObservations": 1,
      "unknownCosts": 0,
      "failures": 0
    },
    {
      "key": "anonymous.5a81394383940e918867ec73690069ff3e058362ce7c270432b6353f18e98581",
      "observations": 1,
      "knownPoints": 1,
      "knownCostObservations": 1,
      "unknownCosts": 0,
      "failures": 0
    },
    {
      "key": "anonymous.d4b2726f69bd13920fe64631b1b0ee3471373a4728e44a448ffd4382b392f9f3",
      "observations": 1,
      "knownPoints": 0,
      "knownCostObservations": 0,
      "unknownCosts": 1,
      "failures": 0
    }
  ],
  "issues": [
    {
      "key": "2042",
      "observations": 58,
      "knownPoints": 21,
      "knownCostObservations": 21,
      "unknownCosts": 37,
      "failures": 4
    },
    {
      "key": "2041",
      "observations": 9,
      "knownPoints": 1,
      "knownCostObservations": 1,
      "unknownCosts": 8,
      "failures": 0
    },
    {
      "key": "unknown",
      "observations": 7,
      "knownPoints": 0,
      "knownCostObservations": 0,
      "unknownCosts": 7,
      "failures": 0
    },
    {
      "key": "2043",
      "observations": 6,
      "knownPoints": 2,
      "knownCostObservations": 2,
      "unknownCosts": 4,
      "failures": 0
    },
    {
      "key": "2039",
      "observations": 1,
      "knownPoints": 1,
      "knownCostObservations": 1,
      "unknownCosts": 0,
      "failures": 0
    }
  ]
}
```

## Broader repository collector context

These are existing local telemetry records from this Git common root; they are not GitHub issue/history reads and were not used for estimates. Coverage of the whole account is not claimed.

```json
{
  "interval": {
    "startedAt": "2026-10-20T05:00:00.000Z",
    "endedAt": "2026-10-20T05:41:16.051Z"
  },
  "totals": {
    "observations": 81,
    "knownPoints": 25,
    "knownCostObservations": 25,
    "unknownCosts": 56,
    "failures": 4
  },
  "worktrees": [
    {
      "key": "sha256:3f43960145f2d2ac9ac8ae49565355849bf915411d7f360e371d80965b68cd56",
      "observations": 81,
      "knownPoints": 25,
      "knownCostObservations": 25,
      "unknownCosts": 56,
      "failures": 4
    }
  ],
  "sessions": [
    {
      "key": "sha256:6d90ef771e9ff9614059b8fdf66ad634565d4d3fa2b1c9afd042a1fad17d2e5d",
      "observations": 81,
      "knownPoints": 25,
      "knownCostObservations": 25,
      "unknownCosts": 56,
      "failures": 4
    }
  ]
}
```

## Per-observation audit

| Start UTC | Duration ms | Operation | Issue | Kind | Points | Outcome | Call ID |
| --- | ---: | --- | --- | --- | ---: | --- | --- |
| 2026-10-20T05:37:25.689Z | 551 | gh.issue.view | 2042 | query | unknown | success | de5d9efa-a3c3-4b72-adfd-1e703f26d6ba |
| 2026-10-20T05:37:26.740Z | 528 | gh.issue.view | 2042 | query | unknown | success | bee6a7b8-7839-42c0-837e-60d20713e4d5 |
| 2026-10-20T05:37:27.690Z | 1099 | gh.issue.edit | 2042 | mutation | unknown | success | d781e1a2-7091-4126-ac84-17b5c84eae3c |
| 2026-10-20T05:37:29.071Z | 402 | gh.issue.view | 2042 | query | unknown | success | eefd3dc1-0db0-4056-8a2b-b1c6f55cba28 |
| 2026-10-20T05:37:29.818Z | 452 | anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96 | 2042 | query | 1 | success | 4ebf559d-0581-4941-a55d-919be1b115fe |
| 2026-10-20T05:37:31.004Z | 400 | anonymous.cf1d97f59243f1991a8ca4b9b4c343c88023dc66f9b7701a65eaae7b2a8d1dc4 | 2042 | query | 1 | success | 98e45585-f8dc-49e0-a745-b9fd5e3143f6 |
| 2026-10-20T05:37:32.013Z | 529 | gh.issue.view | 2041 | query | unknown | success | 9afc0a9d-1224-4ca3-902b-512ccf036f3d |
| 2026-10-20T05:37:33.109Z | 462 | anonymous.ff0fe7b2e4472490bcf64ede1f2294284949c8f594bc90380291abfe561b6250 | 2041 | query | unknown | success | 547b7a35-88b2-40dc-84ca-9fe0e07ce3a1 |
| 2026-10-20T05:37:33.891Z | 1188 | anonymous.32ecad6249ae0c14e4090a0e5f8a98bdebbec4e8332fde2807fe2d48ad9e4f81 | unknown | mutation | unknown | success | d117624f-ce04-485f-a1dc-b84da21e61b3 |
| 2026-10-20T05:37:35.359Z | 400 | anonymous.ff0fe7b2e4472490bcf64ede1f2294284949c8f594bc90380291abfe561b6250 | 2041 | query | unknown | success | 1917456f-43e9-4011-b034-4061eb695375 |
| 2026-10-20T05:37:36.327Z | 679 | anonymous.ff0fe7b2e4472490bcf64ede1f2294284949c8f594bc90380291abfe561b6250 | 2041 | query | unknown | success | 9d862916-4c2e-4906-9680-5a25e7333d3a |
| 2026-10-20T05:37:37.313Z | 767 | gh.issue.view | 2041 | query | unknown | success | 00e4cc6d-3bdc-4b6c-b895-5a846e10d447 |
| 2026-10-20T05:37:38.383Z | 939 | anonymous.6bf74b7b91641249fdcc9802ee06265f7f39a10ca7d5a03495c7ff38a978543f | 2041 | query | 1 | success | 6b3e94a2-2ba7-410f-a0ee-9a6b0f81038d |
| 2026-10-20T05:37:39.786Z | 407 | gh.issue.view | 2041 | query | unknown | success | 103133cb-c5d8-48e3-a43c-d7ef7d69c345 |
| 2026-10-20T05:37:40.542Z | 1220 | gh.issue.edit | 2041 | mutation | unknown | success | caeccb1e-ab82-40b7-8a1e-83c2e5b83289 |
| 2026-10-20T05:37:42.259Z | 450 | gh.issue.view | 2041 | query | unknown | success | bbd5b664-3d66-41c4-b31a-46e1e3fc406f |
| 2026-10-20T05:37:43.074Z | 1224 | anonymous.2a108f03695f1a3a168dc11c6d75923edcd55dcc5ea3f7599049b62759094c83 | unknown | mutation | unknown | success | 8ccb30bf-c52f-4398-8a6c-9fbf55e84b06 |
| 2026-10-20T05:37:44.624Z | 1076 | anonymous.2a108f03695f1a3a168dc11c6d75923edcd55dcc5ea3f7599049b62759094c83 | unknown | mutation | unknown | success | b2be4cde-6712-4b7a-829a-6aee1e8ba7c6 |
| 2026-10-20T05:37:46.210Z | 693 | anonymous.2a108f03695f1a3a168dc11c6d75923edcd55dcc5ea3f7599049b62759094c83 | unknown | mutation | unknown | success | e888535e-09f4-4fca-a2be-97b5da5e67bd |
| 2026-10-20T05:37:47.201Z | 684 | anonymous.2a108f03695f1a3a168dc11c6d75923edcd55dcc5ea3f7599049b62759094c83 | unknown | mutation | unknown | success | 53bf1e4e-f798-453e-81b1-e1350999cb12 |
| 2026-10-20T05:37:48.565Z | 394 | anonymous.cf1d97f59243f1991a8ca4b9b4c343c88023dc66f9b7701a65eaae7b2a8d1dc4 | 2042 | query | 1 | success | f38d0ea7-e166-4cc1-ad7c-adbcd655b34b |
| 2026-10-20T05:37:49.327Z | 383 | gh.issue.view | 2042 | query | unknown | success | c5623082-95b6-4a7e-9fe3-8fba23f0f029 |
| 2026-10-20T05:37:50.306Z | 445 | anonymous.ff0fe7b2e4472490bcf64ede1f2294284949c8f594bc90380291abfe561b6250 | 2042 | query | unknown | success | 1a11eb03-912a-4bfc-b164-3a9b5d060344 |
| 2026-10-20T05:37:51.096Z | 910 | gh.issue.comment | 2042 | mutation | unknown | success | 81284089-5a61-4a0e-9920-30215b6e8689 |
| 2026-10-20T05:37:52.366Z | 692 | anonymous.ff0fe7b2e4472490bcf64ede1f2294284949c8f594bc90380291abfe561b6250 | 2042 | query | unknown | success | d830bf3d-a35a-42e0-ac83-04924da23d09 |
| 2026-10-20T05:37:53.605Z | 695 | anonymous.e613994d2fa7cba1d9e5a6598c647317c8c623a6d6783e097b5a6fb81d9c748a | 2042 | query | 1 | success | f54490fe-fef6-442d-9225-c6d2a7c88d09 |
| 2026-10-20T05:37:54.688Z | 651 | gh.issue.view | 2042 | query | unknown | success | ba1650c7-91f4-43a9-91ef-ff2d0e6031f7 |
| 2026-10-20T05:37:55.670Z | 526 | gh.issue.view | 2042 | query | unknown | success | 3e002dfa-749b-4264-a0ce-495b95b8bf90 |
| 2026-10-20T05:37:56.583Z | 1074 | gh.issue.edit | 2042 | mutation | unknown | success | 88f85a98-a83a-4917-8b18-c0b1b6397596 |
| 2026-10-20T05:38:02.230Z | 655 | gh.issue.view | 2042 | query | unknown | success | 9e69e3a6-9389-4f8e-90b9-72417af4c7b6 |
| 2026-10-20T05:38:03.197Z | 747 | anonymous.2e9aad4db59390fe2f25c72aaa36d8e8e6ed8581fe8d2b70d99485749761286f | 2042 | query | 1 | success | ede2e9c2-e03c-4a60-a2fd-859ccabdfbf2 |
| 2026-10-20T05:38:04.235Z | 768 | gh.issue.view | 2042 | query | unknown | success | b7ea66d3-1ade-47e4-9a14-d6317cd53a8d |
| 2026-10-20T05:38:05.418Z | 511 | AitmEstimationProjection | 2042 | query | 1 | success | 3e7ea05b-c7ae-4383-a322-bc0f054d1ac6 |
| 2026-10-20T05:38:05.429Z | 528 | anonymous.eb74807a6a65f2b6bd97223fe7b3dde004d1f6b6c2b5baa8d00570dc8acd446a | 2042 | query | 1 | success | 6e85a587-67e7-4b2a-a704-572d51f4444c |
| 2026-10-20T05:38:11.861Z | 527 | anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96 | 2042 | query | 1 | success | 61a788e6-4fce-44b1-8c32-deb9031b5366 |
| 2026-10-20T05:38:13.182Z | 406 | anonymous.3d423b50b18e2ea11895a8a084163f313b876e1be8a5494a7bd173636edee235 | 2042 | query | 1 | success | 438cce6d-d802-4a8d-bcf8-bdf96d3c3805 |
| 2026-10-20T05:38:14.019Z | 476 | anonymous.2e9aad4db59390fe2f25c72aaa36d8e8e6ed8581fe8d2b70d99485749761286f | 2042 | query | 1 | success | 9666819a-8c7f-46d4-b0b9-5d794a26db0b |
| 2026-10-20T05:38:14.845Z | 404 | gh.issue.view | 2042 | query | unknown | success | 6420948c-c70d-405a-8207-73aa36cd891d |
| 2026-10-20T05:38:15.595Z | 1947 | gh.issue.edit | 2042 | mutation | unknown | success | 4c155fac-aa21-4f4e-bd0c-82d45f9a1af7 |
| 2026-10-20T05:38:17.999Z | 417 | gh.issue.view | 2042 | query | unknown | success | 93e1e6fd-6991-4a74-bb1f-84f0b2b88d7f |
| 2026-10-20T05:38:18.853Z | 445 | gh.issue.view | 2042 | query | unknown | success | 1e1ce0b3-d220-42b9-9b68-c9c945a1edc4 |
| 2026-10-20T05:38:19.630Z | 1330 | gh.issue.edit | 2042 | mutation | unknown | success | d3529ad1-49b0-4098-afd0-a2d9c89396a2 |
| 2026-10-20T05:38:21.287Z | 520 | gh.issue.view | 2042 | query | unknown | success | dcbc2b10-1f71-4568-b55b-3e7ad6abee5a |
| 2026-10-20T05:38:27.667Z | 354 | gh.issue.view | 2042 | query | unknown | success | 7f405c4a-e278-47f1-814c-a91598945186 |
| 2026-10-20T05:38:28.460Z | 495 | anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96 | 2042 | query | 1 | success | 135a350e-eb97-4be5-85c2-e4641d6d9728 |
| 2026-10-20T05:38:29.268Z | 386 | anonymous.b2ea38f9b2b4ebe5107b7877ff3aaf76a634ace6dad36d9164ef3eb134d67cd1 | 2042 | query | 1 | success | 65b7956b-a016-4c02-976f-e71d42054709 |
| 2026-10-20T05:38:30.005Z | 689 | anonymous.5a81394383940e918867ec73690069ff3e058362ce7c270432b6353f18e98581 | 2039 | query | 1 | success | 00e7a541-abe9-41e7-b224-fa3dad5a1d2e |
| 2026-10-20T05:38:31.031Z | 542 | anonymous.2e9aad4db59390fe2f25c72aaa36d8e8e6ed8581fe8d2b70d99485749761286f | 2042 | query | 1 | success | 7adf5807-4d0d-4ebe-a8ba-95bc0f93f635 |
| 2026-10-20T05:38:31.908Z | 423 | gh.issue.view | 2042 | query | unknown | success | 9213437f-7bfc-4cf8-877d-5264d117e081 |
| 2026-10-20T05:38:32.735Z | 508 | anonymous.eb74807a6a65f2b6bd97223fe7b3dde004d1f6b6c2b5baa8d00570dc8acd446a | 2042 | query | 1 | success | 151d7932-d25d-4064-8c42-c86fd476ba9c |
| 2026-10-20T05:38:32.738Z | 562 | AitmEstimationProjection | 2042 | query | 1 | success | a83101aa-6253-426d-b6ce-0163a9631872 |
| 2026-10-20T05:38:35.682Z | 349 | gh.issue.view | 2042 | query | unknown | success | ab1ef2e1-49e3-451f-84fd-428e780adf86 |
| 2026-10-20T05:38:59.546Z | 315 | gh.issue.view | 2042 | query | unknown | success | 376210d3-4c96-4173-b95e-efc03705b702 |
| 2026-10-20T05:39:00.246Z | 513 | anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96 | 2042 | query | 1 | success | 26286681-8cc3-473f-9448-c6c951ea5105 |
| 2026-10-20T05:39:01.578Z | 351 | anonymous.cf1d97f59243f1991a8ca4b9b4c343c88023dc66f9b7701a65eaae7b2a8d1dc4 | 2042 | query | 1 | success | fe5286fa-ca8c-4cb6-96ae-37b696eaa244 |
| 2026-10-20T05:39:02.245Z | 394 | gh.issue.view | 2042 | query | unknown | success | 723278dc-9bbd-4b39-8b08-89ba99a9ad70 |
| 2026-10-20T05:39:03.014Z | 550 | anonymous.d4b2726f69bd13920fe64631b1b0ee3471373a4728e44a448ffd4382b392f9f3 | unknown | query | unknown | success | 1c409cfa-480a-4a34-8f3f-189b495ac497 |
| 2026-10-20T05:39:03.967Z | 1156 | gh.issue.edit | 2042 | mutation | unknown | success | 5e27cb2c-8407-4dc7-ac55-dfa6df7892a7 |
| 2026-10-20T05:39:05.386Z | 371 | gh.issue.view | 2042 | query | unknown | success | c0868896-b010-4d9d-908e-b0c31bba4820 |
| 2026-10-20T05:39:06.050Z | 542 | anonymous.2e9aad4db59390fe2f25c72aaa36d8e8e6ed8581fe8d2b70d99485749761286f | 2042 | query | 1 | success | 26bc9a55-a79d-4794-9e8d-a726779d2019 |
| 2026-10-20T05:39:07.009Z | 407 | gh.issue.view | 2042 | query | unknown | success | 2b93dd6f-bb5d-4b5d-ae73-9d832378fdc6 |
| 2026-10-20T05:39:07.831Z | 536 | anonymous.eb74807a6a65f2b6bd97223fe7b3dde004d1f6b6c2b5baa8d00570dc8acd446a | 2042 | query | 1 | success | 9974f071-f531-49e2-9354-9f77bd2cb255 |
| 2026-10-20T05:39:07.831Z | 395 | AitmEstimationProjection | 2042 | query | 1 | success | 9a6d90c6-e0d1-4cc6-9797-2dce806d350c |
| 2026-10-20T05:39:12.929Z | 423 | gh.issue.view | 2043 | query | unknown | success | ffa7c151-ff1f-417b-9dbf-c28e7a541e3a |
| 2026-10-20T05:39:13.675Z | 404 | gh.issue.view | 2043 | query | unknown | success | cce75358-bd06-4f88-a32a-82ab4fff2b86 |
| 2026-10-20T05:39:14.492Z | 1259 | gh.issue.edit | 2043 | mutation | unknown | success | b2e5515d-52ff-4b14-b3fd-a8cfe3df1b69 |
| 2026-10-20T05:39:16.062Z | 438 | gh.issue.view | 2043 | query | unknown | success | ce9eed53-e5bb-4418-9211-27977f3f1927 |
| 2026-10-20T05:39:16.970Z | 568 | anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96 | 2043 | query | 1 | success | 3b2afa7b-3de2-4646-be01-b661bc00aa72 |
| 2026-10-20T05:39:18.330Z | 324 | anonymous.cf1d97f59243f1991a8ca4b9b4c343c88023dc66f9b7701a65eaae7b2a8d1dc4 | 2043 | query | 1 | success | bdcaec76-dad0-4e80-8cbb-0f6d2eba8a3e |
| 2026-10-20T05:39:19.181Z | 412 | gh.issue.view | 2042 | query | unknown | success | 39e570be-bf14-4ac6-a2d5-a75bbe0b87f1 |
| 2026-10-20T05:39:20.277Z | 446 | anonymous.ff0fe7b2e4472490bcf64ede1f2294284949c8f594bc90380291abfe561b6250 | 2042 | query | unknown | success | 966eaffa-62d2-42bf-b2e1-2e467f7aeb81 |
| 2026-10-20T05:39:21.163Z | 1006 | anonymous.32ecad6249ae0c14e4090a0e5f8a98bdebbec4e8332fde2807fe2d48ad9e4f81 | unknown | mutation | unknown | success | 74c269d9-c0ce-445b-9de1-251441b30fab |
| 2026-10-20T05:39:22.480Z | 391 | anonymous.ff0fe7b2e4472490bcf64ede1f2294284949c8f594bc90380291abfe561b6250 | 2042 | query | unknown | success | ed1cce79-c147-4ad4-83bc-be964734bc31 |
| 2026-10-20T05:39:23.464Z | 405 | anonymous.ff0fe7b2e4472490bcf64ede1f2294284949c8f594bc90380291abfe561b6250 | 2042 | query | unknown | success | 53bcffed-eff6-47c5-8b1f-9cc17e338f78 |
| 2026-10-20T05:39:24.157Z | 375 | gh.issue.view | 2042 | query | unknown | success | 2b854a22-6dbb-4fd5-a43d-baa25709506c |
| 2026-10-20T05:39:24.824Z | 824 | anonymous.6bf74b7b91641249fdcc9802ee06265f7f39a10ca7d5a03495c7ff38a978543f | 2042 | query | 1 | success | 42943711-34c6-419d-ab41-103ad36515bd |
| 2026-10-20T05:39:26.076Z | 361 | gh.issue.view | 2042 | query | unknown | success | 0460c4b4-8be7-415b-98b5-0d0c50ae5eb8 |
| 2026-10-20T05:39:26.840Z | 341 | gh.issue.edit | 2042 | mutation | unknown | failure | 55e7ea00-9408-403f-a7c0-da549bf90449 |
| 2026-10-20T05:39:27.979Z | 311 | gh.issue.view | 2042 | query | unknown | failure | 9f99928e-9245-43d7-b1a7-fa06d0fd7469 |
| 2026-10-20T05:39:29.638Z | 282 | gh.issue.view | 2042 | query | unknown | failure | 29127d56-38f5-4e1d-b7b8-e4c66ee93e9d |
| 2026-10-20T05:39:32.355Z | 434 | gh.issue.view | 2042 | query | unknown | failure | 83cf37be-240d-404c-810e-dab671ac9baf |

## Static source candidates

- opaque: no exact literal-template source match
- sha256:ff0fe7b2e4472490bcf64ede1f2294284949c8f594bc90380291abfe561b6250: no exact literal-template source match
- sha256:cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96: no exact literal-template source match
- sha256:cf1d97f59243f1991a8ca4b9b4c343c88023dc66f9b7701a65eaae7b2a8d1dc4: no exact literal-template source match
- sha256:2a108f03695f1a3a168dc11c6d75923edcd55dcc5ea3f7599049b62759094c83: scripts/gh/lib/github-projects.mjs:206
- sha256:2e9aad4db59390fe2f25c72aaa36d8e8e6ed8581fe8d2b70d99485749761286f: no exact literal-template source match
- sha256:87086ba6edb8800812251828ad095552d6cdbc08f264be0952a1a07ae46b874f: no exact literal-template source match
- sha256:eb74807a6a65f2b6bd97223fe7b3dde004d1f6b6c2b5baa8d00570dc8acd446a: no exact literal-template source match
- sha256:32ecad6249ae0c14e4090a0e5f8a98bdebbec4e8332fde2807fe2d48ad9e4f81: scripts/task-tracker/commit-trail-handler.mjs:145, scripts/task-tracker/gh-timing-comment.mjs:804
- sha256:6bf74b7b91641249fdcc9802ee06265f7f39a10ca7d5a03495c7ff38a978543f: no exact literal-template source match
- sha256:e613994d2fa7cba1d9e5a6598c647317c8c623a6d6783e097b5a6fb81d9c748a: no exact literal-template source match
- sha256:3d423b50b18e2ea11895a8a084163f313b876e1be8a5494a7bd173636edee235: no exact literal-template source match
- sha256:b2ea38f9b2b4ebe5107b7877ff3aaf76a634ace6dad36d9164ef3eb134d67cd1: no exact literal-template source match
- sha256:5a81394383940e918867ec73690069ff3e058362ce7c270432b6353f18e98581: no exact literal-template source match
- sha256:d4b2726f69bd13920fe64631b1b0ee3471373a4728e44a448ffd4382b392f9f3: no exact literal-template source match

## Continuation checkpoint

- #2040: approved estimate-cache-only repair succeeded, board estimate remained null, cache body version 7; native story-ok refresh succeeded; narrowed User Story and title saved.
- #2041: narrowed scope, story and title saved. Board remains Backlog.
- #2042: reconciled missing baseline; narrowed planning sections saved at body version 5. User Story/title/refinement remain pending.
- Switch to #2043 failed; local native state remains bound to #2042. Re-query live authority after rate-limit recovery before continuing.
- #2043–#2051 remain broad Backlog stories; additional 24 siblings have not been created.
- No child has been advanced to Refine or R4P in this continuation. No implementation or test evidence was created.
- Wave plan remains pinned to commit 42085d9bc2a17f3a127ba54b9b60c46bc072ea6b. Keep that HEAD during additional-child creation.

## Investigation leads

- The capture contains repeated issue views and body/timing mutations around a single narrowed-scope update and state-baseline repair. Treat workflow amplification as a candidate for batching and scoped read reuse.
- Native query observations with visible cost were one point each. The large unknown-cost fraction prevents assigning total cost or identifying the account-wide drain yet.
- Next controlled capture should instrument the HTTP transport under gh, include sanitized request/response byte counters and response rate-limit headers, and attach parent command/source identity. A separate governed implementation story is required for collector changes.

## Quota discrepancy follow-up

A separate REST `gh api rate_limit` observation returned GraphQL limit 5000, remaining 4482, used 518, reset 2026-10-20T05:50:51.000Z. A single direct `Aitm2039QuotaProbe` GraphQL request immediately afterward was refused with `RATE_LIMIT` / `graphql_rate_limit` / API rate limit already exceeded for user ID 1082467. The discrepancy is unresolved; the REST value cannot authorize retry loops or establish that GraphQL capacity is available. No credentials were recorded.

This additional failed probe is outside the original 81-observation snapshot. Updated current-worktree totals: 82 CLI observations; 25 known points; 57 unknown-cost observations; 5 failures. No HTTP byte sizes or account-wide totals are claimed.

## Pause boundary

The native measured `npx aitm pause blocked` was refused with `PROMPT_REQUIRED: assignee-unverifiable #2042` because its ownership read also hit the GraphQL rate limit. Its returned remediation explicitly permits `TT_SKIP_NETWORK=1` for genuinely offline work. The offline pause is used only to stop local timing; it is not evidence of a cloud timing update, ownership verification, state transition, or successful completion.

The telemetry report remains uncommitted because the session is bound to #2042 and a live switch back to #2039 cannot complete while GraphQL is unavailable. Preserve HEAD 42085d9bc2a17f3a127ba54b9b60c46bc072ea6b for the pending additional-child hydration, then commit this report under #2039 after restoring live authority.

## Header investigation: effective GraphQL primary quota is exhausted

Two sequential measured CLI probes used the same inherited environment, OAuth client ID and OAuth scope set. No credential/configuration changes were made between requests.

| Evidence | REST overview | GraphQL response |
| --- | --- | --- |
| Response Date UTC | 2026-10-20 05:45:14 | 2026-10-20 05:45:16 |
| Request ID | F459:382B76:53E7D0:111E757:6AD6FFEA | F464:1CBFF8:611912:13B32C7:6AD6FFEC |
| HTTP status | 200 | 200 |
| Header resource | core | graphql |
| Header remaining | 4903 | 0 |
| GraphQL used | 518 in JSON overview | 5000 in header and JSON |
| GraphQL remaining | 4482 in JSON overview | 0 in header and JSON |
| GraphQL reset UTC | 2026-10-20 05:50:51 | 2026-10-20 05:50:45 |

The GraphQL `rateLimit`-only query succeeded in returning its quota while ordinary issue/ownership queries were refused. Its reported query cost is 1. The GraphQL headers and response agree on an exhausted 5000-point primary window. There was no `Retry-After` header or secondary-limit message. REST's JSON overview is inconsistent with the counter enforcing the actual GraphQL request; it must not be treated as authorization to keep sending work.

GitHub's [rate-limit endpoint documentation](https://docs.github.com/en/rest/rate-limit/rate-limit) says the per-request response headers are authoritative when the overview disagrees. Its [GraphQL limit documentation](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api) says to wait until the returned reset time when remaining is zero.

The discrepancy is therefore an inconsistent REST overview versus actual GraphQL enforcement, rather than evidence of available GraphQL capacity. The internal cause of the overview's lag/inconsistency is not observable here. Captured metadata cannot prove which unmeasured earlier clients consumed the missing points. No periodic quota polling is used before reset.

Capture gaps in this continuation: the initial normal bind attempt failed before a measurement-launcher binding could be established; native offline resume/start was used only to restore local investigation timing and did not establish live ownership/state authority. All subsequent diagnostic GitHub commands use the measurement launcher. Lifecycle work will require a fresh normal live resume and Explain after reset.

## Recovery and command-attributed capture

GraphQL issue reads recovered after the enforcing reset. Normal live start and Explain on #2042 succeeded. Subsequent commands set `AITM_GRAPHQL_USAGE=1` at the native AITM entrypoint; other GitHub commands use the measurement launcher. Native CLI startup collection was verified in `bin/aitm.mjs:210`.

Command attribution below uses non-overlapping controller start/end intervals, not recorded stack traces. Returned text characters are tool-output size, not HTTP payload bytes. This snapshot was taken during sibling creation; active collector writers and later commands are intentionally outside the completed-command ledger.

Snapshot totals: {"calls":783,"knownPoints":331,"unknownCosts":515,"failures":6}

| Command | Calls | Known points | Unknown costs | Failures |
| --- | ---: | ---: | ---: | ---: |
| `npx aitm start 2042 --role agent` | 19 | 11 | 8 | 0 |
| `npx aitm explain 2042 --json` | 8 | 6 | 2 | 0 |
| `npx aitm start 2043 --role agent` | 27 | 5 | 22 | 0 |
| `npx aitm explain 2043 --json` | 5 | 3 | 2 | 0 |
| `npx aitm reconcile accept-live 2043` | 9 | 3 | 6 | 0 |
| `npx aitm explain 2043 --json` | 8 | 6 | 2 | 0 |
| `gh issue view 2043 --json body` | 1 | 0 | 1 | 0 |
| `npx aitm issue-body 2043 --operation-file .scratch/gh/2043-wave-body-operation.json` | 11 | 5 | 6 | 0 |
| `npx aitm start 2044 --role agent` | 30 | 5 | 25 | 0 |
| `npx aitm explain 2044 --json` | 5 | 3 | 2 | 0 |
| `npx aitm reconcile accept-live 2044` | 9 | 3 | 6 | 0 |
| `npx aitm explain 2044 --json` | 8 | 6 | 2 | 0 |
| `gh issue view 2044 --json body` | 1 | 0 | 1 | 0 |
| `npx aitm issue-body 2044 --operation-file .scratch/gh/2044-wave-body-operation.json` | 11 | 5 | 6 | 0 |
| `npx aitm start 2045 --role agent` | 30 | 5 | 25 | 0 |
| `npx aitm explain 2045 --json` | 5 | 3 | 2 | 0 |
| `npx aitm reconcile accept-live 2045` | 9 | 3 | 6 | 0 |
| `npx aitm explain 2045 --json` | 8 | 6 | 2 | 0 |
| `gh issue view 2045 --json body` | 1 | 0 | 1 | 0 |
| `npx aitm issue-body 2045 --operation-file .scratch/gh/2045-wave-body-operation.json` | 11 | 5 | 6 | 0 |
| `npx aitm start 2046 --role agent` | 30 | 5 | 25 | 0 |
| `npx aitm explain 2046 --json` | 5 | 3 | 2 | 0 |
| `npx aitm reconcile accept-live 2046` | 9 | 3 | 6 | 0 |
| `npx aitm explain 2046 --json` | 8 | 6 | 2 | 0 |
| `gh issue view 2046 --json body` | 1 | 0 | 1 | 0 |
| `npx aitm issue-body 2046 --operation-file .scratch/gh/2046-wave-body-operation.json` | 11 | 5 | 6 | 0 |
| `npx aitm start 2047 --role agent` | 30 | 5 | 25 | 0 |
| `npx aitm explain 2047 --json` | 5 | 3 | 2 | 0 |
| `npx aitm reconcile accept-live 2047` | 9 | 3 | 6 | 0 |
| `npx aitm explain 2047 --json` | 8 | 6 | 2 | 0 |
| `gh issue view 2047 --json body` | 1 | 0 | 1 | 0 |
| `npx aitm issue-body 2047 --operation-file .scratch/gh/2047-wave-body-operation.json` | 11 | 5 | 6 | 0 |
| `npx aitm start 2048 --role agent` | 30 | 5 | 25 | 0 |
| `npx aitm explain 2048 --json` | 5 | 3 | 2 | 0 |
| `npx aitm reconcile accept-live 2048` | 9 | 3 | 6 | 0 |
| `npx aitm explain 2048 --json` | 8 | 6 | 2 | 0 |
| `gh issue view 2048 --json body` | 1 | 0 | 1 | 0 |
| `npx aitm issue-body 2048 --operation-file .scratch/gh/2048-wave-body-operation.json` | 11 | 5 | 6 | 0 |
| `npx aitm start 2049 --role agent` | 30 | 5 | 25 | 0 |
| `npx aitm explain 2049 --json` | 5 | 3 | 2 | 0 |
| `npx aitm reconcile accept-live 2049` | 9 | 3 | 6 | 0 |
| `npx aitm explain 2049 --json` | 8 | 6 | 2 | 0 |
| `gh issue view 2049 --json body` | 1 | 0 | 1 | 0 |
| `npx aitm issue-body 2049 --operation-file .scratch/gh/2049-wave-body-operation.json` | 11 | 5 | 6 | 0 |
| `npx aitm start 2050 --role agent` | 30 | 5 | 25 | 0 |
| `npx aitm explain 2050 --json` | 5 | 3 | 2 | 0 |
| `npx aitm reconcile accept-live 2050` | 9 | 3 | 6 | 0 |
| `npx aitm explain 2050 --json` | 8 | 6 | 2 | 0 |
| `gh issue view 2050 --json body` | 1 | 0 | 1 | 0 |
| `npx aitm issue-body 2050 --operation-file .scratch/gh/2050-wave-body-operation.json` | 11 | 5 | 6 | 0 |
| `npx aitm start 2051 --role agent` | 30 | 5 | 25 | 0 |
| `npx aitm explain 2051 --json` | 5 | 3 | 2 | 0 |
| `npx aitm reconcile accept-live 2051` | 9 | 3 | 6 | 0 |
| `npx aitm explain 2051 --json` | 8 | 6 | 2 | 0 |
| `gh issue view 2051 --json body` | 1 | 0 | 1 | 0 |
| `npx aitm issue-body 2051 --operation-file .scratch/gh/2051-wave-body-operation.json` | 11 | 5 | 6 | 0 |
| `npx aitm start 2039 --role orchestrator` | 27 | 5 | 22 | 0 |
| `npx aitm explain 2039 --json` | 59 | 80 | 42 | 0 |
| `gh api graphql -f 'query=query Aitm2039ChildInventory { repository(owner:"kburson",name:"ai-task-manager") { issue(number:2039) { subIssues(first:100) { nodes { number title state } pageInfo { hasNextPage endCursor } } } } }'` | 1 | 0 | 1 | 0 |
| `npx aitm split-plan 2039 --dry-run --plan docs/superpowers/plans/2026-10-20-2039-additional-wave-stories.md --json` | 6 | 3 | 3 | 0 |

## Exact hook query dry-run

GitHub dry-run only; no issue data evaluated. One earlier dry-run returned successfully but its header separator was parsed incorrectly locally, so it did not yield retained quota fields. This corrected bounded probe records the returned cost. Request bytes are JSON input size; response bytes are the decoded CLI JSON body, not compressed network bytes.

```json
{
  "originalIdentity": {
    "kind": "query",
    "operation": null,
    "queryFingerprint": "sha256:d4b2726f69bd13920fe64631b1b0ee3471373a4728e44a448ffd4382b392f9f3",
    "fingerprintVersion": "v1"
  },
  "dryRun": true,
  "requestPayloadBytes": 2653,
  "cliResponseBodyBytes": 109,
  "headers": [
    "HTTP/2.0 200 OK",
    "Date: Tue, 20 Oct 2026 06:42:30 GMT",
    "X-Github-Request-Id: C4BE:3FE259:490CC3:EFEDB9:6AD70D56",
    "X-Ratelimit-Limit: 5000",
    "X-Ratelimit-Remaining: 26",
    "X-Ratelimit-Reset: 1792479067",
    "X-Ratelimit-Resource: graphql",
    "X-Ratelimit-Used: 4974"
  ],
  "result": {
    "cost": 27,
    "nodeCount": 267800,
    "remaining": 26,
    "used": 4974,
    "resetAt": "2026-10-20T06:51:07Z"
  },
  "exitCode": 0
}
```

## Expensive hook and capacity blocker

The exact hook query identity matches `collectHookDecompositionSnapshot` in `scripts/task-tracker/lib/decomposition-hook-authority.mjs`. GitHub dry-run calculated 27 points and a maximum of 267800 nodes for that query shape. It requests subIssues(first:50), nested projectItems(first:50), and fieldValues(first:100), including for non-epic targets before checking kind. The latest probe reported 4974 used and 26 remaining. Request bytes for the augmented dry-run JSON were 2653; decoded dry-run response JSON was 109 bytes. General payload sizes remain uninstrumented.

```json
{
  "snapshotAt": "2026-10-20T06:45:33.222Z",
  "observations": 2219,
  "knownPointSubtotal": 1484,
  "unknownCosts": 1428,
  "hookObservations": 40,
  "hookSuccessfulObservations": 40,
  "hookCalculatedCostPerQuery": 27,
  "modeledHookSubtotal": 1080
}
```

The modeled subtotal multiplies matching observed CLI invocations by the dry-run query cost. It is NOT a measured sum of charged points; do not add it to the native known-point subtotal as a confirmed total. Opaque CLI calls and unenrolled host-side calls can remain missing. This is a concrete drain candidate, not proof that all 5000 points came from one caller.

Creation stopped at child 33 (#2072) on the native readiness array cap of 32. The separate forecast-proposal bound is not a WBS task-count bound. The proposed prerequisite repair is `docs/superpowers/specs/2026-10-20-2039-readiness-cap-blocker-design.md`. No source guard was changed or bypassed.

## Bounded post-reset quota comparison

One sequential REST overview and one GraphQL quota-only query, during ongoing refinement. Other in-flight requests may increment counters between responses. Input size is serialized JSON and response size is decoded CLI JSON, not compressed wire bytes.

```json
{
  "rest": {
    "startedAt": "2026-10-20T08:00:08.746Z",
    "exitCode": 0,
    "headers": {
      "date": "Tue, 20 Oct 2026 08:00:09 GMT",
      "x-github-request-id": "DAD7:D8648:C19B7F:276B8A2:6AD71F89",
      "x-oauth-client-id": "178c6fc778ccc68e1d6a",
      "x-ratelimit-limit": "5000",
      "x-ratelimit-remaining": "4993",
      "x-ratelimit-reset": "1792486491",
      "x-ratelimit-resource": "core",
      "x-ratelimit-used": "7"
    },
    "data": {
      "graphql": {
        "limit": 5000,
        "used": 44,
        "remaining": 4956,
        "reset": 1792486324
      }
    },
    "requestJsonBytes": 0,
    "decodedCliJsonBytes": 1233
  },
  "graphql": {
    "startedAt": "2026-10-20T08:00:09.219Z",
    "exitCode": 0,
    "headers": {
      "date": "Tue, 20 Oct 2026 08:00:10 GMT",
      "x-github-request-id": "DADA:570E6:E3D408:2E0EAC2:6AD71F8A",
      "x-oauth-client-id": "178c6fc778ccc68e1d6a",
      "x-ratelimit-limit": "5000",
      "x-ratelimit-remaining": "4956",
      "x-ratelimit-reset": "1792486324",
      "x-ratelimit-resource": "graphql",
      "x-ratelimit-used": "44"
    },
    "data": {
      "data": {
        "rateLimit": {
          "limit": 5000,
          "remaining": 4956,
          "used": 44,
          "resetAt": "2026-10-20T08:52:04Z",
          "cost": 1
        }
      }
    },
    "requestJsonBytes": 102,
    "decodedCliJsonBytes": 106
  }
}
```

## Actual hook query byte/cost sample

One bounded read-only request using the exact constructed hook query shape on current leaf #2055, augmented only with quota fields. It used the normal native gql transport and collector. The local observer delegated to the unchanged native spawn and counted returned bytes; no source file, guard or cloud content was changed. Actual payload contents are not retained here. Bytes are serialized request JSON and decoded gh response JSON, not compressed wire traffic.

```json
{
  "sampleAt": "2026-10-20T08:05:03.288Z",
  "issue": 2055,
  "source": "scripts/task-tracker/lib/decomposition-hook-authority.mjs",
  "originalIdentity": {
    "kind": "query",
    "operation": null,
    "queryFingerprint": "sha256:d4b2726f69bd13920fe64631b1b0ee3471373a4728e44a448ffd4382b392f9f3",
    "fingerprintVersion": "v1"
  },
  "dryRun": false,
  "requestJsonBytes": 2699,
  "decodedGhResponseBytes": 21288,
  "rateLimit": {
    "cost": 27,
    "nodeCount": 267800,
    "limit": 5000,
    "remaining": 4898,
    "used": 102,
    "resetAt": "2026-10-20T08:52:04Z"
  },
  "observedChildCount": 0,
  "observedProjectMembershipCount": 1,
  "observedConfiguredFieldCount": 14
}
```

## Eight-child R4P checkpoint

Parent remains Plan. Tasks 1–8 completed both native Refine transitions. This cumulative capture spans multiple provider quota windows; do not compare its totals directly with one 5000-point allowance.

Per-command attribution uses controller time intervals. Named Aitm2039 diagnostic probes are excluded from refinement intervals; no exact request stack/HTTP coverage is claimed. Costs are same-response reported subtotals; opaque costs remain unknown.

```json
{
  "snapshotAt": "2026-10-20T08:40:13.491Z",
  "totals": {
    "observations": 7815,
    "knownPointSubtotal": 4938,
    "unknownCostObservations": 3659,
    "failures": 11
  },
  "topOperations": [
    {
      "operation": "gh.issue.view",
      "observations": 2751,
      "knownPointSubtotal": 0,
      "unknownCostObservations": 2751,
      "failures": 4
    },
    {
      "operation": "AitmEstimationProjection",
      "observations": 1120,
      "knownPointSubtotal": 1120,
      "unknownCostObservations": 0,
      "failures": 0
    },
    {
      "operation": "anonymous.eb74807a6a65f2b6bd97223fe7b3dde004d1f6b6c2b5baa8d00570dc8acd446a",
      "observations": 1120,
      "knownPointSubtotal": 1119,
      "unknownCostObservations": 1,
      "failures": 1
    },
    {
      "operation": "anonymous.2e9aad4db59390fe2f25c72aaa36d8e8e6ed8581fe8d2b70d99485749761286f",
      "observations": 918,
      "knownPointSubtotal": 918,
      "unknownCostObservations": 0,
      "failures": 0
    },
    {
      "operation": "gh.issue.edit",
      "observations": 252,
      "knownPointSubtotal": 0,
      "unknownCostObservations": 252,
      "failures": 1
    },
    {
      "operation": "anonymous.e613994d2fa7cba1d9e5a6598c647317c8c623a6d6783e097b5a6fb81d9c748a",
      "observations": 198,
      "knownPointSubtotal": 198,
      "unknownCostObservations": 0,
      "failures": 0
    },
    {
      "operation": "anonymous.cf1d97f59243f1991a8ca4b9b4c343c88023dc66f9b7701a65eaae7b2a8d1dc4",
      "observations": 158,
      "knownPointSubtotal": 158,
      "unknownCostObservations": 0,
      "failures": 0
    },
    {
      "operation": "anonymous.cc1b2bb952a095c716c4ca1e75acbf1fecc2fcb04d41b6c96ea80078af476f96",
      "observations": 147,
      "knownPointSubtotal": 146,
      "unknownCostObservations": 1,
      "failures": 1
    },
    {
      "operation": "anonymous.ff0fe7b2e4472490bcf64ede1f2294284949c8f594bc90380291abfe561b6250",
      "observations": 141,
      "knownPointSubtotal": 0,
      "unknownCostObservations": 141,
      "failures": 0
    },
    {
      "operation": "anonymous.eac2e2ff951bad0040331ede12c6869393e9f1336a0e438dcdb17bfab4d1dbde",
      "observations": 136,
      "knownPointSubtotal": 136,
      "unknownCostObservations": 0,
      "failures": 0
    }
  ]
}
```

| Issue | Start UTC | Duration seconds | Exit | CLI observations | Known points | Unknown costs |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| #2040 | 2026-10-20T06:52:12.836Z | 204 | 1 | 258 | 175 | 83 |
| #2040 | 2026-10-20T06:58:09.082Z | 369 | 0 | 438 | 288 | 150 |
| #2040 | 2026-10-20T07:05:40.878Z | 71 | 0 | 65 | 30 | 35 |
| #2052 | 2026-10-20T07:11:29.770Z | 426 | 0 | 507 | 336 | 171 |
| #2052 | 2026-10-20T07:18:35.304Z | 79 | 0 | 65 | 30 | 35 |
| #2053 | 2026-10-20T07:24:31.017Z | 458 | 0 | 507 | 336 | 171 |
| #2053 | 2026-10-20T07:32:09.305Z | 84 | 0 | 65 | 30 | 35 |
| #2041 | 2026-10-20T07:34:45.284Z | 454 | 0 | 507 | 336 | 171 |
| #2041 | 2026-10-20T07:42:18.858Z | 82 | 0 | 65 | 30 | 35 |
| #2054 | 2026-10-20T07:46:58.708Z | 466 | 0 | 509 | 336 | 173 |
| #2054 | 2026-10-20T07:54:45.140Z | 76 | 0 | 65 | 30 | 35 |
| #2055 | 2026-10-20T07:58:20.211Z | 489 | 0 | 507 | 336 | 171 |
| #2055 | 2026-10-20T08:06:29.522Z | 83 | 0 | 65 | 30 | 35 |
| #2042 | 2026-10-20T08:11:25.936Z | 494 | 0 | 507 | 336 | 171 |
| #2042 | 2026-10-20T08:19:40.020Z | 86 | 0 | 65 | 30 | 35 |
| #2056 | 2026-10-20T08:23:27.472Z | 524 | 0 | 507 | 336 | 171 |
| #2056 | 2026-10-20T08:32:11.089Z | 89 | 0 | 65 | 30 | 35 |
