# UX-02 Role Navigation & Permission UX Audit
**Date:** 26 November 2026  
**Branch:** p20/platform-continuation-20261123  
**Status:** PARTIAL SOURCE AUDIT; no runtime/security tests.

## 1. What exists
- Navigation items are grouped and filtered by visiblePageKeys; menu search is provided.
- Each route is wrapped in RoleGuard with page keys.
- Notifications page key is intentionally visible regardless of Project permission (actual notification scoping must be enforced by API).
- Dashboard is available to active Project members and is explicitly role-scoped; domain data is permission-gated within dashboard.
- Field Capture requires selected Project, loaded permissions and an allow-listed operational role.
- My Work requires selected Project, loaded permissions and a non-funder active Project role.
- Buyer portal requires buyerPortalEnabled.
- Funder requires active funder role and funder.view.
- Finance and Reports have both role allow-lists and permission requirements.
- Project configuration/roles/members have dedicated permission gates.
- Project/role assignment expiry and revocation are considered when computing active role codes.
- External portal routes are permission-gated; API/RLS remains authority.

## 2. Permission UX risks / test requirements
1. **Page-level OR permission lists:** some routes accept any one of a set of permissions. Verify the page can degrade safely when only one permission is granted and that mutation controls remain independently gated.
2. **Project Admin vs Platform Admin:** route and UI scope must visibly differ. A Project Admin must never inherit platform scope.
3. **Dashboard access:** project membership grants dashboard shell, while each data section is permission-driven. Confirm zero-permission and expired membership cases display a clear scope/permission state.
4. **Notifications:** visible route for all authenticated workspace users; prove API returns only actor/Project authorized records and direct IDs cannot cross scope.
5. **Role aliases:** normalize legacy aliases (admin, projectmanager, project_manager, warehouse, loading_manager) and prove alias mapping cannot accidentally widen access.
6. **Role expiry/revocation:** context switch and refresh must remove revoked/expired permissions immediately; cached page data must not persist under stale role.
7. **External users:** Buyer/Supplier/Transporter/Warehouse/Funder direct URL, shipment/Project IDOR, partner identity and visibility grants require negative API/browser tests.
8. **Role overlap:** multiple active roles should show an understandable combined role context, while actions remain permission-bound. Need verify whether users can choose a role-focused view without altering authorization.
9. **Missing Project:** all Project-scoped routes should show a single consistent scope-required state rather than empty cards or misleading zero.
10. **Access denied vs not found:** preserve backend response privacy semantics; UI should not reveal unauthorized record existence.

## 3. Preliminary route-to-role matrix (not authorization proof)
| Page family | Client gate observed | UX acceptance |
|---|---|---|
| Dashboard | Active Project membership; Admin platform scope | Clear role context, per-source permission and freshness |
| Projects | Platform Admin or active membership | List/detail/edit/config/members action matrix |
| Access | Platform Admin or Project member/role management permissions | Distinct platform vs Project scope |
| Contracts | contract.view | Role-specific contract actions |
| Operations | logistics/operations/warehouse/inventory/shipping permissions | Action-level and domain workflow scope |
| Workflow Center | Any listed P1 domain permission | Workflow list/detail/actions individually gated |
| My Work | Selected Project + active non-funder role + permissions | Assigned vs PM Project scope, filters, assignment lifecycle |
| Field Capture | Selected Project + operational role + permissions | Assignment revalidation and offline/sync status |
| Finance | Role allow-list + finance permission | P07 read/create/update controls and no implied payment execution |
| Journals | accounting.view | Posting/reversal separately gated |
| Compliance | Role/permission mix; external-only permission exclusions | Document scope, review authority, legal advisory boundaries |
| Reports | Role allow-list + reports/report permission | Source freshness and export permission |
| Notifications | Always visible | Actor/Project scoping, dedup, actionable route |
| Buyer | buyerPortalEnabled | Grant-backed identity and shipment scope |
| Supplier | supplier.view + shipment.view | Supplier-owned Project/order scope |
| Transporter | record_truck_trips + verify_checkpoints | Assigned trips/checkpoints only |
| Warehouse | warehouse/inventory view | Facility/Project/lot scope |
| Funder | active funder role + funder.view | Explicit sharing; no default finance exposure |
| PKS Sites | pks.site.view or Admin | Master-data change-request governance |
| Port Network | port/warehouse/doc/master-change permissions | Port suitability advisory vs authoritative approval |
| Maritime | selected Project + voyage/vessel/nomination/shipping/shipment permissions | Project vessel identity, AIS freshness and actual-event provenance |

## 4. Required matrix artifact before UX-02 PASS
Build a source-derived CSV/MD matrix with columns: role code; alias; route; page key; visible nav; direct route; permission set; server endpoint; API method/action; Project/partner scope; sensitive actions; empty/denied behavior; stale-cache behavior; test IDs; evidence status.

## 5. Acceptance tests
- All role codes/aliases (including legacy aliases) map to expected landing pages.
- Route direct-entry test per role × route.
- Permission-loading, permission-error, no-Project, expired membership, revoked role and Project-switch states.
- OR permission route with single permission and each action separately.
- Admin vs Project Admin scope separation.
- Partner IDOR/cross-Project/cross-buyer/cross-supplier.
- Notifications endpoint and direct resource ID scope.
- API/RLS negative tests; UI tests alone do not prove authorization.

## 6. Conclusion
The route/permission foundation is meaningful and should be preserved. UX-02 is **PARTIAL**, not PASS: source mapping exists, but exhaustive role × route × action matrix and runtime negative testing remain unexecuted. Next use the matrix to drive UX-03 Admin and UX-04 PM queue/workspace implementation rather than redesigning navigation blindly.
