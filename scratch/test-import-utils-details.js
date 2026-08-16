const path = require('path');
const nextDir = path.resolve(__dirname, '../node_modules/next/dist');

function req(relPath) {
  console.log(`Loading ${relPath}...`);
  require(path.join(nextDir, relPath));
}

req('server/require-hook');
req('server/node-polyfill-crypto');
req('server/node-environment');
console.log('Finished top server requires.');

req('server/lib/experimental/ppr');
req('lib/load-custom-routes');
req('lib/constants');
req('server/lib/find-page-file');
req('lib/is-edge-runtime');
req('build/output/log');
req('server/load-components');
req('trace');
req('server/setup-http-agent-env');
req('server/web/sandbox');
req('server/route-kind');
req('build/segment-config/app/app-segments');
req('export/helpers/create-incremental-cache');
req('build/segment-config/app/collect-root-param-keys');
req('build/static-paths/app');
req('build/static-paths/pages');
req('build/output/format');

console.log('All imports completed!');
process.exit(0);
