# P17-B — PKE Initial Seed Register & Editability Requirements
**Prepared:** 2026-11-22  
**Branch:** `p17b/operational-readiness-20261122`  
**Scope:** Evidence-backed candidate records for UAT staging design. This document is not a Production import authorization and does not assert that all named entities own KCPs.

## 1. Source hierarchy and data semantics
Use evidence tiers so that the application never conflates a government-recorded shipment, a company's own facility disclosure, and a third-party traceability list.

- **Tier A — Indonesian government record:** Badan Karantina Indonesia / PPID reports and export event publications. Best for evidence that an exporter owned a particular shipment, the product was PKE, the quantity/date/destination and named port.
- **Tier B — facility owner's official disclosure:** company website, sustainability report or facility page. Best for company identity, named KCP/mill, stated products and stated capacity/location. Capture publication/retrieval date; do not infer current operating status beyond the page.
- **Tier C — downstream buyer / traceability disclosure:** buyer's PKE traceability mill registry and UML ID. Strong evidence that the mill appears in that buyer's PKE supply chain, but it is not a government national register, does not prove direct export by the mill, and may not identify the actual KCP.
- **Tier D — industry directory / third-party list:** discovery only; require independent corroboration before matching or promotion.

## 2. Candidate records with direct source evidence

### A. Government-recorded PKE exporter / shipment
| Field | Candidate value | Evidence / qualification |
|---|---|---|
| Legal entity | PT Awana Sawit Lestari | Named as owner of PKE shipment by Badan Karantina Indonesia, 15 Jan 2026 |
| Activity | PKE export shipment | 3,200.625 MT, bulk cargo, MV Brother 36 |
| Loading place | Pelabuhan Laut Belang-Belang, Mamuju, Sulawesi Barat | Government report says fumigation supervision occurred at this port service location and vessel departed for China |
| Destination | China | Government report |
| Date | 13 Jan 2026 activity; publication 15 Jan 2026 | Do not treat as a recurring schedule or current port capability |
| Confidence | High for shipment event; unverified for company-owned production/KCP | Export ownership does not prove facility ownership or production |
| Source | https://karantinaindonesia.go.id/bali/berita/3200-ton-bungkil-sawit-di-ekspor-menuju-china-karantina-sulbar-awasi-proses-fumigasi | Government evidence |

### B. Government-named PKE companies in West Sumatra (historical)
| Organization candidate | Evidence | Confidence / caveat |
|---|---|---|
| PT Usaha Inti Padang | Listed as one of three PKE companies under BKP Class I Padang in 2022 annual report | Historical government report; verify current status, exact legal identity, facility and whether producer/exporter |
| PT Wira Inno Mas | Same report | Same caveat |
| PT Bina Pratama Sakato Jaya | Same report | Same caveat |
Source: https://ppid.karantinaindonesia.go.id/doc/10/Laporan%20Tahunan%20BKP%20Padang%20Tahun%202022_compressed.pdf

### C. Company-published KCP / PKE facilities
| Organization | Facility / location | Publicly stated capability | Evidence | Confidence / caveat |
|---|---|---|---|---|
| STA Resources / PT Karya Serasi Jaya Abadi (KSJA) | KCP, Tebing Tinggi, North Sumatra | 600 MT/day kernel processing; produces CPKO and PKE | https://www.sta.co.id/page/kernel-crushing-plant/en | Company disclosure; verify coordinates, active status and current capacity |
| PT Sinar Jaya Inti Mulya (SJIM) | Lampung facility, Banjar Sari / Metro Raya | Up to 600 MT/day kernel; produces CPKO and PKE | https://sjai.co.id/sinar-jaya-inti-mulya/ | Company disclosure; confirm exact site coordinates/legal operator and current capacity |
| PT Sinar Jaya Inti Mulya (SJIM) | Baamang, East Kotawaringin, Central Kalimantan | Company page states up to 1,000 MT/day kernel capacity; produces PKE | https://sjai.co.id/sinar-jaya-inti-mulya/ | Company disclosure; distinguish kernel processing capacity from PKE output |
| Citra Borneo Utama | KCP facility, company reports total 600 MT/day kernel crushing capacity | Company identifies PKE as product and KCP capacity | https://www.citraborneoutama.co.id/about/bussines | Company disclosure; facility-level site coordinates and active status need confirmation |
| PT REA Kaltim Plantations | Cakra Oil Mill (COM) and Satria Oil Mill (SOM), Kutai Kartanegara, East Kalimantan | Both identified as having kernel crushers; 2025 report says two KCPs processed 44,139 tonnes of palm kernels and lists PKE among supplied materials | https://www.rea.co.id/index.php/business/palm-oil-mills-and-kernel-crushing-plants ; https://www.rea.co.id/sustainability/sustainable-development/certification | Company disclosure with facility names; 2025 traceability data. Need exact KCP point coordinates and verify 2026 certificate validity/status |

### D. Downstream PKE traceability registry (not government)
ADM's January–December 2024 report explicitly says it is the complete list of mills in ADM's global PKE supply chain, sourced indirectly through third parties. It includes Indonesian mill names, parent company, region, coordinates, PKE marker and UML ID. This is valuable for discovering upstream candidate mills, not a definitive national producer register and not proof that every listed mill owns a KCP or directly manufactures/exports PKE.
Source: https://www.adm.com/globalassets/sustainability/sustainability-reports/2024-reports/pke-traceability-2024.pdf

Examples visible in the report:
- ACEH TRUMON ANUGERAH KITA — Aceh — UML PO1000014955 — PKE marker.
- AGRO WIRA LIGATSA — Pasaman Barat, West Sumatra — UML PO1000008158 — PKE marker.
- AIR KAMPAR — Kampar, Riau — UML PO1000014222 — PKE marker.
- ALAM GROUP / ANUGERAH LANGKAT MAKMUR — Langkat, North Sumatra — UML PO1000004557 — PKE marker.
- ALAM JAYA PERSADA — Kutai Kartanegara, East Kalimantan — UML PO1000011167 — PKE marker.
- AMAL TANI — Langkat, North Sumatra — UML PO1000004295 — PKE marker.
- AGRINA SAWIT PERDANA / KHARISMA ALAM PERSADA — Tapin, South Kalimantan — UML PO1000009021 — PKE marker.
These are **mill-registry PKE supply-chain candidates**, not verified KCPs. Preserve the UML ID as external identity and require match/review before creating a PKS/KCP entity. Coordinates from a third-party traceability registry are discovery coordinates and must not be treated as surveyed or road-routing-grade.

## 3. Government export evidence for market/port candidates
- Badan Karantina Indonesia reports a 7,800 MT PKE consignment for New Zealand in July 2026, shipped from Pulau Baai, Bengkulu, first to Pelabuhan Panjang, Lampung, then onward for export. This demonstrates a documented PKE logistics corridor involving Pulau Baai and Panjang; it does not prove permanent PKE loading capability, terminal ownership, warehouse capacity, or that the inland leg is road transport. Source: https://karantinaindonesia.go.id/uji-standar/berita/penuhi-permintaan-selandia-baru-7800-ton-pke-bengkulu-dikirim-melalui-pelabuhan-pulau-baai
- Badan Karantina Indonesia reports a 14,000 MT PKE export to New Zealand from Lampung in July 2026, but the page does not identify the new exporter by name. Use as regional market evidence only; do not create an unnamed company. Source: https://karantinaindonesia.go.id/uji-terap/berita/fasilitasi-eksportir-baru-karantina-lampung-lepas-14-ribu-ton-pke-dikirim-ke-selandia-baru
- Badan Karantina Indonesia's 2025 performance-report extract for Bangka Belitung reports 38,975,000 kg Palm Kernel Expeller among 2025 plant-quarantine export commodities. This is aggregate provincial/regional reporting context, not a producer list. Source: https://karantinaindonesia.go.id/repository/main-web/performance-reports/01M5GNZ8YQZ2PRFMAFN94X9XHH.pdf

## 4. Recommended initial application seed scope
Do not load every palm oil mill as a PKE producer. Stage three linked but separate entity classes:
1. `partner_organizations`: verified legal entities (exporter, processor, terminal/warehouse operator) with legal name and source evidence.
2. `pks_sites`: physical palm oil mill / KCP / integrated mill-KCP locations. Facility type must distinguish `palm_oil_mill`, `kernel_crushing_plant`, and `integrated_mill_kcp`. A PKE supply-chain mill marker is an evidence attribute, not automatic KCP classification.
3. PKE shipment evidence: record shipment as a dated activity/event with source, not as a permanent facility capability. If current schema lacks a dedicated shipment-evidence table, retain the source as a linked document/reference in an appropriate evidence registry until a dedicated table is designed.

Seed status defaults:
- `candidate` / `unverified` for every discovered entity.
- `verified` only after independent reviewer confirms legal identity, physical site, facility type and source evidence.
- Never derive capacity of PKE output from kernel input capacity. Store capacity with its own unit and capacity basis (kernel input/day vs PKE output/day).
- Store external identifiers (UML ID, RSPO PalmTrace ID, official port code, UN/LOCODE) in source crosswalks; never use them as internal primary keys.
- Keep historic, current, and unknown operating statuses distinct.

## 5. Admin and Project Manager editability — required acceptance
Current source inspection shows P17 maritime source registry, rights, crosswalk and geospatial endpoints are guarded by `requireAuth + requireAdmin`. This is Admin-only today. It does **not** yet prove that Project Managers can edit PKE company/PKS/route master data. Do not claim PM editability until the API and UI have been implemented and tested.

Required model:
- Platform Admin: full global master-data administration; manage source rights, data dictionaries, duplicate merges, publish/archive, and reviewer assignment.
- Project Manager: create and edit records within assigned project scope; maintain draft candidate organization/PKS/route/warehouse/service records; attach evidence; submit for review; see reviewer feedback. PM cannot approve their own submissions, change global source rights, or promote an unverified candidate to an operational recommendation.
- Independent Admin or delegated authorized reviewer: maker-checker verification, approve/reject with reason and evidence; no self-approval.
- All changes: audit before/after values, actor, project, timestamp, source, evidence checksum, review status and change reason.
- Soft archive/supersede rather than destructive delete for referenced master data.
- Changes to an approved record should create a new reviewable revision or return it to pending review; the prior approved snapshot remains traceable.
- Project-scoped visibility and write authorization must be enforced server-side and in RLS, not only hidden in the UI.

Acceptance tests required:
1. Admin can create/edit/verify/archive a global port, producer organization, PKS/KCP, route, terminal, loading service and warehouse.
2. PM can create/edit only records in assigned project scope and submit for review.
3. PM cannot approve own record, edit source rights, or alter global records outside assignment.
4. Cross-project reads/writes are denied.
5. Rejected/unverified records never appear as eligible PKE recommendations.
6. Audit trail preserves all revisions and evidence references.
7. Concurrent edits detect stale versions and do not silently overwrite.
8. API and UI tests run against UAT with authenticated Admin and PM test identities.

## 6. Import gate / current state
- These records are a research seed register, not imported to Neon.
- P17-A source-rights approval is still a prerequisite for bulk reuse/caching of third-party or government datasets; the government public-page facts above can be used as manually cited evidence, but bulk extraction rights must be checked separately.
- No Production write, migration, or Vercel deployment was performed.
- Existing UAT fixtures remain untouched.
- Next step: build a staged import file from source data after rights approval; reconcile identities and attach source snapshots/checksums; then implement PM-scoped edit workflow before enabling the operational master UI.
