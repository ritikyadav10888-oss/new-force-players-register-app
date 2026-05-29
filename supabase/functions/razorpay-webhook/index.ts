// Razorpay webhook receiver (Supabase Edge Function).
//
// Razorpay POSTs payment events here. We verify the HMAC-SHA256 signature with
// the shared webhook secret, then mark the matching payment_orders row as `paid`
// so the reconciliation view can surface "charged but not registered" cases.
//
// Deploy:  supabase functions deploy razorpay-webhook --no-verify-jwt
// Secret:  supabase secrets set RAZORPAY_WEBHOOK_SECRET=<secret from Razorpay dashboard>
//
// `--no-verify-jwt` is required: Razorpay does not send a Supabase auth token —
// authenticity is established by the signature check below instead.

import { createClient } from "npm:@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
