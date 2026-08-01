const path = require('path');

console.log('Loading is-error...');
require('../node_modules/next/dist/lib/is-error');

console.log('Loading nft...');
require('next/dist/compiled/@vercel/nft');

console.log('Loading shared/lib/constants...');
require('../node_modules/next/dist/shared/lib/constants');

console.log('Loading webpack...');
require('next/dist/compiled/webpack/webpack');

console.log('Loading webpack-config...');
require('../node_modules/next/dist/build/webpack-config');

console.log('Loading picomatch...');
require('next/dist/compiled/picomatch');

console.log('Loading get-module-build-info...');
require('../node_modules/next/dist/build/webpack/loaders/get-module-build-info');

console.log('Loading handle-externals...');
require('../node_modules/next/dist/build/handle-externals');

console.log('Loading is-metadata-route...');
require('../node_modules/next/dist/lib/metadata/is-metadata-route');

console.log('Loading utils...');
require('../node_modules/next/dist/build/webpack/utils');

console.log('All plugin deps imports completed successfully!');
process.exit(0);
