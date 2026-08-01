const { spawn } = require('child_process');

console.log('Spawning next dev...');
const child = spawn('./node_modules/.bin/next', ['dev', '--turbo'], {
  cwd: process.cwd(),
  env: { ...process.env, FORCE_COLOR: '1' }
});

child.stdout.on('data', (data) => {
  console.log(`[STDOUT] ${data.toString().trim()}`);
});

child.stderr.on('data', (data) => {
  console.error(`[STDERR] ${data.toString().trim()}`);
});

child.on('close', (code) => {
  console.log(`Child process exited with code ${code}`);
});

setTimeout(() => {
  console.log('Timeout reached. Killing child process...');
  child.kill();
  process.exit(0);
}, 15000);
