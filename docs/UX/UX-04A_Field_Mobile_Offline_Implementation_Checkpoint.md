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


## Additional hardening revision

- Local draft store schema upgraded to index by authenticated principal ID; field capture requires a loaded authenticated user context.
- Local draft reads are restricted to the current principal and selected Project; changing Project clears the visible draft list.
- Selected evidence Blob is retained in IndexedDB, with SHA-256 calculated using Web Crypto where available.

This is local isolation only, not server authorization. Project/Assignment IDs remain manually entered and are not verified against membership/assignment API. Cache encryption, logout cleanup, cross-device recovery and authorized sync remain open.

## CI evidence (source head)

GitHub Actions Unit Tests run for code commit `b603d8a94a0df88ce5a2c61943c2cc9b98c105cc`: **PASS**. Root unit/security suite: **53 test files, 546 tests passed**. Dedicated P19 assurance: **20/20 passed**. Migration release/static gates and migration dry-run passed (dry-run; no DB connection). Backend build/typecheck, frontend typecheck and frontend build passed. This is static/CI evidence only; no live DB mutations, live HTTP/browser/mobile tests, UAT or deployment occurred. CI link: https://github.com/koenbroto25/PKE-Export-Platform/actions/runs/45610841342

The later commits on the branch are documentation-only. Vercel remains intentionally skipped.


## Current-head source audit addendum — 25 November 2026

The current branch head inspected for this addendum is `4259bb231d2ea83b11d179b7feb1fe0a28dacb4d`. The source remains a local-only draft collector. The SyncEngine component only displays online/offline state and draft counts; it does not synchronize to the server. Assignment ID and Project ID are manually entered and are not verified by backend authorization. Evidence is selected and preserved locally but is not uploaded. The inspected tests validate draft factory metadata but not IndexedDB persistence in a browser, server sync, idempotency, conflict handling, or identity-switch cleanup.

**Current disposition:** Local capture source implemented; server/operational readiness **NOT PASS**. Earlier CI evidence is historical and must not be treated as proof that this exact current head has passed CI. Current-head CI remains to be checked. No DB, migration, Vercel, or field-device action was performed.
