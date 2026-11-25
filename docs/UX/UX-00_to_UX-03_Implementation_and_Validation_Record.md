# UX-00 to UX-03 Implementation & Validation Record
**Branch:** `p20/platform-continuation-20261123`  
**Date:** 25 November 2026  
**Deployment:** Vercel deployment/Preview intentionally skipped. No Production DB writes or migrations.

## Work completed
### UX-00 — Source and role audit
- Route and role-permission inventory reviewed.
- Canonical roles are read from active Project membership/assignments; dashboard role summaries are based on active, non-revoked, non-expired assignments.
- Existing route/workspace inventory was reviewed: Project administration, contracts, operations, P1 Workflow Center, task inbox, finance, compliance, reports, notifications, access, shipment allocation, cash advances, payment instructions, partner portals, warehouse, PKS/site, port network and maritime.
- Shared role dashboard source is permission-gated and distinguishes data source failures and permission-hidden views.
- Role family gap assessment is documented separately.

### UX-01 — Navigation and context
- Navigation labels/grouping are work-oriented (Workspace, Project Operations, Control & Intelligence, Administration, Partner Portals), not development phase labels.
- Workflow P1 user-facing label changed to Workflow Center.
- Permission-filtered menu search added.
- Project context change confirmation added; selecting a new Project returns to dashboard and explicitly indicates context change.
- Platform-wide context label is distinct from Project context.
- Empty navigation groups are hidden during search.
- Dashboard metric values return an em dash when the data source was not requested/loaded, avoiding false zero.

### UX-02 — Admin and Project Admin
- Platform Admin cockpit: Portfolio/Project, User & Access, PM & ownership, Control Tower & Reports.
- Project Admin cockpit: Configuration, Members & Assignment, Project Roles, Access Review.
- Scope warnings distinguish Platform Admin from Project Admin.
- Existing PM appointment workflow is discovered through Project detail; appointment endpoint is present in source, but replacement/deactivation/history and server enforcement require full audit.

### UX-03 — PM dashboard
- Project 360 cockpit: Task Inbox & Blocker, Contract & Supply, Operations & Transport, Port & Terminal, Shipping & Vessel, Documents & Compliance, Finance & Settlement, Project Reporting.
- Existing common metrics and task queue are preserved.
- Export process source coverage remains a source-status view, not an automatic cross-check engine.
- All active roles continue to receive role-focus cards and links; specialized operational board maturity is tracked in the coverage matrix.

## Validation record
| Check | Evidence/status |
|---|---|
| Source inspection of App shell and role dashboard | Pass (read-back) |
| Role catalogue coverage in role dashboard metadata | Contract test present |
| Project context confirmation | Contract assertion present |
| Permission-filtered menu search | Contract assertion present |
| False-zero metric handling | Implemented; contract assertion updated |
| Admin / Project Admin / PM cockpit presence | Contract assertions present |
| Export chain source-coverage wording | Contract assertion updated |
| GitHub Actions root unit suite | **Pending latest run** |
| Backend build/API typecheck | Pending latest run |
| Frontend typecheck/build | Pending latest run |
| Browser/mobile UAT | Deferred; Vercel deployment skipped |
| API/RLS negative tests against UAT | Separate evidence required |

## Completion criteria
UX-00–UX-03 are **source-implemented but not certified PASS** until latest GitHub Actions completes successfully and role/task/context/permission test evidence is recorded. Browser/mobile UAT is an explicitly deferred acceptance item, not a hidden pass.

## Related assessment
See `docs/UX/Role_Dashboard_Coverage_Export_Crosscheck_OpenSource_FieldReadiness.md` for the all-role dashboard coverage assessment, open-source recommendation, export cross-check architecture, field-readiness gaps and roadmap.
