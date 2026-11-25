# PKE UX-00 to UX-03 — Audit & Implementation Record
**Branch:** `p20/platform-continuation-20261123`  
**Date:** 25 November 2026  
**Status:** Source audit complete; first implementation slice committed; runtime/browser validation blocked by the explicit Vercel skip.

## Executive summary
UX-00 audited the current frontend shell, route map, role permission model, role dashboard, and existing domain workspaces from repository source. UX-01 through UX-03 are being executed against the existing capabilities, without changing API authorization or Finance P07 semantics.

## UX-00 — Source audit

### Inspected
- `frontend/src/App.tsx`: authenticated shell, project picker, route composition, grouped sidebar, role context, toast handling.
- `frontend/src/role-permissions.ts`: page visibility and permission requirements.
- `frontend/src/RoleDashboardPage.tsx`: role metadata, API-backed dashboard loading, project task queue, readiness indicators, Admin P17 Control Tower, Buyer Access governance panel.
- `frontend/src/RoleDashboardPage.css`: dashboard layout and component styles.
- `frontend/src/PortNetworkPage.tsx`, `frontend/src/MaritimeOperationsWorkspace.tsx`, `frontend/src/P1WorkflowWorkbench.tsx` are referenced as separate domain workspaces in App; their existence and route integration are verified, but not a full component-level visual audit here.

### Current route inventory (App shell)
| Route | Current component | Target workspace | UX disposition |
|---|---|---|---|
| `/` | RoleDashboardPage | Role cockpit | Redesign role-first and task-first |
| `/projects` | ProjectsPage | Portfolio / My Projects | Separate platform portfolio vs assigned Projects |
| `/projects/create` | ProjectWizardPage | Provisioning | Guided, state-aware provisioning |
| `/projects/:id` | ProjectDetailPage | Project 360 | PM anchor; enrich cross-workstream readiness |
| `/projects/:id/edit` | ProjectEditPage | Project governance | Contextual and permission-safe |
| `/projects/:id/configuration` | ProjectConfigurationPage | Project governance | Consolidate configuration |
| `/projects/:id/roles` | ProjectRolesPage | Membership & roles | Separate role assignment from platform role catalog |
| `/projects/:id/members` | ProjectMembersPage | Project team | Membership lifecycle |
| `/pks-sites` | PksSitesPage | Supply/facility network | Integrate into Project journey; avoid master-only silo |
| `/port-network` | PortNetworkPage | Port & terminal | Preserve domain capability; improve journey entry |
| `/maritime-operations` | MaritimeOperationsWorkspace | Shipping / vessel control | Promote Shipment/Voyage 360 |
| `/contracts` | ContractsPage | Contract & buyer requirements | Connect delivery requirements and Project activation |
| `/operations` | OperationsPage | Operational control | Workstream-first; avoid generic endpoint-shaped page |
| `/p1-workflows` | P1WorkflowWorkbench | Workflow center | Keep technical phase labels out of user navigation |
| `/my-work` | MyWorkPage | Unified task inbox | Make cross-role task home |
| `/finance` | FinancePage | Finance & settlement | Unified navigation; preserve P07 baseline |
| `/compliance` | CompliancePage + RegulatoryCoreWorkspace | Compliance/document center | Checklist, expiry, review, readiness |
| `/journal-entries` | JournalEntriesPage | Accounting | Contextual finance workspace |
| `/shipment-allocations` | ShipmentAllocationPage | Procurement/shipment execution | Embed in Project 360 journey |
| `/cash-advances` | CashAdvancesPage | Finance | Contextual navigation |
| `/payment-instructions` | PaymentInstructionsPage | Finance | Status language must not imply payment |
| `/reports` | ReportsPage | Intelligence | Executive, operational, detailed layers |
| `/notifications` | NotificationsPage | Notification center | Direct deep links to objects and actions |
| `/access` | AccessPage | Role/permission governance | Effective-access explanation and scoped controls |
| `/buyer` | BuyerWorkspacePage | Buyer portal | Separate partner shell; explicit grants |
| `/supplier` | SupplierWorkspacePage | Supplier/PKS portal | Assigned scope only |
| `/transporter` | TransporterWorkspacePage | Field PWA | Mobile task-first |
| `/warehouse` | WarehouseWorkspacePage | Warehouse | Mobile/desktop responsive operations |
| `/funder` | FunderWorkspacePage | External reporting | Keep restricted until dedicated sharing grant/API/RLS |

### Cross-cutting findings
1. Sidebar is a fixed five-group navigation and uses visible page keys; role permissions are the filter. It does not yet express separate Platform and Project context modes.
2. Project selection is persisted in session storage and is displayed in the header, but it is a generic picker and context-switch safety/confirmation is not evident from inspected source.
3. RoleDashboard already provides permission-derived metrics, task queue status, workstream readiness, explicit unavailable/partial capabilities, and Admin control-tower data. This should be evolved, not discarded.
4. Admin and PM are represented as role metadata and links, but the same dashboard structure is used. This creates opportunity for stronger persona-specific priority panels.
5. Dashboard data loading uses multiple API calls and displays source errors; the UX should continue distinguishing unavailable/error from zero.
6. The project-level permission data is loaded separately from identity and role membership. Route visibility is UX filtering only; backend/RLS must remain enforcement.
7. Navigation labels include implementation/phase terminology (e.g. “Workflow P1”) and broad groups that do not match end-user journeys.
8. Admin governance capabilities are split among Projects, Access, project roles/members, and Control Tower. PM operational coordination is split among My Work, Operations, Contracts, Port, Maritime, Reports, and Finance.
9. Existing UI describes several capability gaps honestly. Keep those states; do not create false transaction controls.
10. A complete visual audit, direct API permission matrix, browser/mobile inspection, and role-based usability evidence require runtime validation. This cannot be certified while Vercel deploy/preview is explicitly skipped.

## UX-01 — UX Foundation requirements and implemented slice
### Required foundation
- Clear active context (Platform-wide vs Project-scoped).
- Role-first navigation and discoverability.
- Task/approval inbox entry.
- Consistent status, empty, error, stale, and unavailable states.
- Search that returns only server-authorized objects.
- Responsive shell; mobile navigation distinct from desktop.
- Shared object detail, timeline, table, form and evidence patterns.

### Implementation slice
- Existing project picker, dashboard task queue, route guards and permission filtering retained.
- Role-specific Admin and PM quick-workspace panels are added to the dashboard, using existing routes only. These panels are navigation aids, not new authorization or transactional capabilities.
- Context requirements are shown for platform Admin and PM; users are warned that Project-scoped work requires an active Project selection.

## UX-02 — Admin Control Center specification
**Platform Admin priority landing:**
1. Portfolio / project governance
2. User identity & account lifecycle
3. Project without appointed PM
4. PM appointment and replacement history
5. Effective permission / membership review
6. Master data governance
7. Integration health and audit
8. Direct links to Projects, Access, Project membership and Control Tower

**Current backend mapping:** Existing route evidence supports Projects, Access, Project roles/members, and the P17 Admin Control Tower. Dedicated PM appointment workflow and unified identity lifecycle dashboard are not verified in the inspected frontend/API contracts. They must be recorded as backend dependencies, not simulated.

**Acceptance:** Admin can navigate to each verified area from one landing; platform scope is explicit; unsupported governance workflow is labeled as dependency; no cross-Project business-data access is implied.

## UX-03 — PM Project 360 specification
**PM priority landing:**
1. Active Project identity and lifecycle
2. My attention: approvals, overdue, blocked, unassigned
3. Milestone / workstream readiness
4. Supply, quantity, stock, logistics and shipment snapshot
5. Team ownership and hand-offs
6. Project activity/audit
7. Quick links to My Work, Contract, Operations, Port, Maritime, Shipment Allocation, Compliance, Finance and Reports

**Current backend mapping:** Existing dashboard endpoints include project work items, contracts/programs, warehouse receipts, inventory lots, truck trips, shipment allocations, documents/requirements, AP/AR, cash advances, journal entries and project report. Existing data indicators are permission-gated and should be reused. Project-wide readiness synthesis and unified milestone timeline are not verified as complete.

**Acceptance:** PM has a single discoverable entry point, sees tasks/blockers and direct links, can tell unavailable from zero, and never sees data outside the active Project/permissions.

## UX-00 to UX-03 dependency register
| ID | Dependency / blocker | Class | Required next action |
|---|---|---|---|
| UXB-01 | Dedicated PM appointment lifecycle API/UI not verified | B/C | Audit backend endpoints and schema; implement only if contract exists |
| UXB-02 | Unified Admin identity lifecycle view not verified | B | Map existing identity/admin endpoints; compose UI or request API |
| UXB-03 | Cross-workstream Project milestone aggregation not verified | B/C | Trace project report/workflow APIs; define source-backed milestone rules |
| UXB-04 | Global authorized search not verified | B | Identify search API; otherwise backend dependency, no client-side cross-scope search |
| UXB-05 | Platform-vs-Project context switch confirmation and permission reset require testing | A/B | Add UX safeguards and test direct links/context changes |
| UXB-06 | Browser/mobile usability evidence unavailable while deploy preview skipped | D | Local/build checks and automated tests; defer browser evidence until approved |
| UXB-07 | Current Master Implementation Plan path not found from inspected branch paths | D | Locate authoritative plan file before updating its execution ledger; do not create a competing ledger |

## Next-stage blockers and P20
The UX work must not become a P20 blocker unless P20's acceptance explicitly requires these UX packages. P20 must be separately re-audited against its authoritative plan and evidence. Vercel deploy/browser UAT remains skipped per user direction.

## Validation record
- Source inspection: App shell, routes, role permissions, role dashboard and CSS.
- Route/component mapping: completed for routes composed in App.tsx.
- Code changes in this pass: navigation-oriented Admin/PM dashboard slice (recorded in commit when applied).
- Build/typecheck: not run in a repository runtime.
- Browser/UAT: not run; Vercel deployment intentionally skipped.
- Production DB/migrations: not touched.
