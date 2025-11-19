/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: '/he', destination: '/' },
      { source: '/he/:path*', destination: '/:path*' },
    ]
  },
}

export default nextConfig
