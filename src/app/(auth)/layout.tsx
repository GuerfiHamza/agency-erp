import { APP_DESCRIPTION, APP_NAME } from '@/config/constants';

/**
 * Shell for the signed-out pages.
 *
 * No auth check here: layouts do not re-render on client-side navigation
 * (Partial Rendering), so a check would run once and then be skipped. Signed-out
 * gating is handled optimistically by `proxy.ts` and enforced per page.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-gutter">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{APP_DESCRIPTION}</p>
        </header>
        {children}
      </div>
    </main>
  );
}
