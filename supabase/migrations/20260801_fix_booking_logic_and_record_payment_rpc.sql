-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Fix Booking Logic, Single Active Booking Constraint & record_payment RPC Bug
-- Date: 2026-08-01
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create partial unique index to enforce 1 active/draft/paused booking per customer
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_booking_per_customer
ON public.bookings (customer_id)
WHERE status IN ('Draft', 'Active', 'Paused');

-- Drop old overloaded function definitions to prevent Postgres overload resolution ambiguity
DROP FUNCTION IF EXISTS public.create_booking(uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, text);
DROP FUNCTION IF EXISTS public.create_booking(uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, uuid);
DROP FUNCTION IF EXISTS public.record_payment(uuid, uuid, numeric, numeric, text);
DROP FUNCTION IF EXISTS public.record_payment(uuid, uuid, numeric, numeric, uuid);

-- 2. Update create_booking RPC with active customer validation
CREATE OR REPLACE FUNCTION public.create_booking(
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_battery_id uuid,
  p_store_id uuid,
  p_rental_plan text,
  p_total_amount numeric,
  p_deposit_amount numeric,
  p_amount_paid numeric,
  p_operator_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking_id uuid;
  v_existing_count integer;
BEGIN
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
    customer_id, vehicle_id, battery_id, store_id, 
    status, rental_plan, total_amount, deposit_amount, amount_paid,
    started_at
  ) VALUES (
    p_customer_id, p_vehicle_id, p_battery_id, p_store_id,
    'Active', p_rental_plan::rental_plan, p_total_amount, p_deposit_amount, p_amount_paid,
    now()
  ) RETURNING id INTO v_booking_id;

  -- 2. Update Vehicle Status
  UPDATE public.vehicles
  SET status = 'In Use', assigned_battery_id = p_battery_id
  WHERE id = p_vehicle_id;

  -- 3. Update Battery Status
  UPDATE public.batteries
  SET status = 'In Use', assigned_vehicle_id = p_vehicle_id
  WHERE id = p_battery_id;

  -- 4. Audit Log
  INSERT INTO public.audit_logs (store_id, operator_id, type, message, reason)
  VALUES (p_store_id, p_operator_id, 'BOOKING', 'Booking Created', 'New rental via Mobile App');

  RETURN v_booking_id;
END;
$$;

-- 3. Update auto_populate_booking_dates trigger function to PRESERVE start_date on dispatch
CREATE OR REPLACE FUNCTION public.auto_populate_booking_dates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Preserve existing start_date when started_at changes unless start_date is null
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.started_at IS DISTINCT FROM OLD.started_at) AND NEW.start_date IS NULL THEN
      IF NEW.started_at IS NOT NULL THEN
        NEW.start_date := (NEW.started_at AT TIME ZONE 'Asia/Kolkata')::date;
      END IF;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.start_date IS NULL AND NEW.started_at IS NOT NULL THEN
      NEW.start_date := (NEW.started_at AT TIME ZONE 'Asia/Kolkata')::date;
    END IF;
  END IF;

  -- Sync end_date if completed_at changes and end_date wasn't explicitly updated
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.completed_at IS DISTINCT FROM OLD.completed_at) AND (NEW.end_date = OLD.end_date OR NEW.end_date IS NULL) THEN
      IF NEW.completed_at IS NOT NULL THEN
        NEW.end_date := (NEW.completed_at AT TIME ZONE 'Asia/Kolkata')::date;
      END IF;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.end_date IS NULL AND NEW.completed_at IS NOT NULL THEN
      NEW.end_date := (NEW.completed_at AT TIME ZONE 'Asia/Kolkata')::date;
    END IF;
  END IF;

  -- Fallbacks if dates are still null (evaluating in Asia/Kolkata)
  IF NEW.start_date IS NULL THEN
    IF NEW.started_at IS NOT NULL THEN
      NEW.start_date := (NEW.started_at AT TIME ZONE 'Asia/Kolkata')::date;
    ELSE
      NEW.start_date := (NEW.created_at AT TIME ZONE 'Asia/Kolkata')::date;
    END IF;
  END IF;

  IF NEW.end_date IS NULL THEN
    IF NEW.completed_at IS NOT NULL THEN
      NEW.end_date := (NEW.completed_at AT TIME ZONE 'Asia/Kolkata')::date;
    ELSIF NEW.start_date IS NOT NULL THEN
      IF NEW.rental_plan = 'Weekly' THEN
        NEW.end_date := NEW.start_date + INTERVAL '7 days';
      ELSE
        NEW.end_date := NEW.start_date + INTERVAL '30 days';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Update record_payment RPC to fix battery update query bug (WHERE id = battery_id)
CREATE OR REPLACE FUNCTION public.record_payment(
  p_booking_id uuid,
  p_store_id uuid,
  p_cash_amount numeric,
  p_online_amount numeric,
  p_operator_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_current_local_date date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
  v_overdue_days integer;
  v_overdue_fine numeric := 0;
  v_second_part_due_date date;
  v_second_part_days_late integer;
  v_second_part_fine numeric := 0;
  v_total_owed numeric;
  v_gate_amount numeric;
  v_new_amount_paid numeric;
  v_new_amount_paid_cash numeric;
  v_new_amount_paid_online numeric;
  v_should_unpause boolean := false;
  p_amount numeric := p_cash_amount + p_online_amount;
BEGIN
  -- Lock the booking row for atomic update
  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id AND store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found in store %', p_booking_id, p_store_id;
  END IF;

  -- Standard end-date overdue fine
  -- Grace period for 1 day: day of end_date + 1 is fine-free. Fine starts on end_date + 2.
  IF v_booking.end_date IS NOT NULL AND v_current_local_date > v_booking.end_date THEN
    v_overdue_days := v_current_local_date - v_booking.end_date;
    IF v_overdue_days >= 2 THEN
      v_overdue_fine := v_overdue_days * 300;
    END IF;
  END IF;

  -- Monthly 2nd part overdue fine
  IF v_booking.rental_plan = 'Monthly' AND v_booking.start_date IS NOT NULL THEN
    v_second_part_due_date := v_booking.start_date + INTERVAL '9 days';
    
    IF v_current_local_date > v_second_part_due_date AND (v_booking.total_amount + v_booking.deposit_amount - v_booking.amount_paid) > 1.0 THEN
      v_second_part_days_late := v_current_local_date - v_second_part_due_date;
      IF v_second_part_days_late >= 2 THEN
        v_second_part_fine := v_second_part_days_late * 300;
        v_overdue_fine := GREATEST(v_overdue_fine, v_second_part_fine);
      END IF;
    END IF;
  END IF;

  -- Accumulate payment
  v_new_amount_paid := v_booking.amount_paid + p_amount;
  v_new_amount_paid_cash := COALESCE(v_booking.amount_paid_cash, 0) + p_cash_amount;
  v_new_amount_paid_online := COALESCE(v_booking.amount_paid_online, 0) + p_online_amount;
  v_total_owed := v_booking.total_amount + v_booking.deposit_amount + GREATEST(COALESCE(v_booking.fines_amount, 0), v_overdue_fine);

  -- Revenue Protection Gate
  IF v_booking.rental_plan = 'Weekly' THEN
    v_gate_amount := v_total_owed;
  ELSE
    IF v_booking.start_date IS NOT NULL AND v_current_local_date > (v_booking.start_date + INTERVAL '9 days') THEN
      v_gate_amount := v_total_owed;
    ELSE
      v_gate_amount := LEAST(4000, v_total_owed);
    END IF;
  END IF;

  -- Auto-unpause if paused and gate is now cleared
  IF v_booking.status = 'Paused' AND v_new_amount_paid >= v_gate_amount THEN
    v_should_unpause := true;
  END IF;

  -- Update booking
  UPDATE bookings SET
    fines_amount = GREATEST(COALESCE(fines_amount, 0), v_overdue_fine),
    amount_paid = v_new_amount_paid,
    amount_paid_cash = v_new_amount_paid_cash,
    amount_paid_online = v_new_amount_paid_online,
    status      = CASE WHEN v_should_unpause THEN 'Active'::booking_status ELSE status END,
    paused_at   = CASE WHEN v_should_unpause THEN NULL ELSE paused_at END
  WHERE id = p_booking_id;

  -- Sync assets if auto-unpausing (i.e. booking becomes Active)
  IF v_should_unpause THEN
    IF v_booking.vehicle_id IS NOT NULL THEN
      UPDATE vehicles SET status = 'In Use'::vehicle_status, assigned_battery_id = v_booking.battery_id WHERE id = v_booking.vehicle_id;
    END IF;
    IF v_booking.battery_id IS NOT NULL THEN
      UPDATE batteries SET status = 'In Use'::battery_status, assigned_vehicle_id = v_booking.vehicle_id WHERE id = v_booking.battery_id;
    END IF;
  END IF;

  -- Audit log
  INSERT INTO audit_logs (store_id, operator_id, type, message, reason)
  VALUES (
    p_store_id,
    p_operator_id,
    'BOOKING'::log_type,
    'Payment of Rs.' || p_amount || ' recorded for booking ' || p_booking_id,
    'Breakdown: Cash: ' || p_cash_amount || ' | Online: ' || p_online_amount || ' | Overdue fine calculated: ' || v_overdue_fine || ' | ' ||
    CASE
      WHEN v_should_unpause THEN 'Booking auto-unpaused — payment threshold cleared'
      ELSE 'Payment recorded'
    END
  );
END;
$$;
