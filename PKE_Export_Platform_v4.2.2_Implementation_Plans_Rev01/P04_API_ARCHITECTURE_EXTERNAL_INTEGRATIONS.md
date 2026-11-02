# P04 — API Architecture & External Integrations

**Kategori:** Integration platform  
**Prioritas:** P0 untuk internal API; P1 bertahap untuk external providers  
**Status:** Draft untuk review

## 1. Tujuan

Menyediakan kontrak API internal yang konsisten dan lapisan adapter untuk integrasi eksternal tanpa membuat modul bisnis bergantung langsung pada vendor tertentu. API eksternal tidak boleh menghambat pencatatan transaksi lokal ketika provider lambat/down.

## 2. Internal API standard

Rekomendasi awal: REST JSON `/api/v1` dengan OpenAPI, schema validation, generated TypeScript client, request ID/correlation ID, idempotency key, cursor pagination, filter allowlist, consistent error envelope dan audit metadata.

Command writes seperti `dispatch-truck`, `verify-arrival`, `approve-expense`, `issue-payment-instruction`, `publish-buyer-document` harus menggunakan endpoint/use-case yang jelas; jangan mengizinkan generic mass update untuk transaksi kritis.

## 3. API areas

- Auth/session and invitations.
- Admin/configuration and feature flags.
- Buyer contracts and recurring delivery programs.
- Project and workflow.
- Master PKS/supplier/vendor/vehicle/driver/warehouse/port/vessel.
- Procurement and supplier allocation.
- Transport trips and tracking events.
- Inventory/lot/weighbridge.
- Packing/container/loading/voyage.
- Compliance/document registry.
- Budget/payment/accounting/FX.
- Reports/dashboards/notifications.
- AI assistant/tools/insights.

## 4. External integration catalog

| Integration | Data | Recommended use | Fallback |
|---|---|---|---|
| FX source (BI/JISDOR, bank rate/provider) | Reference and actual FX | FX monitoring and valuation benchmark | Manual verified rate entry with source/timestamp |
| AIS provider | Vessel position, ETA, destination, timestamps | Vessel status, buyer map | Agent/port event update; show stale/no data |
| Geocoding/routing | Coordinates, route distance/time | Planned route and ETA baseline | Manually configured route/estimated distance |
| Weather | Weather/forecast at route/port | Operational risk context | No weather insight; no workflow block |
| Indonesia official sources | Customs, HS/tariff/LARTAS, export regulations, quarantine | Compliance evidence | Manual official-source capture and review |
| China import sources | Product/feed import requirements, importer/facility rules | Country pack | Importer/customs broker confirmation |
| Pakistan import sources | DPP/AQD, quarantine, feed-related requirements | Country pack | Importer/customs broker confirmation |
| Email/SMS/WhatsApp provider | Notifications | Invitation, tasks, alerts, report delivery | In-app notification and manual escalation |
| Bank integration (later) | Statement/rates or reconciliation | Read-only reconciliation if authorized | Manual bank statement import |

Do not assume every government portal offers a public API. Record source type as API, downloadable data, web portal, manual review or licensed provider.

## 5. Provider adapter contract

Each provider adapter must implement:
- `health_check()`
- `fetch_latest()` / `fetch_range()`
- `normalize()`
- `validate_source_timestamp()`
- `map_provider_status()`
- `record_raw_response_reference()`
- `retry_policy()`
- `mark_stale_or_unavailable()`

Store provider, retrieval time, source timestamp, raw reference/checksum if allowed, normalized payload, status and error.

## 6. Reliability standards

- Timeout per provider.
- Retry with exponential backoff and jitter for transient errors.
- Circuit breaker and provider quota control.
- Idempotency for webhook/event ingestion.
- Dead-letter queue and replay tools.
- No duplicate financial/operational side effects.
- Last successful update and stale badge on all external-data widgets.
- Provider outage must not block local business operations unless a verified legal rule explicitly requires the data.
- API keys and tokens live in server-side secrets only.

## 7. AIS and FX semantic rules

AIS is advisory position data, not legal proof of arrival, berth, loading completion or sailing. Official/agent/port events provide milestone confirmation.

FX market reference is not the same as actual bank execution rate or accounting rate. Keep source, timestamp, buy/sell side, rate type, currency pair and use case.

## 8. API security

- Backend-to-provider secrets only.
- Validate webhook signatures where provider supports them.
- Allowlist webhook events and reject replay using event IDs/timestamps.
- Restrict outbound destinations to avoid SSRF.
- Redact secrets and personal data from logs.
- Rate-limit per user, partner, project and endpoint.
- Never expose Neon connection string, Neon storage secret or Gemini API key.

## 9. Acceptance criteria

- Frontend can use internal API without direct Postgres or provider credentials.
- Every write command checks authorization and project scope.
- Idempotent endpoint cannot create duplicate trip, payment request or document share.
- Provider outage produces stale/unavailable status, not false current data.
- External event is traceable to source and received timestamp.
- All integration jobs can be retried/replayed safely.
- No external API is a synchronous dependency for initial buyer dashboard render.

## 10. Dependencies

P02 backend; P03 security; P05 storage; P06 operation events; P07 FX/payment; P08 regulatory rules; P09 AI tool adapter; P11 notifications.

## 11. Reference links

- [BI](https://www.bi.go.id/)
- [Indonesia National Trade Repository](https://intr.insw.go.id/)
- [WTO ePing SPS/TBT](https://eping.wto.org/)
- [Gemini API reference](https://ai.google.dev/api)
