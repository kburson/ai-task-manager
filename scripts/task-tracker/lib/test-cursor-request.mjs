// @story #937

import { buildCommandCursorRequest } from './state-cursor.mjs';

export function buildTestCursorRequest({ command, currentState, issue, cwd } = {}) {
  if (currentState === 'develop') {
    return buildCommandCursorRequest({
      command: 'test',
      issue,
      cwd,
      requestedTarget: 'test',
    });
  }
  if (currentState === 'test' && ['test', 'rebind', 'resume'].includes(command)) {
    return buildCommandCursorRequest({
      command: command === 'test' ? 'resume' : command,
      issue,
      cwd,
    });
  }
  throw new TypeError(`test cursor: expected Develop or Test, received ${String(currentState)}`);
}
