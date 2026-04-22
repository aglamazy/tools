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

  async headers() {
    const indexableRoutes = ['/', '/about', '/contact', '/demo-form', '/form-filler', '/guide', '/pricing', '/terms']
    return [
      {
        source: '/sitemap.xml',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=3600, must-revalidate' },
          { key: 'Content-Type', value: 'application/xml; charset=utf-8' },
        ],
      },
      {
        source: '/robots.txt',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=3600, must-revalidate' },
        ],
      },
      ...indexableRoutes.map((route) => ({
        source: route,
        headers: [
          { key: 'X-Robots-Tag', value: 'index, follow' },
        ],
      })),
      {
        source: '/app/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]
  },
}

export default nextConfig
