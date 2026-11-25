# PKE UX Rebuilding Master Specification
## UX Transformation Blueprint — Admin & Project Manager First

**Status:** OWNER-REQUESTED DESIGN SPECIFICATION — proposed target, not implementation evidence  
**Version:** 1.0  
**Date:** 24 November 2026  
**Repository:** `koenbroto25/PKE-Export-Platform`  
**Working branch:** `p20/platform-continuation-20261123`  
**Product:** PKE Export Intelligence & Project Control Platform

---

## 1. Executive decision

PKE must be rebuilt around the work users need to complete, not around the database tables, API endpoints, or the chronological history of development phases.

**UX is a first-order product requirement.** It is not a cosmetic pass after backend completion. The interface must make every authorized capability discoverable, explain what needs attention, preserve project context, and guide each role to its next valid action.

The first two personas to optimize are:

1. **Platform Admin / Project Admin** — governance, user lifecycle, project provisioning, PM appointment, role and access control, master-data governance, operational oversight, and system health.
2. **Project Manager (PM)** — end-to-end Project execution, coordination across functions, task ownership, approvals, blockers, exceptions, readiness, and management visibility.

The redesign must still serve all other internal and external roles through role-appropriate workspaces. It must not turn Admin or PM into universal superusers: visibility and actions remain constrained by verified identity, project assignment, permissions, workflow state, and backend/RLS enforcement.

### Product outcome

A user should be able to answer these questions without hunting through unrelated menus:

- Where am I working: platform-wide or inside a specific Project?
- What is my responsibility here?
- What needs my attention now?
- What can I do next, and what evidence or approval is required?
- What is blocked, by whom, and what is the next hand-off?
- Which information is verified, proposed, estimated, stale, or unavailable?
- Where did this quantity, status, document, or decision come from?
- Can I open the underlying object and trace its complete history?

### Non-goals

- This document does not authorize Production database changes, migrations, seed imports, or live operational transactions.
- It does not authorize Vercel deployment or browser UAT.
- It does not activate RAG, AI Knowledge, or chatbot functionality.
- It does not authorize redesign of the P07 Finance accounting engine. Finance UX may improve presentation and navigation while preserving the P07 Finance v1.2 baseline and accounting semantics.
- It does not claim that a proposed page or action already exists in the backend.

---

## 2. Baseline observations from the current branch

The following are source-inspection observations, not a complete visual or browser audit:

- The application shell and route composition are concentrated in `frontend/src/App.tsx`.
- The current primary navigation is grouped as Workspace, Eksekusi, Kontrol, Sistem, and Stakeholder. It contains routes for dashboard, projects, PKS/sites, port network, maritime operations, contracts, operations, P1 workflows, my work, finance, compliance, journal entries, shipment allocations, cash advances, payment instructions, reports, notifications, access, and stakeholder portals.
- The selected Project is held in the app shell and project permissions are loaded for that context.
- Page visibility is derived in `frontend/src/role-permissions.ts`; the API/RLS remains the actual security boundary.
- `RoleDashboardPage.tsx` already contains role-specific metadata for Platform Admin, Project Admin, PM, and operational, finance, compliance, maritime, and partner roles. This is a useful foundation, but role links and summaries do not by themselves guarantee a complete role workflow.
- Existing operational workspaces such as `PortNetworkPage.tsx` and `MaritimeOperationsWorkspace.tsx` expose substantial domain capability, but users still need a coherent cross-module journey and a consistent way to find the next action.
- The master implementation plan header in this branch is Rev2.56. It is the execution/status source of truth. This specification is a deliberately requested UX design artifact; it is subordinate to the master plan and must not become a parallel execution ledger.

**Important:** A complete page-by-page audit, component inventory, permission/API trace, responsive inspection, and role-based browser UAT have not been performed by this document. Those are required implementation activities. Do not label a page “complete” based only on a route, component, or menu entry.

---

## 3. Core UX principles — mandatory

### 3.1 Task-first, role-aware

The first screen must prioritize the user's work queue and decisions, not a generic collection of KPI cards. A role dashboard must answer: “What should I do next?”

### 3.2 Project context is persistent and explicit

Every Project-scoped screen must show the active Project identity, Project status, and relevant context. A user must never unknowingly act in the wrong Project.

- Provide a persistent Project switcher.
- Show a clear “Platform-wide” context for platform governance screens.
- For Project operations, require a valid Project context where the API requires one.
- Preserve context when navigating between Project 360 and its workspaces.
- Warn before discarding unsaved work when switching Project.
- Deep links must validate access to the referenced Project and object.

### 3.3 One coherent platform, differentiated role experiences

Use one design system, shared interaction patterns, and consistent object semantics. Do not force every role into the same dashboard or sidebar.

### 3.4 Progressive disclosure

Show the most important summary first. Put detailed evidence, metadata, history, and advanced controls behind tabs, expandable sections, or object detail pages. Avoid exposing every database field on the first screen.

### 3.5 Actionable status

Every status must answer:
- What does it mean?
- Who owns the next action?
- What is blocking progress?
- What action is permitted?
- What evidence is required?
- What happens after the action?

A status label without an owner, reason, or next step is insufficient for workflow-critical objects.

### 3.6 Provenance and freshness

Visually distinguish:
- Verified / independently reviewed
- Submitted / awaiting review
- Proposed / candidate
- Estimated / calculated
- Simulation-only
- Stale / expired
- Rejected / superseded
- Unavailable / not integrated

Show source, last-updated time, reviewer, evidence reference, and freshness where relevant. Never label last-known AIS data as “Live” unless a live feed and freshness SLA actually support it.

### 3.7 Permission-safe by design

- UI visibility is usability, not authorization.
- Backend authorization and database RLS must independently enforce every read and write.
- A disabled action must explain the missing permission, missing assignment, missing prerequisite, or unsupported backend capability without revealing restricted data.
- Never infer authority from role display text, URL parameters, client state, or a hidden button.
- Preserve maker-checker separation and independent review.
- Do not expose contract, financial, buyer, or supplier data to field roles unless explicitly authorized.

### 3.8 No false affordances

Do not render a button that implies a transaction can be completed when the required API, permission, schema, or workflow is absent. Use a truthful “Not available yet” or read-only state, with the reason and dependency recorded.

### 3.9 Operational speed and accessibility

- Common actions should be reachable in one or two deliberate navigation steps.
- Use plain Bahasa Indonesia for primary operational labels; retain standard domain terms where they are clearer.
- Support keyboard navigation, visible focus, semantic labels, contrast, scalable text, and screen-reader announcements.
- Optimize desktop for Admin/PM control work and mobile for field execution.

---

## 4. Target information architecture

Use five top-level navigation groups. The actual menu is permission-filtered and role-prioritized; this is the target information architecture, not a claim that every module is implemented.

### A. WORKSPACE
- My Dashboard
- My Tasks
- Approvals
- Notifications
- My Projects
- Recent Items
- Saved Views (only when persistence is implemented)

### B. PROJECT OPERATIONS
- Project 360
- Contract & Delivery Plan
- Procurement
- Supply & Supplier Coordination
- Product & Quality
- Inventory & Warehouse
- Transport & Field
- Port & Terminal
- Shipping & Vessel
- Compliance & Export Documents
- Finance & Settlement
- Project Reports

### C. MASTER & PARTNERS
- Organizations
- Suppliers
- PKS / KCP Facilities
- Products
- Ports & Terminals
- Warehouses
- Vessels
- Buyers
- Routes & Logistics Network
- Transporters

### D. CONTROL & INTELLIGENCE
- Executive Control Tower
- Portfolio Overview
- Operational Performance
- Compliance Intelligence
- Audit Trail
- Data Quality & Provenance
- Integration Health
- AI Knowledge (hidden/disabled until separately approved and activated)

### E. ADMINISTRATION
- User Directory
- Invitations & Identity Linking
- Role Catalog
- Permission Matrix
- Project Membership
- PM Appointment
- Master Data Governance
- Approval Policies
- System Configuration
- Security & Audit
- Integration Configuration

### Navigation behavior

- Admin receives a platform-wide navigation mode and a Project-scoped mode.
- PM receives a Project-first navigation mode with Project 360 as the anchor.
- Other internal roles see their assigned workspace and task queue first.
- External partners receive separate portal shells, not the internal sidebar with a few hidden menu items.
- Group headings may collapse; active location and breadcrumbs remain visible.
- Add a global command/search entry point for authorized objects and actions.
- Do not put every sub-page in the persistent sidebar. Use workspace landing pages and contextual tabs.

---

## 5. Experience model: two contexts

### 5.1 Platform context

Used primarily by Platform Admin and authorized governance users.

Focus:
- Cross-Project portfolio and lifecycle
- User identity and account status
- PM appointment and Project ownership
- Role/permission governance
- Master-data stewardship and change review
- System/integration health
- Audit, exceptions, and platform-level alerts

Platform context must not silently inherit a Project context or imply access to all Project business records.

### 5.2 Project context

Used by PM and assigned Project members.

Focus:
- Project 360
- Project-specific work queue
- milestones and readiness
- contract, supply, quality, inventory, transport, port, shipping, documents, and finance
- exceptions, approvals, and hand-offs
- Project audit trail and reports

A Project Admin may administer Project membership/configuration within assigned authority; that does not automatically confer Platform Admin privileges.

---

## 6. Priority workspace 1 — Platform Admin Control Center

### 6.1 Purpose

Make platform governance understandable and efficient. Admin should not have to navigate through operational pages to discover user, Project, assignment, or system issues.

### 6.2 Landing dashboard

Recommended layout:

**Top context strip**
- Platform context indicator
- Active environment / data context (read-only label)
- Current user and effective admin scope
- Global search
- Notification/approval inbox

**Priority action panel**
- Pending user invitations / identity linking
- Projects awaiting provisioning or review
- Projects without an appointed active PM
- PM appointment requests awaiting action
- Access/role change requests awaiting review
- Master-data change requests
- Critical integration/system exceptions

**Portfolio snapshot**
- Total Projects by lifecycle state
- Active Projects
- Projects with no PM
- Projects blocked by governance
- Projects requiring master-data review

**Governance health**
- Users with incomplete identity mapping
- Inactive, expired, or conflicting assignments
- Orphaned Project membership/role assignment findings
- Pending maker-checker approvals
- Recent high-risk admin actions

**Recent activity**
- User/role changes
- Project provisioning
- PM appointment/replacement
- Master-data review outcomes
- Security and integration events

Do not display fabricated counts. Empty, loading, failed, and permission-limited states must be explicit.

### 6.3 Admin workspace pages

1. **User Directory**
   - Search by name, email, organization, identity state, active status.
   - Filters: invited, active, suspended, identity-link pending, access review required.
   - User detail: identity mapping, organization, memberships, active roles, expiry, audit history.
   - Actions only when supported: invite, resend invitation, suspend/reactivate, initiate identity-link flow, request access change.
   - Never expose secrets, authentication tokens, or private credentials.

2. **Project Provisioning**
   - Project list with lifecycle, owner, PM, start/end dates, operational readiness, access status.
   - Guided creation with clear stages: identity, contract/reference, scope, dates, initial governance, PM appointment.
   - Draft/save/review/activate states must be explicit.
   - Project activation must not be implied by simply creating a record.

3. **PM Appointment**
   - Dedicated workflow rather than an incidental field on Project edit.
   - Show eligible candidates and why they are eligible, based on verified membership/permissions.
   - Display current PM, proposed PM, effective date, scope, and impact.
   - Require explicit confirmation and audit record.
   - Replacement/revocation must preserve history; never silently overwrite prior appointment.
   - If backend lacks a distinct appointment workflow, show the capability as pending implementation rather than simulating it in UI.

4. **Role & Permission Governance**
   - Separate role catalog, permission catalog, role-to-permission mapping, and user-to-Project assignment.
   - Show effective permissions in a human-readable “Why can/can’t this user do this?” view.
   - Distinguish platform roles from Project roles.
   - Display assignment source, scope, active state, start/end/expiry, reviewer, and audit history.
   - Maker-checker for sensitive access grants/revocations where required by policy.

5. **Master Data Governance**
   - Organization, supplier, PKS/KCP, product, port, terminal, warehouse, vessel, route, buyer.
   - Search and deduplicate; show canonical record and linked references.
   - Separate proposed, submitted, reviewed, verified, rejected, and superseded records.
   - Change requests must show source/evidence, reviewer, reason, and downstream impact.
   - Do not bulk-import unverified master data.

6. **Platform Health**
   - API availability/health where measured
   - Auth/identity integration state
   - Database/runtime connectivity state
   - Object storage status
   - External data-source status and freshness
   - Background job/queue state where implemented
   - Failed integration events and retry eligibility
   - Each indicator must identify its source and last check time; no green “healthy” badge without an actual check.

7. **Admin Audit**
   - Filter by actor, target object, action, Project, time, and outcome.
   - Show before/after where legally and technically appropriate.
   - Protect sensitive fields and credentials.
   - Link each event to the affected object and relevant approval.

### 6.4 Admin success criteria

- Admin can identify Projects without a valid PM from one screen.
- Admin can open a user and understand identity, Project membership, effective role, scope, and expiry without joining data manually.
- Admin can trace a PM appointment or access change to its requester, reviewer, decision, and timestamp.
- Admin can distinguish platform-wide governance from Project operations.
- No Admin control bypasses backend permission checks or maker-checker rules.

---

## 7. Priority workspace 2 — Project Manager Cockpit

### 7.1 Purpose

PM is the operational integrator. The PM experience must connect every Project workstream and expose what is blocked, what is due, who owns the next step, and whether the export is genuinely ready.

### 7.2 PM landing page: Project 360

The PM landing page is the primary operational home. It should be a focused control cockpit, not a wall of unrelated charts.

**A. Project header**
- Project code and name
- Buyer / contract reference where authorized
- Lifecycle state
- Planned shipment/quantity and unit
- Current active milestone
- PM and core team
- Project health with explainable contributing factors
- Project switcher

**B. “Needs my attention”**
- Approvals awaiting PM action
- Overdue tasks and unacknowledged instructions
- Unassigned work items
- Critical quality or inventory holds
- Quantity variance
- Dispatch/truck exceptions
- Port/berth/loading blockers
- Vessel or voyage exceptions
- Missing/expired export documents
- Finance obligations/due dates within PM visibility
- Each item links directly to the relevant object and permitted action.

**C. Milestone timeline**
- Contract activation
- Supply confirmation
- Product/quality release
- Allocation and procurement
- Dispatch and receiving
- Warehouse/stock readiness
- Port and terminal readiness
- Vessel nomination / voyage
- Compliance/document readiness
- Loading and quantity reconciliation
- Departure, arrival, discharge, delivery
- Finance reconciliation and settlement

Only render milestones supported by the Project workflow and real data. Show not started, in progress, blocked, awaiting review, complete, or not applicable with clear criteria.

**D. Workstream readiness**
- Contract & buyer requirement
- Supply & supplier capacity
- Product & quality
- Procurement & allocation
- Inventory & warehouse
- Transport
- Port & terminal
- Shipping & vessel
- Compliance & documents
- Finance & settlement

Each workstream card shows:
- status and confidence/provenance
- outstanding tasks
- blocker count
- accountable owner
- next milestone
- last updated time
- open workspace action

**E. Quantity and logistics overview**
- Contracted quantity
- Confirmed supply
- Allocated quantity
- Received quantity
- Available / reserved / quarantined / in-transit stock
- Port received quantity
- Loaded quantity
- Reconciled shipment quantity

All quantities must include unit and source. Never combine unlike units or statuses into one unexplained total.

**F. Team and ownership**
- Workstream owner
- Task assignee
- Due date
- Acknowledgement state
- Escalation path
- Recent hand-offs

**G. Project activity**
- Chronological events across workstreams
- Actor, action, object, timestamp, source, and outcome
- Link to full audit history

### 7.3 PM task inbox

A PM must have one prioritized queue across modules.

Required filters:
- Assigned to me
- Assigned to my team
- Awaiting my approval
- Overdue
- Due soon
- Blocked
- Unassigned
- High risk
- By workstream
- By supplier/facility/port/vessel where authorized

Every task row/card must include:
- concise title
- Project and object reference
- reason it exists
- priority and due date
- current owner
- dependency/blocker
- next valid action
- action permissions
- activity/last update

Provide bulk actions only for safe, homogeneous operations. Never bulk-approve or bulk-release high-risk transactions by default.

### 7.4 PM approvals and exception handling

Create a unified approval inbox, while preserving domain-specific review rules.

- Group by approval type and risk.
- Show requester, object, Project, evidence, policy/rule, and prior decisions.
- Show conflicts of interest or maker-checker restrictions.
- Require a reason for reject/return where policy requires.
- Show the consequence of approval before confirmation.
- Never conflate “submitted”, “approved”, “verified”, “paid”, “released”, or “completed”.
- PM may only approve actions for which explicit permission and workflow authority exist.

### 7.5 PM Project 360 drill-downs

The PM must be able to move from the overview into these connected workspaces without losing Project context:

1. Contract & Buyer Requirements
2. Procurement & Supply
3. Product & Quality
4. Inventory & Warehouse
5. Transport & Field
6. Port & Terminal
7. Shipping & Vessel
8. Compliance & Export Documents
9. Finance & Settlement
10. Reports & Audit

---

## 8. Experiences for every other role

Each role gets a task-first landing page and only the domain workspace necessary for its assigned responsibilities. A role may have multiple active assignments; the UI must derive effective access from verified assignments and permissions, not a hard-coded single-role assumption.

| Role / persona | Primary landing focus | Main workspace and visible scope |
|---|---|---|
| Project Admin | Project configuration and governance queue | Project profile, members, roles, documents, audit; Finance read-only unless separately granted |
| Procurement Officer | Buyer demand, supplier matching, quotations, PR/PO tasks | Procurement, supply, supplier/facility profiles, allocation |
| Contract Manager | Contract lifecycle and buyer requirements | Contracts, delivery schedule, contract documents, hand-off to PM |
| PKS / Site Manager | Facility readiness, capacity, supply commitments | Assigned PKS/KCP, capacity submissions, orders, dispatch schedule |
| Production Manager | Production readiness and supply plan | Assigned facility, production data only where integrated |
| Packing Supervisor | Packing work queue and lot traceability | Packing/stuffing tasks, quantities, lot evidence |
| QC Officer / Lab Officer | Sampling and test work queue | Sample records, test results, evidence; no release authority unless granted |
| QA Manager | Independent quality review | Quality holds, release/hold decisions, review evidence |
| HSE Officer | Inspection and corrective actions | HSE checklist, risk, findings, corrective-action queue |
| Warehouse Manager | Facility stock and warehouse exceptions | Receiving, lots, balances, reservations, holds, movements, reconciliation |
| Warehouse Officer | Assigned receiving and dispatch tasks | Mobile-friendly receipt, weighbridge, evidence, hand-off |
| Inventory Controller | Lot balance, movement, aging and variance | Inventory intelligence, lot traceability, reservation and reconciliation |
| Transport Manager | Fleet, dispatch and trip exceptions | Dispatch board, trip assignment, route, ETA and exception management |
| Dispatcher | Trips needing vehicle/driver assignment | Dispatch queue and assigned trips |
| Driver / Transporter | My Assigned Trips | Mobile trip detail, route, checkpoint, photo/weighbridge evidence, offline queue, sync |
| Checker / Field Checker | Assigned checkpoint verification | Mobile verification, discrepancy, evidence review |
| Port Operations | Port call, berth, terminal and loading queue | Port operations and loading operations |
| Master of Loading | Shipment loading readiness | Vessel, loading plan, tickets, tally, quantity reconciliation |
| Shipping / Vessel Coordinator | Nomination, voyage and port-call readiness | Vessel lookup, nomination, assessment, voyage, AIS freshness, shipment timeline |
| Regulatory & Compliance Officer | Rule changes and document readiness | Regulatory registry, country pack, checklist, review, expiry, impact assessment |
| Finance Officer / Cashier | Obligations, payments and evidence | Finance workbench with explicit maker/checker boundaries |
| Accountant | Accounting and reconciliation | AP/AR, journals, GL, settlement, read/review permissions |
| Internal Auditor | Findings and audit evidence | Read-only cross-domain evidence within authorized scope |
| Buyer | Assigned contracts and shipments | Separate Buyer Portal with granted shipment, quantity, COA, documents, timeline, claims |
| Supplier | Assigned orders and capacity requests | Separate Supplier Portal with organization/facility, capability, quotation, dispatch, quality |
| Funder | Authorized funding and reporting scope | Separate Funder Portal; only explicitly granted data |

**Role combinations:** If a user has multiple active roles, provide a role/workspace switcher or combined task inbox, but never merge permissions into an unexplained “highest role”. Display the active scope for each action.

---

## 9. Domain workspace specifications

### 9.1 Project 360

Project is the connective tissue, not a duplicate of master data. The Project references canonical organizations, facilities, products, ports, warehouses, vessels, and partners through explicit participation, allocation, assignment, and transaction relationships.

### 9.2 Procurement & Supply

Provide a connected sequence:
- Buyer requirement
- Supplier/facility discovery
- Capacity and availability submission
- Matching and comparison
- Quotation / offer
- Purchase request and purchase order (only where implemented)
- Commitment / reservation
- Allocation
- Dispatch hand-off

Show why a supplier or facility is eligible. Distinguish verified capacity from submitted or estimated capacity. Do not invent PO workflows if backend support is absent.

### 9.3 Product & Quality

Provide:
- Product catalog and specification
- Sampling request
- Sample custody
- Lab result and method
- QA review
- COA generation/verification
- Release / hold decision

Every result needs source, unit, method, timestamp, reviewer, and evidence. Quality release must be an explicit authorized decision.

### 9.4 Inventory & Warehouse Intelligence

Stock must never be shown as a single unexplained total.

Provide:
- Stock by facility
- Stock by lot
- Available quantity
- Reserved quantity
- Quarantined quantity
- In-transit quantity
- Warehouse balance
- Stock aging
- Lot traceability
- Quantity variance

Every lot detail must connect:
- origin PKS/KCP and source receipt
- physical location and warehouse/bin where available
- custody and hand-off history
- quality status and COA
- reservation/allocation
- movement history
- linked Project/shipment
- reconciliation and adjustment audit

### 9.5 Transport & Field PWA

Field checker, driver, and transporter must not use the desktop Admin/PM dashboard.

Mobile-first screens:
- My Assigned Trips
- Trip Detail
- QR Scan
- Departure
- Checkpoint
- Arrival
- Weighbridge Evidence
- Photo Evidence
- GPS Accuracy
- Offline Queue
- Sync Status
- Exception Report

Design rules:
- one primary task per screen
- large reachable action controls
- clear connectivity and sync state
- safe retry and duplicate-submit protection
- timestamp and location accuracy visible
- offline actions queued with an explicit pending state
- sensitive contract/financial details hidden unless separately authorized

### 9.6 Port & Loading Operations

Separate four workspaces:
1. Port & Terminal Directory
2. Port Operations
3. Loading Operations
4. Port Logistics Intelligence

Expose port, terminal, berth, depth and datum, tide reference, anchorage, loading services/equipment, port warehouse, berth availability, port call, loading queue, loading ticket, tally, and quantity reconciliation.

The operational chain must be traceable:
**PKS → land transport → port → terminal → port warehouse → loading → vessel.**

Port recommendation must use operational suitability and verified evidence, not distance alone. Show the basis, constraints, freshness, and confidence of each assessment.

### 9.7 Shipping & Vessel Control Tower

Provide:
- Vessel Master and lookup
- Vessel nomination
- Vessel-Port assessment
- Voyage
- Port call
- AIS position and freshness
- Loading progress
- Shipment events
- Shipping documents
- Departure, arrival, discharge, delivery

Use **Shipment 360** as the main shipment page. Clearly identify last-known position vs live feed, source, timestamp, and age.

### 9.8 Compliance & Export Documents

Provide:
- Regulatory Source Registry
- Regulatory Rule Management
- Country Pack
- Document Catalog
- Project Document Checklist
- Upload
- Review
- Expiry Monitoring
- Compliance Assessment
- Exception Approval
- Amendment Impact

Document statuses must be explicit: draft, submitted, under review, verified, expired, superseded, rejected. A single green readiness indicator must never conceal a critical pending requirement. Show readiness by requirement and country/rule version.

### 9.9 Finance & Accounting

Preserve the P07 Finance v1.2 accounting baseline. Improve user comprehension of:
- RAB
- Budget Version
- Commitment
- Payment Obligation
- Payment Request
- Payment Instruction
- Payment Evidence
- AP/AR
- Cash Advance
- General Ledger
- FX Exposure
- Project Settlement

Use a Project Finance Summary with separate Budget, Commitment, Accrual, Actual Expense, Cash Paid, and EAC. “Payment Instruction Created” must never look like “Paid”. Preserve maker-checker and accounting period controls.

### 9.10 Reporting & Intelligence

Three levels:
1. Executive Overview
2. Operational Performance
3. Detailed Reports

KPIs, only when supported by trustworthy data:
- supply availability
- stock by lot/location/status
- truck cycle time
- warehouse occupancy
- port loading productivity
- quantity variance
- shipment on-time
- document readiness
- buyer demand vs fulfillment
- budget/commitment/actual/cash
- AP/AR aging
- Project margin
- FX exposure

Notification Center aggregates approval requests, overdue tasks, document expiry, quality holds, stock variance, truck/vessel exceptions, shipment delays, and finance due dates. Every notification deep-links to the relevant object and action.

### 9.11 Buyer and Supplier portals

Portals must be separate experiences and separate authorization surfaces.

Buyer Portal:
- My Contracts
- My Export Shipments
- Quantity Progress
- Lot / COA Visibility
- Vessel Tracking
- Document Readiness
- Shipment Timeline
- Claims
- Payment Milestones (only if visibility is explicitly granted)

Supplier Portal:
- Organization Profile
- Facility Profile
- Product Capability
- Capacity Submission
- Quotations
- Assigned Orders
- Dispatch Schedule
- Quality Submission
- Claims
- Document Requests

Buyer visibility must depend on verified identity mapping and explicit visibility grants, never URL parameters or email matching alone.

---

## 10. Shared page patterns and interaction standards

### 10.1 Workspace landing page

Every workspace landing page uses a consistent pattern:
1. Page title and plain-language purpose
2. Context (Platform / Project / facility / shipment)
3. Primary action(s), permission-gated
4. Attention summary (blocked, overdue, awaiting review)
5. Search, filter, sort
6. Data table/list with clear empty/loading/error states
7. Detail panel or object navigation
8. Activity/audit trail

### 10.2 Object 360 detail

For Project, contract, supplier, PKS, lot, warehouse receipt, truck trip, port, vessel, voyage, shipment, document, payment, and approval objects, provide a reusable detail layout:

- Overview
- Status and next action
- Related objects
- Timeline / events
- Evidence and documents
- Quantities and reconciliation (where relevant)
- Assignments / ownership
- Audit history
- Permissions-aware actions

### 10.3 Tables

- Default columns must answer the task, not expose every database field.
- Keep filters visible and show active filter chips.
- Support sorting and pagination for large datasets.
- Preserve stable identifiers and human-readable references.
- Show units, dates, time zones, and currencies explicitly.
- Provide export only when authorized and implemented.
- Distinguish no records from failed request and no permission.

### 10.4 Forms and wizards

- Group fields by business meaning.
- Mark required/optional fields and explain why a field is required.
- Validate inline and summarize errors at the top.
- Preserve entered values after recoverable errors.
- Confirm irreversible or high-impact actions.
- Show the resulting workflow state before submission.
- Never silently default critical dates, units, legal entities, currency, Project, or approval identity.
- Use drafts for incomplete multi-step forms where supported.

### 10.5 Status language

Use consistent labels and definitions across the app. Minimum semantic distinction:
- Draft
- Submitted
- Under Review
- Approved
- Verified
- Rejected
- Returned for Correction
- Active
- On Hold / Quarantined
- Expired
- Superseded
- Completed
- Cancelled
- Stale
- Unavailable

Do not reuse a label for different business meanings. “Approved” is not automatically “verified”; “created” is not “paid”; “submitted” is not “released”.

### 10.6 Search

Provide a global search that returns only objects the user may access:
- Project
- contract
- organization / supplier / PKS
- product / lot
- warehouse receipt
- truck trip
- port / terminal
- vessel / voyage
- shipment
- document
- task / approval

Search results show object type, reference, Project, status, last updated, and why it matched. Search must be server-authorized and must not leak the existence of inaccessible records.

### 10.7 Notifications

Every notification includes:
- event and severity
- affected object
- Project
- time and source
- current owner
- required action or reason no action is possible
- direct link to the authorized object

Provide read/unread and filters. Avoid duplicate alerts and noisy notifications.

---

## 11. Design system and responsive behavior

### 11.1 Visual direction

Use a calm, high-clarity enterprise operations interface. Avoid dashboard decoration that competes with task priority.

- Consistent spacing, typography, surface hierarchy, and icon semantics.
- Neutral backgrounds; restrained status colors only for meaningful states.
- High contrast for data labels and table content.
- Avoid excessive gradients, oversized KPI cards, dense borders, and repeated decorative badges.
- Use clear Indonesian labels and familiar business language.
- Status colors must always be accompanied by text; never rely on color alone.

### 11.2 Responsive breakpoints

- Desktop: Admin governance, PM Project 360, finance/accounting, audit, wide tables.
- Tablet: approvals, Project overview, operational coordination.
- Mobile: field workflows, driver/checker, quick approvals, notifications, limited object lookup.

Do not merely shrink the desktop sidebar and tables. Provide a mobile navigation model and mobile task flows.

### 11.3 Accessibility baseline

- Keyboard-accessible navigation and dialogs
- Visible focus indicators
- Semantic heading order
- Labels and descriptions for all form fields
- Accessible error and success announcements
- Minimum touch target sizing appropriate for field use
- No color-only status
- Respect reduced-motion settings
- Test zoom and narrow viewport layouts

---

## 12. Page and capability mapping against current frontend

This is an initial route-to-target mapping from source inspection. It is not a complete visual audit.

| Current route / source area | Target destination | UX disposition |
|---|---|---|
| `/` / RoleDashboardPage | Role-specific landing | Rebuild as role task cockpit; retain useful role metadata |
| `/projects` | Portfolio + My Projects | Split platform portfolio from Project member list |
| `/projects/:id` | Project 360 | Promote to the primary PM workspace |
| `/projects/:id/configuration` | Project governance | Contextual Project Admin area |
| `/projects/:id/roles`, `/members`, `/access` | Access & membership | Consolidate into coherent governance workflows with distinct scopes |
| `/pks-sites` | Supply & Facility Network | Expand from master lookup to assigned facility and capacity workflows |
| `/contracts` | Contract & Buyer Requirements | Add timeline, requirement readiness, and PM hand-off |
| `/operations` | Operational Control | Reorganize by workstream and task ownership |
| `/p1-workflows` | Workflow Center | Use as domain workflow surface; do not expose phase labels as user-facing navigation |
| `/my-work` | Unified Task Inbox | Make available consistently to all eligible roles |
| `/port-network` | Port & Terminal workspace | Split directory, operations, loading, and intelligence views |
| `/maritime-operations` | Shipping & Vessel Control Tower | Add Shipment 360 and coherent voyage timeline |
| `/finance`, `/journal-entries`, `/cash-advances`, `/payment-instructions` | Finance & Settlement | Unify navigation and summary; preserve P07 accounting baseline |
| `/compliance` | Compliance & Document Center | Consolidate regulatory, checklist, review, expiry, assessment |
| `/shipment-allocations` | Procurement / Shipment execution | Integrate allocation into Project and shipment journeys |
| `/reports` | Reporting & Intelligence | Separate executive, operational, and detailed reports |
| `/notifications` | Notification Center | Keep as global inbox with object deep links |
| `/buyer`, `/supplier`, `/transporter`, `/warehouse`, `/funder` | Separate stakeholder / field portals | Do not share the internal navigation shell indiscriminately |

### Required full audit output during implementation

For every current route, component, tab, and action, record in the master implementation plan:
- current route/component
- user roles and scope
- permission requirements
- API endpoint(s)
- schema/table dependencies
- workflow state transitions
- existing automated tests
- responsive behavior
- current UX issue
- disposition: keep, redesign, merge, split, remove, or not implemented
- acceptance test and evidence

The audit must include hidden routes, contextual tabs, modal actions, links, and buttons—not only the visible sidebar.

---

## 13. Business journeys that the UX must connect

The application must be tested as end-to-end journeys, not isolated pages.

1. **Partner & Facility Onboarding:** Supplier → organization → PKS/KCP → capacity → verification.
2. **Product & Quality:** Product → specification → sample → lab result → COA → release/hold.
3. **Buyer Matching:** Buyer requirement → supplier matching → quotation → offer.
4. **Contract & Project:** Contract → delivery schedule → allocation → Project activation.
5. **Procurement & Dispatch:** Purchase request → PO → reservation → truck dispatch.
6. **Warehouse & Inventory:** Receiving → weighbridge → QC → storage → packing → traceable stock.
7. **Port & Vessel:** PKS route → port selection → terminal → vessel nomination → port call.
8. **Compliance & Export Documents:** Rule assessment → document checklist → review → readiness.
9. **Loading & Buyer Tracking:** Loading ticket → on-board quantity → departure → buyer visibility.
10. **Finance & Settlement:** Budget → commitment → payment → reconciliation → settlement.
11. **Regulatory Intelligence:** Official source → rule version → impact assessment → reviewer action.

For each journey, test the relevant role hand-offs. Example: dispatch must work for PKS, dispatcher, driver, checker, warehouse, and PM without giving those users identical permissions.

---

## 14. Prioritized implementation roadmap

UX rebuilding is a coordinated program. Do not attempt to redesign every page in one unreviewed change set.

### UX-00 — Audit and UX contract (P0)
- Inventory every route, page, component, tab, modal, action, and role.
- Map UI → permission → API → schema → workflow → tests.
- Identify dead ends, duplicate pages, hidden capabilities, false actions, inconsistent status, and context loss.
- Establish shared design tokens, shell contract, object detail pattern, task model, and acceptance harness.
- Deliver Admin and PM user-flow maps first.

### UX-01 — UX Foundation (P0)
- Role-aware app shell
- Platform vs Project context
- Navigation groups and permission-aware discovery
- Global search
- Unified notification center
- Unified task/approval inbox foundation
- Shared table, filter, form, status, empty/error/loading patterns
- Accessibility and responsive baseline

### UX-02 — Admin Control Center (P0, first user-facing priority)
- Admin landing dashboard
- User directory and identity status
- Project portfolio/provisioning
- PM appointment workflow
- Role/permission governance
- Master-data governance
- Platform health and audit

### UX-03 — PM Project 360 (P0, first user-facing priority)
- Project 360 landing
- PM task inbox
- Approval and exception center
- Milestone timeline
- Workstream readiness
- Team ownership and hand-off
- Quantity/logistics summary
- Project activity/audit

### UX-04 — Core operational workspaces (P1)
- Procurement & Supply
- Product & Quality
- Inventory & Warehouse
- Transport & Field PWA
- Port & Loading
- Shipping & Vessel / Shipment 360

### UX-05 — Compliance and Finance experience (P1)
- Compliance & Document Center
- Finance & Settlement UX
- Preserve P07 Finance v1.2 engine and controls

### UX-06 — Stakeholder portals (P2)
- Buyer
- Supplier / PKS
- Transporter
- Warehouse/field
- Funder, if approved and supported

### UX-07 — Reporting and intelligence (P2)
- Executive overview
- Operational performance
- Detailed reports
- Notification intelligence
- AI Knowledge only after separate approval and activation

### Sequencing rule

UX-00 must inspect the whole application, but implementation begins with UX-01, UX-02, and UX-03. Admin and PM flows must be validated before expanding to all domain workspaces. Existing working backend capability should be surfaced before new backend capability is proposed.

---

## 15. Implementation rules and backend dependency handling

For each proposed screen or action, classify the dependency:

- **A — Existing backend capability:** UI can be implemented against a verified existing endpoint and permission.
- **B — Existing data, missing API:** API work is required before the action becomes available.
- **C — Missing schema/workflow:** record as a backend dependency; do not create an optimistic UI.
- **D — External evidence / owner decision:** show a safe pending/blocked state; do not fabricate data.
- **E — Future/approved-only capability:** keep hidden or clearly disabled until separately authorized.

Each action must have a traceability record:
`UI control → route → API method/path → permission → data object → state transition → audit event → test`.

If any link is missing, the action cannot be marked production-ready.

Do not add database migrations merely to make a visual design work. First determine whether the capability can be represented using existing schema/API contracts. Any required migration remains subject to the project's migration and environment approval rules.

---

## 16. Security and privacy acceptance

- Platform Admin and Project Admin are distinct scopes.
- PM access is limited to assigned Project(s) and explicit permissions.
- Project switching must reload effective permissions and clear stale Project data.
- A deep link to another Project must fail closed.
- External portal data must be bound to verified identity and explicit visibility grants.
- Finance, buyer, supplier, and contract visibility must be role- and object-scoped.
- Admin actions must be audited.
- Sensitive actions must preserve maker-checker separation.
- Client-side page filtering is never the sole access control.
- API/RLS negative tests must prove that unauthorized users cannot retrieve records even if they call endpoints directly.
- Error messages must not leak hidden object existence or sensitive fields.

---

## 17. UX acceptance scorecard

Every UX package must pass all applicable criteria.

| Dimension | Acceptance requirement |
|---|---|
| Discoverability | Every authorized capability is findable through role navigation, task, search, or contextual link |
| Admin efficiency | Admin can find users, Projects, PM appointments, access issues, and governance queues from the Control Center |
| PM efficiency | PM can identify blockers, next actions, owners, due dates, and Project readiness from Project 360 |
| Project context | Every Project-scoped page clearly identifies the active Project |
| Task completion | No dead-end in a backend-supported workflow |
| Action truthfulness | No control promises a transaction that API/permission/state cannot complete |
| Permission | Direct API and RLS tests reject unauthorized access |
| Status clarity | Status meaning, owner, next action, and evidence are understandable |
| Provenance | Verified, proposed, estimated, stale, simulation, and unavailable data are distinguishable |
| Traceability | User can open source object, evidence, event timeline, and audit trail |
| Form usability | Validation, units, date, currency, required fields, and errors are clear |
| Mobile | Field tasks are usable on narrow viewports and weak connectivity |
| Accessibility | Keyboard, focus, labels, contrast, zoom, and screen-reader states pass |
| Consistency | Tables, filters, status, forms, timelines, and object detail patterns are consistent |
| Performance | Loading, pagination, and refresh behavior are predictable; no blocking all-page fetch where avoidable |

### Required task-based usability tests

At minimum, test the following scenarios with representative roles:

**Platform Admin**
1. Find a user with incomplete identity linking and understand the next safe action.
2. Find a Project without an active PM.
3. Appoint or replace a PM through the approved workflow.
4. Inspect a user's effective Project permissions and assignment expiry.
5. Review a master-data change request and trace its evidence.
6. Identify an integration failure and its last successful check.

**Project Manager**
1. Open the correct Project and understand its overall status.
2. Find the three most important blockers and their owners.
3. Locate an overdue task and reassign/escalate only if authorized.
4. Review a pending approval with its evidence and consequences.
5. Trace stock from Project summary to lot, facility, custody, and quality state.
6. Trace dispatch from PKS through transport to port.
7. Review vessel/shipment readiness and AIS freshness.
8. Identify missing export documents and the responsible owner.
9. Understand budget, commitment, accrual, actual, cash paid, and EAC without confusing payment states.

**Other roles**
- Driver completes an assigned trip task and sees sync state.
- Warehouse Officer records/inspects an assigned receipt without seeing unrelated finance data.
- QA reviewer performs only authorized independent review.
- Buyer sees only explicitly granted shipments and documents.
- Supplier sees only assigned orders and submissions.
- Internal Auditor can inspect evidence without modifying audited transactions.

Measure task completion, time to locate the next action, wrong-context errors, permission-denied surprises, form errors, and user confidence. Set numerical targets after baseline measurement rather than inventing current performance.

---

## 18. Required design and implementation deliverables

1. Route/component/action inventory.
2. Role-to-workspace and role-to-task matrix.
3. Admin journey and wireflow.
4. PM Project 360 wireflow.
5. Target information architecture and navigation rules.
6. Shared design-system tokens and reusable component patterns.
7. Page-level UX disposition matrix.
8. UI/API/permission/schema/workflow traceability matrix.
9. Responsive behavior specification.
10. Accessibility checklist and evidence.
11. Role-based task test scripts.
12. Automated UI/component/accessibility tests where applicable.
13. Backend dependency register for missing API/schema/workflow.
14. Before/after evidence and acceptance results.

Execution status, blockers, code mappings, test evidence, and decisions must be recorded in the Master Implementation Plan's living execution ledger and relevant domain sections. This specification defines the UX target; it is not a second implementation-status ledger.

---

## 19. Definition of Done

The UX rebuilding program is not complete because the sidebar looks cleaner or the dashboards have new cards.

A package is complete only when:
- target users can complete its supported tasks end-to-end;
- every visible action maps to a real, authorized backend operation;
- every unsupported action is explicitly disabled or absent;
- Project context and role scope remain correct across navigation and deep links;
- loading, empty, error, stale, and no-permission states are handled;
- object provenance and audit history are accessible;
- desktop/mobile behavior is validated for the relevant persona;
- automated tests and direct API/RLS negative tests pass;
- Admin and PM usability scenarios pass with recorded evidence;
- no P07 Finance accounting semantics or existing security controls have been weakened.

**Overall UX acceptance:** Admin and PM journeys are P0 release gates. PKE must not be declared UX-ready while either persona still needs to manually combine unrelated pages to understand Project state, access governance, blockers, or next actions.

---

## 20. Immediate next execution sequence

1. Read the Master Implementation Plan and preserve its current status/authority rules.
2. Audit all frontend routes, components, actions, role metadata, permission checks, APIs, and responsive styles on the working branch.
3. Produce the route/role/API/schema disposition directly in the Master Implementation Plan's relevant sections/ledger.
4. Implement UX Foundation without changing authorization semantics.
5. Build Admin Control Center.
6. Build PM Project 360 and unified task/approval experience.
7. Run role-specific functional tests and API/RLS negative tests.
8. Continue to operational workspaces in the roadmap order.
9. Keep Vercel deployment/browser UAT skipped until explicitly re-authorized; do not touch Production or apply migrations as part of a visual UX pass.

**Owner priority:** UX usability and discoverability come first. Admin and PM are the first two end-to-end experiences to make coherent, while all other roles receive focused and secure workspaces under the same design system.



## UX-04A — Field Mobile & Offline Detail Contract (25 November 2026)

This work package is the next implementation priority. The UX-00–03 checkpoint validates source/CI contracts only; it does not establish operational field readiness.

### Field task experience
- One assignment-first task list, grouped by actionable state and urgency, scoped to the signed-in user's assignments and active Project.
- Task detail shows location, instructions, checklist, required evidence, previous events, next action, owner and due time where available.
- Context switch and deep-link access must fail closed; stale Project data must be cleared on switch.

### Capture and evidence
- Capture actor/time from trusted app/server context; geolocation is optional with explicit denied/unavailable/low-accuracy states and no fabricated coordinates.
- Photo/document capture stores a local queue record and upload lifecycle; evidence is not marked server-accepted until receipt is confirmed.
- QR/barcode scanning is progressive enhancement with manual entry and validation fallback.
- Evidence metadata must include object/record linkage, capture time, upload time, checksum where supported, source/capture method, and integrity/validation status.

### Offline and sync semantics
- Durable queue survives app restart and network loss.
- Every mutation carries an idempotency token; duplicate retries must not duplicate business records.
- Sync is observable and recoverable: queued, uploading, synced, rejected, conflict, needs-review.
- Conflicts are never silently overwritten. Show conflicting values/source and route to authorized resolution.
- Queue is assignment/project-scoped and must not leak between identities or Projects.
- Logout/account switch must protect locally cached sensitive records; clear or securely isolate cache according to approved policy.

### Acceptance tests
1. User sees only assigned tasks and permitted Project scope.
2. Capture without network survives reload/restart.
3. Repeated sync/retry creates one server mutation.
4. Permission denied for GPS is handled without blocking tasks unless location is a required business gate.
5. Evidence upload failure is visible and retryable; capture is not falsely marked accepted.
6. Conflict and server rejection are visible with safe next actions.
7. Identity/Project switch does not expose cached records from prior scope.
8. Responsive/mobile, keyboard/focus and accessible status semantics pass.
9. API/RLS negative tests reject direct unauthorized reads/writes.
10. Build, typecheck, automated tests and CI pass.

### Dependency disposition
Classify every item as existing backend (A), missing API (B), missing schema/workflow (C), external/owner approval (D), or future/approved-only (E). Do not add schema or migrations solely for UI; record blockers and seek authorization for any DB change.


## UX-04A implementation status

The source checkpoint is tracked in `docs/UX/UX-04A_Field_Mobile_Offline_Implementation_Checkpoint.md`. Current code supports local draft capture and IndexedDB persistence only. Server-backed assignment validation, synchronization, upload, conflict resolution, cache security and field UAT remain acceptance blockers. This spec remains the authority for the target UX; implementation checkpoint records evidence/status.
