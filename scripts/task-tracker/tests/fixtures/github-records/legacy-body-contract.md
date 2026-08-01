<!-- aitm-last-known-state state="develop" ts="2026-08-01T00:00:00.000Z" -->

## User Story

As a maintainer
I want a body-governed issue fixture
So that existing authority remains characterized.

## Scope

This legacy issue remains governed entirely by its issue body.

## Acceptance Criteria

- [ ] The existing body contract remains readable <!-- aitm-verified cmd="`npm test`" -->
- [ ] Lifecycle gates keep their current body authority <!-- aitm-verified cmd="`npm run test:slow`" -->

## Verification Commands

- [ ] `npm test` <!-- id=1 -->
- [ ] `npm run test:slow` <!-- id=2 -->

## Definition of Done

### Functional (verified at Test)

- [ ] All automated tests pass <!-- aitm-verified cmd="`npm test` `npm run test:slow`" -->

### Lifecycle (auto-ticked at Review/Close)

- [ ] Passed final human review
- [ ] Story closed and moved to Done
- [ ] Timing data flushed to issue

<!-- aitm-fields: {"schema":1,"values":{"size":"S","estimate":2,"priority":"p1"}} -->
