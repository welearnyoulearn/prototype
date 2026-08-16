console.log('1. Loading watchpack...');
require('../node_modules/next/dist/compiled/watchpack');

console.log('2. Loading log...');
require('../node_modules/next/dist/build/output/log');

console.log('3. Loading debug...');
require('../node_modules/next/dist/compiled/debug');

console.log('4. Loading utils...');
require('../node_modules/next/dist/server/lib/utils');

console.log('5. Loading format-hostname...');
require('../node_modules/next/dist/server/lib/format-hostname');

console.log('6. Loading router-server...');
require('../node_modules/next/dist/server/lib/router-server');

console.log('7. Loading constants...');
require('../node_modules/next/dist/shared/lib/constants');

console.log('8. Loading app-info-log...');
require('../node_modules/next/dist/server/lib/app-info-log');

console.log('9. Loading turbopack-warning...');
require('../node_modules/next/dist/lib/turbopack-warning');

console.log('10. Loading trace...');
require('../node_modules/next/dist/trace');

console.log('11. Loading is-ipv6...');
require('../node_modules/next/dist/server/lib/is-ipv6');

console.log('12. Loading async-callback-set...');
require('../node_modules/next/dist/server/lib/async-callback-set');

console.log('✅ All start-server dependencies loaded successfully!');
