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
- [x] Opened PR #1 to reconcile the 164-commit validated branch with `main`; PR is open and deliberately not merged pending F0 gates.
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
| P0 | Reconcile Vercel deployment source with GitHub canonical branch; ensure migration 038 source and manifest are in the release source | Vercel project linked to intended repo/branch, Preview green, deployed commit recorded | IN_PROGRESS |
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
- F0 remains IN PROGRESS: owner-confirmed Neon Auth Admin test accepted as PASS; production dependency audit passes. Remaining work: manual Vercel credential visibility review, Neon snapshot entitlement/replace decision, and final release regression. Dev-only picomatch advisory has no patched release published in npm registry (latest remains 4.0.7) and is not present in production dependency audit; retain as documented development-toolchain risk, not a runtime release blocker.
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
- F0 remains IN PROGRESS. This deploy/health check does not close remaining Phase 0 gates (RLS anonymous HTTP checks, backup/PITR evidence, dependency advisory, PR/source reconciliation, and final acceptance review). Do not mark F0 complete based on deployment readiness alone.


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
- PR #1 remains OPEN and `mergeable=false`; current head `cd748390...`, 180 commits / 50 changed files, while PR base SHA remains `625109a...`. Production `main` has subsequent commits `39409a...` and `31a401...`. Do not merge until source branch is reconciled and all conflicts/diff are reviewed. Production `main` does not yet contain the full F0 branch implementation (including the Neon Auth webhook/Admin lifecycle route changes present on the validation branch); Production deployment is not proof that the F0 branch has been released.
- Live anonymous HTTP check for `GET /api/v1/projects` could not be completed through the Vercel connector because the reused deployment share-link returned `deployment_authentication_required`. Static source review shows the global `/api/v1` authentication middleware and route-level `requireAuth`; live HTTP behavior remains NOT VERIFIED and must be manually checked by owner.
- Neon backup/PITR gate remains PARTIAL: automatic snapshot scheduling is not enabled; manual snapshot creation hit the project snapshot limit; the only retained snapshot is stale/incomplete. The current 162-table Production clone is an operational recovery copy, not a scheduled snapshot/PITR backup, and could not be protected because the plan's protected-branch limit was reached.
- Authentic byte-for-byte SQL source for historical migrations 029-035 remains unrecovered. Their hashes and applied records are evidenced by Production, but reconstructed candidate files are not authentic source and cannot be treated as deployable or hash-verified SQL.
- Development dependency tree retains 5 root / 4 frontend HIGH advisory findings associated with picomatch GHSA-fc5q-39xc-vjpf. Production-only dependency audits pass (0 HIGH). This is a documented development-toolchain risk, not a demonstrated Production runtime vulnerability; upstream remediation remains open.
- Vercel build logs emitted TS2688 for Node type definitions during function transpilation. Added explicit `typeRoots: ["../node_modules/@types"]` to `main/api/tsconfig.json` in commit `31a4012e95aed0db05cacdf70b3642b00745d7fb`, but Vercel reports `build-rate-limit` for that commit, so the fix is NOT yet deployed or verified. Current Production still runs deployment `dpl_4wYn...`.
- PostgreSQL driver emitted a forward-compatibility SSL-mode warning; current health check still reports database connected. No Production connection-string change was made; consider explicit `sslmode=verify-full` only in a separately validated release.
- Neon Auth Admin manual test completed by owner is accepted as PASS; do not re-request or treat it as a blocker. Webhook integration and production enablement are separate from that manual Admin test and remain unproven on Production.

### Final acceptance decision
- **F0 FINAL ACCEPTANCE: NOT ACCEPTED / NO-GO.**
- Production availability and core database security checks pass, but source reconciliation/merge, live anonymous HTTP verification, recoverable backup/PITR evidence, historical source provenance 029-035, and final deployment verification for the API typeRoots fix remain open.
- No Production database DDL/DML was performed during this acceptance review. No PR merge, migration replay, snapshot deletion, or credential rotation was performed.
- Required owner manual check: open `https://pke-export-platform.vercel.app/api/v1/projects` in a browser session with no PKE login. Expected result is HTTP 401 with `AUTHENTICATION_REQUIRED`; if any project data or HTTP 200 appears, stop and report immediately. If Vercel deployment protection intercepts the request, report that page instead—the app response was not reached.
