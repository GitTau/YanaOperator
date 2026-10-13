-- Rider phone-OTP login: link a verified Supabase Auth user to an existing customer (D-010, B1-07, O-008).
-- NOT APPLIED to any database. Review, then apply only with the founder's approval.
--
-- Rules (founder-approved in the build request, 13 Oct 2026):
--   * After OTP, link automatically ONLY if exactly one customer has the caller's verified phone.
--   * Otherwise (several matches, or that customer already belongs to another login) queue a Captain review.
--   * customers.id is never rewritten. The phone comes from auth.users (verified), never from the client.
--   * Links are immutable. Every new table has RLS ON and no anonymous access.

BEGIN;

-- ── Phone normaliser: any stored form -> +91XXXXXXXXXX (NULL if not an Indian mobile) ──
CREATE OR REPLACE FUNCTION public.normalize_phone_e164(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN d ~ '^[6-9][0-9]{9}$'            THEN '+91' || d
    WHEN d ~ '^91[6-9][0-9]{9}$'          THEN '+' || d
    WHEN d ~ '^0[6-9][0-9]{9}$'           THEN '+91' || substr(d, 2)
    ELSE NULL
  END
  FROM (SELECT regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g') AS d) s;
$$;
REVOKE ALL ON FUNCTION public.normalize_phone_e164(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_phone_e164(text) TO authenticated;

-- ── Immutable Auth -> customer links ──
CREATE TABLE IF NOT EXISTS public.customer_auth_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE RESTRICT,
  customer_id   uuid NOT NULL UNIQUE REFERENCES public.customers (id) ON DELETE RESTRICT,
  linked_at     timestamptz NOT NULL DEFAULT now(),
  linked_by     text NOT NULL DEFAULT 'system',
  method        text NOT NULL CHECK (method IN ('auto_phone_otp', 'captain_review'))
);
ALTER TABLE public.customer_auth_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_auth_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_auth_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_auth_links TO authenticated;
DROP POLICY IF EXISTS customer_auth_links_own_read ON public.customer_auth_links;
CREATE POLICY customer_auth_links_own_read ON public.customer_auth_links
  FOR SELECT TO authenticated USING (auth_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.customer_auth_links_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'customer_auth_links rows are immutable';
END $$;
REVOKE ALL ON FUNCTION public.customer_auth_links_immutable() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_customer_auth_links_immutable ON public.customer_auth_links;
CREATE TRIGGER trg_customer_auth_links_immutable
  BEFORE UPDATE OR DELETE ON public.customer_auth_links
  FOR EACH ROW EXECUTE FUNCTION public.customer_auth_links_immutable();

-- ── Captain review queue ──
CREATE TABLE IF NOT EXISTS public.customer_link_reviews (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id           uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  phone_e164             text NOT NULL,
  candidate_customer_ids uuid[] NOT NULL DEFAULT '{}',
  reason                 text NOT NULL CHECK (reason IN ('multiple_matches', 'customer_already_linked')),
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'rejected')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  resolved_by            uuid REFERENCES auth.users (id),
  resolved_at            timestamptz,
  resolved_customer_id   uuid REFERENCES public.customers (id)
);
-- one open review per login
CREATE UNIQUE INDEX IF NOT EXISTS customer_link_reviews_one_pending
  ON public.customer_link_reviews (auth_user_id) WHERE status = 'pending';
ALTER TABLE public.customer_link_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_link_reviews FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_link_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_link_reviews TO authenticated;
DROP POLICY IF EXISTS customer_link_reviews_read ON public.customer_link_reviews;
CREATE POLICY customer_link_reviews_read ON public.customer_link_reviews
  FOR SELECT TO authenticated USING (
    auth_user_id = auth.uid()                                   -- the rider sees their own request
    OR public.current_role() = 'ADMIN'
    OR (public.current_role() = 'OPERATOR' AND EXISTS (          -- a Captain sees requests touching their store
         SELECT 1 FROM public.customers c
         WHERE c.id = ANY (customer_link_reviews.candidate_customer_ids)
           AND c.store_id = public.current_store_id()))
  );

-- ── Rider calls this after OTP verify (and again after registering a new customer) ──
-- Returns {status: linked | pending_review | no_match, customer_id?}
CREATE OR REPLACE FUNCTION public.link_rider_after_login()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_phone     text;
  v_matches   uuid[];
  v_existing  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  -- already linked: idempotent
  SELECT customer_id INTO v_existing FROM public.customer_auth_links WHERE auth_user_id = v_uid;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'linked', 'customer_id', v_existing);
  END IF;

  -- verified phone from Auth, never from the client
  SELECT public.normalize_phone_e164(u.phone) INTO v_phone FROM auth.users u WHERE u.id = v_uid;
  IF v_phone IS NULL THEN
    RETURN jsonb_build_object('status', 'no_match');
  END IF;

  -- serialise concurrent attempts for the same phone
  PERFORM pg_advisory_xact_lock(hashtextextended(v_phone, 0));

  SELECT coalesce(array_agg(c.id ORDER BY c.id), '{}') INTO v_matches
  FROM public.customers c WHERE public.normalize_phone_e164(c.phone) = v_phone;

  IF coalesce(array_length(v_matches, 1), 0) = 0 THEN
    RETURN jsonb_build_object('status', 'no_match');
  END IF;

  IF array_length(v_matches, 1) = 1
     AND NOT EXISTS (SELECT 1 FROM public.customer_auth_links WHERE customer_id = v_matches[1]) THEN
    INSERT INTO public.customer_auth_links (auth_user_id, customer_id, linked_by, method)
    VALUES (v_uid, v_matches[1], 'system', 'auto_phone_otp');
    RETURN jsonb_build_object('status', 'linked', 'customer_id', v_matches[1]);
  END IF;

  -- several customers share the phone, or the one customer already belongs to another login
  INSERT INTO public.customer_link_reviews (auth_user_id, phone_e164, candidate_customer_ids, reason)
  VALUES (v_uid, v_phone, v_matches,
          CASE WHEN array_length(v_matches, 1) > 1 THEN 'multiple_matches' ELSE 'customer_already_linked' END)
  ON CONFLICT (auth_user_id) WHERE status = 'pending' DO NOTHING;
  RETURN jsonb_build_object('status', 'pending_review');
END $$;
REVOKE ALL ON FUNCTION public.link_rider_after_login() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_rider_after_login() TO authenticated;

-- ── Captain/Admin decision on a queued review ──
-- p_customer_id = the customer this login really is (must be one of the candidates), or NULL to reject.
CREATE OR REPLACE FUNCTION public.resolve_customer_link_review(p_review_id uuid, p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_role    text := public.current_role();
  v_review  public.customer_link_reviews%ROWTYPE;
  v_store   uuid;
BEGIN
  IF v_uid IS NULL OR v_role NOT IN ('ADMIN', 'OPERATOR') THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_review FROM public.customer_link_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND OR v_review.status <> 'pending' THEN
    RAISE EXCEPTION 'review not open' USING ERRCODE = 'P0002';
  END IF;

  IF p_customer_id IS NULL THEN
    UPDATE public.customer_link_reviews
       SET status = 'rejected', resolved_by = v_uid, resolved_at = now()
     WHERE id = p_review_id;
    RETURN jsonb_build_object('status', 'rejected');
  END IF;

  IF NOT (p_customer_id = ANY (v_review.candidate_customer_ids)) THEN
    RAISE EXCEPTION 'customer is not a candidate for this review' USING ERRCODE = '22023';
  END IF;

  SELECT store_id INTO v_store FROM public.customers WHERE id = p_customer_id;
  IF v_role = 'OPERATOR' AND v_store IS DISTINCT FROM public.current_store_id() THEN
    RAISE EXCEPTION 'customer belongs to another store' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.customer_auth_links (auth_user_id, customer_id, linked_by, method)
  VALUES (v_review.auth_user_id, p_customer_id, v_uid::text, 'captain_review');  -- UNIQUE blocks double-binding

  UPDATE public.customer_link_reviews
     SET status = 'resolved', resolved_by = v_uid, resolved_at = now(), resolved_customer_id = p_customer_id
   WHERE id = p_review_id;
  RETURN jsonb_build_object('status', 'linked', 'customer_id', p_customer_id);
END $$;
REVOKE ALL ON FUNCTION public.resolve_customer_link_review(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_customer_link_review(uuid, uuid) TO authenticated;

COMMIT;
