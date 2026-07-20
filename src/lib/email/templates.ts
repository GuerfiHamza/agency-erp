import { APP_NAME } from '@/config/constants';

import type { EmailMessage } from './transport';

/**
 * Transactional email templates.
 *
 * Hand-written HTML rather than a component library: mail clients support a
 * ~2005 subset of HTML, so tables and inline styles are the portable choice and
 * a React renderer would only produce the same markup with extra machinery.
 *
 * Every template returns a text body as well. It is not decoration — some
 * clients and gateways reject HTML-only mail, and the text part is what makes a
 * link copyable out of the console transport in development.
 */

/** Escape interpolated values. Names and emails end up inside markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface LayoutOptions {
  heading: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  footer: string;
}

/**
 * Shared shell.
 *
 * Inline styles only — Gmail strips `<style>` blocks. Colours are hard-coded
 * rather than taken from the design tokens because CSS custom properties do not
 * resolve in mail clients.
 */
function layout({ heading, body, actionLabel, actionUrl, footer }: LayoutOptions): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <tr><td>
        <h1 style="margin:0 0 16px;font-size:20px;color:#12131a;">${escapeHtml(heading)}</h1>
        <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#5f6270;">${escapeHtml(body)}</p>
        <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#FF6A00;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;">${escapeHtml(actionLabel)}</a>
        <p style="margin:24px 0 0;font-size:12px;line-height:18px;color:#8d90a0;">
          If the button doesn't work, copy this link into your browser:<br>
          <span style="color:#FF6A00;word-break:break-all;">${escapeHtml(actionUrl)}</span>
        </p>
        <p style="margin:24px 0 0;font-size:12px;color:#8d90a0;">${escapeHtml(footer)}</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function passwordResetEmail(params: {
  to: string;
  name: string;
  url: string;
  expiresInMinutes: number;
}): EmailMessage {
  const heading = 'Reset your password';
  const body = `Hi ${params.name}, we received a request to reset your ${APP_NAME} password. This link expires in ${params.expiresInMinutes} minutes.`;
  // Told plainly, because a user who did not request this needs to know that
  // ignoring the mail is sufficient — no action, no account change.
  const footer = "If you didn't request this, ignore this email. Your password will not change.";

  return {
    to: params.to,
    subject: `Reset your ${APP_NAME} password`,
    html: layout({ heading, body, actionLabel: 'Reset password', actionUrl: params.url, footer }),
    text: [heading, '', body, '', params.url, '', footer].join('\n'),
  };
}

export function invitationEmail(params: {
  to: string;
  companyName: string;
  inviterName: string;
  roleName: string;
  url: string;
  expiresInDays: number;
}): EmailMessage {
  const heading = `Join ${params.companyName} on ${APP_NAME}`;
  // Names the inviter and the role: an invitation that says only "you have been
  // invited" is indistinguishable from phishing, and the recipient has no way to
  // judge whether to accept.
  const body = `${params.inviterName} invited you to join ${params.companyName} as ${params.roleName}. Accept to choose a password and sign in. This invitation expires in ${params.expiresInDays} days.`;
  const footer = "If you weren't expecting this, ignore this email — no account is created until you accept.";

  return {
    to: params.to,
    subject: `${params.inviterName} invited you to ${params.companyName}`,
    html: layout({ heading, body, actionLabel: 'Accept invitation', actionUrl: params.url, footer }),
    text: [heading, '', body, '', params.url, '', footer].join('\n'),
  };
}

export function verifyEmailEmail(params: { to: string; name: string; url: string }): EmailMessage {
  const heading = 'Confirm your email';
  const body = `Hi ${params.name}, confirm this address to finish setting up your ${APP_NAME} account.`;
  const footer = "If you didn't create this account, ignore this email.";

  return {
    to: params.to,
    subject: `Confirm your ${APP_NAME} email`,
    html: layout({ heading, body, actionLabel: 'Confirm email', actionUrl: params.url, footer }),
    text: [heading, '', body, '', params.url, '', footer].join('\n'),
  };
}
