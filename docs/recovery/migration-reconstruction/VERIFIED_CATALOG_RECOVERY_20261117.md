# Verified catalog recovery — migrations 029–035

Date: 2026-11-17
Scope: read-only comparison of legacy Neon pre-migration parent branch and its production child.
Project: `lucky-glitter-99553107`
Parent: `br-gentle-thunder-b3z7y3bk` (`p03-backend-hardening-test`)
Child: `br-calm-glade-b3nrleet` (`production`)

## Actions performed

- Re-enabled and started the disabled compute endpoint on the **legacy parent branch only** to permit read-only catalog inspection.
- No SQL writes, DDL, DML, migration execution, restore, or Production-branch changes were performed.
- The parent branch reports migration_history max id 27 (27 rows); the child branch records 029–035 as applied with their historical SHA-256 values.

## Verified parent → child catalog deltas

| Catalog object | Parent | Child | Net observation |
|---|---:|---:|---|
| Public base tables | 80 | 152 | +72 |
| RLS enabled tables | 80 | 152 | all tables |
| FORCE RLS tables | 0 | 71 | +71 |
| Constraints | 875 | 2,134 | +1,266 added; 7 removed |
| Foreign keys | 151 | 423 | 5 parent NOT VALID FKs now VALID |
| NOT VALID foreign keys | 5 | 0 | all five validated |
| RLS policies | 282 | 507 | +226 added; 1 removed |
| Indexes | 196 | 693 | +497 added |
| Public functions | 57 | 120 | +64 added; 1 removed/replaced |
| Trigger event rows | 0 | 152 | 152 trigger event rows across 34 tables |

The parent→child diff spans the entire history after the parent snapshot; it is not by itself proof that every delta belongs exclusively to migration 033. Use it as a verified recovery inventory, not as a claim of byte-identical original SQL.

## Migration 030 — exact operation recovered

The five exact FK names and definitions were confirmed as NOT VALID on the parent and VALID on the child:

1. `buyers.buyers_country_code_fkey`
2. `pks_sites.pks_sites_country_code_fkey`
3. `ports.ports_country_code_fkey`
4. `project_members.project_members_project_role_same_project_fkey`
5. `projects.projects_export_country_code_fkey`

The candidate SQL in `030_validate_production_foreign_keys.sql` now contains the five corresponding `ALTER TABLE ... VALIDATE CONSTRAINT` statements. This is reconstructed operational equivalence, not original bytes. Historical checksum remains untouched. Production already applied it; do not rerun.

## Migration 033 — evidence improved, original SQL still not recovered

The 72 additional public tables were identified by comparing parent and child catalogs:

`ai_action_requests, ai_feedback, ai_runs, ai_source_citations, audit_events, buyer_demand_forecasts, buyer_facilities, buyer_product_requirements, buyer_requirement_attributes, buyer_visibility_grants, facility_capacity_records, facility_certifications, facility_contacts, facility_operating_periods, facility_products, fiscal_periods, idempotency_keys, inventory_holds, inventory_reconciliations, inventory_reservations, knowledge_chunks, knowledge_document_versions, knowledge_documents, knowledge_ingestion_runs, loading_segments, loading_tickets, matching_candidates, matching_runs, outbox_events, partner_organizations, payment_evidence, payment_instruction_approvals, payment_instructions, payment_invoice_allocations, payment_reconciliations, payment_verifications, port_anchorages, port_berths, port_channels, port_depth_observations, port_equipment, port_loading_services, port_operating_limits, port_terminals, port_tide_observations, product_attributes, product_hs_classifications, product_quality_results, product_quality_samples, product_variants, production_batches, project_module_configuration_versions, regulatory_assessment_results, regulatory_assessments, regulatory_rule_conditions, regulatory_rule_documents, regulatory_rule_exceptions, regulatory_rule_versions, regulatory_rules, shipment_document_links, shipment_events, vessel_certificates, vessel_identifiers, vessel_name_history, vessel_nominations, vessel_port_assessments, vessel_port_calls, vessel_tracking_positions, warehouse_bins, warehouse_equipment, warehouse_reservations, warehouse_zones`.

All 152 child tables have RLS enabled; 71 have FORCE RLS. The full object-level policy/constraint/index/function/trigger delta is not yet packaged as executable SQL. Do not promote the unrelated 033 repository candidate whose checksum differs from Production. Keep migration 033 blocked until a full reviewed DDL reconstruction is generated from the catalog inventory and checked against every dependent FK, policy, trigger, grant and function.

## Migration 035 — policy evidence

Child catalog confirms:
- `ai_feedback.pke_admin_all`: platform-admin ALL policy.
- `ai_feedback.pke_ai_feedback_select`: user-id predicate OR platform-admin predicate.
- `ai_runs.pke_admin_all`: platform-admin ALL policy.
- `ai_runs.pke_ai_runs_update`: user-id predicate OR platform-admin predicate.

This is consistent with the inference that the latter admin predicates are redundant under PostgreSQL permissive-policy OR semantics. It does not prove the exact historical 035 SQL bytes. Preserve review status pending policy-owner approval and behavioral RLS tests.

## Remaining work

1. Generate and review a complete schema-object reconstruction package from the verified parent/child catalog diff, especially the 72 new tables and their columns/defaults/constraints/policies.
2. Recover or reconstruct the exact 029, 031, 032 and 034 source SQL; catalog state alone does not prove original bytes.
3. Validate all reconstructed SQL in an isolated temporary branch; never reapply 029–035 to Production.
4. Reconcile repository migration manifest and runner discovery so only authenticated, checksum-verified historical migrations are considered applied.
5. Keep 033 blocked until its full security-sensitive tenant RLS and GPS/report definitions are proven.

## Safety

Legacy parent compute endpoint was enabled and started solely for read-only catalog queries. It may incur compute usage while active. No database contents were changed. Active application Production branch was not touched.
