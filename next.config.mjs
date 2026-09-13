/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  // chromadb (AI Hub vector DB client) has a dynamic `await import(...)` for
  // an optional default-embedding-function package we never use (we always
  // supply our own embeddings via embed_text()) — webpack's static bundler
  // tries to resolve/bundle it anyway and breaks. Opting the package out of
  // Server Components bundling makes Next.js use plain Node `require()` for
  // it instead, which only evaluates that branch if actually called.
  serverExternalPackages: ['chromadb'],
};

export default nextConfig;
