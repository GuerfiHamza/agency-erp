import type { Metadata, Viewport } from 'next';
import { Geist_Mono, Inter } from 'next/font/google';

import { NuqsAdapter } from 'nuqs/adapters/next/app';

import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { APP_DESCRIPTION, APP_NAME } from '@/config/constants';

import './globals.css';

/** Inter carries display and body text in the mockup; Geist Mono covers numerics and code. */
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  icons: {
    icon: [
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  appleWebApp: {
    title: 'Neodott.',
  },
  // Internal, invite-only tool (see MEMORY's "Single-tenant lockdown") — there is
  // nothing here for a search engine to index, and nothing public sign-up would
  // want discoverable.
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: next-themes sets `class` on <html> before React
    // hydrates, which is an intentional server/client mismatch.
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${geistMono.variable} h-full`}>
      <body className="flex min-h-full flex-col antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {/* Lets table state live in the URL. Must wrap anything calling
              useQueryStates, so it sits at the root. */}
          <NuqsAdapter>{children}</NuqsAdapter>
          {/* Mounted once at the root so any client component can call toast(). */}
          <Toaster richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
