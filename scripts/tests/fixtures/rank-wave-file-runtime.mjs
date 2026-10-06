// @story #1872
// Controlled publication ports; the admission lock and immutable store are real.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { withEpicAdmissionLock } from '../../task-tracker/lib/epic-admission-lock.mjs';
export function fileRankWaveRuntime({ file, projectDir, events = null }) {
  const read = () => JSON.parse(readFileSync(file, 'utf8'));
  const write = (value) => writeFileSync(file, JSON.stringify(value));
  return {
    recordingActor: 'test/fixture',
    withLock: (fn) => withEpicAdmissionLock({ projectDir, epic: 107 }, fn),
    async assertParent() {},
    async readSnapshot() {
      return read().snapshot;
    },
    async listRecords() {
      return read().comments;
    },
    async verifySource() {
      return { status: 'verified' };
    },
    async verifyBindings() {
      return { ok: true };
    },
    async reserveOperation(id) {
      const state = read();
      if (state.operations.includes(id)) return false;
      state.operations.push(id);
      write(state);
      return true;
    },
    async createRecord(wave) {
      if (events && wave.record.action === 'revoke') {
        appendFileSync(events, 'revoke:start\n');
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      const state = read(),
        comment = { commentNodeId: `C${state.comments.length + 1}`, wave };
      state.comments.push(comment);
      write(state);
      return comment;
    },
    async mutateBody(mutate) {
      const state = read();
      state.snapshot.body = await mutate(state.snapshot.body);
      write(state);
      if (events) appendFileSync(events, 'revoke:end\n');
      return state.snapshot.body;
    },
  };
}
