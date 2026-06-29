// #655 — reusable post-write read-back assertion for stamp verbs.
//
// The #652 incident: a stamp verb wrote a body marker, the write call did not
// throw, but the marker never persisted on the live body — and the verb
// reported success anyway. The structural fix surfaces the verified live body
// on the write result (`versionedWriteBody` / `mutateIssueBody` now return
// `body`, the body each path already fetched). This helper closes the loop:
// after a stamp write, the verb inspects `result.body` and refuses to report
// success unless the marker it intended to persist is actually present.
//
// It is deliberately verb-agnostic — `approve` asserts `aitm-review-approved`,
// but any stamp verb (a future `block`, `reopen`, lifecycle stamp, …) can reuse
// it by passing its own marker predicate. No GitHub round-trip is performed
// here: the helper reads the body the write path already returned.

export class StampMarkerNotPersistedError extends Error {
  // `reason` distinguishes the two failure modes for callers/tests:
  //   'no-body'      — the write result carried no `body` field to inspect
  //   'marker-absent' — the body is present but the marker did not persist
  constructor({ issueNumber, marker, reason = 'marker-absent' } = {}) {
    const where = issueNumber == null ? '' : ` on issue #${issueNumber}`;
    const detail =
      reason === 'no-body'
        ? `write result carried no verified body to read back${where}`
        : `expected marker ${marker || '(unnamed)'} did not persist${where}`;
    super(`stamp write unverified: ${detail}`);
    this.name = 'StampMarkerNotPersistedError';
    this.issueNumber = issueNumber ?? null;
    this.marker = marker ?? null;
    this.reason = reason;
  }
}

// Assert that a stamp write actually persisted its marker.
//   result    — the return of mutateIssueBody / versionedWriteBody; must carry
//               the verified live `body` (string).
//   predicate — fn(body) => boolean; true iff the marker persisted.
//   marker    — human-readable marker name, for the error message only.
//   issueNumber — for the error message only.
// Returns `result` on success (so callers can chain); throws
// `StampMarkerNotPersistedError` otherwise.
export function assertMarkerPersisted({ result, predicate, marker, issueNumber } = {}) {
  if (typeof predicate !== 'function') {
    throw new TypeError('assertMarkerPersisted: predicate must be a function');
  }
  if (!result || typeof result.body !== 'string') {
    throw new StampMarkerNotPersistedError({ issueNumber, marker, reason: 'no-body' });
  }
  if (!predicate(result.body)) {
    throw new StampMarkerNotPersistedError({ issueNumber, marker, reason: 'marker-absent' });
  }
  return result;
}
