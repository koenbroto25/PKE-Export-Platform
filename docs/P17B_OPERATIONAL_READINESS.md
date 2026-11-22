# P17-B Operational Readiness Checkpoint
**Date:** 2026-11-22  
**Status:** IMPLEMENTED FOUNDATION / OPERATIONAL DATASET NOT READY  
**Execution branch:** `p17b/operational-readiness-20261122`  
**Parent:** `f1/project-scoped-cob-20261119`  
**Scope:** UAT only. No Production migration, Production data mutation, PR merge, or Vercel deployment.

## 1. Verified baseline
- Neon project: `purple-base-63944903`.
- UAT branch: `br-young-boat-b3re832d` (`p0-preview-uat-20261120`), READY.
- Manifest file: `migration_history_manifest_uat_001_098.json`.
- Manifest ledger: 98 rows = 16 baseline + 82 applied, no pending rows.
- Migration 098: `098_p17b_port_identity_geospatial.sql`, SHA-256 `d5e035f92ac2f679111ff717724c1683aa4666574c8aae5e830e501301179445`, status applied at `2026-11-22T02:02:18.243Z`.
- Manifest purpose explicitly UAT-only; never use it as Production migration evidence.

## 2. P17-B schema reused
Migration 098 reuses existing `ports`, `pks_sites`, and `pks_port_routes`. It adds:
- `port_external_id_crosswalk`: external port identities with matching method, confidence, review status, source reference, payload snapshot and evidence hash.
- `port_geospatial_features`: versioned GeoJSON features bound to exactly one port or PKS site, with source, license, attribution, geometry SHA-256, validity period and review stamps.
- `pks_port_routes.route_geometry_feature_id` and `distance_method`; allowed methods: straight_line, road_network, operator_quote, gps_track, manual_estimate.
- Admin-only mutation and constrained project read access for geospatial data.

## 3. Live UAT read-only counts
Read directly from `br-young-boat-b3re832d`:
| Table | Rows |
|---|---:|
| ports | 1 |
| pks_sites | 2 |
| partner_organizations | 7 |
| pks_port_routes | 0 |
| port_loading_services | 0 |
| port_terminals | 0 |
| warehouses | 1 |
| port_geospatial_features | 0 |

All visible port/PKS and organizations are test fixtures or synthetic data. Examples include `[TEST FIXTURE] Alpha Export Port`, `[TEST FIXTURE] Alpha Kernel Crushing Plant`, and `[TEST FIXTURE] Alpha Processing Mill`. They must not be used for recommendations or treated as real business records. The lone port and PKS have no evidence SHA-256; fixture status overrides their nominal verification labels.

## 4. Source research candidates — not yet approved for ingestion
- DJPL MaritimHUB Data Master Pelabuhan, identifier `dwh-djpl-port`, catalog describes national port identity/codification and offers Excel/JSON. Catalog updated 2026-11-21: https://maritimhub.kemenhub.go.id/splt/data/catalog/34
- Directorate General of Land Transportation ferry port list 2026: https://hubdat.kemenhub.go.id/id/informasi-berkala/daftar-pelabuhan-penyeberangan-di-indonesia-ringkasan-data-statistik-2026/
- PT Agro Jaya Perdana 2025 palm-kernel supplier mill list, contains mill names, parent companies, coordinates and UML IDs: https://www.agrojayaperdana.com/lib/documents/LIST%20SUPPLIERS%20PALM%20KERNEL.pdf
- Cargill certification list contains identified palm oil mills and KCP entries: https://www.cargill.com/sustainability/palm-oil/palm-certification
- SMART Tbk RSPO page lists mills and kernel crushing plants: https://smart-tbk.org/en/berkelanjutan/sertifikasi/rspo/

These are candidate research references only. No source's legal reuse rights were assumed. No port/master or producer records have been imported. Mill evidence does not by itself prove a site is a kernel crushing plant or that it produces PKE. Verify legal entity, physical site, facility type, operating status, production/output and provenance independently.

## 5. Operational eligibility policy
A port/route can become a primary PKE reference only after all required dimensions are evidence-backed:
1. Producer organization is an active `processor`, verified with evidence document/reference and evidence SHA-256.
2. PKS/KCP is active, operational and verified; facility classification must be `kernel_crushing_plant` or an approved integrated mill/KCP classification.
3. Road route links that PKS to the selected port; actual road-network distance and travel estimate, method, source/reference, checksum/evidence and independent review are present.
4. Port is active and verified with evidence.
5. Port has an active, verified PKE loading service and an appropriate terminal/handling capability.
6. Associated warehouse, when used for planning, is linked to that port/terminal and has evidenced storage mode/capacity and verification.
7. Data-source rights permit internal processing and any purpose to which a field is put.

Ranking must be lexicographic by eligibility gates before optimization: ineligible/unverified entries never outrank eligible verified routes. Among eligible routes rank by documented road distance/time, then PKE handling compatibility, evidenced warehouse capacity/availability, operating constraints and source freshness. Straight-line proximity is a discovery aid only and must never be displayed as road distance. Unknowns remain unknown; do not infer capacity or route time.

All nationally listed ports may live in the general port master. Ferry ports, passenger ports and other non-cargo entries must retain their category and must not be represented as export-PKE-capable absent direct evidence.

## 6. Acceptance ledger
| Gate | Result |
|---|---|
| Migration 098 checksum / UAT manifest | PASS |
| Reuse of existing port / PKS / route master | PASS |
| Schema and UAT inventory inspection | PASS |
| Real national port data ingested | NOT DONE — rights review and ingestion pending |
| Producer / PKS / KCP real data reconciled | NOT DONE |
| Crosswalk matched with reviewed evidence | NOT DONE |
| PKS-road-port routes with source and checksum | NOT DONE |
| PKE loading service + verified terminal | NOT DONE |
| Warehouse-port/terminal operational link | NOT DONE |
| Real GeoJSON port/PKS/road features with rights and review | NOT DONE |
| Runtime API / live authenticated HTTP acceptance | NOT EXECUTED |
| Browser UAT | SKIPPED / NOT EXECUTED |
| Vercel | SKIPPED; no deployment attempted |
| Production | NOT TOUCHED |

## 7. Known CI/deployment diagnostic
A Vercel Preview on branch `f1/project-scoped-cob-20261119`, commit `daafdb010a4aa788de698c841fa29580704a5c01`, failed on 2026-11-20. Build log reports three migration ledger contract tests attempting to read migrations 045–047 removed by `.vercelignore` (ENOENT), alongside total 116 passing, 6 failing, 4 skipped. This is a deployment packaging/test-scope defect; it does not invalidate Migration 098 or the UAT manifest. No re-deployment attempted.

## 8. Next implementation sequence
1. Finish source-rights review in P17-A before enabling any maritime provider/source or ingesting its payload.
2. Obtain the official DJPL dataset through its documented resource; preserve original bytes, retrieval time, dataset version, license/terms, attribution and SHA-256. If rights do not explicitly permit internal processing, keep it in manual research notes only.
3. Stage all nationally listed ports as general port-master candidates with a source crosswalk. Keep unmatched/ambiguous rows pending; only maker-checker-approved matches can bind to existing ports.
4. Reconcile processor organization → mill → KCP using evidence from source registries and company disclosures; keep ordinary palm oil mills distinct from KCPs and PKE producers.
5. Populate PKS-to-port road routes only from actual road-network evidence/route provider or verified operator evidence, with source, checksum, distance method and independent review.
6. Add terminal/loading PKE service and linked warehouse only where operator/port documentation proves compatibility, status and capacity.
7. Import versioned GeoJSON only when source license, attribution and derivative/internal use allow it; validate geometry/hash and maker-checker.
8. Complete API authorization + crosswalk/geospatial/route prioritization tests on UAT; retain explicit NOT EXECUTED labels for browser UAT and deployment until actually run.
9. Re-read manifest, schema, row counts, RLS/privileges, tests and audit evidence. Do not claim P17-B operational completion while any required data gate above remains open.

## Guardrails
- UAT branch only; never treat this file or manifest as Production evidence.
- No Production writes, migrations, imports, or synthetic business data.
- No source ingestion before P17-A rights approval and field-purpose authorization.
- No fabricated routes, coordinates, road distance, travel time, cargo capabilities, warehouse capacity, or facility output.
- Do not mark unexecuted API/browser/deployment tests as PASS.
- Do not merge PR #2 or trigger Vercel deployment in this checkpoint.
