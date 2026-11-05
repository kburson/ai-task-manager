1. Create a multi-commit branch whose complete source subjects carry several valid bracketed issue tokens, including a top-level epic and a secondary defect.
2. Squash-merge it with GitHub's default title and bullet-list body so the observed token set exactly matches the complete source inventory.
3. Record exact-SHA Test, Review, and approval evidence for the secondary issue.
4. Run `npx aitm deliver` for that secondary issue.
5. Observe `delivery-verification:attribution` solely because the merge title leads with the epic token even though the secondary token is present in the complete exact set.
