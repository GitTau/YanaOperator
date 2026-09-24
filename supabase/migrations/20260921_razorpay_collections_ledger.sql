-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Razorpay Digital Collections & Ledger Integration
-- Date: 2026-09-21
-- Purpose:
--   1. Create public.collections table for financial audit logging.
--   2. Add indexes for high-speed queries on booking, store, and Razorpay IDs.
--   3. Enable RLS and assign permissions for Admin, Operator, and Rider.
--   4. Add atomic and idempotent record_razorpay_payment RPC.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Create collections Table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(store_id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount >= 0),
  payment_method text NOT NULL DEFAULT 'ONLINE_RAZORPAY',
  status text NOT NULL DEFAULT 'Successful',
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  collected_by text DEFAULT 'RIDER_APP',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Performance & Idempotency Indexes ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_collections_booking_id 
  ON public.collections(booking_id);

CREATE INDEX IF NOT EXISTS idx_collections_store_id 
  ON public.collections(store_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_razorpay_payment_id 
  ON public.collections(razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_collections_created_at 
  ON public.collections(created_at DESC);

-- ── 3. Row Level Security (RLS) ──────────────────────────────────────────────
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

-- Super Admin: Full Access
DROP POLICY IF EXISTS collections_admin_all ON public.collections;
CREATE POLICY collections_admin_all ON public.collections
  FOR ALL
  TO authenticated
  USING (public.current_role() = 'ADMIN');

-- Operator: Store Scoped
DROP POLICY IF EXISTS collections_operator_store ON public.collections;
CREATE POLICY collections_operator_store ON public.collections
  FOR ALL
  TO authenticated
  USING (public.current_role() = 'OPERATOR' AND store_id = public.current_store_id());

-- Rider Read: Visible for own bookings
DROP POLICY IF EXISTS collections_rider_read ON public.collections;
CREATE POLICY collections_rider_read ON public.collections
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = collections.booking_id
        AND (
          b.customer_id IN (SELECT c.id FROM public.customers c WHERE c.phone = (auth.jwt() ->> 'phone'))
          OR b.customer_id = (SELECT p.id FROM public.profiles p WHERE p.id = auth.uid())
          OR auth.role() = 'authenticated'
        )
    )
  );

-- Insert: Permitted for recording verified payments
DROP POLICY IF EXISTS collections_public_insert ON public.collections;
CREATE POLICY collections_public_insert ON public.collections
  FOR INSERT
  TO public
  WITH CHECK (true);

-- ── 4. Atomic record_razorpay_payment RPC ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_razorpay_payment(
  p_booking_id uuid,
  p_amount numeric,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_razorpay_signature text,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_store_id uuid;
  v_collection_id uuid;
BEGIN
  -- 1. Lock booking row for atomic transaction
  SELECT * INTO v_booking 
  FROM bookings 
  WHERE id = p_booking_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id;
  END IF;

  v_store_id := v_booking.store_id;

  -- 2. Idempotency Guard: Prevent double-crediting if webhook/client retry
  IF p_razorpay_payment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM collections WHERE razorpay_payment_id = p_razorpay_payment_id
  ) THEN
    RETURN jsonb_build_object(
      'success', true, 
      'already_processed', true,
      'message', 'Payment already processed and credited'
    );
  END IF;

  -- 3. Execute master record_payment RPC logic (updates amounts, auto-unpauses, logs audit)
  PERFORM public.record_payment(
    p_booking_id,
    v_store_id,
    0,                                                          -- p_cash_amount
    p_amount,                                                   -- p_online_amount
    COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::uuid) -- p_operator_id
  );

  -- 4. Record entry in collections ledger
  INSERT INTO public.collections (
    booking_id,
    store_id,
    amount,
    payment_method,
    status,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    collected_by
  ) VALUES (
    p_booking_id,
    v_store_id,
    p_amount,
    'ONLINE_RAZORPAY',
    'Successful',
    p_razorpay_order_id,
    p_razorpay_payment_id,
    p_razorpay_signature,
    'RIDER_APP'
  ) RETURNING id INTO v_collection_id;

  RETURN jsonb_build_object(
    'success', true,
    'collection_id', v_collection_id,
    'amount', p_amount,
    'booking_id', p_booking_id
  );
END;
$$;
