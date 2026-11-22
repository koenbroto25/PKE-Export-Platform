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


---

## 13. P17 full audit findings and final revision baseline (2026-11-22)

**Audit status: COMPLETE. Documentation revision is authorized. Implementation remains NOT STARTED.** This section supersedes the earlier P17-1 next-action wording in §12. The one-time full audit was performed against GitHub branch `f1/project-scoped-cob-20261119` and Neon UAT project `purple-base-63944903`, branch `br-young-boat-b3re832d`, database `neondb`. All database inspection was read-only. No schema, data, role, credential, provider, deployment, or Production change was made.

### 13.1 Verified baseline and evidence boundary

- UAT `public.migration_history`: 95 rows; 79 applied, 16 baseline entries, 0 pending. The 95 ledger rows were compared with `migration_history_manifest_uat_001_095.json`; ID, filename, SHA-256 and status matched for every row. Latest migration is `095_p16_document_project_context_resolver.sql`. Migration 096 has not been created, approved, or applied.
- Existing branch HEAD at audit start: `5a556518691ca0d680f227d05a4e007a5945a717`. Unit Tests and Dependency Audit Evidence workflows both completed successfully on that HEAD. This is repository CI evidence, not P17 acceptance evidence.
- P16 schema already includes ports, terminals, berths, channels, anchorages, depth/tide observations, loading services, equipment, operating limits, vessels, vessel identifiers, vessel tracking positions, voyages, vessel port calls, nominations, port assessments, shipments, shipment events, transport legs, buyers and buyer visibility grants. Reuse these entities; do not recreate them.
- UAT sample counts at audit time: ports 1; vessels 1; vessel tracking positions 1; voyages 1; vessel port calls 1; vessel nominations 1; shipments 1; transport legs 1; buyers 1. Port terminals, berths, channels, anchorages, depth/tide observations, vessel identifiers, port assessments, shipment events and buyer visibility grants had zero rows. These are test-data counts, not proof of production completeness.

### 13.2 Confirmed architecture gaps

The UAT catalog did not show dedicated P17 tables for a maritime provider/source rights registry, provider ingestion runs and health/quota tracking, marine weather/wave/current/wind forecast records, or a versioned geospatial port layer and external port-ID crosswalk. Existing `regulatory_sources` is a regulatory-document catalogue, not a provider registry. Existing `knowledge_ingestion_runs` is tied to knowledge document versions, not AIS/BMKG/port dataset ingestion. Existing `tracking_events` is truck/checker GPS evidence and must not be reused as vessel AIS. Existing `port_tide_observations` may be reused only for compatible tide forecast/observed records; it is not a general marine forecast table.

PostGIS was not present in the UAT extension inventory. Do not assume spatial SQL support. Prefer a separately versioned GeoJSON/reference geometry layer initially; any PostGIS enablement must be separately justified, approved, and tested.

### 13.3 API and workflow gaps

Existing P16 API read surfaces include ports, vessels, port routes, depth/tide observations and vessel-port assessments. The source audit did not identify complete API workflows for voyage lifecycle, vessel nomination, port-call confirmation, AIS ingestion/provider health, BMKG forecast ingestion, or Buyer shipment visibility driven by active visibility grants. Tables existing in the database do not imply that API/workflow acceptance exists.

The role allowlist contains `vessel.view`, `voyage.view` for selected roles and existing shipping/port permissions, but `vessel.nominate` was not found in the inspected allowlist. RLS is enabled on the inspected P16 maritime tables; however, `vessel_port_calls`, `vessel_tracking_positions` and `vessel_nominations` showed read policies without the complete controlled write workflow required by P17. Add narrowly scoped permissions and server-side write paths; never grant broad direct table writes to all shipping roles.

### 13.4 Buyer identity and isolation — P0 blocker

The existing Buyer workspace in `frontend/src/App.tsx` is a placeholder. The current buyer-project discovery surface is project-membership oriented and does not establish buyer identity by itself. The inspected schema has `buyers`, `buyer_parties` and `buyer_visibility_grants`, but no verified user-to-buyer membership binding was identified. The grant table has RLS, but the inspected permission function path does not establish active buyer-grant scope as the authoritative boundary for every Buyer object. A browser-supplied `buyerId` must never authorize access.

Required target identity chain: authenticated principal → PKE user → verified buyer organization/membership → buyer → project/shipment → active, scoped, unexpired, non-revoked visibility grant. API and RLS must both enforce this relationship. Grants must distinguish shipment summary, milestones, vessel tracking, documents, financial milestones and other approved scopes. Revocation and expiry must deny access immediately. Buyer must never inherit general Finance or internal Project permissions through a portal shortcut.

### 13.5 Provider/data-source decisions

- MaritimHub is a candidate for port-master reconciliation, not permission to silently overwrite PKE master data. Validate the exact resource's currency, schema completeness, commercial display/reuse rights and terms. The inspected sample included missing external identifiers/coordinates and inactive records; missing fields must remain unknown and require review.
- BMKG documented maritime endpoints are the preferred first forecast adapter. Use only fields actually returned for the selected endpoint/area/horizon. Preserve UTC issue/valid times, units, forecast-vs-observation semantics and freshness. Forecast does not replace verified tide/depth/clearance evidence.
- HOTOSM/HDX port geometry is a distinct community geometry layer with ODbL/attribution obligations. It is not the authority for port identity, depth, navigation restrictions, clearance or terminal capacity. Keep provenance and licensing boundaries separate.
- AIS provider remains conditional. VesselAPI free-tier limits and customer-facing display restrictions require written provider approval. AISHub requires compliant receiver contribution and imposes redistribution limits on raw messages/positions/tracks. No AIS source is approved as an unrestricted production feed by this plan. No paid API, subscription, receiver, hardware or contract is authorized.
- SBNP/SROP/VTS and BIG/Pushidrosal/IHDC materials remain source candidates subject to access, currency, and reuse-right review. UN/LOCODE is a versioned cross-reference, not a replacement for national port master identity.

### 13.6 Final revision workstreams and implementation gates

| Workstream | Priority | Required outcome | Exit gate |
|---|---|---|---|
| P17-A Source governance and ingestion foundation | P0 | Provider registry, rights register, ingestion audit, idempotency, quota/health, staging and secret handling | Every enabled source has approved rights/field mapping; import is auditable and replay-safe |
| P17-B Port master and geospatial reconciliation | P0 | MaritimHub staging, external-ID crosswalk, conflict review, versioned separate GeoJSON layer | No silent master overwrite; conflicts and missing values remain visible |
| P17-C BMKG forecast adapter | P1 | Marine forecast/warning adapters, UTC/unit normalization, freshness and stale-state | Endpoint-specific field coverage and forecast-vs-observed tests pass |
| P17-D Vessel identity and AIS abstraction | P1 | Provider-neutral adapter, IMO/MMSI validation, freshness, quota, outage and manual fallback | Rights approved; duplicate/out-of-order/mismatch and provider outage tests pass |
| P17-E Voyage, nomination, port-call and loading workflow | P1 | Project-scoped lifecycle APIs, narrowly scoped permissions, maker-checker, confirmed milestones | Wrong-project/role denial, idempotency, evidence and quantity reconciliation pass |
| P17-F Buyer identity and grant-based visibility | P0 | Verified membership mapping, scope-specific grants, API + RLS enforcement, real Buyer workspace | Cross-buyer/project IDOR, expiry, revocation and document isolation tests pass |
| P17-G Maritime Control Tower | P2 | Port, forecast, vessel, voyage, port-call, readiness and provider-health surfaces | Data source/time/freshness and confidence are visible; no misleading live state |
| P17-H Security, regression and acceptance | Gate | Automated evidence matrix and full P0–P16 regression | Every internally controllable acceptance test passes; external rights/coverage remain explicit BLOCKED_EXTERNAL |

### 13.7 Candidate migration sequence — not yet authorized

The sequence below is a planning hypothesis only. Exact boundaries and numbers must be revalidated against the live ledger and final DDL before any migration is authored. No migration is approved by this document.

1. Candidate 096: maritime source/provider registry and ingestion audit.
2. Candidate 097: port-source crosswalk and versioned geospatial layer.
3. Candidate 098: marine forecast and warning model.
4. Candidate 099: provider-neutral AIS ingestion and trusted write path.
5. Candidate 100: voyage, nomination and port-call permission/API support.
6. Candidate 101: Buyer identity mapping and grant-based RLS/API.
7. Candidate 102+: only if backtest evidence proves additional schema changes are needed.

No duplicate P16 entities. Every migration requires exact SQL review, dependency/constraint/index/RLS analysis, SHA-256, dry-run, backup/recovery plan, UAT-only apply, runtime-role tests, and manifest/plan update.

### 13.8 Final acceptance matrix

| Test family | Required negative and positive cases |
|---|---|
| Source rights | Unknown/expired/withdrawn rights fail closed; only approved use cases activate |
| Ingestion | Repeat import, changed source, missing fields, duplicates, rollback, partial failure and checksum evidence |
| Provider resilience | 429, 5xx, timeout, circuit breaker, quota exhaustion, stale source and recovery |
| Port reconciliation | Duplicate official code, coordinate conflict, inactive source, missing coordinate and human approval |
| Geospatial | ODbL attribution, layer separation, invalid geometry, versioning and no authority inference |
| BMKG | UTC conversion, unit conversion, missing fields, expired forecast, forecast/observation separation |
| AIS | IMO/MMSI mismatch, duplicate/out-of-order data, stale position, no coverage, provider outage and manual fallback |
| Maritime workflow | Wrong Project, wrong role, maker-checker, unconfirmed arrival, port compatibility unknown and loading variance |
| Buyer security | Buyer IDOR, cross-buyer/project substitution, inactive membership, expired/revoked grant and document scope |
| Regression | Existing P0–P16 tests, API contracts, typecheck, build, migration dry-run and RLS runtime tests |

P17 may be accepted only when all internally controllable tests pass and external licensing/coverage dependencies are labelled `BLOCKED_EXTERNAL`, not falsely represented as live integration. AIS must never independently authorize arrival, clearance, berth assignment or loading. P17 readiness must be evidence/checklist-driven and fail closed for mandatory missing evidence.

### 13.9 Operating boundaries and current status

- Scope of this revision: documentation only, on the existing authorized branch.
- Neon: UAT read-only audit completed; no database change.
- Production: no DDL, DML, role grants, credentials, imports or provider activation.
- Vercel: deployment and environment changes remain frozen.
- GitHub: PR #2 remains OPEN / DRAFT and unmerged.
- Browser UAT/JWT: remains deferred; do not claim it passed.
- No paid API, subscription, receiver, hardware, provider contract or AIS feed activation.

**Final P17 status: FULL AUDIT COMPLETE → DOCUMENTATION REVISION BASELINE → IMPLEMENTATION NOT STARTED.** The next engineering step after these documents are verified is P17-A detailed source-registry/ingestion schema design and P17-F Buyer identity/grant design review before implementation. P17-B/C can proceed with approved source rights and staging boundaries. Do not begin provider ingestion or create Migration 096 solely because it appears in the candidate sequence.


## 14. P17-A / P17-E implementation checkpoint (2026-11-22)

**Status: IMPLEMENTATION IN PROGRESS — NOT ACCEPTED.** This checkpoint records the first code/migration tranche and its validation boundary; it does not override the UAT migration ledger or imply database acceptance.

### 14.1 Source-controlled implementation
- Added candidate migration 096 `096_p17a_maritime_source_governance_ingestion.sql`: source/provider metadata and rights register, field-purpose permissions, ingestion run ledger, payload staging with SHA-256/idempotency, provider quota windows and provider health records. Source records are Platform Admin governed and enabled sources fail closed unless internal-processing rights are explicitly approved, evidenced, attributed and current. Credential values are not stored; only secret references are represented.
- Added candidate migration 097 `097_p17e_project_maritime_workflows.sql`: Project-bound voyage metadata/version/idempotency, composite Project-parent constraints for nominations and port calls, nomination maker-checker, manual actual port-call confirmation, workflow audit events, narrowly scoped permissions, and selected-Project RLS. Existing P16 ports/vessels/shipments/voyages/nominations/port-call tables are reused.
- Added `src/p17-maritime.ts` and mounted it from `src/index.ts`: Platform Admin source/right/field-permission, ingestion-run/staging/review/completion and provider-health APIs; Project-scoped voyage, nomination and port-call list/create/update/decision APIs. Provider fetching and master-data promotion are not activated; staged data requires review and is not automatically promoted.
- Added P17 contract tests and included them in the root test command. Added role-catalogue grants for PM, Shipping Agent, Master of Loading and Terminal Representative within the stated scope.

### 14.2 Validation and blockers
- Neon UAT was re-read before migration authoring: migration 095 remains latest; no P17 migration was applied. Migration manifest remains at UAT 001–095.
- GitHub Unit Tests and Dependency Audit Evidence passed on intermediate implementation commit `298d413d658a0f8d22de70ea245ba35f8b91d171`. A later source commit `af90924d952edcdbf68d46483c8c2ac6a3930425` was still running CI at checkpoint time; its result must be checked before acceptance.
- Neon refused creation of the isolated migration-validation branch with HTTP 422 `branches limit exceeded`. The normal Neon migration-preparation flow therefore could not produce a temporary branch for dry-run/backtest. No existing branch was deleted to make room; no DDL was run directly against UAT as a substitute.
- Consequently migrations 096/097 remain candidate SQL only. Runtime-role/RLS backtests, migration application, API integration acceptance, and full P0–P16 regression against the new schema remain outstanding. Do not claim P17-A or P17-E complete until those gates pass.

### 14.3 Boundaries
- Neon UAT schema and data unchanged; latest applied migration remains 095.
- Production untouched. Vercel deployment and environment remain frozen. PR #2 remains OPEN/DRAFT and unmerged.
- No external provider feed, paid API, subscription, receiver, hardware or contract activated. No AIS or weather feed is represented as live.

**Next required action:** resolve Neon UAT branch capacity through explicit owner-approved cleanup or capacity increase; then prepare 096 and 097 on isolated temporary branches, inspect/fix DDL failures, apply to UAT only, backtest RLS/runtime permissions and workflows, update the UAT manifest to the exact applied ledger, and rerun the full regression/CI on the final head.


## 15. P17-A and P17-E UAT implementation and acceptance (2026-11-22)

**Database implementation status: APPLIED TO UAT.** Migration 096 and 097 were applied in one transaction to Neon UAT branch `br-young-boat-b3re832d` (project `purple-base-63944903`, database `neondb`). Both exact SHA-256 values were recorded in `public.migration_history` and reconciled against the new 001–097 manifest with 97/97 exact matches and zero mismatches:
- 096 `096_p17a_maritime_source_governance_ingestion.sql`: `13de94dd16eb6101635a13759456bca89bed27c7147d98bbd36d8e4f93653702`
- 097 `097_p17e_project_maritime_workflows.sql`: `814a5bd26e44909de56e2d40bf561cd420dc6c5784310be18012c6064385f0f1`

### 15.1 P17-A accepted UAT schema and controls
- Source registry, source/field rights, ingestion run ledger, payload staging, provider quota usage and provider health tables exist with RLS, explicit grants and admin-only policies.
- Database triggers enforce current/evidenced rights on source enablement, source-level purpose rights on field permissions, and current approved rights on staging. Quota configuration must be paired; ingestion counters and external record IDs are constrained.
- API supports source registration with quota windows, rights approval/revocation, field-purpose permissions, idempotent run scheduling, quota enforcement, repeated staging while a run is queued/running, review/quarantine, run completion and provider-health logging.
- Isolated UAT-copy backtests passed: Platform Admin visibility vs non-admin denial; internal-only rights accepted while customer-display rights were rejected; unapproved source enablement denied; staging under blocked rights denied; quota limit reached at configured threshold; repeated staging supported without opening rights bypass.

### 15.2 P17-E accepted UAT schema and controls
- Project-scoped voyage version/idempotency, composite Project-parent constraints for nominations and port calls, workflow event audit, narrow permission grants and selected-Project RLS are installed.
- Nomination transitions are constrained and require a different reviewer from the nominator. Port-call identity is immutable; actual arrival/berth/departure events require the dedicated confirmation permission and explicit actual timestamp. Port/terminal/voyage/vessel linkage is checked. No AIS event or port-call record grants clearance, berth or loading authority.
- Isolated UAT-copy backtests passed: Shipping Agent create/nominate/manage but no voyage update; PM view/create/update/review/manage but no actual confirmation; Master of Loading and Terminal Representative confirmation grants; unrelated Viewer denial; same-Project voyage/nomination/port-call writes; independent nomination review; planned port call and authorized actual milestone; self-review and unauthorized actual milestone denied; cross-Project reads and writes denied.
- PM voyage-view was added to both database role allowlist and role catalogue after the initial permission-matrix backtest identified its absence. Master of Loading voyage-create was removed from the role template to keep it read/confirm-only.

### 15.3 UAT verification evidence and boundaries
- UAT ledger now has 97 rows: 16 baseline entries and 81 applied migrations. Latest is 097; the exact 001–097 manifest is `migration_history_manifest_uat_001_097.json`.
- Post-apply role permission checks on `app_runtime_secure` passed. Viewer reads of voyages, nominations and port calls returned zero rows. Existing UAT operational fixtures remain: 1 voyage, 1 nomination and 1 port call. New P17-A source/ingestion tables and maritime workflow-event table remain empty, as no external provider or operational data has been activated/imported.
- GitHub Unit Tests and Dependency Audit Evidence passed on implementation head `427fd5ab60aa0d3672db352ebfa5626ab90388d1`. The suite includes P17 contract tests, backend/frontend typechecks and frontend build.
- Live HTTP/browser UAT and Vercel deployment were not run; deployment remains frozen by the existing owner instruction. Therefore the database/RLS and CI contract gates are accepted, while live deployed endpoint acceptance remains a separate release gate.
- A dedicated isolated validation branch `p17a-e-uat-validation-20261122` was created from UAT before application and retained for test evidence. Synthetic validation records were written only to that branch, never to UAT.

**P17-A / P17-E result:** database migrations, UAT ledger reconciliation, role/RLS backtests and repository contract/CI gates PASS. Provider onboarding/live feed, deployed HTTP/browser acceptance, and production release are intentionally not claimed or activated.


## 16. P17-B port master, PKS linkage and geospatial layer (22 November 2026)


**Scope decision:** PKE export suitability and PKS-to-port land logistics are the primary ranking dimensions. The national port register may contain all known ports, but only a port with verified PKE loading capability and a verified road route from an operational, verified PKS can become a primary operational reference. Proximity alone is not proof of export suitability.

### 16.1 Existing P16 entities reused
- `public.ports` remains the canonical national port identity; UN/LOCODE, national code, coordinates, authority/operator, source and verification fields are reused.
- `public.pks_sites` remains the canonical PKS/KCP/facility master and is linked to `partner_organizations` through `organization_id`. Producer/company records are not duplicated into a new port table.
- `public.pks_port_routes` remains the PKS–port relationship, including road/river/sea/multimodal mode, distance, travel time, provenance and independent verification.
- `public.warehouses`, `port_terminals` and `port_loading_services` remain the port-side warehouse/terminal/loading-capability records.

### 16.2 Migration 098
Migration `098_p17b_port_identity_geospatial.sql` was applied to Neon UAT branch `br-young-boat-b3re832d` (project `purple-base-63944903`, database `neondb`). SHA-256: `d5e035f92ac2f679111ff717724c1683aa4666574c8aae5e830e501301179445`.
- `port_external_id_crosswalk` maps source-specific external port identifiers to canonical P16 ports, with confidence/match method, source snapshot, evidence and independent match review.
- `port_geospatial_features` stores separately versioned GeoJSON for port/terminal/PKS points and boundaries, road access and route features, including geometry checksum, dataset version, license and attribution. This is not a PostGIS dependency and does not silently replace canonical coordinates.
- Existing `pks_port_routes` gained a nullable geometry-feature reference and explicit distance-method field; the verified road-route priority index supports PKS-first lookup.
- Both new tables have forced RLS. Crosswalk is Platform Admin-only; geospatial reads are constrained by selected Project port/route linkage. No bulk external data was imported.

### 16.3 PKE-specific route ranking
The `GET /api/v1/port-routes` response now exposes `pke_loading_service_verified`, `verified_warehouse_count`, `is_primary_reference`, PKS operating/verification status and port verification status. A primary reference requires all of: road mode, active verified route with distance, active operational verified PKS, active verified port, and an active verified loading service whose cargo type is explicitly PKE / Palm Kernel Expeller (including normalized material synonyms). Otherwise it remains a candidate and is never labelled primary. Results are ordered primary-PKE-first, then road-first, evidence-verified-first and shortest distance first within the PKS grouping.
- Port proximity is not calculated from straight-line distance and represented as road distance. A route must identify its method (`road_network`, `operator_quote`, `gps_track`, etc.) and source.
- Verified port warehouses are surfaced as a supporting indicator, not a substitute for verified storage capacity, handling mode or product compatibility.
- UI route panel now labels only fully eligible rows as “Rujukan utama PKE” and explains why unverified or incomplete candidates are not promoted.

### 16.4 Validation boundary
- UAT migration ledger is now 98 rows: 16 baseline and 82 applied. Exact manifest: `migration_history_manifest_uat_001_098.json`.
- Post-apply catalog checks confirmed both new tables, forced RLS, the expected policies, route geometry/distance columns and migration 098 hash/ledger entry.
- Runtime-role spot checks confirmed the new tables return no rows to an unrelated PM principal and no data is exposed without an eligible Project relationship. No real records were inserted; UAT port/PKS fixtures remain test fixtures.
- P17-B API and UI contract tests were added. Full CI and role-backed data-positive/negative integration tests remain required before declaring P17-B fully accepted.
- Provider activation, bulk import, Production changes, Vercel deployment and PR merge remain out of scope. External source rights must be approved in P17-A before any dataset can be staged/promoted.

**P17-B status:** database foundation applied; route prioritization API/UI implemented; full CI and positive/negative data-backed acceptance pending. No national port catalogue or producer list is yet represented as complete/verified.


### 16.5 P17-B database and CI acceptance (22 November 2026)


**Result: DATABASE / CONTRACT / CI ACCEPTANCE PASS; LIVE HTTP / BROWSER ACCEPTANCE NOT RUN.**
- Migration 098 is present in the UAT ledger with exact SHA-256; `migration_history_manifest_uat_001_098.json` reconciles 98/98 rows (16 baseline, 82 applied), zero mismatches.
- UAT catalog confirms both P17-B tables, forced RLS, expected admin/project policies, FK/unique/check constraints, route geometry FK, distance method constraint and priority index. The UAT tables remain empty; no operational or public data has been promoted.
- Isolated validation branch `p17a-e-uat-validation-20261122` positive tests: approved synthetic source and field-purpose rights, port-ID crosswalk creation/match review, GeoJSON feature creation/verification. Negative tests: missing independent review stamp and GeoJSON without coordinates rejected by database constraints. Runtime `app_runtime_secure`: PM principal sees zero global crosswalk/untethered geometry rows; Platform Admin sees the synthetic test rows. Synthetic records remain isolated to that branch.
- The route-priority SQL was executed against UAT successfully; it returned zero rows because there are no verified PKS–port route records in UAT. This is expected and does not represent a live route recommendation.
- GitHub Unit Tests passed on final P17-B head `d0fa87b8611ceae2d6fb82e6aa2bf0d2378edad3`: 46 test files / 416 tests; migration dry-run, backend API typecheck, frontend typecheck and frontend build passed. Dependency Audit Evidence also passed.
- P17-B API routes for crosswalk and geospatial staging/review are Platform Admin authenticated; rights and field-purpose checks are fail-closed; maker-checker review is enforced in API. UI route panel shows PKE primary reference only when the full evidence gate passes.

**Remaining release gates:** live authenticated HTTP/API UAT, Project-positive geospatial visibility test with a real approved Project-port link, source-rights approval for the selected national datasets, port master reconciliation/import, and real producer/PKS data onboarding. Vercel and Production remain untouched; no PR merge, provider activation or paid subscription.


### 16.6 Producer-company linkage is a primary-reference requirement


The PKS-to-port route is not treated as a complete export-supply relationship unless the PKS site is linked through `pks_sites.organization_id` to a current verified `partner_organizations` record of type `processor`. The route API returns the producer legal name and a `producer_company_verified` flag. `is_primary_reference` now requires the linked processor organization to be active, verified, time-stamped and supported by verification source/evidence SHA-256, in addition to the verified PKS, route, port and PKE loading-service gates. This deliberately prevents an unlinked or unverified company from being represented as a confirmed PKE producer.

The existing organization taxonomy already supports `processor`; the PKS taxonomy already supports `kernel_crushing_plant` and `integrated_mill_kcp`. This is the canonical relationship for the future producer directory; do not create a duplicate producer table unless a later data-model gap is demonstrated. The full route query was executed against UAT after the change and returned zero rows (expected because UAT has no verified route/company fixture). CI must be rerun on the final head.


### 16.7 PKE-producing facility type gate


The primary route also requires `pks_sites.facility_type` to be `kernel_crushing_plant` or `integrated_mill_kcp`; a standalone `palm_oil_mill` is not assumed to produce PKE. The loading-service material classifier accepts normalized PKE / Palm Kernel Expeller and recorded cake/meal synonyms, including underscore-form codes. The primary reference therefore requires the linked verified processor company, actual KCP/integrated facility type, verified road route, verified port and explicit verified PKE loading service together. This is intentionally conservative until the producer directory and product records are reconciled.
