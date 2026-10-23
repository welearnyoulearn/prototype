/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  onDemandEntries: {
    // Keep compiled pages in memory longer so switching between portal
    // tabs during dev doesn't evict/recompile the shared webpack build
    // and force unrelated tabs to full-reload.
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 10,
  },
};

export default nextConfig;
