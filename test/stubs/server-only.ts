/**
 * Stand-in for the `server-only` package under Vitest.
 *
 * The real package resolves to a module that throws unless the bundler applies
 * React's `react-server` condition, which Vitest does not. Aliasing it here lets
 * a test import the DAL and the services that guard themselves with it.
 *
 * This weakens nothing: `server-only` is a build-time guard against a module
 * reaching a client bundle. Vitest builds no client bundle, and `next build`
 * still resolves the real package.
 */

export {};
