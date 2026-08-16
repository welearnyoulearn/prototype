const path = require('path');
const dir = path.resolve(__dirname, '..');

console.log('1. Loading cpu-profile...');
require('../node_modules/next/dist/server/lib/cpu-profile');

console.log('2. Loading get-network-host...');
require('../node_modules/next/dist/lib/get-network-host');

console.log('3. Loading next...');
require('../node_modules/next/dist/server/next');

console.log('4. Loading require-hook...');
require('../node_modules/next/dist/server/require-hook');

console.log('5. Loading @next/env...');
const { loadEnvConfig } = require('@next/env');
console.log('   Running loadEnvConfig...');
loadEnvConfig(dir, true, console, false);

console.log('6. Loading next/dist/server/config...');
const loadConfig = require('../node_modules/next/dist/server/config').default;
console.log('   Running loadConfig...');
loadConfig('phase-development-server', dir, { silent: false }).then(config => {
  console.log('   Config loaded successfully:', config.distDir);
  process.exit(0);
}).catch(err => {
  console.error('Error loading config:', err);
  process.exit(1);
});
