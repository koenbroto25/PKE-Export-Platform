# Comprehensive Permission Boundary Audit — 2026-11-21

**Status: FAIL / P0 permission remediation required. UX and dashboard redesign must remain paused until the permission release passes its full backtest.**

## 1. Scope and safety

- Repository: `koenbroto25/PKE-Export-Platform`
- Existing GitHub branch only: `f1/project-scoped-cob-20261119`
- Neon Production: project `purple-base-63944903`, branch `br-damp-shape-b3xlh4nr`, database `neondb`.
- Isolated backtest: existing UAT branch `br-young-boat-b3re832d` (`p0-preview-uat-20261120`), already at Migration 053.
- Production was queried read-only. All negative permission probes ran in nested rollback blocks on UAT. No grant, assignment, fixture, or business row was persisted by this audit.
- Production Migration 053 remains applied and verified: ledger 53/53; exact row 53 SHA-256 `3a016b348bfb3d2976c9619746bfe574e6153618797858d8a2abfdbc2dd0b3c4`.

Production baseline at audit time:
- 179 active permission codes.
- 2 Projects; 36 project role definitions; 24 project role assignments; 534 project-role permission grants.
- The two Projects are named `[TEST FIXTURE] PKE Alpha Export Project` and `[TEST FIXTURE] PKE Beta Export Project`.
- 23 of 24 users have `TEST FIXTURE` names; all 24 project memberships belong to fixture users. Alpha also has one warehouse receipt and one inventory movement.
- These fixture records predate this audit. They were not created or modified by this audit. They must not be mistaken for live business data.

## 2. P0 — Platform Administrator is still a Project-wide superuser

### Database evidence
For the active Platform Admin identity, the Production helper checks returned:
- `pke_is_platform_admin() = true`
- `pke_current_user_project_permissions(project A) = ['*']`
- `pke_has_project_permission(project A, 'payment.approve') = true`
- `pke_has_project_permission(project A, 'operations.delete') = true`

The same behavior reproduced on UAT. This conflicts with the canonical role catalogue rule that Platform Admin has platform governance only and must not be implicitly treated as a Project business role.

### API / frontend evidence
- `src/index.ts` `GET /api/v1/me` returns all active permission codes when `req.user.isAdmin` is true.
- `frontend/src/role-permissions.ts` returns true from `hasProjectPermission` whenever `platformAdmin === true`.
- `hasPageAccess` returns true for every page for Platform Admin.
- `App.tsx` skips loading Project permissions for Platform Admin, so the frontend bypass is not constrained by the selected Project's actual assignments.

### RLS evidence
- 143 permissive `pke_admin_all` policies exist across 143 public tables.
- 184 public RLS policies reference `pke_is_platform_admin()`; this total includes both permissive and explicitly negative conditions, so it must not be interpreted as 184 grants.
- The permissive `pke_admin_all` policies include transaction/business tables such as AP/AR invoices, journal entries, inventory lots/movements, payment instructions/evidence, shipments, loading, transport and warehouse records. PostgreSQL permissive policies combine with OR, so `pke_admin_all` bypasses the narrower Project permission policy on those tables.

### Required remediation
Remove the wildcard Project permission bypass from both database helper functions and the frontend. Preserve only explicit platform-governance actions. Review and remove `pke_admin_all` from Project business/transaction tables while preserving legitimate global reference-data and governance administration. Platform Admin PM appointment must remain possible through a narrow, explicit path; it must not become general Project staffing or business-data access.

## 3. P0 — Funder grant helper inconsistency and missing future-grant guard

Migration 052 removed existing Funder generic Finance/Accounting/Reports/Payment grants and made `pke_has_project_permission` deny those permission families for Funder. The current Funder assignment has only `project.view`.

However, the current-user permission-list helper `pke_current_user_project_permissions` does not apply the Funder exclusion, and no trigger prevents a future generic Funder grant.

UAT backtest, with the inserted permission rolled back:
- A new `finance.view` grant for Funder was allowed by the installed triggers.
- The permission-list helper included `finance.view`.
- `pke_has_project_permission(..., 'finance.view')` returned false.
- The same missing trigger allowed Funder `reports.view` and `payment.view` probes.

Result: **FAIL — UI/API permission-list mismatch is reproducible**, although no grant persisted. Add a database guard for Funder generic permission families and make every permission-list/effective-permission helper return the same restricted result.

## 4. P0 — Project Admin has 98 grants per Project instead of its 18-code canonical allowlist

Migration 053 correctly removed Accounting/Reports mutation grants and added the 3 read grants. It did not remove other Project Admin business-domain capabilities.

Per Project:
- Actual Project Admin grants: 98.
- Canonical `project_admin` template: 18.
- Excess grants: 80.

Excess capabilities include AI actions/runs, approval management, buyer requirement management, compliance assessment, document create/update/delete/upload/verify, FX CRUD, inventory create/update/delete/reconcile/reserve, logistics and operations mutations, payment visibility, shipping mutations, supplier management, vessel nomination/assessment, workflow create/update and other operational actions.

UAT trigger probes confirmed that Project Admin attempts to re-grant `approvals.manage`, `documents.delete`, `fx.create` and `payment.view` are not rejected by the installed 047/053 triggers (duplicate-key errors occurred only after the BEFORE triggers allowed the rows).

Required remediation: enforce the full canonical Project Admin allowlist at the database boundary and reconcile existing grants, not only the Finance/Accounting/Reports subset.

## 5. P0 — Permission grant enforcement is incomplete across role domains

UAT probes were executed inside rollback blocks. Existing duplicate grants reached the unique constraint, proving the BEFORE triggers did not reject them; new grant probes were rolled back after measurement.

| Role | Probe | Result |
|---|---|---|
| Finance | `accounting.create` | Trigger did not reject |
| Finance | `payment.approve` | Allowed |
| Accounting | `accounting.post` | Trigger did not reject |
| Buyer | `buyer.requirement.manage` | Trigger did not reject |
| Transporter | `logistics.create` | Trigger did not reject |
| Checker | `warehouse.receipt.create` | Trigger did not reject |
| Loading Manager | `vessel.nominate` | Trigger did not reject |
| Warehouse | `quality.result.review` | Trigger did not reject |
| Packing Supervisor | `quality.result.create` | Trigger did not reject |
| Project Admin | `approvals.manage`, `documents.delete`, `fx.create`, `payment.view` | Trigger did not reject |
| Funder | `finance.view`, `reports.view`, `payment.view` | New grants allowed |

Migration 047 protects only selected `finance.*` mutations and Project Admin Finance grants. Migration 053 protects only Project Admin Accounting/Reports mutations. Neither implements a complete role-domain allowlist. Finance `payment.approve` being grantable is incompatible with the explicit F1 boundary that payment instruction, approval, execution, evidence verification and payment reconciliation remain out of scope.

## 6. Canonical template vs Production grant drift

The source catalogue contains 34 canonical role templates. Production has 18 legacy Project role codes per two Projects. The 14 role codes that can currently be compared to a canonical template all differ from their expected permission sets.

| Legacy Project role | Canonical mapping | Actual grants / template grants per Project | Main discrepancy |
|---|---|---:|---|
| project_admin | project_admin | 98 / 18 | 80 excess business permissions |
| pm | pm | 31 / 27 | Missing member/role/configuration permissions; extra operational/reporting permissions |
| procurement | procurement | 7 / 8 | Missing buyer requirement, contract and facility permissions; extra operations permissions |
| finance | finance | 18 / 10 | Extra Accounting, FX, audit, project and report-update grants; missing `manage_rab` |
| accounting | accounting | 10 / 6 | Extra Accounting update/post/reverse, Finance view, audit and project view |
| buyer | buyer | 8 / 4 | Extra `buyer.requirement.manage`, contract, project and shipping permissions |
| cashier | cashier | 3 / 3 | Different set: missing Reports view; extra project and legacy financial-view grants |
| supplier | supplier | 6 / 4 | Extra document upload, project and shipping; missing product view |
| transporter | transporter | 6 / 3 | Extra logistics create, project view and shipment event create |
| checker | checker | 7 / 3 | Extra logistics create, receipt create and shipment permissions; missing operations view |
| packing_supervisor | packing_supervisor | 9 / 6 | Extra inventory update and QC sample/result creation; missing product view |
| warehouse | warehouse_manager | 11 / 9 | Extra inventory create, project view and QC permissions; missing warehouse create/update |
| loading_manager | master_of_loading | 19 / 10 | Extra operations, inventory reserve, vessel nomination/assessment and event creation; missing document/workflow view |
| funder | funder | 1 / 0 | Legacy project.view remains; no generic Finance/Reports grant currently exists |

The role codes `document_officer`, `external_provider`, `field_manager` and `viewer` have active Production assignments but no canonical mapping in the 34-role source catalogue. Their grants cannot safely be reconciled until their intended canonical role or retirement path is decided.

The `role_permissions` legacy table is empty; actual grants are in `project_role_permissions`. The legacy `role_catalog` table contains only seven rows and is not a complete substitute for the 34-role source catalogue.

## 7. PM assignment invariant and fixture residue

Project Alpha currently has two effective active PM assignments. The UAT negative backtest confirms the PM assignment trigger rejects a *new* duplicate PM appointment when an Admin actor is used. The existing duplicate rows were backfilled before the trigger and were deliberately preserved by Migration 043, so the current database still violates the one-active-PM invariant.

Both PM identities and both Projects are explicitly labelled TEST FIXTURE. Therefore this is not a request to choose a live PM; it is another symptom of Production fixture residue.

Project Beta has one effective PM; the expired PM assignment is ineffective due to expiry and inactive membership.

## 8. Production fixture residue — owner action required

Production contains:
- 2 Projects, both named `[TEST FIXTURE] ...`.
- 23 fixture users out of 24 users total (the remaining identity is the real Platform Admin).
- 24 fixture Project memberships.
- 24 Project role assignments, including the duplicate PM fixture assignments.
- 36 Project role definitions and 534 Project role permission grants.
- Alpha has one warehouse receipt and one inventory movement.

These rows were present before this audit. No fixture was inserted or removed by this audit. Do not delete them through ad hoc SQL. A dependency-aware cleanup plan and backup must precede removal; obtain explicit owner authorization before destructive cleanup.

## 9. Backtest results and isolation

- Migration 053 remains correctly applied on Production and UAT.
- Project Admin Accounting/Reports write denial from Migration 053 remains in place.
- New duplicate PM appointment was denied by the assignment guard.
- 13 non-canonical role grant probes were not blocked by the current trigger set; Finance `payment.approve` and Funder generic view grants were allowed in rollback probes.
- Funder helper mismatch reproduced: permission list true while effective permission false.
- Platform Admin wildcard bypass reproduced: `['*']` and unrestricted payment/operations helper results.
- After UAT probes, the branch still has ledger 53, 534 role grants, 24 role assignments, zero Funder generic Finance/Accounting/Reports/Payment grants and 196 total Project Admin grants across both Projects. All probes were rolled back.
- No Production DDL/DML, role grant, assignment, project, fixture or business record was changed.
- No GitHub branch was created, no PR was merged and no Vercel deployment was performed.

## 10. Required closure sequence before dashboard UX

1. Owner-authorized, dependency-aware cleanup decision for the existing Production TEST FIXTURE projects/users/memberships/role assignments and their linked receipt/movement records. Do not delete before backup and dependency inventory.
2. Prepare a versioned permission-boundary migration set:
   - Platform Admin governance-only helpers, API and frontend; no wildcard Project permission.
   - RLS policy cleanup for transactional tables, preserving explicit Project role access and narrowly scoped governance operations.
   - Funder future-grant guard and helper parity.
   - Full Project Admin allowlist.
   - Role-specific permission allowlists and canonical role reconciliation.
   - Finance payment-operation denial and Accounting posting/reversal separation.
3. Resolve the four unmapped legacy roles (`document_officer`, `external_provider`, `field_manager`, `viewer`) with explicit canonical mappings or retirement.
4. Resolve/reconcile the duplicate PM fixture assignment as part of authorized fixture cleanup; do not choose a live PM automatically.
5. Backtest on isolated UAT: all 34 canonical roles, all legacy mappings, positive and negative grants, CRUD by domain, Project Admin read-only boundaries, PM staffing/one-PM invariant, Funder deny, Finance no payment execution, cross-Project isolation, revoked/expired membership, and Platform Admin governance-only access. Assert both DB helper and RLS behavior.
6. Run source CI, migration release verifier, migration dry-run, API/frontend typecheck and frontend build on the exact existing branch head.
7. Obtain separate owner approval for each exact Production migration SHA, take a fresh verified Production backup, apply atomically and re-run read-back/backtests.
8. Only after all permission tests pass, resume role-specific dashboard UX/frontend work.

**Decision:** Permission audit is NOT PASS. Dashboard UX/frontend revision is intentionally blocked pending the above closure gates.


## 10. P0 remediation package prepared — 2026-11-21

**Status: PREPARED / NOT PASS.** The source remediation is committed to the existing GitHub branch `f1/project-scoped-cob-20261119` at commit `775622d2552ffcf4db6ad29e70addfc0b29fa4e0`; follow-up RLS/runtime hardening and CI-trigger updates are being staged. No Migration 054 SQL has been applied to Neon UAT or Production at this point.

- Canonical matrix expanded from 34 to 38 explicit templates. The four previously unmapped legacy codes now have independent least-privilege definitions; `warehouse` and `loading_manager` map only to the matching canonical `warehouse_manager` and `master_of_loading` templates.
- Migration 054 creates an owner-controlled role policy/allowlist, normalizes existing grants to exact templates, and rejects future non-canonical grants. Platform Admin is excluded from Project permission helpers; project/object permission helpers and RLS policies are being hardened to remove global business-data bypasses.
- Project Admin is read-only for Finance, Accounting and Reports. Finance receives no payment.* permissions. Accounting receives no `accounting.post` or `accounting.reverse`. Funder receives no generic Finance/Accounting/Reports/Payment permission. Payment instruction, approval, issue, execution, evidence verification and reconciliation guards no longer rely on a Platform Admin bypass.
- API and frontend permission checks no longer grant Project access merely because `platformAdmin=true`. The Platform Admin Projects governance surface remains accessible; Project business pages require a real active Project role.
- UAT validation must cover all 38 canonical templates, every mapped legacy role, positive and negative grants, trigger enforcement, Funder helper parity, Project Admin read-only, Finance no-payment, Accounting no-post/reverse, Platform Admin governance-only, PM-only Platform Admin appointment, duplicate PM denial, expired/revoked memberships, cross-Project isolation, RLS and API denial.
- Existing duplicate active PM fixture assignments and all TEST FIXTURE business records remain unchanged pending explicit owner-approved cleanup. Therefore the current Production dataset cannot yet be marked P0 PASS.
- No Production SQL or data changes, no Vercel deployment, no PR merge and no new GitHub branch.


- Follow-up API/DB alignment: canonical permission templates are runtime read-only. Runtime can only insert allowlisted permissions during canonical role activation; UPDATE/DELETE are revoked and the legacy arbitrary permission replacement endpoint now returns `409 ROLE_PERMISSION_TEMPLATES_IMMUTABLE`.

- Final prepared Migration 054 SHA-256: `821800c7a30a80a1a63bab1bfe458d29df393fc31026645f5c181660f853a0a2`. This checksum is the release approval boundary; no Neon branch has received Migration 054 yet.
