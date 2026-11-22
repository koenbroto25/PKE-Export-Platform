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


## 8. Project Manager master-data workflow implementation
P17-B now exposes Project-scoped API endpoints backed by the existing P2A change-request table:
- `GET /api/v1/projects/:projectId/master-data-change-requests`
- `POST /api/v1/projects/:projectId/master-data-change-requests`
- `PATCH /api/v1/projects/:projectId/master-data-change-requests/:requestId`
- `PATCH /api/v1/admin/projects/:projectId/master-data-change-requests/:requestId/decision`

A PM with `pks.master_data.change_request.view/manage` can create and edit their own draft proposals for organization/facility master data, then submit them. Submitted proposals are immutable to the requester. Only an independent Platform Admin can approve/reject; the existing database trigger applies approved organization/facility proposals, enforces field allowlists, stale-snapshot checks and audit events. This is a controlled change-request workflow, not direct PM write access to canonical rows.

**Not yet implemented:** PM proposals for global port master records, port crosswalk identities, route records, terminal/loading services, warehouse/port geospatial features, and source-rights registry. Those remain Admin-only until a separate Project-scoped proposal model is added. The current PM workflow must not be described as full port/route edit capability.

## 9. Machine-readable PKE candidate staging
`docs/P17B_PKE_SEED_CANDIDATES.json` records sourced candidates and shipment evidence separately from canonical facility records. All candidate entries are non-importable until rights, identity, facility classification, current operating status, and evidence review are complete. Company capacity disclosures are explicitly labelled kernel-input capacity, never PKE output capacity. Government shipment records are shipment evidence, not proof of ownership of a KCP.

## 10. Validation status after API addition
- Static contract coverage added for Project-scoped PM request/list/submit and independent Admin decision endpoints.
- Existing database migration 077 already provides the RLS table, PM permission grants, maker-checker trigger, field allowlists and canonical write restrictions.
- No UAT data was inserted or updated during this API implementation.
- No source registry rights were approved, no source data imported, no Production mutation and no Vercel deployment.
- Runtime build/test execution remains pending; this branch was not deployed and no Vercel quota was consumed.


## 11. P17-B Kumai logistics simulation — UAT only
A non-canonical simulation has been seeded in `public.p17b_logistics_simulation_scenarios` for Project `[TEST FIXTURE] PKE Alpha Export Project`:
- Scenario code: `SIM-PKE-KUMAI-001`
- Scenario ID: `a394ace9-02ef-452f-862a-70b514f8568f`
- Graph: 6 nodes and 5 directed edges.
- Chain: CBU KCP candidate at Tempenek/Kumai → candidate road leg → Pelabuhan Bumiharjo → terminal candidate → PKE loose-bulk loading candidate → port warehouse.
- All nodes are `simulation_only=true` and `verification_status=unverified`.
- The graph is stored separately from canonical `ports`, `pks_sites`, `pks_port_routes`, `port_terminals`, `port_loading_services`, and `warehouses`. It does not pollute master data.

Research anchors:
- CBI Group public disclosure: PT Citra Borneo Utama and group KCP capacity of 180,000 MT/year. This is group-level KCP capacity, not a site-level PKE output capacity: https://www.citraborneo.co.id/
- Pelindo Multi Terminal public profile: Bumiharjo, Kumai; terminal category metadata includes dry bulk; published berth 392.9 m, stacking yard 1,560 m² and warehouse 2,616 m²: https://pelindomultiterminal.com/portfolio/bumiharjo-bagendang

Unverified/unknown values deliberately remain null:
- KCP and port coordinates.
- Actual road geometry, road distance and travel time.
- PKE-specific terminal acceptance, equipment, loading rate and berth suitability.
- Warehouse PKE suitability and storage capacity.
- Truck restrictions, operating windows and current service availability.

**No live dispatch, route ranking or export commitment may use this scenario.** It is explicitly ineligible until the PKS site, route survey, port/terminal PKE acceptance, loading service and warehouse capacity are independently validated.

## 12. PM/Admin editing and governance
Migration 099 adds Project-scoped change requests for canonical port, road route, terminal, loading service and warehouse records. PM drafts are submitted and only an independent Platform Admin may approve/reject. Migration 100 adds audit events. Migration 102 adds Project-parent scope checks and stale-snapshot protection before submit/approval.

Migration 101 adds the isolated simulation graph. PMs with `pke.logistics.master.change_request.manage` can create/update simulation scenarios directly within their Project; this only changes non-canonical simulation data. Admins retain global review authority. The graph validator requires all six node types, five edge relationships, simulation-only flags and unverified status.

## 13. UAT migration ledger through 102
- 099 `099_p17b_logistics_scenario_and_pm_change_requests.sql`: applied.
- 100 `100_p17b_logistics_change_audit.sql`: applied.
- 101 `101_p17b_logistics_simulation_graph.sql`: applied.
- 102 `102_p17b_logistics_request_scope_guard.sql`: applied.
- UAT manifest: `migration_history_manifest_uat_001_102.json`.
- The attempted insert into canonical global master tables was rejected by the existing P16 Admin guard. The transaction rolled back; no CBU organization or real port/PKS master row was created. The separate simulation graph is the only seeded scenario data.

## 14. Updated acceptance
| Gate | Result |
|---|---|
| Project-scoped PM change-request API for port/route/terminal/loading/warehouse | IMPLEMENTED; runtime acceptance pending |
| Admin decision workflow and audit events | IMPLEMENTED; runtime acceptance pending |
| Cross-Project target and stale snapshot guard | IMPLEMENTED; runtime acceptance pending |
| Isolated logistics simulation schema and graph validation | APPLIED |
| Kumai evidence-based simulation seed | SEEDED: 6 nodes / 5 edges |
| Simulation node status and no-canonical-pollution check | PASS |
| Road distance/time and PKE loading acceptance | UNKNOWN / NOT VERIFIED |
| PM authenticated HTTP test and full test suite | NOT EXECUTED |
| Production / Vercel | NOT TOUCHED |


## 15. Semantic graph integrity — Migration 103
Migration 103 enforces that each of the five directed relationships has the correct source/target node types, unique edge IDs, and the complete required edge set. It rejects a graph that merely contains six node labels but connects them incorrectly.

## 16. Permission backtest
UAT database checks using the Alpha Project's fixture PM account:
- `pke.logistics.master.view`: true.
- `pke.logistics.master.change_request.manage`: true.
- Same PM against the Beta Project: no permission.
- Runtime role `app_runtime_secure` can read the Alpha simulation graph under PM session context.
- Runtime role PM successfully updated the scenario status to `draft`; owner/admin reset it to `simulation`. Both transitions are recorded by the simulation audit trigger.
- Canonical CBU company row count remains zero; the failed canonical seed transaction did not bypass P16 Admin protection.
- The seeded graph remains 6 nodes / 5 edges, simulation-only and unverified.


## 17. CBU capacity-source reconciliation
A fresh check of company sources found conflicting capacity statements:
- CBUT official company profile locates its factory at Tempenek, Kumai and states 600 MT kernel/hour or 219,000 MT/year KCP capacity.
- CBUT Sustainability Report 2023 states 600 MT kernel/day or 192,000 MT/year KCP capacity and historical company PKE output of 101,760 MT.
- CBI Group website states group KCP capacity of 180,000 MT/year.

These values are not reconciled and must not be silently averaged or selected. The simulation now stores all three as source claims, sets current/site-level PKE output capacity to NULL, and flags company confirmation as required. Historical PKE output is retained only as a 2023 historical disclosure.


## 18. Frontend workbench integration
The PKE logistics workbench is now embedded in the existing **Pelabuhan & Gudang** page:
- PM/Admin can view the Project simulation chain, evidence sources, assumptions and unverified gaps.
- PM/Admin with the new permission can edit the non-canonical simulation graph, source evidence and assumptions.
- PM can create, edit own draft, and submit canonical port/route/terminal/loading-service/warehouse change requests.
- Platform Admin can approve/reject submitted canonical proposals. The backend scope/stale-snapshot guards and audit triggers remain authoritative.
- Frontend role-page access includes the new logistics permissions.

## 19. P17-A source registry onboarding and Admin workbench (22 November 2026)

The UAT source registry now contains ten source candidates, registered as metadata only:
- `kemenhub_djpl_port` — primary national port-master candidate (`dwh-djpl-port`).
- `hubdat_ferry_ports` — supplementary ferry-port directory.
- `hotosm_id_sea_ports` — supplementary ODbL geometry, separate from official port facts.
- `unece_unlocode` — external identifier crosswalk.
- `bmkg_marine_data` — marine forecast candidate.
- `pelindo_bumiharjo_profile` — manual terminal reference.
- `cbu_company_profile` — company facility reference.
- `adm_pke_traceability` — downstream supply-chain discovery only.
- `telkomsat_ais` — Indonesia-only paid AIS evaluation candidate.
- `open_ais_contributor` — conditional contributor-network candidate.

**Fail-closed UAT verification:** 10/10 sources remain `pending_review` and `enabled=false`; field-purpose permissions = 0 (including allowed fields = 0); ingestion runs = 0; staging records = 0. No source was approved, no provider called, and no source payload was imported. The registry is a controlled source inventory, not an approval decision.

A Platform Admin-only source governance workbench is now integrated into the Pelabuhan & Gudang page. It supports source registration, source-right review, field-purpose permissions and explicit enablement. The UI calls the existing P17-A API; database constraints and API checks remain authoritative. Rights approval requires evidence URL, terms URL, attribution, expiry and explicit internal-processing permission. Activation remains blocked until those requirements are met.

### 19.1 Fresh source-rights findings

- MaritimHub's official catalogue identifies `dwh-djpl-port` as the DJPL national port master and lists Excel/JSON resources, with catalogue metadata updated 21 November 2026. This establishes a strong source candidate, not an unrestricted commercial-use license.
- BMKG's current marine API documentation describes public GET endpoints and UTC forecast timestamps. BMKG Regulation 1/2025 separately classifies certain special marine information/API services as fee-based. The exact entitlement and use rights for the documented endpoint must be confirmed before provider calls or customer display.
- Telkomsat's AIS FAQ describes monthly paid API subscriptions and a limit of 150 calls per day. It is not a free production feed and no subscription is authorized.
- Open AIS publishes a separate data-use license. Access depends on qualifying receiver contribution; a restricted raw AIS/tracking service requires written Open AIS permission and opt-in from affected data providers. It is not treated as a no-condition feed.

### 19.2 Acceptance after source-registry work

| Gate | Result |
|---|---|
| Ten candidate source records in UAT registry | PASS — metadata only |
| Rights fail-closed state | PASS — 10 pending / 0 enabled |
| Field-purpose permissions | PASS — 0 rows / 0 allowed |
| Ingestion runs and staging | PASS — 0 / 0 |
| Platform Admin source registry UI | IMPLEMENTED — runtime/browser acceptance pending |
| National port dataset rights | BLOCKED_EXTERNAL — explicit approval required |
| BMKG endpoint entitlement and commercial/display rights | BLOCKED_EXTERNAL — confirmation required |
| AIS provider access/rights | BLOCKED_EXTERNAL — no subscription/contribution activated |
| Real port, producer/KCP, route, terminal/loading and warehouse data | BLOCKED_EXTERNAL — source and operational evidence pending |
