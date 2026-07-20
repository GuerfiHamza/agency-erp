import { serverEnv } from '@/config/env';
import { logger } from '@/lib/logger';

/**
 * Email transport.
 *
 * An interface with two real implementations rather than a stub: the console
 * transport is not a placeholder, it is the correct behaviour for an
 * environment with no mail provider — the message is still fully rendered and
 * the link is still usable, it just goes to the log instead of an inbox.
 *
 * Production cannot reach the console transport: `validateEnv` refuses to boot
 * without `RESEND_API_KEY`, because silently logging password-reset links
 * instead of sending them is a failure nobody would notice.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Rendered HTML body. */
  html: string;
  /** Plain-text fallback. Always send one — some clients refuse HTML-only mail. */
  text: string;
}

export interface EmailTransport {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/**
 * Development transport: renders the message to the log.
 *
 * The full text body is printed so a reset or verification link can be copied
 * straight out of the terminal.
 */
class ConsoleTransport implements EmailTransport {
  readonly name = 'console';

  async send(message: EmailMessage): Promise<void> {
    logger.info('Email (console transport — not actually sent)', {
      to: message.to,
      subject: message.subject,
      // The text body carries the link; HTML would be unreadable in a log.
      body: message.text,
    });
  }
}

/** Production transport. */
class ResendTransport implements EmailTransport {
  readonly name = 'resend';

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    // Imported lazily so the SDK is not pulled into environments that never
    // send mail, and so a missing optional dependency cannot break startup.
    const { Resend } = await import('resend');
    const resend = new Resend(this.apiKey);

    const { error } = await resend.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (error) {
      // Surface as a thrown error so callers decide what a failed send means.
      // For verification mail it is fatal; for a notification it may not be.
      throw new Error(`Resend rejected the message: ${error.message}`);
    }
  }
}

let cached: EmailTransport | undefined;

/**
 * The transport for this environment. Resolved once and reused.
 *
 * Chosen by configuration, not by an environment check: if a developer sets a
 * real key locally, they get real mail. `NODE_ENV` never appears here.
 */
export function getEmailTransport(): EmailTransport {
  if (cached) return cached;

  const apiKey = serverEnv.RESEND_API_KEY;
  const from = serverEnv.EMAIL_FROM;

  if (apiKey && from) {
    cached = new ResendTransport(apiKey, from);
  } else {
    logger.warn('No RESEND_API_KEY/EMAIL_FROM — emails will be logged, not sent.');
    cached = new ConsoleTransport();
  }

  return cached;
}

/** Test seam: lets a test swap in a recording transport. */
export function setEmailTransport(transport: EmailTransport | undefined): void {
  cached = transport;
}
