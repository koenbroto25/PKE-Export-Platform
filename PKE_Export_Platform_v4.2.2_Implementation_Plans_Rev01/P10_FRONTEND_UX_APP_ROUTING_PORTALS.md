# P10 — Frontend, UX, App Routing & Stakeholder Portals

**Kategori:** Frontend experience  
**Prioritas:** P1 after API/security contract stabilizes; UX discovery starts earlier  
**Plan revision:** 1.1  
**Status:** Draft untuk review — single Admin route and approvals

## 1. Tujuan

Menyediakan satu aplikasi dengan beberapa experience/layout yang sesuai kebutuhan user. User hanya melihat menu, fitur, project dan tindakan sesuai permission. Aplikasi harus responsive, nyaman untuk buyer desktop/mobile, dan field operations mobile-first dengan dukungan capture evidence.

## 2. Recommended frontend baseline

Rekomendasi awal: React + TypeScript dengan Next.js App Router, server-rendered shell untuk first load, route groups/layout terpisah, Tailwind/design system, typed API client dan PWA untuk field use. Keputusan hosting dan versi framework dikunci setelah POC dengan Neon API region serta target buyer latency.

Satu codebase lebih baik untuk fase awal dibanding membuat empat aplikasi terpisah. Namun experience/layout dan authorization boundary tetap dipisah.

## 3. App routing model

Route bukan security control. Route guard hanya UX; backend dan RLS tetap memeriksa setiap request.

Suggested route structure:
```text
/login
/admin/*                 Admin Aplikasi: konfigurasi, user, role, fitur, master data
/workspace/*             Internal staff: project portfolio, assigned projects, work queues
/workspace/:projectId/*  Project workspace sesuai capabilities
/field/*                 Mobile field operations: checker, gudang, packing, loading, cash evidence
/buyer/*                 Buyer Command Center dan published shipment data
/partner/*               Supplier/vendor/funder scoped portal
/reports/*               Laporan internal sesuai permission
```

Boleh memakai subdomain kemudian (`buyer.`, `partner.`, `app.`) bila brand/security/testing menuntutnya; untuk pilot, route prefix satu codebase lebih sederhana.

## 4. Post-login routing

1. Validate session.
2. Load user's active membership, role grants, project assignments and feature access.
3. Determine available experience (admin/internal/field/buyer/partner).
4. Jika satu experience, arahkan ke landing page yang sesuai.
5. Jika lebih dari satu, tampilkan workspace selector; jangan menebak role utama.
6. User memilih project bila punya beberapa project.
7. Backend memvalidasi ulang project membership dan record scope pada setiap query/command.

Akun yang sama bisa berperan sebagai PM pada Project A dan Finance Viewer pada Project B; UI menunjukkan context project dan role aktif, tetapi tidak mengubah permission.

## 5. Page families

### Admin App — single privileged workspace

- Hanya satu Admin Aplikasi account/principal aktif yang dapat memasuki `/admin/*`.
- Hanya Admin dapat membuat, menyetujui dan mengaktifkan Contract Program; halaman approval tidak tersedia sebagai alternate action untuk PM/Finance.
- Admin tidak tersedia: action masuk pending state; tidak ada approval substitution.
- Step-up MFA/re-auth wajib untuk Contract Program approval, project activation, permission changes, amendment option selection dan project close/reopen.
- Admin workspace menampilkan recurring cycle setup, cycle generation mode, settlement unit, amendment impact comparison, pending requests dan audit history.

- Company settings, user invitations, role/permission assignment, feature catalog.
- Contract Program, recurring cycle templates, project configurator.
- Master data and source verification.
- Workflow/checkpoint/geofence settings.
- RAB/payment policy, FX policy, compliance rule management.
- API provider settings (status/connection test, bukan menampilkan secret).
- Gemini model/use-case/usage budget settings.
- Audit and configuration version history.

### Internal Project Workspace
- Project overview and readiness.
- Work queue, operation timeline, exceptions.
- Procurement, PKS supply, transport, warehouse, packing, vessel, document.
- Finance and accounting pages gated by permission.
- AI insights and reports.

### Buyer Command Center
- Contract fulfillment, accepted quantity, loaded quantity, shipment/voyage status.
- Last verified truck checkpoint where published.
- Vessel position from AIS with timestamp/freshness.
- Published document library and milestones.
- Buyer-scoped shipment assistant.
- No internal purchase price, RAB, cash, funder, staff salary or profit by default.

### Supplier/Vendor Portal
- Own contract/PO, allocation, delivery plan, assigned transport/warehouse/loading tasks.
- Own trip and receipt information.
- Own invoice/payment instruction/payment status.
- Own submitted documents/certificate expiry.
- No data of other suppliers/vendors.

### Field PWA
- Assigned task list.
- Scan QR trip/checkpoint.
- Camera capture, geolocation, offline draft/sync status.
- Numeric forms with units and validation.
- Weighbridge ticket and evidence upload.
- Exception submission and acknowledgement.

## 6. Truck tracking mobile interaction

- Open assigned trip from task or scan QR.
- Verify vehicle and driver assignment.
- Capture location with accuracy indicator and permission state.
- Capture photos through in-app camera flow; show capture time, upload/sync state.
- Enter/confirm plate, driver, quantity, gross/tare/net, lot and destination.
- Submit evidence; show `submitted`, `needs review` or `verified` only after server response.
- Offline mode retains pending sync status; never display offline draft as verified.

## 7. UX and accessibility

- Clear status labels and timestamp/freshness.
- Avoid red/green alone; text + icon + color.
- Use progressive disclosure for complex Admin forms.
- Show assumptions and source labels near recommendations.
- Confirm destructive/high-impact actions; corrections use reason and audit.
- Fast table filters, export where permitted, bulk actions only for non-critical records.
- Responsive layout; field forms optimized for one-hand use, large tap targets, low-bandwidth and poor GPS conditions.
- User must know when AI content is draft or generated.

## 8. State handling

Loading, empty, permission-denied, stale data, provider-down, offline pending, partial save, validation failure and retry states must be explicitly designed. Buyer page shell should render independently from AIS/AI/regulatory API latency.

## 9. Acceptance criteria

- User route resolves based on verified permissions, not client-selected role.
- Exactly one active Admin principal can access Admin App; no PM/Finance fallback approval route exists.
- If Admin is unavailable, Contract Program and other Admin-only actions remain pending without blocking unrelated operations already authorized by an active project snapshot.
- Contract Program and amendment approvals require step-up authentication.
- Direct URL access to forbidden page returns no protected data.
- PM can switch among assigned projects without leakage.
- Buyer and partner portals never expose internal records by changing URL/ID.
- Field capture works on target Android devices and supported browsers under real network/GPS conditions.
- Camera/location denied flows are usable and can request manual review where policy permits.
- Offline draft is not treated as verified until sync/review.
- Initial buyer dashboard target is measured under P12; do not treat target as provider guarantee.

## 10. Dependencies

P01 config; P03 authentication/RLS; P04 API contract; P05 file upload; P06 operation/track workflows; P07 financial screens; P08 documents; P09 AI panel; P11 widgets/reports.
