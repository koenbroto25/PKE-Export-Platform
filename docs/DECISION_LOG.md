# Decision Log

| ID | Decision | Current decision / recommendation | Owner/status |
|---|---|---|---|
| D-001 | Backend | Neon Postgres paid production | User decided; confirm provisioning region |
| D-002 | Object storage | Neon private buckets | User decided; POC signed URL/backup |
| D-003 | Functional currency | IDR | User decided |
| D-004 | Commodity scope | PKE only through field maturity | User decided |
| D-005 | Markets | China and Pakistan initial country packs | User decided; legal verification open |
| D-006 | Accounting | Full double-entry/project accounting | Agreed direction; accountant policy sign-off open |
| D-007 | Payment execution | Manual payment instruction; no automatic bank transfer | User decided |
| D-008 | AI production | Gemini paid tier for real business data | User decided |
| D-009 | Truck tracking | Checker geotagged checkpoint, not mandatory vehicle GPS | Agreed direction; field UAT open |
| D-010 | Authentication | Neon Managed Auth POC, OIDC fallback | Open |
| D-011 | Frontend stack/hosting | Next.js/TypeScript/PWA recommendation | POC/open |
| D-012 | ORM/job queue | Drizzle and PostgreSQL-backed durable queue candidate | Open |
| D-013 | Accounting policy | COA, inventory valuation, FX accounting, tax | Accountant approval open |
| D-014 | External providers | AIS, FX, routing, notification and compliance source providers | Procurement/open |
| D-015 | Backup RPO/RTO | Define before production | Open |
| D-016 | Admin authority | Exactly one Admin Aplikasi principal; only Admin creates/approves/activates Contract Program and Admin-only settings. No fallback approver. If Admin unavailable, sensitive action queues. Shared credential weakens human attribution. | User decided; security controls in P03/P10 |
| D-017 | Recurring cycle policy | Admin defines recurrence in Contract Program and may adjust during project by versioned change. Recommended default `scheduled_draft`; Admin must review and activate. `admin_manual` and `quantity_triggered_draft` are configurable alternatives. | User decided; default mode recommended for approval |
| D-018 | Project Instance boundary | One instance represents one agreed fulfillment/settlement unit (e.g. each 10,000 MT tranche). Several shipments/partial receipts may belong to one instance. It closes only after the defined settlement and close checks are met. | User decided; exact basis is contract-specific |
| D-019 | First-cycle readiness | All in-scope plans P01–P13 implemented and running; measurable test/defect/security/UAT/backup gates specified in P12. | User decided; measurable criteria added |
| D-020 | Amendment handling | Admin chooses among amendment-only/future cycle, revise active project (new version/change order), successor project, split, supplemental scope, temporary variation or reviewed custom option. Decision requires negotiation evidence; AI may analyze but not decide. | User decided; P01 change engine |
| D-021 | Shared Admin credential attribution | Single Admin login is retained as requested. If physically shared, audit can identify principal/session, not prove which human used it. Prefer one controlled identity with MFA and recovery. | Risk disclosed; user acceptance required if shared |