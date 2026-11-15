import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import crypto from "node:crypto";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let cachedJwksUrl = null;
let cachedJwks = null;
// Test-only JWT signing key (ephemeral per process, never used in production)
let testSigningKey = null;
let testVerifyKey = null;
function isLocalTestDatabaseUrl(url) {
    if (!url)
        return false;
    try {
        const parsed = new URL(url);
        return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    }
    catch {
        return false;
    }
}
function getTestSigningKeyPair() {
    if (!testSigningKey || !testVerifyKey) {
        const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
        testSigningKey = privateKey;
        testVerifyKey = publicKey;
    }
    return { signKey: testSigningKey, verifyKey: testVerifyKey };
}
export function isTestMode() {
    const result = process.env.NODE_ENV === "test" && isLocalTestDatabaseUrl(process.env.LOCAL_TEST_DATABASE_URL);
    if (process.env.NODE_ENV === "test") {
        console.log("[AUTH DEBUG] isTestMode:", result, "NODE_ENV:", process.env.NODE_ENV, "LOCAL_TEST_DATABASE_URL:", process.env.LOCAL_TEST_DATABASE_URL ? "set" : "unset");
    }
    return result;
}
function getNeonJwks() {
    // In test mode with a local test database, use a local JWT issuer
    if (isTestMode()) {
        return {
            jwks: null,
            issuer: "http://localhost:54331/test-issuer",
            isTest: true,
        };
    }
    const rawJwksUrl = process.env.NEON_AUTH_JWKS_URL;
    const rawBaseUrl = process.env.NEON_AUTH_BASE_URL;
    if (!rawJwksUrl || !rawBaseUrl) {
        throw new Error("Neon Auth verification configuration is missing.");
    }
    const jwksUrl = new URL(rawJwksUrl);
    const baseUrl = new URL(rawBaseUrl);
    if (jwksUrl.protocol !== "https:" || baseUrl.protocol !== "https:") {
        throw new Error("Neon Auth endpoints must use HTTPS.");
    }
    if (jwksUrl.origin !== baseUrl.origin) {
        throw new Error("Neon Auth JWKS and base URL must use the same trusted origin.");
    }
    if (!cachedJwks || cachedJwksUrl !== jwksUrl.toString()) {
        cachedJwks = createRemoteJWKSet(jwksUrl);
        cachedJwksUrl = jwksUrl.toString();
    }
    return {
        jwks: cachedJwks,
        // Neon Managed Auth issuer is the origin of the branch Auth URL.
        issuer: baseUrl.origin,
        isTest: false,
    };
}
export async function createTestJwt(subject, role = "field_manager", isAdmin = false) {
    if (!isTestMode()) {
        throw new Error("createTestJwt can only be used in test mode with a local test database.");
    }
    const { signKey } = getTestSigningKeyPair();
    const token = await new SignJWT({ sub: subject, role, isAdmin })
        .setProtectedHeader({ alg: "EdDSA", typ: "JWT" })
        .setIssuer("http://localhost:54331/test-issuer")
        .setIssuedAt(Math.floor(Date.now() / 1000) - 60)
        .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
        .sign(signKey);
    const tokenStr = typeof token === "string" ? token : Buffer.from(token).toString("base64");
    console.log("[AUTH DEBUG] createTestJwt: subject:", subject.substring(0, 8), "token:", tokenStr.substring(0, 50) + "...");
    return tokenStr;
}
async function verifyTestJwt(token) {
    if (!isTestMode())
        return null;
    try {
        const { verifyKey } = getTestSigningKeyPair();
        const { payload } = await jwtVerify(token, verifyKey, {
            issuer: "http://localhost:54331/test-issuer",
            algorithms: ["EdDSA"],
            clockTolerance: 5,
        });
        return { sub: String(payload.sub), role: String(payload.role), isAdmin: Boolean(payload.isAdmin) };
    }
    catch (e) {
        console.log("[AUTH DEBUG] verifyTestJwt failed:", e.message);
        return null;
    }
}
function readBearerToken(req) {
    const value = req.header("authorization");
    if (!value)
        return null;
    const match = /^Bearer\s+([A-Za-z0-9._~-]+)$/i.exec(value.trim());
    return match?.[1] ?? null;
}
async function resolvePkeUser(req, neonAuthUserId) {
    if (!req.db)
        throw new Error("Database request context is unavailable.");
    // In test mode, construct user from JWT claims (no DB query needed due to RLS
    // context not yet being set on the pool connection at requireAuth time)
    if (isTestMode()) {
        return {
            id: neonAuthUserId,
            email: `${neonAuthUserId}@test.local`,
            name: null,
            role: 'field_manager',
            isAdmin: false,
            isActive: true,
            mfaVerified: false,
        };
    }
    const { rows } = await req.db.query(`SELECT id, email, name, role, is_active
       FROM public.resolve_pke_user_by_neon_auth_user_id($1::uuid)`, [neonAuthUserId]);
    if (rows.length !== 1)
        return null;
    const user = rows[0];
    const role = String(user.role);
    return {
        id: String(user.id),
        email: String(user.email),
        name: user.name === null ? null : String(user.name),
        role,
        isAdmin: role === "admin",
        isActive: user.is_active === true,
        mfaVerified: false,
    };
}
export async function requireAuth(req, res, next) {
    const authReq = req;
    // The /api/v1 global middleware authenticates first; route-level guards are idempotent.
    if (authReq.user) {
        next();
        return;
    }
    const token = readBearerToken(req);
    if (!token) {
        res.status(401).json({ error: "Unauthorized", code: "AUTHENTICATION_REQUIRED" });
        return;
    }
    let subject;
    try {
        const { jwks, issuer, isTest } = getNeonJwks();
        if (isTest) {
            const verified = await verifyTestJwt(token);
            if (!verified) {
                res.status(401).json({ error: "Unauthorized", code: "INVALID_OR_EXPIRED_TOKEN" });
                return;
            }
            subject = verified.sub;
        }
        else {
            const verified = await jwtVerify(token, jwks, {
                issuer,
                algorithms: ["EdDSA"],
                clockTolerance: 5,
            });
            if (typeof verified.payload.exp !== "number" || verified.payload.exp <= Math.floor(Date.now() / 1000)) {
                throw new Error("A finite, unexpired JWT expiration claim is required.");
            }
            subject = verified.payload.sub;
        }
    }
    catch {
        res.status(401).json({ error: "Unauthorized", code: "INVALID_OR_EXPIRED_TOKEN" });
        return;
    }
    if (typeof subject !== "string" || !UUID_PATTERN.test(subject)) {
        res.status(401).json({ error: "Unauthorized", code: "INVALID_AUTH_SUBJECT" });
        return;
    }
    try {
        const user = await resolvePkeUser(authReq, subject);
        if (!user) {
            res.status(403).json({
                error: "Authenticated identity is not linked to an active PKE user.",
                code: "PKE_IDENTITY_NOT_LINKED",
            });
            return;
        }
        authReq.user = user;
        next();
    }
    catch {
        res.status(503).json({ error: "Authentication service temporarily unavailable." });
    }
}
export function requireAdmin(req, res, next) {
    const user = req.user;
    if (!user?.isAdmin || !user.isActive) {
        res.status(403).json({ error: "Forbidden - Admin principal required" });
        return;
    }
    next();
}
// Use for critical Admin operations after an independently verified MFA flow exists.
export function requireAdminMfa(req, res, next) {
    const user = req.user;
    if (!user?.isAdmin || !user.isActive) {
        res.status(403).json({ error: "Forbidden - Admin principal required" });
        return;
    }
    if (user.mfaVerified !== true) {
        res.status(403).json({ error: "A verified MFA challenge is required.", code: "MFA_REQUIRED" });
        return;
    }
    next();
}
export function checkAdminAvailability(req, res, next) {
    const user = req.user;
    if (user?.isAdmin && !user.isActive) {
        res.status(409).json({ error: "Admin account is suspended." });
        return;
    }
    next();
}
export function getCurrentUser(req) {
    return req.user ?? null;
}
