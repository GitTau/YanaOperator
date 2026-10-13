# Operator staff-access repair — handoff

Addresses the client-session portion of OS Review finding 16. Missing/mismatched
staff profiles and non-staff roles no longer enable Operator access. Profile and
Captain query errors are checked. The session gate discards delayed responses
following sign-out/account changes; auth callbacks defer Supabase API work rather
than awaiting it within the callback. Reinitialization replaces the subscription.
The existing query client is now shared with authentication cleanup; session
changes cancel queries and clear cached operational data.

Files: app/_layout.tsx, src/stores/authStore.ts, src/stores/staffSession.ts,
src/stores/staffSession.test.cjs, src/lib/queryClient.ts.

Checks executed: six deterministic staff-session tests passed; default TypeScript
check passed; git diff --check passed. Tests cover profile absence, invalid role,
identity mismatch, valid staff, sign-out/account-switch races and query failure.
No credentials, live Supabase access, APK deployment or production writes.
Pre-existing payment Edge Function edits remain untouched.

Limits: this is CLIENT gating, not a server authorisation fix. Live RLS/grants,
OTP provider, staff notification routing, Captain push registration, server store
permissions and device login/session journeys remain pending. Default tsconfig
still excludes Performance. Cache cancellation was wired but not exercised on a
physical device; no broad security-completion claim is appropriate.

Next priority: approved read-only inspection of live grants/RLS/functions and a
server-hardening proposal for the P0 findings. Rider verified identity needs the
open SMS/OTP choice resolved. Do not silently choose providers or apply migrations.
