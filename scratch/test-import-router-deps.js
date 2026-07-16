const deps = [
  ['config', '../node_modules/next/dist/server/config'],
  ['serve-static', '../node_modules/next/dist/server/serve-static'],
  ['shared-utils', '../node_modules/next/dist/shared/lib/utils'],
  ['find-pages-dir', '../node_modules/next/dist/lib/find-pages-dir'],
  ['filesystem', '../node_modules/next/dist/server/lib/router-utils/filesystem'],
  ['proxy-request', '../node_modules/next/dist/server/lib/router-utils/proxy-request'],
  ['pipe-readable', '../node_modules/next/dist/server/pipe-readable'],
  ['resolve-routes', '../node_modules/next/dist/server/lib/router-utils/resolve-routes'],
  ['request-meta', '../node_modules/next/dist/server/request-meta'],
  ['path-has-prefix', '../node_modules/next/dist/shared/lib/router/utils/path-has-prefix'],
  ['remove-path-prefix', '../node_modules/next/dist/shared/lib/router/utils/remove-path-prefix'],
  ['next-request', '../node_modules/next/dist/server/web/spec-extension/adapters/next-request'],
  ['is-postpone', '../node_modules/next/dist/server/lib/router-utils/is-postpone'],
  ['parse-url', '../node_modules/next/dist/shared/lib/router/utils/parse-url'],
  ['redirect-status-code', '../node_modules/next/dist/client/components/redirect-status-code'],
  ['dev-bundler-service', '../node_modules/next/dist/server/lib/dev-bundler-service'],
  ['ensure-leading-slash', '../node_modules/next/dist/shared/lib/page-path/ensure-leading-slash'],
  ['get-next-pathname-info', '../node_modules/next/dist/shared/lib/router/utils/get-next-pathname-info'],
  ['get-hostname', '../node_modules/next/dist/shared/lib/get-hostname'],
  ['detect-domain-locale', '../node_modules/next/dist/shared/lib/i18n/detect-domain-locale'],
  ['mock-request', '../node_modules/next/dist/server/lib/mock-request'],
  ['hot-reloader-types', '../node_modules/next/dist/server/dev/hot-reloader-types'],
  ['normalized-asset-prefix', '../node_modules/next/dist/shared/lib/normalized-asset-prefix'],
  ['patch-fetch', '../node_modules/next/dist/server/lib/patch-fetch'],
  ['server-ipc-utils', '../node_modules/next/dist/server/lib/server-ipc/utils'],
  ['block-cross-site-dev', '../node_modules/next/dist/server/lib/router-utils/block-cross-site-dev'],
  ['no-fallback-error', '../node_modules/next/dist/shared/lib/no-fallback-error.external'],
  ['router-server-context', '../node_modules/next/dist/server/lib/router-utils/router-server-context'],
  ['chrome-devtools-workspace', '../node_modules/next/dist/server/lib/chrome-devtools-workspace'],
  ['config-shared', '../node_modules/next/dist/server/config-shared']
];

for (let i = 0; i < deps.length; i++) {
  const [name, path] = deps[i];
  console.log(`${i + 1}. Loading ${name} (${path})...`);
  require(path);
}

console.log('✅ All router-server dependencies loaded successfully!');
