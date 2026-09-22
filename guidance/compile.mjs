// @story #1674

/** Project a fully validated catalog into deterministic read-specific artifacts. */
export function compileGuidance(validation) {
  if (!validation || typeof validation.valid !== 'boolean') {
    throw new TypeError('compileGuidance requires a validation result');
  }
  if (!validation.valid) {
    return {
      agentIndex: null,
      humanCatalog: null,
      diagnostics: {
        schema: 'aitm.guidance-diagnostics/v1',
        source: validation.source,
        errors: validation.errors ?? [],
        warnings: validation.warnings ?? [],
      },
    };
  }
  const digests = new Map(
    validation.fingerprints.entryDigests.map(({ id, ...values }) => [id, values])
  );
  const agentById = Object.create(null);
  const humanById = Object.create(null);
  for (const entry of [...validation.entries].sort((a, b) => a.id.localeCompare(b.id))) {
    const fingerprints = digests.get(entry.id);
    agentById[entry.id] = {
      id: entry.id,
      revision: entry.revision,
      binds: entry.binds,
      instruction: entry.agent.instruction,
      agentDigest: fingerprints.agentDigest,
      entryDigest: fingerprints.entryDigest,
    };
    humanById[entry.id] = {
      id: entry.id,
      revision: entry.revision,
      ...entry.human,
      humanDigest: fingerprints.humanDigest,
      entryDigest: fingerprints.entryDigest,
    };
  }
  return {
    agentIndex: {
      schema: 'aitm.guidance-agent-index/v1',
      catalogDigest: validation.catalogDigest,
      byId: agentById,
    },
    humanCatalog: {
      schema: 'aitm.guidance-human-catalog/v1',
      catalogDigest: validation.catalogDigest,
      byId: humanById,
    },
    diagnostics: null,
  };
}
