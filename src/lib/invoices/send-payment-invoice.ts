import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY || '';
const resend = resendApiKey ? new Resend(resendApiKey) : null;

/** Own inbox that sends/receives Force Pulse payment receipts */
const RECEIPT_EMAIL =
  process.env.FORCE_PULSE_RECEIPT_EMAIL?.trim() || 'forcepulse.info@gmail.com';

const FROM =
  process.env.RESEND_FROM_EMAIL?.trim() ||
  'Force Pulse <onboarding@resend.dev>';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function collectEmails(players: Array<Record<string, unknown>> | undefined, extra?: unknown) {
  const set = new Set<string>();
  set.add(RECEIPT_EMAIL.toLowerCase());
  if (isEmail(extra)) set.add(extra.trim().toLowerCase());
  for (const p of players || []) {
    if (isEmail(p.email)) set.add(String(p.email).trim().toLowerCase());
  }
  return [...set];
}

function formatInr(amountPaise: number): string {
  const rupees = amountPaise / 100;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export type PaymentInvoiceInput = {
  tournamentName: string;
  amountPaise: number;
  currency?: string;
  paymentId: string | null;
  orderId?: string | null;
  teamName?: string | null;
  representative?: string | null;
  players?: Array<Record<string, unknown>>;
  /** Extra recipient (e.g. individual player email already on form) */
  recipientEmail?: string | null;
};

/**
 * Emails a Force Pulse payment receipt after paid registration.
 * Always includes forcepulse.info@gmail.com; also sends to player emails when present.
 */
export async function sendPaymentInvoice(
  input: PaymentInvoiceInput
): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  if (!resend) {
    return { sent: false, skipped: true, error: 'RESEND_API_KEY not configured' };
  }

  const to = collectEmails(input.players, input.recipientEmail);
  if (to.length === 0) {
    return { sent: false, skipped: true, error: 'No email addresses' };
  }

  const amountLabel =
    (input.currency || 'INR').toUpperCase() === 'INR'
      ? formatInr(input.amountPaise)
      : `${(input.amountPaise / 100).toFixed(2)} ${input.currency || ''}`;

  const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const playerLines = (input.players || [])
    .map((p) => {
      const name = typeof p.name === 'string' ? p.name.trim() : '';
      return name ? `<li>${escapeHtml(name)}</li>` : '';
    })
    .filter(Boolean)
    .join('');

  const subject = `Receipt – ${input.tournamentName} | Force Pulse`;
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h1 style="font-size:1.25rem;margin:0 0 0.5rem">Force Pulse</h1>
      <p style="margin:0 0 1.25rem;color:#64748b">Payment receipt / registration confirmation</p>
      <table style="width:100%;border-collapse:collapse;font-size:0.95rem">
        <tr><td style="padding:0.35rem 0;color:#64748b">Tournament</td>
            <td style="padding:0.35rem 0;text-align:right"><strong>${escapeHtml(input.tournamentName)}</strong></td></tr>
        ${
          input.teamName
            ? `<tr><td style="padding:0.35rem 0;color:#64748b">Team</td>
            <td style="padding:0.35rem 0;text-align:right">${escapeHtml(input.teamName)}</td></tr>`
            : ''
        }
        ${
          input.representative
            ? `<tr><td style="padding:0.35rem 0;color:#64748b">Representative</td>
            <td style="padding:0.35rem 0;text-align:right">${escapeHtml(input.representative)}</td></tr>`
            : ''
        }
        <tr><td style="padding:0.35rem 0;color:#64748b">Amount paid</td>
            <td style="padding:0.35rem 0;text-align:right"><strong>${escapeHtml(amountLabel)}</strong></td></tr>
        <tr><td style="padding:0.35rem 0;color:#64748b">Payment ID</td>
            <td style="padding:0.35rem 0;text-align:right">${escapeHtml(input.paymentId || '—')}</td></tr>
        ${
          input.orderId
            ? `<tr><td style="padding:0.35rem 0;color:#64748b">Order ID</td>
            <td style="padding:0.35rem 0;text-align:right">${escapeHtml(input.orderId)}</td></tr>`
            : ''
        }
        <tr><td style="padding:0.35rem 0;color:#64748b">Date</td>
            <td style="padding:0.35rem 0;text-align:right">${escapeHtml(when)} IST</td></tr>
      </table>
      ${
        playerLines
          ? `<p style="margin:1.25rem 0 0.35rem;color:#64748b">Players</p><ul style="margin:0;padding-left:1.2rem">${playerLines}</ul>`
          : ''
      }
      <p style="margin:1.5rem 0 0;font-size:0.85rem;color:#94a3b8">
        This is a confirmation from Force Pulse for your tournament registration payment.
        Questions? Reply to this email or write to ${escapeHtml(RECEIPT_EMAIL)}.
      </p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: FROM,
      to,
      replyTo: RECEIPT_EMAIL,
      subject,
      html,
    });
    return { sent: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send receipt email';
    console.error('[sendPaymentInvoice]', message);
    return { sent: false, error: message };
  }
}
