# PKE — Final Migration Decision & Release Gate

Decision date: 2026-11-17  
Repository: koenbroto25/PKE-Export-Platform  
Target branch: phase0/reconcile-source-20261117  
Decision status: MIGRATION STRATEGY SET — EXECUTION BLOCKED  
Production mutation approval: NOT GRANTED  
Deployment approval: NOT GRANTED

## 1. Executive decision

The historical migration chain 001–035 is treated as the immutable applied history of the active Production database. Migrations 029–035 are recorded as applied; their original SQL bytes have not been recovered. Reconstructed SQL and catalog snapshots are evidence/review material only and must not be replayed.

**No executable migration 036 is authorized or defined by this decision.** There is no verified Production drift requiring a forward fix, and the unresolved historical deltas for 033 and 035 make it unsafe to invent a catch-up migration. Assigning 036 merely to recreate unknown historical work would conceal provenance gaps and risk duplicate or destructive DDL.

The canonical clean-install path is a separately versioned **schema baseline/bootstrap artifact**, generated from a complete, verified schema-only export of the current Production catalog. It is not a replacement for historical migrations 001–035, is not represented as the original source of 033/035, and must not be inserted into the incremental migration runner as migration 036.

## 2. Evidence accepted

1. Active application Production: Neon project purple-base-63944903, branch br-damp-shape-b3xlh4nr, database neondb, runtime role app_runtime_secure.
2. Legacy recovery project: lucky-glitter-99553107.
3. Legacy parent br-gentle-thunder-b3z7y3bk had migration history through 027; child br-calm-glade-b3nrleet records migrations 029–035 as applied.
4. Six previously disabled legacy endpoints were temporarily enabled for SELECT-only inspection, then returned to disabled/suspended state. No SQL writes were performed.
5. The inspected legacy branches did not yield original source SQL for 033 or 035. Older branches with no migration_history relation or no rows >=029 are not evidence of the missing source.
6. The cumulative parent→child catalog delta covers the interval after 027 and cannot be attributed exclusively to migration 033. See VERIFIED_CATALOG_RECOVERY_20261117.md.
7. Historical checksums are recorded in migration_029_035_recovery_manifest.json. Reconstructed candidates do not claim byte identity.

## 3. Authoritative migration disposition

| Range / ID | Recorded state | Decision | Executable? |
|---|---|---|---|
| 001–016 | Baseline records in Production history | Preserve historical records; do not rewrite or replay | No replay |
| 017–028 | Applied historical migrations | Preserve history and checksums | No replay |
| 029 | Applied; original bytes not recovered | Keep historical record; candidate review-only | No |
| 030 | Applied; five FK validations verified from catalog | Keep historical record; candidate is not byte-identical source | No |
| 031 | Applied; resulting function attributes/body observed | Keep historical record; candidate review-only | No |
| 032 | Applied; resulting reference rows observed | Keep historical record; seed candidate is not original source | No |
| 033 | Applied; only cumulative catalog snapshot available | Source reconstruction BLOCKED; do not infer isolated body | No |
| 034 | Applied; resulting trigger-function ACL state observed | Keep historical record; candidate review-only | No |
| 035 | Applied; previous AI-policy inference withdrawn | Source reconstruction BLOCKED; do not invent policy change | No |
| 036 | No verified drift or approved SQL | RESERVED — NOT CREATED, NOT REGISTERED, NOT APPLIED | No |
| Clean-install baseline | Not yet generated/validated | Separately versioned bootstrap artifact after complete schema export and validation | Not incremental |

Historical 029–035 records, timestamps, filenames and SHA-256 values are immutable evidence. Never replace historical hashes with hashes of reconstructed candidates.

## 4. Canonical baseline specification

Create one canonical schema baseline from the current Production catalog only after a complete schema-only export has been obtained and independently checked. The baseline must account for:

- PostgreSQL version and required extensions;
- schemas, types, domains, enums, collations and sequences;
- tables, columns, defaults, generated/identity attributes and ownership;
- primary keys, unique/check/exclusion constraints and foreign keys, including validation state;
- indexes, including partial, expression and constraint-backed indexes;
- RLS enablement, FORCE RLS state, policies and role references;
- functions/procedures with full definitions, volatility, security mode, configuration and ownership;
- triggers and trigger-function dependencies;
- views/materialized views and dependency ordering;
- grants, default privileges, ownership and role assumptions;
- reference data only where intentionally part of schema bootstrap; do not copy business/project data.

Scan the export for secrets, credentials, production business rows, environment-specific endpoints and owner-role leakage before repository storage. Preserve runtime least privilege; never use owner/superuser as application runtime.

### Baseline acceptance gates

1. Export provenance records project, branch, database, timestamp, PostgreSQL version and tool version without credentials.
2. Export is schema-only and contains no business/tenant data.
3. Dependency-aware restore succeeds on a disposable local PostgreSQL instance or another explicitly approved isolated environment.
4. Normalized catalog comparison between restored baseline and source shows no unexplained differences for all object classes above.
5. RLS/policy/grant checks confirm intended app_runtime_secure access and no unintended PUBLIC execution.
6. Application migration discovery does not mistake bootstrap for an incremental migration.
7. A second reviewer signs off baseline manifest and checksum.

Until every gate passes, label the artifact DRAFT / NOT CANONICAL.

## 5. Forward migration policy

The first future incremental migration number remains **036**, but it may be allocated only to a specific, measured forward-only change after a documented drift/requirement exists.

Required lifecycle for 036 and later:

1. Record exact issue, expected before/after state and affected objects.
2. Inspect current Production catalog read-only and prove the change is absent.
3. Write one narrowly scoped migration with deterministic behavior and explicit preconditions.
4. Validate syntax and dependency ordering locally; test clean-bootstrap + full-chain and upgrade-from-current-state paths.
5. Verify idempotency policy, transaction behavior, rollback/forward-recovery strategy and lock impact.
6. Run application tests, TypeScript checks, production build and relevant security/RLS tests.
7. Review SQL and evidence; obtain explicit user approval before any Production mutation.
8. Apply only through the approved migration runner, then verify history, checksums and post-state catalog.
9. Update this decision and PKE_P03_PLAN.md with evidence. Never mark PASS without a recorded artifact or command result.

No future migration may silently reconstruct, rename, or overwrite historical 029–035 records.

## 6. Prohibited actions

- Do not rerun or recreate migrations 029–035 on Production.
- Do not fabricate historical SQL from a checksum.
- Do not promote review-only reconstruction files into executable migrations/.
- Do not create migration 036 as a catch-all for unknown 033/035 behavior.
- Do not run DDL/DML, restore, seed, or migration commands against Production under this decision.
- Do not create another Neon project/branch/database for this work.
- Do not merge this recovery branch to main or deploy to Vercel.
- Do not add production business data to baseline or test fixtures.
- Do not expose or copy secrets, connection strings, tokens or credentials into artifacts.

## 7. Current release gates

| Gate | Status | Reason / evidence |
|---|---|---|
| Historical ledger 001–035 preserved | PASS as recorded | Existing Production history and recovery manifest |
| Original SQL 029–035 recovered byte-for-byte | BLOCKED | Original source unavailable |
| Migration 033 isolated source/delta established | BLOCKED | Only cumulative parent→child catalog delta |
| Migration 035 exact change established | BLOCKED | Previous unsupported inference withdrawn |
| Six legacy endpoints returned to disabled/suspended | PASS | Cleanup responses in 2026-11-17 forensic report |
| Canonical schema-only baseline exported | NOT STARTED | Complete export not yet obtained |
| Baseline restore and catalog equivalence | NOT STARTED | Requires disposable local validation environment |
| Migration 036 | RESERVED / NOT CREATED | No measured drift and no approved SQL |
| Production migration execution | BLOCKED / NOT APPROVED | Explicit approval required |
| Main merge / Vercel deployment | BLOCKED / NOT APPROVED | Outside this recovery decision |

## 8. Required next implementation package

The next package is **Baseline Capture & Equivalence Validation**, not a Production migration. It must deliver:

- schema-only export and provenance manifest;
- object inventory by class and dependency order;
- secret/business-data scan report;
- disposable local restore log;
- normalized source-vs-restored catalog diff;
- RLS/grants/function-execute verification report;
- baseline checksum and reviewer sign-off;
- updated migration plan with PASS/PARTIAL/BLOCKED evidence.

If any object cannot be exported or compared, the baseline remains non-canonical and the gap must be listed.

## 9. Plan synchronization

The inspected recovery branch does not contain a root PKE_P03_PLAN.md. The Windows-local file D:\PKE\PKE_P03_PLAN.md is not accessible from this execution environment and has **not** been modified. Sync this decision into that local file before closing the revision, recording:

- date 2026-11-17;
- decision: 029–035 immutable; 033/035 reconstruction blocked; 036 reserved/not created;
- baseline bootstrap is separate from incremental migration numbering;
- endpoint cleanup and forensic report path;
- all release gates and evidence references;
- no Production mutation, merge or deployment authorized.

## 10. Final determination

**Migration strategy is now set.** Keep applied historical chain 001–035 immutable. Do not create or execute 036 yet. Build and validate a separate canonical schema bootstrap from a complete Production schema-only export. Only after baseline equivalence and a concrete forward change are proven may 036 be authored and submitted for approval.

This is a technical decision on the recovery branch, not authorization to mutate Production.


## Addendum — 2026-11-18: Migration 036 executed after owner approval

This addendum supersedes the earlier 2026-11-17 statement that migration 036 was reserved/not created. The owner subsequently approved the exact SQL for `036_validate_production_schema_invariants.sql` with SHA-256 `4a70d8b343c44e26c9592402c4c8dceb3b6a0d11c5f4e619847baff774034a52`. It was applied successfully to the active Neon Production branch `br-damp-shape-b3xlh4nr` / database `neondb` on 2026-11-17T21:31:15.111Z, and migration_history now records ID 36 with status `applied`.

The migration performs catalog/invariant validation only; it does not alter schema or business rows. The migration runner exception is pinned to this exact filename and SHA-256 and exists on this recovery branch only. It has not been merged to `main` or deployed through Vercel.

**Unchanged blockers:** original byte-identical source SQL for historical migrations 029–035 remains unrecovered. Reconstructed candidates under this directory remain review-only and must not be replayed or promoted into executable migrations. F0.06–F0.08 therefore remain open. No further Production migration is authorized by this addendum.
