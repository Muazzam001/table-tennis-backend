/**
 * Validates that vendored @shared modules resolve after sync.
 * Used by `npm run build` before deploy.
 */
const modules = [
  '@shared/tournament/index.js',
  '@shared/tournament/teamPairing.js',
  '@shared/tournament/scheduling.js',
  '@shared/tournament/competitionFormat.js',
];

for (const specifier of modules) {
  await import(specifier);
}

console.log('Backend build OK — shared modules verified');
