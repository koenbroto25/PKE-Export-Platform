# UX-03 Admin Control Center & UX-04 PM Project 360 — Build Specification
**Date:** 26 November 2026  
**Branch baseline:** p20/platform-continuation-20261123  
**Status:** SPEC READY; implementation and acceptance BLOCKED pending verified checkout/test execution.

## 1. Existing implementation to reuse
- RoleDashboardPage already has Admin/Project Admin/PM entry panels and P17 Admin Control Tower.
- AccessPage has global account provisioning/activation/deactivation, reset requests, session revocation, role templates/permission catalogue, Project membership/role assignment, PM appointment and revocation.
- ProjectsPage supports project listing and project creation; ProjectDetailPage currently presents a minimal detail surface (project ID, name, status, target, navigation to edit/config/members/roles). The inspected implementation does not yet demonstrate a Project lifecycle workspace.
- My Work has task lifecycle and assignment/handoff primitives.
- Existing APIs are the source of truth; no duplicate status store.

## 2. UX-03 Admin Control Center
### Landing hierarchy
1. Critical exception/approval queue
2. Access/security anomalies
3. Integration/platform-health exceptions
4. Overdue/unassigned tasks and handoffs
5. Portfolio lifecycle summary
6. Recent sensitive governance changes

### Exception card fields
- severity and category
- Project name/code and link (when scoped)
- source record link and source system
- detected/last updated time and age
- owner/assignee and due date
- evidence/provenance/freshness
- concise issue statement and impact
- permitted next action (assign, review, acknowledge, retry, open record); no unsupported override

### Portfolio cards
- Project lifecycle distribution (only authoritative statuses)
- missing/expired Project Manager assignment
- overdue critical milestone/task
- active blockers and unresolved discrepancies
- QA hold/rejected lot indicators (when source is integrated)
- warehouse/inventory exception (when source is integrated)
- transport/port/loading variance (when source is integrated)
- document readiness/expiry
- integration availability/freshness
- pending governance review

### Admin health center
Separate platform/system and business readiness:
- Auth/provisioning state
- API/DB health based on verified health endpoints
- storage upload verification status
- provider entitlement/credential metadata and freshness
- queue/backlog/retry failures
- schema/migration drift (read-only status only)
- CI/release candidate evidence
No static “connected/available” status unless backed by a health source and timestamp. Do not expose secrets.

### Access & governance
Keep current AccessPage as detailed management module, but provide a top-level Admin summary for:
- inactive global users with active Project membership
- membership/role expired/revoked inconsistencies
- Projects without active PM
- multiple active PM appointments where policy disallows
- pending role/access review
- maker-checker anomalies
- grant expiration/review
Every alert drills into canonical record; no automatic destructive remediation.

### Admin acceptance
- KPI definitions and query sources documented.
- All KPIs show zero only for verified empty; source unavailable shows unavailable.
- Exception cards are permission scoped and have clear owner/action.
- Platform Admin vs Project Admin separation is visible and enforced.
- Governance actions require reason/confirmation where policy and API require.
- Audit event linked to each sensitive action.
- Health statuses cannot be hard-coded.
- Browser tests for loading, partial source failure, empty, denied, stale and direct URL.
- Security negative tests across Project IDs.

## 3. UX-04 PM Project 360
### Project header
Project name/code; lifecycle; buyer/contract; product/spec; target quantity/unit; destination; planned shipment window; PM/team; data freshness; critical status. Display only available authorized source fields.

### Lifecycle board
Contract → Procurement/Supply → Production → QA → Warehouse → Allocation → Transport → Port/Terminal → Loading → Survey/Tally → Export Documents → Shipment → Finance/Settlement.
Each stage uses domain source status and shows:
- status/freshness/provenance
- planned vs actual dates
- accountable role/person
- dependency/previous stage
- required evidence and verification
- quantity/unit and reconciliation variance if available
- blocker and next permitted action
- handoff acknowledgement

Stages without source integration must be explicitly “Not integrated / unavailable”; no inferred completion.

### PM priority panel
- critical blockers
- overdue milestones
- next 7-day tasks (configurable)
- awaiting review/approval (PM only where authorized)
- unassigned work
- pending handoff acknowledgement
- quantity discrepancies
- document readiness/expiry
- supplier/production/transport/port exceptions

### Workstream drill-down
Cards link to existing Contracts, Operations, Workflow Center, PKS/Supplier, Port Network, Maritime, Shipment Allocation, Compliance, Finance, Reports and My Work. Project 360 must not create competing domain records or permissions.

### Quantity reconciliation view
Show only sourced measures, with unit and conversion basis:
Contracted → committed supply → received → produced → QA released → packed → warehouse available/reserved → allocated → dispatched → port received → loaded → survey-confirmed → shipped.
Each comparison requires source IDs, timestamp, unit normalization, tolerance/rule version and status (PASS/REVIEW/BLOCK/UNVERIFIED/STALE). Unknown/missing values remain unknown; cannot auto-clear a blocker.

### PM acceptance
- Project header is complete within authorized scope.
- Lifecycle stages accurately represent source-backed status and integration gaps.
- One page answers: current stage, next milestone, blocker, owner, evidence and next action.
- PM can assign/follow up/handoff using existing task engine.
- Project membership/permissions enforced server-side.
- No PM action bypasses QA release, independent approval, accounting posting or payment execution.
- Quantity discrepancies are traceable and cannot be resolved by silent edits.
- Direct route, Project switch, stale source, no-data, error and role-negative tests.

## 4. Implementation sequence (code work)
1. Inventory current components and APIs; identify ProjectDetailPage and Project-scoped data contracts.
2. Add shared freshness/status/source/exception primitives from UX-01.
3. Add Admin dashboard route/panel using existing APIs and verified health endpoints.
4. Convert Admin exceptions into queue cards with owner, age, source and drilldown.
5. Upgrade ProjectDetailPage into Project 360 header/timeline/workstream panels; use existing APIs.
6. Add source-backed milestone aggregation only where endpoint/data contract exists; clearly mark gaps.
7. Add quantity reconciliation read-only first; no write/approval side effects.
8. Add PM task/handoff drilldowns.
9. Test role/scope/negative cases and responsive layout.
10. Build/typecheck/browser regression on exact commit and synthetic fixtures.

## 5. Explicit not-in-scope / gates
- No database migration or schema change in this spec.
- No Production data or dummy seed.
- No payment execution or external legal/customs clearance.
- No AIS provider activation or claiming live data.
- No deployment while Vercel quota instruction remains active.
- Any new endpoint/schema requirement must be proposed, source-audited and approved before migration/application.
