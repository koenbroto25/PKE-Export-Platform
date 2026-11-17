# Verified catalog recovery — migrations 029–035

Date: 2026-11-17. Read-only catalog inspection of legacy Neon project `lucky-glitter-99553107`.

- Parent: `br-gentle-thunder-b3z7y3bk`, migration_history max id 27.
- Child: `br-calm-glade-b3nrleet`, migrations 029–035 recorded applied.
- Parent compute endpoint was enabled temporarily for SELECT-only inspection and suspended after extraction. No DDL/DML was executed.

| Catalog | Parent | Child |
|---|---:|---:|
| Public base tables | 80 | 152 |
| RLS enabled | 80 | 152 |
| FORCE RLS | 0 | 71 |
| Constraints | 875 | 2,134 |
| Foreign keys | 151 | 423 |
| Unvalidated FKs | 5 | 0 |
| Policies | 282 | 507 |
| Indexes | 196 | 693 |
| Public functions | 57 | 120 |
| Trigger definitions | 0 | 80 |

The interval contains 72 new tables, 1,142 new columns across new tables, 137 columns added to existing tables, 1,259 added constraints, 7 changed constraints, 225 added policies, 1 changed policy, 392 new non-constraint indexes, 80 triggers, 63 new functions and 1 changed function. Seven runtime function EXECUTE grants and 278 table grants were added. Three DML privileges on migration_history were revoked from app_runtime_secure.

## Migration 030 — verified exact operation

The five exact FKs existed as NOT VALID on parent and VALID on child:
- buyers.buyers_country_code_fkey
- pks_sites.pks_sites_country_code_fkey
- ports.ports_country_code_fkey
- project_members.project_members_project_role_same_project_fkey
- projects.projects_export_country_code_fkey

Equivalent VALIDATE CONSTRAINT statements are in the review-only 030 candidate. Not byte-identical historical source.

## Migration 033 — scope evidence

72 tables added, all child tables have RLS, 71 FORCE RLS. Full cumulative object delta is in the SQL snapshot. The delta is not uniquely attributable to migration 033 and is not executable until split by migration boundary and reviewed.

## Migration 035 — prior inference withdrawn

The previous proposed change to pke_ai_feedback_select and pke_ai_runs_update was unsupported. Both child policies still include pke_is_platform_admin() in their predicates, while pke_admin_all also exists. The historical 035 delta remains unidentified; no SQL is provided.

## Safety

No Production writes, migration execution, restore, merge to main, or Vercel deployment occurred.
