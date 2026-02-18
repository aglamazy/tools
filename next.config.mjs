/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mark firebase-admin as external to avoid bundling issues
  serverExternalPackages: ['firebase-admin'],

  async rewrites() {
    return [
      { source: '/he', destination: '/' },
      { source: '/he/:path*', destination: '/:path*' },
    ]
  },
}

export default nextConfig
