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
Within the same transaction as Migration 052, the test temporarily reintroduced `finance.view` and `reports.view` for the active Funder assignment. Calls to `pke_has_project_permission` returned false for both. A follow-up permission-matrix backtest iterated all active generic Finance/Accounting/Reports/Payment permission codes: codes allowed by the assignment trigger were rejected by the permission helper, while Finance create/update/delete codes were rejected by the existing role-assignment trigger. All temporary grants were deleted before the test transaction completed. Post-test read-back confirms zero Funder generic grants and no temporary test grants remain. A separate post-commit effective check returned false for Funder `finance.view`, `accounting.view`, `reports.view`, and `payment.view`.

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


## Owner-policy resolution and Migration 053 preparation

### Decision adopted for the source policy
The Project Admin boundary is **Project administration and access/configuration only**, not broad business-data administration. This follows the approved role-governance design baseline: Platform/App Admin appoints the PM and governs central security ceilings; PM configures the operational role composition; technical role owners retain their domain authority. Project Admin therefore remains read-only for Accounting and Reports, just as it is read-only for Finance.

Allowed Project Admin read permissions:
- `accounting.view`
- `reports.view`
- legacy `report.view`
- existing `finance.view`

Denied Project Admin mutation permissions:
- all `accounting.*` except `accounting.view` (including create/update/delete/post)
- all `reports.*` except `reports.view` (including create/update/delete)

Finance role grants, payment permissions, PM permissions and other role grants are not changed by this policy package. This is deliberately least-privilege and preserves domain ownership rather than making Project Admin a second Finance/Accounting operator.

### Migration 053 source status
- Added `migrations/053_project_admin_accounting_reports_read_only.sql` to the existing branch.
- The migration installs a SECURITY DEFINER trigger guard with restricted `search_path`, revokes PUBLIC EXECUTE, grants EXECUTE to `app_runtime_secure`, removes existing Project Admin Accounting/Reports mutation grants, and ensures read-only view grants.
- Added canonical Project Admin template read permissions and explicit regression contract tests.
- Exact Migration 053 SHA-256: `3a016b348bfb3d2976c9619746bfe574e6153618797858d8a2abfdbc2dd0b3c4`.
- **PREPARED ONLY — NOT APPLIED TO NEON PRODUCTION.** Production DDL/permission DML requires a separate approval of this exact SQL SHA-256 after source CI and isolated backtest evidence.
- No Production role grants, role assignments, business data, or schema were changed for this policy decision.


### Latest-source CI/backtest evidence — 2026-11-20
- Tested source head: `38fb83561202c5c0c04b4bb5c5ba8054b65bf274` on existing branch `f1/project-scoped-cob-20261119`.
- Unit Tests run `44766201249`: SUCCESS — 22 test files, 243 tests passed. The new Project Admin Accounting/Reports contract suite contributed 4 passing tests.
- Within the same Unit Tests workflow: Production migration release verifier PASS; applied Migration 052 + pre-apply backup verifier PASS; migration runner dry-run PASS; backend TypeScript PASS; frontend TypeScript PASS; frontend production build PASS.
- Dependency Audit Evidence run `44766201241`: SUCCESS — root and frontend production dependency audit steps plus full dependency-tree audit/evidence upload completed.
- Migration 053 remains prepared-only. This CI is a source/static contract backtest; no SQL was applied to Neon Production, no role grants were changed, and no isolated Neon branch was modified.


## Migration 053 isolated Neon backtest — 2026-11-20

### Test environment
- Neon project: `purple-base-63944903`.
- Neon test branch used: `br-young-boat-b3re832d` (`p0-preview-uat-20261120`), an existing UAT clone of Production.
- Attempt to create a separate temporary branch was blocked by Neon `branches limit exceeded`. To avoid deleting or overwriting another branch, the existing UAT clone was used as the isolated test branch. It was confirmed to have 0 written bytes before testing.
- The UAT clone was initially at migration ledger 051. Applied the already-approved Migration 052 to the UAT clone only, recorded exact row 52 and SHA, then applied Migration 053. This made the test stack 001–053 without touching Production.
- Migration 053 exact SHA-256: `3a016b348bfb3d2976c9619746bfe574e6153618797858d8a2abfdbc2dd0b3c4`.

### Backtest results
- Test branch migration ledger: contiguous through 053; row 52 and row 53 filenames/SHA/status verified.
- Both Project Admin role definitions: exactly 3 read grants (`accounting.view`, `reports.view`, `report.view`) and 0 Accounting/Reports write/post grants.
- Trigger negative tests: denied 4 forbidden inserts (accounting.update and reports.delete on each Project Admin role) and denied 2 privilege-escalation updates.
- Trigger positive tests: allowed read-only permission rows to remain/update; no test rows persisted.
- Effective permission helper for the active Project Admin assignment: Finance/Accounting/Reports view allowed; Finance update, Accounting create/update/delete/post and Reports create/update/delete denied.
- Function security: SECURITY DEFINER true; `search_path=pg_catalog, public`; EXECUTE granted to `app_runtime_secure`; PUBLIC EXECUTE false.
- Finance role grant matrix matched Production exactly. All other non-Funder, non-Project-Admin role grants also matched Production exactly (200 permission grants on each side).
- Production isolation check: Production ledger remains 052; no Migration 053 guard function exists there; Project Admin still has 7 write grants per Project, confirming no test DDL/DML leaked to Production.
- No business records, assignments, memberships, or Project rows were created or modified. The test branch retains Migration 053 for review; it was not deleted because it is the pre-existing UAT branch, not a newly created disposable branch.

### Result
**PASS — isolated Migration 053 database backtest.** This is evidence for a separate Production release approval; it does not authorize applying Migration 053 to Neon Production.
