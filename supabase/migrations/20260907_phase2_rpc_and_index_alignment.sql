-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Phase 2 RPC & Performance Alignment
-- Date: 2026-09-07
-- Purpose:
--   1. Add covering indexes for unindexed foreign keys (chargers, checklists, bookings).
--   2. Upgrade create_booking RPC to support atomic 'Draft' creation without locking assets.
--   3. Add dispatch_booking RPC for atomic dispatch and asset locking.
--   4. Set explicit search_path = public on functions for database security.
--   5. Record migration history in supabase_migrations.schema_migrations.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Missing Foreign Key Covering Indexes ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bookings_charger_id 
  ON public.bookings(charger_id);

CREATE INDEX IF NOT EXISTS idx_chargers_assigned_vehicle_id 
  ON public.chargers(assigned_vehicle_id);

CREATE INDEX IF NOT EXISTS idx_chargers_store_id 
  ON public.chargers(store_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_checklists_booking_id 
  ON public.vehicle_checklists(booking_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_checklists_vehicle_id 
  ON public.vehicle_checklists(vehicle_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_checklists_store_id 
  ON public.vehicle_checklists(store_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_checklists_submitted_by 
  ON public.vehicle_checklists(submitted_by);


-- ── 2. Atomic create_booking RPC ─────────────────────────────────────────────

-- Drop old 9-param overload so the default parameters resolve cleanly
DROP FUNCTION IF EXISTS public.create_booking(uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, uuid);

CREATE OR REPLACE FUNCTION public.create_booking(
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_battery_id uuid,
  p_store_id uuid,
  p_rental_plan text,
  p_total_amount numeric,
  p_deposit_amount numeric,
  p_amount_paid numeric,
  p_operator_id uuid,
  p_status text DEFAULT 'Draft',
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_charger_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id uuid;
  v_existing_count integer;
  v_booking_status booking_status;
BEGIN
  -- Validate status parameter
  IF p_status IS NULL OR p_status NOT IN ('Draft', 'Active') THEN
    v_booking_status := 'Draft'::booking_status;
  ELSE
    v_booking_status := p_status::booking_status;
  END IF;

  -- Check if rider already has an active, draft, or paused booking
  SELECT COUNT(*) INTO v_existing_count
  FROM public.bookings
  WHERE customer_id = p_customer_id
    AND status IN ('Draft', 'Active', 'Paused');

  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'Rider already has an active or pending rental booking';
  END IF;

  -- 1. Insert the booking
  INSERT INTO public.bookings (
    customer_id, vehicle_id, battery_id, store_id, charger_id,
    status, rental_plan, total_amount, deposit_amount, amount_paid,
    start_date, end_date,
    started_at
  ) VALUES (
    p_customer_id, p_vehicle_id, p_battery_id, p_store_id, p_charger_id,
    v_booking_status, p_rental_plan::rental_plan, p_total_amount, p_deposit_amount, p_amount_paid,
    p_start_date, p_end_date,
    CASE WHEN v_booking_status = 'Active' THEN now() ELSE NULL END
  ) RETURNING id INTO v_booking_id;

  -- 2. Only lock assets if booking is Active immediately (e.g. renewal flow).
  -- If Draft, assets remain Available until Captain performs Dispatch.
  IF v_booking_status = 'Active' THEN
    IF p_vehicle_id IS NOT NULL THEN
      UPDATE public.vehicles
      SET status = 'In Use', assigned_battery_id = p_battery_id
      WHERE id = p_vehicle_id;
    END IF;

    IF p_battery_id IS NOT NULL THEN
      UPDATE public.batteries
      SET status = 'In Use', assigned_vehicle_id = p_vehicle_id
      WHERE id = p_battery_id;
    END IF;

    IF p_charger_id IS NOT NULL THEN
      UPDATE public.chargers
      SET status = 'In Use', assigned_vehicle_id = p_vehicle_id
      WHERE id = p_charger_id;
    END IF;
  END IF;

  -- 3. Update customer rental dates if provided
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    UPDATE public.customers
    SET start_date = p_start_date, end_date = p_end_date
    WHERE id = p_customer_id;
  END IF;

  -- 4. Audit Log
  INSERT INTO public.audit_logs (store_id, operator_id, type, message, reason)
  VALUES (
    p_store_id,
    p_operator_id::text,
    'BOOKING',
    'Booking Created (' || v_booking_status || ')',
    'New rental via Mobile App'
  );

  RETURN v_booking_id;
END;
$$;


-- ── 3. Atomic dispatch_booking RPC ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dispatch_booking(
  p_booking_id uuid,
  p_vehicle_id uuid,
  p_battery_id uuid,
  p_charger_id uuid DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_today date := (v_now AT TIME ZONE 'Asia/Kolkata')::date;
  v_plan_days integer;
  v_start_date date;
  v_end_date date;
BEGIN
  -- Lock booking row for atomic dispatch
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id;
  END IF;

  IF v_booking.status NOT IN ('Draft', 'Paused') THEN
    RAISE EXCEPTION 'Cannot dispatch booking in % status', v_booking.status;
  END IF;

  -- Determine dates based on booking transition
  IF v_booking.status = 'Draft' THEN
    v_start_date := COALESCE(v_booking.start_date, v_today);
    IF v_booking.end_date IS NOT NULL THEN
      v_end_date := v_booking.end_date;
    ELSE
      v_plan_days := CASE WHEN v_booking.rental_plan = 'Monthly' THEN 29 ELSE 6 END;
      v_end_date := v_start_date + v_plan_days;
    END IF;

    UPDATE public.bookings
    SET status = 'Active',
        started_at = v_now,
        start_date = v_start_date,
        end_date = v_end_date,
        vehicle_id = COALESCE(p_vehicle_id, vehicle_id),
        battery_id = COALESCE(p_battery_id, battery_id),
        charger_id = COALESCE(p_charger_id, charger_id)
    WHERE id = p_booking_id;

  ELSIF v_booking.status = 'Paused' THEN
    -- If paused, extend end_date by pause duration (minimum 1 day + elapsed calendar days)
    IF v_booking.paused_at IS NOT NULL AND v_booking.end_date IS NOT NULL THEN
      v_pause_date := (v_booking.paused_at AT TIME ZONE 'Asia/Kolkata')::date;
      v_pause_days := GREATEST(0, (v_today - v_pause_date)) + 1;
      v_end_date := v_booking.end_date + v_pause_days;
    ELSE
      v_end_date := v_booking.end_date;
    END IF;

    UPDATE public.bookings
    SET status = 'Active',
        paused_at = NULL,
        end_date = COALESCE(v_end_date, end_date),
        vehicle_id = COALESCE(p_vehicle_id, vehicle_id),
        battery_id = COALESCE(p_battery_id, battery_id),
        charger_id = COALESCE(p_charger_id, charger_id)
    WHERE id = p_booking_id;
  END IF;

  -- Lock vehicle to In Use
  IF p_vehicle_id IS NOT NULL THEN
    UPDATE public.vehicles
    SET status = 'In Use',
        assigned_battery_id = p_battery_id
    WHERE id = p_vehicle_id;
  END IF;

  -- Lock battery to In Use
  IF p_battery_id IS NOT NULL THEN
    UPDATE public.batteries
    SET status = 'In Use',
        assigned_vehicle_id = p_vehicle_id
    WHERE id = p_battery_id;
  END IF;

  -- Lock charger to In Use if assigned
  IF p_charger_id IS NOT NULL THEN
    UPDATE public.chargers
    SET status = 'In Use',
        assigned_vehicle_id = p_vehicle_id
    WHERE id = p_charger_id;
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (store_id, operator_id, type, message, reason)
  VALUES (
    v_booking.store_id,
    COALESCE(p_operator_id::text, 'system'),
    'BOOKING',
    'Booking Dispatched: ' || p_booking_id,
    'Assets locked to In Use on dispatch'
  );
END;
$$;


-- ── 4. Set search_path on record_payment and swap_assets ────────────────────

ALTER FUNCTION public.record_payment(uuid, uuid, numeric, numeric, uuid)
  SET search_path = public;

ALTER FUNCTION public.swap_assets(uuid, uuid, uuid, numeric, text, uuid)
  SET search_path = public;

ALTER FUNCTION public.auto_populate_booking_dates()
  SET search_path = public;


-- ── 5. Record Migration History ──────────────────────────────────────────────

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES 
  ('20260724000000', '20260724_chargers_table'),
  ('20260801000000', '20260801_fix_booking_logic_and_record_payment_rpc'),
  ('20260907000000', '20260907_phase2_rpc_and_index_alignment')
ON CONFLICT (version) DO NOTHING;
