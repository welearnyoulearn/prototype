const { startServer } = require('../node_modules/next/dist/server/lib/start-server.js');

console.log('Calling startServer directly on port 3000...');
startServer({
  dir: process.cwd(),
  port: 3000,
  allowRetry: true,
  isDev: true,
  hostname: '127.0.0.1'
}).then(() => {
  console.log('startServer resolved');
}).catch(err => {
  console.error('startServer error:', err);
});
