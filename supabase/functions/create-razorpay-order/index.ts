// ─────────────────────────────────────────────────────────────────────────────
// Supabase Edge Function: create-razorpay-order
// Purpose: Securely creates an order in Razorpay for Rider dues/deposit payment.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { booking_id, amount, customer_name, customer_phone } = await req.json();

    if (!booking_id || !amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid booking_id or amount." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const keyId = Deno.env.get("RAZORPAY_KEY_ID") || "rzp_test_517qFvVqF5Qv";
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

    const amountInPaise = Math.round(Number(amount) * 100);
    const receipt = `bkg_${String(booking_id).slice(-8)}`;

    // If keySecret is available, call official Razorpay API
    if (keySecret) {
      const auth = btoa(`${keyId}:${keySecret}`);
      const rpResponse = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: "INR",
          receipt: receipt,
          notes: {
            booking_id: booking_id,
            customer_name: customer_name || "",
            customer_phone: customer_phone || "",
            platform: "yana_rider_app"
          },
        }),
      });

      const orderData = await rpResponse.json();

      if (!rpResponse.ok) {
        throw new Error(orderData.error?.description || "Failed to create Razorpay order");
      }

      return new Response(
        JSON.stringify({
          order_id: orderData.id,
          amount: orderData.amount,
          currency: orderData.currency,
          key_id: keyId,
          receipt: receipt
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Development Test Mode fallback order format
      const mockOrderId = `order_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      return new Response(
        JSON.stringify({
          order_id: mockOrderId,
          amount: amountInPaise,
          currency: "INR",
          key_id: keyId,
          receipt: receipt,
          mode: "test"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
