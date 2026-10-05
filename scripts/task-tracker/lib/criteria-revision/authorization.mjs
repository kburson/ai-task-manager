// @story #1851
import { isInjection } from '../../word-counter.mjs';
import {
  hashAuthorizationStatement,
  loadRawCodexUserMessage,
} from '../workflow-policy/authority-resolver.mjs';
import { validateRevisionRequest, exactKeys } from './schema.mjs';
import { renderApprovalStatement } from './proposal.mjs';
const blocked = (code) =>
  Object.freeze({
    status: 'blocked',
    code,
    remediation:
      'Provide one exact original human user-message reference through the supported executor session.',
  });
export async function resolveRevisionAuthorization({
  proposal,
  authorizationSource,
  loadUserMessage = loadRawCodexUserMessage,
} = {}) {
  try {
    validateRevisionRequest({
      schema: 'aitm.criteria-revision/v1',
      action: proposal?.mode === 'revision' ? 'apply' : 'recover',
      proposal,
      authorizationSource,
    });
  } catch {
    return blocked('revision-authorization-invalid');
  }
  if (authorizationSource.sessionId !== proposal.executor.sessionId)
    return blocked('authorization-executor-mismatch');
  if (typeof loadUserMessage !== 'function') return blocked('authorization-adapter-unavailable');
  let observed;
  try {
    observed = await loadUserMessage({
      sessionId: authorizationSource.sessionId,
      messageId: authorizationSource.messageId,
    });
  } catch {
    return blocked('authorization-source-unavailable');
  }
  if (
    !observed ||
    observed.origin !== 'codex-session-transcript' ||
    observed.id !== authorizationSource.messageId ||
    observed.sessionId !== authorizationSource.sessionId
  )
    return blocked('authorization-raw-source-mismatch');
  if (observed.role !== 'user') return blocked('authorization-source-not-human');
  if (
    !Array.isArray(observed.content) ||
    observed.content.length !== 1 ||
    !Array.isArray(observed.injection) ||
    observed.injection.length !== 1 ||
    observed.injection[0] !== false
  )
    return blocked('authorization-raw-blocks');
  const block = observed.content[0];
  try {
    exactKeys(block, ['type', 'text']);
  } catch {
    return blocked('authorization-block-unsupported');
  }
  if (block.type !== 'input_text' || typeof block.text !== 'string' || isInjection(block.text))
    return blocked('authorization-injected-source');
  const statement = renderApprovalStatement(proposal);
  if (
    !Buffer.from(block.text, 'utf8').equals(Buffer.from(statement, 'utf8')) ||
    hashAuthorizationStatement(block.text) !== authorizationSource.statementHash
  )
    return blocked('authorization-whole-message-mismatch');
  if (
    observed.principal !== null &&
    (typeof observed.principal !== 'string' || observed.principal.trim() === '')
  )
    return blocked('authorization-principal-invalid');
  return Object.freeze({
    status: 'verified',
    authority: Object.freeze({
      reference: `codex://sessions/${authorizationSource.sessionId}/messages/${authorizationSource.messageId}`,
      statement,
      statementHash: authorizationSource.statementHash,
      principal: observed.principal,
      executingSession: proposal.executor.sessionId,
      origin: 'codex-session-transcript',
      verificationLevel: 'host-verified-user-message',
    }),
  });
}
