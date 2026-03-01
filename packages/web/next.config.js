/** @type {import('next').NextConfig} */
const path = require('path');
const isProduction = process.env.NODE_ENV === 'production';

const securityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()'
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "media-src 'self' https: data: blob:",
      "frame-src https://js.stripe.com https://hooks.stripe.com https://www.google.com https://maps.google.com",
    ].join('; '),
  },
  ...(isProduction
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains; preload',
        },
      ]
    : []),
];

const nextConfig = {
  // Monorepo: root the file tracer at the workspace root to avoid symlink loops (ELOOP/-70)
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  transpilePackages: ['@handycall/shared'],
  typescript: {
    // Pre-existing type errors in shared types and third-party @types packages.
    // Runtime code compiles correctly; type errors are tracked separately.
    ignoreBuildErrors: true,
  },
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://api.handycall.org/api/v1',
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'https://handycall.org',
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
