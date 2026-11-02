# P05 — Neon Object Storage & Document File Services

**Kategori:** Storage and evidence foundation  
**Prioritas:** P0  
**Status:** Draft untuk review

## 1. Tujuan

Menyimpan dokumen kontrak, dokumen ekspor, sertifikat, foto checkpoint, tiket timbang, foto kualitas, bukti kerja, bukti pembayaran dan laporan dalam Neon Object Storage dengan akses privat dan metadata terstruktur di Neon Postgres.

## 2. Keputusan storage

- Neon Object Storage menjadi bucket awal.
- Semua business files memakai private bucket.
- Storage Adapter memisahkan domain dari vendor; object key/prefix bukan access control.
- External backup copy ke provider independen (R2/AWS S3 atau provider yang lolos evaluasi) dilakukan saat production policy ditetapkan.
- Production dan non-production storage dipisah. Jangan mengkloning data sensitif ke dev/staging.

Neon Object Storage memakai protokol S3-compatible dan memiliki branch-aware object storage. Implementasi harus memverifikasi dukungan operasi yang benar-benar diperlukan, terutama signed URL, multipart upload, CORS, checksum, retention dan restore. Jangan menyamakan seluruh fitur Neon Object Storage dengan seluruh fitur S3 tanpa pengujian.

## 3. File classes

1. Commercial: contract, PO, invoice, packing list, sales/purchase docs.
2. Export/legal: PEB, NPE, B/L, COO/SKA, certificate, permit.
3. Quality: COA, lab result, sample images, inspection.
4. Operational evidence: truck photos, geotag, weighbridge ticket, warehouse/packing/loading evidence.
5. Finance: payment instruction, cash advance, receipts, bank statement, reconciliation proof.
6. Stakeholder reports: published buyer/supplier reports.
7. Public assets: logo and static non-sensitive assets (separate bucket if needed).

## 4. Upload workflow

1. Client requests upload authorization for a specific business entity/task.
2. Backend validates login, project, record scope, permission, file type, size and allowed status.
3. Backend issues short-lived signed upload URL or mediated upload token.
4. Client uploads object directly to private bucket.
5. Backend verifies object existence, checksum, byte length and detected MIME type.
6. File enters `quarantined/pending_scan`.
7. Malware/content scan and metadata extraction execute asynchronously.
8. Authorized reviewer accepts/rejects file.
9. Accepted file receives document/evidence version and links to business record.

A file is not considered valid business evidence merely because upload succeeded.

## 5. Download and sharing

- Every download goes through backend authorization.
- Generate short-lived signed download URLs only after permission check.
- Never log signed URL query strings or expose permanent object credentials.
- Buyer/supplier document share is a separate publication record with audience, purpose, version, expiry and revocation.
- Revocation cannot erase a file already downloaded; UI must make this limitation clear.

## 6. Metadata and integrity

`file_objects` and `file_object_versions` should store provider, bucket, object key, SHA-256 checksum, byte size, detected MIME, uploader, upload time, project, owner entity, classification, version, source, retention and scan/verification status.

Never overwrite verified original evidence. Replace by new version linked with `supersedes_document_id`; retain previous version according to policy.

## 7. Truck checkpoint evidence

Each tracking event can have multiple evidence items: truck front/plate, side/load, weighbridge ticket, arrival photo, unloading photo and exception evidence. Preserve original binary and checksum. Store GPS observation separately as a structured record; EXIF is supporting metadata, not trusted sole location proof.

For mobile/offline capture, store local capture timestamp and client metadata, then server receive timestamp on sync. Clearly distinguish capture time from server receipt time.

## 8. Security and retention

- Private bucket only for business and evidence files.
- Random non-guessable object keys.
- Content-type and size validation; MIME sniffing.
- Antivirus/malware scan where service is available.
- Document retention schedule and legal hold.
- Access/download audit events.
- Encryption in transit; provider at-rest encryption verification.
- Daily/periodic encrypted off-provider backup for critical files, with restore tests.
- Bucket/object cleanup requires retention policy and approval; never delete evidence referenced by open transaction, claim or audit.

## 9. Acceptance criteria

- Unauthenticated user cannot upload or download project files.
- Buyer can download only explicitly published document version.
- Supplier can access only its own submitted/received documents.
- Signed URL expires and is not reusable beyond intended scope/duration.
- Duplicate file hash is detected and flagged without incorrectly deleting evidence.
- Failed scan or failed checksum leaves file unverified.
- Backup restore can recover representative contract, photo and payment evidence.
- Object access is logged with user, project, document, purpose and time.

## 10. Dependencies

P02 metadata; P03 permission/RLS; P04 signed upload endpoints; P06 truck/warehouse evidence; P07 financial documents; P08 regulatory docs; P09 AI extraction; P12 recovery testing.

## 11. References

- [Neon Object Storage GA](https://neon.com/blog/building-neon-object-storage)
- [Neon Object Storage / S3-compatible examples](https://neon.com/blog/building-a-private-searchable-photo-library-on-the-neon-backend)
