import type { NextConfig } from 'next';

/**
 * Security headers applied to every response. Deliberately stops short of a
 * Content-Security-Policy: this app cannot be click-tested in the
 * extension-Chrome environment (see MEMORY), so a strict CSP risks silently
 * breaking hydration/fonts/inline styles with no way to catch it before it
 * reaches production. These headers carry no such risk — none of them change
 * what the page is allowed to load or run.
 */
const SECURITY_HEADERS = [
  // Served over HTTPS only in production (see MEMORY's auth architecture); a
  // browser ignores this header entirely on a plain HTTP response, so it's
  // safe to always send.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Superseded by CSP's frame-ancestors in theory, but there is no CSP here yet
  // (see above) — this is the real protection against clickjacking for now.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // This app never uses the camera, microphone, or geolocation — deny them
  // outright rather than leaving the default (allowed to same-origin).
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

const nextConfig: NextConfig = {
  // The standalone server bundle this repo actually ships: `npm run
  // start:standalone` runs it directly on the cPanel host. Also what a Docker
  // image would use, if one is ever built, but that's not this deployment.
  output: 'standalone',

  // `pg` opens raw TCP sockets and must stay an external Node module rather than
  // be bundled. Turbopack is the default builder in Next 16.
  serverExternalPackages: ['pg'],

  // Compile-time checking of Link hrefs and router pushes against real routes.
  typedRoutes: true,

  // Next's default; explicit so it reads as a deliberate choice rather than an
  // oversight. Safe to leave on even if the reverse proxy in front also
  // compresses — a second gzip pass on already-compressed bytes is a no-op,
  // not a double-compression bug.
  compress: true,

  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      {
        // The small set of icon/manifest files under `public/` that never
        // change without a deploy — a day-long cache trades a little staleness
        // after a rare favicon swap for fewer requests on every page load.
        source:
          '/:icon(favicon\\.ico|favicon\\.svg|favicon-96x96\\.png|apple-touch-icon\\.png|site\\.webmanifest|web-app-manifest-192x192\\.png|web-app-manifest-512x512\\.png)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
