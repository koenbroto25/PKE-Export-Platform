# P03 — Identity, Authorization, Role & Row-Level Security

**Kategori:** Security foundation  
**Prioritas:** P0 — tidak boleh ditunda  
**Plan revision:** 1.1  
**Status:** Draft untuk review — single Admin authority ditetapkan

## 1. Tujuan

Memastikan setiap pengguna hanya dapat mengakses data, project, fitur, dokumen, tindakan dan laporan sesuai identitas, role, permission, assignment, partner scope dan publikasi yang disetujui Admin Aplikasi.

## 2. Identitas dan jenis pengguna

- Internal: Admin Aplikasi, PM, manager lapangan, procurement, checker, gudang, packing, loading, export officer, finance, kasir, accounting, management.
- External: buyer/importer contact, PKS/supplier, transporter, warehouse operator, loading vendor, PPJK, surveyor, fumigator dan pihak lain yang diberi akses.
- Satu orang dapat memiliki beberapa role dan menangani beberapa project.
- Satu PM dapat menjadi PM pada 2–3 project bersamaan; permission dan project scope tetap dihitung per project.

## 3. Single Admin principal and authentication decision

### 3.1 Single Admin authority

Aplikasi hanya mempunyai **satu Admin Aplikasi principal/login aktif** sebagai otoritas konfigurasi dan approval tertinggi. Hanya principal ini yang dapat membuat, menyetujui, mengaktifkan, mengubah konfigurasi resmi, atau menutup Contract Program dan melakukan tindakan Admin yang dicantumkan dalam P01. Tidak ada PM, Finance, Owner, atau role lain yang menjadi alternate approver.

Jika Admin tidak tersedia, permintaan tetap `pending_admin_action`; tidak ada auto-approval atau penggantian approver. Pemulihan dilakukan melalui prosedur recovery akun Admin yang sama.

**Catatan audit penting:** jika satu kredensial Admin dibagi kepada beberapa manusia, log dapat membuktikan tindakan dilakukan oleh Admin principal dan sesi/perangkat yang tercatat, tetapi tidak dapat secara pasti membuktikan manusia mana yang menekan tombol. Rekomendasi keamanan adalah satu identitas Admin yang tidak dibagikan, MFA/passkey, re-authentication untuk tindakan kritis, session controls dan credential recovery terkontrol. Jika shared credential tetap dipilih, risiko atribusi ini harus diterima secara eksplisit.

### 3.2 Authentication provider decision

POC **Neon Managed Auth berbasis Better Auth** sebagai kandidat awal. Sebelum dipilih final, uji invitation-only, email verification/OTP, password reset, MFA untuk Admin/Finance, session revocation, partner accounts, JWT verification, trusted origin, dan integrasi dengan native Postgres RLS. Jika satu kebutuhan kritis belum terpenuhi, gunakan OIDC-compatible identity provider tanpa mengubah authorization model aplikasi.


POC **Neon Managed Auth berbasis Better Auth** sebagai kandidat awal. Sebelum dipilih final, uji invitation-only, email verification/OTP, password reset, MFA untuk Admin/Finance, session revocation, partner accounts, JWT verification, trusted origin, dan integrasi dengan native Postgres RLS. Jika satu kebutuhan kritis belum terpenuhi, gunakan OIDC-compatible identity provider tanpa mengubah authorization model aplikasi.

Self-registration terbuka tidak diaktifkan. User eksternal harus diundang atau diaktifkan Admin.

## 4. Authorization model

Gunakan gabungan:
- RBAC: role → permission catalog.
- Project membership: user memiliki assignment ke project.
- Record scope: user hanya menangani PKS, warehouse, route, trip, shipment, task atau partner records yang ditugaskan.
- Relationship-based access: supplier dapat melihat transaksi milik supplier; buyer hanya data contract/project-nya.
- Attribute/data classification: dokumen finance/internal/private tidak otomatis muncul di portal.
- Publication whitelist: buyer/supplier hanya dapat melihat data yang sengaja dipublikasikan.

Role bukan satu-satunya sumber akses. Permission harus lolos semua lapisan scope dan status record.

## 5. Permission catalog

Minimum actions:
`view`, `create`, `edit`, `submit`, `verify`, `approve`, `reject`, `assign`, `publish`, `unpublish`, `request_payment`, `issue_payment_instruction`, `reconcile_payment`, `export_data`, `manage_members`, `manage_project_config`, `view_cost`, `view_profit`, `view_documents`, `manage_documents`, `manage_regulatory_rules`.

Permission berisiko tinggi seperti approve payment, issue payment instruction, reconcile, publish buyer data dan manage members harus dibedakan.

## 6. RLS design principles

- Default deny; grant only what is required.
- Terapkan native PostgreSQL RLS pada semua tabel yang mengandung data per project/partner atau data sensitif.
- Gunakan backend authorization sebagai lapisan tambahan; route guard/frontend visibility bukan security boundary.
- DB connection role aplikasi tidak boleh superuser/BYPASSRLS. Uji pemilik tabel, `FORCE ROW LEVEL SECURITY`, grants, views dan security-definer function secara eksplisit.
- Request context harus ditetapkan transaction-local pada koneksi/transaction yang sama (mis. `SET LOCAL`/`set_config(..., true)`) untuk menghindari kebocoran context pada pooled connection.
- Jangan menggunakan session variable permanen pada koneksi pool untuk menyimpan user/project context.
- Jangan menerima `user_id`, `project_id`, `role`, `partner_id` dari client sebagai bukti otorisasi. Ambil dari verified session dan server-side membership.
- Gunakan helper functions yang aman, schema-qualified, least-privilege dan diuji terhadap recursion/privilege escalation.

## 7. Visibility matrix baseline

| Data | Admin | PM | Field/checker | Finance | Buyer | Supplier/vendor |
|---|---|---|---|---|---|---|
| Project progress | All configured | Assigned projects | Task/area scope | Summary if needed | Published project | Own assigned task/contract |
| PKS price | Configured access | Optional | No default | Yes | No default | Own commercial contract only |
| Truck movement | All if allowed | Assigned project | Assigned trip | Summary | Published checkpoints | Own trip only |
| Inventory/lot | All if allowed | Assigned project | Assigned location | Cost summary | Published quantity | Own supply receipt only |
| RAB/actual cost | Yes by permission | Optional | No default | Yes | No | No |
| Payment data | Configured | Summary/approval as assigned | Own instruction/status | Yes | Only milestone status | Own invoice/payment status |
| Profit | Explicit permission | Explicit permission | No | Yes | No | No |
| Export documents | Configured | Project | Task scope | Finance docs if needed | Whitelisted docs | Own supporting docs |
| AIS/vessel | All project | Assigned project | Relevant operation | Read | Published | Relevant shipment if allowed |

## 8. Segregation of duties

- Requester cannot be the sole approver and reconciler for same payment.
- Payment executors cannot amend beneficiary bank details without independent verification.
- User who submits weight/evidence should not alone approve unexplained variance.
- User who uploads a compliance certificate should not be the only reviewer of its validity.
- Admin cannot silently rewrite historical transactions; corrections must be versioned/audited.
- Emergency override requires reason, elevated permission, time-bound access and audit.

## 9. Admin control

Hanya Admin Aplikasi yang mengubah role catalogue assignments, features, project memberships, external login access, data publication, approval rules dan configuration snapshots. Admin aplikasi bukan Neon organization admin dan tidak diberi database owner credentials melalui UI.

## 10. Acceptance criteria

- Buyer A cannot read Buyer B project or unpublished documents.
- Supplier PKS A cannot read PKS B supply/price/receipts.
- A user with PM role on project A cannot automatically see project B.
- A user with multiple roles receives union of permitted capabilities but remains within every project/record scope.
- Direct API calls cannot bypass frontend hidden menus.
- RLS tests run under actual application DB role, not database owner.
- Pooled connection tests prove context is cleared between users/requests.
- Revoked user/session loses access promptly.
- File signed URL cannot be generated without current permission and publication scope.
- All role/config changes generate audit events.
- Exactly one active Admin principal exists; non-Admin cannot approve Contract Program or substitute when Admin is unavailable.
- Admin-only actions require step-up authentication and are blocked while Admin access is suspended.
- Audit correctly identifies the single Admin principal and records session/device metadata; shared-credential attribution limitation is documented.

## 11. Dependencies

P01 user/role configuration; P02 DB and transaction context; P05 file scope; P10 app routing; P12 penetration/security tests.

## 12. References

- [Neon Managed Auth / Better Auth](https://neon.com/blog/neon-auth-branchable-identity-in-your-database)
- [Postgres Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Neon RLS concepts](https://neon.com/blog/modelling-authorization-for-a-social-network-with-postgres-rls-and-drizzle-orm)
