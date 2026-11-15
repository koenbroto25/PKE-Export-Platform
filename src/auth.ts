import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import crypto from "node:crypto";

export interface UserSession {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isAdmin: boolean;
  isActive: boolean;
  // Neon Managed Auth does not prove a second factor in this flow.
  // Keep false until a separate MFA challenge is implemented and verified.
  mfaVerified: boolean;
}

type AuthenticatedRequest = Request & {
  db?: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
  user?: UserSession;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let cachedJwksUrl: string | null = null;
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

// Test-only JWT signing key (ephemeral per process, never used in production)
let testSigningKey: crypto.KeyObject | null = null;
let testVerifyKey: crypto.KeyObject | null = null;

function isLocalTestDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function getTestSigningKeyPair(): { signKey: crypto.KeyObject; verifyKey: crypto.KeyObject } {
  if (!testSigningKey || !testVerifyKey) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    testSigningKey = privateKey;
    testVerifyKey = publicKey;
  }
  return { signKey: testSigningKey, verifyKey: testVerifyKey };
}

export function isTestMode(): boolean {
  return process.env.NODE_ENV === "test" && isLocalTestDatabaseUrl(process.env.LOCAL_TEST_DATABASE_URL);
}

function getNeonJwks() {
  // In test mode with a local test database, use a local JWT issuer
  if (isTestMode()) {
    return {
      jwks: null as any,
      issuer: "http://127.0.0.1:54331/test-issuer",
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

export async function createTestJwt(subject: string, role?: string, isAdmin?: boolean): Promise<string> {
  if (!isTestMode()) {
    throw new Error("createTestJwt can only be used in test mode with a local test database.");
  }
  const { signKey } = getTestSigningKeyPair();
  const claims: Record<string, unknown> = { sub: subject };
  if (role !== undefined) claims.role = role;
  if (isAdmin !== undefined) claims.isAdmin = isAdmin;
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT" })
    .setIssuer("http://127.0.0.1:54331/test-issuer")
    .setIssuedAt(Math.floor(Date.now() / 1000) - 60)
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(signKey);
  return typeof token === "string" ? token : Buffer.from(token).toString("base64");
}

async function verifyTestJwt(token: string): Promise<{ sub: string } | null> {
  if (!isTestMode()) return null;
  try {
    const { verifyKey } = getTestSigningKeyPair();
    const { payload } = await jwtVerify(token, verifyKey, {
      issuer: "http://127.0.0.1:54331/test-issuer",
      algorithms: ["EdDSA"],
      clockTolerance: 5,
    });
    if (typeof payload.sub !== "string") return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

function readBearerToken(req: Request): string | null {
  const value = req.header("authorization");
  if (!value) return null;
  const match = /^Bearer\s+([A-Za-z0-9._~-]+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}

async function resolvePkeUser(req: AuthenticatedRequest, neonAuthUserId: string): Promise<UserSession | null> {
  if (!req.db) throw new Error("Database request context is unavailable.");

  const { rows } = await req.db.query(
    `SELECT id, email, name, role, is_active
       FROM public.resolve_pke_user_by_neon_auth_user_id($1::uuid)`,
    [neonAuthUserId],
  );

  if (rows.length !== 1) return null;
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

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authReq = req as AuthenticatedRequest;

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

  let subject: unknown;
  try {
    const { jwks, issuer, isTest } = getNeonJwks();
    if (isTest) {
      const verified = await verifyTestJwt(token);
      if (!verified) {
        res.status(401).json({ error: "Unauthorized", code: "INVALID_OR_EXPIRED_TOKEN" });
        return;
      }
      subject = verified.sub;
    } else {
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
  } catch {
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
  } catch {
    res.status(503).json({ error: "Authentication service temporarily unavailable." });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;
  if (!user?.isAdmin || !user.isActive) {
    res.status(403).json({ error: "Forbidden - Admin principal required" });
    return;
  }
  next();
}

// Use for critical Admin operations after an independently verified MFA flow exists.
export function requireAdminMfa(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;
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

export function checkAdminAvailability(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;
  if (user?.isAdmin && !user.isActive) {
    res.status(409).json({ error: "Admin account is suspended." });
    return;
  }
  next();
}

export function getCurrentUser(req: Request): UserSession | null {
  return (req as AuthenticatedRequest).user ?? null;
}
