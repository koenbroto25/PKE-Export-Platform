# PKE Export Platform v4.2.2 - API Authorization Matrix (Revision 02)

## Audit Date: 2026-11-02
## Method: Actual code inspection of src/index.ts

## Endpoint Inventory (26 total endpoints)

| Route ID | Method | Path | Authentication | Required Permission | Project Scope | Admin-only | RLS Dependency | Test Result |
|----------|--------|------|---------------|--------------------|-------------|------------|---------------|-------------|
| R1 | GET | /api/v1/health | None (public) | N/A | N/A | N/A | N/A | ⬜ Not tested |
| R2 | GET | /api/v1/me | x-user-id header | x-user-id | N/A | N/A | ⬜ Not verified |
| R3 | GET | /api/v1/roles | requireAdmin | requireAdmin | Admin | N/A | ⬜ Not tested |
| R4 | GET | /api/v1/contract-programs | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R5 | GET | /api/v1/contract-programs/:id | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R5a | POST | /api/v1/contract-programs | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R6 | GET | /api/v1/cycle-policies | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R7 | POST | /api/v1/cycle-policies | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R8 | GET | /api/v1/projects | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R9 | GET | /api/v1/projects/:id | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R10 | POST | /api/v1/projects | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R11 | POST | /api/v1/truck-trips | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R11a | GET | /api/v1/truck-trips | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R12 | POST | /api/v1/tracking-events | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R13 | GET | /api/v1/tracking-events | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R13a | GET | /api/v1/rab | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R14 | POST | /api/v1/rab | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R15 | GET | /api/v1/fx-rates | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R16 | POST | /api/v1/fx-rates | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R17 | GET | /api/v1/fx-exposure | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R18 | POST | /api/v1/fx-exposure | None | N/A | N/A | N/A | ❌ Unauthenticated |
| R19 | GET | /api/v1/documents | requireAuth + requireAdmin | requireAuth + requireAdmin | N/A | ✅ Yes | ⬜ Not tested |
| R20 | POST | /api/v1/documents | requireAuth + requireAdmin | requireAuth + requireAdmin | N/A | ✅ Yes | ⬜ Not tested |
| R21 | POST | /api/v1/compliance-check | requireAuth + requireAdmin | requireAuth + requireAdmin | N/A | ✅ Yes | ⬜ Not tested |
| R22 | GET | /api/v1/country-packs | requireAuth + requireAdmin | requireAuth + requireAdmin | N/A | ✅ Yes | ⬜ Not tested |
| R23 | GET | /api/v1/regulatory-knowledge | requireAuth + requireAdmin | requireAuth + requireAdmin | N/A | ✅ Yes | ⬜ Not tested |

## Summary Counts

| Category | Count | Percentage |
|----------|-------|------------|
| Total endpoints | 26 | 100% |
| Unauthenticated private endpoints | 16 | 61.5% |
| Authenticated (requireAuth) | 5 | 19.2% |
| Admin-only (requireAuth + requireAdmin) | 5 | 19.2% |
| Public (health only) | 1 | 3.8% |

**Critical**: 16 of 26 endpoints (61.5%) have **no authentication middleware whatsoever**.

**No private business endpoint may remain publicly accessible.**