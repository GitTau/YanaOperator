-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260924_maintenance_and_inventory_system_v1
-- Description: Comprehensive YANA Maintenance + Inventory System v1
--   1. Extend user_role enum with 'MECHANIC'
--   2. Vehicle extensions (odometer_km)
--   3. Vehicle Make & Model normalization (XERO MINK)
--   4. Parts Catalog & Model Compatibility Master
--   5. Store-Specific Inventory balances with condition tracking
--   6. Append-only Inventory Transactions Ledger
--   7. Relational Job Cards workflow system
--   8. Relational Job Card Parts (Inventory vs Salvaged Donor tracking)
--   9. Vehicle Donor History for salvaged components
--  10. Store Purchase Requests for parts replenishment
--  11. Atomic transactional RPCs for all stock, salvage, and repair movements
--  12. Role-Based Row Level Security (RLS) policies
--  13. Security hardening (revoke anon execute on admin_set_captain_credentials)
--  14. Initial seed data for XERO MINK catalog and store inventory
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. USER ROLE EXTENSION ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'public.user_role'::regtype AND enumlabel = 'MECHANIC'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'MECHANIC';
  END IF;
END $$;

-- ── 2. VEHICLE EXTENSIONS ─────────────────────────────────────────────────────
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS odometer_km integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.vehicles.odometer_km IS 'Cumulative odometer reading in kilometers';

-- ── 3. MAKE & MODEL NORMALIZATION ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_makes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicle_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  make_id uuid NOT NULL REFERENCES public.vehicle_makes(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_vehicle_models_make_name UNIQUE (make_id, name)
);

-- Seed initial make/model for current fleet
INSERT INTO public.vehicle_makes (name)
VALUES ('XERO')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.vehicle_models (make_id, name)
SELECT id, 'MINK' FROM public.vehicle_makes WHERE name = 'XERO'
ON CONFLICT (make_id, name) DO NOTHING;

-- ── 4. PARTS CATALOG MASTER ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.parts_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'BRAKES', 'ELECTRICAL', 'DRIVE_MOTOR', 'BODY_CHASSIS',
    'WHEELS_TIRES', 'SUSPENSION', 'LOCKS_KEYS', 'CONSUMABLES', 'ACCESSORIES'
  )),
  subpart text,
  unit text NOT NULL DEFAULT 'PIECE',
  base_price numeric(10,2) NOT NULL DEFAULT 0.00,
  gst_rate numeric(5,2) NOT NULL DEFAULT 18.00,
  mrp numeric(10,2) NOT NULL DEFAULT 0.00,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.part_model_compatibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.parts_catalog(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES public.vehicle_models(id) ON DELETE CASCADE,
  notes text,
  CONSTRAINT uq_part_model_compatibility UNIQUE (part_id, model_id)
);

CREATE INDEX IF NOT EXISTS idx_parts_catalog_category ON public.parts_catalog(category);
CREATE INDEX IF NOT EXISTS idx_parts_catalog_active ON public.parts_catalog(is_active);
CREATE INDEX IF NOT EXISTS idx_part_compatibility_model ON public.part_model_compatibility(model_id);

-- ── 5. STORE INVENTORY (Per-store physical stock) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES public.parts_catalog(id) ON DELETE CASCADE,
  condition text NOT NULL DEFAULT 'NEW' CHECK (condition IN ('NEW', 'REFURBISHED', 'SALVAGED')),
  quantity_on_hand integer NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  reorder_level integer NOT NULL DEFAULT 3,
  reorder_quantity integer NOT NULL DEFAULT 10,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_store_inventory_part_condition UNIQUE (store_id, part_id, condition)
);

CREATE INDEX IF NOT EXISTS idx_store_inventory_store ON public.store_inventory(store_id);
CREATE INDEX IF NOT EXISTS idx_store_inventory_part ON public.store_inventory(part_id);

-- ── 6. APPEND-ONLY INVENTORY TRANSACTION LEDGER ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES public.parts_catalog(id) ON DELETE CASCADE,
  condition text NOT NULL DEFAULT 'NEW' CHECK (condition IN ('NEW', 'REFURBISHED', 'SALVAGED')),
  transaction_type text NOT NULL CHECK (transaction_type IN (
    'PURCHASE_INWARD', 'JOB_CARD_CONSUMED', 'SALVAGED_INWARD',
    'TRANSFER_IN', 'TRANSFER_OUT', 'AUDIT_ADJUSTMENT', 'SCRAPPED'
  )),
  quantity integer NOT NULL, -- negative for deduction, positive for addition
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  unit_cost numeric(10,2) NOT NULL DEFAULT 0.00,
  job_card_id uuid,          -- populated if consumed on repair
  donor_vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL, -- if salvaged
  target_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,   -- if transfer
  purchase_request_id uuid,  -- if fulfilled from purchase request
  notes text,
  performed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_tx_store ON public.inventory_transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_part ON public.inventory_transactions(part_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_created ON public.inventory_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_tx_job_card ON public.inventory_transactions(job_card_id);

-- ── 7. DIGITAL JOB CARDS ──────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.job_card_number_seq START WITH 1001;

CREATE TABLE IF NOT EXISTS public.job_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_card_number text NOT NULL UNIQUE DEFAULT ('JC-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('public.job_card_number_seq')::text, 4, '0')),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  trigger_type text NOT NULL DEFAULT 'CAPTAIN_REPORT' CHECK (trigger_type IN ('CAPTAIN_REPORT', 'PERIODIC_SOP', 'RIDER_INCIDENT', 'BREAKDOWN')),
  reported_issue text NOT NULL,
  severity text NOT NULL DEFAULT 'MINOR' CHECK (severity IN ('MINOR', 'MAJOR', 'CRITICAL')),
  priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN (
    'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PARTS',
    'READY_FOR_TEST', 'READY_FOR_DEPLOYMENT', 'CLOSED', 'CANCELLED'
  )),
  odometer_km integer NOT NULL DEFAULT 0,
  diagnosis text,
  repair_notes text,
  roadworthiness_confirmed boolean NOT NULL DEFAULT false,
  final_test_notes text,
  labour_cost numeric(10,2) NOT NULL DEFAULT 0.00,
  parts_cost numeric(10,2) NOT NULL DEFAULT 0.00,
  total_cost numeric(10,2) GENERATED ALWAYS AS (labour_cost + parts_cost) STORED,
  reported_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_mechanic_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  qc_inspector_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_job_cards_vehicle ON public.job_cards(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_store ON public.job_cards(store_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_status ON public.job_cards(status);
CREATE INDEX IF NOT EXISTS idx_job_cards_created ON public.job_cards(created_at DESC);

-- ── 8. JOB CARD PARTS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_card_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_card_id uuid NOT NULL REFERENCES public.job_cards(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES public.parts_catalog(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  source_type text NOT NULL CHECK (source_type IN ('INVENTORY', 'SALVAGED_DIRECT', 'SALVAGED_INVENTORY')),
  condition text NOT NULL DEFAULT 'NEW' CHECK (condition IN ('NEW', 'REFURBISHED', 'SALVAGED')),
  donor_vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  inventory_transaction_id uuid REFERENCES public.inventory_transactions(id) ON DELETE SET NULL,
  unit_cost numeric(10,2) NOT NULL DEFAULT 0.00,
  installed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  installed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_card_parts_job ON public.job_card_parts(job_card_id);
CREATE INDEX IF NOT EXISTS idx_job_card_parts_part ON public.job_card_parts(part_id);

-- ── 9. VEHICLE DONOR HISTORY (Salvage Registry) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_donor_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  part_id uuid NOT NULL REFERENCES public.parts_catalog(id) ON DELETE RESTRICT,
  recipient_vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  job_card_id uuid REFERENCES public.job_cards(id) ON DELETE SET NULL,
  condition text NOT NULL DEFAULT 'SALVAGED' CHECK (condition IN ('REFURBISHED', 'SALVAGED')),
  notes text,
  removed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  harvested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_donor_history_donor ON public.vehicle_donor_history(donor_vehicle_id);
CREATE INDEX IF NOT EXISTS idx_donor_history_recipient ON public.vehicle_donor_history(recipient_vehicle_id);

-- ── 10. STORE PURCHASE REQUESTS ──────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.purchase_request_number_seq START WITH 1001;

CREATE TABLE IF NOT EXISTS public.purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL UNIQUE DEFAULT ('PR-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('public.purchase_request_number_seq')::text, 4, '0')),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  part_id uuid NOT NULL REFERENCES public.parts_catalog(id) ON DELETE RESTRICT,
  quantity_requested integer NOT NULL CHECK (quantity_requested > 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED')),
  reason text,
  requested_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_store ON public.purchase_requests(store_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON public.purchase_requests(status);

-- ── 11. TRANSACTIONAL RPCs ───────────────────────────────────────────────────

-- RPC: create_job_card
CREATE OR REPLACE FUNCTION public.create_job_card(
  p_vehicle_id uuid,
  p_store_id uuid,
  p_trigger_type text,
  p_reported_issue text,
  p_severity text,
  p_priority text DEFAULT 'NORMAL',
  p_odometer_km integer DEFAULT 0,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_card_id uuid;
  v_job_card_number text;
  v_current_user_id uuid := auth.uid();
BEGIN
  -- Insert the Job Card
  INSERT INTO public.job_cards (
    vehicle_id, store_id, trigger_type, reported_issue,
    severity, priority, odometer_km, repair_notes, reported_by
  )
  VALUES (
    p_vehicle_id, p_store_id, p_trigger_type, p_reported_issue,
    p_severity, p_priority, p_odometer_km, p_notes, v_current_user_id
  )
  RETURNING id, job_card_number INTO v_job_card_id, v_job_card_number;

  -- Ensure vehicle status is strictly 'Maintenance'
  UPDATE public.vehicles
  SET status = 'Maintenance',
      odometer_km = GREATEST(odometer_km, p_odometer_km),
      updated_at = now()
  WHERE id = p_vehicle_id;

  RETURN jsonb_build_object(
    'success', true,
    'job_card_id', v_job_card_id,
    'job_card_number', v_job_card_number
  );
END;
$$;

-- RPC: consume_job_card_part (atomic inventory deduction + ledger record)
CREATE OR REPLACE FUNCTION public.consume_job_card_part(
  p_job_card_id uuid,
  p_part_id uuid,
  p_quantity integer DEFAULT 1,
  p_condition text DEFAULT 'NEW'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_store_id uuid;
  v_vehicle_id uuid;
  v_current_stock integer;
  v_new_stock integer;
  v_unit_cost numeric(10,2);
  v_inv_tx_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  -- Get job card context
  SELECT store_id, vehicle_id INTO v_store_id, v_vehicle_id
  FROM public.job_cards WHERE id = p_job_card_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job Card % not found', p_job_card_id;
  END IF;

  -- Get part cost
  SELECT mrp INTO v_unit_cost FROM public.parts_catalog WHERE id = p_part_id;

  -- Lock and check store inventory
  SELECT quantity_on_hand INTO v_current_stock
  FROM public.store_inventory
  WHERE store_id = v_store_id AND part_id = p_part_id AND condition = p_condition
  FOR UPDATE;

  IF v_current_stock IS NULL OR v_current_stock < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock in store. Available: %, Requested: %', COALESCE(v_current_stock, 0), p_quantity;
  END IF;

  v_new_stock := v_current_stock - p_quantity;

  -- Decrement inventory
  UPDATE public.store_inventory
  SET quantity_on_hand = v_new_stock, updated_at = now()
  WHERE store_id = v_store_id AND part_id = p_part_id AND condition = p_condition;

  -- Write to immutable ledger
  INSERT INTO public.inventory_transactions (
    store_id, part_id, condition, transaction_type, quantity,
    balance_after, unit_cost, job_card_id, performed_by
  )
  VALUES (
    v_store_id, p_part_id, p_condition, 'JOB_CARD_CONSUMED', -p_quantity,
    v_new_stock, v_unit_cost, p_job_card_id, v_user_id
  )
  RETURNING id INTO v_inv_tx_id;

  -- Record part installed on job card
  INSERT INTO public.job_card_parts (
    job_card_id, part_id, quantity, source_type, condition,
    inventory_transaction_id, unit_cost, installed_by
  )
  VALUES (
    p_job_card_id, p_part_id, p_quantity, 'INVENTORY', p_condition,
    v_inv_tx_id, v_unit_cost, v_user_id
  );

  -- Update job card parts cost
  UPDATE public.job_cards
  SET parts_cost = parts_cost + (v_unit_cost * p_quantity),
      updated_at = now()
  WHERE id = p_job_card_id;

  RETURN jsonb_build_object(
    'success', true,
    'inventory_transaction_id', v_inv_tx_id,
    'new_stock_balance', v_new_stock
  );
END;
$$;

-- RPC: record_salvaged_part (harvest from scrap / dead vehicle)
CREATE OR REPLACE FUNCTION public.record_salvaged_part(
  p_job_card_id uuid,
  p_part_id uuid,
  p_donor_vehicle_id uuid,
  p_condition text DEFAULT 'SALVAGED',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_store_id uuid;
  v_recipient_vehicle_id uuid;
  v_donor_status text;
  v_donor_plate text;
  v_inv_tx_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  -- Validate Job Card
  SELECT store_id, vehicle_id INTO v_store_id, v_recipient_vehicle_id
  FROM public.job_cards WHERE id = p_job_card_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job Card % not found', p_job_card_id;
  END IF;

  -- Validate Donor vehicle
  SELECT status, plate_number INTO v_donor_status, v_donor_plate
  FROM public.vehicles WHERE id = p_donor_vehicle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Donor vehicle % not found', p_donor_vehicle_id;
  END IF;

  IF p_donor_vehicle_id = v_recipient_vehicle_id THEN
    RAISE EXCEPTION 'Vehicle cannot harvest parts from itself';
  END IF;

  IF v_donor_status NOT IN ('Maintenance', 'Inactive') THEN
    RAISE EXCEPTION 'Donor vehicle % must be in Maintenance or Inactive status (currently %)', v_donor_plate, v_donor_status;
  END IF;

  -- Record in donor history audit trail
  INSERT INTO public.vehicle_donor_history (
    donor_vehicle_id, part_id, recipient_vehicle_id, job_card_id,
    condition, notes, removed_by
  )
  VALUES (
    p_donor_vehicle_id, p_part_id, v_recipient_vehicle_id, p_job_card_id,
    p_condition, p_notes, v_user_id
  );

  -- Record in job_card_parts (cost is 0 for salvaged part)
  INSERT INTO public.job_card_parts (
    job_card_id, part_id, quantity, source_type, condition,
    donor_vehicle_id, unit_cost, installed_by
  )
  VALUES (
    p_job_card_id, p_part_id, 1, 'SALVAGED_DIRECT', p_condition,
    p_donor_vehicle_id, 0.00, v_user_id
  );

  -- Write ledger record for visibility
  INSERT INTO public.inventory_transactions (
    store_id, part_id, condition, transaction_type, quantity,
    balance_after, unit_cost, job_card_id, donor_vehicle_id, notes, performed_by
  )
  VALUES (
    v_store_id, p_part_id, p_condition, 'SALVAGED_INWARD', 1,
    (SELECT COALESCE(quantity_on_hand, 0) FROM public.store_inventory WHERE store_id = v_store_id AND part_id = p_part_id AND condition = p_condition),
    0.00, p_job_card_id, p_donor_vehicle_id, 'Direct harvest to Job Card', v_user_id
  )
  RETURNING id INTO v_inv_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'donor_plate', v_donor_plate,
    'transaction_id', v_inv_tx_id
  );
END;
$$;

-- RPC: complete_job_card (QC check + vehicle release)
CREATE OR REPLACE FUNCTION public.complete_job_card(
  p_job_card_id uuid,
  p_roadworthiness_confirmed boolean,
  p_final_test_notes text DEFAULT NULL,
  p_labour_cost numeric(10,2) DEFAULT 0.00
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_vehicle_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF NOT p_roadworthiness_confirmed THEN
    RAISE EXCEPTION 'Roadworthiness QC must be confirmed before closing Job Card';
  END IF;

  SELECT vehicle_id INTO v_vehicle_id FROM public.job_cards WHERE id = p_job_card_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job Card % not found', p_job_card_id;
  END IF;

  -- Close Job Card
  UPDATE public.job_cards
  SET status = 'CLOSED',
      roadworthiness_confirmed = true,
      final_test_notes = p_final_test_notes,
      labour_cost = COALESCE(p_labour_cost, 0.00),
      qc_inspector_id = v_user_id,
      closed_at = now(),
      updated_at = now()
  WHERE id = p_job_card_id;

  -- Release vehicle back to Available
  UPDATE public.vehicles
  SET status = 'Available',
      updated_at = now()
  WHERE id = v_vehicle_id;

  RETURN jsonb_build_object(
    'success', true,
    'vehicle_id', v_vehicle_id,
    'status', 'Available'
  );
END;
$$;

-- RPC: adjust_store_inventory (inward, adjustment, or manual stock take)
CREATE OR REPLACE FUNCTION public.adjust_store_inventory(
  p_store_id uuid,
  p_part_id uuid,
  p_condition text,
  p_quantity_change integer,
  p_transaction_type text,
  p_unit_cost numeric(10,2) DEFAULT 0.00,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_stock integer := 0;
  v_new_stock integer := 0;
  v_tx_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  -- Insert or get row
  INSERT INTO public.store_inventory (store_id, part_id, condition, quantity_on_hand)
  VALUES (p_store_id, p_part_id, p_condition, 0)
  ON CONFLICT (store_id, part_id, condition) DO NOTHING;

  SELECT quantity_on_hand INTO v_current_stock
  FROM public.store_inventory
  WHERE store_id = p_store_id AND part_id = p_part_id AND condition = p_condition
  FOR UPDATE;

  v_new_stock := v_current_stock + p_quantity_change;

  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'Stock cannot fall below zero. Current: %, Change: %', v_current_stock, p_quantity_change;
  END IF;

  UPDATE public.store_inventory
  SET quantity_on_hand = v_new_stock, updated_at = now()
  WHERE store_id = p_store_id AND part_id = p_part_id AND condition = p_condition;

  INSERT INTO public.inventory_transactions (
    store_id, part_id, condition, transaction_type, quantity,
    balance_after, unit_cost, notes, performed_by
  )
  VALUES (
    p_store_id, p_part_id, p_condition, p_transaction_type, p_quantity_change,
    v_new_stock, p_unit_cost, p_notes, v_user_id
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'balance_after', v_new_stock,
    'transaction_id', v_tx_id
  );
END;
$$;

-- RPC: transfer_store_inventory (atomic inter-store stock movement)
CREATE OR REPLACE FUNCTION public.transfer_store_inventory(
  p_source_store_id uuid,
  p_target_store_id uuid,
  p_part_id uuid,
  p_condition text,
  p_quantity integer,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_src_stock integer;
  v_src_new integer;
  v_tgt_stock integer;
  v_tgt_new integer;
  v_user_id uuid := auth.uid();
BEGIN
  IF p_source_store_id = p_target_store_id THEN
    RAISE EXCEPTION 'Source and target stores must be distinct';
  END IF;

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Transfer quantity must be greater than zero';
  END IF;

  -- Lock source
  SELECT quantity_on_hand INTO v_src_stock
  FROM public.store_inventory
  WHERE store_id = p_source_store_id AND part_id = p_part_id AND condition = p_condition
  FOR UPDATE;

  IF v_src_stock IS NULL OR v_src_stock < p_quantity THEN
    RAISE EXCEPTION 'Insufficient source stock. Available: %, Requested: %', COALESCE(v_src_stock, 0), p_quantity;
  END IF;

  -- Ensure target row exists
  INSERT INTO public.store_inventory (store_id, part_id, condition, quantity_on_hand)
  VALUES (p_target_store_id, p_part_id, p_condition, 0)
  ON CONFLICT (store_id, part_id, condition) DO NOTHING;

  -- Lock target
  SELECT quantity_on_hand INTO v_tgt_stock
  FROM public.store_inventory
  WHERE store_id = p_target_store_id AND part_id = p_part_id AND condition = p_condition
  FOR UPDATE;

  v_src_new := v_src_stock - p_quantity;
  v_tgt_new := v_tgt_stock + p_quantity;

  -- Update balances
  UPDATE public.store_inventory
  SET quantity_on_hand = v_src_new, updated_at = now()
  WHERE store_id = p_source_store_id AND part_id = p_part_id AND condition = p_condition;

  UPDATE public.store_inventory
  SET quantity_on_hand = v_tgt_new, updated_at = now()
  WHERE store_id = p_target_store_id AND part_id = p_part_id AND condition = p_condition;

  -- Ledger out
  INSERT INTO public.inventory_transactions (
    store_id, part_id, condition, transaction_type, quantity,
    balance_after, target_store_id, notes, performed_by
  )
  VALUES (
    p_source_store_id, p_part_id, p_condition, 'TRANSFER_OUT', -p_quantity,
    v_src_new, p_target_store_id, p_notes, v_user_id
  );

  -- Ledger in
  INSERT INTO public.inventory_transactions (
    store_id, part_id, condition, transaction_type, quantity,
    balance_after, target_store_id, notes, performed_by
  )
  VALUES (
    p_target_store_id, p_part_id, p_condition, 'TRANSFER_IN', p_quantity,
    v_tgt_new, p_source_store_id, p_notes, v_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'source_balance', v_src_new,
    'target_balance', v_tgt_new
  );
END;
$$;

-- ── 12. ROW LEVEL SECURITY (RLS) POLICIES ────────────────────────────────────

ALTER TABLE public.vehicle_makes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parts_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_model_compatibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_card_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_donor_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;

-- Catalog & Makes/Models: readable by all authenticated users; writable by ADMIN
CREATE POLICY "Allow read access to vehicle makes"
  ON public.vehicle_makes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin write access to vehicle makes"
  ON public.vehicle_makes FOR ALL TO authenticated
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN');

CREATE POLICY "Allow read access to vehicle models"
  ON public.vehicle_models FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin write access to vehicle models"
  ON public.vehicle_models FOR ALL TO authenticated
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN');

CREATE POLICY "Allow read access to parts catalog"
  ON public.parts_catalog FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin write access to parts catalog"
  ON public.parts_catalog FOR ALL TO authenticated
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN');

CREATE POLICY "Allow read access to part compatibility"
  ON public.part_model_compatibility FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin write access to part compatibility"
  ON public.part_model_compatibility FOR ALL TO authenticated
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN');

-- Store Inventory: readable by Admin or users assigned to that store
CREATE POLICY "Store inventory read policy"
  ON public.store_inventory FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN'
    OR store_id = (SELECT store_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "Store inventory admin write policy"
  ON public.store_inventory FOR ALL TO authenticated
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN');

-- Inventory Transactions: readable by Admin or own store users
CREATE POLICY "Inventory transactions read policy"
  ON public.inventory_transactions FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN'
    OR store_id = (SELECT store_id FROM public.users WHERE id = auth.uid())
  );

-- Job Cards: readable and updatable by Admin, store Operators, and store Mechanics
CREATE POLICY "Job cards select policy"
  ON public.job_cards FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN'
    OR store_id = (SELECT store_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "Job cards insert policy"
  ON public.job_cards FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('ADMIN', 'OPERATOR', 'MECHANIC')
  );

CREATE POLICY "Job cards update policy"
  ON public.job_cards FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN'
    OR store_id = (SELECT store_id FROM public.users WHERE id = auth.uid())
  );

-- Job Card Parts: readable and insertable by store staff
CREATE POLICY "Job card parts select policy"
  ON public.job_card_parts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Job card parts insert policy"
  ON public.job_card_parts FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('ADMIN', 'OPERATOR', 'MECHANIC')
  );

-- Donor History: readable by authenticated users
CREATE POLICY "Donor history select policy"
  ON public.vehicle_donor_history FOR SELECT TO authenticated USING (true);

-- Purchase Requests: readable by Admin or own store staff; insertable by store staff
CREATE POLICY "Purchase requests select policy"
  ON public.purchase_requests FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN'
    OR store_id = (SELECT store_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "Purchase requests insert policy"
  ON public.purchase_requests FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('ADMIN', 'OPERATOR', 'MECHANIC')
  );

CREATE POLICY "Purchase requests update policy"
  ON public.purchase_requests FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN'
    OR store_id = (SELECT store_id FROM public.users WHERE id = auth.uid())
  );

-- ── 13. SECURITY HARDENING ───────────────────────────────────────────────────
-- Revoke anon execute on sensitive credential function if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'admin_set_captain_credentials'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.admin_set_captain_credentials FROM public, anon;
  END IF;
END $$;

-- ── 14. SEED DATA (Physical Spare Parts for XERO MINK) ────────────────────────
DO $$
DECLARE
  v_model_id uuid;
  v_part_id uuid;
BEGIN
  SELECT id INTO v_model_id FROM public.vehicle_models WHERE name = 'MINK' LIMIT 1;

  -- 1. Brakes
  INSERT INTO public.parts_catalog (part_code, name, category, subpart, base_price, gst_rate, mrp)
  VALUES
    ('BRK-SHOE-R', 'Brake Shoe (Rear)', 'BRAKES', 'Rear Drum', 252.00, 18.00, 300.00),
    ('BRK-SHOE-F', 'Brake Shoe (Front)', 'BRAKES', 'Front Drum', 252.00, 18.00, 300.00),
    ('BRK-WIRE-F', 'Brake Wire (Front)', 'BRAKES', 'Front Cable', 150.00, 18.00, 200.00),
    ('BRK-WIRE-R', 'Brake Wire (Rear)', 'BRAKES', 'Rear Cable', 130.00, 18.00, 200.00),
    ('BRK-LEVR-SET', 'Brake Lever Set (L+R)', 'BRAKES', 'Levers & Yoke', 380.00, 18.00, 450.00),
    ('BRK-DRUM-R', 'Drum Plate (Rear)', 'BRAKES', 'Rear Drum Assembly', 530.00, 18.00, 650.00),
    ('BRK-DRUM-F', 'Drum Plate (Front)', 'BRAKES', 'Front Drum Assembly', 450.00, 18.00, 550.00)
  ON CONFLICT (part_code) DO NOTHING;

  -- 2. Drive & Motor
  INSERT INTO public.parts_catalog (part_code, name, category, subpart, base_price, gst_rate, mrp)
  VALUES
    ('MOT-BLDC-48V', 'BLDC Hub Motor 48V', 'DRIVE_MOTOR', 'Hub Motor', 5000.00, 18.00, 5900.00),
    ('CTR-48V-STD', 'Motor Controller 48V', 'DRIVE_MOTOR', 'Controller Unit', 3250.00, 18.00, 3835.00),
    ('THROT-ASM', 'Throttle Assembly with Grips', 'DRIVE_MOTOR', 'Handle Control', 335.00, 18.00, 400.00),
    ('FAN-MTR-COOL', 'Motor Cooling Fan Assembly', 'DRIVE_MOTOR', 'Cooling System', 635.00, 18.00, 750.00)
  ON CONFLICT (part_code) DO NOTHING;

  -- 3. Electrical & Lighting
  INSERT INTO public.parts_catalog (part_code, name, category, subpart, base_price, gst_rate, mrp)
  VALUES
    ('ELE-CONV-12V', 'DC-DC Converter (48V to 12V)', 'ELECTRICAL', 'Power Electronics', 335.00, 18.00, 400.00),
    ('ELE-HDLT-LED', 'LED Headlight Unit', 'ELECTRICAL', 'Front Lighting', 475.00, 18.00, 600.00),
    ('ELE-TLLT-LED', 'LED Tail Light Unit', 'ELECTRICAL', 'Rear Lighting', 300.00, 18.00, 400.00),
    ('ELE-HORN-12V', '12V Horn Unit', 'ELECTRICAL', 'Audible Warning', 200.00, 18.00, 250.00),
    ('ELE-DISP-SOC', 'Digital Instrument Cluster / SOC', 'ELECTRICAL', 'Dashboard Display', 350.00, 18.00, 450.00),
    ('ELE-SW-COMB', 'Combination Handlebar Switch', 'ELECTRICAL', 'Switch Cluster', 335.00, 18.00, 400.00),
    ('ELE-MCB-63A', 'Battery Main MCB Breaker', 'ELECTRICAL', 'Safety Circuit', 150.00, 18.00, 200.00),
    ('ELE-HARN-MAIN', 'Main Wiring Harness', 'ELECTRICAL', 'Wiring Loom', 1200.00, 18.00, 1400.00),
    ('ELE-GPS-IOT', 'GPS Telematics IoT Tracker', 'ELECTRICAL', 'Fleet IoT', 1550.00, 18.00, 1829.00),
    ('ELE-GPS-SIM', 'M2M SIM Card Module', 'ELECTRICAL', 'Connectivity', 550.00, 18.00, 650.00),
    ('ELE-BAT-CONN', 'Heavy Duty Battery Anderson Connector', 'ELECTRICAL', 'Power Port', 420.00, 18.00, 500.00)
  ON CONFLICT (part_code) DO NOTHING;

  -- 4. Wheels, Tyres & Suspension
  INSERT INTO public.parts_catalog (part_code, name, category, subpart, base_price, gst_rate, mrp)
  VALUES
    ('TYR-TUBELESS', 'Tubeless EV Tyre (90/90-12)', 'WHEELS_TIRES', 'Tyre', 1350.00, 18.00, 1593.00),
    ('TYR-VALV-F', 'Tubeless Tyre Valve (Front)', 'WHEELS_TIRES', 'Valve Stem', 250.00, 18.00, 300.00),
    ('TYR-VALV-R', 'Tubeless Tyre Valve (Rear)', 'WHEELS_TIRES', 'Valve Stem', 250.00, 18.00, 300.00),
    ('WHL-RIM-ALLOY', 'Alloy Wheel Rim', 'WHEELS_TIRES', 'Wheel Rim', 1500.00, 18.00, 1750.00),
    ('BRG-WHL-F', 'Front Wheel Bearing Set', 'WHEELS_TIRES', 'Bearings', 180.00, 18.00, 220.00),
    ('BRG-HNDL-CONE', 'Handlebar Cone Bearing Set', 'SUSPENSION', 'Steering Head', 280.00, 18.00, 350.00),
    ('SUS-SHOCK-R', 'Rear Hydraulic Shock Absorbers (Pair)', 'SUSPENSION', 'Rear Suspension', 1400.00, 18.00, 1650.00),
    ('SUS-FORK-F', 'Front Telescopic Fork Set', 'SUSPENSION', 'Front Suspension', 2400.00, 18.00, 2800.00)
  ON CONFLICT (part_code) DO NOTHING;

  -- 5. Body, Chassis & Locks
  INSERT INTO public.parts_catalog (part_code, name, category, subpart, base_price, gst_rate, mrp)
  VALUES
    ('BOD-MDGD-F', 'Front Mudguard', 'BODY_CHASSIS', 'Fender', 400.00, 18.00, 500.00),
    ('BOD-MDGD-R', 'Rear Mudguard', 'BODY_CHASSIS', 'Fender', 400.00, 18.00, 500.00),
    ('BOD-MDST-F', 'Front Mudguard Stay Rod', 'BODY_CHASSIS', 'Bracket', 90.00, 18.00, 150.00),
    ('BOD-MDST-R', 'Rear Mudguard Stay Rod', 'BODY_CHASSIS', 'Bracket', 90.00, 18.00, 150.00),
    ('BOD-SEAT-ASM', 'Complete Seat Assembly', 'BODY_CHASSIS', 'Seat Cushion', 950.00, 18.00, 1150.00),
    ('BOD-STND-SIDE', 'Side Stand with Sensor', 'BODY_CHASSIS', 'Kickstand', 350.00, 18.00, 420.00),
    ('BOD-STND-SPRG', 'Side Stand Spring', 'BODY_CHASSIS', 'Spring', 80.00, 18.00, 100.00),
    ('BOD-PLT-NUM', 'HSRP Number Plate Bracket & Plate', 'BODY_CHASSIS', 'Registration Plate', 70.00, 18.00, 100.00),
    ('LCK-IGN-SEAT', 'Key Lock Set (Ignition + Seat Lock)', 'LOCKS_KEYS', 'Tumbler & Keys', 380.00, 18.00, 450.00),
    ('LCK-SEAT-HOOK', 'Seat Lock Hook & Catcher Assembly', 'LOCKS_KEYS', 'Latch Mechanism', 150.00, 18.00, 200.00),
    ('LCK-SEAT-CABL', 'Seat Lock Release Cable', 'LOCKS_KEYS', 'Cable', 120.00, 18.00, 150.00),
    ('CSM-BOLT-KIT', 'High-Tensile Fasteners & Bolt Kit', 'CONSUMABLES', 'Hardware', 250.00, 18.00, 300.00)
  ON CONFLICT (part_code) DO NOTHING;

  -- Link all active parts to XERO MINK model
  IF v_model_id IS NOT NULL THEN
    INSERT INTO public.part_model_compatibility (part_id, model_id, notes)
    SELECT p.id, v_model_id, 'Standard OEM fit for XERO MINK'
    FROM public.parts_catalog p
    ON CONFLICT (part_id, model_id) DO NOTHING;
  END IF;
END $$;
