NOTE 2026-10-15: these checks target the SUPERSEDED 12 Oct migration. The live rewrite is
YanaOS/security/lockdown/K-rental-engine.proposal.sql; its rehearsal (lockdown/rehearsal/) must be written
before K is applied. Keep these assertions as the starting point (ledger mirror, append-only, one fine per day,
pause/resume/close transactions).

Rental engine v1 — SQL checks (synthetic database only, never production)

1. Create an empty local Postgres 16 database.
2. psql -v ON_ERROR_STOP=1 -d <db> -f stub.sql
3. psql -v ON_ERROR_STOP=1 -d <db> -f ../../migrations/20261012120000_rental_engine_v1.sql   (run twice: it is re-runnable)
4. psql -v ON_ERROR_STOP=1 -d <db> -f assertions.sql   -> prints "ALL SQL ASSERTIONS PASSED"

Policy engine tests: node --experimental-strip-types --test supabase/functions/_shared/rental-policy.test.mjs
