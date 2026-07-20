'use client';

import { RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';

/**
 * Client-side error boundary.
 *
 * A class component on purpose — `componentDidCatch` has no hook equivalent, so
 * this is one of the few places React still requires one.
 *
 * Scope matters: Next's `error.tsx` catches a whole route segment and replaces
 * the page. Wrap a widget in this instead when its failure should not take the
 * page down — a chart that throws should leave the rest of the dashboard usable.
 */
interface Props {
  children: ReactNode;
  /** Rendered instead of the default panel. Receives a retry callback. */
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode;
  /** Reported here; wire to telemetry when Phase 8 adds monitoring hooks. */
  onError?: (error: Error, info: ErrorInfo) => void;
  title?: string;
  description?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // console.error, not the app logger: this runs in the browser, where the
    // logger's server-side redaction and JSON output do not apply.
    console.error('Unhandled render error', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;

    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback({ error, reset: this.reset });
    }

    return (
      <ErrorState
        title={this.props.title ?? 'This section failed to load'}
        // Never `error.message`: it is written for developers and can carry
        // internals. The real error is in the console and, later, telemetry.
        description={this.props.description ?? 'The rest of the page still works. Try again.'}
        action={
          <Button variant="outline" size="sm" onClick={this.reset}>
            <RotateCcw aria-hidden />
            Try again
          </Button>
        }
      />
    );
  }
}
