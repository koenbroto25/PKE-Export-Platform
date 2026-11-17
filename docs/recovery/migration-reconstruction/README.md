# Migration 029–035 Recovery Package

Status: **REVIEW-ONLY / NOT A DEPLOYABLE MIGRATION RELEASE**.

Historical migrations 029–035 are already recorded as applied on the active application Production database and on the legacy production child. They must not be replayed. This package exists to recover source provenance, reconcile repository history, and prepare verified forward-only fixes if a real drift is found.

All artifacts remain under docs/recovery/migration-reconstruction/, outside migrations/, so automatic migration discovery cannot execute them.

## Final migration decision (2026-11-17)

See [MIGRATION_DECISION_AND_RELEASE_GATE_20261117.md](./MIGRATION_DECISION_AND_RELEASE_GATE_20261117.md).

**Decision:** historical migrations 001–035 remain immutable. Migrations 033 and 035 remain blocked for source reconstruction. Migration 036 is reserved but must not be created, registered or applied until a specific forward-only change is justified by measured catalog drift and separately approved. The clean-install path is a separately versioned schema-only baseline/bootstrap artifact, not migration 036.

Production mutation, migration execution, merge to main and Vercel deployment remain unauthorized.

## Verified evidence

- Legacy source project: lucky-glitter-99553107.
- Pre-migration parent: br-gentle-thunder-b3z7y3bk, migration_history max id 27.
- Legacy production child: br-calm-glade-b3nrleet, migrations 029–035 all applied.
- Six legacy endpoints were temporarily enabled for SELECT-only inspection and then returned to disabled/suspended state. No database writes or DDL were performed.
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

- 029_035_CATALOG_RECONSTRUCTION_SNAPSHOT.sql: cumulative parent→child schema delta; evidence only, do not execute directly.
- VERIFIED_CATALOG_RECOVERY_20261117.md: catalog comparison and exact FK identities.
- 033_BLOCKED_NO_SAFE_RECONSTRUCTION.md: 033 scope and remaining limitations.
- 035_remove_redundant_ai_rls_policies.sql: comments only, BLOCKED.
- 029_035_READ_ONLY_VERIFICATION.sql: SELECT-only post-state checks.
- migration_029_035_recovery_manifest.json: historical hashes/statuses without pretending reconstructed files match those hashes.
- PKE_Neon_Legacy_Branch_Forensics_20261117.md: read-only inspection of six legacy branches and endpoint cleanup evidence.
- MIGRATION_DECISION_AND_RELEASE_GATE_20261117.md: authoritative migration numbering decision and release gates.

## Execution rules

1. Never reapply 029–035 to active Production; they are already recorded as applied.
2. Never place reconstructed SQL into migrations/ until provenance and tests are complete.
3. Never change historical SHA-256 values to match reconstructed candidate files.
4. Migration 036 is RESERVED / NOT CREATED. Do not use it to bypass unresolved 033/035 history.
5. The clean-install baseline is a separate bootstrap artifact and must pass restore/catalog equivalence checks before being canonical.
6. A residual Production mismatch must be addressed by a separate forward-only migration, rehearsed locally and approved before Production application.
7. Preserve the single application Production database/runtime and app_runtime_secure least-privilege role.


## Addendum — 2026-11-18: Migration 036 executed after owner approval

This addendum supersedes the earlier 2026-11-17 statement that migration 036 was reserved/not created. The owner subsequently approved the exact SQL for `036_validate_production_schema_invariants.sql` with SHA-256 `4a70d8b343c44e26c9592402c4c8dceb3b6a0d11c5f4e619847baff774034a52`. It was applied successfully to the active Neon Production branch `br-damp-shape-b3xlh4nr` / database `neondb` on 2026-11-17T21:31:15.111Z, and migration_history now records ID 36 with status `applied`.

The migration performs catalog/invariant validation only; it does not alter schema or business rows. The migration runner exception is pinned to this exact filename and SHA-256 and exists on this recovery branch only. It has not been merged to `main` or deployed through Vercel.

**Unchanged blockers:** original byte-identical source SQL for historical migrations 029–035 remains unrecovered. Reconstructed candidates under this directory remain review-only and must not be replayed or promoted into executable migrations. F0.06–F0.08 therefore remain open. No further Production migration is authorized by this addendum.
