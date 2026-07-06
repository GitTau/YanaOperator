-- Migration: 20260630150000_rider_anon_policies
-- Description: Add SELECT policies for anon role on customers, bookings, vehicles, batteries, and stores. Add INSERT policies for anon on telemetry and heartbeats.

-- 1. SELECT Policies for anon on bookings
CREATE POLICY bookings_anon_select ON public.bookings
  FOR SELECT TO anon
  USING (status IN ('Active', 'Paused', 'Draft'));

-- 2. SELECT Policies for anon on customers
CREATE POLICY customers_anon_select ON public.customers
  FOR SELECT TO anon
  USING (id IN (SELECT customer_id FROM public.bookings WHERE status IN ('Active', 'Paused', 'Draft')));

-- 3. SELECT Policies for anon on vehicles
CREATE POLICY vehicles_anon_select ON public.vehicles
  FOR SELECT TO anon
  USING (id IN (SELECT vehicle_id FROM public.bookings WHERE status IN ('Active', 'Paused', 'Draft')));

-- 4. SELECT Policies for anon on batteries
CREATE POLICY batteries_anon_select ON public.batteries
  FOR SELECT TO anon
  USING (id IN (SELECT battery_id FROM public.bookings WHERE status IN ('Active', 'Paused', 'Draft')));

-- 5. SELECT Policies for anon on stores
CREATE POLICY stores_anon_select ON public.stores
  FOR SELECT TO anon
  USING (store_id IN (SELECT store_id FROM public.bookings WHERE status IN ('Active', 'Paused', 'Draft')));

-- 6. INSERT Policies for anon on rider_telemetry
CREATE POLICY telemetry_insert_anon ON public.rider_telemetry
  FOR INSERT TO anon
  WITH CHECK (
    booking_id IN (
      SELECT id FROM public.bookings 
      WHERE customer_id = rider_telemetry.customer_id 
        AND status IN ('Active', 'Paused', 'Draft')
    )
  );

-- 7. INSERT Policies for anon on rider_heartbeats
CREATE POLICY heartbeats_insert_anon ON public.rider_heartbeats
  FOR INSERT TO anon
  WITH CHECK (
    booking_id IN (
      SELECT id FROM public.bookings 
      WHERE customer_id = rider_heartbeats.customer_id 
        AND status IN ('Active', 'Paused', 'Draft')
    )
  );
