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
