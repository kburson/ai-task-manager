import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { homedir } from 'node:os';
import test from 'node:test';

// cspell:words provisioned

import { brokerPaths } from '../../src/broker/paths.mjs';

test(
  'production-derived macOS endpoint binds and connects',
  { skip: process.platform !== 'darwin' },
  async (t) => {
    const identity = {
      digest: createHash('sha256').update(randomBytes(32)).digest('hex'),
    };
    const platform = { kind: 'darwin', maxEndpointLength: 103 };
    const defaultEnv = { ...process.env };
    delete defaultEnv.AI_PEER_REVIEW_ENDPOINT_ROOT;
    let paths;
    let recoveredFromOverlongDefault = false;

    try {
      paths = brokerPaths({ identity, platform, env: defaultEnv, home: homedir() });
    } catch (error) {
      if (error?.code !== 'APR_BROKER_ENDPOINT_TOO_LONG') throw error;

      assert.equal(error.details.limit, 103);
      assert.equal(error.details.maxEndpointRootBytes, 42);
      assert.match(error.recovery, /AI_PEER_REVIEW_ENDPOINT_ROOT/);
      assert.match(error.recovery, /42 UTF-8 bytes/);
      assert.match(error.recovery, /administrator-provisioned/);
      assert.match(error.recovery, /unsupported on this account/);
      assert.match(error.recovery, /Do not move the authority cache/);
      assert.ok(
        process.env.AI_PEER_REVIEW_ENDPOINT_ROOT,
        'an overlong macOS home requires a pre-provisioned AI_PEER_REVIEW_ENDPOINT_ROOT'
      );

      paths = brokerPaths({
        identity,
        platform,
        env: {
          ...defaultEnv,
          AI_PEER_REVIEW_ENDPOINT_ROOT: process.env.AI_PEER_REVIEW_ENDPOINT_ROOT,
        },
        home: homedir(),
      });
      recoveredFromOverlongDefault = true;
    }

    assert.ok(Buffer.byteLength(paths.endpoint, 'utf8') <= 103);
    assert.equal(
      paths.endpointRootSource,
      recoveredFromOverlongDefault ? 'configured' : 'cache-root'
    );
    assert.equal(paths.endpointLayoutVersion, 1);
    assert.equal(paths.maxEndpointRootBytes, 42);
    for (const directory of paths.endpointDirectories) {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
    }
    assert.equal(existsSync(paths.endpoint), false, 'the unique endpoint must not already exist');

    const server = createServer((socket) => {
      socket.once('data', (payload) => {
        assert.equal(payload.toString('utf8'), 'ping');
        socket.end('pong');
      });
    });
    let client;

    t.after(async () => {
      client?.destroy();
      if (server.listening) {
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }
      if (existsSync(paths.endpoint)) unlinkSync(paths.endpoint);
    });

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(paths.endpoint, resolve);
    });

    const response = await new Promise((resolve, reject) => {
      let received = '';
      client = createConnection(paths.endpoint);
      client.setEncoding('utf8');
      client.once('connect', () => client.write('ping'));
      client.on('data', (chunk) => {
        received += chunk;
      });
      client.once('end', () => resolve(received));
      client.once('error', reject);
    });
    assert.equal(response, 'pong');

    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    if (existsSync(paths.endpoint)) unlinkSync(paths.endpoint);
    assert.equal(existsSync(paths.endpoint), false);
  }
);
