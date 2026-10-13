// Pure logic for the send-otp-msg91 Edge Function (no Deno/URL imports, so it runs under Node tests).
// Supabase Auth creates and checks the OTP. This code only verifies the hook signature and delivers the code.
// NEVER log the OTP, the auth key, or a full phone number (use maskPhone).

export type Env = (key: string) => string | undefined;
export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number }>;

export type DeliveryResult =
  | { ok: true; channel: 'whatsapp' | 'sms' }
  | { ok: false; status: number; message: string };

const WHATSAPP_URL = 'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/';
const SMS_FLOW_URL = 'https://control.msg91.com/api/v5/flow';
const TOLERANCE_SECONDS = 300;

// ── Phone handling ───────────────────────────────────────────────────────────

/** Returns +91XXXXXXXXXX or null when the number is not a valid Indian mobile. */
export function normalizeIndianPhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[\s()-]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(digits)) return null;
  let ten: string;
  if (digits.length === 10) ten = digits;
  else if (digits.length === 12 && digits.startsWith('91')) ten = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) ten = digits.slice(1);
  else return null;
  return /^[6-9]\d{9}$/.test(ten) ? `+91${ten}` : null;
}

/** For logs only: +91******1234 */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}******${phone.slice(-4)}`;
}

// ── Standard Webhooks signature (what Supabase Auth Hooks send) ──────────────

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies webhook-id / webhook-timestamp / webhook-signature over the RAW body.
 * `secret` looks like "v1,whsec_<base64>" (the "v1,whsec_" prefix is optional).
 */
export async function verifyHookSignature(
  rawBody: string,
  headers: { get(name: string): string | null },
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  try {
    const id = headers.get('webhook-id');
    const ts = headers.get('webhook-timestamp');
    const sigHeader = headers.get('webhook-signature');
    if (!id || !ts || !sigHeader || !secret) return false;
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(nowSeconds - tsNum) > TOLERANCE_SECONDS) return false;

    const keyB64 = secret.replace(/^v1,/, '').replace(/^whsec_/, '');
    const key = await crypto.subtle.importKey(
      'raw', b64ToBytes(keyB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${rawBody}`));
    const expected = bytesToB64(new Uint8Array(signed));

    // Header is space-separated "v1,<sig>" entries (allows secret rotation).
    return sigHeader.split(' ').some((part) => {
      const [version, sig] = part.split(',');
      return version === 'v1' && !!sig && safeEqual(sig, expected);
    });
  } catch {
    return false;
  }
}

// ── Payload ──────────────────────────────────────────────────────────────────

export type ParsedHook = { phone: string; otp: string };

/** Reads user.phone and sms.otp; returns null if anything is missing or malformed. */
export function parseHookPayload(rawBody: string): ParsedHook | null {
  try {
    const body = JSON.parse(rawBody);
    const phone = normalizeIndianPhone(body?.user?.phone);
    const otp = body?.sms?.otp;
    if (!phone || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) return null;
    return { phone, otp };
  } catch {
    return null;
  }
}

// ── MSG91 delivery ───────────────────────────────────────────────────────────

export function buildWhatsAppRequest(env: Env, phone: string, otp: string) {
  const authkey = env('MSG91_AUTH_KEY');
  const namespace = env('MSG91_WA_NAMESPACE');
  if (!authkey || !namespace) return null;
  const sender = env('MSG91_WA_SENDER') ?? '919692610149';
  const template = env('MSG91_WA_TEMPLATE') ?? 'yana_login_otp';
  return {
    url: WHATSAPP_URL,
    headers: { 'Content-Type': 'application/json', authkey },
    body: {
      integrated_number: sender,
      content_type: 'template',
      payload: {
        messaging_product: 'whatsapp',
        type: 'template',
        template: {
          name: template,
          language: { code: 'en', policy: 'deterministic' },
          namespace,
          to_and_components: [{
            to: [phone.replace(/^\+/, '')],
            components: {
              body_1: { type: 'text', value: otp },
              button_1: { subtype: 'url', type: 'text', value: otp }, // copy-code button needs the code too
            },
          }],
        },
      },
    },
  };
}

export function buildSmsRequest(env: Env, phone: string, otp: string) {
  const authkey = env('MSG91_AUTH_KEY');
  const templateId = env('MSG91_SMS_TEMPLATE_ID'); // DLT-approved template id
  if (!authkey || !templateId) return null;
  const otpVar = env('MSG91_SMS_OTP_VAR') ?? 'OTP';
  return {
    url: SMS_FLOW_URL,
    headers: { 'Content-Type': 'application/json', authkey },
    body: {
      template_id: templateId,
      short_url: '0',
      recipients: [{ mobiles: phone.replace(/^\+/, ''), [otpVar]: otp }],
    },
  };
}

async function post(fetchFn: Fetch, req: { url: string; headers: Record<string, string>; body: unknown }): Promise<boolean> {
  try {
    const res = await fetchFn(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
    return res.ok;
  } catch {
    return false;
  }
}

/** WhatsApp first. SMS only if WhatsApp failed AND MSG91_SMS_ENABLED === 'true' (needs DLT). */
export async function deliverOtp(
  env: Env,
  fetchFn: Fetch,
  hook: ParsedHook,
  log: (line: string) => void = () => {},
): Promise<DeliveryResult> {
  const masked = maskPhone(hook.phone);

  const wa = buildWhatsAppRequest(env, hook.phone, hook.otp);
  if (wa && (await post(fetchFn, wa))) {
    log(`otp delivered via whatsapp to ${masked}`);
    return { ok: true, channel: 'whatsapp' };
  }
  log(`whatsapp ${wa ? 'failed' : 'not configured'} for ${masked}`);

  if (env('MSG91_SMS_ENABLED') === 'true') {
    const sms = buildSmsRequest(env, hook.phone, hook.otp);
    if (sms && (await post(fetchFn, sms))) {
      log(`otp delivered via sms to ${masked}`);
      return { ok: true, channel: 'sms' };
    }
    log(`sms ${sms ? 'failed' : 'not configured'} for ${masked}`);
  }
  return { ok: false, status: 502, message: 'Could not deliver the code. Please try again.' };
}

// ── Whole request handler ────────────────────────────────────────────────────

export async function handleRequest(
  req: { method: string; text(): Promise<string>; headers: { get(name: string): string | null } },
  env: Env,
  fetchFn: Fetch,
  log: (line: string) => void = () => {},
  nowSeconds?: number,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (req.method !== 'POST') return { status: 405, body: { error: { http_code: 405, message: 'Method not allowed' } } };

  const secret = env('SEND_SMS_HOOK_SECRET');
  if (!secret) {
    log('SEND_SMS_HOOK_SECRET missing');
    return { status: 500, body: { error: { http_code: 500, message: 'Connector not configured' } } };
  }

  const raw = await req.text();
  if (!(await verifyHookSignature(raw, req.headers, secret, nowSeconds))) {
    log('rejected: bad or missing signature');
    return { status: 401, body: { error: { http_code: 401, message: 'Invalid signature' } } };
  }

  const hook = parseHookPayload(raw);
  if (!hook) {
    log('rejected: invalid payload');
    return { status: 400, body: { error: { http_code: 400, message: 'Invalid request' } } };
  }

  const result = await deliverOtp(env, fetchFn, hook, log);
  if (!result.ok) return { status: result.status, body: { error: { http_code: result.status, message: result.message } } };
  return { status: 200, body: {} };
}
