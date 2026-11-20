# PKE P03 / Phase 0 Execution Plan
**Updated:** 2026-11-19 00:28 WIB  
**Execution target:** close all internally controllable F0 gates by 2026-11-19 12:00 WIB. Any external-owner dependency remains explicitly BLOCKED; no false COMPLETE status.

## Current release baseline
- Repository: `koenbroto25/PKE-Export-Platform`
- Active validation branch: `phase0/reconcile-source-20261117`
- Latest verified GitHub Actions run: `44304826658`, commit `96d3e4f3a490a70b0724b776412719a1a5f1e785`, SUCCESS. Job steps include unit/security tests, Production migration ledger/release gates, migration runner dry-run, and backend API typecheck.
- Latest Vercel Preview: prior confirmed READY deployment `dpl_53bdk3taSpwNGZzfVy56PcC9CuZe` on commit `e6675514bd14166a368f9f97332154cbf691fc6b`; new documentation/manifest deployment `dpl_7Cm54ojsDyAGCp82sjHEvLAVhqt7` for commit `9aa7f02db9eae553074a8ca1fd11432393f7c14e` was still QUEUED at last check. Prior report confirms homepage and `/api/v1/health` HTTP 200.
- Neon project: `purple-base-63944903`; Production branch: `br-damp-shape-b3xlh4nr`.

## Completed in this execution
- [x] Verified Migration 038 source on validation branch byte-for-byte: SHA-256 `37344eb4794c36cfd8c5b10e85a4f0ee947cd6bd0951bde8c6b8fb94f147c8d5`.
- [x] Applied Migration 038 to Neon Production in a transaction after the same SQL passed on a temporary branch.
- [x] Recorded migration ledger row 38 with filename, exact SHA-256, and status `applied`.
- [x] Re-read Production ledger: row 38 matches the approved filename and SHA-256.
- [x] Published `migration_history_manifest_001_038.json` with 38 verified Production ledger entries.
- [x] PR #1 opened as the delivery workflow. Per explicit owner decision, Git/source reconciliation and historical migration-source recovery are NOT F0 acceptance blockers.
- [x] GitHub Actions run `44320761065` on commit `9aa7f02db9eae553074a8ca1fd11432393f7c14e` completed SUCCESS.
- [x] Verified all six lifecycle functions exist, are SECURITY DEFINER, executable by `app_runtime_secure`, and not executable by PUBLIC.
- [x] Temporary-branch preflight confirmed the same six-function privilege contract before Production apply.
- [x] No account, role, session, or Auth identity was created, deactivated, deleted, or otherwise changed by Migration 038.
- [x] Owner-approved duplicate Admin identity deletion completed on Neon Production: deleted `bugurupuji@googlemail.com` (`392ab975-c4db-4073-bb42-1ff17a0f8f04`) using Neon Auth user deletion.
- [x] Post-delete Production verification: `neon_auth.user` contains exactly one Admin identity, `koenbroto@gmail.com` (`bdd0ac87-3c90-4759-a85b-7e10ccf5803b`); `public.users` retains the matching PKE Admin row, active and linked to that same Auth ID. No PKE user row existed for the deleted email.
- [x] Isolated Neon validation branch `br-cold-breeze-b37rog84`: two synthetic projects and two non-Admin PKE identities created; `app_runtime_secure` verified to have `rolsuper=false` and `rolbypassrls=false`.
- [x] RLS positive isolation: identity A sees only Project A/role A/membership A; identity B sees only Project B/role B/membership B; empty identity context sees zero rows in projects, project_roles, project_members, and users.
- [x] RLS negative write check: cross-project membership INSERT denied by PostgreSQL RLS (`SQLSTATE 42501`). Cross-project UPDATE affects zero rows under identity A.
- [x] Lifecycle SQL exercise on isolated branch: Admin provisioning replay returns the same pending PKE user; preprovision check passes; identity-link event returns `linked` then `already_linked`; global activation/deactivation succeeds; project membership remains active when global account is deactivated.
- [x] Removed unsafe legacy `/api/v1/auth/revoke-session` endpoint, which previously deactivated the global PKE account instead of revoking a provider session; added a regression contract test. Session revocation remains performed through Neon Auth Admin SDK from the Admin UI.
- [x] GitHub Actions run `44326360912` on commit `2016cb740c9ac8bbb409f54bc76713a82f6d571b`: SUCCESS; all listed unit/security tests, migration ledger/release checks, migration dry-run, and backend typecheck steps completed.
- [x] Vercel Preview deployment `dpl_BopPpRGs5sW5s2kEbrTTrG5TDJd7` for commit `728e41a61d8785c81810a0e8fca4e8e67162b4cc`: READY.

## Remaining F0 gates — execute in parallel where safe
| Priority | Work | Acceptance evidence | Status |
|---|---|---|---|
| P0 | Admin Auth and user lifecycle | Owner confirms manual Neon Auth Admin test passes. SQL lifecycle/replay and membership independence pass; cryptographic signature unit tests pass; unsafe DB-only revoke route removed. Do not block F0 on repeating Admin Auth test. | PASS_WITH_OWNER_TEST; webhook event delivery not required as a separate release blocker per owner direction |
| P0 | Prove RLS isolation across two real synthetic projects and two non-Admin identities | Isolated branch positive own-project reads, zero cross-project visibility, no-context denial, cross-project INSERT denial, zero-row UPDATE; anonymous HTTP path and cleanup remain | PARTIAL |
| P0 | Reconcile duplicate Neon Auth Admin identity | Owner approval, exact Auth ID deletion, Production post-delete verification, retained Admin mapping | COMPLETE |
| P0 | Restore dependency audit to non-blocking secure state without unsafe downgrade | Production dependencies: root/frontend `npm audit --omit=dev --audit-level=high` both PASS, 0 vulnerabilities. Dev toolchain: 5 root / 4 frontend HIGH all originate from picomatch GHSA-fc5q-39xc-vjpf with no patched release; do not downgrade Vite/Vitest. Documented compensating control is dev-only exposure and no untrusted glob input; upstream patch/mitigation still OPEN | PARTIAL_UPSTREAM_ADVISORY |
| P0 | Verify Production runtime availability and release health | Vercel Production READY and live API health check | PASS |
| P1 | Fix deployment packaging so runtime/migration metadata is available without shipping excluded SQL files or weakening tests | Preview build + API health checks; migration verification in CI | PARTIAL |
| P1 | Verify secret visibility and environment separation | Vercel targets enumerated without decrypting values. Production DATABASE_URL/JWT_SECRET/AWS/GEMINI/Neon endpoint variables are encrypted; several Vercel entries carry `readable-secret` security issue flags, and Preview Neon endpoint variables are plain. Needs owner-approved reclassification/rotation and a second review; no secret values were decrypted | PARTIAL_SECURITY_REVIEW |
| P1 | Backup/restore evidence | Current Production clone branch `br-wandering-night-b3btbiep` passes 162-table + migration-ledger + core-row-count parity. Neon snapshot schedule API says feature not enabled for this project; snapshot creation blocked by project snapshot limit. A current clone is retained, but automated snapshots/PITR restore evidence requires plan entitlement or replacing the stale snapshot after owner approval. | PARTIAL_PLAN_ENTITLEMENT |
| P1 | Final regression suite and release evidence | GitHub Actions green, Preview READY, HTTP health 200, migration ledger 38/38, security tests pass | NOT STARTED |

## Guardrails
- Production migration 038 is applied. Do not reapply it; verify the ledger/hash before any runner action.
- Do not apply Migration 039+ without explicit approval and a verified SHA-256.
- Do not promote Preview to Production until all P0 gates pass and source branch parity is proven.
- Duplicate Neon Auth Admin identity `bugurupuji@googlemail.com` was deleted after explicit owner approval and verified absent. Retained Admin identity `koenbroto@gmail.com` remains active and linked; do not alter it without separate approval.
- Production Neon Auth webhook and Admin provisioning remain disabled/fail-closed until the Preview provider callback and Admin SDK flow are proven. Never enable production provisioning based only on static tests.
- Do not delete validation/restore-drill branches without explicit owner approval. The branches have expiry windows; record actual cleanup outcome.
- Never expose credentials, tokens, connection strings, or raw secret values in reports or CI logs.
- Never mark a test PASS unless its command/run, target, and result are captured.

## Execution cadence
1. **Immediately:** close remaining live-provider webhook/Auth integration, anonymous HTTP/RLS checks, dependency vulnerability remediation, and release evidence. Synthetic SQL branch tests have passed.
2. **By 2026-11-19 06:00 WIB:** resolve dependency audit and verify Vercel source parity/Preview packaging; latest Preview is READY and source commit is captured.
3. **By 2026-11-19 09:00 WIB:** complete provider integration and anonymous-path RLS tests; capture evidence and obtain approval before deleting validation branch.
4. **By 2026-11-19 12:00 WIB:** run final F0 acceptance review. Mark COMPLETE only if all required gates pass. Otherwise publish the exact remaining external blockers and keep F0 IN PROGRESS.

## Latest execution checkpoint — 2026-11-18 22:48 WIB
- Current source branch head: `2016cb740c9ac8bbb409f54bc76713a82f6d571b` (session-route regression test); API fix commit: `728e41a61d8785c81810a0e8fca4e8e67162b4cc`.
- GitHub Actions run `44326360912`: SUCCESS. Vercel Preview deployment `dpl_BopPpRGs5sW5s2kEbrTTrG5TDJd7`: READY.
- Validation branch `br-cold-breeze-b37rog84` contains synthetic PKE/RLS data and is intentionally retained as evidence; Production was not mutated by these tests.
- F0 remains IN PROGRESS pending only the applicable operational acceptance checks. Git/source reconciliation and historical migration-source recovery are expressly excluded from F0 blockers by owner decision.
- Current recovery copy: branch `br-wandering-night-b3btbiep` (162 tables, migration ledger 38/38) is retained. Attempt to protect this branch was denied because the plan reached its protected-branch limit. Snapshot schedule configuration returned `backup schedule creation is not enabled for this project`; new snapshot attempt previously returned `snapshots limit exceeded`. No Production data/schema mutations were made during clone validation.
- Latest plan commit: `667d4c0be44049875aaa519b3d69f717bc6549ea`; GitHub Actions Unit Tests run `44327644638` and Dependency Audit run `44327644733` both SUCCESS. Production migration ledger row 38 was re-read and still matches SHA-256 `37344eb4794c36cfd8c5b10e85a4f0ee947cd6bd0951bde8c6b8fb94f147c8d5`; Neon Auth Production still contains exactly one Admin identity, `koenbroto@gmail.com`, active and unbanned.
- Vercel Preview remains READY for latest API code commit `728e41a61d8785c81810a0e8fca4e8e67162b4cc`. Vercel status for the latest docs-only commit is FAILURE due platform quota `api-deployments-free-per-day` (HTTP 402, retry after 24 hours), not a build/test failure. No Production deployment was attempted.

## Latest Production migration ledger checkpoint
- Latest applied migration: 038 `admin_managed_neon_auth_user_lifecycle`
- SHA-256: `37344eb4794c36cfd8c5b10e85a4f0ee947cd6bd0951bde8c6b8fb94f147c8d5`
- Verification timestamp: 2026-11-18 22:06 WIB
- Migration 039+: NOT APPLIED


## Latest Production deployment remediation — 2026-11-18 23:40 WIB
- Root cause of the failed Production build was confirmed in Vercel build logs: `tsc: command not found` because root and frontend install commands did not explicitly include build-time devDependencies.
- Fixed `main/vercel.json` in commit `39409a309abbed6abfa05bfa7b01812c5c8a79cc`: `npm ci --include=dev && npm --prefix frontend ci --include=dev`. No application secrets or Neon data were changed by this fix.
- Vercel Production deployment `dpl_4wYnKdHY1X9aLHsBJqBsDXhoXEDv` (commit `39409a309abbed6abfa05bfa7b01812c5c8a79cc`) reached READY. Production alias `https://pke-export-platform.vercel.app` now maps to this deployment.
- Live smoke check: `GET /api/v1/health` returned HTTP 200, JSON status `ok`, database `connected`, environment `production`.
- Vercel Production environment metadata rechecked without decrypting values: `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` all have `visibility=secret`, and all five have empty `securityIssues` arrays.
- Residual observations: deployment build log emitted TS2688 about missing Node type definitions during Vercel's function transpilation, but deployment reached READY and the live API health endpoint passed. Production runtime log recorded a PostgreSQL SSL-mode compatibility warning; health response still reported database connected. Track both for follow-up; neither invalidates the successful deployment/health smoke check.
- This deploy/health check does not close the remaining operational gates (anonymous HTTP behavior, backup/PITR evidence, dependency advisory, and final acceptance review). Git/source reconciliation and historical migration-source recovery are excluded from F0 blockers by explicit owner decision.


## Final technical acceptance review — 2026-11-19 00:55 WIB
### Verified PASS evidence
- Production deployment remains READY: `dpl_4wYnKdHY1X9aLHsBJqBsDXhoXEDv`, commit `39409a309abbed6abfa05bfa7b01812c5c8a79cc`. Previously verified `GET /api/v1/health` returned HTTP 200, `status=ok`, `database=connected`, `environment=production`.
- Vercel Production environment metadata (without decrypting values): all five sensitive variables `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` are Secret, with no `readable-secret` security findings.
- Production migration ledger read-only verification: 38 rows, contiguous IDs; row 38 filename and SHA-256 match Migration 038 `37344eb4794c36cfd8c5b10e85a4f0ee947cd6bd0951bde8c6b8fb94f147c8d5`, status applied.
- Production schema security read-only verification: 152/152 public base tables have RLS enabled; 71 also FORCE RLS; zero public tables without RLS; zero direct PUBLIC table grants; 86 public SECURITY DEFINER functions and zero with PUBLIC EXECUTE; no unvalidated foreign keys.
- Runtime role `app_runtime_secure`: LOGIN only, not SUPERUSER, CREATEDB, CREATEROLE, or BYPASSRLS. No membership granting it a privileged role. Six Admin/identity lifecycle functions are executable by app_runtime_secure and not by PUBLIC.
- Production data counts: one PKE user, active Admin; one Neon Auth user, unbanned; zero projects and zero project memberships. Therefore Production itself cannot demonstrate real multi-project membership behavior; the isolated F0 lifecycle/RLS branch is the evidence for independent per-project role and inactive-membership behavior.
- Latest F0 GitHub Actions after migration ledger correction: Unit Tests run `44340056553` SUCCESS and Dependency Audit run `44340056901` SUCCESS on commit `cd748390877f57e3408d6e7d0dbc515636c7013b`.
- Migration history manifest corrected to 001-038, 38 applied entries, no pending Migration 038. Release-policy verifier and migration runner now point to `migration_history_manifest_001_038.json`, require 38 entries, and fail closed on replay. Intermediate Unit Tests failure run `44340024299` was from the earlier intermediate commit before runner alignment; superseded by the successful run on `cd748390...`.

### Remaining NOT ACCEPTED / BLOCKED gates
- **Owner scope decision:** Git/source reconciliation, PR mergeability/merge status, and historical migration-source recovery (including migrations 029–035) are explicitly NOT F0 acceptance blockers. Do not list them as blockers, condition F0 acceptance on them, or ask the owner to repeat this decision.
- Live anonymous HTTP behavior for `GET /api/v1/projects` was manually verified by the owner and is accepted as PASS; it is not an F0 blocker.
- Backup/PITR evidence is already documented in GitHub and is not an F0 blocker under the owner's instruction.
- Historical migration-source recovery for migrations 029–035 is outside F0 acceptance scope by explicit owner decision; it is not an acceptance blocker and must not be reopened in F0 status reports.
- Development dependency tree retains 5 root / 4 frontend HIGH advisory findings associated with picomatch GHSA-fc5q-39xc-vjpf. Production-only dependency audits pass (0 HIGH). This is a documented development-toolchain risk, not a demonstrated Production runtime vulnerability; upstream remediation remains open.
- Vercel build logs emitted TS2688 for Node type definitions during function transpilation. Added explicit `typeRoots: ["../node_modules/@types"]` to `main/api/tsconfig.json` in commit `31a4012e95aed0db05cacdf70b3642b00745d7fb`, but Vercel reports `build-rate-limit` for that commit, so the fix is NOT yet deployed or verified. Current Production still runs deployment `dpl_4wYn...`.
- PostgreSQL driver emitted a forward-compatibility SSL-mode warning; current health check still reports database connected. No Production connection-string change was made; consider explicit `sslmode=verify-full` only in a separately validated release.
- Neon Auth Admin manual test completed by owner is accepted as PASS; do not re-request or treat it as a blocker. Webhook integration and production enablement are separate from that manual Admin test and remain unproven on Production.

### Final acceptance decision
- **F0 FINAL ACCEPTANCE: role-lifecycle and cross-project database authorization checks PASS on the isolated validation branch.** Owner-confirmed backup and live anonymous HTTP checks are accepted as PASS and are not blockers.
- Remaining technical follow-up: verify the latest API `typeRoots` fix in a successful Vercel Production build; the previous attempt was rate-limited. This is a deployment verification item, not a failed cross-project authorization test.
- No Production database DDL/DML was performed during this acceptance review. No PR merge, migration replay, snapshot deletion, or credential rotation was performed.
- Required owner manual check: open `https://pke-export-platform.vercel.app/api/v1/projects` in a browser session with no PKE login. Expected result is HTTP 401 with `AUTHENTICATION_REQUIRED`; if any project data or HTTP 200 appears, stop and report immediately. If Vercel deployment protection intercepts the request, report that page instead—the app response was not reached.


## Owner scope decision — explicit and binding
- **NOT F0 blockers:** Git/source reconciliation, PR mergeability/merge status, and historical migration-source recovery (including migrations 029–035 or reconstruction of their original SQL).
- These items are excluded from F0 acceptance criteria by the owner's explicit decision. Do not list them as blockers, do not condition F0 acceptance on them, and do not ask the owner to repeat this decision.
- Future F0 reports must assess only the remaining agreed operational acceptance criteria. Any change to this scope requires a new explicit owner instruction.


## Cross-project role lifecycle backtest — 2026-11-18
- Executed on isolated Neon validation branch `f0-rls-lifecycle-validation-20261118` (`br-cold-breeze-b37rog84`), not on Production. All test fixtures were restored to their original state after testing.
- Used database role `app_runtime_secure` for authorization reads and invoked `public.set_rls_context(user_id)` before each test session.
- **PASS — one active account, multiple project roles:** the same account had distinct project-scoped role IDs in Project A and Project B. With the account globally active, RLS exposed A and B only; `pke_has_project_permission(..., 'project.view')` returned true for A and B, false for C.
- **PASS — per-project deactivation:** after deactivating only the account's Project A membership, the account could see Project B only; permission results were A=false, B=true, C=false. Project A membership was then restored.
- **PASS — globally inactive account:** with the account globally inactive, no project rows were visible and permission checks were false for A, B, and C, even though A/B memberships remained active. This is expected fail-closed behavior.
- **PASS — separate identities:** identity A saw only Project A; identity B saw only Project B; neither could view the other project or Project C.
- Fixture cleanup verified: lifecycle account returned to `users.is_active=false`; Project A membership returned to `is_active=true, deactivated_at=NULL`; Project C remains inactive. No Production rows were changed.
- **Cross-project role authorization blockers: none found in this backtest.** This verifies database RLS/function behavior on the isolated branch; it does not by itself prove every frontend/API role-switch workflow end-to-end.


## Vercel build verification loop — 2026-11-19
- Re-read `api/tsconfig.json` on both `main` and `phase0/reconcile-source-20261117`: both contain `module: ESNext`, `moduleResolution: Bundler`, `types: ["node"]`, and `typeRoots: ["../node_modules/@types"]`. No further source revision was indicated by the successful preview build.
- Existing preview deployment `dpl_B3S4kwPYbS5U1WiZoorGPFNpxQwx`, commit `8229f8768d8b7e753afb569594beacc7f132657b`, reached `READY`. Build log confirms `tsc -b && vite build`, frontend Vite build completed, and deployment completed. No TS2688 error appears in the returned build log; build has non-fatal bundle-size and package-install warnings.
- Attempted a fresh preview build for latest documentation commit `9fa6b5f9a7c97312c6056bfc46e40aec3f2824ce`; Vercel rejected creation with HTTP 402 `api-deployments-free-per-day`, retry-after 86400 seconds. This is an external Vercel daily API deployment quota, not a source/build failure. GitHub Vercel status for this commit likewise reports `build-rate-limit`.
- Production remains on `dpl_4wYnKdHY1X9aLHsBJqBsDXhoXEDv` / commit `39409a309abbed6abfa05bfa7b01812c5c8a79cc`; no promotion or Production traffic change was performed. Existing preview build proves the TS config fix compiles in Vercel preview, but a fresh latest-commit / Production deployment verification is still pending quota availability.
- No code change was justified by the successful preview build. Do not change dependencies or TypeScript settings without a reproduced build failure.
- **Current loop result:** preview build verification PASS; latest deployment attempt BLOCKED by Vercel account daily deployment quota. F0 final deployment verification cannot be marked complete until a fresh deployment can be built and verified. No Production database writes were made.


## F1 initial revision checkpoint — 2026-11-19
- F1 begins while the Vercel Production redeploy check for F0 is deferred by the owner until the daily quota recovers. No F0 Production mutation was performed.
- Business contract from the owner: single Admin approves/controls Contract Program; recurring cycle policy is configured by Admin; each Project Instance represents a single buyer obligation/settlement. P01–P13 remain the overall implementation/readiness plan; this checkpoint does not claim all are complete.
- Source review identified missing explicit Admin middleware on four write endpoints: POST /api/v1/contracts, POST /api/v1/contract-programs, PATCH /api/v1/contract-programs/:id, POST /api/v1/cycle-policies. They previously required authentication but not Admin at the HTTP route.
- Added `requireAdmin` after `requireAuth` for all four endpoints in `src/index.ts`. This is an API authorization defense-in-depth change; database RLS remains in force. No schema/migration change.
- Added `src/f1-contract-program-authorization.test.ts` (five static regression assertions) and registered it in the root `npm test` command. CI execution result is not yet verified; do not mark test suite PASS until run evidence exists.
- Scope still to implement/verify in F1: contract approval workflow, recurring-cycle generation, buyer obligation/settlement cardinality, project permission isolation end-to-end, and P01–P13 functional acceptance. Static route protection is not a substitute for runtime E2E authorization tests.
- Git commits: authorization `75bb54cabfb54c00432ae716a8d770db1f522fdf`, regression file `bf83dd71665ceeeec51a80bda11e0948817646b6`, CI test registration `666f514d054265d6ae303d2867ffa137ad423098`.


## F1 mock-data backtest and remediation — 2026-11-19
- Mock-only tests; no Neon Production or real business records were read or changed.
- Backtest fixture set: active Admin, active non-Admin PM, inactive Admin, positive settlement quantities (1, 125.50, 2500), invalid quantities (0, negative, blank, nonnumeric, NaN/Infinity), independent Project A/Project B memberships, one revoked membership, expired membership, globally inactive account, inactive project.
- **Blocker found and fixed:** `POST /api/v1/projects` previously required authentication only. This endpoint could create a Project Instance and optionally create a Contract Program inline, bypassing the explicit Admin-only ownership rule. Added `requireAdmin` after `requireAuth`.
- **Input validation fixed:** Contract Program creation and Project Instance creation now require finite positive target quantities and nonblank name/unit/cadence. Contract Program patch rejects a supplied non-positive/non-finite target quantity. Cycle Policy creation rejects invalid supplied target quantity and requires nonblank cadence/generation mode.
- **Referential-state validation fixed:** Cycle Policy creation now requires an active Contract Program. Project Instance creation using an existing Contract Program now requires that program to be active.
- Added `src/f1-contract-rules.ts` with pure guards for active Admin authority, positive quantity, and project-membership access; expanded `src/f1-contract-program-authorization.test.ts` with mock fixture assertions, five Admin-route source guards, invalid quantity cases, project membership independence/global suspension/expiry cases. Test source uses ESM-safe `import.meta.url` path resolution.
- Commits: `96e51f67647622fc588d3fc71b798374f8fc2f6d` (rules), `6648a1e7e1c8de3e23a36dd35b3cb19423694a04` (API fixes), `e88351628f5f47b141c5ab7d8f95f6d9532acf24` (mock tests and ESM test-path correction).
- **Mock rule backtest expected outcomes:** active Admin can manage; non-Admin and inactive Admin cannot; valid positive quantities accepted; zero/negative/blank/nonnumeric/non-finite quantities rejected; active account retains Project A when only Project B membership is revoked; expired/inactive membership, inactive project, or globally inactive account is denied.
- **Execution evidence limitation:** GitHub Actions workflow run for latest F1 commit has not yet been returned by the connector; Vercel check is currently quota-blocked. Do not claim CI execution PASS until a run ID and successful result are available.
- **F1 blockers still open:** source contains CRUD for Contract Programs and Cycle Policies but no verified recurring-cycle scheduler/generation endpoint, period/obligation identity, idempotency key or uniqueness constraint to guarantee one Project Instance per buyer obligation/settlement period. This cannot safely be invented from the current schema because the business period/settlement identity and cycle catch-up policy are not defined in the inspected code. Also no end-to-end mock/API/database test currently proves a complete approved Contract Program -> recurring cycle -> exactly-one Project Instance flow. F1 remains IN PROGRESS.


### F1 mock backtest execution result — 2026-11-19
- Re-read live GitHub source files after the remediation commits and executed an independent mock-fixture assertion pass against the committed route signatures and matching pure rule logic.
- Result: **24/24 assertions PASS** (5 Admin route middleware guards; 13 role/quantity/project-membership mock cases; 6 source/test wiring checks). No fixture touched Neon or Production.
- Verified route guards: POST contracts, POST contract-programs, PATCH contract-programs/:id, POST cycle-policies, POST projects all require `requireAuth, requireAdmin`.
- Verified mock outcomes: active Admin allowed; active PM and inactive Admin denied; positive quantity accepted; zero/negative/blank/nonnumeric quantity denied; Project A remains accessible when only Project B membership is revoked; expired membership, inactive project, and globally inactive account denied.
- Verified API source contains active Contract Program checks for Cycle Policy creation and Project Instance creation, and PATCH quantity validation.
- **Important distinction:** this was a connector-executed mock assertion/backtest of the committed source and rule behavior, not a successful Vitest/GitHub Actions run. CI remains UNVERIFIED until GitHub reports a run ID and result.
- The remaining business workflow blocker is unchanged: no verified recurring-cycle generation/scheduler or durable period/obligation uniqueness key exists yet to prove exactly one Project Instance per buyer settlement obligation. No speculative implementation was added without the business definition of settlement-period identity and catch-up/idempotency policy.


## F1 owner decision — operational ownership and Cash on Board cycle — 2026-11-19
- **Binding owner decision:** Platform Admin is limited to initial platform/project setup, global configuration, identity/role provisioning, and database foundation/administration. Admin is not the routine operator or approver of buyer contracts, Contract Programs, shipment cycles, or day-to-day Project business data.
- **Project Manager ownership:** the authorized Project Manager owns the correctness and lifecycle of contract details, Contract Program configuration, payment schedule/cycle policy, shipment-level settlement obligations, and operational data for the Project(s) where that PM has an active membership and the required project-scoped permissions.
- **Cash on Board rule:** each shipment is its own settlement cycle within its Project. A shipment must be fully paid before its CoB settlement is considered complete. The contract payment schedule remains the governing contractual rule; it does not create a generic calendar-month Project Instance unrelated to a shipment.
- **Data isolation:** PM permissions must be evaluated against the target Project and active membership; a PM must not manage another Project's contracts/cycles or read/write its business data. Global Admin setup privileges must not be conflated with routine PM business permissions.
- **Implementation consequence:** replace the prior assumption that Admin alone manages Contract Programs/Cycle Policies with project-scoped PM authority. Revisit the current global Contract Program CRUD and Admin-only route guards before implementing generation/idempotency. Database constraints and API authorization must jointly enforce one settlement obligation per shipment per Project, prevent duplicate cycles for the same shipment, and preserve payment-complete gating.
- **Status:** owner decision captured; source/schema implementation and backtest remain IN PROGRESS. No Neon Production schema or business data was changed as part of recording this decision.


## F1 implementation checkpoint — PM-owned contracts and shipment Cash on Board — 2026-11-19
- Owner confirmed the authority split: Platform Admin handles initial platform/Project setup and database foundation; the Project Manager owns contract, Contract Program, payment schedule/cycle, and operational data correctness within the Project(s) where the PM has active membership and explicit project-scoped permissions.
- Business cycle rule: the contractual payment schedule governs; each shipment creates its own Cash on Board settlement cycle in its Project. A cycle is represented by a single payment_obligations row linked to (project_id, shipment_id), not by a generic calendar-month Project Instance.
- Added Migration 039 migrations/039_project_scoped_contract_cob_cycles.sql on feature branch f1/project-scoped-cob-20261119. It adds project ownership to contracts/programs/cycle policies; permits an Admin-created Project shell before PM contract setup; adds composite same-Project foreign keys; enforces one Contract Program per Project and one CoB obligation per shipment/Project; enforces paid status only when amount_paid equals amount; and removes global Admin RLS bypass on contract/program/cycle/payment-obligation business tables. PM-only writes use manage_contract_programs; shipment CoB obligation creation uses existing finance.create and shipping.view project permissions.
- Updated Drizzle project/contract/program/cycle definitions and API: Project setup no longer creates a Contract Program; PM creates/updates contracts and cycle policies with Project-scoped checks; PM attaches the Project's first Contract Program; POST /api/v1/projects/:projectId/shipments/:shipmentId/cob-cycle creates the shipment-linked CoB obligation and maps duplicate shipment obligations to HTTP 409.
- PM role defaults now include the scoped contract, project-link, shipment-read, and finance permissions needed by these routes. Admin role defaults deliberately do not include manage_contract_programs.
- Added F1 tests for PM-vs-Admin authority, active Project membership, positive quantities, full-payment CoB rule, duplicate prevention, and route/database policy wiring.
- Neon schema preparation succeeded on isolated temporary branch br-lucky-meadow-b3i5dizw (parent Production br-damp-shape-b3xlh4nr). Read-only verification confirmed the expected columns, composite constraints, unique indexes, and PM-scoped RLS policies; the pre-existing unassigned Contract Program remains unassigned. No Production DDL/DML was applied.
- Backtest limitation: only read-only schema verification and source-level/mock rule checks are complete so far. No fixture DML was run on Neon due the database tool's explicit approval requirement for writes; GitHub Actions/Vitest execution has not yet been verified. Do not mark F1 complete until CI and a full isolated mock/API/database lifecycle backtest pass.
- Production migration status: Migration 039 is NOT applied. Production remains at Migration 038. Applying Migration 039 requires explicit owner approval of the exact final SQL and SHA-256; temporary migration branches also require explicit cleanup approval through the migration completion action.
- Current F1 branch head at this checkpoint: dc9453b0c68d913cd7d7d8ccd509b4b5da71149a.

### F1 final source/schema review — 2026-11-19
- Final Migration 039 SQL was prepared successfully on isolated Neon branch br-square-violet-b39rl2l1, cloned from Production. Read-only catalog verification passed for all expected FK/unique/check constraints and project-scoped RLS policies.
- Verified final RLS policies use manage_contract_programs for contract/program/cycle writes, which is included in PM defaults and intentionally excluded from platform Admin defaults. Contract read uses contract.view. CoB payment obligation insert/read/update remains governed by finance.create / finance.view / finance.update. The Admin-wide RLS bypass was removed from contracts, contract_programs, cycle_policies, and payment_obligations.
- Verified legacy Production-shaped data is preserved: the existing unassigned Contract Program remains unassigned on the prepared branch. No attempt was made to guess its Project association.
- Independent source/mock structural backtest: **16/16 assertions PASS** covering all contract/cycle/CoB write route guards, PM-vs-Admin default permissions, Admin Project-shell separation, same-Project foreign keys, unique shipment cycle identity, and full-payment check. This is not a Vitest execution or a DML/API end-to-end backtest.
- Pull request #2 opened as Draft: https://github.com/koenbroto25/PKE-Export-Platform/pull/2. Head commit before this plan update: 1907553e3d26b93cb76b84b02ff3be554d3d0e70.
- GitHub workflow runs have not been returned for the PR head. Combined commit status currently shows Vercel FAILURE due account build-rate-limit; this is not a test result. Vitest/typecheck remains UNVERIFIED.
- **Remaining acceptance gates:** (1) successful GitHub Actions Vitest + TypeScript build; (2) isolated runtime/API and database DML backtest with PM Project A vs Project B, Admin denied for contract/cycle business writes, exactly one CoB obligation per shipment, cross-Project FK rejection, and paid-only-at-full-amount; (3) explicit owner approval of final Migration 039 SQL + SHA-256 before Production apply. F1 remains IN PROGRESS.


### F1 isolated Neon DML backtest — Admin RLS bypass found and remediation committed — 2026-11-19
- Owner explicitly approved synthetic DML backtest on the isolated temporary Neon branch only, including cleanup. Neon Production was not touched.
- Tested branch: `br-square-violet-b39rl2l1`, cloned from Production. Synthetic Project A/Project B, PM/Admin identities, Contract Program, Contract, Cycle Policy, and Shipment fixtures were created; all fixtures were subsequently deleted. Read-only post-cleanup counts confirm zero synthetic fixture rows remain; the pre-existing unassigned Contract Program count remains 1.
- Runtime RLS result: PM A sees the one Project A contract/program/cycle row and sees zero Project B contract rows. PM A attempting to insert a Project B contract is rejected by RLS (SQLSTATE 42501).
- **Critical defect discovered:** despite removal of `pke_admin_all`, `pke_has_project_permission()` internally returns true for platform Admin. The original project-scoped policies therefore still allowed Admin to bypass PM/business ownership. This was reproduced with the synthetic Admin identity.
- Remediation committed to the feature branch: migration 039 now explicitly adds `NOT public.pke_is_platform_admin()` to contract, Contract Program, and cycle-policy read/write policies; it replaces all payment-obligation policies with equivalent non-Admin project-scoped finance policies. Added regression assertions to `src/f1-contract-program-authorization.test.ts`.
- Remediation commit: `043d0451f3a6bf76315b28bf116f8b20e3965909` (migration SQL); test update commit follows in branch history.
- Additional observations: duplicate CoB obligation for the same shipment/Project is rejected by unique index `payment_obligations_project_shipment_unique` (SQLSTATE 23505). Payment obligation creation succeeded only as an authenticated unpaid draft. Direct paid-balance updates are intentionally blocked by `pke_block_direct_ledger_mutation()`; reconciliation must use the controlled reconciliation path. Therefore the actual full-payment reconciliation lifecycle remains NOT VERIFIED by this direct DML exercise.
- First DML run attempted to SET ROLE inside a DO block and was rejected by PostgreSQL role membership; no fixtures from that failed transaction persisted. Subsequent tests used the Neon connector's `app_runtime_secure` role directly.
- **Current F1 status: IN PROGRESS / NOT FINAL.** The revised Migration 039 has not yet been prepared/revalidated on a fresh isolated branch. CI/Vitest/typecheck remains UNVERIFIED. No Production migration has been applied. Next steps: prepare the revised SQL on a fresh isolated branch, rerun PM/Admin RLS tests (including Admin denial for contract/program/cycle/payment-obligation reads/writes), cross-Project composite FK rejection and cleanup; run GitHub Actions; then compute and present the exact final SQL SHA-256 for separate Production approval.


### F1 revised Migration 039 — isolated RLS/DML retest — 2026-11-19
- Re-prepared revised Migration 039 from Production on fresh isolated Neon branch `br-plain-glitter-b3pase6u`; preparation succeeded. Previous prepared test branch `br-square-violet-b39rl2l1` was discarded (not applied) and deleted after the approved test/cleanup.
- Retested using `app_runtime_secure` directly after seeding only synthetic Project A/Project B, PM/Admin identities and business rows.
- **PM Project isolation PASS:** PM A reads Project A contract/program/cycle (1 each), sees zero Project B contracts, and cannot insert a Project B contract (RLS SQLSTATE 42501).
- **Platform Admin business-data denial PASS:** Admin sees zero contracts, Project-linked Contract Programs, cycle policies, and payment obligations; Admin INSERT attempts on contracts, Contract Programs, cycle policies, and payment obligations are each denied by RLS (SQLSTATE 42501).
- **CoB cardinality PASS:** PM creates one unpaid draft obligation for shipment A; second obligation for same shipment/Project is rejected by `payment_obligations_project_shipment_unique` (SQLSTATE 23505).
- **Cross-Project reference PASS:** a synthetic obligation pairing Project B with Project A's shipment is rejected by composite FK `payment_obligations_shipment_project_fkey` (SQLSTATE 23503).
- Cleanup verification on test branch: zero synthetic users, projects, contracts, programs, shipments, or obligations remain. Legacy unassigned Contract Program count remains exactly 1.
- Payment balance mutation is additionally guarded by `pke_block_direct_ledger_mutation()`; direct updates are denied even after setting the reconciliation intent flag. Therefore the actual verified reconciliation workflow was not exercised in this DML run. The database full-paid CHECK constraint is present, but the controlled reconciliation path still needs an API/authorized lifecycle test before claiming end-to-end payment completion PASS.
- Corrected the regression-test regex after source review. Latest relevant source commits: migration fix `043d0451f3a6bf76315b28bf116f8b20e3965909`, tests `dbd8bffbb6d2c714a49d6ad2358078e62669ea79` and regex correction `c33f54d9c77ec1038f7b9d62c2d4cc6636e33ef0`.
- GitHub Actions workflow runs remain unreturned for this PR head; combined commit status reports only Vercel build-rate-limit failure. Vitest and TypeScript build are UNVERIFIED.
- Production remains at Migration 038; no Production DDL/DML has been applied. Revised Migration 039 still requires final SQL SHA-256 calculation and separate explicit Production approval. F1 remains IN PROGRESS.

- Final revised Migration 039 SQL SHA-256 (computed from the exact GitHub file bytes via PostgreSQL SHA-256 digest on the isolated validation branch): `2478220b8813c90ab0461ea4e810b663607b57cc43c6728b9cc82647104ea168`. This is a candidate hash for owner review only; Migration 039 is NOT applied to Production.


## F1 Production Migration 039 — applied — 2026-11-19
- Owner explicitly approved application of Migration 039 with SHA-256 `2478220b8813c90ab0461ea4e810b663607b57cc43c6728b9cc82647104ea168`.
- Recomputed SHA-256 directly against the current GitHub migration SQL and confirmed an exact match before apply.
- Neon migration prepared on `br-wandering-hat-b3gnxf3m` from Production branch `br-damp-shape-b3xlh4nr`. Prepared SQL was read-only verified for all target RLS policies, composite FK/check constraints, 152 public base tables and preservation of one legacy unassigned Contract Program.
- Called Neon migration completion with `apply_changes=true`; tool returned `applied=true`, then deleted prepared branch `br-wandering-hat-b3gnxf3m`.
- **Production verification:** 152/152 public base tables still RLS-enabled; 71 FORCE RLS. Migration schema changes/constraints and updated non-Admin policies verified present. The one existing unassigned Contract Program remains unchanged and no project-linked programs are present.
- **Ledger discrepancy:** Production `public.migration_history` read immediately after tool apply still contains rows 1–38 only; Migration 039 row is missing. This Neon MCP prepared-migration apply mechanism applies the migration SQL but does not append the app's custom migration_history entry. Do not mark ledger 39 complete until an approved atomic/controlled ledger recording step is performed. The existing deployment migration runner scripts still only support 036 and the special 038 path; they explicitly reject a new migration 039.
- Updated `migration_history_manifest_001_038.json` on the F1 branch to add an entry 39 with exact approved SHA and applied status. This manifest entry is a release record, not proof of the Production DB ledger row; plan the mismatch explicitly until corrected.
- Additional source fix: Drizzle declarations for Project-scoped composite-FK relations were changed to remove duplicate/competing single-column FK declarations, allowing the migration's composite constraints to represent the canonical project ownership. The previous schema declarations for projects.contract_program_id, contracts.project_id, contract_programs.project_id/contract_id, and cycle_policies.project_id/contract_program_id contained direct references that could generate implicit global single-column FKs.
- Relevant migration source SHA-256: `2478220b8813c90ab0461ea4e810b663607b57cc43c6728b9cc82647104ea168`.
- **Current blockers:** DB migration ledger row 39; payment reconciliation lifecycle E2E (only direct-write blocking and full-payment CHECK have been confirmed); CI/Vitest/TypeScript run still absent from GitHub evidence. F1 remains IN PROGRESS.

 
### F1 Production ledger and migration runner reconciliation — 2026-11-19
- Production `public.migration_history` contains row 39: `039_project_scoped_contract_cob_cycles.sql`, SHA-256 `2478220b8813c90ab0461ea4e810b663607b57cc43c6728b9cc82647104ea168`, status `applied`. The row was added after independently rechecking applied schema constraints and policies; Migration 039 SQL was not re-executed during ledger recording.
- Corrected manifest row 38 to canonical filename `038_admin_managed_neon_auth_user_lifecycle.sql`; row 39 identifies Migration 039. Manifest applied_count and entries are 39.
- Added a fail-closed, verification-only path in `scripts/migrate.mjs` for Migration 039. It checks exact approved 039 source SHA, exact 39-row DB ledger, and manifest ordering, then exits without re-running SQL. Other migration apply rules remain restricted.
- Payment execution API remains explicitly unavailable: GET/POST/PATCH `/api/v1/payment-instructions` return 503 `PAYMENT_EXECUTION_UNAVAILABLE`. Production has instruction, verification, reconciliation tables and ledger triggers, but this repo has no HTTP verification/reconciliation routes. Do not claim end-to-end CoB paid-status lifecycle complete until that critical finance workflow is implemented and tested.

 
### F1 CI release-gate correction — 2026-11-19
- Latest Unit Tests workflow initially passed `npm test` but failed at `verify:release-migrations` before migration dry-run/typecheck.
- Verified the manifest discrepancy against the authoritative Production `public.migration_history`: baseline migration 005 hash in the manifest had a one-character typo. Corrected it to Production's exact SHA-256 `7c7c3d235ff34ac89f626a038589aefa8b2c143ce963b6967c6e2e53433f159d` (also matching immutable baseline manifest and source file).
- Adjusted the release verifier's runner assertion to match the safe optional-chain guard `verifiedManifest.entries?.length !== 39`.
- Dependency Audit workflow run on PR #2: SUCCESS. Latest Unit Tests rerun is pending on the new branch head; prior run had unit tests PASS but failed only at the migration verifier and skipped dry-run/typecheck as a consequence.

 
### F1 release gate and CI routing corrections — 2026-11-19
- Vercel Preview build exposed a packaging-only test issue: `.vercelignore` excludes all `*.sql` files, while the F1 source test attempted to load Migration 039 SQL at module import time. Changed the test to skip only SQL-source assertions when the deployment package intentionally omits SQL; repository CI still runs those assertions because the source file exists there. Other F1 role, route and rule tests continue running during deployment builds.
- GitHub Actions run `44398068572` confirmed `npm test` PASS. The same run then failed in `verify:release-migrations` due to a pre-existing one-character typo for Migration 005 in the Production history manifest. Production ledger and immutable baseline both confirm the correct SHA-256 `7c7c3d235ff34ac89f626a038589aefa8b2c143ce963b6967c6e2e53433f159d`; corrected the manifest without changing Production.
- Updated verifier check to match the actual optional-chain implementation of the runner's Migration 039 verification-only branch.
- Dependency Audit run `44398068260`: SUCCESS (root and frontend production dependency audits passed).
- The Unit Tests and Dependency Audit workflow definitions on the PR base branch `phase0/reconcile-source-20261117` were updated to include pull requests targeting that release branch. This is necessary because GitHub evaluates PR workflow triggers from the base branch; corresponding copies remain in the F1 branch.
- Await the new PR-head workflow results; previous Unit Tests run stopped after the migration verifier failure and did not reach dry-run or API typecheck. Do not mark CI PASS until fresh runs complete.

 
- Vercel test run exposed one additional packaging-related assertion that still read `MIGRATION` when SQL source was omitted: the calendar-period cycle-identity test. Added the same source-availability conditional skip to that assertion. Repository CI continues to execute it with the SQL file present.

 
- Final Drizzle/schema parity review: restored the six single-column references that remain present in Production alongside Migration 039's composite constraints. Delete actions now mirror Production: Project Program pointer cascade, contracts.project cascade, contract_programs project cascade / contract set-null, cycle_policy project/program cascade. This is a source metadata correction only; no SQL or Production changes. Composite same-Project constraints remain in Migration 039.

 
### F1 current blocker accuracy — payment API remains fail-closed — 2026-11-19
- Corrected the three `/api/v1/payment-instructions` HTTP 503 responses. Production does contain payment instruction/evidence/verification/reconciliation tables and guarded DB triggers; the actual gap is that the request/approval/issue/acknowledgement/external execution/evidence/verification/journal/reconciliation HTTP lifecycle is not implemented and end-to-end tested. Removed the inaccurate “No payments table exists in Production” assertion.
- Kept all three API operations fail-closed; no payment instruction, payment reconciliation or obligation paid-status operation was exposed, and no finance permissions were broadened. Added a regression test preventing the stale schema-missing message.
- The CoB route creates one unpaid draft `payment_obligations` record per shipment/Project. The authenticated application cannot yet progress that obligation through payment execution/reconciliation to `paid`; Production triggers prohibit direct paid-balance/status mutation.
- Payment workflow authorization must preserve distinct requester/approver/executor/evidence-verifier/reconciler actors and existing permissions (`payment.request`, `payment.approve`, `payment.instruction.issue`, `payment.evidence.verify`, `payment.reconcile`, `accounting.post`). These permissions are deliberately not granted wholesale to PM by default; owner decision defines PM for contract/cycle management but does not define who performs Finance execution/approval.
 
### F1 validation snapshot — 2026-11-19
- Latest complete GitHub Actions for branch head `fdd6b07340f1606dda2ba3098476389b66204c0d`: Unit Tests run `44399074821` SUCCESS; Dependency Audit run `44399074765` SUCCESS. Unit job steps all passed: npm test, Production migration release verifier (001–039), migration runner dry-run and API TypeScript typecheck. Dependency audit passed root and frontend production audits.
- Production ledger last read: row 39 exactly matches Migration 039 filename/SHA/status applied. Public base tables: 152 total, 152 RLS enabled, 71 FORCE RLS. Legacy unassigned Contract Program count remains 1.
- Isolated DML backtest remains PASS for PM Project A reads/writes vs Project B isolation, Admin business reads/writes denied, one CoB obligation per shipment, duplicate prevention, cross-Project shipment FK denial; synthetic fixtures were cleaned and count checks passed.
- Vercel Preview cannot be produced for the current branch head: deployment API returned HTTP 402 `api-deployments-free-per-day` with a 24-hour retry window (>100 deployments/day). No Production deployment was attempted or promoted.
- PR #2 remains OPEN / Draft / mergeable; no review submissions or inline review threads were recorded. It is intentionally not marked Ready or merged while the authenticated payment execution/reconciliation API remains unavailable and a fresh Preview deployment is blocked by Vercel quota.
- F1 status: **CORE CONTRACT / PROJECT RLS / CoB OBLIGATION IMPLEMENTATION COMPLETE; FULL WORKFLOW NOT FINAL**. Remaining blockers are the guarded Finance payment lifecycle API and Vercel Preview quota. Do not mark F1 COMPLETE until both are addressed and the payment lifecycle is backtested end-to-end.

 
### Finance scope decision and F1 implementation — 2026-11-19
Owner clarified Finance is reporting-only: no bank transfer, payment instruction, payment approval, payment execution, evidence verification or payment reconciliation occurs in this application. Finance prepares/submits financial reports; the Project Manager for that Project and platform Admin receive in-app notifications.
- Replaced the misleading payment execution blocker with explicit out-of-scope behavior: legacy `/api/v1/payment-instructions` endpoints return HTTP 410 `PAYMENT_EXECUTION_OUT_OF_SCOPE`.
- Added `tpl-financial-report` and `POST /api/v1/finance/reports`, which accepts a Project-scoped report payload and period, stores it in `report_runs`, and restricts submitter to an active Finance Project member with `reports.create`.
- Added `GET /api/v1/finance/reports?projectId=...` for Project-scoped report retrieval by `reports.view`.
- Added in-app notifications to all active PM members of that Project and active platform Admin users. Existing user notification read/list endpoints remain in use. Notification writes are separately constrained by the Migration 040 policy to report creators and only PM/Admin recipients.
- Added `reports.create` to default Finance role permissions. No payment execution permissions were added to any role.
- Migration 040 adds report payload and period metadata to `report_runs`, period-order check/index, and the scoped Finance-report notification insert RLS policy.
- Migration 040 exact SHA-256: `3dcba30a1592617e8747f144ed650de5d6af50112c8b105bec62681ddf1b485f`. Source file is on the F1 branch. It has NOT been applied to Production; isolated preparation and DML backtest are pending. Do not apply without owner approval of this exact SHA-256.
- Regression test added for Finance-only submitter, PM/Admin notifications, and payment execution out-of-scope behavior. CI results are pending on the new source head.

- CI first run after the Finance scope update: Dependency Audit PASS; Unit Tests failed only in two stale/over-specific regression assertions (old 503 wording and recipient SQL alias expectation), not in the application code. Updated both assertions to the new 410 out-of-scope contract and actual admin-recipient query. Rerun pending.

- Hardened financial report submission so PM/Admin notification rows are inserted by one set-based SQL statement. The API is executed inside the existing request-scoped PostgreSQL transaction middleware; report insertion and notifications therefore commit or roll back together with the HTTP response.

 
### Finance reporting-only migration validation — 2026-11-19
- Migration 040 source SHA-256 recomputed from the GitHub file: `3dcba30a1592617e8747f144ed650de5d6af50112c8b105bec62681ddf1b485f`.
- Prepared Migration 040 on isolated Neon branch `br-square-darkness-b3g97o4p` (parent Production `br-damp-shape-b3xlh4nr`). Read-only validation confirms the 4 report_runs columns, financial period check/index, Finance report notification insert policy, and existing `reports.create` permission. The single legacy unassigned Contract Program remains 1.
- Migration 040 is NOT applied to Production. Production still at migration 039. The API code requires these columns and RLS policy, so production endpoint activation is gated on explicit owner approval of the exact Migration 040 SHA-256 above.
- CI at source head `639de9e7198899d1142e889c0f9ab40f99d2bbd2`: Unit Tests SUCCESS (tests, migration release verifier, migration runner dry-run, API TypeScript check); Dependency Audit SUCCESS. A later plan-only commit updated the plan after these successful code checks.
- Vercel has accepted Preview deployments for commits `f8e96bb` and `3de57d25` into QUEUED/BUILDING states; no READY preview has yet been verified. Continue to monitor only the latest branch deployment; no Production promotion.
- Final scope: Finance creates/submits Project financial report JSON payload with period metadata; only active Finance Project members may submit. Active PM members and all active platform Admin accounts receive in-app notifications. PM/Admin can retrieve reports via Project-scoped report view. No payment execution endpoints or permissions are implemented; legacy payment-instruction routes return HTTP 410 `PAYMENT_EXECUTION_OUT_OF_SCOPE`.
- Request-scoped database middleware wraps each API request in one transaction, so the report row and set-based notification insert commit/rollback together.


## F1 Finalization checkpoint — 2026-11-19 08:45 WIB
### Binding Finance scope
Owner confirmed Finance is a reporting-only function. Finance users submit Project-scoped financial reports; active PM members in the same Project and active platform Admin users receive in-app notifications. The application does not execute bank payments, issue payment instructions, approve payments, verify payment evidence, or reconcile external payments. These are explicitly OUT OF SCOPE and are not F1 blockers. Legacy payment-instruction routes return HTTP 410 `PAYMENT_EXECUTION_OUT_OF_SCOPE`.

### Migration 040 Production status — verified
- Owner explicitly approved Migration 040 with SHA-256 `3dcba30a1592617e8747f144ed650de5d6af50112c8b105bec62681ddf1b485f`.
- Production branch `br-damp-shape-b3xlh4nr`, database `neondb`: `public.migration_history` row 40 = `040_finance_reporting_notifications.sql`, exact SHA-256, status `applied`; read-only verification returned rows 40, 39, 38, 37, 36 in descending order.
- Read-only schema verification confirmed all four columns `report_payload`, `period_start`, `period_end`, `submitted_at` on `report_runs`.
- Migration 040 was applied to Production after explicit owner approval. No re-execution is permitted.

### Manifest, release verifier and migration runner
- Production history manifest file `migration_history_manifest_001_038.json` was updated to 40 entries, applied_count 40, with row 40 exact filename/hash/status and no pending migrations. (The historical filename is retained to avoid unnecessary path churn; content is the 001-040 ledger.)
- `scripts/verify-migration-release-policy.mjs` now requires exactly 40 ledger entries, verifies Migration 040 source hash and applied status, and checks the migration runner's verification-only 040 path.
- `scripts/migrate.mjs` now has a fail-closed verification-only path for the exact applied 036-040 source set and exact 40-row ledger. It verifies Migration 040 source SHA and manifest/ledger parity, then exits without executing migration SQL.
- Production DDL/DML is not performed by this verifier. Migration 040 must never be replayed.

### Finance API implementation and regression coverage
- `POST /api/v1/finance/reports`: requires active Finance membership in the target Project and `reports.create`; stores the JSON report payload and period metadata in `report_runs`.
- PM/Admin notifications are inserted set-wise within the same request-scoped transaction as the report record; report and notifications commit/rollback atomically.
- `GET /api/v1/finance/reports?projectId=...`: Project-scoped report retrieval subject to `reports.view`.
- Migration 040 RLS policy constrains notification inserts to active PM recipients in the same Project or active platform Admin recipients, with the creator's `reports.create` permission.
- Finance reporting regression assertions are included in `src/f1-contract-program-authorization.test.ts`; latest complete recorded CI before the manifest/runner 040 release-gate edits was Unit Tests run `44421313855` SUCCESS and Dependency Audit run `44421313846` SUCCESS on the then-current application commit. Fresh CI for the 040 manifest/runner edits must be captured before F1 can be declared fully accepted.

### Preview status
- Vercel Preview deployment `dpl_91oDETVm7Babf2QSK5rhTHsgJvKR` for application commit `639de9e7198899d1142e889c0f9ab40f99d2bbd2` reached READY.
- This READY deployment includes the Finance reporting API implementation and regression-test changes, but predates the final Migration 040 release-manifest/runner verifier edits. It is not proof that the latest branch head has a READY Preview.
- No Production promotion or deployment was attempted.

### Final F1 acceptance matrix
| Gate | Status | Evidence / remaining action |
|---|---|---|
| Project-scoped PM contract/program/cycle ownership and CoB uniqueness | PASS | Migration 039 applied; earlier isolated DML backtest passed cross-Project isolation, Admin denial, duplicate CoB rejection, same-Project FK enforcement |
| Finance reporting-only API and notifications | IMPLEMENTED | Finance role guard, report storage, PM/Admin notification insert, retrieval route and out-of-scope payment routes in source |
| Migration 040 Production schema and ledger | PASS | Production row 40 exact filename/SHA/status; four columns confirmed |
| Manifest/release verifier/migration runner 001-040 | IMPLEMENTED; fresh CI pending | Verify via new GitHub Actions after these edits |
| Finance end-to-end DML backtest on isolated Neon branch | PENDING | Must prove Finance submit/report persistence/PM+Admin notifications, non-Finance rejection, Project isolation and rollback; Production must not receive fixtures |
| Latest-head Vercel Preview smoke | PENDING | READY deployment and health/API smoke must correspond to latest branch source; do not substitute earlier commit |
| Production promotion | NOT AUTHORIZED / NOT ATTEMPTED | Requires separate explicit owner instruction |

### F1 status — not yet marked COMPLETE
F1 remains IN PROGRESS until the fresh 001-040 CI checks, isolated Finance DML backtest, and latest-head Preview smoke are evidenced. Do not treat payment execution as a blocker; it is outside the owner-approved Finance scope. Do not promote to Production.


## F1 full mock-data backtest, audit, remediation, retest — 2026-11-19

### Execution environment and cleanup
- Used isolated Neon temporary branch `br-square-darkness-b3g97o4p`, based on Production after Migration 040. Branch creation of a second fresh branch was blocked by Neon branch quota; the existing isolated Migration 040 preparation branch had no prior test data and was reused.
- Created a connected synthetic dataset: 8 mock users (platform Admin, PM/Finance in Project A and B, non-Finance, expired PM, inactive Admin), 2 Projects, 6 memberships, Project roles and permission grants, 1 buyer, 1 Project A contract, 2 Contract Programs, 1 cycle policy, 4 shipments, 3 CoB obligations, 3 financial reports, and 8 notifications.
- Temporary branch was deleted after backtest and final audit. No mock fixtures were written to Production.
- Read-only Production post-cleanup checks: migration history remains exactly 40 rows; no `f1-%@mock.invalid` users, no `F1 Mock Project %` Projects, no mock report IDs; Migration 041 function is absent from Production. Production remains at Migration 040.
- One legacy Contract Program without Project association remained unassigned throughout; count remained 1.

### First backtest findings and remediation
The first Finance notification backtest found real blockers:
1. The notification recipient CTE in the Finance API queried `project_members` and `users` under the caller's RLS context. Finance could not enumerate PM memberships or platform Admin rows, so recipient resolution could return no recipients.
2. Returning notification rows from the INSERT conflicted with recipient-only SELECT RLS. Finance could insert a notification but could not `RETURNING` rows for PM/Admin recipients; the endpoint's notification result handling was therefore not reliable.

Remediation committed to F1 branch:
- `src/index.ts` now calls a narrowly scoped database function `pke_submit_finance_report_notifications(project_id, actor_id, title, message)` after storing the report. It no longer selects recipient memberships in the Finance caller context and no longer uses notification `RETURNING`.
- New `migrations/041_finance_notification_rls_recipient_guard.sql` defines a SECURITY DEFINER recipient predicate and a narrowly scoped notification submission function. The function verifies actor equals `pke_current_user_id()`, requires `reports.create`, verifies active Finance membership and active Project, selects only active PM members of that Project plus active platform Admin users, inserts notifications, and returns the inserted count.
- PUBLIC EXECUTE is revoked; EXECUTE is granted only to `app_runtime_secure`. Function search_path is pinned. Finance cannot use the function to submit for another actor or Project.
- `src/f1-contract-program-authorization.test.ts` now asserts the secure notification function, PM/Admin routing, explicit permission boundary, and removal of notification RETURNING.
- Migration runner now has an explicit Migration 041 apply gate requiring `MIGRATE_041_CONFIRM=1`, exact `MIGRATION_041_APPROVED_SHA256`, and a non-empty owner approval reference. Migration 041 is staged as pending in the verified Production history manifest; it is not marked applied.

### Second backtest after remediation — PASS on isolated branch
- Finance A submitted a Project A report. The report persisted with payload and period metadata; PM A could read it and received a notification.
- Active platform Admin recipients received notifications. In this clone there were two active platform Admin accounts, so the function returned 3 notifications for Project A (one active Project PM plus two active platform Admins).
- Finance B submitted a Project B report; PM B could read the report and received a notification. PM A could not read Project B report or notifications. PM B could not read Project A contract.
- Non-Finance Project member report submission was rejected by RLS. Finance A writing to Project B was rejected by RLS. A forged/non-Finance call to the notification function was rejected.
- Expired PM and inactive Admin were rejected as notification recipients.
- PM B created a Project B Contract Program and linked it to Project B. PM A's Project A data remained isolated.
- PM A created a shipment-linked CoB obligation in unpaid draft state. Duplicate obligation for the same Project/shipment was rejected by the unique index. Cross-Project shipment linkage was rejected by the composite FK.
- Attempt to mark a CoB obligation paid without verified reconciliation was blocked by the payment-obligation guard. The existing full-paid check and unit tests remain in place.
- Invalid report period was rejected by the database CHECK constraint.
- Transaction rollback test: report row was inserted, notification function deliberately failed on actor mismatch, the request transaction rolled back, and the report row count for the test ID was 0.
- Admin's attempt to create a Project contract was denied by Project-business RLS.
- All synthetic fixtures were removed by deleting the isolated branch.

### Latest GitHub CI evidence
Latest F1 source commit at the time of this checkpoint: `c0984cfec18fca204350faa57c7201baf4d4b661`.
- Unit Tests workflow run `44434538650`: SUCCESS. Steps include offline security/unit tests, Production migration ledger/release-gate verification, migration runner dry-run, and backend TypeScript typecheck — all SUCCESS.
- Dependency Audit Evidence run `44434538630`: SUCCESS. Root and frontend production dependency audits and full dependency tree audits — all SUCCESS.
- An earlier Unit Test failure `44434348731` was traced to a stale assertion expecting PM/Admin recipient selection SQL in `src/index.ts`; the assertions were corrected to validate Migration 041 source, and the subsequent run passed.

### Vercel
- Latest-head Vercel check is blocked only by Vercel build-rate/deploy quota (GitHub combined status context Vercel = failure with target URL identifying build-rate-limit). This is the excluded deploy-limit blocker requested by the owner.
- No claim of latest-head Preview READY or latest-head live smoke test is made. Earlier READY Preview deployments belong to older commits.
- No Production promotion/deployment was attempted.

### Production migration state and required owner action
- Production remains at Migration 040, 40 migration history rows. Migration 041 is not applied.
- Exact Migration 041 source SHA-256: `96bf6ea57d68bc9913bc402cadeeb85beee6938a57b9acb9bd13c8d6c5ad2770`.
- Migration 041 is recorded in `migration_history_manifest_001_038.json` as pending with the exact SHA-256. Release verifier checks the exact source hash and pending state; runner requires explicit owner approval before applying.
- Applying Migration 041 to Production is the remaining database blocker for the revised Finance notification endpoint. It requires explicit owner approval of this exact SQL/hash before Production DDL is executed.
- Payment execution remains explicitly OUT OF SCOPE and is not an F1 blocker.
- F1 status: **IMPLEMENTATION AND ISOLATED BACKTEST PASS; PRODUCTION MIGRATION 041 APPROVAL AND LATEST-HEAD VERCEL DEPLOY LIMIT REMAIN. Do not mark F1 COMPLETE until Migration 041 is approved/applied and a latest-head Preview smoke can be completed when Vercel quota permits.**


## F1 authoritative checkpoint — 2026-11-19 (latest verification)
This section supersedes older F1 checkpoints above where their status differs.

### Current source and CI
- PR #2 remains OPEN / DRAFT / mergeable; current PR head is `8ada2d58ac9e33aba4a5b5922f8217f468d83e37` on `f1/project-scoped-cob-20261119`.
- Unit Tests run `44434738685`: SUCCESS (job `unit` completed successfully).
- Dependency Audit run `44434738849`: SUCCESS (job `audit` completed successfully).
- The PR description has been corrected to reflect the actual Production ledger, isolated mock-data backtest, reporting-only Finance scope, and remaining acceptance gates.

### Neon Production read-only verification
- Production branch `br-damp-shape-b3xlh4nr`; latest ledger rows 36–40 were read directly.
- Ledger row 40 is `040_finance_reporting_notifications.sql`, SHA-256 `3dcba30a1592617e8747f144ed650de5d6af50112c8b105bec62681ddf1b485f`, status `applied`.
- Ledger row 39 is `039_project_scoped_contract_cob_cycles.sql`, SHA-256 `2478220b8813c90ab0461ea4e810b663607b57cc43c6728b9cc82647104ea168`, status `applied`.
- Read-only catalog query confirms `public.pke_submit_finance_report_notifications` is absent from Production; Migration 041 has not been applied. No Production DDL/DML was executed in this checkpoint.

### Vercel source-parity check
- Preview deployment `dpl_3EAa6NbpV6mU2gmbsxZdWFBjt4cn`, commit `41b3236147767390c69566a32592981286bc86e3`, reached READY; its root page returned HTTP 200.
- GitHub comparison confirms the current PR head is eight commits ahead of that deployed commit. Those intervening commits include changes to Migration 041, `scripts/migrate.mjs`, `scripts/verify-migration-release-policy.mjs`, `src/index.ts`, and regression tests. Therefore this Preview is NOT latest-head evidence.
- Latest-head Vercel check remains blocked by account quota `api-deployments-free-per-day`; no Production deployment or promotion was attempted.

### F1 acceptance status
- PASS: PM-owned Project-scoped contract/program/cycle authorization and shipment CoB constraints.
- PASS: isolated synthetic dataset backtest, remediation, second backtest, rollback check, and cleanup. Test branch `br-square-darkness-b3g97o4p` was deleted; mock fixtures were not written to Production.
- PASS: current PR-head Unit Tests and Dependency Audit.
- PENDING OWNER APPROVAL: Migration 041 exact SQL SHA-256 `96bf6ea57d68bc9913bc402cadeeb85beee6938a57b9acb9bd13c8d6c5ad2770`. Do not apply until the owner explicitly approves this exact hash.
- BLOCKED EXTERNAL: latest-head Vercel Preview build/smoke due account deployment quota. The older READY Preview is not a substitute.
- Finance remains reporting-only; payment execution is OUT OF SCOPE and must not be reopened as an F1 blocker.
- F1 remains IN PROGRESS. Do not mark COMPLETE, merge, or promote to Production until Migration 041 approval/application and latest-head Preview smoke evidence are complete.


## F1 authoritative checkpoint — Migration 041 applied and Preview remediation (2026-11-19)
This section supersedes prior F1 status entries above where they differ.

### Migration 041 — Neon Production
- Owner approved exact SQL SHA-256: `96bf6ea57d68bc9913bc402cadeeb85beee6938a57b9acb9bd13c8d6c5ad2770`.
- Applied to Neon project `purple-base-63944903`, Production branch `br-damp-shape-b3xlh4nr`, database `neondb`.
- Production ledger now contains 41 rows; row 41 is `041_finance_notification_rls_recipient_guard.sql`, exact approved SHA-256, status `applied`.
- Catalog verification: both `pke_can_receive_finance_report_notification(uuid,uuid)` and `pke_submit_finance_report_notifications(uuid,uuid,text,text)` exist as SECURITY DEFINER with `search_path=pg_catalog, public`; PUBLIC EXECUTE=false and `app_runtime_secure` EXECUTE=true.
- Policy `pke_user_notifications_finance_report_insert` is scoped to `app_runtime_secure` and uses the recipient guard. Production currently has zero existing `finance_report` notification rows; no synthetic data was inserted and the submit function was not invoked against real users.
- SQL tool accepts one statement per call; migration statements were applied individually. The initial multi-command request was rejected before execution. The ledger insert initially hit a stale sequence value, then succeeded with the next explicit sequence-generated ID. Final ledger and catalog checks passed. Record this execution detail for audit transparency.

### Preview latest-head build and regression correction
- A Vercel build on commit `c7385b4f53e248f7100c6e3cd03c008fbdbfff91` failed because deployment packaging intentionally excludes `*.sql`, while one Finance policy test unconditionally read the excluded Migration 041 source and expected its PM/Admin recipient SQL.
- Corrected `src/f1-contract-program-authorization.test.ts`: keep API/Finance scope assertions unconditional, but guard only the migration-source string assertions with `HAS_MIGRATION_041_SOURCE`. Repository CI still includes the SQL file and exercises those assertions; Vercel deployment packaging can now omit SQL safely.
- Fix commit: `9967194c7869da2e86f8030de4a56e051ac07a76`.
- Unit Tests run `44438699683`: SUCCESS. Dependency Audit Evidence run `44438698081`: SUCCESS.
- Vercel Preview deployment `dpl_3uRNAwZUhGoXyjbJhyHfw8ejfxAT`, commit `9967194c7869da2e86f8030de4a56e051ac07a76`: READY. Root page smoke returned HTTP 200 and valid PKE SPA HTML.
- This is the latest code commit before this documentation checkpoint. Because this plan update creates a new branch head, a fresh Preview must be verified against the resulting documentation commit before calling the latest-head gate complete.

### Current F1 status
- PASS: Migration 041 approved/applied and Production ledger/schema/privileges verified.
- PASS: isolated synthetic F1 backtest, remediation, retest, rollback, and cleanup from prior checkpoint; no synthetic Production data.
- PASS: Unit Tests and Dependency Audit on code fix commit.
- PASS: Preview build and HTTP 200 smoke on code fix commit.
- PENDING: final Preview latest-head parity after this plan update commit; do not substitute the preceding Preview.
- Finance remains reporting-only; payment execution remains OUT OF SCOPE.
- Do not merge PR #2 or promote a Production deployment as part of this checkpoint.


## F1 authoritative validation checkpoint — PostgreSQL backtest + CI (2026-11-19)

This section supersedes earlier F1 progress/status statements where they conflict. It records the current execution state. It does not authorize Production migration application or PM appointment decisions.

### Execution guardrails
- Work remained on the existing F1 PR branch `f1/project-scoped-cob-20261119`; no new GitHub branch was created.
- No Vercel deployment/Preview was attempted in this execution.
- Neon Production branch `br-damp-shape-b3xlh4nr` was read-only throughout. Admin retains sole authority over PM appointment, replacement, and duplicate-PM resolution.
- Isolated validation branch: `f1-validation-20261119`, ID `br-noisy-fog-b379k1uu`, parent Production. It is not Production.

### Migrations 042–044 — isolated PostgreSQL execution
- Executed 042, 043, and 044 in one transaction on the validation branch: 53 SQL statements plus 3 migration ledger inserts = 56 statements. The transaction committed.
- Statement parsing preserved quoted strings, comments, and all 8 dollar-quoted PL/pgSQL function bodies; no semicolon-naive SQL splitter was used.
- Validation branch ledger is 44/44.
- Migration 043 backfilled 24/24 legacy Project role memberships and created 24/24 `legacy_backfill` events; missing backfills = 0.
- Existing inactive/deactivated and expired memberships were preserved. The pre-existing two-active-PM state in Alpha was preserved unchanged; no PM was selected or revoked by this work.
- 042 release_reason column exists on validation. 044 permission `project.change.delete` exists and is intentionally not granted to any Project role.
- Migration runner host guard was verified against Neon endpoint inventory: pinned `EXPECTED_HOST` matches the current Production endpoint for `br-damp-shape-b3xlh4nr`. Runner uses direct `client.query(sql)` for complete migration source, preserving PL/pgSQL bodies.

### Database backtest results
PASS on isolated PostgreSQL validation branch:
- Independent multiple-role assignments for one user and permission resolution across two Projects.
- Cross-Project permission leakage denied.
- Past-expiry active assignment rejected.
- Inactive membership, expired membership, and inactive role-template assignment rejected.
- Non-Admin PM assignment rejected; Project Admin PM assignment rejected; Admin PM appointment rejected while duplicate active PMs remain.
- Assignment identity immutability, revoked-assignment immutability, and append-only event UPDATE/DELETE rejection.
- Project Admin runtime role can insert/revoke a permitted non-PM role assignment; database records assigned/revoked events.
- `app_runtime_secure` cannot DELETE role assignments or UPDATE event history.
- Viewer without `project.members.view` sees 0 assignments/events; Project Admin sees 19 assignments and 19 events in Alpha.
- Active PM and active platform Admin pass Finance report notification recipient guard; inactive and expired PM recipients fail.

### Code regression tests and CI
- Added `src/f1-role-assignment-rules.test.ts` and included it in root `npm test`.
- Test coverage includes assignment effectiveness, membership/role/project expiry state, expiry input validation, PM idempotency, exact handover confirmation, duplicate-PM rejection, and API route guard contracts.
- Latest corrected test commit: `4458d83d7e4f0cf40da526f8dd2c5e12a1c72601`.
- Unit Tests run `44543952621`: SUCCESS — 10 files, 141/141 tests; migration release-policy verification; migration runner dry-run; backend API typecheck; frontend typecheck and build all pass.
- Dependency Audit Evidence run `44543952737`: SUCCESS.
- The prior failed test run was caused by a source-contract assertion pointing to the wrong file; it was corrected, and the latest full workflow passed.

### Final validation branch and Production state
- Validation branch after tests: 44 migrations; 26 role assignments (24 legacy + 2 synthetic validation assignments), 27 events, 1 synthetic inactive QA role template. The branch intentionally retains validation fixtures/evidence.
- Production was rechecked read-only after tests: ledger remains 41/41; `project_role_assignments` absent; `inventory_reservations.release_reason` absent; `project.change.delete` absent. No Production schema/data changes were made.
- Production migrations 042–044 remain pending and require separate explicit owner approval of the exact SHA-256 values before any application.

### Remaining acceptance boundary
- PASS: migration package execution/backtest on isolated PostgreSQL; legacy backfill; tested role lifecycle/PM guards; runtime RLS and Finance recipient filtering; 141/141 unit tests; migration release gates; dry-run; backend/frontend typecheck/build; dependency audit.
- NOT RUN: authenticated HTTP API UAT against the validation schema with a signed Neon Auth identity. API routes were source-reviewed and statically regression-tested, but not exercised through live HTTP.
- F1 is **NOT COMPLETE** until authenticated HTTP UAT is performed or the owner explicitly excludes it from acceptance. Do not claim 100% final before that boundary is resolved.
- Vercel/deployment is excluded from this execution by instruction. Do not create a new GitHub branch. Do not apply 042–044 to Production without separate explicit approval.


### Final documentation-head CI confirmation (2026-11-19)
- Audit documentation commit: `c73e225d228affed0859e452d6b3ee619e7174a4`.
- Unit Tests run `44544866720`: SUCCESS; 141/141 tests and all configured migration/release, backend typecheck, frontend typecheck/build steps passed.
- Dependency Audit Evidence run `44544866867`: SUCCESS.
- The following plan/audit-only documentation commits did not alter executable code. No Production DDL/DML or Vercel deployment was performed.


## Production application — migrations 042–044 (2026-11-20)

### Authorization and pre-apply protection
- Owner explicitly requested application of the exact three SHA-256-pinned migrations to Neon Production and asked to skip Vercel deployment.
- Before applying, created a Neon backup branch `pre-f1-042-044-production-backup-20261120` (`br-restless-sky-b38dsjol`) from Production. Verified it captured the pre-apply state: ledger 41/41; assignment tables absent; release_reason absent; project.change.delete absent.
- Neon manual snapshot creation was unavailable because the project snapshot limit was reached. The pre-apply child branch is retained as the restore point; it is not the F1 validation branch.
- Re-read all three migration files from the existing F1 GitHub branch. Applied the complete migration package in one PostgreSQL transaction on Production, preserving dollar-quoted PL/pgSQL bodies (no semicolon-naive splitter). 53 migration SQL statements plus 3 ledger inserts; 56/56 executed and committed.

### Production verification
- Production ledger rows 042–044 now contain the exact approved SHA-256 values and status `applied`; ledger total is 44/44.
- `inventory_reservations.release_reason` exists.
- `project_role_assignments` and `project_role_assignment_events` exist; Production contains 24 backfilled assignments and 24 backfill events.
- Permission `project.change.delete` exists and is not granted to any Project role.
- Role assignment RLS policies are scoped to `app_runtime_secure`; permission resolver functions remain SECURITY DEFINER.
- Existing PM appointments were not changed. Any duplicate active PM state remains for Admin to resolve.
- Vercel deployment was not attempted.

### Remaining UAT and cleanup boundary
- Authenticated HTTP UAT has not yet been run. Neon Auth is Better Auth with email/password enabled but public sign-up disabled. The isolated branch has only the cloned Platform Admin identity and no dedicated UAT mailbox/account. No real bearer JWT was available; no JWT was forged and no Admin credential/session was used.
- To complete the requested authenticated HTTP UAT, provision a dedicated test identity on the isolated branch and obtain its legitimate Neon Auth verification/sign-in token. A mailbox controlled by the owner is required; no password or Admin token should be sent in chat.
- The original validation branch `br-noisy-fog-b379k1uu` is retained temporarily because authenticated HTTP UAT remains outstanding. Delete it only after UAT and final post-UAT evidence are complete. The separate pre-apply backup branch `br-restless-sky-b38dsjol` remains retained as the Production pre-migration restore point.
- F1 database migration acceptance: PASS. Authenticated HTTP UAT: PENDING. F1 overall final acceptance: NOT COMPLETE. Vercel remains intentionally skipped.


## Owner-directed F1 closure and transition — 2026-11-20

### Owner decisions
- Owner confirmed that the application login is working and explicitly waived the separate Neon Auth authenticated-HTTP test for this acceptance cycle. This is recorded as an owner waiver, not as a test execution or test PASS.
- Owner explicitly instructed to skip Vercel deployment. No deployment, preview, promotion, or Vercel environment mutation was performed.
- PM appointment, replacement, and duplicate-active-PM resolution remain exclusively Admin decisions; no PM record was selected or changed by this execution.

### Production migration acceptance
- Neon Production (br-damp-shape-b3xlh4nr, neondb) is at migration ledger 44/44.
- Migrations 042, 043, 044 are applied with the exact owner-approved SHA-256 values recorded above.
- Post-apply schema, ledger, backfill counts, permission grant state, RLS policies, SECURITY DEFINER resolver functions, and app_runtime_secure DML boundaries were verified.
- Unit Tests run 44599494672: SUCCESS. Dependency Audit Evidence run 44599494504: SUCCESS. The unit workflow includes offline security/unit tests, Production migration ledger/release gates, migration runner dry-run, backend API typecheck, frontend typecheck and frontend build. These are CI checks, not live authenticated HTTP UAT.

### Validation cleanup and recovery
- Owner waived the separate Neon Auth HTTP UAT and instructed continuation. Deleted validation branch f1-validation-20261119 (br-noisy-fog-b379k1uu); deletion confirmed by a follow-up branch lookup with deleted branches included.
- Retained pre-apply Production clone/restore point pre-f1-042-044-production-backup-20261120 (br-restless-sky-b38dsjol). It remains a separate backup branch and was not deleted.
- No synthetic fixtures were written to Production. Existing 24 backfilled role assignments/events remain the only data count introduced by migration 043's deterministic legacy backfill.

### F1 disposition and next execution
- F1 database migration and code/CI acceptance: PASS.
- Neon Auth authenticated HTTP UAT: OWNER-WAIVED (not run; not represented as PASS).
- Vercel deployment/latest-head preview: OWNER-WAIVED FOR THIS CHECKPOINT (not run).
- F1 accepted for continuation under the owner's explicit waivers; do not claim either waived test was executed.
- Continue with the next implementation backlog from the existing PKE Master Implementation Plan / phase work, on the existing GitHub production-intended branch and Neon Production only where separately authorized. No new GitHub branch; no Vercel deploy; no PM decisions by the application. Preserve the pre-apply backup branch until the next release checkpoint is safely closed.


## Latest authoritative checkpoint — Migration 047 and repository CI (2026-11-20)

- Production Neon target: project `purple-base-63944903`, branch `production` (`br-damp-shape-b3xlh4nr`), database `neondb`.
- Direct `migration_history` read-back confirms 47 contiguous applied rows, zero pending. Migration 047 filename/hash/status match the owner-approved artifact: `047_project_admin_finance_read_only.sql`, SHA-256 `1ad12527d79db45d4f3a7bd3e6764268679709f2ebec9f2f3c1b902cbc767682`.
- Production permission catalog read-back: Project Admin `finance.view` only (2 grants), no create/update/delete; Finance has view/create/update/delete (2 each); Accounting, Cashier, Funder and PM remain view-only. Database permission guard trigger is enabled. This is catalog verification, not a real-user CRUD UAT.
- Existing GitHub branch remains `f1/project-scoped-cob-20261119`; no new branch was created. Latest code/release-verifier commit `cb863ccbfcdd46e55a188a0b9545caaac7c6096a` passed Unit Tests run `44706857443` and Dependency Audit run `44706856938`. Unit workflow completed offline security/unit tests, migration ledger verifier, runner dry-run, backend/frontend typechecks and frontend build. Reported test total: 14 files / 166 tests PASS.
- Canonical manifest `migration_history_manifest_001_047.json` now has consistent applied-state wording and zero pending migrations. Migration 047 SQL source remains byte-for-byte unchanged because its exact hash is the applied Production artifact; its leading “PREPARED ONLY” comment is stale and documented in the Master Plan rather than edited.
- Historical authentic SQL for migrations 029–035 is still unrecovered. Their reconstruction candidates must not be treated as executable migration sources.
- No Production synthetic business data, role grants, PM decisions, or workflow decisions were introduced. No Vercel deployment/Production promotion was performed; automatic Preview activity remains canceled/skipped per owner instruction.
- Remaining: controlled actual-user Project Admin read-only and Finance CRUD runtime validation. Until that is executed, mark live CRUD UAT as NOT RUN, not PASS. PR #2 remains OPEN / DRAFT and unmerged.


## 2026-11-20 — Consolidated Finance / RLS / document revision handoff

- Active branch retained: `f1/project-scoped-cob-20261119`; no branch created.
- Latest code commit: `0268a3dbb055ac38ecf12fa85c13e5b665342986`; GitHub Unit Tests and Dependency Audit both SUCCESS.
- PR #2 remains OPEN / DRAFT. No merge, Vercel deployment, Neon Production DDL/DML, or synthetic Production business data.
- Revised Buyer master-data authority, global FX/COA controls, Project Finance FX Exposure, Accounting journal permissions, AP/AR APIs and Finance UI, logistics/inventory RLS parity, Project-scoped read endpoints, and document upload checksum verification.
- AP verification deliberately remains blocked until the actual Purchase Order + Goods Receipt + Supplier Invoice three-way matching workflow exists. Do not treat a browser-supplied boolean as a match.
- Prepared Migration 048: `migrations/048_buyer_accounting_ap_ar_document_hardening.sql`, SHA-256 `48eea58270848cc90945cf42972f1a01216e66bb1f6b90c56204b47e877bcdc3`. NOT applied and NOT authorized for Production.
- Open-source evaluation: AIS-catcher (local experimental receiver only; GPL-3.0 and not safety-reliable), MapLibre GL JS (web map renderer), and PostGIS (spatial database extension, subject to Neon test availability). No packages or services installed. Global AIS coverage requires a licensed data feed; source and commercial usage terms must be approved before integration.
- Remaining gates: AP three-way matching, Accounting posting permission assignment, live Finance role-matrix tests, provider-backed Object Storage E2E, cross-Project RLS runtime matrix, PostGIS/Neon compatibility test, and AIS source selection.
- Canonical detailed evidence is in Master Implementation Plan Rev2.35 §56.42. Do not declare F1/PKE complete from CI alone.


## 2026-11-20 — Owner decision recorded: Indonesia-only AIS / Vessel Readiness

- Business objective: support Master of Loading and export operations to prepare product, terminal and export documents before vessel arrival; reduce avoidable vessel waiting and overtime/demurrage-related costs.
- Required vessel-position scope: Indonesian waters only, especially approach areas, anchorages, port limits and relevant loading terminals.
- International voyage position tracking is explicitly NOT a PKE requirement. Buyer/authorized external stakeholders receive vessel identity and approved voyage details plus a verified external tracking link where available. PKE does not ingest global AIS history or warrant third-party tracking freshness.
- The next design is an Export & Vessel Readiness workflow: port-call/ETA milestones, product and stock readiness, quality/inspection, terminal/berth/loading resources, export documentation, readiness checklist, task ownership, due times, notifications, acknowledgements and escalation.
- AIS position is an operational signal only. It cannot automatically mark READY or authorize loading. READY / AT RISK / NOT READY must be calculated from explicit evidence-based checklist rules.
- Evaluate licensed Indonesian coastal AIS coverage against lawful shore receiver/partner coverage. AIS-catcher is only an optional limited pilot; it is not a national coverage guarantee. No package, hardware, provider subscription or infrastructure has been installed or purchased.
- MapLibre and PostGIS remain optional candidates; PostGIS requires isolated Neon compatibility testing.
- Acceptance gates and detailed scope are in Master Implementation Plan Rev2.36 §56.43.
- No Neon Production changes, Vercel deployment, or business data mutation were performed for this decision.


## 2026-11-20 — Owner-approved direction: role dashboards, PM Control Tower and selective open-source

- Owner agreed with the proposed development direction: PM is the operational controller for each Project; Admin App supports system governance and may explicitly appoint themself as PM.
- PM determines the Project's required operational roles, assigned people and responsibility split. One account may hold multiple roles in one Project (e.g. Accounting + Finance) and a different role combination in another Project. Assignments remain Project-scoped and permission resolution remains governed by the approved role/permission catalog and backend RLS.
- PM needs a consolidated Control Tower: all Project milestones, readiness, role task queues, overdue/blocked work, critical alerts, document/LC readiness, loading target-vs-actual, laytime/demurrage risk, decisions and instruction follow-up.
- Each role needs a task-first dashboard with My Work, Needs Attention, Upcoming, its operational workbench, evidence/documents, progress/exceptions and actionable notifications. Role-specific alerts must be filtered by responsibility and effective Project permissions; PM receives the overall report.
- Initial role/work-area discovery covers PM, Project Admin, Contract/Commercial, Procurement, Warehouse/Inventory, Quality/Survey, Master of Loading/Operations, Logistics/Trucking, Vessel/Port/Agent, Export Documentation/Shipping, Finance, Accounting, Cashier/Treasury, Funder, Buyer/external stakeholder and Platform Admin. This is a discovery baseline; validate against the actual repository role catalog and mark implemented/partial/missing.
- Build PKE-native capabilities for Project authority, roles/permissions, workflows, task assignment, notifications, audit, export readiness, laytime/loading, LC compliance and authoritative finance/accounting data.
- Prefer selective reusable components: Recharts (MIT) for charts and TanStack Table (MIT) for data tables are initial candidates. MapLibre and PostGIS remain optional for maps/geospatial work subject to earlier AIS scope and Neon compatibility checks.
- ERPNext and OpenProject are benchmarks, not approved parallel systems. Superset/Metabase are possible later read-only BI candidates only after Project-level isolation and license review. Documenso is optional for appropriate signature workflows only; it does not replace official export documents. AGPL/GPL license obligations must be reviewed before integration/embedding/modification.
- No open-source package, external application, BI server, workflow engine, cloud service, paid API, hardware, subscription or new infrastructure was installed or purchased. No Neon Production migration/data mutation or Vercel deployment was authorized or performed by this discussion.
- Next work: inspect current role catalog, schema, APIs and pages; produce a verified role-responsibility-permission-task-dashboard-notification matrix; map end-to-end contract-to-LC-payment workflows; identify gaps; draft PM and role dashboard specs; score candidate libraries/tools for fit, license, security, maintenance, compatibility, cost and exit risk.
- Detailed accepted design baseline: Master Implementation Plan Rev2.37 §56.44.


## 2026-11-20 — Read-only repository discovery: role UX and PM Control Tower

- Audited existing branch `f1/project-scoped-cob-20261119`; no new branch.
- Verified multi-role persistence is already present from Migration 043: `project_role_assignments`, append-only assignment events, effective-permission resolver, assignment/revoke API routes and `/projects/:projectId/my-permissions`. PM appointment remains a separate Platform Admin decision.
- Important frontend gap: `RoleGuard` can union page access from Project role assignments, but the sidebar still uses only `activeUser.role` and the hard-coded `roleAccess` map. Thus multiple Project roles may pass a route guard but fail to expose all corresponding navigation items. FinancePage already uses `my-permissions` for action visibility; generalize the server-derived effective-permission approach.
- Canonical templates exist in `src/role-catalogue.ts`, but the legacy database role catalog and frontend static role map are not yet one coherent source of truth. Legacy aliases include `loading_manager` for canonical `master_of_loading`; do not perform unsafe role renames.
- Main active UI is concentrated in `frontend/src/App.tsx`. Separate component files AdminDashboard, FieldDashboard, FinanceWorkspace, NotificationCenter, ProjectSelector and WarehouseReceiptForm inspected in `src/components` are placeholders, not completed dashboards.
- DashboardPage is currently a portfolio summary and truck-checkpoint feed, not a PM Control Tower. OperationsPage already provides useful truck, receipt, inventory, reservation/hold/movement and shipment-allocation workflows. FinancePage provides RAB, FX and AP/AR surfaces.
- Notification inbox currently supports list and mark-read. API has list/create/read routes; email/SMS/WhatsApp providers report not configured. Full acknowledge/assign/resolve/escalate/dedupe/PM rollup is not demonstrated by the inspected UI.
- Existing schema/API foundations include contract programs, shipment CoB, AP/AR, cash advances, journals/FX, inventory, warehouse receipts, truck tracking, shipment allocations, document requirements/storage, reports and notifications. A complete vessel-call/loading-plan/shift/laytime workbench and LC-specific discrepancy/presentation workflow were not established by this source inspection.
- Role discovery matrix and prioritized gaps are recorded in Master Implementation Plan Rev2.38 §56.45.
- Priorities: (P0) effective-permission navigation and role chips; multi-role assignment UX; PM Control Tower; actionable PM/role notifications. (P1) role workbenches, loading/laytime planner, export document/LC compliance, source-linked reports.
- Open-source decision: do not install ERPNext/OpenProject or BI servers now. Keep Recharts/TanStack Table as optional UI candidates; MapLibre/PostGIS remain conditional on the Indonesian AIS/geospatial use case and isolated Neon tests; Superset/Metabase require strict Project isolation and license review; Documenso is not an official export-document issuer.
- No package/application/service/hardware/subscription installed or purchased; no Production DDL/DML, synthetic Production data or Vercel deployment. This was read-only source discovery, not live HTTP UAT, browser test, or runtime role-matrix pass.

---

## 2026-11-20 — P0 effective-permission UX implementation

- Implemented `frontend/src/role-permissions.ts`; sidebar navigation and route guards consume the selected Project's server-resolved `/projects/:projectId/my-permissions` result instead of inferring access from one global `activeUser.role` or a hard-coded role map.
- Multiple active Project role assignments are combined by the existing database permission resolver for the selected Project. Switching Project invalidates the previous permission set while the new result loads; permission-fetch errors fail closed.
- Project Admin Finance visibility remains based on `finance.view`; no Finance mutation or approval authority is inferred. Existing Finance action controls and backend/RLS authorization remain independent.
- Project list remains available to active Project members before Project selection; notifications remain self-inbox scoped. Other Project workspaces require an explicitly selected Project. Platform Admin remains a separate platform-level bypass.
- Sidebar now renders the Stakeholder navigation group and summarizes active role assignments for the selected Project. Dashboard no longer calls the Platform-Admin-only portfolio endpoint for ordinary Project users; Finance budget is not fabricated and is shown as unavailable.
- Added unit coverage for permission union, Project Admin Finance read-only visibility, no cross-Project permission carry-over, fail-closed loading/error states, Platform Admin separation and inactive membership.
- Frontend authorization UX only: no database permission, RLS, role assignment, Production data, migration or deployment changes.
- Validation status: pending GitHub Actions on the implementation commit; no runtime HTTP UAT or browser acceptance is claimed until separately executed.

- Permission-map refinement: `finance.view` alone does not expose Payment Instructions or Funder workspace. Payment Instructions requires the explicit `payment.view` capability; Funder requires `funder.view`. This avoids treating Finance read-only visibility as payment/funder workflow authority.
- Added regression coverage for this separation. The latest CI run after this refinement is pending.
- Follow-up scope hardening: dashboard logistics/tracking requests are issued only when the selected Project grants `logistics.view` (or the user is Platform Admin); project summary rows/volume are filtered to the selected Project. Any non-empty server-resolved Project permission set can open the generic landing dashboard, including domain-specific roles such as PKS Site Manager.
- CI correction history: initial source tests passed but an older source-contract assertion still expected `projectRoleKeys`; that assertion was updated to the server-resolved permission adapter. Frontend TypeScript then exposed optional-identity typing issues, which were corrected. Latest full CI after these refinements is pending.
---

## 2026-11-20 — PM Control Tower role/workflow matrix and API gap reconciliation

- Added `docs/design/PM_CONTROL_TOWER_ROLE_WORKFLOW_MATRIX_20261120.md` with an individual work contract for all 34 canonical roles, current API/schema evidence, end-to-end Project workflow hand-offs, PM Control Tower information architecture, proposed task/notification model and acceptance criteria.
- The matrix explicitly separates implemented, partial, missing and proposed capabilities. It does not claim role templates are live Production grants or that source declarations are runtime UAT.
- Confirmed important permission/API mismatches: CoB cycle creation is `finance.create`-gated while PM lacks that permission; shipment allocation GET/POST use `shipping.view`/`shipping.update`; Checker has `verify_checkpoints` but tracking-event POST currently requires `record_truck_trips` for non-receipt events; Procurement buyer/vendor reads require `finance.view`; Accountant template lacks `accounting.update` for journal posting.
- Recorded static/placeholder role portals, composite OperationsPage permission leakage, missing transport-leg endpoint dependency, out-of-scope payment instructions, absent Funder-specific permission/workbench and mixed Admin/Project Compliance data surfaces.
- Frontend navigation/route alignment was tightened for Accounting Journal, Payment Instructions, Shipment Allocations and external role portals. No new backend permission grant or database change was made.
- CI was fully green on source commit `4d7e3811ddba54f196ad3d0190aec783c0007b41`: 194/194 tests, backend/frontend TypeScript, frontend build, migration ledger verifier, migration dry-run and dependency audit all passed. Later permission-map refinements and the new matrix document are subsequent commits; their CI is pending and must be checked before declaring the current HEAD green.
- Next implementation sequence: (1) complete permission-aware panel/action gating in OperationsPage and CompliancePage; (2) resolve CoB/Checker/Procurement permission mismatches with explicit owner decisions; (3) implement Project task/instruction engine and PM read model; (4) wire real role workbenches only where data/API exists.
- No Neon Production mutation, migration, mock data, package installation or Vercel deployment was performed. PR #2 remains OPEN/DRAFT.
- **CI confirmation (source commit `66d6568d6edf4b546dd9bd1cabc9359c167e382e`): PASS.** Unit Tests 196/196 across 17 test files; backend TypeScript PASS; frontend TypeScript PASS; frontend production build PASS; Production migration ledger verifier PASS; migration runner dry-run PASS; Dependency Audit Evidence PASS.
- This CI result validates source/build/static gates only. It does not replace authenticated browser UAT, live multi-user permission isolation tests, or runtime verification against Neon Production. No Production DB or deployment action was taken.
- External portal visibility was further narrowed: Buyer requires `buyer.shipment.view`; Supplier requires both `supplier.view` and `shipment.view`; Transporter/Driver require both `record_truck_trips` and `verify_checkpoints`. PM `logistics.view` alone no longer exposes the Transporter portal. Checker remains a separate unresolved API mismatch: it has `verify_checkpoints` and `operations.view`, but tracking-event POST currently requires `record_truck_trips` for non-receipt events.
- **Latest source CI (commit `8ed5ce3a860bf5f6c91b69271e48699685174f51`): PASS.** 196/196 tests across 17 files, backend/frontend TypeScript, frontend build, migration ledger verifier, migration dry-run and Dependency Audit Evidence all passed. Browser UAT and live multi-role runtime tests remain pending.
---

## 2026-11-20 — P0 Action-level UX, Task Engine & PM Control Tower implementation

### Source implementation
- Added action-level checks and permission-aware data loading for Operations and Compliance panels. Inventory receipt/lot/reservation/hold/movement, shipping allocation, logistics and document actions are independently gated; no action is exposed merely because a page is visible.
- Operations forms are locked to the explicitly selected Project. The frontend no longer queries `/projects` to populate cross-Project form selectors. New truck-trip creation remains hidden because the source still has no verified transport-leg read endpoint; no synthetic transport-leg IDs are used.
- Checker checkpoint creation now uses `verify_checkpoints` in the API, and Migration 049 replaces the tracking-event insert policy to allow only `event_type='checkpoint'` under that permission. Other trip lifecycle events continue to require `record_truck_trips`.
- Project creation is Platform Admin-only and now creates a Project shell without a Contract Program. Contract Program creation is gated by `manage_contract_programs`; the PM/Contract Manager attaches commercial setup after Project provisioning.
- Project detail/edit/configuration, role and membership routes now have distinct permission gates. Platform-wide account provisioning, global account status, password reset, role catalogue and PM appointment are separated from Project membership/role administration. PM appointment remains Platform Admin-only.
- Finance exposure and FX-rate forms are gated by Finance create / Platform Admin authority. Journal draft/line creation and posting are separated (`accounting.create` versus `accounting.update`). Shipment allocation create/reversal requires `shipping.update` and inventory read access. Cash Advance request/decision handlers enforce the server-returned request/approval capabilities.
- Added `hasProjectPermission` and `hasAnyProjectPermission` fail-closed helpers. Project Admin remains Finance read-only; no Finance mutation or approval capability was added.

### Project Task & Instruction Engine
- Added `project_work_items` and append-only `project_work_item_events` in prepared Migration 049, with forced RLS, explicit table grants, no app-runtime DELETE, same-Project foreign keys and active-role/assignee visibility.
- Added task permissions `project.tasks.view/create/assign/update/resolve/escalate`; Project-wide governance is granted only to canonical PM role records. Assigned users see tasks only while their active Project role remains valid; an explicit assignee further narrows visibility to that user.
- Added Project-scoped GET/POST/PATCH APIs for work items and event history. Creation/reassignment validates an active role and active assignee. State transitions cover open, acknowledged, in progress, blocked, submitted, resolved, closed, reopened, cancelled and escalation/comment events.
- Assignment/reassignment sends in-app notifications to the selected user or active role. Blocked/submitted tasks notify PM; PM resolution/closure notifies the owner. Notifications include `work_item_id` and deep-link to My Work; read status is separate from task acknowledgement.
- Added My Work UI for PM task creation/assignment, role queues, acknowledgement, start, block, submit, PM resolve/close/reopen, comments, escalation and append-only history.
- PM Control Tower now includes task totals, overdue, blocked and submitted-review counts plus source-backed readiness indicators for contracts/programs, warehouse lots, truck trips, export document requirements/documents and RAB. Production/QA release, vessel/loading/laytime and LC presentation are explicitly marked unavailable rather than inferred.

### Migration approval and release boundary
- Migration 048 `048_buyer_accounting_ap_ar_document_hardening.sql` SHA-256: `48eea58270848cc90945cf42972f1a01216e66bb1f6b90c56204b47e877bcdc3`.
- Migration 049 `049_project_work_item_task_engine.sql` SHA-256: `4d4cd7a877665986f10c3068ba8dd86332eff8c22b00214d45a45806fac276a8`.
- Both migrations are prepared and listed as `manifest=absent` in the dry-run. They must be approved and applied sequentially (048 before 049); neither has been applied to Neon Production. The applied Production ledger remains through Migration 047.
- No Production mock data, migration application, Vercel deployment, package installation, branch creation, PR merge or external open-source installation was performed.
- Source CI for the latest implementation is pending at the time of this documentation update. Earlier P0 baseline commit `8ed5ce3a860bf5f6c91b69271e48699685174f51` passed 196/196 tests and all static/build gates; this does not certify the new Task Engine runtime.

### P0 completion gate
- Source implementation is in place, but P0 is **not declared Production-complete** until current HEAD CI is green, exact migration approvals are received, 048/049 are applied in order, and authenticated multi-role/multi-Project runtime UAT passes.
- Required UAT: PM creates and reassigns tasks; active role members see only role-scoped work; explicit assignee isolation; expired/revoked role loses access; PM-only resolution; notifications to PM/owners; task event immutability; Checker checkpoint versus trip-event permission; Project Admin Finance read-only; and cross-Project isolation.
- Project timezone/SLA calendar and scheduled overdue escalation remain explicit follow-up design items. Current overdue visibility is computed on read and escalation is a deliberate user action, not a background scheduler.
### CI confirmation — source commit `fc25624ec288189bc1f33ece374422667c28d982`

- Unit Tests: **213/213 PASS** across 18 test files.
- Backend API TypeScript: PASS.
- Frontend TypeScript: PASS.
- Frontend production build: PASS.
- Production migration ledger/release verifier: PASS; baseline 001–028 and verified Production history 001–047 are contiguous. The verifier retains the notice that authentic SQL for historical migrations 029–035 remains unrecovered.
- Migration runner dry-run: PASS; no database connection attempted and no database changes made. Migrations 048 and 049 are reported `manifest=absent` and remain unapproved for apply.
- Dependency Audit Evidence: PASS (root and frontend production dependency audits).
- PR #2 remains OPEN / DRAFT. CI validates source/static/build gates, not authenticated browser UAT or runtime RLS integration.
### P0 follow-up audit — CI green and final RLS correction (2026-11-20)
- A second source audit found that the task notification INSERT policy did not authorize the PM's `project.tasks.resolve` permission. PM resolution/closure could therefore fail when notifying the task owner. Migration 049 was corrected to allow the resolver permission; a regression assertion was added.
- The transport-leg read API was also tightened: `projectId` is mandatory and `logistics.view` is required; the unscoped cross-Project read path was removed. Operations now loads actual transport legs for the selected Project and restores trip creation only for `record_truck_trips`. Trip submission remains disabled when no real transport leg exists; no sample IDs or mock rows are introduced.
- Latest confirmed CI on PR #2 head `b5a890f5cc31ff7c2ce8c18080ad1df242da1a4f`: **214/214 tests PASS** (18 files); backend/frontend TypeScript and frontend production build PASS; Production migration ledger verifier PASS; migration dry-run PASS; dependency audit PASS.
- Latest dry-run exact hashes: Migration 048 `48eea58270848cc90945cf42972f1a01216e66bb1f6b90c56204b47e877bcdc3`; Migration 049 `c2e5f39ededab7af1d931808218fe958654f7f16b49d795dd51db60846545f5d`. Both remain `manifest=absent`, require explicit approval, and were not applied.
- No Neon connection was attempted; no backup, SQL apply, production data, Vercel deployment, GitHub branch creation, merge or mock-data insertion was performed in this pass.
- Remaining P0 release gate: explicit approval and sequential application of 048 then 049 after a verified Production backup, followed by authenticated multi-role/multi-Project runtime UAT. Static CI is not runtime RLS evidence. PR #2 remains OPEN/DRAFT.

---

## P0 final source audit correction — 2026-11-20

- Current source branch remains f1/project-scoped-cob-20261119; no GitHub branch was created and PR #2 remains unmerged.
- Re-read Neon Production public.migration_history: exactly 47 contiguous rows, Migration 047 applied with SHA-256 1ad12527d79db45d4f3a7bd3e6764268679709f2ebec9f2f3c1b902cbc767682.
- GitHub Actions for source/documentation head 3d4616a09005badf9035b0ff98cab1e03b4419da: Unit Tests SUCCESS and Dependency Audit SUCCESS; every reported job step completed successfully. This evidence predates the SQL/runner/test corrections in this checkpoint and must not be reused as current-head CI.
- Corrected Migration 049's malformed PostgreSQL anonymous-block delimiter from DO $ ... END $; to DO $$ ... END $$;.
- Corrected final Migration 049 SHA-256: f61edb6ee54d7294a13cfd0a7319c4dee03299f718a3efdb6805081a50df2780. Updated the hard-coded approved049Sha in scripts/migrate.mjs to match. Migration 048 remains pinned to 48eea58270848cc90945cf42972f1a01216e66bb1f6b90c56204b47e877bcdc3.
- Added regression coverage in src/project-work-items.contract.test.ts for SQL delimiter validity, final 049 checksum pin, and the exact 048/049 owner-approval and backup-reference gates.
- Important: GitHub dry-run does not connect to PostgreSQL or parse/execute the migration SQL. CI static tests are not PostgreSQL migration execution or runtime RLS UAT.
- Existing Neon recovery branch br-restless-sky-b38dsjol is pre-migration 042–044 and is not a current backup of Migration 047. Snapshot creation did not produce a new snapshot. Do not apply 048/049 until a verified current Production backup is available.
- **Current P0 status:** source correction committed; awaiting CI on the corrected head. Migration 048/049 remain unapplied. Authenticated multi-role/multi-Project RLS UAT remains outstanding. No Production data mutation, Vercel deployment, PR merge, or new GitHub branch.


### P0 migration dry-run checksum enforcement — 2026-11-20

- Added a fail-closed dry-run gate in scripts/migrate.mjs: both prepared SQL files must exist and their byte-level SHA-256 must match the pinned release hashes before dry-run can pass. This remains offline and makes no database connection.
- Migration 048 pin: 48eea58270848cc90945cf42972f1a01216e66bb1f6b90c56204b47e877bcdc3.
- Migration 049 pin: f61edb6ee54d7294a13cfd0a7319c4dee03299f718a3efdb6805081a50df2780.
- The task-engine contract test now computes the actual Migration 049 file SHA-256 using Node crypto and asserts the corrected PostgreSQL DO-block delimiter and release-runner pin.
- Await CI on the latest source head. This does not grant permission to apply either migration; backup and explicit exact-hash approvals remain prerequisites.


### Final source CI acceptance — 2026-11-20

- Source commit: aec2c683a8b4b0825b351541b1300dd0b147d7e5.
- Unit Tests run 44742140799 and Dependency Audit Evidence run 44742140665 both completed SUCCESS on source commit aec2c683a8b4b0825b351541b1300dd0b147d7e5. Unit Tests: 215/215 across 18 files; migration release verifier PASS; fail-closed migration dry-run PASS with exact 048/049 hashes; backend/frontend TypeScript PASS; frontend production build PASS; Dependency Audit PASS.
- Exact dry-run SQL hashes: Migration 048 48eea58270848cc90945cf42972f1a01216e66bb1f6b90c56204b47e877bcdc3; Migration 049 f61edb6ee54d7294a13cfd0a7319c4dee03299f718a3efdb6805081a50df2780. Both remain manifest=absent / prepared only.
- Dry-run explicitly confirms no DB connection and no database changes. Production ledger remains 47/47.
- P0 source implementation and CI gate: PASS. P0 Production activation remains BLOCKED by unavailable current backup, exact owner approvals for both migrations, and authenticated multi-role/multi-Project runtime UAT. No Production writes, Vercel deployment, PR merge or new GitHub branch.


### P0 Production execution — 2026-11-20 (final DB checkpoint)

- Neon project: `purple-base-63944903`; target branch: `production` (`br-damp-shape-b3xlh4nr`). No GitHub branch was created; execution remained on `f1/project-scoped-cob-20261119`.
- Pre-migration backup branch created from Production: `p0-pre-048-049-production-backup-20261120` (`br-steep-butterfly-b30wgjc3`), status `ready`, parent LSN `0/5F05C88`, parent timestamp `2026-11-20T13:15:05Z`. It was created before Migration 048 and 049. Backup branch is an unprotected Neon branch because the account reached its protected-branch quota; manual snapshot creation was also rejected because the snapshot quota was full. Do not describe this as a manual snapshot or a protected backup.
- Independently rechecked the entire pre-migration Production ledger: 47 rows, contiguous IDs 1–47, exact match to `migration_history_manifest_001_047.json`, including Migration 047 SHA-256 `1ad12527d79db45d4f3a7bd3e6764268679709f2ebec9f2f3c1b902cbc767682`.
- Applied Migration 048 `048_buyer_accounting_ap_ar_document_hardening.sql` in one transaction with its ledger insert. SHA-256: `48eea58270848cc90945cf42972f1a01216e66bb1f6b90c56204b47e877bcdc3`. Post-apply checks confirmed ledger row 48, `inventory_holds`, forced RLS, INSERT policy, AR buyer-master column, and project-permission function.
- Applied Migration 049 `049_project_work_item_task_engine.sql` only after Migration 048 was verified, in a separate atomic transaction with its ledger insert. SHA-256: `f61edb6ee54d7294a13cfd0a7319c4dee03299f718a3efdb6805081a50df2780`.
- Post-apply Production ledger: 49 rows, ordered tail 047/048/049 with exact hashes and `applied` status. No replay or duplicate ledger rows.
- Database structural/security checks passed: task and event tables exist with ENABLE + FORCE RLS; active-role function exists and is SECURITY DEFINER; six task permissions are active; runtime grants permit SELECT/INSERT/UPDATE on work items but not DELETE; event grants permit SELECT/INSERT but not UPDATE/DELETE; PM roles have all six task permissions; non-PM roles have zero task permissions; Project Admin role has Finance `finance.view` only and no Finance mutation grants.
- No business/test/mock rows were inserted. Because the Production database has no seeded operational users/projects for end-to-end role scenarios, authenticated multi-user RLS/workflow UAT remains outstanding; metadata checks are not a substitute for positive/negative runtime UAT. Vercel was not deployed and PR #2 was not merged.

- CI confirmation for the source/docs head that records this checkpoint: PR #2 Unit Tests run `44744075411` SUCCESS (18 files, 215/215 tests; migration release verifier, migration dry-run, backend TypeScript, frontend TypeScript and frontend production build all PASS); Dependency Audit run `44744075357` SUCCESS. These are source/static/build gates, not authenticated multi-user runtime UAT.
- Backup integrity limitation: Neon created the branch clone and exposed its parent LSN/timestamp, but snapshot quota was full and no independent pg_dump/export checksum was available from this session. The branch clone is retained as the pre-migration restore point; it is not represented as a checksummed SQL archive.


### P0 follow-up blocker — legacy inventory_holds schema alignment (2026-11-20)

- Post-Migration-048/049 catalog inspection found that `public.inventory_holds` pre-existed with legacy required columns `hold_type, quantity, unit_code, placed_by, placed_at`. Because Migration 048 used `CREATE TABLE IF NOT EXISTS`, it did not add the API contract columns `held_quantity, unit, idempotency_key, created_by`. The Production table has zero rows; no business records were affected.
- Added prepared Migration 050 `050_inventory_holds_legacy_schema_alignment.sql`, SHA-256 `e6c883652c841c3ffb597b81ae403c09f6f9015ee48d914ec6a0216a17c488ab`. It additively introduces/backfills the API aliases from legacy columns, enforces NOT NULL/check constraints and a unique idempotency index, while retaining legacy fields.
- Updated the inventory-hold POST API to require an authenticated actor and write both legacy-required and new API-facing columns. It sets valid `hold_type='operational'`, and mirrors quantity/unit/actor/timestamps into both column sets.
- Added a contract test pinning Migration 050's exact bytes and the API compatibility write contract. Added Migration 050's SHA pin and a fail-closed no-replay verification path to the migration runner; automatic Production apply is not enabled for this new migration.
- Prepared Migration 050 on isolated Neon migration branch `br-proud-thunder-b3ny6nku` from Production. PostgreSQL catalog checks passed for all four API columns, three new checks, unique idempotency index and complete backfill (0 incomplete rows). An isolated transactional DO-block backtest exercised verified warehouse receipt → stock movement → API-shaped inventory hold insert → duplicate idempotency rejection; sentinel rollback removed all fixtures. Follow-up counts confirmed zero fixture users/projects/lots/receipts/movements/holds remain.
- Migration 050 is **NOT applied to Production**. The prepared migration branch remains ready pending owner approval; the Neon completion action must apply the exact SQL to Production and delete the temporary branch. Exact approval required: SHA-256 `e6c883652c841c3ffb597b81ae403c09f6f9015ee48d914ec6a0216a17c488ab`.
- Production remains at ledger 49/49. The four API-facing inventory_holds columns remain absent in Production until Migration 050 is approved/applied. No business data or mocks were written to Production.
- Source CI on commit `3777149461c4d55584b8f2a5fe4a45e7a6366a2b`: Unit Tests SUCCESS, 216/216 across 18 files; migration release verifier, migration dry-run (including exact Migration 050 SHA), backend/frontend TypeScript, frontend production build PASS; Dependency Audit SUCCESS. This is not authenticated multi-role UAT.
- **P0 remains blocked** until Migration 050 is owner-approved/applied and the remaining authenticated multi-role/cross-Project workflow UAT is completed. PR #2 remains OPEN/DRAFT; no merge or Vercel deployment.


### P0 follow-up blocker 2 — PM task notification RLS recipient check (2026-11-20)

- Isolated authenticated-role UAT showed PM task resolution notification INSERT was rejected although PM had `project.tasks.resolve` and the recipient was an active Project member. Root cause: Migration 049 policy queried `project_members` directly; forced RLS filtered that subquery for the PM role.
- Prepared Migration 051 `051_task_notification_recipient_rls_helper.sql`, SHA-256 `acda688d928ef06e2a8a069953976d0fa57f8fa7a5a0d988534d7da189d8a927`. It replaces the policy's direct membership subquery with the existing SECURITY DEFINER helper `pke_is_active_project_member(project_id, recipient_user_id)`, preserving PM assign/escalate/resolve checks and role-owner notification rules.
- Neon temporary-branch quota was reached, so a separate second prepared branch could not be created. Migration 051 was applied only to the already-isolated P0 test branch `br-proud-thunder-b3ny6nku` (never Production); PM notification INSERT and recipient-side read then passed under `app_runtime_secure`.
- Combined isolated role UAT on that branch passed: PM project-wide task read/create/resolve, active role queue visibility, explicit assignee isolation, revoked assignment denial, cross-Project denial, unauthorized operations task-create denial, assignee update, append-only event visibility, and PM task notification delivery/read. Fixtures are isolated to the temporary branch and will be removed when that branch is completed/discarded.
- Production remains at migration ledger 49/49. Neither Migration 050 nor 051 has been applied to Production. Exact owner approvals required before applying: 050 SHA-256 `e6c883652c841c3ffb597b81ae403c09f6f9015ee48d914ec6a0216a17c488ab`; 051 SHA-256 `acda688d928ef06e2a8a069953976d0fa57f8fa7a5a0d988534d7da189d8a927`.
- CI on source commit `172eb7e74ffd629dcbd33f3007932d47c3194995`: Unit Tests SUCCESS, 217/217 tests across 18 files; migration release verifier, dry-run with exact 050/051 pins, backend/frontend TypeScript, frontend production build PASS; Dependency Audit SUCCESS.
- P0 remains blocked pending approval/application of 050/051, Production post-apply verification, and remaining role-by-role operational workflow UAT. PR #2 remains open/draft; no merge or Vercel deployment.


### P0 production completion checkpoint — migrations 050/051 (2026-11-20)

- Applied Migration 050 `050_inventory_holds_legacy_schema_alignment.sql` atomically after verifying Migration 049. SHA-256: `e6c883652c841c3ffb597b81ae403c09f6f9015ee48d914ec6a0216a17c488ab`.
- Applied Migration 051 `051_task_notification_recipient_rls_helper.sql` atomically after verifying Migration 050. SHA-256: `acda688d928ef06e2a8a069953976d0fa57f8fa7a5a0d988534d7da189d8a927`.
- Production ledger verified at 51 rows; 047–051 exact filenames, SHA-256 values and `applied` statuses. No duplicate or partial rows.
- Production schema/security verification: all four inventory-hold API columns exist; three validation constraints and unique idempotency index exist; zero incomplete rows and zero current hold rows; task-notification policy now validates recipient membership using SECURITY DEFINER helper `pke_is_active_project_member`; work-item and event tables remain FORCE RLS; runtime cannot DELETE work items or UPDATE/DELETE append-only events.
- Isolated database-role UAT on temporary Neon branch: role/assignment setup for PM, Operations users and revoked assignment; PM sees project-wide tasks and can create/resolve; active assignee can update assigned task and append event; another role cannot update that explicitly assigned task; revoked assignment loses task visibility; cross-Project read returns zero; non-PM cannot create tasks; event visibility is restricted to assignee/PM. PM resolution notification succeeds after Migration 051 policy correction. Inventory receipt → stock movement → hold creation, mirrored legacy/API columns and duplicate idempotency rejection passed. Fixture rollback and zero-leftover counts verified.
- The UAT branch `br-proud-thunder-b3ny6nku` is an isolated test branch and has not been deleted because the Neon delete-branch action requires separate user confirmation. It is not Production and contains temporary UAT fixtures. Do not use it as an operational branch.
- CI on PR head `172eb7e74ffd629dcbd33f3007932d47c3194995`: Unit Tests and Dependency Audit SUCCESS; 216/216 tests across 18 files; release verifier, dry-run with exact 050/051 pins, backend/frontend TypeScript and frontend production build PASS.
- Backup remains the ready pre-048/049 Neon branch clone `br-steep-butterfly-b30wgjc3` at parent LSN `0/5F05C88`; it is not protected and is not a checksummed SQL dump because Neon snapshot/protected-branch quotas were full.
- P0 database migrations and isolated DB-level RLS UAT are complete. Remaining gate before full production acceptance: end-to-end authenticated API/browser UAT using provisioned real role accounts, plus final CI on the latest docs head. No Production mock data, no Vercel deployment, no PR merge.

- Final release-policy verifier correction: the runner's Production ledger status gate now accepts verified contiguous ledger lengths 49/50/51 and checks exact extension hashes through 051. The static release verifier explicitly pins source bytes and release paths for 048–051. CI on commit `627da45ad26719f95ee4d86eac083eab5ec91f06`: Unit Tests SUCCESS, 217/217 across 18 files; Production history/release verifier PASS; migration dry-run PASS with no DB connection; backend/frontend TypeScript and frontend build PASS; Dependency Audit SUCCESS.
- Live Production permission-function check also passed against active assigned users: Project Admin assignments return `finance.view=true` and `finance.create/update/delete=false`; active Finance assignments return `finance.view=true` and `finance.update=true`. Catalog RLS policy inspection confirms Finance mutation policies require the respective finance create/update/delete permission. Production ledger status mix is 35 `applied` + 16 `baselined`; IDs are contiguous 1–51, and migrations 047–051 are `applied`.


---

## P0 closure execution checkpoint — 2026-11-20 (owner approved)

- Owner approved deletion of the temporary P0 database UAT branch. Neon branch `br-proud-thunder-b3ny6nku` was deleted and verified absent. Production `br-damp-shape-b3xlh4nr` and the retained pre-048/049 backup `br-steep-butterfly-b30wgjc3` were not modified or deleted.
- Created a separate isolated Preview/UAT clone `p0-preview-uat-20261120` (`br-young-boat-b3re832d`) from Production at parent LSN `0/6048480`. It is READY, not protected, and has no synthetic fixtures written by this checkpoint. Production remains untouched.
- Added branch-scoped Vercel Preview variables for the exact Git branch `f1/project-scoped-cob-20261119`, pointing DATABASE_URL and Neon Auth URLs to the isolated clone. Admin provisioning and Auth webhook readiness flags are explicitly false. No Production-target Vercel variables were changed and no secrets were displayed.
- Vercel Preview deployment remains externally blocked by the team's daily deployment quota (>100 deployments/day; Vercel bot reported retry after 86400 seconds). Latest project deployment remains ERROR and the project reports `live=false`. No Production deployment/promotion was attempted. Do not claim Preview or browser smoke PASS.
- Clone inspection found 24 application users but only 1 linked Neon Auth user; 18 active Project role codes are present, with 4 PM assignments and 3 Finance assignments. Only the one linked Auth identity is available for authenticated sign-in. Role/assignment records cannot be treated as browser-authenticated coverage.
- The earlier isolated DB-level UAT remains PASS for PM task lifecycle, assignee isolation/revocation, cross-Project denial, notification delivery/read, inventory receipt/stock/hold and idempotency. Its branch was discarded after the owner-approved cleanup. Production ledger remains 51 contiguous entries, with migrations 047–051 applied; Production schema/RLS checks remain PASS.
- GitHub CI previously verified on PR head `0bd7e277f07910e960987161268843778ab94162`: 217 tests across 18 files, Unit Tests SUCCESS and Dependency Audit SUCCESS, plus migration verifier/dry-run, backend/frontend TypeScript and frontend build PASS. A later commit `31a4012e95aed0db05cacdf70b3642b00745d7fb` adjusts API TypeScript typeRoots for root dependencies; no PR-triggered workflow result was returned for that commit at this checkpoint.
- **P0 status:** Production database migration and isolated DB-level authorization UAT are COMPLETE. Authenticated browser/API role matrix and Preview smoke are NOT VERIFIED because the clone has only one Auth-linked application user and Vercel deployment quota blocks Preview. This is an explicit remaining external/test-identity gate, not a PASS and not silently waived. No PR merge, no Production deploy, no synthetic data in Production.


---

## Role dashboard implementation and blocker audit — 2026-11-20

- Implemented `frontend/src/RoleDashboardPage.tsx` and `frontend/src/RoleDashboardPage.css`; routed the home page from the generic Ringkasan page to the new Project-scoped role dashboard.
- Added dashboard focus/output/link mappings for all 34 canonical Project role templates in `src/role-catalogue.ts`: **34/34 mapped; 0 missing** by source comparison.
- Enabled the dashboard landing page for active external Project roles as well as internal roles. Domain metrics remain permission-gated; API/RLS remains the data authorization boundary.
- Dashboard reads only existing sources: Projects, work items, contracts/programs, warehouse receipts, inventory lots, truck trips, shipment allocations, project documents/requirements, AP/AR, Cash Advances, journals and Project reports.
- The work-item API is called for the selected Project for any active Project role; the API returns Project-wide scope for PM or assigned-role/assignee scope for other users. Notification-read state is not treated as task acknowledgement.
- Platform Admin governance is separated from Project business permissions in this dashboard. Platform Admin is not granted Project metrics merely because `platformAdmin=true`.
- Failed API sources render as unknown (`—`), not false zero. Production/QA, vessel/loading/laytime, LC presentation and payment/bank reconciliation are explicitly shown as unavailable where no source workflow exists.
- Updated `src/f1-role-ux-rules.test.ts` for external-role dashboard access and 34-role mapping coverage. Latest source commit for dashboard role-link permission reconciliation: `13120e445bb201e8c66fbcf9667b3753a6aac3b5`. Audit artifact: `docs/audits/ROLE_DASHBOARD_IMPLEMENTATION_AUDIT_20261120.md` (commit `a67a2f934b4bf0f7343d564fc7b8b3e4b4ea56a3`).
- CI evidence on the immediately preceding integration commit `064be00284de14ebd32e8afb2dfc03bf223a585a`: Unit Tests run `44751601784` SUCCESS, including root unit/security tests, migration verifier, migration dry-run, backend API typecheck, frontend typecheck and frontend production build. Dependency Audit run `44751601845` SUCCESS. Subsequent dashboard permission, task queue, styling, role-link and audit-document commits are later than that run; no CI PASS is claimed for the latest branch head until the same checks are completed on that exact SHA.
- Full authenticated browser/API role matrix remains BLOCKED: isolated Preview clone has only one Auth-linked application user. Vercel Preview remains blocked by daily deployment quota. Role assignment records are not authenticated browser identities.
- Funder mismatch found: canonical `funder` template does not include `funder.view`, while dedicated `/funder` page guard requires it. The dashboard does not link to the inaccessible route; use Reports until the permission registry/template/API/RLS are reconciled and an explicit grant is approved.
- Role operational workflow coverage remains PARTIAL: PO/three-way match; production/packing/QC/Lab/QA/HSE; dispatch/vehicle/driver SLA; vessel/berth/loading/survey/laytime; LC discrepancy/presentation; audit findings; and payment execution/bank reconciliation are not all implemented. Payment execution remains out of F1 scope and fail-closed.
- Detailed blocker register and comprehensive revision waves are recorded in `docs/audits/ROLE_DASHBOARD_IMPLEMENTATION_AUDIT_20261120.md`.
- **Status:** role dashboard source IMPLEMENTED (34/34 mappings); latest-head CI PENDING; authenticated role/browser UAT BLOCKED; all operational workflows NOT COMPLETE. PR #2 remains OPEN/DRAFT/unmerged. No Vercel deployment or Production promotion. No Neon Production business data or role assignments were changed by dashboard work.


### Latest-head dashboard CI acceptance — 2026-11-20

- Exact source head tested: `91fec201c63c08d56ebad6b146b6218ba14801dc`.
- Unit Tests run `44752309698`: SUCCESS; 18/18 test files and 218/218 tests passed. Migration history/release verifier, no-connection migration dry-run, backend API TypeScript, frontend TypeScript and frontend production build all passed.
- Dependency Audit Evidence run `44752309859`: SUCCESS; root/frontend production dependency and dependency-tree audit steps passed.
- The role dashboard implementation is therefore source/static/build verified on exact head `91fec`. Subsequent commits in this section are documentation-only and do not change executable source.
- Dashboard mapping remains 34/34 canonical roles. Full authenticated browser/API role matrix is still BLOCKED by one Auth-linked user on Preview clone and Vercel daily deployment quota. No Preview smoke PASS is claimed.
- Full role operational workflow implementation remains PARTIAL as detailed in `docs/audits/ROLE_DASHBOARD_IMPLEMENTATION_AUDIT_20261120.md`; PO, production/QA/HSE, dispatch SLA, vessel/loading/laytime, LC presentation, audit findings, and Funder permission reconciliation remain in the comprehensive revision plan. Payment execution remains outside F1 and fail-closed.
- PR #2 remains OPEN/DRAFT/unmerged. No new GitHub branch, no Production deployment/promotion, no Production business/mock data, and no Neon Production mutation were made for role dashboard implementation.


### Wave C checkpoint — inventory/warehouse API hardening — 2026-11-20

- Hardened `POST /api/v1/inventory-holds`: same idempotency key + identical Project/lot/quantity/unit/reason/actor returns the original row as HTTP 200 with `idempotentReplay=true`; conflicting reuse returns `IDEMPOTENCY_KEY_CONFLICT`; concurrent duplicate insert is safely re-read after unique conflict.
- Hardened `POST /api/v1/inventory-movements`: finite positive quantity, non-empty movement type/unit, locked Project lot and exact lot-unit match are required.
- Hardened warehouse receipt create/update: positive finite received quantity, non-empty unit, and unit consistency with linked inventory lot.
- Added six contract tests in `src/inventory-movement-hold.contract.test.ts` and included the file in `npm test` in `package.json`.
- Source commits: `97f2fa363b905ac1c1668a7bb8ed231a12573a7f`, `023fd505be2f718d957107a1ebb3b0db0e3de4ba`, `94bde76a9cf2982790a5454c4d0274d6dcec9d24`, `4d4d7809fb56b5aa5cbad3ca6e0b7dd32e82a902`.
- No schema migration, Production database write, test fixture or deployment was performed.
- Latest source head at checkpoint: `94bde76a9cf2982790a5454c4d0274d6dcec9d24`. Latest-head CI and DB/API integration UAT are PENDING; dashboard CI evidence at `91fec` does not cover these later code changes.
- Next: test concurrent hold replay and cross-actor conflict; verify movement trigger/balance/reversal semantics; complete receipt-to-stock and reservation-to-shipment reconciliation under concurrency; then proceed through PO, Production/QA/HSE, Dispatch, Vessel/Loading, LC, Audit findings and Funder permission design.
- Funder remains fail-closed: do not add `funder.view` or broaden `finance.view` until dedicated report-sharing permission and API/RLS object scope are reconciled.


- Follow-up aligned API validation with the existing DB enums in migration 005: receipt status `pending/verified/partial`; movement type `receipt/issue/transfer/adjustment`; movement status `posted/reversed/adjusted`. Tests assert enum values and fail-fast behavior. Source/test commit: `b66d46c880fb91106a11707c6e2fbc2095e85a29`.
- Prior exact-head CI on `36aae87466983b1cf6aa6d86d7a279e28b12ec8d`: Unit Tests run `44754003741` SUCCESS (19 files, 224 tests; includes six new inventory/warehouse contract tests), Dependency Audit `44754003766` SUCCESS, migration verifier/dry-run, backend/frontend typecheck and frontend production build PASS. This run predates the enum-only refinements in `b66d46c`; rerun exact latest head before treating the final checkpoint as CI PASS.


- **Latest Wave C source CI PASS:** exact executable source head `b66d46c880fb91106a11707c6e2fbc2095e85a29`; Unit Tests run `44754247718` SUCCESS (19 files / 224 tests, including six new inventory/warehouse tests), Dependency Audit run `44754247664` SUCCESS; migration verifier/dry-run, backend/frontend typechecks and frontend production build all PASS.
- DB/API concurrency and RLS integration UAT remain NOT VERIFIED; no Preview deployment/browser smoke is claimed. Evidence details are in `docs/audits/ROLE_DASHBOARD_IMPLEMENTATION_AUDIT_20261120.md`.


- Read-only Neon Production integrity preflight (branch `br-damp-shape-b3xlh4nr`, project `purple-base-63944903`): warehouse_receipts 1 row / 0 invalid; inventory_movements 1 row / 0 invalid; inventory_holds 0 rows / 0 invalid. No row values read, no data changed. Production is not literally empty in the first two tables; do not classify these rows as disposable test fixtures without provenance review. No DDL/migration 052 applied.


### Funder external-role overgrant remediation — 2026-11-20

- Read-only Production permission audit found 2 Funder role definitions with generic grants `finance.view`, `reports.view`, `report.view`, `view_financial`; 1 active Funder assignment inherits these grants. This is a material external-role overgrant.
- Source guards now exclude Funder assignments from generic Finance/Accounting/Reports/payment permission attribution; generic report-run listing also excludes Funder-only memberships. Non-platform report generation now requires a Project ID.
- Canonical Funder role template now grants no generic Finance/Accounting/Reports/payment permissions. Funder dashboard remains a scoped landing surface with no generic Finance/Reports metrics or links until explicit report sharing exists.
- Added 7 contract tests in `src/funder-permission-isolation.contract.test.ts`; root npm test includes it.
- Prepared `migrations/052_funder_finance_report_scope_isolation.sql`, which removes existing broad Funder grants and updates `pke_has_project_permission` so RLS denies those permission families for Funder. Exact SHA-256: `cc8d34c12d34eab9c4cc9aeabd46d9da59b1ec7ef0c7c89345d4b49455a6ac0b`.
- Migration 052 was owner-approved with exact SHA-256 and applied atomically to Neon Production on 2026-11-20. Production ledger row 52 was read back and verified; canonical applied ledger is `migration_history_manifest_001_052.json`. The pre-apply ledger `migration_history_manifest_001_051.json` and fresh backup evidence are retained as release evidence.
- Exact source CI head `d18d8d267afcdfa0179b11e7408fa8cb9b43d607`: Unit Tests `44755729653` SUCCESS (20 files / 231 tests); Dependency Audit `44755729686` SUCCESS; migration verifier/dry-run, backend/frontend TypeScript and frontend production build PASS.
- Full detail: `docs/audits/ROLE_DASHBOARD_IMPLEMENTATION_AUDIT_20261120.md`.


- Historical note: the initial pre-052 backup attempt was blocked by the Neon branch quota. The owner subsequently approved deletion of `br-misty-cake-b317ia3e`; the branch was deleted and verified, then a fresh Production clone was created. See the following checkpoint for the completed backup and current remaining gates.

## Production checkpoint — Migration 052 preparation (2026-11-20, WIB)

- Neon project: `purple-base-63944903`; Production branch: `br-damp-shape-b3xlh4nr`.
- Owner explicitly approved deletion of Neon branch `br-misty-cake-b317ia3e` (`mcp-migration-2026-11-18T16-40-40`). Deletion completed and re-verified: the branch no longer appears in the active branch list. No other branch was deleted.
- A fresh, no-compute clone of Production was created as the pre-052 recovery copy: `pke-production-pre-052-backup-20261120`, branch `br-snowy-credit-b336z950`. It reached `ready`; parent LSN `0/61031D0`, parent timestamp `2026-11-20T15:11:32Z`. A minimal 0.25-CU validation endpoint was attached: `ep-snowy-mode-b3cqe5at`.
- Backup parity check against Production: both contain 51 migration ledger rows through Migration 051 with identical 048-051 filenames/checksums/status; both show 2 projects, 36 project roles, 24 role assignments, 556 project-role permission grants, 1 warehouse receipt, 1 inventory movement, and 0 inventory holds. This is structural/count parity, not a row-by-row cryptographic dump verification.
- A fresh Neon snapshot was attempted twice but rejected by the project with `snapshots limit exceeded`. The only listed manual snapshot remains `PKE-target-pre-migration-20261115` (2026-11-15), so the current clone branch is the fresh backup artifact; snapshot creation remains blocked by the Neon snapshot quota.
- Production migration ledger was read directly: exactly 51 rows, IDs 1-51 contiguous, latest row Migration 051 with SHA-256 `acda688d928ef06e2a8a069953976d0fa57f8fa7a5a0d988534d7da189d8a927`. Migration 052 is absent from Production history.
- Funder preflight on Production and the backup found two project-scoped Funder role definitions, each with four generic Finance/Accounting/Reports/payment grants; one active assignment exists under one of those roles. The migration will remove those generic grants and deny generic permission attribution for Funder. Production currently still contains these grants; no data or permission changes were made.
- Migration 052 source: `migrations/052_funder_finance_report_scope_isolation.sql`; independently computed SHA-256: `cc8d34c12d34eab9c4cc9aeabd46d9da59b1ec7ef0c7c89345d4b49455a6ac0b`. Source is pinned in the current migration runner and release verifier; its contract test pins the same digest.
- Historical pre-apply note: Migration 052 was prepared-only at the time of the initial preflight. The owner subsequently approved the exact SHA-256; a dedicated fail-closed atomic release path was implemented, tested in CI, and the migration was applied and audited. See the final checkpoint below.
- No Vercel deployment or PR merge was performed.

## Final Migration 052 application and post-apply audit — 2026-11-20

- Owner explicitly approved \`052_funder_finance_report_scope_isolation.sql\` with SHA-256 \`cc8d34c12d34eab9c4cc9aeabd46d9da59b1ec7ef0c7c89345d4b49455a6ac0b\`.
- Release controls implemented on the existing branch: \`scripts/apply-migration-052.mjs\` requires exact source hash, owner approval hash/reference, a fresh backup branch ID and SHA-256 of the backup evidence file, exact Production host/database/TLS and non-runtime DB role, a contiguous 001-051 ledger, and a PostgreSQL advisory lock. SQL plus migration-history row and in-transaction permission backtest are atomic.
- \`scripts/verify-migration-052-release-policy.mjs\`, \`src/migration-052-release.contract.test.ts\`, and release verifier were added/updated. Migration status now recognizes canonical \`migration_history_manifest_001_052.json\`.
- CI on commit \`651d8a2043e0eb08da4452bc90f686a48f0299e0\`: Unit Tests PASS (21 files / 237 tests); migration ledger/release verifier PASS; migration dry-run PASS; backend API typecheck PASS; frontend typecheck PASS; frontend production build PASS; Dependency Audit PASS. The first CI attempt caught a test assertion formatting issue; it was fixed and the subsequent run passed.
- The Neon SQL tool rejected an initial multi-statement prepared query before executing any SQL. The migration was then applied as one PostgreSQL DO transaction, preserving the exact approved DELETE and function definition, adding ledger row 52, and running postconditions before commit. No partial SQL or ledger write remained from the rejected attempt.
- Production post-apply read-back: ledger 52/52; row 52 filename/hash/status exact; Funder generic Finance/Accounting/Reports/Payment grant count = 0 across both Projects; two Funder role definitions have zero such grants; one active Funder assignment.
- In-transaction backtest temporarily reintroduced \`finance.view\` and \`reports.view\` grants for the active Funder role and confirmed \`pke_has_project_permission\` denied both. Probe grants were deleted before commit. The helper remains SECURITY DEFINER with restricted \`search_path\`; EXECUTE is granted to \`app_runtime_secure\`, and PUBLIC EXECUTE is false.
- Backup branch \`br-snowy-credit-b336z950\` remains ready and unchanged at migration ledger 51. No business data or mock fixtures were inserted into Production.
- **Separate permission-policy finding (not part of Migration 052):** active Project Admin effective checks returned \`finance.view=true\` and \`finance.update=false\`, as intended, but \`accounting.update=true\`, \`accounting.delete=true\`, \`reports.create=true\`, and \`reports.delete=true\`. Finance role effective checks returned Finance CRUD=true but Accounting update/delete=false. Migration 047's trigger only restricts \`finance.%\`, not \`accounting.%\` or \`reports.%\`. This is a potential role-separation blocker requiring an explicit owner policy decision and a separately reviewed migration; no such grants were changed by Migration 052.
- PR #2 remains OPEN / DRAFT. No merge, Vercel deployment, or Production promotion was performed.

- **Latest source CI qualification:** CI PASS evidence is from commit \`651d8a2043e0eb08da4452bc90f686a48f0299e0\` (21 files / 237 tests, release verifier, migration dry-run, backend/frontend typecheck/build, Dependency Audit). Subsequent canonical 001-052 status-manifest integration, applied-state verifier, CI-step addition and audit-document commits have not produced a new workflow run on the latest PR head \`e09bb49c859e868a4c381213acbca73bcbbaa9ce\`; GitHub currently returns no workflow runs or combined status for that head. Therefore the latest source delta is **CI RE-RUN REQUIRED** even though Production Migration 052 is applied and independently read-back verified.


## Project Admin Accounting/Reports permission decision — 2026-11-20

- Policy decision: Project Admin is a Project administration/access-configuration role, not a broad business-data administrator. PM configures Project operational role composition within central security ceilings; technical role owners retain their domain authority.
- Project Admin may read `finance.view`, `accounting.view`, `reports.view` and legacy `report.view`. Project Admin may not create, update, delete or post Accounting records, nor create/update/delete Reports.
- Finance role permissions and payment authority are not expanded or changed by this decision.
- Prepared Migration 053 on the existing F1 branch to enforce the database permission boundary and clean existing Project Admin write grants. Source regression tests and canonical role-template changes are included.
- Migration 053 is PREPARED ONLY. Do not apply to Neon Production until the exact SHA-256 is reviewed and separately approved.
- Source CI on previous head `f8aa58491049e6169d029868ee176cacfbd41992`: Unit Tests run `44765235288` SUCCESS (all steps including 052 release verifier, dry-run, backend/frontend typecheck and frontend build); Dependency Audit run `44765235210` SUCCESS. Subsequent Migration 053 changes require a fresh CI run on the new head.
- PR #2 remains OPEN / DRAFT; no merge or Vercel deployment/promotion.
