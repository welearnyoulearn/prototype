const path = require('path');
const nextDir = path.resolve(__dirname, '../node_modules/next/dist/server/web/sandbox');

console.log('Loading ./sandbox...');
require(path.join(nextDir, 'sandbox'));

console.log('Loading ./context...');
require(path.join(nextDir, 'context'));

console.log('All sandbox imports completed!');
process.exit(0);
