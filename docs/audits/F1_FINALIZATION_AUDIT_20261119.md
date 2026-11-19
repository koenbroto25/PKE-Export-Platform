# F1 Finalization Audit Checkpoint — 2026-11-19

## Scope and execution guardrails
- Focus: priorities 1–4 (source/migration consistency, code and policy review, backtest readiness, final audit).
- No Vercel deployment or Preview creation was requested or performed.
- No GitHub branch was created. Changes, if any, are limited to the existing F1 PR branch.
- Neon Production was queried read-only. No DDL/DML, fixture writes, migration application, role/PM decision, or data cleanup was performed.
- Admin retains sole authority over PM appointment, replacement, and duplicate-PM resolution.

## Verified live state
- Repository: `koenbroto25/PKE-Export-Platform`.
- PR: #2, F1 project-scoped PM contracts / CoB / Finance reporting.
- PR head referenced by the PR description: `66a225a2a4846d860ffa43b898fd7ac6ab76330c`.
- GitHub Actions for that commit:
  - Unit Tests run `44438814678`: SUCCESS; steps include unit/security tests, Production migration ledger/release gates, migration runner dry-run, and backend API typecheck.
  - Dependency Audit Evidence run `44438814729`: SUCCESS.
- Neon project: `purple-base-63944903`; Production branch: `br-damp-shape-b3xlh4nr`; database: `neondb`.
- Production migration ledger contains exactly 41 rows, ending at Migration 041:
  - 039: `2478220b8813c90ab0461ea4e810b663607b57cc43c6728b9cc82647104ea168`
  - 040: `3dcba30a1592617e8747f144ed650de5d6af50112c8b105bec62681ddf1b485f`
  - 041: `96bf6ea57d68bc9913bc402cadeeb85beee6938a57b9acb9bd13c8d6c5ad2770`
- Read-only catalog probe confirms Production does not yet contain:
  - `inventory_reservations.release_reason`
  - `project_role_assignments`
  - `project_role_assignment_events`
  - permission `project.change.delete`
- Thus migrations 042–044 remain unapplied in Production. No Production schema/data changes were made during this audit.

## Migration release package
The PR branch contains the three pending SQL sources and release-policy checks pinning these values:
- 042 `4894520de17e45b38a3d50db96e9aaa1c5fa5603186e13bab0ee0f32e3bb4996`
- 043 `15e73e189b4b454582a6e2ce996eb13605bdb5157e9f3ea93837bd5c97f22086`
- 044 `618726680810cce39225442cd3cb5d87cdc118136aba33c092091c756122b48d`

Migration 043 source review confirms the intended design is represented in SQL: independent role assignments, legacy role backfill before runtime triggers, immutable assignment identity, append-only event rows, role expiry/revocation, project-scoped permission resolution, and Admin-gated PM assignment with a per-Project advisory lock. This is source review only; it is not evidence that the SQL has executed successfully on PostgreSQL.

## Material gap / release blockers
1. Production has not received migrations 042–044; therefore PostgreSQL runtime behavior against the new schema is not yet proven.
2. The current GitHub CI run is green, but its named steps establish offline unit/security checks, migration ledger/release-policy checks, dry-run without a database connection, and backend typecheck. They do not establish an authenticated API/database UAT on the new schema.
3. The migration SQL has not yet been exercised as a complete PostgreSQL migration package in this session. Do not describe the earlier behavioral/source-contract backtest as a live database backtest.
4. The migration runner source still contains legacy target-host pinning and historical release-path branches. Before it is used for any apply, its target identity and exact 042–044 atomic path must be reconciled against the current Neon Production endpoint/branch and the live 001–041 ledger. Do not infer a safe target from an old hostname.
5. The role-assignment SQL must be exercised against synthetic legacy rows including inactive memberships, expired memberships, existing duplicate PM rows, and role templates with inactive state. Verify that backfill preserves historical rows and that new PM appointments remain blocked until Admin explicitly resolves any existing appointment.

## Acceptance decision
- Code/CI evidence: PARTIAL PASS (latest recorded Unit Tests and Dependency Audit runs succeeded).
- Production ledger and unapplied migration state: VERIFIED.
- Migration source review: PARTIAL PASS; PostgreSQL execution/backtest remains outstanding.
- Authenticated API/UAT on schema 042–044: NOT RUN.
- F1 final acceptance: NOT COMPLETE.
- Migrations 042–044: remain pending; no approval or application is implied by this report.
- Vercel: deliberately excluded from this execution; no deployment attempted.

## Next execution sequence
1. Reconcile the runner's target guard with the live Production branch identity without changing Production.
2. Run the full migration package on a disposable Neon validation branch using a method that preserves PostgreSQL function bodies (do not use a semicolon-naive SQL splitter).
3. Seed only synthetic records on that isolated branch and test the legacy backfill, role lifecycle, PM handover/rejection, multi-Project isolation, permission resolution, append-only audit, inventory release reason, and change-request permission behavior.
4. Run authenticated API integration tests against that isolated schema, then rerun the full suite and capture exact run IDs.
5. Reconcile source/manifest checksums and update the PR evidence. Keep Production migrations pending until separate explicit approval of the exact SQL and SHA-256 values.


---

## Validation backtest addendum — 2026-11-19

### Isolated PostgreSQL migration execution
- Created Neon validation branch `f1-validation-20261119` (`br-noisy-fog-b379k1uu`) as a child of Production branch `br-damp-shape-b3xlh4nr`. Production itself was not modified.
- Executed migrations 042, 043, and 044 together in one transaction on the validation branch: 53 migration statements plus 3 migration-history ledger inserts (56 statements total).
- SQL statement parsing preserved quoted strings, comments, and dollar-quoted PL/pgSQL bodies; 8 function bodies were passed intact. The semicolon-naive Neon migration-preparation helper was not used.
- Transaction committed successfully. Validation ledger now contains 44 rows, ending at 044.

### Backfill and schema assertions
- The cloned baseline contained 24 legacy Project memberships with a role.
- Migration 043 backfilled all 24 into 24 independent role assignments and 24 `legacy_backfill` event records; missing backfills: 0.
- Existing inactive/deactivated and expired membership states were preserved. One legacy PM assignment was preserved as revoked/inactive.
- Existing duplicate PM fixture state was deliberately preserved: Alpha has two effective active PM assignments. No appointment was selected, revoked, or replaced by this validation. The Admin PM workflow must reject further appointment until Admin resolves the duplicate.
- Inventory release-reason column exists after 042.
- Permission `project.change.delete` exists after 044 and is not granted to any Project role.

### Live database behavior checks on the validation branch
All checks below executed against PostgreSQL, not mocked TypeScript functions:
- Multiple independent roles for one user in one Project: PASS.
- Same user’s Finance role permissions in two separate Projects: PASS.
- Permission query against an unrelated Project ID: denied (no cross-Project leakage).
- Active assignment with past expiry: rejected with check violation.
- Assignment against inactive membership: rejected with check violation.
- PM assignment attempt under non-Admin actor context: rejected with insufficient privilege.
- PM appointment under Admin actor context while duplicate active PMs exist: rejected with unique violation.
- Assignment event UPDATE and DELETE: rejected; append-only history preserved.
- Mutation of an already revoked assignment: rejected.
- `project.change.delete` has no role grant.
- Runtime-role RLS checks using `app_runtime_secure`: a Viewer without `project.members.view` saw 0 assignments and 0 events; a Project Admin with the permission saw the Project's 19 assignments and 19 events. PM membership visibility/manage remains governed by its explicit role grants; this migration does not grant PM membership-management permissions.

### API/source revision and verification status
- Reviewed API request-scoped transaction middleware: it binds `app.current_user_id` and `app.current_role` before route handlers and uses the same PostgreSQL client through commit/rollback.
- Reviewed role endpoints: ordinary role assignment and revocation require Project permissions and explicitly reject PM changes; PM appointment/deactivation routes require `requireAuth` and `requireAdmin`, require a reason, and reject ambiguous duplicate active PMs or unconfirmed handovers.
- Added `src/f1-role-assignment-rules.test.ts` covering assignment effectiveness, expiry validation, PM idempotency, exact handover confirmation, duplicate-PM rejection, and route guard contracts.
- Added the new test file to the root `npm test` script in `package.json`.
- Latest commits: test file `dc717bbfdc5a22e6a9c0fb7c3aaf5db0f6699fc7`; package script `a06b0a8dc65cbb335f244f4480c9f66fbf6198e4`.
- No GitHub Actions run was returned for the latest commit at the time of this addendum. Therefore the newly added Vitest suite and full workflow are **pending CI execution**, not reported as passing.
- The migration runner's pinned host was checked against Neon endpoint inventory: `EXPECTED_HOST` matches the current Production read-write endpoint host for `br-damp-shape-b3xlh4nr`. The runner submits complete migration SQL via `client.query(sql)`; it does not split PL/pgSQL on semicolons. The earlier target-host/splitter concern is cleared by this verification.

### Updated acceptance decision
- Migrations 042–044 on isolated PostgreSQL validation branch: PASS.
- Backfill preservation and database behavior checks listed above: PASS.
- Runtime RLS checks under `app_runtime_secure`: PARTIAL PASS; tested Viewer denial and Project Admin visibility. Broader role matrix still needs API-level coverage.
- New role-assignment unit tests: ADDED; CI result PENDING.
- Authenticated HTTP API UAT against the validation schema: NOT RUN. The code was source-reviewed, but no live authenticated HTTP request was made.
- Production migration application: NOT APPROVED / NOT PERFORMED.
- F1 final acceptance: NOT COMPLETE until CI passes and authenticated API UAT is recorded. Vercel remains excluded by instruction.
- The validation branch contains one synthetic multi-role assignment created for the live test. It is isolated from Production and retained as evidence; branch deletion requires a separate explicit instruction.


## Second validation and CI closure — 2026-11-19

### Expanded runtime-role PostgreSQL tests
Additional tests were executed as `app_runtime_secure` on the same isolated validation branch:
- Project Admin with `project.members.manage` successfully inserted a non-PM assignment and revoked it with a reason. The database wrote both `assigned` and `revoked` events.
- Runtime role has no DELETE privilege on assignments and no UPDATE privilege on event history.
- Project Admin RLS visibility: 19 assignments and 19 events in Alpha; Viewer without `project.members.view`: 0 assignments and 0 events.
- Active PM in Beta has `project.view`; deactivated and expired PM identities are denied.
- Finance notification recipient guard: active PM and active platform Admin accepted; inactive and expired PM recipients rejected.
- Active assignment on inactive role template: rejected.
- Active assignment on expired membership: rejected.
- Project Admin (non-platform Admin) PM appointment: rejected.
- These are database-level checks on the validation branch. No real PM appointment or handover was made.

### Latest GitHub CI evidence
- Corrected test commit: `4458d83d7e4f0cf40da526f8dd2c5e12a1c72601`.
- Unit Tests run `44543952621`: SUCCESS. Vitest: 10 test files, 141/141 tests passed. Production migration release-policy verification, migration runner dry-run, backend API typecheck, frontend typecheck, and frontend build all passed.
- Dependency Audit Evidence run `44543952737`: SUCCESS.
- The immediately preceding Unit Tests run failed only because the newly added source-contract test looked for a PM error-code literal in `src/index.ts` instead of the dedicated helper. The assertion was corrected; the latest complete workflow is green.
- The successful workflow did not apply migrations to Production and did not run authenticated HTTP integration against the validation branch.

### Final validation-branch state after tests
- Migration ledger: 44/44.
- Assignments: 26 total (24 original legacy backfills plus 2 synthetic validation assignments); 24 active and 2 revoked.
- Events: 27 total (24 legacy backfill events, plus 2 assignment events and 1 revocation event).
- The two pre-existing active PM assignments in Alpha remain untouched and are still deliberately unresolved for Admin decision.
- One synthetic inactive QA role template and the test assignments/events remain on this isolated validation branch.
- Production was rechecked read-only after all tests: migration ledger remains 41/41; role-assignment table absent; release_reason column absent; `project.change.delete` permission absent. No Production mutation occurred.

### Acceptance status after second validation
- Isolated PostgreSQL migrations 042–044: PASS.
- Legacy backfill, role assignment lifecycle, project isolation, RLS, append-only events, Finance recipient filtering, inactive/expired-state rejection: PASS for the tested scenarios.
- Root Unit Tests, release-policy check, migration dry-run, backend/frontend typecheck and frontend build: PASS (141/141 tests).
- Dependency Audit: PASS.
- Authenticated HTTP UAT against the validation schema: STILL NOT RUN. API routes were source-reviewed and statically regression-tested; no real HTTP request with a signed Neon Auth identity was executed.
- Production migrations 042–044: NOT APPLIED; separate explicit owner approval of exact hashes is still required.
- F1 acceptance remains **NOT COMPLETE** until authenticated HTTP UAT is completed or explicitly excluded by the owner. Vercel/deployment remains excluded by instruction.


### Documentation-head verification
- After the audit addendum was committed, Unit Tests run `44544866720` completed SUCCESS and Dependency Audit Evidence run `44544866867` completed SUCCESS.
- Unit Tests included 141/141 passing tests, release-policy verification, migration dry-run, backend API typecheck, frontend typecheck, and frontend build.
- The subsequent plan-document-only commit does not change executable source. No Production migration was applied.
