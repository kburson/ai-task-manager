import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { renderCommand } from '../cli/help-data.mjs';
import { AprError } from '../errors.mjs';

const OFFICIAL = Object.freeze({
  codex: ['codex', 'resume'],
  claude: ['claude', '--resume'],
  grok: ['grok', 'resume'],
});

function unavailable(message, details = {}) {
  throw new AprError('APR_TRANSPORT_UNAVAILABLE', message, {
    recovery:
      'Use manual transport or configure the documented official resume command and scratch handle.',
    details,
  });
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function isOfficialResumeCommand(host, command) {
  return Object.hasOwn(OFFICIAL, host) && same(command, OFFICIAL[host]);
}

export function createResumeTransport({ host, command, workspace, scratchHandle }) {
  if (!isOfficialResumeCommand(host, command))
    unavailable('Resume command is not an official provider form.', { host });
  let physicalWorkspace;
  let physicalHandle;
  let handle;
  try {
    physicalWorkspace = realpathSync(workspace);
    physicalHandle = realpathSync(scratchHandle);
    handle = JSON.parse(readFileSync(physicalHandle, 'utf8'));
  } catch {
    unavailable('Resume scratch handle cannot be read.');
  }
  if (
    !physicalHandle.startsWith(`${physicalWorkspace}${path.sep}`) ||
    handle?.schema !== 'ai-peer-review.resume-handle/v1' ||
    handle.host !== host ||
    typeof handle.handle !== 'string' ||
    !/^[A-Za-z0-9._:-]+$/.test(handle.handle)
  ) {
    unavailable('Resume scratch handle is invalid or outside the review workspace.');
  }
  return Object.freeze({
    name: `${host}-resume`,
    host,
    capability: 'resume-only',
    healthy: true,
    async deliver({ execFile, invitation, workspace: recoveryWorkspace }) {
      try {
        await execFile(command[0], [...command.slice(1), handle.handle]);
        return Object.freeze({
          schema: 'ai-peer-review.delivery/v1',
          status: 'delivered',
          transport: 'resume-only',
        });
      } catch {
        return Object.freeze({
          schema: 'ai-peer-review.delivery/v1',
          status: 'delivery-pending',
          transport: 'resume-only',
          reason: 'resume-command-failed',
          manual: Object.freeze({
            available: true,
            command: renderCommand([
              'peer-review',
              recoveryWorkspace ? 'resume' : 'join',
              recoveryWorkspace ?? invitation,
            ]),
          }),
        });
      }
    },
  });
}
