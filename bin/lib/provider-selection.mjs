export function parseProviderSelection(args, knownProviders) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--agent') continue;
    const raw = args[index + 1];
    if (!raw || raw.startsWith('--')) throw new Error('Missing value for --agent');
    values.push(
      ...raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    );
    index += 1;
  }
  if (values.length === 0 || values.includes('all')) {
    if (values.some((value) => value !== 'all')) throw new Error('--agent all cannot be mixed');
    return [...knownProviders];
  }
  const selected = [...new Set(values)];
  const unknown = selected.filter((value) => !knownProviders.includes(value));
  if (unknown.length) {
    throw new Error(`Unknown --agent ${unknown.join(', ')}; known: ${knownProviders.join(', ')}`);
  }
  return selected;
}
