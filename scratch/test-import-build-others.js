const path = require('path');
const nextDir = path.resolve(__dirname, '../node_modules/next/dist/build');

function req(file) {
  console.log(`Loading ${file}...`);
  require(path.resolve(nextDir, file));
}

req('collect-build-traces');
req('generate-routes-manifest');
req('type-check');
req('webpack-build');
req('turbopack-build');

console.log('All build other deps imports completed!');
process.exit(0);
