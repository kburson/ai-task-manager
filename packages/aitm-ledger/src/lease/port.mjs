export class WorkLeaseStore {
  acquire() {
    throw new Error('WorkLeaseStore implementation must implement acquire');
  }

  renew() {
    throw new Error('WorkLeaseStore implementation must implement renew');
  }

  verify() {
    throw new Error('WorkLeaseStore implementation must implement verify');
  }

  switchLease() {
    throw new Error('WorkLeaseStore implementation must implement switchLease');
  }

  handoff() {
    throw new Error('WorkLeaseStore implementation must implement handoff');
  }

  release() {
    throw new Error('WorkLeaseStore implementation must implement release');
  }

  takeover() {
    throw new Error('WorkLeaseStore implementation must implement takeover');
  }

  observe() {
    throw new Error('WorkLeaseStore implementation must implement observe');
  }
}

export const WORK_LEASE_STORE_METHODS = Object.freeze([
  'acquire',
  'renew',
  'verify',
  'switchLease',
  'handoff',
  'release',
  'takeover',
  'observe',
]);

export function assertWorkLeaseStore(store) {
  for (const method of WORK_LEASE_STORE_METHODS) {
    if (typeof store?.[method] !== 'function') {
      throw new TypeError(`work-lease store must implement ${method}()`);
    }
  }
  return store;
}
