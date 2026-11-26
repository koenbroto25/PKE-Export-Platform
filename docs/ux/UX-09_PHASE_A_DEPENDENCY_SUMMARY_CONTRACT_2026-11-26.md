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


## Phase A4 — PM UX usability refinement

- Added summary counters for total visible edges, evidence gaps, blocked, stale, unknown, and evidence-complete.
- Added a status filter so PM can focus on a specific blocker class without losing the lifecycle map.
- Added empty-filter state and responsive styling for desktop/tablet/mobile.
- Filter operates only on summaries already authorized by the API; it does not change or broaden permissions.
- **Verification pending:** frontend typecheck/build and browser QA have not been executed.


## Latest validation checkpoint

- Added static UI contract tests at `src/dependency-summary-ui.contract.test.ts`.
- Added explicit route denial test for authenticated users without `project.view`.
- Root `npm test` includes both tests.
- Runtime tests/typechecks/builds/browser QA remain **unverified** because this workflow has no repository checkout/runtime execution. GitHub Actions run lookup returned no run; Vercel check is rate-limited and intentionally skipped.
- The demo panel is source-wired; no live evidence adapter or production readiness is asserted.


## Full audit/backtest checkpoint — Phase A/B (26 November 2026)

### Audits completed in source
- [x] Re-audited all 11 lifecycle dependency definitions and decision precedence. Model precedence: upstream gap/blocked → blocked; upstream stale → stale; upstream/downstream unknown → unknown; local missing evidence → gap; downstream blocked → blocked; otherwise satisfied. `not-applicable` is treated as non-blocking input only; it does not mean approved.
- [x] Audited all permission codes used by the demo API against `CANONICAL_ROLE_TEMPLATES`; all mapped codes exist in the canonical catalogue. Added a regression assertion.
- [x] Reviewed frontend role-gated routes, synthetic provenance, loading/error/empty states and data labels. Corrected Unknown filter to include unknown freshness as well as unknown status, and changed evidence label so zero missing items is not incorrectly labelled a gap.
- [x] Expanded assessor backtest from fixture-only checks to an exhaustive decision-precedence table across 11 edges × 3 evidence classes (complete, all missing, one missing) × 7 upstream states × 7 downstream states = **1,617 deterministic combinations**. Added scenario ID/reference integrity checks. These tests are authored, not executed.

### Current status / integrity boundary
- Phase A/B source work is implemented and audited; **not acceptance-passed** because no runtime execution, root/frontend typecheck/build, browser QA, or eligible GitHub Actions run is available. The only commit status surfaced is Vercel; deployment is intentionally skipped per instruction and is not an application test result.
- This model backtests status decision logic only. It does not simulate numeric quantities, contradictory documents, duplicate identifiers/allocations, event-time freshness transitions, source authority/reconciliation, cancelled/partially corrected records, or real role handoffs. Do not infer operational readiness from its synthetic API.
- No Vercel deploy, Neon mutation, migration, production data, live source integration, model API, merge, or rebase was performed.

### Phase B2 — implementation checkpoint (typed evidence/conflict simulation, 26 November 2026)
1. [x] Typed observation contract now includes source/record IDs, quantity/unit, lot/batch/shipment identity, timestamps, source authority, verification, supersession/correction/reversal references, and permission scope.
2. [x] Deterministic conflict/reconciliation rules and tests cover contradiction, duplicate allocation, over-allocation, unit mismatch, partial shipment, freshness/expiry, reordered events, cancellation/reversal, and correction/recovery.
3. [x] Multi-edge propagation failure and recovery tests added.
4. [ ] Route/role registry audit, keyboard/accessibility/browser QA remains outside B2 and is required before Phase C UX acceptance.
5. Phase B2 source and test authoring are complete; **execution/typecheck/CI acceptance is pending**. Next planned phase is Phase C Knowledge Review Queue (synthetic/read-only UX). Live adapters remain later and separately gated; no live adapter is approved.

### Acceptance gates
- [ ] Execute root test suite and release-policy scripts.
- [ ] Execute backend typecheck/build.
- [ ] Execute frontend typecheck/build and frontend tests.
- [ ] Browser QA for PM Project 360 dependency map across roles, filters, responsive breakpoints and access-denied states.
- [ ] Capture actual GitHub Actions run/check evidence (excluding Vercel) and fix all relevant failures.
- [ ] Phase C typed evidence/conflict model and extended backtest pass before any live data correlation.


## Phase B2 — typed evidence & conflict backtest (26 November 2026)

### Source implementation added
- `src/knowledge/typed-evidence-backtest.ts`: deterministic typed evidence evaluator, normalization, conflict detection, quantity reconciliation, allocation duplicate detection, over-allocation, partial shipment, freshness/expiry, event-arrival ordering, cancellation/reversal/supersession, correction references, verification, source-authority bounds, permission scope, missing evidence, and upstream blocker handling.
- `src/knowledge/typed-evidence-backtest.test.ts`: targeted fault tests plus generated **99-case edge/fault matrix** (11 lifecycle edges × 9 fault types).
- Root `npm test` script includes the new B2 test file.

### Backtest scope authored
- Mixed-unit normalization (g/kg/tonne/MT).
- Contradictory evidence keys fail as conflict; source authority is not used to silently select a winner.
- Duplicate record IDs and allocation references fail.
- Aggregate quantity mismatch and over-allocation fail.
- Partial shipment is a gap, not a pass.
- Invalid quantity/unit and authority score fail closed.
- Deterministic stale/expiry clock.
- Event-time / receive-time reversal warning.
- Cancelled/reversed/superseded records excluded from active evidence.
- Correction/reversal references validated; valid superseding correction recovery tested.
- Verification and permission-scope checks.
- Missing required quantity groups.
- Upstream blocked propagation and multi-edge recovery.
- A 99-case matrix applies complete, missing, conflict, unverified, stale, duplicate allocation, partial shipment, rejected and upstream blocked scenarios to every lifecycle edge.

### B2 status
**Implementation and test authoring completed; acceptance is not yet verified.** Tests have not been executed because no repository runtime/checkout is available in this workflow. No pass claim is made. Typecheck/build and CI execution are still required to catch compiler/runtime issues.

### Known limitations / explicit non-authority
- `sourceAuthority` is metadata and range-validated; it never auto-resolves conflicting evidence.
- Quantity groups are explicitly additive buckets; source-specific aggregation policy still needs adapter definitions to avoid mixing independent cross-check totals.
- No live records, source APIs, AI decisions, production approval, database writes or migrations are involved.
- Correction graph validation currently checks references and supersession selection, not full cycle detection or immutable audit-log semantics.
- The model is a simulation contract, not an operational readiness/approval engine.

### Next phase mapping
1. Phase C Knowledge Review Queue (synthetic/read-only) — consume typed findings with role-scoped reviewer assignment, evidence provenance, correction request, and review decision boundary.
2. Route/role registry audit and frontend/browser QA — verify every edge link, permission page key, keyboard access and responsive layout.
3. Live adapters only after separately reviewed contracts, read-only permission scope, freshness, source authority, error/abstention, integration tests and explicit authorization.

### Acceptance gates
- [ ] Root test suite and release policy checks execute successfully.
- [ ] Backend build/typecheck succeeds.
- [ ] Frontend typecheck/build/tests succeed.
- [ ] Eligible GitHub Actions checks (excluding Vercel) are captured and pass.
- [ ] Browser QA across roles, edge filters, responsive layouts and denied access.
- [ ] Review aggregation semantics and correction/audit-log policy before any live adapter.

No Vercel deployment, Neon mutation, migration, production-data access, merge, or rebase was performed.


### Phase B2 hardening follow-up
- [x] Reconciles expected quantity against normalized **group totals**, not individual observations, and separately detects over-allocation.
- [x] Fail-closed correction: an all-inactive/superseded evidence set is a gap, never satisfied.
- [x] Added malformed/non-empty identifier, receive timestamp, and supersession reference checks.
- [x] Added tests for valid correction recovery, quantity aggregate mismatch, authority range, blocked upstream, inactive evidence, malformed references, and metadata.
- [ ] All tests remain authored-only until executable CI/runtime verification is available.
