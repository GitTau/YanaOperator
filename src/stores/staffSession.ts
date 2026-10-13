// Client session gate only; server permissions remain mandatory.
type StaffUser = { id: string };
type StaffProfile = { id: string; role: string };
const STAFF_ROLES = ['ADMIN', 'OPERATOR', 'MECHANIC'];
const DENIED = 'An authorised staff profile is required. Ask your administrator to check your access.';
export function createStaffSession<U extends StaffUser, P extends StaffProfile, C>(dependencies: {
  load: (id: string) => Promise<{ profile: P | null; captain: C | null }>;
  publish: (state: { user: U | null; profile: P | null; captain: C | null; isAuthenticated: boolean; error: string | null }) => void;
  clearCache: () => void;
}) {
  let generation = 0;
  const publishDenied = (error: string | null) => dependencies.publish({ user: null, profile: null, captain: null, isAuthenticated: false, error });
  const deny = (error: string | null) => {
    generation++;
    dependencies.clearCache();
    publishDenied(error);
  };
  const isStaff = (profile: P | null, user: U): profile is P =>
    !!profile && profile.id === user.id && STAFF_ROLES.includes(profile.role);
  return {
    reset(error: string | null = null) {
      deny(error);
    },
    // New account: drop everything from the previous one before loading.
    async accept(user: U) {
      const request = ++generation;
      dependencies.clearCache();
      publishDenied(null);
      try {
        const { profile, captain } = await dependencies.load(user.id);
        if (request !== generation) return;
        if (!isStaff(profile, user)) { publishDenied(DENIED); return; }
        dependencies.publish({ user, profile, captain, isAuthenticated: true, error: null });
      } catch {
        if (request === generation) publishDenied('Unable to verify your staff profile. Please retry signing in.');
      }
    },
    // Same account, fresh token or profile change: stay signed in while re-checking,
    // keep the cache, and only sign out if the role was actually removed.
    async refresh(user: U) {
      const request = ++generation;
      try {
        const { profile, captain } = await dependencies.load(user.id);
        if (request !== generation) return;
        if (!isStaff(profile, user)) { deny(DENIED); return; }
        dependencies.publish({ user, profile, captain, isAuthenticated: true, error: null });
      } catch {
        // Network blip during a background re-check is not a reason to sign staff out.
      }
    },
  };
}
