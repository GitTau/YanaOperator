-- Drop the old ambiguous record_payment overload.
--
-- The old function had parameter order: (p_booking_id uuid, p_amount numeric, p_operator_id text, p_store_id uuid)
-- Type signature: (uuid, numeric, text, uuid)
--
-- The new correct function (from fix_record_payment_rpc_remove_v_booking_ref) has:
-- Type signature: (uuid, uuid, numeric, text)
--
-- Postgres kept both as overloads because CREATE OR REPLACE only replaces when
-- the full signature matches. With two overloads in place, named-parameter calls
-- from supabase-js fail with "could not choose best candidate function".
--
-- This migration drops the old broken overload, leaving only the correct one.

DROP FUNCTION IF EXISTS public.record_payment(uuid, numeric, text, uuid);
