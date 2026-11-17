# Migration 029–035 Recovery Package

Status: **REVIEW-ONLY / NOT A DEPLOYABLE MIGRATION RELEASE**.

Historical migrations 029–035 are already recorded as `applied` on the active application Production database and on the legacy production child. They must not be replayed. This package exists to recover source provenance, reconcile repository history, and prepare verified forward-only fixes if a real drift is found.

All artifacts remain under `docs/recovery/migration-reconstruction/`, outside `migrations/`, so automatic migration discovery cannot execute them.

## Verified evidence

- Legacy source project: `lucky-glitter-99553107`.
- Pre-migration parent: `br-gentle-thunder-b3z7y3bk`, migration_history max id 27.
- Legacy production child: `br-calm-glade-b3nrleet`, migration_history 029–035 all applied.
- Parent endpoint was temporarily enabled for read-only catalog extraction and then suspended. No database writes or DDL were performed.
- Parent→child catalog delta: tables 80→152; RLS enabled 80→152; FORCE RLS 0→71; constraints 875→2,134; FKs 151→423; unvalidated FKs 5→0; policies 282→507; indexes 196→693; public functions 57→120; trigger definitions 0→80.
- The interval is cumulative across the period after migration 027. It cannot be safely attributed entirely to migration 033.

## File status

| Item | Status | Evidence / limitation |
|---|---|---|
| 029 | Reconstructed candidate | Resulting set_rls_context ACL confirms PUBLIC denied and runtime granted; original bytes not recovered |
| 030 | Operational SQL recovered | Five exact FK names verified NOT VALID on parent and VALID on child |
| 031 | Reconstructed candidate | Function definition and SECURITY INVOKER/search_path/NULL guard observed |
| 032 | Reconstructed candidate | CN/ID/PK and CNY/IDR/PKR/USD seed values verified; IDR functional; table columns confirmed |
| 033 | Cumulative catalog snapshot only | 72 new tables plus object deltas captured; exact individual migration boundary and original source not recovered |
| 034 | Reconstructed candidate | 56 trigger-returning functions; PUBLIC and app_runtime_secure have no EXECUTE on child |
| 035 | BLOCKED | Previous AI-policy inference was withdrawn; child catalog still shows those admin predicates |

## Important artifacts

- `029_035_CATALOG_RECONSTRUCTION_SNAPSHOT.sql`: cumulative parent→child schema delta. Evidence only; do not execute directly.
- `VERIFIED_CATALOG_RECOVERY_20261117.md`: catalog comparison and exact FK identities.
- `033_BLOCKED_NO_SAFE_RECONSTRUCTION.md`: 033 scope and remaining limitations.
- `035_remove_redundant_ai_rls_policies.sql`: intentionally fail-closed; no executable SQL.
- `029_035_READ_ONLY_VERIFICATION.sql`: SELECT-only post-state checks.
- `migration_manifest_001_035_recovery.json`: historical hashes/statuses without pretending reconstructed files match those hashes.

## Execution rules

1. Never reapply 029–035 to active Production; they are already recorded as applied.
2. Never place reconstructed SQL into `migrations/` until provenance and tests are complete.
3. Never change historical SHA-256 values to match reconstructed candidate files.
4. Never create migration 036 to bypass unresolved 033/035 history.
5. A residual Production mismatch must be addressed by a separate forward-only migration, rehearsed on an isolated branch and approved before Production application.
6. Preserve the single application Production database/runtime and `app_runtime_secure` least-privilege role.
