import { renderCommand } from '../cli/help-data.mjs';

export const manualTransport = Object.freeze({
  name: 'manual',
  host: 'any',
  capability: 'manual',
  healthy: true,
  async deliver({ invitation, workspace, platform = process.platform }) {
    return Object.freeze({
      schema: 'ai-peer-review.delivery/v1',
      status: 'delivery-pending',
      transport: 'manual',
      manual: Object.freeze({
        available: true,
        command: renderCommand(
          ['peer-review', workspace ? 'resume' : 'join', workspace ?? invitation],
          { platform }
        ),
      }),
    });
  },
});
