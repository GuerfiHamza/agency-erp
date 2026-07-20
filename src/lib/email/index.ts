import { logger } from '@/lib/logger';

import { getEmailTransport, type EmailMessage } from './transport';

export type { EmailMessage, EmailTransport } from './transport';
export { setEmailTransport } from './transport';
export * from './templates';

/**
 * The email entry point. Everything that sends mail goes through here.
 *
 * Logs every send with the recipient and subject — never the body, which
 * contains reset links and is exactly the kind of thing that should not sit in
 * a log aggregator forever.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const transport = getEmailTransport();

  try {
    await transport.send(message);
    logger.info('Email sent', { to: message.to, subject: message.subject, transport: transport.name });
  } catch (error) {
    logger.error('Email send failed', { to: message.to, subject: message.subject, error });
    throw error;
  }
}
