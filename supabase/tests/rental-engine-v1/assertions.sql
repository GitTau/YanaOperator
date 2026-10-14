-- Assertions run after stub.sql + the migration. Any failure stops with ON_ERROR_STOP.
\set ON_ERROR_STOP 1
INSERT INTO stores (store_id, name) VALUES ('00000000-0000-0000-0000-0000000000a3','OD03'), ('00000000-0000-0000-0000-0000000000a4','OD04');
INSERT INTO profiles VALUES ('10000000-0000-0000-0000-000000000001','ADMIN',NULL),
  ('10000000-0000-0000-0000-000000000003','OPERATOR','00000000-0000-0000-0000-0000000000a3'),
  ('10000000-0000-0000-0000-000000000004','OPERATOR','00000000-0000-0000-0000-0000000000a4');
INSERT INTO customers (id, phone) VALUES ('20000000-0000-0000-0000-000000000001','+919000000001'), ('20000000-0000-0000-0000-000000000002','+919000000002');
INSERT INTO vehicles (id, store_id, status, assigned_battery_id) VALUES
  ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3','In Use','50000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a3','Available',NULL),
  ('40000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-0000000000a3','In Use',NULL);
INSERT INTO batteries (id, store_id, status, assigned_vehicle_id) VALUES
  ('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3','In Use','40000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a3','Available',NULL);
INSERT INTO bookings (id, customer_id, store_id, status, vehicle_id, battery_id) VALUES
  ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3','Active','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a4','Active',NULL,NULL);

-- 1. Online collection mirrors into the ledger exactly once, in paise.
INSERT INTO collections (booking_id, store_id, amount, razorpay_payment_id) VALUES
  ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3',1750,'pay_A');
DO $$ BEGIN
  IF (SELECT amount_paise FROM rental_ledger WHERE idempotency_key = 'razorpay:pay_A') <> 175000 THEN RAISE EXCEPTION 'mirror amount wrong'; END IF;
END $$;
-- Second insert with same payment id (should be blocked upstream, but ledger must not double).
INSERT INTO collections (booking_id, store_id, amount, razorpay_payment_id) VALUES
  ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3',1750,'pay_A');
DO $$ BEGIN
  IF (SELECT count(*) FROM rental_ledger WHERE idempotency_key = 'razorpay:pay_A') <> 1 THEN RAISE EXCEPTION 'double credit'; END IF;
END $$;

-- 2. Ledger is append-only.
DO $$ BEGIN
  UPDATE rental_ledger SET amount_paise = 1;
  RAISE EXCEPTION 'update was allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  DELETE FROM rental_ledger;
  RAISE EXCEPTION 'delete was allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

-- 3. One fine per day per booking.
INSERT INTO rental_ledger (booking_id, store_id, entry_type, amount_paise, occurred_at, fine_key, idempotency_key)
  VALUES ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3','FINE',30000,'2026-10-09 04:30+00','F2026-10-09','fine:1:F2026-10-09');
DO $$ BEGIN
  INSERT INTO rental_ledger (booking_id, store_id, entry_type, amount_paise, occurred_at, fine_key, idempotency_key)
    VALUES ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3','FINE',30000,'2026-10-09 04:30+00','F2026-10-09','fine:other');
  RAISE EXCEPTION 'duplicate fine allowed';
EXCEPTION WHEN unique_violation THEN NULL; END $$;

-- 4. Pause via transaction: booking Paused, second open pause refused, inspection frees assets,
--    resume claims fresh assets, close does not touch someone else's scooter.
SELECT public.rental_tx_start_pause('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3', now(), 3, 4, 'p1');
DO $$ BEGIN
  IF (SELECT status::text FROM bookings WHERE id='30000000-0000-0000-0000-000000000001') <> 'Paused' THEN RAISE EXCEPTION 'not paused'; END IF;
  BEGIN
    INSERT INTO rental_pauses (booking_id, store_id, started_at, rider_distance_m, scooter_distance_m, idempotency_key)
      VALUES ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3', now(), 3, 4, 'p2');
    RAISE EXCEPTION 'second open pause allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.rental_tx_resume('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3','40000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002', now());
    RAISE EXCEPTION 'resume before inspection allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Pause inspection%' THEN RAISE; END IF;
  END;
END $$;
SELECT public.rental_tx_finish_pause_inspection((SELECT id FROM rental_pauses WHERE idempotency_key='p1'), '10000000-0000-0000-0000-000000000003', now(), NULL);
DO $$ BEGIN
  IF (SELECT status::text FROM vehicles WHERE id='40000000-0000-0000-0000-000000000001') <> 'Available' THEN RAISE EXCEPTION 'scooter not released'; END IF;
END $$;
-- Another rider now takes the released scooter 0001.
UPDATE vehicles SET status='In Use' WHERE id='40000000-0000-0000-0000-000000000001';
-- Resume must refuse an unavailable scooter, then accept a free one.
DO $$ BEGIN
  PERFORM public.rental_tx_resume('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3','40000000-0000-0000-0000-000000000009','50000000-0000-0000-0000-000000000002', now());
  RAISE EXCEPTION 'resume with busy scooter allowed';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'Scooter not available%' THEN RAISE; END IF;
END $$;
SELECT public.rental_tx_resume('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3','40000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002', now());
DO $$ BEGIN
  IF (SELECT vehicle_id FROM bookings WHERE id='30000000-0000-0000-0000-000000000001') <> '40000000-0000-0000-0000-000000000002' THEN RAISE EXCEPTION 'resume did not assign'; END IF;
END $$;
-- Pause again, inspect, then close (e.g. refund): scooter 0002 is released at inspection; if
-- another rider takes it, closing must NOT free it.
SELECT public.rental_tx_start_pause('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3', now(), 3, 4, 'p3');
SELECT public.rental_tx_finish_pause_inspection((SELECT id FROM rental_pauses WHERE idempotency_key='p3'), '10000000-0000-0000-0000-000000000003', now(), NULL);
UPDATE vehicles SET status='In Use' WHERE id='40000000-0000-0000-0000-000000000002';
SELECT public.rental_tx_close('30000000-0000-0000-0000-000000000001', now(), NULL);
DO $$ BEGIN
  IF (SELECT status::text FROM vehicles WHERE id='40000000-0000-0000-0000-000000000002') <> 'In Use' THEN RAISE EXCEPTION 'close freed another rider''s scooter'; END IF;
  IF (SELECT status::text FROM bookings WHERE id='30000000-0000-0000-0000-000000000001') <> 'Completed' THEN RAISE EXCEPTION 'not closed'; END IF;
  IF EXISTS (SELECT 1 FROM rental_pauses WHERE booking_id='30000000-0000-0000-0000-000000000001' AND resumed_at IS NULL) THEN RAISE EXCEPTION 'pause left open'; END IF;
END $$;

-- 5. Apps cannot write directly.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001', false);
DO $$ BEGIN
  INSERT INTO rental_ledger (booking_id, store_id, entry_type, amount_paise, method, occurred_at, idempotency_key)
    VALUES ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3','PAYMENT',1,'CASH',now(),'x');
  RAISE EXCEPTION 'client insert allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

-- 6. Read scoping: Admin sees all, OD04 Captain sees nothing of OD03, rider sees own.
DO $$ BEGIN IF (SELECT count(*) FROM rental_ledger) <> 2 THEN RAISE EXCEPTION 'admin should see 2'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004', false);
DO $$ BEGIN IF (SELECT count(*) FROM rental_ledger) <> 0 THEN RAISE EXCEPTION 'OD04 captain sees OD03 money'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003', false);
DO $$ BEGIN IF (SELECT count(*) FROM rental_ledger) <> 2 THEN RAISE EXCEPTION 'OD03 captain should see 2'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','', false);
SELECT set_config('request.jwt.claims','{"phone":"+919000000002"}', false);
DO $$ BEGIN IF (SELECT count(*) FROM rental_ledger) <> 0 THEN RAISE EXCEPTION 'rider sees other rider money'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"phone":"+919000000001"}', false);
DO $$ BEGIN IF (SELECT count(*) FROM rental_ledger) <> 2 THEN RAISE EXCEPTION 'rider should see own 2'; END IF; END $$;
RESET ROLE;

-- 7. Anonymous users see nothing.
SET ROLE anon;
DO $$ BEGIN
  PERFORM 1 FROM rental_ledger;
  RAISE EXCEPTION 'anon can read ledger';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;

-- 7b. Supervisor with VERIFY_CASH (based at OD04) sees cash from every store, but not other money.
INSERT INTO rental_ledger (booking_id, store_id, entry_type, amount_paise, method, occurred_at, idempotency_key)
  VALUES ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3','PAYMENT',50000,'CASH',now(),'cash-1');
INSERT INTO staff_permissions (profile_id, permission) VALUES ('10000000-0000-0000-0000-000000000004','VERIFY_CASH');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{}', false);
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM rental_ledger) <> 1 THEN RAISE EXCEPTION 'supervisor should see exactly the 1 cash entry'; END IF;
END $$;
RESET ROLE;

-- 8. Clients cannot call the transaction functions.
SET ROLE authenticated;
DO $$ BEGIN
  PERFORM public.rental_tx_close('30000000-0000-0000-0000-000000000002', now(), NULL);
  RAISE EXCEPTION 'client could call rental_tx_close';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;

SELECT 'ALL SQL ASSERTIONS PASSED' AS result;
