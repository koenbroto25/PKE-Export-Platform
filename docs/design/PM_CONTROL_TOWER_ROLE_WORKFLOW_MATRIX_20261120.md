# PM Control Tower — Role, Workflow, Task & Reporting Matrix

**Date:** 2026-11-20  
**Source branch:** `f1/project-scoped-cob-20261119`  
**Source baseline:** `4d7e3811ddba54f196ad3d0190aec783c0007b41`  
**Status:** DESIGN / SOURCE-RECONCILIATION; no schema change or Production mutation.

## 1. Purpose and evidence rules

This document converts the current role catalogue, API routes, schema entities and active UI into a work-oriented design for the PM Control Tower and role workbenches. It distinguishes what exists in source from what is only a role template or proposed workflow. A permission in `src/role-catalogue.ts` is not evidence that a complete workflow, API or live Production grant exists.

Status terms:
- **Implemented surface:** source contains relevant data/API/UI capability; runtime authorization still requires UAT.
- **Partial:** a data/API foundation exists, but one or more required steps, work queues, evidence, deadlines or approvals are missing.
- **Missing:** no corresponding operational table/API/workbench was found in the inspected source.
- **Proposed:** design direction only; not implemented or granted.

Security invariants:
- Project data and task queues must be scoped by `project_id` and the server-resolved effective permissions for the selected Project.
- A user with multiple active roles receives the union of those roles only inside that Project. Do not union permissions across Projects.
- Platform Admin controls account governance, Project creation and PM appointment. PM appointment is not an automatic side effect of membership or role assignment.
- PM coordinates work and issues operational instructions; this does not grant Finance mutation/approval, Accounting posting, QA release, or vessel/loading sign-off authority.
- Project Admin's Finance access remains read-only (`finance.view` only).
- External Buyer/Supplier/Transporter access must be limited to assigned objects and approved evidence; Project membership alone is not sufficient proof of object-level isolation.

## 2. Current source capability map

| Workstream | Current source evidence | Status / material gap |
|---|---|---|
| Project governance | `projects`, `project_members`, `project_roles`, `project_role_assignments`, assignment event history; Project detail, role assignment and PM appointment routes | Implemented foundation; effective-permission navigation was connected in P0. PM appointment remains Platform Admin governance. |
| Contract & cycle | `contracts`, `contract_programs`, `cycle_policies`; contract/program CRUD and CoB cycle endpoint | Partial: no complete end-to-end contract-to-shipment task orchestration or full contract document/LC readiness model. |
| Procurement / PKS | `buyers`, `pks_sites`, `service_vendors`; supplier and buyer requirement permissions; facility/product permission templates | Partial: no purchase requisition, PO commitment, supplier delivery promise or PO-to-GRN three-way operational workflow confirmed. |
| Production / Packing / Quality | Production and quality permission templates exist | Missing: no production batch, packing record, sampling/result/review/release tables and corresponding API workbench were found in the inspected schema/routes. |
| Warehouse / Inventory | `warehouse_receipts`, `inventory_lots`, `inventory_movements`; APIs for receipts, lots, movements, reservations and holds | Partial-to-implemented: core stock operations exist; reconciliation and role-specific exception workbench need verification. |
| Transport / Logistics | `truck_trips`, `tracking_events`; trip and tracking APIs with `logistics.view`, `record_truck_trips`, `verify_checkpoints` | Implemented foundation; dispatch planning, route SLA and PM exception rollup remain incomplete. |
| Shipment / Loading / Vessel | shipment allocation APIs; `shipping.view`, `loading.ticket.create`, `vessel.view`, `voyage.view`, `port.view` templates | Partial: allocation exists; vessel call, loading plan, shift, equipment/manpower, downtime and laytime APIs/workbench were not found. |
| Export documents | country/project document requirements, document records and private storage APIs | Partial: document checklist/storage exists; LC-specific clauses, original/copy rules, discrepancy workflow and presentation countdown are not established. |
| Finance / Accounting | RAB, FX exposure, AP/AR invoices, Cash Advances, journal entries/lines and reporting APIs | Partial-to-implemented: Finance and Accounting foundations exist; bank payment execution, payment evidence/reconciliation and LC proceeds lifecycle remain incomplete. |
| Reports | Project reports, report runs/schedules, data freshness and file references | Partial: source-linked metrics and freshness exist in places; role-specific report templates and PM exception rollup need design/UAT. |
| Notifications & tasks | `user_notifications`, `notification_deliveries`, `project_work_items`, `project_work_item_events`; inbox/read, task assignment, acknowledgement, status transitions, comments/evidence, escalation and PM roll-up | Implemented source foundation: task notifications link to work items; runtime RLS/UAT and Production migration remain gated. |

### Current read endpoints relevant to a Project Control Tower

| Data domain | Current endpoint / permission | Use in PM view |
|---|---|---|
| Project detail | `GET /projects/:id` — `project.view` | Project status, target and basic identity |
| Contract programs / contracts | `GET /contract-programs`, `GET /contracts` — `contract.view` | Contract/cycle readiness, where the returned data supports it |
| Project report | `GET /reports/project/:projectId` — `reports.view` | Existing aggregate report fields; must retain source/freshness caveats |
| Workflow configuration | `GET /workflows/project/:projectId` — `workflow.view` | Workflow definition/status, not an assigned task queue |
| Document checklist / records | `GET /projects/:projectId/document-requirements`, `GET /projects/:projectId/documents` — `documents.view` | Requirement completion and missing evidence |
| Truck trips / tracking | `GET /truck-trips`, `GET /tracking-events` — `logistics.view` | Trip state, checkpoints and logistics exceptions |
| Warehouse receipts / lots | `GET /warehouse-receipts`, `GET /inventory-lots` — `warehouse.view` / `inventory.view` | Received and available stock evidence |
| Inventory movement / reservation / hold | corresponding inventory GET routes — `inventory.view` | Stock movement, reservations and holds |
| Shipment allocation | `GET /shipment-allocations` — `shipping.view` | Allocated quantity and allocation status |
| AP / AR / Cash Advance | `GET /ap-invoices`, `GET /ar-invoices`, `GET /cash-advances` — Finance view/request permission | Financial readiness and pending Finance decisions, subject to role scope |
| Journal | `GET /journal-entries` — `accounting.view` | Accounting work queue and posting status |
| Notifications | `GET /notifications` — authenticated self-inbox | Personal notifications only; not a PM-wide task queue |

Important endpoint gaps: no verified Project-scoped API was found for quality release, production/packing output, purchase orders, vessel calls, loading plans/shifts, laytime, LC-specific discrepancy/presentation, payment execution, or bank reconciliation. Project task assignment is now source-implemented through the work-item API; do not build dashboard metrics that pretend the other missing data sources exist.

## 3. Role-by-role responsibility and work contract

The permission names below are from the current TypeScript role templates. They describe intended capabilities, not proof of Production grants or completed UI. 'PM signal' means the status/report that should roll up to the PM, not an additional permission.

| Role | Responsibility and inputs | Expected output / hand-off | Authority boundary | Current capability / PM signal |
|---|---|---|---|---|
| Platform Administrator | User onboarding, platform governance, Project shell creation, PM appointment; receives access requests and governance exceptions | Activated/deactivated accounts, Project provisioning, PM appointment/replacement, privileged audit record | Platform governance; not a substitute for operational PM or Finance maker/checker | **Partial:** provisioning, Project and PM appointment APIs exist. PM signal: PM vacancy/change, blocked provisioning, unresolved admin action. |
| Project Administrator | Project configuration, membership and role governance; receives approved Project setup and membership requests | Project settings, active memberships, role assignments and change history | Finance is read-only; does not approve Finance transactions or appoint PM unless acting through explicit Platform Admin authority | **Partial:** project/member/role APIs and Finance view exist. PM signal: configuration or membership blocker. |
| Project Manager | Coordinates contracts, team assignments, logistics, warehouse, inventory, shipping, documents, Finance visibility, reports and workflow | Project plan, role assignments, operational instructions, escalations and consolidated status | No Finance create/update/delete, Accounting posting, QA release or operational sign-off outside explicit permission | **Implemented foundation / UAT pending:** PM coordination, task/instruction lifecycle, My Work and task-first PM Control Tower source surfaces exist. PM remains unable to perform protected Finance, Accounting, QA or operational sign-off actions. |
| Internal Auditor | Reviews Project operations, inventory, warehouse, logistics, shipping, Finance, Accounting, documents, workflows and reports | Evidence-backed findings, severity, owner recommendation and closure verification | Read-only; must not correct the audited transaction or approve its own remediation | **Partial:** read permissions/templates exist; dedicated finding, response and closure workbench not confirmed. |
| Procurement Officer | Manages supplier and buyer requirements; reviews contracts, product and facility/capacity data | Supplier shortlist, requirement completeness and procurement recommendation | Cannot commit stock, approve Finance, or certify QA release | **Partial:** supplier/buyer requirement permissions and master references exist; PO/commitment/three-way match workbench missing. |
| PKS Site Manager | Maintains PKS facility, capacity and product availability data | Facility/capacity/product readiness and exceptions | Cannot approve quality release or Finance payment | **Partial:** facility/product permission templates exist; site-facing workbench and capacity evidence flow require implementation. |
| Supplier | Supplies assigned product, document and shipment evidence | Supplier documents, product/lot evidence and delivery status | External object-scoped access only; no cross-Project browsing or internal approval | **Partial:** read-oriented role template exists; supplier portal upload/assignment scope not proven end-to-end. |
| Buyer | Provides buyer requirements and reviews assigned shipment/document evidence | Buyer requirement response, shipment/document acknowledgement | External object-scoped access; cannot change internal stock, Finance or shipment allocation | **Partial:** buyer requirement/shipment permission templates exist; buyer portal workflow and object-level sharing need verification. |
| Contract Manager | Maintains contracts, Contract Programs, cycle policies and buyer requirements | Contract terms, cycle schedule, change record and hand-off to PM/Finance | Cannot approve payment, alter Accounting postings or override PM appointment | **Partial-to-implemented:** contract/program/cycle APIs exist; full contract document and deadline workflow incomplete. |
| Production Manager | Coordinates production operations against facility capacity, product and inventory | Production plan/actuals, output quantity and production exception | Cannot release QA holds without QA authority | **Missing:** permissions exist, but production batch/actuals data model and workbench were not found. |
| Packing Supervisor | Records packing execution and coordinates packing crew | Packed quantity, package/lot traceability and packing exceptions | Cannot change QA release or inventory reconciliation outside assigned permissions | **Missing:** `record_packing` template exists; packing records/API/workbench not found. |
| Quality Control Officer | Creates samples and initial quality results | Sample register, test results and non-conformance evidence | Cannot perform independent QA review/release | **Missing:** `quality.sample.create` / `quality.result.create` templates exist; quality tables and API not found. |
| Quality Assurance Manager | Reviews QC/lab results and determines release/hold recommendation | QA review, release/hold decision and evidence trail | Independent from sample/result maker; cannot authorize Finance payment | **Missing:** `quality.result.review` template exists; release/hold service and audit trail not found. |
| Laboratory Officer | Performs laboratory tests and records measured results | Lab result, method/reference and supporting document | Cannot self-approve QA release | **Missing:** result-create permission exists; lab sample/result tables and APIs not found. |
| HSE Officer | Performs HSE/compliance assessment and operational inspection | Inspection evidence, risk finding and corrective action recommendation | Cannot close an issue without evidence/authorized reviewer | **Missing/Partial:** compliance permission templates exist; HSE incident/inspection workflow not found. |
| Warehouse Manager | Controls receipt, warehouse operation, stock movement, reservation, hold and reconciliation | Receipt confirmation, stock status, hold/release recommendation, reservation and variance report | Must preserve lot traceability and separation of stock custody/reconciliation | **Partial-to-implemented:** receipts, lots, movements, reservations and holds have APIs; full reconciliation workbench needs verification. |
| Warehouse Officer | Records incoming goods and views warehouse/inventory state | Goods receipt evidence, weight/quantity and exception | Cannot independently reconcile or release restricted stock unless separately assigned | **Implemented foundation:** receipt and inventory read APIs exist; receipt-to-PO matching is missing. |
| Inventory Controller | Maintains lot balances, movements, reservations, holds and reconciliation | Available/reserved/held stock, movement ledger and variance | Cannot bypass QA hold or change source receipt evidence | **Partial-to-implemented:** lot/movement/reservation/hold APIs exist; controlled reconciliation and quality linkage require completion. |
| Transport Manager | Plans transport capacity and controls trip execution and shipment hand-off | Dispatch plan, vehicle/driver allocation, trip status and delay report | Cannot alter verified checkpoint evidence without audited correction | **Partial:** trip/tracking APIs exist; dispatch planning, route SLA and capacity board incomplete. |
| Dispatcher | Assigns trip, vehicle and driver; monitors route and exceptions | Dispatch assignment, trip updates and ETA exception | Cannot self-verify an independent checkpoint if policy requires checker separation | **Partial:** truck trip API exists; dispatch board and route/ETA planning not confirmed. |
| Transporter | Executes assigned transport and submits trip/checkpoint evidence | Trip progress, GPS/checkpoint events and delivery hand-off | Only assigned trips; no cross-Project vehicle or shipment access | **Partial:** trip/checkpoint APIs exist; external assignment isolation requires runtime test. |
| Checker | Verifies departure/arrival checkpoints and trip evidence | Verified checkpoint, discrepancy and exception evidence | Must not fabricate GPS or verify outside assigned trip | **Implemented foundation:** tracking event API exists; checker assignment/identity workflow needs UAT. |
| Driver | Executes assigned trip and records permitted trip/checkpoint events | Departure/arrival and trip progress evidence | Only assigned trip; no warehouse, Finance or shipment allocation mutation | **Partial:** trip/checkpoint permission templates and APIs exist; driver-to-trip assignment needs verification. |
| Master of Loading | Coordinates cargo loading against shipment, inventory, vessel and document readiness | Loading ticket, actual quantity, hold/downtime and completion sign-off | Cannot override stock hold, QA release or vessel/terminal authority | **Missing/Partial:** shipping/vessel/voyage/port and loading-ticket permission templates exist; loading plan/ticket API and laytime workbench not found. |
| Loading Supervisor | Directs loading shifts, crew and equipment | Shift report, actual MT, downtime reason and supervisor sign-off | Cannot alter independent surveyor/ship-master evidence | **Missing:** role permissions exist; shift, equipment/manpower and downtime entities/API not found. |
| Loading Operator | Performs assigned loading tasks and records execution | Loading ticket events and actual quantity evidence | No independent loading close-out or QA/Finance authority | **Missing:** permission template exists; operator work queue/ticket API not found. |
| Terminal Representative | Coordinates berth/terminal readiness and loading hand-off | Berth/terminal status, slot and terminal event evidence | External terminal scope only; cannot change Project finance or inventory records | **Missing:** port/shipping permission template exists; vessel call/berth/terminal API not found. |
| Shipping Agent | Coordinates vessel call, voyage, shipping documents and carrier/terminal communication | Source-stamped ETA, vessel/voyage record, shipping document status and exceptions | Cannot claim bank acceptance or alter independent survey evidence | **Missing/Partial:** role permissions and shipment references exist; vessel call/voyage/ETA workbench not found. |
| Marine Surveyor | Independently verifies cargo quantity/condition and survey evidence | Survey report/certificate and discrepancy | Independent evidence producer; cannot approve its own correction or Finance payment | **Missing:** view templates exist; survey records, certificate storage and verification workflow not found. |
| Ship Master | Confirms ship/voyage and vessel-side readiness/cargo acknowledgement | Vessel readiness, ship-side confirmation and cargo/manifest acknowledgement | Vessel authority remains external; PKE records evidence, not maritime command | **Missing:** vessel/voyage read permissions exist; ship-master confirmation workflow not found. |
| Finance Officer | Owns Finance data, RAB, FX, AP/AR, Cash Advance decisions and financial reports | Finance approvals, invoice verification, RAB/FX exposure and financial exception report | Finance-only mutation/decision; independent maker-checker; no PM role appointment | **Partial-to-implemented:** Finance, AP/AR, FX, RAB and Cash Advance APIs exist; LC proceeds and payment/bank reconciliation incomplete. |
| Accountant | Maintains journal entries, lines and financial reporting | Journal draft, supporting lines, review/posting and reconciliation output | Template grants `accounting.view` and `accounting.create`, but not `accounting.update`; posting must remain unavailable until explicitly granted | **Partial:** journal read/create/line APIs exist; posting permission and reconciliation workbench remain gated. |
| Cashier / Treasury | Executes authorized payment/receipt custody and captures bank evidence | Payment execution record, bank proof, receipt and reconciliation | Only after authorized Finance instruction; cannot approve own funding/advance or alter accounting close | **Partial/Missing:** `payment.view` and Finance view exist; payment-instruction API, bank evidence and reconciliation workbench not found. |
| Project Funder | Reviews assigned Project funding, exposure and reports | Read-only funding position, utilization and reporting acknowledgement | Read-only, assigned Project only; no Finance mutation or payment approval | **Partial:** Finance/report view templates exist; no distinct `funder.view` permission or funder-specific API/workbench confirmed. |

## 4. End-to-end Project workflow and PM roll-up

| Sequence | Responsible roles | Required hand-off / evidence | Existing source support | PM Control Tower signal |
|---|---|---|---|---|
| 1. Contract & buyer demand | Buyer, Contract Manager, PM, Platform Admin (governance) | Approved contract, buyer requirement, program/cycle dates and quantity | Contracts, contract programs, cycle policies, CoB cycle API | Contract validity, uncovered quantity, next cycle/deadline; LC terms still missing |
| 2. Procurement & PKS readiness | Procurement, PKS Site Manager, Supplier | Supplier commitment, facility/product/capacity confirmation, expected delivery | Buyer/supplier/facility/product permission foundations | Unconfirmed supply, capacity gap, supplier evidence overdue; PO/commitment workflow missing |
| 3. Production & quality | Production Manager, Packing Supervisor, QC, Lab, QA, HSE | Production/packing actuals, sample results, QA release/hold, HSE clearance | Role templates only in inspected source | Must remain 'not available' until source entities and QA release APIs exist; never infer product release from inventory receipt |
| 4. Warehouse & stock | Warehouse Manager/Officer, Inventory Controller, QA | Receipt, lot, movement, reservation, hold/release and reconciliation | Warehouse/inventory APIs | Available vs reserved vs held stock, receipt variance, stock coverage; quality linkage needs completion |
| 5. Inland logistics | Transport Manager, Dispatcher, Transporter, Driver, Checker | Dispatch, trip, checkpoint, arrival and discrepancy evidence | Truck trips and tracking events | Trips scheduled/in transit/late, missing checkpoint and arrival variance |
| 6. Shipment & loading | Master of Loading, Loading Supervisor/Operator, Terminal Rep, Shipping Agent, Surveyor, Ship Master | Vessel call, berth readiness, loading plan, shift actuals, survey and ship-side sign-off | Shipment allocation foundation; role templates | Allocation gap can be shown; vessel/berth/loading/laytime must remain unavailable until APIs exist |
| 7. Export documents & LC | Export Documentation/Shipping roles, Buyer, PM, Finance | LC clauses, required issuer/original/copy, cross-document checks, discrepancy resolution, presentation deadline | Project/country document requirements and document storage | Checklist completeness can be shown; LC-specific checks and bank presentation deadline are missing |
| 8. Finance, Accounting & Treasury | Finance, Accounting, Cashier, Funder | AP/AR, CoB obligation, Cash Advance, journal, payment instruction, bank proof and reconciliation | AP/AR, FX, RAB, Cash Advance, journal and report APIs | Invoice/advance/journal status can be shown; payment execution, LC proceeds and bank reconciliation are missing |
| 9. PM close-out | PM, role owners, Internal Auditor | All blockers closed, documents complete, loading/shipment evidence reconciled, report cut-off and audit trail | Reports, notifications, audit views | Close-out gate with source links, unresolved exceptions and freshness; task engine missing |

## 5. PM Control Tower information architecture

Recommended layout is task-first, not a wall of generic KPI cards:

1. **Project header:** Project, buyer, contract/program, target quantity, selected cycle, operational timezone and last refresh.
2. **Critical exceptions strip:** overdue work items, shipment/stock shortfall, trip delay, document discrepancy, Finance decision pending and unresolved audit finding. Every item must link to its source record.
3. **Readiness gates:** Contract & demand; supply/PKS; production & QA; warehouse stock; inland logistics; vessel/loading; export documents/LC; Finance & close-out. Each gate has `ready / at_risk / blocked / unavailable`, a reason and evidence coverage.
4. **Role work queues:** grouped by assigned role and assignee, with pending, acknowledged, in-progress, overdue and blocked counts. Users see only tasks assigned to them or to their active Project role(s).
5. **Decision queue:** decisions explicitly assigned to PM (operational coordination only). Finance approval, Accounting posting, QA release, surveyor sign-off and ship-master confirmation remain in their own authorized workspaces.
6. **Shipment timeline:** contract cycle → stock readiness → transport → warehouse → vessel readiness → loading → documents → Finance close-out. Use actual timestamps; do not infer ETA/laytime where no source exists.
7. **Report drill-through:** every KPI exposes formula, unit, source entities, cutoff, freshness timestamp, missing-data count and actual/estimated/manual status.
8. **Instruction & acknowledgement:** PM instruction, assigned role/user, due time, acknowledgement, evidence, status, escalation and immutable event history.

Do not display zero for missing data. Distinguish `0`, `not reported`, `not integrated`, `stale`, and `not applicable`.

## 6. Task and notification engine — implemented source contract (Migration 049 prepared, not Production-applied)

### Current implementation status

- `project_work_items` is the operational source of truth for manual instructions and follow-up tasks; `project_work_item_events` stores append-only lifecycle events.
- `user_notifications` remains the recipient inbox/delivery projection and links back to the work item. Reading a notification does not acknowledge or complete the task.
- `project_workflows` remains workflow configuration/status, not a task queue. `approval_events` remains a generic approval/audit record; `admin_action_queue` remains platform-admin-only.
- The source implementation is present in Migration 049, `src/index.ts`, `src/schema.ts`, `src/role-catalogue.ts` and `frontend/src/App.tsx`. Migration 049 is prepared only; task runtime must not be represented as active on Neon Production before approved sequential application and RLS UAT.

### Implemented model in source (prepared schema; Production activation gated)

**`project_work_items`** is the operational source of truth for tasks/instructions. Current fields include `id`, `project_id`, optional source entity pair, `work_item_type`, `title`, `description`, `priority`, `status`, `owner_role_code`, optional `assignee_user_id`, `created_by`, `due_at`, acknowledgement/start/submission/resolution/closure timestamps and actors, `escalation_level`, `dedupe_key`, and timestamps.

**`project_work_item_events`** is append-only and records `work_item_id`, `project_id`, `event_type`, `actor_user_id`, `reason`, `payload` and `occurred_at`. Database grants revoke UPDATE and DELETE for `app_runtime_secure`.

Use `user_notifications` as the recipient inbox/delivery projection, not the task record. Notifications carry `work_item_id`; read status is distinct from task acknowledgement or completion.

### Implemented/prepared permission boundaries (Migration 049; Production activation gated)

| Permission / capability | PM | Assigned operational role/user | Project Admin | Internal Auditor |
|---|---|---|---|---|
| Project-wide task visibility (project.tasks.view) | Yes, within the selected Project | No project-wide list; row visibility is limited by active owner role and assignee | No implicit grant | No implicit grant; audit access requires a separately approved policy |
| Create (project.tasks.create) | Yes | No | No | No |
| Assign/reassign (project.tasks.assign) | Yes, only to active Project role assignments | No | No | No |
| Acknowledge/start/block/submit/comment (project.tasks.update plus active owner-role/assignee check) | Coordination/comment where API allows | Yes, only for own active assigned-role task; explicit assignee narrows to that user | No | No |
| Resolve/close/reopen/cancel (project.tasks.resolve) | Yes; resolve only after submission, close only after resolution | No | No | No |
| Escalate (project.tasks.escalate) | Yes | Assigned owner may escalate own task; PM may escalate Project tasks | No | No |

There is no separate project.tasks.acknowledge or project.tasks.audit.view permission in the current implementation. Acknowledgement is an action under project.tasks.update; Project Admin and Internal Auditor receive no implicit task permissions.

Role-specific task permissions must not be confused with source-record permissions. For example, acknowledging a QA task does not grant `quality.result.review`; completing a Finance task does not grant `finance.update`.

### Event and recipient rules

- Recipient set is the responsible assignee plus users holding the assigned active Project role, and the active PM for PM-visible exceptions. Do not broadcast every event to all Project members.
- A PM instruction must have a reason, priority, due time, target role/user and source context. Assignment changes require an event record.
- Escalation should be based on configured SLA thresholds and work-item priority; dedupe by Project + source entity + event type + active state to avoid notification storms.
- Due times are stored as `timestamptz` in UTC; UI renders in an explicitly configured Project timezone. Do not assume the browser timezone is the Project SLA timezone.
- System-generated exceptions must be idempotent and link to source records. They must not fabricate source data or close themselves merely because a notification was read.
- External users receive only object-scoped tasks and evidence links they are authorized to access.

## 7. Open design decisions and implementation order

1. Confirm the source-of-truth for Project timezone and business-day/SLA calendars.
2. Confirm which role assignments PM may create/revoke, and which assignments remain Platform Admin-only. Preserve the existing PM appointment governance flow.
3. Approve the task permission codes and whether Project Admin has read-only task visibility.
4. The source decision is `project_work_items` plus append-only `project_work_item_events`; keep `project_workflows` as workflow configuration/status, not as a task queue.
5. Define source adapters and event triggers for current entities: contract/cycle, CoB, inventory/holds/reservations, truck trip/checkpoints, shipment allocations, documents, AP/AR, Cash Advance and journals.
6. Keep quality/production, vessel/loading/laytime, LC discrepancy/presentation, payment execution and bank reconciliation as `unavailable` until their source workflows exist.
7. Complete the release gate for the implemented task engine: review/approve exact Migration 048 and 049 SQL hashes, verify backup, apply sequentially, then run authenticated RLS and workflow UAT before enabling Production use.
8. Verify that My Work and PM queues consume the same task engine and preserve active-role, explicit-assignee and Project isolation; do not create separate task silos per dashboard.
9. Add isolated synthetic backtests for multi-role, multi-Project, expired/revoked assignment, PM reassignment, role queue isolation, due-date escalation, duplicate events, Finance maker-checker, QA independence and external object scope.
10. Only after native workflows are complete, re-evaluate optional chart/table/map libraries. No ERP/PM platform replacement is recommended at this stage.

## 8. Acceptance criteria

- One user with multiple active roles in one Project sees the union of allowed navigation and assigned work queues for that Project.
- The same user does not carry role permissions, task visibility or notifications into another Project without an active assignment there.
- Platform Admin alone appoints/replaces PM; PM can assign only approved operational roles.
- Project Admin can view Finance data but cannot create/update/delete/approve Finance transactions.
- Finance approval, Accounting posting, QA release, loading sign-off, survey evidence and ship-master confirmation remain separate authorized actions.
- PM sees all Project blockers and their owners/deadlines but cannot perform protected source actions outside PM permissions.
- Every PM metric has source links, cutoff/freshness, completeness and a clear unavailable/stale state.
- Every task has an owner, role, status, due time, source link, acknowledgement and append-only event history.
- Notifications are recipient-specific, deduplicated and auditable; read status is not acknowledgement or task completion.
- External counterparties can access only explicitly assigned objects and evidence.
- All tests use isolated fixtures; no synthetic business records are written to Neon Production.

## 9. Verification boundary

This is a source-based design specification using the role catalogue, `src/schema.ts`, API route declarations in `src/index.ts`, and the active frontend. It is not runtime HTTP UAT, browser acceptance, a live permission-grant inventory, or proof that every source endpoint passes RLS. No database migration, Production data mutation, dependency installation or Vercel deployment is included in this document.

## 10. Additional verified permission and UI mismatches

These findings are material blockers for the next role-workbench pass. They are not permission changes approved by this document.

| Finding | Source evidence | Impact / required decision |
|---|---|---|
| CoB cycle creation is Finance-gated | `POST /projects/:projectId/shipments/:shipmentId/cob-cycle` requires `finance.create`; PM and Contract Manager templates do not grant it, while PM has `finance.view` and `manage_contract_programs` | PM can coordinate and view the cycle but cannot create the payment obligation. Keep Finance maker authority; decide whether PM should submit a non-financial cycle request or Finance remains the creator. Do not grant PM `finance.create` as a workaround. |
| Shipment allocation read/write is `shipping.view` / `shipping.update` | `GET /shipment-allocations` requires `shipping.view`; POST/PATCH requires `shipping.update`. Buyer/Supplier templates have `shipment.view`, not `shipping.view`. PM has `shipping.view`, not `shipping.update`. | Internal allocation page must not be shown from `shipment.view` alone. Current branch aligns its route guard to `shipping.view`; create/reverse controls must be hidden without `shipping.update`. |
| Checker checkpoint permission mismatch (historical finding; corrected in P0) | Original handler used `record_truck_trips` for checkpoint events, but current source and prepared Migration 049 use `verify_checkpoints` for `event_type='checkpoint'`; other trip lifecycle events retain `record_truck_trips`. | Source correction is present and covered by the task-engine contract test. Production RLS remains pending Migration 049 approval/application and runtime test. |
| Procurement read endpoints require Finance view | Project-scoped `GET /buyers` and `GET /vendors` require `finance.view`; Procurement template grants supplier/buyer requirement and contract permissions, but not `finance.view`. | Procurement cannot use these master-data endpoints under its intended template. Re-map to domain permissions (e.g. supplier/buyer requirement view) only after confirming data scope and owner approval. |
| Operations workbench is a composite page (historical finding; P0 action gates added) | Operations data panels and mutation actions now use independent permission checks; each panel loads only when its read permission exists. The transport-leg dependency is Project-scoped and requires `logistics.view`. | P0 source correction is covered by CI; authenticated multi-role/multi-Project browser UAT remains required. |
| Transport leg source (historical finding; corrected in P0) | A Project-scoped transport-leg read route now requires `projectId` and `logistics.view`; Operations uses real records for the selected Project. | Trip creation remains withheld when no real transport leg exists; no sample IDs or mock rows are used. |
| Payment Instructions are deliberately out of scope | `GET/POST/PATCH /payment-instructions` route to `paymentExecutionOutOfScope`; the UI explicitly states no payment instruction/payment execution schema is approved. | Current page is a status placeholder, not a payment workbench. It is now visible only with explicit `payment.view`; `finance.view` alone does not expose it. |
| Buyer/Supplier/Transporter/Funder/Warehouse portals are static | The current portal components render empty states and explicitly state no dummy data; no full data workflow is wired. | Treat these as placeholders, not completed dashboards. Implement after object-scoped external grants and role workbench APIs are specified. |
| Funder has no distinct capability | Funder template currently uses `finance.view`, `reports.view`, `report.view` and `view_financial`; no `funder.view` code or funding-specific API/workbench was found. | Do not expose the Funder portal to every Finance reader. Current branch requires a future explicit `funder.view` capability; no grant is created here. |
| Compliance page mixes Project and Admin surfaces (P0 gates applied) | Project document requirements/documents use `documents.view`; regulatory knowledge and country-pack master data remain Admin-only. | Project document panels and Admin regulatory catalogues are separated by permission. This does not imply that LC discrepancy/presentation workflows exist. |
| Accounting posting is not granted by Accountant template | Journal GET requires `accounting.view`; create/line routes require `accounting.create`; posting requires `accounting.update`. The Accountant template does not include `accounting.update`. | Accountant can prepare drafts but cannot post under the current template. Preserve this separation until a maker-checker/posting policy is explicitly approved. |

### Frontend permission alignment applied in this branch

- Sidebar/route access for Journal Entries now uses the dedicated `journal-entries` permission key (`accounting.view`) instead of the generic Finance key.
- Payment Instructions route now uses the explicit `payment-instructions` permission key (`payment.view`), not `finance.view`.
- Shipment Allocations route now uses the explicit `shipment-allocations` key (`shipping.view`), not the broad Operations key.
- Buyer portal visibility requires `buyer.shipment.view`; Supplier portal visibility requires both `supplier.view` and `shipment.view`; external Buyer/Supplier-only grants do not expose internal Operations, Compliance or Shipment Allocation pages. Transporter/Driver portal visibility requires both `record_truck_trips` and `verify_checkpoints`; PM `logistics.view` alone does not expose that portal. Checker remains eligible for the internal Operations page through `operations.view`, but its checkpoint-create API mismatch remains unresolved.
- The PM/Finance boundary is unchanged; these are UI visibility corrections, not new backend grants.

## 11. P0 implementation update (2026-11-20)

The following are now source-implemented on the branch, subject to CI and runtime acceptance:
- Action-level permission gates for Operations, Compliance, Finance, Accounting, Project creation, Contract Program management, Shipment Allocation, Project role/membership administration and platform identity governance.
- Operations forms are scoped to the selected Project; transport-leg-dependent trip creation is withheld until a real transport-leg API exists.
- Checker checkpoint API and prepared RLS policy use `verify_checkpoints`; trip lifecycle events still require `record_truck_trips`.
- Project task/instruction tables, RLS, APIs, My Work workspace and PM Control Tower roll-up/readiness view are prepared. Assignment, blocked/submitted and PM resolution/closure produce recipient-specific in-app task notifications.
- Explicitly assigned tasks are visible only to that user while their role assignment is active; role-wide tasks are visible only to active members of the owning Project role.
- Production/QA, vessel/loading/laytime and LC presentation remain unavailable. The PM dashboard reports those gaps rather than implying readiness.

Prepared Migration 049 SHA-256: `f61edb6ee54d7294a13cfd0a7319c4dee03299f718a3efdb6805081a50df2780`. It depends on sequential Migration 048 SHA-256 `48eea58270848cc90945cf42972f1a01216e66bb1f6b90c56204b47e877bcdc3`. Neither migration is approved/applied; Production remains at Migration 047.

Current source CI is pending. This design document is not evidence of runtime UAT or Production authorization.
### CI confirmation — source commit `fc25624ec288189bc1f33ece374422667c28d982`

- Unit Tests: **213/213 PASS** across 18 test files.
- Backend API TypeScript: PASS.
- Frontend TypeScript: PASS.
- Frontend production build: PASS.
- Production migration ledger/release verifier: PASS; baseline 001–028 and verified Production history 001–047 are contiguous. The verifier retains the notice that authentic SQL for historical migrations 029–035 remains unrecovered.
- Migration runner dry-run: PASS; no database connection attempted and no database changes made. Migrations 048 and 049 are reported `manifest=absent` and remain unapproved for apply.
- Dependency Audit Evidence: PASS (root and frontend production dependency audits).
- PR #2 remains OPEN / DRAFT. CI validates source/static/build gates, not authenticated browser UAT or runtime RLS integration.
### 11.1 P0 audit corrections (2026-11-20)
- Migration 049 notification RLS now explicitly authorizes `project.tasks.resolve` for PM-to-owner resolution/closure notifications.
- Transport-leg reads are now mandatory Project-scoped and require `logistics.view`; operational UI uses real transport legs from the selected Project and does not synthesize them.
- Latest CI: 214/214 tests, both TypeScript checks, production frontend build, migration ledger verifier, dry-run and dependency audit PASS on PR #2 head `b5a890f5cc31ff7c2ce8c18080ad1df242da1a4f`.
- Current prepared hashes: 048 `48eea58270848cc90945cf42972f1a01216e66bb1f6b90c56204b47e877bcdc3`; 049 `f61edb6ee54d7294a13cfd0a7319c4dee03299f718a3efdb6805081a50df2780`. Not approved/applied; Production remains 047.
- Still required: approved 048/049, verified backup, sequential application, and runtime multi-role/multi-Project UAT. No Production or Vercel mutation was performed.

## 12. Source/Production status reconciliation — 2026-11-20

- The role and workflow analysis in Sections 1–5 remains the business design baseline. Sections 6, 7 and the historical mismatch rows in Section 10 are reconciled above with the P0 source implementation and its audit corrections.
- Last validated application-source commit `b5a890f5cc31ff7c2ce8c18080ad1df242da1a4f` has 214/214 unit tests passing across 18 files; backend/frontend TypeScript, frontend production build, migration release verifier, migration dry-run and dependency audit all pass. Subsequent commits `5f258b110f29f03b4c230617a858303faf474411` and `116aff13697da0486410f708528fbb9ec3cba45f` update this design document only; they do not change application source.
- Migration 048 SHA-256: `48eea58270848cc90945cf42972f1a01216e66bb1f6b90c56204b47e877bcdc3`. Migration 049 SHA-256: `f61edb6ee54d7294a13cfd0a7319c4dee03299f718a3efdb6805081a50df2780`. Both are prepared and unapproved; Production remains at Migration 047.
- P0 source completion is not Production activation. Required release gates remain exact owner approval, verified backup, sequential 048/049 application, and authenticated multi-role/multi-Project RLS and workflow UAT. No Production write or Vercel deployment is implied.


## 13. P0 SQL/release-runner correction — 2026-11-20

- Re-opened the final Migration 049 SQL after identifying that its anonymous DO block used an invalid single-dollar delimiter. Corrected the block to PostgreSQL's valid DO $$ ... END $$; quoting.
- Final corrected Migration 049 SHA-256: f61edb6ee54d7294a13cfd0a7319c4dee03299f718a3efdb6805081a50df2780. This supersedes the earlier 4d4... and c2e5... hashes recorded in historical checkpoints above.
- Updated scripts/migrate.mjs to pin the corrected exact Migration 049 hash. The 048/049 apply gate continues to require both explicit per-migration approvals, exact approved hashes, the verified 001–047 Production ledger, and a recorded backup reference plus SHA-256; the migrations execute in order inside one transaction.
- Extended src/project-work-items.contract.test.ts to assert valid DO quoting, reject the malformed delimiter, and ensure the runner's 048/049 pins and approval/backup gates remain aligned.
- Source-level corrections are committed; current-head CI must complete before this checkpoint is considered green. No Neon Production DDL/DML or Vercel deployment was performed.
- Production ledger independently re-read on 2026-11-20: 47/47, exact Migration 047 hash. The existing pre-F1 backup branch predates migrations 042–047 and is not a valid pre-048/049 backup. Snapshot creation did not produce a new snapshot; a current backup is still required before migration apply.


### P0 release-runner hardening follow-up

- The no-connection dry-run now fails closed if either prepared SQL file is missing or its actual SHA-256 differs from the pinned Migration 048/049 release hashes. This closes the prior gap where dry-run only printed hashes without enforcing the approved values.
- Migration 049's regression test now computes SHA-256 from the actual SQL bytes with Node crypto and compares it to the runner pin, in addition to checking PostgreSQL DO-block quoting.
- The current CI run is required to validate these changes; previous green CI runs are historical evidence only.
