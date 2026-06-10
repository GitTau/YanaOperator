// ─────────────────────────────────────────────────────────────────────────────
// Supabase client — YanaOperator
// Uses the publishable key (safe for client) from SUPADATA.md
// Service key NEVER goes here — Edge Functions only
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const SUPABASE_URL = 'https://kaoelfcaiegjjhyrrlak.supabase.co';
// Publishable key — safe for client bundles. Enforced by RLS on every table.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_-EPMKGBa0QxO2JN9t3LXXg_Pm-NNn93';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
