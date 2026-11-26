# UX-05 Route & Page Inventory — Source Verified

Date: 2026-11-26
Branch: `p20/platform-continuation-20261123`
Source: `frontend/src/App.tsx`, blob `30f9398687033242778adaf50236dc8e3a380048`.

## Scope and caveat
This inventory was extracted from route declarations in the current source. It is a route/component inventory, **not** a runtime authorization test, API/RLS audit, or evidence that every route works. Each route uses a `RoleGuard` with a page key. Authorization remains server/database-authoritative.

## Routes and keys
| Route | Guard key |
|---|---|
| `/` | dashboard |
| `/projects` | projects |
| `/pks-sites` | pks-sites |
| `/port-network` | port-network |
| `/maritime-operations` | maritime-operations |
| `/projects/create` | projects |
| `/projects/:id` | project-detail |
| `/projects/:id/edit` | project-edit |
| `/projects/:id/configuration` | project-configuration |
| `/projects/:id/roles` | project-roles |
| `/projects/:id/members` | project-members |
| `/contracts` | contracts |
| `/operations` | operations |
| `/p1-workflows` | p1-workflows |
| `/my-work` | my-work |
| `/field` | field |
| `/finance` | finance |
| `/compliance` | compliance |
| `/journal-entries` | journal-entries |
| `/reports` | reports |
| `/notifications` | notifications |
| `/access` | access |
| `/shipment-allocations` | shipment-allocations |
| `/cash-advances` | cash-advances |
| `/payment-instructions` | payment-instructions |
| `/buyer` | buyer |
| `/supplier` | supplier |
| `/transporter` | transporter |
| `/warehouse` | warehouse_manager |
| `/funder` | funder |

## UX review priorities derived from this route map

### P0: Security/scope regression tests
- Every route direct URL: allowed role, denied role, role expired/revoked, permission-loading, permission-error.
- Project-scoped routes: no Project, Project switching, stale data from prior Project, URL tampering.
- Partner portals: buyer/supplier/transporter/warehouse/funder object-scope negative tests (IDOR).
- Multi-role assignment and OR-gated pages; ensure rendered controls do not exceed API authority.
- Notifications route and task deep-links: ensure user/project scope is enforced server-side.

### P1: Navigation clarity and lifecycle UX
- Project lifecycle routes (detail/edit/configuration/roles/members) need consistent breadcrumbs and Project context.
- Admin paths `/projects`, `/access`, `/reports` should expose actionable governance/exception work, not just shortcut navigation.
- PM paths should be connected into Project 360 and ordered by dependencies/next actions.
- Port and maritime workspace should show data source freshness/rights, unavailability and stale states.
- Field and partner workflows should explicitly communicate online/offline status, evidence state, sync receipt and authorization boundary.

### P1: Component architecture
The route/page implementation is heavily concentrated in `App.tsx` (source size ~278 KB; 48 function declarations detected). Extraction should be staged only after dependencies and shared state/API helpers are mapped. Initial safe seams: existing standalone page modules, then Project governance pages, then My Work/Access pages. Do not move page code wholesale without regression coverage.

## Source function inventory (48 declarations)
`App`, `ProjectPicker`, `IdentityLinkRequired`, `LoginPage`, `RoleGuard`, `PageTitle`, `Card`, `PanelHeading`, `Loading`, `ErrorState`, `EmptyState`, `Metric`, `DataTable`, `StatusPill`, `FormField`, `ActionButton`, `DashboardPage`, `ProjectsPage`, `PksSitesPage`, `ContractsPage`, `OperationsPage`, `FinancePage`, `FinanceSubledgerPanel`, `JournalEntriesPage`, `ShipmentAllocationPage`, `CashAdvancesPage`, `PaymentInstructionsPage`, `BuyerWorkspacePage`, `viewMilestones`, `SupplierWorkspacePage`, `TransporterWorkspacePage`, `WarehouseWorkspacePage`, `FunderWorkspacePage`, `ProjectOptions`, `CompliancePage`, `ReportsPage`, `JsonSummary`, `MyWorkPage`, `NotificationsPage`, `AccessPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `ProjectDetailPage`, `ProjectRolesPage`, `ProjectMembersPage`, `ProjectEditPage`, `ProjectConfigurationPage`, `ProjectWizardPage`.

## Acceptance evidence still required
- Build/typecheck and test execution on exact branch head.
- Role × route × action matrix with API/RLS negative tests.
- Responsive viewport test (320, 375, 414, 768, 1024, 1440 px), keyboard/focus/contrast/zoom.
- API/source freshness and partial-failure UI test per dashboard.
- 100+ realistic synthetic scenarios including concurrent updates, role revocation, stale/offline evidence, duplicate sync, quantity variance, incomplete docs, transport/port delays, approval separation.

No code changes or database/deployment/merge operations are included in this inventory.
