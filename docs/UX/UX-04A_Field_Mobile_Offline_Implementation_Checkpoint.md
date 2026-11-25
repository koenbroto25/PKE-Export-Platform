# UX-04A Field Mobile & Offline — Implementation Checkpoint

**Date:** 25 November 2026  
**Branch:** `p20/platform-continuation-20261123`  
**Status:** Source implementation in progress; CI validation pending; operational readiness NOT PASS.

## Source audit finding

The pre-existing field PWA setup document described an IndexedDB queue, evidence checksum, retry/backoff, conflict semantics, GPS capture, and authentication safeguards, but the current field component files were placeholders. The checkpoint therefore distinguishes written design from implemented source.

## Implemented in this package

- Field workspace with explicit Project and Assignment context inputs; draft task categories; note capture.
- Point-in-time GPS capture with permission-denied, unavailable, timeout/error and accuracy feedback.
- Evidence selection with image MIME allowlist and 15 MB cap.
- Local IndexedDB draft storage with project/status indexes.
- Draft metadata includes captured timestamp, optional GPS, evidence filename/type/size, preserved Blob and SHA-256 checksum.
- Unique draft ID; local state labelled Queued/local draft; no claim of server submission.
- Connection status and local draft listing.
- Automated contract tests for draft IDs/time/status and evidence/GPS metadata.

## Not implemented / explicit blockers

1. Assignment list and identity-bound assignment validation API.
2. Real backend synchronization endpoint, server-side idempotency contract, retry/backoff scheduler, and server receipt.
3. Upload adapter and server-side evidence integrity/content validation.
4. Conflict resolution UI backed by server state.
5. QR/barcode scanning.
6. Field task/checklist workflow transitions and signature/acknowledgement authority.
7. Secure cache isolation/cleanup on logout or account switch; current draft database is local and not encrypted/identity-partitioned.
8. Real device/mobile browser and weak-connectivity UAT.
9. API/RLS negative tests for the field workflows.

## Safety of the current UX

The component is intentionally a local draft collector, not a transaction submission UI. It requires a user-entered Project and Assignment ID but does not verify either against server permissions; therefore it must not be used to capture production transactions or official evidence until identity/assignment binding and sync are implemented. The UI says server synchronization is not connected and local drafts are not accepted evidence.

## Acceptance matrix

| Gate | Result |
|---|---|
| Local draft persistence source | Implemented |
| Evidence Blob preserved locally | Implemented |
| SHA-256 checksum generation | Implemented where Web Crypto available |
| GPS permission/error/accuracy states | Implemented |
| Upload/sync | Not implemented |
| Assignment/Project authorization | Not implemented |
| Conflict resolution | Not implemented |
| QR/barcode | Not implemented |
| Mobile/browser UAT | Not run |
| API/RLS negative test | Not run |
| CI | Pending run result |

## Next revision

UX-04A.2 must add assignment-bound read APIs and authorization integration, then implement server sync using existing verified endpoint contracts (or register missing APIs as blockers). Do not introduce schema/migration changes without the project approval and hash workflow. Deployment remains skipped.
