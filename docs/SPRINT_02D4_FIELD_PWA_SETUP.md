# SPRINT 02D4 Field PWA Setup

## PWA Setup
- Manifest: `frontend/public/manifest.webmanifest`
- Service worker: `frontend/public/sw.js`
- Registration is handled by the browser when the app is served over HTTPS or localhost.

## Service Worker Registration
- Cache name: `pke-v2`
- Static shell cached: `/`, `/login`, `/manifest.webmanifest`
- Private API responses and signed URLs are never cached.

## IndexedDB Schema
- Database: `pke-field`, version 1
- Store: `queue` (keyPath: `idempotencyKey`)
- Indexes: `principalId`, `status`
- Fields: idempotencyKey, principalId, truckTripId, eventType, latitude, longitude, accuracy, createdAt, status, retryCount, lastError, serverReceiptId, evidenceBlob, evidenceName, evidenceType, evidenceSize, checksum

## Offline Queue Lifecycle
1. Capture checkpoint and evidence.
2. Validate GPS and evidence.
3. Compute SHA-256 from original file.
4. If offline or upload fails, enqueue in IndexedDB.
5. Retry uses the same idempotency key.
6. Status transitions: draft -> queued -> syncing -> synced/failed/conflict.

## Authentication Requirements
- Verified session cookie is the authentic identity.
- `x-user-id` is not trusted as identity.
- Backend performs all authorization.
- Principal reference is only for local data separation.
- No access/session tokens or credentials are stored in IndexedDB.
- Sync is blocked when session is invalid.

## Evidence Upload Flow
1. Capture file via camera input.
2. Validate MIME type and file size.
3. Preserve original Blob.
4. Compute SHA-256.
5. Backend validates actual content type.
6. Failed upload does not delete local evidence.

## GPS Permission
- Uses `navigator.geolocation.getCurrentPosition`.
- Latitude: -90 to 90.
- Longitude: -180 to 180.
- Accuracy must be finite and greater than 0.
- Timestamp is recorded at capture.
- Permission denied is handled with manual/exception flow.
- GPS is a point-in-time checker location, not continuous vehicle tracking.

## Synchronization Workflow
- Manual and automatic sync supported.
- Retry count and backoff are tracked per queue item.
- Duplicate requests are prevented by idempotency key.
- Conflicts are preserved locally and on server until resolved.

## Conflict Resolution
- Local and server versions are retained.
- No silent overwrite.
- Offline records are not shown as server-verified before backend confirmation.

## Notification Integration
- Backend notification endpoints are persistent.
- Scope enforcement is backend-side.
- External providers remain adapter-pending if not configured.

## Browser/Device Limitations
- IndexedDB availability required.
- Geolocation permission required for GPS.
- Camera capture depends on browser support.
- Service worker requires HTTPS or localhost.

## Environment Variables
- `DATABASE_URL`
- `NODE_ENV`
- Frontend API base URL as configured in `frontend/src/lib/api.ts`

## Testing Instructions
- Frontend: `cd frontend && npm test`
- Frontend typecheck: `cd frontend && npm run typecheck`
- Backend typecheck: `npx tsc --noEmit`
- Frontend build: `cd frontend && npm run build`

## Deployment Instructions
- Deploy frontend as Next.js application.
- Serve service worker and manifest from public assets.
- Run backend migrations before deployment.

## Troubleshooting
- If queue is empty after restart, verify IndexedDB support and principal ID.
- If GPS fails, check browser permissions.
- If sync fails, check session validity and network.