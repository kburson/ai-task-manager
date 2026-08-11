// `assign` verb — locally couples GitHub assignee edits to the Assigned state (#1207).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { fetchConfiguredProjectIssue } from '../../gh/lib/github-projects.mjs';
import { runMoveStateHost } from '../../gh/move-state.mjs';
import { getProjectDir } from '../paths.mjs';
import { withIssueLock, IssueLockError } from '../issue-mutator-lock.mjs';
import {
  fetchAssignedInvariantAssignees,
  parseAssigneeLogins,
  resolveAssignmentTarget,
  resolveConfiguredProjectState,
} from '../lib/assigned-assignee-invariant.mjs';
import { stateIds } from '../lib/lifecycle-policy/index.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { parseStrict, StrictArgvError } from '../lib/argv-strict.mjs';

const pexec = promisify(execFile);

async function defaultGetLiveState({ issueNumber, cfg }) {
  const snapshot = await fetchConfiguredProjectIssue({
    repo: cfg.repo,
    projectId: cfg.projectId,
    issueNumber,
  });
  return resolveConfiguredProjectState(
    snapshot.projectItem ? [snapshot.projectItem] : [],
    cfg.projectId
  );
}

async function defaultGetAssignmentSnapshot({ issueNumber, cfg }) {
  const snapshot = await fetchConfiguredProjectIssue({
    repo: cfg.repo,
    projectId: cfg.projectId,
    issueNumber,
  });
  return {
    state: resolveConfiguredProjectState(
      snapshot.projectItem ? [snapshot.projectItem] : [],
      cfg.projectId
    ),
    assignees: parseAssigneeLogins(snapshot.assignees),
  };
}

async function defaultResolveLogin(login) {
  if (login !== '@me') return login;
  const { stdout } = await pexec('gh', ['api', 'user', '--jq', '.login'], {
    timeout: GH_API_TIMEOUT_MS,
  });
  const resolved = String(stdout).trim();
  if (!resolved) throw new Error('could not resolve @me to a GitHub login');
  return resolved;
}

async function defaultMutateAssignee({ issueNumber, repo, login, remove }) {
  await pexec(
    'gh',
    [
      'issue',
      'edit',
      String(issueNumber),
      '-R',
      repo,
      remove ? '--remove-assignee' : '--add-assignee',
      login,
    ],
    { timeout: GH_API_TIMEOUT_MS }
  );
}

function defaultRunMoveState({ issueNumber, target, reason }) {
  const extraArgs = target === 'backlog' && reason ? ['--demote', '--demote-reason', reason] : [];
  return runMoveStateHost({
    argv: [process.execPath, 'move-state.mjs', String(issueNumber), target, ...extraArgs],
    env: { ...process.env, AITM_INTERNAL: '1', AITM_VERB_CONTEXT: 'assign' },
  });
}

async function safeCompensate({
  action,
  fetchAssignees,
  fetchArgs,
  login,
  shouldBePresent = false,
}) {
  try {
    await action();
  } catch (error) {
    return error?.message || String(error);
  }
  return verifyAssigneePostcondition({
    fetchAssignees,
    fetchArgs,
    login,
    shouldBePresent,
  });
}

function sameLogin(left, right) {
  return String(left).toLowerCase() === String(right).toLowerCase();
}

async function verifyAssigneePostcondition({
  fetchAssignees,
  fetchArgs,
  login,
  shouldBePresent,
  attempts = 3,
}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const assignees = parseAssigneeLogins(await fetchAssignees(fetchArgs));
      const present = assignees.some((entry) => sameLogin(entry, login));
      if (present === shouldBePresent) return null;
      lastError = shouldBePresent
        ? new Error(`GitHub does not report ${login}`)
        : new Error(`GitHub still reports ${login}`);
    } catch (error) {
      lastError = error;
    }
  }
  return `compensation unverified: ${lastError?.message || String(lastError)}`;
}

async function readAssigneesWithRetry(fetchAssignees, args, attempts = 2) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return parseAssigneeLogins(await fetchAssignees(args));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function observeAmbiguousAdd({ fetchAssignees, fetchArgs, login, attempts = 3 }) {
  let successfulAbsentReads = 0;
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const assignees = parseAssigneeLogins(await fetchAssignees(fetchArgs));
      if (assignees.some((entry) => sameLogin(entry, login))) {
        return { kind: 'present', assignees };
      }
      successfulAbsentReads += 1;
    } catch (error) {
      lastError = error;
    }
  }
  if (successfulAbsentReads === attempts) return { kind: 'absent', assignees: [] };
  return {
    kind: 'indeterminate',
    error: lastError?.message || 'assignee postcondition was not consistently observable',
  };
}

async function inspectFailedMove({
  issueNumber,
  target,
  cfg,
  login,
  getLiveState,
  fetchAssignees,
  getAssignmentSnapshot,
}) {
  try {
    const snapshot = await readPairedAssignmentSnapshot({
      issueNumber,
      cfg,
      getLiveState,
      fetchAssignees,
      getAssignmentSnapshot,
    });
    if (snapshot.error) throw snapshot.error;
    if (!snapshot.state) {
      return {
        landed: false,
        indeterminate: true,
        state: null,
        assignees: snapshot.assignees,
        error:
          `configured project Status changed during failed-move inspection ` +
          `(${snapshot.stateBefore} → ${snapshot.stateAfter})`,
      };
    }
    const state = snapshot.state;
    const assignees = snapshot.assignees;
    if (state === target) {
      const freshLoginPresent = snapshot.assigneesAfter.some((entry) => sameLogin(entry, login));
      if (target === 'assigned' && !freshLoginPresent) {
        return {
          landed: true,
          indeterminate: true,
          state,
          assignees,
          error: `Assigned landed but ${login} is not observable`,
        };
      }
      return { landed: true, indeterminate: false, state, assignees };
    }

    const knownPrior =
      (target === 'assigned' && state === 'backlog') ||
      (target === 'backlog' && state === 'assigned');
    if (knownPrior) return { landed: false, indeterminate: false, state, assignees };
    return {
      landed: false,
      indeterminate: true,
      state,
      assignees,
      error: `configured project Status is ${state}, expected ${target}`,
    };
  } catch (error) {
    return {
      landed: false,
      indeterminate: true,
      state: null,
      assignees: null,
      error: error?.message || String(error),
    };
  }
}

function assertRecognizedState(state, context = 'live project state') {
  if (!stateIds().includes(state)) {
    throw new Error(`${context} is missing or unrecognized`);
  }
  return state;
}

async function readPairedAssignmentSnapshot({
  issueNumber,
  cfg,
  getLiveState,
  fetchAssignees,
  getAssignmentSnapshot,
}) {
  if (getAssignmentSnapshot) {
    try {
      const snapshot = await getAssignmentSnapshot({ issueNumber, cfg });
      const state = assertRecognizedState(snapshot?.state, 'live assignment snapshot state');
      const assignees = parseAssigneeLogins(snapshot?.assignees);
      return {
        stateBefore: state,
        stateAfter: state,
        state,
        assigneesBefore: assignees,
        assigneesAfter: assignees,
        assignees,
      };
    } catch (error) {
      return {
        stateBefore: null,
        stateAfter: null,
        state: null,
        assigneesBefore: null,
        assigneesAfter: null,
        assignees: null,
        error,
      };
    }
  }

  let stateBefore = null;
  let assigneesBefore = null;
  let assignees = null;
  let stateAfter = null;
  try {
    stateBefore = assertRecognizedState(
      await getLiveState({ issueNumber, cfg }),
      'live project state before assignee read'
    );
  } catch (error) {
    return {
      stateBefore,
      stateAfter,
      state: null,
      assigneesBefore,
      assigneesAfter: assignees,
      assignees,
      error,
    };
  }
  try {
    assigneesBefore = parseAssigneeLogins(await fetchAssignees({ issueNumber, repo: cfg.repo }));
  } catch (error) {
    return {
      stateBefore,
      stateAfter,
      state: null,
      assigneesBefore,
      assigneesAfter: assignees,
      assignees,
      error,
    };
  }
  try {
    stateAfter = assertRecognizedState(
      await getLiveState({ issueNumber, cfg }),
      'live project state after assignee read'
    );
  } catch (error) {
    return {
      stateBefore,
      stateAfter,
      state: null,
      assigneesBefore,
      assigneesAfter: assignees,
      assignees,
      error,
    };
  }
  try {
    // Close the fallback proof on ownership, not Status. An owner published
    // while the trailing Status read is in flight is therefore observable
    // before this snapshot can be classified clean.
    assignees = parseAssigneeLogins(await fetchAssignees({ issueNumber, repo: cfg.repo }));
  } catch (error) {
    return {
      stateBefore,
      stateAfter,
      state: null,
      assigneesBefore,
      assigneesAfter: assignees,
      assignees,
      error,
    };
  }
  const observed = [...assigneesBefore];
  for (const login of assignees) {
    if (!observed.some((entry) => sameLogin(entry, login))) observed.push(login);
  }
  return {
    stateBefore,
    stateAfter,
    state: stateBefore === stateAfter ? stateBefore : null,
    assigneesBefore,
    assigneesAfter: assignees,
    assignees: observed,
  };
}

async function observeFinalRemovalPostcondition({
  issueNumber,
  cfg,
  getLiveState,
  fetchAssignees,
  getAssignmentSnapshot,
  attempts = 3,
}) {
  let consecutiveClean = 0;
  let lastSnapshot = null;
  let lastError = null;
  let readFailed = false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const snapshot = await readPairedAssignmentSnapshot({
      issueNumber,
      cfg,
      getLiveState,
      fetchAssignees,
      getAssignmentSnapshot,
    });
    lastSnapshot = snapshot;
    if (snapshot.assignees?.length > 0) {
      return { ...snapshot, kind: 'owner-present' };
    }
    if (snapshot.error) {
      readFailed = true;
      lastError = snapshot.error;
      consecutiveClean = 0;
      continue;
    }
    if (snapshot.state === 'backlog') {
      consecutiveClean += 1;
      if (consecutiveClean >= 2) return { ...snapshot, kind: 'confirmed-clean' };
    } else {
      consecutiveClean = 0;
    }
  }

  return {
    kind: 'indeterminate',
    state: lastSnapshot?.state ?? null,
    stateBefore: lastSnapshot?.stateBefore ?? null,
    stateAfter: lastSnapshot?.stateAfter ?? null,
    assignees: lastSnapshot?.assignees ?? null,
    readFailed,
    error:
      lastError?.message ||
      `post-removal state did not stabilize as Backlog with no assignees` +
        (lastSnapshot ? ` (Status ${lastSnapshot.stateBefore} → ${lastSnapshot.stateAfter})` : ''),
  };
}

async function observeAssignedRestoration({
  issueNumber,
  cfg,
  getLiveState,
  fetchAssignees,
  getAssignmentSnapshot,
  attempts = 3,
}) {
  let lastSnapshot = null;
  let lastError = null;
  let successfulReads = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const snapshot = await readPairedAssignmentSnapshot({
      issueNumber,
      cfg,
      getLiveState,
      fetchAssignees,
      getAssignmentSnapshot,
    });
    lastSnapshot = snapshot;
    if (snapshot.error) {
      lastError = snapshot.error;
      continue;
    }
    successfulReads += 1;
    if (snapshot.state === 'assigned' && snapshot.assigneesAfter.length > 0) {
      return { ...snapshot, kind: 'confirmed' };
    }
  }
  if (successfulReads === attempts) return { kind: 'failed', ...lastSnapshot };
  return {
    kind: 'indeterminate',
    state: lastSnapshot?.state ?? null,
    assignees: lastSnapshot?.assignees ?? null,
    error: lastError?.message || 'Assigned restoration postcondition was not observable',
  };
}

async function restoreAssignedAndVerify({
  issueNumber,
  cfg,
  runMoveState,
  getLiveState,
  fetchAssignees,
  getAssignmentSnapshot,
}) {
  const restoreExit = await runMoveState({ issueNumber, target: 'assigned', cfg });
  const observation = await observeAssignedRestoration({
    issueNumber,
    cfg,
    getLiveState,
    fetchAssignees,
    getAssignmentSnapshot,
  });
  if (observation.kind === 'confirmed') {
    return {
      ...observation,
      kind: restoreExit === 0 ? 'restored' : 'restored-move-incomplete',
      restoreExit,
    };
  }
  return { ...observation, restoreExit };
}

export async function runAssign({
  issueNumber,
  login,
  remove = false,
  expectedUnassigned = false,
  cfg,
  deps = {},
} = {}) {
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('assign: issue# must be a positive integer');
  }
  if (!cfg?.repo) throw new Error('assign: cfg.repo is required');

  const requestedLogin = login || resolveAssignmentTarget(cfg);
  const resolveLogin = deps.resolveLogin || defaultResolveLogin;
  const getLiveState = deps.getLiveState || defaultGetLiveState;
  const fetchAssignees = deps.fetchAssignees || fetchAssignedInvariantAssignees;
  const getAssignmentSnapshot =
    deps.getAssignmentSnapshot ||
    (!deps.getLiveState && !deps.fetchAssignees ? defaultGetAssignmentSnapshot : null);
  const mutateAssignee = deps.mutateAssignee || defaultMutateAssignee;
  const runMoveState = deps.runMoveState || defaultRunMoveState;

  try {
    const resolvedLogin = await resolveLogin(requestedLogin);
    let state;
    let before;
    if (getAssignmentSnapshot) {
      const snapshot = await getAssignmentSnapshot({ issueNumber, cfg });
      state = assertRecognizedState(snapshot?.state);
      before = parseAssigneeLogins(snapshot?.assignees);
    } else {
      state = await getLiveState({ issueNumber, cfg });
      if (!stateIds().includes(state)) {
        throw new Error('live project state is missing or unrecognized');
      }
      before = parseAssigneeLogins(await fetchAssignees({ issueNumber, repo: cfg.repo }));
    }
    const alreadyPresent = before.some((entry) => sameLogin(entry, resolvedLogin));

    // Full-Auto claims are the only assignment mode that requires an empty
    // ownership set. This snapshot is inside the caller-held issue lock and is
    // the authoritative pre-mutation check; the wrapper's earlier read is only
    // an optimistic fast refusal. Generic human-directed assignment retains its
    // established ability to add another assignee.
    if (!remove && expectedUnassigned && before.length > 0) {
      return {
        status: 'claim-refused-owner-present',
        exitCode: 1,
        issueNumber,
        login: requestedLogin,
        state,
        assignees: before,
        message: `claim refused because #${issueNumber} already has an assignee`,
      };
    }

    if (!remove) {
      let addProvenance = alreadyPresent ? 'preexisting' : null;
      if (!alreadyPresent) {
        let mutationError = null;
        try {
          await mutateAssignee({
            issueNumber,
            repo: cfg.repo,
            login: requestedLogin,
            remove: false,
          });
        } catch (error) {
          mutationError = error;
        }

        let afterAdd;
        if (mutationError) {
          const observation = await observeAmbiguousAdd({
            fetchAssignees,
            fetchArgs: { issueNumber, repo: cfg.repo },
            login: resolvedLogin,
          });
          if (observation.kind === 'indeterminate') {
            return {
              status: 'assignment-outcome-indeterminate',
              exitCode: 1,
              login: requestedLogin,
              message:
                `assignment mutation failed (${mutationError?.message || String(mutationError)}) ` +
                `and its postcondition is unreadable: ${observation.error}`,
            };
          }
          if (observation.kind === 'absent') {
            return {
              status: 'assignment-mutation-failed-no-change',
              exitCode: 1,
              login: requestedLogin,
              message:
                `assignment mutation failed and the assignee is confirmed absent: ` +
                `${mutationError?.message || String(mutationError)}`,
            };
          }
          afterAdd = observation.assignees;
          addProvenance = 'ambiguous';
        } else {
          addProvenance = 'confirmed';
          try {
            afterAdd = await readAssigneesWithRetry(fetchAssignees, {
              issueNumber,
              repo: cfg.repo,
            });
          } catch (error) {
            const compensationError = await safeCompensate({
              action: () =>
                mutateAssignee({
                  issueNumber,
                  repo: cfg.repo,
                  login: requestedLogin,
                  remove: true,
                }),
              fetchAssignees,
              fetchArgs: { issueNumber, repo: cfg.repo },
              login: resolvedLogin,
              shouldBePresent: false,
            });
            return {
              status: compensationError
                ? 'assignment-verification-failed-compensation-unverified'
                : 'assignment-verification-failed-compensated',
              exitCode: 1,
              login: requestedLogin,
              compensationError,
              message: `assignment could not be verified: ${error?.message || String(error)}`,
            };
          }
        }

        const addLanded = afterAdd.some((entry) => sameLogin(entry, resolvedLogin));
        if (!addLanded) {
          const compensationError = await safeCompensate({
            action: () =>
              mutateAssignee({
                issueNumber,
                repo: cfg.repo,
                login: requestedLogin,
                remove: true,
              }),
            fetchAssignees,
            fetchArgs: { issueNumber, repo: cfg.repo },
            login: resolvedLogin,
            shouldBePresent: false,
          });
          return {
            status: compensationError
              ? 'assignment-verification-failed-compensation-unverified'
              : 'assignment-verification-failed-compensated',
            exitCode: 1,
            login: requestedLogin,
            compensationError,
            message: `assignment could not be verified: GitHub did not report ${resolvedLogin}`,
          };
        }

        if (expectedUnassigned) {
          const foreignOwners = afterAdd.filter((entry) => !sameLogin(entry, resolvedLogin));
          if (foreignOwners.length > 0) {
            if (addProvenance === 'ambiguous') {
              return {
                status: 'claim-race-ambiguous-add-not-compensated',
                exitCode: 1,
                issueNumber,
                login: requestedLogin,
                state,
                assignees: foreignOwners,
                message:
                  `another owner appeared during a thrown assignment mutation; ` +
                  `mutation ownership is indeterminate and no destructive compensation was attempted`,
              };
            }
            const compensationError = await safeCompensate({
              action: () =>
                mutateAssignee({
                  issueNumber,
                  repo: cfg.repo,
                  login: requestedLogin,
                  remove: true,
                }),
              fetchAssignees,
              fetchArgs: { issueNumber, repo: cfg.repo },
              login: resolvedLogin,
              shouldBePresent: false,
            });
            return {
              status: compensationError
                ? 'claim-race-compensation-unverified'
                : 'claim-refused-owner-present',
              exitCode: 1,
              issueNumber,
              login: requestedLogin,
              state,
              assignees: foreignOwners,
              compensationError,
              message: compensationError
                ? `another owner appeared during claim and removal of ${resolvedLogin} is unverified`
                : `claim refused because another owner appeared during assignment`,
            };
          }
        }
      }

      if (state === 'backlog') {
        const exitCode = await runMoveState({ issueNumber, target: 'assigned', cfg });
        if (exitCode !== 0) {
          const outcome = await inspectFailedMove({
            issueNumber,
            target: 'assigned',
            cfg,
            login: resolvedLogin,
            getLiveState,
            fetchAssignees,
            getAssignmentSnapshot,
          });
          if (outcome.landed) {
            return {
              status: 'assigned-move-incomplete',
              exitCode,
              issueNumber,
              login: requestedLogin,
              state: 'assigned',
              message:
                `assignment and Assigned Status landed, but move completion evidence failed ` +
                `with exit ${exitCode}${outcome.error ? `: ${outcome.error}` : ''}`,
            };
          }
          if (outcome.indeterminate) {
            return {
              status: 'move-outcome-indeterminate',
              exitCode,
              issueNumber,
              login: requestedLogin,
              state: outcome.state,
              message:
                `assignment succeeded but Backlog → Assigned outcome is indeterminate after exit ` +
                `${exitCode}: ${outcome.error}`,
            };
          }
          if (addProvenance === 'ambiguous') {
            return {
              status: 'move-failed-ambiguous-add-not-compensated',
              exitCode,
              issueNumber,
              login: requestedLogin,
              state: outcome.state,
              assignees: outcome.assignees,
              message:
                `Backlog → Assigned failed with exit ${exitCode}; assignment mutation ownership ` +
                `is indeterminate, so no destructive compensation was attempted`,
            };
          }
          const compensationError =
            addProvenance !== 'confirmed'
              ? null
              : await safeCompensate({
                  action: () =>
                    mutateAssignee({
                      issueNumber,
                      repo: cfg.repo,
                      login: requestedLogin,
                      remove: true,
                    }),
                  fetchAssignees,
                  fetchArgs: { issueNumber, repo: cfg.repo },
                  login: resolvedLogin,
                  shouldBePresent: false,
                });
          return {
            status:
              addProvenance !== 'confirmed'
                ? 'move-failed'
                : compensationError
                  ? 'move-failed-compensation-unverified'
                  : 'move-failed-compensated',
            exitCode,
            login: requestedLogin,
            compensationError,
            message: `assignment succeeded but Backlog → Assigned failed with exit ${exitCode}`,
          };
        }
      }

      return {
        status: alreadyPresent && state !== 'backlog' ? 'already-assigned' : 'assigned',
        issueNumber,
        login: requestedLogin,
        state: state === 'backlog' ? 'assigned' : state,
      };
    }

    if (!alreadyPresent) {
      return { status: 'already-unassigned', issueNumber, login: requestedLogin, state };
    }

    const removesFinalAssigned = state === 'assigned' && before.length === 1;
    let incompleteMoveExit = null;
    if (removesFinalAssigned) {
      const demoteExit = await runMoveState({
        issueNumber,
        target: 'backlog',
        reason: 'Assigned invariant: final assignee removal requires Assigned → Backlog',
        cfg,
      });
      if (demoteExit !== 0) {
        const outcome = await inspectFailedMove({
          issueNumber,
          target: 'backlog',
          cfg,
          login: resolvedLogin,
          getLiveState,
          fetchAssignees,
          getAssignmentSnapshot,
        });
        if (outcome.indeterminate) {
          return {
            status: 'demote-outcome-indeterminate',
            exitCode: demoteExit,
            login: requestedLogin,
            message:
              `refusing to remove the final Assigned assignee because demotion outcome is ` +
              `indeterminate: ${outcome.error}`,
          };
        }
        if (!outcome.landed) {
          return {
            status: 'demote-failed',
            exitCode: demoteExit,
            login: requestedLogin,
            message: `refusing to remove the final Assigned assignee because demotion failed`,
          };
        }
        incompleteMoveExit = demoteExit;
      }
    }

    try {
      await mutateAssignee({
        issueNumber,
        repo: cfg.repo,
        login: requestedLogin,
        remove: true,
      });
    } catch (error) {
      if (!removesFinalAssigned) throw error;
      const restoration = await restoreAssignedAndVerify({
        issueNumber,
        cfg,
        runMoveState,
        getLiveState,
        fetchAssignees,
        getAssignmentSnapshot,
      });
      return {
        status:
          restoration.kind === 'restored'
            ? 'remove-failed-restored'
            : restoration.kind === 'restored-move-incomplete'
              ? 'remove-failed-restored-move-incomplete'
              : restoration.kind === 'indeterminate'
                ? 'remove-failed-restore-indeterminate'
                : 'remove-failed-restore-failed',
        exitCode: restoration.kind === 'restored' ? 1 : restoration.restoreExit || 1,
        login: requestedLogin,
        restoreExit: restoration.restoreExit,
        state: restoration.state,
        message:
          `assignee removal failed after demotion: ${error?.message || String(error)}` +
          (restoration.error ? `; restoration is indeterminate: ${restoration.error}` : ''),
      };
    }

    if (removesFinalAssigned) {
      const finalObservation = await observeFinalRemovalPostcondition({
        issueNumber,
        cfg,
        getLiveState,
        fetchAssignees,
        getAssignmentSnapshot,
      });

      if (finalObservation.kind === 'owner-present') {
        const removedLoginRemains = finalObservation.assignees.some((entry) =>
          sameLogin(entry, resolvedLogin)
        );
        if (finalObservation.state === 'assigned' && finalObservation.assigneesAfter?.length > 0) {
          return {
            status: removedLoginRemains
              ? 'remove-verification-failed-restored'
              : 'unassigned-owner-remains-assigned',
            ...(removedLoginRemains ? { exitCode: 1 } : {}),
            issueNumber,
            login: requestedLogin,
            state: 'assigned',
            assignees: finalObservation.assignees,
          };
        }

        const restoration = await restoreAssignedAndVerify({
          issueNumber,
          cfg,
          runMoveState,
          getLiveState,
          fetchAssignees,
          getAssignmentSnapshot,
        });
        const statusBase = removedLoginRemains ? 'remove-verification-failed' : 'owner-remains';
        return {
          status:
            restoration.kind === 'restored'
              ? removedLoginRemains
                ? 'remove-verification-failed-restored'
                : 'unassigned-owner-remains-restored'
              : restoration.kind === 'restored-move-incomplete'
                ? `${statusBase}-restored-move-incomplete`
                : restoration.kind === 'indeterminate'
                  ? `${statusBase}-restore-indeterminate`
                  : `${statusBase}-restore-failed`,
          exitCode: restoration.kind === 'restored' ? 1 : restoration.restoreExit || 1,
          issueNumber,
          login: requestedLogin,
          restoreExit: restoration.restoreExit,
          state: restoration.state,
          assignees: restoration.assignees || finalObservation.assignees,
          message:
            `${removedLoginRemains ? `GitHub still reports ${resolvedLogin}` : 'replacement owner remains'} after removal` +
            (restoration.error ? `; restoration is indeterminate: ${restoration.error}` : ''),
        };
      }

      if (finalObservation.kind === 'indeterminate') {
        if (finalObservation.readFailed) {
          const restoration = await restoreAssignedAndVerify({
            issueNumber,
            cfg,
            runMoveState,
            getLiveState,
            fetchAssignees,
            getAssignmentSnapshot,
          });
          return {
            status:
              restoration.kind === 'restored'
                ? 'remove-verification-failed-restored'
                : restoration.kind === 'restored-move-incomplete'
                  ? 'remove-verification-failed-restored-move-incomplete'
                  : restoration.kind === 'indeterminate'
                    ? 'remove-verification-failed-restore-indeterminate'
                    : 'remove-verification-failed-restore-failed',
            exitCode: restoration.kind === 'restored' ? 1 : restoration.restoreExit || 1,
            login: requestedLogin,
            restoreExit: restoration.restoreExit,
            state: restoration.state,
            message:
              `assignee removal could not be verified: ${finalObservation.error}` +
              (restoration.error ? `; restoration is indeterminate: ${restoration.error}` : ''),
          };
        }
        return {
          status: 'remove-outcome-indeterminate',
          exitCode: incompleteMoveExit || 1,
          login: requestedLogin,
          state: finalObservation.state,
          assignees: finalObservation.assignees,
          message: `assignee removal landed but its paired postcondition is indeterminate: ${finalObservation.error}`,
        };
      }
    } else {
      let afterRemove;
      try {
        afterRemove = await readAssigneesWithRetry(fetchAssignees, {
          issueNumber,
          repo: cfg.repo,
        });
      } catch (error) {
        return {
          status: 'error',
          exitCode: 1,
          message: `assignee removal could not be verified: ${error?.message || String(error)}`,
        };
      }
      if (afterRemove.some((entry) => sameLogin(entry, resolvedLogin))) {
        return {
          status: 'error',
          exitCode: 1,
          message: `GitHub still reports ${resolvedLogin} after removal`,
        };
      }
    }
    return {
      status: incompleteMoveExit == null ? 'unassigned' : 'unassigned-move-incomplete',
      issueNumber,
      login: requestedLogin,
      state: removesFinalAssigned ? 'backlog' : state,
      ...(incompleteMoveExit == null
        ? {}
        : {
            exitCode: incompleteMoveExit,
            message:
              `Backlog Status and assignee removal landed, but move completion evidence failed ` +
              `with exit ${incompleteMoveExit}`,
          }),
    };
  } catch (error) {
    return { status: 'error', exitCode: 1, message: error?.message || String(error) };
  }
}

export async function runInvariantAwareClaim({ issueNumber, cfg, deps = {} } = {}) {
  const fetchAssignees = deps.fetchAssignees || fetchAssignedInvariantAssignees;
  const lock = deps.withIssueLock || withIssueLock;
  const runAssignFn = deps.runAssign || runAssign;
  return lock(
    { issue: issueNumber, verb: 'full-auto-claim', projDir: deps.projDir || getProjectDir() },
    async () => {
      const before = parseAssigneeLogins(await fetchAssignees({ issueNumber, repo: cfg.repo }));
      if (before.length > 0) {
        return { ok: false, kind: 'already-assigned', assignees: before };
      }
      const result = await runAssignFn({
        issueNumber,
        login: '@me',
        expectedUnassigned: true,
        cfg,
        deps,
      });
      if (result.status === 'claim-refused-owner-present') {
        return { ok: false, kind: 'already-assigned', assignees: result.assignees };
      }
      if (result.status === 'assigned' || result.status === 'already-assigned') {
        return { ok: true, claimed: true, state: result.state, login: result.login };
      }
      return {
        ok: false,
        kind: result.status,
        assignees: result.assignees || [],
        exitCode: result.exitCode || 1,
        message: result.message,
      };
    }
  );
}

export function parseArgs(rest = []) {
  const argv = rest.map(String);
  let removeCount = 0;
  let assigneeCount = 0;
  for (const token of argv) {
    if (token === '--remove') removeCount += 1;
    if (token === '--assignee' || token.startsWith('--assignee=')) assigneeCount += 1;
  }
  if (removeCount > 1) throw new StrictArgvError('assign: duplicate --remove');
  if (assigneeCount > 1) throw new StrictArgvError('assign: duplicate --assignee');

  const parsed = parseStrict(argv, {
    flags: ['--remove'],
    options: ['--assignee'],
    positionals: { min: 1, max: 2 },
    allowHelp: false,
  });
  const issueMatch = String(parsed.positionals[0]).match(/^#?(\d+)$/);
  if (!issueMatch || Number(issueMatch[1]) <= 0) {
    throw new StrictArgvError('assign: issue# must be a positive integer');
  }
  const positionalLogin = parsed.positionals[1] ?? null;
  const flaggedLogin = parsed.values['--assignee'] ?? null;
  if (assigneeCount > 0 && !String(flaggedLogin ?? '').trim()) {
    throw new StrictArgvError('assign: --assignee requires a non-empty login');
  }
  if (positionalLogin && flaggedLogin) {
    throw new StrictArgvError('assign: positional login conflicts with --assignee');
  }
  const login = flaggedLogin || positionalLogin;
  if (login && (String(login).startsWith('-') || /^#?\d+$/.test(String(login)))) {
    throw new StrictArgvError(`assign: invalid assignee login: ${login}`);
  }
  return {
    issueNumber: Number(issueMatch[1]),
    login: login ? String(login) : null,
    remove: parsed.values['--remove'] === true,
  };
}

export async function verbAssign(rest, cfg, deps = {}) {
  const writeErr = deps.err || ((message) => process.stderr.write(message));
  const writeOut = deps.out || ((message) => process.stdout.write(message));
  const exit = deps.exit || process.exit;
  const lock = deps.withIssueLock || withIssueLock;
  const usage = 'Usage: /task assign #N [<login>|--assignee <login>] [--remove]\n';
  let args;
  try {
    args = parseArgs(rest);
  } catch (error) {
    if (error instanceof StrictArgvError) {
      writeErr(`assign: ${error.message.replace(/^assign:\s*/, '')}\n${usage}`);
      exit(2);
      return;
    }
    throw error;
  }
  let result;
  try {
    result = await lock(
      {
        issue: args.issueNumber,
        verb: 'assign',
        projDir: deps.projDir || (deps.getProjectDir || getProjectDir)(),
      },
      () => runAssign({ ...args, cfg, deps })
    );
  } catch (error) {
    if (error instanceof IssueLockError) {
      writeErr(`⛔ ${error.message}\n`);
      exit(7);
      return;
    }
    writeErr(`assign: ${error?.message || String(error)}\n`);
    exit(1);
    return;
  }
  if (
    [
      'assigned',
      'already-assigned',
      'unassigned',
      'already-unassigned',
      'unassigned-owner-remains-assigned',
      'unassigned-owner-remains-restored',
    ].includes(result.status)
  ) {
    writeOut(`✓ #${args.issueNumber} ${result.status}: ${result.login} (${result.state})\n`);
    return;
  }
  writeErr(`assign: ${result.message || result.status}\n`);
  if (result.compensationError) {
    writeErr(`assign: compensation failed: ${result.compensationError}\n`);
  }
  exit(result.exitCode || 1);
}
