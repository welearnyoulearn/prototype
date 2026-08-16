const path = require('path');
const nextDir = path.resolve(__dirname, '../node_modules/next/dist/build');

function req(file) {
  console.log(`Loading ${file}...`);
  require(path.resolve(nextDir, file));
}

req('webpack/plugins/next-trace-entrypoints-plugin');
req('../trace');
req('../server/require-hook');
req('next/dist/compiled/@vercel/nft');

console.log('All traces deps imports completed!');
process.exit(0);
