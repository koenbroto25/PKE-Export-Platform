PKE TEST HARNESS CORRECTIVE PATCH — REVISION 2

This patch is based on the newly supplied:
- scripts/test-db/run-integration.mjs
- scripts/test-db/preflight.mjs

Changes:
1. run-integration.mjs is import-safe. Importing validateLocalUrl from Vitest no
   longer starts the integration runner or calls process.exit().
2. Integration runner delegates Docker, TCP, and runtime DB checks to the
   shared preflight implementation instead of duplicating those checks.
3. Docker binding proof now requires exactly one binding at 127.0.0.1:54331.
   Wildcard/empty and non-loopback bindings are rejected.
4. Malformed percent-encoded usernames are rejected as validation errors.
5. Both runtime and maintenance URLs reject known placeholder passwords.
6. Integration runner explicitly invokes vitest.config.integration.ts and
   sets NODE_ENV=test only in the child process after strict local URL checks.
7. Default Vitest config excludes integration tests; integration config runs
   only src/integration/**/*.test.ts.
8. Guard assertions are case-insensitive for Username wording.
9. Obsolete src/test-db/preflight.test.js is removed; the strict
   src/test-db/preflight.test.ts remains untouched.

Important:
- No database/Docker command is executed while applying this patch.
- Do not run `npm run test:integration` unless the owner separately authorizes
  local Docker/database use and .env.test.local is confirmed to target only
  the dedicated local pke_test database.
- No Neon Production DDL/DML, migration, auth, storage, or business data is
  touched.
- No claim of runtime test pass is made by this package.
