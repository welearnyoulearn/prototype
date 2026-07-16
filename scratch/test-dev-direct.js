const { nextDev } = require('../node_modules/next/dist/cli/next-dev.js');

console.log('Calling nextDev directly with Turbopack...');
nextDev({ port: 3000, hostname: '127.0.0.1', turbo: true }, 'default', process.cwd())
  .then(() => {
    console.log('nextDev resolved');
  })
  .catch(err => {
    console.error('nextDev error:', err);
  });
