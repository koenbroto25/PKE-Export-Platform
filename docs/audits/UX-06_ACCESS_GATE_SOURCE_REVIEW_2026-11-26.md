# UX-06 Access Gate Source Review — 26 November 2026

Branch: `p20/platform-continuation-20261123`

Source blobs:
- `frontend/src/role-permissions.ts`: `ef554632d66387599c0aaeb6638b54aa126ffe10`
- `frontend/src/App.tsx`: `30f9398687033242778adaf50236dc8e3a380048`

## Confirmed source behavior

### RoleGuard
- No active identity: shows identity loading.
- Permission loading: displays a verifying-permission loading state.
- Project permission error with selected Project for non-Platform Admin: fail-closed error state.
- Route access: any allowed key passes if `hasPageAccess` returns true; otherwise denied state.
- This is a UI guard only; it must not replace API/RLS enforcement.

### Project scope and role expiry
- `hasProjectPermission` returns false when user absent, Project not selected, permission loading, or permission error.
- Active role assignments filter active state, inactive role, revoked timestamp, and expiration timestamp.
- `projects` page requires Platform Admin or active Project membership.
- `project-detail` requires `project.view`; edit/configuration/roles/members use distinct permissions.
- Finance and Reports have explicit role sets in addition to permission requirements.
- Field and My Work require selected Project and role/permission conditions.

### Special route gates
- `notifications` currently returns true from `hasPageAccess`; actual route still requires `activeUser` via RoleGuard. **Resource-level scoping, task/project disclosure and notification action authorization must be verified in API/RLS tests.** This is a P0 negative-test requirement, not proof of a vulnerability.
- `buyer` requires buyer portal feature enablement.
- `supplier` requires both supplier and shipment view permissions.
- `transporter` requires trip recording and checkpoint verification permissions.
- `funder` requires active funder role and funder permission.
- `maritime-operations` requires Project scope plus one of vessel/voyage/shipping permissions, except Platform Admin.
- `port-network` allows Platform Admin or selected port/master permissions.
- `p1-workflows` is an OR gate across multiple domain permissions; each individual action must still be permission-scoped and server validated.

## P0 regression matrix
1. Authenticated user with no Project selected: dashboard and routes requiring Project must not show stale prior-Project data.
2. Project permission load pending/error: no sensitive page or action should render/execute.
3. Direct URL bypass attempt for each route and action, including route keys with OR requirements.
4. Membership inactive; role inactive; role revoked; role expired; role active on a different Project.
5. Switch Project during fetch and verify old response cannot overwrite new scope.
6. Notification/task deep links: verify server-side actor, Project and object scope; cross-Project IDs must be rejected.
7. Partner portals: test buyer/supplier/transporter/warehouse/funder cross-tenant object IDs and action permission.
8. Platform Admin vs Project Admin boundary: Project Admin cannot elevate to platform-wide access.
9. Multi-role user: controls and data remain limited to permission intersection/explicitly granted permissions, not the union of role labels alone.
10. Maker-checker/approval routes: same actor cannot bypass segregation through alternate route or direct API.

## Implementation decision
Do not change permission behavior based on this static review alone. The next safe code task is test coverage and source-level API scope mapping, followed by minimal UX improvements with executable regression validation. This file does not claim runtime test results.

No code, Neon, Vercel deployment, main-branch, merge or rebase operations were performed.
