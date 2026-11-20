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
