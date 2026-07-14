// Razorpay webhook receiver (Supabase Edge Function).
//
// Razorpay POSTs payment events here. We verify the HMAC-SHA256 signature with
// the shared webhook secret, then mark the matching payment_orders row as `paid`
// and ask the Next.js app to auto-complete any pending registration for that order.
//
// Deploy:  supabase functions deploy razorpay-webhook --no-verify-jwt
// Secrets: supabase secrets set RAZORPAY_WEBHOOK_SECRET=...
//          supabase secrets set APP_URL=https://your-domain.com
//          supabase secrets set INTERNAL_COMPLETE_SECRET=<same as Vercel env>
//
// `--no-verify-jwt` is required: Razorpay does not send a Supabase auth token —
// authenticity is established by the signature check below instead.

import { createClient } from "npm:@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
const INTERNAL_COMPLETE_SECRET = Deno.env.get("INTERNAL_COMPLETE_SECRET") ?? "";

const encoder = new TextEncoder();

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!WEBHOOK_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("razorpay-webhook is missing required environment variables.");
    return new Response("Server not configured", { status: 500 });
  }

  // Signature is computed over the EXACT raw body — read it as text first.
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const expected = await hmacSha256Hex(WEBHOOK_SECRET, rawBody);

  if (!signature || !timingSafeEqual(signature, expected)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    if (event?.event === "payment.captured") {
      const payment = event?.payload?.payment?.entity ?? {};
      const orderId: string | undefined = payment.order_id;
      const paymentId: string | null = payment.id ?? null;

      if (orderId) {
        const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // Only promote `created` -> `paid`. If the order is already `consumed`
        // (registration finished first), we must NOT overwrite that state.
        const { error } = await supabase
          .from("payment_orders")
          .update({
            status: "paid",
            razorpay_payment_id: paymentId,
            paid_at: new Date().toISOString(),
          })
          .eq("razorpay_order_id", orderId)
          .eq("status", "created");

        if (error) {
          console.error("Failed to mark payment order paid:", error.message);
          // Return 500 so Razorpay retries later.
          return new Response("DB update failed", { status: 500 });
        }

        // Auto-complete registration from any pending form payload saved before pay.
        // Failures are logged; the order stays `paid` and surfaces in orphan admin.
        if (APP_URL && INTERNAL_COMPLETE_SECRET) {
          try {
            const completeRes = await fetch(
              `${APP_URL}/api/internal/complete-registration`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-internal-secret": INTERNAL_COMPLETE_SECRET,
                },
                body: JSON.stringify({
                  razorpayOrderId: orderId,
                  razorpayPaymentId: paymentId,
                }),
              },
            );
            if (!completeRes.ok) {
              const text = await completeRes.text();
              console.error(
                "complete-registration returned",
                completeRes.status,
                text.slice(0, 300),
              );
            }
          } catch (completeErr) {
            console.error("complete-registration call failed:", completeErr);
          }
        } else {
          console.warn(
            "APP_URL / INTERNAL_COMPLETE_SECRET not set — skipping auto-complete",
          );
        }
      }
    }

    // Acknowledge all verified events (including ones we don't act on) so
    // Razorpay stops retrying them.
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("razorpay-webhook error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
