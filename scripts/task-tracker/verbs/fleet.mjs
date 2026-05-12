import { findMainWorktreePath, fleetRegistryPath, readFleet } from '../fleet-registry.mjs';

export function verbFleet(ctx) {
  const { projectDir } = ctx;
  const mainPath = findMainWorktreePath(projectDir);
  const rPath = fleetRegistryPath(mainPath);
  const fleet = readFleet(rPath);
  const entries = Object.entries(fleet);
  if (entries.length === 0) {
    console.log('No fleet tasks registered.');
    return;
  }
  const now = Date.now();
  console.log(`Fleet: ${entries.length} task${entries.length === 1 ? '' : 's'}`);
  for (const [ref, info] of entries) {
    const ageMin = Math.round((now - new Date(info.startedAt).getTime()) / 60000);
    const age = ageMin >= 60 ? `${Math.floor(ageMin / 60)}h ${ageMin % 60}m` : `${ageMin}m`;
    console.log(
      `  ${ref.padEnd(6)} ${info.status.padEnd(8)} ${info.branch.padEnd(28)} started ${age} ago`
    );
  }
}
