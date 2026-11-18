import { insert, run, nowIso } from '../db.js';

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = req?.headers?.['x-forwarded-proto'] || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const host = req?.headers?.host || 'localhost:3000';
  return `${proto}://${host}`;
}

/**
 * Sends transactional email through Resend when configured. Without a provider the
 * message is stored in email_outbox so an administrator can deliver it manually.
 * We never pretend an email was delivered.
 */
export async function sendEmail({ to, subject, body, kind = 'transactional' }) {
  const createdAt = nowIso();
  const id = insert(
    'INSERT INTO email_outbox (to_email, subject, body, kind, status, created_at) VALUES (?,?,?,?,?,?)',
    [to, subject, body, kind, 'queued', createdAt]
  );

  if (!emailConfigured()) {
    run('UPDATE email_outbox SET status = ? WHERE id = ?', ['sin_proveedor', id]);
    return { delivered: false, reason: 'email_not_configured', outboxId: id };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'SKILLVERSE <no-reply@skillverse.app>',
        to: [to],
        subject,
        text: body,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      run('UPDATE email_outbox SET status = ? WHERE id = ?', ['fallido', id]);
      console.error('[email] provider error', response.status, detail.slice(0, 300));
      return { delivered: false, reason: 'provider_error', outboxId: id };
    }
    run('UPDATE email_outbox SET status = ? WHERE id = ?', ['enviado', id]);
    return { delivered: true, outboxId: id };
  } catch (error) {
    run('UPDATE email_outbox SET status = ? WHERE id = ?', ['fallido', id]);
    console.error('[email] network error', error.message);
    return { delivered: false, reason: 'provider_error', outboxId: id };
  }
}
