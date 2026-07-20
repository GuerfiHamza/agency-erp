import { isProduction } from '@/config/env';

/**
 * Structured logger.
 *
 * Emits JSON in production so log aggregators can parse it, and human-readable
 * lines in development. Deliberately built on `console` rather than a logging
 * dependency: Next.js captures console output on every runtime we target, and
 * the API below is small enough to swap later behind the same interface.
 */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Arbitrary structured fields attached to a log line. */
export type LogContext = Record<string, unknown>;

/**
 * Keys whose values are replaced with `[redacted]` before serialization, so a
 * careless `logger.info('...', user)` cannot leak credentials into logs.
 */
const REDACTED_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'secret',
  'apikey',
  'authorization',
  'cookie',
  'sessiontoken',
]);

const REDACTED = '[redacted]';

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redact(item, seen));

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      REDACTED_KEYS.has(key.toLowerCase()) ? REDACTED : redact(val, seen),
    ]),
  );
}

function resolveLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL;
  return LOG_LEVELS.includes(raw as LogLevel) ? (raw as LogLevel) : 'info';
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Derive a logger that stamps `context` onto every line (e.g. a request id). */
  child(context: LogContext): Logger;
}

function write(level: LogLevel, message: string, context: LogContext): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[resolveLevel()]) return;

  const safeContext = redact(context) as LogContext;
  const hasContext = Object.keys(safeContext).length > 0;

  // console.error for warn/error so they reach stderr; console.log otherwise.
  const sink = level === 'error' || level === 'warn' ? console.error : console.log;

  if (isProduction()) {
    sink(JSON.stringify({ level, message, time: new Date().toISOString(), ...safeContext }));
    return;
  }

  const prefix = `${level.toUpperCase().padEnd(5)} ${message}`;
  if (hasContext) sink(prefix, safeContext);
  else sink(prefix);
}

function createLogger(base: LogContext = {}): Logger {
  return {
    debug: (message, context) => write('debug', message, { ...base, ...context }),
    info: (message, context) => write('info', message, { ...base, ...context }),
    warn: (message, context) => write('warn', message, { ...base, ...context }),
    error: (message, context) => write('error', message, { ...base, ...context }),
    child: (context) => createLogger({ ...base, ...context }),
  };
}

export const logger: Logger = createLogger();
