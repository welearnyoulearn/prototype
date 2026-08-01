const path = require('path');
const nextDir = path.resolve(__dirname, '../node_modules/next/dist/export/helpers');

function req(file) {
  console.log(`Loading ${file}...`);
  require(path.resolve(nextDir, file));
}

req('../../server/lib/incremental-cache');
req('../../server/ci-info');
req('../../server/lib/node-fs-methods');
req('../../lib/interop-default');
req('../../lib/format-dynamic-import-path');
req('../../server/use-cache/handlers');

console.log('All cache deps imports completed!');
process.exit(0);
