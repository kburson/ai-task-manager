// @story #1872
// Explicit read-only legacy publication observation for existing unit fixtures.
export const legacyRankWavePorts = {
  rankWaveRuntime: {
    async readSnapshot() {
      return { children: [] };
    },
  },
  async inspectRankWavePublication() {
    return { status: 'legacy', snapshot: { children: [] } };
  },
};
