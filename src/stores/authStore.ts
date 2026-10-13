// ─────────────────────────────────────────────────────────────────────────────
// Auth Store — Zustand
// Holds: authenticated user, their profile (role + store_id), captain details, loading state
// ─────────────────────────────────────────────────────────────────────────────

import type { User } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { Captain, Profile } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { clearPrivateQueryCache } from '../lib/queryClient';
import { createStaffSession } from './staffSession';

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
    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('*').eq('id', userId).maybeSingle();
    if (profileError) throw new Error('Staff profile lookup failed');
    if (!profile || profile.id !== userId || !['ADMIN', 'OPERATOR', 'MECHANIC'].includes(profile.role)) {
      return { profile: null, captain: null };
    }
    const query = supabase.from('captains').select('*');
    const { data, error } = profile.captain_id
      ? await query.eq('id', profile.captain_id).maybeSingle()
      : await query.eq('auth_user_id', userId).maybeSingle();
    if (error) throw new Error('Staff identity lookup failed');
    return { profile: profile as Profile, captain: (data as Captain) ?? null };
}

let authSubscription: { unsubscribe: () => void } | undefined;
let authEventGeneration = 0;
export const useAuthStore = create<AuthState>((set, get) => {
const staffSession = createStaffSession<User, Profile, Captain>({
  load: fetchUserDetails, publish: (state) => set(state), clearCache: clearPrivateQueryCache,
});
return ({
  user: null,
  profile: null,
  captain: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  initialize: async () => {
    set({ isLoading: true, error: null });
    // Keep Supabase callbacks synchronous: async API calls inside its auth lock
    // can deadlock. Defer profile work and invalidate earlier account responses.
    authSubscription?.unsubscribe();
    authSubscription = supabase.auth.onAuthStateChange((event, session) => {
      const eventGeneration = ++authEventGeneration;
      if (event === 'SIGNED_OUT' || !session) { staffSession.reset(); return; }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        const current = get();
        const sameUser = current.isAuthenticated && current.user?.id === session.user.id;
        // Token refresh / repeat SIGNED_IN for the signed-in staff member: nothing changed.
        if (sameUser && event !== 'USER_UPDATED') return;
        if (!sameUser) staffSession.reset();
        setTimeout(() => {
          void supabase.auth.getSession().then(async ({ data, error }) => {
            if (eventGeneration !== authEventGeneration) return;
            if (error) staffSession.reset('Unable to verify the refreshed session. Please sign in again.');
            else if (data.session?.user.id === session.user.id) {
              if (sameUser) await staffSession.refresh(data.session.user);
              else await staffSession.accept(data.session.user);
            }
          }).catch(() => {
            if (eventGeneration === authEventGeneration && !sameUser) staffSession.reset('Unable to refresh staff access. Please retry.');
          });
        }, 0);
      }
    }).data.subscription;
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (session?.user) await staffSession.accept(session.user);
      else staffSession.reset();
    } catch {
      staffSession.reset('Unable to restore your staff session. Please sign in again.');
    } finally { set({ isLoading: false }); }
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

      await staffSession.accept(data.user);
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
    await staffSession.refresh(user);
  },

  signOut: async () => {
    set({ isLoading: true });
    authEventGeneration++;
    staffSession.reset();
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch {
      set({ error: 'Local access was cleared, but session sign-out failed. Please retry.' });
    } finally { set({ isLoading: false }); }
  },

  clearError: () => set({ error: null }),
});
});

