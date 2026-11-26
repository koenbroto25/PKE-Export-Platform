# UX-00 Source Inventory & Initial UX Gap Audit
**Date:** 26 November 2026  
**Repository:** koenbroto25/PKE-Export-Platform  
**Branch audited:** `p20/platform-continuation-20261123`  
**Audit type:** GitHub source read-only inspection; no checkout, build, runtime or test execution available.  
**Status:** PARTIAL — route/navigation and selected source components inspected; full source-tree inventory is not yet possible.

## 1. Evidence inspected
- `frontend/src/App.tsx` — blob `30f9398687033242778adaf50236dc8e3a380048`
- `frontend/src/role-permissions.ts` — blob `ef554632d66387599c0aaeb6638b54aa126ffe10`
- `frontend/src/FieldCapturePage.tsx` — blob `5a2e22ec4b292409c81c5811ea3229dbf3208a0f`
- `frontend/src/RoleDashboardPage.tsx` — blob `eea6d0a5ccb833700c60b87a09ef16a6950a095e`
- `frontend/package.json` — blob `c19cd98970d7a2d96623a31f81395773238a110d`
- `main: frontend/src/App.tsx` — blob `f311c958156700f85497a06ea7214d43cb8aca15`

The repository connector could not retrieve several guessed component paths (404); those paths are **not** treated as proof that components do not exist. The available interface does not expose a verified checkout or executable test runner.

## 2. Confirmed application shell and route surface
Continuation branch has a monolithic `App.tsx` (2,621 lines at audit time) with lazy-loaded modules and nested route guards. Confirmed route families:
- Dashboard / role dashboard
- Projects, create, detail, edit, configuration, roles, members
- PKS sites / supplier master
- Port network / maritime operations
- Contract programs
- Operations
- P1 workflow workbench
- My Work and Field Capture
- Finance, Compliance, Journal Entries, Reports
- Notifications and Access
- Shipment Allocations, Cash Advances, Payment Instructions
- Buyer, Supplier, Transporter, Warehouse and Funder partner portals

Navigation is grouped under Workspace, Project Operations, Control & Intelligence, Administration and Partner Portals; there is a menu search, mobile sidebar and Project picker. Visibility is permission-derived through `visiblePageKeys`; routes use `RoleGuard`. This is useful foundation but not yet evidence of complete role-by-role journey or server-side authorization.

## 3. Confirmed access-control UX foundation
`role-permissions.ts` uses selected Project, loaded permissions and permission-error state to fail closed for project permissions. The inspected access model also carries active Project membership and role assignment metadata including expiry/revocation. Route access and permission names are page-level requirements; actual API and RLS must remain security boundaries.

**UX gaps to validate:** permissions that use broad OR lists may expose a page to a user with one relevant permission but leave parts of the page empty/disabled; navigation labels do not explain why access is unavailable; role-specific landing behavior needs validation across all role codes; project-switch stale state, direct URLs and route transitions need browser tests.

## 4. Dashboard observations
The dashboard component in `App.tsx` is a legacy/general dashboard while the routed root uses `RoleDashboardPage`. The general dashboard queries Projects, portfolio (Admin), logistics, project reports, contract programs/contracts, inventory, documents and work items based on permissions. It has KPI cards, task control tower, recent checkpoints, system readiness and cost/risk summaries. Some values are explicitly rendered as “Belum dihitung” rather than fabricated zero, which is a positive pattern.

**Risks/gaps:** duplicated dashboard architecture can cause drift; a hard-coded service readiness display must be verified against live health sources; freshness, error, partial-data and ownership semantics need standardization; role-specific dashboard coverage and drill-through are not yet demonstrated.

## 5. RoleDashboardPage
The component exists and is lazy-loaded. It has role metadata and supports data domains such as projects, portfolio, work items, contracts, warehouse receipts, inventory lots, truck trips, shipment allocations, documents, invoices, cash advances, journals, project reports and P17 Admin Control Tower. Full role-by-role logic and CSS could not be fully inspected in this audit due connector/output constraints; mark as **PARTIAL**, not PASS.

## 6. My Work — observed capabilities
The work queue supports PM/project scope versus user/role-assignment scope, creation of instructions, priority and due date, acknowledgement/start/submit/block/resolve/close/reopen/escalate/comment, assignment transfer and history. It has queue KPIs for total, overdue, blocked and submitted-for-review. This is a meaningful work-centric foundation.

**UX gaps:** likely dense task cards; queue filtering/sorting/search, grouped states, evidence-required templates, explicit next-step guidance, conflict and concurrency UX, audit/history detail, and handoff acknowledgement should be checked and standardized. Do not claim these are absent without further inspection.

## 7. Field Capture — confirmed gap
Field page fetches Project work items, filters tasks when scope is Project-wide, caches assignment list, uses cached tasks when API is unavailable and creates local drafts with evidence. It reports that cached assignment cannot be reverified online. The audit confirms no client server-sync adapter in the inspected page; draft acceptance/receipt is not implemented there.

Release blocker: never treat cache as currently assigned/authorized; never claim sync; keep local drafts recoverable while clearly marking assignment verification status. Server sync contract, idempotency, evidence lifecycle and receipt tests remain open.

## 8. Admin and PM priorities
### Admin
Existing AccessPage includes global role/permission catalog, users, provisioning status, Project selection, PM governance, account provisioning, activation/deactivation/session revocation, membership assignment, role revocation and PM appointment. This is strong governance capability but is presented within the Access workspace rather than a complete Admin Control Center.

**Admin UX work:** separate Admin landing/portfolio health; queue-first critical exceptions; account/project/integration/security health; approvals; stale/failing integrations; audit drilldown; source timestamps and owners; guided next actions. Preserve sensitive permission and provisioning controls.

### PM
Existing Project/PM governance and My Work support membership, Project context, task assignment, deadlines, escalations and task review. A unified Project 360 is not yet evidenced from inspected source.

**PM UX work:** one Project lifecycle view; milestone map; dependencies; owner/evidence/quantity/blocker/next action; cross-domain readiness; assignment workload; handoffs; quantity reconciliation; scoped timeline and drill-through. PM must coordinate without crossing QA, maker-checker, finance posting or payment authority.

## 9. Preliminary gap priority
| Priority | Gap | Status |
|---|---|---|
| P0 | Exact-head repository graph/tree and executable environment | BLOCKED |
| P0 | Route × role × permission × action matrix and negative tests | PARTIAL |
| P0 | Field server sync/receipt/idempotency/conflict/evidence lifecycle | OPEN / BLOCKER |
| P1 | Consolidate dashboard architecture and role landing standards | OPEN |
| P1 | Admin Control Center, exception queue and system health provenance | OPEN / PARTIAL existing Access |
| P1 | PM Project 360 lifecycle/milestones/quantity/ownership/handoffs | OPEN / PARTIAL existing Project & My Work |
| P1 | UX primitives and standardized freshness/error/empty/conflict states | OPEN |
| P2 | Operational domain workflow views (QA/warehouse/transport/port/loading) | PARTIAL; needs page-level audit |
| P2 | Cross-check provenance, discrepancy owner/reviewer/resolution UX | PARTIAL |
| P2 | Integrations/notification/handoff center | PARTIAL |
| P2 | External partner portal journey and IDOR negative coverage | PARTIAL |
| P3 | Accessibility, mobile/tablet and performance acceptance | NOT VERIFIED |
| P3 | 100+ synthetic scenario UX/backtest evidence | NOT VERIFIED |

## 10. Immediate execution sequence
1. UX-00 complete route/page/component/API/permission/schema inventory. This report is an initial partial inventory, not complete.
2. UX-01 design-system audit and standards; implement shared primitives in verified source workspace.
3. UX-02 role-navigation matrix and direct-route negative tests.
4. UX-03 Admin Control Center.
5. UX-04 PM Project 360.
6. UX-04A Field sync contract implementation after API/storage/RLS review; schema changes remain approval-only.
7. UX-04B–04D operational journeys.
8. UX-05 Control Tower/cross-check.
9. UX-06 integrations and UX-07 notifications/handoffs.
10. Role completion, reporting/audit, accessibility/performance, synthetic backtest and exact-head regression.

## 11. Safety / operational boundary
No source code was changed during this audit. No database write, migration, Production seed, Vercel deploy, branch merge/rebase or force push was performed. Findings are limited to files successfully fetched from GitHub and must be revalidated against exact current head before implementation.


## Addendum — RoleDashboardPage deeper inspection (26 November 2026)

The initial summary understated the current implementation. Further inspection confirms the dashboard already includes:
- Platform Admin Control Center entry panel (portfolio/project, user/access, PM ownership, Control Tower/reports).
- Project Admin entry panel (configuration, members/assignment, Project roles, access review).
- PM cockpit entry panel (My Work, contracts/supply, operations/transport, port/terminal, vessel/shipping, documents/compliance, Finance and reports).
- P17 portfolio Control Tower showing project-level shipment/loading/voyage/nomination/port-call/document/overdue/exception summary.
- Role identity, focus/outputs, links, permission-derived metrics, task status counts, export-process coverage and server/API/RLS boundary message.
- RoleMeta itself contains explicit material gaps: production/packing/QC dashboards; QA release and hold governance; lab sample lineage; HSE checklist/stop-work; warehouse PO matching and quality linkage; transport dispatch board, route constraints, ETA/SLA; driver offline sync; loading shift/actual quantity/ticket capture/sign-off; terminal berth confirmation; AIS entitlement/freshness; independent survey quantity reconciliation; document checklist/version/expiry/field cross-check; Field server sync.

**Revised status:** Admin/PM landing cockpit is PARTIAL IMPLEMENTED. The next work should build source-backed exception queues and Project 360 drilldowns on top of these panels, not replace the existing dashboard. The dashboard currently labels several domains NOT_INTEGRATED or permission-scoped and shows caveats; these labels need standardized status/freshness/provenance primitives and tests.

RoleDashboardPage.css has responsive grid behavior and breakpoints at 700px and 640px, but mobile/tablet acceptance was not run. The CSS file was inspected read-only.
