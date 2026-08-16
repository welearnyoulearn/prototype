const path = require('path');
const nextDir = path.resolve(__dirname, '../node_modules/next/dist');

function req(relPath) {
  console.log(`Loading ${relPath}...`);
  require(path.join(nextDir, relPath));
}

req('lib/setup-exception-listeners');
req('lib/worker');
req('server/config-shared');
req('lib/constants');
req('lib/find-pages-dir');
req('lib/load-custom-routes');
req('server/config');
req('server/require');
req('server/ci-info');
req('build/turborepo-access-trace');
req('telemetry/events');
req('telemetry/storage');
req('build/entries');
req('build/sort-by-page-exts');
req('build/get-static-info-including-layouts');
req('build/generate-build-id');
req('build/is-writeable');
req('build/output/log');
req('build/spinner');
req('trace');
req('build/utils');
req('build/write-build-id');
req('build/swc');
req('build/swc/install-bindings');
req('build/webpack-build');
req('build/build-context');
req('build/type-check');
req('build/collect-build-traces');
req('build/manifests/formatter/format-manifest');
req('diagnostics/build-diagnostics');
req('server/lib/app-info-log');
req('export/utils');
req('lib/memory/trace');
req('server/app-render/encryption-utils-server');
req('trace/upload-trace');
req('server/lib/experimental/ppr');
req('lib/fallback');
req('build/rendering-mode');
req('build/turbopack-build');
req('build/duration-to-string');
req('build/after-production-compile');
req('build/preview-key-utils');
req('build/adapter/build-complete');
req('build/lockfile');
req('build/generate-routes-manifest');
req('build/validate-app-paths');

console.log('All nested imports completed!');
process.exit(0);
