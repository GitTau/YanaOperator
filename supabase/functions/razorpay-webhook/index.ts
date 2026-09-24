// ─────────────────────────────────────────────────────────────────────────────
// Supabase Edge Function: razorpay-webhook
// Purpose: Asynchronously captures 'payment.captured' & 'order.paid' webhooks.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

async function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(rawBody);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const generatedSignatureBuffer = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      messageData
    );

    const generatedHex = Array.from(new Uint8Array(generatedSignatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return generatedHex.toLowerCase() === signature.toLowerCase();
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return false;
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const signature = req.headers.get("x-razorpay-signature");
    const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
    const rawBody = await req.text();

    if (webhookSecret && signature) {
      const isValid = await verifyWebhookSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        return new Response("Invalid signature", { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;

    // Handle payment.captured or order.paid
    if (event === "payment.captured" || event === "order.paid") {
      const paymentEntity = payload.payload?.payment?.entity;
      if (paymentEntity) {
        const paymentId = paymentEntity.id;
        const orderId = paymentEntity.order_id;
        const amount = paymentEntity.amount / 100; // paise to rupees
        const bookingId = paymentEntity.notes?.booking_id;

        if (bookingId) {
          const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://kaoelfcaiegjjhyrrlak.supabase.co";
          const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
          const supabase = createClient(supabaseUrl, supabaseServiceKey);

          await supabase.rpc("record_razorpay_payment", {
            p_booking_id: bookingId,
            p_amount: amount,
            p_razorpay_order_id: orderId || null,
            p_razorpay_payment_id: paymentId,
            p_razorpay_signature: "WEBHOOK_VERIFIED",
            p_user_id: null
          });
        }
      }
    }

    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
