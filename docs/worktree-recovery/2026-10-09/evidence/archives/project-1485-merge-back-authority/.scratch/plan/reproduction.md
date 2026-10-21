1. Drive any issue to Review with a passing exact-head Test receipt and record review approval. Note the accepted SHA, call it `A`.
2. Open a pull request whose head is `A`.
3. Merge trunk into the branch to pick up a dependency (or apply any suggestion through the GitHub UI). The pull-request head becomes `B`, a descendant of `A`.
4. Run `npx aitm deliver #N`. Observe `delivery-preflight:pull-request-count`, because no pull request has `headRefOid === A`.
5. Merge the pull request.
6. Run `npx aitm deliver #N` again. Observe the same refusal; the head can no longer be moved back to `A`.
7. Run `npx aitm close #N`. Observe `delivery-authority:ambiguous-pr`.

Observed live on #1488: accepted SHA `e9fec6f7dbeadd82d495ddf7873b252044c77ec6`, pull request #1489 head advanced to `82eba885bac295a57c236c611c84e0fd6f69d7e3` by a trunk merge, merged as `3a044ea8411a9f0e34f54c33f412749cb735c457`. The deliverable is on trunk and byte-identical to the approved content, and the issue is still unclosable.
