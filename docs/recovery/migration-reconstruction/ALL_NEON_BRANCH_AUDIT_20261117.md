# PKE Neon Branch Audit — 17 Nov 2026

## Scope and safety
Read-only audit of every branch listed in both PKE Neon projects. No DDL/DML, restore, endpoint enablement, merge to main, or deployment was performed.

## Projects and branch inventory

### Active project
- Project: PKE-export-platform
- Project ID: purple-base-63944903
- Branch: production
- Branch ID: br-damp-shape-b3xlh4nr
- Compute endpoint active.

### Legacy project
- Project: PKE-export-platform-legacy-migration-source
- Project ID: lucky-glitter-99553107

| Branch | Branch ID | Compute state | SQL inspection |
|---|---|---|---|
| production-pre-promotion-20261107 | br-still-flower-b3z7p6fv | disabled | not accessible |
| staging | br-empty-cherry-b3ldvfyy | disabled | not accessible |
| rehearsal | br-lively-frog-b3om6oqr | disabled | not accessible |
| p03-backend-hardening-test | br-gentle-thunder-b3z7y3bk | disabled | not accessible |
| production | br-calm-glade-b3nrleet | active | read-only query succeeded |
| pke-admin-project-foundation-20261108 | br-solitary-credit-b3imfofv | disabled | not accessible |
| production-pre-project-foundation-028-20261109 | br-wispy-band-b3doookb | disabled | not accessible |
| revision3-production-validation-20261114 | br-billowing-math-b31f4wos | active | read-only query succeeded |

## Migration history results
Read-only SELECT of public.migration_history succeeded on:
- legacy production (br-calm-glade-b3nrleet)
- revision3-production-validation-20261114 (br-billowing-math-b31f4wos)
- active production (br-damp-shape-b3xlh4nr)

All three returned 35 rows, with IDs 1–16 baselined and 17–35 applied. IDs 29–35 have matching filename, SHA-256, applied timestamp, and status across these three branches.

| ID | Filename | SHA-256 |
|---|---|---|
| 029 | 029_restrict_set_rls_context_public_execute.sql | d7b9376495a36e5bf5e90539403b674eb39f1df01308744a262eb6519f4ea5d1 |
| 030 | 030_validate_production_foreign_keys.sql | 2bb2f8fcc9f947669b1712214d425679e9b6385269d4e471f77f09a028b6b499 |
| 031 | 031_harden_rls_context_function.sql | 90a07b35c9b40758ad33c4e6c28407c341dcdd67310c8ead76fe5fe965bde788 |
| 032 | 032_seed_core_currency_reference_data.sql | 1944c163d1185e8bf606b411b305f36a0c732d76118934db0a9c57dbb5328f48 |
| 033 | 033_candidate_tenant_scoped_relations_rls_gps_reports.sql | bc759884315ecf3b0716f04581b7677e3ca4ec1dec2c683fab777ca848523029 |
| 034 | 034_harden_trigger_function_execute_privileges.sql | c0265dfe554e55bebe5061ea90a41e74c10e1ff353616174cbfd0f590d46596a |
| 035 | 035_remove_redundant_ai_rls_policies.sql | 6f4425f297202a5618e4914705ea610d2058ef0fe01ebab5468af5824a84fa45 |

The migration_history checksums prove metadata only; they do not recover SQL contents.

## Snapshots
- Legacy project: one manual snapshot, PKE-production-before-test-promotion-20261107, created 2026-11-07.
- Active project: one manual snapshot, PKE-target-pre-migration-20261115, created 2026-11-15.
- No known snapshot falls after migration 034 (2026-11-13 20:41 UTC) and before 035 (2026-11-14 01:35 UTC).
- User-uploaded backup 20261113_183300 corresponds to 2026-11-13 10:33 UTC (+08 local), before 034.

## Reconstruction decision
- 029, 030, 031, 032, 034: review-only reconstructed candidates already exist in this recovery directory; do not claim byte-identical to historical checksums.
- 033: BLOCKED. Available catalog diff is cumulative 029–035 and cannot isolate 033.
- 035: BLOCKED. Exact removed-policy set is not proven; previous inference was withdrawn. Current catalog still shows pke_ai_feedback_select and pke_ai_runs_update using pke_is_platform_admin().
- The cumulative catalog snapshot is evidence only and is not safe as a directly executable migration.

## Important limitation
All branches were inventoried. SQL catalog inspection could not be performed on six legacy branches because their compute endpoints are disabled. They were not re-enabled to avoid changing compute state or incurring compute usage without explicit approval.

## Next safe action
Recover original SQL from CI/deployment logs, Git objects, or a schema backup from the required time window. If impossible, create a newly versioned baseline/reconciliation for new environments or a forward-only migration for measured Production drift. Never invent historical checksum-matching files or rerun 029–035 on Production.
