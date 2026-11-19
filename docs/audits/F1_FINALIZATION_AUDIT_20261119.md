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
