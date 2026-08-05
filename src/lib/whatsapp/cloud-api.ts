import { toWhatsAppE164, teamInviteWhatsAppMessage } from '@/lib/whatsapp-share';

export type WhatsAppSendResult =
  | { ok: true; mode: 'text' | 'template'; messageId?: string }
  | { ok: false; skipped?: boolean; error: string };

function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() &&
      process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  );
}

/**
 * Send a WhatsApp Cloud API message to the representative after team payment.
 * Requires WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID.
 *
 * Optional:
 * - WHATSAPP_TEMPLATE_NAME + WHATSAPP_TEMPLATE_LANG — preferred for production
 * - WHATSAPP_ALLOW_SESSION_TEXT=true — send free-form text (test / open session only)
 */
export async function sendTeamInviteWhatsApp(opts: {
  phone: string | null | undefined;
  teamName: string;
  tournamentName?: string;
  playerUrl: string;
  liveUrl: string;
  maxPlayers?: number | null;
}): Promise<WhatsAppSendResult> {
  if (!isWhatsAppConfigured()) {
    return {
      ok: false,
      skipped: true,
      error:
        'WhatsApp API not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.',
    };
  }

  const to = toWhatsAppE164(opts.phone);
  if (!to) {
    return { ok: false, error: 'Invalid representative WhatsApp number.' };
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN!.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!.trim();
  const apiVersion = process.env.WHATSAPP_API_VERSION?.trim() || 'v22.0';
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME?.trim();
  const templateLang = process.env.WHATSAPP_TEMPLATE_LANG?.trim() || 'en';
  const allowSessionText = process.env.WHATSAPP_ALLOW_SESSION_TEXT === 'true';

  const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  let body: Record<string, unknown>;
  let mode: 'text' | 'template';

  if (templateName) {
    mode = 'template';
    body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLang },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: opts.teamName.slice(0, 1024) },
              { type: 'text', text: opts.tournamentName || 'Tournament' },
              { type: 'text', text: opts.playerUrl.slice(0, 1024) },
              { type: 'text', text: opts.liveUrl.slice(0, 1024) },
            ],
          },
        ],
      },
    };
  } else if (allowSessionText) {
    mode = 'text';
    body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: true,
        body: teamInviteWhatsAppMessage(opts).slice(0, 4096),
      },
    };
  } else {
    return {
      ok: false,
      skipped: true,
      error:
        'Set WHATSAPP_TEMPLATE_NAME (production) or WHATSAPP_ALLOW_SESSION_TEXT=true (dev/test).',
    };
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };

    if (!res.ok) {
      const message =
        data?.error?.message || `WhatsApp API error (${res.status})`;
      console.error('[whatsapp/cloud-api]', message);
      return { ok: false, error: message };
    }

    return {
      ok: true,
      mode,
      messageId: data?.messages?.[0]?.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'WhatsApp send failed';
    console.error('[whatsapp/cloud-api]', message);
    return { ok: false, error: message };
  }
}

export function appOriginFromRequest(request: Request): string {
  const env =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/$/, '');

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`;

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'http';
  if (host) return `${proto}://${host}`.replace(/\/$/, '');

  return 'http://localhost:3000';
}
