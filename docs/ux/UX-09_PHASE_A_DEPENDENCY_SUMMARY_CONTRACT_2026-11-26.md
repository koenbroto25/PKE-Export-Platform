# P20 continuation — Phase A checkpoint (26 November 2026)

## Status
**Contract implementation hardened and CI wired; CI verification pending. API route integration remains open.**

### Source changes
- `src/knowledge/dependency-summary-contract.ts`
- `src/knowledge/dependency-summary-contract.test.ts`
- Root `package.json` test script now includes the Phase A contract test.

### Contract
DTO fields: project/dependency IDs, lifecycle edge, status, freshness, missing evidence count, blocker category, source workspace/link, last-updated timestamp, safe next action, evidence labels and reasons.

### Authorization and fail-closed controls
- Authenticated identity + project scope + project membership + dependency allowlist + source workspace permission must all pass.
- Malformed access context and permission callback errors fail closed.
- Unauthorized summary returns `null`; no summary fields are emitted.
- A satisfied assessment is downgraded to stale/unknown when freshness is not verified.
- External, protocol-relative, script, control-character and encoded-control links are rejected; only internal relative app routes are retained.
- Status text distinguishes evidence completeness from business approval.
- Not-applicable is not represented as approval.

### Test coverage authored
- Anonymous denial.
- Project mismatch and dependency scope denial.
- Source-workspace permission denial.
- Malformed authorization context and callback exception fail closed.
- Scoped DTO with missing evidence.
- Stale/unknown freshness downgrade and blocker categories.
- Safe internal link allowlist; unsafe URL rejection.
- Business approval boundary and not-applicable behavior.

### Commit evidence
- `1a6257850d3efc1479c8291da0a137c6bca2c261` — hardened contract.
- `ccaa342cf986573b0434f215416da49faa8f4ef1` — expanded tests.
- `8c7cfb248d9a5623792ee8d03898a62bb9c3f141` — added test to root CI command.
- `41cdefab15369f44c0c6261c2325d617ee4707bd` — master plan checkpoint.

## Remaining Phase A
1. Confirm GitHub Actions CI result for the checkpoint and fix failures.
2. Review existing authentication, role and project-scope middleware before creating an endpoint.
3. Integrate into a backend route with server-side scope enforcement (not frontend-only).
4. Add HTTP route-level tests: anonymous, role denial, project isolation, edge scope, malformed request, source permission and fail-closed source adapter errors.
5. Keep fixtures synthetic; do not claim live data integration.

## Constraints
No Vercel deployment, Neon changes, migrations, live ingestion, LLM runtime, production data access, merge or rebase.


## Phase A2 — demo API route checkpoint

- Added `src/dependency-summary-api.ts` with demo-only route `GET /api/v1/projects/:projectId/dependency-summaries?mode=demo`.
- Requires authenticated session, valid project UUID, explicit demo mode, and `project.view`.
- Each edge is filtered by a server-side source-workspace permission map; all mapped permission codes must pass. Unknown workspace maps fail closed.
- Response provenance is explicit: `mode=demo`, `dataSource=synthetic`, `liveIntegration=false`, `authorityDecision=false`.
- The synthetic fixture intentionally contains no evidence; edges show gap with unknown freshness. No edge can be presented as operationally ready.
- No source records, private document contents, or external links are returned.
- Registered from `src/index.ts`.
- Added `src/dependency-summary-api.test.ts` and included it in the root `npm test` script.

### Route tests authored
Authentication, UUID validation, explicit demo mode, synthetic provenance, permission filtering, complete permission-policy mapping, and fail-closed permission lookup exceptions.

### Verification status
**Not yet verified by execution.** GitHub workflow-run lookup for the latest commits returned no runs. The visible commit status is a Vercel build-rate-limit failure; Vercel is intentionally skipped and this is not treated as an application test result. No local build/test execution is available in this workflow.

### Remaining
1. CI/typecheck execution and repair any failures.
2. Frontend PM Project 360 wiring and clear demo-vs-live UX.
3. Live data integration only after a separate authorized source adapter and permission contract review.
4. Phase A completion requires CI and route test evidence; do not claim it yet.


## Phase A3 — PM Project 360 panel wiring

- Static-only panel has been replaced by an API-backed demo view.
- PMProject360 passes `projectId` and `allowedPages` into the panel.
- Panel requests only the explicit demo endpoint, shows a synthetic provenance banner, and labels live integration as off.
- Loading, error, empty/permission-filtered, refresh and data display states are implemented.
- Links to lifecycle workspaces are clickable only when the role-visible page key allows them.
- Panel displays dependency status/freshness, missing evidence, safe next action, AI assistance boundary and human decision owner.
- Added banner styling in `UXFoundation.css`.

### Status
Source wiring is implemented, but frontend build/typecheck and browser QA are **not verified**. API is demo-only and returns synthetic empty evidence. Live data, persistence, and operational readiness remain out of scope.
