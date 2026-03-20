/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@comms/ui', '@comms/types', '@comms/utils'],
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 2000,
        aggregateTimeout: 300,
        ignored: ['**/node_modules', '**/.git', '**/.next'],
      };
    }
    return config;
  },
  async rewrites() {
    return [
      { source: '/api/auth/:path*', destination: `${process.env.AUTH_SERVICE_URL || 'http://localhost:3001'}/auth/:path*` },
      { source: '/api/oauth/:path*', destination: `${process.env.AUTH_SERVICE_URL || 'http://localhost:3001'}/oauth/:path*` },
      { source: '/api/chat/:path*', destination: `${process.env.CHAT_SERVICE_URL || 'http://localhost:3002'}/:path*` },
      { source: '/api/calls/:path*', destination: `${process.env.CALL_SERVICE_URL || 'http://localhost:3003'}/calls/:path*` },
      { source: '/api/notifications/:path*', destination: `${process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004'}/notifications/:path*` },
      { source: '/api/files/:path*', destination: `${process.env.FILE_SERVICE_URL || 'http://localhost:3005'}/files/:path*` },
      { source: '/api/search/:path*', destination: `${process.env.SEARCH_SERVICE_URL || 'http://localhost:3006'}/search/:path*` },
      { source: '/api/calendar/:path*', destination: `${process.env.CALENDAR_SERVICE_URL || 'http://localhost:3007'}/api/v1/:path*` },
      { source: '/api/tasks/:path*', destination: `${process.env.TASK_SERVICE_URL || 'http://localhost:3008'}/tasks/:path*` },
      { source: '/api/bots/:path*', destination: `${process.env.BOT_SERVICE_URL || 'http://localhost:3009'}/:path*` },
      { source: '/api/integrations/:path*', destination: `${process.env.INTEGRATION_SERVICE_URL || 'http://localhost:3010'}/integrations/:path*` },
      { source: '/api/ai/:path*', destination: `${process.env.AI_SERVICE_URL || 'http://localhost:3011'}/ai/:path*` },
      { source: '/api/analytics/:path*', destination: `${process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3012'}/analytics/:path*` },
      { source: '/api/billing/:path*', destination: `${process.env.BILLING_SERVICE_URL || 'http://localhost:3013'}/billing/:path*` },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
    ],
  },
};

module.exports = nextConfig;
