-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: vehicles_master_overhaul
-- Created:   2026-06-09
-- Purpose:   1. Add make, model, battery_type columns to vehicles table
--            2. Reconcile vehicles table against the official Vehicle Master
--               List CSV (80 vehicles).
--            3. Delete or deactivate DB rows not present in the CSV.
--            4. Update store_id, make, model, battery_type for all 80 CSV
--               vehicles.
--
-- Battery type values (text, flexible — add new values as fleet grows):
--   F   = Flowatt
--   EB  = EMO Battery
--   EDD = EMO Double Display
--
-- Store ID mapping:
--   OD02 = 85e1b30b-06cb-44f9-a41c-0fa6f6642e72  (ZAP POINT OD 02)
--   OD03 = 16631cb0-30c8-46e8-a2f3-1c9a139dc2a1  (ZAP POINT OD 03)
--   OD04 = d8b3df56-1e85-4873-9278-e51670b4edd2  (ZAP POINT OD 04)
--   JH01 = ecfff4bb-66ce-41fb-9f02-3e8ff57a674d  (mapped to ZAP POINT JH 02)
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── STEP 1: Add new columns ──────────────────────────────────────────────────

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS make         text,
  ADD COLUMN IF NOT EXISTS model        text,
  ADD COLUMN IF NOT EXISTS battery_type text;

COMMENT ON COLUMN public.vehicles.make         IS 'Vehicle manufacturer. e.g. Xero';
COMMENT ON COLUMN public.vehicles.model        IS 'Vehicle model name. e.g. Mink';
COMMENT ON COLUMN public.vehicles.battery_type IS 'Battery type code. F=Flowatt, EB=EMO Battery, EDD=EMO Double Display. Add new values as fleet grows — intentionally kept as free text, not enum.';


-- ─── STEP 2: Handle vehicles NOT in the CSV ───────────────────────────────────
-- These 19 plate numbers exist in DB but are absent from the master CSV.
-- Vehicles with Active bookings CANNOT be hard-deleted (FK constraint +
-- historical record integrity). We mark them Inactive and strip battery links.
-- Vehicles with no active bookings are hard-deleted cleanly.

-- 2a. Detach batteries from vehicles-to-remove that have an Active booking
--     (so the battery can be reassigned correctly later)
UPDATE public.batteries
SET assigned_vehicle_id = NULL
WHERE assigned_vehicle_id IN (
  SELECT id FROM public.vehicles
  WHERE plate_number IN (
    'XEM123L0701',  -- Active booking — safe-deactivate only
    'XEM123L0708',  -- Active booking
    'XEM123L0715',  -- Active booking
    'XEM123L0721'   -- Active booking
  )
);

-- 2b. Mark Active-booking vehicles as Inactive (preserve booking history)
UPDATE public.vehicles
SET status = 'Inactive'
WHERE plate_number IN (
  'XEM123L0701',
  'XEM123L0708',
  'XEM123L0715',
  'XEM123L0721'
);

-- 2c. Null out any bookings referencing the remaining clean-deleteable vehicles
--     (only Draft/Completed/Cancelled bookings — Active already handled above)
UPDATE public.bookings
SET vehicle_id = NULL
WHERE vehicle_id IN (
  SELECT id FROM public.vehicles
  WHERE plate_number IN (
    'XEM123L0704',
    'XEM123L0705',
    'XEM123L0709',
    'XEM123L0712',
    'XEM123L0730',
    'XEM123L0734',
    'XEM123L0735',
    'XEM123L0739',
    'XEM123L0741',
    'XEM123L0742',
    'XEM123L0743',
    'XEM123L0886',
    'XEM123LO717',
    'XEM123LO782',
    'XEM123LO821'
  )
);

-- 2d. Null out battery assignments for those same vehicles
UPDATE public.batteries
SET assigned_vehicle_id = NULL
WHERE assigned_vehicle_id IN (
  SELECT id FROM public.vehicles
  WHERE plate_number IN (
    'XEM123L0704',
    'XEM123L0705',
    'XEM123L0709',
    'XEM123L0712',
    'XEM123L0730',
    'XEM123L0734',
    'XEM123L0735',
    'XEM123L0739',
    'XEM123L0741',
    'XEM123L0742',
    'XEM123L0743',
    'XEM123L0886',
    'XEM123LO717',
    'XEM123LO782',
    'XEM123LO821'
  )
);

-- 2e. Null out maintenance_jobs vehicle references for clean-delete vehicles
UPDATE public.maintenance_jobs
SET vehicle_id = NULL
WHERE vehicle_id IN (
  SELECT id FROM public.vehicles
  WHERE plate_number IN (
    'XEM123L0704',
    'XEM123L0705',
    'XEM123L0709',
    'XEM123L0712',
    'XEM123L0730',
    'XEM123L0734',
    'XEM123L0735',
    'XEM123L0739',
    'XEM123L0741',
    'XEM123L0742',
    'XEM123L0743',
    'XEM123L0886',
    'XEM123LO717',
    'XEM123LO782',
    'XEM123LO821'
  )
);

-- 2f. Hard delete the 15 ghost/error vehicles (no active bookings)
DELETE FROM public.vehicles
WHERE plate_number IN (
  'XEM123L0704',
  'XEM123L0705',
  'XEM123L0709',
  'XEM123L0712',
  'XEM123L0730',
  'XEM123L0734',
  'XEM123L0735',
  'XEM123L0739',
  'XEM123L0741',
  'XEM123L0742',
  'XEM123L0743',
  'XEM123L0886',
  'XEM123LO717',   -- data entry error (letter O instead of digit 0)
  'XEM123LO782',   -- data entry error
  'XEM123LO821'    -- data entry error
);


-- ─── STEP 3: Update all 80 master-list vehicles ───────────────────────────────
-- Sets make, model, battery_type, and corrects store_id for every CSV vehicle.
-- Uses a VALUES table joined by plate_number for a single clean UPDATE.

UPDATE public.vehicles AS v
SET
  make         = c.make,
  model        = c.model,
  battery_type = c.battery_type,
  store_id     = c.store_id::uuid
FROM (VALUES
  -- OD03 — Flowatt
  ('XEM123L722',  'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L729',  'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L0828', 'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L716',  'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L0789', 'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L713',  'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L0731', 'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L740',  'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L725',  'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L0797', 'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L0808', 'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L0812', 'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L0785', 'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L0822', 'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L739',  'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L701',  'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L708',  'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L737',  'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L743',  'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L0815', 'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L0830', 'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L734',  'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L0775', 'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L0825', 'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L706',  'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L0805', 'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  ('XEM123L0793', 'Xero', 'Mink', 'F',   '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  -- OD03 — EMO Battery
  ('XEM123L0791', 'Xero', 'Mink', 'EB',  '16631cb0-30c8-46e8-a2f3-1c9a139dc2a1'),
  -- OD02 — EMO Battery
  ('XEM123L0802', 'Xero', 'Mink', 'EB',  '85e1b30b-06cb-44f9-a41c-0fa6f6642e72'),
  ('XEM123L0810', 'Xero', 'Mink', 'EB',  '85e1b30b-06cb-44f9-a41c-0fa6f6642e72'),
  ('XEM123L0819', 'Xero', 'Mink', 'EB',  '85e1b30b-06cb-44f9-a41c-0fa6f6642e72'),
  ('XEM123L0820', 'Xero', 'Mink', 'EB',  '85e1b30b-06cb-44f9-a41c-0fa6f6642e72'),
  ('XEM123L735',  'Xero', 'Mink', 'EB',  '85e1b30b-06cb-44f9-a41c-0fa6f6642e72'),
  ('XEM123L0811', 'Xero', 'Mink', 'EB',  '85e1b30b-06cb-44f9-a41c-0fa6f6642e72'),
  ('XEM123L742',  'Xero', 'Mink', 'EDD', '85e1b30b-06cb-44f9-a41c-0fa6f6642e72'),
  ('XEM123L0806', 'Xero', 'Mink', 'EB',  '85e1b30b-06cb-44f9-a41c-0fa6f6642e72'),
  ('XEM123L0798', 'Xero', 'Mink', 'EB',  '85e1b30b-06cb-44f9-a41c-0fa6f6642e72'),
  ('XEM123L705',  'Xero', 'Mink', 'EB',  '85e1b30b-06cb-44f9-a41c-0fa6f6642e72'),
  ('XEM123L731',  'Xero', 'Mink', 'EB',  '85e1b30b-06cb-44f9-a41c-0fa6f6642e72'),
  ('XEM123L723',  'Xero', 'Mink', 'EB',  '85e1b30b-06cb-44f9-a41c-0fa6f6642e72'),
  -- OD02 — EDD
  ('XEM123L718',  'Xero', 'Mink', 'EDD', '85e1b30b-06cb-44f9-a41c-0fa6f6642e72'),
  ('XEM123L721',  'Xero', 'Mink', 'EDD', '85e1b30b-06cb-44f9-a41c-0fa6f6642e72'),
  -- OD04 — EMO Battery
  ('XEM123L711',  'Xero', 'Mink', 'EB',  'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  ('XEM123L733',  'Xero', 'Mink', 'EB',  'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  ('XEM123L741',  'Xero', 'Mink', 'EB',  'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  ('XEM123L0818', 'Xero', 'Mink', 'EB',  'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  ('XEM123L0826', 'Xero', 'Mink', 'EB',  'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  ('XEM123L730',  'Xero', 'Mink', 'EB',  'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  ('XEM123L0800', 'Xero', 'Mink', 'EB',  'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  ('XEM123L709',  'Xero', 'Mink', 'EB',  'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  ('XEM123L704',  'Xero', 'Mink', 'EB',  'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  ('XEM123L0807', 'Xero', 'Mink', 'EB',  'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  ('XEM123L715',  'Xero', 'Mink', 'EB',  'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  ('XEM123L720',  'Xero', 'Mink', 'EB',  'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  ('XEM123L724',  'Xero', 'Mink', 'EB',  'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  ('XEM123L0804', 'Xero', 'Mink', 'EB',  'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  ('XEM123L0817', 'Xero', 'Mink', 'EB',  'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  ('XEM123L736',  'Xero', 'Mink', 'EB',  'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  ('XEM123L738',  'Xero', 'Mink', 'EB',  'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  -- OD04 — EDD
  ('XEM123L712',  'Xero', 'Mink', 'EDD', 'd8b3df56-1e85-4873-9278-e51670b4edd2'),
  -- JH01 → mapped to JH02 store (ecfff4bb-66ce-41fb-9f02-3e8ff57a674d) — EDD
  ('XEM123L0809', 'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L0799', 'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L719',  'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L0829', 'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L0779', 'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L0823', 'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L0782', 'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L0776', 'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L0803', 'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L0827', 'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L0772', 'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L0821', 'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L710',  'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L0814', 'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L703',  'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L714',  'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L717',  'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L728',  'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L727',  'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d'),
  ('XEM123L732',  'Xero', 'Mink', 'EDD', 'ecfff4bb-66ce-41fb-9f02-3e8ff57a674d')
) AS c(plate_number, make, model, battery_type, store_id)
WHERE v.plate_number = c.plate_number;


-- ─── STEP 4: Verification query ───────────────────────────────────────────────
-- Run this after applying the migration to confirm the count is correct.
-- Expected: 80 CSV vehicles updated + 4 Inactive ghost vehicles = 84 total
-- (4 Inactive are the ones with Active bookings that could not be hard-deleted)

-- SELECT status, COUNT(*) FROM public.vehicles GROUP BY status ORDER BY status;
-- SELECT COUNT(*) FROM public.vehicles WHERE make IS NOT NULL;
-- SELECT COUNT(*) FROM public.vehicles WHERE battery_type IS NOT NULL;
