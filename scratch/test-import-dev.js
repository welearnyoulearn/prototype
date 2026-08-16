console.log('1. Importing next-dev.js...');
try {
  const mod = require('../node_modules/next/dist/cli/next-dev.js');
  console.log('✅ Import successful:', typeof mod.nextDev);
} catch (err) {
  console.error('❌ Import failed:', err);
}
