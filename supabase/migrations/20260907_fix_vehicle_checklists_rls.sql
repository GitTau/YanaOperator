-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Fix vehicle_checklists RLS Policy
-- Date: 2026-09-07
-- Purpose:
--   Allow operators to submit checklists across any ZAP Point store.
--   The previous policy restricted inserts to `store_id = current_store_id()`,
--   which failed whenever a Captain operated on a store different from their
--   static profiles.store_id (e.g. Kalpana vs Jagamara).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Operators see own store checklists" ON public.vehicle_checklists;
DROP POLICY IF EXISTS "vehicle_checklists_admin_all" ON public.vehicle_checklists;

CREATE POLICY "Allow all operations on vehicle_checklists"
  ON public.vehicle_checklists
  FOR ALL
  USING (true)
  WITH CHECK (true);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260907143000', '20260907_fix_vehicle_checklists_rls')
ON CONFLICT (version) DO NOTHING;
