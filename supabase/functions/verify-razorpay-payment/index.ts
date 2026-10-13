// ─────────────────────────────────────────────────────────────────────────────
// Supabase Edge Function: verify-razorpay-payment
// Purpose: Cryptographically verifies Razorpay payment signature & credits ledger.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function verifyHmacSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(`${orderId}|${paymentId}`);

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
    console.error("Signature verification error:", err);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      booking_id,
      amount,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      user_id
    } = await req.json();

    if (!booking_id || !Number.isFinite(Number(amount)) || Number(amount) <= 0 ||
        !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(
        JSON.stringify({ error: "Missing required verification fields." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!keyId || !keySecret || !supabaseServiceKey) {
      throw new Error("Payment verification is not configured");
    }

    const isValid = await verifyHmacSignature(
      razorpay_order_id, razorpay_payment_id, razorpay_signature, keySecret
    );
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: "Invalid payment signature. Verification failed." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // The checkout callback is client-controlled. Confirm the captured payment,
    // amount and booking against Razorpay before crediting the ledger.
    const authorization = `Basic ${btoa(`${keyId}:${keySecret}`)}`;
    const [paymentResponse, orderResponse] = await Promise.all([
      fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`, {
        headers: { Authorization: authorization },
      }),
      fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpay_order_id)}`, {
        headers: { Authorization: authorization },
      }),
    ]);
    if (!paymentResponse.ok || !orderResponse.ok) {
      throw new Error("Could not confirm payment with Razorpay");
    }
    const payment = await paymentResponse.json() as {
      id?: string; order_id?: string; amount?: number; currency?: string; status?: string;
    };
    const order = await orderResponse.json() as {
      id?: string; amount?: number; currency?: string; status?: string;
      notes?: { booking_id?: string };
    };
    const amountInPaise = Math.round(Number(amount) * 100);
    if (payment.id !== razorpay_payment_id || payment.order_id !== razorpay_order_id ||
        payment.status !== "captured" || payment.currency !== "INR" ||
        payment.amount !== amountInPaise || order.id !== razorpay_order_id ||
        order.status !== "paid" || order.currency !== "INR" ||
        order.amount !== amountInPaise || order.notes?.booking_id !== booking_id) {
      return new Response(
        JSON.stringify({ error: "Payment details do not match the booking." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://kaoelfcaiegjjhyrrlak.supabase.co";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call atomic record_razorpay_payment RPC
    const { data, error } = await supabase.rpc("record_razorpay_payment", {
      p_booking_id: booking_id,
      p_amount: Number(amount),
      p_razorpay_order_id: razorpay_order_id || null,
      p_razorpay_payment_id: razorpay_payment_id,
      p_razorpay_signature: razorpay_signature || null,
      p_user_id: user_id || null
    });

    if (error) {
      console.error("RPC Error:", error);
      throw new Error(`Ledger update failed: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Payment successfully verified and recorded.",
        data: data
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Payment verification failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
