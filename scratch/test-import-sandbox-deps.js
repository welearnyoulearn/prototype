const path = require('path');
const nextDir = path.resolve(__dirname, '../node_modules/next/dist/server/web/sandbox');

function req(file) {
  console.log(`Loading ${file}...`);
  require(path.resolve(nextDir, file));
}

req('context');
console.log('Finished context require');

req('../../body-streams');
req('../../after/builtin-request-context');
req('../../lib/router-utils/router-server-context');

console.log('All sandbox deps imports completed!');
process.exit(0);
