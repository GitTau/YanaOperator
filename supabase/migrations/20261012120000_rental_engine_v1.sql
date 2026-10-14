-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ SUPERSEDED 2026-10-15 — DO NOT APPLY.                                     ║
-- ║ Re-based onto the lockdown schema as                                      ║
-- ║   YanaOS/security/lockdown/K-rental-engine.proposal.sql                   ║
-- ║ (row access via lk_* helpers, single dues authority, enrolment table in   ║
-- ║ lockdown file C). Kept for history and for the synthetic SQL checks.      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Rental engine v1 — ledger, pause, recovery, refunds, approvals
-- Date: 2026-10-12   Owner: TauBoss   Decisions: D-011 … D-028 (Decision Log)
--
-- WHAT THIS ADDS (additive only — no existing table or function is changed):
--   rental_ledger        append-only money events (payments, refunds, fines, waivers)
--   rental_pauses        rider-started pauses + Captain inspection task (D-013)
--   recovery_tasks       recovery owned by the booking-store Captain (D-019/D-021)
--   refund_requests      rider asks in app, Admin decides (D-024/D-025)
--   cash_verifications   Supervisor "Collected" confirmation (D-025)
--   return_handoffs      cross-store return, booking Captain approves (D-026)
--   staff_permissions    extra staff powers, e.g. VERIFY_CASH for the Supervisor
--   consent_records      in-app terms acceptance with timestamp (D-027)
--   rental_engine_bookings  which bookings the engine manages (safe rollout)
--   rental_task_links    rental work → Captain appraisal tasks (task_entries)
--
-- WRITES: clients can only READ these tables. Every write goes through the
-- `rental-command` / `rental-clock` Edge Functions (service role), which run the
-- shared policy engine (supabase/functions/_shared/rental-policy.ts).
--
-- STATUS: tested against a synthetic stand-in schema only. NOT applied to the
-- live project. Before applying: compare with live definitions (stores.store_id,
-- profiles.role, current_role(), current_store_id(), collections) and regenerate
-- types. Rider row access below uses the same phone match as existing policies;
-- replace it with verified rider bindings when B1 / D-010 auth lands.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

-- ── 1. Money ledger ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rental_ledger (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       uuid NOT NULL REFERENCES public.bookings(id),
  store_id         uuid NOT NULL REFERENCES public.stores(store_id),
  entry_type       text NOT NULL CHECK (entry_type IN ('PAYMENT','REFUND','FINE','FINE_WAIVER')),
  amount_paise     bigint NOT NULL CHECK (amount_paise >= 0),
  method           text CHECK (method IN ('CASH','ONLINE_RAZORPAY','CREDIT_TRANSFER')),
  occurred_at      timestamptz NOT NULL,          -- verified time for payments; 10 AM IST for fines
  fine_key         text,                          -- 'F2026-10-09' for FINE / FINE_WAIVER
  collection_id    uuid REFERENCES public.collections(id),
  refund_request_id uuid,
  idempotency_key  text NOT NULL UNIQUE,
  actor_id         uuid,
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_ledger_method_for_payments CHECK (entry_type NOT IN ('PAYMENT','REFUND') OR method IS NOT NULL),
  CONSTRAINT rental_ledger_fine_key CHECK ((entry_type IN ('FINE','FINE_WAIVER')) = (fine_key IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS rental_ledger_one_fine_per_day
  ON public.rental_ledger (booking_id, entry_type, fine_key) WHERE fine_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS rental_ledger_booking ON public.rental_ledger (booking_id, occurred_at);
CREATE INDEX IF NOT EXISTS rental_ledger_store ON public.rental_ledger (store_id, occurred_at DESC);

-- Append-only: corrections are new entries, never edits (Payments note: "traceable reversal").
CREATE OR REPLACE FUNCTION public.rental_ledger_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rental_ledger is append-only; record a correcting entry instead' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS rental_ledger_no_change ON public.rental_ledger;
CREATE TRIGGER rental_ledger_no_change BEFORE UPDATE OR DELETE ON public.rental_ledger
  FOR EACH ROW EXECUTE FUNCTION public.rental_ledger_append_only();

-- Online payments already land in `collections` (record_razorpay_payment). Mirror each
-- successful one into the ledger once, at its capture time, so the engine sees it.
CREATE OR REPLACE FUNCTION public.rental_ledger_mirror_collection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_paise bigint := round(NEW.amount * 100);
BEGIN
  IF NEW.status IS DISTINCT FROM 'Successful' OR NEW.razorpay_payment_id IS NULL THEN RETURN NEW; END IF;
  IF v_paise::numeric <> NEW.amount * 100 THEN
    RAISE EXCEPTION 'Collection % has a fraction of a paisa', NEW.id;
  END IF;
  INSERT INTO public.rental_ledger (booking_id, store_id, entry_type, amount_paise, method, occurred_at, collection_id, idempotency_key, note)
  VALUES (NEW.booking_id, NEW.store_id, 'PAYMENT', v_paise, 'ONLINE_RAZORPAY', NEW.created_at, NEW.id,
          'razorpay:' || NEW.razorpay_payment_id, 'Mirrored from collections')
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS collections_to_rental_ledger ON public.collections;
CREATE TRIGGER collections_to_rental_ledger AFTER INSERT ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.rental_ledger_mirror_collection();

-- ── 2. Pauses (D-013, D-014, D-023) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rental_pauses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          uuid NOT NULL REFERENCES public.bookings(id),
  store_id            uuid NOT NULL REFERENCES public.stores(store_id),   -- ZAP Point where paused
  started_at          timestamptz NOT NULL,
  resumed_at          timestamptz,
  rider_distance_m    numeric(7,2) NOT NULL CHECK (rider_distance_m >= 0),
  scooter_distance_m  numeric(7,2) NOT NULL CHECK (scooter_distance_m >= 0),
  location_source     text NOT NULL DEFAULT 'RIDER_PHONE' CHECK (location_source IN ('RIDER_PHONE','IOT','CAPTAIN')),
  inspection_status   text NOT NULL DEFAULT 'PENDING' CHECK (inspection_status IN ('PENDING','DONE')),
  inspected_by        uuid,
  inspected_at        timestamptz,
  checklist_id        uuid,
  idempotency_key     text NOT NULL UNIQUE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (resumed_at IS NULL OR resumed_at >= started_at),
  CHECK ((inspection_status = 'DONE') = (inspected_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS rental_pauses_one_open ON public.rental_pauses (booking_id) WHERE resumed_at IS NULL;
CREATE INDEX IF NOT EXISTS rental_pauses_inspection ON public.rental_pauses (store_id) WHERE inspection_status = 'PENDING';

-- ── 3. Recovery (D-019, D-021) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recovery_tasks (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id               uuid NOT NULL REFERENCES public.bookings(id),
  store_id                 uuid NOT NULL REFERENCES public.stores(store_id),  -- booking store = owner
  status                   text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  triggered_at             timestamptz NOT NULL,
  immobilize_requested_at  timestamptz,      -- hardware command pending O-015
  started_by               uuid,
  started_at               timestamptz,
  completed_by             uuid,
  completed_at             timestamptz,
  checklist_id             uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'COMPLETED' OR completed_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS recovery_tasks_one_live ON public.recovery_tasks (booking_id) WHERE status IN ('OPEN','IN_PROGRESS');

-- ── 4. Refund requests (D-023, D-024, D-025) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid NOT NULL REFERENCES public.bookings(id),
  customer_id     uuid NOT NULL REFERENCES public.customers(id),
  store_id        uuid NOT NULL REFERENCES public.stores(store_id),
  kind            text NOT NULL CHECK (kind IN ('SECURITY_NO_RIDE','UNUSED_DAYS','SECURITY_END')),
  amount_paise    bigint NOT NULL CHECK (amount_paise >= 0),   -- calculated by the server, not the app
  status          text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVED','REJECTED','PAID')),
  requested_at    timestamptz NOT NULL DEFAULT now(),
  decided_by      uuid,
  decided_at      timestamptz,
  decision_note   text,
  paid_at         timestamptz,
  payout_reference text,
  idempotency_key text NOT NULL UNIQUE,
  CHECK (status = 'REQUESTED' OR decided_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_one_open ON public.refund_requests (booking_id, kind) WHERE status IN ('REQUESTED','APPROVED');

-- ── 5. Cash "Collected" confirmation (D-025) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cash_verifications (
  ledger_id    uuid PRIMARY KEY REFERENCES public.rental_ledger(id),
  verified_by  uuid NOT NULL,
  verified_at  timestamptz NOT NULL DEFAULT now(),
  note         text
);

-- ── 6. Cross-store return (D-017, D-026) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.return_handoffs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          uuid NOT NULL REFERENCES public.bookings(id),
  booking_store_id    uuid NOT NULL REFERENCES public.stores(store_id),
  receiving_store_id  uuid NOT NULL REFERENCES public.stores(store_id),
  received_by         uuid NOT NULL,
  received_at         timestamptz NOT NULL DEFAULT now(),
  checklist_id        uuid,
  approval_status     text NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING','APPROVED','REJECTED')),
  approved_by         uuid,
  approved_at         timestamptz,
  note                text,
  idempotency_key     text NOT NULL UNIQUE
);
CREATE UNIQUE INDEX IF NOT EXISTS return_handoffs_one_pending ON public.return_handoffs (booking_id) WHERE approval_status = 'PENDING';

-- ── 7. Extra staff powers (Supervisor cash verification) ─────────────────────
CREATE TABLE IF NOT EXISTS public.staff_permissions (
  profile_id  uuid NOT NULL REFERENCES public.profiles(id),
  permission  text NOT NULL CHECK (permission IN ('VERIFY_CASH')),
  granted_by  uuid,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, permission)
);

-- ── 8. Consent (D-027) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consent_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid NOT NULL REFERENCES public.customers(id),
  booking_id     uuid REFERENCES public.bookings(id),
  terms_version  text NOT NULL,
  terms_sha256   text NOT NULL CHECK (terms_sha256 ~ '^[0-9a-f]{64}$'),
  accepted_at    timestamptz NOT NULL DEFAULT now(),
  source         text NOT NULL DEFAULT 'RIDER_APP',
  UNIQUE (customer_id, terms_version)
);

-- ── 8b. Enrollment: the engine only acts on bookings an Admin has enrolled ───
-- Existing rentals were paid outside this ledger. Until an Admin enrolls a booking
-- (with an opening CREDIT_TRANSFER entry for money already received), the clock
-- never charges fines on it. New bookings are enrolled when they are created.
CREATE TABLE IF NOT EXISTS public.rental_engine_bookings (
  booking_id    uuid PRIMARY KEY REFERENCES public.bookings(id),
  enrolled_at   timestamptz NOT NULL DEFAULT now(),
  enrolled_by   uuid,
  opening_note  text
);

-- ── 8c. Appraisal link: rental work shows up as Captain tasks ──────────────
-- Pause inspections, recoveries and cross-store return approvals are created as
-- task_entries for the responsible Captain, so Admin can rate them in the usual
-- appraisal flow. This table remembers which task belongs to which rental event.
CREATE TABLE IF NOT EXISTS public.rental_task_links (
  source_type    text NOT NULL CHECK (source_type IN ('PAUSE_INSPECTION','RECOVERY','RETURN_APPROVAL')),
  source_id      uuid NOT NULL,
  task_entry_id  uuid NOT NULL REFERENCES public.task_entries(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_type, source_id)
);

-- ── 9. Access: read-only for apps, writes only via Edge Functions ───────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rental_ledger','rental_pauses','recovery_tasks','refund_requests',
                           'cash_verifications','return_handoffs','staff_permissions','consent_records','rental_engine_bookings','rental_task_links'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.current_role()::text = ''ADMIN'')', t || '_admin_read', t);
  END LOOP;
END $$;

-- Rider reads their own booking's rows. Same phone match the live policies use today.
CREATE OR REPLACE FUNCTION public.rental_is_my_booking(p_booking_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b JOIN public.customers c ON c.id = b.customer_id
    WHERE b.id = p_booking_id AND c.phone IS NOT NULL AND c.phone = (auth.jwt() ->> 'phone')
  )
$$;
REVOKE ALL ON FUNCTION public.rental_is_my_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rental_is_my_booking(uuid) TO authenticated;

-- Captains read rows for their own store.
DROP POLICY IF EXISTS rental_ledger_store_read ON public.rental_ledger;
CREATE POLICY rental_ledger_store_read ON public.rental_ledger FOR SELECT TO authenticated
  USING (public.current_role()::text = 'OPERATOR' AND store_id = public.current_store_id());
DROP POLICY IF EXISTS rental_ledger_rider_read ON public.rental_ledger;
CREATE POLICY rental_ledger_rider_read ON public.rental_ledger FOR SELECT TO authenticated
  USING (public.rental_is_my_booking(booking_id));
DROP POLICY IF EXISTS rental_pauses_store_read ON public.rental_pauses;
CREATE POLICY rental_pauses_store_read ON public.rental_pauses FOR SELECT TO authenticated
  USING (public.current_role()::text = 'OPERATOR' AND (store_id = public.current_store_id()
         OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.store_id = public.current_store_id())));
DROP POLICY IF EXISTS rental_pauses_rider_read ON public.rental_pauses;
CREATE POLICY rental_pauses_rider_read ON public.rental_pauses FOR SELECT TO authenticated
  USING (public.rental_is_my_booking(booking_id));
DROP POLICY IF EXISTS recovery_tasks_store_read ON public.recovery_tasks;
CREATE POLICY recovery_tasks_store_read ON public.recovery_tasks FOR SELECT TO authenticated
  USING (public.current_role()::text = 'OPERATOR' AND store_id = public.current_store_id());
DROP POLICY IF EXISTS refund_requests_store_read ON public.refund_requests;
CREATE POLICY refund_requests_store_read ON public.refund_requests FOR SELECT TO authenticated
  USING (public.current_role()::text = 'OPERATOR' AND store_id = public.current_store_id());
DROP POLICY IF EXISTS refund_requests_rider_read ON public.refund_requests;
CREATE POLICY refund_requests_rider_read ON public.refund_requests FOR SELECT TO authenticated
  USING (public.rental_is_my_booking(booking_id));
DROP POLICY IF EXISTS return_handoffs_store_read ON public.return_handoffs;
CREATE POLICY return_handoffs_store_read ON public.return_handoffs FOR SELECT TO authenticated
  USING (public.current_role()::text = 'OPERATOR'
         AND public.current_store_id() IN (booking_store_id, receiving_store_id));
DROP POLICY IF EXISTS cash_verifications_store_read ON public.cash_verifications;
CREATE POLICY cash_verifications_store_read ON public.cash_verifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_ledger l WHERE l.id = ledger_id
                 AND public.current_role()::text = 'OPERATOR' AND l.store_id = public.current_store_id()));
-- Captain Supervisor (VERIFY_CASH) checks cash from every store (D-025).
CREATE OR REPLACE FUNCTION public.rental_has_permission(p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff_permissions WHERE profile_id = auth.uid() AND permission = p_permission)
$$;
REVOKE ALL ON FUNCTION public.rental_has_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rental_has_permission(text) TO authenticated;
DROP POLICY IF EXISTS rental_ledger_cash_supervisor_read ON public.rental_ledger;
CREATE POLICY rental_ledger_cash_supervisor_read ON public.rental_ledger FOR SELECT TO authenticated
  USING (entry_type = 'PAYMENT' AND method = 'CASH' AND public.rental_has_permission('VERIFY_CASH'));
DROP POLICY IF EXISTS cash_verifications_supervisor_read ON public.cash_verifications;
CREATE POLICY cash_verifications_supervisor_read ON public.cash_verifications FOR SELECT TO authenticated
  USING (public.rental_has_permission('VERIFY_CASH'));
DROP POLICY IF EXISTS staff_permissions_self_read ON public.staff_permissions;
CREATE POLICY staff_permissions_self_read ON public.staff_permissions FOR SELECT TO authenticated
  USING (profile_id = auth.uid());
DROP POLICY IF EXISTS consent_records_rider_read ON public.consent_records;
CREATE POLICY consent_records_rider_read ON public.consent_records FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.phone = (auth.jwt() ->> 'phone')));

-- ── 10. All-or-nothing writes used by the rental-command Edge Function ──────
-- Each runs in one transaction with row locks. Callable by the service role only.
CREATE OR REPLACE FUNCTION public.rental_tx_start_pause(
  p_booking_id uuid, p_store_id uuid, p_at timestamptz, p_rider_m numeric, p_scooter_m numeric, p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text; v_id uuid;
BEGIN
  SELECT status::text INTO v_status FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'Active' THEN RAISE EXCEPTION 'Booking is not active' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO rental_pauses (booking_id, store_id, started_at, rider_distance_m, scooter_distance_m, idempotency_key)
    VALUES (p_booking_id, p_store_id, p_at, p_rider_m, p_scooter_m, p_key) RETURNING id INTO v_id;
  UPDATE bookings SET status = 'Paused', paused_at = p_at WHERE id = p_booking_id;
  RETURN v_id;
END $$;

-- Captain finished the pause inspection: scooter and battery go back into the pool (D-013, D-023).
CREATE OR REPLACE FUNCTION public.rental_tx_finish_pause_inspection(
  p_pause_id uuid, p_actor uuid, p_at timestamptz, p_checklist_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pause rental_pauses%ROWTYPE; v_vehicle uuid; v_battery uuid;
BEGIN
  SELECT * INTO v_pause FROM rental_pauses WHERE id = p_pause_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pause not found' USING ERRCODE = 'P0002'; END IF;
  IF v_pause.inspection_status = 'DONE' THEN RETURN; END IF;
  SELECT vehicle_id, battery_id INTO v_vehicle, v_battery FROM bookings WHERE id = v_pause.booking_id FOR UPDATE;
  UPDATE rental_pauses SET inspection_status = 'DONE', inspected_by = p_actor, inspected_at = p_at, checklist_id = p_checklist_id
    WHERE id = p_pause_id;
  IF v_pause.resumed_at IS NULL THEN
    UPDATE vehicles SET status = 'Available', assigned_battery_id = NULL WHERE id = v_vehicle;
    UPDATE batteries SET status = 'Available', assigned_vehicle_id = NULL WHERE id = v_battery;
  END IF;
END $$;

-- Resume with fresh assets at the Captain's store (no scooter is guaranteed, D-023).
CREATE OR REPLACE FUNCTION public.rental_tx_resume(
  p_booking_id uuid, p_store_id uuid, p_vehicle_id uuid, p_battery_id uuid, p_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pause rental_pauses%ROWTYPE; v_vs text; v_bs text;
BEGIN
  PERFORM 1 FROM bookings WHERE id = p_booking_id AND status::text = 'Paused' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking is not paused' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_pause FROM rental_pauses WHERE booking_id = p_booking_id AND resumed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No open pause' USING ERRCODE = 'P0001'; END IF;
  IF v_pause.inspection_status <> 'DONE' THEN RAISE EXCEPTION 'Pause inspection not finished' USING ERRCODE = 'P0001'; END IF;
  SELECT status::text INTO v_vs FROM vehicles WHERE id = p_vehicle_id AND store_id = p_store_id FOR UPDATE;
  SELECT status::text INTO v_bs FROM batteries WHERE id = p_battery_id AND store_id = p_store_id FOR UPDATE;
  IF v_vs IS DISTINCT FROM 'Available' THEN RAISE EXCEPTION 'Scooter not available at this store' USING ERRCODE = 'P0001'; END IF;
  IF v_bs IS DISTINCT FROM 'Available' THEN RAISE EXCEPTION 'Battery not available at this store' USING ERRCODE = 'P0001'; END IF;
  UPDATE vehicles SET status = 'In Use', assigned_battery_id = p_battery_id WHERE id = p_vehicle_id;
  UPDATE batteries SET status = 'In Use', assigned_vehicle_id = p_vehicle_id WHERE id = p_battery_id;
  UPDATE rental_pauses SET resumed_at = p_at WHERE id = v_pause.id;
  UPDATE bookings SET status = 'Active', paused_at = NULL, vehicle_id = p_vehicle_id, battery_id = p_battery_id WHERE id = p_booking_id;
END $$;

-- Close a rental (return approved or recovery completed). Assets are released only if this
-- rental still holds them, so another rider's scooter is never touched.
CREATE OR REPLACE FUNCTION public.rental_tx_close(
  p_booking_id uuid, p_at timestamptz, p_asset_store_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b bookings%ROWTYPE; v_holds boolean;
BEGIN
  SELECT * INTO v_b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;
  IF v_b.status::text IN ('Completed','Cancelled') THEN RETURN; END IF;
  v_holds := v_b.status::text = 'Active' OR NOT EXISTS (
    SELECT 1 FROM rental_pauses WHERE booking_id = p_booking_id AND resumed_at IS NULL AND inspection_status = 'DONE');
  UPDATE rental_pauses SET resumed_at = p_at WHERE booking_id = p_booking_id AND resumed_at IS NULL;
  UPDATE bookings SET status = 'Completed', completed_at = p_at WHERE id = p_booking_id;
  IF v_holds THEN
    UPDATE vehicles SET status = 'Available', assigned_battery_id = NULL, store_id = coalesce(p_asset_store_id, store_id) WHERE id = v_b.vehicle_id;
    UPDATE batteries SET status = 'Available', assigned_vehicle_id = NULL, store_id = coalesce(p_asset_store_id, store_id) WHERE id = v_b.battery_id;
  END IF;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.rental_tx_start_pause(uuid,uuid,timestamptz,numeric,numeric,text)',
    'public.rental_tx_finish_pause_inspection(uuid,uuid,timestamptz,uuid)',
    'public.rental_tx_resume(uuid,uuid,uuid,uuid,timestamptz)',
    'public.rental_tx_close(uuid,timestamptz,uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

COMMIT;
