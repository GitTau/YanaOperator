-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Captain Auth Credentials & Management
-- Enables Unique ID + Password auth for captains on Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Extend public.captains table with login credentials references
ALTER TABLE public.captains
  ADD COLUMN IF NOT EXISTS login_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phone text;

-- Index for fast lookup by login_id and auth_user_id
CREATE INDEX IF NOT EXISTS idx_captains_login_id ON public.captains(login_id);
CREATE INDEX IF NOT EXISTS idx_captains_auth_user_id ON public.captains(auth_user_id);

-- 2. Extend public.profiles table with captain link
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS captain_id uuid REFERENCES public.captains(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_captain_id ON public.profiles(captain_id);

-- 3. Auto-sync store_id to profiles when captain store is updated
CREATE OR REPLACE FUNCTION public.sync_captain_store_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
    UPDATE public.profiles
    SET store_id = NEW.store_id
    WHERE (captain_id = NEW.id OR id = NEW.auth_user_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_captain_store ON public.captains;
CREATE TRIGGER trg_sync_captain_store
  AFTER UPDATE OF store_id ON public.captains
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_captain_store_to_profile();

-- 4. RPC Function for Admin: Set or Reset Captain Credentials
CREATE OR REPLACE FUNCTION public.admin_set_captain_credentials(
  p_captain_id uuid,
  p_login_id text,
  p_password text
)
RETURNS jsonb AS $$
DECLARE
  v_captain RECORD;
  v_login_id text;
  v_email text;
  v_user_id uuid;
BEGIN
  -- Normalize and sanitize login_id
  v_login_id := lower(trim(p_login_id));
  
  IF length(v_login_id) < 3 THEN
    RAISE EXCEPTION 'Operator ID must be at least 3 characters long.';
  END IF;

  IF v_login_id !~ '^[a-z0-9_-]+$' THEN
    RAISE EXCEPTION 'Operator ID may only contain letters, numbers, hyphens, and underscores.';
  END IF;

  IF length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters long.';
  END IF;

  -- Verify captain exists
  SELECT * INTO v_captain FROM public.captains WHERE id = p_captain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Captain with ID % not found.', p_captain_id;
  END IF;

  -- Check if login_id is already claimed by another captain
  IF EXISTS (SELECT 1 FROM public.captains WHERE login_id = v_login_id AND id <> p_captain_id) THEN
    RAISE EXCEPTION 'Operator ID "%" is already assigned to another captain.', v_login_id;
  END IF;

  v_email := v_login_id || '@yana.ops';

  -- Determine if we already have an auth.users record
  v_user_id := v_captain.auth_user_id;

  IF v_user_id IS NULL THEN
    -- Check if a user with this email already exists in auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
  END IF;

  IF v_user_id IS NOT NULL THEN
    -- Update existing auth user password & email
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
        email = v_email,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = jsonb_build_object('name', v_captain.name, 'login_id', v_login_id, 'email_verified', true),
        confirmation_token = COALESCE(confirmation_token, ''),
        recovery_token = COALESCE(recovery_token, ''),
        email_change_token_new = COALESCE(email_change_token_new, ''),
        email_change = COALESCE(email_change, ''),
        phone_change = COALESCE(phone_change, ''),
        phone_change_token = COALESCE(phone_change_token, ''),
        email_change_token_current = COALESCE(email_change_token_current, ''),
        reauthentication_token = COALESCE(reauthentication_token, ''),
        updated_at = now()
    WHERE id = v_user_id;

    -- Ensure identity exists and is updated
    IF EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_user_id AND provider = 'email') THEN
      UPDATE auth.identities
      SET identity_data = jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
          updated_at = now()
      WHERE user_id = v_user_id AND provider = 'email';
    ELSE
      INSERT INTO auth.identities (
        id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) VALUES (
        extensions.gen_random_uuid(), v_user_id::text, v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
        'email', now(), now(), now()
      );
    END IF;

  ELSE
    -- Create new user in auth.users
    v_user_id := extensions.gen_random_uuid();

    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      phone_change,
      phone_change_token,
      email_change_token_current,
      reauthentication_token,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000'::uuid,
      v_email,
      extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', v_captain.name, 'login_id', v_login_id, 'email_verified', true),
      'authenticated',
      'authenticated',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      now(),
      now()
    );

    -- Insert corresponding identity (email column is GENERATED ALWAYS AS lower(identity_data->>'email'))
    INSERT INTO auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      extensions.gen_random_uuid(),
      v_user_id::text,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      'email',
      now(),
      now(),
      now()
    );
  END IF;

  -- Link auth_user_id and login_id in captains table
  UPDATE public.captains
  SET login_id = v_login_id,
      auth_user_id = v_user_id
  WHERE id = p_captain_id;

  -- Upsert into public.profiles
  INSERT INTO public.profiles (id, role, store_id, captain_id, created_at)
  VALUES (v_user_id, 'OPERATOR', v_captain.store_id, p_captain_id, now())
  ON CONFLICT (id) DO UPDATE
  SET role = 'OPERATOR',
      store_id = v_captain.store_id,
      captain_id = p_captain_id;

  RETURN jsonb_build_object(
    'success', true,
    'captain_id', p_captain_id,
    'login_id', v_login_id,
    'email', v_email,
    'user_id', v_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

-- Grant execution to anon and authenticated
GRANT EXECUTE ON FUNCTION public.admin_set_captain_credentials(uuid, text, text) TO anon, authenticated;
