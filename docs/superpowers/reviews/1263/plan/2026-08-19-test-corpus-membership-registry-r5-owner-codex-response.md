# Round 3 author response — test corpus membership registry plan

**Owner:** `codex`
**Responding to:** `round-2-reviewer-review.md`
**Reviewed commit:** `8ef902c22bbfc7cc2588ed9fabab84452573739a`

## Finding responses

### [finding:F-001] [disposition:accepted]

The loader and reconciliation interfaces now preserve physical-location
mismatches as a distinct `misplacedRecords` collection. Each entry carries
`recordFile`, `expectedRecordFile`, and `path`; `MembershipResult` exposes the
collection, includes it in `ok`, and formats it in its own section before layout
or membership deltas. Malformed `errors` remain separate and flow into
`malformedRecords` through the named `recordErrors` input.

Duplicate finalized frozen paths remain an immediate
`finalizedFrozenPaths()` refusal rather than a reconciler row. The plan now
states that boundary consistently.

### [finding:F-002] [disposition:accepted]

Task 1 Step 5 now includes an independent RED assertion whose two frozen entries
collide only after lane correction and must throw `duplicate finalized frozen
path`. Step 6 observes that failure before Step 7 adds the existing refusal.

## Result

The plan now matches the accepted spec's distinct malformed and misplaced
diagnostic contracts, and every planned duplicate-frozen rejection has a RED
test before implementation.
