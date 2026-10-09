Source: User-selected delivery route for kburson/ai-peer-review #140 under #107
Observed behavior: Delivered AITM merge-back launches full host test:unit, test:integration and test:slow despite configured project CI receipt verification, then removes the child completion checkout.
Authorization: The owning user chose route A: retain lineage, repair AITM integration, deliver #140 and close it. Full host suites remain CI-only; host execution is limited to affected tests.
