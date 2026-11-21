# GitHub Migration Archive Manifest — 2026-11-19

## Scope and identity
- Repository: `koenbroto25/PKE-Export-Platform`
- Existing GitHub working branch: `f1/project-scoped-cob-20261119`
- This is **not** a GitHub Production branch. No GitHub branch named `production` exists, and `main` is not Production.
- Database Production target is exclusively Neon branch `production` (`br-damp-shape-b3xlh4nr`) in project `purple-base-63944903`.
- This manifest inventories the SQL migration files currently present in the repository `migrations/` directory. Git blob SHA values below identify exact Git objects; they are **not SHA-256 checksums of file contents**.
- The Git repository's commit history provides versioned storage of these files. This manifest is not a full database backup and does not substitute for a verified database snapshot/export.

## Numbered migration inventory
| File | Git blob SHA | Status |
|---|---|---|
| 001_initial_schema.sql | b7e65e86d6c8b7ebac18b407d58c1a9c1d1e77df | Repository file |
| 002_phase2_business_foundations.sql | bf9095d71829a79e873b4918e984c2bba39c4055 | Repository file |
| 003_rls_policies.sql | 75279bf8689a1ce1da4230a0fdfd4f37aa16e2d9 | Repository file |
| 004_operational_workflow.sql | 5ff8f1e2f31b1d67484d7c405c9213367a67d45a | Repository file |
| 005_inventory_and_receipts.sql | c88913fc9f93c4fc959db8b76988f92d96ba5bdb | Repository file |
| 006_workflows_and_stages.sql | c10539e961f489733661d1b08b0aaf01e52bcdfc | Repository file |
| 007_rls_operational_policies.sql | 3b3f8509f032f30392abc1b963cae3facbe438df | Repository file |
| 008_financial_master_data.sql | 067486a3bfa486b177216aec306e8592e270bf8f | Repository file |
| 009_cost_obligations_and_payment.sql | 1b14064ff3f850e4e61e7ed24dec6dc97dbf5cdb | Repository file |
| 010_ap_ar_cash.sql | d10b1a98fec930350bdb3b2fbeea301e51429699 | Repository file |
| 011_cash_advances_and_schedules.sql | d292d44ed697b2734ed8b988f28a4fd870cd4115 | Repository file |
| 012_accounting_ledger_and_fx.sql | e64a328956d1fce313316666885657dd7a3b6de7 | Repository file |
| 013_fx_management.sql | 9bb05d7d83ea15de33635c6c423d3837c3fc8d0e | Repository file |
| 014_settlement_and_profitability.sql | 853f8291a84f6e20c08ee0f286f3e9151abe2301 | Repository file |
| 015_regulatory_source_registry.sql | 4a968fe285eb02d02331d120f8c76ca7cb962f7e | Repository file |
| 016_reporting_bi.sql | a4ce054705d1b2805dca6803e93415bca38112bb | Repository file |
| 017_neon_auth_identity_mapping.sql | b92c06bf8977523d63373a5dc1921c46b99a5fe4 | Repository file |
| 018_rls_request_transaction.sql | 18d33dd5f9c5a2fa97cc43740c795edb93f592dc | Repository file |
| 019_project_auth_rbac_export_ops.sql | 4edb0c19e86b7fe72674209c6f594da9166ab128 | Repository file |
| 020_runtime_default_privileges.sql | 18fef737fb11325a08f6033cbba5b543ca89d493 | Repository file |
| 021_secure_runtime_auth_resolver.sql | 0397fc04b79aa2736e3535bdab4fa1ba42b960f8 | Repository file |
| 022_persistent_user_notifications.sql | 9a588ade43a7192a7d977f98e14bdb8415345521 | Repository file |
| 023_accept_project_invitation.sql | 77e1c8fc4fe238d6d66202878b48747dc2962589 | Repository file |
| 024_tracking_evidence_write_policies.sql | 406927a59307c07364638e14eba432b41c9e14df | Repository file |
| 025_project_rbac_read_after_write.sql | 65494af3f2bfba81ada64a11f3cb460bf21a4e53 | Repository file |
| 026_fix_invitation_acceptance_ambiguity.sql | 8970058543d82e0d01cf87b5c1374c574816a420 | Repository file |
| 027_workflow_and_shipment_child_rls.sql | 9d36af93ad2a1d30cd52a4195fae1eac178e921c | Repository file |
| 028_project_foundation_module_config.sql | b47a475e2362427cb0da97d0351d3dd319a700a4 | Repository file |
| 033_candidate_truck_trip_gps_and_fk_indexes.sql | 2e28c49e510b094268eaad572915c135f1bfabf3 | Repository file |
| 034_regulatory_document_engine.sql | 1d6e697d7c94a8ea6dcf34b9acceae62bc2c7b34 | Repository file |
| 036_validate_production_schema_invariants.sql | aaadadb934f9c8569188dc28f18b1dfcb2bcd96c | Repository file |
| 037_restrict_security_definer_execute.sql | 90d0a737a87f5786d8af19ed04e74574637be4c7 | Repository file |
| 038_admin_managed_neon_auth_user_lifecycle.sql | 9bb1adb70dd7090f5ba1cc2b62c2e244dac587d9 | Repository file |
| 039_project_scoped_contract_cob_cycles.sql | 8759522670a0b556bf4e81cf013c85efbb2abf82 | Repository file |
| 040_finance_reporting_notifications.sql | 45533451905b3b3a2fbc1b5ce25a03e5e2fb56b4 | Repository file |
| 041_finance_notification_rls_recipient_guard.sql | b6e40ff778390c13ea9a1203c1e67d161a179e72 | Repository file |
| 042_inventory_reservation_release_reason.sql | fb7a65821a7a955848c967ce828db9a821c4c57b | PREPARED — NOT APPLIED |

## Inventory findings
- Numbered migration files currently present: 37.
- Numbered migration sequence gaps from 001 through 042: 029, 030, 031, 032, 035.
- Additional non-numbered SQL files: PKE_BACKEND_MIGRATION_PREFLIGHT.sql, PKE_Migration_019.sql, PKE_Migration_020_Runtime_Default_Privileges.sql.
- Migration 042 is a prepared artifact only; it is not applied to Neon Production and remains gated by a verified fresh database backup and the owner's approval for its exact SQL/SHA-256.
- Historical migration files are not to be rewritten. Corrections must use a new numbered migration.
- Before claiming the migration archive is complete, reconcile sequence gaps against the nested migrations directory, legacy PKE_Migration files, and Neon `public.migration_history`. A filename gap is not proof that a migration is unapplied; ledger and file hashes must be compared.

## Backup gate
As of 2026-11-19, Neon exposes only the older snapshot `PKE-target-pre-migration-20261115`; a new snapshot attempt was rejected with `snapshots limit exceeded`. No fresh full Production database dump/export was verified. Therefore the database backup requirement remains **BLOCKED**, and no Production schema/data change may proceed until a fresh, verified backup exists without creating a branch.

## No-new-branch rule
Do not create GitHub or Neon branches. Do not use temporary Neon migration branches. Database migrations, once backup and owner approval gates pass, must be applied directly to the existing Neon Production branch only.
