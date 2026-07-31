// @story #1049

const CONTROLLER_OPERATIONS = new Set([
  'branch-worktree-orchestration',
  'lifecycle-mutation',
  'evidence-mutation',
]);

function normalizeIssueNumber(value, label) {
  const match = String(value ?? '').match(/^#?(\d+)$/);
  if (!match || Number(match[1]) <= 0) {
    throw new Error(`ensureWaveParentCore: ${label} must be a positive issue number`);
  }
  return Number(match[1]);
}

function isAlreadyLinked(error) {
  return (
    error?.code === 'already-linked' ||
    /\balready (?:a sub-issue|linked)\b/i.test(String(error?.message || ''))
  );
}

/**
 * Execute the complete wave-parent mutation chain beneath one lease owned by an
 * existing controller issue. Helpers receive a capability-limited continuation:
 * it can only authorize the controller and it reverifies immediately before
 * every mutation callback.
 */
export async function ensureWaveParentCore({
  controllerIssueId,
  children,
  purpose,
  cfg,
  withGovernedEffect,
  deps = {},
} = {}) {
  const controllerNumber = normalizeIssueNumber(controllerIssueId, 'controllerIssueId');
  const normalizedChildren = Array.from(
    new Set((children || []).map((child) => normalizeIssueNumber(child, 'child')))
  );
  if (normalizedChildren.length === 0) {
    throw new Error('ensureWaveParentCore: at least one child is required');
  }
  if (normalizedChildren.includes(controllerNumber)) {
    throw new Error('ensureWaveParentCore: the controller cannot be one of its wave children');
  }
  if (!cfg?.repo) throw new Error('ensureWaveParentCore: cfg.repo is required');
  if (typeof withGovernedEffect !== 'function') {
    throw new Error('ensureWaveParentCore: withGovernedEffect is required');
  }

  for (const name of [
    'waveId',
    'findExistingParent',
    'createParent',
    'getIssueNodeId',
    'addSubIssue',
    'ensureParentEpicTitle',
    'postTimingEvent',
  ]) {
    if (typeof deps[name] !== 'function') {
      throw new Error(`ensureWaveParentCore: deps.${name} is required`);
    }
  }

  const waveIdValue = deps.waveId(normalizedChildren);
  const controllerId = String(controllerNumber);

  return withGovernedEffect(
    {
      issueId: controllerId,
      operation: 'branch-worktree-orchestration',
      heartbeat: true,
    },
    async (authority) => {
      if (typeof authority?.reverify !== 'function') {
        throw new Error('ensureWaveParentCore: controller authority cannot reverify');
      }

      const controllerContinuation = async (options, callback) => {
        const requestedIssue = String(options?.issueId ?? '').replace(/^#/, '');
        if (requestedIssue !== controllerId) {
          throw new Error(
            `ensureWaveParentCore: controller continuation cannot authorize #${requestedIssue}`
          );
        }
        if (!CONTROLLER_OPERATIONS.has(options?.operation)) {
          throw new Error(
            `ensureWaveParentCore: unsupported controller operation "${options?.operation}"`
          );
        }
        if (typeof callback !== 'function') {
          throw new Error('ensureWaveParentCore: mutation callback is required');
        }
        await authority.reverify();
        return callback(authority);
      };

      const common = {
        controllerIssueId: controllerNumber,
        children: normalizedChildren,
        purpose,
        cfg,
        waveIdValue,
        withGovernedEffect: controllerContinuation,
        leaseContext: authority.leaseContext,
      };

      let parentNumber = await deps.findExistingParent(common);
      if (parentNumber == null) {
        parentNumber = await deps.createParent(common);
      }
      parentNumber = normalizeIssueNumber(parentNumber, 'parentNumber');
      if (typeof deps.ensureParentReady === 'function') {
        await deps.ensureParentReady({
          ...common,
          parentNumber,
        });
      }

      const parentId = await deps.getIssueNodeId({
        ...common,
        issueNumber: parentNumber,
      });
      if (!parentId) {
        throw new Error(`ensureWaveParentCore: no node id found for parent #${parentNumber}`);
      }

      for (const childNumber of normalizedChildren) {
        const childId = await deps.getIssueNodeId({
          ...common,
          issueNumber: childNumber,
        });
        if (!childId) {
          throw new Error(`ensureWaveParentCore: no node id found for child #${childNumber}`);
        }
        try {
          await controllerContinuation(
            {
              issueId: controllerId,
              operation: 'evidence-mutation',
              heartbeat: true,
            },
            () =>
              deps.addSubIssue({
                ...common,
                parentNumber,
                parentId,
                childNumber,
                childId,
              })
          );
        } catch (error) {
          if (!isAlreadyLinked(error)) throw error;
        }
      }

      await deps.ensureParentEpicTitle({
        ...common,
        parentNumber,
        parentId,
      });
      await deps.postTimingEvent({
        ...common,
        parentNumber,
        parentId,
      });

      return {
        parentNumber,
        parentId,
        waveIdValue,
      };
    }
  );
}
