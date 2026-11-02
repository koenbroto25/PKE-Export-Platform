# P11 — Reporting, Dashboards, Notifications & Business Intelligence

**Kategori:** Reporting and analytics  
**Prioritas:** P1; basic operational reports required in pilot  
**Status:** Draft untuk review

## 1. Tujuan

Menyediakan satu sumber data terverifikasi yang dapat disajikan dalam format berbeda untuk Admin, PM, Finance, checker/supervisor, buyer, PKS, transporter, warehouse, vendor, funder dan management. Laporan harus sesuai role dan publication policy.

## 2. Reporting audiences

- Admin Aplikasi: configuration health, access, integration, audit and usage.
- PM: project health, progress, risks, tasks, shipment, loading, outstanding actions.
- Field manager/checker: trip, receipt, checkpoint, quantity exception, timesheet.
- Finance/accounting: RAB vs commitment/accrual/paid, cash obligations, AP/AR, advance, FX, profit, reconciliation.
- Export officer: document checklist, expiry, PEB/NPE process, certificate and milestone.
- Buyer: contract fulfillment, accepted/loaded quantity, vessel and shared documents.
- PKS: allocation, dispatch, received quantity, quality and own invoice/payment.
- Transporter: assigned trip, verified trip, tonnage basis, invoice/payment status.
- Warehouse/vendor: own stock, handling, packing/loading shift output and own payment status.
- Funder: only agreed funding utilization, balance, repayment and milestones.
- Management: multi-project profitability, vendor/PKS/port performance and working capital trends.

## 3. Dashboard families

1. Company portfolio dashboard.
2. Project command center.
3. Buyer command center.
4. Supplier/vendor performance portal.
5. Field operations dashboard.
6. Finance and cash control dashboard.
7. Export document/compliance dashboard.
8. Vessel/loading dashboard.
9. FX risk dashboard.
10. AI insights/risk dashboard.
11. Historical BI dashboard.

## 4. Report definitions

Each report template stores audience, data source, filters, fields, aggregate rules, frequency, timezone, publication/approval requirement, allowed download/export, retention and version.

Examples:
- Shipment Progress Report.
- Contract Fulfillment Report.
- PKS Delivery Report.
- Truck Trip/Checkpoint Report.
- Warehouse Stock and Movement Report.
- Packing/Stuffing Report.
- Vessel Loading Shift Report.
- Export Document Status Report.
- Cash Obligation and Payment Instruction Report.
- RAB vs Actual and Cost per MT.
- FX Exposure/Scenario Report.
- Project Profitability and Settlement Report.
- Supplier/Vendor Performance Report.
- Project Exception and Claim Report.

## 5. Data provenance and metric rules

Every KPI must have a defined formula, unit, source tables, status inclusion rule, timezone, freshness and owner. Example: `accepted_quantity` must distinguish gross receipts, accepted after QC, reserved, rejected and loaded. Do not aggregate incompatible quantity types or double-count a lot moved between locations.

Tracking visualizations show `last verified checkpoint`; route line is a planned route, not a continuous truck GPS trace. AIS vessel position always includes provider timestamp and stale status.

## 6. Notifications

Notification triggers include task assignment, due/overdue, cash readiness failure, payment instruction issued/acknowledged, required document missing/expiring, shipment exception, truck departure/arrival, weight variance, loading downtime, vessel schedule change, FX alert, approval waiting and project settlement.

Channel options: in-app as mandatory baseline; email/SMS/WhatsApp according to provider availability, consent, cost and template approval. All notifications store delivery attempt and state. Notification is not approval or proof of payment.

## 7. Scheduled report delivery

- Daily operations report.
- Daily buyer progress summary (only published data).
- Daily cash obligation and payment instruction report.
- Weekly RAB vs actual.
- Per-shift loading performance.
- Monthly supplier/PKS performance.
- Project close settlement report.

Schedule/frequency and recipients are configurable by Admin. Buyer/supplier external delivery requires publication policy and approved template.

## 8. Business Intelligence

Initial BI after sufficient data:
- Cost per MT by PKS, route, port, method and project.
- PKS supply quality and reliability.
- Transport cost, trip duration and verified variance.
- Warehouse days, handling performance and stock losses.
- Packing cost and throughput.
- Loading rate, downtime and demurrage exposure.
- Buyer payment cycle and contract margin.
- Country and destination profitability.
- Working capital requirement and FX sensitivity.

Avoid forecasting from too little history. Show sample size and confidence; first project is baseline capture, not statistically mature benchmark.

## 9. Gemini reporting assistance

Gemini can write narrative summaries from approved query results, explain variance, draft stakeholder reports and answer natural language questions through scoped read-only tools. Numeric tables/charts are generated from deterministic query/BI layer; AI does not calculate/alter final account balances.

## 10. Acceptance criteria

- Buyer report cannot show unpublished columns/records.
- Supplier report is restricted to its own partner account and task.
- Every KPI formula and freshness timestamp is documented.
- Scheduled reports are reproducible by report version and data cut-off.
- Failed delivery retries and can be resent without duplicate side effects.
- Historical BI distinguishes actuals from assumptions and AI estimates.
- Report download/export is permission-controlled and audited.

## 11. Dependencies

P02 read models; P03 audience scopes; P04 notification provider; P06 operation events; P07 ledger/FX; P08 compliance; P09 narrative AI; P10 UI.
