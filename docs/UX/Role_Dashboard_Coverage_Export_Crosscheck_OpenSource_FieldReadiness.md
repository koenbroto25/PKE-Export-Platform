# Role Dashboard Coverage, Export Cross-check, Open-source Strategy & Field Readiness

**Date:** 25 November 2026  
**Branch:** `p20/platform-continuation-20261123`  
**Status:** Assessment baseline; UX-00–03 source/CI checkpoint is not operational acceptance.

## 1. Dashboard coverage

Dashboard quality is judged by whether the role can answer: **What is my scope? What requires action now? What is blocked/overdue? Who owns the next step? What evidence supports the status?** A shared role-aware landing/navigation framework is foundational, but does not replace task-specific operational dashboards.

| Persona | Required dashboard | Current coverage assessment | Priority gaps |
|---|---|---|---|
| Platform Admin | Control Tower | Foundation | user/identity governance, integrations/source health, audit, provider rights, system-wide risk |
| Project Admin | Project Admin cockpit | Foundation | provisioning queue, PM appointment, project access, master-data governance |
| PM | Project 360 | Foundation/partial | critical path, exception ownership, readiness gates, shipment reconciliation, milestone hand-offs |
| Procurement/Contract | Supply & Contract | Partial | demand vs supply, supplier commitment, PO/contract amendments, risk/variance |
| PKS/Production | Production & Quality | Partial | production batches, yield, packing, QA release/hold, lot genealogy |
| QC/Lab | Quality | Partial | sample custody, test status, spec variance, release decision, evidence |
| Warehouse | Warehouse/Inventory | Partial | lot/bin/custody, stock states, receiving, reservation, pick/dispatch, reconciliation |
| Dispatcher/Transport | Dispatch board | Partial | assignment, truck/driver, route/ETA, checkpoint, delay, deviation, POD |
| Driver/Transporter | Driver task portal | Partial | assignment-only tasks, safe checklist, offline capture, sync state, proof |
| Checker/Field | Field task workspace | Partial | assignment scope, evidence capture, review queue, discrepancy, independent confirmation |
| Master of Loading/Port | Port & Loading | Partial | terminal/berth readiness, loading shift, tally, survey, downtime, quantity variance |
| Shipping/Marine | Shipment 360 | Partial | vessel nomination, voyage, port call, ETA/AIS freshness, departure evidence |
| Compliance/Document | Export Document Center | Partial | document completeness/version compare, legal source, readiness, missing/invalid, owner |
| Finance | Finance & Settlement | Partial | RAB/commitment/obligation/invoice/payment/paid/FX/settlement distinction, reconciliation |
| Buyer | Buyer Portal | Partial/restricted | only granted shipment, milestones, quantity, document view, acknowledgement |
| Supplier/PKS | Supplier Portal | Partial/restricted | assigned orders, submissions, quality/quantity, shipment updates |
| Auditor | Audit & Evidence | Partial | read-only evidence chain, audit timeline, discrepancy resolution history |
| Viewer | Read-only overview | Partial | scope, freshness and clearly defined no-action access |
| Funder | Restricted projection | Deliberately limited | only approved financial projection and visibility grants |

**Conclusion:** UX-00–03 provides role-aware discovery and dashboard foundation, not complete dashboards. Most domain personas remain **PARTIAL**. No role is certified for complete operational task performance until the required workflows are validated end-to-end.

## 2. Dashboard design requirements

Every dashboard must include, where supported by authoritative data:
- scope/Project and role context;
- actionable queue (not just counts);
- overdue, blocked, mismatch and missing-evidence exceptions;
- owner, due date, next safe action;
- status source and freshness;
- drill-down to transaction/evidence/audit;
- filters and pagination;
- no false zero when data is unavailable;
- permission-filtered metrics and actions;
- mobile layout for field personas.

## 3. Shipment/export cross-check architecture

Use five distinct evidence/context layers:

1. **Tier 1 transaction evidence:** approved contract/amendment, supplier commitment, verified weighbridge, warehouse receipt and lot, QA/COA, packing/loading tally, survey, shipping instruction, B/L, invoice, packing list, PEB/NPE, COO, permits, levy/payment and buyer acceptance where applicable.
2. **Tier 2 official/reference evidence:** DJBC/INSW, Kemendag/BPDP, BPS, official port/terminal authority, vessel registry, licensed AIS source.
3. **Tier 3 open/public context:** OSM road/geometry, route engine, public aggregate trade data and secondary context. This may flag anomalies; it cannot verify an individual shipment.
4. **Counterparty/independent evidence:** buyer, supplier, transporter, terminal, surveyor, bank and signed/verified documents.
5. **Cross-check engine:** field-level comparisons, unit/basis normalization, tolerances and variance; states MATCH, MISMATCH, MISSING, STALE, UNVERIFIED, EXTERNAL CONFIRMATION PENDING; reviewer, owner, due date, resolution, source, version and audit.

Compare the full chain: contract/quantity/value → producer/facility/capacity → production/quality → lot/warehouse received/available/held/reserved → truck/tare/gross/net/checkpoints → port/weighbridge/tally → loading/survey → vessel/B-L → invoice/packing list → PEB/NPE/COO/permit → destination/settlement. Conflicts must not be auto-overwritten.

## 4. Open-source support recommendation

Recommended initial toolkit:
- **OpenStreetMap:** roads, geospatial features and proximity. Respect ODbL attribution and assess database-sharing obligations before redistributing derived/cached data.
- **OSRM:** self-hosted routing, distance/time matrices and map matching; output remains advisory until PKE truck restrictions and verified road constraints are modeled.
- **QGIS/PostGIS:** spatial QA, duplicate/coordinate checks, port/PKS proximity and route review.
- **UN Comtrade:** aggregate/historical HS/partner/period statistics only, not shipment verification.
- **Tesseract OCR/OpenRefine:** optional local document extraction/data-cleaning; confidence and human review required.

Do not activate multiple route engines at once. Benchmark OSRM first; evaluate GraphHopper only if its profile/licensing/feature fit is materially better.

## 5. Indonesian export process verification boundary

The platform should represent the documented export sequence and evidence milestones (PEB submission, regulatory/Lartas validation where applicable, customs document/physical review, NPE, loading, departure). The authority remains the official customs/INSW source. Public aggregate datasets and open-source context are not substitutes for official shipment-level acceptance.

## 6. Field-operational gap priorities

### S0 — before declaring field-ready
- identity- and assignment-bound mobile task access;
- durable offline queue, idempotent sync and explicit conflict/rejection states;
- evidence capture/upload, checksum and server receipt;
- GPS accuracy/permission states and trusted timestamp;
- Project/assignment isolation, logout cache cleanup and secure storage policy;
- shipment/Project export reconciliation with evidence drill-down;
- shipment document readiness and version comparison;
- live API/RLS negative tests and device/browser UAT.

### S1 — operational completeness
- production/packing/quality and lot genealogy;
- warehouse scan-first receive/move/pick/dispatch and custody;
- dispatch board and truck/driver/route/ETA/checkpoint/deviation/POD;
- port/terminal/loading shift/tally/survey/downtime/actual quantity;
- vessel nomination/port call and authorized AIS freshness;
- Finance cross-check and settlement status semantics;
- buyer/supplier scoped portals.

### S2 — intelligence and control
- integration/source health and freshness dashboard;
- public/open-data provenance and licensing controls;
- portfolio KPI/reporting, exception prioritization and audit intelligence.

## 7. UX-04A current implementation checkpoint

The current branch includes a local draft-capture workspace, GPS capture states, image validation, IndexedDB Blob retention, checksum and principal/project-filtered draft display. It is **local-only**. Assignment membership validation, server sync, upload, conflict resolution, secure cache lifecycle, barcode/QR, API/RLS tests and field UAT remain open. Refer to `docs/UX/UX-04A_Field_Mobile_Offline_Implementation_Checkpoint.md`.

## 8. Readiness conclusion

- Role dashboard coverage: **PARTIAL**.
- Export cross-check engine: **PARTIAL / DESIGN REQUIRED**.
- Open-source support: **RECOMMENDED, ADVISORY ONLY**.
- Field readiness: **NOT PASS**.
- UX-04A local draft capture: **IMPLEMENTED IN SOURCE; CI PENDING ON CURRENT HEAD**.
- Vercel deployment: **SKIPPED BY INSTRUCTION**.
- Production database/migrations: **UNCHANGED**.
