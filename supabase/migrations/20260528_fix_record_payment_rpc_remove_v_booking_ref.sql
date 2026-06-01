CREATE OR REPLACE FUNCTION public.record_payment(
  p_booking_id uuid,
  p_store_id uuid,
  p_amount numeric,
  p_operator_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_total_owed numeric;
  v_gate_amount numeric;
  v_new_amount_paid numeric;
  v_should_unpause boolean := false;
BEGIN
  -- 1. Lock the booking row for atomic update
  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id AND store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found in store %', p_booking_id, p_store_id;
  END IF;

  -- 2. Accumulate payment
  v_new_amount_paid := v_booking.amount_paid + p_amount;
  v_total_owed := v_booking.total_amount + v_booking.deposit_amount + v_booking.fines_amount;

  -- 3. Calculate Revenue Protection Gate
  --    Weekly:  must pay >= 100% of (total + deposit + fines)
  --    Monthly: must pay >= INR 4000 (floor) or total owed if less
  IF v_booking.rental_plan = 'Weekly' THEN
    v_gate_amount := v_total_owed;
  ELSE
    v_gate_amount := LEAST(4000, v_total_owed);
  END IF;

  -- 4. Auto-unpause if paused and gate is now cleared
  IF v_booking.status = 'Paused' AND v_new_amount_paid >= v_gate_amount THEN
    v_should_unpause := true;
  END IF;

  -- 5. Update booking: accumulate payment, unpause if threshold met
  UPDATE bookings SET
    amount_paid = v_new_amount_paid,
    status      = CASE WHEN v_should_unpause THEN 'Active'::booking_status ELSE status END,
    paused_at   = CASE WHEN v_should_unpause THEN NULL ELSE paused_at END
  WHERE id = p_booking_id;

  -- 6. Mandatory audit log
  INSERT INTO audit_logs (store_id, operator_id, type, message, reason)
  VALUES (
    p_store_id,
    p_operator_id,
    'BOOKING'::log_type,
    'Payment of Rs.' || p_amount || ' recorded for booking ' || p_booking_id,
    CASE
      WHEN v_should_unpause THEN 'Booking auto-unpaused — payment threshold cleared'
      ELSE 'Payment recorded'
    END
  );
END;
$$;
