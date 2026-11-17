# Migration 029–035 Recovery Package

Status: REVIEW-ONLY. Not an executable migration release.

This package records recovered metadata and reconstructed candidates. It must stay outside `migrations/` so migration discovery/runner cannot apply it accidentally.

## Evidence
- Production migration_history (read-only): IDs 029–035 all applied; exact names, timestamps and SHA-256 recorded in the Master Plan.
- Legacy Neon source project found: `lucky-glitter-99553107`, branch `br-calm-glade-b3nrleet`.
- Legacy branch catalog read-only: function definitions, policies, constraints, trigger-function ACLs, and reference data inspected.
- Pre-migration parent branch `br-gentle-thunder-b3z7y3bk` was temporarily enabled/started for read-only catalog comparison, then suspended again. A verified parent→child catalog inventory is now committed in `VERIFIED_CATALOG_RECOVERY_20261117.md`.
- Repository 033 candidate has a different checksum and is explicitly NOT APPLIED.

## File classifications
- 029, 031, 032: reconstructed from stated purpose and live catalog/data; not byte-identical source.
- 030: all five exact FK names/definitions were verified as NOT VALID on parent and VALID on child; equivalent VALIDATE CONSTRAINT SQL is committed. Historical source bytes/checksum are not recreated.
- 033: 72 additional tables and aggregate policy/constraint/index/function/trigger deltas identified; full executable DDL/RLS reconstruction remains BLOCKED pending object-level review.
- 034: reconstructed from live trigger-function ACL state; not byte-identical source.
- 035: inferred from live AI RLS policies; requires policy-owner review.

## New verified evidence (2026-11-17)\n- Parent→child catalog: tables 80→152; RLS-enabled tables 80→152; FORCE RLS 0→71; constraints 875→2,134; FK 151→423; NOT VALID FK 5→0; policies 282→507; indexes 196→693; public functions 57→120; trigger event rows 0→152. This spans the full parent→child interval and is not proof every delta belongs only to 033.\n- Migration 035's four relevant AI policy rows are documented in the catalog report; inference still requires behavioral review.\n\n## Rules
1. Never apply these artifacts to active Production.
2. Never overwrite historical SHA-256 values with candidate hashes.
3. Never rename the NOT APPLIED 033 candidate to the applied migration name.
4. Do not add a migration 036 to bypass this gap.
5. Only create a separately reviewed forward-only reconciliation after exact schema/policy diff and owner approval.
