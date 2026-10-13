// ─────────────────────────────────────────────────────────────────────────────
// Supabase Edge Function: create-razorpay-order
// Purpose: Securely creates an order in Razorpay for Rider dues/deposit payment.
// The caller must be the signed-in rider (or staff) for this booking, and the
// amount may not exceed what the booking still owes (booking_amount_due RPC).
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

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

    if (!booking_id || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid booking_id or amount." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!keyId || !keySecret || !supabaseUrl || !supabaseAnonKey) {
      throw new Error("Razorpay is not configured");
    }

    // Ask the database as the caller: returns null unless this booking is theirs.
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Sign in to pay." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const asCaller = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: due, error: dueError } = await asCaller.rpc("booking_amount_due", { p_booking_id: booking_id });
    if (dueError) throw new Error("Could not check the amount due");
    if (due === null) {
      return new Response(
        JSON.stringify({ error: "Booking not found." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (Math.round(Number(amount) * 100) > Math.round(Number(due) * 100)) {
      return new Response(
        JSON.stringify({ error: "Amount is more than what is due.", amount_due: Number(due) }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const amountInPaise = Math.round(Number(amount) * 100);
    const receipt = `bkg_${String(booking_id).slice(-8)}_${crypto.randomUUID().slice(0, 12)}`;

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
        receipt,
        notes: {
          booking_id,
          customer_name: customer_name || "",
          customer_phone: customer_phone || "",
          platform: "yana_rider_app"
        },
      }),
    });

    const orderData = await rpResponse.json() as {
      id?: string; amount?: number; currency?: string; error?: { description?: string };
    };
    if (!rpResponse.ok) {
      throw new Error(orderData.error?.description || "Failed to create Razorpay order");
    }
    if (!orderData.id || orderData.amount !== amountInPaise || orderData.currency !== "INR") {
      throw new Error("Razorpay returned an invalid order");
    }

    return new Response(
      JSON.stringify({
        order_id: orderData.id,
        amount: orderData.amount,
        currency: orderData.currency,
        key_id: keyId,
        receipt
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
