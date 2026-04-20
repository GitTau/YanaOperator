// ─────────────────────────────────────────────────────────────────────────────
// Auth Store — Zustand
// Holds: authenticated user, their profile (role + store_id), loading state
// ─────────────────────────────────────────────────────────────────────────────

import type { User } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { Profile } from '../lib/database.types';
import { supabase } from '../lib/supabase';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        set({
          user: session.user,
          profile: profile ?? null,
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
        set({ user: null, profile: null, isAuthenticated: false });
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        set({
          user: session.user,
          profile: profile ?? null,
          isAuthenticated: true,
        });
      }
    });
  },

  signIn: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error('No user returned from sign-in');

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      set({
        user: data.user,
        profile: profile ?? null,
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

  signOut: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut();
      set({ user: null, profile: null, isAuthenticated: false });
    } catch (err) {
      console.error('[AuthStore] signOut failed:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
