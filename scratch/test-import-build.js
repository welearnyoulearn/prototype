console.log('Starting import of next-build.js...');
import('../node_modules/next/dist/cli/next-build.js').then(() => {
  console.log('Imported next-build.js successfully!');
  process.exit(0);
}).catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
