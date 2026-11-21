# Post-Migration 054 UAT Permission Backtest — 2026-11-21

## 11. Migration 054 UAT application and post-apply backtest — 2026-11-21

**Result: MIGRATION APPLIED / PERMISSION BACKTEST PARTIAL PASS / OVERALL P0 NOT PASS.**

- UAT branch: `br-young-boat-b3re832d` (`p0-preview-uat-20261120`). Exact Migration 054 SHA-256: `821800c7a30a80a1a63bab1bfe458d29df393fc31026645f5c181660f853a0a2`. Ledger ID 54 reads `applied` with the exact filename and checksum.
- Atomic execution used 45 statements, including ledger recording. The SQL source expects an `app_runtime` role that does not exist in either UAT or Production; a temporary NOLOGIN compatibility role was created and dropped within the same transaction. Verified absent after commit. Earlier failed executions rolled back; no partial DDL persisted.
- UAT postconditions: 40 role policy rows; 256 allowlist entries; 38 role codes with permissions; 286 grants; 0 non-canonical grants; 0 missing allowlist grants for installed roles; 0 forbidden grants. Project Admin Finance/Accounting/Reports write grants=0; Finance payment grants=0; Accounting post/reverse grants=0; Funder grants=0.
- Functional permission helpers passed for Platform Admin, Project Admin, Funder, Finance, Accounting, cross-Project isolation, expired membership and revoked membership. The 36 installed role rows passed allowlist trigger positive/negative probes; unauthorized role-code change was denied.
- No Platform Admin bypass remains in the 19 audited project/object permission helpers, five payment/Accounting transaction guards, or non-governance transactional RLS policies. No non-governance `pke_admin_all` policy remains on transaction tables.
- **P0 RLS failure remains:** `pke_admin_all` is still present on `project_members`, `project_roles`, and `project_invitations`. The runtime role has write privileges on these tables; Platform Admin can see all 24 memberships and 36 role definitions and the policies allow membership/role/invitation writes. These are Project staffing functions and must be scoped to PM/Project roles. A follow-up migration must remove the broad Platform Admin policy and add only the minimum read/PM-appointment policies required by the PM governance API.
- **P0 PM invariant failure remains:** Project Alpha contains two effective active PM assignments from fixture users. Existing duplicate-PM trigger rejects new duplicates, but it does not remove historical duplicates.
- The grant normalization is the intended data change (534 to 286 grants). No projects, users, memberships, PM assignments, warehouse receipts, inventory movements or other business records were added/deleted. Production remains unchanged.
- Neon branch cap prevented a dedicated pre-054 UAT clone; no existing branch was deleted or repurposed. Existing Production post-053 backup remains preserved.
- CI at `f538e512133986465d5429cb8bbc154fa3658a52`: 251/251 unit tests passed, typechecks/build/verifier/dependency audit passed. PR #2 remains open/draft; no merge/deploy/new GitHub branch.

**Decision:** Migration 054 is successfully installed on UAT. Overall P0 remains NOT PASS until the Platform Admin membership/role/invitation RLS bypasses and historical duplicate PM fixture are reconciled and retested. Do not start dashboard UX yet.
