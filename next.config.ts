import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emit a minimal standalone server bundle for the production Docker image.
  output: 'standalone',

  // `pg` opens raw TCP sockets and must stay an external Node module rather than
  // be bundled. Turbopack is the default builder in Next 16.
  serverExternalPackages: ['pg'],

  // Compile-time checking of Link hrefs and router pushes against real routes.
  typedRoutes: true,
};

export default nextConfig;
