// Run: node --test supabase/tests/rider-otp-links.static.test.mjs
// STATIC checks on the migration text only. This does NOT execute SQL (no Postgres available locally).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../migrations/20261013100000_rider_otp_links.sql', import.meta.url), 'utf8');
const tables = ['customer_auth_links', 'customer_link_reviews'];

test('every new table has RLS ON and FORCED', () => {
  for (const t of tables) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`), t);
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${t} FORCE ROW LEVEL SECURITY`), t);
    assert.match(sql, new RegExp(`REVOKE ALL ON public\\.${t} FROM PUBLIC, anon, authenticated`), t);
  }
});
test('no anonymous grants anywhere', () => {
  assert.doesNotMatch(sql, /GRANT[^;]*\bTO\b[^;]*\banon\b/i);
  assert.doesNotMatch(sql, /GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO authenticated/i);
});
test('links are unique both ways and immutable', () => {
  assert.match(sql, /auth_user_id\s+uuid NOT NULL UNIQUE/);
  assert.match(sql, /customer_id\s+uuid NOT NULL UNIQUE/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.customer_auth_links/);
});
test('never rewrites customers', () => {
  assert.doesNotMatch(sql, /UPDATE\s+public\.customers/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+public\.customers/i);
});
test('link function takes no client-supplied phone or id, uses auth.uid()', () => {
  const fn = sql.match(/FUNCTION public\.link_rider_after_login\(\)[\s\S]*?END \$\$;/)[0];
  assert.match(fn, /auth\.uid\(\)/);
  assert.match(fn, /FROM auth\.users/);
});
test('auto-link only on exactly one match; else review', () => {
  assert.match(sql, /array_length\(v_matches, 1\) = 1/);
  assert.match(sql, /INSERT INTO public\.customer_link_reviews/);
});
test('definer functions pin search_path and revoke public/anon execute', () => {
  const definers = sql.match(/SECURITY DEFINER\s+SET search_path = pg_catalog/g) ?? [];
  assert.equal(definers.length, 2);
  for (const f of ['link_rider_after_login()', 'resolve_customer_link_review(uuid, uuid)']) {
    assert.ok(sql.includes(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon;`), f);
  }
});
test('review resolution is staff-only and store-scoped for Captains', () => {
  assert.match(sql, /v_role NOT IN \('ADMIN', 'OPERATOR'\)/);
  assert.match(sql, /customer belongs to another store/);
  assert.match(sql, /customer is not a candidate/);
});
