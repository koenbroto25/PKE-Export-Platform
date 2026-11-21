# Role Dashboard Implementation & Blocker Audit

**Date:** 2026-11-20  
**Repository:** `koenbroto25/PKE-Export-Platform`  
**Execution branch:** `f1/project-scoped-cob-20261119` (existing branch only)  
**Scope:** role landing dashboard, dashboard navigation, source-backed metrics, task queue projection, role boundaries and next full-revision plan.

## 1. Executive result

A project-scoped role dashboard landing surface has been implemented for all **34 canonical Project role templates**. The home route now renders `RoleDashboardPage`; each active role contributes a role-focus panel with responsibility, expected output and only the workbench links intended for that role. Users with multiple active roles in the selected Project see the combined role focus, while the effective permission set remains Project-scoped.

The dashboard uses existing API sources only: Project list, Project work items, contracts/programs, warehouse receipts, inventory lots, truck trips, shipment allocations, project documents/requirements, AP/AR invoices, Cash Advances, journals and Project reports. It does not create synthetic operational data. Failed sources are rendered as unknown (`—`) instead of being silently converted to zero.

**Important distinction:** this completes the dashboard landing surface and navigation framework, not every missing business workflow represented by those roles. Dedicated data-entry/review workflows still need to be implemented for domains marked unavailable below. Full authenticated role/browser acceptance remains blocked; therefore this is **SOURCE IMPLEMENTED / RUNTIME UAT BLOCKED**, not end-to-end COMPLETE.

## 2. Changes recorded on the existing branch

| File | Change |
|---|---|
| `frontend/src/RoleDashboardPage.tsx` | New project-scoped dashboard; maps all 34 role templates; permission-gated API reads; role-focus panels; source-backed metrics; assigned-task queue; explicit unavailable-domain states |
| `frontend/src/RoleDashboardPage.css` | Responsive dashboard layout using the shared application panel styles |
| `frontend/src/App.tsx` | Home route now renders `RoleDashboardPage` |
| `frontend/src/role-permissions.ts` | Any active Project role may open its own scoped landing dashboard, including external roles; data permissions remain separately gated |
| `src/f1-role-ux-rules.test.ts` | Updated external-role dashboard expectations and added canonical role-dashboard coverage contract |

Canonical role coverage check: **34 role codes found; 34 dashboard mappings present; 0 missing mappings**.

The task queue calls the existing Project work-items endpoint for the selected Project. The API remains responsible for returning the PM Project queue or the current user's assigned-role/assignee queue. Reading a notification is not treated as task acknowledgement or completion.

Platform Admin governance is deliberately separated from Project business data: the dashboard does not use the Platform Admin flag as a blanket Project permission grant. Platform Admin gets the platform governance landing surface and Project list; Project business metrics require actual Project-role permission context.

## 3. Role coverage and current operational readiness

| Role family | Canonical roles | Dashboard focus / source-backed modules | Remaining blocker |
|---|---|---|---|
| Platform governance | Platform Administrator, Project Administrator, Project Manager, Internal Auditor | Project governance, access, reports, PM task queue, read-only audit/Finance visibility where granted | Dedicated audit findings/response/closure workbench; full authenticated role matrix |
| Contract & procurement | Procurement Officer, PKS Site Manager, Contract Manager, Buyer, Supplier | Contract/program API where granted; buyer and supplier portals; assigned tasks | Purchase requisition, PO commitment, supplier delivery promise, PO-to-GRN three-way match, supplier object-scope UAT |
| Production & quality | Production Manager, Packing Supervisor, Quality Control Officer, Quality Assurance Manager, Laboratory Officer, HSE Officer | Existing operational/inventory/document entry points where permission permits; assigned tasks | Production batch/output, packing execution, sample/result/Lab, independent QA release/hold, HSE inspection and corrective-action APIs/workbenches |
| Warehouse & inventory | Warehouse Manager, Warehouse Officer, Inventory Controller | Warehouse receipts, inventory lots, movement/reservation/hold source pages | Reconciliation workbench, receipt-to-PO matching, QA-hold linkage, full segregation-of-duties UAT |
| Transport | Transport Manager, Dispatcher, Transporter, Checker, Driver | Truck trips, tracking/checkpoints, assigned task queue and transporter portal | Dispatch board, vehicle/driver assignment, route SLA/ETA, external trip assignment and checker independence UAT |
| Shipping & loading | Master of Loading, Loading Supervisor, Loading Operator, Terminal Representative, Shipping Agent, Marine Surveyor, Ship Master | Shipment allocation and available document/task entry points | Vessel call/berth, loading plan/ticket/shift/equipment/downtime, survey certificate, ship-master acknowledgement, laytime and external object scope |
| Finance & Accounting | Finance Officer, Accountant, Cashier/Treasury, Project Funder | AP/AR, RAB/FX/Finance, Cash Advance, journals, reports and payment-instruction fail-closed page | Funder permission/portal mismatch; Accounting posting/reversal policy; payment execution/evidence/bank reconciliation and LC proceeds. Payment execution is outside F1 scope and must remain disabled until separately approved |

All 34 roles have a dashboard focus mapping. This does **not** mean all 34 roles have a complete transaction workbench. The UI explicitly labels Production/QA, vessel/loading/laytime, LC presentation and bank/payment reconciliation as unavailable rather than manufacturing readiness values.

## 4. Security and UX audit

### Implemented safeguards

- Dashboard landing access is available to active internal and external Project roles; external roles remain confined to the API permissions and dedicated object-scoped data endpoints.
- API calls are requested only for the relevant Project and the active permission set, except the work-item endpoint whose server contract returns the user's assigned scope.
- Project permissions are not inferred from roles in the browser; the existing `/projects/:id/my-permissions` response remains the effective permission source.
- Platform Admin is not treated as a universal Project business role by the new dashboard.
- Project Admin Finance visibility remains view-only; Finance mutation remains owned by Finance permissions and server/RLS enforcement.
- Metrics use source counts only; failed source calls show unknown state rather than false zero.
- Task status and notification read state remain separate.
- No Production business rows, mock rows, role assignments, or Auth identities were created by this dashboard change.
- No GitHub branch was created; no PR merge or Production deployment was attempted.

### Known role navigation mismatch

The canonical `funder` role template currently grants `finance.view`, `reports.view`, `report.view` and `view_financial`, but the existing dedicated `/funder` route is guarded by `funder.view`. The role dashboard therefore does not link to that route and uses the reports surface instead. Resolve this by reconciling the permission catalogue, Production permission registry, API policy and route guard before enabling a dedicated Funder portal. Do not add a new grant implicitly.

### Runtime acceptance not verified

- The isolated Preview clone currently has 24 PKE application users but only one linked Neon Auth identity. Existing role assignments do not constitute authenticated browser identities.
- Vercel Preview deployment is externally blocked by the daily deployment quota. No latest-head Preview/browser smoke can be claimed.
- Earlier DB-level isolated UAT passed PM task lifecycle, assigned-role/assignee isolation, revoked-assignment denial, cross-Project denial, task notification delivery/read and inventory receipt → movement → hold/idempotency. That is database-role UAT, not authenticated browser UAT for all roles.
- GitHub Unit Tests, frontend typecheck and frontend build passed on the immediately preceding dashboard integration commit `064be00284de14ebd32e8afb2dfc03bf223a585a` (run `44751601784`). The subsequent role-dashboard permission/test refinements are later than that run; no CI result has been returned for the latest dashboard commit yet. Dependency Audit run `44751601845` passed on the preceding commit only.

## 5. Blocker register

| ID | Priority | Blocker | Impact | Required closure evidence |
|---|---|---|---|---|
| RD-01 | P0 external | Only one Auth-linked identity on Preview clone | Cannot execute real browser/API role matrix across 34 roles or multi-role users | Provision/activate approved test identities using a controlled process; test each role and multiple-role union in the isolated Preview environment |
| RD-02 | P0 external | Vercel daily deployment quota exceeded | Latest dashboard source cannot be deployed to Preview for browser smoke | Wait for quota reset or owner-approved Vercel plan/quota resolution; deploy exact current branch head to Preview only |
| RD-03 | P0 validation | Latest code/test commit has no CI evidence yet | No verified typecheck/build/test result for final dashboard refinement | Obtain Unit Tests and Dependency Audit SUCCESS on exact latest head; inspect logs, not only status |
| RD-04 | P1 | Funder template/route permission mismatch | Funder's dedicated portal is inaccessible under its canonical role template | Reconcile `funder.view` across permission registry, role template, route/API guard and RLS; owner-approved grant if required |
| RD-05 | P1 | Procurement/PO workflow missing | Procurement dashboard cannot show commitments or three-way match | Implement requisition → PO → supplier commitment → receipt → invoice matching with audit/RLS |
| RD-06 | P1 | Production/packing/quality/HSE workflows missing | Operations and PM readiness cannot be certified | Implement production, packing, QC/Lab, independent QA release/hold and HSE workflows |
| RD-07 | P1 | Dispatch planning and ETA/SLA incomplete | Transport role workbenches cannot provide dispatch/capacity/delay control | Implement trip assignment, vehicle/driver linkage, route/SLA provenance and exception queue |
| RD-08 | P1 | Vessel/loading/survey/laytime workflows missing | Shipment allocation is not evidence of loading completion or vessel acceptance | Implement vessel call, berth, loading plan/tickets/shifts, independent survey, ship-master acknowledgement and laytime evidence |
| RD-09 | P1 | LC-specific document and bank presentation workflow missing | Document checklist is not an LC compliance/presentation result | Implement LC clauses, original/copy rules, discrepancy resolution, deadline and bank acknowledgement |
| RD-10 | P1 / separate scope | Payment execution and bank reconciliation not implemented | Cashier/Finance dashboard must remain informational/fail-closed | Separate owner-approved scope and maker-checker design; do not silently pull this into F1 |
| RD-11 | P1 | Dedicated audit finding lifecycle missing | Internal Auditor can review source data but cannot manage findings end-to-end | Finding → owner response → evidence → independent closure verification and immutable audit |
| RD-12 | P1 | Role-specific report templates/freshness not complete | PM and role dashboards lack a complete report catalogue and freshness contract | Define KPI formulas, source entities, cutoff, freshness, missing-data and export audit per role |

## 6. Comprehensive revision plan

### Wave A — close dashboard source and CI gate
1. Re-read exact current branch head and diff; confirm all five changed source files are present on the intended branch.
2. Run Unit Tests, migration verifier/dry-run, backend typecheck, frontend typecheck and frontend production build on that exact head.
3. Fix every compile/test failure before adding new UI features.
4. Review every dashboard shortcut against `hasPageAccess` and server route permissions; remove any link that would redirect or expose an unauthorized page.
5. Confirm no API metric reports zero when the source failed, was not requested, or is not integrated.
6. Update this audit and `PKE_P03_PLAN.md` with exact CI run IDs and commit SHA.

### Wave B — authenticated role dashboard UAT
1. Establish approved test identity provisioning for all 34 canonical roles on the isolated Preview clone; no Production mock data.
2. Test each role's login, active Project selection, navigation, dashboard metrics, task queue, direct URL, API 401/403 behavior and object-scoped records.
3. Test one user with multiple roles in one Project (permission union), then separate Projects (no permission carry-over).
4. Test inactive, revoked, expired and role-disabled assignments; verify dashboard and task access disappear immediately.
5. Test external Buyer/Supplier/Transporter/Terminal/Shipping Agent/Surveyor/Ship Master isolation against another partner's records.
6. Test Project Admin Finance read-only, Finance maker-checker, Accounting boundaries, QA independence, and PM non-authority boundaries.
7. Record positive and negative cases with request/response evidence; browser screenshots are supplemental, not a substitute for API/RLS evidence.

### Wave C — finish source-backed role workbenches
1. Close F1 PRI-1: Cash Advance requestor-own/Finance decision, financial audit events, allocation/loading/inventory reconciliation, and document/report artifact integrity.
2. Implement procurement PO and receipt matching.
3. Implement production/packing, QC/Lab, QA release/hold and HSE.
4. Complete warehouse reconciliation and quality linkage.
5. Complete dispatch/vehicle/driver/checkpoint SLA workflow.
6. Implement vessel/berth/loading/survey/laytime workflow.
7. Implement LC clause/discrepancy/presentation workflow.
8. Implement Internal Auditor findings/corrective-action closure.
9. Resolve Funder permission mismatch.
10. Keep payment execution/bank reconciliation as a separately approved scope; current F1 payment instructions remain fail-closed.

### Wave D — integrated workflow and PM Control Tower
1. Connect each source-domain event to the shared `project_work_items` task engine with idempotent event creation and deduplication.
2. Ensure every role sees only assigned-role/assignee tasks; PM sees Project-wide task state; Project Admin does not gain PM task privileges implicitly.
3. Add role-specific queues, filters, SLA aging, overdue/blocked signals and evidence drill-through.
4. Make PM readiness gates derive only from implemented source workflows; missing domains remain `unavailable`, not green/zero.
5. Define report KPI formula, source, units, cutoff, freshness and missing-data behavior.

### Wave E — full regression and release gate
1. Run role/Project matrix and full end-to-end workflow backtest on isolated Preview only.
2. Verify RLS, direct API access, append-only audit events, idempotency, concurrency and recovery.
3. Verify all frontend routes and actions against server permissions.
4. Re-run Unit Tests, Dependency Audit, migration release verifier/dry-run, backend/frontend typechecks and production build.
5. Obtain exact-head Preview deployment and browser/API smoke.
6. Publish one consolidated audit with PASS / BLOCKED / NOT STARTED and evidence links.
7. Only after all required gates pass, request separate owner decisions for PR readiness/merge and Production release. No automatic merge or Production promotion.

## 7. Release status

- Role dashboard source: **IMPLEMENTED** (34/34 role focus mappings).
- Role-aware landing access: **IMPLEMENTED IN SOURCE; CI PENDING ON LATEST HEAD**.
- Permission-gated source metrics and task queue: **IMPLEMENTED IN SOURCE; authenticated UAT PENDING**.
- All role operational workflows: **PARTIAL / BLOCKED BY DOMAIN GAPS**.
- Full authenticated role/browser acceptance: **BLOCKED** (RD-01, RD-02).
- PR #2: **OPEN / DRAFT / UNMERGED**.
- Production deployment: **NOT ATTEMPTED**.
- Neon Production business data: **UNCHANGED BY THIS DASHBOARD WORK**.


## 8. Latest-head CI closure — 2026-11-20

Exact PR/source head checked: `91fec201c63c08d56ebad6b146b6218ba14801dc`.

- Unit Tests run `44752309698`: **SUCCESS**.
  - 18 test files passed; 218 tests passed.
  - Production migration history/release verifier passed (verified contiguous ledger through 051; exact source hashes 036–051 pinned).
  - Migration runner dry-run passed with no database connection.
  - Backend API TypeScript check passed.
  - Frontend TypeScript check passed.
  - Frontend production build passed (Vite build completed).
- Dependency Audit Evidence run `44752309859`: **SUCCESS**; root and frontend production dependency audits and dependency-tree audit steps completed.
- This CI evidence verifies source/static/build gates only. It does not prove authenticated browser role coverage, Preview deployment, real object-level external partner isolation or operational workflows whose APIs do not exist.
- Vercel Preview/browser smoke remains BLOCKED by the daily deployment quota. The isolated Preview clone still has only one Auth-linked PKE user. No Production deploy or PR merge was attempted.

Updated source acceptance:
- Role dashboard source, TypeScript, build, unit/security tests and dependency audit: **PASS on exact head 91fec**.
- Authenticated 34-role browser/API matrix: **BLOCKED_EXTERNAL / NOT VERIFIED**.
- Full operational workflow coverage: **PARTIAL** pending RD-04 through RD-12.


## 9. Wave C execution checkpoint — inventory and warehouse hardening

Source changes committed on the existing branch after the dashboard CI gate:

- `src/index.ts` — inventory hold idempotency:
  - identical replay returns the original hold with HTTP 200 and `idempotentReplay: true`;
  - replay is accepted only when Project, lot, quantity, unit, reason and original actor match;
  - reuse of the same key for a different request returns `IDEMPOTENCY_KEY_CONFLICT`;
  - concurrent duplicate insert is re-read after `ON CONFLICT DO NOTHING` and handled idempotently.
- `src/index.ts` — inventory movement validation:
  - quantity must be finite and positive;
  - movement type and unit must be non-empty;
  - lot is locked and unit must match the lot;
  - writes use the validated numeric quantity and trimmed unit/type.
- `src/index.ts` — warehouse receipt validation:
  - create and update require positive finite quantities;
  - unit must be non-empty;
  - create/update check the unit against the linked inventory lot when a lot is linked;
  - linked lot is locked during receipt creation.
- Added `src/inventory-movement-hold.contract.test.ts` with six contract assertions covering idempotent replay, actor/request identity, hold unit matching, positive movement quantities, movement unit matching, and receipt create/update validation.
- Added the new contract test to the root `npm test` script in `package.json`; this ensures CI includes it rather than leaving it as an undiscovered test file.
- No migration was introduced; no Neon branch/database was mutated; no mock business data was created.
- Source commits: `97f2fa363b905ac1c1668a7bb8ed231a12573a7f` (inventory hold/movement), `023fd505be2f718d957107a1ebb3b0db0e3de4ba` (warehouse receipt), `94bde76a9cf2982790a5454c4d0274d6dcec9d24` (contract tests), `4d4d7809fb56b5aa5cbad3ca6e0b7dd32e82a902` (CI test inclusion).
- Latest source head at checkpoint: `94bde76a9cf2982790a5454c4d0274d6dcec9d24`; CI has not yet returned for this head. The prior dashboard-only head `91fec201c63c08d56ebad6b146b6218ba14801dc` retains its verified 218-test/typecheck/build/dependency audit results, but those results do not cover these later inventory changes.
- Runtime DB/API integration UAT for the new replay and validation behavior is still NOT VERIFIED. It must run on isolated Preview after deployment and approved authenticated identities are available.

### Wave C remaining work after this checkpoint

1. Add transaction-level tests for concurrent duplicate hold replay and cross-actor key collision.
2. Verify movement ledger triggers and balances for every movement type; test negative/overdrawn movement rejection and reversal semantics.
3. Complete warehouse receipt-to-inventory movement reconciliation, weighbridge evidence integrity and duplicate receipt protection.
4. Complete reservation/allocation/load reconciliation, including draft/allocated/partially-loaded/loaded/cancelled/reversed transitions and aggregate capacity under concurrency.
5. Implement the missing source workflows listed in RD-05 through RD-12; do not invent database schemas or apply migrations without preflight, backup and owner-approved exact checksum.


### Additional database-contract alignment

Inspection of migration `005_inventory_and_receipts.sql` confirmed the allowed database enums:
- `warehouse_receipts.status`: `pending | verified | partial`.
- `inventory_movements.movement_type`: `receipt | issue | transfer | adjustment`.
- `inventory_movements.status`: `posted | reversed | adjusted`.

The API now validates these enums before attempting the INSERT/UPDATE, avoiding generic 500 responses for known constraint violations. Contract tests assert these enum sets alongside the positive quantity and unit checks.

Latest executable source commit after this enum alignment: `b66d46c880fb91106a11707c6e2fbc2095e85a29`. CI for this exact head is pending at the time of this documentation update; the preceding `36aae87466983b1cf6aa6d86d7a279e28b12ec8d` run passed 224 tests (19 files), migration verifier/dry-run, backend/frontend typecheck, frontend build and dependency audit, but it predates the enum-only source/test refinements.


### Latest Wave C source CI evidence

Exact executable source head: `b66d46c880fb91106a11707c6e2fbc2095e85a29`.

- Unit Tests run `44754247718`: **SUCCESS**.
  - 19/19 test files passed.
  - 224/224 tests passed, including all 6 new inventory/warehouse contract tests.
  - Migration release verifier and migration runner dry-run passed.
  - Backend API TypeScript check passed.
  - Frontend TypeScript check passed.
  - Frontend production build passed.
- Dependency Audit run `44754247664`: **SUCCESS**.
  - Root and frontend production dependency audits passed.
  - Both dependency-tree audit steps passed.
- This is source/static CI only. It does not verify concurrent DB behavior, live API RLS, real warehouse receipts, inventory balances, or Preview/browser acceptance.
- Source status for this checkpoint: **PASS**. DB/API integration and authenticated UAT remain **NOT VERIFIED / BLOCKED EXTERNAL**.


### Production data preflight — read-only, 2026-11-20

Read-only aggregate query on Neon Production branch `br-damp-shape-b3xlh4nr` (project `purple-base-63944903`) checked receipt/movement/hold integrity predicates:
- `warehouse_receipts`: 1 row; 0 invalid (received quantity positive, unit non-empty, status in allowed enum).
- `inventory_movements`: 1 row; 0 invalid (quantity positive, unit non-empty, movement type/status in allowed enums).
- `inventory_holds`: 0 rows; 0 invalid.
No row values were read or changed. This confirms Production is not literally empty in the first two tables, even though no invalid values were found. Do not assume these rows are disposable test data; inspect provenance/ownership before any cleanup or backfill. No migration 052 or other DDL was applied.


## 10. Funder access isolation finding and remediation

A read-only Neon Production permission audit found a material external-role overgrant:
- Two active Funder role definitions contain generic grants for `finance.view`, `reports.view`, `report.view`, and `view_financial`.
- One active Funder role assignment currently inherits those grants.
- Generic Finance APIs such as AP/AR and Cash Advance list, and generic Reports APIs, are not an appropriate sharing boundary for an external Funder.

### Source remediation committed

- Canonical Funder template now grants **no generic Finance/Accounting/Reports/payment permissions**.
- `requireProjectPermission` and `findExplicitProjectPermission` no longer attribute generic Finance/Accounting/Reports/payment permissions to a Funder role. A separate active non-Funder role in the same Project may still supply its own explicit permission.
- Unscoped `GET /reports/runs` now requires an active non-Funder role assignment with `reports.view`.
- Non-platform report generation requires a Project ID.
- Finance and Reports page guards require an eligible active internal Project role; the Funder-only landing dashboard remains accessible but has no generic Finance/Reports metrics or shortcuts.
- Added `src/funder-permission-isolation.contract.test.ts` (7 tests) and included it in `npm test`.

### Database remediation prepared, not applied

Migration `052_funder_finance_report_scope_isolation.sql`:
- Deletes existing generic Finance/Accounting/Reports/payment grants from Funder role definitions.
- Replaces `pke_has_project_permission(uuid,text)` so RLS also denies those generic permission families when the only matching assignment is Funder.
- SHA-256: `cc8d34c12d34eab9c4cc9aeabd46d9da59b1ec7ef0c7c89345d4b49455a6ac0b`.
- Migration 052 is pinned in `scripts/migrate.mjs` and `scripts/verify-migration-release-policy.mjs`, and passes dry-run/release-source verification. The runner deliberately does **not** enable apply for 052.
- Production permission grants remain unchanged until a fresh current-Production backup is made and the owner approves this exact SQL hash. Do not treat source-level guards as a substitute for the DB/RLS migration; this remains a live Production authorization blocker until applied and verified.

### CI evidence for Funder isolation source

Exact executable source head: `d18d8d267afcdfa0179b11e7408fa8cb9b43d607`.
- Unit Tests run `44755729653`: **SUCCESS**, 20/20 files and 231/231 tests passed, including 7 Funder isolation and 6 inventory/warehouse tests.
- Migration release verifier and dry-run passed; dry-run explicitly reports Migration 052 as prepared-only and made no DB connection.
- Backend API TypeScript, frontend TypeScript and frontend production build passed.
- Dependency Audit run `44755729686`: **SUCCESS**; root/frontend production and dependency-tree audits passed.
- No Migration 052 DDL was applied. No Production data or permissions were changed.


### Backup gate for Migration 052

- Neon Production branch inventory currently contains 10 branches (Production root plus 9 child branches); the Neon API rejected creation of a new pre-052 backup with `branches limit exceeded`.
- Existing backup `br-steep-butterfly-b30wgjc3` is the pre-048/049 snapshot and is not a current post-051 backup. It is not an acceptable substitute for a fresh pre-052 snapshot.
- No old backup/UAT/migration branch was deleted to free quota; deletion is destructive and requires owner authorization.
- Migration 052 remains prepared-only and cannot be applied until a current Production backup can be created and the exact SHA is approved.


## 2026-11-21 — Funder and Project context remediation (UAT)

This section supersedes earlier statements that the Funder workspace remained blocked by the missing `funder.view` permission. Historical Production and Preview limitations recorded above remain unchanged.

- Migration 056 applied **only** to Neon UAT branch `br-young-boat-b3re832d`, SHA-256 `8cfb54c6c9dc728f2ae71975826ad8e589fabb82ee3cd634c3f6672abcd8ecc7`.
- Migration 057 applied **only** to Neon UAT branch `br-young-boat-b3re832d`, SHA-256 `806b649e49180d7f6b8e5984324d7b8981d3fd6c84ebdf4fbee6da0b27067ae9`.
- Finance, Accounting and Funder now receive `project.view` for their own Project only. Their existing Finance/Accounting capabilities were not expanded.
- Funder receives dedicated `funder.view` only. The Funder workspace reads the new Funder shared-report endpoint; generic report routes remain excluded.
- PM/Project Admin can explicitly share only completed report artifacts to an active Funder assignment. Share rows are immutable in identity, revocable once with actor/reason, and protected by forced RLS. The Funder can read only artifacts shared to their own account; revoked and unshared reports are invisible.
- UAT DML backtest verified share creation, rejection of a non-Funder recipient, visibility of only the shared artifact, revocation, and immediate loss of visibility. All temporary report/share rows were rolled back.
- UAT RLS backtest confirmed Finance/Accounting/Funder can see basic Project context but cannot see other members, role catalogue entries, project version snapshots, or operating profiles. PM/Project Admin retained intended governance visibility.
- UAT permission integrity: 36 installed Project role rows, 294 grants, 260 allowlist entries, zero grants outside allowlist. Funder has no Finance, Accounting, internal Reports, or Payment permission.
- Source CI exact head `9ec4a1ff378bedd57af5e7c22e3a76fa536dd1e9`: Unit Tests `44848751203` SUCCESS (backend/frontend typecheck and frontend build included); Dependency Audit `44848751184` SUCCESS.
- No new branch, PR merge, Vercel deployment, Production DDL/DML or Production fixture data. Production remains unchanged.


## 2026-11-21 — P1 workflow follow-up findings

### Findings and source remediation
- **RLS role-catalogue mismatch:** P1 API validation queried `project_roles` directly, while the operational roles intentionally cannot SELECT that catalogue. P1 role resolution now uses a narrow boolean SECURITY DEFINER helper in Migration 066; it checks active Project, user, member and role assignment without exposing catalogue rows.
- **Evidence usability gap:** P1 exposed evidence upload but not evidence retrieval in the workbench. A permission-gated evidence read endpoint and UI history were added. Laboratory Officer evidence attachment uses `quality.result.create`; independent QA release/review remains separate.
- **KPI correctness and disclosure:** P1 KPI template selection is now scoped by role, and loading completion is derived from verified tickets against planned loading quantity. LC discrepancy KPI metadata now identifies the LC presentation source.
- **PM task queue integration:** Migration 066 adds an idempotent source-to-task synchronization trigger with a stable per-record dedupe key and per-version task-event key. Assignment notifications are generated only for active assignees.
- **Vessel call authorization:** Migration 066 adds the canonical `shipping.create` permission through the master-of-loading role allowlist/grant path.

### Test and release evidence
- Latest source head: `2c8d6d39f1d0060f73fdb6f18b428dde148c7a68`.
- Unit Tests workflow `44857604699`: SUCCESS, including all 324 unit/contract tests, migration release-source gates, dry-run, backend/frontend typecheck and frontend production build.
- Dependency Audit workflow `44857609596`: check final status before release.
- UAT pre-change backup schema: `p1_backup_066_20261121`; table row counts at capture were zero for P1 records/events/evidence and Project task queue/events.
- UAT migration ledger remains 65. Migration 066 SHA-256: `76b19520116f26525379f694a95d2081f2d62721f7b07625d0507ac07a29bce4`; prepared only, not applied.

### Remaining acceptance gate
The code and CI are green, but this P1 slice is **not runtime-accepted** until Migration 066 is explicitly authorized and applied on UAT, then direct RLS/API/backtest proves role-safe creation, evidence access, KPI visibility, task/event synchronization, notifications and idempotency. Production remains untouched.


## 2026-11-21 — UAT ledger reconciliation and KPI formula isolation

- Fresh UAT ledger query confirms Migrations 058–069 are applied with their exact pinned checksums; latest UAT ledger is 69. Production read-only check remains at ledger 53.
- Runtime role-resolution test as `app_runtime_secure`: Procurement resolves its own active role via the SECURITY DEFINER helper, has zero visible `project_roles` rows, and fails cross-Project assignment resolution.
- Migration 066 task-sync backtest used a savepoint: P1 Purchase Requisition creation generated one PM task, one task event and one notification; status transition to completed resolved the task and emitted a second event. Rollback was verified; all test rows are absent.
- **New P1 KPI isolation finding:** Procurement can call the database aggregate function with `production_output_quantity` despite only having the Procurement KPI dashboard template. The API filter is not a sufficient database security boundary.
- Migration 070 source adds a database-enforced active-role/formula allowlist. SHA-256 `0a8d30176bde45f71cf6147a2dc9ab60d736bdc62ced53640ceec6e9080cfc6b`. It is prepared only; the direct test remains a blocker until applied to UAT and retested.
- Pre-Migration 066 backup schema `p1_backup_066_20261121` exists. No Production changes were made.
