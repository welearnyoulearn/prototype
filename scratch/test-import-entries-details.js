const path = require('path');
const nextDir = path.resolve(__dirname, '../node_modules/next/dist');

function req(relPath) {
  console.log(`Loading ${relPath}...`);
  require(path.join(nextDir, relPath));
}

req('lib/constants');
req('lib/is-api-route');
req('lib/is-edge-runtime');
req('shared/lib/constants');
req('build/utils');
req('build/analysis/get-page-static-info');
req('shared/lib/page-path/normalize-path-sep');
req('shared/lib/page-path/normalize-page-path');
req('shared/lib/router/utils/app-paths');
req('build/webpack/loaders/next-middleware-loader');
req('lib/is-app-route-route');
req('lib/metadata/get-metadata-route');
req('build/webpack/loaders/next-route-loader');
req('lib/is-internal-component');
req('lib/metadata/is-metadata-route');
req('server/route-kind');
req('build/webpack/loaders/utils');
req('build/normalize-catchall-routes');
req('lib/page-types');
req('lib/recursive-readdir');
req('shared/lib/segment');
req('shared/lib/page-path/ensure-leading-slash');
req('shared/lib/entry-constants');
req('build/get-static-info-including-layouts');

console.log('All entries imports completed!');
process.exit(0);
