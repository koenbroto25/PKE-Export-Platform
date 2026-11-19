# PKE Role, Permission, RLS, API, Workflow & UX Design
**Date:** 2026-11-19
**Status:** DESIGN BASELINE — READ-ONLY AUDIT COMPLETE; IMPLEMENTATION NOT AUTHORIZED
**Target:** F1 continuation on `f1/project-scoped-cob-20261119`; Neon Production is audit target only

## 1. Approved decisions
- PM manages Project-scoped PKS data. Global legal identity changes require independent master-data approval.
- PM reads all Project transactions, evidence, histories and exceptions, but cannot use that visibility to write or approve technical/financial records.
- QA, Warehouse, Finance, Master of Loading and independent parties retain their technical approval authority.
- Master of Loading is a distinct role. Legacy `loading_manager` remains compatible until a safe mapping/migration is proven.
- Internal Auditor is independent and read-only across business lines; may create audit findings and track corrective actions.
- Users may hold multiple roles, with distinct role assignment and audit attribution.

## 2. Audit scope and evidence
Repository branch: `f1/project-scoped-cob-20261119`.
- `src/index.ts` blob SHA `04dd002b118d749c718d0ad67ab9bb3207c9957a` — 136 Express route declarations inventoried.
- `src/schema.ts` blob SHA `556dd9df4d5e160598332b51532f18f8523f7c00`.
- `src/auth.ts` blob SHA `f161d476ac4e59c48c5a3e865f83a20aa29ddefe`.
- `frontend/src/App.tsx` blob SHA `0761f78cbe17f28fa3b5c7654b48662acbe06f07`.
- `migrations/041_finance_notification_rls_recipient_guard.sql` blob SHA `b6e40ff778390c13ea9a1203c1e67d161a179e72`.

Neon Production: project `purple-base-63944903`, branch `br-damp-shape-b3xlh4nr`, database `neondb`.
- Database inventory: 162 tables/views; 152 public tables with RLS enabled; 510 public RLS policies.
- Latest migration history row: Migration 041, SHA-256 `96bf6ea57d68bc9913bc402cadeeb85beee6938a57b9acb9bd13c8d6c5ad2770`.
- Relevant tables exist: `role_catalog`, `permissions`, `role_permissions`, `project_roles`, `project_role_permissions`, `project_members`, `pks_sites`, `partner_organizations`, `project_supplier_participation`, `audit_events`, `project_change_requests`, `loading_operations`, `loading_segments`, `loading_tickets`.
- Existing Alpha/Beta role definitions are persistent QA fixtures, not proof that the global role template catalog is complete.

## 3. Verified findings
### F-01 Role catalogue drift
- Live global `role_catalog` contains seven roles: `admin`, `buyer`, `checker`, `finance`, `pm`, `supplier`, `warehouse`.
- Frontend `roleAccess` contains 18 role keys, including `field_manager`, `procurement`, `warehouse_manager`, `packing_supervisor`, `loading_manager`, `document_officer`, `cashier`, `accounting`, `funder`, `transporter`, `external_provider`, `viewer`.
- Project creation copies active `role_catalog` rows to `project_roles`. `defaultPermissionsForRole()` refers to permission codes that are missing from the live catalog; missing codes are silently skipped.
- This means frontend, Project templates, API defaults and permission catalog are not one coherent source of truth.

### F-02 Multi-role per Project is blocked
- `project_members_project_user_unique` enforces unique `(project_id,user_id)` and `project_members` stores one `project_role_id`.
- A user can hold different roles in different Projects, but cannot hold multiple Project roles in the same Project.
- `pke_has_project_permission()` already uses EXISTS across Project memberships/role-permission rows, and `/api/v1/me` already returns `projectMemberships[]` plus distinct permissions. The database uniqueness rule is the current blocker.
- Frontend still gates menus and `RoleGuard` using one `activeUser.role` and a hard-coded map.

### F-03 PM audit visibility is incomplete
- PM fixture has `audit.view` and selected domain read permissions, not universal Project-wide read.
- RLS uses different codes by table, such as `operations.view`, `inventory.view`, `finance.view`, `shipment.view`, `documents.view`, and `audit.view`.
- Add a dedicated read-only capability such as `project.audit.read_all`, applied to every Project-owned table and child table through safe parent joins. It must not grant write, approve, export, payment or delete rights.

### F-04 PKS master-data boundary is missing
- `pks_sites` stores facility identity, location, type, operating and verification status, source and organization link. Its current RLS policy is Project-member SELECT only.
- `partner_organizations` stores legal name, registration/tax identifiers, registered address, contacts and verification status. Current policy is relationship-scoped SELECT, not PM write.
- Introduce Project-scoped PKS participation/overlay data for PM-managed capacity, contacts, availability, Project-specific notes and participation. Keep global legal identity separate and route its changes through approval.

### F-05 Master of Loading capability gap
- Existing loading base tables are `loading_operations`, `loading_segments`, `loading_tickets`.
- Current loading-operation RLS uses generic `operations.*`; segments/tickets use `loading.ticket.create` and `shipment.view`.
- Inspected columns do not demonstrate complete readiness, signed plan/versioning, shift/hold handover, stop/delay/incident, independent quantity reconciliation and close-out pack.
- Frontend uses `loading_manager`; live global role catalogue has no matching role.

### F-06 Internal Auditor is not a distinct capability
- `audit_events` exists with Project-scoped `audit.view` access.
- No dedicated `internal_auditor` template or audit finding/corrective-action tables were identified.
- Add finding/action entities; Auditor can write only those entities, never underlying business records or audit events.

### F-07 Permission catalog drift
- API references missing codes including `documents.review`, `reports.manage`, `notifications.create`, `notifications.view`, `project.configuration.view`, `project.roles.view`, and `approvals.create`.
- RLS includes a policy referencing absent `project.change.delete`.
- Legacy and newer code families coexist, including `report.view`/`reports.view` and `manage_finance`/`finance.update`.
- Do not simply add and broadly grant missing codes. Canonicalize route/policy semantics first.

## 4. Target role catalogue
Use stable role codes, display labels, domain, assignment scope and template version. Do not create a new role for every job title when the capability boundary is identical.

| Domain | Role codes | Main boundary |
|---|---|---|
| Governance | `platform_admin`, `project_admin`, `pm`, `internal_auditor` | Platform control; Project access/config; Project orchestration and read-all; independent audit |
| Procurement/PKS | `procurement`, `pks_site_manager`, `supplier`, `buyer`, `contract_manager` | Sourcing, Project PKS data, assigned supplier/buyer, commercial contract |
| Production/quality | `production_manager`, `packing_supervisor`, `qc_officer`, `qa_manager`, `laboratory_officer`, `hse_officer` | Batch/packing; sampling/results; independent technical release/hold; safety observations |
| Warehouse/logistics | `warehouse_manager`, `warehouse_officer`, `inventory_controller`, `transport_manager`, `dispatcher`, `transporter`, `checker`, `driver` | Receipt/inventory control; dispatch/trip/checkpoint evidence; assigned tasks |
| Shipping/loading | `master_of_loading`, `loading_supervisor`, `loading_operator`, `terminal_representative`, `shipping_agent`, `marine_surveyor`, `ship_master` | Load coordination, shift execution, terminal authority, shipping coordination, independent survey, vessel Master |
| Finance | `finance`, `accounting`, `cashier`, `funder` | AP/AR/cash plan; journals; restricted cash custody; restricted funder reporting |

External counterparties (supplier, buyer, transporter, terminal representative, surveyor, shipping agent, ship Master) must have object-assigned access, limited Project scope, expiry and narrow document visibility. `ship_master` is not the application's Master of Loading.

## 5. Permission design
Canonical permission families to reconcile against every API/RLS use:
- Project: `project.view`, `project.update`, `project.members.view`, `project.members.manage`, `project.roles.manage`, `project.configuration.manage`.
- Read-all: `project.audit.read_all`, `audit.view`; audit-only writes: `audit.finding.create`, `audit.finding.update`, `audit.corrective_action.manage`.
- PKS: `pks.site.view`, `pks.site.create`, `pks.site.update`, `pks.participation.manage`, `pks.capacity.manage`, `pks.legal_change.submit`; global approval: `master_data.legal_identity.approve`.
- Quality: `quality.sample.create`, `quality.result.create`, `quality.result.review`, `quality.release.approve`, `quality.hold.manage`.
- Warehouse: `warehouse.receipt.create`, `warehouse.receipt.review`, `inventory.view`, `inventory.reserve`, `inventory.hold`, `inventory.reconcile`, `inventory.adjust.approve`.
- Loading: `loading.readiness.manage`, `loading.plan.create`, `loading.plan.submit`, `loading.plan.approve`, `loading.operation.manage`, `loading.shift.record`, `loading.ticket.create`, `loading.ticket.verify`, `loading.exception.create`, `loading.exception.resolve`, `loading.reconcile.submit`, `loading.reconcile.approve`.
- Documents: `documents.view`, `documents.create`, `documents.upload`, `documents.review`, `documents.verify`, `documents.download`.
- Finance, accounting, FX, reports, workflow, approvals and notifications remain separate domains. F1 Finance remains reporting/control only; no payment execution authority is implied.

Do not use `manage_all`, `view_all`, PM or Project Admin as a blanket bypass. Read-all must never satisfy write/approval policies.

## 6. Data model and RLS
### Multi-role assignment
Preferred design: retain one `project_members` identity/lifecycle row per user and add a child relation such as `project_member_roles` with Project, membership, role ID, active/expiry, grantor/time, revoker/time and reason. Backfill existing `project_members.project_role_id` into the child relation. Update permission helpers, `/me`, invite/member endpoints, notifications and UI. Keep the legacy role column/index until compatibility and rollback tests pass. Each action audit records the exact role assignment used, not a merged role string.

Alternative: one `project_members` row per role with composite uniqueness. This is simpler but duplicates membership lifecycle and complicates invitations, expiry, revocation and user listing; do not adopt without full API review.

### PKS boundary
- `partner_organizations` is global legal-entity master. Verified legal name, registration, tax identity and registered address changes are versioned requests requiring independent Master Data Steward/Platform Admin approval.
- `pks_sites` is global site/facility master. PM may request a new site or identity correction, not overwrite verified global identity fields.
- Candidate `project_pks_site_participation` stores Project/site association, operational contact, contracted/allocated capacity, delivery windows, Project terms, notes, effective dates, status and evidence. PM may create/update this overlay.
- RLS for the overlay requires Project scope and `pks.participation.manage`. Global master update is restricted to independent approval. Sensitive tax/auth fields are not returned in ordinary PM payloads.

### PM and Auditor read-all
- Add `project.audit.read_all` and explicit SELECT-only policies across Project-owned records and child tables using validated parent joins.
- Cover contracts, procurement, batches, quality, inventory, warehouse, trips/tracking, shipment/allocation, vessel/port/loading, document metadata/evidence, workflow, Finance/accounting read models, reports, exceptions and audit history.
- Keep sensitive field redaction and separate export/download permission. No insert/update/delete/approve authority from read-all.

### Audit finding entities
Candidate `audit_findings`, `audit_finding_actions`, and append-only `audit_finding_events`. Store Project, source entity, severity, description, evidence refs, accountable owner, due date, status, created_by, reviewer and immutable transitions. Prevent self-verification of a finding where independence is required.

### Loading entities
Use existing loading tables as base; add normalized records for readiness checklist, immutable loading-plan versions/sign-offs, shift/hold progress, stop/delay/incident/variance, shore-side vs ticket vs independent draft-survey reconciliation, and completion/Statement of Facts pack. Master of Loading coordinates and submits shore-side reconciliation but cannot approve independent survey, QA release, warehouse receipt, vessel stability or statutory terminal decisions.

## 7. API design
All business endpoints require verified identity, active Project context, active/non-expired role assignment, canonical permission check, resource-to-Project ownership validation and request-scoped RLS transaction.

Candidate endpoints:
- Role assignment: `POST /projects/:projectId/members/:memberId/role-assignments`, `PATCH /.../role-assignments/:assignmentId`, revoke endpoint; `GET` member/role views.
- PKS: `GET/POST/PATCH /projects/:projectId/pks-sites`; submit global changes via `/pks-site-change-requests`; independent approval endpoint for master-data stewards.
- Audit: `/projects/:projectId/audit/workbench`, `/audit/events`, `/audit/findings`, `/audit/findings/:id/actions`, corrective-action verification.
- Loading: readiness, loading plans, submit/approve plan, shift records, exceptions, reconciliation submit and separate approval.
- `/api/v1/me` returns Project memberships, role assignments, active Project, role labels and Project-specific effective permissions. Do not use one global `users.role` as Project authorization source.
- Frontend hides unavailable actions for usability only; API and RLS remain security boundaries.

## 8. Workflow
### PKS onboarding
PM creates Project PKS participation and operational data; global legal/site identity is submitted as a versioned request; independent steward checks evidence and approves; approved master links to Project overlay; all before/after values and actor/approver are audited.

### Quality and inventory
Production creates batch/lot; QC/Lab captures sample and result; QA independently reviews/releases/holds; Warehouse captures and independently verifies receipt; Inventory Controller reconciles variances; PM observes status/exceptions read-only.

### Loading
Shipping nominates vessel/port call; Master of Loading coordinates readiness across vessel, terminal, lots, QA, warehouse, documents and equipment; Terminal Representative and Ship's Master agree applicable loading plan; shift teams capture progress/tickets; exceptions trigger escalation; independent surveyor submits quantity evidence; Master of Loading submits shore-side reconciliation; designated independent/contractual approver accepts variance; completion pack is archived.

### Audit
Auditor filters Project records and evidence, creates finding, assigns corrective-action owner/due date, verifies evidence and closes/reopens. PM sees findings and overdue actions but cannot erase or rewrite audit history.

## 9. UX
- PM Project Command Center: workstream health, planned/actual quantity, readiness, exception aging, document completeness, quality/inventory, loading progress, Finance summary and audit timeline. PKS workspace edits Project overlay; global identity fields show verification status and request-change action.
- Master of Loading mobile Field Command Center: shift handover, vessel/hold/segment, readiness checklist, signed plan version, progress vs plan, tickets/evidence, downtime/exception, reconciliation. Large controls, short forms, offline draft queue and explicit sync/conflict state.
- Internal Auditor Workbench: read-only cross-line record detail, immutable timeline, before/after snapshots, evidence preview, exception history, findings and corrective actions.
- Role administration: Project context, multiple role chips, each grant's active/expired/revoked state, effective dates, and “why access is granted” trace. Prevent self-escalation.
- Derive navigation and route access from active Project permissions returned by API, not a static role-name map.

## 10. Implementation stages
0. Inventory every route, permission literal, RLS policy, trigger, role template and frontend route; canonicalize permission names; CI rejects unknown codes.
1. Add role templates and multi-role assignment relation; backfill; update helper functions, `/me`, member/invitation APIs, notifications and UI; keep compatibility until rollback-safe.
2. Add PM read-only Project audit access and Project PKS overlay; add independent global master-data request/approval.
3. Add `master_of_loading`, preserve legacy `loading_manager` compatibility; add readiness, plan version/signoff, shift, exceptions, tickets and reconciliation.
4. Add Internal Auditor, findings and corrective-action lifecycle.
5. Integrate API/UI; run authenticated UAT and expanded RLS/SoD regression.
Migration numbering follows actual repo manifest and Production migration history (041 latest observed); do not assume next migration number until reconciled.

## 11. Acceptance tests
- Multi-role union within one Project; independent role expiry/revoke; cross-Project isolation.
- PM can read all scoped records/evidence/history but cannot mutate or approve technical/financial records via read-all.
- PM can manage Project PKS overlay but cannot change verified legal identity; independent steward can approve with evidence.
- Master of Loading can coordinate readiness/plan/shift/tickets/exceptions/reconciliation submission, but cannot approve independent survey, QA, warehouse, payment or statutory decisions.
- Auditor can read all scoped business data and write findings/actions only; no business-record or audit-event mutation; no self-approval.
- No self-escalation; inactive/expired assignments denied; external roles limited to assigned objects.
- API and RLS permission parity; wrong Project IDs denied; direct SQL under `app_runtime_secure` cannot bypass scope.
- Audit captures actor, Project, exact role assignment, permission, target, request ID, timestamp, before/after and outcome.
- Rerun existing 36 permission-helper and 45+ RLS expectations, expanded to all roles, role combinations, endpoints, child tables and negative cases.
- Frontend menu/buttons/routes agree with API permissions; direct unauthorized URLs are denied.

## 12. Open gates
1. Confirm Project Admin is access/config only (recommended) rather than broad business-data administrator.
2. Identify independent global Master Data Steward.
3. Confirm whether terminal is internally controlled or an external counterparty.
4. Confirm plan signatories per port/vessel/contract; support configurable sign-off rather than one universal chain.
5. Validate PKE cargo classification/safety profile and current regulatory source with competent authorities before codifying cargo-specific safety rules.

**Approval boundary:** This is a design artifact only. Each implementation package must provide exact SQL/code artifacts, non-mutating test evidence and SHA-256; explicit owner approval is required before Production DDL or role/permission DML. Approval of this design does not authorize Production changes.