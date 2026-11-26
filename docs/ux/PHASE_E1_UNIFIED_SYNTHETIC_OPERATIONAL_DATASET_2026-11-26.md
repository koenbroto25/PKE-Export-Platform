# Marathon Continuation — Phase E1 Unified Synthetic Dataset

Date: 2026-11-26
Branch: `p20/platform-continuation-20261123`

## Scope and safety
Source-only GitHub branch. No Vercel deployments, Neon/database operations, migrations, production data or live AI calls were performed.

## Implemented
- Deterministic fixture factory seeded with `PKE-E2E-2026-01`.
- Three projects and shipment scenarios: complete, QC hold, loading quantity conflict.
- Relational synthetic records: buyer, supplier, PKS site, contract, lot/genealogy, truck, driver, vessel, port, tally/survey, documents, finance and shipment.
- Twelve lifecycle stage evidence/status fields from contract through settlement.
- Validator for duplicate identities, project FK/scope, SIM namespace, quantity validity, key linked records and lifecycle completeness.
- Summary helper for coverage and scenario counts.
- Tests cover determinism, synthetic-only data, relations, coverage and tampering detection; root `npm test` command includes the suite.

## Status
**Phase E1 implementation: source committed; CI pending.** This is a first seed dataset, not yet a comprehensive end-to-end engine. The fixtures do not yet execute real business APIs or prove live UI workflows. Phase E2/E3, F, G, H and I remain open.

## Commits
- `7800d556c735e707a7fe954395b602ee16dbc2b0` — fixture generator
- `f9ab89a6d26625deace46efd7157513fb42e0e19` — tests
- `f7eeaf7544981c9404f8b67a596144ac1d990a50` — root test wiring


## Expanded marathon implementation checkpoint

### Phase E2/E3 — implemented in offline fixture scope
- Added `phase-e-lifecycle-engine.ts`: deterministic 12-stage simulation (contract → settlement), downstream fail-closed propagation and upstream change invalidation.
- Added 5 tests for complete lifecycle, QC hold, loading conflict, dependency cascade and summary.
- CI run `45816341325` (commit `ceda738a6c8612f629fa0bf9bed1790a78d7cf98`) SUCCESS after correcting one summary expectation.

### Phase F — synthetic role backtest contracts
- 14 roles modeled. PM project-wide view, stage-owner workspace, same-project scope, human actor requirement, action only for stage owner on ready stage; Admin/reviewer cannot operationally act through this matrix.
- CI runs `45816417659` and `45816423837` SUCCESS.
- This is contract simulation, not runtime API authorization proof.

### Phase G — chaos/recovery fixtures
- 8 declared faults: duplicate ID, cross-project reference, negative quantity, QC hold, quantity conflict, missing document, unauthorized-project namespace, upstream recovery/invalidation.
- Assertions cover detection and fail-closed behavior.

### Phase H — offline AI evaluation
- 6 synthetic expected-response cases for evidence gaps, conflict, stale source, project scope, false readiness, and authority claims.
- Deterministic evaluator checks required phrases, prohibited claims, scope, provenance and abstention. It does not call a live model and cannot claim real model performance.

### Phase I — traceability
- 6-row matrix. 4 covered by synthetic contracts, 1 partial (offline AI only), 1 gap (actual production UI/API integration). Explicitly prevents false completion.

**CI status for the newest integrated G–I test set:** pending. Earlier Phase E and F suites are verified green. Do not mark the overall marathon complete until latest CI completes and any failure is corrected.


## Final combined CI validation
- Run: `45816699621`
- Commit: `a4997f4e9aa2e923235a44d9bdafbf03ef0927be`
- Conclusion: **SUCCESS**
- 75 test files / 718 tests passed.
- Dedicated P19 assurance, migration/release-policy checks, migration dry-run (no DB connection), backend build/typecheck, frontend typecheck/build all succeeded.

### Acceptance status
| Phase | Status | Scope caveat |
|---|---|---|
| E1/E2 | PASS | 3 synthetic linked projects; 12-stage offline simulation; 36 stage slots |
| F | PASS | 14-role contract matrix; not runtime authorization |
| G | PASS | 8 offline injected fault classes; not integration/production chaos |
| H | PASS | 6 offline evaluator cases; no live AI benchmarking |
| I | PASS | Traceability matrix; explicitly lists actual UI/API integration as GAP |

The implementation passes CI, but it does **not** establish real-world production readiness. The next technical work is to build integration tests against a controlled test environment and exercise actual APIs/UI workflows, including role authorization, persisted state, cross-module side effects, and live AI response quality. These require a separately approved environment; production/Neon and deployment were intentionally untouched.


## Phase J — Controlled HTTP Integration (Manual Trial Mode)

Implemented a real in-process Express HTTP harness around the existing Manual Trial Mode route registration (ephemeral loopback port; deterministic in-memory state; no DB). Scenarios cover login/me, project create→activate→portfolio aggregation, document requirement association and metadata list, invalid requirement rejection, storage disabled, integration unavailable-state honesty, permission denial, and reset controls.

Hardening performed alongside the tests:
- Manual demo reset now requires an admin session.
- Project configuration mutation routes require `project.configuration.manage`.
- Project document requirement/list reads require `documents.view`.
- Document metadata creation requires `documents.create`.
- Document review/status mutation requires `documents.review`.

The latest combined CI run is pending. This harness verifies the demo route set, not the production API/database. Production integration, RLS, persisted workflows, private storage, and browser E2E remain external blockers.

- Expanded the HTTP suite to exercise all 7 demo roles across project read, document view/create and project activation. Role capability assertions are explicit and each role run resets deterministic state.
- Added document review lifecycle checks: uploaded → in_review → rejected (mandatory reason and reviewer stamp); invalid direct approval is rejected; terminal transition behavior is guarded.


## Phase K — Frontend role/page access matrix

Added tests against the actual `frontend/src/role-permissions.ts` access helper covering: project dashboard membership, loading/error fail-closed, finance role+permission, report role restrictions, transporter permission conjunction, warehouse/supplier/funder scope, external-only compliance exclusion, Field Capture/My Work role restrictions, visible menu keys, notifications and Platform Admin access. Tests are wired into root CI. Browser E2E, accessibility, real click flows and authenticated frontend↔backend are not yet verified; no browser runner is configured in the repository.


## Phase L — Dashboard source coverage audit and UX permission defect

### Actual source domains loaded by the shared Role Dashboard
Project/portfolio, work items, contracts and contract programs, warehouse receipts, inventory lots, truck trips, shipment allocations, project documents and requirements, AP/AR invoices, cash advances, journals and project reports. Platform Admin additionally receives the P17 control tower. The dashboard is not yet a complete operational lifecycle source aggregator.

### Explicit unintegrated gaps
- Production, packing, QC sample, laboratory result and QA release metrics/readiness.
- Vessel/port-call, loading plan, tally/survey and laytime reconciliation.
- Official customs/permit/PEB/NPE/Lartas/COO status from authority sources.
- Quantity/document reconciliation across independently authoritative sources.
- Field photo/barcode/signature/offline queue/sync conflict workflow integration.
- Bank execution and reconciliation.

Source failures/missing payloads are shown as unknown/— rather than silently interpreted as zero. PM Project 360 explicitly distinguishes record presence from stage approval/readiness and preserves workspace permission gating.

### Permission bug found and fixed
The frontend Compliance route gate previously allowed `project.view` alone to satisfy the permission list. The rule now requires a non-external compliance-specific permission (and excludes `project.view` and partner-only permissions). Regression coverage was added in Phase K.

### Validation
Phase L contract suite added and wired to root CI; the newest run is pending. This audit does not claim real API integrations are complete.


## Phase N — Role dashboard link and direct-route guard audit

- Audited all role-dashboard link destinations against the actual App navigation and route declarations; every current link resolves.
- Verified that App uses `visiblePageKeys` for sidebar visibility and wraps workspace routes in `RoleGuard`, which calls `hasPageAccess` and fails closed on permission-loading/error states and denied direct routes.
- Added regression suite `src/ux/phase-n-role-dashboard-navigation.test.ts` to cover link-route resolution, major workspace coverage, and direct-route guard contracts.
- Static route tests do not substitute for browser click/keyboard/mobile/accessibility tests; these remain blocked by missing browser E2E runner and isolated auth environment.


## Phase O — Permission-filtered role dashboard links
Role-dashboard role metadata previously rendered its links without checking the current active Project permissions; the App route guard still denied unauthorized direct navigation, but the visible link could lead users to a denial screen. Links are now filtered through the same `hasPageAccess` helper and an explicit path→page mapping. If no role links are accessible, a clear permission message is shown. Regression assertions were added. This improves usability but does not replace server/API authorization.


## Final Phase E–O source validation checkpoint

**GitHub Actions run `45820962004` — SUCCESS** (commit `dcb7a055d8cf5c474777813f3c5e0c70d4f451aa`). Root suite: **80 test files / 749 tests passed**. P19 operational assurance: **20/20 passed**. Release/migration policy checks and migration dry-run passed without DB connection; backend build/typecheck and frontend typecheck/build passed.

### Traceability final counts
11 rows: **9 covered**, **1 partial** (offline AI evaluation only), **1 gap** (production persisted API/UI integration). Phase M defines prerequisites and sequence for closing the remaining integration gap.

### What this proves / does not prove
It proves source contracts, offline synthetic simulation, Manual Trial Mode HTTP behavior, permission/page gating, dashboard source coverage and route/link contracts are green in CI. It does **not** prove production persistence, runtime DB/RLS, real private object storage, browser click/mobile/accessibility flows, live AI accuracy, or operational readiness. These remain environment/approval blockers.

### Guardrails
No Vercel deployment, Neon/database access, migrations, production data, merge, or live AI calls were made.


## Operational readiness closure roadmap and first UX defect fixed — 2026-11-26
The master plan now establishes the remaining work as task-based UX audit, lifecycle correlation, dashboard actionability, exception/recovery backtesting, synthetic end-to-end scenarios, controlled integration gates, and final acceptance.

### First source audit finding (Role Dashboard)
- Process readiness rows were still rendering links even when the row was marked `permission`; route guards prevented unauthorized access, but the visible link was misleading and created a denial-screen dead end.
- The Field Capture readiness row pointed to `/operations` rather than the dedicated `/field` workspace.
- Fixed in `frontend/src/RoleDashboardPage.tsx`: permission-denied readiness rows now render as non-link labels; Field Capture navigates to `/field`.
- Regression assertions added to `src/ux/phase-n-role-dashboard-navigation.test.ts`.
- Validation for this source change is pending CI; do not claim PASS until the workflow completes.


### Remediation validation
- Dashboard readiness links are now gated by actual page permission (`hasPageAccess`) in addition to readiness status; inaccessible workspaces are rendered without clickable navigation.
- Field Capture link corrected to its dedicated `/field` route.
- Regression expectations updated to assert the permission helper and source wording.
- CI run `45825759245`, commit `1c6f387c54bd7a9d0751e7aaa393edb77e9f7f4c`: SUCCESS; 80 test files / 749 tests passed; P19 assurance 20/20; backend/frontend build/typecheck passed.
- This fix closes only the identified navigation defect. Broader role UX, task-flow and lifecycle correlation audit is still in progress.


## Role UX audit — Field Capture access discovery (2026-11-26)
- The Field Capture page was permission-available to multiple operational personas, but many role-dashboard cards did not offer a direct link. The sidebar route existed; task-oriented dashboard access was inconsistent.
- Added permission-filtered `/field` entry links to PKS Site Manager, Production Manager, Packing Supervisor, QC Officer, QA Manager, Laboratory Officer, HSE Officer, Warehouse Manager/Officer, Transport Manager, Dispatcher, Transporter, Checker, Driver, Master of Loading, Loading Supervisor/Operator, Terminal Representative, Shipping Agent, and Marine Surveyor. Existing Field Manager link retained.
- Added regression assertions for each eligible role metadata entry. Actual visibility still uses `hasPageAccess`, so users without required permission do not see the link.
- CI pending for this batch. Field Capture remains local-draft-only; server sync/acceptance is an environment/API integration blocker, not a claim of completed workflow.


## Dashboard source integrity audit — missing payload was being counted as zero (2026-11-26)
- Found a contract ambiguity: successful HTTP responses with missing/non-array fields could be coerced into a numeric zero in several dashboard count expressions. A zero count should only be shown when the endpoint explicitly returns an array; missing payload shape is unknown.
- Updated the dashboard count helper to require an actual array and return em-dash/unknown otherwise. Applied shape guards to combined Contract/Program, Warehouse/Inventory, AP/AR, Document, and Finance/Accounting counts. Single-source trip and shipment-allocation readiness counts now use the guarded helper.
- Added Phase L regression assertions for payload-array shape guards.
- CI pending for this source/test batch. No external integrations or data sources were changed.


## Role dashboard source-data integrity and Field Capture accuracy — follow-up
- Dashboard source count rendering now returns unknown/— when an endpoint payload is missing the expected array; it no longer coerces malformed or missing fields into zero. Guards cover contract/program, warehouse/inventory, AP/AR, document, finance/accounting, trip and shipment allocation counts.
- Field Capture readiness now accurately reports implemented local capabilities (GPS, photo evidence, assignment cache and IndexedDB draft) and separately marks server sync/upload, conflict resolution, barcode and signature as not integrated/validated. This replaces the inaccurate blanket “not available” description.
- Regression tests were added/updated for source payload shape and Field Capture truthfulness. A TypeScript syntax error in the initial Finance count edit was caught by CI and corrected. One remaining CI run is pending for the latest test expectation update.


## Additional dashboard permission audit — Admin and PM cockpits
- Project Admin Configuration, Members, Roles and Access Review shortcuts are now rendered as non-links when the corresponding permission is unavailable (and route to Project selection when no Project context exists).
- PM cockpit shortcuts (Task Inbox, Contract, Operations, Port, Maritime, Compliance, Finance and Reports) are now gated through `hasPageAccess`; denied items display a permission explanation instead of a clickable dead-end.
- Platform Admin's Reports shortcut is gated; when Project-scoped report permission is absent, the dashboard explains that the Control Tower is already available on the dashboard and reports require Project context.
- Regression assertions added for Admin/PM shortcut permission gates. The first Platform Admin conditional edit had a JSX closing-brace error caught by CI and corrected in commit `7e714033dad0ea811881cf1c2f9159ded2dd68c3`. CI for this latest correction is pending.


## Canonical readiness permission + dashboard source integrity validation — 2026-11-26
- Readiness visibility now uses canonical `hasPageAccess` gates for all workspace stages rather than separate raw permission expressions. Field Capture, Port/Maritime, PM, Finance/Accounting visibility is consistent with the actual route gate.
- Readiness deep-links choose the workspace variant accessible to the active user (Workflow Center vs Operations; Maritime vs Port Network; Finance vs Journal Entries). Links remain permission-filtered by page mapping.
- Dashboard count helper and combined count guards prevent absent/non-array payloads from appearing as zero. Field Capture readiness accurately describes implemented local draft capabilities and unavailable server sync.
- Latest CI run `45827726923`, commit `f509a9c6b5a5b0a7ea060f2e85de47f5fd0161dd`: SUCCESS — 80 test files / 749 tests; P19 assurance 20/20; release/migration policy checks and dry-run; backend/frontend typecheck and builds PASS.
- Earlier CI failures in this audit were caught and fixed: stale test expectations and a JSX/TypeScript syntax error. No failed source state remains at the verified commit.
- The audit has corrected several dashboard navigation/data-truth issues, but this is not final acceptance: continue role task workflow and lifecycle correlation audit, then backtest normal/exception/recovery paths. Persisted integration, browser E2E, storage sync and live AI remain environment gates.


## Expanded synthetic lifecycle backtest — seven export cases (2026-11-26)
- Extended the deterministic dataset from 3 to 7 linked synthetic projects/shipments, retaining the clean complete, QC hold, and loading quantity-conflict cases and adding document gap, unsuitable port, expired transport driver, and settlement pending.
- Coverage now spans 84 lifecycle stage slots (7 × 12). No production data or DB was used.
- Integrity validation now rejects false-ready states contradicted by port suitability, driver license, document evidence, tally/survey quantity, or settlement evidence.
- Chaos/recovery suite expanded from 8 to 13 declared faults, including five explicit false-ready contradiction injections.
- Fixture/lifecycle/chaos test expectations updated. CI is pending for this batch; do not mark this expansion PASS until CI completes.


## Synthetic lifecycle expansion follow-up — 10 scenarios (2026-11-26)
- Expanded to 10 synthetic project/shipment cases: complete, QC hold, loading quantity conflict, document gap, unsuitable port, expired transport driver, settlement pending, inventory shortage, PKS capacity shortage, and contract quantity mismatch.
- Coverage: 120 lifecycle stage slots (10 × 12). Evidence-integrity checks now detect false-ready contract quantity, lot quantity, supply capacity, port suitability, transport license, document, loading quantity and settlement states.
- Chaos fault catalog expanded to 16 declared cases. Regression tests updated for the ten-scenario dataset and 49 documents after a synthetic missing-document fault.
- CI currently pending after correcting an assertion syntax issue in the chaos test. Do not claim the 10-scenario expansion PASS until the latest run is green.


## Ten-scenario synthetic backtest validation checkpoint — 2026-11-26
- Verified commit `6e3873138c3a6a3aaa93dee61959f1a5a59e313a`, CI run `45829670413`: SUCCESS — 80 test files / 754 tests passed; release/migration policy checks, backend/frontend typecheck/build PASS.
- The ten-scenario dataset (120 stage slots) validates clean completion, QC hold, loading conflict, document gap, port suitability failure, expired driver, settlement pending, inventory shortage, PKS capacity shortage, and contract quantity mismatch. False-ready contradiction checks cover these evidence domains.
- The 16-fault chaos catalog is included in the passing run. The separate keyboard-accessibility CSS regression batch is pending its own CI.


## Role authority backtest hardening — 2026-11-26
- Found a simulation-model defect: PM lifecycle-wide visibility was also granting simulated stage execution, and field capture was being treated as stage action authority.
- Split visibility stages from operational action stages. PM retains project-wide lifecycle visibility but has no direct simulated stage execution; field users can capture evidence but do not approve/advance readiness. Operational roles act only on their explicitly assigned stage set and only when the stage is ready, human actor is in the same project.
- Added regression tests for PM read-only oversight, field evidence-only, dispatcher transport action, and explicit owner-stage matrix.
- CI pending for this role-authority change. It is simulation/backtest hardening and does not replace actual API/RLS authorization validation.


## Role authority backtest validation checkpoint — 2026-11-26
- Verified commit `983bc76056dd586d9241677869e20c6526ee0365`, CI run `45830044738`: SUCCESS — 80 test files / 755 tests passed; backend/frontend build and typecheck, P19 assurance, release policy checks PASS.
- Role visibility and action authority are now distinct in the simulation. PM can inspect all stages within its project and manage the contract stage, but cannot execute operational stage actions. Field user can capture evidence but cannot approve/advance lifecycle. Stage actions are limited to explicit owner-role stage maps, same-project human actor, and ready state.
- Regression coverage includes PM read-only oversight, field evidence-only behavior, Dispatcher transport action, and role-specific action matrix. This is synthetic assurance; actual API/RLS remains a separate gate.
