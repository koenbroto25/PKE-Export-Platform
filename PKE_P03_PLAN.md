# PKE P03 / Phase 0 Execution Plan
**Updated:** 2026-11-18 22:48 WIB  
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
| P0 | Complete Admin User Lifecycle end-to-end wiring: authenticated webhook verification, idempotency, provisioning, identity link, global activation/deactivation, session revocation, project-role independence | SQL lifecycle/replay and membership independence pass; cryptographic signature unit tests pass; unsafe DB-only revoke route removed; live Admin SDK createUser + provider webhook callback + Auth ban/unban/revoke HTTP integration remains unproven | PARTIAL |
| P0 | Prove RLS isolation across two real synthetic projects and two non-Admin identities | Isolated branch positive own-project reads, zero cross-project visibility, no-context denial, cross-project INSERT denial, zero-row UPDATE; anonymous HTTP path and cleanup remain | PARTIAL |
| P0 | Reconcile duplicate Neon Auth Admin identity | Owner approval, exact Auth ID deletion, Production post-delete verification, retained Admin mapping | COMPLETE |
| P0 | Restore dependency audit to non-blocking secure state without unsafe downgrade | Production dependencies: root/frontend `npm audit --omit=dev --audit-level=high` both PASS, 0 vulnerabilities. Dev toolchain: 5 root / 4 frontend HIGH all originate from picomatch GHSA-fc5q-39xc-vjpf with no patched release; do not downgrade Vite/Vitest. Documented compensating control is dev-only exposure and no untrusted glob input; upstream patch/mitigation still OPEN | PARTIAL_UPSTREAM_ADVISORY |
| P0 | Reconcile Vercel deployment source with GitHub canonical branch; ensure migration 038 source and manifest are in the release source | Vercel project linked to intended repo/branch, Preview green, deployed commit recorded | IN_PROGRESS |
| P1 | Fix deployment packaging so runtime/migration metadata is available without shipping excluded SQL files or weakening tests | Preview build + API health checks; migration verification in CI | PARTIAL |
| P1 | Verify secret visibility and environment separation | Vercel targets enumerated without decrypting values. Production DATABASE_URL/JWT_SECRET/AWS/GEMINI/Neon endpoint variables are encrypted; several Vercel entries carry `readable-secret` security issue flags, and Preview Neon endpoint variables are plain. Needs owner-approved reclassification/rotation and a second review; no secret values were decrypted | PARTIAL_SECURITY_REVIEW |
| P1 | Backup/restore evidence | Supported automated backup schedule or documented tested alternative restore point | BLOCKED_PLAN_CAPABILITY |
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
- F0 remains IN PROGRESS: production dependency audit passes, but upstream dev-toolchain GHSA has no fix; live Neon Auth provider webhook/Admin SDK integration, anonymous HTTP/RLS tests, environment secret reclassification/rotation, backup/restore evidence, and final release regression remain unproven.

## Latest Production migration ledger checkpoint
- Latest applied migration: 038 `admin_managed_neon_auth_user_lifecycle`
- SHA-256: `37344eb4794c36cfd8c5b10e85a4f0ee947cd6bd0951bde8c6b8fb94f147c8d5`
- Verification timestamp: 2026-11-18 22:06 WIB
- Migration 039+: NOT APPLIED
