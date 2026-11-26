# UX-01 Design System & Interaction Standards — Implementation Specification
**Date:** 26 November 2026  
**Branch baseline:** p20/platform-continuation-20261123  
**Status:** SPECIFICATION READY / CODE IMPLEMENTATION BLOCKED pending verified checkout and test runner.

## 1. Purpose
Standardize the current application shell and operational pages before feature-specific redesign. Preserve existing React/Vite architecture and domain permissions; avoid an unnecessary framework replacement.

## 2. Current baseline observed
- App shell, grouped permission-aware navigation, menu search, mobile sidebar, breadcrumbs, Project picker and role context exist in App.tsx.
- RoleDashboardPage already provides role identity, role-focus cards, permission-derived KPI links, task queue, export-stage coverage, Admin Control Center shortcuts, Project Admin shortcuts, PM cockpit shortcuts, P17 Admin Control Tower and Buyer identity/grant panel.
- RoleDashboardPage.css has responsive grid primitives and mobile breakpoints at 700px and 640px for dashboard/panels.
- Many reusable primitives are currently in the large App.tsx; a centralized design-system module is not proven. Avoid wholesale extraction until dependency/test evidence is available.

## 3. Canonical UX primitives to inventory/reuse
### Shell
AppShell, SidebarNavigation, MobileNavigation, Topbar, Breadcrumbs, ProjectContextPicker, RoleContext, PageHeader.
### Cards and data
KpiCard with source/freshness and drilldown; StatusBadge, FreshnessBadge, PermissionBadge, SourceBadge, SimulationBadge; QuantityValue (value, unit, source, time, verification state); CurrencyValue; ConfidenceValue; OwnerDueDate; EvidenceIndicator; ApprovalIndicator; ExceptionSeverity.
### Work
WorkQueue, WorkItemCard/Row, TaskActionBar, AssignmentSummary, HandoffCard, EscalationPanel; WorkflowStepper, MilestoneTimeline, EventTimeline, AuditHistory.
### Forms
FormField, FormSection, FieldHelp, InlineValidation, UnsavedChangesGuard, SubmitState, RetryAction, ConfirmationDialog.
### States
LoadingState, EmptyState with next action, ErrorState with correlation/reference if available, PermissionDeniedState, ScopeRequiredState, UnavailableState, StaleDataState, ConflictState, PartialDataState, SchemaBlockedState, OfflineState.
### Layout
ResponsiveTable/card alternative, FilterBar, SearchField, Pagination, DetailDrawer, Tabs, Modal, Toast, ActivityFeed.

## 4. Semantic state contract
No UI may collapse these into one generic error: Loading/refresh; empty records vs empty due to permission/scope; partial source failure; permission denied; Project scope required; integration unavailable/not configured; stale/freshness unknown; offline with cache (cache age and authorization caveat); schema/feature unavailable; conflict/concurrency stale; validation failure; accepted/durable server receipt; simulated data.
Unknown values use em dash or Unknown; never 0 unless API explicitly returns verified zero. Synced requires a server receipt. Approved/released/posted/paid/loaded/settled require authoritative domain event.

## 5. Status, freshness and provenance
Each status-bearing component maps source domain enums and does not invent transitions. External source displays provider/source, source timestamp and received timestamp where available, freshness class, coverage/rights limitations, verification/authority level, and source/audit link.

## 6. Interaction standards
- Primary action explicit and permission-gated; at most one visually primary action per local context.
- Destructive, irreversible, approval, role, payment and release actions require contextual confirmation and reason where policy requires.
- Mutations show submitting/accepted/failed; prevent duplicate in-flight submit but backend idempotency remains required.
- Server validation maps to field-level/actionable feedback.
- Retry offered only when safe; idempotent retry preserves same key and unchanged payload.
- Optimistic update prohibited for authoritative state unless concurrency/reconciliation contract exists.
- Route/context changes clear or invalidate Project-scoped data; stale data cannot briefly appear under a new Project.
- Every action has traceable result and recovery path.

## 7. Responsive requirements
- Desktop >=1024px: full navigation, operational tables, multi-column dashboards.
- Tablet 641–1023px: navigation collapsible, safe two-column cards, tables scroll or compact with labels.
- Mobile <=640px: one-column priority, full-width primary actions, no horizontal page overflow, compact Project context, task cards, camera/file capture controls, touch targets >=44 CSS px, status text visible without hover.
- Test widths: 320, 375, 414, 768, 1024 and 1440px. Breakpoints may be implementation-adjusted with evidence.

## 8. Accessibility
Keyboard-only navigation and visible focus; semantic headings/landmarks; accessible names for icon-only controls; labels and error association; async status announcements; contrast and non-color-only statuses; 200% zoom/reflow; reduced motion; 44px minimum critical mobile targets.

## 9. Performance and reliability
- Loading skeleton only where layout stability benefits; simple tasks may use compact loading.
- Paginate/bound server lists; avoid dashboard fetching unbounded tables.
- Avoid duplicate dashboard queries and parallel sources with conflicting semantics.
- Each dashboard section has independent source/error/freshness; one failure must not blank unrelated sections.
- Refresh must identify which sources refreshed.
- Avoid N+1 and repeated polling; define freshness/refresh policy per source.
- Lazy pages preserve accessible loading fallback.

## 10. Admin and PM standards
Admin priority: critical blockers/approval exceptions → security/access anomalies → system/integration failures → overdue work → portfolio summary. Each item shows severity, age, Project, owner, source, evidence and permitted next action. Existing dashboard shortcuts are an entry point; UX-03 must evolve to a data-driven actionable control center.
PM priority: project readiness → next milestone → critical blocker → overdue/awaiting review → quantity reconciliation → handoffs → workstream progress. Project 360 drills into authoritative domain records; no shadow data or duplicate statuses.

## 11. Acceptance checklist
- [ ] Primitive inventory confirms existing equivalents and usage; no duplicate component introduced.
- [ ] Shared primitives used by at least 3 pages before broad rollout.
- [ ] Unknown/stale/unavailable/offline/permission/partial/conflict states distinct.
- [ ] Source/freshness metadata visible for KPI and operational facts.
- [ ] Project switch invalidates old scope and displays loading/scope state.
- [ ] Mobile reflows without horizontal overflow at target widths.
- [ ] Keyboard/focus, labels, contrast and 200% zoom acceptance.
- [ ] Duplicate-submit/retry and authoritative-state semantics reviewed.
- [ ] Typecheck, component tests and browser regression on exact commit.
- [ ] No S1/S2 UX/security/workflow regressions.

## 12. Dependencies and next work
1. Obtain reliable source checkout/worktree/test execution.
2. Complete component inventory and identify reusable primitives in App.tsx.
3. Implement UX-01 without broad architecture rewrite.
4. Apply shell/state standards to RoleDashboardPage, My Work and one domain page; prove reusable.
5. Proceed UX-02 role navigation/access matrix, then UX-03 Admin and UX-04 PM.
