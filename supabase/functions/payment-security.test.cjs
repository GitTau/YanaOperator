const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHmac, webcrypto } = require('node:crypto');
const ts = require('../../node_modules/typescript');

function loadHandler(name, { secrets = {}, fetch = async () => { throw new Error('unexpected fetch'); }, rpc = async () => ({}) } = {}) {
  const source = fs.readFileSync(path.join(__dirname, name, 'index.ts'), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let handler;
  vm.runInNewContext(js, {
    exports: {},
    require: (specifier) => specifier.includes('http/server')
      ? { serve: (callback) => { handler = callback; } }
      : { createClient: () => ({ rpc }) },
    Deno: { env: { get: (key) => secrets[key] } },
    fetch,
    crypto: webcrypto,
    btoa: (value) => Buffer.from(value).toString('base64'),
    Response,
    TextEncoder,
    console,
  }, { filename: name });
  assert.equal(typeof handler, 'function');
  return handler;
}

const paymentRequest = (body) => ({ method: 'POST', json: async () => body });
const validBody = {
  booking_id: 'booking-1',
  amount: 1200,
  razorpay_order_id: 'order-1',
  razorpay_payment_id: 'pay-1',
  razorpay_signature: createHmac('sha256', 'secret').update('order-1|pay-1').digest('hex'),
};
const secrets = {
  RAZORPAY_KEY_ID: 'rzp_test_key',
  RAZORPAY_KEY_SECRET: 'secret',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
};

test('order creation refuses missing Razorpay configuration', async () => {
  const handler = loadHandler('create-razorpay-order');
  const response = await handler(paymentRequest({ booking_id: 'booking-1', amount: 1200 }));
  assert.equal(response.status, 500);
});

test('payment verification rejects a missing secret and a bad signature', async () => {
  const withoutSecret = loadHandler('verify-razorpay-payment');
  assert.equal((await withoutSecret(paymentRequest(validBody))).status, 500);

  const withSecret = loadHandler('verify-razorpay-payment', { secrets });
  const response = await withSecret(paymentRequest({ ...validBody, razorpay_signature: 'invalid' }));
  assert.equal(response.status, 403);
});

test('payment verification checks the server amount and booking before crediting', async () => {
  let rpcCalls = 0;
  const handler = loadHandler('verify-razorpay-payment', {
    secrets,
    fetch: async (url) => new Response(JSON.stringify(url.includes('/payments/')
      ? { id: 'pay-1', order_id: 'order-1', status: 'captured', amount: 100, currency: 'INR' }
      : { id: 'order-1', status: 'paid', amount: 120000, currency: 'INR', notes: { booking_id: 'booking-1' } }),
    ),
    rpc: async () => { rpcCalls++; return {}; },
  });
  assert.equal((await handler(paymentRequest(validBody))).status, 409);
  assert.equal(rpcCalls, 0);
});

test('payment verification credits only a matching captured payment', async () => {
  let rpcCalls = 0;
  const handler = loadHandler('verify-razorpay-payment', {
    secrets,
    fetch: async (url) => new Response(JSON.stringify(url.includes('/payments/')
      ? { id: 'pay-1', order_id: 'order-1', status: 'captured', amount: 120000, currency: 'INR' }
      : { id: 'order-1', status: 'paid', amount: 120000, currency: 'INR', notes: { booking_id: 'booking-1' } }),
    ),
    rpc: async () => { rpcCalls++; return { data: { success: true } }; },
  });
  assert.equal((await handler(paymentRequest(validBody))).status, 200);
  assert.equal(rpcCalls, 1);
});

test('webhook refuses unsigned requests', async () => {
  const handler = loadHandler('razorpay-webhook', {
    secrets: { RAZORPAY_WEBHOOK_SECRET: 'webhook-secret' },
  });
  const response = await handler({
    method: 'POST',
    headers: new Headers(),
    text: async () => JSON.stringify({ event: 'payment.captured' }),
  });
  assert.equal(response.status, 401);
});
