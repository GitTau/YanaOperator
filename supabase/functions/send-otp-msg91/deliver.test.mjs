// Run: node --experimental-strip-types --test deliver.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  normalizeIndianPhone, maskPhone, verifyHookSignature, parseHookPayload,
  buildWhatsAppRequest, deliverOtp, handleRequest,
} from './deliver.ts';

const KEY_B64 = Buffer.from('test-secret-bytes-0123456789abcd').toString('base64');
const SECRET = `v1,whsec_${KEY_B64}`;
const NOW = 1_800_000_000;
const OTP = '482913';
const AUTHKEY = 'AUTHKEY-SHOULD-NEVER-BE-LOGGED';

const bodyOf = (phone = '919876543210', otp = OTP) => JSON.stringify({ user: { id: 'u1', phone }, sms: { otp } });
const sign = (raw, id = 'msg_1', ts = NOW, key = KEY_B64) =>
  createHmac('sha256', Buffer.from(key, 'base64')).update(`${id}.${ts}.${raw}`).digest('base64');
const headersFor = (raw, over = {}) => {
  const h = { 'webhook-id': 'msg_1', 'webhook-timestamp': String(NOW), 'webhook-signature': `v1,${sign(raw)}`, ...over };
  return { get: (n) => h[n] ?? null };
};
const baseEnv = { SEND_SMS_HOOK_SECRET: SECRET, MSG91_AUTH_KEY: AUTHKEY, MSG91_WA_NAMESPACE: 'ns_abc' };
const envOf = (o = {}) => (k) => ({ ...baseEnv, ...o })[k];
const request = (raw, headers, method = 'POST') => ({ method, text: async () => raw, headers });

// ── phone ──
test('phone is normalised to +91XXXXXXXXXX', () => {
  assert.equal(normalizeIndianPhone('919876543210'), '+919876543210');
  assert.equal(normalizeIndianPhone('+919876543210'), '+919876543210');
  assert.equal(normalizeIndianPhone('9876543210'), '+919876543210');
  assert.equal(normalizeIndianPhone('09876543210'), '+919876543210');
  assert.equal(normalizeIndianPhone('+91 98765-43210'), '+919876543210');
});
test('bad phones rejected', () => {
  for (const p of ['12345', '5876543210', '+14155550123', 'abc', '', null, undefined, 9876543210]) {
    assert.equal(normalizeIndianPhone(p), null, String(p));
  }
});
test('mask keeps only last 4', () => assert.equal(maskPhone('+919876543210'), '+91******3210'));

// ── signature ──
test('valid signature accepted', async () => {
  const raw = bodyOf();
  assert.equal(await verifyHookSignature(raw, headersFor(raw), SECRET, NOW), true);
});
test('tampered body, wrong secret, missing headers, stale timestamp all rejected', async () => {
  const raw = bodyOf();
  assert.equal(await verifyHookSignature(bodyOf('919876543211'), headersFor(raw), SECRET, NOW), false);
  const other = `v1,whsec_${Buffer.from('another-secret-another-secret-00').toString('base64')}`;
  assert.equal(await verifyHookSignature(raw, headersFor(raw), other, NOW), false);
  assert.equal(await verifyHookSignature(raw, { get: () => null }, SECRET, NOW), false);
  assert.equal(await verifyHookSignature(raw, headersFor(raw), SECRET, NOW + 301), false);
  assert.equal(await verifyHookSignature(raw, headersFor(raw, { 'webhook-signature': 'v1,AAAA' }), SECRET, NOW), false);
});
test('rotated signature list: any matching entry passes', async () => {
  const raw = bodyOf();
  const h = headersFor(raw, { 'webhook-signature': `v1,AAAA v1,${sign(raw)}` });
  assert.equal(await verifyHookSignature(raw, h, SECRET, NOW), true);
});

// ── payload ──
test('payload parsing', () => {
  assert.deepEqual(parseHookPayload(bodyOf()), { phone: '+919876543210', otp: OTP });
  assert.equal(parseHookPayload(bodyOf('919876543210', '12345')), null);
  assert.equal(parseHookPayload(bodyOf('919876543210', 'abcdef')), null);
  assert.equal(parseHookPayload(bodyOf('1234')), null);
  assert.equal(parseHookPayload('not json'), null);
  assert.equal(parseHookPayload('{}'), null);
});

// ── MSG91 request shape ──
test('WhatsApp request: sender, template, code in body AND button', () => {
  const r = buildWhatsAppRequest(envOf(), '+919876543210', OTP);
  assert.equal(r.url, 'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/');
  assert.equal(r.headers.authkey, AUTHKEY);
  assert.equal(r.body.integrated_number, '919692610149');
  const t = r.body.payload.template;
  assert.equal(t.name, 'yana_login_otp');
  assert.equal(t.language.code, 'en');
  assert.equal(t.namespace, 'ns_abc');
  assert.deepEqual(t.to_and_components[0].to, ['919876543210']);
  assert.equal(t.to_and_components[0].components.body_1.value, OTP);
  assert.equal(t.to_and_components[0].components.button_1.value, OTP);
  assert.equal(t.to_and_components[0].components.button_1.subtype, 'url');
});
test('WhatsApp request not built without key/namespace', () => {
  assert.equal(buildWhatsAppRequest(envOf({ MSG91_AUTH_KEY: undefined }), '+919876543210', OTP), null);
  assert.equal(buildWhatsAppRequest(envOf({ MSG91_WA_NAMESPACE: undefined }), '+919876543210', OTP), null);
});

// ── delivery + fallback ──
const hook = { phone: '+919876543210', otp: OTP };
const recorder = (responses) => {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); const r = responses[calls.length - 1]; if (r instanceof Error) throw r; return r; };
  return { fn, calls };
};
const ok = { ok: true, status: 200 };
const bad = { ok: false, status: 500 };

test('WhatsApp success: no SMS attempt', async () => {
  const { fn, calls } = recorder([ok]);
  const res = await deliverOtp(envOf({ MSG91_SMS_ENABLED: 'true', MSG91_SMS_TEMPLATE_ID: 't1' }), fn, hook);
  assert.deepEqual(res, { ok: true, channel: 'whatsapp' });
  assert.equal(calls.length, 1);
});
test('WhatsApp fails + SMS switch OFF (default): fail, SMS never called', async () => {
  const { fn, calls } = recorder([bad, ok]);
  const res = await deliverOtp(envOf({ MSG91_SMS_TEMPLATE_ID: 't1' }), fn, hook);
  assert.equal(res.ok, false);
  assert.equal(calls.length, 1);
});
test('WhatsApp fails + SMS switch ON: SMS used', async () => {
  const { fn, calls } = recorder([bad, ok]);
  const res = await deliverOtp(envOf({ MSG91_SMS_ENABLED: 'true', MSG91_SMS_TEMPLATE_ID: 't1' }), fn, hook);
  assert.deepEqual(res, { ok: true, channel: 'sms' });
  assert.equal(calls.length, 2);
  const sent = JSON.parse(calls[1].init.body);
  assert.equal(sent.template_id, 't1');
  assert.equal(sent.recipients[0].mobiles, '919876543210');
  assert.equal(sent.recipients[0].OTP, OTP);
});
test('WhatsApp network error is treated as failure; SMS ON but no template id → fail', async () => {
  const { fn } = recorder([new Error('network down')]);
  const res = await deliverOtp(envOf({ MSG91_SMS_ENABLED: 'true' }), fn, hook);
  assert.equal(res.ok, false);
});
test('SMS switch only counts when exactly "true"', async () => {
  for (const v of ['TRUE', '1', 'yes', '']) {
    const { fn, calls } = recorder([bad, ok]);
    await deliverOtp(envOf({ MSG91_SMS_ENABLED: v, MSG91_SMS_TEMPLATE_ID: 't1' }), fn, hook);
    assert.equal(calls.length, 1, v);
  }
});

// ── full handler ──
test('handler: unsigned request rejected, nothing sent', async () => {
  const raw = bodyOf();
  const { fn, calls } = recorder([ok]);
  const r = await handleRequest(request(raw, { get: () => null }), envOf(), fn, () => {}, NOW);
  assert.equal(r.status, 401);
  assert.equal(calls.length, 0);
});
test('handler: wrong method, missing secret', async () => {
  const raw = bodyOf();
  assert.equal((await handleRequest(request(raw, headersFor(raw), 'GET'), envOf(), async () => ok, () => {}, NOW)).status, 405);
  assert.equal((await handleRequest(request(raw, headersFor(raw)), envOf({ SEND_SMS_HOOK_SECRET: undefined }), async () => ok, () => {}, NOW)).status, 500);
});
test('handler: signed bad payload → 400, nothing sent', async () => {
  const raw = bodyOf('1234');
  const { fn, calls } = recorder([ok]);
  const r = await handleRequest(request(raw, headersFor(raw)), envOf(), fn, () => {}, NOW);
  assert.equal(r.status, 400);
  assert.equal(calls.length, 0);
});
test('handler: signed good request → 200 {} and WhatsApp sent', async () => {
  const raw = bodyOf();
  const { fn, calls } = recorder([ok]);
  const r = await handleRequest(request(raw, headersFor(raw)), envOf(), fn, () => {}, NOW);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, {});
  assert.equal(calls.length, 1);
});
test('handler: delivery failure → 502 error body', async () => {
  const raw = bodyOf();
  const { fn } = recorder([bad]);
  const r = await handleRequest(request(raw, headersFor(raw)), envOf(), fn, () => {}, NOW);
  assert.equal(r.status, 502);
  assert.equal(r.body.error.http_code, 502);
});

// ── logging safety ──
test('logs never contain the OTP, the auth key, or a full phone number', async () => {
  const lines = [];
  const log = (l) => lines.push(l);
  const raw = bodyOf();
  // success path, fallback path, failure path, rejection path
  await handleRequest(request(raw, headersFor(raw)), envOf(), recorder([ok]).fn, log, NOW);
  await handleRequest(request(raw, headersFor(raw)), envOf({ MSG91_SMS_ENABLED: 'true', MSG91_SMS_TEMPLATE_ID: 't' }), recorder([bad, ok]).fn, log, NOW);
  await handleRequest(request(raw, headersFor(raw)), envOf(), recorder([bad]).fn, log, NOW);
  await handleRequest(request(raw, { get: () => null }), envOf(), recorder([ok]).fn, log, NOW);
  const all = lines.join('\n');
  assert.ok(lines.length > 0);
  assert.ok(!all.includes(OTP), 'OTP leaked');
  assert.ok(!all.includes(AUTHKEY), 'auth key leaked');
  assert.ok(!all.includes('9876543210'), 'full phone leaked');
  assert.ok(!all.includes('whsec_') && !all.includes(KEY_B64), 'hook secret leaked');
});
