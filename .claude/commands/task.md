Invoke the `task` skill to handle this request. Pass along any arguments: $ARGUMENTS

<!-- Canonical source: skill/shared/SKILL.md (State Transition Verb Map). Mirrored here for the verb-uniqueness verification grep. -->

### State Transition Verb Map (8-state model)

States: `Backlog → On Deck → Refine → Plan → Develop → Test → Review → Done`.

- `/task refine #N --size <XS|S|M|L|XL> --estimate <hours> --priority <p0|p1|p2|p3> --reason "<text>"` — Backlog/On Deck → Refine with required fields.
- `/task plan #N` — Refine → Plan (sprint-planning entry).
- `/task promote` (or `/task next`) — advance one state generically.
- `/task test #N` — Develop → Test (sandbox verification).
- `/task approve #N` — write Plan-approval and review-approval markers.
- `/task close` — Review → Done.

Test → Review is automatic on verification pass — no dedicated CLI verb.
