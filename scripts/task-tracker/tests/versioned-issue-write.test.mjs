// @story #309
// Tests for scripts/task-tracker/lib/versioned-issue-write.mjs (#290 / epic #288).
//
// All scenarios use fake `fetchBody` / `pushBody` deps — no real GitHub I/O.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Readable } from 'node:stream';

import {
  versionedWriteBody,
  BodyWriteRefusalError,
  collectStreamUtf8,
} from '../lib/versioned-issue-write.mjs';
import { parseBodyVersion, stampBodyVersion } from '../lib/body-version.mjs';

function makeServer(initialBody) {
  // Tiny in-memory issue. `fetchBody` returns the current body; `pushBody`
  // accepts any body (last writer wins). Tests can also `inject(body)`
  // between operations to simulate a concurrent writer.
  let body = initialBody;
  return {
    fetchBody: async () => body,
    pushBody: async (_repo, _issue, next) => {
      body = next;
    },
    inject: (next) => {
      body = next;
    },
    get current() {
      return body;
    },
  };
}

// ── happy path ───────────────────────────────────────────────────────────────

test('happy path: no remote bump → push with N+1 on first attempt', async () => {
  const srv = makeServer('hello\n\n<!-- aitm-body-version: 3 -->\n');
  const r = await versionedWriteBody({
    issueNumber: 42,
    repo: 'o/r',
    mutate: (base) => `${base.replace('hello', 'hello world')}`,
    deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.attempts, 1);
  assert.equal(r.version, 4);
  assert.equal(parseBodyVersion(srv.current), 4);
  assert.ok(srv.current.includes('hello world'));
});

test('absent marker treated as version 0 → first push stamps 1', async () => {
  const srv = makeServer('plain body, no marker yet');
  const r = await versionedWriteBody({
    issueNumber: 1,
    repo: 'o/r',
    mutate: (base) => `${base}\n\nappended`,
    deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.version, 1);
});

// ── single-conflict retry ────────────────────────────────────────────────────

test('single-conflict retry: race-lose once on a non-overlapping section, then succeed', async () => {
  // Base body has two distinct edit regions.
  const base = ['header', 'A', 'middle', 'B', 'footer'].join('\n');
  const initial = stampBodyVersion(base, 5);
  const srv = makeServer(initial);

  // We edit line A → 'A-ours'. Mid-flight, a concurrent writer edits B → 'B-theirs'.
  let firstPushSeen = false;
  const wrappedPush = async (repo, issue, body) => {
    await srv.pushBody(repo, issue, body);
    if (!firstPushSeen) {
      firstPushSeen = true;
      // Concurrent writer's edit is based on the ORIGINAL base — they did
      // not see our 'A-ours'. They edited B → 'B-theirs'.
      const newBase = ['header', 'A', 'middle', 'B-theirs', 'footer'].join('\n');
      srv.inject(stampBodyVersion(newBase, 7));
    }
  };

  const r = await versionedWriteBody({
    issueNumber: 9,
    repo: 'o/r',
    mutate: (b) => b.replace('A', 'A-ours'),
    deps: { fetchBody: srv.fetchBody, pushBody: wrappedPush },
  });
  assert.equal(r.status, 'ok');
  assert.ok(r.attempts >= 1);
  assert.ok(srv.current.includes('A-ours'));
  assert.ok(srv.current.includes('B-theirs'));
});

// ── overlapping-diff refusal ─────────────────────────────────────────────────

test('overlapping-diff refusal: both edits hit the same lines', async () => {
  const base = ['x', 'shared', 'y'].join('\n');
  const initial = stampBodyVersion(base, 2);
  const srv = makeServer(initial);

  let firstPushSeen = false;
  const wrappedPush = async (repo, issue, body) => {
    await srv.pushBody(repo, issue, body);
    if (!firstPushSeen) {
      firstPushSeen = true;
      // Concurrent writer (based on the ORIGINAL base) changes the SAME line
      // our mutate touched.
      srv.inject(stampBodyVersion(['x', 'shared-theirs', 'y'].join('\n'), 3));
    }
  };

  await assert.rejects(
    versionedWriteBody({
      issueNumber: 17,
      repo: 'o/r',
      mutate: (b) => b.replace('shared', 'shared-ours'),
      deps: { fetchBody: srv.fetchBody, pushBody: wrappedPush },
    }),
    (err) => err instanceof BodyWriteRefusalError && err.reason === 'overlapping-diff'
  );
});

// ── max-retries-exceeded ─────────────────────────────────────────────────────

test('max-retries-exceeded refusal: every push race-loses', async () => {
  const srv = makeServer(stampBodyVersion('base', 0));
  // pushBody completes, but after EVERY push, a concurrent writer races in
  // and bumps the marker before our verify-fetch.
  const wrappedPush = async (repo, issue, body) => {
    await srv.pushBody(repo, issue, body);
    const cur = srv.current;
    const v = parseBodyVersion(cur);
    // Bump again (concurrent writer): non-overlapping append.
    srv.inject(
      stampBodyVersion(
        `${srv.current.replace(/<!-- aitm-body-version(?:: \d+| version="\d+") -->/, '')}\nintruder`,
        v + 1
      )
    );
  };

  await assert.rejects(
    versionedWriteBody({
      issueNumber: 99,
      repo: 'o/r',
      mutate: (b) => `${b}\nours`,
      deps: { fetchBody: srv.fetchBody, pushBody: wrappedPush },
      maxRetries: 2,
    }),
    (err) =>
      err instanceof BodyWriteRefusalError &&
      err.reason === 'max-retries-exceeded' &&
      err.attempts === 2
  );
});

// ── deps injection contract ──────────────────────────────────────────────────

test('deps: mutate function is required (throws if missing)', async () => {
  await assert.rejects(
    versionedWriteBody({
      issueNumber: 1,
      repo: 'o/r',
      deps: { fetchBody: async () => '', pushBody: async () => {} },
    }),
    TypeError
  );
});

test('deps: issueNumber is required', async () => {
  await assert.rejects(
    versionedWriteBody({
      repo: 'o/r',
      mutate: (b) => b,
      deps: { fetchBody: async () => '', pushBody: async () => {} },
    }),
    /issueNumber is required/
  );
});

test('non-overlapping rebase preserves both edits even with multi-line splits', async () => {
  // Base: 3 paragraphs separated by blank lines.
  const base = ['para A line 1', 'para A line 2', '', 'para B line 1', '', 'para C line 1'].join(
    '\n'
  );
  const srv = makeServer(stampBodyVersion(base, 1));

  let firstPushSeen = false;
  const wrappedPush = async (repo, issue, body) => {
    await srv.pushBody(repo, issue, body);
    if (!firstPushSeen) {
      firstPushSeen = true;
      // Concurrent writer (based on the ORIGINAL base, NOT our pushed body)
      // modifies paragraph C only.
      const after = [
        'para A line 1',
        'para A line 2',
        '',
        'para B line 1',
        '',
        'para C line 1 EDITED',
      ].join('\n');
      srv.inject(stampBodyVersion(after, 2));
    }
  };

  const r = await versionedWriteBody({
    issueNumber: 33,
    repo: 'o/r',
    mutate: (b) => b.replace('para A line 1', 'para A line 1 OURS'),
    deps: { fetchBody: srv.fetchBody, pushBody: wrappedPush },
  });
  assert.equal(r.status, 'ok');
  assert.ok(srv.current.includes('para A line 1 OURS'));
  assert.ok(srv.current.includes('para C line 1 EDITED'));
});

// ── stale-input refusal (#293 / #292 replay) ─────────────────────────────────

test('stale-input refusal: mutate returns snapshot with older aitm-body-version', async () => {
  // Simulates the #292 clobber: a heal script captured a v4 snapshot, the
  // live body advanced to v16 (markers added), then the script pushed the
  // v4 snapshot back via `pushIssueBody({ body: <snapshot> })` — internally
  // `versionedWriteBody({ mutate: () => snapshot })`. Pre-fix this silently
  // clobbered every marker added between v4 and v16. Post-fix it refuses.
  const remote = stampBodyVersion('current body with markers added', 16);
  const staleSnapshot = stampBodyVersion('old body without those markers', 4);
  const srv = makeServer(remote);

  let pushed = false;
  await assert.rejects(
    () =>
      versionedWriteBody({
        issueNumber: 292,
        repo: 'o/r',
        mutate: () => staleSnapshot, // arrow ignores `base` — the bug class.
        deps: {
          fetchBody: srv.fetchBody,
          pushBody: async (...args) => {
            pushed = true;
            return srv.pushBody(...args);
          },
        },
      }),
    (err) => {
      assert.ok(err instanceof BodyWriteRefusalError);
      assert.equal(err.reason, 'stale-input');
      assert.match(err.message, /version=4/);
      assert.match(err.message, /version=16/);
      assert.match(err.message, /mutateIssueBody/);
      return true;
    }
  );
  assert.equal(pushed, false, 'must refuse before pushing');
  assert.equal(srv.current, remote, 'remote body must be untouched');
});

test('stale-input gate: mutate returning current remote version passes', async () => {
  // Boundary: a mutate that retains the SAME version marker as remote (a
  // weird but possible no-op) is not stale — the check fires only on
  // strictly older versions.
  const remote = stampBodyVersion('body', 7);
  const srv = makeServer(remote);
  const r = await versionedWriteBody({
    issueNumber: 1,
    repo: 'o/r',
    mutate: () => stampBodyVersion('edited body', 7), // same version, edited content
    deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.version, 8);
});

test('stale-input gate: mutate with no version marker passes (normal path)', async () => {
  // The normal pattern: mutate operates on `base` (already stripped) and
  // returns a stripped result. parseBodyVersion(ourLocal) is null → gate is
  // a no-op.
  const srv = makeServer(stampBodyVersion('hello', 5));
  const r = await versionedWriteBody({
    issueNumber: 1,
    repo: 'o/r',
    mutate: (base) => `${base} world`,
    deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.version, 6);
});

// ── #347: mutate-return type guard ───────────────────────────────────────────
//
// The corruption shape we are catching: a `mutate` that returns a non-string
// value (object, array, null, undefined, number). Without the guard, the
// runtime would coerce via `String(obj) → "[object Object]"` and ship that as
// the new body. With the guard, we throw a TypeError BEFORE pushBody runs.

function makeGuardServer() {
  const srv = makeServer(stampBodyVersion('original body', 1));
  let pushCount = 0;
  const wrappedPush = async (repo, issue, body) => {
    pushCount++;
    return srv.pushBody(repo, issue, body);
  };
  return {
    fetchBody: srv.fetchBody,
    pushBody: wrappedPush,
    get pushCount() {
      return pushCount;
    },
    get current() {
      return srv.current;
    },
  };
}

test('#347 guard: mutate returning object throws TypeError, never pushes', async () => {
  const srv = makeGuardServer();
  await assert.rejects(
    versionedWriteBody({
      issueNumber: 347,
      repo: 'o/r',
      mutate: () => ({ body: 'oops' }), // buildEvidenceBackfill-shaped return
      deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
    }),
    (err) => {
      assert.equal(err.name, 'TypeError');
      assert.match(err.message, /returned object/);
      assert.match(err.message, /\[object Object\]/);
      return true;
    }
  );
  assert.equal(srv.pushCount, 0, 'pushBody must not be called when guard throws');
  assert.equal(srv.current, stampBodyVersion('original body', 1), 'remote body untouched');
});

test('#347 guard: mutate returning null throws TypeError', async () => {
  const srv = makeGuardServer();
  await assert.rejects(
    versionedWriteBody({
      issueNumber: 347,
      repo: 'o/r',
      mutate: () => null,
      deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
    }),
    (err) => {
      assert.equal(err.name, 'TypeError');
      assert.match(err.message, /returned null/);
      return true;
    }
  );
  assert.equal(srv.pushCount, 0);
});

test('#347 guard: mutate returning array throws TypeError', async () => {
  const srv = makeGuardServer();
  await assert.rejects(
    versionedWriteBody({
      issueNumber: 347,
      repo: 'o/r',
      mutate: () => ['a', 'b'],
      deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
    }),
    (err) => {
      assert.equal(err.name, 'TypeError');
      assert.match(err.message, /returned array/);
      return true;
    }
  );
  assert.equal(srv.pushCount, 0);
});

test('#347 guard: mutate returning undefined throws TypeError', async () => {
  const srv = makeGuardServer();
  await assert.rejects(
    versionedWriteBody({
      issueNumber: 347,
      repo: 'o/r',
      mutate: () => undefined,
      deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
    }),
    (err) => {
      assert.equal(err.name, 'TypeError');
      assert.match(err.message, /returned undefined/);
      return true;
    }
  );
  assert.equal(srv.pushCount, 0);
});

test('#347 guard: mutate returning number throws TypeError', async () => {
  const srv = makeGuardServer();
  await assert.rejects(
    versionedWriteBody({
      issueNumber: 347,
      repo: 'o/r',
      mutate: () => 42,
      deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
    }),
    (err) => {
      assert.equal(err.name, 'TypeError');
      assert.match(err.message, /returned number/);
      return true;
    }
  );
  assert.equal(srv.pushCount, 0);
});

test('#347 guard: string return passes through unchanged (happy path)', async () => {
  const srv = makeGuardServer();
  const r = await versionedWriteBody({
    issueNumber: 347,
    repo: 'o/r',
    mutate: (base) => `${base} + added`,
    deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.version, 2);
  assert.equal(srv.pushCount, 1);
});

// ── #439: UTF-8 chunk-boundary decode (collectStreamUtf8) ─────────────────────
//
// Node delivers a child process's stdout in arbitrary chunk boundaries that do
// NOT respect multibyte UTF-8 sequence boundaries. The old `out += d` accumulator
// coerced each Buffer chunk to a string independently, so a multibyte sequence
// straddling two `data` events decoded each half as U+FFFD (one per dangling
// fragment → +2 U+FFFD per split). collectStreamUtf8 must buffer raw bytes and
// decode the full buffer once, yielding zero U+FFFD for a clean body.

// Emit `chunks` as discrete `data` events (one per chunk) followed by `end`,
// mirroring how a child stdout stream hands us boundary-agnostic chunks.
function streamOfChunks(chunks) {
  let i = 0;
  return new Readable({
    read() {
      this.push(i < chunks.length ? chunks[i++] : null);
    },
  });
}

const REPLACEMENT = '�';

test('#439: collectStreamUtf8 — 4-byte emoji split 2+2 decodes with zero U+FFFD', async () => {
  // U+1F600 GRINNING FACE = F0 9F 98 80 (4 bytes). Split mid-sequence: 2 + 2.
  const original = `before ${String.fromCodePoint(0x1f600)} after`;
  const full = Buffer.from(original, 'utf8');
  const emojiStart = Buffer.from('before ', 'utf8').length;
  const splitAt = emojiStart + 2; // straddle the 4-byte sequence
  const chunkA = full.subarray(0, splitAt);
  const chunkB = full.subarray(splitAt);

  // Sanity: per-chunk decode (the OLD buggy behavior) WOULD invent U+FFFD.
  const buggy = chunkA.toString() + chunkB.toString();
  assert.ok(buggy.includes(REPLACEMENT), 'control: per-chunk decode must corrupt');

  const decoded = await collectStreamUtf8(streamOfChunks([chunkA, chunkB]));
  assert.equal(decoded.includes(REPLACEMENT), false, 'no replacement chars');
  assert.equal(decoded, original, 'byte-for-byte round-trip');
});

test('#439: collectStreamUtf8 — many tiny chunks (every byte its own event) survive', async () => {
  const original = `On Deck ${String.fromCodePoint(0x1f7e2)} ready`; // 🟢 = 4 bytes
  const full = Buffer.from(original, 'utf8');
  const oneByteChunks = [...full].map((b) => Buffer.from([b]));
  const decoded = await collectStreamUtf8(streamOfChunks(oneByteChunks));
  assert.equal(decoded, original);
  assert.equal(decoded.includes(REPLACEMENT), false);
});

test('#439: collectStreamUtf8 — null/absent stream resolves to empty string', async () => {
  assert.equal(await collectStreamUtf8(null), '');
  assert.equal(await collectStreamUtf8(undefined), '');
});

test('#439: collectStreamUtf8 — propagates stream error', async () => {
  const boom = new Error('stream exploded');
  const s = new Readable({
    read() {
      this.destroy(boom);
    },
  });
  await assert.rejects(collectStreamUtf8(s), /stream exploded/);
});

test('#439: versionedWriteBody round-trip survives mid-emoji fetch chunking', async () => {
  // A fetchBody whose decode goes through collectStreamUtf8 on split chunks must
  // produce a clean base so the post-push byte-equality verify matches → no
  // false `max-retries-exceeded`. We exercise the decoder directly inside the
  // dep and assert the body it yields is U+FFFD-free, then confirm the write OK.
  const original = `status ${String.fromCodePoint(0x1f600)}\n\n<!-- aitm-body-version: 5 -->\n`;

  let stored = original;
  // Re-decode the CURRENT stored body each fetch, always straddling the 4-byte
  // emoji on a 2+2 chunk boundary — the exact corruption #439 fixes. Both the
  // base read and the post-push verify read flow through this decoder.
  const fetchBody = async () => {
    const buf = Buffer.from(stored, 'utf8');
    const splitAt = buf.indexOf(Buffer.from(String.fromCodePoint(0x1f600), 'utf8')) + 2;
    return collectStreamUtf8(streamOfChunks([buf.subarray(0, splitAt), buf.subarray(splitAt)]));
  };
  const pushBody = async (_repo, _issue, next) => {
    // The decoder feeding both base and (here) the verify path is clean, so the
    // stored body must never carry replacement chars.
    assert.equal(next.includes(REPLACEMENT), false);
    stored = next;
  };

  const r = await versionedWriteBody({
    issueNumber: 439,
    repo: 'o/r',
    mutate: (base) => base.replace('status', 'status updated'),
    deps: { fetchBody, pushBody },
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.version, 6);
  assert.equal(stored.includes(REPLACEMENT), false);
  assert.ok(stored.includes('status updated'));
});

test('#439: decode fix does not weaken lost-write detection (third-party clobber rejected)', async () => {
  // Even with the decoder corrected, a genuine concurrent writer that bumps the
  // version out from under us must still be refused — the fix narrows nothing in
  // the conflict path.
  const srv = makeServer('orig\n\n<!-- aitm-body-version: 2 -->\n');
  await assert.rejects(
    versionedWriteBody({
      issueNumber: 439,
      repo: 'o/r',
      maxRetries: 1,
      mutate: (base) => base.replace('orig', 'mine'),
      deps: {
        // Inject a concurrent writer that advances the version after every fetch.
        fetchBody: async () => srv.current,
        pushBody: async () => {
          srv.inject(
            `theirs\n\n<!-- aitm-body-version: ${parseBodyVersion(srv.current) + 5} -->\n`
          );
        },
      },
    }),
    (err) => {
      assert.ok(err instanceof BodyWriteRefusalError);
      return true;
    }
  );
});
