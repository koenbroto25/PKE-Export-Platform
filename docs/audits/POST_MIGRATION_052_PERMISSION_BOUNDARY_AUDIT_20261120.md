# Post-Migration 052 Permission Boundary Audit — 2026-11-20

## Scope
Read-only audit after owner-approved Migration 052 on Neon Production project `purple-base-63944903`, branch `br-damp-shape-b3xlh4nr`, database `neondb`. No additional data, role assignment, permission grant, or schema change was made for this audit.

## Migration 052 result
- Production migration ledger: 52 rows, IDs 1–52 contiguous.
- Row 52: `052_funder_finance_report_scope_isolation.sql`, SHA-256 `cc8d34c12d34eab9c4cc9aeabd46d9da59b1ec7ef0c7c89345d4b49455a6ac0b`, status `applied`.
- Generic Funder grant count across both Projects: 0.
- Both Funder role definitions have zero grants in the Finance/Accounting/Reports/Payment families targeted by Migration 052.
- One active Funder assignment remains.
- The permission helper is SECURITY DEFINER with `search_path=pg_catalog, public`; EXECUTE is granted to `app_runtime_secure`; PUBLIC EXECUTE is false.

## Funder backtest
Within the same transaction as Migration 052, the test temporarily reintroduced `finance.view` and `reports.view` for the active Funder assignment. Calls to `pke_has_project_permission` returned false for both. The temporary grants were deleted before transaction commit. Post-commit read-back confirms zero Funder generic grants and no temporary test grants remain.

## Separate Project Admin / Finance boundary finding

### Effective permission test
For one active non-platform-admin Project Admin assignment, database helper results were:
| Permission | Effective result |
|---|---:|
| `finance.view` | true |
| `finance.update` | false |
| `accounting.update` | true |
| `accounting.delete` | true |
| `reports.create` | true |
| `reports.delete` | true |

For one active non-platform-admin Finance assignment:
| Permission | Effective result |
|---|---:|
| `finance.view` | true |
| `finance.create` | true |
| `finance.update` | true |
| `finance.delete` | true |
| `accounting.update` | false |
| `accounting.delete` | false |

The Production role grant catalog confirms Project Admin currently has `accounting.create/delete/post/update/view`, `reports.create/delete/update/view`, `report.view`, `payment.view`, and `finance.view`. Finance has `accounting.create/view`, Finance CRUD, and Reports create/update/view.

### Root cause
Migration 047's `pke_guard_finance_role_permissions()` trigger restricts `finance.%` grants for Project Admin and ensures Finance mutation grants are Finance-role-only. It does not restrict `accounting.%` or `reports.%`. Migration 052 intentionally isolates Funder only and does not change Project Admin.

### Status / action required
- Migration 052 acceptance: PASS.
- Project Admin Finance write boundary for `finance.%`: PASS (`finance.update=false`).
- Accounting/Reports role ownership: **POTENTIAL BLOCKER**. Effective DB permission helper currently allows Project Admin accounting updates/deletes and report creation/deletion, while the Finance role lacks Accounting update/delete.
- No automatic correction was applied because the exact intended read-only scope for Project Admin across Accounting, Reports, and Payment must be confirmed. This requires a separate migration (053+) and separate checksum approval; do not mutate Production grants by ad hoc SQL.

## Backup and release evidence
- Fresh pre-052 recovery clone: `br-snowy-credit-b336z950`, still READY at ledger 51.
- Backup evidence manifest: `docs/audits/NEON_PRE_052_BACKUP_MANIFEST_20261120.json`.
- Backup evidence SHA-256: `cbb6216e1c86a238d97e9e7bd400c2073fda75d3dd7224a707ee0bbdcc4d8a7a`.
- Canonical post-apply ledger: `migration_history_manifest_001_052.json`.
- No Vercel deployment, Production promotion, or PR merge was performed.
