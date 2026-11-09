import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  watch as watchFilesystem,
} from 'node:fs';
import path from 'node:path';

import { resolveContainedPath } from '../collateral/paths.mjs';
import { renderCommand } from '../cli/help-data.mjs';
import { AprError } from '../errors.mjs';
import { canonicalProjection, inspectReviewAuthority } from '../protocol/service.mjs';
import { waitForHandoff } from '../mcp/wait.mjs';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function invalid(message, details = {}) {
  throw new AprError('APR_WAIT_INVALID', message, {
    recovery: 'Use a safe event-authorized review ID and retry the MCP wait.',
    details,
  });
}

function reviewWorkspace(repositoryRoot, reviewId) {
  if (typeof reviewId !== 'string' || !SAFE_ID.test(reviewId)) {
    invalid('Review ID is invalid.', { review_id: reviewId });
  }
  try {
    const logical = resolveContainedPath(
      repositoryRoot,
      path.join('.scratch', 'peer-review', reviewId),
      'review workspace'
    ).absolute;
    let physical;
    try {
      physical = realpathSync(logical);
    } catch (cause) {
      if (cause?.code === 'ENOENT') {
        throw new AprError('APR_EVENT_LOG_MISSING', 'The review workspace does not exist.', {
          recovery: 'Use an event-authorized review ID and retry the wait.',
          details: { review_id: reviewId },
        });
      }
      throw cause;
    }
    return resolveContainedPath(repositoryRoot, physical, 'review workspace').absolute;
  } catch (cause) {
    if (cause instanceof AprError && cause.code === 'APR_EVENT_LOG_MISSING') throw cause;
    if (cause instanceof AprError) {
      throw new AprError('APR_WAIT_INVALID', 'Review workspace is outside the repository.', {
        recovery: 'Use the configured repository root and an event-authorized review ID.',
        details: { review_id: reviewId },
      });
    }
    throw cause;
  }
}

function directoryIdentity(repositoryRoot, directory, label) {
  try {
    const metadata = lstatSync(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`${label} is not a physical directory`);
    }
    const physical = realpathSync(directory);
    resolveContainedPath(repositoryRoot, physical, label);
    return Object.freeze({ device: metadata.dev, inode: metadata.ino, physical });
  } catch (cause) {
    throw new AprError('APR_WAIT_INVALID', `${label} identity cannot be verified.`, {
      recovery: 'Stop the resident server, inspect the review workspace, and restart safely.',
      details: { directory, cause: cause?.code ?? cause?.message ?? 'unknown' },
    });
  }
}

function assertDirectoryIdentity(repositoryRoot, directory, expected, label) {
  const current = directoryIdentity(repositoryRoot, directory, label);
  if (
    current.physical !== expected.physical ||
    current.device !== expected.device ||
    current.inode !== expected.inode
  ) {
    throw new AprError('APR_WAIT_INVALID', `${label} identity changed during the wait.`, {
      recovery: 'Stop the resident server, inspect the review workspace, and restart safely.',
      details: { directory },
    });
  }
}

function receipt(workspace, delivery) {
  let file;
  try {
    file = resolveContainedPath(
      workspace,
      path.join('deliveries', `${delivery.delivery_id}.json`),
      'delivery receipt'
    ).absolute;
  } catch (cause) {
    if (cause instanceof AprError) {
      throw new AprError('APR_DELIVERY_CONFLICT', 'A delivery receipt path is unsafe.', {
        recovery: 'Preserve the receipt path, inspect the collision, and run explicit recovery.',
        details: { delivery_id: delivery.delivery_id },
      });
    }
    throw cause;
  }
  let current;
  try {
    const metadata = lstatSync(file);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new AprError('APR_DELIVERY_CONFLICT', 'A delivery receipt is not a regular file.', {
        recovery: `Preserve ${file}, inspect the collision, and run explicit recovery.`,
        details: { file, delivery_id: delivery.delivery_id },
      });
    }
    current = readFileSync(file, 'utf8');
  } catch (cause) {
    if (cause?.code === 'ENOENT') return null;
    if (cause instanceof AprError) throw cause;
    throw new AprError('APR_DELIVERY_CONFLICT', 'A delivery receipt cannot be verified.', {
      recovery: `Preserve ${file}, inspect the receipt, and run explicit recovery.`,
      details: { file, delivery_id: delivery.delivery_id },
    });
  }
  const expected = canonicalProjection({
    delivery_id: delivery.delivery_id,
    recipient: delivery.recipient,
    digest: delivery.digest,
  });
  if (current !== expected) {
    throw new AprError('APR_DELIVERY_CONFLICT', 'A delivery receipt conflicts with events.', {
      recovery: `Preserve ${file}, inspect the collision, and run explicit recovery.`,
      details: { file, delivery_id: delivery.delivery_id },
    });
  }
  return current;
}

export function createLiveDeliverySource({ repositoryRoot, reviewId, watch = watchFilesystem }) {
  if (typeof repositoryRoot !== 'string' || !repositoryRoot) {
    invalid('Repository root is required.');
  }
  if (typeof watch !== 'function') invalid('Filesystem watch implementation is unavailable.');
  const workspace = reviewWorkspace(repositoryRoot, reviewId);
  inspectReviewAuthority(workspace);
  const deliveryDirectory = resolveContainedPath(
    workspace,
    path.join(workspace, 'deliveries'),
    'delivery directory'
  ).absolute;
  mkdirSync(deliveryDirectory, { recursive: true });
  const workspaceIdentity = directoryIdentity(repositoryRoot, workspace, 'review workspace');
  const deliveryDirectoryIdentity = directoryIdentity(
    repositoryRoot,
    deliveryDirectory,
    'delivery directory'
  );
  const assertBoundIdentity = () => {
    assertDirectoryIdentity(repositoryRoot, workspace, workspaceIdentity, 'review workspace');
    assertDirectoryIdentity(
      repositoryRoot,
      deliveryDirectory,
      deliveryDirectoryIdentity,
      'delivery directory'
    );
  };

  return Object.freeze({
    readAfter(input) {
      if (input?.reviewId !== reviewId) invalid('Wait review ID does not match its source.');
      assertBoundIdentity();
      try {
        const { events } = inspectReviewAuthority(workspace);
        const matched = events.find(
          (candidate) =>
            candidate.sequence > input.afterSequence &&
            candidate.type === 'delivery-written' &&
            candidate.payload.delivery.recipient === input.participant
        );
        if (!matched || receipt(workspace, matched.payload.delivery) === null) return null;
        return Object.freeze({
          schema: 'ai-peer-review.delivery/v1',
          status: 'delivered',
          review_id: reviewId,
          participant: input.participant,
          sequence: matched.sequence,
          delivery_id: matched.payload.delivery.delivery_id,
          digest: matched.payload.delivery.digest,
        });
      } finally {
        assertBoundIdentity();
      }
    },
    subscribe({ reviewId: requestedReviewId, onChange, onError }) {
      if (requestedReviewId !== reviewId) invalid('Wait review ID does not match its source.');
      if (typeof onChange !== 'function' || typeof onError !== 'function') {
        invalid('Wait subscription callbacks are invalid.');
      }
      assertBoundIdentity();
      const watcher = watch(deliveryDirectory, onChange);
      try {
        assertBoundIdentity();
        watcher.on?.('error', onError);
      } catch (error) {
        watcher.close();
        throw error;
      }
      return Object.freeze({
        close() {
          watcher.close();
        },
      });
    },
    manualRecovery() {
      assertBoundIdentity();
      return Object.freeze({
        available: true,
        command: renderCommand(['peer-review', 'resume', workspace]),
      });
    },
  });
}

export function createLiveWaitTransport({ repositoryRoot, watch } = {}) {
  return Object.freeze({
    name: 'local-live-wait',
    host: 'any',
    capability: 'live-wait',
    healthy: true,
    wait(input) {
      const deliveries = createLiveDeliverySource({
        repositoryRoot,
        reviewId: input.reviewId,
        ...(watch ? { watch } : {}),
      });
      return waitForHandoff({ ...input, deliveries });
    },
  });
}
