-- Migration: 20260630_rider_telemetry
-- Description: Create rider_telemetry and rider_heartbeats tables, enable RLS, configure policies, and allow riders select access to their own booking assets.

-- 1. Create Telemetry & Heartbeat Tables
CREATE TABLE IF NOT EXISTS public.rider_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  accuracy numeric,
  speed numeric,
  heading numeric,
  battery_percentage integer,
  network_type text,
  app_version text,
  device_id text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rider_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  device_online boolean NOT NULL DEFAULT true,
  battery_percentage integer,
  network_available boolean NOT NULL DEFAULT true,
  gps_enabled boolean NOT NULL DEFAULT true,
  app_version text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rider_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_heartbeats ENABLE ROW LEVEL SECURITY;

-- 2. Add Indexes for Performance (Admin Map Queries)
CREATE INDEX IF NOT EXISTS idx_rider_telemetry_customer_created ON public.rider_telemetry(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_heartbeats_customer_created ON public.rider_heartbeats(customer_id, created_at DESC);

-- 3. Telemetry & Heartbeat Policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'telemetry_insert_rider' AND tablename = 'rider_telemetry') THEN
    CREATE POLICY telemetry_insert_rider ON public.rider_telemetry
      FOR INSERT WITH CHECK (customer_id = auth.uid() AND public.current_role() = 'RIDER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'telemetry_select_staff' AND tablename = 'rider_telemetry') THEN
    CREATE POLICY telemetry_select_staff ON public.rider_telemetry
      FOR SELECT USING (
        public.current_role() = 'ADMIN' 
        OR (public.current_role() = 'OPERATOR' AND customer_id IN (SELECT id FROM public.customers WHERE store_id = public.current_store_id()))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'heartbeats_insert_rider' AND tablename = 'rider_heartbeats') THEN
    CREATE POLICY heartbeats_insert_rider ON public.rider_heartbeats
      FOR INSERT WITH CHECK (customer_id = auth.uid() AND public.current_role() = 'RIDER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'heartbeats_select_staff' AND tablename = 'rider_heartbeats') THEN
    CREATE POLICY heartbeats_select_staff ON public.rider_heartbeats
      FOR SELECT USING (
        public.current_role() = 'ADMIN' 
        OR (public.current_role() = 'OPERATOR' AND customer_id IN (SELECT id FROM public.customers WHERE store_id = public.current_store_id()))
      );
  END IF;
END
$$;

-- 4. Enable SELECT access for RIDERs to read their own rental info
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'customers_rider_select' AND tablename = 'customers') THEN
    CREATE POLICY customers_rider_select ON public.customers
      FOR SELECT USING (id = auth.uid() AND public.current_role() = 'RIDER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bookings_rider_select' AND tablename = 'bookings') THEN
    CREATE POLICY bookings_rider_select ON public.bookings
      FOR SELECT USING (customer_id = auth.uid() AND public.current_role() = 'RIDER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'vehicles_rider_select' AND tablename = 'vehicles') THEN
    CREATE POLICY vehicles_rider_select ON public.vehicles
      FOR SELECT USING (
        id IN (SELECT vehicle_id FROM public.bookings WHERE customer_id = auth.uid() AND status IN ('Active', 'Paused', 'Draft'))
        AND public.current_role() = 'RIDER'
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'batteries_rider_select' AND tablename = 'batteries') THEN
    CREATE POLICY batteries_rider_select ON public.batteries
      FOR SELECT USING (
        id IN (SELECT battery_id FROM public.bookings WHERE customer_id = auth.uid() AND status IN ('Active', 'Paused', 'Draft'))
        AND public.current_role() = 'RIDER'
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'stores_rider_select' AND tablename = 'stores') THEN
    CREATE POLICY stores_rider_select ON public.stores
      FOR SELECT USING (
        store_id IN (SELECT store_id FROM public.bookings WHERE customer_id = auth.uid() AND status IN ('Active', 'Paused', 'Draft'))
        AND public.current_role() = 'RIDER'
      );
  END IF;
END
$$;
