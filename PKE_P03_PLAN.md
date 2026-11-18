# PKE P03 / Phase 0 Execution Plan
**Updated:** 2026-11-18 22:15 WIB  
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

## Remaining F0 gates — execute in parallel where safe
| Priority | Work | Acceptance evidence | Status |
|---|---|---|---|
| P0 | Complete Admin User Lifecycle end-to-end wiring: authenticated webhook verification, idempotency, provisioning, identity link, global activation/deactivation, session revocation, project-role independence | Integration tests against Neon test branch, replay tests, audit trail assertions, API route checks | PARTIAL |
| P0 | Prove RLS isolation across two real synthetic projects and two non-Admin identities | Positive own-project reads/writes; zero cross-project rows; no-context and anonymous denied; cleanup evidence | PARTIAL |
| P0 | Reconcile duplicate Neon Auth Admin identity | Owner confirms second identity; document retain/revoke decision; no automated removal | BLOCKED_OWNER |
| P0 | Restore dependency audit to non-blocking secure state without unsafe downgrade | Lockfile-resolved tree, GHSA applicability assessment, npm audit evidence, CI green | IN_PROGRESS |
| P0 | Reconcile Vercel deployment source with GitHub canonical branch; ensure migration 038 source and manifest are in the release source | Vercel project linked to intended repo/branch, Preview green, deployed commit recorded | IN_PROGRESS |
| P1 | Fix deployment packaging so runtime/migration metadata is available without shipping excluded SQL files or weakening tests | Preview build + API health checks; migration verification in CI | PARTIAL |
| P1 | Verify secret visibility and environment separation | Vercel settings evidence; no secret values in logs; Preview/Production scopes reviewed | BLOCKED_PLATFORM_UI |
| P1 | Backup/restore evidence | Supported automated backup schedule or documented tested alternative restore point | BLOCKED_PLAN_CAPABILITY |
| P1 | Final regression suite and release evidence | GitHub Actions green, Preview READY, HTTP health 200, migration ledger 38/38, security tests pass | NOT STARTED |

## Guardrails
- Production migration 038 is applied. Do not reapply it; verify the ledger/hash before any runner action.
- Do not apply Migration 039+ without explicit approval and a verified SHA-256.
- Do not promote Preview to Production until all P0 gates pass and source branch parity is proven.
- Do not disable or delete the second Neon Auth Admin identity without owner confirmation.
- Do not delete validation/restore-drill branches without explicit owner approval. The branches have expiry windows; record actual cleanup outcome.
- Never expose credentials, tokens, connection strings, or raw secret values in reports or CI logs.
- Never mark a test PASS unless its command/run, target, and result are captured.

## Execution cadence
1. **Immediately:** complete lifecycle integration and cross-project RLS test fixtures on a non-Production Neon branch; run focused tests on each change.
2. **By 2026-11-19 06:00 WIB:** resolve Vercel source parity, dependency audit, and Preview packaging; require a new green CI run and READY Preview.
3. **By 2026-11-19 09:00 WIB:** complete two-project/two-identity RLS and lifecycle integration tests; capture all evidence and cleanup temporary data.
4. **By 2026-11-19 12:00 WIB:** run final F0 acceptance review. Mark COMPLETE only if all required gates pass. Otherwise publish the exact remaining external blockers and keep F0 IN PROGRESS.

## Latest Production migration ledger checkpoint
- Latest applied migration: 038 `admin_managed_neon_auth_user_lifecycle`
- SHA-256: `37344eb4794c36cfd8c5b10e85a4f0ee947cd6bd0951bde8c6b8fb94f147c8d5`
- Verification timestamp: 2026-11-18 22:06 WIB
- Migration 039+: NOT APPLIED
