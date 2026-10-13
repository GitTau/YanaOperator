// ─────────────────────────────────────────────────────────────────────────────
// Supabase Edge Function: send-otp-msg91
// Purpose: Supabase Auth "Send SMS Hook". Supabase makes and checks the OTP;
// this function only delivers it (MSG91 WhatsApp first, SMS backup behind a flag).
// Only requests signed by Supabase (Standard Webhooks, SEND_SMS_HOOK_SECRET) are accepted.
// Secrets: MSG91_AUTH_KEY, MSG91_WA_NAMESPACE, SEND_SMS_HOOK_SECRET
//          (optional) MSG91_WA_SENDER, MSG91_WA_TEMPLATE, MSG91_SMS_ENABLED,
//          MSG91_SMS_TEMPLATE_ID, MSG91_SMS_OTP_VAR
// Deploy with JWT verification OFF (see ../../config.toml): the signature is the lock.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleRequest } from "./deliver.ts";

serve(async (req: Request) => {
  const { status, body } = await handleRequest(
    req,
    (key) => Deno.env.get(key),
    (url, init) => fetch(url, init),
    (line) => console.log(line), // lines are pre-masked; no OTP/keys ever reach here
  );
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
});
