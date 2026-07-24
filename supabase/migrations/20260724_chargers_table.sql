-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: chargers_table
-- Created:   2026-07-24
-- Purpose:   1. Create public.chargers table for storing vehicle chargers tagged to stores.
--            2. Enable RLS and permissions on public.chargers.
--            3. Add charger_id foreign key column to public.bookings.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── STEP 1: Create chargers table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chargers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id) ON DELETE CASCADE,
  serial_number text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'In Use', 'Maintenance')),
  assigned_vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.chargers IS 'EV vehicle chargers tagged to specific ZAP Point stores';
COMMENT ON COLUMN public.chargers.serial_number IS 'Unique serial number/identifier of charger e.g. CHG-001';
COMMENT ON COLUMN public.chargers.status IS 'Charger operational status: Available, In Use, Maintenance';

-- ─── STEP 2: Enable RLS and Policies ─────────────────────────────────────────

ALTER TABLE public.chargers ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'chargers' AND policyname = 'Allow read chargers'
  ) THEN
    CREATE POLICY "Allow read chargers" ON public.chargers
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'chargers' AND policyname = 'Allow all operations on chargers'
  ) THEN
    CREATE POLICY "Allow all operations on chargers" ON public.chargers
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─── STEP 3: Add charger_id to public.bookings ─────────────────────────────

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS charger_id uuid REFERENCES public.chargers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.bookings.charger_id IS 'Optional charger assigned to this rental booking';
