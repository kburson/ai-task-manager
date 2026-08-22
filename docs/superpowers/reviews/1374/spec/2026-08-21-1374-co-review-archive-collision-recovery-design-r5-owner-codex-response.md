# Round 3 Owner Response

[finding:F-001] [disposition:accepted]

Removed current-renderer byte equality from foreign-archive eligibility. Section 2 now validates the recorded v1 structure and on-disk evidence digests without requiring current JSON key order, whitespace, escaping, or optional fields to reproduce legacy README bytes. The test plan now includes a valid legacy manifest with different whitespace/key order.

[finding:F-002] [disposition:accepted]

Specified `recovery` as an optional version-tolerated v1 field, absent rather than null for ordinary archives, appended after `normative` without reordering existing keys, with a fixed internal key order. Section 4 now explicitly requires v1 readers and validators to tolerate it.

[finding:F-003] [disposition:accepted-with-modification]

Made publication order versus recency explicit without modifying the immutable primary archive. The recovered manifest now records the occupied decision timestamp and a deterministic temporal relationship. Its rendered prose links the configured archive and states both timestamps. The root review documentation will tell readers that the canonical path is first-published, not necessarily newest, and to compare `decision.at` values.

[finding:F-004] [disposition:accepted]

Specified the boundary precisely: the parent issue directory may exist, while the derived spec/plan leaf must be absent. An empty leaf deliberately refuses because atomic rename requires absence; silently accepting it defers the conflict, while removing it would destroy unexplained state. The refusal must distinguish the empty-leaf case for governed cleanup.
