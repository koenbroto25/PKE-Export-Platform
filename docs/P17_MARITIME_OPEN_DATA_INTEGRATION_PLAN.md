# P17 — Maritime Open Data Integration & Vessel Export Control Tower
**Document status:** OWNER-ACCEPTED PLAN / IMPLEMENTATION NOT STARTED  
**Revision:** 1.0  
**Date:** 2026-11-22  
**Repository:** `koenbroto25/PKE-Export-Platform`  
**Execution branch:** `f1/project-scoped-cob-20261119`  
**Scope authority:** Master Implementation Plan Rev 1.7, §7, §17.2–17.4, Sprint 08, §56.43 and this P17 addendum.

> This document refines P17 only. It does not authorize Production changes, paid subscriptions, hardware purchases, AIS receiver deployment, Vercel deployment, PR merge, or changes to P0–P16. The accepted Indonesia-only vessel-position boundary and all safety/data-rights constraints in Master Plan §56.43 remain binding.

---

## 1. Objective and intended outcome

Deliver a Project-scoped maritime data capability that helps PKE shipping and export operations prepare vessel calls, loading windows, documents and shipment milestones. Use open/public Indonesian port, geospatial and weather information wherever its access and reuse conditions permit. Add AIS as a replaceable situational-awareness source, not as a navigation or safety-of-life system.

P17 must provide:
1. A reconciled Indonesian port/terminal reference layer with source provenance and data-quality status.
2. A navigational-aids reference layer only where an authoritative, current and reusable source is confirmed.
3. Marine forecast/warning context from BMKG with issue/validity timestamps and stale-state handling.
4. Vessel identity and identifier history using IMO as preferred identity where available; MMSI remains time-bounded.
5. An Indonesia-focused AIS provider abstraction and controlled test path; no provider dependency is mandatory for manual voyage/port-call operation.
6. Project-scoped voyage, vessel nomination, port compatibility, shipment events, loading evidence and buyer visibility workflows.
7. An Export & Vessel Readiness Control Tower with READY / AT RISK / NOT READY decisions based on explicit operational checklist evidence—not AIS alone.

### 1.1 Non-goals

- Global continuous AIS tracking or global historical track ingestion.
- Navigational chart replacement, route guidance for safe navigation, or safety-of-life decisions.
- Automated port clearance, pilotage clearance, customs release, bill-of-lading issuance, loading authorization or regulatory certification.
- Treating OSM/HOTOSM geometry as an official port boundary, berth, depth, bathymetry, terminal capacity or operational restriction.
- Treating forecast as observed weather or AIS proximity as proof of arrival.
- A second PM task system, second inventory ledger, second finance ledger or second shipment source of truth.
- Purchase/subscription, new receiver hardware, receiver deployment, paid API, new infrastructure, Production migration or Vercel deployment under this plan.

---

## 2. Data-source catalogue and adoption decisions

The word **free** is not a sufficient rights assessment. For each provider, separately record access cost, account/API conditions, rate limits, permitted internal use, customer-facing display, redistribution, retention/caching, derived data, attribution and termination conditions. No source is production-enabled until the required rights gate is documented.

| Source | P17 use | Access/cost model to evaluate | Adoption decision | Required guard |
|---|---|---|---|---|
| Kemenhub MaritimHub — Data Master Pelabuhan | National port master, identifiers, region/work area, port authority/UPP references and available status attributes | Public catalogue/resource access; API/developer account and G2G/G2B/G2C access may require registration | **Primary port-master candidate** | Confirm exact resource schema, API onboarding, update cadence, G2B/commercial use, bulk download, caching and redistribution rights before automated sync |
| Kemenhub / Ditjen Hubla / PPID | Official SBNP, SROP, VTS, navigation-district and related reference documents where published | Public documents/catalogues; may be downloadable rather than stable API | **Authoritative supplementary source** | Store document URL, publication/version/effective date, issuing authority and checksum; do not infer current operational status from an old PDF |
| BIG / Pushidrosal / IHDC | Geospatial and hydrographic reference candidates | Access and reuse conditions vary; some chart/hydrographic data may be restricted | **Reference/review only until rights verified** | Never substitute for current official nautical charts, notices or harbour-master instructions; do not scrape restricted services |
| BMKG Maritime API | Marine forecast, wave/wind/current/visibility/tide/warning fields actually exposed by documented endpoints | Public GET API; API key may not be required for documented public endpoints | **Primary weather/forecast candidate** | Confirm endpoint-level fields, units, spatial resolution, update frequency, attribution, retention and commercial redistribution terms; persist issue/validity time |
| HOTOSM / HDX Indonesia Sea Ports (OpenStreetMap-derived) | Port/harbour/terminal candidate geometries and map reference | Open data under ODbL; no per-request API charge for downloaded dataset | **Supplementary geospatial layer** | Attribution and ODbL obligations; legal review of derived/combined database distribution; record dataset version; do not promote OSM tags to official operational facts |
| UNECE UN/LOCODE | International port/location code normalization | Published releases; use release/version and review reuse terms | **Identifier cross-reference** | Store release identifier and source; not a berth, depth, capacity or clearance source |
| NGA World Port Index | Supplementary global port reference | Public reference download; check current terms and release | **Optional cross-check only** | Not an authoritative substitute for current Indonesian port/terminal restrictions |
| IMO GISIS / Equasis | Vessel particulars, company and safety reference lookups | Public/account-based lookups; API, bulk access and reuse rights are not assumed | **Manual verification/reference only until terms confirmed** | Record retrieval date and source; no scraping or bulk indexing without permission |
| VesselAPI | AIS snapshot, vessel lookup and port-call experiments | Reported free tier: 150 requests/month; commercial/customer display may require provider approval | **Test adapter only** | Reconfirm current quota, endpoint credit cost, coverage and written display/redistribution approval; hard rate cap; no buyer exposure until approved |
| AISHub | Community AIS position feed | Community exchange; receiver/feed contribution required | **Conditional future partner source** | Not free-without-conditions; only enable after receiver eligibility, feed quality and commercial display rights are confirmed |
| AIS Friends | Community AIS position/history/navigation aids | Community exchange; receiver contribution and quality/uptime criteria | **Conditional future partner source** | Same receiver, data quality, privacy, coverage and reuse review as AISHub |
| Data Docked | AIS and port-call trial | Reported 20 trial credits; not a recurring free allowance | **Short evaluation only** | Reconfirm credit consumption and terms; no production dependency or recurring free-tier assumption |
| Telkomsat AIS Sandbox | Indonesian vessel/AIS sample demonstration | Public sandbox/demo; production API and rights not established by sandbox availability | **Demo/partner evaluation only** | Do not treat sandbox as production API, service-level commitment or redistribution grant |
| Carrier, ship agent, terminal and port authority | Confirmed ETA/ETD, nomination, berth/anchorage, actual call and loading milestones | Partner-provided operational evidence; commercial/contractual terms | **Operational confirmation source** | Verify authority and evidence; retain actor, source, timestamp and supporting document |

### 2.1 Source URLs

- MaritimHub API documentation: https://maritimhub.kemenhub.go.id/api-doc
- MaritimHub Data Master Pelabuhan: https://maritimhub.kemenhub.go.id/splt/data/catalog/34
- MaritimHub SBNP catalogue candidate: https://maritimhub.kemenhub.go.id/splt/data/catalog/data-resource/4
- Hubla: https://hubla.dephub.go.id/
- Kemenhub PPID Laut: https://ppid.kemenhub.go.id/informasi-setiap-saat/laut
- BMKG Maritime API: https://maritim.bmkg.go.id/apidoc
- HOTOSM / HDX Sea Ports Indonesia: https://data.humdata.org/dataset/hotosm_idn_sea_ports
- UNECE UN/LOCODE: https://unlocode.unece.org/publications/
- NGA World Port Index: https://msi.nga.mil/Publications/WPI
- IMO GISIS: https://gisis.imo.org/Public/Default.aspx
- Equasis: https://www.equasis.org/
- VesselAPI: https://vesselapi.com/
- AISHub: https://www.aishub.net/
- AIS Friends API: https://www.aisfriends.com/docs/api/v1
- Data Docked: https://datadocked.com/vessel-location-api
- Telkomsat AIS Sandbox: https://ais.telkomsat.co.id/sandbox

### 2.2 Source-rights register (mandatory)

Create and maintain a provider/source registry. At minimum record:
- provider code, legal entity/authority, dataset/API name and exact endpoint/resource;
- access model (public, account, contribution, trial, paid, partner);
- terms URL, license identifier/version and date reviewed;
- internal use, commercial use, display, redistribution, derivative-work and caching rights;
- retention limits, attribution text, rate limit/quota, refresh policy and support contact;
- data region/coverage, known gaps and source authority classification;
- approval state: `candidate`, `technical_test_only`, `internal_use_approved`, `customer_display_approved`, `blocked_rights`, `retired`;
- reviewer, decision date, evidence file/document ID and next review date.

Fail closed when rights are unknown. A public URL, public API, no-key endpoint, open dataset or free trial does **not** by itself establish unrestricted commercial display or redistribution rights.

---

## 3. Architecture and provider boundaries

### 3.1 Logical flow

```text
MaritimHub / Hubla / BMKG / HOTOSM / UN-LOCODE / approved AIS / partner evidence
                                  |
                                  v
                    Provider adapters (server-side)
                                  |
                                  v
             Raw response archive + source/version metadata
                                  |
                                  v
         Validation -> normalization -> deduplication -> review
                                  |
                                  v
               NeonDB canonical PKE maritime records
                                  |
                                  v
        Project authorization + freshness + provenance services
                                  |
                                  v
 Shipping workspace | PM Control Tower | Buyer shipment projection
```

- All provider calls are server-side. Do not call providers directly from the browser.
- Provider credentials, if any, are stored only in secret configuration; never in Git, browser bundles, logs or API responses.
- Adapters must be independently enabled/disabled. Provider failure must not disable manual voyage, nomination, event, document or loading workflows.
- Raw provider payloads are immutable evidence snapshots in private object storage only when storage and provider terms permit retention. Otherwise store a minimal normalized record and source reference.
- Normalize to WGS84 coordinates and UTC timestamps internally; retain original timestamp, timezone/offset and provider raw value where useful.
- Never overwrite an official or reviewed master row silently with a community or lower-authority source.

### 3.2 Provider interfaces

Implement typed, testable interfaces with explicit unavailable/unsupported outcomes:

- `PortRegistryProvider`: list/sync port records and dataset metadata.
- `PortGeometryProvider`: fetch versioned port/harbour geometries.
- `NavigationAidProvider`: fetch SBNP/SROP/VTS reference resources where permitted.
- `MarineWeatherProvider`: fetch forecast/warning observations for a port/area.
- `VesselIdentityProvider`: lookup IMO/MMSI particulars, if licensed.
- `VesselTrackingProvider`: snapshot, position page, port-call page and health status.
- `PartnerMilestoneProvider`: import signed/verified carrier, agent or terminal milestones.

Each interface must return provider code, request/retrieval time, source timestamp, data coverage, source record ID, schema/API version, freshness and structured error category. Do not return provider secrets or raw signed URLs.

### 3.3 Provider selection policy

- Start with MaritimHub, BMKG and HOTOSM only after rights/technical preflight.
- Implement AIS interfaces and fixtures first. VesselAPI can be used for a capped technical trial only after its current terms and customer-display approval are recorded.
- AISHub/AIS Friends remain unavailable until a qualifying receiver/feed partnership exists.
- Data Docked remains a finite trial. Telkomsat sandbox remains demonstration-only.
- No subscription, receiver, SDR hardware, provider contract, or paid API purchase is authorized by this plan.
- PKE's required operational path must support manual agent-confirmed ETA/ETD and milestones when AIS is unavailable.

---

## 4. Canonical data model and reconciliation rules

**Do not create duplicate tables.** Before any migration, inspect the live UAT catalog, existing migrations, API handlers, role permissions and RLS policies. Map existing P16/P17 objects to the requirements below. Add only demonstrable gaps.

### 4.1 Port and facility reference

Reuse and reconcile existing P16 `ports`, `terminals`, `berths`, `channels`, `anchorages` and related records. Required logical attributes where supported:
- canonical PKE ID; source/provider record ID; official port code and UN/LOCODE where verified;
- official name, aliases, port/UPP authority, region, administrative area and operational status;
- latitude/longitude and/or geometry with coordinate reference system and precision;
- source authority, dataset version, source URL, retrieved_at, published_at/effective date;
- verification state, reviewer, verified_at, conflict state and supersession history.

Rules:
- Preserve source-native identifiers and raw values.
- Normalize names for matching but never use name alone as a unique key.
- Match by verified official code first; then reviewed aliases and spatial proximity as suggestions only.
- Detect duplicate codes, duplicate geometries, invalid coordinates, missing coordinates and conflicting active/inactive states.
- Missing coordinates remain NULL; never geocode a guessed centroid and label it official.
- An inactive/closed source record is retained historically and marked inactive; do not hard-delete it.
- Separate official port master, community geometry, terminal capability, berth availability and actual port-call evidence.
- Port depth, channel depth, berth limits, pilotage rules, cargo acceptance and loading rate require current authoritative evidence and reviewer validation. Never derive these from HOTOSM.

### 4.2 Geospatial data

- Import HOTOSM GeoJSON as a separately attributed, versioned community geometry layer.
- Preserve OSM element type/ID, tags, source timestamp and dataset release metadata.
- Keep official Kemenhub port identity and HOTOSM geometry linked by a reviewed mapping, not merged destructively.
- Review ODbL implications for any combined/derived database and customer-facing export before distributing the database or derivative.
- MapLibre is only a renderer. Base map tiles/style, hosting, caching and tile redistribution are separate dependencies and must be rights-reviewed.
- PostGIS remains optional: verify extension availability and performance on an isolated UAT test branch before any production schema decision. Do not enable it in Production under this plan.

### 4.3 BMKG weather observations

Store, when the endpoint actually provides them:
- provider, product/endpoint, port/area reference and coordinates;
- parameter, value, unit, forecast/observation type;
- issued_at, valid_from, valid_to, observed_at if applicable, retrieved_at;
- source warning level/text, source URL/reference, payload hash/schema version;
- freshness, validation status and provider availability.

Rules:
- Forecast, warning and observed measurements must be different record types.
- Store provider units and normalized SI values without discarding the original.
- Validate units, timestamps, range and geographic match.
- Expired forecasts/warnings become stale/expired; never present them as current.
- No value is synthesized if the API omits a field. In particular, tide/current/visibility must be integrated only if the selected documented endpoint actually supplies that parameter for the required geography and forecast horizon.
- Weather is context for readiness and planning, not a guarantee of safe passage or port operation.

### 4.4 Vessel identity and AIS

Reuse existing `vessels`, `voyages`, identifiers, name history, certificates, positions and port-call objects if present and fit for purpose. Preserve:
- IMO as preferred durable identity when verified;
- MMSI and call sign with valid-from/valid-to history;
- vessel name history and source;
- flag, type, dimensions, DWT, GT/NT, draft and capacity as independently nullable, source-stamped attributes;
- certificates with issuer, issue/expiry dates, evidence reference and independent verification;
- AIS position provider, source IMO/MMSI, coordinates, SOG/COG/heading, navigation status, reported draft, destination and provider ETA;
- position timestamp (time represented by the observation) separately from received_at (PKE ingestion time);
- provider response/reference ID, raw payload hash, API version, quality flags and freshness.

Rules:
- Vessel name alone cannot verify identity.
- MMSI can be reassigned; historical identifiers must not silently rewrite past observations.
- Validate coordinate range, timestamp skew, impossible values, duplicate/out-of-order observations and IMO/MMSI mismatch.
- Do not interpolate or invent positions.
- A missing report means unknown/stale, not stopped, arrived or deviated.
- Freshness thresholds are configurable by source/service-area and displayed with last reported time; never show cached/stale data as “Live”.

### 4.5 Voyage, nomination, port call and shipment event

- Keep one authoritative voyage identity linked to the relevant vessel, Project and shipment/contract as applicable.
- Support multi-port calls/legs without overwriting prior call history.
- Separate ETA/ETD prediction, agent-confirmed estimate and actual arrival/departure.
- Preserve source, actor, evidence, timestamp, override reason and audit event for every manual correction.
- Vessel nomination must be independently reviewed where the workflow requires maker-checker; uploader/requestor cannot approve their own submission.
- Port compatibility is preliminary and must fail closed when required verified depth/draft/LOA/beam/air-draft, terminal or operating-limit data is missing/stale.
- Shipment milestones and loading quantities remain linked to existing inventory/lot/loading evidence; do not create a second stock or shipment ledger.

---

## 5. Ingestion, synchronization and operational resilience

### 5.1 Import lifecycle

For every source:
1. Fetch metadata and terms; verify source-rights register status.
2. Fetch a versioned source snapshot in a bounded job.
3. Store original file/payload hash and retrieval metadata where rights permit.
4. Validate schema, encoding, coordinate ranges, required identifiers, timestamps and record counts.
5. Load to staging; do not directly overwrite canonical master records.
6. Produce reconciliation report: new, changed, unchanged, missing, duplicate, invalid, conflicting and inactive records.
7. Apply only safe idempotent updates; send ambiguous/conflicting records to review.
8. Record import run, source version, row-level outcome and actor/job identity.
9. Re-run the same snapshot to prove idempotency and zero unintended changes.
10. Retain prior versions and provide rollback/reconciliation path.

### 5.2 Refresh policy

- Port master: scheduled/manual sync based on source update cadence; no high-frequency polling.
- HOTOSM: versioned dataset refresh only; do not scrape tiles or bulk query public Overpass services as a production feed.
- BMKG: schedule per endpoint's published update cadence and rate limits; cache by geography/product/validity window.
- AIS: refresh only nominated vessels and active vessel calls within approved Indonesian coverage and quota; enforce per-provider and per-vessel rate limits.
- Manual agent/terminal confirmation remains available for all operational milestones.

Refresh intervals and TTLs are configuration, not hardcoded constants. Use backoff, jitter, timeout, circuit breaker, bounded concurrency and idempotency keys. Never retry non-idempotent actions blindly.

### 5.3 Data freshness states

Common state vocabulary:
- `fresh`: within configured source-specific threshold;
- `delayed`: outside normal threshold but within the allowed operational window;
- `stale`: beyond allowed window;
- `unknown`: no valid timestamp or observation;
- `provider_unavailable`: last fetch failed; last known observation may remain visible with its original timestamp;
- `expired`: validity window has elapsed;
- `unverified`: source/authority/evidence has not been reviewed.

UI must show status, source and last-updated time. Freshness must never be inferred from page load time.

---

## 6. API and service contract additions

Preserve the existing P17 API contract in Master Plan §7.9. Add endpoints only after checking current handlers and naming conventions. Candidate routes:

| Method / route | Permission boundary | Purpose |
|---|---|---|
| GET `/api/v1/maritime/ports` | existing P16 `port.view`, selected Project context where applicable | Search canonical port references |
| GET `/api/v1/maritime/ports/:portId/layers` | `port.view` | Return official attributes and separately labelled community geometry |
| GET `/api/v1/maritime/navigation-aids` | Admin/global or scoped read policy as designed | SBNP/SROP/VTS reference search |
| GET `/api/v1/maritime/weather` | `port.view` or dedicated read permission after audit | Cached BMKG forecast/warning |
| POST `/api/v1/admin/maritime/sources/:sourceCode/sync` | Platform Admin only | Start authorized source import |
| GET `/api/v1/admin/maritime/import-runs` | Platform Admin / designated audit permission | Import audit and reconciliation |
| GET `/api/v1/vessels/:vesselId/positions` | existing `vessel.position.view`, Project-scoped | Last known and historical positions |
| POST `/api/v1/vessels/:vesselId/refresh-position` | existing `vessel.position.refresh`, server quota enforced | On-demand bounded refresh |
| GET `/api/v1/vessels/:vesselId/data-freshness` | same as vessel read | Provider status and observation age |

All write endpoints require authenticated actor, explicit permission, selected Project context where relevant, RLS alignment, audit event, input validation and rate limiting. Source synchronization must not be callable by PM/Buyer roles. Public source data does not make PKE's Project-linked records public.

---

## 7. Role and data-visibility model

| Role | Permitted P17 work | Explicit restrictions |
|---|---|---|
| Platform Admin | Manage source registry, global import/reconciliation, global port/navigation reference review, provider credentials metadata and role grants | Cannot approve own maker-checker submission; secrets never shown after save |
| Project Admin | Project operational oversight according to explicit grants | No implicit global source/provider management; no Finance write authority |
| PM | Read assigned Project vessel/voyage/port/weather context; coordinate readiness; submit permitted Project workflow items | No global master writes, provider credential access or cross-Project lookup |
| Shipping Agent | Assigned Project voyage, vessel nomination, ETA/ETD and port-call updates with source/evidence | Cannot approve own nomination or alter global vessel/port masters |
| Field / Terminal / Loading roles | Assigned Project readiness checklist, terminal/loading milestones and evidence within explicit permission | No unscoped vessel/port writes; no unsupported safety/clearance decision |
| Document Officer | Upload and submit required shipping evidence under document workflow | Cannot self-approve; buyer-visible documents require explicit grant and Approved state |
| Finance | Read only the operational context needed for finance workflows | No P17 master or vessel workflow write from Finance role |
| Buyer | Read only approved shipment/voyage projection granted to its verified buyer identity | No search/list of other buyers, Projects, vessels, internal notes, private contacts, unapproved documents or provider credentials |

Authorization must be checked in API and RLS, not only hidden in UI. Buyer identity must be resolved from the authenticated principal through a verified buyer membership/grant; never trust buyer_id supplied by the browser. Test object-level IDOR and revoked/expired grants.

---

## 8. Export & Vessel Readiness Control Tower

Build on existing P10/P11 work queues and shipment reporting; do not introduce a parallel task engine.

Readiness summary must use explicit checklist evidence, owner, due time, status, last update and reviewer. Required checklist categories:
- vessel identity and nomination;
- port/terminal/anchorage compatibility and verified operational limits;
- product stock, allocation, quality and inventory custody;
- loading equipment, terminal/berth readiness and loading window;
- surveyor/inspection arrangements;
- shipping/export documents and required independent approvals;
- customs/port/terminal clearance evidence from the responsible authority;
- carrier/agent confirmations and ETA/ETD source;
- responsible owner, escalation and unresolved exceptions.

State calculation:
- `READY`: all mandatory checklist items have valid, current, approved evidence and no blocking exception;
- `AT_RISK`: no hard blocker but one or more due/expiring/uncertain items need action;
- `NOT_READY`: at least one mandatory item is missing, rejected, expired, stale or blocked.

AIS, weather forecast, port proximity or predicted ETA cannot alone produce READY or authorize loading. A final loading authorization remains a separate authorized human workflow with required evidence and role separation.

Alerts:
- configurable approach/anchorage/port geofence, ETA change, loading-window proximity and overdue readiness tasks;
- deduplicate, cooldown, acknowledge, assign, resolve and escalate;
- every alert records Project, vessel call, trigger, urgency, source timestamp, responsible person and linked work item;
- preserve audit history and suppressed/merged alert reason;
- geofence alerts are operational notifications only, never proof of arrival or clearance.

---

## 9. Migration and implementation sequence

**No migration is approved by this document.** Current reported UAT ledger is 95 entries after P16 Migration 095; verify the live ledger and repository migration inventory before naming or preparing the next migration. Production ledger remains out of scope and must not be queried for write actions.

### Phase P17-0 — Documentation and source governance (this document)

- [x] Owner accepts MaritimHub + BMKG + HOTOSM as preferred open-data candidates, subject to source rights.
- [x] AIS free/freemium/community/sandbox options are classified by their actual conditions; no free permanent production feed is assumed.
- [x] Preserve Indonesia-only AIS scope from Master Plan §56.43.
- [ ] Obtain/record exact commercial-use, display, redistribution and caching rights for each selected dataset.
- [ ] Approve field mapping and import authority matrix.

Exit: source-rights register is complete for the initial sources; unresolved rights remain explicitly blocked and do not prevent work on other approved sources.

### Phase P17-1 — Existing schema/source/permission audit

- [ ] Inventory current UAT tables, columns, constraints, indexes, RLS and policies for ports, terminals, berths, channels, anchorages, SBNP/navigation aids, vessels, identifiers, certificates, positions, port calls, voyages, nominations, loading tickets, shipment events, buyer grants and import audit.
- [ ] Map each Master Plan entity to existing objects and migrations; identify actual gaps and duplicated/legacy structures.
- [ ] Inventory API handlers, service functions, frontend routes and role permission allowlists.
- [ ] Reconcile `shipping.create` vs `voyage.create` (and all other naming differences) across permission catalogue, role grants, API and RLS; choose one canonical permission code and provide compatibility only if needed.
- [ ] Audit buyer principal → buyer organization → Project/contract/shipment visibility mapping and fail-closed behavior.
- [ ] Produce schema/API/permission gap matrix before proposing DDL.

Exit: reviewed inventory and gap matrix; no duplicate table or speculative migration.

### Phase P17-2 — Port master and source provenance

- [ ] Build MaritimHub adapter and source-rights gate.
- [ ] Build staging, versioned import, deduplication and reconciliation report.
- [ ] Normalize official identifiers, port names, regions and statuses without inventing missing values.
- [ ] Build reviewer queue for conflicts, invalid coordinates and inactive/duplicate records.
- [ ] Import HOTOSM geometry as a distinct ODbL-attributed layer after legal review.
- [ ] Crosswalk UN/LOCODE where available; preserve release/version.
- [ ] Add Admin source/import UI and role-scoped port read UI.

Exit: repeat import is idempotent; invalid/conflicting records do not silently update canonical data; source and license provenance is visible; no invented depth/berth/terminal limits.

### Phase P17-3 — BMKG weather and warning context

- [ ] Confirm exact endpoints, fields, units, location coverage, update cadence, terms and attribution.
- [ ] Build server-side adapter, cache, normalized snapshot and freshness handling.
- [ ] Match port/area only using verified geographic identifiers/coordinates.
- [ ] Display forecast/warning with issue and validity times, source and stale state.
- [ ] Add timeout, rate-limit, invalid-payload and provider-outage tests.

Exit: UI never presents expired forecasts as current; missing parameters remain unknown; provider outage does not break P17 manual workflows.

### Phase P17-4 — Vessel identity, AIS adapter and Indonesia coverage

- [ ] Reconcile existing vessel/identifier/history/certificate/position schema before any DDL.
- [ ] Validate IMO, historical MMSI, names and conflicting identity records.
- [ ] Implement provider-neutral AIS contract, fixtures, normalization and quota enforcement.
- [ ] Evaluate Indonesian coverage and source rights for each candidate against actual PKE loading ports/approach corridors.
- [ ] VesselAPI technical trial only after current quota and customer-display permission are recorded; keep hard monthly cap and no Buyer display until approved.
- [ ] AISHub/AIS Friends remain blocked until receiver/feed contribution and rights are satisfied.
- [ ] Data Docked trial and Telkomsat sandbox remain non-production evidence only.
- [ ] Implement manual agent-confirmed ETA/ETD/port call path independent of AIS.

Exit: Indonesia-only coverage is documented; position source/time/freshness always shown; timeout/stale/out-of-order/wrong-identity tests pass; manual milestones work with all AIS providers disabled.

### Phase P17-5 — Voyage, nomination, compatibility and shipment timeline

- [ ] Complete Project-scoped voyage CRUD and lifecycle.
- [ ] Complete nomination submission, independent review, change/reject/withdraw workflow.
- [ ] Implement preliminary vessel-port screen using verified P16 port limits, depth/tide evidence and vessel dimensions; missing/stale critical data returns NOT_VERIFIABLE, not eligible.
- [ ] Implement shipment event timeline with source/actor/evidence and idempotency.
- [ ] Reconcile loading tickets, lot movements and quantity totals without double counting.
- [ ] Compare vessel/shipping document identity, voyage, port, cargo, quantity and parties; create reviewable exceptions.

Exit: positive and negative lifecycle tests pass; no self-approval; no quantity duplication; all changes auditable.

### Phase P17-6 — Buyer Export Shipment 360 and control tower

- [ ] Verify authenticated buyer identity mapping and grant lifecycle.
- [ ] Build allowlisted Buyer shipment projection; no generic project/document query reuse.
- [ ] Enforce approved-document visibility and post-payment visibility according to contract/grant.
- [ ] Build Shipping Agent workspace and Master of Loading readiness work queue on P10/P11.
- [ ] Implement geofence/ETA/overdue alerts with acknowledgement, reassignment, escalation and audit.
- [ ] Implement READY / AT RISK / NOT READY from evidence checklist, never AIS-only.

Exit: buyer IDOR, cross-Project, cross-buyer, revoked/expired grant and private-document denial tests pass; role-specific queues match permission matrix.

### Phase P17-7 — Final audit, backtest and regression

- [ ] Provider contract tests: timeout, 429/quota, 5xx, invalid schema, malformed coordinates, clock skew, duplicate and out-of-order observations.
- [ ] Data reconciliation: repeat imports, changed source rows, deleted/inactive source rows, duplicate official code, missing coordinates, conflicting community geometry.
- [ ] Security: anonymous 401, unauthorized 403, buyer IDOR, cross-Project substitution, revoked/expired role, selected Project context, RLS runtime role and SECURITY DEFINER grants/search_path.
- [ ] Workflow: maker-checker, same-actor denial, stale/missing evidence, wrong IMO/MMSI, port compatibility unknown, partial loading, quantity variance and event idempotency.
- [ ] Run full unit/integration tests, backend/frontend typecheck, frontend build, migration dry-run, dependency audit and P0–P16 regression.
- [ ] Clean all synthetic rows, imported test snapshots and temporary credentials; retain only approved non-sensitive test fixtures/evidence.
- [ ] Publish requirement-to-code-to-test evidence matrix and exact residual external blockers.

Exit: every internally controllable acceptance test passes; unresolved provider/license/coverage dependencies are explicitly BLOCKED_EXTERNAL and do not masquerade as implemented live data.

---

## 10. Mandatory backtest matrix

| Scenario | Expected result |
|---|---|
| Repeat identical MaritimHub dataset import | No duplicate records or unintended updates |
| Source port missing coordinates | Coordinate remains NULL; record is flagged |
| Conflicting official code/name | Review queue; no silent overwrite |
| HOTOSM geometry conflicts with official port data | Both sources remain distinct; conflict visible |
| HOTOSM license/attribution not accepted | Import/display remains disabled |
| BMKG forecast validity expired | Mark expired/stale; never show current |
| BMKG omits tide/current field | Value remains unknown; no synthetic default |
| Provider returns 429/5xx/timeout | Backoff/circuit breaker; manual workflow continues |
| AIS has old position timestamp but fresh ingestion | Display delayed/stale based on position time |
| AIS duplicate/out-of-order message | Idempotent handling; no regression to older position |
| AIS IMO/MMSI mismatch | Quarantine/flag; do not silently link vessel |
| AIS provider unavailable | Last-known timestamp remains visible; status provider_unavailable |
| No AIS coverage for port corridor | Manual agent confirmation remains available |
| Wrong Project ID in voyage/nomination request | 403/404 without data leakage |
| Buyer substitutes another shipment ID | Denied; no cross-buyer or cross-Project data |
| Buyer grant revoked/expired | Access immediately denied |
| Uploader approves own nomination/document | Denied by maker-checker guard |
| Critical port depth/draft evidence stale | Compatibility NOT_VERIFIABLE / NOT_READY |
| AIS proximity suggests port arrival | No automatic ATA/arrival milestone |
| Partial loading ticket replay | Idempotent; no duplicate inventory movement |
| Loading quantity differs from ticket/lot | Exception; no silent reconciliation |
| AIS unavailable but manual milestones exist | Timeline and readiness workflow remain usable |
| All checklist evidence approved and current | READY only if every mandatory rule passes |
| One mandatory clearance/evidence item absent | NOT_READY; AIS cannot override it |

---

## 11. Acceptance evidence and release boundaries

For every claimed PASS, record:
- test name and requirement ID;
- source commit and exact test command/run ID;
- target branch/database/runtime role;
- positive and negative result;
- relevant migration filename and SHA-256, if applicable;
- evidence reference and cleanup result.

Release boundaries:
- Source code and migrations: existing authorized branch and Neon UAT only.
- Production: no DDL, DML, role grants, credentials, data imports or provider activation.
- Vercel: all deployments and environment changes remain frozen by owner instruction.
- GitHub: PR #2 remains OPEN / DRAFT and unmerged.
- External services: no paid API, subscription, receiver, hardware or provider contract.
- Browser UAT/JWT: follow the previously deferred acceptance boundary; do not claim it passed.
- Data retention: only retain provider payloads where license/contract permits; private storage and retention/deletion policies apply.
- Security: no credentials, signed URLs, personal data or restricted source payloads in logs or documentation.

## 12. Current status and next action

**P17 status: PLAN ACCEPTED; IMPLEMENTATION NOT STARTED.**

The next permitted engineering action is P17-1: perform a read-only inventory of the current UAT schema, migrations, API routes, frontend surfaces, permission catalogue, RLS and buyer identity mapping. Do not prepare Migration 096 until that inventory proves a schema gap and the exact SQL is reviewed. Do not begin provider ingestion until the source-rights register is complete for the relevant source.

This plan intentionally separates free/public access from commercial reuse rights. MaritimHub, BMKG and HOTOSM are the initial source candidates; AIS remains replaceable and conditional. P17 must deliver useful port, weather, manual voyage and readiness workflows even if every external AIS provider is disabled.
