// @story #310
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
} from '../../../../task-tracker/lib/versioned-issue-write.mjs';
import { parseBodyVersion, stampBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';

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

// ── happy path ───────────────────────────────────────────────────────────────

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
  const original = `Assigned ${String.fromCodePoint(0x1f7e2)} ready`; // 🟢 = 4 bytes
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
