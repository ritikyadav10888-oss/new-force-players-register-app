import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getServiceSupabase } from '@/lib/supabase/service';

const resendApiKey = process.env.RESEND_API_KEY || '';
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const WA_PHONE = process.env.CALLMEBOT_PHONE || '919321058356';
const WA_API_KEY = process.env.CALLMEBOT_API_KEY || '';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendWhatsApp(text: string) {
  if (!WA_API_KEY) {
    console.warn('CALLMEBOT_API_KEY not set — WhatsApp notification skipped.');
    return;
  }
  const encoded = encodeURIComponent(text);
  const url = `https://api.callmebot.com/whatsapp.php?phone=${WA_PHONE}&text=${encoded}&apikey=${WA_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn('WhatsApp send failed:', await res.text());
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim();
    const phone = String(body.phone ?? '').trim();
    const org = String(body.org ?? '').trim();
    const sport = String(body.sport ?? '').trim();
    const teams = String(body.teams ?? '').trim();
    const message = String(body.message ?? '').trim();

    if (!name || !email || !phone) {
      return NextResponse.json(
        { error: 'Name, Email, and Phone number are required fields.' },
        { status: 400 }
      );
    }

    const db = getServiceSupabase();
    const { error: dbError } = await db.from('contact_inquiries').insert([
      {
        name,
        email,
        phone,
        organizer: org,
        sport,
        expected_teams: teams,
        message,
      },
    ]);

    if (dbError) {
      console.warn('Supabase save failed:', dbError.message);
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safePhone = escapeHtml(phone);

    const waMessage = [
      `🏆 *New Inquiry - Force Sports Player Register*`,
      ``,
      `👤 *Name:* ${name}`,
      `📧 *Email:* ${email}`,
      `📱 *Phone:* ${phone}`,
      `🏢 *Organizer:* ${org || 'N/A'}`,
      `🎯 *Sport:* ${sport || 'N/A'}`,
      `👥 *Expected Teams:* ${teams || 'N/A'}`,
      message ? `\n💬 *Message:*\n${message}` : '',
      ``,
      `🕐 Received: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`,
    ]
      .filter(Boolean)
      .join('\n');

    sendWhatsApp(waMessage).catch((err) => console.warn('WhatsApp notification error:', err));

    if (resend) {
      const emailHtml = `
        <p><strong>Contact:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Phone:</strong> ${safePhone}</p>
        <p><strong>Message:</strong> ${escapeHtml(message)}</p>
      `;

      await resend.emails.send({
        from: 'Force Sports Player Register <onboarding@resend.dev>',
        to: ['ritikyadav10888@gmail.com'],
        replyTo: email,
        subject: `New Inquiry: ${name}`,
        html: emailHtml,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Your inquiry has been received. We will contact you within 24 hours!',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred.';
    console.error('Contact API error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
