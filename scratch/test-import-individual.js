const path = require('path');

console.log('1. Importing cpu-profile...');
require('../node_modules/next/dist/server/lib/cpu-profile');

console.log('2. Importing fs...');
require('fs');

console.log('3. Importing picocolors...');
require('../node_modules/next/dist/lib/picocolors');

console.log('4. Importing log...');
require('../node_modules/next/dist/build/output/log');

console.log('5. Importing utils...');
require('../node_modules/next/dist/server/lib/utils');

console.log('6. Importing is-error...');
require('../node_modules/next/dist/lib/is-error');

console.log('7. Importing get-project-dir...');
require('../node_modules/next/dist/lib/get-project-dir');

console.log('8. Importing memory/startup...');
require('../node_modules/next/dist/lib/memory/startup');

console.log('9. Importing memory/shutdown...');
require('../node_modules/next/dist/lib/memory/shutdown');

console.log('10. Importing bundler...');
require('../node_modules/next/dist/lib/bundler');

console.log('11. Importing resolve-build-paths...');
require('../node_modules/next/dist/lib/resolve-build-paths');

console.log('12. Importing build index...');
require('../node_modules/next/dist/build');

console.log('All imports completed successfully!');
process.exit(0);
