# UX Role Dashboard Coverage, Export Cross-check, Open-source Strategy & Field Readiness
**Branch:** `p20/platform-continuation-20261123`  
**Assessment date:** 25 November 2026  
**Scope:** Source audit of the current frontend/dashboard and operational requirements. Vercel deployment/browser UAT intentionally skipped.

## Executive conclusion
The current UX provides a **shared, permission-filtered Role Dashboard with role-specific focus cards and links**, not 38 independent operational dashboards. Platform Admin, Project Admin, and PM have dedicated cockpit panels. All other roles receive role-focused text and links, a set of common permission-gated metrics, task queue when permitted, and a cross-module Export Process source-coverage list.

This is a useful access/discovery foundation, but it is **not yet a full field-operational dashboard suite**. A role's page links/workflow availability must not be interpreted as a complete operational view, a verified process, or an export cross-check.

## 1. Existing dashboard view inventory
### Shared dashboard primitives confirmed in source
- Active Project and active role identity/context panel.
- Role focus cards derived from `ROLE_META`: label, focus, expected output, and links.
- Common permission-gated metric cards: tasks, contracts, warehouse receipts, inventory lots, transport trips, shipment allocations, documents, AP/AR and journal entries.
- Task status summary and a small list of work items when task permissions allow.
- Export Process source coverage/readiness rows.
- Platform Admin Control Tower portfolio view.
- Project Admin configuration/member/role/access cockpit.
- PM Project 360 navigation cockpit.
- Data source failure is surfaced; permission-hidden data is distinguished; dashboard boundary explicitly says API/RLS remain authoritative.

### Coverage classification
**A — usable view foundation:** current dashboard and source links exist.  
**B — discoverable but only workflow/module view:** role card and links exist; role-specific metrics/queue/board are not synthesized.  
**C — critical operational view missing or not evidenced:** requires new UX/API/data contract and validation.  
**D — intentionally unavailable:** access is disabled until dedicated grant/API/RLS and evidence exist.

| Role family / roles | Current view | Maturity | Gap required for operational support |
|---|---|---:|---|
| Platform Admin | Admin cockpit, portfolio/projects, user/access, PM appointment discovery, Control Tower | A/B | Actionable governance queue, account lifecycle status, failed provisioning, PM appointment/replacement/deactivation/history, audit delta, cross-Project exception drilldown |
| Project Admin | Project-scoped configuration, members, roles, access review links | A/B | Project setup checklist, member/role expiry/revocation queue, configuration change diff, project readiness and exceptions |
| PM | Project 360 cockpit links, common metrics, task queue, export-chain source coverage | A/B | Actual integrated Project 360: milestones, critical path, stage owner, due/overdue, blockers, data freshness, quantity/document reconciliation, hand-offs, decisions |
| Internal Auditor | Reports and documents links; permission-gated read-only source metrics | B | Evidence graph, immutable event timeline, compare expected-vs-actual, exception disposition, source hashes, sampling and audit exports |
| Procurement Officer / Contract Manager | Contracts, Workflow Center, task links | B | PR/PO/commitment pipeline, vendor comparison, contract obligations, supplier readiness, delivery variance, approval aging, procurement exception board |
| PKS Site Manager / Production Manager | PKS/Supplier, operations, Workflow Center, warehouse links | B/C | Site production board, shift plan/actual, capacity, yield, production batch genealogy, downtime, planned/actual stock, supply-to-demand |
| Packing Supervisor | Workflow Center, operations, warehouse | B/C | Packing order, package count/weight, bag/lot/seal/label genealogy, shift throughput, variance and rework |
| QC Officer / Laboratory Officer / QA Manager | QC/Lab/QA workflows and task links | B/C | Sampling queue, sample custody, test methods/results, pending review, trend, lot hold/release, independent release, rejected/retained samples |
| HSE Officer | HSE workflow, Compliance, tasks | B/C | Site inspection schedule, hazard/incident register, stop-work gate, corrective action owners/due dates, risk matrix and evidence |
| Warehouse Manager / Officer / Inventory Controller | Warehouse page; receipts/lots common metrics | A/B | Live stock by lot/location/status, hold/released/reserved/available, FIFO/FEFO, scale proof, movement trace, discrepancy, cycle count, custody |
| Transport Manager / Dispatcher | Operations, workflow and task links; trip metric | B/C | Dispatch board, truck/driver capacity, route/vehicle constraints, schedule/ETA, SLA, trip map, queue, exceptions, proof and rescheduling |
| Driver / Transporter | Transporter portal and tasks | B/C | Mobile-first assigned trip, offline checkpoint capture, GPS/photo/time evidence, QR scan, navigation, queue/sync state, failed sync/conflict handling |
| Checker | Operations/Workflow/Tasks | B/C | Independent verification inbox, assignment/segregation check, checkpoint compare, exception/discrepancy review, evidence signing |
| Field Manager | Operations, Workflow, Tasks; trip/checkpoint data | B/C | Field activity map, shift roster, site/trip board, offline/sync health, geofence alerts, missing evidence, overdue and escalation |
| Master of Loading | Maritime, shipment allocation, tasks | B/C | Shipment-to-vessel readiness, independent approvals, quantity/quality release, loading sequence, ticket/tally/survey reconciliation |
| Loading Supervisor / Operator | Maritime, Workflow, shipment allocation, Operations | B/C | Shift board, berth/slot, equipment/crew, loading rate, downtime, start/stop, actual tally, drafts/survey, planned-vs-loaded reconciliation, signoff |
| Terminal Representative | Port, maritime, workflow, shipment allocation | B/C | Terminal readiness, berth/slot confirmations, restrictions, terminal actual events, independent checker, hand-off evidence |
| Shipping Agent | Maritime, workflow, shipment allocation | B/C | Vessel/voyage milestone board, port-call status, carrier docs, ETA/ETD, booking, missing documents, source freshness and external status |
| Marine Surveyor | Workflow, documents, shipment allocation | B/C | Survey queue, independent quantity/cargo condition, certificate validation, reconciliation and signed evidence |
| Ship Master | Maritime, Workflow, Documents, Tasks | B/C | Vessel readiness, cargo acknowledgement, voyage/port-call timeline, missing statutory confirmations, ship/shore hand-off and evidence |
| Regulatory Compliance Officer | Regulatory core / Compliance / Reports | B/C | Shipment-specific country/commodity checklist, source version, Lartas/permit, validity, decision rationale, exception/waiver, verified official status |
| Document Officer | Documents/Workflow/Tasks | B/C | Shipment checklist, field-level document comparison, versions, expiry, missing/rejected/approved queue, LC/document discrepancies, issuance hand-off |
| Supplier / Buyer | Dedicated partner portal, task links | B | Assigned objects, acknowledgement, requirement fulfillment, shipment milestones, quality claims, response SLA, limited evidence sharing and no cross-scope access |
| External Provider | Document and task link | B | Requested evidence inbox, upload/validation state, rejected/expired items, explicit scope and status; no internal transaction access |
| Finance Officer | Finance, Cash Advances, Reports; AP/AR metrics | A/B | Shipment-cost view, budget/commitment/obligation/actual separation, cost allocation, FX exposure, accrual, due/overdue, cash planning and source reconciliation |
| Accountant | Journal entries, Reports | B | Source-document-to-journal reconciliation, draft/review/posting queue, reversal reason, close period, audit evidence and balance comparison |
| Cashier/Treasury | Payment instructions and Finance | B/C | Authorized payment instruction queue, bank execution evidence, matching/reconciliation, rejected/duplicate payments, status and segregation of duties |
| Funder | Disabled until dedicated sharing controls exist | D | Do not enable until grant/visibility API, explicit sharing scope, expiry/revocation, RLS, audit and dedicated portal pass |
| Viewer | Read-only Warehouse/Shipment/Reports links | B | Saved views, evidence-backed status, source freshness and permission-safe drilldowns |

## 2. Does every role have a dashboard view?
**Technically: yes, there is one shared Dashboard route that resolves active roles and shows role cards.**  
**Operationally: no, not all roles have an adequate role-specific work view.**

Current roles are grouped into dashboard families; they should not all be forced into one dashboard with identical metrics. The next dashboard program should implement role-specific boards over shared reusable components, not duplicate pages unnecessarily.

### Dashboard implementation priority
1. **Admin Governance Board** — platform/project lifecycle, access anomalies, PM ownership, provisioning, approvals, source health.
2. **PM Project 360** — critical path, workstream status, blockers, owners, due dates, export readiness, reconciliation exceptions.
3. **Field Operations Board** — map/dispatch/trip/site/warehouse/port, offline devices, evidence missing, safety incidents and shift.
4. **PKS Production & Quality Board** — production batches, capacity, yield, packing, sample/lab, QA release/hold.
5. **Warehouse & Inventory Board** — available/held/reserved/in-transit by lot/location; receipts, movement, reconciliation.
6. **Transport/Dispatch Board** — vehicle/driver, assignment, route constraints, ETA, checkpoints, delay, proof, checker.
7. **Port & Loading Board** — berth/slot, vessel, loading shifts, planned/actual/tally/survey, downtime and signoff.
8. **Shipping & Export Documents Board** — booking/voyage/port call, B/L, certificate, permit, PEB/NPE, status provenance, missing/mismatch.
9. **Compliance Board** — source/rule version, checklist, expiry, Lartas, decision/reviewer, exceptions.
10. **Finance & Accounting Board** — budget, commitment, obligations, invoice, accrual, payment instruction, execution evidence, bank reconciliation, FX.
11. **Partner Board** — buyer/supplier/provider/transporter only their assigned objects, deadlines, requested evidence and acknowledgement.
12. **Audit Board** — evidence chain, actor/time, event log, hash, exception resolution and read-only exports.

## 3. Open-source / public-source cross-check: should PKE use it?
**Yes, but as supporting evidence and anomaly detection—not as the authority for a shipment transaction.** The export process must primarily reconcile PKE's own records against independent official or counterparty evidence.

### Recommended open-source components
| Component | Recommended use | Limit / legal consideration |
|---|---|---|
| OpenStreetMap data | Road graph, geocoding context, route map, facility/port proximity, map matching context | ODbL attribution and share-alike obligations may apply to database/derived database; review distribution model and attribution |
| OSRM | Self-hosted road routing, route duration/distance matrix, nearest-road and GPS map-matching | Route profile is not proof a road is legally/physically usable by loaded trucks; needs local restrictions and validation |
| GraphHopper | Alternative self-hosted routing; truck profiles/road attributes, map matching and route analysis | Verify exact profile, data coverage and custom vehicle restrictions; do not treat predicted ETA as official |
| QGIS / PostGIS | Spatial analysis: PKS-to-port suitability, facility buffer, route and geospatial anomaly audit | Geospatial data provenance and licenses must be recorded |
| UN Comtrade public API | Aggregate export/import trend, HS classification/partner/monthly anomaly context | Aggregate statistical data, publication lag/revisions, not transaction/consignment-level verification; API limits apply |
| Open standards/format libraries | CSV/JSON/XML/GeoJSON/GPX parsing, OCR and document extraction where licensing and privacy are acceptable | Treat extracted values as unverified until linked to source document and reviewed |

### Proposed source hierarchy for cross-check
- **Tier 1 — official/authorized transaction evidence:** DJBC/CEISA/INSW, official permit/quarantine/port systems, terminal, carrier/shipping line, bank, authorized surveyor, buyer/supplier signed evidence.
- **Tier 2 — counterpart evidence:** approved B/L, invoice, packing list, COA, survey/tally, weighbridge ticket, seal record, booking, voyage/port-call acknowledgement.
- **Tier 3 — PKE internal operational records:** contract, PO/commitment, production batch, QA release, inventory movement, warehouse receipt, trip/checkpoint, loading ticket, allocation, invoice/journal.
- **Tier 4 — public/open-source context:** OSM/route engine, UN Comtrade aggregates, public port/commodity/official reference datasets.
- **Tier 5 — manual/unverified:** user-entered status, unsupported screenshot, stale feed or incomplete upload.

Never elevate Tier 4 or Tier 5 to official confirmation. Store source, timestamp, freshness, license, retrieval method, and confidence.

## 4. Export Cross-check engine — required comparisons
A proper cross-check is a data comparison engine with discrepancy records, not a collection of links.

| Chain | Required comparison | Evidence | Result |
|---|---|---|---|
| Contract → Buyer requirement | Product/HS/specification, qty, tolerance, Incoterm, destination, packaging, delivery window | Approved contract and buyer requirements | Requirement mismatch |
| PR/PO → Supplier commitment | Supplier, facility, committed qty/date/spec, terms | PR/PO/commitment approval | Uncommitted/short supply |
| Production → QA | Batch, input/output, yield, packing, sample, lab method/result, QA release/hold | Production/packing/QC/Lab/QA evidence | Yield/quality/release mismatch |
| Warehouse receipt → Inventory | Gross/tare/net, scale, lot, location, status, duplicate receipt | Signed weighbridge/GRN, lot ledger | Quantity/lot discrepancy |
| Inventory → Reservation/Shipment allocation | Available vs held/reserved/in-transit; FIFO/lot selection | Inventory movement and allocation | Over-allocation or wrong lot |
| Truck dispatch → Warehouse/Port | Vehicle/driver, trip, route, checkpoint, weight, time, GPS, seal | Dispatch, checkpoint, scale and photos | Missing route proof/delay/weight mismatch |
| Port custody → Loading | Port/terminal, berth/slot, stock transfer, loading shift, start/stop, tally, downtime | Port hand-off, loading ticket, independent tally/survey | Planned vs actual loaded |
| Loading → Survey → B/L | Loaded quantity, survey quantity, B/L quantity, cargo description, vessel, voyage, seals | Survey certificate, carrier draft/final B/L | Quantity/document mismatch |
| B/L/Commercial docs → Customs | Exporter, consignee, HS, qty, weight, value, currency, country, port, permit references | Final documents, official PEB/NPE evidence | Document field mismatch / missing authority status |
| Customs → Shipment departure | PEB/NPE status, customs release, vessel departure, date and port | Official authority evidence, carrier/port evidence | Not cleared / not departed / status conflict |
| Shipment → Invoice/Finance | Shipped quantity, unit price, value, currency, Incoterm, receivable/payable, fees, FX | Contract, invoice, shipment proof, journal | Commercial/financial variance |

### Cross-check engine data model requirements
- Comparison profile per Project, commodity, buyer, contract, and process stage.
- Tolerance configuration with unit, basis, approval, effective date and version.
- Discrepancy record: field, expected, observed, difference, severity, source refs, reviewer, owner, due date, resolution, audit.
- Evidence provenance: document ID, version, source type, issuer, timestamp, hash, capture actor/device, GPS when appropriate, verification status.
- Status taxonomy: `MATCH`, `MATCH_WITH_TOLERANCE`, `MISMATCH`, `MISSING`, `STALE`, `UNVERIFIED`, `EXTERNAL_CONFIRMATION_PENDING`, `NOT_APPLICABLE`.
- Never silently normalize or overwrite discrepant evidence. Store both source values and approved resolution.

## 5. Field operations gaps
These are the largest gaps between a support platform and a field-ready export execution system.

### P0 — field evidence and offline reliability
- Mobile-first, role-specific task screens.
- Offline-first queue for trip/checkpoint, receiving, QC sampling, packing, loading, photos, signatures and notes.
- Explicit pending-upload, synced, rejected, conflict and retry states.
- Capture device/time, user, GPS accuracy, optional geofence, photo/video hash, object/lot/trip/shipment linkage.
- Avoid location capture outside task context; permissions and retention policies must be explicit.
- QR/barcode scanning for lot, pallet, bag, seal, truck, ticket and shipment IDs.
- Conflict handling and duplicate capture/idempotency.

### P1 — physical operation controls
- Weighbridge integration and calibration/zero/tare/net evidence.
- Receiving and dispatch custody transfer with independent checker.
- Lot genealogy: production → packing → warehouse → truck → port → vessel.
- Quality hold/release gates must block allocations and loading where applicable.
- Shift board, crew/equipment, loading plan, tally, downtime and actual quantities.
- Route restrictions by vehicle type/weight/dimensions, road condition, ferry/bridge, weather/season and local approval.
- Checkpoint exception, delay/ETA, missing GPS/photo, route deviation and escalation.

### P2 — export transaction verification
- Document field comparison against approved contract and shipment data.
- Regulatory requirements by HS/product, destination and current rule version.
- Permit/license expiry and source verification.
- PEB/NPE official status integration only through authorized/approved access; manual evidence must be clearly labeled and independently reviewed.
- B/L, invoice, packing list, COA, survey and customs fields reconciliation.
- Shipment event timeline with source/freshness and event conflict resolution.
- Invoice/payment/bank evidence reconciliation.

### P3 — decision support and resilience
- Exceptions prioritized by impact, shipment criticality, due date and owner.
- Offline incident/maintenance, HSE, site downtime.
- Back-up procedures for network/device failure.
- Integration health, stale feed and provider-license monitoring.
- Analytics with definitions, source lineage, freshness, and no inferred completion.

## 6. Acceptance tests for field-ready UX
1. Every active role resolves to correct dashboard focus and only authorized links/metrics.
2. No inaccessible source is displayed as zero; use `—` and a permission/source-failure reason.
3. Project context change prompts confirmation, clears project-scoped state and navigates to safe landing.
4. Deep-link and API/RLS tests reject cross-Project access.
5. Driver/transporter offline capture persists locally, syncs idempotently, and shows conflicts.
6. GPS/photo evidence has actor, time, accuracy, linkage and hash; evidence is not accepted as authoritative solely by geotag.
7. Checker cannot verify their own action where independence is required.
8. Warehouse quantities reconcile by units and source tickets; holds/reservations cannot be counted as available.
9. Loading quantity is reconciled across allocation, ticket/tally, survey and B/L; tolerance decisions are versioned.
10. Customs/permit status distinguishes official API confirmation, document evidence, manually entered, stale and unavailable.
11. Each discrepancy is assigned, reviewed, resolved and auditable; no silent overwrite.
12. Role usability testing measures task completion, errors, navigation, and time-to-find critical work.

## 7. Open-source / external source references
- OpenStreetMap copyright/licence: https://www.openstreetmap.org/copyright (ODbL and attribution).
- OSRM documentation: https://project-osrm.org/docs/ (routing, table, map matching, trip and nearest services).
- OSRM source: https://github.com/Project-OSRM/osrm-backend (BSD; OSM routing engine).
- GraphHopper source: https://github.com/graphhopper/graphhopper (Apache-2.0; routing, map matching, road attributes).
- UN Comtrade API: https://comtrade.un.org/en/api-docs (public preview limits and trade-data APIs; aggregate statistics).
- Indonesia Customs export process reference: https://kendari.beacukai.go.id/mandatory/ekspor.html (PEB, NPE, document review, loading and departure process).
- Mandatory PEB document upload: https://www.beacukai.go.id/mandatory-upload-dokap-peb (official guidance; policy and applicability must be verified per shipment/date).
- INSW definition: https://jdih.kemenkeu.go.id/kamus-hukum/sistem-indonesia-national-single-window?id=69fe040704492dc583568fe86088a73c (integration context; actual API/data access requires authorization).

## 8. Recommended delivery order
1. UX-00–UX-03: source/runtime/CI evidence; correct false-zero metrics; verify safe context switching; validate all active role dashboard routes.
2. UX-04A: Field Mobile Evidence & Offline Sync (driver, checker, transporter, warehouse and field roles).
3. UX-04B: Production/Quality/Warehouse genealogy and readiness.
4. UX-04C: Transport/Dispatch/Port/Loading operational boards.
5. UX-05: Export Cross-check & Reconciliation engine, discrepancy workflow and source provenance.
6. UX-06: Official/authorized customs, permit, quarantine, terminal, carrier and bank integrations.
7. UX-07: Analytics/portfolio/role-specific KPI, source freshness and anomaly detection.
8. Complete local and GitHub CI validation; browser/mobile UAT remains deferred until user authorizes deployment.

## Final status
- **Dashboard coverage foundation:** implemented.
- **Role-specific focus cards:** implemented for role catalogue.
- **Admin and PM cockpit:** implemented.
- **Permission-gated source metrics and export source coverage:** implemented.
- **Dashboard maturity across all roles:** **NOT PASS** — role families still need specialized boards and operational data synthesis.
- **Open-source cross-check:** **RECOMMENDED** for road/geospatial context and aggregate anomaly analysis; not sufficient to independently verify export transactions.
- **Field readiness:** **NOT PASS** — offline evidence capture, physical custody/scale integration, loading reconciliation, official status confirmation, and exception workflows need implementation and UAT.
- **UX-00–UX-03 runtime/CI:** pending evidence; do not mark full pass solely from source contracts.
