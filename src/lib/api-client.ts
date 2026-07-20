import {
  InternalError,
  RateLimitError,
  toAppError,
  UnauthorizedError,
  type ErrorPayload,
} from '@/lib/errors';

/**
 * HTTP client for the few things Server Actions cannot do.
 *
 * Most data movement in this app is a Server Action or a server-side query, and
 * neither needs this. It exists for the exceptions: calling a third-party API
 * from the server, and the browser talking to a Route Handler where a Server
 * Action does not fit (streaming, file downloads).
 *
 * It does not wrap `fetch` for the sake of it. What it adds is the behaviour
 * every caller would otherwise reimplement — and get subtly wrong: a timeout,
 * retries that only fire when retrying is safe, and errors typed like the rest
 * of the app.
 */

export interface ApiClientOptions {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
  /** Attempts *after* the first. 0 disables retrying. */
  maxRetries?: number;
}

export interface RequestOptions extends Omit<RequestInit, 'body' | 'signal'> {
  /** Serialized as JSON unless it is a FormData/Blob/string. */
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  timeoutMs?: number;
  /** Override retry behaviour for this call. */
  retries?: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Only these are retried.
 *
 * A failed POST may well have been applied before the response was lost —
 * retrying it could double-charge a card or send an invoice twice. GET, PUT, and
 * DELETE are idempotent by contract, so repeating them is safe.
 */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

/** Transient by nature: worth another go. A 400 never is. */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class ApiClient {
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl?.replace(/\/$/, '') ?? '';
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? 2;
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = new URL(`${this.baseUrl}${path}`, this.baseUrl || 'http://localhost');

    for (const [key, value] of Object.entries(query ?? {})) {
      // Skipped rather than sent as "undefined", which is what a naive
      // String(value) would put in the query string.
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }

    return this.baseUrl ? url.toString() : `${url.pathname}${url.search}`;
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const { body, query, timeoutMs, retries, headers, ...rest } = options;

    const url = this.buildUrl(path, query);
    const maxAttempts = 1 + (retries ?? (IDEMPOTENT_METHODS.has(method) ? this.maxRetries : 0));

    const isRawBody =
      body instanceof FormData ||
      body instanceof Blob ||
      body instanceof ArrayBuffer ||
      typeof body === 'string';

    const requestHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...(headers as Record<string, string> | undefined),
    };

    // Let the browser set the multipart boundary; setting Content-Type by hand
    // for FormData produces a body the server cannot parse.
    if (body !== undefined && !isRawBody) {
      requestHeaders['Content-Type'] ??= 'application/json';
    }

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      // A fresh controller per attempt: an aborted signal stays aborted.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.timeoutMs);

      try {
        const response = await fetch(url, {
          ...rest,
          method,
          headers: requestHeaders,
          body: body === undefined ? undefined : isRawBody ? (body as BodyInit) : JSON.stringify(body),
          signal: controller.signal,
        });

        if (response.ok) {
          if (response.status === 204) return undefined as T;

          const contentType = response.headers.get('content-type') ?? '';
          return (
            contentType.includes('application/json') ? await response.json() : await response.text()
          ) as T;
        }

        const payload = await this.readErrorPayload(response);
        const error = new ApiError(response.status, this.messageFrom(payload, response), payload);

        if (attempt < maxAttempts && RETRYABLE_STATUSES.has(response.status)) {
          await sleep(this.backoffMs(attempt, response));
          lastError = error;
          continue;
        }

        throw error;
      } catch (error) {
        lastError = error;

        const isAbort = error instanceof DOMException && error.name === 'AbortError';
        const isNetwork = error instanceof TypeError;

        // A timeout or dropped connection is exactly what retrying is for — but
        // only where the method allows it.
        if (attempt < maxAttempts && (isAbort || isNetwork)) {
          await sleep(this.backoffMs(attempt));
          continue;
        }

        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError instanceof Error ? lastError : new InternalError('Request failed.');
  }

  /**
   * Exponential backoff with jitter.
   *
   * The jitter matters: without it, every client that failed together retries
   * together, and the thundering herd is what keeps a struggling service down.
   * A `Retry-After` header always wins — the server knows better than we do.
   */
  private backoffMs(attempt: number, response?: Response): number {
    const retryAfter = response?.headers.get('retry-after');

    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30_000);
    }

    const base = Math.min(2 ** (attempt - 1) * 250, 4_000);
    return base + Math.random() * 250;
  }

  private async readErrorPayload(response: Response): Promise<unknown> {
    try {
      const contentType = response.headers.get('content-type') ?? '';
      return contentType.includes('application/json') ? await response.json() : await response.text();
    } catch {
      // A body that will not parse must not mask the status code, which is the
      // useful part.
      return undefined;
    }
  }

  private messageFrom(payload: unknown, response: Response): string {
    if (payload && typeof payload === 'object' && 'error' in payload) {
      const { error } = payload as { error: unknown };
      if (typeof error === 'string') return error;
      if (error && typeof error === 'object' && 'message' in error) {
        return String((error as ErrorPayload).message);
      }
    }

    return `Request failed with status ${response.status}.`;
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, { ...options, body });
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, { ...options, body });
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }
}

/** Map an `ApiError` onto the app's error types, for use behind a service. */
export function toAppErrorFromApi(error: unknown): Error {
  if (error instanceof ApiError) {
    if (error.status === 401) return new UnauthorizedError();
    if (error.status === 429) return new RateLimitError();
    return new InternalError(`Upstream request failed (${error.status}).`, error);
  }

  return toAppError(error);
}

/** Client for this app's own Route Handlers, from the browser. */
export const apiClient = new ApiClient();
