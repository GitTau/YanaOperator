// ─────────────────────────────────────────────────────────────────────────────
// Auth Store — Zustand
// Holds: authenticated user, their profile (role + store_id), captain details, loading state
// ─────────────────────────────────────────────────────────────────────────────

import type { User } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { Captain, Profile } from '../lib/database.types';
import { supabase } from '../lib/supabase';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  captain: Captain | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearError: () => void;
}

async function fetchUserDetails(userId: string): Promise<{ profile: Profile | null; captain: Captain | null }> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    let captain: Captain | null = null;

    if (profile?.captain_id) {
      const { data } = await supabase
        .from('captains')
        .select('*')
        .eq('id', profile.captain_id)
        .maybeSingle();
      captain = (data as Captain) ?? null;
    } else {
      const { data } = await supabase
        .from('captains')
        .select('*')
        .eq('auth_user_id', userId)
        .maybeSingle();
      captain = (data as Captain) ?? null;
    }

    return { profile: (profile as Profile) ?? null, captain };
  } catch (err) {
    console.error('[AuthStore] fetchUserDetails error:', err);
    return { profile: null, captain: null };
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  captain: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { profile, captain } = await fetchUserDetails(session.user.id);

        set({
          user: session.user,
          profile,
          captain,
          isAuthenticated: true,
        });
      }
    } catch (err) {
      console.error('[AuthStore] initialize failed:', err);
    } finally {
      set({ isLoading: false });
    }

    // Subscribe to auth state changes (token refresh, sign-out, etc.)
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        set({ user: null, profile: null, captain: null, isAuthenticated: false });
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const { profile, captain } = await fetchUserDetails(session.user.id);
        set({
          user: session.user,
          profile,
          captain,
          isAuthenticated: true,
        });
      }
    });
  },

  signIn: async (identifier: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const cleanId = identifier.trim();
      // Normalize: if user enters Operator ID (e.g. CAP-OD02), format as cap-od02@yana.ops
      const email = cleanId.includes('@') ? cleanId : `${cleanId.toLowerCase()}@yana.ops`;

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error('No user returned from sign-in');

      const { profile, captain } = await fetchUserDetails(data.user.id);

      set({
        user: data.user,
        profile,
        captain,
        isAuthenticated: true,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      set({ error: message });
    } finally {
      set({ isLoading: false });
    }
  },

  refreshProfile: async () => {
    const user = get().user;
    if (!user) return;
    const { profile, captain } = await fetchUserDetails(user.id);
    set({ profile, captain });
  },

  signOut: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut();
      set({ user: null, profile: null, captain: null, isAuthenticated: false });
    } catch (err) {
      console.error('[AuthStore] signOut failed:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));

