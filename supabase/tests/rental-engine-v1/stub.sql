-- Synthetic stand-in for the live Yana schema (only what the migration touches).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE TYPE public.user_role AS ENUM ('ADMIN','OPERATOR','RIDER','MECHANIC');
CREATE TABLE public.stores (store_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, role public.user_role NOT NULL, store_id uuid REFERENCES public.stores(store_id));
CREATE TABLE public.customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), phone text UNIQUE, store_id uuid);
CREATE TYPE public.booking_status AS ENUM ('Draft','Active','Paused','Completed','Cancelled');
CREATE TYPE public.vehicle_status AS ENUM ('Available','In Use','Maintenance','Inactive');
CREATE TYPE public.battery_status AS ENUM ('Available','In Use','Maintenance');
CREATE TABLE public.vehicles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid, status public.vehicle_status, assigned_battery_id uuid);
CREATE TABLE public.batteries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid, status public.battery_status, assigned_vehicle_id uuid);
CREATE TABLE public.bookings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid REFERENCES public.customers(id), store_id uuid REFERENCES public.stores(store_id),
  status public.booking_status, vehicle_id uuid, battery_id uuid, paused_at timestamptz, completed_at timestamptz);
CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES public.bookings(id),
  store_id uuid NOT NULL REFERENCES public.stores(store_id), amount numeric NOT NULL, payment_method text DEFAULT 'ONLINE_RAZORPAY',
  status text DEFAULT 'Successful', razorpay_order_id text, razorpay_payment_id text, razorpay_signature text,
  collected_by text, created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION public.current_role() RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;
CREATE FUNCTION public.current_store_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT store_id FROM public.profiles WHERE id = auth.uid() $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.bookings, public.customers TO authenticated;
CREATE TABLE public.captains (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid, status text);
CREATE TABLE public.appraisal_cycles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), start_date date, status text);
CREATE TABLE public.task_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), captain_id uuid, cycle_id uuid, week_number int, date date,
  task_type text, task_name text, status text DEFAULT 'pending', operator_remarks text, is_recurring boolean DEFAULT false);
