import express from "express";
import dotenv from "dotenv";
import winston from "winston";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "./schema.js";
import { requireAuth, requireAdmin } from "./auth.js";
import { verifyNeonAuthWebhook } from "./neon-auth-webhook.js";
import { internalServerErrorPayload, requestRejectedPayload } from "./http-errors.js";
import { normalizePostgresSslMode, roleFromDatabaseUrl, validateRuntimeRoleState } from "./runtime-security.js";
import { privateStorage } from "./storage.js";
import { validateSingleBranchDatabaseUrl } from "../scripts/test-db/preflight.mjs";
import { detectManualTrialMode } from "./demo/mode.js";
import { registerDemoApiRoutes } from "./demo/routes.js";
import { isPositiveQuantity } from "./f1-contract-rules.js";
import { inspectRuntimeEnvironment, isServerlessRuntime, runtimeUnavailablePayload, type RuntimeStartupFailure } from "./runtime-readiness.js";
import { getCanonicalRoleTemplate, listProjectRoleTemplates } from "./role-catalogue.js";
import { validateAllocationCapacity, validateAllocationTransition } from "./f1-pri0-inventory-rules.js";
import { evaluatePmAppointment, isEffectiveProjectRoleAssignment, validateRoleAssignmentExpiry } from "./f1-role-assignment-rules.js";
import { isValidCashAdvanceRequest, canDecideCashAdvance } from "./f1-cash-advance-rules.js";
import { listCashAdvances, createCashAdvance, decideCashAdvance } from "./cash-advance-service.js";
import {
  isP1RecordType, initialP1Status, validateP1Create, validateP1Transition, validateThreeWayMatch,
  canApprovePurchaseOrder, canDecideQaRelease, canCloseAuditFinding, validateP1Evidence,
  evaluateFreshness, isDispatchOnTime, calculateLaytime, validateLcPresentation, type P1RecordType, type P1Status,
} from "./p1-workflow-engine.js";

// Extend Express Request type to include db, logger, and user
declare global {
  namespace Express {
    interface Request {
      db: any;
      drizzleDb: any;
      logger: winston.Logger;
      user: any;
      rawBody?: string;
    }
  }
}

dotenv.config();

function failClosed(message: string): never {
  const line = `BLOCKED: ${message}`;
  try { console.error(line); } catch {}
  process.exit(1);
}

// Manual Trial Mode (Rev 5.4-5.5): demo-safe, loopback-only, in-memory, no Neon/PostgreSQL/Auth/storage/external deps.
// Must be detected before production env/DB/Auth validation and before any Pool/client initialization.
const manualTrialMode = detectManualTrialMode(process.env);
if (manualTrialMode.blocked) {
  failClosed(manualTrialMode.blocked);
}

// In test mode, do not override DATABASE_URL with local test URLs (local DB forbidden).
// Integration tests run only against mandated single-branch DATABASE_URL when explicitly configured;
// otherwise DB-dependent integration remains fail-closed in the test harness.
if (process.env.NODE_ENV === "test") {
  // No local DATABASE_URL override. Mandated-target preflight is enforced by integration runner/harness.
}

export const app = express();
app.use(express.json({
  limit: "2mb",
  verify: (req, _res, buffer) => {
    if ((req as express.Request).originalUrl.split("?")[0] === "/api/v1/webhooks/neon-auth") {
      (req as express.Request).rawBody = buffer.toString("utf8");
    }
  },
}));
const PORT = process.env.PORT || 3000;

if (manualTrialMode.enabled) {
  console.log("[PKE][DEMO] Manual Trial Mode enabled (in-memory). Production/Neon DB, Auth, storage, and external providers are NOT initialized.");
}

// ============================================
// Logging setup (Winston)
// ============================================
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "pke-error.log", level: "error" }),
  ],
});

// Global middleware to log all requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// CORS for local frontend development
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS || (process.env.NODE_ENV === "production" ? "" : "http://localhost:3001,http://127.0.0.1:3001"))
    .split(",").map((item) => item.trim()).filter(Boolean);
  const allowed = new Set(configuredOrigins);
  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  }
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

const isProduction = process.env.NODE_ENV === "production";
let configuredDatabaseRole = "";
let pool!: Pool;
let runtimeStartupFailure: RuntimeStartupFailure | null = null;

function recordRuntimeStartupFailure(code: string, message: string, missingEnvironmentVariables: string[] = []): void {
  logger.error(message);
  runtimeStartupFailure = { code, missingEnvironmentVariables: [...missingEnvironmentVariables] };
  if (!isServerlessRuntime(process.env)) process.exit(1);
}

if (!manualTrialMode.enabled) {
  // Fail closed for local/server deployments. In Vercel serverless, retain the
  // process and expose an explicit 503 readiness response instead of process.exit(1).
  const envState = inspectRuntimeEnvironment(process.env);
  if (!envState.ready) {
    recordRuntimeStartupFailure(
      "RUNTIME_ENV_MISSING",
      `Missing required environment variables: ${envState.missingEnvironmentVariables.join(", ")}`,
      envState.missingEnvironmentVariables,
    );
  }

  if (!runtimeStartupFailure) {
    try {
      configuredDatabaseRole = roleFromDatabaseUrl(process.env.DATABASE_URL || "");
    } catch {
      recordRuntimeStartupFailure("DATABASE_URL_INVALID", "DATABASE_URL is invalid. API startup cancelled.");
    }
  }

  if (!runtimeStartupFailure && process.env.NODE_ENV !== "test") {
    const dbPreflight = validateSingleBranchDatabaseUrl(process.env.DATABASE_URL || "", process.env);
    if (!dbPreflight.ok) {
      // Log validator codes only. Never log DATABASE_URL, credentials, or raw validator messages.
      const problemCodes = Array.isArray(dbPreflight.problems)
        ? [...new Set(dbPreflight.problems.map((problem: { code?: unknown }) =>
            typeof problem?.code === "string" ? problem.code : "UNKNOWN"
          ))]
        : ["UNKNOWN"];

      for (const code of problemCodes) {
        logger.error(`DATABASE_URL preflight failed: code=${code}`);
      }

      recordRuntimeStartupFailure(
        "DATABASE_URL_PREFLIGHT_FAILED",
        `DATABASE_URL failed mandated single-branch preflight (${problemCodes.length} diagnostic code(s)). API startup cancelled.`,
      );
    }
    if (!runtimeStartupFailure && configuredDatabaseRole !== "app_runtime_secure") {
      recordRuntimeStartupFailure("DATABASE_ROLE_INVALID", "DATABASE_URL must use app_runtime_secure. API startup cancelled.");
    }
  }

  if (!runtimeStartupFailure) {
    for (const [key, value] of [["NEON_AUTH_BASE_URL", process.env.NEON_AUTH_BASE_URL], ["NEON_AUTH_JWKS_URL", process.env.NEON_AUTH_JWKS_URL]] as const) {
      try {
        const parsed = new URL(value || "");
        if (parsed.protocol !== "https:") throw new Error("HTTPS required");
      } catch {
        recordRuntimeStartupFailure("NEON_AUTH_CONFIG_INVALID", `${key} must be a valid HTTPS URL. API startup cancelled.`);
        break;
      }
    }
  }

  if (!runtimeStartupFailure) {
    // ============================================
    // Database connection with pooled RLS context support
    // ============================================
    try {
      pool = new Pool({
        connectionString: normalizePostgresSslMode(process.env.DATABASE_URL || ""),
        max: 20,
        idleTimeoutMillis: 30000,
      });
    } catch {
      recordRuntimeStartupFailure("DATABASE_POOL_INIT_FAILED", "Failed to create database pool. API startup cancelled.");
    }
  }

  if (runtimeStartupFailure && isServerlessRuntime(process.env)) {
    logger.error("PKE API serverless process remains alive but is not ready; readiness requests will return HTTP 503.");
  }
} else {
  logger.info("Manual Trial Mode: skipping required Neon env validation, DB preflight, auth endpoint validation, and Pool creation.");
}

if (manualTrialMode.enabled) {
  registerDemoApiRoutes(app);
} else {
// ============================================
// Health endpoints: liveness is independent of database readiness.
// ============================================
app.get("/api/v1/health/live", (_req: express.Request, res: express.Response) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json({ status: "alive" });
});

app.get("/api/v1/health", async (_req: express.Request, res: express.Response) => {
  if (runtimeStartupFailure || !pool) {
    return res.status(503).json(runtimeUnavailablePayload(
      runtimeStartupFailure ?? { code: "DATABASE_POOL_UNAVAILABLE", missingEnvironmentVariables: [] },
    ));
  }

  try {
    await pool.query("SELECT 1 as healthy");
    return res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "connected",
      environment: process.env.NODE_ENV,
    });
  } catch {
    return res.status(503).json(runtimeUnavailablePayload({
      code: "DATABASE_UNAVAILABLE",
      missingEnvironmentVariables: [],
    }));
  }
});

// Neon Managed Better Auth webhook. This endpoint accepts only signed provider events;
// it never trusts a browser-supplied Auth user ID and never reads neon_auth tables.
app.post("/api/v1/webhooks/neon-auth", async (req: express.Request, res: express.Response) => {
  if (process.env.NEON_AUTH_WEBHOOK_ENABLED !== "true") {
    return res.status(503).json({ error: "Auth identity synchronization is not enabled." });
  }

  let verified;
  try {
    verified = await verifyNeonAuthWebhook(
      req.rawBody || "",
      req.headers as any,
      { jwksUrl: process.env.NEON_AUTH_JWKS_URL || "" },
    );
  } catch {
    logger.warn("Rejected Neon Auth webhook: signature, timestamp, or payload verification failed.");
    return res.status(401).json({ error: "Invalid Neon Auth webhook." });
  }

  const isBeforeCreate = verified.eventType === "user.before_create";
  const isCreated = verified.eventType === "user.created";
  if (!isBeforeCreate && !isCreated) {
    return res.status(202).json({ ok: true, ignored: true });
  }

  const authUser = verified.payload.user as Record<string, unknown> | undefined;
  if (!authUser || typeof authUser.email !== "string") {
    if (isBeforeCreate) {
      return res.status(200).json({ allowed: false, error_message: "Invalid account creation payload.", error_code: "INVALID_AUTH_USER" });
    }
    return res.status(400).json({ error: "Neon Auth user-created payload is incomplete." });
  }

  if (isBeforeCreate) {
    try {
      const { rows } = await pool.query(
        "SELECT public.pke_is_preprovisioned_email($1::text) AS allowed",
        [authUser.email],
      );
      const allowed = rows[0]?.allowed === true;
      return res.status(200).json(allowed
        ? { allowed: true }
        : { allowed: false, error_message: "Akun harus diprovisikan terlebih dahulu oleh Admin PKE.", error_code: "PKE_ADMIN_PROVISION_REQUIRED" });
    } catch (error: any) {
      logger.error("Neon Auth before-create verification failed:", { code: error?.code || "UNKNOWN" });
      return res.status(503).json({ error: "PKE provisioning validation is temporarily unavailable." });
    }
  }

  if (typeof authUser.id !== "string") {
    return res.status(400).json({ error: "Neon Auth user-created payload has no identity id." });
  }
  try {
    const { rows } = await pool.query(
      "SELECT * FROM public.pke_link_neon_auth_identity_from_webhook($1::uuid, $2::text, $3::text, $4::uuid)",
      [authUser.id, authUser.email, typeof authUser.name === "string" ? authUser.name : null, verified.eventId],
    );
    return res.status(200).json({ ok: true, linkState: rows[0]?.link_state || "processed" });
  } catch (error: any) {
    logger.error("Neon Auth webhook identity synchronization failed:", { code: error?.code || "UNKNOWN" });
    return res.status(503).json({ error: "PKE identity synchronization is temporarily unavailable." });
  }
});

app.get("/api/v1/admin/provisioning/status", (req: express.Request, _res: express.Response, next: express.NextFunction) => { req.db = pool; next(); }, requireAuth, requireAdmin, (_req: express.Request, res: express.Response) => {
  const ready = process.env.NEON_AUTH_ADMIN_PROVISIONING_READY === "true"
    && process.env.NEON_AUTH_WEBHOOK_ENABLED === "true";
  res.json({ ready, reason: ready ? null : "Auth Admin provisioning and signed webhook synchronization have not both been enabled for this environment." });
});

// ============================================
// API version prefix with auth injection
// ============================================
app.use("/api/v1", async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  req.db = pool;
  req.logger = logger;
  await requireAuth(req, res, next);
});

 // P03_RLS_REQUEST_TRANSACTION_MIDDLEWARE
app.use("/api/v1", async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // The global authentication middleware above must establish req.user first.
  const principal = req.user;
  if (!principal || typeof principal.id !== "string" ||
      typeof principal.role !== "string" || principal.isActive !== true) {
    return res.status(401).json({
      error: "Authenticated PKE principal is required.",
      code: "AUTHENTICATED_PRINCIPAL_REQUIRED",
    });
  }

  let client: any;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query(
      `SELECT
         set_config('app.current_user_id', $1::text, true),
         set_config('app.current_role', $2::text, true)`,
      [principal.id, principal.role],
    );
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original connection/setup failure.
      }
      client.release();
    }
    logger.error("Unable to establish request-scoped RLS transaction:", error);
    return res.status(503).json({
      error: "Database request context is temporarily unavailable.",
      code: "RLS_TRANSACTION_SETUP_FAILED",
    });
  }

  // Bind raw SQL and Drizzle to the same checked-out PostgreSQL client.
  req.db = client;
  req.drizzleDb = drizzle(client, { schema });

  let finalizing = false;
  let released = false;
  let clientDisconnected = false;

  const releaseClient = () => {
    if (!released) {
      released = true;
      client.release();
    }
  };

  const originalEnd = res.end.bind(res);

  (res as any).end = (...args: any[]) => {
    if (finalizing) return res;
    finalizing = true;

    const endArgs = args;

    void (async () => {
      let transactionFailure: unknown = null;

      try {
        if (res.statusCode >= 400 || clientDisconnected) {
          await client.query("ROLLBACK");
        } else {
          await client.query("COMMIT");
        }
      } catch (error) {
        transactionFailure = error;
        try {
          await client.query("ROLLBACK");
        } catch {
          // The connection is released below; do not reuse a failed transaction.
        }
      } finally {
        releaseClient();
      }

      if (transactionFailure) {
        logger.error("RLS request transaction failed during finalization:", transactionFailure);
        res.statusCode = 500;
        res.removeHeader("Content-Length");
        res.removeHeader("ETag");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        originalEnd(JSON.stringify({
          error: "Database transaction could not be completed.",
          code: "DATABASE_TRANSACTION_FAILED",
        }));
        return;
      }

      originalEnd(...endArgs);
    })().catch((error) => {
      logger.error("Unexpected RLS transaction finalization error:", error);
      releaseClient();

      if (!res.headersSent) {
        res.statusCode = 500;
        res.removeHeader("Content-Length");
        res.removeHeader("ETag");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        originalEnd(JSON.stringify({
          error: "Database transaction finalization failed.",
          code: "DATABASE_TRANSACTION_FAILED",
        }));
      } else {
        originalEnd();
      }
    });

    return res;
  };

  // Do not release a client while a route query may still be in flight.
  // Mark an aborted response; the transaction rolls back when the route unwinds
  // and reaches res.end().
  res.once("close", () => {
    if (!res.writableFinished) clientDisconnected = true;
  });

  next();
});
// ============================================
// Authentication middleware
// ============================================

// Get current user context
app.get("/api/v1/me", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user.id;
    // project_members.role_id -> role_catalog.id (catalog role)
    // project_members.project_role_id -> project_roles.id (project-scoped role)
    const { rows: memberships } = await req.db.query(
      `SELECT pm.id AS membership_id, pm.project_id,
              p.name AS project_name,
              pm.role_id AS catalog_role_id,
              rc.name AS catalog_role_name,
              pm.is_active, pm.joined_at, pm.expires_at, pm.deactivated_at,
              p.is_active AS project_is_active,
              coalesce(assignments.roles, '[]'::jsonb) AS project_role_assignments
         FROM project_members pm
         LEFT JOIN projects p ON p.id = pm.project_id
         LEFT JOIN role_catalog rc ON rc.id = pm.role_id
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(jsonb_build_object(
             'assignmentId', a.id, 'projectRoleId', a.project_role_id,
             'roleCode', pr.role_code, 'roleName', pr.name, 'roleIsActive', pr.is_active,
             'isActive', a.is_active, 'expiresAt', a.expires_at, 'revokedAt', a.revoked_at
           ) ORDER BY pr.role_code) AS roles
             FROM public.project_role_assignments a
             JOIN public.project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
            WHERE a.project_member_id = pm.id
         ) assignments ON true
        WHERE pm.user_id = $1::uuid
        ORDER BY pm.joined_at DESC`,
      [userId],
    );

    const { rows: permissionRows } = await req.db.query(
      `SELECT DISTINCT perm.code FROM public.project_role_assignments a
       JOIN public.project_members pm ON pm.id=a.project_member_id AND pm.project_id=a.project_id AND pm.user_id=a.user_id
       JOIN public.project_roles pr ON pr.id=a.project_role_id AND pr.project_id=a.project_id AND pr.is_active=true
       JOIN public.project_role_permissions prp ON prp.project_id=a.project_id AND prp.project_role_id=a.project_role_id
       JOIN public.permissions perm ON perm.id=prp.permission_id JOIN public.projects p ON p.id=a.project_id
       WHERE a.user_id=$1::uuid AND a.is_active=true AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at>now())
       AND pm.is_active=true AND pm.deactivated_at IS NULL AND (pm.expires_at IS NULL OR pm.expires_at>now())
       AND p.is_active=true AND perm.is_active=true
       AND NOT(pr.role_code='funder' AND (perm.code LIKE 'finance.%' OR perm.code LIKE 'accounting.%' OR perm.code LIKE 'reports.%' OR perm.code LIKE 'payment.%' OR perm.code IN('report.view','view_financial','view_rab')))
       ORDER BY perm.code`,[userId]);
    const permissions: string[] = permissionRows.map((r: any) => r.code);

    const activeMemberships = memberships.filter((m: any) =>
      m.is_active === true &&
      m.deactivated_at == null &&
      m.project_is_active === true &&
      (!m.expires_at || new Date(m.expires_at).getTime() > Date.now())
    );
    const portalAccess = req.user.isAdmin
      ? ["admin", "workspace"]
      : activeMemberships.length > 0
        ? ["workspace", "field"]
        : ["workspace"];

    res.json({
      status: "authenticated",
      user: {
        ...req.user,
        accountStatus: req.user.isActive ? "active" : "inactive",
        platformAdmin: req.user.isAdmin === true,
        projectMemberships: memberships.map((m: any) => ({
          projectId: m.project_id,
          projectName: m.project_name,
          roleId: m.catalog_role_id,
          catalogRoleId: m.catalog_role_id,
          catalogRoleName: m.catalog_role_name,
          roleAssignments: m.project_role_assignments,
          roleCode: m.project_role_assignments?.find((a: any) => isEffectiveProjectRoleAssignment(
            { project_id: m.project_id, user_id: m.user_id, project_member_id: m.membership_id, is_active: a.isActive, revoked_at: a.revokedAt, expires_at: a.expiresAt, role_is_active: a.roleIsActive },
            { id: m.membership_id, project_id: m.project_id, user_id: m.user_id, is_active: m.is_active, deactivated_at: m.deactivated_at, expires_at: m.expires_at, project_is_active: m.project_is_active },
          ))?.roleCode ?? null,
          roleName: m.project_role_assignments?.find((a: any) => isEffectiveProjectRoleAssignment(
            { project_id: m.project_id, user_id: m.user_id, project_member_id: m.membership_id, is_active: a.isActive, revoked_at: a.revokedAt, expires_at: a.expiresAt, role_is_active: a.roleIsActive },
            { id: m.membership_id, project_id: m.project_id, user_id: m.user_id, is_active: m.is_active, deactivated_at: m.deactivated_at, expires_at: m.expires_at, project_is_active: m.project_is_active },
          ))?.roleName ?? null,
          isActive: m.is_active === true,
          joinedAt: m.joined_at,
        })),
        permissions,
        portalAccess,
      },
    });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/projects/:projectId/my-permissions", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = req.params.projectId as string;
  try {
    const { rows } = await req.db.query("SELECT public.pke_current_user_project_permissions($1::uuid) AS permissions", [projectId]);
    return res.json({ projectId, permissions: Array.isArray(rows[0]?.permissions) ? rows[0].permissions : [] });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

// Role and permission endpoints

// Contract Program management
app.get("/api/v1/contract-programs", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    if (!projectId || !(await requireProjectPermission(req, res, projectId, "contract.view"))) return projectId ? undefined : res.status(400).json({ error: "projectId query parameter required" });
    const { rows } = await req.db.query("SELECT * FROM contract_programs WHERE project_id = $1::uuid AND is_active = true ORDER BY created_at DESC", [projectId]);
    res.json({ contractPrograms: rows });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/contract-programs/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  try {
    const { rows: scopeRows } = await req.db.query(
      "SELECT project_id FROM contract_programs WHERE id = $1::uuid AND is_active = true",
      [id],
    );
    if (scopeRows.length === 0) return res.status(404).json({ error: "Contract Program not found." });
    const projectId = scopeRows[0].project_id;
    if (!(await requireProjectPermission(req, res, projectId, "contract.view"))) return;
    const { rows } = await req.db.query(
      "SELECT * FROM contract_programs WHERE id = $1::uuid AND project_id = $2::uuid AND is_active = true",
      [id, projectId],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Contract Program not found." });
    return res.json({ contractProgram: rows[0] });
  } catch (error) {
    return res.status(500).json(internalServerErrorPayload());
  }
});

// Buyer management
app.get("/api/v1/buyers", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) {
    if (!req.user?.isAdmin) return res.status(400).json({ error: "projectId is required." });
    try { const { rows } = await req.db.query("SELECT * FROM buyers WHERE is_active=true ORDER BY name"); return res.json({ buyers: rows }); }
    catch { return res.status(500).json(internalServerErrorPayload()); }
  }
  if (!(await requireProjectPermission(req, res, projectId, "finance.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT DISTINCT b.* FROM buyers b
       JOIN contract_programs cp ON cp.buyer_id=b.id
       JOIN projects p ON p.contract_program_id=cp.id
       WHERE p.id=$1::uuid AND b.is_active=true ORDER BY b.name`,
      [projectId],
    );
    return res.json({ buyers: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.get("/api/v1/vendors", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "finance.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT DISTINCT v.id,v.name,v.code,v.description
         FROM vendors v JOIN project_supplier_participation psp ON psp.vendor_id=v.id
        WHERE psp.project_id=$1::uuid AND psp.is_active=true AND v.is_active=true
        ORDER BY v.name`,
      [projectId],
    );
    return res.json({ vendors: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

/**
 * P2-A / P15: Project-scoped PKS operational overlay.
 * Global legal/facility identity remains read-only here and requires a separate
 * independently reviewed master-data change workflow.
 */
app.get("/api/v1/projects/:projectId/pks-sites/catalog", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  if (req.user?.isAdmin) {
    const { rows } = await req.db.query("SELECT id FROM public.projects WHERE id=$1::uuid AND is_active=true", [projectId]);
    if (!rows.length) return res.status(404).json({ error: "Project not found." });
  } else if (!(await requireProjectPermission(req, res, projectId, "pks.site.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT s.id,s.name,s.code,s.facility_type,s.city,s.province,s.country_code,
              s.operating_status,s.verification_status,s.source_type,s.source_reference,
              v.id AS vendor_id,v.name AS supplier_name,v.code AS supplier_code
         FROM public.pks_sites s
         LEFT JOIN public.vendors v ON v.organization_id=s.organization_id AND v.is_active=true
        WHERE s.is_active=true
          AND NOT EXISTS (
            SELECT 1 FROM public.project_pks_site_participation pp
             WHERE pp.project_id=$1::uuid AND pp.pks_site_id=s.id
          )
        ORDER BY s.facility_type,s.name`,
      [projectId],
    );
    return res.json({ facilities: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.get("/api/v1/projects/:projectId/product-requirements", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  if (req.user?.isAdmin) {
    const { rows } = await req.db.query("SELECT id FROM public.projects WHERE id=$1::uuid AND is_active=true", [projectId]);
    if (!rows.length) return res.status(404).json({ error: "Project not found." });
  } else if (!(await requireProjectPermission(req, res, projectId, "product.requirement.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT r.id,r.project_id,r.product_id,r.requirement_code,r.version_no,r.specification_label,
              r.measurement_basis,r.specification_data,r.test_methods,r.packaging_requirements,
              r.shipment_requirements,r.source_type,r.source_reference,r.approval_status,r.notes,
              r.is_seed_data,r.seed_batch_id,r.approved_by,r.approved_at,r.created_at,r.updated_at,
              p.product_code,p.product_name,p.canonical_name
         FROM public.project_product_requirements r
         JOIN public.product_catalog p ON p.id=r.product_id
        WHERE r.project_id=$1::uuid
        ORDER BY r.updated_at DESC,p.product_code,r.requirement_code,r.version_no DESC`,
      [projectId],
    );
    const { rows: products } = await req.db.query(
      "SELECT id,product_code,product_name,canonical_name FROM public.product_catalog WHERE is_active=true ORDER BY product_code",
    );
    const { rows: manageRows } = await req.db.query(
      "SELECT public.pke_has_project_permission($1::uuid,'product.requirement.manage') AS allowed",
      [projectId],
    );
    return res.json({
      requirements: rows,
      products,
      canManage: req.user?.isAdmin === true || manageRows[0]?.allowed === true,
      canApprove: req.user?.isAdmin === true,
    });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/projects/:projectId/product-requirements", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  if (req.user?.isAdmin) {
    const { rows } = await req.db.query("SELECT id FROM public.projects WHERE id=$1::uuid AND is_active=true", [projectId]);
    if (!rows.length) return res.status(404).json({ error: "Project not found." });
  } else if (!(await requireProjectPermission(req, res, projectId, "product.requirement.manage"))) return;
  const b=req.body ?? {};
  const productId=typeof b.productId==="string"?b.productId:"";
  const requirementCode=typeof b.requirementCode==="string"?b.requirementCode.trim():"";
  const label=typeof b.specificationLabel==="string"?b.specificationLabel.trim():"";
  const sourceReference=typeof b.sourceReference==="string"?b.sourceReference.trim():"";
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId) ||
     requirementCode.length<2 || requirementCode.length>120 || label.length<2 || label.length>240 || !sourceReference){
    return res.status(400).json({error:"Product, requirement code, specification label and source reference are required."});
  }
  try{
    const {rows}=await req.db.query(
      `INSERT INTO public.project_product_requirements(
        project_id,product_id,requirement_code,version_no,specification_label,measurement_basis,
        specification_data,test_methods,packaging_requirements,shipment_requirements,
        source_type,source_reference,source_snapshot,approval_status,notes,is_seed_data,seed_batch_id,
        created_by,updated_by
      ) VALUES ($1::uuid,$2::uuid,$3,1,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12::jsonb,'draft',$13,false,NULL,$14::uuid,$14::uuid)
      RETURNING *`,
      [projectId,productId,requirementCode,label,b.measurementBasis ?? "as_received",
       JSON.stringify(b.specificationData ?? {}),JSON.stringify(b.testMethods ?? {}),
       b.packagingRequirements ?? null,b.shipmentRequirements ?? null,
       b.sourceType==="public_reference"?"public_reference":"manual",sourceReference,
       JSON.stringify(b.sourceSnapshot ?? {}),b.notes ?? null,req.user?.id ?? null],
    );
    return res.status(201).json({requirement:rows[0]});
  }catch(error:any){
    if(error?.code==="23505") return res.status(409).json({error:"This requirement code and version already exist for the Project/product."});
    if(error?.code==="23503" || error?.code==="23514" || error?.code==="22P02") return res.status(400).json({error:"Product requirement fields failed validation."});
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/projects/:projectId/product-requirements/:requirementId", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId,requirementId }=req.params;
  if(req.user?.isAdmin){
    const {rows}=await req.db.query("SELECT id FROM public.projects WHERE id=$1::uuid AND is_active=true",[projectId]);
    if(!rows.length) return res.status(404).json({error:"Project not found."});
  }else if(!(await requireProjectPermission(req,res,projectId,"product.requirement.manage"))) return;
  const b=req.body??{};
  const fields:Array<[string,string,(v:any)=>any]>=[
    ["specificationLabel","specification_label",v=>typeof v==="string"?v.trim():v],
    ["measurementBasis","measurement_basis",v=>v],
    ["specificationData","specification_data",v=>JSON.stringify(v??{})],
    ["testMethods","test_methods",v=>JSON.stringify(v??{})],
    ["packagingRequirements","packaging_requirements",v=>v],
    ["shipmentRequirements","shipment_requirements",v=>v],
    ["notes","notes",v=>v],
  ];
  const updates:string[]=[];const values:any[]=[];let idx=1;
  for(const [key,column,convert] of fields) if(Object.prototype.hasOwnProperty.call(b,key)){
    const value=convert(b[key]);
    if(column==="specification_label" && (typeof value!=="string"||value.length<2||value.length>240))
      return res.status(400).json({error:"Specification label must contain 2–240 characters."});
    updates.push(`${column}=${column==="specification_data"||column==="test_methods"?"$"+idx+++"::jsonb":"$"+idx++}`);
    values.push(value);
  }
  if(b.approvalStatus!==undefined){
    if(req.user?.isAdmin!==true) return res.status(403).json({error:"Only Platform Admin may approve Project product requirements."});
    if(!["draft","submitted","approved","rejected","superseded"].includes(b.approvalStatus))
      return res.status(400).json({error:"Invalid approval status."});
    updates.push("approval_status=$"+idx++);values.push(b.approvalStatus);
  }
  if(!updates.length) return res.status(400).json({error:"No editable product requirement fields supplied."});
  updates.push("updated_by=$"+idx+++"::uuid");values.push(req.user?.id??null);
  updates.push("updated_at=now()");
  values.push(requirementId,projectId);
  try{
    const {rows}=await req.db.query(
      `UPDATE public.project_product_requirements SET ${updates.join(",")}
        WHERE id=${idx++}::uuid AND project_id=${idx}::uuid RETURNING *`,values);
    if(!rows.length) return res.status(404).json({error:"Product requirement not found in this Project."});
    return res.json({requirement:rows[0]});
  }catch(error:any){
    if(error?.code==="42501") return res.status(403).json({error:"Product provenance and approval decisions are protected."});
    if(error?.code==="23514"||error?.code==="22P02") return res.status(400).json({error:"Product requirement fields failed validation."});
    return res.status(500).json(internalServerErrorPayload());
  }
});


/** P15: Project-scoped request + independent Platform Admin approval for canonical identities. */
app.get("/api/v1/projects/:projectId/master-data-change-requests", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  if (req.user?.isAdmin) {
    const { rows } = await req.db.query("SELECT id FROM public.projects WHERE id=$1::uuid AND is_active=true", [projectId]);
    if (!rows.length) return res.status(404).json({ error: "Project not found." });
  } else if (!(await requireProjectPermission(req, res, projectId, "pks.master_data.change_request.view"))) return;
  try {
    const [requests, organizations, facilities, manage, evidenceDocuments, products, facilityProducts, capacityRecords, certifications] = await Promise.all([
      req.db.query(`SELECT id,project_id,entity_type,operation,target_id,proposed_data,base_snapshot,status,
                request_reason,source_type,source_reference,source_url,source_snapshot,evidence_document_id,decision_note,
                requested_by,reviewed_by,reviewed_at,applied_target_id,applied_at,created_at,updated_at
           FROM public.p2a_master_data_change_requests
          WHERE project_id=$1::uuid ORDER BY created_at DESC`, [projectId]),
      req.db.query(`SELECT po.id,po.legal_name,po.organization_type,po.country_code,po.verification_status
        FROM public.partner_organizations po
       WHERE po.is_active=true
         AND (public.pke_is_platform_admin() OR
           EXISTS (SELECT 1 FROM public.project_supplier_participation sp JOIN public.vendors v ON v.id=sp.vendor_id
                    WHERE sp.project_id=$1::uuid AND sp.is_active=true AND v.is_active=true AND v.organization_id=po.id)
           OR EXISTS (SELECT 1 FROM public.project_pks_site_participation pp JOIN public.vendors v ON v.id=pp.vendor_id
                    WHERE pp.project_id=$1::uuid AND pp.status<>'closed' AND v.is_active=true AND v.organization_id=po.id)
           OR EXISTS (SELECT 1 FROM public.buyers b JOIN public.contract_programs cp ON cp.buyer_id=b.id
                    WHERE cp.project_id=$1::uuid AND cp.is_active=true AND b.is_active=true AND b.organization_id=po.id)
           OR EXISTS (SELECT 1 FROM public.pks_sites s JOIN public.project_operating_profiles op ON op.primary_pks_site_id=s.id
                    WHERE op.project_id=$1::uuid AND s.organization_id=po.id))
       ORDER BY po.legal_name`, [projectId]),
      req.db.query(`SELECT s.id,s.name,s.facility_type,s.city,s.province,s.country_code,s.verification_status
        FROM public.pks_sites s
       WHERE s.is_active=true
         AND (public.pke_is_platform_admin() OR EXISTS (
           SELECT 1 FROM public.project_pks_site_participation pp
            WHERE pp.project_id=$1::uuid AND pp.pks_site_id=s.id AND pp.status<>'closed'))
       ORDER BY s.name`, [projectId]),
      req.db.query("SELECT public.pke_has_project_permission($1::uuid,'pks.master_data.change_request.manage') AS allowed", [projectId]),
      req.db.query(
        `SELECT id,original_filename,document_type_code,sha256_checksum,uploaded_at
           FROM public.project_export_documents
          WHERE project_id=$1::uuid AND status='approved' AND upload_verified_at IS NOT NULL
            AND object_key IS NOT NULL AND sha256_checksum IS NOT NULL
            AND storage_bucket='pke-private-documents' AND legal_hold=false
            AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE)
          ORDER BY uploaded_at DESC`,
        [projectId],
      ),
      req.db.query("SELECT id,product_code,product_name,classification_status,classification_project_id,classification_evidence_document_id,classification_evidence_sha256,classification_source_reference,classification_verified_by,classification_verified_at FROM public.product_catalog WHERE is_active=true ORDER BY product_name"),
      req.db.query(`SELECT fp.id,fp.facility_id,fs.name AS facility_name,fp.product_id,pc.product_code,pc.product_name,fp.process_type,fp.capability_status,fp.source_reference,fp.evidence_document_id,fp.evidence_sha256,fp.verified_by,fp.verified_at FROM public.facility_products fp JOIN public.product_catalog pc ON pc.id=fp.product_id JOIN public.pks_sites fs ON fs.id=fp.facility_id WHERE (public.pke_is_platform_admin() OR EXISTS (SELECT 1 FROM public.project_pks_site_participation pp WHERE pp.project_id=$1::uuid AND pp.pks_site_id=fs.id AND pp.status<>'closed')) ORDER BY fp.created_at DESC`, [projectId]),
      req.db.query(`SELECT cr.id,cr.facility_id,fs.name AS facility_name,cr.process_type,cr.capacity_kind,cr.capacity_value,cr.unit_code,cr.period_type,cr.effective_from,cr.effective_to,cr.source_reference,cr.evidence_document_id,cr.evidence_sha256,cr.verified_by,cr.verified_at FROM public.facility_capacity_records cr JOIN public.pks_sites fs ON fs.id=cr.facility_id WHERE (public.pke_is_platform_admin() OR EXISTS (SELECT 1 FROM public.project_pks_site_participation pp WHERE pp.project_id=$1::uuid AND pp.pks_site_id=fs.id AND pp.status<>'closed')) ORDER BY cr.effective_from DESC`, [projectId]),
      req.db.query(`SELECT fc.id,fc.facility_id,fs.name AS facility_name,fc.certification_type,fc.certificate_number,fc.issuer,fc.scope,fc.valid_from,fc.valid_to,fc.status,fc.source_reference,fc.evidence_document_id,fc.evidence_sha256,fc.verified_by,fc.verified_at FROM public.facility_certifications fc JOIN public.pks_sites fs ON fs.id=fc.facility_id WHERE (public.pke_is_platform_admin() OR EXISTS (SELECT 1 FROM public.project_pks_site_participation pp WHERE pp.project_id=$1::uuid AND pp.pks_site_id=fs.id AND pp.status<>'closed')) ORDER BY fc.created_at DESC`, [projectId]),
    ]);
    return res.json({
      requests: requests.rows, organizations: organizations.rows, facilities: facilities.rows,
      evidenceDocuments: evidenceDocuments.rows, products: products.rows,
      facilityProducts: facilityProducts.rows, capacityRecords: capacityRecords.rows, certifications: certifications.rows,
      canManage: req.user?.isAdmin === true || manage.rows[0]?.allowed === true,
      canReview: req.user?.isAdmin === true,
    });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/projects/:projectId/master-data-change-requests", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  if (req.user?.isAdmin) {
    const { rows } = await req.db.query("SELECT id FROM public.projects WHERE id=$1::uuid AND is_active=true", [projectId]);
    if (!rows.length) return res.status(404).json({ error: "Project not found." });
  } else if (!(await requireProjectPermission(req, res, projectId, "pks.master_data.change_request.manage"))) return;
  const b = req.body ?? {};
  const entityType = b.entityType, operation = b.operation;
  const targetId = typeof b.targetId === "string" ? b.targetId : null;
  const proposedData = b.proposedData;
  const requestReason = typeof b.requestReason === "string" ? b.requestReason.trim() : "";
  const sourceType = ["manual","public_reference","official_document","buyer_confirmed"].includes(b.sourceType) ? b.sourceType : "manual";
  const sourceReference = typeof b.sourceReference === "string" ? b.sourceReference.trim() : "";
  const sourceUrl = typeof b.sourceUrl === "string" && b.sourceUrl.trim() ? b.sourceUrl.trim() : null;
  const evidenceDocumentId = typeof b.evidenceDocumentId === "string" ? b.evidenceDocumentId : null;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!["organization","facility","facility_product","capacity_record","certification"].includes(entityType) || !["create","update"].includes(operation) ||
      (["facility_product","capacity_record","certification"].includes(entityType) && operation!=="create") ||
      (operation === "update" && (!targetId || !uuidPattern.test(targetId))) ||
      (operation === "create" && targetId !== null) ||
      !proposedData || typeof proposedData !== "object" || Array.isArray(proposedData) ||
      Object.keys(proposedData).length === 0 || requestReason.length < 10 || requestReason.length > 2000 ||
      sourceReference.length < 2 || sourceReference.length > 500 ||
      (sourceUrl !== null && !/^https?:\/\//i.test(sourceUrl)) ||
      (evidenceDocumentId !== null && !uuidPattern.test(evidenceDocumentId)) ||
      (["facility_product","capacity_record","certification"].includes(entityType) && !evidenceDocumentId)) {
    return res.status(400).json({ error: "Entity, operation, non-empty proposal, reason and source reference must be valid." });
  }
  try {
    const { rows } = await req.db.query(
      `INSERT INTO public.p2a_master_data_change_requests(
         project_id,entity_type,operation,target_id,proposed_data,status,request_reason,
         source_type,source_reference,source_url,source_snapshot,requested_by,evidence_document_id
       ) VALUES ($1::uuid,$2,$3,$4::uuid,$5::jsonb,'draft',$6,$7,$8,$9,$10::jsonb,$11::uuid,$12::uuid)
       RETURNING *`,
      [projectId,entityType,operation,targetId,JSON.stringify(proposedData),requestReason,sourceType,
       sourceReference,sourceUrl,JSON.stringify(b.sourceSnapshot ?? {}),req.user?.id ?? null,evidenceDocumentId],
    );
    return res.status(201).json({ request: rows[0] });
  } catch (error: any) {
    if (error?.code === "42501") return res.status(403).json({ error: "Master-data request permission or target visibility denied." });
    if (error?.code === "P0002") return res.status(404).json({ error: "Canonical master record is not visible in this Project." });
    if (error?.code === "23514" || error?.code === "22P02" || error?.code === "23503") return res.status(400).json({ error: "Master-data request failed validation." });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/projects/:projectId/master-data-change-requests/:requestId", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, requestId } = req.params;
  const isAdmin = req.user?.isAdmin === true;
  if (isAdmin) {
    const { rows } = await req.db.query("SELECT id FROM public.projects WHERE id=$1::uuid AND is_active=true", [projectId]);
    if (!rows.length) return res.status(404).json({ error: "Project not found." });
  } else if (!(await requireProjectPermission(req, res, projectId, "pks.master_data.change_request.manage"))) return;
  const b = req.body ?? {}, updates: string[] = [], values: any[] = [];
  let idx = 1;
  const add = (column: string, value: unknown, cast = "") => { updates.push(`${column}=$${idx++}${cast}`); values.push(value); };
  if (isAdmin) {
    if (b.proposedData !== undefined || b.requestReason !== undefined || b.sourceType !== undefined ||
        b.sourceReference !== undefined || b.sourceUrl !== undefined || b.sourceSnapshot !== undefined || b.evidenceDocumentId !== undefined) {
      return res.status(403).json({ error: "Platform Admin may decide but may not rewrite the submitted proposal." });
    }
    if (b.status !== undefined) {
      if (!["approved","rejected"].includes(b.status)) return res.status(400).json({ error: "Admin decision must be approved or rejected." });
      add("status", b.status);
    }
    if (b.decisionNote !== undefined) {
      if (typeof b.decisionNote !== "string" || b.decisionNote.length > 2000) return res.status(400).json({ error: "Decision note is invalid." });
      add("decision_note", b.decisionNote.trim() || null);
    }
  } else {
    if (b.status !== undefined) {
      if (b.status !== "submitted") return res.status(403).json({ error: "PM may only submit a draft; approval is Admin-only." });
      add("status", "submitted");
    }
    const editable: Array<[string,string,(v:any)=>any,string]> = [
      ["proposedData","proposed_data",v=>JSON.stringify(v),"::jsonb"],
      ["requestReason","request_reason",v=>typeof v==="string"?v.trim():v,""],
      ["sourceType","source_type",v=>v,""],
      ["sourceReference","source_reference",v=>typeof v==="string"?v.trim():v,""],
      ["sourceUrl","source_url",v=>v===""?null:v,""],
      ["sourceSnapshot","source_snapshot",v=>JSON.stringify(v??{}),"::jsonb"],
      ["evidenceDocumentId","evidence_document_id",v=>v||null,"::uuid"],
    ];
    for (const [key,column,convert,cast] of editable) {
      if (!Object.prototype.hasOwnProperty.call(b,key)) continue;
      const value = convert(b[key]);
      if (key==="proposedData" && (!b[key] || typeof b[key]!=="object" || Array.isArray(b[key]) || Object.keys(b[key]).length===0))
        return res.status(400).json({ error: "Proposal must be a non-empty JSON object." });
      if (key==="requestReason" && (typeof value!=="string" || value.length<10 || value.length>2000))
        return res.status(400).json({ error: "Request reason must contain 10–2000 characters." });
      if (key==="sourceType" && !["manual","public_reference","official_document","buyer_confirmed"].includes(String(value)))
        return res.status(400).json({ error: "Source type is invalid." });
      if (key==="sourceReference" && (typeof value!=="string" || value.length<2 || value.length>500))
        return res.status(400).json({ error: "Source reference must contain 2–500 characters." });
      if (key==="sourceUrl" && value!==null && (typeof value!=="string" || !/^https?:\/\//i.test(value)))
        return res.status(400).json({ error: "Source URL must use HTTP or HTTPS." });
      if (key==="evidenceDocumentId" && value!==null && (typeof value!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)))
        return res.status(400).json({ error: "Evidence document ID is invalid." });
      add(column,value,cast);
    }
  }
  if (!updates.length) return res.status(400).json({ error: "No permitted change fields supplied." });
  updates.push("updated_at=now()");
  values.push(requestId,projectId);
  try {
    const { rows } = await req.db.query(
      `UPDATE public.p2a_master_data_change_requests SET ${updates.join(",")}
        WHERE id=$${idx++}::uuid AND project_id=$${idx}::uuid RETURNING *`,
      values,
    );
    if (!rows.length) return res.status(404).json({ error: "Master-data change request not found in this Project." });
    return res.json({ request: rows[0] });
  } catch (error: any) {
    if (error?.code === "42501") return res.status(403).json({ error: "Request is not editable by this role or the decision is not authorized." });
    if (error?.code === "40001") return res.status(409).json({ error: "Canonical data changed after submission. Create a fresh request against the latest record." });
    if (error?.code === "23514" || error?.code === "22P02" || error?.code === "23503") return res.status(400).json({ error: "Master-data decision failed validation." });
    return res.status(500).json(internalServerErrorPayload());
  }
});


/** Admin-only verification for canonical identity records. The database trigger
 * requires an approved, checksum-verified document from the same Project. */
app.patch("/api/v1/projects/:projectId/master-data/organizations/:organizationId/verification", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { projectId, organizationId } = req.params;
  const evidenceDocumentId = typeof req.body?.evidenceDocumentId === "string" ? req.body.evidenceDocumentId : "";
  const sourceReference = typeof req.body?.sourceReference === "string" ? req.body.sourceReference.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(evidenceDocumentId) || sourceReference.length < 2 || sourceReference.length > 500)
    return res.status(400).json({ error: "Approved evidence document and source reference are required." });
  try {
    const doc = await req.db.query(
      "SELECT id,sha256_checksum,object_key,original_filename,document_type_code FROM public.project_export_documents WHERE id=$1::uuid AND project_id=$2::uuid AND status='approved' AND upload_verified_at IS NOT NULL AND sha256_checksum IS NOT NULL AND object_key IS NOT NULL AND storage_bucket='pke-private-documents' AND legal_hold=false AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE)",
      [evidenceDocumentId,projectId],
    );
    if (!doc.rows.length) return res.status(422).json({ error: "Evidence document must be approved, checksum-verified and belong to this Project." });
    const updated = await req.db.query(
      "UPDATE public.partner_organizations SET verification_status='verified',verification_project_id=$1::uuid,verification_evidence_document_id=$2::uuid,verification_source_reference=$3,verification_source_snapshot=$4::jsonb,updated_at=now() WHERE id=$5::uuid AND verification_status<>'verified' RETURNING id,legal_name,verification_status,verified_by,verified_at,verification_evidence_document_id,verification_evidence_sha256",
      [projectId,evidenceDocumentId,sourceReference,JSON.stringify({document_id:evidenceDocumentId,sha256:doc.rows[0].sha256_checksum,filename:doc.rows[0].original_filename,document_type:doc.rows[0].document_type_code}),organizationId],
    );
    if (!updated.rows.length) return res.status(409).json({ error: "Organization not found or is already verified. Material identity changes require a new review." });
    return res.json({ organization: updated.rows[0] });
  } catch (error: any) {
    if (error?.code === "42501") return res.status(403).json({ error: "Platform Admin verification is required." });
    if (error?.code === "23514" || error?.code === "23503") return res.status(422).json({ error: "Identity verification evidence failed database validation." });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/projects/:projectId/master-data/facilities/:facilityId/verification", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { projectId, facilityId } = req.params;
  const evidenceDocumentId = typeof req.body?.evidenceDocumentId === "string" ? req.body.evidenceDocumentId : "";
  const sourceReference = typeof req.body?.sourceReference === "string" ? req.body.sourceReference.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(evidenceDocumentId) || sourceReference.length < 2 || sourceReference.length > 500)
    return res.status(400).json({ error: "Approved evidence document and source reference are required." });
  try {
    const doc = await req.db.query(
      "SELECT id,sha256_checksum,object_key,original_filename,document_type_code FROM public.project_export_documents WHERE id=$1::uuid AND project_id=$2::uuid AND status='approved' AND upload_verified_at IS NOT NULL AND sha256_checksum IS NOT NULL AND object_key IS NOT NULL AND storage_bucket='pke-private-documents' AND legal_hold=false AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE)",
      [evidenceDocumentId,projectId],
    );
    if (!doc.rows.length) return res.status(422).json({ error: "Evidence document must be approved, checksum-verified and belong to this Project." });
    const updated = await req.db.query(
      "UPDATE public.pks_sites SET verification_status='verified',verification_project_id=$1::uuid,verification_evidence_document_id=$2::uuid,verification_source_reference=$3,verification_source_snapshot=$4::jsonb,updated_at=now() WHERE id=$5::uuid AND verification_status<>'verified' RETURNING id,name,verification_status,verified_by,verified_at,verification_evidence_document_id,verification_evidence_sha256",
      [projectId,evidenceDocumentId,sourceReference,JSON.stringify({document_id:evidenceDocumentId,sha256:doc.rows[0].sha256_checksum,filename:doc.rows[0].original_filename,document_type:doc.rows[0].document_type_code}),facilityId],
    );
    if (!updated.rows.length) return res.status(409).json({ error: "Facility not found or is already verified. Material identity changes require a new review." });
    return res.json({ facility: updated.rows[0] });
  } catch (error: any) {
    if (error?.code === "42501") return res.status(403).json({ error: "Platform Admin verification is required." });
    if (error?.code === "23514" || error?.code === "23503") return res.status(422).json({ error: "Facility verification evidence failed database validation." });
    return res.status(500).json(internalServerErrorPayload());
  }
});


app.patch("/api/v1/projects/:projectId/master-data/products/:productId/classification", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { projectId, productId } = req.params;
  const evidenceDocumentId = typeof req.body?.evidenceDocumentId === "string" ? req.body.evidenceDocumentId : "";
  const sourceReference = typeof req.body?.sourceReference === "string" ? req.body.sourceReference.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(evidenceDocumentId) || sourceReference.length < 2 || sourceReference.length > 500)
    return res.status(400).json({ error: "Approved evidence document and source reference are required." });
  try {
    const doc = await req.db.query(
      "SELECT id,sha256_checksum,original_filename,document_type_code FROM public.project_export_documents WHERE id=$1::uuid AND project_id=$2::uuid AND status='approved' AND upload_verified_at IS NOT NULL AND sha256_checksum IS NOT NULL AND object_key IS NOT NULL AND storage_bucket='pke-private-documents' AND legal_hold=false AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE)",
      [evidenceDocumentId,projectId],
    );
    if (!doc.rows.length) return res.status(422).json({ error: "Evidence document must be approved, checksum-verified and belong to this Project." });
    const updated = await req.db.query(
      "UPDATE public.product_catalog SET classification_status='verified',classification_project_id=$1::uuid,classification_evidence_document_id=$2::uuid,classification_source_reference=$3,classification_source_snapshot=$4::jsonb,updated_at=now() WHERE id=$5::uuid AND classification_status<>'verified' RETURNING id,product_code,product_name,classification_status,classification_verified_by,classification_verified_at,classification_evidence_document_id,classification_evidence_sha256",
      [projectId,evidenceDocumentId,sourceReference,JSON.stringify({document_id:evidenceDocumentId,sha256:doc.rows[0].sha256_checksum,filename:doc.rows[0].original_filename,document_type:doc.rows[0].document_type_code}),productId],
    );
    if (!updated.rows.length) return res.status(409).json({ error: "Product not found or already verified. Reclassification requires a controlled reset and review." });
    return res.json({ product: updated.rows[0] });
  } catch (error: any) {
    if (error?.code === "42501") return res.status(403).json({ error: "Platform Admin verification is required." });
    if (error?.code === "23514" || error?.code === "23503") return res.status(422).json({ error: "Product classification evidence failed database validation." });
    return res.status(500).json(internalServerErrorPayload());
  }
});


/** P15 quality provenance API: sample creation, evidence-linked results and reviewer decisions. */
app.get("/api/v1/projects/:projectId/quality-samples", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  try {
    const access = await req.db.query(
      "SELECT public.pke_is_platform_admin() AS is_admin, public.pke_has_project_permission($1::uuid,'quality.sample.view') AS sample_view, public.pke_has_project_permission($1::uuid,'quality.sample.create') AS sample_create, public.pke_has_project_permission($1::uuid,'quality.sample.view') AS sample_view, public.pke_has_project_permission($1::uuid,'quality.result.view') AS result_view, public.pke_has_project_permission($1::uuid,'quality.result.create') AS result_create, public.pke_has_project_permission($1::uuid,'quality.result.review') AS result_review",
      [projectId],
    );
    const a = access.rows[0] ?? {};
    const isAdmin = req.user?.isAdmin === true || a.is_admin === true;
    const canView = isAdmin || a.sample_view === true || a.sample_create === true || a.result_view === true || a.result_create === true || a.result_review === true;
    if (!canView) return res.json({ canView: false, canCreate: false, canCreateResults: false, canReview: false, samples: [], results: [], attributes: [], evidenceDocuments: [] });
    const [samples, results, attributes, evidenceDocuments] = await Promise.all([
      req.db.query(
        `SELECT id,project_id,lot_id,sample_number,sample_type,sampling_method,sampled_at,sampled_by,
                sample_location,seal_number,sample_condition,laboratory_name,status,lab_report_document_id,
                lab_report_sha256,laboratory_accreditation_reference,chain_of_custody,source_type,source_reference,source_snapshot,
                reviewed_by,reviewed_at,review_note,created_at,updated_at
           FROM public.product_quality_samples
          WHERE project_id=$1::uuid ORDER BY sampled_at DESC,sample_number`,
        [projectId],
      ),
      req.db.query(
        `SELECT r.id,r.sample_id,r.attribute_id,a.attribute_code,a.name AS attribute_name,a.data_type,
                r.result_numeric,r.result_text,r.result_boolean,r.unit_code,r.measurement_basis,r.method_code,
                r.detection_limit,r.uncertainty,r.review_status,r.reviewed_by,r.reviewed_at,r.review_note,
                r.evidence_document_id,r.evidence_sha256,r.source_type,r.source_reference,r.source_snapshot
           FROM public.product_quality_results r
           JOIN public.product_quality_samples s ON s.id=r.sample_id
           LEFT JOIN public.product_attributes a ON a.id=r.attribute_id
          WHERE s.project_id=$1::uuid ORDER BY r.created_at,s.sample_number`,
        [projectId],
      ),
      req.db.query(
        "SELECT id,attribute_code,name,data_type,unit_code,dimension,comparison_basis FROM public.product_attributes WHERE is_active=true ORDER BY attribute_code",
      ),
      req.db.query(
        `SELECT id,original_filename,document_type_code,sha256_checksum,uploaded_at
           FROM public.project_export_documents
          WHERE project_id=$1::uuid AND status='approved' AND upload_verified_at IS NOT NULL
            AND object_key IS NOT NULL AND sha256_checksum IS NOT NULL
            AND storage_bucket='pke-private-documents' AND legal_hold=false
            AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE)
          ORDER BY uploaded_at DESC`,
        [projectId],
      ),
    ]);
    return res.json({
      canView: true, canCreate: isAdmin || a.sample_create === true,
      canCreateResults: isAdmin || a.result_create === true,
      canReview: isAdmin || a.result_review === true,
      samples: samples.rows, results: results.rows, attributes: attributes.rows,
      evidenceDocuments: evidenceDocuments.rows,
    });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/projects/:projectId/quality-samples", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  if (!(await requireProjectPermission(req, res, projectId, "quality.sample.create"))) return;
  const b = req.body ?? {};
  const sampleNumber = typeof b.sampleNumber === "string" ? b.sampleNumber.trim() : "";
  const sampleType = b.sampleType;
  const samplingMethod = typeof b.samplingMethod === "string" ? b.samplingMethod.trim() : "";
  const sampledAt = typeof b.sampledAt === "string" ? b.sampledAt : "";
  const status = ["pending","submitted","tested"].includes(b.status) ? b.status : "pending";
  const lotId = typeof b.lotId === "string" && b.lotId ? b.lotId : null;
  const labReportDocumentId = typeof b.labReportDocumentId === "string" && b.labReportDocumentId ? b.labReportDocumentId : null;
  const sourceType = ["manual","public_reference","official_document","buyer_confirmed"].includes(b.sourceType) ? b.sourceType : "manual";
  const sourceReference = typeof b.sourceReference === "string" ? b.sourceReference.trim() : null;
  const laboratoryName = typeof b.laboratoryName === "string" ? b.laboratoryName.trim() : null;
  const laboratoryAccreditationReference = typeof b.laboratoryAccreditationReference === "string" ? b.laboratoryAccreditationReference.trim() : null;
  const chainOfCustody = b.chainOfCustody && typeof b.chainOfCustody === "object" && !Array.isArray(b.chainOfCustody) ? b.chainOfCustody : {};
  const sourceSnapshot = b.sourceSnapshot && typeof b.sourceSnapshot === "object" && !Array.isArray(b.sourceSnapshot) ? b.sourceSnapshot : {source_type:sourceType,source_reference:sourceReference,sample_number:sampleNumber};
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (sampleNumber.length < 2 || sampleNumber.length > 100 ||
      !["composite","retained","pre_shipment","discharge","claim","other"].includes(sampleType) ||
      samplingMethod.length < 2 || samplingMethod.length > 500 || !sampledAt || Number.isNaN(Date.parse(sampledAt)) ||
      (lotId !== null && !uuidPattern.test(lotId)) ||
      (labReportDocumentId !== null && !uuidPattern.test(labReportDocumentId)) ||
      (sourceReference !== null && sourceReference.length > 500) ||
      (laboratoryAccreditationReference !== null && laboratoryAccreditationReference.length > 500) ||
      (status === "tested" && (!labReportDocumentId || !laboratoryName))) {
    return res.status(400).json({ error: "Sample type, number, method, time and evidence fields must be valid. Tested samples require an approved lab report and laboratory." });
  }
  try {
    const { rows } = await req.db.query(
      "INSERT INTO public.product_quality_samples(project_id,lot_id,sample_number,sample_type,sampling_method,sampled_at,sampled_by,sample_location,seal_number,sample_condition,laboratory_name,status,lab_report_document_id,source_type,source_reference,source_snapshot,laboratory_accreditation_reference,chain_of_custody) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6::timestamptz,$7::uuid,$8,$9,$10,$11,$12,$13::uuid,$14,$15,$16::jsonb,$17,$18::jsonb) RETURNING *",
      [projectId,lotId,sampleNumber,sampleType,samplingMethod,sampledAt,req.user?.id ?? null,
       b.sampleLocation ?? null,b.sealNumber ?? null,b.sampleCondition ?? null,laboratoryName,status,
       labReportDocumentId,sourceType,sourceReference,JSON.stringify(sourceSnapshot),laboratoryAccreditationReference,JSON.stringify(chainOfCustody)],
    );
    return res.status(201).json({ sample: rows[0] });
  } catch (error: any) {
    if (error?.code === "42501") return res.status(403).json({ error: "Quality sample permission denied." });
    if (error?.code === "23514" || error?.code === "23503" || error?.code === "22P02") return res.status(422).json({ error: "Sample evidence, Project, lot or document failed validation." });
    if (error?.code === "23505") return res.status(409).json({ error: "Sample number already exists." });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/projects/:projectId/quality-samples/:sampleId/results", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, sampleId } = req.params;
  if (!(await requireProjectPermission(req, res, projectId, "quality.result.create"))) return;
  const b = req.body ?? {};
  const attributeId = typeof b.attributeId === "string" ? b.attributeId : "";
  const numeric = typeof b.resultNumeric === "number" && Number.isFinite(b.resultNumeric) ? b.resultNumeric : null;
  const textResult = typeof b.resultText === "string" ? b.resultText : null;
  const booleanResult = typeof b.resultBoolean === "boolean" ? b.resultBoolean : null;
  const basis = typeof b.measurementBasis === "string" ? b.measurementBasis.trim() : "";
  const method = typeof b.methodCode === "string" ? b.methodCode.trim() : "";
  const unit = typeof b.unitCode === "string" ? b.unitCode.trim() : null;
  const detectionLimit = typeof b.detectionLimit === "number" && Number.isFinite(b.detectionLimit) ? b.detectionLimit : null;
  const uncertainty = typeof b.uncertainty === "number" && Number.isFinite(b.uncertainty) ? b.uncertainty : null;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(attributeId) || [numeric,textResult,booleanResult].filter(v => v !== null).length !== 1 ||
      basis.length < 2 || basis.length > 100 || method.length < 2 || method.length > 100 ||
      (numeric !== null && (!unit || unit.length > 40)) ||
      (detectionLimit !== null && detectionLimit < 0) || (uncertainty !== null && uncertainty < 0)) {
    return res.status(400).json({ error: "Exactly one result value, attribute, unit (for numeric), measurement basis and method are required." });
  }
  try {
    const { rows } = await req.db.query(
      "INSERT INTO public.product_quality_results(sample_id,attribute_id,result_numeric,result_text,result_boolean,unit_code,measurement_basis,method_code,detection_limit,uncertainty,review_status) SELECT s.id,$3::uuid,$4::numeric,$5,$6::boolean,$7,$8,$9,$10::numeric,$11::numeric,'unreviewed' FROM public.product_quality_samples s WHERE s.id=$1::uuid AND s.project_id=$2::uuid RETURNING *",
      [sampleId,projectId,attributeId,numeric,textResult,booleanResult,unit,basis,method,detectionLimit,uncertainty],
    );
    if (!rows.length) return res.status(404).json({ error: "Quality sample not found in this Project." });
    return res.status(201).json({ result: rows[0] });
  } catch (error: any) {
    if (error?.code === "42501") return res.status(403).json({ error: "Quality result creation permission denied." });
    if (error?.code === "23514" || error?.code === "23503" || error?.code === "22P02") return res.status(422).json({ error: "Quality result requires a tested sample with approved lab evidence and complete measurement provenance." });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/projects/:projectId/quality-samples/:sampleId/mark-tested", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, sampleId } = req.params;
  if (!(await requireProjectPermission(req, res, projectId, "quality.result.create"))) return;
  const evidenceDocumentId = typeof req.body?.evidenceDocumentId === "string" ? req.body.evidenceDocumentId : "";
  const laboratoryName = typeof req.body?.laboratoryName === "string" ? req.body.laboratoryName.trim() : "";
  const accreditationReference = typeof req.body?.laboratoryAccreditationReference === "string" ? req.body.laboratoryAccreditationReference.trim() : null;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(evidenceDocumentId) || laboratoryName.length < 2 || laboratoryName.length > 240 ||
      (accreditationReference !== null && accreditationReference.length > 500)) {
    return res.status(400).json({ error: "Approved lab report and valid laboratory identity are required." });
  }
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM public.pke_attach_quality_lab_report($1::uuid,$2::uuid,$3::uuid,$4,$5)",
      [projectId,sampleId,evidenceDocumentId,laboratoryName,accreditationReference],
    );
    return res.json({ sample: rows[0] });
  } catch (error: any) {
    if (error?.code === "42501") return res.status(403).json({ error: "Quality lab-evidence permission denied." });
    if (error?.code === "P0002") return res.status(404).json({ error: "Quality sample not found in this Project." });
    if (error?.code === "23514" || error?.code === "23503") return res.status(422).json({ error: "Sample cannot be marked tested without approved same-Project evidence." });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/projects/:projectId/quality-samples/:sampleId/review", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, sampleId } = req.params;
  if (!(await requireProjectPermission(req, res, projectId, "quality.result.review"))) return;
  const status = req.body?.status;
  const reviewNote = typeof req.body?.reviewNote === "string" ? req.body.reviewNote.trim() : null;
  if (!["reviewed","rejected"].includes(status) || (reviewNote !== null && reviewNote.length > 2000))
    return res.status(400).json({ error: "Sample review status or note is invalid." });
  try {
    const { rows } = await req.db.query(
      "UPDATE public.product_quality_samples SET status=$1,review_note=$2,updated_at=now() WHERE id=$3::uuid AND project_id=$4::uuid RETURNING id,status,reviewed_by,reviewed_at,review_note,lab_report_document_id,lab_report_sha256",
      [status,reviewNote,sampleId,projectId],
    );
    if (!rows.length) return res.status(404).json({ error: "Quality sample not found in this Project." });
    return res.json({ sample: rows[0] });
  } catch (error: any) {
    if (error?.code === "42501") return res.status(403).json({ error: "Quality sample review permission denied." });
    if (error?.code === "23514") return res.status(422).json({ error: "Sample review requires approved lab evidence and valid reviewer context." });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/projects/:projectId/quality-results/:resultId/review", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, resultId } = req.params;
  if (!(await requireProjectPermission(req, res, projectId, "quality.result.review"))) return;
  const reviewStatus = req.body?.reviewStatus;
  const reviewNote = typeof req.body?.reviewNote === "string" ? req.body.reviewNote.trim() : null;
  if (!["accepted","rejected","retest_required"].includes(reviewStatus) || (reviewNote !== null && reviewNote.length > 2000))
    return res.status(400).json({ error: "Quality result review status or note is invalid." });
  try {
    const { rows } = await req.db.query(
      "UPDATE public.product_quality_results r SET review_status=$1,review_note=$2,updated_at=now() FROM public.product_quality_samples s WHERE r.id=$3::uuid AND r.sample_id=s.id AND s.project_id=$4::uuid RETURNING r.id,r.sample_id,r.review_status,r.reviewed_by,r.reviewed_at,r.review_note,r.evidence_document_id,r.evidence_sha256",
      [reviewStatus,reviewNote,resultId,projectId],
    );
    if (!rows.length) return res.status(404).json({ error: "Quality result not found in this Project." });
    return res.json({ result: rows[0] });
  } catch (error: any) {
    if (error?.code === "42501") return res.status(403).json({ error: "Quality result review permission denied." });
    if (error?.code === "23514") return res.status(422).json({ error: "Quality result lacks complete sample-linked evidence or measurement provenance." });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/projects/:projectId/pks-candidates", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  if (req.user?.isAdmin) {
    const { rows } = await req.db.query("SELECT id FROM public.projects WHERE id=$1::uuid AND is_active=true", [projectId]);
    if (!rows.length) return res.status(404).json({ error: "Project not found." });
  } else if (!(await requireProjectPermission(req, res, projectId, "pks.site.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT id,project_id,candidate_type,candidate_name,candidate_category,location_text,
              source_type,source_name,source_url,source_reference,source_snapshot,
              confidence_score,verification_status,notes,is_seed_data,seed_batch_id,
              created_at,updated_at,reviewed_at
         FROM public.p2a_master_data_candidates
        WHERE project_id=$1::uuid
        ORDER BY is_seed_data DESC,verification_status,candidate_type,candidate_name`,
      [projectId],
    );
    const { rows: manageRows } = await req.db.query(
      "SELECT public.pke_has_project_permission($1::uuid,'pks.participation.manage') AS allowed",
      [projectId],
    );
    return res.json({
      candidates: rows,
      canManage: req.user?.isAdmin === true || manageRows[0]?.allowed === true,
      canVerify: req.user?.isAdmin === true,
    });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/projects/:projectId/pks-candidates", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  if (req.user?.isAdmin) {
    const { rows } = await req.db.query("SELECT id FROM public.projects WHERE id=$1::uuid AND is_active=true", [projectId]);
    if (!rows.length) return res.status(404).json({ error: "Project not found." });
  } else if (!(await requireProjectPermission(req, res, projectId, "pks.participation.manage"))) return;
  const b = req.body ?? {};
  const candidateType = b.candidateType;
  const candidateName = typeof b.candidateName === "string" ? b.candidateName.trim() : "";
  const sourceName = typeof b.sourceName === "string" ? b.sourceName.trim() : "";
  const sourceReference = typeof b.sourceReference === "string" ? b.sourceReference.trim() : "";
  const sourceUrl = typeof b.sourceUrl === "string" && b.sourceUrl.trim() ? b.sourceUrl.trim() : null;
  if (!["organization","facility"].includes(candidateType) || candidateName.length < 2 || candidateName.length > 240 ||
      !sourceName || sourceName.length > 180 || !sourceReference || sourceReference.length > 240) {
    return res.status(400).json({ error: "Candidate type, name, source name and source reference are required and must be valid." });
  }
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) return res.status(400).json({ error: "Source URL must use HTTP or HTTPS." });
  try {
    const { rows } = await req.db.query(
      `INSERT INTO public.p2a_master_data_candidates(
         project_id,candidate_type,candidate_name,candidate_category,location_text,source_type,
         source_name,source_url,source_reference,source_snapshot,confidence_score,
         verification_status,notes,is_seed_data,seed_batch_id,created_by,updated_by
       ) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'unverified',$12,false,NULL,$13::uuid,$13::uuid)
       RETURNING *`,
      [projectId,candidateType,candidateName,b.candidateCategory ?? null,b.locationText ?? null,
       b.sourceType === "public_candidate" ? "public_candidate" : "manual",sourceName,sourceUrl,sourceReference,
       JSON.stringify(b.sourceSnapshot ?? {}),b.confidenceScore == null ? null : Number(b.confidenceScore),
       b.notes ?? null,req.user?.id ?? null],
    );
    return res.status(201).json({ candidate: rows[0] });
  } catch (error: any) {
    if (error?.code === "23514" || error?.code === "22P02") return res.status(400).json({ error: "Candidate fields failed validation." });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/projects/:projectId/pks-candidates/:candidateId", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId,candidateId } = req.params;
  if (req.user?.isAdmin) {
    const { rows } = await req.db.query("SELECT id FROM public.projects WHERE id=$1::uuid AND is_active=true", [projectId]);
    if (!rows.length) return res.status(404).json({ error: "Project not found." });
  } else if (!(await requireProjectPermission(req, res, projectId, "pks.participation.manage"))) return;
  const b=req.body ?? {};
  const updates:string[]=[]; const values:any[]=[]; let idx=1;
  const editable:Array<[string,string,(v:any)=>any]>=[
    ["candidateName","candidate_name",v=>typeof v==="string"?v.trim():v],
    ["candidateCategory","candidate_category",v=>v],
    ["locationText","location_text",v=>v],
    ["notes","notes",v=>v],
    ["confidenceScore","confidence_score",v=>v===""||v==null?null:Number(v)],
  ];
  for(const [key,column,convert] of editable) if(Object.prototype.hasOwnProperty.call(b,key)){
    const value=convert(b[key]);
    if(column==="candidate_name" && (typeof value!=="string" || value.length<2 || value.length>240))
      return res.status(400).json({error:"Candidate name must contain 2–240 characters."});
    if(column==="confidence_score" && value!==null && (!Number.isFinite(value)||value<0||value>1))
      return res.status(400).json({error:"Confidence score must be between 0 and 1."});
    updates.push(`${column}=${idx++}`); values.push(value);
  }
  if(b.verificationStatus!==undefined){
    if(req.user?.isAdmin!==true) return res.status(403).json({error:"Only Platform Admin may change candidate verification status."});
    if(!["unverified","submitted","under_review","verified","rejected","expired"].includes(b.verificationStatus))
      return res.status(400).json({error:"Invalid verification status."});
    updates.push(`verification_status=${idx++}`); values.push(b.verificationStatus);
    updates.push("reviewed_by=$"+idx++); values.push(req.user?.id ?? null);
    updates.push("reviewed_at=now()");
  }
  if(!updates.length) return res.status(400).json({error:"No editable candidate fields supplied."});
  updates.push("updated_by=$"+idx+++"::uuid"); values.push(req.user?.id ?? null);
  updates.push("updated_at=now()");
  values.push(candidateId,projectId);
  try{
    const {rows}=await req.db.query(
      `UPDATE public.p2a_master_data_candidates SET ${updates.join(",")}
        WHERE id=${idx++}::uuid AND project_id=${idx}::uuid RETURNING *`,values);
    if(!rows.length) return res.status(404).json({error:"Candidate not found in this Project."});
    return res.json({candidate:rows[0]});
  }catch(error:any){
    if(error?.code==="42501") return res.status(403).json({error:"Candidate provenance and verification decisions are protected."});
    if(error?.code==="23514" || error?.code==="22P02") return res.status(400).json({error:"Candidate fields failed validation."});
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/projects/:projectId/pks-sites", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  if (req.user?.isAdmin) {
    const { rows: projects } = await req.db.query("SELECT id FROM public.projects WHERE id=$1::uuid AND is_active=true", [projectId]);
    if (!projects.length) return res.status(404).json({ error: "Project not found." });
  } else if (!(await requireProjectPermission(req, res, projectId, "pks.site.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT pp.id,pp.project_id,pp.pks_site_id,pp.vendor_id,
              pp.project_facility_label,pp.project_location_notes,
              pp.operational_contact_name,pp.operational_contact_email,pp.operational_contact_phone,
              pp.contracted_capacity_mt_month,pp.allocated_capacity_mt_month,pp.delivery_window,
              pp.project_terms,pp.notes,pp.status,pp.effective_from,pp.effective_to,
              pp.source_type,pp.source_reference,pp.is_seed_data,pp.seed_batch_id,
              pp.created_at,pp.updated_at,
              s.name AS facility_name,s.code AS facility_code,s.facility_type,
              s.city,s.province,s.verification_status AS facility_verification_status,
              v.name AS supplier_name,v.code AS supplier_code
         FROM public.project_pks_site_participation pp
         JOIN public.pks_sites s ON s.id=pp.pks_site_id
         LEFT JOIN public.vendors v ON v.id=pp.vendor_id
        WHERE pp.project_id=$1::uuid
        ORDER BY pp.updated_at DESC, s.name`,
      [projectId],
    );
    const { rows: manageRows } = await req.db.query(
      "SELECT public.pke_has_project_permission($1::uuid,'pks.participation.manage') AS allowed",
      [projectId],
    );
    return res.json({ participations: rows, canManage: req.user?.isAdmin === true || manageRows[0]?.allowed === true });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/projects/:projectId/pks-sites", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  if (req.user?.isAdmin) {
    const { rows: projects } = await req.db.query("SELECT id FROM public.projects WHERE id=$1::uuid AND is_active=true", [projectId]);
    if (!projects.length) return res.status(404).json({ error: "Project not found." });
  } else if (!(await requireProjectPermission(req, res, projectId, "pks.participation.manage"))) return;
  const b = req.body ?? {};
  const pksSiteId = typeof b.pksSiteId === "string" ? b.pksSiteId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pksSiteId)) {
    return res.status(400).json({ error: "A valid existing pksSiteId is required." });
  }
  const contracted = b.contractedCapacityMtMonth == null || b.contractedCapacityMtMonth === "" ? null : Number(b.contractedCapacityMtMonth);
  const allocated = b.allocatedCapacityMtMonth == null || b.allocatedCapacityMtMonth === "" ? null : Number(b.allocatedCapacityMtMonth);
  if ((contracted !== null && (!Number.isFinite(contracted) || contracted < 0)) ||
      (allocated !== null && (!Number.isFinite(allocated) || allocated < 0)) ||
      (contracted !== null && allocated !== null && allocated > contracted)) {
    return res.status(400).json({ error: "Capacity values must be non-negative and allocated capacity cannot exceed contracted capacity." });
  }
  const vendorId = typeof b.vendorId === "string" && b.vendorId ? b.vendorId : null;
  try {
    const { rows: siteRows } = await req.db.query("SELECT id FROM public.pks_sites WHERE id=$1::uuid AND is_active=true", [pksSiteId]);
    if (!siteRows.length) return res.status(404).json({ error: "Active facility not found." });
    if (vendorId) {
      const { rows: vendorRows } = await req.db.query(
        `SELECT v.id FROM public.vendors v
          JOIN public.project_supplier_participation psp ON psp.vendor_id=v.id
         WHERE v.id=$1::uuid AND psp.project_id=$2::uuid AND psp.is_active=true AND v.is_active=true`,
        [vendorId, projectId],
      );
      if (!vendorRows.length) return res.status(400).json({ error: "Supplier is not active in this Project." });
    }
    const { rows } = await req.db.query(
      `INSERT INTO public.project_pks_site_participation(
         project_id,pks_site_id,vendor_id,operational_contact_name,operational_contact_email,operational_contact_phone,
         contracted_capacity_mt_month,allocated_capacity_mt_month,delivery_window,project_terms,notes,status,
         effective_from,effective_to,source_type,source_reference,is_seed_data,seed_batch_id,created_by,updated_by
       ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13::date,$14::date,'manual',NULL,false,NULL,$15::uuid,$15::uuid)
       RETURNING *`,
      [projectId,pksSiteId,vendorId,b.operationalContactName ?? null,b.operationalContactEmail ?? null,
       b.operationalContactPhone ?? null,contracted,allocated,JSON.stringify(b.deliveryWindow ?? {}),
       b.projectTerms ?? null,b.notes ?? null,b.status ?? "proposed",b.effectiveFrom ?? null,b.effectiveTo ?? null,req.user?.id ?? null],
    );
    return res.status(201).json({ participation: rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "This facility is already linked to the Project." });
    if (error?.code === "23503") return res.status(400).json({ error: "Invalid Project, facility, supplier or actor reference." });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/projects/:projectId/pks-sites/:participationId", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, participationId } = req.params;
  if (req.user?.isAdmin) {
    const { rows: projects } = await req.db.query("SELECT id FROM public.projects WHERE id=$1::uuid AND is_active=true", [projectId]);
    if (!projects.length) return res.status(404).json({ error: "Project not found." });
  } else if (!(await requireProjectPermission(req, res, projectId, "pks.participation.manage"))) return;
  const b = req.body ?? {};
  const fields: Array<[string,string,(v:any)=>any]> = [
    ["projectFacilityLabel","project_facility_label",v=>v],
    ["projectLocationNotes","project_location_notes",v=>v],
    ["operationalContactName","operational_contact_name",v=>v],
    ["operationalContactEmail","operational_contact_email",v=>v],
    ["operationalContactPhone","operational_contact_phone",v=>v],
    ["contractedCapacityMtMonth","contracted_capacity_mt_month",v=>v===""||v==null?null:Number(v)],
    ["allocatedCapacityMtMonth","allocated_capacity_mt_month",v=>v===""||v==null?null:Number(v)],
    ["deliveryWindow","delivery_window",v=>JSON.stringify(v??{})],
    ["projectTerms","project_terms",v=>v],
    ["notes","notes",v=>v],
    ["status","status",v=>v],
    ["effectiveFrom","effective_from",v=>v||null],
    ["effectiveTo","effective_to",v=>v||null],
  ];
  const updates:string[]=[]; const values:any[]=[]; let idx=1;
  for(const [key,column,convert] of fields) if(Object.prototype.hasOwnProperty.call(b,key)){
    const value=convert(b[key]);
    if(column==="project_facility_label" && value!=null && (typeof value!=="string" || value.length>200))
      return res.status(400).json({error:"Project facility label must be at most 200 characters."});
    if(column==="project_location_notes" && value!=null && (typeof value!=="string" || value.length>500))
      return res.status(400).json({error:"Project location notes must be at most 500 characters."});
    if(["contracted_capacity_mt_month","allocated_capacity_mt_month"].includes(column) && value!==null && (!Number.isFinite(value)||value<0))
      return res.status(400).json({error:"Capacity values must be non-negative."});
    updates.push(`${column}=${column==="delivery_window"?"$"+idx+++"::jsonb":"$"+idx++}`);
    values.push(value);
  }
  if(!updates.length) return res.status(400).json({error:"No editable Project overlay fields supplied."});
  if(b.status!==undefined && !["proposed","active","suspended","closed"].includes(b.status))
    return res.status(400).json({error:"Invalid Project participation status."});
  updates.push("updated_by=$"+idx+++"::uuid"); values.push(req.user?.id ?? null);
  updates.push("updated_at=now()");
  values.push(participationId,projectId);
  try {
    const { rows } = await req.db.query(
      `UPDATE public.project_pks_site_participation SET ${updates.join(",")}
        WHERE id=${idx++}::uuid AND project_id=${idx}::uuid
        RETURNING *`,
      values,
    );
    if(!rows.length) return res.status(404).json({error:"Project PKS participation not found."});
    const row=rows[0];
    if(row.contracted_capacity_mt_month!=null && row.allocated_capacity_mt_month!=null &&
       Number(row.allocated_capacity_mt_month)>Number(row.contracted_capacity_mt_month))
      return res.status(400).json({error:"Allocated capacity cannot exceed contracted capacity."});
    return res.json({participation:row});
  } catch (error:any) {
    if(error?.code==="23503") return res.status(400).json({error:"Invalid actor or Project reference."});
    if(error?.code==="23514") return res.status(400).json({error:"Capacity or effective-date constraint failed."});
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/buyers", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { name, code, countryCode } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  try {
    const { rows } = await req.db.query(
      "INSERT INTO buyers (name, code, country_code, is_active, created_at, updated_at) VALUES ($1, $2, $3, true, now(), now()) RETURNING *",
      [name, code || null, countryCode || null],
    );
    res.status(201).json({ buyer: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/buyers/:id", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { name, code, countryCode, isActive } = req.body;
  try {
    const { rows } = await req.db.query(
      `UPDATE buyers SET
         name = COALESCE($2, name),
         code = COALESCE($3, code),
         country_code = COALESCE($4, country_code),
         is_active = COALESCE($5, is_active),
         updated_at = now()
       WHERE id = $1::uuid RETURNING *`,
      [req.params.id, name ?? null, code ?? null, countryCode ?? null, typeof isActive === "boolean" ? isActive : null],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Buyer not found" });
    res.json({ buyer: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// Buyer projects - projects accessible to the authenticated buyer scope
app.get("/api/v1/buyer-projects", requireAuth, async (req: express.Request, res: express.Response) => {
  const buyerId = req.query.buyerId as string | undefined;
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Authenticated principal required" });
  try {
    const params: any[] = [userId];
    let sql = `
      SELECT DISTINCT p.id, p.name, p.status, p.settlement_unit, p.target_quantity, p.created_at
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1::uuid AND pm.is_active = true
      WHERE p.is_active = true
    `;
    if (buyerId) {
      sql += ` AND p.id IN (
        SELECT cp.project_id FROM contract_programs cp
        JOIN contracts c ON c.id = cp.contract_id
        WHERE c.buyer_id = $2::uuid AND c.is_active = true
      )`;
      params.push(buyerId);
    }
    sql += " ORDER BY p.created_at DESC";
    const { rows } = await req.db.query(sql, params);
    res.json({ buyerProjects: rows });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// Supplier projects - projects accessible to the authenticated supplier scope
app.get("/api/v1/supplier-projects", requireAuth, async (req: express.Request, res: express.Response) => {
  const supplierId = req.query.supplierId as string | undefined;
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Authenticated principal required" });
  try {
    const params: any[] = [userId];
    let sql = `
      SELECT DISTINCT p.id, p.name, p.status, p.settlement_unit, p.target_quantity, p.created_at
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1::uuid AND pm.is_active = true
      WHERE p.is_active = true
    `;
    if (supplierId) {
      sql += ` AND p.id IN (
        SELECT DISTINCT lot.project_id FROM inventory_lots lot
        WHERE lot.pks_site_id = $2::uuid
      )`;
      params.push(supplierId);
    }
    sql += " ORDER BY p.created_at DESC";
    const { rows } = await req.db.query(sql, params);
    res.json({ supplierProjects: rows });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// Contract management
app.get("/api/v1/contracts", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const buyerId = req.query.buyerId as string | undefined;
    if (!projectId) return res.status(400).json({ error: "projectId query parameter required" });
    if (!(await requireProjectPermission(req, res, projectId, "contract.view"))) return;
    const params: any[] = [projectId];
    let sql = "SELECT * FROM contracts WHERE project_id = $1::uuid AND is_active = true";
    if (buyerId) { sql += " AND buyer_id = $2::uuid"; params.push(buyerId); }
    sql += " ORDER BY created_at DESC";
    const { rows } = await req.db.query(sql, params);
    res.json({ contracts: rows });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/contracts/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { rows: current } = await req.db.query("SELECT project_id FROM contracts WHERE id = $1::uuid", [id]);
  if (!current.length || !current[0].project_id) return res.status(404).json({ error: "Contract not found in an accessible Project." });
  if (!(await requireProjectPermission(req, res, current[0].project_id, "manage_contract_programs"))) return;
  const { code, name, startDate, endDate, isActive } = req.body ?? {};
  try {
    const { rows } = await req.db.query(
      `UPDATE contracts SET code = COALESCE($2, code), name = COALESCE($3, name),
         start_date = COALESCE($4::timestamptz, start_date), end_date = COALESCE($5::timestamptz, end_date),
         is_active = COALESCE($6::boolean, is_active), updated_at = now()
       WHERE id = $1::uuid RETURNING *`,
      [id, code ?? null, name ?? null, startDate ?? null, endDate ?? null, typeof isActive === "boolean" ? isActive : null],
    );
    if (!rows.length) return res.status(404).json({ error: "Contract not found." });
    return res.json({ contract: rows[0] });
  } catch {
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/contracts", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, buyerId, code, name, startDate, endDate } = req.body;
  if (!projectId || !buyerId || !code || !name || !startDate) return res.status(400).json({ error: "projectId, buyerId, code, name, startDate required" });
  if (!(await requireProjectPermission(req, res, projectId, "manage_contract_programs"))) return;
  try {
    const { rows } = await req.db.query(
      "INSERT INTO contracts (project_id, buyer_id, code, name, start_date, end_date, is_active, created_at, updated_at) VALUES ($1::uuid, $2::uuid, $3, $4, $5::timestamptz, $6::timestamptz, true, now(), now()) RETURNING *",
      [projectId, buyerId, code, name, startDate, endDate || null],
    );
    res.status(201).json({ contract: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// Cycle Policy management
app.get("/api/v1/cycle-policies", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    if (!projectId) return res.status(400).json({ error: "projectId query parameter required" });
    if (!(await requireProjectPermission(req, res, projectId, "contract.view"))) return;
    const { rows } = await req.db.query("SELECT * FROM cycle_policies WHERE project_id = $1::uuid AND is_active = true ORDER BY created_at DESC", [projectId]);
    res.json({ cyclePolicies: rows });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/cycle-policies", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, contractProgramId, cadence, targetQuantity, generationMode } = req.body;

  if (!projectId || !contractProgramId || typeof cadence !== "string" || !cadence.trim() || typeof generationMode !== "string" || !generationMode.trim() || (targetQuantity !== undefined && targetQuantity !== null && !isPositiveQuantity(targetQuantity))) {
    return res.status(400).json({ error: "Required fields: contractProgramId, cadence, generationMode" });
  }

  if (!(await requireProjectPermission(req, res, projectId, "manage_contract_programs"))) return;
  try {
    const { rows: programRows } = await req.db.query("SELECT id FROM contract_programs WHERE id = $1::uuid AND project_id = $2::uuid AND is_active = true LIMIT 1", [contractProgramId, projectId]);
    if (programRows.length === 0) return res.status(404).json({ error: "Active Contract Program not found in this Project." });
    const { rows } = await req.db.query(
      "INSERT INTO cycle_policies (project_id, contract_program_id, cadence, target_quantity, generation_mode, is_active, created_at, updated_at) VALUES ($1::uuid, $2::uuid, $3, $4, $5, true, now(), now()) RETURNING *",
      [projectId, contractProgramId, cadence, targetQuantity || null, generationMode]
    );
    res.status(201).json({ cyclePolicy: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/cycle-policies/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { rows: current } = await req.db.query("SELECT project_id FROM cycle_policies WHERE id = $1::uuid", [id]);
  if (!current.length || !current[0].project_id) return res.status(404).json({ error: "Cycle Policy not found in an accessible Project." });
  if (!(await requireProjectPermission(req, res, current[0].project_id, "manage_contract_programs"))) return;
  const { cadence, targetQuantity, generationMode, isActive } = req.body ?? {};
  if (targetQuantity !== undefined && targetQuantity !== null && !isPositiveQuantity(targetQuantity)) {
    return res.status(400).json({ error: "targetQuantity must be finite and positive." });
  }
  try {
    const { rows } = await req.db.query(
      `UPDATE cycle_policies SET cadence = COALESCE($2, cadence),
         target_quantity = COALESCE($3::numeric, target_quantity),
         generation_mode = COALESCE($4, generation_mode),
         is_active = COALESCE($5::boolean, is_active), updated_at = now()
       WHERE id = $1::uuid RETURNING *`,
      [id, cadence ?? null, targetQuantity ?? null, generationMode ?? null, typeof isActive === "boolean" ? isActive : null],
    );
    if (!rows.length) return res.status(404).json({ error: "Cycle Policy not found." });
    return res.json({ cyclePolicy: rows[0] });
  } catch {
    return res.status(500).json(internalServerErrorPayload());
  }
});

// Cash on Board: exactly one payment obligation per shipment and Project.
app.post("/api/v1/projects/:projectId/shipments/:shipmentId/cob-cycle", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, shipmentId } = req.params;
  const { payee, amount, currencyId, basis, dueDate, paymentMethodId, sourceAgreement, evidenceRequirement } = req.body ?? {};
  if (typeof payee !== "string" || !payee.trim() || !isPositiveQuantity(amount) || typeof currencyId !== "string" || !currencyId || typeof basis !== "string" || !basis.trim()) {
    return res.status(400).json({ error: "Required fields: payee, positive amount, currencyId, basis" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "finance.create"))) return;
  try {
    const { rows: shipmentRows } = await req.db.query(
      "SELECT id, project_id, quantity, unit_code, shipment_code FROM shipments WHERE id = $1::uuid AND project_id = $2::uuid LIMIT 1",
      [shipmentId, projectId],
    );
    if (!shipmentRows.length) return res.status(404).json({ error: "Shipment not found in this Project." });
    const { rows } = await req.db.query(
      `INSERT INTO payment_obligations
        (project_id, shipment_id, payee, amount, currency_id, basis, payment_method_id,
         payment_trigger_event, due_date, cash_classification, approval_status, source_agreement,
         evidence_requirement, payment_status, source_event_id, source_event_type, created_by,
         amount_paid, payment_instruction_required, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::text, $4::numeric, $5::uuid, $6::text, $7::uuid,
         'cash_on_board', $8::timestamptz, 'cash_operational', 'pending', $9::text,
         $10::text, 'draft', $2::uuid, 'shipment', $11::uuid, 0, true, now(), now())
       RETURNING *`,
      [projectId, shipmentId, payee.trim(), amount, currencyId, basis.trim(), paymentMethodId || null,
       dueDate || null, sourceAgreement || null, evidenceRequirement || "proof_of_full_payment", req.user.id],
    );
    return res.status(201).json({ cobCycle: rows[0], shipment: shipmentRows[0] });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "A Cash on Board cycle already exists for this shipment.", code: "COB_CYCLE_ALREADY_EXISTS" });
    if (error?.code === "23503") return res.status(400).json({ error: "Invalid shipment, currency, or payment method reference." });
    return res.status(500).json(internalServerErrorPayload());
  }
});

// Project management
app.get("/api/v1/projects", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Authenticated principal required" });
    let rows: any[];
    if (req.user?.isAdmin) {
      ({ rows } = await req.db.query("SELECT * FROM projects WHERE is_active = true ORDER BY created_at DESC"));
    } else {
      ({ rows } = await req.db.query(
        `SELECT DISTINCT p.*
           FROM projects p
           JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1::uuid
          WHERE p.is_active = true
            AND pm.is_active = true
            AND pm.deactivated_at IS NULL
            AND (pm.expires_at IS NULL OR pm.expires_at > now())
          ORDER BY p.created_at DESC`,
        [userId],
      ));
    }
    res.json({ projects: rows });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/projects/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  if (!(await requireProjectPermission(req, res, id, "project.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM projects WHERE id = $1::uuid AND is_active = true", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    res.json({ project: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// Project operating profile (module configuration)
app.get("/api/v1/projects/:projectId/operating-profile", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  if (!(await requireProjectPermission(req, res, projectId, "operations.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM project_operating_profiles WHERE project_id = $1::uuid", [projectId]);
    if (rows.length === 0) return res.status(404).json({ error: "Operating profile not found" });
    res.json({ operatingProfile: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.put("/api/v1/projects/:projectId/operating-profile", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  if (!(await requireProjectPermission(req, res, projectId, "project.configuration.manage"))) return;
  const { logisticsMode, usesTrucking, pksOwnsOrControlsPort, financingEnabled, financierReportingRequired, primaryPksSiteId, primaryPortId, operatingNotes, configuration } = req.body ?? {};
  try {
    const { rows } = await req.db.query(
      `INSERT INTO project_operating_profiles (project_id, logistics_mode, uses_trucking, pks_owns_or_controls_port, financing_enabled, financier_reporting_required, primary_pks_site_id, primary_port_id, operating_notes, configuration, updated_by, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8::uuid, $9, $10::jsonb, $11::uuid, now(), now())
       ON CONFLICT (project_id) DO UPDATE SET
          logistics_mode = EXCLUDED.logistics_mode,
          uses_trucking = EXCLUDED.uses_trucking,
          pks_owns_or_controls_port = EXCLUDED.pks_owns_or_controls_port,
          financing_enabled = EXCLUDED.financing_enabled,
          financier_reporting_required = EXCLUDED.financier_reporting_required,
          primary_pks_site_id = EXCLUDED.primary_pks_site_id,
          primary_port_id = EXCLUDED.primary_port_id,
          operating_notes = EXCLUDED.operating_notes,
          configuration = EXCLUDED.configuration,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
        RETURNING *`,
      [projectId, logisticsMode || "direct", usesTrucking === true, pksOwnsOrControlsPort === true, financingEnabled === true, financierReportingRequired === true, primaryPksSiteId || null, primaryPortId || null, operatingNotes || null, JSON.stringify(configuration || {}), req.user?.id || null],
    );
    res.json({ operatingProfile: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/projects/:projectId/operating-profile", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  if (!(await requireProjectPermission(req, res, projectId, "project.configuration.manage"))) return;
  const { logisticsMode, usesTrucking, pksOwnsOrControlsPort, financingEnabled, financierReportingRequired, primaryPksSiteId, primaryPortId, operatingNotes, configuration } = req.body ?? {};
  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;
  if (logisticsMode !== undefined) { updates.push(`logistics_mode = $${idx++}`); values.push(logisticsMode); }
  if (usesTrucking !== undefined) { updates.push(`uses_trucking = $${idx++}`); values.push(usesTrucking); }
  if (pksOwnsOrControlsPort !== undefined) { updates.push(`pks_owns_or_controls_port = $${idx++}`); values.push(pksOwnsOrControlsPort); }
  if (financingEnabled !== undefined) { updates.push(`financing_enabled = $${idx++}`); values.push(financingEnabled); }
  if (financierReportingRequired !== undefined) { updates.push(`financier_reporting_required = $${idx++}`); values.push(financierReportingRequired); }
  if (primaryPksSiteId !== undefined) { updates.push(`primary_pks_site_id = $${idx++}`); values.push(primaryPksSiteId || null); }
  if (primaryPortId !== undefined) { updates.push(`primary_port_id = $${idx++}`); values.push(primaryPortId || null); }
  if (operatingNotes !== undefined) { updates.push(`operating_notes = $${idx++}`); values.push(operatingNotes || null); }
  if (configuration !== undefined) { updates.push(`configuration = $${idx++}`); values.push(JSON.stringify(configuration)); }
  if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });
  updates.push(`updated_by = $${idx++}`); values.push(req.user?.id || null);
  updates.push(`updated_at = now()`);
  values.push(projectId);
  try {
    const { rows } = await req.db.query(
      `UPDATE project_operating_profiles SET ${updates.join(", ")} WHERE project_id = $${idx} RETURNING *`,
      values,
    );
    if (rows.length === 0) return res.status(404).json({ error: "Operating profile not found" });
    res.json({ operatingProfile: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});
// ============================================
// Project-scoped permission helper
// ============================================
async function requireProjectPermission(
  req: express.Request,
  res: express.Response,
  projectId: string | string[],
  permissionCode: string
): Promise<boolean> {
  const pid = Array.isArray(projectId) ? projectId[0] : projectId;
  const { rows } = await req.db.query(
    "SELECT public.pke_has_project_permission($1::uuid, $2::text) AS has_perm",
    [pid, permissionCode]
  );
  if (!rows[0]?.has_perm) {
    res.status(403).json({ error: "Forbidden - project permission required", code: "PROJECT_PERMISSION_REQUIRED" });
    return false;
  }

  // Attribute subsequent DB audit events to the exact active Project role that
  // supplied this permission, never to the user's global account role.
  const principalId = req.user?.id;
  if (!principalId) {
    res.status(401).json({ error: "Authenticated principal required", code: "AUTHENTICATION_REQUIRED" });
    return false;
  }
  const { rows: assignmentRows } = await req.db.query(
    `SELECT a.id AS project_role_assignment_id, pr.id AS project_role_id, pr.role_code
       FROM public.project_role_assignments a
       JOIN public.project_members pm
         ON pm.id = a.project_member_id
        AND pm.project_id = a.project_id
        AND pm.user_id = a.user_id
       JOIN public.project_roles pr
         ON pr.id = a.project_role_id AND pr.project_id = a.project_id
       JOIN public.project_role_permissions prp
         ON prp.project_id = a.project_id AND prp.project_role_id = pr.id
       JOIN public.permissions perm
         ON perm.id = prp.permission_id AND perm.is_active = true
      WHERE a.project_id = $1::uuid
        AND a.user_id = $2::uuid
        AND a.is_active = true
        AND a.revoked_at IS NULL
        AND (a.expires_at IS NULL OR a.expires_at > now())
        AND pm.is_active = true
        AND pm.deactivated_at IS NULL
        AND (pm.expires_at IS NULL OR pm.expires_at > now())
        AND pr.is_active = true
        AND perm.code = $3::text
        AND NOT (
          pr.role_code = 'funder'
          AND (
            $3::text LIKE 'finance.%' OR $3::text LIKE 'accounting.%' OR
            $3::text LIKE 'reports.%' OR $3::text LIKE 'payment.%' OR
            $3::text IN ('report.view','view_financial','view_rab')
          )
        )
      ORDER BY pr.role_code, a.assigned_at DESC
      LIMIT 1`,
    [pid, principalId, permissionCode],
  );

  if (assignmentRows.length === 0) {
    res.status(403).json({ error: "No active Project role assignment grants this permission.", code: "PROJECT_ROLE_ASSIGNMENT_REQUIRED" });
    return false;
  }

  await req.db.query(
    "SELECT set_config('app.current_role', $1::text, true), set_config('app.current_project_role_id', $2::text, true), set_config('app.current_project_id', $3::text, true), set_config('app.current_permission_code', $4::text, true)",
    [assignmentRows[0].role_code, assignmentRows[0].project_role_id, pid, permissionCode],
  );
  return true;
}

async function findExplicitProjectPermission(req: express.Request, projectId: string, permissionCodes: string[]): Promise<any | null> {
  const principalId=req.user?.id; if(!principalId) return null;
  const {rows}=await req.db.query(
    `SELECT a.project_role_id,pr.role_code,perm.code AS permission_code
       FROM public.project_role_assignments a
       JOIN public.project_members pm ON pm.id=a.project_member_id AND pm.project_id=a.project_id AND pm.user_id=a.user_id
       JOIN public.project_roles pr ON pr.id=a.project_role_id AND pr.project_id=a.project_id
       JOIN public.project_role_permissions prp ON prp.project_id=a.project_id AND prp.project_role_id=pr.id
       JOIN public.permissions perm ON perm.id=prp.permission_id AND perm.is_active=true
       JOIN public.users u ON u.id=a.user_id AND u.is_active=true
      WHERE a.project_id=$1::uuid AND a.user_id=$2::uuid AND a.is_active=true AND a.revoked_at IS NULL
        AND (a.expires_at IS NULL OR a.expires_at>now())
        AND pm.is_active=true AND pm.deactivated_at IS NULL AND (pm.expires_at IS NULL OR pm.expires_at>now())
        AND pr.is_active=true AND perm.code=ANY($3::text[])
        AND NOT (
          pr.role_code='funder'
          AND (
            perm.code LIKE 'finance.%' OR perm.code LIKE 'accounting.%' OR
            perm.code LIKE 'reports.%' OR perm.code LIKE 'payment.%' OR
            perm.code IN ('report.view','view_financial','view_rab')
          )
        )
      ORDER BY array_position($3::text[],perm.code),a.assigned_at DESC LIMIT 1`,
    [projectId,principalId,permissionCodes]);
  return rows[0]??null;
}
async function applyExplicitProjectPermissionContext(req: express.Request,projectId: string,permission:any):Promise<void>{
  await req.db.query("SELECT set_config('app.current_role',$1::text,true),set_config('app.current_project_role_id',$2::text,true),set_config('app.current_project_id',$3::text,true),set_config('app.current_permission_code',$4::text,true)",
    [permission.role_code,permission.project_role_id,projectId,permission.permission_code]);
}

async function getProjectOr404(
  req: express.Request,
  res: express.Response,
  projectId: string | string[]
): Promise<any | null> {
  const pid = Array.isArray(projectId) ? projectId[0] : projectId;
  const { rows } = await req.db.query("SELECT * FROM projects WHERE id = $1::uuid", [pid]);
  if (rows.length === 0) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  return rows[0];
}

function defaultPermissionsForRole(roleCode: string): string[] {
  // The source-controlled canonical catalogue is the only permission template.
  // Legacy "admin" is intentionally not aliased to Project Admin.
  return [...(getCanonicalRoleTemplate(roleCode)?.permissionCodes ?? [])];
}

// ============================================
// Contract Program CRUD
// ============================================
app.post("/api/v1/contract-programs", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, name, buyerId, contractId, settlementUnit, targetQuantity, cadence, generationMode, description } = req.body;
  if (!projectId || typeof name !== "string" || !name.trim() || typeof settlementUnit !== "string" || !settlementUnit.trim() || typeof cadence !== "string" || !cadence.trim() || !isPositiveQuantity(targetQuantity)) {
    return res.status(400).json({ error: "Required fields: name, settlementUnit, targetQuantity, cadence" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "manage_contract_programs"))) return;
  if (contractId) {
    const { rows: contractRows } = await req.db.query("SELECT id FROM contracts WHERE id = $1::uuid AND project_id = $2::uuid AND is_active = true", [contractId, projectId]);
    if (!contractRows.length) return res.status(400).json({ error: "Contract must belong to this Project." });
  }
  try {
    const { rows } = await req.db.query(
      `INSERT INTO contract_programs
        (project_id, name, buyer_id, contract_id, settlement_unit, target_quantity, cadence, generation_mode, description, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::text, $3::uuid, $4::uuid, $5::text, $6::numeric, $7::text, $8::text, $9::text, true, now(), now())
       RETURNING *`,
      [projectId, name, buyerId || null, contractId || null, settlementUnit, targetQuantity, cadence, generationMode || "scheduled_draft", description || null]
    );
    const { rows: linkedProject } = await req.db.query(
      "UPDATE projects SET contract_program_id = $1::uuid, updated_at = now() WHERE id = $2::uuid AND contract_program_id IS NULL RETURNING id",
      [rows[0].id, projectId],
    );
    if (!linkedProject.length) return res.status(409).json({ error: "Project already has a Contract Program or is unavailable." });
    res.status(201).json({ contractProgram: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// PM attaches the Project's first Contract Program after Admin creates the Project shell.
app.post("/api/v1/projects/:projectId/contract-programs", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  const { name, buyerId, contractId, settlementUnit, targetQuantity, cadence, generationMode, description } = req.body ?? {};
  if (typeof name !== "string" || !name.trim() || typeof settlementUnit !== "string" || !settlementUnit.trim() ||
      typeof cadence !== "string" || !cadence.trim() || !isPositiveQuantity(targetQuantity)) {
    return res.status(400).json({ error: "Required fields: name, settlementUnit, positive targetQuantity, cadence" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "manage_contract_programs"))) return;
  try {
    const { rows: projectRows } = await req.db.query(
      "SELECT id, contract_program_id FROM projects WHERE id = $1::uuid AND is_active = true FOR UPDATE",
      [projectId],
    );
    if (!projectRows.length) return res.status(404).json({ error: "Project not found." });
    if (projectRows[0].contract_program_id) return res.status(409).json({ error: "This Project already has a Contract Program." });
    if (contractId) {
      const { rows: contractRows } = await req.db.query(
        "SELECT id FROM contracts WHERE id = $1::uuid AND project_id = $2::uuid AND is_active = true",
        [contractId, projectId],
      );
      if (!contractRows.length) return res.status(400).json({ error: "Contract must belong to this Project." });
    }
    const { rows } = await req.db.query(
      `INSERT INTO contract_programs
        (project_id, name, buyer_id, contract_id, settlement_unit, target_quantity, cadence, generation_mode, description, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6::numeric, $7, $8, $9, true, now(), now())
       RETURNING *`,
      [projectId, name.trim(), buyerId || null, contractId || null, settlementUnit.trim(), targetQuantity, cadence.trim(), generationMode || "shipment_triggered", description || null],
    );
    await req.db.query("UPDATE projects SET contract_program_id = $1::uuid, updated_at = now() WHERE id = $2::uuid AND contract_program_id IS NULL", [rows[0].id, projectId]);
    return res.status(201).json({ contractProgram: rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "A Contract Program already exists for this Project." });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/contract-programs/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { name, buyerId, contractId, settlementUnit, targetQuantity, cadence, generationMode, description, isActive } = req.body;
  const { rows: currentProgram } = await req.db.query("SELECT project_id FROM contract_programs WHERE id = $1::uuid", [id]);
  if (!currentProgram.length) return res.status(404).json({ error: "Contract program not found in an accessible Project." });
  if (!(await requireProjectPermission(req, res, currentProgram[0].project_id, "manage_contract_programs"))) return;
  if (targetQuantity !== undefined && !isPositiveQuantity(targetQuantity)) return res.status(400).json({ error: "targetQuantity must be a finite positive number." });
  try {
    const { rows } = await req.db.query(
      `UPDATE contract_programs
        SET name = COALESCE($2::text, name),
            buyer_id = COALESCE($3::uuid, buyer_id),
            contract_id = COALESCE($4::uuid, contract_id),
            settlement_unit = COALESCE($5::text, settlement_unit),
            target_quantity = COALESCE($6::numeric, target_quantity),
            cadence = COALESCE($7::text, cadence),
            generation_mode = COALESCE($8::text, generation_mode),
            description = COALESCE($9::text, description),
            is_active = COALESCE($10::boolean, is_active),
            updated_at = now()
       WHERE id = $1::uuid
       RETURNING *`,
      [id, name || null, buyerId || null, contractId || null, settlementUnit || null, targetQuantity || null, cadence || null, generationMode || null, description || null, isActive !== undefined ? isActive : null]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Contract program not found" });
    res.json({ contractProgram: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// ============================================
// Project create (transaction: project + contract program + roles + module config)
// ============================================
app.post("/api/v1/projects", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const {
    contractProgramId, name, description, status, settlementUnit, targetQuantity,
    exportCountryCode, createContractProgram
  } = req.body ?? {};
  if (typeof name !== "string" || !name.trim() || typeof settlementUnit !== "string" || !settlementUnit.trim() || !isPositiveQuantity(targetQuantity)) {
    return res.status(400).json({ error: "Required fields: name, settlementUnit, targetQuantity" });
  }
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Authenticated user required" });

  // Use request-scoped RLS transaction client (req.db). Savepoint keeps atomicity within middleware-managed tx.
  const dbClient = req.db;
  try {
    await dbClient.query("SAVEPOINT project_create");
    try {
      if (contractProgramId || createContractProgram) {
        throw Object.assign(new Error("Contract Programs are created by the Project Manager after Project setup."), { status: 400 });
      }
      const { rows: projectRows } = await dbClient.query(
        `INSERT INTO projects
          (name, description, status, settlement_unit, target_quantity,
           export_country_code, is_active, created_at, updated_at)
         VALUES ($1::text, $2::text, $3::text, $4::text, $5::numeric, $6::text, true, now(), now())
         RETURNING *`,
        [name, description || null, status || "draft", settlementUnit, targetQuantity, exportCountryCode || null]
      );
      const project = projectRows[0];
      const projectId = project.id;
      const defaultConfiguration = {
        schema_version: 1,
        modules: {
          pks: { enabled: false }, supplier: { enabled: false }, product_specs: { enabled: true },
          procurement: { enabled: false }, inventory: { enabled: false }, trucking: { enabled: false },
          warehouse: { enabled: false }, port_operations: { enabled: false }, loading: { enabled: false },
          vessel: { enabled: false }, voyage: { enabled: false }, shipment: { enabled: false },
          tracking: { enabled: false }, documents: { enabled: true }, compliance: { enabled: true },
          finance: { enabled: false }, accounting: { enabled: false }, fx: { enabled: false },
          financing: { enabled: false }, reporting: { enabled: false }, visual_reporting: { enabled: false },
          workflow: { enabled: true }, approvals: { enabled: true }, notifications: { enabled: true }
        }
      };
      await dbClient.query(
        `INSERT INTO project_operating_profiles
          (project_id, logistics_mode, uses_trucking, pks_owns_or_controls_port, financing_enabled,
           financier_reporting_required, configuration, updated_by, created_at, updated_at)
         VALUES ($1::uuid, 'unspecified', false, false, false, false, $2::jsonb, $3::uuid, now(), now())
         ON CONFLICT (project_id) DO NOTHING`,
        [projectId, JSON.stringify(defaultConfiguration), userId]
      );
      // New Projects start with only the PM appointment slot. Platform Admin
      // appoints the PM explicitly; operational templates are activated later
      // by that PM and activation never creates user membership.
      const pmTemplate = getCanonicalRoleTemplate("pm");
      if (!pmTemplate) throw Object.assign(new Error("Canonical PM template is missing."), { status: 500 });
      const { rows: pmRoleRows } = await dbClient.query(
        `INSERT INTO project_roles (project_id, role_code, name, description, is_active, created_by, created_at, updated_at)
         VALUES ($1::uuid, 'pm', $2::text, $3::text, true, $4::uuid, now(), now())
         RETURNING id`,
        [projectId, pmTemplate.label, pmTemplate.restrictions.join(" "), userId],
      );
      const pmRoleId = pmRoleRows[0].id;
      const { rows: permissionRows } = await dbClient.query(
        "SELECT id, code FROM permissions WHERE code = ANY($1::text[]) AND is_active = true",
        [pmTemplate.permissionCodes],
      );
      const foundCodes = new Set(permissionRows.map((row: any) => row.code));
      const missingCodes = pmTemplate.permissionCodes.filter((code) => !foundCodes.has(code));
      if (missingCodes.length > 0) {
        throw Object.assign(new Error(`Canonical PM permissions are missing: ${missingCodes.join(", ")}`), { status: 409 });
      }
      for (const permission of permissionRows) {
        await dbClient.query(
          `INSERT INTO project_role_permissions (project_id, project_role_id, permission_id, granted_by, granted_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, now())
           ON CONFLICT (project_role_id, permission_id) DO NOTHING`,
          [projectId, pmRoleId, permission.id, userId],
        );
      }
      const createdRoles = [{ projectRoleId: pmRoleId, roleCode: "pm", name: pmTemplate.label, awaitingAppointment: true }];
      await dbClient.query("RELEASE SAVEPOINT project_create");
      res.status(201).json({ project, roles: createdRoles });
      return;
    } catch (error) {
      await dbClient.query("ROLLBACK TO SAVEPOINT project_create").catch(() => {});
      await dbClient.query("RELEASE SAVEPOINT project_create").catch(() => {});
      throw error;
    }
  } catch (error) {
    const rawStatus = (error as any)?.status;
    const status = typeof rawStatus === "number" && Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus < 500 ? rawStatus : 500;
    res.status(status).json(status === 500 ? internalServerErrorPayload() : requestRejectedPayload());
  }
});

// Phase 5: Export Compliance Endpoints
// ============================================

// Regulatory knowledge base - Admin only
app.get("/api/v1/regulatory-knowledge", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      `SELECT id, source_id, title, issuing_authority, jurisdiction, document_type,
              regulation_number, article_annex_section, effective_date, expiry_repeal_date,
              status, official_url, source_file_reference, source_checksum,
              verification_status, reviewer_id, created_at, updated_at
       FROM regulatory_sources
       WHERE verification_status IN ('verified', 'approved')
       ORDER BY created_at DESC LIMIT 100`,
    );
    res.json({ regulatoryKnowledge: rows.map((r: any) => ({
      id: r.id,
      sourceId: r.source_id,
      title: r.title,
      issuingAuthority: r.issuing_authority,
      jurisdiction: r.jurisdiction,
      documentType: r.document_type,
      regulationNumber: r.regulation_number,
      articleAnnexSection: r.article_annex_section,
      effectiveDate: r.effective_date,
      expiryRepealDate: r.expiry_repeal_date,
      status: r.status,
      officialUrl: r.official_url,
      sourceFileReference: r.source_file_reference,
      sourceChecksum: r.source_checksum,
      verificationStatus: r.verification_status,
      reviewerId: r.reviewer_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});


// Compliance engine - Admin only
app.post("/api/v1/compliance-check", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { entityType, entityId, targetCountry, checkType } = req.body;

  if (!entityType || !entityId || !targetCountry || !checkType) {
    return res.status(400).json({ error: "Required fields: entityType, entityId, targetCountry, checkType" });
  }

  try {
    // In production, this would run compliance checks against regulatory knowledge base
    const complianceResult = {
      entityType,
      entityId,
      targetCountry,
      checkType,
       compliant: null, // Requires human review - no verified rules configured
       issues: [],
       status: "requires_human_review",
       message: "Compliance result requires human review. No verified regulatory rules have been configured yet.",
    };
    res.json({ complianceResult });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// Country pack requirements - Admin only
app.get("/api/v1/country-packs", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      `SELECT cdr.id, c.country_code, c.country_name, cdr.document_type_id, edt.document_code, edt.document_name,
              edt.document_category, edt.description AS document_description, cdr.importing_authority,
              cdr.mandatory, cdr.status, cdr.effective_from, cdr.effective_to, cdr.official_source_url,
              cdr.notes, cdr.last_verified_at, cdr.verified_by, cdr.created_at, cdr.updated_at
       FROM country_export_document_requirements cdr
       JOIN export_document_types edt ON edt.id = cdr.document_type_id
       JOIN countries c ON c.country_code = cdr.country_code
       WHERE cdr.status IN ('verified', 'active') AND edt.is_active = true
       ORDER BY c.country_code, edt.document_code LIMIT 200`,
    );
    const byCountry = new Map<string, any>();
    for (const r of rows) {
      if (!byCountry.has(r.country_code)) {
        byCountry.set(r.country_code, {
          country: r.country_name,
          countryCode: r.country_code,
          packName: `${r.country_name} PKE Standard`,
          taxRate: 0,
          requirements: [],
        });
      }
      const pack = byCountry.get(r.country_code);
      pack.requirements.push({
        id: r.id,
        documentTypeId: r.document_type_id,
        documentCode: r.document_code,
        documentName: r.document_name,
        documentCategory: r.document_category,
        description: r.document_description,
        importingAuthority: r.importing_authority,
        mandatory: r.mandatory,
        status: r.status,
        effectiveFrom: r.effective_from,
        effectiveTo: r.effective_to,
        officialSourceUrl: r.official_source_url,
        notes: r.notes,
        lastVerifiedAt: r.last_verified_at,
      });
    }
    res.json({ countryPacks: Array.from(byCountry.values()) });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// ============================================
// Export document requirements & documents (P08)
// ============================================

// List document requirements for a project (derived from country requirements)
app.get("/api/v1/projects/:projectId/document-requirements", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = req.params.projectId as string;
  const hasPerm = await requireProjectPermission(req, res, projectId, "documents.view");
  if (!hasPerm) return;
  try {
    const { rows } = await req.db.query(
      `SELECT per.id, per.project_id, per.country_requirement_id, per.is_required, per.status,
              per.override_reason, per.overridden_by, per.created_at, per.updated_at,
              cdr.country_code, c.country_name, cdr.document_type_id, edt.document_code,
              edt.document_name, edt.document_category, edt.description AS document_description,
              cdr.importing_authority, cdr.mandatory AS country_mandatory, cdr.status AS country_status,
              cdr.effective_from, cdr.effective_to, cdr.official_source_url, cdr.notes AS country_notes
       FROM project_export_document_requirements per
       JOIN country_export_document_requirements cdr ON cdr.id = per.country_requirement_id
       JOIN countries c ON c.country_code = cdr.country_code
       JOIN export_document_types edt ON edt.id = cdr.document_type_id
       WHERE per.project_id = $1::uuid
       ORDER BY c.country_code, edt.document_code`,
      [projectId],
    );
    res.json({ documentRequirements: rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      countryRequirementId: r.country_requirement_id,
      countryCode: r.country_code,
      countryName: r.country_name,
      documentTypeId: r.document_type_id,
      documentCode: r.document_code,
      documentName: r.document_name,
      documentCategory: r.document_category,
      description: r.document_description,
      importingAuthority: r.importing_authority,
      isRequired: r.is_required,
      countryMandatory: r.country_mandatory,
      status: r.status,
      countryStatus: r.country_status,
      overrideReason: r.override_reason,
      overriddenBy: r.overridden_by,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      officialSourceUrl: r.official_source_url,
      countryNotes: r.country_notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// List uploaded documents for a project
app.get("/api/v1/projects/:projectId/documents", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = req.params.projectId as string;
  const hasPerm = await requireProjectPermission(req, res, projectId, "documents.view");
  if (!hasPerm) return;
  try {
    const { rows } = await req.db.query(
      `SELECT d.id, d.project_id, d.project_requirement_id, d.file_reference, d.object_key,
              d.original_filename, d.mime_type, d.sha256_checksum, d.version_no, d.status,
              d.uploaded_by, d.reviewed_by, d.uploaded_at, d.reviewed_at, d.expiry_date, d.notes,
              d.created_at, d.updated_at,
              per.country_requirement_id, cdr.country_code, edt.document_code, edt.document_name
       FROM project_export_documents d
       JOIN project_export_document_requirements per ON per.id = d.project_requirement_id
       JOIN country_export_document_requirements cdr ON cdr.id = per.country_requirement_id
       JOIN export_document_types edt ON edt.id = cdr.document_type_id
       WHERE d.project_id = $1::uuid
       ORDER BY d.uploaded_at DESC LIMIT 200`,
      [projectId],
    );
    res.json({ documents: rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      projectRequirementId: r.project_requirement_id,
      countryRequirementId: r.country_requirement_id,
      countryCode: r.country_code,
      documentCode: r.document_code,
      documentName: r.document_name,
      fileReference: r.file_reference,
      objectKey: r.object_key,
      originalFilename: r.original_filename,
      mimeType: r.mime_type,
      sha256Checksum: r.sha256_checksum,
      versionNo: r.version_no,
      status: r.status,
      uploadedBy: r.uploaded_by,
      reviewedBy: r.reviewed_by,
      uploadedAt: r.uploaded_at,
      reviewedAt: r.reviewed_at,
      expiryDate: r.expiry_date,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// Register a document file reference for a project requirement
app.post("/api/v1/projects/:projectId/documents", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = req.params.projectId as string;
  if (!(await requireProjectPermission(req, res, projectId, "documents.create"))) return;
  const { projectRequirementId, fileReference, objectKey, originalFilename, mimeType, sha256Checksum, contentLength, versionNo, expiryDate, notes } = req.body ?? {};
  if (!projectRequirementId || !fileReference || !objectKey || !originalFilename || !sha256Checksum || contentLength === undefined) return res.status(400).json({ error: "Project requirement, private object key, filename, SHA-256 and content length are required." });
  if (String(objectKey).indexOf(`projects/${projectId}/`) !== 0 || fileReference !== objectKey) return res.status(400).json({ error: "Document reference must match a project-namespaced private object key.", code: "INVALID_OBJECT_KEY" });
  try {
    await privateStorage.verifyObject(String(objectKey), Number(contentLength), String(sha256Checksum));
    const { rows: reqRows } = await req.db.query(
      `SELECT per.id, edt.document_code
         FROM project_export_document_requirements per
         JOIN country_export_document_requirements cdr ON cdr.id=per.country_requirement_id
         JOIN export_document_types edt ON edt.id=cdr.document_type_id
        WHERE per.id=$1::uuid AND per.project_id=$2::uuid`,
      [projectRequirementId, projectId],
    );
    if (reqRows.length === 0) return res.status(404).json({ error: "Not found" });
    const storageStatus=privateStorage.status();
    if(!storageStatus.available) return res.status(503).json({error:"Private object storage is unavailable.",code:"STORAGE_UNAVAILABLE"});
    const { rows } = await req.db.query(
      `INSERT INTO project_export_documents
        (project_id,project_requirement_id,file_reference,object_key,original_filename,mime_type,
         sha256_checksum,version_no,status,uploaded_by,expiry_date,notes,created_at,updated_at,
         storage_bucket,file_size_bytes,upload_verified_at,uploaded_content_type,document_type_code)
       VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,'uploaded',$9::uuid,$10::date,$11,now(),now(),
               $12,$13::bigint,now(),$6,$14)
       RETURNING *`,
      [projectId,projectRequirementId,fileReference,objectKey,originalFilename,mimeType||null,
       sha256Checksum,versionNo!==undefined?versionNo:1,req.user?.id||null,expiryDate||null,notes||null,
       storageStatus.bucket,Number(contentLength),reqRows[0].document_code],
    );
    res.status(201).json({ document: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/documents/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { status, notes } = req.body ?? {};
  if (!status) return res.status(400).json({ error: "Required field: status" });
  const allowed = ["uploaded", "under_review", "approved", "rejected", "expired", "superseded"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Allowed: ${allowed.join(", ")}` });
  }
  try {
    const { rows: existingRows } = await req.db.query(
      "SELECT id, project_id FROM project_export_documents WHERE id = $1::uuid",
      [req.params.id],
    );
    if (existingRows.length === 0) return res.status(404).json({ error: "Not found" });
    const projectId = existingRows[0].project_id;
    if (!(await requireProjectPermission(req, res, projectId, "documents.update"))) return;
    const reviewerId = req.user?.id || null;
    const { rows } = await req.db.query(
      `UPDATE project_export_documents
       SET status = $1, notes = COALESCE($2, notes), reviewed_by = $3::uuid,
           reviewed_at = CASE WHEN $1 IN ('approved', 'rejected') THEN now() ELSE reviewed_at END,
           updated_at = now()
       WHERE id = $4::uuid
       RETURNING *`,
      [status, notes || null, reviewerId, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json({ document: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// ============================================
// Private object storage (P05) — pke-private-documents
// ============================================

app.get("/api/v1/storage/status", requireAuth, async (_req: express.Request, res: express.Response) => {
  res.json(privateStorage.status());
});

app.post("/api/v1/storage/presigned-upload", requireAuth, async (req: express.Request, res: express.Response) => {
  const { objectKey, mimeType, contentLength, filename } = req.body ?? {};
  if (!objectKey || !mimeType || contentLength === undefined) {
    return res.status(400).json({ error: "Required fields: objectKey, mimeType, contentLength" });
  }
  const key = String(objectKey);
  const m = /^projects\/([0-9a-fA-F-]{36})\//.exec(key);
  if (!m) return res.status(400).json({ error: "Object key must be namespaced to a project", code: "INVALID_OBJECT_KEY" });
  if (!(await requireProjectPermission(req, res, m[1], "documents.create"))) return;
  const status = privateStorage.status();
  if (!status.available) {
    return res.status(503).json({ error: "Object storage unavailable", code: "STORAGE_UNAVAILABLE", reason: status.reason, bucket: status.bucket });
  }
  const keyCheck = privateStorage.validateObjectKey(key);
  if (!keyCheck.ok) return res.status(400).json({ error: keyCheck.reason, code: "INVALID_OBJECT_KEY" });
  const metaCheck = privateStorage.validateFileMetadata({ mimeType, contentLength, filename });
  if (!metaCheck.ok) return res.status(400).json({ error: metaCheck.reason, code: "INVALID_FILE_METADATA" });
  try {
    const upload = await privateStorage.presignedUpload(key, mimeType, contentLength);
    res.json({ upload });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/storage/presigned-download/*objectKey", requireAuth, async (req: express.Request, res: express.Response) => {
  const rawParam = (req.params as any).objectKey;
  const rawKey = Array.isArray(rawParam) ? rawParam.join("/") : (typeof rawParam === "string" ? rawParam : (typeof req.query.objectKey === "string" ? req.query.objectKey : ""));
  const objectKey = decodeURIComponent(String(rawKey || ""));
  if (!objectKey) return res.status(400).json({ error: "objectKey is required" });
  const m = /^projects\/([0-9a-fA-F-]{36})\//.exec(objectKey);
  if (!m) return res.status(400).json({ error: "Invalid object key namespace", code: "INVALID_OBJECT_KEY" });
  if (!(await requireProjectPermission(req, res, m[1], "documents.view"))) return;
  const status = privateStorage.status();
  if (!status.available) {
    return res.status(503).json({ error: "Object storage unavailable", code: "STORAGE_UNAVAILABLE", reason: status.reason, bucket: status.bucket });
  }
  try {
    const download = await privateStorage.presignedDownload(objectKey);
    res.json({ download });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// Project workflow management
app.get("/api/v1/workflows/project/:projectId", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const projectId = req.params.projectId as string;
    if (!(await requireProjectPermission(req, res, projectId, "workflow.view"))) return;
    const workflows = await req.drizzleDb.select().from(schema.project_workflows).where(
      eq(schema.project_workflows.project_id, projectId)
    );
    res.json({ workflows });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/workflows", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { projectId, workflowTemplateId, version } = req.body ?? {};
    if (!projectId || !workflowTemplateId) return res.status(400).json({ error: "Required fields: projectId, workflowTemplateId" });
    if (!(await requireProjectPermission(req, res, String(projectId), "workflow.update"))) return;
    const result = await req.drizzleDb
      .insert(schema.project_workflows)
      .values({
        id: crypto.randomUUID(),
        project_id: projectId,
        workflow_template_id: workflowTemplateId,
        version: version || "1.0",
        status: "active",
        config_snapshot: {},
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning();
    res.json({ workflow: result[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});


// P0 Project Work Items API. Request-scoped RLS transaction is supplied by middleware.
app.get("/api/v1/projects/:projectId/work-items", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = req.params.projectId as string;
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Authenticated principal required" });
  try {
    const permission = await req.db.query(
      "SELECT public.pke_has_project_permission($1::uuid, 'project.tasks.view') AS allowed", [projectId]
    );
    const canViewAll = permission.rows[0]?.allowed === true;
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const result = await req.db.query(
      "SELECT wi.*, (wi.due_at IS NOT NULL AND wi.due_at < now() AND wi.status NOT IN ('resolved','closed','cancelled')) AS is_overdue " +
      "FROM public.project_work_items wi WHERE wi.project_id=$1::uuid " +
      "AND ($2::boolean OR (public.pke_user_has_active_project_role(wi.project_id,wi.owner_role_code) AND (wi.assignee_user_id IS NULL OR wi.assignee_user_id=$3::uuid))) " +
      "AND ($4::text IS NULL OR wi.status=$4::text) " +
      "ORDER BY CASE wi.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, wi.due_at ASC NULLS LAST, wi.created_at DESC LIMIT 250",
      [projectId, canViewAll, userId, status]
    );
    return res.json({ workItems: result.rows, scope: canViewAll ? "project" : "assigned", dataFreshness: new Date().toISOString() });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.get("/api/v1/projects/:projectId/work-items/:id/events", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const result = await req.db.query(
      "SELECT e.* FROM public.project_work_item_events e WHERE e.project_id=$1::uuid AND e.work_item_id=$2::uuid ORDER BY e.occurred_at ASC",
      [req.params.projectId, req.params.id]
    );
    return res.json({ events: result.rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/projects/:projectId/work-items", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = req.params.projectId as string;
  const actorId = req.user?.id;
  const body = req.body ?? {};
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const ownerRoleCode = typeof body.ownerRoleCode === "string" ? body.ownerRoleCode : "";
  if (!actorId) return res.status(401).json({ error: "Authenticated principal required" });
  if (title.length < 3 || title.length > 240 || !/^[a-z][a-z0-9_]{1,63}$/.test(ownerRoleCode))
    return res.status(400).json({ error: "A 3-240 character title and valid ownerRoleCode are required." });
  if (!(await requireProjectPermission(req, res, projectId, "project.tasks.create"))) return;
  if (body.priority && !["low","normal","high","critical"].includes(body.priority)) return res.status(400).json({ error: "Invalid priority." });
  if (body.workItemType && !["task","instruction","exception","approval_request","follow_up"].includes(body.workItemType)) return res.status(400).json({ error: "Invalid workItemType." });
  if ((body.sourceEntityType && !body.sourceEntityId) || (!body.sourceEntityType && body.sourceEntityId)) return res.status(400).json({ error: "sourceEntityType and sourceEntityId must be supplied together." });
  if (body.dueAt && !Number.isFinite(Date.parse(body.dueAt))) return res.status(400).json({ error: "Invalid dueAt timestamp." });
  try {
    const role = await req.db.query(
      "SELECT id FROM public.project_roles WHERE project_id=$1::uuid AND role_code=$2 AND is_active=true LIMIT 1",
      [projectId, ownerRoleCode]
    );
    if (role.rows.length !== 1) return res.status(422).json({ error: "Owner role is not active in this Project.", code: "PROJECT_ROLE_NOT_ACTIVE" });
    const assignments = await req.db.query(
      "SELECT DISTINCT a.user_id FROM public.project_role_assignments a JOIN public.project_members pm ON pm.id=a.project_member_id " +
      "WHERE a.project_id=$1::uuid AND a.project_role_id=$2::uuid AND a.is_active=true AND a.revoked_at IS NULL " +
      "AND (a.expires_at IS NULL OR a.expires_at>now()) AND pm.is_active=true AND pm.deactivated_at IS NULL " +
      "AND (pm.expires_at IS NULL OR pm.expires_at>now())",
      [projectId, role.rows[0].id]
    );
    if (!assignments.rows.length) return res.status(422).json({ error: "No active assignee is assigned to the selected Project role.", code: "ROLE_HAS_NO_ACTIVE_ASSIGNEE" });
    if (body.assigneeUserId && !assignments.rows.some((row: any) => row.user_id === body.assigneeUserId))
      return res.status(422).json({ error: "Assignee does not hold the selected active Project role.", code: "ASSIGNEE_ROLE_MISMATCH" });
    const inserted = await req.db.query(
      "INSERT INTO public.project_work_items (project_id,source_entity_type,source_entity_id,work_item_type,title,description,priority,owner_role_code,assignee_user_id,created_by,due_at,dedupe_key) " +
      "VALUES ($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8,$9::uuid,$10::uuid,$11::timestamptz,$12) " +
      "ON CONFLICT (project_id,dedupe_key) DO NOTHING RETURNING *",
      [projectId,body.sourceEntityType || null,body.sourceEntityId || null,body.workItemType || "task",title,
       typeof body.description === "string" ? body.description.trim() : null,body.priority || "normal",ownerRoleCode,
       body.assigneeUserId || null,actorId,body.dueAt || null,body.dedupeKey || null]
    );
    if (!inserted.rows.length) return res.status(409).json({ error: "A work item with this Project dedupe key already exists.", code: "WORK_ITEM_DUPLICATE" });
    const item = inserted.rows[0];
    const createdEvent = await req.db.query(
      "INSERT INTO public.project_work_item_events (work_item_id,project_id,event_type,actor_user_id,reason,payload) VALUES ($1::uuid,$2::uuid,'created',$3::uuid,'Work item created',$4::jsonb) RETURNING id",
      [item.id,projectId,actorId,JSON.stringify({ ownerRoleCode, assigneeUserId: body.assigneeUserId || null })]
    );
    await req.db.query(
      "INSERT INTO public.user_notifications (id,event_id,project_id,work_item_id,recipient_user_id,created_by,title,message,priority,category,created_at) " +
      "SELECT gen_random_uuid(),$5::uuid,wi.project_id,wi.id,a.user_id,$2::uuid,$3,$4,wi.priority,'task_assignment',now() " +
      "FROM public.project_work_items wi JOIN public.project_roles pr ON pr.project_id=wi.project_id AND pr.role_code=wi.owner_role_code " +
      "JOIN public.project_role_assignments a ON a.project_id=pr.project_id AND a.project_role_id=pr.id " +
      "JOIN public.project_members pm ON pm.id=a.project_member_id AND pm.user_id=a.user_id " +
      "WHERE wi.id=$1::uuid AND (wi.assignee_user_id IS NULL OR wi.assignee_user_id=a.user_id) " +
      "AND a.is_active=true AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at>now()) " +
      "AND pm.is_active=true AND pm.deactivated_at IS NULL AND (pm.expires_at IS NULL OR pm.expires_at>now()) ON CONFLICT DO NOTHING",
      [item.id,actorId,"Tugas baru: " + item.title,"Anda menerima tugas " + item.title + ". Tenggat: " + (item.due_at || "belum ditentukan") + ".",createdEvent.rows[0].id]
    );
    return res.status(201).json({ workItem: item });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.patch("/api/v1/projects/:projectId/work-items/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = req.params.projectId as string;
  const actorId = req.user?.id;
  const body = req.body ?? {};
  const action = body.action;
  if (!actorId) return res.status(401).json({ error: "Authenticated principal required" });
  if (!["assign","acknowledge","start","block","submit","resolve","close","reopen","escalate","comment","cancel"].includes(action))
    return res.status(400).json({ error: "Unsupported work item action." });
  try {
    const found = await req.db.query("SELECT * FROM public.project_work_items WHERE id=$1::uuid AND project_id=$2::uuid LIMIT 1",[req.params.id,projectId]);
    if (!found.rows.length) return res.status(404).json({ error: "Work item not found." });
    const item = found.rows[0];
    const checks = await req.db.query(
      "SELECT public.pke_has_project_permission($1::uuid,'project.tasks.update') AS can_update, " +
      "public.pke_has_project_permission($1::uuid,'project.tasks.assign') AS can_assign, " +
      "public.pke_has_project_permission($1::uuid,'project.tasks.resolve') AS can_resolve, " +
      "public.pke_has_project_permission($1::uuid,'project.tasks.escalate') AS can_escalate, " +
      "public.pke_user_has_active_project_role($1::uuid,$2::text) AND ($4::uuid IS NULL OR $3::uuid=$4::uuid) AS is_assigned",
      [projectId,item.owner_role_code,actorId,item.assignee_user_id]
    );
    const access = checks.rows[0];
    if (action === "assign" && !access.can_assign) return res.status(403).json({ error: "Task assignment requires project.tasks.assign." });
    if (["resolve","close","reopen","cancel"].includes(action) && !access.can_resolve) return res.status(403).json({ error: "Task resolution requires project.tasks.resolve." });
    if (action === "escalate" && !access.is_assigned && !access.can_escalate) return res.status(403).json({ error: "Only the assigned owner or PM may escalate this task." });
    if (["acknowledge","start","block","submit"].includes(action) && !access.is_assigned)
      return res.status(403).json({ error: "Operational status transitions must be performed by the assigned active role/user." });
    if (action === "comment" && !access.is_assigned && !access.can_update)
      return res.status(403).json({ error: "Only the assigned owner or PM may comment on this task." });
    if (["resolved","closed","cancelled"].includes(item.status) && action !== "reopen") return res.status(409).json({ error: "Terminal task must be reopened before further action." });

    let status = item.status, roleCode = item.owner_role_code, assignee = item.assignee_user_id, due = item.due_at, priority = item.priority;
    let eventType = action === "escalate" ? "escalated" : action === "cancel" ? "cancelled" : action === "comment" ? "commented" : action === "reopen" ? "reopened" : action === "acknowledge" ? "acknowledged" : action === "start" ? "started" : action === "block" ? "blocked" : action === "submit" ? "submitted" : action === "resolve" ? "resolved" : action === "close" ? "closed" : action;
    if (action === "assign") {
      if (typeof body.ownerRoleCode !== "string" || typeof body.reason !== "string" || body.reason.trim().length < 5) return res.status(400).json({ error: "ownerRoleCode and reassignment reason are required." });
      const role = await req.db.query("SELECT id FROM public.project_roles WHERE project_id=$1::uuid AND role_code=$2 AND is_active=true LIMIT 1",[projectId,body.ownerRoleCode]);
      if (!role.rows.length) return res.status(422).json({ error: "Owner role is not active in this Project." });
      const assigned = await req.db.query(
        "SELECT a.user_id FROM public.project_role_assignments a JOIN public.project_members pm ON pm.id=a.project_member_id " +
        "WHERE a.project_id=$1::uuid AND a.project_role_id=$2::uuid AND a.is_active=true AND a.revoked_at IS NULL " +
        "AND (a.expires_at IS NULL OR a.expires_at>now()) AND pm.is_active=true AND pm.deactivated_at IS NULL " +
        "AND (pm.expires_at IS NULL OR pm.expires_at>now())",[projectId,role.rows[0].id]);
      if (!assigned.rows.length || (body.assigneeUserId && !assigned.rows.some((r: any) => r.user_id === body.assigneeUserId)))
        return res.status(422).json({ error: "Assignee must hold the selected active Project role." });
      roleCode=body.ownerRoleCode; assignee=body.assigneeUserId || null; status="open";
      if (body.dueAt !== undefined) { if (body.dueAt && !Number.isFinite(Date.parse(body.dueAt))) return res.status(400).json({ error: "Invalid dueAt." }); due=body.dueAt || null; }
      if (body.priority !== undefined) { if (!["low","normal","high","critical"].includes(body.priority)) return res.status(400).json({ error: "Invalid priority." }); priority=body.priority; }
      eventType = item.owner_role_code === roleCode && item.assignee_user_id === assignee ? "assigned" : "reassigned";
    } else if (action === "acknowledge") { if (item.status !== "open") return res.status(409).json({ error: "Only open tasks can be acknowledged." }); status="acknowledged";
    } else if (action === "start") { if (!["acknowledged","blocked"].includes(item.status)) return res.status(409).json({ error: "Task must be acknowledged or blocked." }); status="in_progress";
    } else if (action === "block") { if (!["acknowledged","in_progress"].includes(item.status) || typeof body.reason !== "string" || body.reason.trim().length<5) return res.status(400).json({ error: "A reason of at least 5 characters is required to block a task." }); status="blocked";
    } else if (action === "submit") { if (!["in_progress","blocked","acknowledged"].includes(item.status)) return res.status(409).json({ error: "Task must be acknowledged or in progress before submission." }); status="submitted";
    } else if (action === "resolve") { if (item.status !== "submitted") return res.status(409).json({ error: "Only submitted tasks can be resolved by PM." }); status="resolved";
    } else if (action === "close") { if (item.status !== "resolved") return res.status(409).json({ error: "Only resolved tasks can be closed." }); status="closed";
    } else if (action === "reopen") { if (!["resolved","closed"].includes(item.status) || typeof body.reason !== "string" || body.reason.trim().length<5) return res.status(400).json({ error: "A reason is required to reopen a task." }); status="open";
    } else if (action === "cancel") { if (typeof body.reason !== "string" || body.reason.trim().length<5) return res.status(400).json({ error: "A cancellation reason is required." }); status="cancelled";
    } else if (action === "escalate") { if (["resolved","closed","cancelled"].includes(item.status) || typeof body.reason !== "string" || body.reason.trim().length<5) return res.status(400).json({ error: "An escalation reason is required for an active task." });
    } else if (action === "comment") { if (typeof body.comment !== "string" || body.comment.trim().length<2) return res.status(400).json({ error: "A comment is required." }); }

    if (action === "escalate") {
      await req.db.query("UPDATE public.project_work_items SET escalation_level=escalation_level+1,updated_at=now() WHERE id=$1::uuid AND project_id=$2::uuid",[item.id,projectId]);
    } else {
      await req.db.query(
        "UPDATE public.project_work_items SET status=$1,owner_role_code=$2,assignee_user_id=$3::uuid,due_at=$4::timestamptz,priority=$5," +
        "acknowledged_at=CASE WHEN $1='open' THEN NULL WHEN $1='acknowledged' AND acknowledged_at IS NULL THEN now() ELSE acknowledged_at END," +
        "started_at=CASE WHEN $1='open' THEN NULL WHEN $1='in_progress' AND started_at IS NULL THEN now() ELSE started_at END," +
        "submitted_at=CASE WHEN $1='open' THEN NULL WHEN $1='submitted' THEN now() ELSE submitted_at END," +
        "resolved_at=CASE WHEN $1='open' THEN NULL WHEN $1='resolved' THEN now() ELSE resolved_at END,resolved_by=CASE WHEN $1='open' THEN NULL WHEN $1='resolved' THEN $6::uuid ELSE resolved_by END," +
        "closed_at=CASE WHEN $1='open' THEN NULL WHEN $1='closed' THEN now() ELSE closed_at END,closed_by=CASE WHEN $1='open' THEN NULL WHEN $1='closed' THEN $6::uuid ELSE closed_by END,updated_at=now() " +
        "WHERE id=$7::uuid AND project_id=$8::uuid",
        [status,roleCode,assignee,due,priority,actorId,item.id,projectId]
      );
    }
    const recordedEvent = await req.db.query(
      "INSERT INTO public.project_work_item_events (work_item_id,project_id,event_type,actor_user_id,reason,payload) VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5,$6::jsonb) RETURNING id",
      [item.id,projectId,eventType,actorId,body.reason || null,JSON.stringify({ action, comment: body.comment || null, beforeStatus: item.status, status, beforeOwnerRoleCode: item.owner_role_code, ownerRoleCode: roleCode, beforeAssigneeUserId: item.assignee_user_id, assigneeUserId: assignee })]
    );
    if (["assign","escalate","submit","block","resolve","close"].includes(action)) {
      const notifyPm = ["escalate","submit","block"].includes(action);
      const targetRole = notifyPm ? "pm" : roleCode;
      const targetUser = action === "assign" ? assignee : (action === "resolve" || action === "close") ? item.assignee_user_id : null;
      const title = notifyPm
        ? (action === "submit" ? "Tugas menunggu review PM: " : action === "block" ? "Tugas terblokir: " : "Eskalasi tugas: ") + item.title
        : (action === "assign" ? "Penugasan: " : "Pembaruan tugas: ") + item.title;
      const message = notifyPm
        ? (action === "submit" ? "Tugas telah dikirim untuk review PM." : action === "block" ? "Tugas diblokir. Alasan: " + body.reason : "Tugas dieskalasikan ke PM. Alasan: " + body.reason)
        : (action === "assign" ? "Anda menerima tugas. Alasan penugasan: " + body.reason : "Status tugas diperbarui menjadi " + status + ".");
      await req.db.query(
        "INSERT INTO public.user_notifications (id,event_id,project_id,work_item_id,recipient_user_id,created_by,title,message,priority,category,created_at) " +
        "SELECT gen_random_uuid(),$9::uuid,$1::uuid,$2::uuid,a.user_id,$3::uuid,$4,$5,$6,'task_update',now() " +
        "FROM public.project_roles pr JOIN public.project_role_assignments a ON a.project_role_id=pr.id AND a.project_id=pr.project_id " +
        "JOIN public.project_members pm ON pm.id=a.project_member_id AND pm.user_id=a.user_id " +
        "WHERE pr.project_id=$1::uuid AND pr.role_code=$7 AND pr.is_active=true AND a.is_active=true AND a.revoked_at IS NULL " +
        "AND (a.expires_at IS NULL OR a.expires_at>now()) AND pm.is_active=true AND pm.deactivated_at IS NULL " +
        "AND (pm.expires_at IS NULL OR pm.expires_at>now()) AND ($8::uuid IS NULL OR a.user_id=$8::uuid) ON CONFLICT DO NOTHING",
        [projectId,item.id,actorId,title,message,item.priority,targetRole,targetUser,recordedEvent.rows[0].id]
      );
    }
    const updated = await req.db.query(
      "SELECT wi.*, (wi.due_at IS NOT NULL AND wi.due_at<now() AND wi.status NOT IN ('resolved','closed','cancelled')) AS is_overdue " +
      "FROM public.project_work_items wi WHERE wi.id=$1::uuid AND wi.project_id=$2::uuid",[item.id,projectId]);
    return res.json({ workItem: updated.rows[0] });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

// ============================================
// Sprint 02E — Reporting, Notifications & BI
// ============================================

const reportTemplatesStore: any[] = [
  { id: "tpl-daily-ops", name: "Daily Operations Report", category: "Operational", version: 1, active: true, audience: "internal", frequency: "daily" },
  { id: "tpl-weekly-rab", name: "Weekly RAB vs Actual", category: "Financial", version: 1, active: true, audience: "finance", frequency: "weekly" },
  { id: "tpl-financial-report", name: "Project Financial Report", category: "Financial", version: 1, active: true, audience: "project_management", frequency: "on_demand" },
  { id: "tpl-buyer-progress", name: "Buyer Progress Summary", category: "Shipment", version: 1, active: true, audience: "buyer", frequency: "daily" },
];

app.get("/api/v1/kpis", requireAuth, async (req: express.Request, res: express.Response) => {
  const kpis = [
    { id: "contract_fulfillment", name: "Contract Fulfillment", formula: "accepted_quantity / contract_target_quantity * 100", unit: "percent", version: 1 },
    { id: "loading_completion", name: "Loading Completion", formula: "loaded_quantity / shipment_target_quantity * 100", unit: "percent", version: 1 },
    { id: "truck_delivery_variance", name: "Truck Delivery Variance", formula: "origin_net_quantity - warehouse_accepted_quantity", unit: "MT", version: 1 },
    { id: "cost_per_mt", name: "Cost per MT", formula: "eligible_project_cost / accepted_or_loaded_quantity", unit: "currency", version: 1 },
    { id: "on_time_delivery", name: "On-Time Delivery", formula: "on_time_trips / eligible_trips * 100", unit: "percent", version: 1 },
    { id: "loading_rate", name: "Loading Rate", formula: "loaded_quantity / effective_loading_hours", unit: "MT/hour", version: 1 },
    { id: "cash_readiness", name: "Cash Readiness", formula: "available_verified_cash / cash_required", unit: "ratio", version: 1 },
    { id: "payment_ageing", name: "Payment Ageing", formula: "sum(outstanding * days_overdue) / sum(outstanding)", unit: "days", version: 1 },
    { id: "fx_exposure", name: "FX Exposure", formula: "net_receivable - net_payable + commitments - hedged", unit: "currency", version: 1 },
  ];
  res.json({ kpis, dataFreshness: new Date().toISOString() });
});

app.get("/api/v1/reports/portfolio", requireAuth, async (_req: express.Request, res: express.Response) => {
  return res.status(403).json({
    error: "Global portfolio reporting is outside Platform Admin governance scope. Use a Project-scoped reports.view endpoint.",
    code: "GLOBAL_PORTFOLIO_REPORT_OUT_OF_SCOPE",
  });
});

app.get("/api/v1/reports/project/:projectId", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  if (!(await requireProjectPermission(req, res, projectId, "reports.view"))) return;
  try {
    const { rows: projectRows } = await req.db.query("SELECT * FROM projects WHERE id = $1::uuid", [projectId]);
    if (projectRows.length === 0) return res.status(404).json({ error: "Project not found" });
    const { rows: tripRows } = await req.db.query("SELECT COUNT(*)::int AS count FROM truck_trips WHERE project_id = $1::uuid", [projectId]);
    const { rows: rabRows } = await req.db.query("SELECT COALESCE(SUM(amount),0) AS budget FROM rab WHERE project_id = $1::uuid", [projectId]);
    res.json({
      project: projectRows[0],
      truckTrips: tripRows[0]?.count ?? 0,
      approvedBudget: rabRows[0]?.budget ?? 0,
      dataFreshness: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/reports/templates", requireAuth, async (req: express.Request, res: express.Response) => {
  res.json({ templates: reportTemplatesStore });
});

app.get("/api/v1/reports/runs", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const projectId = typeof req.query.projectId === "string" && req.query.projectId ? req.query.projectId : null;
    let rows: any[];
    if (projectId) {
      if (!(await requireProjectPermission(req, res, projectId, "reports.view"))) return;
      ({ rows } = await req.db.query(
        "SELECT * FROM report_runs WHERE project_id = $1::uuid ORDER BY generated_at DESC LIMIT 200",
        [projectId],
      ));
    } else {
      ({ rows } = await req.db.query(
        `SELECT rr.* FROM report_runs rr
          WHERE rr.project_id IN (
            SELECT pm.project_id
              FROM project_members pm
             WHERE pm.user_id = $1::uuid AND pm.is_active = true
               AND EXISTS (
                 SELECT 1
                   FROM project_role_assignments a
                   JOIN project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
                   JOIN project_role_permissions prp ON prp.project_role_id = pr.id AND prp.project_id = pr.project_id
                   JOIN permissions perm ON perm.id = prp.permission_id AND perm.is_active = true
                  WHERE a.project_id = pm.project_id AND a.user_id = pm.user_id
                    AND a.is_active = true AND a.revoked_at IS NULL
                    AND (a.expires_at IS NULL OR a.expires_at > now())
                    AND pr.is_active = true AND pr.role_code <> 'funder'
                    AND perm.code = 'reports.view'
               )
          )
          ORDER BY rr.generated_at DESC LIMIT 200`,
        [req.user?.id],
      ));
    }
    const runs = rows.map((r: any) => ({
      id: r.id,
      scheduleId: r.schedule_id,
      templateId: r.template_id,
      templateVersion: r.template_version,
      cutoff: r.cutoff_at,
      projectId: r.project_id,
      status: r.status,
      requestedBy: r.requested_by,
      generatedAt: r.generated_at,
      dataFreshness: r.data_freshness,
      idempotencyKey: r.idempotency_key,
      fileReference: r.file_reference,
    }));
    res.json({ runs });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// Explicit Funder report sharing. Only Project staffing managers can share/revoke,
// and the database trigger independently verifies the recipient's active Funder role.
app.get("/api/v1/funder/shared-reports", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId query parameter required." });
  if (!(await requireProjectPermission(req, res, projectId, "funder.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT rr.id, rr.project_id, rr.template_id, rr.template_version,
              rr.cutoff_at, rr.generated_at, rr.data_freshness, rr.file_reference,
              rr.report_payload, s.shared_at
         FROM public.project_funder_report_shares s
         JOIN public.report_runs rr
           ON rr.id = s.report_run_id AND rr.project_id = s.project_id
        WHERE s.project_id = $1::uuid
          AND s.funder_user_id = $2::uuid
          AND s.revoked_at IS NULL
          AND rr.status = 'completed'
        ORDER BY s.shared_at DESC
        LIMIT 100`,
      [projectId, req.user?.id],
    );
    return res.json({ reports: rows.map((r: any) => ({
      id: r.id, projectId: r.project_id, templateId: r.template_id,
      templateVersion: r.template_version, cutoff: r.cutoff_at,
      generatedAt: r.generated_at, dataFreshness: r.data_freshness,
      fileReference: r.file_reference, reportPayload: r.report_payload,
      sharedAt: r.shared_at,
    })) });
  } catch {
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/projects/:projectId/funder/report-shares", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  if (!(await requireProjectPermission(req, res, projectId, "project.members.manage"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT s.id, s.report_run_id, s.funder_user_id, u.email AS funder_email,
              rr.template_id, rr.status AS report_status, s.shared_at
         FROM public.project_funder_report_shares s
         JOIN public.users u ON u.id = s.funder_user_id
         JOIN public.report_runs rr ON rr.id = s.report_run_id AND rr.project_id = s.project_id
        WHERE s.project_id = $1::uuid AND s.revoked_at IS NULL
        ORDER BY s.shared_at DESC`,
      [projectId],
    );
    return res.json({ shares: rows });
  } catch {
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/projects/:projectId/funder/report-shares", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.params;
  const reportRunId = typeof req.body?.reportRunId === "string" ? req.body.reportRunId : "";
  const funderUserId = typeof req.body?.funderUserId === "string" ? req.body.funderUserId : "";
  if (!reportRunId || !funderUserId) {
    return res.status(400).json({ error: "reportRunId and funderUserId are required." });
  }
  if (!(await requireProjectPermission(req, res, projectId, "project.members.manage"))) return;
  try {
    const { rows: reportRows } = await req.db.query(
      `SELECT id FROM public.report_runs
        WHERE id = $1::uuid AND project_id = $2::uuid
          AND status = 'completed' AND NULLIF(btrim(file_reference), '') IS NOT NULL`,
      [reportRunId, projectId],
    );
    if (reportRows.length !== 1) {
      return res.status(409).json({ error: "Only a completed report artifact in this Project can be shared.", code: "REPORT_NOT_SHAREABLE" });
    }
    const { rows: funderRows } = await req.db.query(
      `SELECT 1
         FROM public.project_role_assignments a
         JOIN public.project_members pm ON pm.id = a.project_member_id
           AND pm.project_id = a.project_id AND pm.user_id = a.user_id
         JOIN public.project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
         JOIN public.project_role_permissions prp ON prp.project_id = a.project_id AND prp.project_role_id = pr.id
         JOIN public.permissions perm ON perm.id = prp.permission_id
           AND perm.code = 'funder.view' AND perm.is_active = true
        WHERE a.project_id = $1::uuid AND a.user_id = $2::uuid
          AND a.is_active = true AND a.revoked_at IS NULL
          AND (a.expires_at IS NULL OR a.expires_at > now())
          AND pm.is_active = true AND pm.deactivated_at IS NULL
          AND (pm.expires_at IS NULL OR pm.expires_at > now())
          AND pr.role_code = 'funder' AND pr.is_active = true
        LIMIT 1`,
      [projectId, funderUserId],
    );
    if (funderRows.length !== 1) {
      return res.status(400).json({ error: "Recipient must have an active Funder assignment in this Project.", code: "FUNDER_ASSIGNMENT_REQUIRED" });
    }
    const { rows } = await req.db.query(
      `INSERT INTO public.project_funder_report_shares
         (project_id, report_run_id, funder_user_id, shared_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid)
       RETURNING id, project_id, report_run_id, funder_user_id, shared_at`,
      [projectId, reportRunId, funderUserId, req.user?.id],
    );
    return res.status(201).json({ share: rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "This report is already shared with this Funder.", code: "FUNDER_REPORT_ALREADY_SHARED" });
    if (error?.code === "22P02") return res.status(400).json({ error: "Invalid report or Funder identifier." });
    if (error?.code === "42501" || error?.code === "23514") return res.status(403).json({ error: "Funder share validation failed.", code: "FUNDER_SHARE_NOT_ALLOWED" });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/projects/:projectId/funder/report-shares/:shareId/revoke", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, shareId } = req.params;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 5) return res.status(400).json({ error: "A revocation reason of at least 5 characters is required." });
  if (!(await requireProjectPermission(req, res, projectId, "project.members.manage"))) return;
  try {
    const { rows } = await req.db.query(
      `UPDATE public.project_funder_report_shares
          SET revoked_at = now(), revoked_by = $3::uuid, revoke_reason = $4::text
        WHERE id = $1::uuid AND project_id = $2::uuid AND revoked_at IS NULL
        RETURNING id, revoked_at, revoked_by, revoke_reason`,
      [shareId, projectId, req.user?.id, reason],
    );
    if (rows.length !== 1) return res.status(404).json({ error: "Active Funder report share not found." });
    return res.json({ share: rows[0], revoked: true });
  } catch (error: any) {
    if (error?.code === "22P02") return res.status(400).json({ error: "Invalid share identifier." });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/reports/generate", requireAuth, async (req: express.Request, res: express.Response) => {
  const { templateId, projectId, cutoff } = req.body ?? {};
  if (!templateId) return res.status(400).json({ error: "templateId required" });
  if (!projectId) return res.status(400).json({ error: "projectId is required for report generation.", code: "PROJECT_ID_REQUIRED" });
  if (!(await requireProjectPermission(req, res, String(projectId), "reports.create"))) return;
  try {
    const templateVersion = reportTemplatesStore.find((t: any) => t.id === templateId)?.version || 1;
    const cutoffAt = cutoff || new Date().toISOString();
    const { rows } = await req.db.query(
      `INSERT INTO report_runs (id, schedule_id, template_id, template_version, cutoff_at, generated_at, requested_by, audience, project_id, status, idempotency_key, data_freshness)
       VALUES (gen_random_uuid(), NULL, $1, $2, $3::timestamptz, now(), $4::uuid, 'internal', $5::uuid, 'queued', NULL, now())
       RETURNING *`,
      [templateId, templateVersion, cutoffAt, req.user?.id || null, projectId || null],
    );
    const r = rows[0];
    res.status(201).json({
      reportRun: {
        id: r.id,
        templateId: r.template_id,
        templateVersion: r.template_version,
        cutoff: r.cutoff_at,
        projectId: r.project_id,
        status: r.status,
        requestedBy: r.requested_by,
        generatedAt: r.generated_at,
        dataFreshness: r.data_freshness,
        fileReference: r.file_reference,
      },
    });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/notifications", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.id;
    const { rows } = await req.db.query(
      `SELECT id, event_id, project_id, work_item_id, recipient_user_id, created_by, title, message, priority, category, read_at, created_at
         FROM user_notifications
        WHERE recipient_user_id = $1::uuid
        ORDER BY created_at DESC`,
      [userId],
    );
    const notifications = rows.map((r: any) => ({
      id: r.id,
      eventId: r.event_id,
      projectId: r.project_id,
      workItemId: r.work_item_id,
      recipient: r.recipient_user_id,
      createdBy: r.created_by,
      title: r.title,
      message: r.message,
      priority: r.priority,
      category: r.category,
      createdAt: r.created_at,
      readAt: r.read_at,
      deliveryStatus: "delivered",
      retryCount: 0,
      templateVersion: 1,
    }));
    res.json({ notifications, unreadCount: notifications.filter((n: any) => !n.readAt).length });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/notifications", requireAuth, async (req: express.Request, res: express.Response) => {
  const { recipient, title, message, priority, category, projectId } = req.body ?? {};
  if (!title || !message) return res.status(400).json({ error: "title and message required" });
  const senderId = req.user?.id;
  if (!senderId) return res.status(401).json({ error: "Authenticated principal required" });
  try {
    const recipientId = typeof recipient === "string" && recipient ? recipient : senderId;
    let scopedProjectId: string | null = null;
    if (projectId) {
      if (typeof projectId !== "string") return res.status(400).json({ error: "Invalid projectId" });
      scopedProjectId = projectId;
      if (!(await requireProjectPermission(req, res, scopedProjectId, "project.members.manage"))) return;
      if (recipientId !== senderId) {
        const { rows: memberRows } = await req.db.query(
          `SELECT 1 FROM project_members WHERE project_id = $1::uuid AND user_id = $2::uuid AND is_active = true LIMIT 1`,
          [scopedProjectId, recipientId],
        );
        if (memberRows.length === 0) return res.status(403).json({ error: "Forbidden", code: "RECIPIENT_OUT_OF_SCOPE" });
      }
    } else if (recipientId !== senderId) {
      if (!req.user?.isAdmin) return res.status(403).json({ error: "Forbidden", code: "RECIPIENT_OUT_OF_SCOPE" });
    }
    const eventId = crypto.randomUUID();
    const { rows } = await req.db.query(
      `INSERT INTO user_notifications (id, event_id, project_id, recipient_user_id, created_by, title, message, priority, category, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, now())
       RETURNING *`,
      [eventId, scopedProjectId, recipientId, senderId, title, message, priority || "normal", category || "system"],
    );
    const r = rows[0];
    await req.db.query(
      `INSERT INTO notification_deliveries (id, notification_id, channel, status, attempt_count, created_at)
       VALUES (gen_random_uuid(), $1::uuid, 'in_app', 'delivered', 1, now())`,
      [r.id],
    );
    res.status(201).json({
      notification: {
        id: r.id, eventId: r.event_id, recipient: r.recipient_user_id, title: r.title, message: r.message,
        priority: r.priority, category: r.category, projectId: r.project_id, createdAt: r.created_at,
        readAt: r.read_at, deliveryStatus: "delivered", retryCount: 0, templateVersion: 1,
      },
    });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/notifications/:id/read", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      `UPDATE user_notifications SET read_at = now() WHERE id = $1::uuid AND recipient_user_id = $2::uuid RETURNING *`,
      [req.params.id, req.user?.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    const r = rows[0];
    res.json({ notification: { id: r.id, eventId: r.event_id, projectId: r.project_id, recipient: r.recipient_user_id, title: r.title, message: r.message, priority: r.priority, category: r.category, createdAt: r.created_at, readAt: r.read_at, deliveryStatus: "delivered" } });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/reports/export/projects", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT id, name, status, settlement_unit, target_quantity FROM projects WHERE is_active = true");
    const header = "id,name,status,settlement_unit,target_quantity";
    const body = rows.map((r: any) => [r.id, r.name, r.status, r.settlement_unit, r.target_quantity].map((v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=projects.csv");
    res.send(header + "\n" + body);
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});
// ============================================
// Sprint 02E Finalization — Backend KPI Authority
// ============================================

app.get("/api/v1/reports/kpis/operational", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { rows: tripRows } = await req.db.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'completed')::int AS completed FROM truck_trips");
    const { rows: receiptRows } = await req.db.query("SELECT COUNT(*)::int AS count FROM warehouse_receipts");
    const { rows: eventRows } = await req.db.query("SELECT COUNT(*)::int AS count FROM tracking_events");
    res.json({
      kpis: [
        { id: "trips_total", name: "Truck Trips Total", value: tripRows[0]?.total ?? 0, unit: "count", formula: "count(truck_trips)", source: "truck_trips", dataCutoff: new Date().toISOString() },
        { id: "trips_completed", name: "Truck Trips Completed", value: tripRows[0]?.completed ?? 0, unit: "count", formula: "count where status=completed", source: "truck_trips", dataCutoff: new Date().toISOString() },
        { id: "warehouse_receipts", name: "Warehouse Receipts", value: receiptRows[0]?.count ?? 0, unit: "count", formula: "count(warehouse_receipts)", source: "warehouse_receipts", dataCutoff: new Date().toISOString() },
        { id: "tracking_events", name: "Tracking Events", value: eventRows[0]?.count ?? 0, unit: "count", formula: "count(tracking_events)", source: "tracking_events", dataCutoff: new Date().toISOString() },
      ],
      dataFreshness: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/reports/kpis/financial", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { rows: rabRows } = await req.db.query("SELECT COALESCE(SUM(amount),0) AS budget FROM rab WHERE is_active = true");
    const { rows: fxRows } = await req.db.query("SELECT COUNT(*)::int AS count FROM fx_exposures");
    res.json({
      kpis: [
        { id: "approved_budget", name: "Approved Budget", value: rabRows[0]?.budget ?? 0, unit: "currency", formula: "sum(rab.amount)", source: "rab", currency: "IDR", dataCutoff: new Date().toISOString() },
        { id: "fx_exposure_count", name: "FX Exposure Records", value: fxRows[0]?.count ?? 0, unit: "count", formula: "count(fx_exposure)", source: "fx_exposure", dataCutoff: new Date().toISOString() },
      ],
      dataFreshness: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/reports/historical", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT COUNT(*)::int AS sample_size, MIN(created_at) AS period_start, MAX(created_at) AS period_end FROM truck_trips");
    const sampleSize = rows[0]?.sample_size ?? 0;
    res.json({
      datasets: [
        {
          id: "cost_per_mt",
          name: "Cost per MT",
          sampleSize,
          periodStart: rows[0]?.period_start ?? null,
          periodEnd: rows[0]?.period_end ?? null,
          sufficientData: sampleSize >= 5,
          note: sampleSize < 5 ? "insufficient historical data" : "ok",
        },
      ],
      dataFreshness: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// Durable scheduler endpoints (DB-backed via migration 016; in-memory fallback for runtime)

app.get("/api/v1/reports/schedules", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const projectId = typeof req.query.projectId === "string" && req.query.projectId ? req.query.projectId : null;
    let rows: any[];
    if (projectId) {
      if (!(await requireProjectPermission(req, res, projectId, "reports.view"))) return;
      ({ rows } = await req.db.query(
        "SELECT * FROM report_schedules WHERE project_id = $1::uuid ORDER BY created_at DESC",
        [projectId],
      ));
    } else {
      ({ rows } = await req.db.query(
        `SELECT rs.* FROM report_schedules rs WHERE rs.project_id IN (
          SELECT a.project_id FROM project_role_assignments a
          JOIN project_members pm ON pm.id=a.project_member_id AND pm.project_id=a.project_id AND pm.user_id=a.user_id
          JOIN project_roles pr ON pr.id=a.project_role_id AND pr.project_id=a.project_id AND pr.is_active=true
          JOIN project_role_permissions prp ON prp.project_role_id=pr.id AND prp.project_id=pr.project_id
          JOIN permissions perm ON perm.id=prp.permission_id AND perm.is_active=true
          WHERE a.user_id=$1::uuid AND a.is_active=true AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at>now())
          AND pm.is_active=true AND pm.deactivated_at IS NULL AND (pm.expires_at IS NULL OR pm.expires_at>now())
          AND perm.code='reports.view' AND pr.role_code<>'funder'
        ) ORDER BY rs.created_at DESC`,[req.user?.id]));
    }
    const schedules = rows.map((r: any) => ({
      id: r.id,
      templateId: r.template_id,
      templateVersion: r.template_version,
      frequency: r.frequency,
      timezone: r.timezone,
      executionTime: r.execution_time,
      projectId: r.project_id,
      channel: r.channel,
      status: r.status,
      lastExecutionAt: r.last_execution_at,
      nextExecutionAt: r.next_execution_at,
      createdAt: r.created_at,
    }));
    res.json({ schedules });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/reports/schedules", requireAuth, async (req: express.Request, res: express.Response) => {
  const { templateId, frequency, timezone, executionTime, projectId, channel } = req.body ?? {};
  if (!templateId || !frequency) return res.status(400).json({ error: "templateId and frequency required" });
  const tz = typeof timezone === "string" && timezone ? timezone : "Asia/Jakarta";
  const execTime = typeof executionTime === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(executionTime) ? executionTime : "06:00:00";
  const freq = String(frequency).toLowerCase();
  const allowedFreq = new Set(["daily", "weekly", "monthly"]);
  if (!allowedFreq.has(freq)) return res.status(400).json({ error: "Unsupported frequency. Allowed: daily, weekly, monthly" });
  if (!projectId) return res.status(400).json({ error: "projectId is required for report scheduling.", code: "PROJECT_ID_REQUIRED" });
  if (!(await requireProjectPermission(req, res, String(projectId), "reports.create"))) return;
  try {
    // Best-effort next execution: compute in UTC anchored to provided execution time; timezone stored for display/consistency.
    // Full timezone-aware recurrence requires calendar-aware scheduling; current implementation advances by frequency interval.
    const base = new Date();
    const [hh, mm, ss] = (execTime.length === 5 ? `${execTime}:00` : execTime).split(":").map((n) => Number(n));
    const next = new Date(base);
    next.setUTCHours(Number.isFinite(hh) ? hh : 6, Number.isFinite(mm) ? mm : 0, Number.isFinite(ss) ? ss : 0, 0);
    if (next <= base) {
      if (freq === "daily") next.setUTCDate(next.getUTCDate() + 1);
      else if (freq === "weekly") next.setUTCDate(next.getUTCDate() + 7);
      else next.setUTCMonth(next.getUTCMonth() + 1);
    }
    const nextExecutionAt = next.toISOString();
    const { rows } = await req.db.query(
      `INSERT INTO report_schedules (id, template_id, template_version, audience, recipient_user_id, project_id, frequency, timezone, execution_time, cutoff_policy, channel, approval_required, status, next_execution_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 1, 'internal', $2::uuid, $3::uuid, $4, $5, $6::time, 'latest', $7, false, 'active', $8::timestamptz, now(), now())
       RETURNING *`,
      [templateId, req.user?.id || null, projectId || null, freq, tz, execTime, channel || "in_app", nextExecutionAt],
    );
    const r = rows[0];
    res.status(201).json({
      schedule: {
        id: r.id, templateId: r.template_id, templateVersion: r.template_version, frequency: r.frequency,
        timezone: r.timezone, executionTime: r.execution_time, projectId: r.project_id, channel: r.channel,
        status: r.status, lastExecutionAt: r.last_execution_at, nextExecutionAt: r.next_execution_at, createdAt: r.created_at,
      },
    });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/reports/scheduler/run-due", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const now = new Date();
    const { rows: schedules } = await req.db.query(
      `SELECT * FROM report_schedules WHERE status = 'active' AND next_execution_at <= $1 ORDER BY next_execution_at ASC LIMIT 50`,
      [now],
    );
    const executed: any[] = [];
    for (const s of schedules) {
      const dueAt = s.next_execution_at ? new Date(s.next_execution_at).toISOString() : now.toISOString();
      const idempotencyKey = `${s.id}:${dueAt}`;
      const freq = String(s.frequency || "daily").toLowerCase();
      const interval = freq === "weekly" ? "7 days" : freq === "monthly" ? "1 month" : "1 day";
      const { rows } = await req.db.query(
        `WITH due AS (
           UPDATE report_schedules
              SET last_execution_at = $2::timestamptz,
                  next_execution_at = ($3::timestamptz + $4::interval),
                  updated_at = now()
            WHERE id = $1::uuid AND status = 'active' AND next_execution_at <= $2::timestamptz
            RETURNING id, template_id, template_version, audience, project_id, next_execution_at
         ), ins AS (
           INSERT INTO report_runs (id, schedule_id, template_id, template_version, cutoff_at, generated_at, requested_by, audience, project_id, status, idempotency_key, data_freshness)
           SELECT gen_random_uuid(), due.id, due.template_id, due.template_version, $3::timestamptz, now(), $5::uuid, due.audience, due.project_id, 'queued', $6, now()
             FROM due
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING id, schedule_id, template_id, status, generated_at, idempotency_key
         )
         SELECT * FROM ins`,
        [s.id, now.toISOString(), dueAt, interval, req.user?.id || null, idempotencyKey],
      );
      if (rows[0]) executed.push({ id: rows[0].id, scheduleId: rows[0].schedule_id, templateId: rows[0].template_id, status: rows[0].status, generatedAt: rows[0].generated_at, idempotencyKey: rows[0].idempotency_key });
    }
    res.json({ executedCount: executed.length, executed, note: "Runs created as queued. No file is marked completed without verified storage artifact." });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/reports/scheduler/runs", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM report_runs WHERE schedule_id IS NOT NULL ORDER BY generated_at DESC LIMIT 200");
    res.json({ runs: rows.map((r: any) => ({ id: r.id, scheduleId: r.schedule_id, templateId: r.template_id, templateVersion: r.template_version, cutoff: r.cutoff_at, status: r.status, generatedAt: r.generated_at, idempotencyKey: r.idempotency_key, dataFreshness: r.data_freshness })) });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// Provider status
app.get("/api/v1/notifications/providers", requireAuth, async (req: express.Request, res: express.Response) => {
  res.json({
    email: "not_configured",
    sms: "not_configured",
    whatsapp: "not_configured",
    inApp: "configured",
  });
});

// Export audit
app.post("/api/v1/reports/export/audit", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  res.status(201).json({ status: "recorded", timestamp: new Date().toISOString() });
});

// ============================================
// Project edit
// ============================================
app.patch("/api/v1/projects/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { rows: projRows } = await req.db.query("SELECT * FROM projects WHERE id = $1::uuid", [id]);
  if (projRows.length === 0) return res.status(404).json({ error: "Project not found" });
  const { rows: permRows } = await req.db.query(
    "SELECT public.pke_has_project_permission($1::uuid, $2::text) AS has_perm, public.pke_is_platform_admin() AS is_admin",
    [id, 'project.configuration.manage']
  );
  if (!permRows[0]?.has_perm && !permRows[0]?.is_admin) {
    return res.status(403).json({ error: "Forbidden", code: "PROJECT_PERMISSION_REQUIRED" });
  }
  const { name, description, status, settlementUnit, targetQuantity, exportCountryCode, isActive } = req.body;
  try {
    const { rows } = await req.db.query(
      `UPDATE projects
        SET name = COALESCE($2::text, name),
            description = COALESCE($3::text, description),
            status = COALESCE($4::text, status),
            settlement_unit = COALESCE($5::text, settlement_unit),
            target_quantity = COALESCE($6::numeric, target_quantity),
            export_country_code = COALESCE($7::text, export_country_code),
            is_active = COALESCE($8::boolean, is_active),
            updated_at = now()
       WHERE id = $1::uuid
       RETURNING *`,
      [id, name || null, description || null, status || null, settlementUnit || null, targetQuantity || null, exportCountryCode || null, isActive !== undefined ? isActive : null]
    );
    res.json({ project: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// ============================================
// Project archive
// ============================================
app.post("/api/v1/projects/:id/archive", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { rows: projRows } = await req.db.query("SELECT * FROM projects WHERE id = $1::uuid", [id]);
  if (projRows.length === 0) return res.status(404).json({ error: "Project not found" });
  const { rows: permRows } = await req.db.query(
    "SELECT public.pke_has_project_permission($1::uuid, $2::text) AS has_perm, public.pke_is_platform_admin() AS is_admin",
    [id, 'project.configuration.manage']
  );
  if (!permRows[0]?.has_perm && !permRows[0]?.is_admin) {
    return res.status(403).json({ error: "Forbidden", code: "PROJECT_PERMISSION_REQUIRED" });
  }
  try {
    await req.db.query("UPDATE projects SET is_active = false, status = 'closed', updated_at = now() WHERE id = $1::uuid", [id]);
    res.json({ ok: true, message: "Project archived" });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// ============================================
// Project activate / deactivate
// ============================================
app.post("/api/v1/projects/:id/activate", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { rows: projRows } = await req.db.query("SELECT * FROM projects WHERE id = $1::uuid", [id]);
  if (projRows.length === 0) return res.status(404).json({ error: "Project not found" });
  const { rows: permRows } = await req.db.query(
    "SELECT public.pke_has_project_permission($1::uuid, $2::text) AS has_perm, public.pke_is_platform_admin() AS is_admin",
    [id, 'project.configuration.manage']
  );
  if (!permRows[0]?.has_perm && !permRows[0]?.is_admin) {
    return res.status(403).json({ error: "Forbidden", code: "PROJECT_PERMISSION_REQUIRED" });
  }
  const { rows: profileRows } = await req.db.query(
    "SELECT configuration FROM project_operating_profiles WHERE project_id = $1::uuid",
    [id]
  );
  if (profileRows.length === 0) {
    return res.status(400).json({ error: "Module configuration is required before activation", code: "MODULE_CONFIG_REQUIRED" });
  }
  try {
    await req.db.query("UPDATE projects SET status = 'active', is_active = true, updated_at = now() WHERE id = $1::uuid", [id]);
    res.json({ ok: true, message: "Project activated" });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/projects/:id/deactivate", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { rows: projRows } = await req.db.query("SELECT * FROM projects WHERE id = $1::uuid", [id]);
  if (projRows.length === 0) return res.status(404).json({ error: "Project not found" });
  const { rows: permRows } = await req.db.query(
    "SELECT public.pke_has_project_permission($1::uuid, $2::text) AS has_perm, public.pke_is_platform_admin() AS is_admin",
    [id, 'project.configuration.manage']
  );
  if (!permRows[0]?.has_perm && !permRows[0]?.is_admin) {
    return res.status(403).json({ error: "Forbidden", code: "PROJECT_PERMISSION_REQUIRED" });
  }
  try {
    await req.db.query("UPDATE projects SET status = 'draft', is_active = false, updated_at = now() WHERE id = $1::uuid", [id]);
    res.json({ ok: true, message: "Project deactivated" });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// ============================================
// Project detail (full): members, roles, permissions, module config
// ============================================
app.get("/api/v1/projects/:id/detail", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  if (!(await requireProjectPermission(req, res, id, "project.view"))) return;
  const { rows: projRows } = await req.db.query("SELECT * FROM projects WHERE id = $1::uuid", [id]);
  if (projRows.length === 0) return res.status(404).json({ error: "Project not found" });
  const { rows: memberAccess } = await req.db.query(
    "SELECT public.pke_has_project_permission($1::uuid, 'project.members.view') AS allowed",
    [id],
  );
  const { rows: roleAccess } = await req.db.query(
    "SELECT public.pke_has_project_permission($1::uuid, 'project.roles.manage') AS allowed",
    [id],
  );
  const { rows: operationsAccess } = await req.db.query(
    "SELECT public.pke_has_project_permission($1::uuid, 'operations.view') AS allowed",
    [id],
  );
  const members = memberAccess[0]?.allowed ? (await req.db.query(
    `SELECT pm.id, pm.user_id, u.email, u.name,
            pm.is_active, pm.joined_at, pm.expires_at,
            coalesce(assignments.roles, '[]'::jsonb) AS role_assignments
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
           'id', a.id, 'projectRoleId', a.project_role_id,
           'roleCode', pr.role_code, 'roleName', pr.name,
           'isActive', a.is_active, 'expiresAt', a.expires_at, 'revokedAt', a.revoked_at
         ) ORDER BY pr.role_code) AS roles
           FROM public.project_role_assignments a
           JOIN public.project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
          WHERE a.project_member_id = pm.id
       ) assignments ON true
      WHERE pm.project_id = $1::uuid
      ORDER BY u.email`,
    [id]
  )).rows : [];
  const roles = roleAccess[0]?.allowed ? (await req.db.query(
    `SELECT pr.id, pr.role_code, pr.name, pr.description, pr.is_active,
            (SELECT jsonb_agg(perm.code) FROM project_role_permissions prp
             JOIN permissions perm ON perm.id = prp.permission_id
             WHERE prp.project_role_id = pr.id AND perm.is_active = true) AS permissions
       FROM project_roles pr
      WHERE pr.project_id = $1::uuid
      ORDER BY pr.role_code`,
    [id]
  )).rows : [];
  const { rows: profile } = operationsAccess[0]?.allowed
    ? await req.db.query("SELECT * FROM project_operating_profiles WHERE project_id = $1::uuid", [id])
    : { rows: [] };
  const { rows: readiness } = roleAccess[0]?.allowed
    ? await req.db.query("SELECT * FROM project_module_readiness WHERE project_id = $1::uuid", [id])
    : { rows: [] };
  res.json({
    project: projRows[0],
    members,
    roles,
    operatingProfile: profile[0] || null,
    moduleReadiness: readiness
  });
});

// ============================================
// Project roles (RBAC builder)
// ============================================
app.get("/api/v1/projects/:id/roles", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const allowed = await requireProjectPermission(req, res, id, 'project.roles.manage');
  if (!allowed) return;
  const { rows } = await req.db.query(
    `SELECT pr.id, pr.role_code, pr.name, pr.description, pr.is_active, pr.created_at
       FROM project_roles pr
      WHERE pr.project_id = $1::uuid
      ORDER BY pr.role_code`,
    [id]
  );
  res.json({ roles: rows });
});

app.post("/api/v1/projects/:id/roles", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const allowed = await requireProjectPermission(req, res, id, 'project.roles.manage');
  if (!allowed) return;
  const { roleCode, name, description, templateRoleCode } = req.body;
  if (!roleCode || !name) {
    return res.status(400).json({ error: "Required fields: roleCode, name" });
  }
  const canonicalTemplate = getCanonicalRoleTemplate(String(roleCode));
  if (!canonicalTemplate || canonicalTemplate.scope !== "project" ||
      (templateRoleCode && templateRoleCode !== roleCode)) {
    return res.status(400).json({ error: "Only centrally governed Project role templates may be activated.", code: "NON_CANONICAL_ROLE_TEMPLATE" });
  }
  const userId = req.user?.id;
  try {
    const { rows: permRows } = await req.db.query(
      "SELECT id, code FROM permissions WHERE code = ANY($1::text[]) AND is_active = true",
      [canonicalTemplate.permissionCodes],
    );
    const foundCodes = new Set(permRows.map((row: any) => row.code));
    const missingCodes = canonicalTemplate.permissionCodes.filter((code) => !foundCodes.has(code));
    if (missingCodes.length > 0) {
      return res.status(503).json({ error: "Canonical role permissions are not fully provisioned.", code: "ROLE_TEMPLATE_PERMISSION_CATALOG_INCOMPLETE", missingPermissionCodes: missingCodes });
    }
    const { rows: roleRows } = await req.db.query(
      `INSERT INTO project_roles (project_id, role_code, name, description, is_active, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::text, $3::text, $4::text, true, $5::uuid, now(), now())
       ON CONFLICT (project_id, role_code) DO UPDATE SET is_active = true, updated_at = now()
       RETURNING id`,
      [id, canonicalTemplate.code, canonicalTemplate.label, canonicalTemplate.restrictions.join(" "), userId]
    );
    const projectRoleId = roleRows[0].id;
    await req.db.query(
      `INSERT INTO project_role_permissions (project_id, project_role_id, permission_id, granted_by, granted_at)
       SELECT $1::uuid, $2::uuid, p.id, $3::uuid, now()
         FROM permissions p
        WHERE p.code = ANY($4::text[]) AND p.is_active = true
       ON CONFLICT (project_role_id, permission_id) DO NOTHING`,
      [id, projectRoleId, userId, canonicalTemplate.permissionCodes],
    );
    res.status(200).json({ role: { id: projectRoleId, roleCode: canonicalTemplate.code, name: canonicalTemplate.label, description: canonicalTemplate.restrictions.join(" ") }, activated: true, assignedUsers: 0 });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/projects/:id/roles/:roleId", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id, roleId } = req.params;
  const allowed = await requireProjectPermission(req, res, id, 'project.roles.manage');
  if (!allowed) return;
  const { name, description, isActive } = req.body;
  try {
    const { rows } = await req.db.query(
      `UPDATE project_roles
        SET name = COALESCE($3::text, name),
            description = COALESCE($4::text, description),
            is_active = COALESCE($5::boolean, is_active),
            updated_at = now()
       WHERE id = $2::uuid AND project_id = $1::uuid
       RETURNING *`,
      [id, roleId, name || null, description || null, isActive !== undefined ? isActive : null]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Role not found" });
    res.json({ role: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.delete("/api/v1/projects/:id/roles/:roleId", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id, roleId } = req.params;
  const allowed = await requireProjectPermission(req, res, id, 'project.roles.manage');
  if (!allowed) return;
  try {
    const { rows } = await req.db.query(
      "DELETE FROM project_roles WHERE id = $2::uuid AND project_id = $1::uuid RETURNING id",
      [id, roleId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Role not found" });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/projects/:id/roles/:roleId/permissions", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id, roleId } = req.params;
  const allowed = await requireProjectPermission(req, res, id, 'project.roles.manage');
  if (!allowed) return;
  const { rows } = await req.db.query(
    `SELECT perm.code, perm.name, perm.description
       FROM project_role_permissions prp
       JOIN permissions perm ON perm.id = prp.permission_id
      WHERE prp.project_role_id = $2::uuid AND prp.project_id = $1::uuid AND perm.is_active = true
      ORDER BY perm.code`,
    [id, roleId]
  );
  res.json({ permissions: rows });
});

app.put("/api/v1/projects/:id/roles/:roleId/permissions", requireAuth, async (_req: express.Request, res: express.Response) => {
  return res.status(409).json({
    error: "Project role permission templates are centrally governed and cannot be edited per Project.",
    code: "ROLE_PERMISSION_TEMPLATES_IMMUTABLE",
  });
});

// ============================================
// Project members
// ============================================
app.get("/api/v1/projects/:id/members", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const allowed = await requireProjectPermission(req, res, id, 'project.members.view');
  if (!allowed) return;
  const { rows } = await req.db.query(
    `SELECT pm.id, pm.user_id, u.email, u.name,
            pm.is_active, pm.joined_at, pm.expires_at, pm.deactivated_at,
            coalesce(assignments.roles, '[]'::jsonb) AS role_assignments
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
           'id', a.id, 'projectRoleId', a.project_role_id,
           'roleCode', pr.role_code, 'roleName', pr.name,
           'isActive', a.is_active, 'assignedAt', a.assigned_at,
           'expiresAt', a.expires_at, 'revokedAt', a.revoked_at
         ) ORDER BY pr.role_code) AS roles
           FROM public.project_role_assignments a
           JOIN public.project_roles pr
             ON pr.id = a.project_role_id AND pr.project_id = a.project_id
          WHERE a.project_member_id = pm.id
       ) assignments ON true
      WHERE pm.project_id = $1::uuid
      ORDER BY u.email`,
    [id]
  );
  res.json({ members: rows });
});

// Independent role assignments: membership is the Project access container;
// each Project role has its own expiry and revocation history.
app.post("/api/v1/projects/:id/members/:memberId/role-assignments", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id, memberId } = req.params;
  if (!(await requireProjectPermission(req, res, id, "project.members.manage"))) return;
  const projectRoleId = typeof req.body?.projectRoleId === "string" ? req.body.projectRoleId : "";
  const expiresAt = req.body?.expiresAt ?? null;
  if (!projectRoleId || !validateRoleAssignmentExpiry(expiresAt).ok) {
    return res.status(400).json({ error: "Valid projectRoleId and optional expiresAt are required.", code: "INVALID_ROLE_ASSIGNMENT" });
  }
  try {
    const { rows: roleRows } = await req.db.query(
      "SELECT id, role_code FROM public.project_roles WHERE id = $2::uuid AND project_id = $1::uuid AND is_active = true",
      [id, projectRoleId],
    );
    if (roleRows.length !== 1) return res.status(400).json({ error: "Project role is invalid or inactive.", code: "INVALID_PROJECT_ROLE" });
    if (roleRows[0].role_code === "pm") return res.status(403).json({ error: "PM assignment is an Admin-only decision; use the dedicated appointment workflow.", code: "PM_ADMIN_DECISION_REQUIRED" });
    await req.db.query(
      `UPDATE public.project_role_assignments
          SET is_active = false, updated_at = now()
        WHERE project_id = $1::uuid AND project_member_id = $2::uuid
          AND project_role_id = $3::uuid AND is_active = true
          AND revoked_at IS NULL AND expires_at IS NOT NULL AND expires_at <= now()`,
      [id, memberId, projectRoleId],
    );
    const { rows } = await req.db.query(
      `INSERT INTO public.project_role_assignments
         (project_id, project_member_id, user_id, project_role_id, is_active, assigned_at, assigned_by, expires_at)
       SELECT pm.project_id, pm.id, pm.user_id, pr.id, true, now(), $4::uuid, $5::timestamptz
         FROM public.project_members pm
         JOIN public.project_roles pr ON pr.project_id = pm.project_id AND pr.id = $3::uuid AND pr.is_active = true
        WHERE pm.project_id = $1::uuid AND pm.id = $2::uuid
          AND pm.is_active = true AND pm.deactivated_at IS NULL
          AND (pm.expires_at IS NULL OR pm.expires_at > now())
       RETURNING *`,
      [id, memberId, projectRoleId, req.user?.id ?? null, expiresAt],
    );
    if (rows.length !== 1) return res.status(409).json({ error: "Active Project membership or role not found.", code: "ROLE_ASSIGNMENT_CONTEXT_INVALID" });
    return res.status(201).json({ assignment: rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "This role is already assigned to this member.", code: "ROLE_ASSIGNMENT_EXISTS" });
    if (error?.code === "23514") return res.status(409).json({ error: "Role assignment violates Project membership or role constraints.", code: "ROLE_ASSIGNMENT_REJECTED" });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/projects/:id/role-assignments/:assignmentId/revoke", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id, assignmentId } = req.params;
  if (!(await requireProjectPermission(req, res, id, "project.members.manage"))) return;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 5) return res.status(400).json({ error: "A revocation reason of at least 5 characters is required.", code: "AUDIT_REASON_REQUIRED" });
  try {
    const { rows: targetRows } = await req.db.query(
      `SELECT pr.role_code
         FROM public.project_role_assignments a
         JOIN public.project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
        WHERE a.id = $2::uuid AND a.project_id = $1::uuid AND a.revoked_at IS NULL
        FOR UPDATE OF a`,
      [id, assignmentId],
    );
    if (targetRows.length !== 1) return res.status(404).json({ error: "Active role assignment not found.", code: "ROLE_ASSIGNMENT_NOT_FOUND" });
    if (targetRows[0].role_code === "pm") return res.status(403).json({ error: "PM deactivation is an Admin-only decision; use the dedicated Admin PM workflow.", code: "PM_ADMIN_DECISION_REQUIRED" });
    const { rows } = await req.db.query(
      `UPDATE public.project_role_assignments
          SET is_active = false, revoked_at = now(), revoked_by = $3::uuid,
              revoke_reason = $4::text, updated_at = now()
        WHERE id = $2::uuid AND project_id = $1::uuid
          AND revoked_at IS NULL
        RETURNING *`,
      [id, assignmentId, req.user?.id ?? null, reason],
    );
    if (rows.length !== 1) return res.status(404).json({ error: "Active role assignment not found.", code: "ROLE_ASSIGNMENT_NOT_FOUND" });
    return res.json({ ok: true, assignment: rows[0] });
  } catch (error: any) {
    if (error?.code === "23514") return res.status(409).json({ error: "Role assignment revocation was rejected.", code: "ROLE_ASSIGNMENT_REJECTED" });
    return res.status(500).json(internalServerErrorPayload());
  }
});


app.post("/api/v1/projects/:id/members/invite", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const allowed = await requireProjectPermission(req, res, id, 'project.members.invite');
  if (!allowed) return;
  const { invitationEmail, displayName, projectRoleId, expiresAt } = req.body;
  if (!invitationEmail || !projectRoleId) {
    return res.status(400).json({ error: "Required fields: invitationEmail, projectRoleId" });
  }
  const userId = req.user?.id;
  const { rows: roleRows } = await req.db.query(
    "SELECT id, role_code FROM project_roles WHERE id = $2::uuid AND project_id = $1::uuid AND is_active = true",
    [id, projectRoleId]
  );
  if (roleRows.length === 0) {
    return res.status(400).json({ error: "Invalid project role" });
  }
  if (roleRows[0].role_code === "pm") {
    return res.status(403).json({ error: "PM appointments cannot be issued as invitations; use the explicit Admin PM appointment workflow.", code: "PM_ADMIN_DECISION_REQUIRED" });
  }
  const crypto = await import("node:crypto");
  const tokenHash = crypto.createHash("sha256").update(`${invitationEmail}:${id}:${Date.now()}:${crypto.randomBytes(16).toString("hex")}`).digest("hex");
  const expires = expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { rows } = await req.db.query(
      `INSERT INTO project_invitations
        (project_id, project_role_id, invitation_email, display_name, token_hash, status,
         invited_by, invited_at, expires_at, created_at)
       VALUES ($1::uuid, $2::uuid, $3::text, $4::text, $5::text, 'pending', $6::uuid, now(), $7::timestamptz, now())
       RETURNING id, invitation_email, status, expires_at`,
      [id, projectRoleId, invitationEmail, displayName || null, tokenHash, userId, expires]
    );
    res.status(201).json({ invitation: rows[0], tokenHash });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/projects/:id/members/:memberId", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id, memberId } = req.params;
  const allowed = await requireProjectPermission(req, res, id, 'project.members.manage');
  if (!allowed) return;

  const body = req.body ?? {};
  const { projectRoleId, isActive, expiresAt } = body;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (isActive !== undefined && typeof isActive !== "boolean") {
    return res.status(400).json({ error: "isActive must be a boolean.", code: "INVALID_MEMBERSHIP_STATUS" });
  }
  if (projectRoleId !== undefined && (typeof projectRoleId !== "string" || !projectRoleId.trim())) {
    return res.status(400).json({ error: "projectRoleId must be a non-empty project role ID.", code: "INVALID_PROJECT_ROLE" });
  }
  if (expiresAt !== undefined && expiresAt !== null && (typeof expiresAt !== "string" || Number.isNaN(Date.parse(expiresAt)))) {
    return res.status(400).json({ error: "expiresAt must be a valid timestamp or null.", code: "INVALID_MEMBERSHIP_EXPIRY" });
  }
  const sensitiveChange = isActive !== undefined || expiresAt !== undefined;
  if (sensitiveChange && reason.length < 3) {
    return res.status(400).json({ error: "A reason of at least 3 characters is required for membership status changes.", code: "AUDIT_REASON_REQUIRED" });
  }

  try {
    const { rows: beforeRows } = await req.db.query(
      `SELECT pm.*, pr.role_code, pr.name AS role_name
         FROM project_members pm
         LEFT JOIN project_roles pr ON pr.id = pm.project_role_id AND pr.project_id = pm.project_id
        WHERE pm.id = $2::uuid AND pm.project_id = $1::uuid
        FOR UPDATE OF pm`,
      [id, memberId],
    );
    if (beforeRows.length === 0) return res.status(404).json({ error: "Member not found.", code: "MEMBER_NOT_FOUND" });
    const before = beforeRows[0];

    if (projectRoleId !== undefined) {
      return res.status(409).json({
        error: "Project membership is independent of role assignments. Use the dedicated role-assignment endpoint; membership PATCH cannot add, replace, or remove roles.",
        code: "USE_ROLE_ASSIGNMENT_ENDPOINT",
      });
    }

    const nextActive = isActive === undefined ? before.is_active === true : isActive;
    const nextExpiresAt = expiresAt === undefined ? before.expires_at : expiresAt;
    const { rows } = await req.db.query(
      `UPDATE project_members
          SET is_active = $3::boolean,
              expires_at = $4::timestamptz,
              deactivated_at = CASE WHEN $3::boolean THEN NULL ELSE COALESCE(deactivated_at, now()) END,
              deactivated_by = CASE WHEN $3::boolean THEN NULL ELSE COALESCE(deactivated_by, $5::uuid) END,
              updated_at = now()
        WHERE id = $2::uuid AND project_id = $1::uuid
        RETURNING *`,
      [id, memberId, nextActive, nextExpiresAt ?? null, req.user?.id ?? null],
    );
    const after = rows[0];
    const action = isActive === false
      ? "project_member.deactivated"
      : isActive === true && (before.is_active !== true || before.deactivated_at != null)
        ? "project_member.reactivated"
        : "project_member.updated";
    await req.db.query(
      `INSERT INTO audit_events
        (actor_user_id, actor_type, actor_role, action, target_type, target_id, project_id,
         reason, before_snapshot, after_snapshot, metadata, outcome)
       VALUES ($1::uuid, 'user', $2::text, $3::text, 'project_member', $4::uuid, $5::uuid,
               $6::text, $7::jsonb, $8::jsonb, $9::jsonb, 'success')`,
      [
        req.user?.id ?? null,
        req.user?.role ?? null,
        action,
        after.id,
        id,
        reason || null,
        JSON.stringify({ user_id: before.user_id, project_role_id: before.project_role_id, is_active: before.is_active, expires_at: before.expires_at, deactivated_at: before.deactivated_at }),
        JSON.stringify({ user_id: after.user_id, project_role_id: after.project_role_id, is_active: after.is_active, expires_at: after.expires_at, deactivated_at: after.deactivated_at }),
        JSON.stringify({ changed_fields: Object.keys(body).filter((key) => ["projectRoleId", "isActive", "expiresAt"].includes(key)) }),
      ],
    );
    res.json({ member: after });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/projects/:id/members/:memberId/revoke", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id, memberId } = req.params;
  const allowed = await requireProjectPermission(req, res, id, 'project.members.manage');
  if (!allowed) return;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 3) return res.status(400).json({ error: "A deactivation reason of at least 3 characters is required.", code: "AUDIT_REASON_REQUIRED" });
  try {
    const { rows: beforeRows } = await req.db.query(
      "SELECT * FROM project_members WHERE id = $2::uuid AND project_id = $1::uuid FOR UPDATE",
      [id, memberId],
    );
    if (beforeRows.length === 0) return res.status(404).json({ error: "Member not found.", code: "MEMBER_NOT_FOUND" });
    const before = beforeRows[0];
    const { rows } = await req.db.query(
      `UPDATE project_members
          SET is_active = false,
              deactivated_at = COALESCE(deactivated_at, now()),
              deactivated_by = COALESCE(deactivated_by, $3::uuid),
              updated_at = now()
        WHERE id = $2::uuid AND project_id = $1::uuid
        RETURNING *`,
      [id, memberId, req.user?.id ?? null],
    );
    const after = rows[0];
    await req.db.query(
      `INSERT INTO audit_events
        (actor_user_id, actor_type, actor_role, action, target_type, target_id, project_id,
         reason, before_snapshot, after_snapshot, outcome)
       VALUES ($1::uuid, 'user', $2::text, 'project_member.deactivated', 'project_member', $3::uuid,
               $4::uuid, $5::text, $6::jsonb, $7::jsonb, 'success')`,
      [
        req.user?.id ?? null, req.user?.role ?? null, after.id, id, reason,
        JSON.stringify({ user_id: before.user_id, project_role_id: before.project_role_id, is_active: before.is_active }),
        JSON.stringify({ user_id: after.user_id, project_role_id: after.project_role_id, is_active: after.is_active, deactivated_at: after.deactivated_at, deactivated_by: after.deactivated_by }),
      ],
    );
    res.json({ ok: true, member: after });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// ============================================
// Module readiness
// ============================================
app.get("/api/v1/projects/:id/module-readiness", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  if (!(await requireProjectPermission(req, res, id, "project.view"))) return;
  const { rows } = await req.db.query("SELECT * FROM project_module_readiness WHERE project_id = $1::uuid ORDER BY module_name", [id]);
  res.json({ readiness: rows });
});

// ============================================
// ============================================
// Operational workflow routes (P06)
// ============================================
app.get("/api/v1/truck-trips", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "logistics.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM truck_trips WHERE project_id=$1::uuid ORDER BY created_at DESC LIMIT 100", [projectId]);
    return res.json({ truckTrips: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/truck-trips", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, transportLegId, licensePlate, driverName, pksSiteId, vehicleId, departureTime, arrivalTime } = req.body;
  if (!projectId || !transportLegId || !licensePlate) {
    return res.status(400).json({ error: "Required fields: projectId, transportLegId, licensePlate" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "record_truck_trips"))) return;
  try {
    // Validate that the transport leg exists and belongs to the same project
    const { rows: legRows } = await req.db.query(
      `SELECT id, project_id FROM transport_legs WHERE id = $1::uuid`,
      [transportLegId],
    );
    if (legRows.length === 0) {
      return res.status(400).json({ error: "Invalid transport leg: transport leg not found" });
    }
    if (legRows[0].project_id !== projectId) {
      return res.status(400).json({ error: "Invalid transport leg: transport leg does not belong to the specified project" });
    }
    const { rows } = await req.db.query(
      `INSERT INTO truck_trips (project_id, transport_leg_id, license_plate, driver_name, pks_site_id, vehicle_id, departure_time, arrival_time, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7::timestamptz, $8::timestamptz, 'scheduled', now(), now()) RETURNING *`,
      [projectId, transportLegId, licensePlate, driverName || null, pksSiteId || null, vehicleId || null, departureTime || null, arrivalTime || null],
    );
    res.status(201).json({ truckTrip: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create truck trip" });
  }
});

app.get("/api/v1/truck-trips/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM truck_trips WHERE id = $1::uuid", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Truck trip not found" });
    res.json({ truckTrip: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to load truck trip" });
  }
});

app.patch("/api/v1/truck-trips/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { status, driverName, departureTime, arrivalTime, pksSiteId, vehicleId } = req.body ?? {};
  const allowedStatuses = new Set(["scheduled", "in_transit", "arrived", "completed", "cancelled", "delayed"]);
  if (status !== undefined && (typeof status !== "string" || !allowedStatuses.has(status))) {
    return res.status(400).json({ error: "Invalid status" });
  }
  try {
    const { rows: scopeRows } = await req.db.query(
      "SELECT project_id FROM truck_trips WHERE id = $1::uuid",
      [req.params.id],
    );
    if (scopeRows.length === 0) return res.status(404).json({ error: "Truck trip not found." });
    if (!(await requireProjectPermission(req, res, scopeRows[0].project_id, "record_truck_trips"))) return;
    const { rows } = await req.db.query(
      `UPDATE truck_trips
          SET status = COALESCE($2, status),
              driver_name = COALESCE($3, driver_name),
              departure_time = COALESCE($4::timestamptz, departure_time),
              arrival_time = COALESCE($5::timestamptz, arrival_time),
              pks_site_id = COALESCE($6::uuid, pks_site_id),
              vehicle_id = COALESCE($7::uuid, vehicle_id),
              updated_at = now()
        WHERE id = $1::uuid RETURNING *`,
      [req.params.id, status ?? null, driverName ?? null, departureTime ?? null, arrivalTime ?? null, pksSiteId ?? null, vehicleId ?? null],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Truck trip not found" });
    res.json({ truckTrip: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to update truck trip" });
  }
});

// ============================================
// P16: Port network and warehouse master read surfaces.
// Writes remain disabled until the UAT RLS/maker-checker migration is applied.
// ============================================
const p16UuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

app.get("/api/v1/ports", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!p16UuidPattern.test(projectId)) return res.status(400).json({ error: "A valid projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "port.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT p.id,p.name,p.code,p.city,p.province,p.country_code,p.unlocode,p.national_code,
              p.authority_name,p.operator_name,p.source_reference,CASE WHEN p.verification_status='verified' AND (NULLIF(btrim(p.source_reference),'') IS NULL OR p.verified_at IS NULL OR (NULLIF(btrim(p.unlocode),'') IS NULL AND NULLIF(btrim(p.national_code),'') IS NULL AND NULLIF(btrim(p.code),'') IS NULL)) THEN 'unverified' ELSE p.verification_status END AS verification_status,p.verified_at,
              (SELECT count(*)::int FROM public.port_terminals t WHERE t.port_id=p.id) AS terminal_count,
              (SELECT count(*)::int FROM public.port_depth_observations d WHERE d.port_id=p.id) AS depth_observation_count
         FROM public.ports p
        WHERE p.is_active=true
        ORDER BY p.country_code,p.province,p.city,p.name
        LIMIT 250`,
    );
    return res.json({ ports: rows, canManage: false, projectId });
  } catch {
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/ports/:portId", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  const portId = String(req.params.portId || "");
  if (!p16UuidPattern.test(projectId) || !p16UuidPattern.test(portId)) return res.status(400).json({ error: "Valid projectId and portId are required." });
  if (!(await requireProjectPermission(req, res, projectId, "port.view"))) return;
  try {
    const { rows: ports } = await req.db.query("SELECT p.*,CASE WHEN p.verification_status='verified' AND (NULLIF(btrim(p.source_reference),'') IS NULL OR p.verified_at IS NULL OR (NULLIF(btrim(p.unlocode),'') IS NULL AND NULLIF(btrim(p.national_code),'') IS NULL AND NULLIF(btrim(p.code),'') IS NULL)) THEN 'unverified' ELSE p.verification_status END AS effective_verification_status FROM public.ports p WHERE p.id=$1::uuid AND p.is_active=true", [portId]);
    if (!ports.length) return res.status(404).json({ error: "Port not found." });
    const [terminals, berths, channels, anchorages, depths, tides, services, equipment, operatingLimits] = await Promise.all([
      req.db.query("SELECT * FROM public.port_terminals WHERE port_id=$1::uuid ORDER BY name", [portId]),
      req.db.query("SELECT b.*,t.name AS terminal_name FROM public.port_berths b JOIN public.port_terminals t ON t.id=b.terminal_id WHERE t.port_id=$1::uuid ORDER BY t.name,b.berth_code", [portId]),
      req.db.query("SELECT * FROM public.port_channels WHERE port_id=$1::uuid ORDER BY channel_name", [portId]),
      req.db.query("SELECT * FROM public.port_anchorages WHERE port_id=$1::uuid ORDER BY name NULLS LAST,anchorage_code", [portId]),
      req.db.query("SELECT * FROM public.port_depth_observations WHERE port_id=$1::uuid ORDER BY observed_at DESC LIMIT 100", [portId]),
      req.db.query("SELECT * FROM public.port_tide_observations WHERE port_id=$1::uuid ORDER BY observed_at DESC LIMIT 100", [portId]),
      req.db.query("SELECT * FROM public.port_loading_services WHERE port_id=$1::uuid ORDER BY service_type", [portId]),
      req.db.query("SELECT * FROM public.port_equipment WHERE port_id=$1::uuid ORDER BY equipment_type", [portId]),
      req.db.query("SELECT * FROM public.port_operating_limits WHERE port_id=$1::uuid ORDER BY effective_from DESC", [portId]),
    ]);
    return res.json({
      port: ports[0], terminals: terminals.rows, berths: berths.rows, channels: channels.rows,
      anchorages: anchorages.rows, depthObservations: depths.rows, tideObservations: tides.rows,
      loadingServices: services.rows, equipment: equipment.rows, operatingLimits: operatingLimits.rows,
      canManage: false, assessmentMode: "advisory_only",
    });
  } catch {
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/warehouses", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!p16UuidPattern.test(projectId)) return res.status(400).json({ error: "A valid projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "warehouse.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT w.id,w.code,w.name,w.location,w.port_id,w.terminal_id,w.operator_organization_id,
              w.latitude,w.longitude,w.storage_mode,w.storage_capacity_mt,w.floor_area_m2,w.usable_volume_m3,
              w.verification_status,w.verified_at,w.is_active,p.name AS port_name,t.name AS terminal_name,
              (SELECT count(*)::int FROM public.warehouse_zones z WHERE z.warehouse_id=w.id) AS zone_count,
              (SELECT count(*)::int FROM public.warehouse_equipment e WHERE e.warehouse_id=w.id) AS equipment_count
         FROM public.warehouses w
         LEFT JOIN public.ports p ON p.id=w.port_id
         LEFT JOIN public.port_terminals t ON t.id=w.terminal_id
        WHERE w.is_active=true
        ORDER BY p.name,w.name
        LIMIT 250`,
    );
    return res.json({ warehouses: rows, projectId, canManage: false });
  } catch {
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/warehouses/:warehouseId", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  const warehouseId = String(req.params.warehouseId || "");
  if (!p16UuidPattern.test(projectId) || !p16UuidPattern.test(warehouseId)) return res.status(400).json({ error: "Valid projectId and warehouseId are required." });
  if (!(await requireProjectPermission(req, res, projectId, "warehouse.view"))) return;
  try {
    const { rows: warehouses } = await req.db.query(
      "SELECT w.*,p.name AS port_name,t.name AS terminal_name FROM public.warehouses w LEFT JOIN public.ports p ON p.id=w.port_id LEFT JOIN public.port_terminals t ON t.id=w.terminal_id WHERE w.id=$1::uuid AND w.is_active=true",
      [warehouseId],
    );
    if (!warehouses.length) return res.status(404).json({ error: "Warehouse not found." });
    const [zones, equipment, reservations] = await Promise.all([
      req.db.query("SELECT * FROM public.warehouse_zones WHERE warehouse_id=$1::uuid ORDER BY zone_code", [warehouseId]),
      req.db.query("SELECT * FROM public.warehouse_equipment WHERE warehouse_id=$1::uuid ORDER BY equipment_type", [warehouseId]),
      req.db.query("SELECT * FROM public.warehouse_reservations WHERE warehouse_id=$1::uuid AND project_id=$2::uuid ORDER BY window_start DESC LIMIT 100", [warehouseId, projectId]),
    ]);
    const zoneIds = zones.rows.map((z: { id: string }) => z.id);
    const bins = zoneIds.length
      ? await req.db.query("SELECT * FROM public.warehouse_bins WHERE zone_id=ANY($1::uuid[]) ORDER BY bin_code", [zoneIds])
      : { rows: [] };
    return res.json({ warehouse: warehouses[0], zones: zones.rows, bins: bins.rows, equipment: equipment.rows, reservations: reservations.rows, projectId, canManage: false });
  } catch {
    return res.status(500).json(internalServerErrorPayload());
  }
});

// P16 governed writes: global master-data is Platform Admin-owned; Project roles submit evidence.
type P16Resource = { table: string; required: string[]; fields: string[] };
const P16_RESOURCES: Record<string,P16Resource> = {
 ports:{table:"ports",required:["name"],fields:["name","code","location","address","city","province","country_code","latitude","longitude","unlocode","national_code","authority_name","operator_name","source_reference","evidence_sha256","is_active"]},
 terminals:{table:"port_terminals",required:["port_id","terminal_code","name"],fields:["port_id","terminal_code","name","operator_organization_id","cargo_types","status","operating_restrictions","source_reference","evidence_sha256"]},
 berths:{table:"port_berths",required:["terminal_id","berth_code"],fields:["terminal_id","berth_code","name","length_m","max_beam_m","declared_depth_m","depth_datum","max_operational_draft_m","max_loa_m","status","restrictions","source_reference","evidence_sha256"]},
 channels:{table:"port_channels",required:["port_id","channel_name","depth_datum"],fields:["port_id","channel_name","length_m","width_m","declared_depth_m","depth_datum","traffic_direction","restrictions","source_reference","survey_date","status","evidence_sha256"]},
 anchorages:{table:"port_anchorages",required:["port_id","anchorage_code"],fields:["port_id","anchorage_code","name","latitude","longitude","declared_depth_m","depth_datum","capacity_vessels","restrictions","source_reference","survey_date","status","evidence_sha256"]},
 "loading-services":{table:"port_loading_services",required:["port_id","service_type","cargo_type","handling_mode"],fields:["port_id","terminal_id","berth_id","service_type","cargo_type","handling_mode","rate_value","rate_unit","operating_window","status","source_reference","evidence_sha256"]},
 "port-equipment":{table:"port_equipment",required:["port_id","equipment_type"],fields:["port_id","terminal_id","berth_id","equipment_type","rated_capacity","capacity_unit","condition_status","availability","source_reference","evidence_sha256"]},
 "operating-limits":{table:"port_operating_limits",required:["port_id","effective_from","authority_name","source_reference"],fields:["port_id","terminal_id","berth_id","cargo_type","vessel_type","max_draft_m","max_loa_m","max_beam_m","min_ukc_m","weather_limits","effective_from","effective_to","authority_name","source_reference","approval_status","evidence_sha256"]},
 warehouses:{table:"warehouses",required:["name"],fields:["name","code","location","port_id","terminal_id","operator_organization_id","latitude","longitude","storage_mode","storage_capacity_mt","floor_area_m2","usable_volume_m3","source_reference","evidence_sha256","is_active"]},
 "warehouse-zones":{table:"warehouse_zones",required:["warehouse_id","zone_code","zone_type"],fields:["warehouse_id","zone_code","zone_type","capacity","unit_code","status","source_reference","evidence_sha256"]},
 "warehouse-bins":{table:"warehouse_bins",required:["zone_id","bin_code"],fields:["zone_id","bin_code","capacity","unit_code","allowed_product_ids","status","source_reference","evidence_sha256"]},
 "warehouse-equipment":{table:"warehouse_equipment",required:["warehouse_id","equipment_type"],fields:["warehouse_id","equipment_type","asset_code","rated_capacity","capacity_unit","condition_status","source_reference","evidence_sha256"]},
 routes:{table:"pks_port_routes",required:["pks_site_id","port_id","route_mode"],fields:["pks_site_id","port_id","route_mode","distance_km","estimated_travel_minutes","route_notes","source_reference","evidence_sha256","is_active"]}
};
const P16_JSON_FIELDS=new Set(["operating_restrictions","restrictions","operating_window","availability","weather_limits"]);
function buildP16Values(resource:string,body:Record<string,unknown>,partial:boolean){
 const config=P16_RESOURCES[resource]; if(!config)return null;
 const keys=Object.keys(body||{}).filter(k=>config.fields.includes(k));
 if(!partial&&config.required.some(k=>body[k]===undefined||body[k]===null||body[k]===""))return {error:"Required fields: "+config.required.join(", ")};
 if(!keys.length)return {error:"No allowed P16 fields supplied."};
 return {config,keys,values:keys.map(k=>P16_JSON_FIELDS.has(k)?JSON.stringify(body[k]):body[k])};
}
app.post("/api/v1/p16/master/:resource",requireAuth,requireAdmin,async(req:express.Request,res:express.Response)=>{
 const built=buildP16Values(String(req.params.resource||""),req.body||{},false);
 if(!built)return res.status(404).json({error:"Unknown P16 master resource."});
 if("error" in built)return res.status(400).json({error:built.error});
 try{
  const columns=built.keys.map(k=>'"'+k+'"'),values=built.keys.map((k,i)=>"$"+(i+1)+(P16_JSON_FIELDS.has(k)?"::jsonb":""));
  const result=await req.db.query("INSERT INTO public."+built.config.table+" ("+columns.join(",")+") VALUES ("+values.join(",")+") RETURNING *",built.values);
  return res.status(201).json({record:result.rows[0],verificationStatus:"submitted",requiresIndependentReview:true});
 }catch(error:any){if(error?.code==="23505")return res.status(409).json({error:"P16 master record conflicts with an existing unique code."});if(error?.code==="23503"||error?.code==="23514")return res.status(400).json({error:"P16 master data failed foreign-key or domain validation."});return res.status(500).json(internalServerErrorPayload());}
});
app.patch("/api/v1/p16/master/:resource/:recordId",requireAuth,requireAdmin,async(req:express.Request,res:express.Response)=>{
 const resource=String(req.params.resource||""),id=String(req.params.recordId||"");
 if(!p16UuidPattern.test(id))return res.status(400).json({error:"Valid recordId is required."});
 const built=buildP16Values(resource,req.body||{},true);
 if(!built)return res.status(404).json({error:"Unknown P16 master resource."});
 if("error" in built)return res.status(400).json({error:built.error});
 try{
  const sets=built.keys.map((k,i)=>'"'+k+'"=
app.get("/api/v1/transport-legs", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId query parameter required" });
  if (!(await requireProjectPermission(req, res, projectId, "logistics.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT id, project_id, origin, destination, distance_km, status, created_at, updated_at
       FROM transport_legs
       WHERE project_id = $1::uuid
       ORDER BY created_at DESC LIMIT 100`,
      [projectId],
    );
    return res.json({ transportLegs: rows });
  } catch {
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/tracking-events", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "logistics.view"))) return;
  try {
    const { rows } = await req.db.query(
      "SELECT te.* FROM tracking_events te JOIN truck_trips tt ON tt.id = te.truck_trip_id WHERE tt.project_id = $1::uuid ORDER BY te.created_at DESC LIMIT 100",
      [projectId],
    );
    return res.json({ trackingEvents: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/tracking-events", requireAuth, async (req: express.Request, res: express.Response) => {
  const { truckTripId, eventType, latitude, longitude, gpsAccuracy, source, captureTimestamp, notes } = req.body ?? {};
  const checkerId = req.user?.id;
  if (!truckTripId || !eventType || latitude === undefined || longitude === undefined || gpsAccuracy === undefined) {
    return res.status(400).json({ error: "Required fields: truckTripId, eventType, latitude, longitude, gpsAccuracy" });
  }
  if (typeof checkerId !== "string") {
    return res.status(401).json({ error: "Authenticated principal required" });
  }
  const allowedEventTypes = new Set(["departure", "checkpoint", "arrival", "weighbridge", "receipt", "exception"]);
  if (!allowedEventTypes.has(String(eventType))) {
    return res.status(400).json({ error: "Invalid eventType" });
  }

  // Server-side GPS validation
  if (typeof latitude === "boolean" || typeof longitude === "boolean" || typeof gpsAccuracy === "boolean") {
    return res.status(400).json({ error: "GPS values must be numbers, not booleans" });
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  const acc = Number(gpsAccuracy);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({ error: "Invalid latitude: must be between -90 and 90" });
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({ error: "Invalid longitude: must be between -180 and 180" });
  }
  if (!Number.isFinite(acc) || acc <= 0) {
    return res.status(400).json({ error: "Invalid gpsAccuracy: must be a finite number greater than 0" });
  }

  try {
    const { rows: tripRows } = await req.db.query(`SELECT id, project_id FROM truck_trips WHERE id = $1::uuid`, [truckTripId]);
    if (tripRows.length === 0) {
      return res.status(404).json({ error: "Truck trip not found" });
    }
    const tripProjectId = tripRows[0].project_id as string;
    const requiredPermission = eventType === "receipt" ? "warehouse.receipt.create" : eventType === "checkpoint" ? "verify_checkpoints" : "record_truck_trips";
    if (!(await requireProjectPermission(req, res, tripProjectId, requiredPermission))) return;
    const effectiveCapture = captureTimestamp || new Date().toISOString();
    const { rows } = await req.db.query(
      `INSERT INTO tracking_events (truck_trip_id, event_type, checker_id, latitude, longitude, gps_accuracy, source, capture_timestamp, status, notes, created_at)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8::timestamptz, 'verified', $9, now()) RETURNING *`,
      [truckTripId, eventType, checkerId, lat, lng, acc, source || "checker_device", effectiveCapture, notes || null],
    );
    res.status(201).json({ trackingEvent: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create tracking event" });
  }
});

app.get("/api/v1/tracking-events/trip/:tripId", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows: trips } = await req.db.query("SELECT project_id FROM truck_trips WHERE id = $1::uuid", [req.params.tripId]);
    if (!trips.length) return res.status(404).json({ error: "Truck trip not found." });
    if (!(await requireProjectPermission(req, res, trips[0].project_id, "logistics.view"))) return;
    const { rows } = await req.db.query("SELECT * FROM tracking_events WHERE truck_trip_id = $1::uuid ORDER BY created_at DESC", [req.params.tripId]);
    return res.json({ trackingEvents: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.get("/api/v1/warehouse-receipts", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "warehouse.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM warehouse_receipts WHERE project_id=$1::uuid ORDER BY created_at DESC LIMIT 100", [projectId]);
    return res.json({ warehouseReceipts: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/warehouse-receipts", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, truckTripId, lotId, receivedQuantity, unit, conditionStatus, exceptionReason, weighbridgeTicketKey, checkTimestamp, status } = req.body ?? {};
  const checkerId = req.user?.id;
  const receivedAmount = Number(receivedQuantity);
  const receiptStatuses = new Set(["pending", "verified", "partial"]);
  if (!projectId || receivedQuantity === undefined || !Number.isFinite(receivedAmount) || receivedAmount <= 0 ||
      typeof unit !== "string" || !unit.trim() ||
      (status !== undefined && (typeof status !== "string" || !receiptStatuses.has(status)))) {
    return res.status(400).json({ error: "Required fields: projectId, positive receivedQuantity and unit.", code: "INVALID_WAREHOUSE_RECEIPT" });
  }
  if (typeof checkerId !== "string") {
    return res.status(401).json({ error: "Authenticated principal required" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "warehouse.receipt.create"))) return;
  try {
    if (truckTripId) {
      const { rows: tripRows } = await req.db.query(`SELECT id, project_id FROM truck_trips WHERE id = $1::uuid`, [truckTripId]);
      if (tripRows.length === 0) return res.status(400).json({ error: "Invalid truck trip" });
      if (tripRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden" });
    }
    if (lotId) {
      const { rows: lotRows } = await req.db.query(`SELECT id, project_id, unit FROM inventory_lots WHERE id = $1::uuid FOR UPDATE`, [lotId]);
      if (lotRows.length === 0) return res.status(400).json({ error: "Invalid inventory lot" });
      if (lotRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden" });
      if (lotRows[0].unit !== unit.trim()) return res.status(400).json({ error: "Receipt unit must match inventory lot unit.", code: "UNIT_MISMATCH" });
    }
    const effectiveCheck = checkTimestamp || new Date().toISOString();
    const { rows } = await req.db.query(
      `INSERT INTO warehouse_receipts (project_id, truck_trip_id, lot_id, received_quantity, unit, condition_status, exception_reason, weighbridge_ticket_key, checker_id, check_timestamp, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9::uuid, $10::timestamptz, $11, now(), now()) RETURNING *`,
      [projectId, truckTripId || null, lotId || null, receivedAmount, unit.trim(), conditionStatus || null, exceptionReason || null, weighbridgeTicketKey || null, checkerId, effectiveCheck, status || "pending"],
    );
    res.status(201).json({ warehouseReceipt: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create warehouse receipt" });
  }
});

app.patch("/api/v1/warehouse-receipts/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { status, receivedQuantity, unit, conditionStatus, exceptionReason } = req.body ?? {};
  const receiptStatuses = new Set(["pending", "verified", "partial"]);
  if (receivedQuantity !== undefined && (!Number.isFinite(Number(receivedQuantity)) || Number(receivedQuantity) <= 0)) {
    return res.status(400).json({ error: "receivedQuantity must be a positive finite number.", code: "INVALID_RECEIVED_QUANTITY" });
  }
  if (status !== undefined && (typeof status !== "string" || !receiptStatuses.has(status))) {
    return res.status(400).json({ error: "Invalid warehouse receipt status.", code: "INVALID_RECEIPT_STATUS" });
  }
  if (unit !== undefined && (typeof unit !== "string" || !unit.trim())) {
    return res.status(400).json({ error: "unit must be a non-empty string.", code: "INVALID_RECEIPT_UNIT" });
  }
  try {
    const { rows: scopeRows } = await req.db.query(
      "SELECT project_id, lot_id FROM warehouse_receipts WHERE id = $1::uuid",
      [req.params.id],
    );
    if (scopeRows.length === 0) return res.status(404).json({ error: "Warehouse receipt not found." });
    if (!(await requireProjectPermission(req, res, scopeRows[0].project_id, "warehouse.update"))) return;
    if (unit !== undefined && scopeRows[0].lot_id) {
      const { rows: lotRows } = await req.db.query(
        "SELECT unit FROM inventory_lots WHERE id = $1::uuid AND project_id = $2::uuid",
        [scopeRows[0].lot_id, scopeRows[0].project_id],
      );
      if (lotRows.length !== 1 || lotRows[0].unit !== unit.trim()) {
        return res.status(400).json({ error: "Receipt unit must match inventory lot unit.", code: "UNIT_MISMATCH" });
      }
    }
    const { rows } = await req.db.query(
      `UPDATE warehouse_receipts
          SET status = COALESCE($2, status),
              received_quantity = COALESCE($3, received_quantity),
              unit = COALESCE($4, unit),
              condition_status = COALESCE($5, condition_status),
              exception_reason = COALESCE($6, exception_reason),
              updated_at = now()
        WHERE id = $1::uuid RETURNING *`,
      [req.params.id, status ?? null, receivedQuantity === undefined ? null : Number(receivedQuantity), unit === undefined ? null : unit.trim(), conditionStatus ?? null, exceptionReason ?? null],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Warehouse receipt not found" });
    res.json({ warehouseReceipt: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to update warehouse receipt" });
  }
});

app.get("/api/v1/inventory-lots", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "inventory.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM inventory_lots WHERE project_id=$1::uuid ORDER BY created_at DESC LIMIT 100", [projectId]);
    return res.json({ inventoryLots: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/inventory-lots", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, pksSiteId, quantity, unit, location, status } = req.body;
  if (!projectId || quantity === undefined) return res.status(400).json({ error: "projectId, quantity required" });
  if (!(await requireProjectPermission(req, res, projectId, "inventory.create"))) return;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO inventory_lots (project_id, pks_site_id, quantity, unit, location, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, now(), now()) RETURNING *`,
      [projectId, pksSiteId || null, quantity, unit || "MT", location || null, status || "incoming"],
    );
    res.status(201).json({ inventoryLot: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create inventory lot" });
  }
});

app.get("/api/v1/inventory-movements", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "inventory.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM inventory_movements WHERE project_id=$1::uuid ORDER BY created_at DESC LIMIT 100", [projectId]);
    return res.json({ inventoryMovements: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/inventory-movements", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, lotId, movementType, quantity, unit, warehouseReceiptId, sourceLocation, destinationLocation, reason, referenceId, referenceType, status } = req.body ?? {};
  const actorId = req.user?.id;
  const movementQuantity = Number(quantity);
  const movementTypes = new Set(["receipt", "issue", "transfer", "adjustment"]);
  const movementStatuses = new Set(["posted", "reversed", "adjusted"]);
  if (!projectId || !lotId || typeof movementType !== "string" || !movementType.trim() || !movementTypes.has(movementType.trim()) ||
      quantity === undefined || !Number.isFinite(movementQuantity) || movementQuantity <= 0 ||
      typeof unit !== "string" || !unit.trim() || !actorId ||
      (status !== undefined && (typeof status !== "string" || !movementStatuses.has(status)))) {
    return res.status(400).json({ error: "projectId, lotId, movementType, positive quantity, unit and authenticated actor are required", code: "INVALID_INVENTORY_MOVEMENT" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "inventory.update"))) return;
  try {
    const { rows: lotRows } = await req.db.query(`SELECT id, project_id, unit FROM inventory_lots WHERE id = $1::uuid FOR UPDATE`, [lotId]);
    if (lotRows.length === 0) return res.status(400).json({ error: "Invalid inventory lot" });
    if (lotRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden: lot does not belong to project" });
    if (lotRows[0].unit !== unit.trim()) return res.status(400).json({ error: "Movement unit must match inventory lot unit.", code: "UNIT_MISMATCH" });
    if (warehouseReceiptId) {
      const { rows: receiptRows } = await req.db.query(`SELECT id, project_id FROM warehouse_receipts WHERE id = $1::uuid`, [warehouseReceiptId]);
      if (receiptRows.length === 0) return res.status(400).json({ error: "Invalid warehouse receipt" });
      if (receiptRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden: receipt does not belong to project" });
    }
    const { rows } = await req.db.query(
      `INSERT INTO inventory_movements (project_id, lot_id, warehouse_receipt_id, movement_type, quantity, unit, source_location, destination_location, reason, actor_id, reference_id, reference_type, status, created_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::uuid, $11::uuid, $12, $13, now()) RETURNING *`,
      [projectId, lotId, warehouseReceiptId || null, movementType.trim(), movementQuantity, unit.trim(), sourceLocation || null, destinationLocation || null, reason || null, actorId, referenceId || null, referenceType || null, status || "posted"],
    );
    res.status(201).json({ inventoryMovement: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create inventory movement" });
  }
});

// ============================================
// Inventory reservations (P06)
// ============================================
app.get("/api/v1/inventory-reservations", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId query parameter is required.", code: "PROJECT_ID_REQUIRED" });
  if (!(await requireProjectPermission(req, res, projectId, "inventory.view"))) return;
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM inventory_reservations WHERE project_id = $1::uuid ORDER BY created_at DESC LIMIT 100",
      [projectId],
    );
    res.json({ inventoryReservations: rows });
  } catch {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/inventory-reservations", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, lotId, reservedQuantity, unitCode, buyerId, shipmentId, expiresAt, idempotencyKey } = req.body ?? {};
  const actorId = req.user?.id;
  const quantity = Number(reservedQuantity);
  if (!projectId || !lotId || !actorId || !Number.isFinite(quantity) || quantity <= 0 ||
      typeof unitCode !== "string" || !unitCode.trim() ||
      typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    return res.status(400).json({
      error: "Required fields: projectId, lotId, reservedQuantity (>0), unitCode, idempotencyKey.",
      code: "INVALID_RESERVATION_INPUT",
    });
  }
  if (!(await requireProjectPermission(req, res, projectId, "inventory.reserve"))) return;

  try {
    const { rows: existing } = await req.db.query(
      "SELECT * FROM inventory_reservations WHERE idempotency_key = $1::text LIMIT 1",
      [idempotencyKey.trim()],
    );
    if (existing.length > 0) {
      const prior = existing[0];
      const sameRequest = prior.project_id === projectId && prior.lot_id === lotId &&
        Number(prior.reserved_quantity) === quantity && prior.unit_code === unitCode.trim() &&
        (prior.buyer_id ?? null) === (buyerId ?? null) && (prior.shipment_id ?? null) === (shipmentId ?? null);
      if (!sameRequest) return res.status(409).json({ error: "Idempotency key was already used for a different reservation.", code: "IDEMPOTENCY_KEY_CONFLICT" });
      return res.status(200).json({ inventoryReservation: prior, idempotentReplay: true });
    }

    const { rows: lotRows } = await req.db.query(
      "SELECT id, project_id, unit, quantity, held_quantity, reserved_quantity FROM inventory_lots WHERE id = $1::uuid FOR UPDATE",
      [lotId],
    );
    if (lotRows.length !== 1) return res.status(404).json({ error: "Inventory lot not found.", code: "INVENTORY_LOT_NOT_FOUND" });
    const lot = lotRows[0];
    if (lot.project_id !== projectId) return res.status(403).json({ error: "Inventory lot belongs to another Project.", code: "PROJECT_SCOPE_MISMATCH" });
    if (lot.unit !== unitCode.trim()) return res.status(400).json({ error: "Reservation unit must match the inventory lot unit.", code: "UNIT_MISMATCH" });

    if (buyerId) {
      const { rows: buyerRows } = await req.db.query(
        "SELECT 1 FROM buyers WHERE id = $1::uuid LIMIT 1",
        [buyerId],
      );
      if (buyerRows.length !== 1) return res.status(400).json({ error: "Invalid buyerId.", code: "INVALID_BUYER" });
    }
    if (shipmentId) {
      const { rows: shipmentRows } = await req.db.query(
        "SELECT 1 FROM shipments WHERE id = $1::uuid AND project_id = $2::uuid LIMIT 1",
        [shipmentId, projectId],
      );
      if (shipmentRows.length !== 1) return res.status(400).json({ error: "Shipment must belong to the selected Project.", code: "INVALID_SHIPMENT" });
    }

    // The database trigger locks the lot and rechecks available quantity atomically.
    const { rows } = await req.db.query(
      `INSERT INTO inventory_reservations
         (project_id, lot_id, buyer_id, shipment_id, reserved_quantity, unit_code,
          status, expires_at, created_by, idempotency_key, fulfilled_quantity, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric, $6::text,
               'active', $7::timestamptz, $8::uuid, $9::text, 0, now(), now())
       RETURNING *`,
      [projectId, lotId, buyerId || null, shipmentId || null, quantity, unitCode.trim(), expiresAt || null, actorId, idempotencyKey.trim()],
    );
    res.status(201).json({ inventoryReservation: rows[0] });
  } catch (error: any) {
    if (error?.code === "23514") return res.status(409).json({ error: "Reservation rejected by inventory integrity guard.", code: "RESERVATION_INTEGRITY_REJECTED" });
    if (error?.code === "42703" && /release_reason/.test(String(error?.message || ""))) {
      return res.status(503).json({ error: "Reservation release schema migration is pending.", code: "RESERVATION_SCHEMA_MIGRATION_PENDING" });
    }
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/inventory-reservations/:id/release", requireAuth, async (req: express.Request, res: express.Response) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 3) return res.status(400).json({ error: "A release reason of at least 3 characters is required.", code: "RELEASE_REASON_REQUIRED" });
  const actorId = req.user?.id;
  try {
    const { rows: currentRows } = await req.db.query(
      "SELECT id, project_id, status FROM inventory_reservations WHERE id = $1::uuid FOR UPDATE",
      [req.params.id],
    );
    if (currentRows.length !== 1) return res.status(404).json({ error: "Reservation not found.", code: "RESERVATION_NOT_FOUND" });
    const current = currentRows[0];
    if (!(await requireProjectPermission(req, res, current.project_id, "inventory.reserve"))) return;
    if (!["active", "partially_fulfilled"].includes(current.status)) {
      return res.status(409).json({ error: "Only active or partially fulfilled reservations can be released.", code: "RESERVATION_NOT_RELEASABLE" });
    }
    const { rows } = await req.db.query(
      `UPDATE inventory_reservations
          SET status = 'released', released_by = $2::uuid, released_at = now(),
              release_reason = $3::text, updated_at = now()
        WHERE id = $1::uuid
        RETURNING *`,
      [req.params.id, actorId, reason],
    );
    res.json({ inventoryReservation: rows[0] });
  } catch (error: any) {
    if (error?.code === "42703" && /release_reason/.test(String(error?.message || ""))) {
      return res.status(503).json({ error: "Reservation release is blocked until the approved schema migration is applied.", code: "RESERVATION_SCHEMA_MIGRATION_PENDING" });
    }
    if (error?.code === "55000" || error?.code === "42501") return res.status(409).json({ error: "Reservation release rejected by the database guard.", code: "RESERVATION_RELEASE_REJECTED" });
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/inventory-reservations/:id/expire", requireAuth, async (req: express.Request, res: express.Response) => {
  const actorId = req.user?.id;
  try {
    const { rows: currentRows } = await req.db.query(
      "SELECT id, project_id, status, expires_at FROM inventory_reservations WHERE id = $1::uuid FOR UPDATE",
      [req.params.id],
    );
    if (currentRows.length !== 1) return res.status(404).json({ error: "Reservation not found.", code: "RESERVATION_NOT_FOUND" });
    const current = currentRows[0];
    if (!(await requireProjectPermission(req, res, current.project_id, "inventory.reserve"))) return;
    if (!["active", "partially_fulfilled"].includes(current.status) || !current.expires_at || new Date(current.expires_at).getTime() > Date.now()) {
      return res.status(409).json({ error: "Only an active reservation whose expiry timestamp has passed can expire.", code: "RESERVATION_NOT_EXPIRED" });
    }
    const { rows } = await req.db.query(
      `UPDATE inventory_reservations
          SET status = 'expired', released_by = $2::uuid, released_at = now(),
              release_reason = $3::text, updated_at = now()
        WHERE id = $1::uuid
        RETURNING *`,
      [req.params.id, actorId, "Expired at configured reservation expiry timestamp"],
    );
    res.json({ inventoryReservation: rows[0] });
  } catch (error: any) {
    if (error?.code === "42703" && /release_reason/.test(String(error?.message || ""))) {
      return res.status(503).json({ error: "Reservation expiry is blocked until the approved schema migration is applied.", code: "RESERVATION_SCHEMA_MIGRATION_PENDING" });
    }
    if (error?.code === "55000" || error?.code === "42501") return res.status(409).json({ error: "Reservation expiry rejected by the database guard.", code: "RESERVATION_EXPIRY_REJECTED" });
    res.status(500).json(internalServerErrorPayload());
  }
});

// Inventory holds
app.get("/api/v1/inventory-holds", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "inventory.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM inventory_holds WHERE project_id=$1::uuid ORDER BY created_at DESC LIMIT 100", [projectId]);
    return res.json({ inventoryHolds: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/inventory-holds", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, lotId, heldQuantity, unit, reason, idempotencyKey } = req.body ?? {};
  const actorId = req.user?.id;
  const quantity = Number(heldQuantity);
  if (!projectId || !lotId || !actorId || !Number.isFinite(quantity) || quantity <= 0 || typeof unit !== "string" || !unit.trim() ||
      typeof reason !== "string" || !reason.trim() || typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    return res.status(400).json({ error: "projectId, lotId, authenticated actor, positive heldQuantity, unit, reason and idempotencyKey are required" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "inventory.hold"))) return;
  try {
    const sameHoldRequest = (prior: any) =>
      prior.project_id === projectId &&
      prior.lot_id === lotId &&
      Number(prior.held_quantity ?? prior.quantity) === quantity &&
      String(prior.unit ?? prior.unit_code) === unit.trim() &&
      String(prior.reason ?? "") === reason.trim() &&
      String(prior.created_by ?? prior.placed_by ?? "") === String(actorId);
    const { rows: existing } = await req.db.query(
      "SELECT * FROM inventory_holds WHERE idempotency_key = $1::text LIMIT 1",
      [idempotencyKey.trim()],
    );
    if (existing.length > 0) {
      const prior = existing[0];
      if (!sameHoldRequest(prior)) {
        return res.status(409).json({ error: "Idempotency key was already used for a different inventory hold.", code: "IDEMPOTENCY_KEY_CONFLICT" });
      }
      return res.status(200).json({ inventoryHold: prior, idempotentReplay: true });
    }
    const { rows: lotRows } = await req.db.query(`SELECT id, project_id, unit FROM inventory_lots WHERE id = $1::uuid FOR UPDATE`, [lotId]);
    if (lotRows.length === 0) return res.status(400).json({ error: "Invalid inventory lot" });
    if (lotRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden: lot does not belong to project" });
    if (lotRows[0].unit !== unit.trim()) return res.status(400).json({ error: "Hold unit must match inventory lot unit.", code: "UNIT_MISMATCH" });
    const { rows } = await req.db.query(
      `INSERT INTO inventory_holds
         (project_id, lot_id, hold_type, quantity, unit_code, reason, status, placed_by, placed_at,
          held_quantity, unit, idempotency_key, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'operational', $3, $4, $5, 'active', $7::uuid, now(),
               $3, $4, $6::text, $7::uuid, now(), now())
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`,
      [projectId, lotId, quantity, unit.trim(), reason.trim(), idempotencyKey.trim(), actorId],
    );
    if (rows.length === 0) {
      const { rows: replayRows } = await req.db.query(
        "SELECT * FROM inventory_holds WHERE idempotency_key = $1::text LIMIT 1",
        [idempotencyKey.trim()],
      );
      if (replayRows.length === 1 && sameHoldRequest(replayRows[0])) {
        return res.status(200).json({ inventoryHold: replayRows[0], idempotentReplay: true });
      }
      return res.status(409).json({ error: "Idempotency key was already used for a different inventory hold.", code: "IDEMPOTENCY_KEY_CONFLICT" });
    }
    res.status(201).json({ inventoryHold: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create inventory hold" });
  }
});

// ============================================
// Shipment allocations (P06)
// ============================================
app.get("/api/v1/shipment-allocations", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId query parameter is required.", code: "PROJECT_ID_REQUIRED" });
  if (!(await requireProjectPermission(req, res, projectId, "shipping.view"))) return;
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM shipment_allocations WHERE project_id = $1::uuid ORDER BY created_at DESC LIMIT 100",
      [projectId],
    );
    res.json({ shipmentAllocations: rows });
  } catch {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/shipment-allocations", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, shipmentId, lotId, reservationId, allocatedQuantity, unit, idempotencyKey } = req.body ?? {};
  const actorId = req.user?.id;
  const quantity = Number(allocatedQuantity);
  if (!projectId || !shipmentId || !lotId || !reservationId || !actorId ||
      !Number.isFinite(quantity) || quantity <= 0 ||
      typeof unit !== "string" || !unit.trim() ||
      typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    return res.status(400).json({
      error: "Required fields: projectId, shipmentId, lotId, reservationId, allocatedQuantity (>0), unit, idempotencyKey.",
      code: "INVALID_ALLOCATION_INPUT",
    });
  }
  if (!(await requireProjectPermission(req, res, projectId, "shipping.update"))) return;
  try {
    const { rows: existing } = await req.db.query(
      "SELECT * FROM shipment_allocations WHERE idempotency_key = $1::text LIMIT 1",
      [idempotencyKey.trim()],
    );
    if (existing.length > 0) {
      const prior = existing[0];
      const sameRequest = prior.project_id === projectId && prior.shipment_id === shipmentId &&
        prior.lot_id === lotId && prior.reservation_id === reservationId &&
        Number(prior.allocated_quantity) === quantity && prior.unit === unit.trim();
      if (!sameRequest) return res.status(409).json({ error: "Idempotency key was already used for a different allocation.", code: "IDEMPOTENCY_KEY_CONFLICT" });
      return res.status(200).json({ shipmentAllocation: prior, idempotentReplay: true });
    }

    const { rows: shipmentRows } = await req.db.query(
      "SELECT id, project_id, quantity FROM shipments WHERE id = $1::uuid AND project_id = $2::uuid FOR UPDATE",
      [shipmentId, projectId],
    );
    if (shipmentRows.length !== 1) return res.status(400).json({ error: "Shipment does not belong to the selected Project.", code: "INVALID_SHIPMENT" });
    const { rows: lotRows } = await req.db.query(
      "SELECT id, project_id, unit FROM inventory_lots WHERE id = $1::uuid AND project_id = $2::uuid FOR UPDATE",
      [lotId, projectId],
    );
    if (lotRows.length !== 1) return res.status(400).json({ error: "Inventory lot does not belong to the selected Project.", code: "INVALID_INVENTORY_LOT" });
    if (lotRows[0].unit !== unit.trim()) return res.status(400).json({ error: "Allocation unit must match inventory lot unit.", code: "UNIT_MISMATCH" });

    const { rows: reservationRows } = await req.db.query(
      `SELECT id, project_id, lot_id, shipment_id, reserved_quantity, fulfilled_quantity, unit_code, status
         FROM inventory_reservations
        WHERE id = $1::uuid AND project_id = $2::uuid
        FOR UPDATE`,
      [reservationId, projectId],
    );
    if (reservationRows.length !== 1) return res.status(400).json({ error: "Reservation does not belong to the selected Project.", code: "INVALID_RESERVATION" });
    const reservation = reservationRows[0];
    if (reservation.lot_id !== lotId || (reservation.shipment_id && reservation.shipment_id !== shipmentId) ||
        !["active", "partially_fulfilled"].includes(reservation.status) ||
        reservation.unit_code !== unit.trim()) {
      return res.status(409).json({ error: "Reservation must be active and match Project, shipment, lot and unit.", code: "RESERVATION_SCOPE_OR_STATE_MISMATCH" });
    }

    const { rows: allocatedRows } = await req.db.query(
      `SELECT COALESCE(sum(allocated_quantity),0) AS allocated
         FROM shipment_allocations
        WHERE reservation_id = $1::uuid AND status IN ('allocated','partially_loaded','loaded')`,
      [reservationId],
    );
    const { rows: shipmentAllocatedRows } = await req.db.query(
      `SELECT COALESCE(sum(allocated_quantity),0) AS allocated
         FROM shipment_allocations
        WHERE shipment_id = $1::uuid AND status IN ('allocated','partially_loaded','loaded')`,
      [shipmentId],
    );
    const capacity = validateAllocationCapacity({
      projectId,
      shipmentProjectId: shipmentRows[0].project_id,
      lotProjectId: lotRows[0].project_id,
      reservationProjectId: reservation.project_id,
      reservationLotId: reservation.lot_id,
      lotId,
      reservationShipmentId: reservation.shipment_id ?? null,
      shipmentId,
      reservationStatus: reservation.status,
      reservationQuantity: Number(reservation.reserved_quantity),
      existingReservationAllocations: Number(allocatedRows[0]?.allocated || 0),
      shipmentQuantity: Number(shipmentRows[0].quantity),
      existingShipmentAllocations: Number(shipmentAllocatedRows[0]?.allocated || 0),
      allocationQuantity: quantity,
      unitMatches: reservation.unit_code === unit.trim() && lotRows[0].unit === unit.trim(),
    });
    if (capacity.ok === false) {
      return res.status(409).json({ error: "Allocation violates reservation or shipment capacity.", code: capacity.code });
    }

    const { rows } = await req.db.query(
      `INSERT INTO shipment_allocations
         (shipment_id, lot_id, project_id, reservation_id, allocated_quantity, unit,
          status, loaded_quantity, idempotency_key, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric, $6::text,
               'draft', 0, $7::text, $8::uuid, now(), now())
       RETURNING *`,
      [shipmentId, lotId, projectId, reservationId, quantity, unit.trim(), idempotencyKey.trim(), actorId],
    );
    res.status(201).json({ shipmentAllocation: rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "An allocation already exists for this shipment and lot.", code: "ALLOCATION_ALREADY_EXISTS" });
    if (error?.code === "23514" || error?.code === "55000") return res.status(409).json({ error: "Allocation rejected by the database integrity guard.", code: "ALLOCATION_INTEGRITY_REJECTED" });
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/shipment-allocations/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { status, loadedQuantity, reversalReason } = req.body ?? {};
  const allowedStatuses = new Set(["allocated", "partially_loaded", "loaded", "cancelled", "reversed"]);
  if (status !== undefined && (typeof status !== "string" || !allowedStatuses.has(status))) {
    return res.status(400).json({ error: "Invalid shipment allocation status.", code: "INVALID_ALLOCATION_STATUS" });
  }
  if (loadedQuantity !== undefined && (!Number.isFinite(Number(loadedQuantity)) || Number(loadedQuantity) < 0)) {
    return res.status(400).json({ error: "loadedQuantity must be a non-negative number.", code: "INVALID_LOADED_QUANTITY" });
  }
  try {
    const { rows: allocationRows } = await req.db.query(
      "SELECT id, project_id, shipment_id, reservation_id, allocated_quantity, loaded_quantity, status FROM shipment_allocations WHERE id = $1::uuid FOR UPDATE",
      [req.params.id],
    );
    if (allocationRows.length !== 1) return res.status(404).json({ error: "Shipment allocation not found.", code: "ALLOCATION_NOT_FOUND" });
    const allocation = allocationRows[0];
    if (!(await requireProjectPermission(req, res, allocation.project_id, "shipping.update"))) return;

    if (status === "reversed" && (typeof reversalReason !== "string" || reversalReason.trim().length < 3)) {
      return res.status(400).json({ error: "A reversal reason of at least 3 characters is required.", code: "REVERSAL_REASON_REQUIRED" });
    }
    const transition = validateAllocationTransition({
      currentStatus: allocation.status,
      nextStatus: status,
      currentLoadedQuantity: Number(allocation.loaded_quantity),
      nextLoadedQuantity: loadedQuantity === undefined ? undefined : Number(loadedQuantity),
      allocatedQuantity: Number(allocation.allocated_quantity),
      reversalReason,
    });
    if (transition.ok === false) {
      return res.status(400).json({ error: "Invalid shipment allocation state transition.", code: transition.code });
    }

    const { rows } = await req.db.query(
      `UPDATE shipment_allocations
          SET status = COALESCE($2::text, status),
              loaded_quantity = COALESCE($3::numeric, loaded_quantity),
              reversal_reason = CASE WHEN $2::text = 'reversed' THEN $4::text ELSE reversal_reason END,
              updated_at = now()
        WHERE id = $1::uuid
        RETURNING *`,
      [req.params.id, status ?? null, loadedQuantity === undefined ? null : Number(loadedQuantity), reversalReason?.trim() || null],
    );
    res.json({ shipmentAllocation: rows[0] });
  } catch (error: any) {
    if (error?.code === "23514" || error?.code === "55000" || error?.code === "42501") {
      return res.status(409).json({ error: "Allocation state transition rejected by the database guard.", code: "ALLOCATION_TRANSITION_REJECTED" });
    }
    res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/fx-rates", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM fx_rates WHERE is_active = true ORDER BY rate_date DESC LIMIT 100");
    res.json({ fxRates: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load FX rates" });
  }
});

app.post("/api/v1/fx-rates", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { fromCurrency, toCurrency, rate, rateType, source, effectiveDate } = req.body;
  if (!fromCurrency || !toCurrency || rate === undefined || !effectiveDate) return res.status(400).json({ error: "fromCurrency, toCurrency, rate, effectiveDate required" });
  try {
    const { rows: fromRows } = await req.db.query("SELECT id FROM currencies WHERE code = $1::text AND is_active = true LIMIT 1", [fromCurrency]);
    const { rows: toRows } = await req.db.query("SELECT id FROM currencies WHERE code = $1::text AND is_active = true LIMIT 1", [toCurrency]);
    if (fromRows.length === 0 || toRows.length === 0) {
      const invalid: string[] = [];
      if (fromRows.length === 0) invalid.push(fromCurrency);
      if (toRows.length === 0) invalid.push(toCurrency);
      return res.status(400).json({ error: "Invalid or inactive currency code", invalid });
    }
    const { rows } = await req.db.query(
      `INSERT INTO fx_rates (from_currency_id, to_currency_id, rate, rate_type, rate_source, rate_date, is_active, created_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::timestamptz, true, now()) RETURNING *`,
      [fromRows[0].id, toRows[0].id, rate, rateType || "reference", source || null, effectiveDate],
    );
    res.status(201).json({ fxRate: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create FX rate" });
  }
});

app.get("/api/v1/fx-exposure", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "finance.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT e.id, e.project_id, e.exposure_type, e.original_currency_id, e.original_amount,
              e.functional_amount, e.fx_rate, e.fx_date, e.created_at, e.updated_at,
              c.code AS original_currency_code
       FROM fx_exposures e LEFT JOIN currencies c ON c.id = e.original_currency_id
       WHERE e.project_id = $1::uuid ORDER BY e.created_at DESC LIMIT 100`,
      [projectId],
    );
    res.json({ fxExposure: rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      exposureType: r.exposure_type,
      originalCurrencyId: r.original_currency_id,
      originalCurrencyCode: r.original_currency_code,
      originalAmount: r.original_amount,
      functionalAmount: r.functional_amount,
      fxRate: r.fx_rate,
      fxDate: r.fx_date,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load FX exposure" });
  }
});

app.post("/api/v1/fx-exposure", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, amountIdr, amountFx, fxRate, exposureType, originalCurrency } = req.body;
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  if (!(await requireProjectPermission(req, res, projectId, "finance.create"))) return;
  try {
    // Resolve original currency (default to IDR)
    const currencyCode = originalCurrency || "IDR";
    const { rows: currencyRows } = await req.db.query(
      "SELECT id FROM currencies WHERE code = $1::text AND is_active = true LIMIT 1",
      [currencyCode],
    );
    if (currencyRows.length === 0) {
      return res.status(400).json({ error: `Invalid or inactive currency code: ${currencyCode}` });
    }
    const originalAmount = amountIdr !== undefined && amountIdr !== null ? Number(amountIdr) : null;
    const functionalAmount = amountFx !== undefined && amountFx !== null ? Number(amountFx) : null;
    const fxRateValue = fxRate !== undefined && fxRate !== null ? Number(fxRate) : null;
    const { rows } = await req.db.query(
      `INSERT INTO fx_exposures (project_id, exposure_type, original_currency_id, original_amount, functional_amount, fx_rate, fx_date, created_at, updated_at)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7::timestamptz, now(), now()) RETURNING *`,
      [projectId, exposureType || "open", currencyRows[0].id, originalAmount, functionalAmount, fxRateValue, new Date().toISOString()],
    );
    res.status(201).json({ fxExposure: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create FX exposure" });
  }
});


app.get("/api/v1/journal-entries", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "accounting.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM journal_entries WHERE project_id = $1::uuid ORDER BY created_at DESC LIMIT 100", [projectId]);
    res.json({ journalEntries: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load journal entries" });
  }
});

app.post("/api/v1/journal-entries", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, entryType, referenceId, referenceType, description, entryDate } = req.body;
  if (!projectId || !entryType || !description) return res.status(400).json({ error: "projectId, entryType, description required" });
  if (!(await requireProjectPermission(req, res, projectId, "accounting.create"))) return;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO journal_entries (project_id, entry_type, reference_id, reference_type, description, entry_date, status, posted_by, created_at, updated_at)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6::timestamptz, 'draft', $7::uuid, now(), now()) RETURNING *`,
      [projectId, entryType, referenceId || null, referenceType || null, description, entryDate || new Date().toISOString(), req.user?.id || null],
    );
    res.status(201).json({ journalEntry: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create journal entry" });
  }
});

app.post("/api/v1/journal-entries/:id/post", requireAuth, async (req: express.Request, res: express.Response) => {
  const journalEntryId = req.params.id;
  try {
    // Verify the journal exists and is in draft status
    const { rows: entryRows } = await req.db.query(
      "SELECT id, project_id, status FROM journal_entries WHERE id = $1::uuid FOR UPDATE",
      [journalEntryId],
    );
    if (entryRows.length === 0) return res.status(404).json({ error: "Journal entry not found" });
    if (!(await requireProjectPermission(req, res, entryRows[0].project_id, "accounting.update"))) return;
    if (entryRows[0].status !== "draft") {
      return res.status(400).json({ error: "Only draft journal entries can be posted" });
    }

    // Validate all lines exist and accounts are valid
    const { rows: lines } = await req.db.query(
      `SELECT jl.id, jl.account_id, jl.debit, jl.credit, co.code AS account_code, co.is_active AS account_active
       FROM journal_lines jl
       LEFT JOIN chart_of_accounts co ON co.id = jl.account_id
       WHERE jl.journal_entry_id = $1::uuid
       ORDER BY jl.line_order`,
      [journalEntryId],
    );
    if (lines.length === 0) {
      return res.status(400).json({ error: "Cannot post a journal entry with no lines" });
    }

    // Validate all accounts exist and are active
    const invalidAccounts = lines.filter((l: any) => !l.account_id || !l.account_active);
    if (invalidAccounts.length > 0) {
      return res.status(400).json({ error: "Invalid or inactive account in journal lines", invalidAccounts: invalidAccounts.map((l: any) => l.account_code || l.account_id) });
    }

    // Validate balance: total debit = total credit
    const totalDebit = lines.reduce((sum: number, l: any) => sum + Number(l.debit || 0), 0);
    const totalCredit = lines.reduce((sum: number, l: any) => sum + Number(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      return res.status(400).json({ error: "Journal entry is not balanced: total debit must equal total credit", totalDebit, totalCredit });
    }

    // Post the journal
    const { rows } = await req.db.query(
      `UPDATE journal_entries
       SET status = 'posted', posted_at = now(), posted_by = COALESCE($2::uuid, posted_by), updated_at = now()
       WHERE id = $1::uuid AND status = 'draft'
       RETURNING *`,
      [journalEntryId, req.user?.id || null],
    );
    if (rows.length === 0) {
      return res.status(409).json({ error: "Journal entry was modified by another operation" });
    }
    res.json({ journalEntry: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to post journal entry" });
  }
});

app.post("/api/v1/journal-entries/:id/lines", requireAuth, async (req: express.Request, res: express.Response) => {
  const lines = req.body?.lines;
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 100) return res.status(400).json({ error: "Provide between 2 and 100 journal lines." });
  try {
    const { rows: entryRows } = await req.db.query("SELECT id, project_id, status FROM journal_entries WHERE id=$1::uuid FOR UPDATE", [req.params.id]);
    if (!entryRows.length) return res.status(404).json({ error: "Journal entry not found." });
    if (!(await requireProjectPermission(req, res, entryRows[0].project_id, "accounting.create"))) return;
    if (entryRows[0].status !== "draft") return res.status(409).json({ error: "Journal lines can only be added to a draft entry." });
    const normalized = lines.map((line: any) => ({
      account_id: String(line.accountId || ""),
      debit: Number(line.debit),
      credit: Number(line.credit),
      description: typeof line.description === "string" ? line.description.slice(0, 500) : null,
      line_order: Number(line.lineOrder),
    }));
    if (normalized.some((line: any) => !/^[0-9a-f-]{36}$/i.test(line.account_id) ||
      !Number.isFinite(line.debit) || !Number.isFinite(line.credit) || line.debit < 0 || line.credit < 0 ||
      (line.debit === 0 && line.credit === 0) || (line.debit > 0 && line.credit > 0) ||
      !Number.isInteger(line.line_order) || line.line_order < 1)) {
      return res.status(400).json({ error: "Every journal line needs a valid account, one positive debit or credit, and a positive line order." });
    }
    const accountIds = [...new Set(normalized.map((line: any) => line.account_id))];
    const { rows: accounts } = await req.db.query("SELECT id FROM chart_of_accounts WHERE id=ANY($1::uuid[]) AND is_active=true", [accountIds]);
    if (accounts.length !== accountIds.length) return res.status(400).json({ error: "One or more accounts are invalid or inactive." });
    const { rows } = await req.db.query(
      `INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description,line_order,created_at)
       SELECT $1::uuid,x.account_id::uuid,x.debit,x.credit,x.description,x.line_order,now()
       FROM jsonb_to_recordset($2::jsonb) AS x(account_id text,debit numeric,credit numeric,description text,line_order integer)
       RETURNING *`,
      [req.params.id, JSON.stringify(normalized)],
    );
    return res.status(201).json({ journalLines: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/journal-lines", requireAuth, async (req: express.Request, res: express.Response) => {
  const { journalEntryId, accountId, debit, credit, description, lineOrder } = req.body;
  if (!journalEntryId || !accountId || debit === undefined || credit === undefined) return res.status(400).json({ error: "journalEntryId, accountId, debit, credit required" });
  try {
    // Verify the journal entry exists and is in draft status
    const { rows: entryRows } = await req.db.query(
      "SELECT id, project_id, status FROM journal_entries WHERE id = $1::uuid",
      [journalEntryId],
    );
    if (entryRows.length === 0) return res.status(404).json({ error: "Journal entry not found" });
    if (!(await requireProjectPermission(req, res, entryRows[0].project_id, "accounting.create"))) return;
    const debitValue = Number(debit), creditValue = Number(credit);
    if (!Number.isFinite(debitValue) || !Number.isFinite(creditValue) || debitValue < 0 || creditValue < 0 ||
        (debitValue === 0 && creditValue === 0) || (debitValue > 0 && creditValue > 0)) {
      return res.status(400).json({ error: "Each journal line must have one positive debit or credit amount, never both." });
    }
    if (entryRows[0].status !== "draft") {
      return res.status(400).json({ error: "Cannot add lines to a posted journal entry" });
    }

    // Validate account exists and is active
    const { rows: accountRows } = await req.db.query(
      "SELECT id, is_active FROM chart_of_accounts WHERE id = $1::uuid",
      [accountId],
    );
    if (accountRows.length === 0) {
      return res.status(400).json({ error: "Invalid account: account not found in chart of accounts" });
    }
    if (!accountRows[0].is_active) {
      return res.status(400).json({ error: "Invalid account: account is not active" });
    }

    const { rows } = await req.db.query(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, line_order, created_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, now()) RETURNING *`,
      [journalEntryId, accountId, debitValue, creditValue, description || null, lineOrder !== undefined ? lineOrder : 1],
    );
    res.status(201).json({ journalLine: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create journal line" });
  }
});

// AP/AR Project-scoped Finance endpoints; no bank payment execution.
app.get("/api/v1/ap-invoices", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "finance.view"))) return;
  try { const { rows } = await req.db.query("SELECT * FROM ap_invoices WHERE project_id=$1::uuid ORDER BY invoice_date DESC LIMIT 200",[projectId]); return res.json({apInvoices:rows}); }
  catch { return res.status(500).json(internalServerErrorPayload()); }
});
app.post("/api/v1/ap-invoices", requireAuth, async (req: express.Request, res: express.Response) => {
  const {projectId,supplierId,invoiceNumber,invoiceDate,dueDate,currencyCode,invoiceAmount,taxAmount=0}=req.body??{};
  const amount=Number(invoiceAmount),tax=Number(taxAmount);
  if(!projectId||!supplierId||!invoiceNumber||!invoiceDate||!currencyCode||!Number.isFinite(amount)||amount<=0||!Number.isFinite(tax)||tax<0)return res.status(400).json({error:"Valid Project, supplier, invoice/date, currency and amounts are required."});
  if(!(await requireProjectPermission(req,res,projectId,"finance.create")))return;
  try {
    const {rows:v}=await req.db.query("SELECT v.id FROM vendors v JOIN project_supplier_participation psp ON psp.vendor_id=v.id WHERE v.id=$1::uuid AND psp.project_id=$2::uuid AND psp.is_active=true AND v.is_active=true",[supplierId,projectId]);
    const {rows:c}=await req.db.query("SELECT id FROM currencies WHERE code=$1::text AND is_active=true",[currencyCode]);
    if(!v.length||!c.length)return res.status(400).json({error:"Supplier or currency is invalid or inactive."});
    const total=Math.round((amount+tax)*100)/100;
    const {rows}=await req.db.query(`INSERT INTO ap_invoices
      (project_id,supplier_id,invoice_number,invoice_date,due_date,currency_id,invoice_amount,tax_amount,total_amount,verification_status,three_way_match,paid_amount,outstanding_amount,created_by,created_at,updated_at)
      VALUES ($1::uuid,$2::uuid,$3,$4::timestamptz,$5::timestamptz,$6::uuid,$7,$8,$9,'pending',false,0,$9,$10::uuid,now(),now()) RETURNING *`,
      [projectId,supplierId,String(invoiceNumber).trim(),invoiceDate,dueDate||null,c[0].id,amount,tax,total,req.user?.id||null]);
    return res.status(201).json({apInvoice:rows[0]});
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});
app.patch("/api/v1/ap-invoices/:id/verification", requireAuth, async (req: express.Request, res: express.Response) => {
  const {verificationStatus,disputeReason}=req.body??{};
  if(!["verified","disputed"].includes(verificationStatus)||(verificationStatus==="disputed"&&!String(disputeReason||"").trim()))return res.status(400).json({error:"Use verified or disputed; disputed requires a reason."});
  try {
    const {rows:s}=await req.db.query("SELECT id,project_id,three_way_match FROM ap_invoices WHERE id=$1::uuid",[req.params.id]);
    if(!s.length)return res.status(404).json({error:"AP invoice not found."});
    if(!(await requireProjectPermission(req,res,s[0].project_id,"finance.update")))return;
    // The current schema has no Purchase Order master/workflow; only a system-calculated database flag can authorize verification.
    const matched=s[0].three_way_match===true;
    if(verificationStatus==="verified"&&!matched)return res.status(409).json({error:"Verification is blocked until the Purchase Order + Goods Receipt + Supplier Invoice matching workflow is implemented and system-verified.",code:"THREE_WAY_MATCH_WORKFLOW_REQUIRED"});
    const {rows}=await req.db.query(`UPDATE ap_invoices SET verification_status=$1,dispute_reason=CASE WHEN $1='disputed' THEN $2 ELSE NULL END,
      verified_by=$3::uuid,verified_at=now(),updated_by=$3::uuid,updated_at=now() WHERE id=$4::uuid AND project_id=$5::uuid RETURNING *`,
      [verificationStatus,disputeReason?.trim()||null,req.user?.id||null,req.params.id,s[0].project_id]);
    return res.json({apInvoice:rows[0]});
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});
app.get("/api/v1/ar-invoices", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId=typeof req.query.projectId==="string"?req.query.projectId:"";
  if(!projectId)return res.status(400).json({error:"projectId is required."});
  if(!(await requireProjectPermission(req,res,projectId,"finance.view")))return;
  try {const {rows}=await req.db.query("SELECT * FROM ar_invoices WHERE project_id=$1::uuid ORDER BY invoice_date DESC LIMIT 200",[projectId]);return res.json({arInvoices:rows});}
  catch{return res.status(500).json(internalServerErrorPayload());}
});
app.post("/api/v1/ar-invoices", requireAuth, async (req: express.Request, res: express.Response) => {
  const {projectId,buyerMasterId,invoiceNumber,invoiceDate,dueDate,currencyCode,invoiceAmount,acceptedQuantity,unit="MT",sellingPrice,relatedShipmentId}=req.body??{};
  const amount=Number(invoiceAmount),qty=acceptedQuantity===undefined?null:Number(acceptedQuantity),price=sellingPrice===undefined?null:Number(sellingPrice);
  if(!projectId||!buyerMasterId||!invoiceNumber||!invoiceDate||!currencyCode||!Number.isFinite(amount)||amount<=0||(qty!==null&&(!Number.isFinite(qty)||qty<=0))||(price!==null&&(!Number.isFinite(price)||price<0)))return res.status(400).json({error:"Valid Project, buyer, invoice, currency and amount are required."});
  if(!(await requireProjectPermission(req,res,projectId,"finance.create")))return;
  try {
    const {rows:b}=await req.db.query(`SELECT b.id FROM buyers b JOIN contract_programs cp ON cp.buyer_id=b.id JOIN projects p ON p.contract_program_id=cp.id WHERE b.id=$1::uuid AND p.id=$2::uuid AND b.is_active=true LIMIT 1`,[buyerMasterId,projectId]);
    const {rows:c}=await req.db.query("SELECT id FROM currencies WHERE code=$1::text AND is_active=true",[currencyCode]);
    if(!b.length||!c.length)return res.status(400).json({error:"Buyer is not assigned to this Project or currency is invalid."});
    if(relatedShipmentId){const {rows}=await req.db.query("SELECT id FROM shipments WHERE id=$1::uuid AND project_id=$2::uuid",[relatedShipmentId,projectId]);if(!rows.length)return res.status(400).json({error:"Shipment is not part of this Project."});}
    const {rows}=await req.db.query(`INSERT INTO ar_invoices (buyer_id,buyer_master_id,invoice_number,invoice_date,due_date,currency_id,invoice_amount,accepted_quantity,unit,selling_price,total_amount,project_id,related_shipment_id,approval_status,settlement_status,created_by,created_at,updated_at)
      VALUES (NULL,$1::uuid,$2,$3::timestamptz,$4::timestamptz,$5::uuid,$6,$7,$8,$9,$6,$10::uuid,$11::uuid,'pending','open',$12::uuid,now(),now()) RETURNING *`,
      [buyerMasterId,String(invoiceNumber).trim(),invoiceDate,dueDate||null,c[0].id,amount,qty,unit,price,projectId,relatedShipmentId||null,req.user?.id||null]);
    return res.status(201).json({arInvoice:rows[0]});
  } catch{return res.status(500).json(internalServerErrorPayload());}
});
app.patch("/api/v1/ar-invoices/:id/approval", requireAuth, async (req: express.Request, res: express.Response) => {
  const {approvalStatus,reason}=req.body??{};
  if(!["approved","disputed"].includes(approvalStatus)||(approvalStatus==="disputed"&&!String(reason||"").trim()))return res.status(400).json({error:"Use approved or disputed; disputed requires a reason."});
  try {
    const {rows:s}=await req.db.query("SELECT id,project_id FROM ar_invoices WHERE id=$1::uuid",[req.params.id]);
    if(!s.length)return res.status(404).json({error:"AR invoice not found."});
    if(!(await requireProjectPermission(req,res,s[0].project_id,"finance.update")))return;
    const {rows}=await req.db.query(`UPDATE ar_invoices SET approval_status=$1,dispute_reason=$2,approved_by=$3::uuid,approved_at=now(),updated_by=$3::uuid,updated_at=now()
      WHERE id=$4::uuid AND project_id=$5::uuid RETURNING *`,[approvalStatus,reason?.trim()||null,req.user?.id||null,req.params.id,s[0].project_id]);
    return res.json({arInvoice:rows[0]});
  } catch{return res.status(500).json(internalServerErrorPayload());}
});
// ============================================
// RAB routes (P07 Finance)
// ============================================
app.get("/api/v1/rab", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required.", code: "PROJECT_ID_REQUIRED" });
  if (!(await requireProjectPermission(req, res, projectId, "finance.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT id, project_id, description, category, amount, version, is_active, created_at, updated_at
       FROM rab
       WHERE project_id = $1::uuid AND is_active = true
       ORDER BY created_at DESC LIMIT 200`,
      [projectId],
    );
    res.json({ rab: rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      description: r.description,
      category: r.category,
      amount: r.amount,
      version: r.version,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/rab", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, description, category, amount, version } = req.body;
  if (!projectId || !description || !category || amount === undefined) {
    return res.status(400).json({ error: "Required fields: projectId, description, category, amount" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "finance.create"))) return;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO rab (project_id, description, category, amount, version, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, true, now(), now()) RETURNING *`,
      [projectId, description, category, Number(amount), version || 1],
    );
    res.status(201).json({ rabItem: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// ============================================
// Chart of accounts routes (P07 GL)
// ============================================
app.get("/api/v1/chart-of-accounts", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      "SELECT id, code, name, description, parent_id, account_type, is_active, created_at, updated_at FROM chart_of_accounts WHERE is_active = true ORDER BY code",
    );
    res.json({ accounts: rows });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/chart-of-accounts", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { code, name, description, parentId, accountType } = req.body;
  if (!code || !name || !accountType) return res.status(400).json({ error: "Required fields: code, name, accountType" });
  try {
    const { rows } = await req.db.query(
      `INSERT INTO chart_of_accounts (code, name, description, parent_id, account_type, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4::uuid, $5, true, now(), now()) RETURNING *`,
      [code, name, description || null, parentId || null, accountType],
    );
    res.status(201).json({ account: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// ============================================
// Finance reporting-only workflow (F1)
// Finance records reports; the application does not execute payments.
// ============================================
app.get("/api/v1/finance/reports", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  if (!(await requireProjectPermission(req, res, projectId, "reports.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT id, project_id, template_id, template_version, period_start, period_end,
              report_payload, requested_by, submitted_at, generated_at, data_freshness, status
         FROM report_runs
        WHERE project_id = $1::uuid AND template_id = 'tpl-financial-report'
        ORDER BY submitted_at DESC NULLS LAST, generated_at DESC
        LIMIT 200`,
      [projectId],
    );
    return res.json({ reports: rows });
  } catch (error) {
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/finance/reports", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, periodStart, periodEnd, report, summary } = req.body ?? {};
  if (typeof projectId !== "string" || !projectId ||
      typeof periodStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) ||
      typeof periodEnd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ||
      periodStart > periodEnd || !report || typeof report !== "object" || Array.isArray(report)) {
    return res.status(400).json({ error: "Required: projectId, valid periodStart/periodEnd, and report object." });
  }
  const payload = JSON.stringify({ summary: typeof summary === "string" ? summary.slice(0, 4000) : "", report });
  if (payload.length > 200_000) return res.status(413).json({ error: "Financial report payload exceeds 200 KB." });
  if (!(await requireProjectPermission(req, res, projectId, "reports.create"))) return;
  const requesterId = req.user?.id;
  if (!requesterId) return res.status(401).json({ error: "Authenticated principal required" });
  try {
    const { rows: financeMembership } = await req.db.query(
      `SELECT 1
         FROM public.project_role_assignments a
         JOIN public.project_members pm
           ON pm.id = a.project_member_id AND pm.project_id = a.project_id AND pm.user_id = a.user_id
         JOIN public.project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
         JOIN public.users u ON u.id = a.user_id
        WHERE a.project_id = $1::uuid AND a.user_id = $2::uuid
          AND a.is_active = true AND a.revoked_at IS NULL
          AND (a.expires_at IS NULL OR a.expires_at > now())
          AND pm.is_active = true AND pm.deactivated_at IS NULL
          AND (pm.expires_at IS NULL OR pm.expires_at > now())
          AND pr.is_active = true AND pr.role_code = 'finance' AND u.is_active = true
        LIMIT 1`,
      [projectId, requesterId],
    );
    if (!financeMembership.length) {
      return res.status(403).json({ error: "Only an active Finance member can submit a Project financial report.", code: "FINANCE_ROLE_REQUIRED" });
    }
    const { rows: projectRows } = await req.db.query(
      "SELECT id, name FROM projects WHERE id = $1::uuid AND is_active = true LIMIT 1",
      [projectId],
    );
    if (!projectRows.length) return res.status(404).json({ error: "Active Project not found." });
    const { rows: reportRows } = await req.db.query(
      `INSERT INTO report_runs
        (id, schedule_id, template_id, template_version, cutoff_at, generated_at,
         requested_by, audience, project_id, status, idempotency_key, data_freshness,
         report_payload, period_start, period_end, submitted_at)
       VALUES (gen_random_uuid(), NULL, 'tpl-financial-report', 1, $1::date::timestamptz,
         now(), $2::uuid, 'project_management', $3::uuid, 'submitted',
         NULL, now(), $4::jsonb, $5::date, $6::date, now())
       RETURNING id, project_id, template_id, template_version, period_start, period_end,
                 report_payload, requested_by, submitted_at, generated_at, data_freshness, status`,
      [periodEnd, requesterId, projectId, payload, periodStart, periodEnd],
    );
    const reportRun = reportRows[0];
    const { rows: notificationRows } = await req.db.query(
      "SELECT public.pke_submit_finance_report_notifications($1::uuid, $2::uuid, $3::text, $4::text) AS notifications_created",
      [projectId, requesterId,
       `Laporan keuangan baru — ${projectRows[0].name}`,
       `Finance mengirim laporan periode ${periodStart} sampai ${periodEnd}. Laporan siap ditinjau.`],
    );
    return res.status(201).json({
      financialReport: reportRun,
      notificationsCreated: Number(notificationRows[0]?.notifications_created ?? 0),
      notifiedRoles: ["pm", "admin"],
      paymentExecution: false,
    });
  } catch (error) {
    return res.status(500).json(internalServerErrorPayload());
  }
});

// Cash Advance requestor → independent Finance decision vertical slice.
app.get("/api/v1/currencies",requireAuth,async(req:express.Request,res:express.Response)=>{
  try{const {rows}=await req.db.query("SELECT id,code,name,is_functional FROM public.currencies WHERE is_active=true ORDER BY is_functional DESC,code");return res.json({currencies:rows});}
  catch{return res.status(500).json(internalServerErrorPayload());}
});
app.get("/api/v1/cash-advances",requireAuth,async(req:express.Request,res:express.Response)=>{
  const projectId=typeof req.query.projectId==="string"?req.query.projectId:"";
  if(!projectId)return res.status(400).json({error:"projectId is required."});
  try{
    const permission=await findExplicitProjectPermission(req,projectId,["finance.view","finance.cash_advance.request"]);
    if(!permission)return res.status(403).json({error:"Explicit active Project role permission required.",code:"PROJECT_PERMISSION_REQUIRED"});
    await applyExplicitProjectPermissionContext(req,projectId,permission);
    const decisionPermission=await findExplicitProjectPermission(req,projectId,["finance.update"]);
    const {rows}=await listCashAdvances(req.db,projectId);
    return res.json({cashAdvances:rows,
      canRequest:Boolean(await findExplicitProjectPermission(req,projectId,["finance.cash_advance.request"])),
      canApprove:decisionPermission?.role_code==="finance",
      canViewAll:Boolean(await findExplicitProjectPermission(req,projectId,["finance.view"]))});
  }catch{return res.status(500).json(internalServerErrorPayload());}
});
app.post("/api/v1/cash-advances",requireAuth,async(req:express.Request,res:express.Response)=>{
  const {projectId,amount,currencyId,purpose,advanceDate}=req.body??{};
  if(typeof projectId!=="string"||!projectId||!isValidCashAdvanceRequest({amount,currencyId,purpose,advanceDate}))
    return res.status(400).json({error:"projectId, positive amount, valid currencyId, purpose and advanceDate are required.",code:"INVALID_CASH_ADVANCE_REQUEST"});
  try{
    const permission=await findExplicitProjectPermission(req,projectId,["finance.cash_advance.request"]);
    if(!permission)return res.status(403).json({error:"Cash Advance request permission is not assigned to this active Project role.",code:"CASH_ADVANCE_REQUEST_PERMISSION_REQUIRED"});
    await applyExplicitProjectPermissionContext(req,projectId,permission);
    const {rows:projects}=await req.db.query("SELECT id FROM public.projects WHERE id=$1::uuid AND is_active=true",[projectId]);
    if(!projects.length)return res.status(404).json({error:"Active Project not found."});
    const {rows:currencies}=await req.db.query("SELECT id FROM public.currencies WHERE id=$1::uuid AND is_active=true",[currencyId]);
    if(!currencies.length)return res.status(400).json({error:"Currency is invalid or inactive."});
    const cashAdvance=await createCashAdvance(req.db,{projectId,requestorId:req.user.id,amount:Number(amount),currencyId,purpose:purpose.trim(),advanceDate});
    return res.status(201).json({cashAdvance});
  }catch(error:any){
    if(error?.code==="42501")return res.status(403).json({error:"Database RLS/requestor guard rejected the request.",code:"CASH_ADVANCE_RLS_DENIED"});
    if(error?.code==="23503")return res.status(400).json({error:"Invalid Project or currency reference."});
    return res.status(500).json(internalServerErrorPayload());
  }
});
app.patch("/api/v1/cash-advances/:id/decision",requireAuth,async(req:express.Request,res:express.Response)=>{
  const decision=req.body?.decision;
  if(decision!=="approved"&&decision!=="rejected")return res.status(400).json({error:"decision must be approved or rejected."});
  try{
    const {rows}=await req.db.query("SELECT id,project_id,requestor_id,approval_status FROM public.cash_advances WHERE id=$1::uuid",[req.params.id]);
    if(!rows.length)return res.status(404).json({error:"Cash Advance not found in an accessible Project."});
    const current=rows[0],permission=await findExplicitProjectPermission(req,current.project_id,["finance.update"]);
    if(!permission||permission.role_code!=="finance")return res.status(403).json({error:"Only an explicitly assigned Project Finance role may decide Cash Advances.",code:"FINANCE_DECISION_ROLE_REQUIRED"});
    if(!canDecideCashAdvance({actorId:req.user.id,requestorId:current.requestor_id,roleCode:permission.role_code,currentStatus:current.approval_status,decision}))
      return res.status(409).json({error:"Maker-checker or state-transition rule rejected this decision.",code:"CASH_ADVANCE_DECISION_CONFLICT"});
    await applyExplicitProjectPermissionContext(req,current.project_id,permission);
    const cashAdvance=await decideCashAdvance(req.db,{id:current.id,projectId:current.project_id,actorId:req.user.id,decision});
    if(!cashAdvance)return res.status(409).json({error:"Cash Advance changed; refresh before deciding.",code:"CASH_ADVANCE_STATE_CHANGED"});
    return res.json({cashAdvance});
  }catch(error:any){
    if(error?.code==="42501")return res.status(403).json({error:"Database maker-checker/RLS guard rejected this decision.",code:"CASH_ADVANCE_RLS_DENIED"});
    return res.status(500).json(internalServerErrorPayload());
  }
});

// Payment execution endpoints are intentionally out of scope. Finance is reporting-only.
const paymentExecutionOutOfScope = (_req: express.Request, res: express.Response) =>
  res.status(410).json({
    error: "Payment execution is outside this application's Finance scope.",
    code: "PAYMENT_EXECUTION_OUT_OF_SCOPE",
    available: false,
    financeScope: "reporting_only",
  });
app.get("/api/v1/payment-instructions", requireAuth, paymentExecutionOutOfScope);
app.post("/api/v1/payment-instructions", requireAuth, paymentExecutionOutOfScope);
app.patch("/api/v1/payment-instructions/:id", requireAuth, paymentExecutionOutOfScope);

// ============================================
// Export compliance document routes (P08)
// ============================================

// Regulatory sources
app.get("/api/v1/regulatory-sources", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      `SELECT id, source_id, title, issuing_authority, jurisdiction, document_type,
              regulation_number, article_annex_section, publication_date, effective_date,
              expiry_repeal_date, status, official_url, source_file_reference, source_checksum,
              date_retrieved, last_reviewed, reviewer_id, verification_status,
              created_at, updated_at
       FROM regulatory_sources ORDER BY created_at DESC LIMIT 200`,
    );
    res.json({ regulatorySources: rows.map((r: any) => ({
      id: r.id,
      sourceId: r.source_id,
      title: r.title,
      issuingAuthority: r.issuing_authority,
      jurisdiction: r.jurisdiction,
      documentType: r.document_type,
      regulationNumber: r.regulation_number,
      articleAnnexSection: r.article_annex_section,
      publicationDate: r.publication_date,
      effectiveDate: r.effective_date,
      expiryRepealDate: r.expiry_repeal_date,
      status: r.status,
      officialUrl: r.official_url,
      sourceFileReference: r.source_file_reference,
      sourceChecksum: r.source_checksum,
      dateRetrieved: r.date_retrieved,
      lastReviewed: r.last_reviewed,
      reviewerId: r.reviewer_id,
      verificationStatus: r.verification_status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load regulatory sources" });
  }
});

app.post("/api/v1/regulatory-sources", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { sourceId, title, issuingAuthority, jurisdiction, documentType, regulationNumber,
    articleAnnexSection, publicationDate, effectiveDate, expiryRepealDate, status,
    officialUrl, sourceFileReference, sourceChecksum, dateRetrieved, lastReviewed,
    verificationStatus } = req.body ?? {};
  if (!sourceId || !title || !issuingAuthority || !jurisdiction || !effectiveDate) {
    return res.status(400).json({ error: "Required fields: sourceId, title, issuingAuthority, jurisdiction, effectiveDate" });
  }
  try {
    const reviewerId = req.user?.id || null;
    const { rows } = await req.db.query(
      `INSERT INTO regulatory_sources (source_id, title, issuing_authority, jurisdiction,
        document_type, regulation_number, article_annex_section, publication_date,
        effective_date, expiry_repeal_date, status, official_url, source_file_reference,
        source_checksum, date_retrieved, last_reviewed, reviewer_id, verification_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [sourceId, title, issuingAuthority, jurisdiction, documentType || null, regulationNumber || null,
        articleAnnexSection || null, publicationDate || null, effectiveDate,
        expiryRepealDate || null, status || "draft", officialUrl || null,
        sourceFileReference || null, sourceChecksum || null, dateRetrieved || null,
        lastReviewed || null, reviewerId, verificationStatus || "pending"],
    );
    res.status(201).json({ regulatorySource: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create regulatory source" });
  }
});

// Export document types
// Export document types
// ============================================
app.get("/api/v1/export-document-types", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      "SELECT id, document_type_id, document_name, document_category, description, is_active, created_at, updated_at FROM export_document_types ORDER BY created_at DESC LIMIT 200",
    );
    res.json({ exportDocumentTypes: rows.map((r: any) => ({
      id: r.id,
      documentTypeId: r.document_type_id,
      documentName: r.document_name,
      documentCategory: r.document_category,
      description: r.description,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load export document types" });
  }
});

app.post("/api/v1/export-document-types", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { documentTypeId, documentName, documentCategory, description } = req.body ?? {};
  if (!documentTypeId || !documentName) {
    return res.status(400).json({ error: "Required fields: documentTypeId, documentName" });
  }
  try {
    const { rows } = await req.db.query(
      `INSERT INTO export_document_types (document_type_id, document_name, document_category, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [documentTypeId, documentName, documentCategory || null, description || null],
    );
    res.status(201).json({ documentType: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create export document type" });
  }
});

// Country export document requirements
app.get("/api/v1/country-export-document-requirements", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      `SELECT cdr.id, cdr.country_code, cdr.document_type_id, edt.document_name,
              cdr.importing_authority, cdr.mandatory, cdr.status, cdr.effective_from,
              cdr.effective_to, cdr.official_source_url, cdr.notes, cdr.last_verified_at,
              cdr.created_at, cdr.updated_at
       FROM country_export_document_requirements cdr
       JOIN export_document_types edt ON edt.id = cdr.document_type_id
       ORDER BY cdr.created_at DESC LIMIT 200`,
    );
    res.json({ countryExportDocumentRequirements: rows.map((r: any) => ({
      id: r.id,
      countryCode: r.country_code,
      documentTypeId: r.document_type_id,
      documentName: r.document_name,
      importingAuthority: r.importing_authority,
      mandatory: r.mandatory,
      status: r.status,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      officialSourceUrl: r.official_source_url,
      notes: r.notes,
      lastVerifiedAt: r.last_verified_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load country export document requirements" });
  }
});

app.post("/api/v1/country-export-document-requirements", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { countryCode, documentTypeId, importingAuthority, mandatory, status, effectiveFrom, effectiveTo, officialSourceUrl, notes } = req.body ?? {};
  if (!countryCode || !documentTypeId) {
    return res.status(400).json({ error: "Required fields: countryCode, documentTypeId" });
  }
  try {
    const { rows } = await req.db.query(
      `INSERT INTO country_export_document_requirements (country_code, document_type_id, importing_authority,
        mandatory, status, effective_from, effective_to, official_source_url, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [countryCode, documentTypeId, importingAuthority || null, mandatory !== undefined ? mandatory : true,
        status || "active", effectiveFrom || null, effectiveTo || null, officialSourceUrl || null, notes || null],
    );
    res.status(201).json({ countryRequirement: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create country export document requirement" });
  }
});

// Project export document requirements
app.get("/api/v1/project-export-document-requirements", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  if (!(await requireProjectPermission(req, res, projectId, "documents.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT per.id, per.project_id, per.country_requirement_id, per.is_required,
              per.status, per.override_reason, per.overridden_by, per.created_at, per.updated_at,
              cdr.country_code, cdr.document_type_id, edt.document_name, edt.document_category
       FROM project_export_document_requirements per
       JOIN country_export_document_requirements cdr ON cdr.id = per.country_requirement_id
       JOIN export_document_types edt ON edt.id = cdr.document_type_id
       WHERE per.project_id = $1::uuid
       ORDER BY per.created_at DESC LIMIT 200`,
      [projectId],
    );
    res.json({ projectDocumentRequirements: rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      countryRequirementId: r.country_requirement_id,
      countryCode: r.country_code,
      documentTypeId: r.document_type_id,
      documentName: r.document_name,
      documentCategory: r.document_category,
      isRequired: r.is_required,
      status: r.status,
      overrideReason: r.override_reason,
      overriddenBy: r.overridden_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load project export document requirements" });
  }
});

app.post("/api/v1/project-export-document-requirements", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, countryRequirementId, isRequired, status, overrideReason } = req.body ?? {};
  if (!projectId || !countryRequirementId) {
    return res.status(400).json({ error: "Required fields: projectId, countryRequirementId" });
  }
  if (!(await requireProjectPermission(req, res, String(projectId), "documents.create"))) return;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO project_export_document_requirements (project_id, country_requirement_id, is_required, status, override_reason)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5) RETURNING *`,
      [projectId, countryRequirementId, isRequired !== undefined ? isRequired : true, status || "required", overrideReason || null],
    );
    res.status(201).json({ projectDocumentRequirement: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create project export document requirement" });
  }
});

// Project export documents
app.get("/api/v1/project-export-documents", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  if (!(await requireProjectPermission(req, res, projectId, "documents.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT d.id, d.project_id, d.project_requirement_id, d.file_reference, d.object_key,
              d.original_filename, d.mime_type, d.sha256_checksum, d.version_no, d.status,
              d.uploaded_by, d.reviewed_by, d.uploaded_at, d.reviewed_at, d.expiry_date, d.notes,
              d.created_at, d.updated_at,
              per.country_requirement_id, cdr.country_code, edt.document_name
       FROM project_export_documents d
       JOIN project_export_document_requirements per ON per.id = d.project_requirement_id
       JOIN country_export_document_requirements cdr ON cdr.id = per.country_requirement_id
       JOIN export_document_types edt ON edt.id = cdr.document_type_id
       WHERE d.project_id = $1::uuid
       ORDER BY d.uploaded_at DESC LIMIT 200`,
      [projectId],
    );
    res.json({ projectExportDocuments: rows.map((r: any) => ({
      id: r.id, projectId: r.project_id, projectRequirementId: r.project_requirement_id,
      countryRequirementId: r.country_requirement_id, countryCode: r.country_code, documentName: r.document_name,
      fileReference: r.file_reference, objectKey: r.object_key, originalFilename: r.original_filename,
      mimeType: r.mime_type, sha256Checksum: r.sha256_checksum, versionNo: r.version_no, status: r.status,
      uploadedBy: r.uploaded_by, reviewedBy: r.reviewed_by, uploadedAt: r.uploaded_at, reviewedAt: r.reviewed_at,
      expiryDate: r.expiry_date, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load project export documents" });
  }
});

app.post("/api/v1/project-export-documents", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, projectRequirementId, fileReference, objectKey, originalFilename,
    mimeType, sha256Checksum, versionNo, expiryDate, notes } = req.body ?? {};
  if (!projectId || !projectRequirementId || !fileReference || !objectKey || !originalFilename) {
    return res.status(400).json({ error: "Required fields: projectId, projectRequirementId, fileReference, objectKey, originalFilename" });
  }
  if (!(await requireProjectPermission(req, res, String(projectId), "documents.create"))) return;
  const key = String(objectKey);
  if (!key.startsWith(`projects/${projectId}/`)) {
    return res.status(400).json({ error: "Invalid object key namespace", code: "INVALID_OBJECT_KEY" });
  }
  try {
    const { rows: reqRows } = await req.db.query(
      "SELECT id FROM project_export_document_requirements WHERE id = $1::uuid AND project_id = $2::uuid",
      [projectRequirementId, projectId],
    );
    if (reqRows.length === 0) return res.status(404).json({ error: "Not found" });
    const { rows } = await req.db.query(
      `INSERT INTO project_export_documents (project_id, project_requirement_id, file_reference,
        object_key, original_filename, mime_type, sha256_checksum, version_no, expiry_date, notes,
        uploaded_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11::uuid, now(), now())
       RETURNING *`,
      [projectId, projectRequirementId, fileReference, key, originalFilename,
        mimeType || null, sha256Checksum || null, versionNo || 1, expiryDate || null,
        notes || null, req.user?.id || null],
    );
    res.status(201).json({ projectExportDocument: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create project export document" });
  }
});

app.patch("/api/v1/project-export-documents/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { status, notes } = req.body ?? {};
  if (!status) return res.status(400).json({ error: "Required field: status" });
  const allowed = ["uploaded", "under_review", "approved", "rejected", "expired", "superseded"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Allowed: ${allowed.join(", ")}` });
  }
  try {
    const { rows: existingRows } = await req.db.query(
      "SELECT id, project_id FROM project_export_documents WHERE id = $1::uuid",
      [req.params.id],
    );
    if (existingRows.length === 0) return res.status(404).json({ error: "Not found" });
    if (!(await requireProjectPermission(req, res, existingRows[0].project_id, "documents.update"))) return;
    const reviewerId = req.user?.id || null;
    const { rows } = await req.db.query(
      `UPDATE project_export_documents
       SET status = $1, notes = COALESCE($2, notes), reviewed_by = $3::uuid,
           reviewed_at = CASE WHEN $1 IN ('approved', 'rejected') THEN now() ELSE reviewed_at END,
           updated_at = now()
       WHERE id = $4::uuid RETURNING *`,
      [status, notes || null, reviewerId, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json({ document: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to update document" });
  }
});

// ============================================
// Notification routes (P11)
// ============================================

app.get("/api/v1/buyers/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM buyers WHERE id = $1::uuid", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Buyer not found" });
    res.json({ buyer: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to load buyer" });
  }
});

app.get("/api/v1/contracts/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows: scopeRows } = await req.db.query(
      "SELECT project_id FROM contracts WHERE id = $1::uuid AND project_id IS NOT NULL",
      [req.params.id],
    );
    if (scopeRows.length === 0) return res.status(404).json({ error: "Contract not found in an accessible Project." });
    const projectId = scopeRows[0].project_id;
    if (!(await requireProjectPermission(req, res, projectId, "contract.view"))) return;
    const { rows } = await req.db.query(
      "SELECT * FROM contracts WHERE id = $1::uuid AND project_id = $2::uuid",
      [req.params.id, projectId],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Contract not found in this Project." });
    return res.json({ contract: rows[0] });
  } catch (error) {
    return res.status(500).json(internalServerErrorPayload());
  }
});

// ============================================
// Admin routes
// ============================================
app.get("/api/v1/users", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      "SELECT user_id AS id, email, name, role, is_active, neon_auth_user_id, created_at, updated_at FROM public.pke_admin_list_users($1::integer, $2::integer)",
      [100, 0],
    );
    res.json({ users: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load users" });
  }
});

// Admin provisioning creates a PKE pending account first. The browser then uses the Neon SDK Admin
// createUser operation; only the signed user.created webhook may link the provider identity.
app.post("/api/v1/admin/users/provision", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  if (process.env.NEON_AUTH_ADMIN_PROVISIONING_READY !== "true" || process.env.NEON_AUTH_WEBHOOK_ENABLED !== "true") {
    return res.status(503).json({ error: "Admin provisioning is not enabled for this environment.", code: "PROVISIONING_NOT_READY" });
  }
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!email || !name || reason.length < 5) {
    return res.status(400).json({ error: "Email, name, and an audit reason of at least five characters are required.", code: "INVALID_PROVISION_INPUT" });
  }
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM public.pke_admin_provision_user($1::text, $2::text, $3::text)",
      [email, name, reason],
    );
    return res.status(201).json({ user: rows[0] });
  } catch (error: any) {
    const code = typeof error?.code === "string" ? error.code : "";
    if (code === "23505") return res.status(409).json({ error: "Email already belongs to an existing or linked PKE account.", code: "USER_ALREADY_EXISTS" });
    if (code === "22023") return res.status(400).json({ error: "Provisioning input is invalid.", code: "INVALID_PROVISION_INPUT" });
    if (code === "42501") return res.status(403).json({ error: "Platform Admin authorization is required.", code: "ADMIN_REQUIRED" });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/admin/projects/:projectId/members", requireAuth, requireAdmin, async (_req: express.Request, res: express.Response) => {
  return res.status(403).json({
    error: "Platform Admin may appoint or replace the Project Manager only. Project role staffing is decided by the PM.",
    code: "PLATFORM_ADMIN_PM_APPOINTMENT_ONLY",
  });
});

app.get("/api/v1/admin/projects/:projectId/pm-governance", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const projectId = req.params.projectId as string;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(projectId)) {
    return res.status(400).json({ error: "Valid Project id is required.", code: "INVALID_PROJECT_ID" });
  }
  try {
    const { rows: projectRows } = await req.db.query(
      "SELECT id, name, is_active FROM public.projects WHERE id = $1::uuid",
      [projectId],
    );
    if (projectRows.length !== 1) return res.status(404).json({ error: "Project not found.", code: "PROJECT_NOT_FOUND" });
    const { rows: members } = await req.db.query(
      `SELECT pm.id, pm.user_id, u.email, u.name, pm.is_active, pm.joined_at,
              pm.expires_at, pm.deactivated_at,
              COALESCE(assignments.roles, '[]'::jsonb) AS role_assignments
         FROM public.project_members pm
         JOIN public.users u ON u.id = pm.user_id
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(jsonb_build_object(
             'id', a.id, 'projectRoleId', a.project_role_id,
             'roleCode', pr.role_code, 'roleName', pr.name,
             'isActive', a.is_active, 'expiresAt', a.expires_at, 'revokedAt', a.revoked_at
           ) ORDER BY a.created_at DESC) AS roles
             FROM public.project_role_assignments a
             JOIN public.project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
            WHERE a.project_member_id = pm.id AND pr.role_code = 'pm'
         ) assignments ON true
        WHERE pm.project_id = $1::uuid
        ORDER BY u.email`,
      [projectId],
    );
    const { rows: roles } = await req.db.query(
      `SELECT id, role_code, name, description, is_active
         FROM public.project_roles
        WHERE project_id = $1::uuid AND role_code = 'pm'
        ORDER BY role_code`,
      [projectId],
    );
    return res.json({ project: projectRows[0], members, roles });
  } catch (error: any) {
    logger.error("Platform Admin PM governance read failed:", { code: error?.code || "UNKNOWN" });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/admin/projects/:projectId/pm-appointment", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;
  const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
  const replaceUserId = typeof req.body?.replaceUserId === "string" ? req.body.replaceUserId : "";
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(projectId) || !uuidPattern.test(userId) || (replaceUserId && !uuidPattern.test(replaceUserId)) || reason.length < 5) {
    return res.status(400).json({ error: "Valid Project, PM user and audit reason (at least 5 characters) are required.", code: "INVALID_PM_APPOINTMENT_INPUT" });
  }
  try {
    await req.db.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':pm-appointment', 0))",
      [projectId],
    );
    const { rows: projectRows } = await req.db.query(
      "SELECT id, name FROM public.projects WHERE id = $1::uuid AND is_active = true FOR UPDATE",
      [projectId],
    );
    if (projectRows.length !== 1) return res.status(404).json({ error: "Active Project not found.", code: "PROJECT_NOT_FOUND" });

    const { rows: userRows } = await req.db.query(
      "SELECT user_id, email, is_active, neon_auth_user_id FROM public.pke_admin_get_user($1::uuid)",
      [userId],
    );
    if (userRows.length !== 1) return res.status(404).json({ error: "PKE user not found.", code: "USER_NOT_FOUND" });
    if (userRows[0].is_active !== true || !userRows[0].neon_auth_user_id) {
      return res.status(409).json({ error: "PM must have an active PKE account and linked Neon Auth identity.", code: "PM_USER_NOT_READY" });
    }

    let { rows: pmRoleRows } = await req.db.query(
      "SELECT id FROM public.project_roles WHERE project_id = $1::uuid AND role_code = 'pm' AND is_active = true LIMIT 1 FOR UPDATE",
      [projectId],
    );
    if (pmRoleRows.length !== 1) {
      const pmTemplate = getCanonicalRoleTemplate("pm");
      if (!pmTemplate) return res.status(500).json({ error: "Canonical PM template is unavailable.", code: "PM_TEMPLATE_UNAVAILABLE" });
      const { rows: permissionRows } = await req.db.query(
        "SELECT id, code FROM public.permissions WHERE code = ANY($1::text[]) AND is_active = true",
        [pmTemplate.permissionCodes],
      );
      const found = new Set(permissionRows.map((row: any) => row.code));
      const missing = pmTemplate.permissionCodes.filter((code) => !found.has(code));
      if (missing.length) return res.status(503).json({ error: "PM template permission catalogue is incomplete.", code: "ROLE_TEMPLATE_PERMISSION_CATALOG_INCOMPLETE", missingPermissionCodes: missing });
      const { rows: created } = await req.db.query(
        `INSERT INTO public.project_roles
           (project_id, role_code, name, description, is_active, created_by, created_at, updated_at)
         VALUES ($1::uuid, 'pm', $2::text, $3::text, true, $4::uuid, now(), now())
         ON CONFLICT (project_id, role_code) DO UPDATE SET is_active = true, updated_at = now()
         RETURNING id`,
        [projectId, pmTemplate.label, pmTemplate.restrictions.join(" "), req.user?.id],
      );
      pmRoleRows = created;
      await req.db.query(
        `INSERT INTO public.project_role_permissions
           (project_id, project_role_id, permission_id, granted_by, granted_at)
         SELECT $1::uuid, $2::uuid, p.id, $3::uuid, now()
           FROM public.permissions p
          WHERE p.code = ANY($4::text[]) AND p.is_active = true
         ON CONFLICT (project_role_id, permission_id) DO NOTHING`,
        [projectId, pmRoleRows[0].id, req.user?.id, pmTemplate.permissionCodes],
      );
    }
    const pmRoleId = pmRoleRows[0].id;

    const { rows: currentRows } = await req.db.query(
      `SELECT pm.id AS member_id, a.id AS assignment_id, a.user_id,
              a.project_role_id, a.is_active, a.expires_at, u.email, pr.role_code
         FROM public.project_role_assignments a
         JOIN public.project_members pm ON pm.id = a.project_member_id
         JOIN public.project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
         JOIN public.users u ON u.id = a.user_id
        WHERE a.project_id = $1::uuid AND pr.role_code = 'pm'
          AND a.is_active = true AND a.revoked_at IS NULL
          AND (a.expires_at IS NULL OR a.expires_at > now())
          AND pm.is_active = true AND pm.deactivated_at IS NULL
          AND (pm.expires_at IS NULL OR pm.expires_at > now())
        FOR UPDATE OF a, pm`,
      [projectId],
    );
    const current = currentRows[0] ?? null;
    const pmDecision = evaluatePmAppointment(currentRows, userId, replaceUserId || null);
    if (pmDecision.ok === false) {
      if (pmDecision.code === "MULTIPLE_ACTIVE_PM_ASSIGNMENTS") {
        return res.status(409).json({ error: "More than one active PM exists; Admin must explicitly reconcile appointments before continuing.", code: pmDecision.code });
      }
      return res.status(409).json({
        error: "An active PM is already appointed. Supply its exact userId as replaceUserId to perform an audited handover.",
        code: pmDecision.code,
        currentPm: current ? { userId: current.user_id, email: current.email } : null,
      });
    }
    if (pmDecision.idempotent) {
      return res.status(200).json({ appointment: { projectId, userId, roleCode: "pm", status: "active" }, idempotentReplay: true });
    }

    const { rows: candidateMemberships } = await req.db.query(
      "SELECT id, project_role_id, is_active, deactivated_at, expires_at FROM public.project_members WHERE project_id = $1::uuid AND user_id = $2::uuid FOR UPDATE",
      [projectId, userId],
    );
    if (candidateMemberships.length > 1) return res.status(409).json({ error: "Duplicate Project membership requires reconciliation.", code: "DUPLICATE_PROJECT_MEMBERSHIP" });
    const candidateMembership = candidateMemberships[0] ?? null;
    // Existing membership and role assignments are independent; appointing PM must not replace another role.
    if (candidateMembership && (candidateMembership.is_active !== true || candidateMembership.deactivated_at != null ||
        (candidateMembership.expires_at && new Date(candidateMembership.expires_at).getTime() <= Date.now()))) {
      return res.status(409).json({ error: "Project membership is inactive or expired. Admin must explicitly reactivate membership before appointing this user as PM.", code: "MEMBERSHIP_REACTIVATION_REQUIRED" });
    }

    if (current && current.user_id !== userId) {
      const { rows: oldRows } = await req.db.query(
        `UPDATE public.project_role_assignments
            SET is_active = false, revoked_at = now(), revoked_by = $2::uuid,
                revoke_reason = $3::text, updated_at = now()
          WHERE id = $1::uuid AND revoked_at IS NULL RETURNING *`,
        [current.assignment_id, req.user?.id, reason],
      );
      await req.db.query(
        `INSERT INTO public.audit_events
           (actor_user_id, actor_type, actor_role, action, target_type, target_id, project_id,
            reason, before_snapshot, after_snapshot, metadata, outcome)
         VALUES ($1::uuid, 'user', 'platform_admin', 'project.pm.unappointed', 'project_pm_appointment',
                 $2::uuid, $3::uuid, $4::text, $5::jsonb, $6::jsonb, $7::jsonb, 'success')`,
        [req.user?.id, current.assignment_id, projectId, reason, JSON.stringify(current),
         JSON.stringify({ is_active: false, revoked_at: oldRows[0]?.revoked_at, revoked_by: oldRows[0]?.revoked_by }),
         JSON.stringify({ previousPmUserId: current.user_id, nextPmUserId: userId })],
      );
    }

    let appointed;
    if (candidateMembership) {
      appointed = candidateMembership;
    } else {
      const { rows } = await req.db.query(
        `INSERT INTO public.project_members
           (project_id, user_id, project_role_id, is_active, joined_at, updated_at)
         VALUES ($1::uuid, $2::uuid, NULL, true, now(), now()) RETURNING *`,
        [projectId, userId],
      );
      appointed = rows[0];
    }
    await req.db.query(
      `UPDATE public.project_role_assignments
          SET is_active = false, updated_at = now()
        WHERE project_id = $1::uuid AND project_member_id = $2::uuid
          AND project_role_id = $3::uuid AND is_active = true
          AND revoked_at IS NULL AND expires_at IS NOT NULL AND expires_at <= now()`,
      [projectId, appointed.id, pmRoleId],
    );
    const { rows: assignmentResult } = await req.db.query(
      `INSERT INTO public.project_role_assignments
         (project_id, project_member_id, user_id, project_role_id, is_active, assigned_at, assigned_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, true, now(), $5::uuid)
       RETURNING *`,
      [projectId, appointed.id, userId, pmRoleId, req.user?.id],
    );
    const pmAssignment = assignmentResult[0];
    await req.db.query(
      `INSERT INTO public.audit_events
         (actor_user_id, actor_type, actor_role, action, target_type, target_id, project_id,
          reason, before_snapshot, after_snapshot, metadata, outcome)
       VALUES ($1::uuid, 'user', 'platform_admin', 'project.pm.appointed', 'project_pm_appointment',
               $2::uuid, $3::uuid, $4::text, $5::jsonb, $6::jsonb, $7::jsonb, 'success')`,
      [req.user?.id, appointed.id, projectId, reason,
       candidateMembership ? JSON.stringify(candidateMembership) : null,
       JSON.stringify({ userId, projectRoleId: pmRoleId, assignmentId: pmAssignment.id, isActive: true }),
       JSON.stringify({ email: userRows[0].email, handoverFromUserId: current?.user_id ?? null })],
    );
    return res.status(current ? 200 : 201).json({
      appointment: { projectId, userId, email: userRows[0].email, projectRoleId: pmRoleId, status: "active" },
      handoverFromUserId: current?.user_id ?? null,
    });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "PM appointment conflicts with an existing Project membership.", code: "PM_APPOINTMENT_CONFLICT" });
    logger.error("Project PM appointment failed:", { code: error?.code || "UNKNOWN" });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/admin/projects/:projectId/pm-appointment/:userId/deactivate", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const projectId = req.params.projectId as string;
  const userId = req.params.userId as string;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(projectId) || !uuidPattern.test(userId) || reason.length < 5) {
    return res.status(400).json({ error: "Valid Project, PM user, and administrative reason are required.", code: "INVALID_PM_DEACTIVATION_INPUT" });
  }
  try {
    await req.db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':pm-appointment', 0))", [projectId]);
    const { rows: beforeRows } = await req.db.query(
      `SELECT a.*, pr.role_code
         FROM public.project_role_assignments a
         JOIN public.project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
        WHERE a.project_id = $1::uuid AND a.user_id = $2::uuid
          AND pr.role_code = 'pm' AND a.is_active = true AND a.revoked_at IS NULL
        FOR UPDATE OF a`,
      [projectId, userId],
    );
    if (beforeRows.length === 0) return res.status(404).json({ error: "No active PM assignment found for this user in the Project.", code: "ACTIVE_PM_ASSIGNMENT_NOT_FOUND" });
    const revoked = [];
    for (const before of beforeRows) {
      const { rows } = await req.db.query(
        `UPDATE public.project_role_assignments
            SET is_active = false, revoked_at = now(), revoked_by = $3::uuid,
                revoke_reason = $4::text, updated_at = now()
          WHERE id = $2::uuid AND project_id = $1::uuid AND revoked_at IS NULL
          RETURNING *`,
        [projectId, before.id, req.user?.id ?? null, reason],
      );
      if (rows[0]) {
        revoked.push(rows[0]);
        await req.db.query(
          `INSERT INTO public.audit_events
             (actor_user_id, actor_type, actor_role, action, target_type, target_id, project_id,
              reason, before_snapshot, after_snapshot, metadata, outcome)
           VALUES ($1::uuid, 'user', 'platform_admin', 'project.pm.deactivated', 'project_pm_assignment',
                   $2::uuid, $3::uuid, $4::text, $5::jsonb, $6::jsonb, $7::jsonb, 'success')`,
          [req.user?.id, before.id, projectId, reason, JSON.stringify(before), JSON.stringify(rows[0]),
           JSON.stringify({ pmUserId: userId, adminDecision: true })],
        );
      }
    }
    return res.json({ ok: true, deactivatedAssignments: revoked.length, assignments: revoked, membershipPreserved: true });
  } catch (error: any) {
    logger.error("Admin PM deactivation failed:", { code: error?.code || "UNKNOWN" });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/admin/users/:id/status", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const userId = req.params.id as string;
  const isActive = req.body?.isActive;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) || typeof isActive !== "boolean" || reason.length < 5) {
    return res.status(400).json({ error: "Valid user id, isActive, and an audit reason are required.", code: "INVALID_USER_STATUS_INPUT" });
  }
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM public.pke_admin_set_user_active($1::uuid, $2::boolean, $3::text)",
      [userId, isActive, reason],
    );
    if (!rows.length) return res.status(404).json({ error: "PKE user not found.", code: "USER_NOT_FOUND" });
    return res.json({ user: rows[0] });
  } catch (error: any) {
    const code = typeof error?.code === "string" ? error.code : "";
    if (code === "P0002") return res.status(404).json({ error: "PKE user not found.", code: "USER_NOT_FOUND" });
    if (code === "23514" || code === "22023") return res.status(409).json({ error: "User is not eligible for this status change.", code: "USER_STATUS_CONFLICT" });
    if (code === "42501") return res.status(403).json({ error: "Platform Admin authorization is required.", code: "ADMIN_REQUIRED" });
    return res.status(500).json(internalServerErrorPayload());
  }
});

// Admin-initiated password reset (Neon Auth / Better Auth). Sends reset request for the target user's
// explicitly linked Neon Auth identity; never exposes or mutates password hashes and never infers by email.
app.post("/api/v1/admin/users/:id/password-reset", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const actorId = req.user?.id || null;
  const targetId = req.params.id;
  if (!targetId || typeof targetId !== "string") {
    return res.status(400).json({ error: "Invalid target user.", code: "INVALID_TARGET" });
  }
  let auditStatus: "succeeded" | "failed" = "failed";
  try {
    const { rows } = await req.db.query(
      "SELECT user_id AS id, email, neon_auth_user_id, is_active FROM public.pke_admin_get_user($1::uuid)",
      [targetId]
    );
    if (rows.length !== 1) {
      try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [targetId, actorId]); } catch {}
      return res.status(404).json({ error: "User not found.", code: "USER_NOT_FOUND" });
    }
    const target = rows[0];
    if (!target.neon_auth_user_id) {
      try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [target.id, actorId]); } catch {}
      return res.status(409).json({ error: "User is not linked to a verified Neon Auth identity.", code: "NEON_IDENTITY_NOT_LINKED" });
    }
    if (target.is_active !== true) {
      try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [target.id, actorId]); } catch {}
      return res.status(409).json({ error: "User account is inactive.", code: "USER_INACTIVE" });
    }

    const baseUrl = process.env.NEON_AUTH_BASE_URL;
    if (!baseUrl) {
      try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [target.id, actorId]); } catch {}
      return res.status(503).json({ error: "Password reset service is not configured.", code: "AUTH_NOT_CONFIGURED" });
    }
    let endpoint: URL;
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== "https:") throw new Error("HTTPS required");
      // Better Auth endpoint path (Neon Auth)
      endpoint = new URL("/request-password-reset", parsed.origin + parsed.pathname.replace(/\/$/, ""));
    } catch {
      try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [target.id, actorId]); } catch {}
      return res.status(503).json({ error: "Password reset service is not configured correctly.", code: "AUTH_NOT_CONFIGURED" });
    }

    const redirectToRaw = typeof req.body?.redirectTo === "string" ? req.body.redirectTo : "";
    const redirectTo = redirectToRaw && /^https?:\/\//i.test(redirectToRaw) ? redirectToRaw : undefined;
    const payload: Record<string, string> = { email: String(target.email || "").trim().toLowerCase() };
    if (redirectTo) payload.redirectTo = redirectTo;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let upstreamOk = false;
    try {
      const resp = await fetch(endpoint.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      // Treat 2xx as accepted; do not leak upstream details.
      upstreamOk = resp.ok;
    } catch {
      upstreamOk = false;
    } finally {
      clearTimeout(timeout);
    }

    auditStatus = upstreamOk ? "succeeded" : "failed";
    try {
      await req.db.query(
        `INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at)
         VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, $3::text, now(), now())`,
        [target.id, actorId, auditStatus]
      );
    } catch {}

    if (!upstreamOk) {
      return res.status(502).json({ error: "Permintaan reset password tidak dapat diproses saat ini.", code: "RESET_REQUEST_FAILED" });
    }
    return res.json({ ok: true, requested: true });
  } catch (error) {
    try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [targetId, actorId]); } catch {}
    return res.status(500).json({ error: "Failed to process password reset request.", code: "RESET_REQUEST_ERROR" });
  }
});

app.get("/api/v1/role-templates", requireAuth, async (_req: express.Request, res: express.Response) => {
  res.json({
    version: 1,
    templates: listProjectRoleTemplates(),
    note: "Template activation does not assign a user. Platform Admin appoints the PM; the appointed PM activates Project workstream templates.",
  });
});

app.post("/api/v1/projects/:id/role-templates/:roleCode/activate", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const roleCode = Array.isArray(req.params.roleCode) ? req.params.roleCode[0] : req.params.roleCode;
  const template = getCanonicalRoleTemplate(roleCode);
  if (!template || template.scope !== "project") {
    return res.status(404).json({ error: "Canonical Project role template not found.", code: "ROLE_TEMPLATE_NOT_FOUND" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "project.roles.manage"))) return;
  try {
    const { rows: permissionRows } = await req.db.query(
      "SELECT id, code FROM public.permissions WHERE code = ANY($1::text[]) AND is_active = true",
      [template.permissionCodes],
    );
    const found = new Set(permissionRows.map((row: any) => row.code));
    const missing = template.permissionCodes.filter((code) => !found.has(code));
    if (missing.length > 0) {
      return res.status(503).json({
        error: "Role template cannot be activated until every canonical permission exists and is active.",
        code: "ROLE_TEMPLATE_PERMISSION_CATALOG_INCOMPLETE",
        missingPermissionCodes: missing,
      });
    }
    const { rows: roleRows } = await req.db.query(
      `INSERT INTO public.project_roles
         (project_id, role_code, name, description, is_active, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::text, $3::text, $4::text, true, $5::uuid, now(), now())
       ON CONFLICT (project_id, role_code)
       DO UPDATE SET is_active = true, name = EXCLUDED.name, description = EXCLUDED.description, updated_at = now()
       RETURNING *`,
      [projectId, template.code, template.label, template.restrictions.join(" "), req.user?.id],
    );
    const projectRole = roleRows[0];
    await req.db.query(
      `INSERT INTO public.project_role_permissions
         (project_id, project_role_id, permission_id, granted_by, granted_at)
       SELECT $1::uuid, $2::uuid, p.id, $3::uuid, now()
         FROM public.permissions p
        WHERE p.code = ANY($4::text[]) AND p.is_active = true
       ON CONFLICT (project_role_id, permission_id) DO NOTHING`,
      [projectId, projectRole.id, req.user?.id, template.permissionCodes],
    );
    // The allowlist is the canonical extension point for permissions added after the role template version.
    // This keeps newly activated roles in sync with UAT-validated P1 grants without widening beyond the allowlist.
    await req.db.query(
      `INSERT INTO public.project_role_permissions
         (project_id, project_role_id, permission_id, granted_by, granted_at)
       SELECT $1::uuid, $2::uuid, p.id, $3::uuid, now()
         FROM public.pke_project_role_permission_allowlist a
         JOIN public.permissions p ON p.code=a.permission_code AND p.is_active=true
        WHERE a.role_code=$4::text
       ON CONFLICT (project_role_id, permission_id) DO NOTHING`,
      [projectId, projectRole.id, req.user?.id, template.code],
    );
    const { rows: grantedRows } = await req.db.query(
      `SELECT p.code FROM public.project_role_permissions prp
       JOIN public.permissions p ON p.id=prp.permission_id
       WHERE prp.project_role_id=$1::uuid AND p.is_active=true ORDER BY p.code`,
      [projectRole.id],
    );
    return res.status(200).json({
      role: projectRole,
      activated: true,
      assignedUsers: 0,
      templateVersion: template.templateVersion,
      permissionCodes: grantedRows.map((row: any) => row.code),
    });
  } catch {
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/roles", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM role_catalog WHERE is_active = true ORDER BY name");
    res.json({ roles: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load roles" });
  }
});

app.get("/api/v1/permissions", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM permissions WHERE is_active = true ORDER BY code");
    res.json({ permissions: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load permissions" });
  }
});

// Session revocation is performed by the Neon Auth Admin provider SDK in the Admin UI.
// Do not expose a database-only endpoint that would incorrectly deactivate the global PKE account.

// ============================================
// Privileged action audit (P03 Identity/RBAC)
// ============================================
app.get("/api/v1/audit/privileged-actions", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      `SELECT ae.id, ae.entity_type, ae.entity_id, ae.action, ae.approved_by, u.email AS approved_by_email, ae.status, ae.created_at, ae.updated_at
         FROM approval_events ae
         LEFT JOIN users u ON u.id = ae.approved_by
        ORDER BY ae.created_at DESC LIMIT 100`,
    );
    res.json({ auditEvents: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load audit events" });
  }
});

app.post("/api/v1/audit/privileged-actions", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { entityType, entityId, action, status } = req.body ?? {};
  if (!entityType || !entityId || !action) {
    return res.status(400).json({ error: "Required fields: entityType, entityId, action" });
  }
  try {
    const { rows } = await req.db.query(
      `INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at)
       VALUES ($1::text, $2::uuid, $3::text, $4::uuid, $5::text, now(), now()) RETURNING *`,
      [entityType, entityId, action, req.user?.id || null, status || "pending"],
    );
    res.status(201).json({ auditEvent: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create audit event" });
  }
});


  // P1 project-scoped domain workflows — schema-gated and fail-closed where not provisioned.
  const p1Ready = async (req: express.Request, res: express.Response): Promise<boolean> => {
    const { rows } = await req.db.query("SELECT to_regclass('public.p1_domain_records') IS NOT NULL AS ready");
    if (!rows[0]?.ready) { res.status(503).json({error:"P1 workflow schema is not provisioned.",code:"P1_WORKFLOW_NOT_PROVISIONED"}); return false; }
    return true;
  };
  const p1DefaultOwner: Record<P1RecordType,string> = {
    purchase_requisition:"procurement",purchase_order:"procurement",supplier_commitment:"supplier",goods_receipt_match:"procurement",
    production_batch:"production_manager",packing_batch:"packing_supervisor",quality_sample:"qc_officer",quality_result:"laboratory_officer",
    qa_release:"qa_manager",hse_inspection:"hse_officer",hse_action:"hse_officer",dispatch_assignment:"transporter",
    vessel_call:"master_of_loading",loading_plan:"master_of_loading",loading_survey:"marine_surveyor",ship_master_ack:"ship_master",
    laytime_event:"master_of_loading",lc_record:"document_officer",lc_clause:"document_officer",lc_discrepancy:"document_officer",
    lc_presentation:"document_officer",audit_finding:"internal_auditor",audit_response:"internal_auditor",audit_closure:"internal_auditor",
  };
  const p1ExternalRoles: Partial<Record<P1RecordType,string[]>> = {
    supplier_commitment:["supplier"],dispatch_assignment:["transporter","driver"],vessel_call:["shipping_agent","terminal_representative"],
    loading_survey:["marine_surveyor"],ship_master_ack:["ship_master"],laytime_event:["shipping_agent"],
    lc_record:["shipping_agent"],lc_clause:["shipping_agent"],lc_discrepancy:["shipping_agent"],lc_presentation:["shipping_agent"],
  };
  const p1Permission = async (req: express.Request,type:P1RecordType,action:"view"|"create"|"update"|"manage_external"):Promise<string|null> => {
    const q=await req.db.query("SELECT public.p1_workflow_permission($1,$2) AS code",[type,action]);
    return typeof q.rows[0]?.code==="string"?q.rows[0].code:null;
  };
  const p1ReadPermission = async (req:express.Request,projectId:string,type:P1RecordType):Promise<string|null> => {
    if(type==="audit_finding"||type==="audit_response"){
      const q=await req.db.query("SELECT public.pke_has_project_permission($1::uuid,'audit.finding.view') AS auditor,public.pke_has_project_permission($1::uuid,'audit.finding.respond') AS owner",[projectId]);
      return q.rows[0]?.auditor?"audit.finding.view":q.rows[0]?.owner?"audit.finding.respond":null;
    }
    if(type==="hse_action"){
      const q=await req.db.query("SELECT public.pke_has_project_permission($1::uuid,'hse.action.view') AS viewer,public.pke_has_project_permission($1::uuid,'hse.action.respond') AS owner,public.pke_has_project_permission($1::uuid,'hse.action.manage') AS manager",[projectId]);
      return q.rows[0]?.viewer?"hse.action.view":q.rows[0]?.owner?"hse.action.respond":q.rows[0]?.manager?"hse.action.manage":null;
    }
    const view=await p1Permission(req,type,"view"),manage=await p1Permission(req,type,"manage_external");
    if(!view)return manage;
    const q=await req.db.query("SELECT public.pke_has_project_permission($1::uuid,$2) AS can_view,public.pke_has_project_permission($1::uuid,$3) AS can_manage",[projectId,view,manage]);
    return q.rows[0]?.can_view?view:q.rows[0]?.can_manage?manage:null;
  };
  const p1Roles = async (req: express.Request,projectId:string):Promise<string[]> => {
    const candidates=["pm","project_admin","platform_admin","finance","accounting","procurement","contract_manager","buyer","supplier","pks_site_manager",
      "production_manager","packing_supervisor","qc_officer","laboratory_officer","qa_manager","hse_officer",
      "transport_manager","dispatcher","transporter","driver","checker","master_of_loading","loading_manager",
      "loading_supervisor","loading_operator","marine_surveyor","ship_master","terminal_representative","shipping_agent",
      "document_officer","internal_auditor","warehouse","warehouse_manager","warehouse_officer","inventory_controller"];
    const q=await req.db.query(
      `SELECT r.role_code FROM unnest($2::text[]) AS r(role_code)
       WHERE public.p1_has_active_project_role_assignment($1::uuid,r.role_code,public.pke_current_user_id())`,
      [projectId,candidates]
    );
    return q.rows.map((row:any)=>String(row.role_code));
  };
  const p1Role = async (req: express.Request):Promise<string> => {
    const q=await req.db.query("SELECT current_setting('app.current_role',true) AS code");
    return String(q.rows[0]?.code??"");
  };
  const p1HasRole = async (req: express.Request,projectId:string,userId:string,roleCodes:string[]):Promise<boolean> => {
    for(const roleCode of roleCodes){
      const q=await req.db.query(
        "SELECT public.p1_has_active_project_role_assignment($1::uuid,$2::text,$3::uuid) AS active",
        [projectId,roleCode,userId]
      );
      if(q.rows[0]?.active) return true;
    }
    return false;
  };

  app.get("/api/v1/projects/:projectId/p1-workflows",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,type=String(req.query.recordType??"");
    if(!isP1RecordType(type)) return res.status(400).json({error:"recordType is required and must be valid."});
    try {
      if(!(await p1Ready(req,res))) return;
      const permission=await p1ReadPermission(req,projectId,type);
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const status=typeof req.query.status==="string"?req.query.status:null;
      const q=await req.db.query("SELECT * FROM public.p1_domain_records WHERE project_id=$1::uuid AND record_type=$2 AND ($3::text IS NULL OR status=$3) ORDER BY updated_at DESC LIMIT 200",[projectId,type,status]);
      return res.json({projectId,recordType:type,records:q.rows});
    } catch { return res.status(500).json(internalServerErrorPayload()); }
  });

  app.get("/api/v1/projects/:projectId/p1-workflows/:id/events",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,id=req.params.id as string;
    try{
      if(!(await p1Ready(req,res))) return;
      const record=await req.db.query("SELECT record_type FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid",[id,projectId]);
      if(record.rows.length!==1) return res.status(404).json({error:"P1 workflow record not found."});
      const permission=await p1ReadPermission(req,projectId,record.rows[0].record_type);
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const events=await req.db.query("SELECT * FROM public.p1_domain_events WHERE record_id=$1::uuid AND project_id=$2::uuid ORDER BY occurred_at ASC",[id,projectId]);
      return res.json({events:events.rows});
    }catch{return res.status(500).json(internalServerErrorPayload());}
  });

  app.get("/api/v1/projects/:projectId/p1-workflows/:id/evidence",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,id=req.params.id as string;
    try{
      if(!(await p1Ready(req,res))) return;
      const record=await req.db.query("SELECT record_type FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid",[id,projectId]);
      if(record.rows.length!==1) return res.status(404).json({error:"P1 workflow record not found."});
      const permission=await p1ReadPermission(req,projectId,record.rows[0].record_type);
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const evidence=await req.db.query(
        "SELECT id,evidence_type,object_key,storage_bucket,original_filename,mime_type,file_size_bytes,sha256_checksum,uploaded_by,uploaded_at,verified_by,verified_at,status FROM public.p1_domain_evidence WHERE record_id=$1::uuid AND project_id=$2::uuid ORDER BY uploaded_at DESC",
        [id,projectId]
      );
      return res.json({evidence:evidence.rows});
    }catch{return res.status(500).json(internalServerErrorPayload());}
  });

  app.post("/api/v1/projects/:projectId/p1-workflows",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,actorId=String(req.user?.id??""),b=req.body??{},type=b.recordType;
    if(!isP1RecordType(type)) return res.status(400).json({error:"Valid recordType is required."});
    const title=typeof b.title==="string"?b.title.trim():"",payload=b.payload&&typeof b.payload==="object"&&!Array.isArray(b.payload)?b.payload:{};
    const errors=validateP1Create(type,payload);
    if(title.length<3||title.length>240) errors.push("title must contain 3-240 characters");
    if(typeof b.idempotencyKey!=="string"||b.idempotencyKey.trim().length<12) errors.push("idempotencyKey must contain at least 12 characters");
    if(errors.length) return res.status(400).json({error:"P1 validation failed.",code:"P1_VALIDATION_FAILED",details:errors});
    try {
      if(!(await p1Ready(req,res))) return;
      const permission=await p1Permission(req,type,"create");
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const priorRequest=await req.db.query("SELECT * FROM public.p1_domain_records WHERE project_id=$1::uuid AND idempotency_key=$2",[projectId,b.idempotencyKey.trim()]);
      if(priorRequest.rows.length){
        const prior=priorRequest.rows[0];
        if(prior.record_type!==type||prior.title!==title||JSON.stringify(prior.payload)!==JSON.stringify(payload)) return res.status(409).json({error:"Idempotency key conflict.",code:"IDEMPOTENCY_KEY_CONFLICT"});
        return res.status(200).json({record:prior,idempotentReplay:true});
      }
      const roleCode=await p1Role(req);
      if(["purchase_requisition","purchase_order","supplier_commitment"].includes(type)&&!["procurement","contract_manager"].includes(roleCode)) return res.status(403).json({error:"Procurement record creation is restricted to Procurement/Contract Manager."});
      if(type==="audit_finding"&&roleCode!=="internal_auditor") return res.status(403).json({error:"Only Internal Auditor may create findings."});
      if(type==="audit_closure"&&roleCode!=="internal_auditor") return res.status(403).json({error:"Only Internal Auditor may initiate closure."});
      if(type==="qa_release"&&roleCode!=="qa_manager") return res.status(403).json({error:"Only QA Manager may create release decisions."});
      if(type==="loading_survey"&&roleCode!=="marine_surveyor") return res.status(403).json({error:"Only Marine Surveyor may submit surveys."});
      if(type==="ship_master_ack"&&roleCode!=="ship_master") return res.status(403).json({error:"Only Ship Master may submit acknowledgements."});
      if(["purchase_order","supplier_commitment","goods_receipt_match","quality_sample","quality_result","audit_response","audit_closure","lc_clause","lc_discrepancy","lc_presentation","qa_release","hse_action"].includes(type)&&!b.parentRecordId) return res.status(400).json({error:"parentRecordId is required for this workflow type."});
      let parentRecord:any=null;
      if(b.parentRecordId){
        const parent=await req.db.query("SELECT id,record_type,status,created_by,owner_role_code,parent_record_id,payload FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid",[b.parentRecordId,projectId]);
        if(parent.rows.length!==1) return res.status(422).json({error:"Parent record is not in the selected Project."});
        parentRecord=parent.rows[0];
        if(type==="purchase_order"&&(parent.rows[0].record_type!=="purchase_requisition"||parent.rows[0].status!=="approved")) return res.status(409).json({error:"Purchase Order requires an approved requisition."});
        if(type==="supplier_commitment"&&(parent.rows[0].record_type!=="purchase_order"||!["issued","acknowledged","partially_received"].includes(parent.rows[0].status)||String(payload.purchaseOrderRecordId)!==String(b.parentRecordId))) return res.status(409).json({error:"Supplier commitment must reference its issued parent PO."});
        if(type==="goods_receipt_match"&&(parent.rows[0].record_type!=="purchase_order"||String(payload.purchaseOrderRecordId)!==String(b.parentRecordId))) return res.status(422).json({error:"Three-way match must reference its parent Purchase Order."});
        if(type==="quality_sample"&&!["production_batch","packing_batch"].includes(parent.rows[0].record_type)) return res.status(422).json({error:"QC sample must reference a production or packing batch."});
        if(type==="quality_result"&&(parent.rows[0].record_type!=="quality_sample"||String(payload.sampleId)!==String(parent.rows[0].payload.sampleId))) return res.status(422).json({error:"Quality result must reference the sample record it evaluates."});
        if(type==="audit_response"&&(parent.rows[0].record_type!=="audit_finding"||String(payload.findingRecordId)!==String(b.parentRecordId)||!["open","responded"].includes(parent.rows[0].status)||!(await p1HasRole(req,projectId,actorId,[parent.rows[0].owner_role_code])))) return res.status(403).json({error:"Only the active finding owner role may respond to its parent finding."});
        if(type==="audit_response"&&(parent.rows[0].record_type!=="audit_finding"||!["open","responded"].includes(parent.rows[0].status)||!(await p1HasRole(req,projectId,actorId,[parent.rows[0].owner_role_code])))) return res.status(403).json({error:"Only the active finding owner role may respond."});
        if(type==="audit_closure"&&(parent.rows[0].record_type!=="audit_finding"||String(payload.findingRecordId)!==String(b.parentRecordId))) return res.status(422).json({error:"Audit closure must reference the same parent audit finding."});
        if(type==="qa_release"&&(!["production_batch","packing_batch"].includes(parent.rows[0].record_type)||String(payload.sourceRecordId)!==String(b.parentRecordId))) return res.status(422).json({error:"QA release must reference its production or packing source record."});
        if(type==="hse_action"&&(parent.rows[0].record_type!=="hse_inspection"||String(payload.findingRecordId)!==String(b.parentRecordId))) return res.status(422).json({error:"HSE corrective action must reference its parent HSE inspection."});
        if(type==="lc_clause"&&(parent.rows[0].record_type!=="lc_record"||String(payload.lcRecordId)!==String(b.parentRecordId))) return res.status(422).json({error:"LC clause must reference its parent LC record."});
        if(type==="lc_discrepancy"&&parent.rows[0].record_type!=="lc_record"&&parent.rows[0].record_type!=="lc_clause") return res.status(422).json({error:"LC discrepancy must reference an LC record or clause."});
        if(type==="lc_presentation"&&parent.rows[0].record_type!=="lc_record") return res.status(422).json({error:"LC presentation must reference an LC record."});
      }
      if(type==="goods_receipt_match"){
        const po=await req.db.query("SELECT id,status,payload FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid AND record_type='purchase_order'",[payload.purchaseOrderRecordId,projectId]);
        const inputs=await req.db.query("SELECT * FROM public.p1_get_three_way_match_inputs($1::uuid,$2::uuid,$3::uuid)",[projectId,payload.warehouseReceiptId,payload.apInvoiceId]);
        if(po.rows.length!==1||inputs.rows.length!==1||!["issued","acknowledged","partially_received","received"].includes(po.rows[0].status)||!["verified","partial"].includes(inputs.rows[0].receipt_status)) return res.status(422).json({error:"PO, verified same-Project GRN and AP invoice are required."});
        const pp=po.rows[0].payload??{},ii=inputs.rows[0],gg=inputs.rows[0];
        if(ii.invoice_purchase_order_id&&String(ii.invoice_purchase_order_id)!==String(payload.purchaseOrderRecordId)) return res.status(409).json({error:"AP invoice is linked to another PO."});
        if(ii.invoice_goods_receipt_id&&String(ii.invoice_goods_receipt_id)!==String(payload.warehouseReceiptId)) return res.status(409).json({error:"AP invoice is linked to another GRN."});
        const match=validateThreeWayMatch({
          po:{projectId,supplierId:String(pp.supplierId??""),currencyCode:String(pp.currencyCode??""),items:Array.isArray(pp.items)?pp.items:[]},
          receipt:{projectId,quantity:Number(gg.receipt_quantity),unitCode:String(gg.receipt_unit),supplierId:null},
          invoice:{projectId,supplierId:String(ii.invoice_supplier_id),currencyCode:String(ii.invoice_currency_code),totalAmount:Number(ii.invoice_total_amount)},
          matchedQuantity:Number(payload.matchedQuantity),matchedAmount:Number(payload.matchedAmount),unitCode:String(payload.unitCode),currencyCode:String(payload.currencyCode),
        });
        if(!match.ok) return res.status(409).json({error:"Three-way match rejected.",code:match.reason});
      }
      if(type==="loading_survey"){
        const key=String(payload.certificateObjectKey??""),checksum=String(payload.sha256Checksum??""),size=Number(payload.certificateFileSizeBytes);
        const storage=privateStorage.status();
        if(!key.startsWith(`projects/${projectId}/`)||!storage.available||storage.bucket!=="pke-private-documents") return res.status(400).json({error:"Survey certificate must be stored in the Project private bucket.",code:"SURVEY_CERTIFICATE_STORAGE_INVALID"});
        try{await privateStorage.verifyObject(key,size,checksum);}catch{return res.status(422).json({error:"Survey certificate object checksum or size verification failed.",code:"SURVEY_CERTIFICATE_VERIFICATION_FAILED"});}
      }
      if(type==="production_batch"){
        if(b.sourceEntityType!=="production_batches"||!b.sourceEntityId) return res.status(400).json({error:"Production batch must link an existing production_batches row."});
        const q=await req.db.query("SELECT id FROM public.production_batches WHERE id=$1::uuid AND project_id=$2::uuid",[b.sourceEntityId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Production batch source is outside this Project."});
      }
      if(type==="packing_batch"){
        if(b.sourceEntityType!=="packing_batches"||!b.sourceEntityId) return res.status(400).json({error:"Packing batch must link an existing packing_batches row."});
        const q=await req.db.query("SELECT id FROM public.packing_batches WHERE id=$1::uuid AND project_id=$2::uuid",[b.sourceEntityId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Packing batch source is outside this Project."});
      }
      if(type==="quality_sample"){
        const q=payload.sampleId
          ? await req.db.query("SELECT id FROM public.product_quality_samples WHERE id=$1::uuid AND project_id=$2::uuid",[payload.sampleId,projectId])
          : await req.db.query("SELECT id FROM public.product_quality_samples WHERE sample_number=$1 AND project_id=$2::uuid",[payload.sampleNumber,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Quality sample must reference a same-Project sample."});
        payload.sampleId=String(q.rows[0].id);
      }
      if(type==="quality_result"){
        const q=await req.db.query("SELECT id FROM public.product_quality_samples WHERE id=$1::uuid AND project_id=$2::uuid",[payload.sampleId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Quality result sample is outside this Project."});
      }
      if(type==="dispatch_assignment"){
        const q=await req.db.query("SELECT id,vehicle_id FROM public.truck_trips WHERE id=$1::uuid AND project_id=$2::uuid",[payload.tripId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Dispatch assignment must reference a same-Project truck trip."});
        if(q.rows[0].vehicle_id&&String(q.rows[0].vehicle_id)!==String(payload.vehicleId)) return res.status(409).json({error:"Dispatch vehicle does not match the registered truck trip vehicle."});
        if(!await p1HasRole(req,projectId,String(payload.driverUserId),["driver"])) return res.status(422).json({error:"Dispatch driver must hold an active Driver Project role."});
      }
      if(type==="vessel_call"||type==="ship_master_ack"||type==="laytime_event"){
        const voyageId=String(payload.voyageId??"");
        const q=await req.db.query("SELECT id,vessel_id,port_id,origin_port_id,destination_port_id FROM public.voyages WHERE id=$1::uuid AND project_id=$2::uuid",[voyageId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Vessel workflow must reference a same-Project voyage."});
        if(type==="vessel_call"&&String(q.rows[0].vessel_id)!==String(payload.vesselId)) return res.status(422).json({error:"Vessel call vessel must match the Project voyage."});
        if(type==="vessel_call"&&![q.rows[0].port_id,q.rows[0].origin_port_id,q.rows[0].destination_port_id].filter(Boolean).map(String).includes(String(payload.portId))) return res.status(422).json({error:"Vessel call port must match the Project voyage route."});
      }
      if(type==="loading_plan"||type==="loading_survey"){
        const opId=String(payload.loadingOperationId??"");
        const q=await req.db.query("SELECT id,quantity FROM public.loading_operations WHERE id=$1::uuid AND project_id=$2::uuid",[opId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Loading operation is outside this Project."});
        if(type==="loading_plan"){
          const shipment=await req.db.query("SELECT quantity FROM public.shipments WHERE id=$1::uuid AND project_id=$2::uuid",[payload.shipmentId,projectId]);
          if(!shipment.rows.length||Number(payload.plannedQuantity)>Number(shipment.rows[0].quantity)) return res.status(422).json({error:"Loading plan must reference a same-Project shipment and not exceed shipment quantity."});
        }
        if(type==="loading_survey"&&Number(payload.surveyedQuantity)>Number(q.rows[0].quantity)) return res.status(422).json({error:"Surveyed quantity cannot exceed the loading operation quantity."});
      }
      if(type==="lc_record"){
        const q=await req.db.query("SELECT id FROM public.p1_domain_records WHERE project_id=$1::uuid AND record_type='lc_record' AND payload->>'lcNumber'=$2 LIMIT 1",[projectId,payload.lcNumber]);
        if(q.rows.length) return res.status(409).json({error:"LC number already exists in this Project.",code:"DUPLICATE_LC_NUMBER"});
      }
      if(type==="lc_clause"&&String(payload.lcRecordId)!==String(parentRecord?.id??"")) return res.status(422).json({error:"LC clause must reference its parent LC record."});
      if(type==="lc_discrepancy"&&parentRecord?.record_type==="lc_clause"&&(String(payload.clauseRecordId)!==String(parentRecord.id)||String(payload.lcRecordId)!==String(parentRecord.parent_record_id))) return res.status(422).json({error:"LC discrepancy clause and LC references must match the parent clause."});
      if(type==="lc_discrepancy"&&parentRecord?.record_type==="lc_record"&&String(payload.lcRecordId)!==String(parentRecord.id)) return res.status(422).json({error:"LC discrepancy must reference its parent LC record."});
      if(type==="lc_presentation"){
        const lcId=String(payload.lcRecordId??"");
        if(lcId!==String(parentRecord?.id??"")||parentRecord?.record_type!=="lc_record"||!["issued","acknowledged"].includes(parentRecord.status)) return res.status(409).json({error:"LC presentation requires an issued, same-Project LC record."});
        const clauses=await req.db.query("SELECT payload,status FROM public.p1_domain_records WHERE project_id=$1::uuid AND parent_record_id=$2::uuid AND record_type='lc_clause'",[projectId,lcId]);
        if(!clauses.rows.length||clauses.rows.some((x:any)=>x.status!=="accepted")) return res.status(409).json({error:"All LC clauses must be reviewed and accepted before presentation.",code:"LC_CLAUSES_NOT_READY"});
        const selections=payload.documentSelections as Array<{documentRecordId:string;clauseCode:string;copyType:"original"|"copy"}>;
        const ids=[...new Set(selections.map(x=>x.documentRecordId))];
        const docs=await req.db.query("SELECT id,document_type_code,status,expiry_date,sha256_checksum,object_key,storage_bucket,file_size_bytes,upload_verified_at FROM public.project_export_documents WHERE project_id=$1::uuid AND id=ANY($2::uuid[])",[projectId,ids]);
        if(docs.rows.length!==ids.length) return res.status(422).json({error:"Every presented document must exist in the same Project."});
        const expired=docs.rows.some((d:any)=>d.status!=="approved"||!d.sha256_checksum||!d.object_key||!d.upload_verified_at||!d.file_size_bytes||d.storage_bucket!=="pke-private-documents"||(d.expiry_date&&new Date(d.expiry_date)<new Date()));
        const required=clauses.rows.map((x:any)=>String(x.payload.clauseCode));
        const supplied=[...new Set(selections.map(x=>x.clauseCode))];
        const checklist=validateLcPresentation(required,supplied,expired);
        if(!checklist.ok) return res.status(409).json({error:"LC presentation checklist is incomplete or contains invalid/expired evidence.",code:"LC_PRESENTATION_INCOMPLETE",missing:checklist.missing});
        for(const clause of clauses.rows){
          const code=String(clause.payload.clauseCode),matches=selections.filter(x=>x.clauseCode===code);
          const docType=String(clause.payload.documentTypeCode);
          if(matches.some(x=>docs.rows.find((d:any)=>d.id===x.documentRecordId)?.document_type_code!==docType)) return res.status(409).json({error:"Presented document type does not satisfy the LC clause.",code:"LC_DOCUMENT_TYPE_MISMATCH",clauseCode:code});
          if(matches.filter(x=>x.copyType==="original").length<Number(clause.payload.requiredOriginals??0)||matches.filter(x=>x.copyType==="copy").length<Number(clause.payload.requiredCopies??0)) return res.status(409).json({error:"LC original/copy count is below the clause requirement.",code:"LC_DOCUMENT_COUNT_MISMATCH",clauseCode:code});
        }
      }
      if(type==="laytime_event"){
        const calc=calculateLaytime({allowedHours:Number(payload.allowedHours),startAt:String(payload.startAt),endAt:String(payload.endAt),excludedHours:Number(payload.excludedHours??0)});
        if(!calc.valid) return res.status(400).json({error:"Invalid laytime interval or allowance.",code:"INVALID_LAYTIME"});
        const overlap=await req.db.query(
          `SELECT 1 FROM public.p1_domain_records
           WHERE project_id=$1::uuid AND record_type='laytime_event'
             AND payload->>'voyageId'=$2
             AND tstzrange((payload->>'startAt')::timestamptz,(payload->>'endAt')::timestamptz,'[)')
                 && tstzrange($3::timestamptz,$4::timestamptz,'[)')
           LIMIT 1`,[projectId,payload.voyageId,payload.startAt,payload.endAt]);
        if(overlap.rows.length) return res.status(409).json({error:"Laytime interval overlaps an existing event for this voyage.",code:"LAYTIME_INTERVAL_OVERLAP"});
        payload.laytimeImpactHours=calc.usedHours;
        payload.laytimeOverrunHours=calc.overrunHours;
      }
      if(type==="qa_release"){
        const source=await req.db.query("SELECT created_by FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid AND record_type IN ('production_batch','packing_batch')",[payload.sourceRecordId,projectId]);
        if(source.rows.length!==1||String(payload.sourceRecordId)!==String(b.parentRecordId)||source.rows[0].created_by===actorId) return res.status(409).json({error:"QA release requires an independent actor and production/packing source.",code:"QA_INDEPENDENCE_REQUIRED"});
        const quality=await req.db.query(
          `SELECT 1 FROM public.p1_domain_records s JOIN public.p1_domain_records r ON r.parent_record_id=s.id AND r.project_id=s.project_id
           WHERE s.project_id=$1::uuid AND s.parent_record_id=$2::uuid AND s.record_type='quality_sample' AND s.status='verified'
             AND r.record_type='quality_result' AND r.status='accepted' LIMIT 1`,[projectId,payload.sourceRecordId]);
        if(!quality.rows.length) return res.status(409).json({error:"QA release requires at least one verified QC sample with an accepted laboratory result.",code:"QA_QUALITY_EVIDENCE_REQUIRED"});
      }
      if(type==="audit_closure"){
        const fid=String(payload.findingRecordId??"");
        const finding=await req.db.query("SELECT created_by FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid AND record_type='audit_finding'",[fid,projectId]);
        const response=await req.db.query("SELECT created_by FROM public.p1_domain_records WHERE parent_record_id=$1::uuid AND project_id=$2::uuid AND record_type='audit_response' ORDER BY created_at DESC LIMIT 1",[fid,projectId]);
        if(finding.rows.length!==1||!response.rows.length||!canCloseAuditFinding(actorId,finding.rows[0].created_by,response.rows[0].created_by,roleCode)) return res.status(409).json({error:"Audit closure requires independent Internal Auditor verification after owner response.",code:"AUDIT_CLOSURE_INDEPENDENCE_REQUIRED"});
      }
      const external=b.externalScopeUserId?String(b.externalScopeUserId):null;
      let externalRoleCode:string|null=null;
      if(external){
        const allowed=p1ExternalRoles[type]??[];
        for(const candidateRole of allowed){
          const extRole=await req.db.query(
            "SELECT public.p1_has_active_project_role_assignment($1::uuid,$2::text,$3::uuid) AS active",
            [projectId,candidateRole,external]
          );
          if(extRole.rows[0]?.active){externalRoleCode=candidateRole;break;}
        }
        if(!externalRoleCode) return res.status(422).json({error:"External scope must match an active external Project assignment."});
      }
      const ownerRoleCode=typeof b.ownerRoleCode==="string"?b.ownerRoleCode:
        type==="audit_finding"?String(payload.ownerRoleCode):
        type==="audit_response"?String(parentRecord?.owner_role_code??""):
        type==="hse_action"?String(payload.actionOwnerRoleCode??""):
        externalRoleCode??p1DefaultOwner[type];
      const owner=await req.db.query(
        "SELECT public.p1_has_active_project_role_assignment($1::uuid,$2::text,NULL::uuid) AS active",
        [projectId,ownerRoleCode]
      );
      if(!owner.rows[0]?.active) return res.status(422).json({error:"ownerRoleCode must have an active assignee in this Project.",code:"P1_OWNER_ROLE_UNASSIGNED"});
      let assignee=b.assigneeUserId?String(b.assigneeUserId):null;
      if(external&&!assignee) assignee=external;
      if(assignee&&!await p1HasRole(req,projectId,assignee,[ownerRoleCode])) return res.status(422).json({error:"Assignee must hold the selected active Project role."});
      if(external&&assignee!==external) return res.status(422).json({error:"External scope and assignee must be the same user."});
      if(["supplier_commitment","dispatch_assignment","loading_survey","ship_master_ack"].includes(type)&&!external) return res.status(422).json({error:"This workflow requires an explicitly assigned external Project user.",code:"EXTERNAL_ASSIGNMENT_REQUIRED"});
      const dueAt=b.dueAt?new Date(b.dueAt):null;
      if(b.dueAt&&Number.isNaN(dueAt!.getTime())) return res.status(400).json({error:"Invalid dueAt."});
      const effectiveParentId=b.parentRecordId??(type==="goods_receipt_match"?payload.purchaseOrderRecordId:null);
      const ins=await req.db.query(
        `INSERT INTO public.p1_domain_records(project_id,record_type,record_code,parent_record_id,source_entity_type,source_entity_id,title,payload,status,owner_role_code,assignee_user_id,external_scope_user_id,created_by,updated_by,due_at,idempotency_key)
         VALUES($1::uuid,$2,COALESCE(NULLIF($3,''),'P1-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),$4::uuid,$5,$6::uuid,$7,$8::jsonb,$9,$10,$11::uuid,$12::uuid,$13::uuid,$13::uuid,$14::timestamptz,$15)
         ON CONFLICT (project_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING *`,
        [projectId,type,b.recordCode??"",effectiveParentId,b.sourceEntityType??null,b.sourceEntityId??null,title,JSON.stringify(payload),initialP1Status(type),ownerRoleCode,assignee,external,actorId,dueAt,b.idempotencyKey.trim()]);
      if(!ins.rows.length){
        const prior=await req.db.query("SELECT * FROM public.p1_domain_records WHERE project_id=$1::uuid AND idempotency_key=$2",[projectId,b.idempotencyKey.trim()]);
        if(prior.rows.length!==1||prior.rows[0].record_type!==type||prior.rows[0].title!==title||JSON.stringify(prior.rows[0].payload)!==JSON.stringify(payload)) return res.status(409).json({error:"Idempotency key conflict.",code:"IDEMPOTENCY_KEY_CONFLICT"});
        return res.status(200).json({record:prior.rows[0],idempotentReplay:true});
      }
      const currentRole=await p1Role(req);
      await req.db.query("INSERT INTO public.p1_domain_events(record_id,project_id,event_type,actor_user_id,actor_role_code,payload) VALUES($1::uuid,$2::uuid,'created',$3::uuid,$4,$5::jsonb)",[ins.rows[0].id,projectId,actorId,currentRole,JSON.stringify({recordType:type})]);
      return res.status(201).json({record:ins.rows[0],idempotentReplay:false});
    } catch { return res.status(500).json(internalServerErrorPayload()); }
  });

  app.patch("/api/v1/projects/:projectId/p1-workflows/:id/transition",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,id=req.params.id as string,actorId=String(req.user?.id??""),b=req.body??{};
    if(typeof b.status!=="string") return res.status(400).json({error:"status is required."});
    try {
      if(!(await p1Ready(req,res))) return;
      const found=await req.db.query("SELECT * FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid FOR UPDATE",[id,projectId]);
      if(found.rows.length!==1) return res.status(404).json({error:"P1 workflow record not found."});
      const record=found.rows[0];
      if(!isP1RecordType(record.record_type)) return res.status(409).json({error:"Unsupported stored workflow type."});
      const to=b.status as P1Status;
      const permission=record.record_type==="loading_survey"&&["accepted","rejected"].includes(to)
        ?"shipping.update"
        :record.record_type==="laytime_event"&&to==="verified"?"shipping.update"
        :await p1Permission(req,record.record_type,"update");
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const from=record.status as P1Status;
      if(!validateP1Transition(record.record_type,from,to)) return res.status(409).json({error:"Invalid status transition.",code:"INVALID_P1_TRANSITION",from,to});
      if(["rejected","held","blocked","cancelled","discrepancy"].includes(to)&&String(b.reason??"").trim().length<5) return res.status(400).json({error:"A reason of at least 5 characters is required."});
      if(record.record_type==="purchase_order"&&to==="approved"){
        if(!(await requireProjectPermission(req,res,projectId,"procurement.po.approve"))) return;
        if(!canApprovePurchaseOrder(actorId,record.created_by,await p1Role(req))) return res.status(403).json({error:"PO approval requires an independent Procurement/Contract Manager.",code:"MAKER_CHECKER_REQUIRED"});
      }
      if(record.record_type==="qa_release"&&(to==="released"||to==="held")){
        if(!(await requireProjectPermission(req,res,projectId,"quality.release.decide"))) return;
        const source=await req.db.query("SELECT created_by FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid",[record.payload.sourceRecordId,projectId]);
        if(source.rows.length!==1||!canDecideQaRelease(actorId,source.rows[0].created_by,await p1Role(req))) return res.status(403).json({error:"QA release requires an independent QA Manager."});
      }
      if(record.record_type==="audit_finding"&&(to==="verified"||to==="closed")){
        if(!(await requireProjectPermission(req,res,projectId,"audit.finding.close"))) return;
        const response=await req.db.query("SELECT created_by,status FROM public.p1_domain_records WHERE parent_record_id=$1::uuid AND project_id=$2::uuid AND record_type='audit_response' ORDER BY created_at DESC LIMIT 1",[id,projectId]);
        if(!response.rows.length||!canCloseAuditFinding(actorId,record.created_by,response.rows[0].created_by,await p1Role(req))||(to==="closed"&&response.rows[0].status!=="verified")) return res.status(403).json({error:"Finding verification/closure requires an independent Internal Auditor after a verified owner response.",code:"AUDIT_CLOSURE_INDEPENDENCE_REQUIRED"});
      }
      const roleCode=await p1Role(req);
      if(record.record_type==="supplier_commitment"&&to==="acknowledged"&&roleCode!=="supplier") return res.status(403).json({error:"Only the assigned Supplier may acknowledge the commitment."});
      if(record.record_type==="ship_master_ack"&&to==="acknowledged"&&roleCode!=="ship_master") return res.status(403).json({error:"Only Ship Master may acknowledge."});
      if(record.record_type==="loading_survey"&&to==="submitted"&&roleCode!=="marine_surveyor") return res.status(403).json({error:"Only Marine Surveyor may submit the survey."});
      if(record.record_type==="loading_survey"&&["accepted","rejected"].includes(to)){
        if(!["master_of_loading","loading_supervisor"].includes(roleCode)||actorId===record.created_by) return res.status(403).json({error:"Survey acceptance/rejection requires an independent Master of Loading or Loading Supervisor."});
      }
      if(record.record_type==="hse_action"&&to==="verified"){
        if(!(await requireProjectPermission(req,res,projectId,"hse.action.manage"))||roleCode!=="hse_officer"||actorId===record.created_by||actorId===record.assignee_user_id) return res.status(403).json({error:"HSE action verification requires an independent HSE Officer.",code:"HSE_VERIFICATION_INDEPENDENCE_REQUIRED"});
      }
      if(record.record_type==="dispatch_assignment"&&["acknowledged","in_progress","completed"].includes(to)&&["transporter","driver"].includes(roleCode)&&record.external_scope_user_id!==actorId) return res.status(403).json({error:"External dispatch updates are restricted to the assigned user."});
      if(record.record_type==="audit_response"&&to==="submitted"){
        const finding=await req.db.query("SELECT owner_role_code FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid AND record_type='audit_finding'",[record.parent_record_id]);
        if(finding.rows.length!==1||!await p1HasRole(req,projectId,actorId,[finding.rows[0].owner_role_code])) return res.status(403).json({error:"Only finding owner role may submit the response."});
      }
      if(record.record_type==="lc_presentation"&&(to==="accepted"||to==="discrepancy")){
        if(!b.transitionData?.bankAcknowledgementReference||String(b.transitionData.bankAcknowledgementReference).trim().length<3||!b.transitionData?.bankAcknowledgementEvidenceId) return res.status(409).json({error:"Bank acknowledgement reference and evidence are required before recording LC presentation outcome."});
        const bankEvidence=await req.db.query("SELECT id FROM public.p1_domain_evidence WHERE id=$1::uuid AND record_id=$2::uuid AND project_id=$3::uuid AND status IN ('uploaded','verified')",[b.transitionData.bankAcknowledgementEvidenceId,id,projectId]);
        if(!bankEvidence.rows.length) return res.status(409).json({error:"Bank acknowledgement evidence must be attached to this LC presentation."});
      }
      if(record.record_type==="lc_record"&&to==="issued"&&roleCode!=="document_officer") return res.status(403).json({error:"Only Document Officer may record issuance of an LC."});
      if(record.record_type==="loading_plan"&&to==="approved"&&roleCode!=="master_of_loading") return res.status(403).json({error:"Only Master of Loading may approve the shore-side loading plan."});
      if(record.record_type==="laytime_event"&&to==="verified"&&(roleCode!=="master_of_loading"||actorId===record.created_by)) return res.status(403).json({error:"Laytime verification requires a different Master of Loading actor."});
      const data=b.transitionData&&typeof b.transitionData==="object"?b.transitionData:{};
      const update=await req.db.query(
        `UPDATE public.p1_domain_records SET status=$1,updated_by=$2::uuid,updated_at=now(),version=version+1,payload=payload||$3::jsonb,
         closed_at=CASE WHEN $1='closed' THEN now() WHEN $1 IN ('open','responded','verified') THEN NULL ELSE closed_at END,
         closed_by=CASE WHEN $1='closed' THEN $2::uuid WHEN $1 IN ('open','responded','verified') THEN NULL ELSE closed_by END
         WHERE id=$4::uuid AND project_id=$5::uuid AND version=$6 RETURNING *`,
        [to,actorId,JSON.stringify(data),id,projectId,b.expectedVersion??record.version]);
      if(update.rows.length!==1) return res.status(409).json({error:"Record changed concurrently; reload and retry.",code:"P1_VERSION_CONFLICT"});
      const eventType:Record<string,string>={submitted:"submitted",approved:"approved",issued:"issued",acknowledged:"acknowledged",in_progress:"started",blocked:"blocked",partially_received:"updated",received:"completed",matched:"matched",held:"held",released:"released",rejected:"rejected",completed:"completed",cancelled:"cancelled",open:"created",responded:"responded",verified:"verified",closed:"closed",presented:"presented",accepted:"accepted",discrepancy:"discrepancy",expired:"updated"};
      await req.db.query("INSERT INTO public.p1_domain_events(record_id,project_id,event_type,actor_user_id,actor_role_code,reason,payload) VALUES($1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7::jsonb)",[id,projectId,eventType[to]??"updated",actorId,roleCode,b.reason??null,JSON.stringify({from,to,version:update.rows[0].version,...data})]);
      return res.json({record:update.rows[0]});
    } catch { return res.status(500).json(internalServerErrorPayload()); }
  });

  app.post("/api/v1/projects/:projectId/p1-workflows/:id/evidence",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,id=req.params.id as string,actorId=String(req.user?.id??""),b=req.body??{};
    const evidenceKey=String(b.objectKey??""),evidenceSha=String(b.sha256Checksum??""),evidenceBucket=String(b.storageBucket??"pke-private-documents"),evidenceSize=Number(b.fileSizeBytes);
    if(!validateP1Evidence({objectKey:evidenceKey,sha256:evidenceSha,bucket:evidenceBucket,sizeBytes:evidenceSize})||!Number.isSafeInteger(evidenceSize)||evidenceSize<=0) return res.status(400).json({error:"Evidence requires private bucket, valid SHA-256 and verified file size <=50 MB."});
    if(!evidenceKey.startsWith(`projects/${projectId}/`)) return res.status(400).json({error:"Evidence object key must be namespaced to the selected Project.",code:"INVALID_OBJECT_KEY"});
    const storageStatus=privateStorage.status();
    if(!storageStatus.available||storageStatus.bucket!==evidenceBucket) return res.status(503).json({error:"Private object storage is unavailable or bucket does not match.",code:"STORAGE_UNAVAILABLE"});
    try{
      try{await privateStorage.verifyObject(evidenceKey,evidenceSize,evidenceSha);}catch{return res.status(422).json({error:"Evidence object checksum or size verification failed.",code:"EVIDENCE_OBJECT_VERIFICATION_FAILED"});}
      if(!(await p1Ready(req,res))) return;
      const record=await req.db.query("SELECT record_type FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid",[id,projectId]);
      if(record.rows.length!==1) return res.status(404).json({error:"P1 workflow record not found."});
      const permission=record.rows[0].record_type==="quality_result"
        ?"quality.result.create"
        :await p1Permission(req,record.rows[0].record_type,"update");
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const inserted=await req.db.query(
        `INSERT INTO public.p1_domain_evidence(record_id,project_id,evidence_type,object_key,storage_bucket,original_filename,mime_type,file_size_bytes,sha256_checksum,uploaded_by)
         VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::uuid) RETURNING *`,
        [id,projectId,b.evidenceType??"supporting",evidenceKey,evidenceBucket,b.originalFilename??null,b.mimeType??null,evidenceSize,evidenceSha,actorId]);
      const roleCode=await p1Role(req);
      await req.db.query("INSERT INTO public.p1_domain_events(record_id,project_id,event_type,actor_user_id,actor_role_code,payload) VALUES($1::uuid,$2::uuid,'evidence_added',$3::uuid,$4,$5::jsonb)",[id,projectId,actorId,roleCode,JSON.stringify({evidenceId:inserted.rows[0].id})]);
      return res.status(201).json({evidence:inserted.rows[0]});
    }catch{return res.status(500).json(internalServerErrorPayload());}
  });

  app.get("/api/v1/projects/:projectId/p1-kpis",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string;
    try{
      if(!(await p1Ready(req,res))) return;
      const kpiAccess=await req.db.query(
        "SELECT public.pke_has_project_permission($1::uuid,'p1.kpi.view') OR public.pke_has_project_permission($1::uuid,'reports.view') AS allowed",
        [projectId]
      );
      if(!kpiAccess.rows[0]?.allowed) return res.status(403).json({error:"Missing required Project permission: p1.kpi.view or reports.view"});
      const defs=await req.db.query("SELECT * FROM public.p1_report_kpi_definitions WHERE is_active=true AND (project_id IS NULL OR project_id=$1::uuid) ORDER BY template_id,metric_key",[projectId]);
      const roleCodes=await p1Roles(req,projectId);
      const p1KpiTemplatesByRole:Record<string,string[]> = {
        procurement:["tpl-procurement"],contract_manager:["tpl-procurement"],buyer:["tpl-procurement"],finance:["tpl-procurement"],accounting:["tpl-procurement"],
        pks_site_manager:["tpl-procurement","tpl-operational"],
        production_manager:["tpl-operational"],packing_supervisor:["tpl-operational"],qc_officer:["tpl-operational"],
        laboratory_officer:["tpl-operational"],qa_manager:["tpl-operational"],hse_officer:["tpl-operational"],
        transport_manager:["tpl-logistics"],dispatcher:["tpl-logistics"],transporter:["tpl-logistics"],driver:["tpl-logistics"],checker:["tpl-logistics"],
        master_of_loading:["tpl-shipping"],loading_manager:["tpl-shipping"],loading_supervisor:["tpl-shipping"],loading_operator:["tpl-shipping"],
        marine_surveyor:["tpl-shipping"],ship_master:["tpl-shipping"],terminal_representative:["tpl-shipping"],
        shipping_agent:["tpl-shipping","tpl-trade"],document_officer:["tpl-trade","tpl-compliance"],
        internal_auditor:["tpl-audit","tpl-compliance"],
        warehouse:["tpl-warehouse"],warehouse_manager:["tpl-warehouse"],warehouse_officer:["tpl-warehouse"],inventory_controller:["tpl-warehouse"]
      };
      const allTemplates=roleCodes.some((code)=>["pm","project_admin","platform_admin"].includes(code))
        ?new Set(defs.rows.map((d:any)=>String(d.template_id)))
        :new Set(roleCodes.flatMap((code)=>p1KpiTemplatesByRole[code]??[]));
      const kpiDefinitions=defs.rows.filter((d:any)=>allTemplates.has(String(d.template_id)));
      const kpis=[];
      for(const d of kpiDefinitions){
        const q=await req.db.query(
          "SELECT value,source_rows AS n,as_of FROM public.p1_get_kpi_metric($1::uuid,$2::text)",
          [projectId,String(d.formula_key)]
        );
        const row=q.rows[0]??{};
        const value=row.value===null||row.value===undefined?null:Number(row.value);
        const n=Number(row.n??0);
        const asOf=row.as_of??null;
        kpis.push({
          templateId:d.template_id,metricKey:d.metric_key,label:d.label,value,unit:d.unit_code,
          sourceEntity:d.source_entity,sourceRows:n,asOf,
          freshnessStatus:evaluateFreshness(asOf?new Date(asOf).toISOString():null,Number(d.freshness_minutes)),
          status:value===null?"unavailable":"available",missingDataPolicy:d.missing_data_policy
        });
      }
      return res.json({projectId,kpis,generatedAt:new Date().toISOString()});
    }catch{return res.status(500).json(internalServerErrorPayload());}
  });

}

// ============================================
// Centralized error handling middleware
// ============================================
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const rawStatus = err?.status;
  const status = typeof rawStatus === "number" && Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus < 500 ? rawStatus : 500;

  // Never persist exception messages, stacks, query strings, tokens or client IPs.
  logger.error({
    event: "api_unhandled_error",
    status,
    method: req.method,
    path: req.path,
    errorType: typeof err?.name === "string" ? err.name : "UnknownError",
  });

  res.status(status).json({
    status: "error",
    ...(status === 500 ? internalServerErrorPayload() : requestRejectedPayload()),
  });
});

let runtimeVerified = false;
let runtimeVerifyPromise: Promise<void> | null = null;

async function verifyProductionRuntimeSecurity(): Promise<void> {
  if (manualTrialMode.enabled) return;
  if (runtimeVerified) return;
  if (runtimeVerifyPromise) return runtimeVerifyPromise;
  runtimeVerifyPromise = (async () => {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT
          current_user AS current_role,
          r.rolsuper,
          r.rolbypassrls,
          r.rolcreatedb,
          r.rolcreaterole,
          pg_has_role(current_user, 'neon_superuser', 'MEMBER') AS has_neon_superuser_membership,
          has_function_privilege(
            current_user,
            'public.resolve_pke_user_by_neon_auth_user_id(uuid)',
            'EXECUTE'
          ) AS can_resolve_identity
        FROM pg_roles AS r
        WHERE r.rolname = current_user
      `);
      if (result.rows.length !== 1) {
        throw new Error("Unable to inspect PostgreSQL runtime role.");
      }
      const problems = validateRuntimeRoleState(result.rows[0], configuredDatabaseRole);
      if (problems.length > 0) {
        logger.error(`Runtime database security check failed: ${problems.join(" ")}`);
        throw new Error("Runtime database role did not pass the least-privilege startup check.");
      }
      await client.query("SELECT 1");
      runtimeVerified = true;
      logger.info("Database connected with verified app_runtime_secure role.");
    } finally {
      client.release();
    }
  })().catch((error) => {
    runtimeVerifyPromise = null;
    throw error;
  });
  return runtimeVerifyPromise;
}

async function startServer(): Promise<void> {
  if (manualTrialMode.enabled) {
    app.listen(Number(PORT) || 3000, "127.0.0.1", () => {
      logger.info(`PKE Manual Trial Mode API running on http://127.0.0.1:${PORT}`);
      logger.info("Mode: manual-trial (in-memory demo, no Neon/PostgreSQL/Auth/storage/external providers)");
      logger.info(`Timestamp: ${new Date().toISOString()}`);
    });
    return;
  }

  await verifyProductionRuntimeSecurity();

  app.listen(PORT, () => {
    logger.info(`PKE Export Platform API running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
    logger.info(`Database role: app_runtime_secure`);
    logger.info(`Timestamp: ${new Date().toISOString()}`);
  });
}

if (!isServerlessRuntime(process.env)) {
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received. Shutting down gracefully...");
    try {
      if (!manualTrialMode.enabled && pool) await pool.end();
    } catch (err) {
      logger.error("Error during shutdown:", err as any);
    }
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.info("SIGINT received. Shutting down gracefully...");
    try {
      if (!manualTrialMode.enabled && pool) await pool.end();
    } catch (err) {
      logger.error("Error during shutdown:", err as any);
    }
    process.exit(0);
  });

  if (process.env.NODE_ENV !== "test") {
    void startServer().catch((error) => {
      logger.error(manualTrialMode.enabled ? "PKE Manual Trial Mode startup failed." : "PKE API startup cancelled because runtime security checks failed.");
      if (!manualTrialMode.enabled && pool) { void pool.end().finally(() => process.exit(1)); }
      else process.exit(1);
    });
  } else {
    logger.info("PKE API loaded in test mode (server started by test harness).");
  }
} else {
  logger.info("PKE API loaded in serverless mode (no app.listen). Runtime security must be verified before handling production requests.");
}

export async function ensureRuntimeReady(): Promise<void> {
  if (manualTrialMode.enabled) return;
  if (runtimeStartupFailure) {
    throw new Error("PKE runtime configuration is incomplete.");
  }
  if (!pool) {
    throw new Error("PKE database pool is unavailable.");
  }
  await verifyProductionRuntimeSecurity();
}

export function getRuntimeReadinessState(): {
  ready: boolean;
  failure: RuntimeStartupFailure | null;
} {
  if (manualTrialMode.enabled) return { ready: true, failure: null };
  const failure = runtimeStartupFailure
    ? {
        code: runtimeStartupFailure.code,
        missingEnvironmentVariables: [...runtimeStartupFailure.missingEnvironmentVariables],
      }
    : !pool
      ? { code: "DATABASE_POOL_UNAVAILABLE", missingEnvironmentVariables: [] }
      : null;
  return { ready: failure === null, failure };
}

export default app;


+(i+2)+(P16_JSON_FIELDS.has(k)?"::jsonb":""));
  const result=await req.db.query("UPDATE public."+built.config.table+" SET "+sets.join(",")+" WHERE id=$1::uuid RETURNING *",[id,...built.values]);
  if(!result.rows.length)return res.status(404).json({error:"P16 master record not found."});
  return res.json({record:result.rows[0],verificationStatus:"submitted",requiresIndependentReview:true});
 }catch(error:any){if(error?.code==="23505")return res.status(409).json({error:"P16 master record conflicts with an existing unique code."});if(error?.code==="23503"||error?.code==="23514")return res.status(400).json({error:"P16 master data failed foreign-key or domain validation."});return res.status(500).json(internalServerErrorPayload());}
});
app.patch("/api/v1/p16/master/:resource/:recordId/review",requireAuth,requireAdmin,async(req:express.Request,res:express.Response)=>{
 const resource=String(req.params.resource||""),id=String(req.params.recordId||""),status=String(req.body?.status||""),note=String(req.body?.reviewNote||"").trim(),config=P16_RESOURCES[resource];
 if(!config)return res.status(404).json({error:"Unknown P16 master resource."});
 if(!p16UuidPattern.test(id)||!["verified","rejected"].includes(status)||note.length<5||note.length>500)return res.status(400).json({error:"Valid id, review status and 5–500 character review note are required."});
 try{const result=await req.db.query("UPDATE public."+config.table+" SET verification_status=$2,review_note=$3 WHERE id=$1::uuid RETURNING *",[id,status,note]);if(!result.rows.length)return res.status(404).json({error:"P16 master record not found."});return res.json({record:result.rows[0],reviewed:true});}
 catch(error:any){if(error?.code==="23514"||error?.code==="42501")return res.status(409).json({error:"Independent review requires a different reviewer, source reference, SHA-256 evidence and review note."});return res.status(500).json(internalServerErrorPayload());}
});
app.post("/api/v1/ports/:portId/depth-observations",requireAuth,async(req:express.Request,res:express.Response)=>{
 const projectId=String(req.body?.projectId||""),portId=String(req.params.portId||"");
 if(!p16UuidPattern.test(projectId)||!p16UuidPattern.test(portId))return res.status(400).json({error:"Valid projectId and portId are required."});
 if(!(await requireProjectPermission(req,res,projectId,"port.depth.submit")))return;
 const b=req.body||{};
 if(!Number.isFinite(Number(b.depthValue))||Number(b.depthValue)<=0||!b.depthDatum||!b.observedAt||!b.surveyDate||!b.sourceAuthority||!b.evidenceObjectKey||!/^[0-9a-f]{64}$/i.test(String(b.evidenceSha256||"")))return res.status(400).json({error:"Depth requires positive metres, datum, observedAt, surveyDate, authority, evidence object key and SHA-256."});
 try{
  const scope=await req.db.query("SELECT public.pke_p16_project_port_permission($1::uuid,$2::uuid,'port.depth.submit') AS allowed",[projectId,portId]);
  if(!scope.rows[0]?.allowed)return res.status(403).json({error:"Port is not linked to the selected Project."});
  const result=await req.db.query("INSERT INTO public.port_depth_observations(port_id,terminal_id,berth_id,channel_id,anchorage_id,depth_feature_type,depth_value,depth_unit,depth_datum,observed_at,survey_date,source_authority,survey_method,evidence_object_key,evidence_sha256,notes) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7::numeric,'m',$8,$9::timestamptz,$10::date,$11,$12,$13,$14,$15) RETURNING *",[portId,b.terminalId||null,b.berthId||null,b.channelId||null,b.anchorageId||null,b.depthFeatureType||"port",Number(b.depthValue),b.depthDatum,b.observedAt,b.surveyDate,b.sourceAuthority,b.surveyMethod||null,b.evidenceObjectKey,b.evidenceSha256,b.notes||null]);
  return res.status(201).json({observation:result.rows[0],qualityStatus:"submitted",requiresIndependentReview:true});
 }catch(error:any){if(error?.code==="23503"||error?.code==="23514")return res.status(400).json({error:"Depth evidence failed feature, date, datum or evidence validation."});if(error?.code==="42501")return res.status(403).json({error:"Project depth submission permission is required."});return res.status(500).json(internalServerErrorPayload());}
});
app.post("/api/v1/ports/:portId/tide-observations",requireAuth,async(req:express.Request,res:express.Response)=>{
 const projectId=String(req.body?.projectId||""),portId=String(req.params.portId||""),b=req.body||{};
 if(!p16UuidPattern.test(projectId)||!p16UuidPattern.test(portId))return res.status(400).json({error:"Valid projectId and portId are required."});
 if(!(await requireProjectPermission(req,res,projectId,"port.depth.submit")))return;
 if(!Number.isFinite(Number(b.tideHeightM))||!b.verticalDatum||!b.observedAt||!b.sourceReference||!b.evidenceObjectKey||!/^[0-9a-f]{64}$/i.test(String(b.evidenceSha256||"")))return res.status(400).json({error:"Tide requires height, vertical datum, observedAt, source, evidence object key and SHA-256."});
 try{
  const scope=await req.db.query("SELECT public.pke_p16_project_port_permission($1::uuid,$2::uuid,'port.depth.submit') AS allowed",[projectId,portId]);
  if(!scope.rows[0]?.allowed)return res.status(403).json({error:"Port is not linked to the selected Project."});
  const result=await req.db.query("INSERT INTO public.port_tide_observations(port_id,berth_id,observed_at,tide_height_m,vertical_datum,is_forecast,provider_code,source_reference,evidence_object_key,evidence_sha256) VALUES($1::uuid,$2::uuid,$3::timestamptz,$4::numeric,$5,$6,$7,$8,$9,$10) RETURNING *",[portId,b.berthId||null,b.observedAt,Number(b.tideHeightM),b.verticalDatum,Boolean(b.isForecast),b.providerCode||null,b.sourceReference,b.evidenceObjectKey,b.evidenceSha256]);
  return res.status(201).json({observation:result.rows[0],qualityStatus:"submitted",requiresIndependentReview:true});
 }catch(error:any){if(error?.code==="23503"||error?.code==="23514")return res.status(400).json({error:"Tide evidence failed datum, date or evidence validation."});if(error?.code==="42501")return res.status(403).json({error:"Project depth submission permission is required."});return res.status(500).json(internalServerErrorPayload());}
});
app.patch("/api/v1/port-depth-observations/:id/review",requireAuth,requireAdmin,async(req:express.Request,res:express.Response)=>{
 const id=String(req.params.id||""),status=String(req.body?.status||""),note=String(req.body?.reviewNote||"").trim();
 if(!p16UuidPattern.test(id)||!["verified","rejected","stale"].includes(status)||note.length<5)return res.status(400).json({error:"Valid id, review status and review note are required."});
 try{const r=await req.db.query("UPDATE public.port_depth_observations SET quality_status=$2,review_note=$3 WHERE id=$1::uuid RETURNING *",[id,status,note]);if(!r.rows.length)return res.status(404).json({error:"Depth observation not found."});return res.json({observation:r.rows[0]});}
 catch(error:any){if(error?.code==="23514"||error?.code==="42501")return res.status(409).json({error:"Independent depth review failed maker-checker validation."});return res.status(500).json(internalServerErrorPayload());}
});
app.patch("/api/v1/port-tide-observations/:id/review",requireAuth,requireAdmin,async(req:express.Request,res:express.Response)=>{
 const id=String(req.params.id||""),status=String(req.body?.status||""),note=String(req.body?.reviewNote||"").trim();
 if(!p16UuidPattern.test(id)||!["verified","rejected","stale"].includes(status)||note.length<5)return res.status(400).json({error:"Valid id, review status and review note are required."});
 try{const r=await req.db.query("UPDATE public.port_tide_observations SET quality_status=$2,review_note=$3 WHERE id=$1::uuid RETURNING *",[id,status,note]);if(!r.rows.length)return res.status(404).json({error:"Tide observation not found."});return res.json({observation:r.rows[0]});}
 catch(error:any){if(error?.code==="23514"||error?.code==="42501")return res.status(409).json({error:"Independent tide review failed maker-checker validation."});return res.status(500).json(internalServerErrorPayload());}
});
app.get("/api/v1/port-routes",requireAuth,async(req:express.Request,res:express.Response)=>{
 const projectId=typeof req.query.projectId==="string"?req.query.projectId:"";
 if(!p16UuidPattern.test(projectId))return res.status(400).json({error:"Valid projectId is required."});
 if(!(await requireProjectPermission(req,res,projectId,"route.estimate")))return;
 try{
  const r=await req.db.query("SELECT r.*,ps.name AS pks_site_name,p.name AS port_name,CASE WHEN r.verification_status='verified' AND r.verified_at IS NOT NULL AND NULLIF(btrim(r.source_reference),'') IS NOT NULL AND r.evidence_sha256 ~ '^[0-9a-f]{64}
app.get("/api/v1/transport-legs", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId query parameter required" });
  if (!(await requireProjectPermission(req, res, projectId, "logistics.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT id, project_id, origin, destination, distance_km, status, created_at, updated_at
       FROM transport_legs
       WHERE project_id = $1::uuid
       ORDER BY created_at DESC LIMIT 100`,
      [projectId],
    );
    return res.json({ transportLegs: rows });
  } catch {
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/tracking-events", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "logistics.view"))) return;
  try {
    const { rows } = await req.db.query(
      "SELECT te.* FROM tracking_events te JOIN truck_trips tt ON tt.id = te.truck_trip_id WHERE tt.project_id = $1::uuid ORDER BY te.created_at DESC LIMIT 100",
      [projectId],
    );
    return res.json({ trackingEvents: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/tracking-events", requireAuth, async (req: express.Request, res: express.Response) => {
  const { truckTripId, eventType, latitude, longitude, gpsAccuracy, source, captureTimestamp, notes } = req.body ?? {};
  const checkerId = req.user?.id;
  if (!truckTripId || !eventType || latitude === undefined || longitude === undefined || gpsAccuracy === undefined) {
    return res.status(400).json({ error: "Required fields: truckTripId, eventType, latitude, longitude, gpsAccuracy" });
  }
  if (typeof checkerId !== "string") {
    return res.status(401).json({ error: "Authenticated principal required" });
  }
  const allowedEventTypes = new Set(["departure", "checkpoint", "arrival", "weighbridge", "receipt", "exception"]);
  if (!allowedEventTypes.has(String(eventType))) {
    return res.status(400).json({ error: "Invalid eventType" });
  }

  // Server-side GPS validation
  if (typeof latitude === "boolean" || typeof longitude === "boolean" || typeof gpsAccuracy === "boolean") {
    return res.status(400).json({ error: "GPS values must be numbers, not booleans" });
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  const acc = Number(gpsAccuracy);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({ error: "Invalid latitude: must be between -90 and 90" });
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({ error: "Invalid longitude: must be between -180 and 180" });
  }
  if (!Number.isFinite(acc) || acc <= 0) {
    return res.status(400).json({ error: "Invalid gpsAccuracy: must be a finite number greater than 0" });
  }

  try {
    const { rows: tripRows } = await req.db.query(`SELECT id, project_id FROM truck_trips WHERE id = $1::uuid`, [truckTripId]);
    if (tripRows.length === 0) {
      return res.status(404).json({ error: "Truck trip not found" });
    }
    const tripProjectId = tripRows[0].project_id as string;
    const requiredPermission = eventType === "receipt" ? "warehouse.receipt.create" : eventType === "checkpoint" ? "verify_checkpoints" : "record_truck_trips";
    if (!(await requireProjectPermission(req, res, tripProjectId, requiredPermission))) return;
    const effectiveCapture = captureTimestamp || new Date().toISOString();
    const { rows } = await req.db.query(
      `INSERT INTO tracking_events (truck_trip_id, event_type, checker_id, latitude, longitude, gps_accuracy, source, capture_timestamp, status, notes, created_at)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8::timestamptz, 'verified', $9, now()) RETURNING *`,
      [truckTripId, eventType, checkerId, lat, lng, acc, source || "checker_device", effectiveCapture, notes || null],
    );
    res.status(201).json({ trackingEvent: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create tracking event" });
  }
});

app.get("/api/v1/tracking-events/trip/:tripId", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows: trips } = await req.db.query("SELECT project_id FROM truck_trips WHERE id = $1::uuid", [req.params.tripId]);
    if (!trips.length) return res.status(404).json({ error: "Truck trip not found." });
    if (!(await requireProjectPermission(req, res, trips[0].project_id, "logistics.view"))) return;
    const { rows } = await req.db.query("SELECT * FROM tracking_events WHERE truck_trip_id = $1::uuid ORDER BY created_at DESC", [req.params.tripId]);
    return res.json({ trackingEvents: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.get("/api/v1/warehouse-receipts", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "warehouse.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM warehouse_receipts WHERE project_id=$1::uuid ORDER BY created_at DESC LIMIT 100", [projectId]);
    return res.json({ warehouseReceipts: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/warehouse-receipts", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, truckTripId, lotId, receivedQuantity, unit, conditionStatus, exceptionReason, weighbridgeTicketKey, checkTimestamp, status } = req.body ?? {};
  const checkerId = req.user?.id;
  const receivedAmount = Number(receivedQuantity);
  const receiptStatuses = new Set(["pending", "verified", "partial"]);
  if (!projectId || receivedQuantity === undefined || !Number.isFinite(receivedAmount) || receivedAmount <= 0 ||
      typeof unit !== "string" || !unit.trim() ||
      (status !== undefined && (typeof status !== "string" || !receiptStatuses.has(status)))) {
    return res.status(400).json({ error: "Required fields: projectId, positive receivedQuantity and unit.", code: "INVALID_WAREHOUSE_RECEIPT" });
  }
  if (typeof checkerId !== "string") {
    return res.status(401).json({ error: "Authenticated principal required" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "warehouse.receipt.create"))) return;
  try {
    if (truckTripId) {
      const { rows: tripRows } = await req.db.query(`SELECT id, project_id FROM truck_trips WHERE id = $1::uuid`, [truckTripId]);
      if (tripRows.length === 0) return res.status(400).json({ error: "Invalid truck trip" });
      if (tripRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden" });
    }
    if (lotId) {
      const { rows: lotRows } = await req.db.query(`SELECT id, project_id, unit FROM inventory_lots WHERE id = $1::uuid FOR UPDATE`, [lotId]);
      if (lotRows.length === 0) return res.status(400).json({ error: "Invalid inventory lot" });
      if (lotRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden" });
      if (lotRows[0].unit !== unit.trim()) return res.status(400).json({ error: "Receipt unit must match inventory lot unit.", code: "UNIT_MISMATCH" });
    }
    const effectiveCheck = checkTimestamp || new Date().toISOString();
    const { rows } = await req.db.query(
      `INSERT INTO warehouse_receipts (project_id, truck_trip_id, lot_id, received_quantity, unit, condition_status, exception_reason, weighbridge_ticket_key, checker_id, check_timestamp, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9::uuid, $10::timestamptz, $11, now(), now()) RETURNING *`,
      [projectId, truckTripId || null, lotId || null, receivedAmount, unit.trim(), conditionStatus || null, exceptionReason || null, weighbridgeTicketKey || null, checkerId, effectiveCheck, status || "pending"],
    );
    res.status(201).json({ warehouseReceipt: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create warehouse receipt" });
  }
});

app.patch("/api/v1/warehouse-receipts/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { status, receivedQuantity, unit, conditionStatus, exceptionReason } = req.body ?? {};
  const receiptStatuses = new Set(["pending", "verified", "partial"]);
  if (receivedQuantity !== undefined && (!Number.isFinite(Number(receivedQuantity)) || Number(receivedQuantity) <= 0)) {
    return res.status(400).json({ error: "receivedQuantity must be a positive finite number.", code: "INVALID_RECEIVED_QUANTITY" });
  }
  if (status !== undefined && (typeof status !== "string" || !receiptStatuses.has(status))) {
    return res.status(400).json({ error: "Invalid warehouse receipt status.", code: "INVALID_RECEIPT_STATUS" });
  }
  if (unit !== undefined && (typeof unit !== "string" || !unit.trim())) {
    return res.status(400).json({ error: "unit must be a non-empty string.", code: "INVALID_RECEIPT_UNIT" });
  }
  try {
    const { rows: scopeRows } = await req.db.query(
      "SELECT project_id, lot_id FROM warehouse_receipts WHERE id = $1::uuid",
      [req.params.id],
    );
    if (scopeRows.length === 0) return res.status(404).json({ error: "Warehouse receipt not found." });
    if (!(await requireProjectPermission(req, res, scopeRows[0].project_id, "warehouse.update"))) return;
    if (unit !== undefined && scopeRows[0].lot_id) {
      const { rows: lotRows } = await req.db.query(
        "SELECT unit FROM inventory_lots WHERE id = $1::uuid AND project_id = $2::uuid",
        [scopeRows[0].lot_id, scopeRows[0].project_id],
      );
      if (lotRows.length !== 1 || lotRows[0].unit !== unit.trim()) {
        return res.status(400).json({ error: "Receipt unit must match inventory lot unit.", code: "UNIT_MISMATCH" });
      }
    }
    const { rows } = await req.db.query(
      `UPDATE warehouse_receipts
          SET status = COALESCE($2, status),
              received_quantity = COALESCE($3, received_quantity),
              unit = COALESCE($4, unit),
              condition_status = COALESCE($5, condition_status),
              exception_reason = COALESCE($6, exception_reason),
              updated_at = now()
        WHERE id = $1::uuid RETURNING *`,
      [req.params.id, status ?? null, receivedQuantity === undefined ? null : Number(receivedQuantity), unit === undefined ? null : unit.trim(), conditionStatus ?? null, exceptionReason ?? null],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Warehouse receipt not found" });
    res.json({ warehouseReceipt: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to update warehouse receipt" });
  }
});

app.get("/api/v1/inventory-lots", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "inventory.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM inventory_lots WHERE project_id=$1::uuid ORDER BY created_at DESC LIMIT 100", [projectId]);
    return res.json({ inventoryLots: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/inventory-lots", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, pksSiteId, quantity, unit, location, status } = req.body;
  if (!projectId || quantity === undefined) return res.status(400).json({ error: "projectId, quantity required" });
  if (!(await requireProjectPermission(req, res, projectId, "inventory.create"))) return;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO inventory_lots (project_id, pks_site_id, quantity, unit, location, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, now(), now()) RETURNING *`,
      [projectId, pksSiteId || null, quantity, unit || "MT", location || null, status || "incoming"],
    );
    res.status(201).json({ inventoryLot: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create inventory lot" });
  }
});

app.get("/api/v1/inventory-movements", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "inventory.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM inventory_movements WHERE project_id=$1::uuid ORDER BY created_at DESC LIMIT 100", [projectId]);
    return res.json({ inventoryMovements: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/inventory-movements", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, lotId, movementType, quantity, unit, warehouseReceiptId, sourceLocation, destinationLocation, reason, referenceId, referenceType, status } = req.body ?? {};
  const actorId = req.user?.id;
  const movementQuantity = Number(quantity);
  const movementTypes = new Set(["receipt", "issue", "transfer", "adjustment"]);
  const movementStatuses = new Set(["posted", "reversed", "adjusted"]);
  if (!projectId || !lotId || typeof movementType !== "string" || !movementType.trim() || !movementTypes.has(movementType.trim()) ||
      quantity === undefined || !Number.isFinite(movementQuantity) || movementQuantity <= 0 ||
      typeof unit !== "string" || !unit.trim() || !actorId ||
      (status !== undefined && (typeof status !== "string" || !movementStatuses.has(status)))) {
    return res.status(400).json({ error: "projectId, lotId, movementType, positive quantity, unit and authenticated actor are required", code: "INVALID_INVENTORY_MOVEMENT" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "inventory.update"))) return;
  try {
    const { rows: lotRows } = await req.db.query(`SELECT id, project_id, unit FROM inventory_lots WHERE id = $1::uuid FOR UPDATE`, [lotId]);
    if (lotRows.length === 0) return res.status(400).json({ error: "Invalid inventory lot" });
    if (lotRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden: lot does not belong to project" });
    if (lotRows[0].unit !== unit.trim()) return res.status(400).json({ error: "Movement unit must match inventory lot unit.", code: "UNIT_MISMATCH" });
    if (warehouseReceiptId) {
      const { rows: receiptRows } = await req.db.query(`SELECT id, project_id FROM warehouse_receipts WHERE id = $1::uuid`, [warehouseReceiptId]);
      if (receiptRows.length === 0) return res.status(400).json({ error: "Invalid warehouse receipt" });
      if (receiptRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden: receipt does not belong to project" });
    }
    const { rows } = await req.db.query(
      `INSERT INTO inventory_movements (project_id, lot_id, warehouse_receipt_id, movement_type, quantity, unit, source_location, destination_location, reason, actor_id, reference_id, reference_type, status, created_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::uuid, $11::uuid, $12, $13, now()) RETURNING *`,
      [projectId, lotId, warehouseReceiptId || null, movementType.trim(), movementQuantity, unit.trim(), sourceLocation || null, destinationLocation || null, reason || null, actorId, referenceId || null, referenceType || null, status || "posted"],
    );
    res.status(201).json({ inventoryMovement: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create inventory movement" });
  }
});

// ============================================
// Inventory reservations (P06)
// ============================================
app.get("/api/v1/inventory-reservations", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId query parameter is required.", code: "PROJECT_ID_REQUIRED" });
  if (!(await requireProjectPermission(req, res, projectId, "inventory.view"))) return;
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM inventory_reservations WHERE project_id = $1::uuid ORDER BY created_at DESC LIMIT 100",
      [projectId],
    );
    res.json({ inventoryReservations: rows });
  } catch {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/inventory-reservations", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, lotId, reservedQuantity, unitCode, buyerId, shipmentId, expiresAt, idempotencyKey } = req.body ?? {};
  const actorId = req.user?.id;
  const quantity = Number(reservedQuantity);
  if (!projectId || !lotId || !actorId || !Number.isFinite(quantity) || quantity <= 0 ||
      typeof unitCode !== "string" || !unitCode.trim() ||
      typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    return res.status(400).json({
      error: "Required fields: projectId, lotId, reservedQuantity (>0), unitCode, idempotencyKey.",
      code: "INVALID_RESERVATION_INPUT",
    });
  }
  if (!(await requireProjectPermission(req, res, projectId, "inventory.reserve"))) return;

  try {
    const { rows: existing } = await req.db.query(
      "SELECT * FROM inventory_reservations WHERE idempotency_key = $1::text LIMIT 1",
      [idempotencyKey.trim()],
    );
    if (existing.length > 0) {
      const prior = existing[0];
      const sameRequest = prior.project_id === projectId && prior.lot_id === lotId &&
        Number(prior.reserved_quantity) === quantity && prior.unit_code === unitCode.trim() &&
        (prior.buyer_id ?? null) === (buyerId ?? null) && (prior.shipment_id ?? null) === (shipmentId ?? null);
      if (!sameRequest) return res.status(409).json({ error: "Idempotency key was already used for a different reservation.", code: "IDEMPOTENCY_KEY_CONFLICT" });
      return res.status(200).json({ inventoryReservation: prior, idempotentReplay: true });
    }

    const { rows: lotRows } = await req.db.query(
      "SELECT id, project_id, unit, quantity, held_quantity, reserved_quantity FROM inventory_lots WHERE id = $1::uuid FOR UPDATE",
      [lotId],
    );
    if (lotRows.length !== 1) return res.status(404).json({ error: "Inventory lot not found.", code: "INVENTORY_LOT_NOT_FOUND" });
    const lot = lotRows[0];
    if (lot.project_id !== projectId) return res.status(403).json({ error: "Inventory lot belongs to another Project.", code: "PROJECT_SCOPE_MISMATCH" });
    if (lot.unit !== unitCode.trim()) return res.status(400).json({ error: "Reservation unit must match the inventory lot unit.", code: "UNIT_MISMATCH" });

    if (buyerId) {
      const { rows: buyerRows } = await req.db.query(
        "SELECT 1 FROM buyers WHERE id = $1::uuid LIMIT 1",
        [buyerId],
      );
      if (buyerRows.length !== 1) return res.status(400).json({ error: "Invalid buyerId.", code: "INVALID_BUYER" });
    }
    if (shipmentId) {
      const { rows: shipmentRows } = await req.db.query(
        "SELECT 1 FROM shipments WHERE id = $1::uuid AND project_id = $2::uuid LIMIT 1",
        [shipmentId, projectId],
      );
      if (shipmentRows.length !== 1) return res.status(400).json({ error: "Shipment must belong to the selected Project.", code: "INVALID_SHIPMENT" });
    }

    // The database trigger locks the lot and rechecks available quantity atomically.
    const { rows } = await req.db.query(
      `INSERT INTO inventory_reservations
         (project_id, lot_id, buyer_id, shipment_id, reserved_quantity, unit_code,
          status, expires_at, created_by, idempotency_key, fulfilled_quantity, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric, $6::text,
               'active', $7::timestamptz, $8::uuid, $9::text, 0, now(), now())
       RETURNING *`,
      [projectId, lotId, buyerId || null, shipmentId || null, quantity, unitCode.trim(), expiresAt || null, actorId, idempotencyKey.trim()],
    );
    res.status(201).json({ inventoryReservation: rows[0] });
  } catch (error: any) {
    if (error?.code === "23514") return res.status(409).json({ error: "Reservation rejected by inventory integrity guard.", code: "RESERVATION_INTEGRITY_REJECTED" });
    if (error?.code === "42703" && /release_reason/.test(String(error?.message || ""))) {
      return res.status(503).json({ error: "Reservation release schema migration is pending.", code: "RESERVATION_SCHEMA_MIGRATION_PENDING" });
    }
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/inventory-reservations/:id/release", requireAuth, async (req: express.Request, res: express.Response) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 3) return res.status(400).json({ error: "A release reason of at least 3 characters is required.", code: "RELEASE_REASON_REQUIRED" });
  const actorId = req.user?.id;
  try {
    const { rows: currentRows } = await req.db.query(
      "SELECT id, project_id, status FROM inventory_reservations WHERE id = $1::uuid FOR UPDATE",
      [req.params.id],
    );
    if (currentRows.length !== 1) return res.status(404).json({ error: "Reservation not found.", code: "RESERVATION_NOT_FOUND" });
    const current = currentRows[0];
    if (!(await requireProjectPermission(req, res, current.project_id, "inventory.reserve"))) return;
    if (!["active", "partially_fulfilled"].includes(current.status)) {
      return res.status(409).json({ error: "Only active or partially fulfilled reservations can be released.", code: "RESERVATION_NOT_RELEASABLE" });
    }
    const { rows } = await req.db.query(
      `UPDATE inventory_reservations
          SET status = 'released', released_by = $2::uuid, released_at = now(),
              release_reason = $3::text, updated_at = now()
        WHERE id = $1::uuid
        RETURNING *`,
      [req.params.id, actorId, reason],
    );
    res.json({ inventoryReservation: rows[0] });
  } catch (error: any) {
    if (error?.code === "42703" && /release_reason/.test(String(error?.message || ""))) {
      return res.status(503).json({ error: "Reservation release is blocked until the approved schema migration is applied.", code: "RESERVATION_SCHEMA_MIGRATION_PENDING" });
    }
    if (error?.code === "55000" || error?.code === "42501") return res.status(409).json({ error: "Reservation release rejected by the database guard.", code: "RESERVATION_RELEASE_REJECTED" });
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/inventory-reservations/:id/expire", requireAuth, async (req: express.Request, res: express.Response) => {
  const actorId = req.user?.id;
  try {
    const { rows: currentRows } = await req.db.query(
      "SELECT id, project_id, status, expires_at FROM inventory_reservations WHERE id = $1::uuid FOR UPDATE",
      [req.params.id],
    );
    if (currentRows.length !== 1) return res.status(404).json({ error: "Reservation not found.", code: "RESERVATION_NOT_FOUND" });
    const current = currentRows[0];
    if (!(await requireProjectPermission(req, res, current.project_id, "inventory.reserve"))) return;
    if (!["active", "partially_fulfilled"].includes(current.status) || !current.expires_at || new Date(current.expires_at).getTime() > Date.now()) {
      return res.status(409).json({ error: "Only an active reservation whose expiry timestamp has passed can expire.", code: "RESERVATION_NOT_EXPIRED" });
    }
    const { rows } = await req.db.query(
      `UPDATE inventory_reservations
          SET status = 'expired', released_by = $2::uuid, released_at = now(),
              release_reason = $3::text, updated_at = now()
        WHERE id = $1::uuid
        RETURNING *`,
      [req.params.id, actorId, "Expired at configured reservation expiry timestamp"],
    );
    res.json({ inventoryReservation: rows[0] });
  } catch (error: any) {
    if (error?.code === "42703" && /release_reason/.test(String(error?.message || ""))) {
      return res.status(503).json({ error: "Reservation expiry is blocked until the approved schema migration is applied.", code: "RESERVATION_SCHEMA_MIGRATION_PENDING" });
    }
    if (error?.code === "55000" || error?.code === "42501") return res.status(409).json({ error: "Reservation expiry rejected by the database guard.", code: "RESERVATION_EXPIRY_REJECTED" });
    res.status(500).json(internalServerErrorPayload());
  }
});

// Inventory holds
app.get("/api/v1/inventory-holds", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "inventory.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM inventory_holds WHERE project_id=$1::uuid ORDER BY created_at DESC LIMIT 100", [projectId]);
    return res.json({ inventoryHolds: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/inventory-holds", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, lotId, heldQuantity, unit, reason, idempotencyKey } = req.body ?? {};
  const actorId = req.user?.id;
  const quantity = Number(heldQuantity);
  if (!projectId || !lotId || !actorId || !Number.isFinite(quantity) || quantity <= 0 || typeof unit !== "string" || !unit.trim() ||
      typeof reason !== "string" || !reason.trim() || typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    return res.status(400).json({ error: "projectId, lotId, authenticated actor, positive heldQuantity, unit, reason and idempotencyKey are required" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "inventory.hold"))) return;
  try {
    const sameHoldRequest = (prior: any) =>
      prior.project_id === projectId &&
      prior.lot_id === lotId &&
      Number(prior.held_quantity ?? prior.quantity) === quantity &&
      String(prior.unit ?? prior.unit_code) === unit.trim() &&
      String(prior.reason ?? "") === reason.trim() &&
      String(prior.created_by ?? prior.placed_by ?? "") === String(actorId);
    const { rows: existing } = await req.db.query(
      "SELECT * FROM inventory_holds WHERE idempotency_key = $1::text LIMIT 1",
      [idempotencyKey.trim()],
    );
    if (existing.length > 0) {
      const prior = existing[0];
      if (!sameHoldRequest(prior)) {
        return res.status(409).json({ error: "Idempotency key was already used for a different inventory hold.", code: "IDEMPOTENCY_KEY_CONFLICT" });
      }
      return res.status(200).json({ inventoryHold: prior, idempotentReplay: true });
    }
    const { rows: lotRows } = await req.db.query(`SELECT id, project_id, unit FROM inventory_lots WHERE id = $1::uuid FOR UPDATE`, [lotId]);
    if (lotRows.length === 0) return res.status(400).json({ error: "Invalid inventory lot" });
    if (lotRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden: lot does not belong to project" });
    if (lotRows[0].unit !== unit.trim()) return res.status(400).json({ error: "Hold unit must match inventory lot unit.", code: "UNIT_MISMATCH" });
    const { rows } = await req.db.query(
      `INSERT INTO inventory_holds
         (project_id, lot_id, hold_type, quantity, unit_code, reason, status, placed_by, placed_at,
          held_quantity, unit, idempotency_key, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'operational', $3, $4, $5, 'active', $7::uuid, now(),
               $3, $4, $6::text, $7::uuid, now(), now())
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`,
      [projectId, lotId, quantity, unit.trim(), reason.trim(), idempotencyKey.trim(), actorId],
    );
    if (rows.length === 0) {
      const { rows: replayRows } = await req.db.query(
        "SELECT * FROM inventory_holds WHERE idempotency_key = $1::text LIMIT 1",
        [idempotencyKey.trim()],
      );
      if (replayRows.length === 1 && sameHoldRequest(replayRows[0])) {
        return res.status(200).json({ inventoryHold: replayRows[0], idempotentReplay: true });
      }
      return res.status(409).json({ error: "Idempotency key was already used for a different inventory hold.", code: "IDEMPOTENCY_KEY_CONFLICT" });
    }
    res.status(201).json({ inventoryHold: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create inventory hold" });
  }
});

// ============================================
// Shipment allocations (P06)
// ============================================
app.get("/api/v1/shipment-allocations", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId query parameter is required.", code: "PROJECT_ID_REQUIRED" });
  if (!(await requireProjectPermission(req, res, projectId, "shipping.view"))) return;
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM shipment_allocations WHERE project_id = $1::uuid ORDER BY created_at DESC LIMIT 100",
      [projectId],
    );
    res.json({ shipmentAllocations: rows });
  } catch {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/shipment-allocations", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, shipmentId, lotId, reservationId, allocatedQuantity, unit, idempotencyKey } = req.body ?? {};
  const actorId = req.user?.id;
  const quantity = Number(allocatedQuantity);
  if (!projectId || !shipmentId || !lotId || !reservationId || !actorId ||
      !Number.isFinite(quantity) || quantity <= 0 ||
      typeof unit !== "string" || !unit.trim() ||
      typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    return res.status(400).json({
      error: "Required fields: projectId, shipmentId, lotId, reservationId, allocatedQuantity (>0), unit, idempotencyKey.",
      code: "INVALID_ALLOCATION_INPUT",
    });
  }
  if (!(await requireProjectPermission(req, res, projectId, "shipping.update"))) return;
  try {
    const { rows: existing } = await req.db.query(
      "SELECT * FROM shipment_allocations WHERE idempotency_key = $1::text LIMIT 1",
      [idempotencyKey.trim()],
    );
    if (existing.length > 0) {
      const prior = existing[0];
      const sameRequest = prior.project_id === projectId && prior.shipment_id === shipmentId &&
        prior.lot_id === lotId && prior.reservation_id === reservationId &&
        Number(prior.allocated_quantity) === quantity && prior.unit === unit.trim();
      if (!sameRequest) return res.status(409).json({ error: "Idempotency key was already used for a different allocation.", code: "IDEMPOTENCY_KEY_CONFLICT" });
      return res.status(200).json({ shipmentAllocation: prior, idempotentReplay: true });
    }

    const { rows: shipmentRows } = await req.db.query(
      "SELECT id, project_id, quantity FROM shipments WHERE id = $1::uuid AND project_id = $2::uuid FOR UPDATE",
      [shipmentId, projectId],
    );
    if (shipmentRows.length !== 1) return res.status(400).json({ error: "Shipment does not belong to the selected Project.", code: "INVALID_SHIPMENT" });
    const { rows: lotRows } = await req.db.query(
      "SELECT id, project_id, unit FROM inventory_lots WHERE id = $1::uuid AND project_id = $2::uuid FOR UPDATE",
      [lotId, projectId],
    );
    if (lotRows.length !== 1) return res.status(400).json({ error: "Inventory lot does not belong to the selected Project.", code: "INVALID_INVENTORY_LOT" });
    if (lotRows[0].unit !== unit.trim()) return res.status(400).json({ error: "Allocation unit must match inventory lot unit.", code: "UNIT_MISMATCH" });

    const { rows: reservationRows } = await req.db.query(
      `SELECT id, project_id, lot_id, shipment_id, reserved_quantity, fulfilled_quantity, unit_code, status
         FROM inventory_reservations
        WHERE id = $1::uuid AND project_id = $2::uuid
        FOR UPDATE`,
      [reservationId, projectId],
    );
    if (reservationRows.length !== 1) return res.status(400).json({ error: "Reservation does not belong to the selected Project.", code: "INVALID_RESERVATION" });
    const reservation = reservationRows[0];
    if (reservation.lot_id !== lotId || (reservation.shipment_id && reservation.shipment_id !== shipmentId) ||
        !["active", "partially_fulfilled"].includes(reservation.status) ||
        reservation.unit_code !== unit.trim()) {
      return res.status(409).json({ error: "Reservation must be active and match Project, shipment, lot and unit.", code: "RESERVATION_SCOPE_OR_STATE_MISMATCH" });
    }

    const { rows: allocatedRows } = await req.db.query(
      `SELECT COALESCE(sum(allocated_quantity),0) AS allocated
         FROM shipment_allocations
        WHERE reservation_id = $1::uuid AND status IN ('allocated','partially_loaded','loaded')`,
      [reservationId],
    );
    const { rows: shipmentAllocatedRows } = await req.db.query(
      `SELECT COALESCE(sum(allocated_quantity),0) AS allocated
         FROM shipment_allocations
        WHERE shipment_id = $1::uuid AND status IN ('allocated','partially_loaded','loaded')`,
      [shipmentId],
    );
    const capacity = validateAllocationCapacity({
      projectId,
      shipmentProjectId: shipmentRows[0].project_id,
      lotProjectId: lotRows[0].project_id,
      reservationProjectId: reservation.project_id,
      reservationLotId: reservation.lot_id,
      lotId,
      reservationShipmentId: reservation.shipment_id ?? null,
      shipmentId,
      reservationStatus: reservation.status,
      reservationQuantity: Number(reservation.reserved_quantity),
      existingReservationAllocations: Number(allocatedRows[0]?.allocated || 0),
      shipmentQuantity: Number(shipmentRows[0].quantity),
      existingShipmentAllocations: Number(shipmentAllocatedRows[0]?.allocated || 0),
      allocationQuantity: quantity,
      unitMatches: reservation.unit_code === unit.trim() && lotRows[0].unit === unit.trim(),
    });
    if (capacity.ok === false) {
      return res.status(409).json({ error: "Allocation violates reservation or shipment capacity.", code: capacity.code });
    }

    const { rows } = await req.db.query(
      `INSERT INTO shipment_allocations
         (shipment_id, lot_id, project_id, reservation_id, allocated_quantity, unit,
          status, loaded_quantity, idempotency_key, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric, $6::text,
               'draft', 0, $7::text, $8::uuid, now(), now())
       RETURNING *`,
      [shipmentId, lotId, projectId, reservationId, quantity, unit.trim(), idempotencyKey.trim(), actorId],
    );
    res.status(201).json({ shipmentAllocation: rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "An allocation already exists for this shipment and lot.", code: "ALLOCATION_ALREADY_EXISTS" });
    if (error?.code === "23514" || error?.code === "55000") return res.status(409).json({ error: "Allocation rejected by the database integrity guard.", code: "ALLOCATION_INTEGRITY_REJECTED" });
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/shipment-allocations/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { status, loadedQuantity, reversalReason } = req.body ?? {};
  const allowedStatuses = new Set(["allocated", "partially_loaded", "loaded", "cancelled", "reversed"]);
  if (status !== undefined && (typeof status !== "string" || !allowedStatuses.has(status))) {
    return res.status(400).json({ error: "Invalid shipment allocation status.", code: "INVALID_ALLOCATION_STATUS" });
  }
  if (loadedQuantity !== undefined && (!Number.isFinite(Number(loadedQuantity)) || Number(loadedQuantity) < 0)) {
    return res.status(400).json({ error: "loadedQuantity must be a non-negative number.", code: "INVALID_LOADED_QUANTITY" });
  }
  try {
    const { rows: allocationRows } = await req.db.query(
      "SELECT id, project_id, shipment_id, reservation_id, allocated_quantity, loaded_quantity, status FROM shipment_allocations WHERE id = $1::uuid FOR UPDATE",
      [req.params.id],
    );
    if (allocationRows.length !== 1) return res.status(404).json({ error: "Shipment allocation not found.", code: "ALLOCATION_NOT_FOUND" });
    const allocation = allocationRows[0];
    if (!(await requireProjectPermission(req, res, allocation.project_id, "shipping.update"))) return;

    if (status === "reversed" && (typeof reversalReason !== "string" || reversalReason.trim().length < 3)) {
      return res.status(400).json({ error: "A reversal reason of at least 3 characters is required.", code: "REVERSAL_REASON_REQUIRED" });
    }
    const transition = validateAllocationTransition({
      currentStatus: allocation.status,
      nextStatus: status,
      currentLoadedQuantity: Number(allocation.loaded_quantity),
      nextLoadedQuantity: loadedQuantity === undefined ? undefined : Number(loadedQuantity),
      allocatedQuantity: Number(allocation.allocated_quantity),
      reversalReason,
    });
    if (transition.ok === false) {
      return res.status(400).json({ error: "Invalid shipment allocation state transition.", code: transition.code });
    }

    const { rows } = await req.db.query(
      `UPDATE shipment_allocations
          SET status = COALESCE($2::text, status),
              loaded_quantity = COALESCE($3::numeric, loaded_quantity),
              reversal_reason = CASE WHEN $2::text = 'reversed' THEN $4::text ELSE reversal_reason END,
              updated_at = now()
        WHERE id = $1::uuid
        RETURNING *`,
      [req.params.id, status ?? null, loadedQuantity === undefined ? null : Number(loadedQuantity), reversalReason?.trim() || null],
    );
    res.json({ shipmentAllocation: rows[0] });
  } catch (error: any) {
    if (error?.code === "23514" || error?.code === "55000" || error?.code === "42501") {
      return res.status(409).json({ error: "Allocation state transition rejected by the database guard.", code: "ALLOCATION_TRANSITION_REJECTED" });
    }
    res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/fx-rates", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM fx_rates WHERE is_active = true ORDER BY rate_date DESC LIMIT 100");
    res.json({ fxRates: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load FX rates" });
  }
});

app.post("/api/v1/fx-rates", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { fromCurrency, toCurrency, rate, rateType, source, effectiveDate } = req.body;
  if (!fromCurrency || !toCurrency || rate === undefined || !effectiveDate) return res.status(400).json({ error: "fromCurrency, toCurrency, rate, effectiveDate required" });
  try {
    const { rows: fromRows } = await req.db.query("SELECT id FROM currencies WHERE code = $1::text AND is_active = true LIMIT 1", [fromCurrency]);
    const { rows: toRows } = await req.db.query("SELECT id FROM currencies WHERE code = $1::text AND is_active = true LIMIT 1", [toCurrency]);
    if (fromRows.length === 0 || toRows.length === 0) {
      const invalid: string[] = [];
      if (fromRows.length === 0) invalid.push(fromCurrency);
      if (toRows.length === 0) invalid.push(toCurrency);
      return res.status(400).json({ error: "Invalid or inactive currency code", invalid });
    }
    const { rows } = await req.db.query(
      `INSERT INTO fx_rates (from_currency_id, to_currency_id, rate, rate_type, rate_source, rate_date, is_active, created_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::timestamptz, true, now()) RETURNING *`,
      [fromRows[0].id, toRows[0].id, rate, rateType || "reference", source || null, effectiveDate],
    );
    res.status(201).json({ fxRate: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create FX rate" });
  }
});

app.get("/api/v1/fx-exposure", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "finance.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT e.id, e.project_id, e.exposure_type, e.original_currency_id, e.original_amount,
              e.functional_amount, e.fx_rate, e.fx_date, e.created_at, e.updated_at,
              c.code AS original_currency_code
       FROM fx_exposures e LEFT JOIN currencies c ON c.id = e.original_currency_id
       WHERE e.project_id = $1::uuid ORDER BY e.created_at DESC LIMIT 100`,
      [projectId],
    );
    res.json({ fxExposure: rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      exposureType: r.exposure_type,
      originalCurrencyId: r.original_currency_id,
      originalCurrencyCode: r.original_currency_code,
      originalAmount: r.original_amount,
      functionalAmount: r.functional_amount,
      fxRate: r.fx_rate,
      fxDate: r.fx_date,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load FX exposure" });
  }
});

app.post("/api/v1/fx-exposure", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, amountIdr, amountFx, fxRate, exposureType, originalCurrency } = req.body;
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  if (!(await requireProjectPermission(req, res, projectId, "finance.create"))) return;
  try {
    // Resolve original currency (default to IDR)
    const currencyCode = originalCurrency || "IDR";
    const { rows: currencyRows } = await req.db.query(
      "SELECT id FROM currencies WHERE code = $1::text AND is_active = true LIMIT 1",
      [currencyCode],
    );
    if (currencyRows.length === 0) {
      return res.status(400).json({ error: `Invalid or inactive currency code: ${currencyCode}` });
    }
    const originalAmount = amountIdr !== undefined && amountIdr !== null ? Number(amountIdr) : null;
    const functionalAmount = amountFx !== undefined && amountFx !== null ? Number(amountFx) : null;
    const fxRateValue = fxRate !== undefined && fxRate !== null ? Number(fxRate) : null;
    const { rows } = await req.db.query(
      `INSERT INTO fx_exposures (project_id, exposure_type, original_currency_id, original_amount, functional_amount, fx_rate, fx_date, created_at, updated_at)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7::timestamptz, now(), now()) RETURNING *`,
      [projectId, exposureType || "open", currencyRows[0].id, originalAmount, functionalAmount, fxRateValue, new Date().toISOString()],
    );
    res.status(201).json({ fxExposure: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create FX exposure" });
  }
});


app.get("/api/v1/journal-entries", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "accounting.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM journal_entries WHERE project_id = $1::uuid ORDER BY created_at DESC LIMIT 100", [projectId]);
    res.json({ journalEntries: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load journal entries" });
  }
});

app.post("/api/v1/journal-entries", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, entryType, referenceId, referenceType, description, entryDate } = req.body;
  if (!projectId || !entryType || !description) return res.status(400).json({ error: "projectId, entryType, description required" });
  if (!(await requireProjectPermission(req, res, projectId, "accounting.create"))) return;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO journal_entries (project_id, entry_type, reference_id, reference_type, description, entry_date, status, posted_by, created_at, updated_at)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6::timestamptz, 'draft', $7::uuid, now(), now()) RETURNING *`,
      [projectId, entryType, referenceId || null, referenceType || null, description, entryDate || new Date().toISOString(), req.user?.id || null],
    );
    res.status(201).json({ journalEntry: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create journal entry" });
  }
});

app.post("/api/v1/journal-entries/:id/post", requireAuth, async (req: express.Request, res: express.Response) => {
  const journalEntryId = req.params.id;
  try {
    // Verify the journal exists and is in draft status
    const { rows: entryRows } = await req.db.query(
      "SELECT id, project_id, status FROM journal_entries WHERE id = $1::uuid FOR UPDATE",
      [journalEntryId],
    );
    if (entryRows.length === 0) return res.status(404).json({ error: "Journal entry not found" });
    if (!(await requireProjectPermission(req, res, entryRows[0].project_id, "accounting.update"))) return;
    if (entryRows[0].status !== "draft") {
      return res.status(400).json({ error: "Only draft journal entries can be posted" });
    }

    // Validate all lines exist and accounts are valid
    const { rows: lines } = await req.db.query(
      `SELECT jl.id, jl.account_id, jl.debit, jl.credit, co.code AS account_code, co.is_active AS account_active
       FROM journal_lines jl
       LEFT JOIN chart_of_accounts co ON co.id = jl.account_id
       WHERE jl.journal_entry_id = $1::uuid
       ORDER BY jl.line_order`,
      [journalEntryId],
    );
    if (lines.length === 0) {
      return res.status(400).json({ error: "Cannot post a journal entry with no lines" });
    }

    // Validate all accounts exist and are active
    const invalidAccounts = lines.filter((l: any) => !l.account_id || !l.account_active);
    if (invalidAccounts.length > 0) {
      return res.status(400).json({ error: "Invalid or inactive account in journal lines", invalidAccounts: invalidAccounts.map((l: any) => l.account_code || l.account_id) });
    }

    // Validate balance: total debit = total credit
    const totalDebit = lines.reduce((sum: number, l: any) => sum + Number(l.debit || 0), 0);
    const totalCredit = lines.reduce((sum: number, l: any) => sum + Number(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      return res.status(400).json({ error: "Journal entry is not balanced: total debit must equal total credit", totalDebit, totalCredit });
    }

    // Post the journal
    const { rows } = await req.db.query(
      `UPDATE journal_entries
       SET status = 'posted', posted_at = now(), posted_by = COALESCE($2::uuid, posted_by), updated_at = now()
       WHERE id = $1::uuid AND status = 'draft'
       RETURNING *`,
      [journalEntryId, req.user?.id || null],
    );
    if (rows.length === 0) {
      return res.status(409).json({ error: "Journal entry was modified by another operation" });
    }
    res.json({ journalEntry: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to post journal entry" });
  }
});

app.post("/api/v1/journal-entries/:id/lines", requireAuth, async (req: express.Request, res: express.Response) => {
  const lines = req.body?.lines;
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 100) return res.status(400).json({ error: "Provide between 2 and 100 journal lines." });
  try {
    const { rows: entryRows } = await req.db.query("SELECT id, project_id, status FROM journal_entries WHERE id=$1::uuid FOR UPDATE", [req.params.id]);
    if (!entryRows.length) return res.status(404).json({ error: "Journal entry not found." });
    if (!(await requireProjectPermission(req, res, entryRows[0].project_id, "accounting.create"))) return;
    if (entryRows[0].status !== "draft") return res.status(409).json({ error: "Journal lines can only be added to a draft entry." });
    const normalized = lines.map((line: any) => ({
      account_id: String(line.accountId || ""),
      debit: Number(line.debit),
      credit: Number(line.credit),
      description: typeof line.description === "string" ? line.description.slice(0, 500) : null,
      line_order: Number(line.lineOrder),
    }));
    if (normalized.some((line: any) => !/^[0-9a-f-]{36}$/i.test(line.account_id) ||
      !Number.isFinite(line.debit) || !Number.isFinite(line.credit) || line.debit < 0 || line.credit < 0 ||
      (line.debit === 0 && line.credit === 0) || (line.debit > 0 && line.credit > 0) ||
      !Number.isInteger(line.line_order) || line.line_order < 1)) {
      return res.status(400).json({ error: "Every journal line needs a valid account, one positive debit or credit, and a positive line order." });
    }
    const accountIds = [...new Set(normalized.map((line: any) => line.account_id))];
    const { rows: accounts } = await req.db.query("SELECT id FROM chart_of_accounts WHERE id=ANY($1::uuid[]) AND is_active=true", [accountIds]);
    if (accounts.length !== accountIds.length) return res.status(400).json({ error: "One or more accounts are invalid or inactive." });
    const { rows } = await req.db.query(
      `INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description,line_order,created_at)
       SELECT $1::uuid,x.account_id::uuid,x.debit,x.credit,x.description,x.line_order,now()
       FROM jsonb_to_recordset($2::jsonb) AS x(account_id text,debit numeric,credit numeric,description text,line_order integer)
       RETURNING *`,
      [req.params.id, JSON.stringify(normalized)],
    );
    return res.status(201).json({ journalLines: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/journal-lines", requireAuth, async (req: express.Request, res: express.Response) => {
  const { journalEntryId, accountId, debit, credit, description, lineOrder } = req.body;
  if (!journalEntryId || !accountId || debit === undefined || credit === undefined) return res.status(400).json({ error: "journalEntryId, accountId, debit, credit required" });
  try {
    // Verify the journal entry exists and is in draft status
    const { rows: entryRows } = await req.db.query(
      "SELECT id, project_id, status FROM journal_entries WHERE id = $1::uuid",
      [journalEntryId],
    );
    if (entryRows.length === 0) return res.status(404).json({ error: "Journal entry not found" });
    if (!(await requireProjectPermission(req, res, entryRows[0].project_id, "accounting.create"))) return;
    const debitValue = Number(debit), creditValue = Number(credit);
    if (!Number.isFinite(debitValue) || !Number.isFinite(creditValue) || debitValue < 0 || creditValue < 0 ||
        (debitValue === 0 && creditValue === 0) || (debitValue > 0 && creditValue > 0)) {
      return res.status(400).json({ error: "Each journal line must have one positive debit or credit amount, never both." });
    }
    if (entryRows[0].status !== "draft") {
      return res.status(400).json({ error: "Cannot add lines to a posted journal entry" });
    }

    // Validate account exists and is active
    const { rows: accountRows } = await req.db.query(
      "SELECT id, is_active FROM chart_of_accounts WHERE id = $1::uuid",
      [accountId],
    );
    if (accountRows.length === 0) {
      return res.status(400).json({ error: "Invalid account: account not found in chart of accounts" });
    }
    if (!accountRows[0].is_active) {
      return res.status(400).json({ error: "Invalid account: account is not active" });
    }

    const { rows } = await req.db.query(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, line_order, created_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, now()) RETURNING *`,
      [journalEntryId, accountId, debitValue, creditValue, description || null, lineOrder !== undefined ? lineOrder : 1],
    );
    res.status(201).json({ journalLine: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create journal line" });
  }
});

// AP/AR Project-scoped Finance endpoints; no bank payment execution.
app.get("/api/v1/ap-invoices", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "finance.view"))) return;
  try { const { rows } = await req.db.query("SELECT * FROM ap_invoices WHERE project_id=$1::uuid ORDER BY invoice_date DESC LIMIT 200",[projectId]); return res.json({apInvoices:rows}); }
  catch { return res.status(500).json(internalServerErrorPayload()); }
});
app.post("/api/v1/ap-invoices", requireAuth, async (req: express.Request, res: express.Response) => {
  const {projectId,supplierId,invoiceNumber,invoiceDate,dueDate,currencyCode,invoiceAmount,taxAmount=0}=req.body??{};
  const amount=Number(invoiceAmount),tax=Number(taxAmount);
  if(!projectId||!supplierId||!invoiceNumber||!invoiceDate||!currencyCode||!Number.isFinite(amount)||amount<=0||!Number.isFinite(tax)||tax<0)return res.status(400).json({error:"Valid Project, supplier, invoice/date, currency and amounts are required."});
  if(!(await requireProjectPermission(req,res,projectId,"finance.create")))return;
  try {
    const {rows:v}=await req.db.query("SELECT v.id FROM vendors v JOIN project_supplier_participation psp ON psp.vendor_id=v.id WHERE v.id=$1::uuid AND psp.project_id=$2::uuid AND psp.is_active=true AND v.is_active=true",[supplierId,projectId]);
    const {rows:c}=await req.db.query("SELECT id FROM currencies WHERE code=$1::text AND is_active=true",[currencyCode]);
    if(!v.length||!c.length)return res.status(400).json({error:"Supplier or currency is invalid or inactive."});
    const total=Math.round((amount+tax)*100)/100;
    const {rows}=await req.db.query(`INSERT INTO ap_invoices
      (project_id,supplier_id,invoice_number,invoice_date,due_date,currency_id,invoice_amount,tax_amount,total_amount,verification_status,three_way_match,paid_amount,outstanding_amount,created_by,created_at,updated_at)
      VALUES ($1::uuid,$2::uuid,$3,$4::timestamptz,$5::timestamptz,$6::uuid,$7,$8,$9,'pending',false,0,$9,$10::uuid,now(),now()) RETURNING *`,
      [projectId,supplierId,String(invoiceNumber).trim(),invoiceDate,dueDate||null,c[0].id,amount,tax,total,req.user?.id||null]);
    return res.status(201).json({apInvoice:rows[0]});
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});
app.patch("/api/v1/ap-invoices/:id/verification", requireAuth, async (req: express.Request, res: express.Response) => {
  const {verificationStatus,disputeReason}=req.body??{};
  if(!["verified","disputed"].includes(verificationStatus)||(verificationStatus==="disputed"&&!String(disputeReason||"").trim()))return res.status(400).json({error:"Use verified or disputed; disputed requires a reason."});
  try {
    const {rows:s}=await req.db.query("SELECT id,project_id,three_way_match FROM ap_invoices WHERE id=$1::uuid",[req.params.id]);
    if(!s.length)return res.status(404).json({error:"AP invoice not found."});
    if(!(await requireProjectPermission(req,res,s[0].project_id,"finance.update")))return;
    // The current schema has no Purchase Order master/workflow; only a system-calculated database flag can authorize verification.
    const matched=s[0].three_way_match===true;
    if(verificationStatus==="verified"&&!matched)return res.status(409).json({error:"Verification is blocked until the Purchase Order + Goods Receipt + Supplier Invoice matching workflow is implemented and system-verified.",code:"THREE_WAY_MATCH_WORKFLOW_REQUIRED"});
    const {rows}=await req.db.query(`UPDATE ap_invoices SET verification_status=$1,dispute_reason=CASE WHEN $1='disputed' THEN $2 ELSE NULL END,
      verified_by=$3::uuid,verified_at=now(),updated_by=$3::uuid,updated_at=now() WHERE id=$4::uuid AND project_id=$5::uuid RETURNING *`,
      [verificationStatus,disputeReason?.trim()||null,req.user?.id||null,req.params.id,s[0].project_id]);
    return res.json({apInvoice:rows[0]});
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});
app.get("/api/v1/ar-invoices", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId=typeof req.query.projectId==="string"?req.query.projectId:"";
  if(!projectId)return res.status(400).json({error:"projectId is required."});
  if(!(await requireProjectPermission(req,res,projectId,"finance.view")))return;
  try {const {rows}=await req.db.query("SELECT * FROM ar_invoices WHERE project_id=$1::uuid ORDER BY invoice_date DESC LIMIT 200",[projectId]);return res.json({arInvoices:rows});}
  catch{return res.status(500).json(internalServerErrorPayload());}
});
app.post("/api/v1/ar-invoices", requireAuth, async (req: express.Request, res: express.Response) => {
  const {projectId,buyerMasterId,invoiceNumber,invoiceDate,dueDate,currencyCode,invoiceAmount,acceptedQuantity,unit="MT",sellingPrice,relatedShipmentId}=req.body??{};
  const amount=Number(invoiceAmount),qty=acceptedQuantity===undefined?null:Number(acceptedQuantity),price=sellingPrice===undefined?null:Number(sellingPrice);
  if(!projectId||!buyerMasterId||!invoiceNumber||!invoiceDate||!currencyCode||!Number.isFinite(amount)||amount<=0||(qty!==null&&(!Number.isFinite(qty)||qty<=0))||(price!==null&&(!Number.isFinite(price)||price<0)))return res.status(400).json({error:"Valid Project, buyer, invoice, currency and amount are required."});
  if(!(await requireProjectPermission(req,res,projectId,"finance.create")))return;
  try {
    const {rows:b}=await req.db.query(`SELECT b.id FROM buyers b JOIN contract_programs cp ON cp.buyer_id=b.id JOIN projects p ON p.contract_program_id=cp.id WHERE b.id=$1::uuid AND p.id=$2::uuid AND b.is_active=true LIMIT 1`,[buyerMasterId,projectId]);
    const {rows:c}=await req.db.query("SELECT id FROM currencies WHERE code=$1::text AND is_active=true",[currencyCode]);
    if(!b.length||!c.length)return res.status(400).json({error:"Buyer is not assigned to this Project or currency is invalid."});
    if(relatedShipmentId){const {rows}=await req.db.query("SELECT id FROM shipments WHERE id=$1::uuid AND project_id=$2::uuid",[relatedShipmentId,projectId]);if(!rows.length)return res.status(400).json({error:"Shipment is not part of this Project."});}
    const {rows}=await req.db.query(`INSERT INTO ar_invoices (buyer_id,buyer_master_id,invoice_number,invoice_date,due_date,currency_id,invoice_amount,accepted_quantity,unit,selling_price,total_amount,project_id,related_shipment_id,approval_status,settlement_status,created_by,created_at,updated_at)
      VALUES (NULL,$1::uuid,$2,$3::timestamptz,$4::timestamptz,$5::uuid,$6,$7,$8,$9,$6,$10::uuid,$11::uuid,'pending','open',$12::uuid,now(),now()) RETURNING *`,
      [buyerMasterId,String(invoiceNumber).trim(),invoiceDate,dueDate||null,c[0].id,amount,qty,unit,price,projectId,relatedShipmentId||null,req.user?.id||null]);
    return res.status(201).json({arInvoice:rows[0]});
  } catch{return res.status(500).json(internalServerErrorPayload());}
});
app.patch("/api/v1/ar-invoices/:id/approval", requireAuth, async (req: express.Request, res: express.Response) => {
  const {approvalStatus,reason}=req.body??{};
  if(!["approved","disputed"].includes(approvalStatus)||(approvalStatus==="disputed"&&!String(reason||"").trim()))return res.status(400).json({error:"Use approved or disputed; disputed requires a reason."});
  try {
    const {rows:s}=await req.db.query("SELECT id,project_id FROM ar_invoices WHERE id=$1::uuid",[req.params.id]);
    if(!s.length)return res.status(404).json({error:"AR invoice not found."});
    if(!(await requireProjectPermission(req,res,s[0].project_id,"finance.update")))return;
    const {rows}=await req.db.query(`UPDATE ar_invoices SET approval_status=$1,dispute_reason=$2,approved_by=$3::uuid,approved_at=now(),updated_by=$3::uuid,updated_at=now()
      WHERE id=$4::uuid AND project_id=$5::uuid RETURNING *`,[approvalStatus,reason?.trim()||null,req.user?.id||null,req.params.id,s[0].project_id]);
    return res.json({arInvoice:rows[0]});
  } catch{return res.status(500).json(internalServerErrorPayload());}
});
// ============================================
// RAB routes (P07 Finance)
// ============================================
app.get("/api/v1/rab", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required.", code: "PROJECT_ID_REQUIRED" });
  if (!(await requireProjectPermission(req, res, projectId, "finance.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT id, project_id, description, category, amount, version, is_active, created_at, updated_at
       FROM rab
       WHERE project_id = $1::uuid AND is_active = true
       ORDER BY created_at DESC LIMIT 200`,
      [projectId],
    );
    res.json({ rab: rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      description: r.description,
      category: r.category,
      amount: r.amount,
      version: r.version,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/rab", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, description, category, amount, version } = req.body;
  if (!projectId || !description || !category || amount === undefined) {
    return res.status(400).json({ error: "Required fields: projectId, description, category, amount" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "finance.create"))) return;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO rab (project_id, description, category, amount, version, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, true, now(), now()) RETURNING *`,
      [projectId, description, category, Number(amount), version || 1],
    );
    res.status(201).json({ rabItem: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// ============================================
// Chart of accounts routes (P07 GL)
// ============================================
app.get("/api/v1/chart-of-accounts", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      "SELECT id, code, name, description, parent_id, account_type, is_active, created_at, updated_at FROM chart_of_accounts WHERE is_active = true ORDER BY code",
    );
    res.json({ accounts: rows });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/chart-of-accounts", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { code, name, description, parentId, accountType } = req.body;
  if (!code || !name || !accountType) return res.status(400).json({ error: "Required fields: code, name, accountType" });
  try {
    const { rows } = await req.db.query(
      `INSERT INTO chart_of_accounts (code, name, description, parent_id, account_type, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4::uuid, $5, true, now(), now()) RETURNING *`,
      [code, name, description || null, parentId || null, accountType],
    );
    res.status(201).json({ account: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// ============================================
// Finance reporting-only workflow (F1)
// Finance records reports; the application does not execute payments.
// ============================================
app.get("/api/v1/finance/reports", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  if (!(await requireProjectPermission(req, res, projectId, "reports.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT id, project_id, template_id, template_version, period_start, period_end,
              report_payload, requested_by, submitted_at, generated_at, data_freshness, status
         FROM report_runs
        WHERE project_id = $1::uuid AND template_id = 'tpl-financial-report'
        ORDER BY submitted_at DESC NULLS LAST, generated_at DESC
        LIMIT 200`,
      [projectId],
    );
    return res.json({ reports: rows });
  } catch (error) {
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/finance/reports", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, periodStart, periodEnd, report, summary } = req.body ?? {};
  if (typeof projectId !== "string" || !projectId ||
      typeof periodStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) ||
      typeof periodEnd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ||
      periodStart > periodEnd || !report || typeof report !== "object" || Array.isArray(report)) {
    return res.status(400).json({ error: "Required: projectId, valid periodStart/periodEnd, and report object." });
  }
  const payload = JSON.stringify({ summary: typeof summary === "string" ? summary.slice(0, 4000) : "", report });
  if (payload.length > 200_000) return res.status(413).json({ error: "Financial report payload exceeds 200 KB." });
  if (!(await requireProjectPermission(req, res, projectId, "reports.create"))) return;
  const requesterId = req.user?.id;
  if (!requesterId) return res.status(401).json({ error: "Authenticated principal required" });
  try {
    const { rows: financeMembership } = await req.db.query(
      `SELECT 1
         FROM public.project_role_assignments a
         JOIN public.project_members pm
           ON pm.id = a.project_member_id AND pm.project_id = a.project_id AND pm.user_id = a.user_id
         JOIN public.project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
         JOIN public.users u ON u.id = a.user_id
        WHERE a.project_id = $1::uuid AND a.user_id = $2::uuid
          AND a.is_active = true AND a.revoked_at IS NULL
          AND (a.expires_at IS NULL OR a.expires_at > now())
          AND pm.is_active = true AND pm.deactivated_at IS NULL
          AND (pm.expires_at IS NULL OR pm.expires_at > now())
          AND pr.is_active = true AND pr.role_code = 'finance' AND u.is_active = true
        LIMIT 1`,
      [projectId, requesterId],
    );
    if (!financeMembership.length) {
      return res.status(403).json({ error: "Only an active Finance member can submit a Project financial report.", code: "FINANCE_ROLE_REQUIRED" });
    }
    const { rows: projectRows } = await req.db.query(
      "SELECT id, name FROM projects WHERE id = $1::uuid AND is_active = true LIMIT 1",
      [projectId],
    );
    if (!projectRows.length) return res.status(404).json({ error: "Active Project not found." });
    const { rows: reportRows } = await req.db.query(
      `INSERT INTO report_runs
        (id, schedule_id, template_id, template_version, cutoff_at, generated_at,
         requested_by, audience, project_id, status, idempotency_key, data_freshness,
         report_payload, period_start, period_end, submitted_at)
       VALUES (gen_random_uuid(), NULL, 'tpl-financial-report', 1, $1::date::timestamptz,
         now(), $2::uuid, 'project_management', $3::uuid, 'submitted',
         NULL, now(), $4::jsonb, $5::date, $6::date, now())
       RETURNING id, project_id, template_id, template_version, period_start, period_end,
                 report_payload, requested_by, submitted_at, generated_at, data_freshness, status`,
      [periodEnd, requesterId, projectId, payload, periodStart, periodEnd],
    );
    const reportRun = reportRows[0];
    const { rows: notificationRows } = await req.db.query(
      "SELECT public.pke_submit_finance_report_notifications($1::uuid, $2::uuid, $3::text, $4::text) AS notifications_created",
      [projectId, requesterId,
       `Laporan keuangan baru — ${projectRows[0].name}`,
       `Finance mengirim laporan periode ${periodStart} sampai ${periodEnd}. Laporan siap ditinjau.`],
    );
    return res.status(201).json({
      financialReport: reportRun,
      notificationsCreated: Number(notificationRows[0]?.notifications_created ?? 0),
      notifiedRoles: ["pm", "admin"],
      paymentExecution: false,
    });
  } catch (error) {
    return res.status(500).json(internalServerErrorPayload());
  }
});

// Cash Advance requestor → independent Finance decision vertical slice.
app.get("/api/v1/currencies",requireAuth,async(req:express.Request,res:express.Response)=>{
  try{const {rows}=await req.db.query("SELECT id,code,name,is_functional FROM public.currencies WHERE is_active=true ORDER BY is_functional DESC,code");return res.json({currencies:rows});}
  catch{return res.status(500).json(internalServerErrorPayload());}
});
app.get("/api/v1/cash-advances",requireAuth,async(req:express.Request,res:express.Response)=>{
  const projectId=typeof req.query.projectId==="string"?req.query.projectId:"";
  if(!projectId)return res.status(400).json({error:"projectId is required."});
  try{
    const permission=await findExplicitProjectPermission(req,projectId,["finance.view","finance.cash_advance.request"]);
    if(!permission)return res.status(403).json({error:"Explicit active Project role permission required.",code:"PROJECT_PERMISSION_REQUIRED"});
    await applyExplicitProjectPermissionContext(req,projectId,permission);
    const decisionPermission=await findExplicitProjectPermission(req,projectId,["finance.update"]);
    const {rows}=await listCashAdvances(req.db,projectId);
    return res.json({cashAdvances:rows,
      canRequest:Boolean(await findExplicitProjectPermission(req,projectId,["finance.cash_advance.request"])),
      canApprove:decisionPermission?.role_code==="finance",
      canViewAll:Boolean(await findExplicitProjectPermission(req,projectId,["finance.view"]))});
  }catch{return res.status(500).json(internalServerErrorPayload());}
});
app.post("/api/v1/cash-advances",requireAuth,async(req:express.Request,res:express.Response)=>{
  const {projectId,amount,currencyId,purpose,advanceDate}=req.body??{};
  if(typeof projectId!=="string"||!projectId||!isValidCashAdvanceRequest({amount,currencyId,purpose,advanceDate}))
    return res.status(400).json({error:"projectId, positive amount, valid currencyId, purpose and advanceDate are required.",code:"INVALID_CASH_ADVANCE_REQUEST"});
  try{
    const permission=await findExplicitProjectPermission(req,projectId,["finance.cash_advance.request"]);
    if(!permission)return res.status(403).json({error:"Cash Advance request permission is not assigned to this active Project role.",code:"CASH_ADVANCE_REQUEST_PERMISSION_REQUIRED"});
    await applyExplicitProjectPermissionContext(req,projectId,permission);
    const {rows:projects}=await req.db.query("SELECT id FROM public.projects WHERE id=$1::uuid AND is_active=true",[projectId]);
    if(!projects.length)return res.status(404).json({error:"Active Project not found."});
    const {rows:currencies}=await req.db.query("SELECT id FROM public.currencies WHERE id=$1::uuid AND is_active=true",[currencyId]);
    if(!currencies.length)return res.status(400).json({error:"Currency is invalid or inactive."});
    const cashAdvance=await createCashAdvance(req.db,{projectId,requestorId:req.user.id,amount:Number(amount),currencyId,purpose:purpose.trim(),advanceDate});
    return res.status(201).json({cashAdvance});
  }catch(error:any){
    if(error?.code==="42501")return res.status(403).json({error:"Database RLS/requestor guard rejected the request.",code:"CASH_ADVANCE_RLS_DENIED"});
    if(error?.code==="23503")return res.status(400).json({error:"Invalid Project or currency reference."});
    return res.status(500).json(internalServerErrorPayload());
  }
});
app.patch("/api/v1/cash-advances/:id/decision",requireAuth,async(req:express.Request,res:express.Response)=>{
  const decision=req.body?.decision;
  if(decision!=="approved"&&decision!=="rejected")return res.status(400).json({error:"decision must be approved or rejected."});
  try{
    const {rows}=await req.db.query("SELECT id,project_id,requestor_id,approval_status FROM public.cash_advances WHERE id=$1::uuid",[req.params.id]);
    if(!rows.length)return res.status(404).json({error:"Cash Advance not found in an accessible Project."});
    const current=rows[0],permission=await findExplicitProjectPermission(req,current.project_id,["finance.update"]);
    if(!permission||permission.role_code!=="finance")return res.status(403).json({error:"Only an explicitly assigned Project Finance role may decide Cash Advances.",code:"FINANCE_DECISION_ROLE_REQUIRED"});
    if(!canDecideCashAdvance({actorId:req.user.id,requestorId:current.requestor_id,roleCode:permission.role_code,currentStatus:current.approval_status,decision}))
      return res.status(409).json({error:"Maker-checker or state-transition rule rejected this decision.",code:"CASH_ADVANCE_DECISION_CONFLICT"});
    await applyExplicitProjectPermissionContext(req,current.project_id,permission);
    const cashAdvance=await decideCashAdvance(req.db,{id:current.id,projectId:current.project_id,actorId:req.user.id,decision});
    if(!cashAdvance)return res.status(409).json({error:"Cash Advance changed; refresh before deciding.",code:"CASH_ADVANCE_STATE_CHANGED"});
    return res.json({cashAdvance});
  }catch(error:any){
    if(error?.code==="42501")return res.status(403).json({error:"Database maker-checker/RLS guard rejected this decision.",code:"CASH_ADVANCE_RLS_DENIED"});
    return res.status(500).json(internalServerErrorPayload());
  }
});

// Payment execution endpoints are intentionally out of scope. Finance is reporting-only.
const paymentExecutionOutOfScope = (_req: express.Request, res: express.Response) =>
  res.status(410).json({
    error: "Payment execution is outside this application's Finance scope.",
    code: "PAYMENT_EXECUTION_OUT_OF_SCOPE",
    available: false,
    financeScope: "reporting_only",
  });
app.get("/api/v1/payment-instructions", requireAuth, paymentExecutionOutOfScope);
app.post("/api/v1/payment-instructions", requireAuth, paymentExecutionOutOfScope);
app.patch("/api/v1/payment-instructions/:id", requireAuth, paymentExecutionOutOfScope);

// ============================================
// Export compliance document routes (P08)
// ============================================

// Regulatory sources
app.get("/api/v1/regulatory-sources", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      `SELECT id, source_id, title, issuing_authority, jurisdiction, document_type,
              regulation_number, article_annex_section, publication_date, effective_date,
              expiry_repeal_date, status, official_url, source_file_reference, source_checksum,
              date_retrieved, last_reviewed, reviewer_id, verification_status,
              created_at, updated_at
       FROM regulatory_sources ORDER BY created_at DESC LIMIT 200`,
    );
    res.json({ regulatorySources: rows.map((r: any) => ({
      id: r.id,
      sourceId: r.source_id,
      title: r.title,
      issuingAuthority: r.issuing_authority,
      jurisdiction: r.jurisdiction,
      documentType: r.document_type,
      regulationNumber: r.regulation_number,
      articleAnnexSection: r.article_annex_section,
      publicationDate: r.publication_date,
      effectiveDate: r.effective_date,
      expiryRepealDate: r.expiry_repeal_date,
      status: r.status,
      officialUrl: r.official_url,
      sourceFileReference: r.source_file_reference,
      sourceChecksum: r.source_checksum,
      dateRetrieved: r.date_retrieved,
      lastReviewed: r.last_reviewed,
      reviewerId: r.reviewer_id,
      verificationStatus: r.verification_status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load regulatory sources" });
  }
});

app.post("/api/v1/regulatory-sources", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { sourceId, title, issuingAuthority, jurisdiction, documentType, regulationNumber,
    articleAnnexSection, publicationDate, effectiveDate, expiryRepealDate, status,
    officialUrl, sourceFileReference, sourceChecksum, dateRetrieved, lastReviewed,
    verificationStatus } = req.body ?? {};
  if (!sourceId || !title || !issuingAuthority || !jurisdiction || !effectiveDate) {
    return res.status(400).json({ error: "Required fields: sourceId, title, issuingAuthority, jurisdiction, effectiveDate" });
  }
  try {
    const reviewerId = req.user?.id || null;
    const { rows } = await req.db.query(
      `INSERT INTO regulatory_sources (source_id, title, issuing_authority, jurisdiction,
        document_type, regulation_number, article_annex_section, publication_date,
        effective_date, expiry_repeal_date, status, official_url, source_file_reference,
        source_checksum, date_retrieved, last_reviewed, reviewer_id, verification_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [sourceId, title, issuingAuthority, jurisdiction, documentType || null, regulationNumber || null,
        articleAnnexSection || null, publicationDate || null, effectiveDate,
        expiryRepealDate || null, status || "draft", officialUrl || null,
        sourceFileReference || null, sourceChecksum || null, dateRetrieved || null,
        lastReviewed || null, reviewerId, verificationStatus || "pending"],
    );
    res.status(201).json({ regulatorySource: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create regulatory source" });
  }
});

// Export document types
// Export document types
// ============================================
app.get("/api/v1/export-document-types", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      "SELECT id, document_type_id, document_name, document_category, description, is_active, created_at, updated_at FROM export_document_types ORDER BY created_at DESC LIMIT 200",
    );
    res.json({ exportDocumentTypes: rows.map((r: any) => ({
      id: r.id,
      documentTypeId: r.document_type_id,
      documentName: r.document_name,
      documentCategory: r.document_category,
      description: r.description,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load export document types" });
  }
});

app.post("/api/v1/export-document-types", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { documentTypeId, documentName, documentCategory, description } = req.body ?? {};
  if (!documentTypeId || !documentName) {
    return res.status(400).json({ error: "Required fields: documentTypeId, documentName" });
  }
  try {
    const { rows } = await req.db.query(
      `INSERT INTO export_document_types (document_type_id, document_name, document_category, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [documentTypeId, documentName, documentCategory || null, description || null],
    );
    res.status(201).json({ documentType: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create export document type" });
  }
});

// Country export document requirements
app.get("/api/v1/country-export-document-requirements", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      `SELECT cdr.id, cdr.country_code, cdr.document_type_id, edt.document_name,
              cdr.importing_authority, cdr.mandatory, cdr.status, cdr.effective_from,
              cdr.effective_to, cdr.official_source_url, cdr.notes, cdr.last_verified_at,
              cdr.created_at, cdr.updated_at
       FROM country_export_document_requirements cdr
       JOIN export_document_types edt ON edt.id = cdr.document_type_id
       ORDER BY cdr.created_at DESC LIMIT 200`,
    );
    res.json({ countryExportDocumentRequirements: rows.map((r: any) => ({
      id: r.id,
      countryCode: r.country_code,
      documentTypeId: r.document_type_id,
      documentName: r.document_name,
      importingAuthority: r.importing_authority,
      mandatory: r.mandatory,
      status: r.status,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      officialSourceUrl: r.official_source_url,
      notes: r.notes,
      lastVerifiedAt: r.last_verified_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load country export document requirements" });
  }
});

app.post("/api/v1/country-export-document-requirements", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { countryCode, documentTypeId, importingAuthority, mandatory, status, effectiveFrom, effectiveTo, officialSourceUrl, notes } = req.body ?? {};
  if (!countryCode || !documentTypeId) {
    return res.status(400).json({ error: "Required fields: countryCode, documentTypeId" });
  }
  try {
    const { rows } = await req.db.query(
      `INSERT INTO country_export_document_requirements (country_code, document_type_id, importing_authority,
        mandatory, status, effective_from, effective_to, official_source_url, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [countryCode, documentTypeId, importingAuthority || null, mandatory !== undefined ? mandatory : true,
        status || "active", effectiveFrom || null, effectiveTo || null, officialSourceUrl || null, notes || null],
    );
    res.status(201).json({ countryRequirement: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create country export document requirement" });
  }
});

// Project export document requirements
app.get("/api/v1/project-export-document-requirements", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  if (!(await requireProjectPermission(req, res, projectId, "documents.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT per.id, per.project_id, per.country_requirement_id, per.is_required,
              per.status, per.override_reason, per.overridden_by, per.created_at, per.updated_at,
              cdr.country_code, cdr.document_type_id, edt.document_name, edt.document_category
       FROM project_export_document_requirements per
       JOIN country_export_document_requirements cdr ON cdr.id = per.country_requirement_id
       JOIN export_document_types edt ON edt.id = cdr.document_type_id
       WHERE per.project_id = $1::uuid
       ORDER BY per.created_at DESC LIMIT 200`,
      [projectId],
    );
    res.json({ projectDocumentRequirements: rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      countryRequirementId: r.country_requirement_id,
      countryCode: r.country_code,
      documentTypeId: r.document_type_id,
      documentName: r.document_name,
      documentCategory: r.document_category,
      isRequired: r.is_required,
      status: r.status,
      overrideReason: r.override_reason,
      overriddenBy: r.overridden_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load project export document requirements" });
  }
});

app.post("/api/v1/project-export-document-requirements", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, countryRequirementId, isRequired, status, overrideReason } = req.body ?? {};
  if (!projectId || !countryRequirementId) {
    return res.status(400).json({ error: "Required fields: projectId, countryRequirementId" });
  }
  if (!(await requireProjectPermission(req, res, String(projectId), "documents.create"))) return;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO project_export_document_requirements (project_id, country_requirement_id, is_required, status, override_reason)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5) RETURNING *`,
      [projectId, countryRequirementId, isRequired !== undefined ? isRequired : true, status || "required", overrideReason || null],
    );
    res.status(201).json({ projectDocumentRequirement: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create project export document requirement" });
  }
});

// Project export documents
app.get("/api/v1/project-export-documents", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  if (!(await requireProjectPermission(req, res, projectId, "documents.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT d.id, d.project_id, d.project_requirement_id, d.file_reference, d.object_key,
              d.original_filename, d.mime_type, d.sha256_checksum, d.version_no, d.status,
              d.uploaded_by, d.reviewed_by, d.uploaded_at, d.reviewed_at, d.expiry_date, d.notes,
              d.created_at, d.updated_at,
              per.country_requirement_id, cdr.country_code, edt.document_name
       FROM project_export_documents d
       JOIN project_export_document_requirements per ON per.id = d.project_requirement_id
       JOIN country_export_document_requirements cdr ON cdr.id = per.country_requirement_id
       JOIN export_document_types edt ON edt.id = cdr.document_type_id
       WHERE d.project_id = $1::uuid
       ORDER BY d.uploaded_at DESC LIMIT 200`,
      [projectId],
    );
    res.json({ projectExportDocuments: rows.map((r: any) => ({
      id: r.id, projectId: r.project_id, projectRequirementId: r.project_requirement_id,
      countryRequirementId: r.country_requirement_id, countryCode: r.country_code, documentName: r.document_name,
      fileReference: r.file_reference, objectKey: r.object_key, originalFilename: r.original_filename,
      mimeType: r.mime_type, sha256Checksum: r.sha256_checksum, versionNo: r.version_no, status: r.status,
      uploadedBy: r.uploaded_by, reviewedBy: r.reviewed_by, uploadedAt: r.uploaded_at, reviewedAt: r.reviewed_at,
      expiryDate: r.expiry_date, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load project export documents" });
  }
});

app.post("/api/v1/project-export-documents", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, projectRequirementId, fileReference, objectKey, originalFilename,
    mimeType, sha256Checksum, versionNo, expiryDate, notes } = req.body ?? {};
  if (!projectId || !projectRequirementId || !fileReference || !objectKey || !originalFilename) {
    return res.status(400).json({ error: "Required fields: projectId, projectRequirementId, fileReference, objectKey, originalFilename" });
  }
  if (!(await requireProjectPermission(req, res, String(projectId), "documents.create"))) return;
  const key = String(objectKey);
  if (!key.startsWith(`projects/${projectId}/`)) {
    return res.status(400).json({ error: "Invalid object key namespace", code: "INVALID_OBJECT_KEY" });
  }
  try {
    const { rows: reqRows } = await req.db.query(
      "SELECT id FROM project_export_document_requirements WHERE id = $1::uuid AND project_id = $2::uuid",
      [projectRequirementId, projectId],
    );
    if (reqRows.length === 0) return res.status(404).json({ error: "Not found" });
    const { rows } = await req.db.query(
      `INSERT INTO project_export_documents (project_id, project_requirement_id, file_reference,
        object_key, original_filename, mime_type, sha256_checksum, version_no, expiry_date, notes,
        uploaded_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11::uuid, now(), now())
       RETURNING *`,
      [projectId, projectRequirementId, fileReference, key, originalFilename,
        mimeType || null, sha256Checksum || null, versionNo || 1, expiryDate || null,
        notes || null, req.user?.id || null],
    );
    res.status(201).json({ projectExportDocument: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create project export document" });
  }
});

app.patch("/api/v1/project-export-documents/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { status, notes } = req.body ?? {};
  if (!status) return res.status(400).json({ error: "Required field: status" });
  const allowed = ["uploaded", "under_review", "approved", "rejected", "expired", "superseded"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Allowed: ${allowed.join(", ")}` });
  }
  try {
    const { rows: existingRows } = await req.db.query(
      "SELECT id, project_id FROM project_export_documents WHERE id = $1::uuid",
      [req.params.id],
    );
    if (existingRows.length === 0) return res.status(404).json({ error: "Not found" });
    if (!(await requireProjectPermission(req, res, existingRows[0].project_id, "documents.update"))) return;
    const reviewerId = req.user?.id || null;
    const { rows } = await req.db.query(
      `UPDATE project_export_documents
       SET status = $1, notes = COALESCE($2, notes), reviewed_by = $3::uuid,
           reviewed_at = CASE WHEN $1 IN ('approved', 'rejected') THEN now() ELSE reviewed_at END,
           updated_at = now()
       WHERE id = $4::uuid RETURNING *`,
      [status, notes || null, reviewerId, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json({ document: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to update document" });
  }
});

// ============================================
// Notification routes (P11)
// ============================================

app.get("/api/v1/buyers/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM buyers WHERE id = $1::uuid", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Buyer not found" });
    res.json({ buyer: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to load buyer" });
  }
});

app.get("/api/v1/contracts/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows: scopeRows } = await req.db.query(
      "SELECT project_id FROM contracts WHERE id = $1::uuid AND project_id IS NOT NULL",
      [req.params.id],
    );
    if (scopeRows.length === 0) return res.status(404).json({ error: "Contract not found in an accessible Project." });
    const projectId = scopeRows[0].project_id;
    if (!(await requireProjectPermission(req, res, projectId, "contract.view"))) return;
    const { rows } = await req.db.query(
      "SELECT * FROM contracts WHERE id = $1::uuid AND project_id = $2::uuid",
      [req.params.id, projectId],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Contract not found in this Project." });
    return res.json({ contract: rows[0] });
  } catch (error) {
    return res.status(500).json(internalServerErrorPayload());
  }
});

// ============================================
// Admin routes
// ============================================
app.get("/api/v1/users", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      "SELECT user_id AS id, email, name, role, is_active, neon_auth_user_id, created_at, updated_at FROM public.pke_admin_list_users($1::integer, $2::integer)",
      [100, 0],
    );
    res.json({ users: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load users" });
  }
});

// Admin provisioning creates a PKE pending account first. The browser then uses the Neon SDK Admin
// createUser operation; only the signed user.created webhook may link the provider identity.
app.post("/api/v1/admin/users/provision", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  if (process.env.NEON_AUTH_ADMIN_PROVISIONING_READY !== "true" || process.env.NEON_AUTH_WEBHOOK_ENABLED !== "true") {
    return res.status(503).json({ error: "Admin provisioning is not enabled for this environment.", code: "PROVISIONING_NOT_READY" });
  }
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!email || !name || reason.length < 5) {
    return res.status(400).json({ error: "Email, name, and an audit reason of at least five characters are required.", code: "INVALID_PROVISION_INPUT" });
  }
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM public.pke_admin_provision_user($1::text, $2::text, $3::text)",
      [email, name, reason],
    );
    return res.status(201).json({ user: rows[0] });
  } catch (error: any) {
    const code = typeof error?.code === "string" ? error.code : "";
    if (code === "23505") return res.status(409).json({ error: "Email already belongs to an existing or linked PKE account.", code: "USER_ALREADY_EXISTS" });
    if (code === "22023") return res.status(400).json({ error: "Provisioning input is invalid.", code: "INVALID_PROVISION_INPUT" });
    if (code === "42501") return res.status(403).json({ error: "Platform Admin authorization is required.", code: "ADMIN_REQUIRED" });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/admin/projects/:projectId/members", requireAuth, requireAdmin, async (_req: express.Request, res: express.Response) => {
  return res.status(403).json({
    error: "Platform Admin may appoint or replace the Project Manager only. Project role staffing is decided by the PM.",
    code: "PLATFORM_ADMIN_PM_APPOINTMENT_ONLY",
  });
});

app.get("/api/v1/admin/projects/:projectId/pm-governance", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const projectId = req.params.projectId as string;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(projectId)) {
    return res.status(400).json({ error: "Valid Project id is required.", code: "INVALID_PROJECT_ID" });
  }
  try {
    const { rows: projectRows } = await req.db.query(
      "SELECT id, name, is_active FROM public.projects WHERE id = $1::uuid",
      [projectId],
    );
    if (projectRows.length !== 1) return res.status(404).json({ error: "Project not found.", code: "PROJECT_NOT_FOUND" });
    const { rows: members } = await req.db.query(
      `SELECT pm.id, pm.user_id, u.email, u.name, pm.is_active, pm.joined_at,
              pm.expires_at, pm.deactivated_at,
              COALESCE(assignments.roles, '[]'::jsonb) AS role_assignments
         FROM public.project_members pm
         JOIN public.users u ON u.id = pm.user_id
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(jsonb_build_object(
             'id', a.id, 'projectRoleId', a.project_role_id,
             'roleCode', pr.role_code, 'roleName', pr.name,
             'isActive', a.is_active, 'expiresAt', a.expires_at, 'revokedAt', a.revoked_at
           ) ORDER BY a.created_at DESC) AS roles
             FROM public.project_role_assignments a
             JOIN public.project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
            WHERE a.project_member_id = pm.id AND pr.role_code = 'pm'
         ) assignments ON true
        WHERE pm.project_id = $1::uuid
        ORDER BY u.email`,
      [projectId],
    );
    const { rows: roles } = await req.db.query(
      `SELECT id, role_code, name, description, is_active
         FROM public.project_roles
        WHERE project_id = $1::uuid AND role_code = 'pm'
        ORDER BY role_code`,
      [projectId],
    );
    return res.json({ project: projectRows[0], members, roles });
  } catch (error: any) {
    logger.error("Platform Admin PM governance read failed:", { code: error?.code || "UNKNOWN" });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/admin/projects/:projectId/pm-appointment", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;
  const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
  const replaceUserId = typeof req.body?.replaceUserId === "string" ? req.body.replaceUserId : "";
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(projectId) || !uuidPattern.test(userId) || (replaceUserId && !uuidPattern.test(replaceUserId)) || reason.length < 5) {
    return res.status(400).json({ error: "Valid Project, PM user and audit reason (at least 5 characters) are required.", code: "INVALID_PM_APPOINTMENT_INPUT" });
  }
  try {
    await req.db.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':pm-appointment', 0))",
      [projectId],
    );
    const { rows: projectRows } = await req.db.query(
      "SELECT id, name FROM public.projects WHERE id = $1::uuid AND is_active = true FOR UPDATE",
      [projectId],
    );
    if (projectRows.length !== 1) return res.status(404).json({ error: "Active Project not found.", code: "PROJECT_NOT_FOUND" });

    const { rows: userRows } = await req.db.query(
      "SELECT user_id, email, is_active, neon_auth_user_id FROM public.pke_admin_get_user($1::uuid)",
      [userId],
    );
    if (userRows.length !== 1) return res.status(404).json({ error: "PKE user not found.", code: "USER_NOT_FOUND" });
    if (userRows[0].is_active !== true || !userRows[0].neon_auth_user_id) {
      return res.status(409).json({ error: "PM must have an active PKE account and linked Neon Auth identity.", code: "PM_USER_NOT_READY" });
    }

    let { rows: pmRoleRows } = await req.db.query(
      "SELECT id FROM public.project_roles WHERE project_id = $1::uuid AND role_code = 'pm' AND is_active = true LIMIT 1 FOR UPDATE",
      [projectId],
    );
    if (pmRoleRows.length !== 1) {
      const pmTemplate = getCanonicalRoleTemplate("pm");
      if (!pmTemplate) return res.status(500).json({ error: "Canonical PM template is unavailable.", code: "PM_TEMPLATE_UNAVAILABLE" });
      const { rows: permissionRows } = await req.db.query(
        "SELECT id, code FROM public.permissions WHERE code = ANY($1::text[]) AND is_active = true",
        [pmTemplate.permissionCodes],
      );
      const found = new Set(permissionRows.map((row: any) => row.code));
      const missing = pmTemplate.permissionCodes.filter((code) => !found.has(code));
      if (missing.length) return res.status(503).json({ error: "PM template permission catalogue is incomplete.", code: "ROLE_TEMPLATE_PERMISSION_CATALOG_INCOMPLETE", missingPermissionCodes: missing });
      const { rows: created } = await req.db.query(
        `INSERT INTO public.project_roles
           (project_id, role_code, name, description, is_active, created_by, created_at, updated_at)
         VALUES ($1::uuid, 'pm', $2::text, $3::text, true, $4::uuid, now(), now())
         ON CONFLICT (project_id, role_code) DO UPDATE SET is_active = true, updated_at = now()
         RETURNING id`,
        [projectId, pmTemplate.label, pmTemplate.restrictions.join(" "), req.user?.id],
      );
      pmRoleRows = created;
      await req.db.query(
        `INSERT INTO public.project_role_permissions
           (project_id, project_role_id, permission_id, granted_by, granted_at)
         SELECT $1::uuid, $2::uuid, p.id, $3::uuid, now()
           FROM public.permissions p
          WHERE p.code = ANY($4::text[]) AND p.is_active = true
         ON CONFLICT (project_role_id, permission_id) DO NOTHING`,
        [projectId, pmRoleRows[0].id, req.user?.id, pmTemplate.permissionCodes],
      );
    }
    const pmRoleId = pmRoleRows[0].id;

    const { rows: currentRows } = await req.db.query(
      `SELECT pm.id AS member_id, a.id AS assignment_id, a.user_id,
              a.project_role_id, a.is_active, a.expires_at, u.email, pr.role_code
         FROM public.project_role_assignments a
         JOIN public.project_members pm ON pm.id = a.project_member_id
         JOIN public.project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
         JOIN public.users u ON u.id = a.user_id
        WHERE a.project_id = $1::uuid AND pr.role_code = 'pm'
          AND a.is_active = true AND a.revoked_at IS NULL
          AND (a.expires_at IS NULL OR a.expires_at > now())
          AND pm.is_active = true AND pm.deactivated_at IS NULL
          AND (pm.expires_at IS NULL OR pm.expires_at > now())
        FOR UPDATE OF a, pm`,
      [projectId],
    );
    const current = currentRows[0] ?? null;
    const pmDecision = evaluatePmAppointment(currentRows, userId, replaceUserId || null);
    if (pmDecision.ok === false) {
      if (pmDecision.code === "MULTIPLE_ACTIVE_PM_ASSIGNMENTS") {
        return res.status(409).json({ error: "More than one active PM exists; Admin must explicitly reconcile appointments before continuing.", code: pmDecision.code });
      }
      return res.status(409).json({
        error: "An active PM is already appointed. Supply its exact userId as replaceUserId to perform an audited handover.",
        code: pmDecision.code,
        currentPm: current ? { userId: current.user_id, email: current.email } : null,
      });
    }
    if (pmDecision.idempotent) {
      return res.status(200).json({ appointment: { projectId, userId, roleCode: "pm", status: "active" }, idempotentReplay: true });
    }

    const { rows: candidateMemberships } = await req.db.query(
      "SELECT id, project_role_id, is_active, deactivated_at, expires_at FROM public.project_members WHERE project_id = $1::uuid AND user_id = $2::uuid FOR UPDATE",
      [projectId, userId],
    );
    if (candidateMemberships.length > 1) return res.status(409).json({ error: "Duplicate Project membership requires reconciliation.", code: "DUPLICATE_PROJECT_MEMBERSHIP" });
    const candidateMembership = candidateMemberships[0] ?? null;
    // Existing membership and role assignments are independent; appointing PM must not replace another role.
    if (candidateMembership && (candidateMembership.is_active !== true || candidateMembership.deactivated_at != null ||
        (candidateMembership.expires_at && new Date(candidateMembership.expires_at).getTime() <= Date.now()))) {
      return res.status(409).json({ error: "Project membership is inactive or expired. Admin must explicitly reactivate membership before appointing this user as PM.", code: "MEMBERSHIP_REACTIVATION_REQUIRED" });
    }

    if (current && current.user_id !== userId) {
      const { rows: oldRows } = await req.db.query(
        `UPDATE public.project_role_assignments
            SET is_active = false, revoked_at = now(), revoked_by = $2::uuid,
                revoke_reason = $3::text, updated_at = now()
          WHERE id = $1::uuid AND revoked_at IS NULL RETURNING *`,
        [current.assignment_id, req.user?.id, reason],
      );
      await req.db.query(
        `INSERT INTO public.audit_events
           (actor_user_id, actor_type, actor_role, action, target_type, target_id, project_id,
            reason, before_snapshot, after_snapshot, metadata, outcome)
         VALUES ($1::uuid, 'user', 'platform_admin', 'project.pm.unappointed', 'project_pm_appointment',
                 $2::uuid, $3::uuid, $4::text, $5::jsonb, $6::jsonb, $7::jsonb, 'success')`,
        [req.user?.id, current.assignment_id, projectId, reason, JSON.stringify(current),
         JSON.stringify({ is_active: false, revoked_at: oldRows[0]?.revoked_at, revoked_by: oldRows[0]?.revoked_by }),
         JSON.stringify({ previousPmUserId: current.user_id, nextPmUserId: userId })],
      );
    }

    let appointed;
    if (candidateMembership) {
      appointed = candidateMembership;
    } else {
      const { rows } = await req.db.query(
        `INSERT INTO public.project_members
           (project_id, user_id, project_role_id, is_active, joined_at, updated_at)
         VALUES ($1::uuid, $2::uuid, NULL, true, now(), now()) RETURNING *`,
        [projectId, userId],
      );
      appointed = rows[0];
    }
    await req.db.query(
      `UPDATE public.project_role_assignments
          SET is_active = false, updated_at = now()
        WHERE project_id = $1::uuid AND project_member_id = $2::uuid
          AND project_role_id = $3::uuid AND is_active = true
          AND revoked_at IS NULL AND expires_at IS NOT NULL AND expires_at <= now()`,
      [projectId, appointed.id, pmRoleId],
    );
    const { rows: assignmentResult } = await req.db.query(
      `INSERT INTO public.project_role_assignments
         (project_id, project_member_id, user_id, project_role_id, is_active, assigned_at, assigned_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, true, now(), $5::uuid)
       RETURNING *`,
      [projectId, appointed.id, userId, pmRoleId, req.user?.id],
    );
    const pmAssignment = assignmentResult[0];
    await req.db.query(
      `INSERT INTO public.audit_events
         (actor_user_id, actor_type, actor_role, action, target_type, target_id, project_id,
          reason, before_snapshot, after_snapshot, metadata, outcome)
       VALUES ($1::uuid, 'user', 'platform_admin', 'project.pm.appointed', 'project_pm_appointment',
               $2::uuid, $3::uuid, $4::text, $5::jsonb, $6::jsonb, $7::jsonb, 'success')`,
      [req.user?.id, appointed.id, projectId, reason,
       candidateMembership ? JSON.stringify(candidateMembership) : null,
       JSON.stringify({ userId, projectRoleId: pmRoleId, assignmentId: pmAssignment.id, isActive: true }),
       JSON.stringify({ email: userRows[0].email, handoverFromUserId: current?.user_id ?? null })],
    );
    return res.status(current ? 200 : 201).json({
      appointment: { projectId, userId, email: userRows[0].email, projectRoleId: pmRoleId, status: "active" },
      handoverFromUserId: current?.user_id ?? null,
    });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "PM appointment conflicts with an existing Project membership.", code: "PM_APPOINTMENT_CONFLICT" });
    logger.error("Project PM appointment failed:", { code: error?.code || "UNKNOWN" });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/admin/projects/:projectId/pm-appointment/:userId/deactivate", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const projectId = req.params.projectId as string;
  const userId = req.params.userId as string;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(projectId) || !uuidPattern.test(userId) || reason.length < 5) {
    return res.status(400).json({ error: "Valid Project, PM user, and administrative reason are required.", code: "INVALID_PM_DEACTIVATION_INPUT" });
  }
  try {
    await req.db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':pm-appointment', 0))", [projectId]);
    const { rows: beforeRows } = await req.db.query(
      `SELECT a.*, pr.role_code
         FROM public.project_role_assignments a
         JOIN public.project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
        WHERE a.project_id = $1::uuid AND a.user_id = $2::uuid
          AND pr.role_code = 'pm' AND a.is_active = true AND a.revoked_at IS NULL
        FOR UPDATE OF a`,
      [projectId, userId],
    );
    if (beforeRows.length === 0) return res.status(404).json({ error: "No active PM assignment found for this user in the Project.", code: "ACTIVE_PM_ASSIGNMENT_NOT_FOUND" });
    const revoked = [];
    for (const before of beforeRows) {
      const { rows } = await req.db.query(
        `UPDATE public.project_role_assignments
            SET is_active = false, revoked_at = now(), revoked_by = $3::uuid,
                revoke_reason = $4::text, updated_at = now()
          WHERE id = $2::uuid AND project_id = $1::uuid AND revoked_at IS NULL
          RETURNING *`,
        [projectId, before.id, req.user?.id ?? null, reason],
      );
      if (rows[0]) {
        revoked.push(rows[0]);
        await req.db.query(
          `INSERT INTO public.audit_events
             (actor_user_id, actor_type, actor_role, action, target_type, target_id, project_id,
              reason, before_snapshot, after_snapshot, metadata, outcome)
           VALUES ($1::uuid, 'user', 'platform_admin', 'project.pm.deactivated', 'project_pm_assignment',
                   $2::uuid, $3::uuid, $4::text, $5::jsonb, $6::jsonb, $7::jsonb, 'success')`,
          [req.user?.id, before.id, projectId, reason, JSON.stringify(before), JSON.stringify(rows[0]),
           JSON.stringify({ pmUserId: userId, adminDecision: true })],
        );
      }
    }
    return res.json({ ok: true, deactivatedAssignments: revoked.length, assignments: revoked, membershipPreserved: true });
  } catch (error: any) {
    logger.error("Admin PM deactivation failed:", { code: error?.code || "UNKNOWN" });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/admin/users/:id/status", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const userId = req.params.id as string;
  const isActive = req.body?.isActive;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) || typeof isActive !== "boolean" || reason.length < 5) {
    return res.status(400).json({ error: "Valid user id, isActive, and an audit reason are required.", code: "INVALID_USER_STATUS_INPUT" });
  }
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM public.pke_admin_set_user_active($1::uuid, $2::boolean, $3::text)",
      [userId, isActive, reason],
    );
    if (!rows.length) return res.status(404).json({ error: "PKE user not found.", code: "USER_NOT_FOUND" });
    return res.json({ user: rows[0] });
  } catch (error: any) {
    const code = typeof error?.code === "string" ? error.code : "";
    if (code === "P0002") return res.status(404).json({ error: "PKE user not found.", code: "USER_NOT_FOUND" });
    if (code === "23514" || code === "22023") return res.status(409).json({ error: "User is not eligible for this status change.", code: "USER_STATUS_CONFLICT" });
    if (code === "42501") return res.status(403).json({ error: "Platform Admin authorization is required.", code: "ADMIN_REQUIRED" });
    return res.status(500).json(internalServerErrorPayload());
  }
});

// Admin-initiated password reset (Neon Auth / Better Auth). Sends reset request for the target user's
// explicitly linked Neon Auth identity; never exposes or mutates password hashes and never infers by email.
app.post("/api/v1/admin/users/:id/password-reset", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const actorId = req.user?.id || null;
  const targetId = req.params.id;
  if (!targetId || typeof targetId !== "string") {
    return res.status(400).json({ error: "Invalid target user.", code: "INVALID_TARGET" });
  }
  let auditStatus: "succeeded" | "failed" = "failed";
  try {
    const { rows } = await req.db.query(
      "SELECT user_id AS id, email, neon_auth_user_id, is_active FROM public.pke_admin_get_user($1::uuid)",
      [targetId]
    );
    if (rows.length !== 1) {
      try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [targetId, actorId]); } catch {}
      return res.status(404).json({ error: "User not found.", code: "USER_NOT_FOUND" });
    }
    const target = rows[0];
    if (!target.neon_auth_user_id) {
      try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [target.id, actorId]); } catch {}
      return res.status(409).json({ error: "User is not linked to a verified Neon Auth identity.", code: "NEON_IDENTITY_NOT_LINKED" });
    }
    if (target.is_active !== true) {
      try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [target.id, actorId]); } catch {}
      return res.status(409).json({ error: "User account is inactive.", code: "USER_INACTIVE" });
    }

    const baseUrl = process.env.NEON_AUTH_BASE_URL;
    if (!baseUrl) {
      try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [target.id, actorId]); } catch {}
      return res.status(503).json({ error: "Password reset service is not configured.", code: "AUTH_NOT_CONFIGURED" });
    }
    let endpoint: URL;
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== "https:") throw new Error("HTTPS required");
      // Better Auth endpoint path (Neon Auth)
      endpoint = new URL("/request-password-reset", parsed.origin + parsed.pathname.replace(/\/$/, ""));
    } catch {
      try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [target.id, actorId]); } catch {}
      return res.status(503).json({ error: "Password reset service is not configured correctly.", code: "AUTH_NOT_CONFIGURED" });
    }

    const redirectToRaw = typeof req.body?.redirectTo === "string" ? req.body.redirectTo : "";
    const redirectTo = redirectToRaw && /^https?:\/\//i.test(redirectToRaw) ? redirectToRaw : undefined;
    const payload: Record<string, string> = { email: String(target.email || "").trim().toLowerCase() };
    if (redirectTo) payload.redirectTo = redirectTo;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let upstreamOk = false;
    try {
      const resp = await fetch(endpoint.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      // Treat 2xx as accepted; do not leak upstream details.
      upstreamOk = resp.ok;
    } catch {
      upstreamOk = false;
    } finally {
      clearTimeout(timeout);
    }

    auditStatus = upstreamOk ? "succeeded" : "failed";
    try {
      await req.db.query(
        `INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at)
         VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, $3::text, now(), now())`,
        [target.id, actorId, auditStatus]
      );
    } catch {}

    if (!upstreamOk) {
      return res.status(502).json({ error: "Permintaan reset password tidak dapat diproses saat ini.", code: "RESET_REQUEST_FAILED" });
    }
    return res.json({ ok: true, requested: true });
  } catch (error) {
    try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [targetId, actorId]); } catch {}
    return res.status(500).json({ error: "Failed to process password reset request.", code: "RESET_REQUEST_ERROR" });
  }
});

app.get("/api/v1/role-templates", requireAuth, async (_req: express.Request, res: express.Response) => {
  res.json({
    version: 1,
    templates: listProjectRoleTemplates(),
    note: "Template activation does not assign a user. Platform Admin appoints the PM; the appointed PM activates Project workstream templates.",
  });
});

app.post("/api/v1/projects/:id/role-templates/:roleCode/activate", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const roleCode = Array.isArray(req.params.roleCode) ? req.params.roleCode[0] : req.params.roleCode;
  const template = getCanonicalRoleTemplate(roleCode);
  if (!template || template.scope !== "project") {
    return res.status(404).json({ error: "Canonical Project role template not found.", code: "ROLE_TEMPLATE_NOT_FOUND" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "project.roles.manage"))) return;
  try {
    const { rows: permissionRows } = await req.db.query(
      "SELECT id, code FROM public.permissions WHERE code = ANY($1::text[]) AND is_active = true",
      [template.permissionCodes],
    );
    const found = new Set(permissionRows.map((row: any) => row.code));
    const missing = template.permissionCodes.filter((code) => !found.has(code));
    if (missing.length > 0) {
      return res.status(503).json({
        error: "Role template cannot be activated until every canonical permission exists and is active.",
        code: "ROLE_TEMPLATE_PERMISSION_CATALOG_INCOMPLETE",
        missingPermissionCodes: missing,
      });
    }
    const { rows: roleRows } = await req.db.query(
      `INSERT INTO public.project_roles
         (project_id, role_code, name, description, is_active, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::text, $3::text, $4::text, true, $5::uuid, now(), now())
       ON CONFLICT (project_id, role_code)
       DO UPDATE SET is_active = true, name = EXCLUDED.name, description = EXCLUDED.description, updated_at = now()
       RETURNING *`,
      [projectId, template.code, template.label, template.restrictions.join(" "), req.user?.id],
    );
    const projectRole = roleRows[0];
    await req.db.query(
      `INSERT INTO public.project_role_permissions
         (project_id, project_role_id, permission_id, granted_by, granted_at)
       SELECT $1::uuid, $2::uuid, p.id, $3::uuid, now()
         FROM public.permissions p
        WHERE p.code = ANY($4::text[]) AND p.is_active = true
       ON CONFLICT (project_role_id, permission_id) DO NOTHING`,
      [projectId, projectRole.id, req.user?.id, template.permissionCodes],
    );
    // The allowlist is the canonical extension point for permissions added after the role template version.
    // This keeps newly activated roles in sync with UAT-validated P1 grants without widening beyond the allowlist.
    await req.db.query(
      `INSERT INTO public.project_role_permissions
         (project_id, project_role_id, permission_id, granted_by, granted_at)
       SELECT $1::uuid, $2::uuid, p.id, $3::uuid, now()
         FROM public.pke_project_role_permission_allowlist a
         JOIN public.permissions p ON p.code=a.permission_code AND p.is_active=true
        WHERE a.role_code=$4::text
       ON CONFLICT (project_role_id, permission_id) DO NOTHING`,
      [projectId, projectRole.id, req.user?.id, template.code],
    );
    const { rows: grantedRows } = await req.db.query(
      `SELECT p.code FROM public.project_role_permissions prp
       JOIN public.permissions p ON p.id=prp.permission_id
       WHERE prp.project_role_id=$1::uuid AND p.is_active=true ORDER BY p.code`,
      [projectRole.id],
    );
    return res.status(200).json({
      role: projectRole,
      activated: true,
      assignedUsers: 0,
      templateVersion: template.templateVersion,
      permissionCodes: grantedRows.map((row: any) => row.code),
    });
  } catch {
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/roles", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM role_catalog WHERE is_active = true ORDER BY name");
    res.json({ roles: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load roles" });
  }
});

app.get("/api/v1/permissions", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM permissions WHERE is_active = true ORDER BY code");
    res.json({ permissions: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load permissions" });
  }
});

// Session revocation is performed by the Neon Auth Admin provider SDK in the Admin UI.
// Do not expose a database-only endpoint that would incorrectly deactivate the global PKE account.

// ============================================
// Privileged action audit (P03 Identity/RBAC)
// ============================================
app.get("/api/v1/audit/privileged-actions", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      `SELECT ae.id, ae.entity_type, ae.entity_id, ae.action, ae.approved_by, u.email AS approved_by_email, ae.status, ae.created_at, ae.updated_at
         FROM approval_events ae
         LEFT JOIN users u ON u.id = ae.approved_by
        ORDER BY ae.created_at DESC LIMIT 100`,
    );
    res.json({ auditEvents: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load audit events" });
  }
});

app.post("/api/v1/audit/privileged-actions", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { entityType, entityId, action, status } = req.body ?? {};
  if (!entityType || !entityId || !action) {
    return res.status(400).json({ error: "Required fields: entityType, entityId, action" });
  }
  try {
    const { rows } = await req.db.query(
      `INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at)
       VALUES ($1::text, $2::uuid, $3::text, $4::uuid, $5::text, now(), now()) RETURNING *`,
      [entityType, entityId, action, req.user?.id || null, status || "pending"],
    );
    res.status(201).json({ auditEvent: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create audit event" });
  }
});


  // P1 project-scoped domain workflows — schema-gated and fail-closed where not provisioned.
  const p1Ready = async (req: express.Request, res: express.Response): Promise<boolean> => {
    const { rows } = await req.db.query("SELECT to_regclass('public.p1_domain_records') IS NOT NULL AS ready");
    if (!rows[0]?.ready) { res.status(503).json({error:"P1 workflow schema is not provisioned.",code:"P1_WORKFLOW_NOT_PROVISIONED"}); return false; }
    return true;
  };
  const p1DefaultOwner: Record<P1RecordType,string> = {
    purchase_requisition:"procurement",purchase_order:"procurement",supplier_commitment:"supplier",goods_receipt_match:"procurement",
    production_batch:"production_manager",packing_batch:"packing_supervisor",quality_sample:"qc_officer",quality_result:"laboratory_officer",
    qa_release:"qa_manager",hse_inspection:"hse_officer",hse_action:"hse_officer",dispatch_assignment:"transporter",
    vessel_call:"master_of_loading",loading_plan:"master_of_loading",loading_survey:"marine_surveyor",ship_master_ack:"ship_master",
    laytime_event:"master_of_loading",lc_record:"document_officer",lc_clause:"document_officer",lc_discrepancy:"document_officer",
    lc_presentation:"document_officer",audit_finding:"internal_auditor",audit_response:"internal_auditor",audit_closure:"internal_auditor",
  };
  const p1ExternalRoles: Partial<Record<P1RecordType,string[]>> = {
    supplier_commitment:["supplier"],dispatch_assignment:["transporter","driver"],vessel_call:["shipping_agent","terminal_representative"],
    loading_survey:["marine_surveyor"],ship_master_ack:["ship_master"],laytime_event:["shipping_agent"],
    lc_record:["shipping_agent"],lc_clause:["shipping_agent"],lc_discrepancy:["shipping_agent"],lc_presentation:["shipping_agent"],
  };
  const p1Permission = async (req: express.Request,type:P1RecordType,action:"view"|"create"|"update"|"manage_external"):Promise<string|null> => {
    const q=await req.db.query("SELECT public.p1_workflow_permission($1,$2) AS code",[type,action]);
    return typeof q.rows[0]?.code==="string"?q.rows[0].code:null;
  };
  const p1ReadPermission = async (req:express.Request,projectId:string,type:P1RecordType):Promise<string|null> => {
    if(type==="audit_finding"||type==="audit_response"){
      const q=await req.db.query("SELECT public.pke_has_project_permission($1::uuid,'audit.finding.view') AS auditor,public.pke_has_project_permission($1::uuid,'audit.finding.respond') AS owner",[projectId]);
      return q.rows[0]?.auditor?"audit.finding.view":q.rows[0]?.owner?"audit.finding.respond":null;
    }
    if(type==="hse_action"){
      const q=await req.db.query("SELECT public.pke_has_project_permission($1::uuid,'hse.action.view') AS viewer,public.pke_has_project_permission($1::uuid,'hse.action.respond') AS owner,public.pke_has_project_permission($1::uuid,'hse.action.manage') AS manager",[projectId]);
      return q.rows[0]?.viewer?"hse.action.view":q.rows[0]?.owner?"hse.action.respond":q.rows[0]?.manager?"hse.action.manage":null;
    }
    const view=await p1Permission(req,type,"view"),manage=await p1Permission(req,type,"manage_external");
    if(!view)return manage;
    const q=await req.db.query("SELECT public.pke_has_project_permission($1::uuid,$2) AS can_view,public.pke_has_project_permission($1::uuid,$3) AS can_manage",[projectId,view,manage]);
    return q.rows[0]?.can_view?view:q.rows[0]?.can_manage?manage:null;
  };
  const p1Roles = async (req: express.Request,projectId:string):Promise<string[]> => {
    const candidates=["pm","project_admin","platform_admin","finance","accounting","procurement","contract_manager","buyer","supplier","pks_site_manager",
      "production_manager","packing_supervisor","qc_officer","laboratory_officer","qa_manager","hse_officer",
      "transport_manager","dispatcher","transporter","driver","checker","master_of_loading","loading_manager",
      "loading_supervisor","loading_operator","marine_surveyor","ship_master","terminal_representative","shipping_agent",
      "document_officer","internal_auditor","warehouse","warehouse_manager","warehouse_officer","inventory_controller"];
    const q=await req.db.query(
      `SELECT r.role_code FROM unnest($2::text[]) AS r(role_code)
       WHERE public.p1_has_active_project_role_assignment($1::uuid,r.role_code,public.pke_current_user_id())`,
      [projectId,candidates]
    );
    return q.rows.map((row:any)=>String(row.role_code));
  };
  const p1Role = async (req: express.Request):Promise<string> => {
    const q=await req.db.query("SELECT current_setting('app.current_role',true) AS code");
    return String(q.rows[0]?.code??"");
  };
  const p1HasRole = async (req: express.Request,projectId:string,userId:string,roleCodes:string[]):Promise<boolean> => {
    for(const roleCode of roleCodes){
      const q=await req.db.query(
        "SELECT public.p1_has_active_project_role_assignment($1::uuid,$2::text,$3::uuid) AS active",
        [projectId,roleCode,userId]
      );
      if(q.rows[0]?.active) return true;
    }
    return false;
  };

  app.get("/api/v1/projects/:projectId/p1-workflows",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,type=String(req.query.recordType??"");
    if(!isP1RecordType(type)) return res.status(400).json({error:"recordType is required and must be valid."});
    try {
      if(!(await p1Ready(req,res))) return;
      const permission=await p1ReadPermission(req,projectId,type);
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const status=typeof req.query.status==="string"?req.query.status:null;
      const q=await req.db.query("SELECT * FROM public.p1_domain_records WHERE project_id=$1::uuid AND record_type=$2 AND ($3::text IS NULL OR status=$3) ORDER BY updated_at DESC LIMIT 200",[projectId,type,status]);
      return res.json({projectId,recordType:type,records:q.rows});
    } catch { return res.status(500).json(internalServerErrorPayload()); }
  });

  app.get("/api/v1/projects/:projectId/p1-workflows/:id/events",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,id=req.params.id as string;
    try{
      if(!(await p1Ready(req,res))) return;
      const record=await req.db.query("SELECT record_type FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid",[id,projectId]);
      if(record.rows.length!==1) return res.status(404).json({error:"P1 workflow record not found."});
      const permission=await p1ReadPermission(req,projectId,record.rows[0].record_type);
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const events=await req.db.query("SELECT * FROM public.p1_domain_events WHERE record_id=$1::uuid AND project_id=$2::uuid ORDER BY occurred_at ASC",[id,projectId]);
      return res.json({events:events.rows});
    }catch{return res.status(500).json(internalServerErrorPayload());}
  });

  app.get("/api/v1/projects/:projectId/p1-workflows/:id/evidence",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,id=req.params.id as string;
    try{
      if(!(await p1Ready(req,res))) return;
      const record=await req.db.query("SELECT record_type FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid",[id,projectId]);
      if(record.rows.length!==1) return res.status(404).json({error:"P1 workflow record not found."});
      const permission=await p1ReadPermission(req,projectId,record.rows[0].record_type);
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const evidence=await req.db.query(
        "SELECT id,evidence_type,object_key,storage_bucket,original_filename,mime_type,file_size_bytes,sha256_checksum,uploaded_by,uploaded_at,verified_by,verified_at,status FROM public.p1_domain_evidence WHERE record_id=$1::uuid AND project_id=$2::uuid ORDER BY uploaded_at DESC",
        [id,projectId]
      );
      return res.json({evidence:evidence.rows});
    }catch{return res.status(500).json(internalServerErrorPayload());}
  });

  app.post("/api/v1/projects/:projectId/p1-workflows",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,actorId=String(req.user?.id??""),b=req.body??{},type=b.recordType;
    if(!isP1RecordType(type)) return res.status(400).json({error:"Valid recordType is required."});
    const title=typeof b.title==="string"?b.title.trim():"",payload=b.payload&&typeof b.payload==="object"&&!Array.isArray(b.payload)?b.payload:{};
    const errors=validateP1Create(type,payload);
    if(title.length<3||title.length>240) errors.push("title must contain 3-240 characters");
    if(typeof b.idempotencyKey!=="string"||b.idempotencyKey.trim().length<12) errors.push("idempotencyKey must contain at least 12 characters");
    if(errors.length) return res.status(400).json({error:"P1 validation failed.",code:"P1_VALIDATION_FAILED",details:errors});
    try {
      if(!(await p1Ready(req,res))) return;
      const permission=await p1Permission(req,type,"create");
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const priorRequest=await req.db.query("SELECT * FROM public.p1_domain_records WHERE project_id=$1::uuid AND idempotency_key=$2",[projectId,b.idempotencyKey.trim()]);
      if(priorRequest.rows.length){
        const prior=priorRequest.rows[0];
        if(prior.record_type!==type||prior.title!==title||JSON.stringify(prior.payload)!==JSON.stringify(payload)) return res.status(409).json({error:"Idempotency key conflict.",code:"IDEMPOTENCY_KEY_CONFLICT"});
        return res.status(200).json({record:prior,idempotentReplay:true});
      }
      const roleCode=await p1Role(req);
      if(["purchase_requisition","purchase_order","supplier_commitment"].includes(type)&&!["procurement","contract_manager"].includes(roleCode)) return res.status(403).json({error:"Procurement record creation is restricted to Procurement/Contract Manager."});
      if(type==="audit_finding"&&roleCode!=="internal_auditor") return res.status(403).json({error:"Only Internal Auditor may create findings."});
      if(type==="audit_closure"&&roleCode!=="internal_auditor") return res.status(403).json({error:"Only Internal Auditor may initiate closure."});
      if(type==="qa_release"&&roleCode!=="qa_manager") return res.status(403).json({error:"Only QA Manager may create release decisions."});
      if(type==="loading_survey"&&roleCode!=="marine_surveyor") return res.status(403).json({error:"Only Marine Surveyor may submit surveys."});
      if(type==="ship_master_ack"&&roleCode!=="ship_master") return res.status(403).json({error:"Only Ship Master may submit acknowledgements."});
      if(["purchase_order","supplier_commitment","goods_receipt_match","quality_sample","quality_result","audit_response","audit_closure","lc_clause","lc_discrepancy","lc_presentation","qa_release","hse_action"].includes(type)&&!b.parentRecordId) return res.status(400).json({error:"parentRecordId is required for this workflow type."});
      let parentRecord:any=null;
      if(b.parentRecordId){
        const parent=await req.db.query("SELECT id,record_type,status,created_by,owner_role_code,parent_record_id,payload FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid",[b.parentRecordId,projectId]);
        if(parent.rows.length!==1) return res.status(422).json({error:"Parent record is not in the selected Project."});
        parentRecord=parent.rows[0];
        if(type==="purchase_order"&&(parent.rows[0].record_type!=="purchase_requisition"||parent.rows[0].status!=="approved")) return res.status(409).json({error:"Purchase Order requires an approved requisition."});
        if(type==="supplier_commitment"&&(parent.rows[0].record_type!=="purchase_order"||!["issued","acknowledged","partially_received"].includes(parent.rows[0].status)||String(payload.purchaseOrderRecordId)!==String(b.parentRecordId))) return res.status(409).json({error:"Supplier commitment must reference its issued parent PO."});
        if(type==="goods_receipt_match"&&(parent.rows[0].record_type!=="purchase_order"||String(payload.purchaseOrderRecordId)!==String(b.parentRecordId))) return res.status(422).json({error:"Three-way match must reference its parent Purchase Order."});
        if(type==="quality_sample"&&!["production_batch","packing_batch"].includes(parent.rows[0].record_type)) return res.status(422).json({error:"QC sample must reference a production or packing batch."});
        if(type==="quality_result"&&(parent.rows[0].record_type!=="quality_sample"||String(payload.sampleId)!==String(parent.rows[0].payload.sampleId))) return res.status(422).json({error:"Quality result must reference the sample record it evaluates."});
        if(type==="audit_response"&&(parent.rows[0].record_type!=="audit_finding"||String(payload.findingRecordId)!==String(b.parentRecordId)||!["open","responded"].includes(parent.rows[0].status)||!(await p1HasRole(req,projectId,actorId,[parent.rows[0].owner_role_code])))) return res.status(403).json({error:"Only the active finding owner role may respond to its parent finding."});
        if(type==="audit_response"&&(parent.rows[0].record_type!=="audit_finding"||!["open","responded"].includes(parent.rows[0].status)||!(await p1HasRole(req,projectId,actorId,[parent.rows[0].owner_role_code])))) return res.status(403).json({error:"Only the active finding owner role may respond."});
        if(type==="audit_closure"&&(parent.rows[0].record_type!=="audit_finding"||String(payload.findingRecordId)!==String(b.parentRecordId))) return res.status(422).json({error:"Audit closure must reference the same parent audit finding."});
        if(type==="qa_release"&&(!["production_batch","packing_batch"].includes(parent.rows[0].record_type)||String(payload.sourceRecordId)!==String(b.parentRecordId))) return res.status(422).json({error:"QA release must reference its production or packing source record."});
        if(type==="hse_action"&&(parent.rows[0].record_type!=="hse_inspection"||String(payload.findingRecordId)!==String(b.parentRecordId))) return res.status(422).json({error:"HSE corrective action must reference its parent HSE inspection."});
        if(type==="lc_clause"&&(parent.rows[0].record_type!=="lc_record"||String(payload.lcRecordId)!==String(b.parentRecordId))) return res.status(422).json({error:"LC clause must reference its parent LC record."});
        if(type==="lc_discrepancy"&&parent.rows[0].record_type!=="lc_record"&&parent.rows[0].record_type!=="lc_clause") return res.status(422).json({error:"LC discrepancy must reference an LC record or clause."});
        if(type==="lc_presentation"&&parent.rows[0].record_type!=="lc_record") return res.status(422).json({error:"LC presentation must reference an LC record."});
      }
      if(type==="goods_receipt_match"){
        const po=await req.db.query("SELECT id,status,payload FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid AND record_type='purchase_order'",[payload.purchaseOrderRecordId,projectId]);
        const inputs=await req.db.query("SELECT * FROM public.p1_get_three_way_match_inputs($1::uuid,$2::uuid,$3::uuid)",[projectId,payload.warehouseReceiptId,payload.apInvoiceId]);
        if(po.rows.length!==1||inputs.rows.length!==1||!["issued","acknowledged","partially_received","received"].includes(po.rows[0].status)||!["verified","partial"].includes(inputs.rows[0].receipt_status)) return res.status(422).json({error:"PO, verified same-Project GRN and AP invoice are required."});
        const pp=po.rows[0].payload??{},ii=inputs.rows[0],gg=inputs.rows[0];
        if(ii.invoice_purchase_order_id&&String(ii.invoice_purchase_order_id)!==String(payload.purchaseOrderRecordId)) return res.status(409).json({error:"AP invoice is linked to another PO."});
        if(ii.invoice_goods_receipt_id&&String(ii.invoice_goods_receipt_id)!==String(payload.warehouseReceiptId)) return res.status(409).json({error:"AP invoice is linked to another GRN."});
        const match=validateThreeWayMatch({
          po:{projectId,supplierId:String(pp.supplierId??""),currencyCode:String(pp.currencyCode??""),items:Array.isArray(pp.items)?pp.items:[]},
          receipt:{projectId,quantity:Number(gg.receipt_quantity),unitCode:String(gg.receipt_unit),supplierId:null},
          invoice:{projectId,supplierId:String(ii.invoice_supplier_id),currencyCode:String(ii.invoice_currency_code),totalAmount:Number(ii.invoice_total_amount)},
          matchedQuantity:Number(payload.matchedQuantity),matchedAmount:Number(payload.matchedAmount),unitCode:String(payload.unitCode),currencyCode:String(payload.currencyCode),
        });
        if(!match.ok) return res.status(409).json({error:"Three-way match rejected.",code:match.reason});
      }
      if(type==="loading_survey"){
        const key=String(payload.certificateObjectKey??""),checksum=String(payload.sha256Checksum??""),size=Number(payload.certificateFileSizeBytes);
        const storage=privateStorage.status();
        if(!key.startsWith(`projects/${projectId}/`)||!storage.available||storage.bucket!=="pke-private-documents") return res.status(400).json({error:"Survey certificate must be stored in the Project private bucket.",code:"SURVEY_CERTIFICATE_STORAGE_INVALID"});
        try{await privateStorage.verifyObject(key,size,checksum);}catch{return res.status(422).json({error:"Survey certificate object checksum or size verification failed.",code:"SURVEY_CERTIFICATE_VERIFICATION_FAILED"});}
      }
      if(type==="production_batch"){
        if(b.sourceEntityType!=="production_batches"||!b.sourceEntityId) return res.status(400).json({error:"Production batch must link an existing production_batches row."});
        const q=await req.db.query("SELECT id FROM public.production_batches WHERE id=$1::uuid AND project_id=$2::uuid",[b.sourceEntityId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Production batch source is outside this Project."});
      }
      if(type==="packing_batch"){
        if(b.sourceEntityType!=="packing_batches"||!b.sourceEntityId) return res.status(400).json({error:"Packing batch must link an existing packing_batches row."});
        const q=await req.db.query("SELECT id FROM public.packing_batches WHERE id=$1::uuid AND project_id=$2::uuid",[b.sourceEntityId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Packing batch source is outside this Project."});
      }
      if(type==="quality_sample"){
        const q=payload.sampleId
          ? await req.db.query("SELECT id FROM public.product_quality_samples WHERE id=$1::uuid AND project_id=$2::uuid",[payload.sampleId,projectId])
          : await req.db.query("SELECT id FROM public.product_quality_samples WHERE sample_number=$1 AND project_id=$2::uuid",[payload.sampleNumber,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Quality sample must reference a same-Project sample."});
        payload.sampleId=String(q.rows[0].id);
      }
      if(type==="quality_result"){
        const q=await req.db.query("SELECT id FROM public.product_quality_samples WHERE id=$1::uuid AND project_id=$2::uuid",[payload.sampleId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Quality result sample is outside this Project."});
      }
      if(type==="dispatch_assignment"){
        const q=await req.db.query("SELECT id,vehicle_id FROM public.truck_trips WHERE id=$1::uuid AND project_id=$2::uuid",[payload.tripId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Dispatch assignment must reference a same-Project truck trip."});
        if(q.rows[0].vehicle_id&&String(q.rows[0].vehicle_id)!==String(payload.vehicleId)) return res.status(409).json({error:"Dispatch vehicle does not match the registered truck trip vehicle."});
        if(!await p1HasRole(req,projectId,String(payload.driverUserId),["driver"])) return res.status(422).json({error:"Dispatch driver must hold an active Driver Project role."});
      }
      if(type==="vessel_call"||type==="ship_master_ack"||type==="laytime_event"){
        const voyageId=String(payload.voyageId??"");
        const q=await req.db.query("SELECT id,vessel_id,port_id,origin_port_id,destination_port_id FROM public.voyages WHERE id=$1::uuid AND project_id=$2::uuid",[voyageId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Vessel workflow must reference a same-Project voyage."});
        if(type==="vessel_call"&&String(q.rows[0].vessel_id)!==String(payload.vesselId)) return res.status(422).json({error:"Vessel call vessel must match the Project voyage."});
        if(type==="vessel_call"&&![q.rows[0].port_id,q.rows[0].origin_port_id,q.rows[0].destination_port_id].filter(Boolean).map(String).includes(String(payload.portId))) return res.status(422).json({error:"Vessel call port must match the Project voyage route."});
      }
      if(type==="loading_plan"||type==="loading_survey"){
        const opId=String(payload.loadingOperationId??"");
        const q=await req.db.query("SELECT id,quantity FROM public.loading_operations WHERE id=$1::uuid AND project_id=$2::uuid",[opId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Loading operation is outside this Project."});
        if(type==="loading_plan"){
          const shipment=await req.db.query("SELECT quantity FROM public.shipments WHERE id=$1::uuid AND project_id=$2::uuid",[payload.shipmentId,projectId]);
          if(!shipment.rows.length||Number(payload.plannedQuantity)>Number(shipment.rows[0].quantity)) return res.status(422).json({error:"Loading plan must reference a same-Project shipment and not exceed shipment quantity."});
        }
        if(type==="loading_survey"&&Number(payload.surveyedQuantity)>Number(q.rows[0].quantity)) return res.status(422).json({error:"Surveyed quantity cannot exceed the loading operation quantity."});
      }
      if(type==="lc_record"){
        const q=await req.db.query("SELECT id FROM public.p1_domain_records WHERE project_id=$1::uuid AND record_type='lc_record' AND payload->>'lcNumber'=$2 LIMIT 1",[projectId,payload.lcNumber]);
        if(q.rows.length) return res.status(409).json({error:"LC number already exists in this Project.",code:"DUPLICATE_LC_NUMBER"});
      }
      if(type==="lc_clause"&&String(payload.lcRecordId)!==String(parentRecord?.id??"")) return res.status(422).json({error:"LC clause must reference its parent LC record."});
      if(type==="lc_discrepancy"&&parentRecord?.record_type==="lc_clause"&&(String(payload.clauseRecordId)!==String(parentRecord.id)||String(payload.lcRecordId)!==String(parentRecord.parent_record_id))) return res.status(422).json({error:"LC discrepancy clause and LC references must match the parent clause."});
      if(type==="lc_discrepancy"&&parentRecord?.record_type==="lc_record"&&String(payload.lcRecordId)!==String(parentRecord.id)) return res.status(422).json({error:"LC discrepancy must reference its parent LC record."});
      if(type==="lc_presentation"){
        const lcId=String(payload.lcRecordId??"");
        if(lcId!==String(parentRecord?.id??"")||parentRecord?.record_type!=="lc_record"||!["issued","acknowledged"].includes(parentRecord.status)) return res.status(409).json({error:"LC presentation requires an issued, same-Project LC record."});
        const clauses=await req.db.query("SELECT payload,status FROM public.p1_domain_records WHERE project_id=$1::uuid AND parent_record_id=$2::uuid AND record_type='lc_clause'",[projectId,lcId]);
        if(!clauses.rows.length||clauses.rows.some((x:any)=>x.status!=="accepted")) return res.status(409).json({error:"All LC clauses must be reviewed and accepted before presentation.",code:"LC_CLAUSES_NOT_READY"});
        const selections=payload.documentSelections as Array<{documentRecordId:string;clauseCode:string;copyType:"original"|"copy"}>;
        const ids=[...new Set(selections.map(x=>x.documentRecordId))];
        const docs=await req.db.query("SELECT id,document_type_code,status,expiry_date,sha256_checksum,object_key,storage_bucket,file_size_bytes,upload_verified_at FROM public.project_export_documents WHERE project_id=$1::uuid AND id=ANY($2::uuid[])",[projectId,ids]);
        if(docs.rows.length!==ids.length) return res.status(422).json({error:"Every presented document must exist in the same Project."});
        const expired=docs.rows.some((d:any)=>d.status!=="approved"||!d.sha256_checksum||!d.object_key||!d.upload_verified_at||!d.file_size_bytes||d.storage_bucket!=="pke-private-documents"||(d.expiry_date&&new Date(d.expiry_date)<new Date()));
        const required=clauses.rows.map((x:any)=>String(x.payload.clauseCode));
        const supplied=[...new Set(selections.map(x=>x.clauseCode))];
        const checklist=validateLcPresentation(required,supplied,expired);
        if(!checklist.ok) return res.status(409).json({error:"LC presentation checklist is incomplete or contains invalid/expired evidence.",code:"LC_PRESENTATION_INCOMPLETE",missing:checklist.missing});
        for(const clause of clauses.rows){
          const code=String(clause.payload.clauseCode),matches=selections.filter(x=>x.clauseCode===code);
          const docType=String(clause.payload.documentTypeCode);
          if(matches.some(x=>docs.rows.find((d:any)=>d.id===x.documentRecordId)?.document_type_code!==docType)) return res.status(409).json({error:"Presented document type does not satisfy the LC clause.",code:"LC_DOCUMENT_TYPE_MISMATCH",clauseCode:code});
          if(matches.filter(x=>x.copyType==="original").length<Number(clause.payload.requiredOriginals??0)||matches.filter(x=>x.copyType==="copy").length<Number(clause.payload.requiredCopies??0)) return res.status(409).json({error:"LC original/copy count is below the clause requirement.",code:"LC_DOCUMENT_COUNT_MISMATCH",clauseCode:code});
        }
      }
      if(type==="laytime_event"){
        const calc=calculateLaytime({allowedHours:Number(payload.allowedHours),startAt:String(payload.startAt),endAt:String(payload.endAt),excludedHours:Number(payload.excludedHours??0)});
        if(!calc.valid) return res.status(400).json({error:"Invalid laytime interval or allowance.",code:"INVALID_LAYTIME"});
        const overlap=await req.db.query(
          `SELECT 1 FROM public.p1_domain_records
           WHERE project_id=$1::uuid AND record_type='laytime_event'
             AND payload->>'voyageId'=$2
             AND tstzrange((payload->>'startAt')::timestamptz,(payload->>'endAt')::timestamptz,'[)')
                 && tstzrange($3::timestamptz,$4::timestamptz,'[)')
           LIMIT 1`,[projectId,payload.voyageId,payload.startAt,payload.endAt]);
        if(overlap.rows.length) return res.status(409).json({error:"Laytime interval overlaps an existing event for this voyage.",code:"LAYTIME_INTERVAL_OVERLAP"});
        payload.laytimeImpactHours=calc.usedHours;
        payload.laytimeOverrunHours=calc.overrunHours;
      }
      if(type==="qa_release"){
        const source=await req.db.query("SELECT created_by FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid AND record_type IN ('production_batch','packing_batch')",[payload.sourceRecordId,projectId]);
        if(source.rows.length!==1||String(payload.sourceRecordId)!==String(b.parentRecordId)||source.rows[0].created_by===actorId) return res.status(409).json({error:"QA release requires an independent actor and production/packing source.",code:"QA_INDEPENDENCE_REQUIRED"});
        const quality=await req.db.query(
          `SELECT 1 FROM public.p1_domain_records s JOIN public.p1_domain_records r ON r.parent_record_id=s.id AND r.project_id=s.project_id
           WHERE s.project_id=$1::uuid AND s.parent_record_id=$2::uuid AND s.record_type='quality_sample' AND s.status='verified'
             AND r.record_type='quality_result' AND r.status='accepted' LIMIT 1`,[projectId,payload.sourceRecordId]);
        if(!quality.rows.length) return res.status(409).json({error:"QA release requires at least one verified QC sample with an accepted laboratory result.",code:"QA_QUALITY_EVIDENCE_REQUIRED"});
      }
      if(type==="audit_closure"){
        const fid=String(payload.findingRecordId??"");
        const finding=await req.db.query("SELECT created_by FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid AND record_type='audit_finding'",[fid,projectId]);
        const response=await req.db.query("SELECT created_by FROM public.p1_domain_records WHERE parent_record_id=$1::uuid AND project_id=$2::uuid AND record_type='audit_response' ORDER BY created_at DESC LIMIT 1",[fid,projectId]);
        if(finding.rows.length!==1||!response.rows.length||!canCloseAuditFinding(actorId,finding.rows[0].created_by,response.rows[0].created_by,roleCode)) return res.status(409).json({error:"Audit closure requires independent Internal Auditor verification after owner response.",code:"AUDIT_CLOSURE_INDEPENDENCE_REQUIRED"});
      }
      const external=b.externalScopeUserId?String(b.externalScopeUserId):null;
      let externalRoleCode:string|null=null;
      if(external){
        const allowed=p1ExternalRoles[type]??[];
        for(const candidateRole of allowed){
          const extRole=await req.db.query(
            "SELECT public.p1_has_active_project_role_assignment($1::uuid,$2::text,$3::uuid) AS active",
            [projectId,candidateRole,external]
          );
          if(extRole.rows[0]?.active){externalRoleCode=candidateRole;break;}
        }
        if(!externalRoleCode) return res.status(422).json({error:"External scope must match an active external Project assignment."});
      }
      const ownerRoleCode=typeof b.ownerRoleCode==="string"?b.ownerRoleCode:
        type==="audit_finding"?String(payload.ownerRoleCode):
        type==="audit_response"?String(parentRecord?.owner_role_code??""):
        type==="hse_action"?String(payload.actionOwnerRoleCode??""):
        externalRoleCode??p1DefaultOwner[type];
      const owner=await req.db.query(
        "SELECT public.p1_has_active_project_role_assignment($1::uuid,$2::text,NULL::uuid) AS active",
        [projectId,ownerRoleCode]
      );
      if(!owner.rows[0]?.active) return res.status(422).json({error:"ownerRoleCode must have an active assignee in this Project.",code:"P1_OWNER_ROLE_UNASSIGNED"});
      let assignee=b.assigneeUserId?String(b.assigneeUserId):null;
      if(external&&!assignee) assignee=external;
      if(assignee&&!await p1HasRole(req,projectId,assignee,[ownerRoleCode])) return res.status(422).json({error:"Assignee must hold the selected active Project role."});
      if(external&&assignee!==external) return res.status(422).json({error:"External scope and assignee must be the same user."});
      if(["supplier_commitment","dispatch_assignment","loading_survey","ship_master_ack"].includes(type)&&!external) return res.status(422).json({error:"This workflow requires an explicitly assigned external Project user.",code:"EXTERNAL_ASSIGNMENT_REQUIRED"});
      const dueAt=b.dueAt?new Date(b.dueAt):null;
      if(b.dueAt&&Number.isNaN(dueAt!.getTime())) return res.status(400).json({error:"Invalid dueAt."});
      const effectiveParentId=b.parentRecordId??(type==="goods_receipt_match"?payload.purchaseOrderRecordId:null);
      const ins=await req.db.query(
        `INSERT INTO public.p1_domain_records(project_id,record_type,record_code,parent_record_id,source_entity_type,source_entity_id,title,payload,status,owner_role_code,assignee_user_id,external_scope_user_id,created_by,updated_by,due_at,idempotency_key)
         VALUES($1::uuid,$2,COALESCE(NULLIF($3,''),'P1-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),$4::uuid,$5,$6::uuid,$7,$8::jsonb,$9,$10,$11::uuid,$12::uuid,$13::uuid,$13::uuid,$14::timestamptz,$15)
         ON CONFLICT (project_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING *`,
        [projectId,type,b.recordCode??"",effectiveParentId,b.sourceEntityType??null,b.sourceEntityId??null,title,JSON.stringify(payload),initialP1Status(type),ownerRoleCode,assignee,external,actorId,dueAt,b.idempotencyKey.trim()]);
      if(!ins.rows.length){
        const prior=await req.db.query("SELECT * FROM public.p1_domain_records WHERE project_id=$1::uuid AND idempotency_key=$2",[projectId,b.idempotencyKey.trim()]);
        if(prior.rows.length!==1||prior.rows[0].record_type!==type||prior.rows[0].title!==title||JSON.stringify(prior.rows[0].payload)!==JSON.stringify(payload)) return res.status(409).json({error:"Idempotency key conflict.",code:"IDEMPOTENCY_KEY_CONFLICT"});
        return res.status(200).json({record:prior.rows[0],idempotentReplay:true});
      }
      const currentRole=await p1Role(req);
      await req.db.query("INSERT INTO public.p1_domain_events(record_id,project_id,event_type,actor_user_id,actor_role_code,payload) VALUES($1::uuid,$2::uuid,'created',$3::uuid,$4,$5::jsonb)",[ins.rows[0].id,projectId,actorId,currentRole,JSON.stringify({recordType:type})]);
      return res.status(201).json({record:ins.rows[0],idempotentReplay:false});
    } catch { return res.status(500).json(internalServerErrorPayload()); }
  });

  app.patch("/api/v1/projects/:projectId/p1-workflows/:id/transition",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,id=req.params.id as string,actorId=String(req.user?.id??""),b=req.body??{};
    if(typeof b.status!=="string") return res.status(400).json({error:"status is required."});
    try {
      if(!(await p1Ready(req,res))) return;
      const found=await req.db.query("SELECT * FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid FOR UPDATE",[id,projectId]);
      if(found.rows.length!==1) return res.status(404).json({error:"P1 workflow record not found."});
      const record=found.rows[0];
      if(!isP1RecordType(record.record_type)) return res.status(409).json({error:"Unsupported stored workflow type."});
      const to=b.status as P1Status;
      const permission=record.record_type==="loading_survey"&&["accepted","rejected"].includes(to)
        ?"shipping.update"
        :record.record_type==="laytime_event"&&to==="verified"?"shipping.update"
        :await p1Permission(req,record.record_type,"update");
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const from=record.status as P1Status;
      if(!validateP1Transition(record.record_type,from,to)) return res.status(409).json({error:"Invalid status transition.",code:"INVALID_P1_TRANSITION",from,to});
      if(["rejected","held","blocked","cancelled","discrepancy"].includes(to)&&String(b.reason??"").trim().length<5) return res.status(400).json({error:"A reason of at least 5 characters is required."});
      if(record.record_type==="purchase_order"&&to==="approved"){
        if(!(await requireProjectPermission(req,res,projectId,"procurement.po.approve"))) return;
        if(!canApprovePurchaseOrder(actorId,record.created_by,await p1Role(req))) return res.status(403).json({error:"PO approval requires an independent Procurement/Contract Manager.",code:"MAKER_CHECKER_REQUIRED"});
      }
      if(record.record_type==="qa_release"&&(to==="released"||to==="held")){
        if(!(await requireProjectPermission(req,res,projectId,"quality.release.decide"))) return;
        const source=await req.db.query("SELECT created_by FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid",[record.payload.sourceRecordId,projectId]);
        if(source.rows.length!==1||!canDecideQaRelease(actorId,source.rows[0].created_by,await p1Role(req))) return res.status(403).json({error:"QA release requires an independent QA Manager."});
      }
      if(record.record_type==="audit_finding"&&(to==="verified"||to==="closed")){
        if(!(await requireProjectPermission(req,res,projectId,"audit.finding.close"))) return;
        const response=await req.db.query("SELECT created_by,status FROM public.p1_domain_records WHERE parent_record_id=$1::uuid AND project_id=$2::uuid AND record_type='audit_response' ORDER BY created_at DESC LIMIT 1",[id,projectId]);
        if(!response.rows.length||!canCloseAuditFinding(actorId,record.created_by,response.rows[0].created_by,await p1Role(req))||(to==="closed"&&response.rows[0].status!=="verified")) return res.status(403).json({error:"Finding verification/closure requires an independent Internal Auditor after a verified owner response.",code:"AUDIT_CLOSURE_INDEPENDENCE_REQUIRED"});
      }
      const roleCode=await p1Role(req);
      if(record.record_type==="supplier_commitment"&&to==="acknowledged"&&roleCode!=="supplier") return res.status(403).json({error:"Only the assigned Supplier may acknowledge the commitment."});
      if(record.record_type==="ship_master_ack"&&to==="acknowledged"&&roleCode!=="ship_master") return res.status(403).json({error:"Only Ship Master may acknowledge."});
      if(record.record_type==="loading_survey"&&to==="submitted"&&roleCode!=="marine_surveyor") return res.status(403).json({error:"Only Marine Surveyor may submit the survey."});
      if(record.record_type==="loading_survey"&&["accepted","rejected"].includes(to)){
        if(!["master_of_loading","loading_supervisor"].includes(roleCode)||actorId===record.created_by) return res.status(403).json({error:"Survey acceptance/rejection requires an independent Master of Loading or Loading Supervisor."});
      }
      if(record.record_type==="hse_action"&&to==="verified"){
        if(!(await requireProjectPermission(req,res,projectId,"hse.action.manage"))||roleCode!=="hse_officer"||actorId===record.created_by||actorId===record.assignee_user_id) return res.status(403).json({error:"HSE action verification requires an independent HSE Officer.",code:"HSE_VERIFICATION_INDEPENDENCE_REQUIRED"});
      }
      if(record.record_type==="dispatch_assignment"&&["acknowledged","in_progress","completed"].includes(to)&&["transporter","driver"].includes(roleCode)&&record.external_scope_user_id!==actorId) return res.status(403).json({error:"External dispatch updates are restricted to the assigned user."});
      if(record.record_type==="audit_response"&&to==="submitted"){
        const finding=await req.db.query("SELECT owner_role_code FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid AND record_type='audit_finding'",[record.parent_record_id]);
        if(finding.rows.length!==1||!await p1HasRole(req,projectId,actorId,[finding.rows[0].owner_role_code])) return res.status(403).json({error:"Only finding owner role may submit the response."});
      }
      if(record.record_type==="lc_presentation"&&(to==="accepted"||to==="discrepancy")){
        if(!b.transitionData?.bankAcknowledgementReference||String(b.transitionData.bankAcknowledgementReference).trim().length<3||!b.transitionData?.bankAcknowledgementEvidenceId) return res.status(409).json({error:"Bank acknowledgement reference and evidence are required before recording LC presentation outcome."});
        const bankEvidence=await req.db.query("SELECT id FROM public.p1_domain_evidence WHERE id=$1::uuid AND record_id=$2::uuid AND project_id=$3::uuid AND status IN ('uploaded','verified')",[b.transitionData.bankAcknowledgementEvidenceId,id,projectId]);
        if(!bankEvidence.rows.length) return res.status(409).json({error:"Bank acknowledgement evidence must be attached to this LC presentation."});
      }
      if(record.record_type==="lc_record"&&to==="issued"&&roleCode!=="document_officer") return res.status(403).json({error:"Only Document Officer may record issuance of an LC."});
      if(record.record_type==="loading_plan"&&to==="approved"&&roleCode!=="master_of_loading") return res.status(403).json({error:"Only Master of Loading may approve the shore-side loading plan."});
      if(record.record_type==="laytime_event"&&to==="verified"&&(roleCode!=="master_of_loading"||actorId===record.created_by)) return res.status(403).json({error:"Laytime verification requires a different Master of Loading actor."});
      const data=b.transitionData&&typeof b.transitionData==="object"?b.transitionData:{};
      const update=await req.db.query(
        `UPDATE public.p1_domain_records SET status=$1,updated_by=$2::uuid,updated_at=now(),version=version+1,payload=payload||$3::jsonb,
         closed_at=CASE WHEN $1='closed' THEN now() WHEN $1 IN ('open','responded','verified') THEN NULL ELSE closed_at END,
         closed_by=CASE WHEN $1='closed' THEN $2::uuid WHEN $1 IN ('open','responded','verified') THEN NULL ELSE closed_by END
         WHERE id=$4::uuid AND project_id=$5::uuid AND version=$6 RETURNING *`,
        [to,actorId,JSON.stringify(data),id,projectId,b.expectedVersion??record.version]);
      if(update.rows.length!==1) return res.status(409).json({error:"Record changed concurrently; reload and retry.",code:"P1_VERSION_CONFLICT"});
      const eventType:Record<string,string>={submitted:"submitted",approved:"approved",issued:"issued",acknowledged:"acknowledged",in_progress:"started",blocked:"blocked",partially_received:"updated",received:"completed",matched:"matched",held:"held",released:"released",rejected:"rejected",completed:"completed",cancelled:"cancelled",open:"created",responded:"responded",verified:"verified",closed:"closed",presented:"presented",accepted:"accepted",discrepancy:"discrepancy",expired:"updated"};
      await req.db.query("INSERT INTO public.p1_domain_events(record_id,project_id,event_type,actor_user_id,actor_role_code,reason,payload) VALUES($1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7::jsonb)",[id,projectId,eventType[to]??"updated",actorId,roleCode,b.reason??null,JSON.stringify({from,to,version:update.rows[0].version,...data})]);
      return res.json({record:update.rows[0]});
    } catch { return res.status(500).json(internalServerErrorPayload()); }
  });

  app.post("/api/v1/projects/:projectId/p1-workflows/:id/evidence",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,id=req.params.id as string,actorId=String(req.user?.id??""),b=req.body??{};
    const evidenceKey=String(b.objectKey??""),evidenceSha=String(b.sha256Checksum??""),evidenceBucket=String(b.storageBucket??"pke-private-documents"),evidenceSize=Number(b.fileSizeBytes);
    if(!validateP1Evidence({objectKey:evidenceKey,sha256:evidenceSha,bucket:evidenceBucket,sizeBytes:evidenceSize})||!Number.isSafeInteger(evidenceSize)||evidenceSize<=0) return res.status(400).json({error:"Evidence requires private bucket, valid SHA-256 and verified file size <=50 MB."});
    if(!evidenceKey.startsWith(`projects/${projectId}/`)) return res.status(400).json({error:"Evidence object key must be namespaced to the selected Project.",code:"INVALID_OBJECT_KEY"});
    const storageStatus=privateStorage.status();
    if(!storageStatus.available||storageStatus.bucket!==evidenceBucket) return res.status(503).json({error:"Private object storage is unavailable or bucket does not match.",code:"STORAGE_UNAVAILABLE"});
    try{
      try{await privateStorage.verifyObject(evidenceKey,evidenceSize,evidenceSha);}catch{return res.status(422).json({error:"Evidence object checksum or size verification failed.",code:"EVIDENCE_OBJECT_VERIFICATION_FAILED"});}
      if(!(await p1Ready(req,res))) return;
      const record=await req.db.query("SELECT record_type FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid",[id,projectId]);
      if(record.rows.length!==1) return res.status(404).json({error:"P1 workflow record not found."});
      const permission=record.rows[0].record_type==="quality_result"
        ?"quality.result.create"
        :await p1Permission(req,record.rows[0].record_type,"update");
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const inserted=await req.db.query(
        `INSERT INTO public.p1_domain_evidence(record_id,project_id,evidence_type,object_key,storage_bucket,original_filename,mime_type,file_size_bytes,sha256_checksum,uploaded_by)
         VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::uuid) RETURNING *`,
        [id,projectId,b.evidenceType??"supporting",evidenceKey,evidenceBucket,b.originalFilename??null,b.mimeType??null,evidenceSize,evidenceSha,actorId]);
      const roleCode=await p1Role(req);
      await req.db.query("INSERT INTO public.p1_domain_events(record_id,project_id,event_type,actor_user_id,actor_role_code,payload) VALUES($1::uuid,$2::uuid,'evidence_added',$3::uuid,$4,$5::jsonb)",[id,projectId,actorId,roleCode,JSON.stringify({evidenceId:inserted.rows[0].id})]);
      return res.status(201).json({evidence:inserted.rows[0]});
    }catch{return res.status(500).json(internalServerErrorPayload());}
  });

  app.get("/api/v1/projects/:projectId/p1-kpis",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string;
    try{
      if(!(await p1Ready(req,res))) return;
      const kpiAccess=await req.db.query(
        "SELECT public.pke_has_project_permission($1::uuid,'p1.kpi.view') OR public.pke_has_project_permission($1::uuid,'reports.view') AS allowed",
        [projectId]
      );
      if(!kpiAccess.rows[0]?.allowed) return res.status(403).json({error:"Missing required Project permission: p1.kpi.view or reports.view"});
      const defs=await req.db.query("SELECT * FROM public.p1_report_kpi_definitions WHERE is_active=true AND (project_id IS NULL OR project_id=$1::uuid) ORDER BY template_id,metric_key",[projectId]);
      const roleCodes=await p1Roles(req,projectId);
      const p1KpiTemplatesByRole:Record<string,string[]> = {
        procurement:["tpl-procurement"],contract_manager:["tpl-procurement"],buyer:["tpl-procurement"],finance:["tpl-procurement"],accounting:["tpl-procurement"],
        pks_site_manager:["tpl-procurement","tpl-operational"],
        production_manager:["tpl-operational"],packing_supervisor:["tpl-operational"],qc_officer:["tpl-operational"],
        laboratory_officer:["tpl-operational"],qa_manager:["tpl-operational"],hse_officer:["tpl-operational"],
        transport_manager:["tpl-logistics"],dispatcher:["tpl-logistics"],transporter:["tpl-logistics"],driver:["tpl-logistics"],checker:["tpl-logistics"],
        master_of_loading:["tpl-shipping"],loading_manager:["tpl-shipping"],loading_supervisor:["tpl-shipping"],loading_operator:["tpl-shipping"],
        marine_surveyor:["tpl-shipping"],ship_master:["tpl-shipping"],terminal_representative:["tpl-shipping"],
        shipping_agent:["tpl-shipping","tpl-trade"],document_officer:["tpl-trade","tpl-compliance"],
        internal_auditor:["tpl-audit","tpl-compliance"],
        warehouse:["tpl-warehouse"],warehouse_manager:["tpl-warehouse"],warehouse_officer:["tpl-warehouse"],inventory_controller:["tpl-warehouse"]
      };
      const allTemplates=roleCodes.some((code)=>["pm","project_admin","platform_admin"].includes(code))
        ?new Set(defs.rows.map((d:any)=>String(d.template_id)))
        :new Set(roleCodes.flatMap((code)=>p1KpiTemplatesByRole[code]??[]));
      const kpiDefinitions=defs.rows.filter((d:any)=>allTemplates.has(String(d.template_id)));
      const kpis=[];
      for(const d of kpiDefinitions){
        const q=await req.db.query(
          "SELECT value,source_rows AS n,as_of FROM public.p1_get_kpi_metric($1::uuid,$2::text)",
          [projectId,String(d.formula_key)]
        );
        const row=q.rows[0]??{};
        const value=row.value===null||row.value===undefined?null:Number(row.value);
        const n=Number(row.n??0);
        const asOf=row.as_of??null;
        kpis.push({
          templateId:d.template_id,metricKey:d.metric_key,label:d.label,value,unit:d.unit_code,
          sourceEntity:d.source_entity,sourceRows:n,asOf,
          freshnessStatus:evaluateFreshness(asOf?new Date(asOf).toISOString():null,Number(d.freshness_minutes)),
          status:value===null?"unavailable":"available",missingDataPolicy:d.missing_data_policy
        });
      }
      return res.json({projectId,kpis,generatedAt:new Date().toISOString()});
    }catch{return res.status(500).json(internalServerErrorPayload());}
  });

}

// ============================================
// Centralized error handling middleware
// ============================================
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const rawStatus = err?.status;
  const status = typeof rawStatus === "number" && Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus < 500 ? rawStatus : 500;

  // Never persist exception messages, stacks, query strings, tokens or client IPs.
  logger.error({
    event: "api_unhandled_error",
    status,
    method: req.method,
    path: req.path,
    errorType: typeof err?.name === "string" ? err.name : "UnknownError",
  });

  res.status(status).json({
    status: "error",
    ...(status === 500 ? internalServerErrorPayload() : requestRejectedPayload()),
  });
});

let runtimeVerified = false;
let runtimeVerifyPromise: Promise<void> | null = null;

async function verifyProductionRuntimeSecurity(): Promise<void> {
  if (manualTrialMode.enabled) return;
  if (runtimeVerified) return;
  if (runtimeVerifyPromise) return runtimeVerifyPromise;
  runtimeVerifyPromise = (async () => {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT
          current_user AS current_role,
          r.rolsuper,
          r.rolbypassrls,
          r.rolcreatedb,
          r.rolcreaterole,
          pg_has_role(current_user, 'neon_superuser', 'MEMBER') AS has_neon_superuser_membership,
          has_function_privilege(
            current_user,
            'public.resolve_pke_user_by_neon_auth_user_id(uuid)',
            'EXECUTE'
          ) AS can_resolve_identity
        FROM pg_roles AS r
        WHERE r.rolname = current_user
      `);
      if (result.rows.length !== 1) {
        throw new Error("Unable to inspect PostgreSQL runtime role.");
      }
      const problems = validateRuntimeRoleState(result.rows[0], configuredDatabaseRole);
      if (problems.length > 0) {
        logger.error(`Runtime database security check failed: ${problems.join(" ")}`);
        throw new Error("Runtime database role did not pass the least-privilege startup check.");
      }
      await client.query("SELECT 1");
      runtimeVerified = true;
      logger.info("Database connected with verified app_runtime_secure role.");
    } finally {
      client.release();
    }
  })().catch((error) => {
    runtimeVerifyPromise = null;
    throw error;
  });
  return runtimeVerifyPromise;
}

async function startServer(): Promise<void> {
  if (manualTrialMode.enabled) {
    app.listen(Number(PORT) || 3000, "127.0.0.1", () => {
      logger.info(`PKE Manual Trial Mode API running on http://127.0.0.1:${PORT}`);
      logger.info("Mode: manual-trial (in-memory demo, no Neon/PostgreSQL/Auth/storage/external providers)");
      logger.info(`Timestamp: ${new Date().toISOString()}`);
    });
    return;
  }

  await verifyProductionRuntimeSecurity();

  app.listen(PORT, () => {
    logger.info(`PKE Export Platform API running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
    logger.info(`Database role: app_runtime_secure`);
    logger.info(`Timestamp: ${new Date().toISOString()}`);
  });
}

if (!isServerlessRuntime(process.env)) {
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received. Shutting down gracefully...");
    try {
      if (!manualTrialMode.enabled && pool) await pool.end();
    } catch (err) {
      logger.error("Error during shutdown:", err as any);
    }
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.info("SIGINT received. Shutting down gracefully...");
    try {
      if (!manualTrialMode.enabled && pool) await pool.end();
    } catch (err) {
      logger.error("Error during shutdown:", err as any);
    }
    process.exit(0);
  });

  if (process.env.NODE_ENV !== "test") {
    void startServer().catch((error) => {
      logger.error(manualTrialMode.enabled ? "PKE Manual Trial Mode startup failed." : "PKE API startup cancelled because runtime security checks failed.");
      if (!manualTrialMode.enabled && pool) { void pool.end().finally(() => process.exit(1)); }
      else process.exit(1);
    });
  } else {
    logger.info("PKE API loaded in test mode (server started by test harness).");
  }
} else {
  logger.info("PKE API loaded in serverless mode (no app.listen). Runtime security must be verified before handling production requests.");
}

export async function ensureRuntimeReady(): Promise<void> {
  if (manualTrialMode.enabled) return;
  if (runtimeStartupFailure) {
    throw new Error("PKE runtime configuration is incomplete.");
  }
  if (!pool) {
    throw new Error("PKE database pool is unavailable.");
  }
  await verifyProductionRuntimeSecurity();
}

export function getRuntimeReadinessState(): {
  ready: boolean;
  failure: RuntimeStartupFailure | null;
} {
  if (manualTrialMode.enabled) return { ready: true, failure: null };
  const failure = runtimeStartupFailure
    ? {
        code: runtimeStartupFailure.code,
        missingEnvironmentVariables: [...runtimeStartupFailure.missingEnvironmentVariables],
      }
    : !pool
      ? { code: "DATABASE_POOL_UNAVAILABLE", missingEnvironmentVariables: [] }
      : null;
  return { ready: failure === null, failure };
}

export default app;


 THEN 'verified' ELSE 'unverified' END AS effective_verification_status FROM public.pks_port_routes r JOIN public.pks_sites ps ON ps.id=r.pks_site_id JOIN public.ports p ON p.id=r.port_id WHERE r.is_active=true AND (EXISTS(SELECT 1 FROM public.project_operating_profiles op WHERE op.project_id=$1::uuid AND op.primary_pks_site_id=r.pks_site_id) OR EXISTS(SELECT 1 FROM public.project_pks_site_participation part WHERE part.project_id=$1::uuid AND part.pks_site_id=r.pks_site_id AND part.status='active')) ORDER BY ps.name,p.name,r.route_mode",[projectId]);
  return res.json({routes:r.rows,projectId,estimateMode:"advisory_only",canManage:false});
 }catch{return res.status(500).json(internalServerErrorPayload());}
});
app.post("/api/v1/vessel-port-assessments",requireAuth,async(req:express.Request,res:express.Response)=>{
 const b=req.body||{},projectId=String(b.projectId||""),portId=String(b.portId||""),vesselId=String(b.vesselId||""),berthId=b.berthId?String(b.berthId):null;
 if(!p16UuidPattern.test(projectId)||!p16UuidPattern.test(portId)||!p16UuidPattern.test(vesselId)||(berthId&&!p16UuidPattern.test(berthId)))return res.status(400).json({error:"Valid projectId, portId, vesselId and optional berthId are required."});
 if(!(await requireProjectPermission(req,res,projectId,"vessel.port.assess")))return;
 try{
  const scope=await req.db.query("SELECT public.pke_p16_project_port_permission($1::uuid,$2::uuid,'vessel.port.assess') AS allowed",[projectId,portId]);
  if(!scope.rows[0]?.allowed)return res.status(403).json({error:"Port is not linked to the selected Project."});
  const vr=await req.db.query("SELECT id,name,imo_number,loa_m,beam_m,max_draft_m,summer_draft_m,verification_status,verified_at,source_reference FROM public.vessels WHERE id=$1::uuid AND is_active=true",[vesselId]);
  if(!vr.rows.length)return res.status(404).json({error:"Vessel not found."});
  const vessel=vr.rows[0];
  const [pr,br,lr,dr,tr]=await Promise.all([
   req.db.query("SELECT id,name,verification_status,verified_at,source_reference FROM public.ports WHERE id=$1::uuid",[portId]),
   berthId?req.db.query("SELECT b.* FROM public.port_berths b JOIN public.port_terminals t ON t.id=b.terminal_id WHERE b.id=$1::uuid AND t.port_id=$2::uuid",[berthId,portId]):Promise.resolve({rows:[]}),
   req.db.query("SELECT * FROM public.port_operating_limits WHERE port_id=$1::uuid AND approval_status='verified' AND verification_status='verified' AND effective_from<=CURRENT_DATE AND (effective_to IS NULL OR effective_to>=CURRENT_DATE) AND (berth_id IS NULL OR berth_id=$2::uuid) ORDER BY berth_id NULLS LAST,effective_from DESC LIMIT 1",[portId,berthId]),
   req.db.query("SELECT * FROM public.port_depth_observations WHERE port_id=$1::uuid AND quality_status='verified' AND depth_unit='m' AND survey_date<=CURRENT_DATE AND (valid_to IS NULL OR valid_to>=CURRENT_DATE) AND (berth_id IS NULL OR berth_id=$2::uuid) ORDER BY berth_id NULLS LAST,observed_at DESC LIMIT 1",[portId,berthId]),
   req.db.query("SELECT * FROM public.port_tide_observations WHERE port_id=$1::uuid AND quality_status='verified' AND observed_at>=now()-interval '24 hours' AND (valid_to IS NULL OR valid_to>=CURRENT_DATE) AND (berth_id IS NULL OR berth_id=$2::uuid) ORDER BY observed_at DESC LIMIT 1",[portId,berthId])
  ]);
  const port=pr.rows[0]||null,berth=br.rows[0]||null,limit=lr.rows[0]||null,depth=dr.rows[0]||null,tide=tr.rows[0]||null;
  const limitations:string[]=["Advisory screening only; never a navigation clearance or substitute for port authority, pilot, master or terminal approval."];
  let result="insufficient_data";
  const vesselOk=vessel.verification_status==="verified"&&vessel.verified_at&&vessel.source_reference;
  const portOk=port?.verification_status==="verified"&&port.verified_at&&port.source_reference;
  const berthOk=!berthId||(berth&&berth.status==="operational"&&berth.verification_status==="verified"&&berth.verified_at);
  if(!vesselOk)limitations.push("Vessel particulars lack current verified provenance.");
  if(!portOk)limitations.push("Port master lacks current verified provenance.");
  if(!berthOk)limitations.push("Selected berth is absent or not verified operational.");
  if(!limit)limitations.push("No current verified operating limit.");
  if(!depth)limitations.push("No current verified depth survey.");
  if(!tide||tide.is_forecast)limitations.push("No fresh verified observed tide record.");
  if(vesselOk&&portOk&&berthOk&&limit&&depth&&tide&&!tide.is_forecast){
   const draft=Number(vessel.max_draft_m||vessel.summer_draft_m||0),loa=Number(vessel.loa_m||0),beam=Number(vessel.beam_m||0),ukc=Number(depth.depth_value)+Number(tide.tide_height_m)-draft;
   if(!draft||!loa||!beam||depth.depth_datum!==tide.vertical_datum){result="manual_review_required";limitations.push("Vessel dimensions or matching vertical datum are incomplete.");}
   else if((limit.max_draft_m!==null&&draft>Number(limit.max_draft_m))||(limit.max_loa_m!==null&&loa>Number(limit.max_loa_m))||(limit.max_beam_m!==null&&beam>Number(limit.max_beam_m))||ukc<Number(limit.min_ukc_m||0)){result="not_eligible";limitations.push("Vessel dimensions or advisory UKC exceed the recorded operating envelope.");}
   else{result="eligible_for_review";limitations.push("Recorded values are within the envelope; independent operational clearance remains mandatory.");}
  }
  const inputs={vessel:{id:vessel.id,imo_number:vessel.imo_number,loa_m:vessel.loa_m,beam_m:vessel.beam_m,max_draft_m:vessel.max_draft_m,summer_draft_m:vessel.summer_draft_m},port,berth,limit,depth,tide};
  const freshness={vesselVerifiedAt:vessel.verified_at,portVerifiedAt:port?.verified_at,limitEffectiveFrom:limit?.effective_from,depthSurveyDate:depth?.survey_date,depthValidTo:depth?.valid_to,tideObservedAt:tide?.observed_at,tideValidTo:tide?.valid_to};
  const saved=await req.db.query("INSERT INTO public.vessel_port_assessments(project_id,vessel_id,port_id,terminal_id,berth_id,assessment_inputs,source_freshness,result,limitations,assessed_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::jsonb,$7::jsonb,$8,$9::text[],$10::uuid) RETURNING *",[projectId,vesselId,portId,berth?.terminal_id||null,berthId,JSON.stringify(inputs),JSON.stringify(freshness),result,limitations,req.user?.id||null]);
  return res.status(201).json({assessment:saved.rows[0],mode:"advisory_only",limitations});
 }catch(error:any){if(error?.code==="23514"||error?.code==="42501")return res.status(403).json({error:"Vessel-port assessment permission or evidence policy failed."});return res.status(500).json(internalServerErrorPayload());}
});

// ============================================
// Transport legs (read-only listing for trip assignment)
// ============================================
app.get("/api/v1/transport-legs", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId query parameter required" });
  if (!(await requireProjectPermission(req, res, projectId, "logistics.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT id, project_id, origin, destination, distance_km, status, created_at, updated_at
       FROM transport_legs
       WHERE project_id = $1::uuid
       ORDER BY created_at DESC LIMIT 100`,
      [projectId],
    );
    return res.json({ transportLegs: rows });
  } catch {
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/tracking-events", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "logistics.view"))) return;
  try {
    const { rows } = await req.db.query(
      "SELECT te.* FROM tracking_events te JOIN truck_trips tt ON tt.id = te.truck_trip_id WHERE tt.project_id = $1::uuid ORDER BY te.created_at DESC LIMIT 100",
      [projectId],
    );
    return res.json({ trackingEvents: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/tracking-events", requireAuth, async (req: express.Request, res: express.Response) => {
  const { truckTripId, eventType, latitude, longitude, gpsAccuracy, source, captureTimestamp, notes } = req.body ?? {};
  const checkerId = req.user?.id;
  if (!truckTripId || !eventType || latitude === undefined || longitude === undefined || gpsAccuracy === undefined) {
    return res.status(400).json({ error: "Required fields: truckTripId, eventType, latitude, longitude, gpsAccuracy" });
  }
  if (typeof checkerId !== "string") {
    return res.status(401).json({ error: "Authenticated principal required" });
  }
  const allowedEventTypes = new Set(["departure", "checkpoint", "arrival", "weighbridge", "receipt", "exception"]);
  if (!allowedEventTypes.has(String(eventType))) {
    return res.status(400).json({ error: "Invalid eventType" });
  }

  // Server-side GPS validation
  if (typeof latitude === "boolean" || typeof longitude === "boolean" || typeof gpsAccuracy === "boolean") {
    return res.status(400).json({ error: "GPS values must be numbers, not booleans" });
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  const acc = Number(gpsAccuracy);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({ error: "Invalid latitude: must be between -90 and 90" });
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({ error: "Invalid longitude: must be between -180 and 180" });
  }
  if (!Number.isFinite(acc) || acc <= 0) {
    return res.status(400).json({ error: "Invalid gpsAccuracy: must be a finite number greater than 0" });
  }

  try {
    const { rows: tripRows } = await req.db.query(`SELECT id, project_id FROM truck_trips WHERE id = $1::uuid`, [truckTripId]);
    if (tripRows.length === 0) {
      return res.status(404).json({ error: "Truck trip not found" });
    }
    const tripProjectId = tripRows[0].project_id as string;
    const requiredPermission = eventType === "receipt" ? "warehouse.receipt.create" : eventType === "checkpoint" ? "verify_checkpoints" : "record_truck_trips";
    if (!(await requireProjectPermission(req, res, tripProjectId, requiredPermission))) return;
    const effectiveCapture = captureTimestamp || new Date().toISOString();
    const { rows } = await req.db.query(
      `INSERT INTO tracking_events (truck_trip_id, event_type, checker_id, latitude, longitude, gps_accuracy, source, capture_timestamp, status, notes, created_at)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8::timestamptz, 'verified', $9, now()) RETURNING *`,
      [truckTripId, eventType, checkerId, lat, lng, acc, source || "checker_device", effectiveCapture, notes || null],
    );
    res.status(201).json({ trackingEvent: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create tracking event" });
  }
});

app.get("/api/v1/tracking-events/trip/:tripId", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows: trips } = await req.db.query("SELECT project_id FROM truck_trips WHERE id = $1::uuid", [req.params.tripId]);
    if (!trips.length) return res.status(404).json({ error: "Truck trip not found." });
    if (!(await requireProjectPermission(req, res, trips[0].project_id, "logistics.view"))) return;
    const { rows } = await req.db.query("SELECT * FROM tracking_events WHERE truck_trip_id = $1::uuid ORDER BY created_at DESC", [req.params.tripId]);
    return res.json({ trackingEvents: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.get("/api/v1/warehouse-receipts", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "warehouse.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM warehouse_receipts WHERE project_id=$1::uuid ORDER BY created_at DESC LIMIT 100", [projectId]);
    return res.json({ warehouseReceipts: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/warehouse-receipts", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, truckTripId, lotId, receivedQuantity, unit, conditionStatus, exceptionReason, weighbridgeTicketKey, checkTimestamp, status } = req.body ?? {};
  const checkerId = req.user?.id;
  const receivedAmount = Number(receivedQuantity);
  const receiptStatuses = new Set(["pending", "verified", "partial"]);
  if (!projectId || receivedQuantity === undefined || !Number.isFinite(receivedAmount) || receivedAmount <= 0 ||
      typeof unit !== "string" || !unit.trim() ||
      (status !== undefined && (typeof status !== "string" || !receiptStatuses.has(status)))) {
    return res.status(400).json({ error: "Required fields: projectId, positive receivedQuantity and unit.", code: "INVALID_WAREHOUSE_RECEIPT" });
  }
  if (typeof checkerId !== "string") {
    return res.status(401).json({ error: "Authenticated principal required" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "warehouse.receipt.create"))) return;
  try {
    if (truckTripId) {
      const { rows: tripRows } = await req.db.query(`SELECT id, project_id FROM truck_trips WHERE id = $1::uuid`, [truckTripId]);
      if (tripRows.length === 0) return res.status(400).json({ error: "Invalid truck trip" });
      if (tripRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden" });
    }
    if (lotId) {
      const { rows: lotRows } = await req.db.query(`SELECT id, project_id, unit FROM inventory_lots WHERE id = $1::uuid FOR UPDATE`, [lotId]);
      if (lotRows.length === 0) return res.status(400).json({ error: "Invalid inventory lot" });
      if (lotRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden" });
      if (lotRows[0].unit !== unit.trim()) return res.status(400).json({ error: "Receipt unit must match inventory lot unit.", code: "UNIT_MISMATCH" });
    }
    const effectiveCheck = checkTimestamp || new Date().toISOString();
    const { rows } = await req.db.query(
      `INSERT INTO warehouse_receipts (project_id, truck_trip_id, lot_id, received_quantity, unit, condition_status, exception_reason, weighbridge_ticket_key, checker_id, check_timestamp, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9::uuid, $10::timestamptz, $11, now(), now()) RETURNING *`,
      [projectId, truckTripId || null, lotId || null, receivedAmount, unit.trim(), conditionStatus || null, exceptionReason || null, weighbridgeTicketKey || null, checkerId, effectiveCheck, status || "pending"],
    );
    res.status(201).json({ warehouseReceipt: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create warehouse receipt" });
  }
});

app.patch("/api/v1/warehouse-receipts/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { status, receivedQuantity, unit, conditionStatus, exceptionReason } = req.body ?? {};
  const receiptStatuses = new Set(["pending", "verified", "partial"]);
  if (receivedQuantity !== undefined && (!Number.isFinite(Number(receivedQuantity)) || Number(receivedQuantity) <= 0)) {
    return res.status(400).json({ error: "receivedQuantity must be a positive finite number.", code: "INVALID_RECEIVED_QUANTITY" });
  }
  if (status !== undefined && (typeof status !== "string" || !receiptStatuses.has(status))) {
    return res.status(400).json({ error: "Invalid warehouse receipt status.", code: "INVALID_RECEIPT_STATUS" });
  }
  if (unit !== undefined && (typeof unit !== "string" || !unit.trim())) {
    return res.status(400).json({ error: "unit must be a non-empty string.", code: "INVALID_RECEIPT_UNIT" });
  }
  try {
    const { rows: scopeRows } = await req.db.query(
      "SELECT project_id, lot_id FROM warehouse_receipts WHERE id = $1::uuid",
      [req.params.id],
    );
    if (scopeRows.length === 0) return res.status(404).json({ error: "Warehouse receipt not found." });
    if (!(await requireProjectPermission(req, res, scopeRows[0].project_id, "warehouse.update"))) return;
    if (unit !== undefined && scopeRows[0].lot_id) {
      const { rows: lotRows } = await req.db.query(
        "SELECT unit FROM inventory_lots WHERE id = $1::uuid AND project_id = $2::uuid",
        [scopeRows[0].lot_id, scopeRows[0].project_id],
      );
      if (lotRows.length !== 1 || lotRows[0].unit !== unit.trim()) {
        return res.status(400).json({ error: "Receipt unit must match inventory lot unit.", code: "UNIT_MISMATCH" });
      }
    }
    const { rows } = await req.db.query(
      `UPDATE warehouse_receipts
          SET status = COALESCE($2, status),
              received_quantity = COALESCE($3, received_quantity),
              unit = COALESCE($4, unit),
              condition_status = COALESCE($5, condition_status),
              exception_reason = COALESCE($6, exception_reason),
              updated_at = now()
        WHERE id = $1::uuid RETURNING *`,
      [req.params.id, status ?? null, receivedQuantity === undefined ? null : Number(receivedQuantity), unit === undefined ? null : unit.trim(), conditionStatus ?? null, exceptionReason ?? null],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Warehouse receipt not found" });
    res.json({ warehouseReceipt: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to update warehouse receipt" });
  }
});

app.get("/api/v1/inventory-lots", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "inventory.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM inventory_lots WHERE project_id=$1::uuid ORDER BY created_at DESC LIMIT 100", [projectId]);
    return res.json({ inventoryLots: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/inventory-lots", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, pksSiteId, quantity, unit, location, status } = req.body;
  if (!projectId || quantity === undefined) return res.status(400).json({ error: "projectId, quantity required" });
  if (!(await requireProjectPermission(req, res, projectId, "inventory.create"))) return;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO inventory_lots (project_id, pks_site_id, quantity, unit, location, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, now(), now()) RETURNING *`,
      [projectId, pksSiteId || null, quantity, unit || "MT", location || null, status || "incoming"],
    );
    res.status(201).json({ inventoryLot: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create inventory lot" });
  }
});

app.get("/api/v1/inventory-movements", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "inventory.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM inventory_movements WHERE project_id=$1::uuid ORDER BY created_at DESC LIMIT 100", [projectId]);
    return res.json({ inventoryMovements: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/inventory-movements", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, lotId, movementType, quantity, unit, warehouseReceiptId, sourceLocation, destinationLocation, reason, referenceId, referenceType, status } = req.body ?? {};
  const actorId = req.user?.id;
  const movementQuantity = Number(quantity);
  const movementTypes = new Set(["receipt", "issue", "transfer", "adjustment"]);
  const movementStatuses = new Set(["posted", "reversed", "adjusted"]);
  if (!projectId || !lotId || typeof movementType !== "string" || !movementType.trim() || !movementTypes.has(movementType.trim()) ||
      quantity === undefined || !Number.isFinite(movementQuantity) || movementQuantity <= 0 ||
      typeof unit !== "string" || !unit.trim() || !actorId ||
      (status !== undefined && (typeof status !== "string" || !movementStatuses.has(status)))) {
    return res.status(400).json({ error: "projectId, lotId, movementType, positive quantity, unit and authenticated actor are required", code: "INVALID_INVENTORY_MOVEMENT" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "inventory.update"))) return;
  try {
    const { rows: lotRows } = await req.db.query(`SELECT id, project_id, unit FROM inventory_lots WHERE id = $1::uuid FOR UPDATE`, [lotId]);
    if (lotRows.length === 0) return res.status(400).json({ error: "Invalid inventory lot" });
    if (lotRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden: lot does not belong to project" });
    if (lotRows[0].unit !== unit.trim()) return res.status(400).json({ error: "Movement unit must match inventory lot unit.", code: "UNIT_MISMATCH" });
    if (warehouseReceiptId) {
      const { rows: receiptRows } = await req.db.query(`SELECT id, project_id FROM warehouse_receipts WHERE id = $1::uuid`, [warehouseReceiptId]);
      if (receiptRows.length === 0) return res.status(400).json({ error: "Invalid warehouse receipt" });
      if (receiptRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden: receipt does not belong to project" });
    }
    const { rows } = await req.db.query(
      `INSERT INTO inventory_movements (project_id, lot_id, warehouse_receipt_id, movement_type, quantity, unit, source_location, destination_location, reason, actor_id, reference_id, reference_type, status, created_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::uuid, $11::uuid, $12, $13, now()) RETURNING *`,
      [projectId, lotId, warehouseReceiptId || null, movementType.trim(), movementQuantity, unit.trim(), sourceLocation || null, destinationLocation || null, reason || null, actorId, referenceId || null, referenceType || null, status || "posted"],
    );
    res.status(201).json({ inventoryMovement: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create inventory movement" });
  }
});

// ============================================
// Inventory reservations (P06)
// ============================================
app.get("/api/v1/inventory-reservations", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId query parameter is required.", code: "PROJECT_ID_REQUIRED" });
  if (!(await requireProjectPermission(req, res, projectId, "inventory.view"))) return;
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM inventory_reservations WHERE project_id = $1::uuid ORDER BY created_at DESC LIMIT 100",
      [projectId],
    );
    res.json({ inventoryReservations: rows });
  } catch {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/inventory-reservations", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, lotId, reservedQuantity, unitCode, buyerId, shipmentId, expiresAt, idempotencyKey } = req.body ?? {};
  const actorId = req.user?.id;
  const quantity = Number(reservedQuantity);
  if (!projectId || !lotId || !actorId || !Number.isFinite(quantity) || quantity <= 0 ||
      typeof unitCode !== "string" || !unitCode.trim() ||
      typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    return res.status(400).json({
      error: "Required fields: projectId, lotId, reservedQuantity (>0), unitCode, idempotencyKey.",
      code: "INVALID_RESERVATION_INPUT",
    });
  }
  if (!(await requireProjectPermission(req, res, projectId, "inventory.reserve"))) return;

  try {
    const { rows: existing } = await req.db.query(
      "SELECT * FROM inventory_reservations WHERE idempotency_key = $1::text LIMIT 1",
      [idempotencyKey.trim()],
    );
    if (existing.length > 0) {
      const prior = existing[0];
      const sameRequest = prior.project_id === projectId && prior.lot_id === lotId &&
        Number(prior.reserved_quantity) === quantity && prior.unit_code === unitCode.trim() &&
        (prior.buyer_id ?? null) === (buyerId ?? null) && (prior.shipment_id ?? null) === (shipmentId ?? null);
      if (!sameRequest) return res.status(409).json({ error: "Idempotency key was already used for a different reservation.", code: "IDEMPOTENCY_KEY_CONFLICT" });
      return res.status(200).json({ inventoryReservation: prior, idempotentReplay: true });
    }

    const { rows: lotRows } = await req.db.query(
      "SELECT id, project_id, unit, quantity, held_quantity, reserved_quantity FROM inventory_lots WHERE id = $1::uuid FOR UPDATE",
      [lotId],
    );
    if (lotRows.length !== 1) return res.status(404).json({ error: "Inventory lot not found.", code: "INVENTORY_LOT_NOT_FOUND" });
    const lot = lotRows[0];
    if (lot.project_id !== projectId) return res.status(403).json({ error: "Inventory lot belongs to another Project.", code: "PROJECT_SCOPE_MISMATCH" });
    if (lot.unit !== unitCode.trim()) return res.status(400).json({ error: "Reservation unit must match the inventory lot unit.", code: "UNIT_MISMATCH" });

    if (buyerId) {
      const { rows: buyerRows } = await req.db.query(
        "SELECT 1 FROM buyers WHERE id = $1::uuid LIMIT 1",
        [buyerId],
      );
      if (buyerRows.length !== 1) return res.status(400).json({ error: "Invalid buyerId.", code: "INVALID_BUYER" });
    }
    if (shipmentId) {
      const { rows: shipmentRows } = await req.db.query(
        "SELECT 1 FROM shipments WHERE id = $1::uuid AND project_id = $2::uuid LIMIT 1",
        [shipmentId, projectId],
      );
      if (shipmentRows.length !== 1) return res.status(400).json({ error: "Shipment must belong to the selected Project.", code: "INVALID_SHIPMENT" });
    }

    // The database trigger locks the lot and rechecks available quantity atomically.
    const { rows } = await req.db.query(
      `INSERT INTO inventory_reservations
         (project_id, lot_id, buyer_id, shipment_id, reserved_quantity, unit_code,
          status, expires_at, created_by, idempotency_key, fulfilled_quantity, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric, $6::text,
               'active', $7::timestamptz, $8::uuid, $9::text, 0, now(), now())
       RETURNING *`,
      [projectId, lotId, buyerId || null, shipmentId || null, quantity, unitCode.trim(), expiresAt || null, actorId, idempotencyKey.trim()],
    );
    res.status(201).json({ inventoryReservation: rows[0] });
  } catch (error: any) {
    if (error?.code === "23514") return res.status(409).json({ error: "Reservation rejected by inventory integrity guard.", code: "RESERVATION_INTEGRITY_REJECTED" });
    if (error?.code === "42703" && /release_reason/.test(String(error?.message || ""))) {
      return res.status(503).json({ error: "Reservation release schema migration is pending.", code: "RESERVATION_SCHEMA_MIGRATION_PENDING" });
    }
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/inventory-reservations/:id/release", requireAuth, async (req: express.Request, res: express.Response) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 3) return res.status(400).json({ error: "A release reason of at least 3 characters is required.", code: "RELEASE_REASON_REQUIRED" });
  const actorId = req.user?.id;
  try {
    const { rows: currentRows } = await req.db.query(
      "SELECT id, project_id, status FROM inventory_reservations WHERE id = $1::uuid FOR UPDATE",
      [req.params.id],
    );
    if (currentRows.length !== 1) return res.status(404).json({ error: "Reservation not found.", code: "RESERVATION_NOT_FOUND" });
    const current = currentRows[0];
    if (!(await requireProjectPermission(req, res, current.project_id, "inventory.reserve"))) return;
    if (!["active", "partially_fulfilled"].includes(current.status)) {
      return res.status(409).json({ error: "Only active or partially fulfilled reservations can be released.", code: "RESERVATION_NOT_RELEASABLE" });
    }
    const { rows } = await req.db.query(
      `UPDATE inventory_reservations
          SET status = 'released', released_by = $2::uuid, released_at = now(),
              release_reason = $3::text, updated_at = now()
        WHERE id = $1::uuid
        RETURNING *`,
      [req.params.id, actorId, reason],
    );
    res.json({ inventoryReservation: rows[0] });
  } catch (error: any) {
    if (error?.code === "42703" && /release_reason/.test(String(error?.message || ""))) {
      return res.status(503).json({ error: "Reservation release is blocked until the approved schema migration is applied.", code: "RESERVATION_SCHEMA_MIGRATION_PENDING" });
    }
    if (error?.code === "55000" || error?.code === "42501") return res.status(409).json({ error: "Reservation release rejected by the database guard.", code: "RESERVATION_RELEASE_REJECTED" });
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/inventory-reservations/:id/expire", requireAuth, async (req: express.Request, res: express.Response) => {
  const actorId = req.user?.id;
  try {
    const { rows: currentRows } = await req.db.query(
      "SELECT id, project_id, status, expires_at FROM inventory_reservations WHERE id = $1::uuid FOR UPDATE",
      [req.params.id],
    );
    if (currentRows.length !== 1) return res.status(404).json({ error: "Reservation not found.", code: "RESERVATION_NOT_FOUND" });
    const current = currentRows[0];
    if (!(await requireProjectPermission(req, res, current.project_id, "inventory.reserve"))) return;
    if (!["active", "partially_fulfilled"].includes(current.status) || !current.expires_at || new Date(current.expires_at).getTime() > Date.now()) {
      return res.status(409).json({ error: "Only an active reservation whose expiry timestamp has passed can expire.", code: "RESERVATION_NOT_EXPIRED" });
    }
    const { rows } = await req.db.query(
      `UPDATE inventory_reservations
          SET status = 'expired', released_by = $2::uuid, released_at = now(),
              release_reason = $3::text, updated_at = now()
        WHERE id = $1::uuid
        RETURNING *`,
      [req.params.id, actorId, "Expired at configured reservation expiry timestamp"],
    );
    res.json({ inventoryReservation: rows[0] });
  } catch (error: any) {
    if (error?.code === "42703" && /release_reason/.test(String(error?.message || ""))) {
      return res.status(503).json({ error: "Reservation expiry is blocked until the approved schema migration is applied.", code: "RESERVATION_SCHEMA_MIGRATION_PENDING" });
    }
    if (error?.code === "55000" || error?.code === "42501") return res.status(409).json({ error: "Reservation expiry rejected by the database guard.", code: "RESERVATION_EXPIRY_REJECTED" });
    res.status(500).json(internalServerErrorPayload());
  }
});

// Inventory holds
app.get("/api/v1/inventory-holds", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "inventory.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM inventory_holds WHERE project_id=$1::uuid ORDER BY created_at DESC LIMIT 100", [projectId]);
    return res.json({ inventoryHolds: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/inventory-holds", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, lotId, heldQuantity, unit, reason, idempotencyKey } = req.body ?? {};
  const actorId = req.user?.id;
  const quantity = Number(heldQuantity);
  if (!projectId || !lotId || !actorId || !Number.isFinite(quantity) || quantity <= 0 || typeof unit !== "string" || !unit.trim() ||
      typeof reason !== "string" || !reason.trim() || typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    return res.status(400).json({ error: "projectId, lotId, authenticated actor, positive heldQuantity, unit, reason and idempotencyKey are required" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "inventory.hold"))) return;
  try {
    const sameHoldRequest = (prior: any) =>
      prior.project_id === projectId &&
      prior.lot_id === lotId &&
      Number(prior.held_quantity ?? prior.quantity) === quantity &&
      String(prior.unit ?? prior.unit_code) === unit.trim() &&
      String(prior.reason ?? "") === reason.trim() &&
      String(prior.created_by ?? prior.placed_by ?? "") === String(actorId);
    const { rows: existing } = await req.db.query(
      "SELECT * FROM inventory_holds WHERE idempotency_key = $1::text LIMIT 1",
      [idempotencyKey.trim()],
    );
    if (existing.length > 0) {
      const prior = existing[0];
      if (!sameHoldRequest(prior)) {
        return res.status(409).json({ error: "Idempotency key was already used for a different inventory hold.", code: "IDEMPOTENCY_KEY_CONFLICT" });
      }
      return res.status(200).json({ inventoryHold: prior, idempotentReplay: true });
    }
    const { rows: lotRows } = await req.db.query(`SELECT id, project_id, unit FROM inventory_lots WHERE id = $1::uuid FOR UPDATE`, [lotId]);
    if (lotRows.length === 0) return res.status(400).json({ error: "Invalid inventory lot" });
    if (lotRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden: lot does not belong to project" });
    if (lotRows[0].unit !== unit.trim()) return res.status(400).json({ error: "Hold unit must match inventory lot unit.", code: "UNIT_MISMATCH" });
    const { rows } = await req.db.query(
      `INSERT INTO inventory_holds
         (project_id, lot_id, hold_type, quantity, unit_code, reason, status, placed_by, placed_at,
          held_quantity, unit, idempotency_key, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'operational', $3, $4, $5, 'active', $7::uuid, now(),
               $3, $4, $6::text, $7::uuid, now(), now())
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`,
      [projectId, lotId, quantity, unit.trim(), reason.trim(), idempotencyKey.trim(), actorId],
    );
    if (rows.length === 0) {
      const { rows: replayRows } = await req.db.query(
        "SELECT * FROM inventory_holds WHERE idempotency_key = $1::text LIMIT 1",
        [idempotencyKey.trim()],
      );
      if (replayRows.length === 1 && sameHoldRequest(replayRows[0])) {
        return res.status(200).json({ inventoryHold: replayRows[0], idempotentReplay: true });
      }
      return res.status(409).json({ error: "Idempotency key was already used for a different inventory hold.", code: "IDEMPOTENCY_KEY_CONFLICT" });
    }
    res.status(201).json({ inventoryHold: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create inventory hold" });
  }
});

// ============================================
// Shipment allocations (P06)
// ============================================
app.get("/api/v1/shipment-allocations", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId query parameter is required.", code: "PROJECT_ID_REQUIRED" });
  if (!(await requireProjectPermission(req, res, projectId, "shipping.view"))) return;
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM shipment_allocations WHERE project_id = $1::uuid ORDER BY created_at DESC LIMIT 100",
      [projectId],
    );
    res.json({ shipmentAllocations: rows });
  } catch {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/shipment-allocations", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, shipmentId, lotId, reservationId, allocatedQuantity, unit, idempotencyKey } = req.body ?? {};
  const actorId = req.user?.id;
  const quantity = Number(allocatedQuantity);
  if (!projectId || !shipmentId || !lotId || !reservationId || !actorId ||
      !Number.isFinite(quantity) || quantity <= 0 ||
      typeof unit !== "string" || !unit.trim() ||
      typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    return res.status(400).json({
      error: "Required fields: projectId, shipmentId, lotId, reservationId, allocatedQuantity (>0), unit, idempotencyKey.",
      code: "INVALID_ALLOCATION_INPUT",
    });
  }
  if (!(await requireProjectPermission(req, res, projectId, "shipping.update"))) return;
  try {
    const { rows: existing } = await req.db.query(
      "SELECT * FROM shipment_allocations WHERE idempotency_key = $1::text LIMIT 1",
      [idempotencyKey.trim()],
    );
    if (existing.length > 0) {
      const prior = existing[0];
      const sameRequest = prior.project_id === projectId && prior.shipment_id === shipmentId &&
        prior.lot_id === lotId && prior.reservation_id === reservationId &&
        Number(prior.allocated_quantity) === quantity && prior.unit === unit.trim();
      if (!sameRequest) return res.status(409).json({ error: "Idempotency key was already used for a different allocation.", code: "IDEMPOTENCY_KEY_CONFLICT" });
      return res.status(200).json({ shipmentAllocation: prior, idempotentReplay: true });
    }

    const { rows: shipmentRows } = await req.db.query(
      "SELECT id, project_id, quantity FROM shipments WHERE id = $1::uuid AND project_id = $2::uuid FOR UPDATE",
      [shipmentId, projectId],
    );
    if (shipmentRows.length !== 1) return res.status(400).json({ error: "Shipment does not belong to the selected Project.", code: "INVALID_SHIPMENT" });
    const { rows: lotRows } = await req.db.query(
      "SELECT id, project_id, unit FROM inventory_lots WHERE id = $1::uuid AND project_id = $2::uuid FOR UPDATE",
      [lotId, projectId],
    );
    if (lotRows.length !== 1) return res.status(400).json({ error: "Inventory lot does not belong to the selected Project.", code: "INVALID_INVENTORY_LOT" });
    if (lotRows[0].unit !== unit.trim()) return res.status(400).json({ error: "Allocation unit must match inventory lot unit.", code: "UNIT_MISMATCH" });

    const { rows: reservationRows } = await req.db.query(
      `SELECT id, project_id, lot_id, shipment_id, reserved_quantity, fulfilled_quantity, unit_code, status
         FROM inventory_reservations
        WHERE id = $1::uuid AND project_id = $2::uuid
        FOR UPDATE`,
      [reservationId, projectId],
    );
    if (reservationRows.length !== 1) return res.status(400).json({ error: "Reservation does not belong to the selected Project.", code: "INVALID_RESERVATION" });
    const reservation = reservationRows[0];
    if (reservation.lot_id !== lotId || (reservation.shipment_id && reservation.shipment_id !== shipmentId) ||
        !["active", "partially_fulfilled"].includes(reservation.status) ||
        reservation.unit_code !== unit.trim()) {
      return res.status(409).json({ error: "Reservation must be active and match Project, shipment, lot and unit.", code: "RESERVATION_SCOPE_OR_STATE_MISMATCH" });
    }

    const { rows: allocatedRows } = await req.db.query(
      `SELECT COALESCE(sum(allocated_quantity),0) AS allocated
         FROM shipment_allocations
        WHERE reservation_id = $1::uuid AND status IN ('allocated','partially_loaded','loaded')`,
      [reservationId],
    );
    const { rows: shipmentAllocatedRows } = await req.db.query(
      `SELECT COALESCE(sum(allocated_quantity),0) AS allocated
         FROM shipment_allocations
        WHERE shipment_id = $1::uuid AND status IN ('allocated','partially_loaded','loaded')`,
      [shipmentId],
    );
    const capacity = validateAllocationCapacity({
      projectId,
      shipmentProjectId: shipmentRows[0].project_id,
      lotProjectId: lotRows[0].project_id,
      reservationProjectId: reservation.project_id,
      reservationLotId: reservation.lot_id,
      lotId,
      reservationShipmentId: reservation.shipment_id ?? null,
      shipmentId,
      reservationStatus: reservation.status,
      reservationQuantity: Number(reservation.reserved_quantity),
      existingReservationAllocations: Number(allocatedRows[0]?.allocated || 0),
      shipmentQuantity: Number(shipmentRows[0].quantity),
      existingShipmentAllocations: Number(shipmentAllocatedRows[0]?.allocated || 0),
      allocationQuantity: quantity,
      unitMatches: reservation.unit_code === unit.trim() && lotRows[0].unit === unit.trim(),
    });
    if (capacity.ok === false) {
      return res.status(409).json({ error: "Allocation violates reservation or shipment capacity.", code: capacity.code });
    }

    const { rows } = await req.db.query(
      `INSERT INTO shipment_allocations
         (shipment_id, lot_id, project_id, reservation_id, allocated_quantity, unit,
          status, loaded_quantity, idempotency_key, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric, $6::text,
               'draft', 0, $7::text, $8::uuid, now(), now())
       RETURNING *`,
      [shipmentId, lotId, projectId, reservationId, quantity, unit.trim(), idempotencyKey.trim(), actorId],
    );
    res.status(201).json({ shipmentAllocation: rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "An allocation already exists for this shipment and lot.", code: "ALLOCATION_ALREADY_EXISTS" });
    if (error?.code === "23514" || error?.code === "55000") return res.status(409).json({ error: "Allocation rejected by the database integrity guard.", code: "ALLOCATION_INTEGRITY_REJECTED" });
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/shipment-allocations/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { status, loadedQuantity, reversalReason } = req.body ?? {};
  const allowedStatuses = new Set(["allocated", "partially_loaded", "loaded", "cancelled", "reversed"]);
  if (status !== undefined && (typeof status !== "string" || !allowedStatuses.has(status))) {
    return res.status(400).json({ error: "Invalid shipment allocation status.", code: "INVALID_ALLOCATION_STATUS" });
  }
  if (loadedQuantity !== undefined && (!Number.isFinite(Number(loadedQuantity)) || Number(loadedQuantity) < 0)) {
    return res.status(400).json({ error: "loadedQuantity must be a non-negative number.", code: "INVALID_LOADED_QUANTITY" });
  }
  try {
    const { rows: allocationRows } = await req.db.query(
      "SELECT id, project_id, shipment_id, reservation_id, allocated_quantity, loaded_quantity, status FROM shipment_allocations WHERE id = $1::uuid FOR UPDATE",
      [req.params.id],
    );
    if (allocationRows.length !== 1) return res.status(404).json({ error: "Shipment allocation not found.", code: "ALLOCATION_NOT_FOUND" });
    const allocation = allocationRows[0];
    if (!(await requireProjectPermission(req, res, allocation.project_id, "shipping.update"))) return;

    if (status === "reversed" && (typeof reversalReason !== "string" || reversalReason.trim().length < 3)) {
      return res.status(400).json({ error: "A reversal reason of at least 3 characters is required.", code: "REVERSAL_REASON_REQUIRED" });
    }
    const transition = validateAllocationTransition({
      currentStatus: allocation.status,
      nextStatus: status,
      currentLoadedQuantity: Number(allocation.loaded_quantity),
      nextLoadedQuantity: loadedQuantity === undefined ? undefined : Number(loadedQuantity),
      allocatedQuantity: Number(allocation.allocated_quantity),
      reversalReason,
    });
    if (transition.ok === false) {
      return res.status(400).json({ error: "Invalid shipment allocation state transition.", code: transition.code });
    }

    const { rows } = await req.db.query(
      `UPDATE shipment_allocations
          SET status = COALESCE($2::text, status),
              loaded_quantity = COALESCE($3::numeric, loaded_quantity),
              reversal_reason = CASE WHEN $2::text = 'reversed' THEN $4::text ELSE reversal_reason END,
              updated_at = now()
        WHERE id = $1::uuid
        RETURNING *`,
      [req.params.id, status ?? null, loadedQuantity === undefined ? null : Number(loadedQuantity), reversalReason?.trim() || null],
    );
    res.json({ shipmentAllocation: rows[0] });
  } catch (error: any) {
    if (error?.code === "23514" || error?.code === "55000" || error?.code === "42501") {
      return res.status(409).json({ error: "Allocation state transition rejected by the database guard.", code: "ALLOCATION_TRANSITION_REJECTED" });
    }
    res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/fx-rates", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM fx_rates WHERE is_active = true ORDER BY rate_date DESC LIMIT 100");
    res.json({ fxRates: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load FX rates" });
  }
});

app.post("/api/v1/fx-rates", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { fromCurrency, toCurrency, rate, rateType, source, effectiveDate } = req.body;
  if (!fromCurrency || !toCurrency || rate === undefined || !effectiveDate) return res.status(400).json({ error: "fromCurrency, toCurrency, rate, effectiveDate required" });
  try {
    const { rows: fromRows } = await req.db.query("SELECT id FROM currencies WHERE code = $1::text AND is_active = true LIMIT 1", [fromCurrency]);
    const { rows: toRows } = await req.db.query("SELECT id FROM currencies WHERE code = $1::text AND is_active = true LIMIT 1", [toCurrency]);
    if (fromRows.length === 0 || toRows.length === 0) {
      const invalid: string[] = [];
      if (fromRows.length === 0) invalid.push(fromCurrency);
      if (toRows.length === 0) invalid.push(toCurrency);
      return res.status(400).json({ error: "Invalid or inactive currency code", invalid });
    }
    const { rows } = await req.db.query(
      `INSERT INTO fx_rates (from_currency_id, to_currency_id, rate, rate_type, rate_source, rate_date, is_active, created_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::timestamptz, true, now()) RETURNING *`,
      [fromRows[0].id, toRows[0].id, rate, rateType || "reference", source || null, effectiveDate],
    );
    res.status(201).json({ fxRate: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create FX rate" });
  }
});

app.get("/api/v1/fx-exposure", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "finance.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT e.id, e.project_id, e.exposure_type, e.original_currency_id, e.original_amount,
              e.functional_amount, e.fx_rate, e.fx_date, e.created_at, e.updated_at,
              c.code AS original_currency_code
       FROM fx_exposures e LEFT JOIN currencies c ON c.id = e.original_currency_id
       WHERE e.project_id = $1::uuid ORDER BY e.created_at DESC LIMIT 100`,
      [projectId],
    );
    res.json({ fxExposure: rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      exposureType: r.exposure_type,
      originalCurrencyId: r.original_currency_id,
      originalCurrencyCode: r.original_currency_code,
      originalAmount: r.original_amount,
      functionalAmount: r.functional_amount,
      fxRate: r.fx_rate,
      fxDate: r.fx_date,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load FX exposure" });
  }
});

app.post("/api/v1/fx-exposure", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, amountIdr, amountFx, fxRate, exposureType, originalCurrency } = req.body;
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  if (!(await requireProjectPermission(req, res, projectId, "finance.create"))) return;
  try {
    // Resolve original currency (default to IDR)
    const currencyCode = originalCurrency || "IDR";
    const { rows: currencyRows } = await req.db.query(
      "SELECT id FROM currencies WHERE code = $1::text AND is_active = true LIMIT 1",
      [currencyCode],
    );
    if (currencyRows.length === 0) {
      return res.status(400).json({ error: `Invalid or inactive currency code: ${currencyCode}` });
    }
    const originalAmount = amountIdr !== undefined && amountIdr !== null ? Number(amountIdr) : null;
    const functionalAmount = amountFx !== undefined && amountFx !== null ? Number(amountFx) : null;
    const fxRateValue = fxRate !== undefined && fxRate !== null ? Number(fxRate) : null;
    const { rows } = await req.db.query(
      `INSERT INTO fx_exposures (project_id, exposure_type, original_currency_id, original_amount, functional_amount, fx_rate, fx_date, created_at, updated_at)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7::timestamptz, now(), now()) RETURNING *`,
      [projectId, exposureType || "open", currencyRows[0].id, originalAmount, functionalAmount, fxRateValue, new Date().toISOString()],
    );
    res.status(201).json({ fxExposure: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create FX exposure" });
  }
});


app.get("/api/v1/journal-entries", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "accounting.view"))) return;
  try {
    const { rows } = await req.db.query("SELECT * FROM journal_entries WHERE project_id = $1::uuid ORDER BY created_at DESC LIMIT 100", [projectId]);
    res.json({ journalEntries: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load journal entries" });
  }
});

app.post("/api/v1/journal-entries", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, entryType, referenceId, referenceType, description, entryDate } = req.body;
  if (!projectId || !entryType || !description) return res.status(400).json({ error: "projectId, entryType, description required" });
  if (!(await requireProjectPermission(req, res, projectId, "accounting.create"))) return;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO journal_entries (project_id, entry_type, reference_id, reference_type, description, entry_date, status, posted_by, created_at, updated_at)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6::timestamptz, 'draft', $7::uuid, now(), now()) RETURNING *`,
      [projectId, entryType, referenceId || null, referenceType || null, description, entryDate || new Date().toISOString(), req.user?.id || null],
    );
    res.status(201).json({ journalEntry: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create journal entry" });
  }
});

app.post("/api/v1/journal-entries/:id/post", requireAuth, async (req: express.Request, res: express.Response) => {
  const journalEntryId = req.params.id;
  try {
    // Verify the journal exists and is in draft status
    const { rows: entryRows } = await req.db.query(
      "SELECT id, project_id, status FROM journal_entries WHERE id = $1::uuid FOR UPDATE",
      [journalEntryId],
    );
    if (entryRows.length === 0) return res.status(404).json({ error: "Journal entry not found" });
    if (!(await requireProjectPermission(req, res, entryRows[0].project_id, "accounting.update"))) return;
    if (entryRows[0].status !== "draft") {
      return res.status(400).json({ error: "Only draft journal entries can be posted" });
    }

    // Validate all lines exist and accounts are valid
    const { rows: lines } = await req.db.query(
      `SELECT jl.id, jl.account_id, jl.debit, jl.credit, co.code AS account_code, co.is_active AS account_active
       FROM journal_lines jl
       LEFT JOIN chart_of_accounts co ON co.id = jl.account_id
       WHERE jl.journal_entry_id = $1::uuid
       ORDER BY jl.line_order`,
      [journalEntryId],
    );
    if (lines.length === 0) {
      return res.status(400).json({ error: "Cannot post a journal entry with no lines" });
    }

    // Validate all accounts exist and are active
    const invalidAccounts = lines.filter((l: any) => !l.account_id || !l.account_active);
    if (invalidAccounts.length > 0) {
      return res.status(400).json({ error: "Invalid or inactive account in journal lines", invalidAccounts: invalidAccounts.map((l: any) => l.account_code || l.account_id) });
    }

    // Validate balance: total debit = total credit
    const totalDebit = lines.reduce((sum: number, l: any) => sum + Number(l.debit || 0), 0);
    const totalCredit = lines.reduce((sum: number, l: any) => sum + Number(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      return res.status(400).json({ error: "Journal entry is not balanced: total debit must equal total credit", totalDebit, totalCredit });
    }

    // Post the journal
    const { rows } = await req.db.query(
      `UPDATE journal_entries
       SET status = 'posted', posted_at = now(), posted_by = COALESCE($2::uuid, posted_by), updated_at = now()
       WHERE id = $1::uuid AND status = 'draft'
       RETURNING *`,
      [journalEntryId, req.user?.id || null],
    );
    if (rows.length === 0) {
      return res.status(409).json({ error: "Journal entry was modified by another operation" });
    }
    res.json({ journalEntry: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to post journal entry" });
  }
});

app.post("/api/v1/journal-entries/:id/lines", requireAuth, async (req: express.Request, res: express.Response) => {
  const lines = req.body?.lines;
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 100) return res.status(400).json({ error: "Provide between 2 and 100 journal lines." });
  try {
    const { rows: entryRows } = await req.db.query("SELECT id, project_id, status FROM journal_entries WHERE id=$1::uuid FOR UPDATE", [req.params.id]);
    if (!entryRows.length) return res.status(404).json({ error: "Journal entry not found." });
    if (!(await requireProjectPermission(req, res, entryRows[0].project_id, "accounting.create"))) return;
    if (entryRows[0].status !== "draft") return res.status(409).json({ error: "Journal lines can only be added to a draft entry." });
    const normalized = lines.map((line: any) => ({
      account_id: String(line.accountId || ""),
      debit: Number(line.debit),
      credit: Number(line.credit),
      description: typeof line.description === "string" ? line.description.slice(0, 500) : null,
      line_order: Number(line.lineOrder),
    }));
    if (normalized.some((line: any) => !/^[0-9a-f-]{36}$/i.test(line.account_id) ||
      !Number.isFinite(line.debit) || !Number.isFinite(line.credit) || line.debit < 0 || line.credit < 0 ||
      (line.debit === 0 && line.credit === 0) || (line.debit > 0 && line.credit > 0) ||
      !Number.isInteger(line.line_order) || line.line_order < 1)) {
      return res.status(400).json({ error: "Every journal line needs a valid account, one positive debit or credit, and a positive line order." });
    }
    const accountIds = [...new Set(normalized.map((line: any) => line.account_id))];
    const { rows: accounts } = await req.db.query("SELECT id FROM chart_of_accounts WHERE id=ANY($1::uuid[]) AND is_active=true", [accountIds]);
    if (accounts.length !== accountIds.length) return res.status(400).json({ error: "One or more accounts are invalid or inactive." });
    const { rows } = await req.db.query(
      `INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description,line_order,created_at)
       SELECT $1::uuid,x.account_id::uuid,x.debit,x.credit,x.description,x.line_order,now()
       FROM jsonb_to_recordset($2::jsonb) AS x(account_id text,debit numeric,credit numeric,description text,line_order integer)
       RETURNING *`,
      [req.params.id, JSON.stringify(normalized)],
    );
    return res.status(201).json({ journalLines: rows });
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});

app.post("/api/v1/journal-lines", requireAuth, async (req: express.Request, res: express.Response) => {
  const { journalEntryId, accountId, debit, credit, description, lineOrder } = req.body;
  if (!journalEntryId || !accountId || debit === undefined || credit === undefined) return res.status(400).json({ error: "journalEntryId, accountId, debit, credit required" });
  try {
    // Verify the journal entry exists and is in draft status
    const { rows: entryRows } = await req.db.query(
      "SELECT id, project_id, status FROM journal_entries WHERE id = $1::uuid",
      [journalEntryId],
    );
    if (entryRows.length === 0) return res.status(404).json({ error: "Journal entry not found" });
    if (!(await requireProjectPermission(req, res, entryRows[0].project_id, "accounting.create"))) return;
    const debitValue = Number(debit), creditValue = Number(credit);
    if (!Number.isFinite(debitValue) || !Number.isFinite(creditValue) || debitValue < 0 || creditValue < 0 ||
        (debitValue === 0 && creditValue === 0) || (debitValue > 0 && creditValue > 0)) {
      return res.status(400).json({ error: "Each journal line must have one positive debit or credit amount, never both." });
    }
    if (entryRows[0].status !== "draft") {
      return res.status(400).json({ error: "Cannot add lines to a posted journal entry" });
    }

    // Validate account exists and is active
    const { rows: accountRows } = await req.db.query(
      "SELECT id, is_active FROM chart_of_accounts WHERE id = $1::uuid",
      [accountId],
    );
    if (accountRows.length === 0) {
      return res.status(400).json({ error: "Invalid account: account not found in chart of accounts" });
    }
    if (!accountRows[0].is_active) {
      return res.status(400).json({ error: "Invalid account: account is not active" });
    }

    const { rows } = await req.db.query(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, line_order, created_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, now()) RETURNING *`,
      [journalEntryId, accountId, debitValue, creditValue, description || null, lineOrder !== undefined ? lineOrder : 1],
    );
    res.status(201).json({ journalLine: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create journal line" });
  }
});

// AP/AR Project-scoped Finance endpoints; no bank payment execution.
app.get("/api/v1/ap-invoices", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required." });
  if (!(await requireProjectPermission(req, res, projectId, "finance.view"))) return;
  try { const { rows } = await req.db.query("SELECT * FROM ap_invoices WHERE project_id=$1::uuid ORDER BY invoice_date DESC LIMIT 200",[projectId]); return res.json({apInvoices:rows}); }
  catch { return res.status(500).json(internalServerErrorPayload()); }
});
app.post("/api/v1/ap-invoices", requireAuth, async (req: express.Request, res: express.Response) => {
  const {projectId,supplierId,invoiceNumber,invoiceDate,dueDate,currencyCode,invoiceAmount,taxAmount=0}=req.body??{};
  const amount=Number(invoiceAmount),tax=Number(taxAmount);
  if(!projectId||!supplierId||!invoiceNumber||!invoiceDate||!currencyCode||!Number.isFinite(amount)||amount<=0||!Number.isFinite(tax)||tax<0)return res.status(400).json({error:"Valid Project, supplier, invoice/date, currency and amounts are required."});
  if(!(await requireProjectPermission(req,res,projectId,"finance.create")))return;
  try {
    const {rows:v}=await req.db.query("SELECT v.id FROM vendors v JOIN project_supplier_participation psp ON psp.vendor_id=v.id WHERE v.id=$1::uuid AND psp.project_id=$2::uuid AND psp.is_active=true AND v.is_active=true",[supplierId,projectId]);
    const {rows:c}=await req.db.query("SELECT id FROM currencies WHERE code=$1::text AND is_active=true",[currencyCode]);
    if(!v.length||!c.length)return res.status(400).json({error:"Supplier or currency is invalid or inactive."});
    const total=Math.round((amount+tax)*100)/100;
    const {rows}=await req.db.query(`INSERT INTO ap_invoices
      (project_id,supplier_id,invoice_number,invoice_date,due_date,currency_id,invoice_amount,tax_amount,total_amount,verification_status,three_way_match,paid_amount,outstanding_amount,created_by,created_at,updated_at)
      VALUES ($1::uuid,$2::uuid,$3,$4::timestamptz,$5::timestamptz,$6::uuid,$7,$8,$9,'pending',false,0,$9,$10::uuid,now(),now()) RETURNING *`,
      [projectId,supplierId,String(invoiceNumber).trim(),invoiceDate,dueDate||null,c[0].id,amount,tax,total,req.user?.id||null]);
    return res.status(201).json({apInvoice:rows[0]});
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});
app.patch("/api/v1/ap-invoices/:id/verification", requireAuth, async (req: express.Request, res: express.Response) => {
  const {verificationStatus,disputeReason}=req.body??{};
  if(!["verified","disputed"].includes(verificationStatus)||(verificationStatus==="disputed"&&!String(disputeReason||"").trim()))return res.status(400).json({error:"Use verified or disputed; disputed requires a reason."});
  try {
    const {rows:s}=await req.db.query("SELECT id,project_id,three_way_match FROM ap_invoices WHERE id=$1::uuid",[req.params.id]);
    if(!s.length)return res.status(404).json({error:"AP invoice not found."});
    if(!(await requireProjectPermission(req,res,s[0].project_id,"finance.update")))return;
    // The current schema has no Purchase Order master/workflow; only a system-calculated database flag can authorize verification.
    const matched=s[0].three_way_match===true;
    if(verificationStatus==="verified"&&!matched)return res.status(409).json({error:"Verification is blocked until the Purchase Order + Goods Receipt + Supplier Invoice matching workflow is implemented and system-verified.",code:"THREE_WAY_MATCH_WORKFLOW_REQUIRED"});
    const {rows}=await req.db.query(`UPDATE ap_invoices SET verification_status=$1,dispute_reason=CASE WHEN $1='disputed' THEN $2 ELSE NULL END,
      verified_by=$3::uuid,verified_at=now(),updated_by=$3::uuid,updated_at=now() WHERE id=$4::uuid AND project_id=$5::uuid RETURNING *`,
      [verificationStatus,disputeReason?.trim()||null,req.user?.id||null,req.params.id,s[0].project_id]);
    return res.json({apInvoice:rows[0]});
  } catch { return res.status(500).json(internalServerErrorPayload()); }
});
app.get("/api/v1/ar-invoices", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId=typeof req.query.projectId==="string"?req.query.projectId:"";
  if(!projectId)return res.status(400).json({error:"projectId is required."});
  if(!(await requireProjectPermission(req,res,projectId,"finance.view")))return;
  try {const {rows}=await req.db.query("SELECT * FROM ar_invoices WHERE project_id=$1::uuid ORDER BY invoice_date DESC LIMIT 200",[projectId]);return res.json({arInvoices:rows});}
  catch{return res.status(500).json(internalServerErrorPayload());}
});
app.post("/api/v1/ar-invoices", requireAuth, async (req: express.Request, res: express.Response) => {
  const {projectId,buyerMasterId,invoiceNumber,invoiceDate,dueDate,currencyCode,invoiceAmount,acceptedQuantity,unit="MT",sellingPrice,relatedShipmentId}=req.body??{};
  const amount=Number(invoiceAmount),qty=acceptedQuantity===undefined?null:Number(acceptedQuantity),price=sellingPrice===undefined?null:Number(sellingPrice);
  if(!projectId||!buyerMasterId||!invoiceNumber||!invoiceDate||!currencyCode||!Number.isFinite(amount)||amount<=0||(qty!==null&&(!Number.isFinite(qty)||qty<=0))||(price!==null&&(!Number.isFinite(price)||price<0)))return res.status(400).json({error:"Valid Project, buyer, invoice, currency and amount are required."});
  if(!(await requireProjectPermission(req,res,projectId,"finance.create")))return;
  try {
    const {rows:b}=await req.db.query(`SELECT b.id FROM buyers b JOIN contract_programs cp ON cp.buyer_id=b.id JOIN projects p ON p.contract_program_id=cp.id WHERE b.id=$1::uuid AND p.id=$2::uuid AND b.is_active=true LIMIT 1`,[buyerMasterId,projectId]);
    const {rows:c}=await req.db.query("SELECT id FROM currencies WHERE code=$1::text AND is_active=true",[currencyCode]);
    if(!b.length||!c.length)return res.status(400).json({error:"Buyer is not assigned to this Project or currency is invalid."});
    if(relatedShipmentId){const {rows}=await req.db.query("SELECT id FROM shipments WHERE id=$1::uuid AND project_id=$2::uuid",[relatedShipmentId,projectId]);if(!rows.length)return res.status(400).json({error:"Shipment is not part of this Project."});}
    const {rows}=await req.db.query(`INSERT INTO ar_invoices (buyer_id,buyer_master_id,invoice_number,invoice_date,due_date,currency_id,invoice_amount,accepted_quantity,unit,selling_price,total_amount,project_id,related_shipment_id,approval_status,settlement_status,created_by,created_at,updated_at)
      VALUES (NULL,$1::uuid,$2,$3::timestamptz,$4::timestamptz,$5::uuid,$6,$7,$8,$9,$6,$10::uuid,$11::uuid,'pending','open',$12::uuid,now(),now()) RETURNING *`,
      [buyerMasterId,String(invoiceNumber).trim(),invoiceDate,dueDate||null,c[0].id,amount,qty,unit,price,projectId,relatedShipmentId||null,req.user?.id||null]);
    return res.status(201).json({arInvoice:rows[0]});
  } catch{return res.status(500).json(internalServerErrorPayload());}
});
app.patch("/api/v1/ar-invoices/:id/approval", requireAuth, async (req: express.Request, res: express.Response) => {
  const {approvalStatus,reason}=req.body??{};
  if(!["approved","disputed"].includes(approvalStatus)||(approvalStatus==="disputed"&&!String(reason||"").trim()))return res.status(400).json({error:"Use approved or disputed; disputed requires a reason."});
  try {
    const {rows:s}=await req.db.query("SELECT id,project_id FROM ar_invoices WHERE id=$1::uuid",[req.params.id]);
    if(!s.length)return res.status(404).json({error:"AR invoice not found."});
    if(!(await requireProjectPermission(req,res,s[0].project_id,"finance.update")))return;
    const {rows}=await req.db.query(`UPDATE ar_invoices SET approval_status=$1,dispute_reason=$2,approved_by=$3::uuid,approved_at=now(),updated_by=$3::uuid,updated_at=now()
      WHERE id=$4::uuid AND project_id=$5::uuid RETURNING *`,[approvalStatus,reason?.trim()||null,req.user?.id||null,req.params.id,s[0].project_id]);
    return res.json({arInvoice:rows[0]});
  } catch{return res.status(500).json(internalServerErrorPayload());}
});
// ============================================
// RAB routes (P07 Finance)
// ============================================
app.get("/api/v1/rab", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required.", code: "PROJECT_ID_REQUIRED" });
  if (!(await requireProjectPermission(req, res, projectId, "finance.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT id, project_id, description, category, amount, version, is_active, created_at, updated_at
       FROM rab
       WHERE project_id = $1::uuid AND is_active = true
       ORDER BY created_at DESC LIMIT 200`,
      [projectId],
    );
    res.json({ rab: rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      description: r.description,
      category: r.category,
      amount: r.amount,
      version: r.version,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/rab", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, description, category, amount, version } = req.body;
  if (!projectId || !description || !category || amount === undefined) {
    return res.status(400).json({ error: "Required fields: projectId, description, category, amount" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "finance.create"))) return;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO rab (project_id, description, category, amount, version, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, true, now(), now()) RETURNING *`,
      [projectId, description, category, Number(amount), version || 1],
    );
    res.status(201).json({ rabItem: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// ============================================
// Chart of accounts routes (P07 GL)
// ============================================
app.get("/api/v1/chart-of-accounts", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      "SELECT id, code, name, description, parent_id, account_type, is_active, created_at, updated_at FROM chart_of_accounts WHERE is_active = true ORDER BY code",
    );
    res.json({ accounts: rows });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/chart-of-accounts", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { code, name, description, parentId, accountType } = req.body;
  if (!code || !name || !accountType) return res.status(400).json({ error: "Required fields: code, name, accountType" });
  try {
    const { rows } = await req.db.query(
      `INSERT INTO chart_of_accounts (code, name, description, parent_id, account_type, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4::uuid, $5, true, now(), now()) RETURNING *`,
      [code, name, description || null, parentId || null, accountType],
    );
    res.status(201).json({ account: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// ============================================
// Finance reporting-only workflow (F1)
// Finance records reports; the application does not execute payments.
// ============================================
app.get("/api/v1/finance/reports", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  if (!(await requireProjectPermission(req, res, projectId, "reports.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT id, project_id, template_id, template_version, period_start, period_end,
              report_payload, requested_by, submitted_at, generated_at, data_freshness, status
         FROM report_runs
        WHERE project_id = $1::uuid AND template_id = 'tpl-financial-report'
        ORDER BY submitted_at DESC NULLS LAST, generated_at DESC
        LIMIT 200`,
      [projectId],
    );
    return res.json({ reports: rows });
  } catch (error) {
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/finance/reports", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, periodStart, periodEnd, report, summary } = req.body ?? {};
  if (typeof projectId !== "string" || !projectId ||
      typeof periodStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) ||
      typeof periodEnd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ||
      periodStart > periodEnd || !report || typeof report !== "object" || Array.isArray(report)) {
    return res.status(400).json({ error: "Required: projectId, valid periodStart/periodEnd, and report object." });
  }
  const payload = JSON.stringify({ summary: typeof summary === "string" ? summary.slice(0, 4000) : "", report });
  if (payload.length > 200_000) return res.status(413).json({ error: "Financial report payload exceeds 200 KB." });
  if (!(await requireProjectPermission(req, res, projectId, "reports.create"))) return;
  const requesterId = req.user?.id;
  if (!requesterId) return res.status(401).json({ error: "Authenticated principal required" });
  try {
    const { rows: financeMembership } = await req.db.query(
      `SELECT 1
         FROM public.project_role_assignments a
         JOIN public.project_members pm
           ON pm.id = a.project_member_id AND pm.project_id = a.project_id AND pm.user_id = a.user_id
         JOIN public.project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
         JOIN public.users u ON u.id = a.user_id
        WHERE a.project_id = $1::uuid AND a.user_id = $2::uuid
          AND a.is_active = true AND a.revoked_at IS NULL
          AND (a.expires_at IS NULL OR a.expires_at > now())
          AND pm.is_active = true AND pm.deactivated_at IS NULL
          AND (pm.expires_at IS NULL OR pm.expires_at > now())
          AND pr.is_active = true AND pr.role_code = 'finance' AND u.is_active = true
        LIMIT 1`,
      [projectId, requesterId],
    );
    if (!financeMembership.length) {
      return res.status(403).json({ error: "Only an active Finance member can submit a Project financial report.", code: "FINANCE_ROLE_REQUIRED" });
    }
    const { rows: projectRows } = await req.db.query(
      "SELECT id, name FROM projects WHERE id = $1::uuid AND is_active = true LIMIT 1",
      [projectId],
    );
    if (!projectRows.length) return res.status(404).json({ error: "Active Project not found." });
    const { rows: reportRows } = await req.db.query(
      `INSERT INTO report_runs
        (id, schedule_id, template_id, template_version, cutoff_at, generated_at,
         requested_by, audience, project_id, status, idempotency_key, data_freshness,
         report_payload, period_start, period_end, submitted_at)
       VALUES (gen_random_uuid(), NULL, 'tpl-financial-report', 1, $1::date::timestamptz,
         now(), $2::uuid, 'project_management', $3::uuid, 'submitted',
         NULL, now(), $4::jsonb, $5::date, $6::date, now())
       RETURNING id, project_id, template_id, template_version, period_start, period_end,
                 report_payload, requested_by, submitted_at, generated_at, data_freshness, status`,
      [periodEnd, requesterId, projectId, payload, periodStart, periodEnd],
    );
    const reportRun = reportRows[0];
    const { rows: notificationRows } = await req.db.query(
      "SELECT public.pke_submit_finance_report_notifications($1::uuid, $2::uuid, $3::text, $4::text) AS notifications_created",
      [projectId, requesterId,
       `Laporan keuangan baru — ${projectRows[0].name}`,
       `Finance mengirim laporan periode ${periodStart} sampai ${periodEnd}. Laporan siap ditinjau.`],
    );
    return res.status(201).json({
      financialReport: reportRun,
      notificationsCreated: Number(notificationRows[0]?.notifications_created ?? 0),
      notifiedRoles: ["pm", "admin"],
      paymentExecution: false,
    });
  } catch (error) {
    return res.status(500).json(internalServerErrorPayload());
  }
});

// Cash Advance requestor → independent Finance decision vertical slice.
app.get("/api/v1/currencies",requireAuth,async(req:express.Request,res:express.Response)=>{
  try{const {rows}=await req.db.query("SELECT id,code,name,is_functional FROM public.currencies WHERE is_active=true ORDER BY is_functional DESC,code");return res.json({currencies:rows});}
  catch{return res.status(500).json(internalServerErrorPayload());}
});
app.get("/api/v1/cash-advances",requireAuth,async(req:express.Request,res:express.Response)=>{
  const projectId=typeof req.query.projectId==="string"?req.query.projectId:"";
  if(!projectId)return res.status(400).json({error:"projectId is required."});
  try{
    const permission=await findExplicitProjectPermission(req,projectId,["finance.view","finance.cash_advance.request"]);
    if(!permission)return res.status(403).json({error:"Explicit active Project role permission required.",code:"PROJECT_PERMISSION_REQUIRED"});
    await applyExplicitProjectPermissionContext(req,projectId,permission);
    const decisionPermission=await findExplicitProjectPermission(req,projectId,["finance.update"]);
    const {rows}=await listCashAdvances(req.db,projectId);
    return res.json({cashAdvances:rows,
      canRequest:Boolean(await findExplicitProjectPermission(req,projectId,["finance.cash_advance.request"])),
      canApprove:decisionPermission?.role_code==="finance",
      canViewAll:Boolean(await findExplicitProjectPermission(req,projectId,["finance.view"]))});
  }catch{return res.status(500).json(internalServerErrorPayload());}
});
app.post("/api/v1/cash-advances",requireAuth,async(req:express.Request,res:express.Response)=>{
  const {projectId,amount,currencyId,purpose,advanceDate}=req.body??{};
  if(typeof projectId!=="string"||!projectId||!isValidCashAdvanceRequest({amount,currencyId,purpose,advanceDate}))
    return res.status(400).json({error:"projectId, positive amount, valid currencyId, purpose and advanceDate are required.",code:"INVALID_CASH_ADVANCE_REQUEST"});
  try{
    const permission=await findExplicitProjectPermission(req,projectId,["finance.cash_advance.request"]);
    if(!permission)return res.status(403).json({error:"Cash Advance request permission is not assigned to this active Project role.",code:"CASH_ADVANCE_REQUEST_PERMISSION_REQUIRED"});
    await applyExplicitProjectPermissionContext(req,projectId,permission);
    const {rows:projects}=await req.db.query("SELECT id FROM public.projects WHERE id=$1::uuid AND is_active=true",[projectId]);
    if(!projects.length)return res.status(404).json({error:"Active Project not found."});
    const {rows:currencies}=await req.db.query("SELECT id FROM public.currencies WHERE id=$1::uuid AND is_active=true",[currencyId]);
    if(!currencies.length)return res.status(400).json({error:"Currency is invalid or inactive."});
    const cashAdvance=await createCashAdvance(req.db,{projectId,requestorId:req.user.id,amount:Number(amount),currencyId,purpose:purpose.trim(),advanceDate});
    return res.status(201).json({cashAdvance});
  }catch(error:any){
    if(error?.code==="42501")return res.status(403).json({error:"Database RLS/requestor guard rejected the request.",code:"CASH_ADVANCE_RLS_DENIED"});
    if(error?.code==="23503")return res.status(400).json({error:"Invalid Project or currency reference."});
    return res.status(500).json(internalServerErrorPayload());
  }
});
app.patch("/api/v1/cash-advances/:id/decision",requireAuth,async(req:express.Request,res:express.Response)=>{
  const decision=req.body?.decision;
  if(decision!=="approved"&&decision!=="rejected")return res.status(400).json({error:"decision must be approved or rejected."});
  try{
    const {rows}=await req.db.query("SELECT id,project_id,requestor_id,approval_status FROM public.cash_advances WHERE id=$1::uuid",[req.params.id]);
    if(!rows.length)return res.status(404).json({error:"Cash Advance not found in an accessible Project."});
    const current=rows[0],permission=await findExplicitProjectPermission(req,current.project_id,["finance.update"]);
    if(!permission||permission.role_code!=="finance")return res.status(403).json({error:"Only an explicitly assigned Project Finance role may decide Cash Advances.",code:"FINANCE_DECISION_ROLE_REQUIRED"});
    if(!canDecideCashAdvance({actorId:req.user.id,requestorId:current.requestor_id,roleCode:permission.role_code,currentStatus:current.approval_status,decision}))
      return res.status(409).json({error:"Maker-checker or state-transition rule rejected this decision.",code:"CASH_ADVANCE_DECISION_CONFLICT"});
    await applyExplicitProjectPermissionContext(req,current.project_id,permission);
    const cashAdvance=await decideCashAdvance(req.db,{id:current.id,projectId:current.project_id,actorId:req.user.id,decision});
    if(!cashAdvance)return res.status(409).json({error:"Cash Advance changed; refresh before deciding.",code:"CASH_ADVANCE_STATE_CHANGED"});
    return res.json({cashAdvance});
  }catch(error:any){
    if(error?.code==="42501")return res.status(403).json({error:"Database maker-checker/RLS guard rejected this decision.",code:"CASH_ADVANCE_RLS_DENIED"});
    return res.status(500).json(internalServerErrorPayload());
  }
});

// Payment execution endpoints are intentionally out of scope. Finance is reporting-only.
const paymentExecutionOutOfScope = (_req: express.Request, res: express.Response) =>
  res.status(410).json({
    error: "Payment execution is outside this application's Finance scope.",
    code: "PAYMENT_EXECUTION_OUT_OF_SCOPE",
    available: false,
    financeScope: "reporting_only",
  });
app.get("/api/v1/payment-instructions", requireAuth, paymentExecutionOutOfScope);
app.post("/api/v1/payment-instructions", requireAuth, paymentExecutionOutOfScope);
app.patch("/api/v1/payment-instructions/:id", requireAuth, paymentExecutionOutOfScope);

// ============================================
// Export compliance document routes (P08)
// ============================================

// Regulatory sources
app.get("/api/v1/regulatory-sources", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      `SELECT id, source_id, title, issuing_authority, jurisdiction, document_type,
              regulation_number, article_annex_section, publication_date, effective_date,
              expiry_repeal_date, status, official_url, source_file_reference, source_checksum,
              date_retrieved, last_reviewed, reviewer_id, verification_status,
              created_at, updated_at
       FROM regulatory_sources ORDER BY created_at DESC LIMIT 200`,
    );
    res.json({ regulatorySources: rows.map((r: any) => ({
      id: r.id,
      sourceId: r.source_id,
      title: r.title,
      issuingAuthority: r.issuing_authority,
      jurisdiction: r.jurisdiction,
      documentType: r.document_type,
      regulationNumber: r.regulation_number,
      articleAnnexSection: r.article_annex_section,
      publicationDate: r.publication_date,
      effectiveDate: r.effective_date,
      expiryRepealDate: r.expiry_repeal_date,
      status: r.status,
      officialUrl: r.official_url,
      sourceFileReference: r.source_file_reference,
      sourceChecksum: r.source_checksum,
      dateRetrieved: r.date_retrieved,
      lastReviewed: r.last_reviewed,
      reviewerId: r.reviewer_id,
      verificationStatus: r.verification_status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load regulatory sources" });
  }
});

app.post("/api/v1/regulatory-sources", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { sourceId, title, issuingAuthority, jurisdiction, documentType, regulationNumber,
    articleAnnexSection, publicationDate, effectiveDate, expiryRepealDate, status,
    officialUrl, sourceFileReference, sourceChecksum, dateRetrieved, lastReviewed,
    verificationStatus } = req.body ?? {};
  if (!sourceId || !title || !issuingAuthority || !jurisdiction || !effectiveDate) {
    return res.status(400).json({ error: "Required fields: sourceId, title, issuingAuthority, jurisdiction, effectiveDate" });
  }
  try {
    const reviewerId = req.user?.id || null;
    const { rows } = await req.db.query(
      `INSERT INTO regulatory_sources (source_id, title, issuing_authority, jurisdiction,
        document_type, regulation_number, article_annex_section, publication_date,
        effective_date, expiry_repeal_date, status, official_url, source_file_reference,
        source_checksum, date_retrieved, last_reviewed, reviewer_id, verification_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [sourceId, title, issuingAuthority, jurisdiction, documentType || null, regulationNumber || null,
        articleAnnexSection || null, publicationDate || null, effectiveDate,
        expiryRepealDate || null, status || "draft", officialUrl || null,
        sourceFileReference || null, sourceChecksum || null, dateRetrieved || null,
        lastReviewed || null, reviewerId, verificationStatus || "pending"],
    );
    res.status(201).json({ regulatorySource: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create regulatory source" });
  }
});

// Export document types
// Export document types
// ============================================
app.get("/api/v1/export-document-types", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      "SELECT id, document_type_id, document_name, document_category, description, is_active, created_at, updated_at FROM export_document_types ORDER BY created_at DESC LIMIT 200",
    );
    res.json({ exportDocumentTypes: rows.map((r: any) => ({
      id: r.id,
      documentTypeId: r.document_type_id,
      documentName: r.document_name,
      documentCategory: r.document_category,
      description: r.description,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load export document types" });
  }
});

app.post("/api/v1/export-document-types", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { documentTypeId, documentName, documentCategory, description } = req.body ?? {};
  if (!documentTypeId || !documentName) {
    return res.status(400).json({ error: "Required fields: documentTypeId, documentName" });
  }
  try {
    const { rows } = await req.db.query(
      `INSERT INTO export_document_types (document_type_id, document_name, document_category, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [documentTypeId, documentName, documentCategory || null, description || null],
    );
    res.status(201).json({ documentType: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create export document type" });
  }
});

// Country export document requirements
app.get("/api/v1/country-export-document-requirements", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      `SELECT cdr.id, cdr.country_code, cdr.document_type_id, edt.document_name,
              cdr.importing_authority, cdr.mandatory, cdr.status, cdr.effective_from,
              cdr.effective_to, cdr.official_source_url, cdr.notes, cdr.last_verified_at,
              cdr.created_at, cdr.updated_at
       FROM country_export_document_requirements cdr
       JOIN export_document_types edt ON edt.id = cdr.document_type_id
       ORDER BY cdr.created_at DESC LIMIT 200`,
    );
    res.json({ countryExportDocumentRequirements: rows.map((r: any) => ({
      id: r.id,
      countryCode: r.country_code,
      documentTypeId: r.document_type_id,
      documentName: r.document_name,
      importingAuthority: r.importing_authority,
      mandatory: r.mandatory,
      status: r.status,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      officialSourceUrl: r.official_source_url,
      notes: r.notes,
      lastVerifiedAt: r.last_verified_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load country export document requirements" });
  }
});

app.post("/api/v1/country-export-document-requirements", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { countryCode, documentTypeId, importingAuthority, mandatory, status, effectiveFrom, effectiveTo, officialSourceUrl, notes } = req.body ?? {};
  if (!countryCode || !documentTypeId) {
    return res.status(400).json({ error: "Required fields: countryCode, documentTypeId" });
  }
  try {
    const { rows } = await req.db.query(
      `INSERT INTO country_export_document_requirements (country_code, document_type_id, importing_authority,
        mandatory, status, effective_from, effective_to, official_source_url, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [countryCode, documentTypeId, importingAuthority || null, mandatory !== undefined ? mandatory : true,
        status || "active", effectiveFrom || null, effectiveTo || null, officialSourceUrl || null, notes || null],
    );
    res.status(201).json({ countryRequirement: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create country export document requirement" });
  }
});

// Project export document requirements
app.get("/api/v1/project-export-document-requirements", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  if (!(await requireProjectPermission(req, res, projectId, "documents.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT per.id, per.project_id, per.country_requirement_id, per.is_required,
              per.status, per.override_reason, per.overridden_by, per.created_at, per.updated_at,
              cdr.country_code, cdr.document_type_id, edt.document_name, edt.document_category
       FROM project_export_document_requirements per
       JOIN country_export_document_requirements cdr ON cdr.id = per.country_requirement_id
       JOIN export_document_types edt ON edt.id = cdr.document_type_id
       WHERE per.project_id = $1::uuid
       ORDER BY per.created_at DESC LIMIT 200`,
      [projectId],
    );
    res.json({ projectDocumentRequirements: rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      countryRequirementId: r.country_requirement_id,
      countryCode: r.country_code,
      documentTypeId: r.document_type_id,
      documentName: r.document_name,
      documentCategory: r.document_category,
      isRequired: r.is_required,
      status: r.status,
      overrideReason: r.override_reason,
      overriddenBy: r.overridden_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load project export document requirements" });
  }
});

app.post("/api/v1/project-export-document-requirements", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, countryRequirementId, isRequired, status, overrideReason } = req.body ?? {};
  if (!projectId || !countryRequirementId) {
    return res.status(400).json({ error: "Required fields: projectId, countryRequirementId" });
  }
  if (!(await requireProjectPermission(req, res, String(projectId), "documents.create"))) return;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO project_export_document_requirements (project_id, country_requirement_id, is_required, status, override_reason)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5) RETURNING *`,
      [projectId, countryRequirementId, isRequired !== undefined ? isRequired : true, status || "required", overrideReason || null],
    );
    res.status(201).json({ projectDocumentRequirement: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create project export document requirement" });
  }
});

// Project export documents
app.get("/api/v1/project-export-documents", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  if (!(await requireProjectPermission(req, res, projectId, "documents.view"))) return;
  try {
    const { rows } = await req.db.query(
      `SELECT d.id, d.project_id, d.project_requirement_id, d.file_reference, d.object_key,
              d.original_filename, d.mime_type, d.sha256_checksum, d.version_no, d.status,
              d.uploaded_by, d.reviewed_by, d.uploaded_at, d.reviewed_at, d.expiry_date, d.notes,
              d.created_at, d.updated_at,
              per.country_requirement_id, cdr.country_code, edt.document_name
       FROM project_export_documents d
       JOIN project_export_document_requirements per ON per.id = d.project_requirement_id
       JOIN country_export_document_requirements cdr ON cdr.id = per.country_requirement_id
       JOIN export_document_types edt ON edt.id = cdr.document_type_id
       WHERE d.project_id = $1::uuid
       ORDER BY d.uploaded_at DESC LIMIT 200`,
      [projectId],
    );
    res.json({ projectExportDocuments: rows.map((r: any) => ({
      id: r.id, projectId: r.project_id, projectRequirementId: r.project_requirement_id,
      countryRequirementId: r.country_requirement_id, countryCode: r.country_code, documentName: r.document_name,
      fileReference: r.file_reference, objectKey: r.object_key, originalFilename: r.original_filename,
      mimeType: r.mime_type, sha256Checksum: r.sha256_checksum, versionNo: r.version_no, status: r.status,
      uploadedBy: r.uploaded_by, reviewedBy: r.reviewed_by, uploadedAt: r.uploaded_at, reviewedAt: r.reviewed_at,
      expiryDate: r.expiry_date, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to load project export documents" });
  }
});

app.post("/api/v1/project-export-documents", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, projectRequirementId, fileReference, objectKey, originalFilename,
    mimeType, sha256Checksum, versionNo, expiryDate, notes } = req.body ?? {};
  if (!projectId || !projectRequirementId || !fileReference || !objectKey || !originalFilename) {
    return res.status(400).json({ error: "Required fields: projectId, projectRequirementId, fileReference, objectKey, originalFilename" });
  }
  if (!(await requireProjectPermission(req, res, String(projectId), "documents.create"))) return;
  const key = String(objectKey);
  if (!key.startsWith(`projects/${projectId}/`)) {
    return res.status(400).json({ error: "Invalid object key namespace", code: "INVALID_OBJECT_KEY" });
  }
  try {
    const { rows: reqRows } = await req.db.query(
      "SELECT id FROM project_export_document_requirements WHERE id = $1::uuid AND project_id = $2::uuid",
      [projectRequirementId, projectId],
    );
    if (reqRows.length === 0) return res.status(404).json({ error: "Not found" });
    const { rows } = await req.db.query(
      `INSERT INTO project_export_documents (project_id, project_requirement_id, file_reference,
        object_key, original_filename, mime_type, sha256_checksum, version_no, expiry_date, notes,
        uploaded_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11::uuid, now(), now())
       RETURNING *`,
      [projectId, projectRequirementId, fileReference, key, originalFilename,
        mimeType || null, sha256Checksum || null, versionNo || 1, expiryDate || null,
        notes || null, req.user?.id || null],
    );
    res.status(201).json({ projectExportDocument: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create project export document" });
  }
});

app.patch("/api/v1/project-export-documents/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { status, notes } = req.body ?? {};
  if (!status) return res.status(400).json({ error: "Required field: status" });
  const allowed = ["uploaded", "under_review", "approved", "rejected", "expired", "superseded"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Allowed: ${allowed.join(", ")}` });
  }
  try {
    const { rows: existingRows } = await req.db.query(
      "SELECT id, project_id FROM project_export_documents WHERE id = $1::uuid",
      [req.params.id],
    );
    if (existingRows.length === 0) return res.status(404).json({ error: "Not found" });
    if (!(await requireProjectPermission(req, res, existingRows[0].project_id, "documents.update"))) return;
    const reviewerId = req.user?.id || null;
    const { rows } = await req.db.query(
      `UPDATE project_export_documents
       SET status = $1, notes = COALESCE($2, notes), reviewed_by = $3::uuid,
           reviewed_at = CASE WHEN $1 IN ('approved', 'rejected') THEN now() ELSE reviewed_at END,
           updated_at = now()
       WHERE id = $4::uuid RETURNING *`,
      [status, notes || null, reviewerId, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json({ document: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to update document" });
  }
});

// ============================================
// Notification routes (P11)
// ============================================

app.get("/api/v1/buyers/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM buyers WHERE id = $1::uuid", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Buyer not found" });
    res.json({ buyer: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to load buyer" });
  }
});

app.get("/api/v1/contracts/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows: scopeRows } = await req.db.query(
      "SELECT project_id FROM contracts WHERE id = $1::uuid AND project_id IS NOT NULL",
      [req.params.id],
    );
    if (scopeRows.length === 0) return res.status(404).json({ error: "Contract not found in an accessible Project." });
    const projectId = scopeRows[0].project_id;
    if (!(await requireProjectPermission(req, res, projectId, "contract.view"))) return;
    const { rows } = await req.db.query(
      "SELECT * FROM contracts WHERE id = $1::uuid AND project_id = $2::uuid",
      [req.params.id, projectId],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Contract not found in this Project." });
    return res.json({ contract: rows[0] });
  } catch (error) {
    return res.status(500).json(internalServerErrorPayload());
  }
});

// ============================================
// Admin routes
// ============================================
app.get("/api/v1/users", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      "SELECT user_id AS id, email, name, role, is_active, neon_auth_user_id, created_at, updated_at FROM public.pke_admin_list_users($1::integer, $2::integer)",
      [100, 0],
    );
    res.json({ users: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load users" });
  }
});

// Admin provisioning creates a PKE pending account first. The browser then uses the Neon SDK Admin
// createUser operation; only the signed user.created webhook may link the provider identity.
app.post("/api/v1/admin/users/provision", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  if (process.env.NEON_AUTH_ADMIN_PROVISIONING_READY !== "true" || process.env.NEON_AUTH_WEBHOOK_ENABLED !== "true") {
    return res.status(503).json({ error: "Admin provisioning is not enabled for this environment.", code: "PROVISIONING_NOT_READY" });
  }
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!email || !name || reason.length < 5) {
    return res.status(400).json({ error: "Email, name, and an audit reason of at least five characters are required.", code: "INVALID_PROVISION_INPUT" });
  }
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM public.pke_admin_provision_user($1::text, $2::text, $3::text)",
      [email, name, reason],
    );
    return res.status(201).json({ user: rows[0] });
  } catch (error: any) {
    const code = typeof error?.code === "string" ? error.code : "";
    if (code === "23505") return res.status(409).json({ error: "Email already belongs to an existing or linked PKE account.", code: "USER_ALREADY_EXISTS" });
    if (code === "22023") return res.status(400).json({ error: "Provisioning input is invalid.", code: "INVALID_PROVISION_INPUT" });
    if (code === "42501") return res.status(403).json({ error: "Platform Admin authorization is required.", code: "ADMIN_REQUIRED" });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/admin/projects/:projectId/members", requireAuth, requireAdmin, async (_req: express.Request, res: express.Response) => {
  return res.status(403).json({
    error: "Platform Admin may appoint or replace the Project Manager only. Project role staffing is decided by the PM.",
    code: "PLATFORM_ADMIN_PM_APPOINTMENT_ONLY",
  });
});

app.get("/api/v1/admin/projects/:projectId/pm-governance", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const projectId = req.params.projectId as string;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(projectId)) {
    return res.status(400).json({ error: "Valid Project id is required.", code: "INVALID_PROJECT_ID" });
  }
  try {
    const { rows: projectRows } = await req.db.query(
      "SELECT id, name, is_active FROM public.projects WHERE id = $1::uuid",
      [projectId],
    );
    if (projectRows.length !== 1) return res.status(404).json({ error: "Project not found.", code: "PROJECT_NOT_FOUND" });
    const { rows: members } = await req.db.query(
      `SELECT pm.id, pm.user_id, u.email, u.name, pm.is_active, pm.joined_at,
              pm.expires_at, pm.deactivated_at,
              COALESCE(assignments.roles, '[]'::jsonb) AS role_assignments
         FROM public.project_members pm
         JOIN public.users u ON u.id = pm.user_id
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(jsonb_build_object(
             'id', a.id, 'projectRoleId', a.project_role_id,
             'roleCode', pr.role_code, 'roleName', pr.name,
             'isActive', a.is_active, 'expiresAt', a.expires_at, 'revokedAt', a.revoked_at
           ) ORDER BY a.created_at DESC) AS roles
             FROM public.project_role_assignments a
             JOIN public.project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
            WHERE a.project_member_id = pm.id AND pr.role_code = 'pm'
         ) assignments ON true
        WHERE pm.project_id = $1::uuid
        ORDER BY u.email`,
      [projectId],
    );
    const { rows: roles } = await req.db.query(
      `SELECT id, role_code, name, description, is_active
         FROM public.project_roles
        WHERE project_id = $1::uuid AND role_code = 'pm'
        ORDER BY role_code`,
      [projectId],
    );
    return res.json({ project: projectRows[0], members, roles });
  } catch (error: any) {
    logger.error("Platform Admin PM governance read failed:", { code: error?.code || "UNKNOWN" });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/admin/projects/:projectId/pm-appointment", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;
  const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
  const replaceUserId = typeof req.body?.replaceUserId === "string" ? req.body.replaceUserId : "";
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(projectId) || !uuidPattern.test(userId) || (replaceUserId && !uuidPattern.test(replaceUserId)) || reason.length < 5) {
    return res.status(400).json({ error: "Valid Project, PM user and audit reason (at least 5 characters) are required.", code: "INVALID_PM_APPOINTMENT_INPUT" });
  }
  try {
    await req.db.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':pm-appointment', 0))",
      [projectId],
    );
    const { rows: projectRows } = await req.db.query(
      "SELECT id, name FROM public.projects WHERE id = $1::uuid AND is_active = true FOR UPDATE",
      [projectId],
    );
    if (projectRows.length !== 1) return res.status(404).json({ error: "Active Project not found.", code: "PROJECT_NOT_FOUND" });

    const { rows: userRows } = await req.db.query(
      "SELECT user_id, email, is_active, neon_auth_user_id FROM public.pke_admin_get_user($1::uuid)",
      [userId],
    );
    if (userRows.length !== 1) return res.status(404).json({ error: "PKE user not found.", code: "USER_NOT_FOUND" });
    if (userRows[0].is_active !== true || !userRows[0].neon_auth_user_id) {
      return res.status(409).json({ error: "PM must have an active PKE account and linked Neon Auth identity.", code: "PM_USER_NOT_READY" });
    }

    let { rows: pmRoleRows } = await req.db.query(
      "SELECT id FROM public.project_roles WHERE project_id = $1::uuid AND role_code = 'pm' AND is_active = true LIMIT 1 FOR UPDATE",
      [projectId],
    );
    if (pmRoleRows.length !== 1) {
      const pmTemplate = getCanonicalRoleTemplate("pm");
      if (!pmTemplate) return res.status(500).json({ error: "Canonical PM template is unavailable.", code: "PM_TEMPLATE_UNAVAILABLE" });
      const { rows: permissionRows } = await req.db.query(
        "SELECT id, code FROM public.permissions WHERE code = ANY($1::text[]) AND is_active = true",
        [pmTemplate.permissionCodes],
      );
      const found = new Set(permissionRows.map((row: any) => row.code));
      const missing = pmTemplate.permissionCodes.filter((code) => !found.has(code));
      if (missing.length) return res.status(503).json({ error: "PM template permission catalogue is incomplete.", code: "ROLE_TEMPLATE_PERMISSION_CATALOG_INCOMPLETE", missingPermissionCodes: missing });
      const { rows: created } = await req.db.query(
        `INSERT INTO public.project_roles
           (project_id, role_code, name, description, is_active, created_by, created_at, updated_at)
         VALUES ($1::uuid, 'pm', $2::text, $3::text, true, $4::uuid, now(), now())
         ON CONFLICT (project_id, role_code) DO UPDATE SET is_active = true, updated_at = now()
         RETURNING id`,
        [projectId, pmTemplate.label, pmTemplate.restrictions.join(" "), req.user?.id],
      );
      pmRoleRows = created;
      await req.db.query(
        `INSERT INTO public.project_role_permissions
           (project_id, project_role_id, permission_id, granted_by, granted_at)
         SELECT $1::uuid, $2::uuid, p.id, $3::uuid, now()
           FROM public.permissions p
          WHERE p.code = ANY($4::text[]) AND p.is_active = true
         ON CONFLICT (project_role_id, permission_id) DO NOTHING`,
        [projectId, pmRoleRows[0].id, req.user?.id, pmTemplate.permissionCodes],
      );
    }
    const pmRoleId = pmRoleRows[0].id;

    const { rows: currentRows } = await req.db.query(
      `SELECT pm.id AS member_id, a.id AS assignment_id, a.user_id,
              a.project_role_id, a.is_active, a.expires_at, u.email, pr.role_code
         FROM public.project_role_assignments a
         JOIN public.project_members pm ON pm.id = a.project_member_id
         JOIN public.project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
         JOIN public.users u ON u.id = a.user_id
        WHERE a.project_id = $1::uuid AND pr.role_code = 'pm'
          AND a.is_active = true AND a.revoked_at IS NULL
          AND (a.expires_at IS NULL OR a.expires_at > now())
          AND pm.is_active = true AND pm.deactivated_at IS NULL
          AND (pm.expires_at IS NULL OR pm.expires_at > now())
        FOR UPDATE OF a, pm`,
      [projectId],
    );
    const current = currentRows[0] ?? null;
    const pmDecision = evaluatePmAppointment(currentRows, userId, replaceUserId || null);
    if (pmDecision.ok === false) {
      if (pmDecision.code === "MULTIPLE_ACTIVE_PM_ASSIGNMENTS") {
        return res.status(409).json({ error: "More than one active PM exists; Admin must explicitly reconcile appointments before continuing.", code: pmDecision.code });
      }
      return res.status(409).json({
        error: "An active PM is already appointed. Supply its exact userId as replaceUserId to perform an audited handover.",
        code: pmDecision.code,
        currentPm: current ? { userId: current.user_id, email: current.email } : null,
      });
    }
    if (pmDecision.idempotent) {
      return res.status(200).json({ appointment: { projectId, userId, roleCode: "pm", status: "active" }, idempotentReplay: true });
    }

    const { rows: candidateMemberships } = await req.db.query(
      "SELECT id, project_role_id, is_active, deactivated_at, expires_at FROM public.project_members WHERE project_id = $1::uuid AND user_id = $2::uuid FOR UPDATE",
      [projectId, userId],
    );
    if (candidateMemberships.length > 1) return res.status(409).json({ error: "Duplicate Project membership requires reconciliation.", code: "DUPLICATE_PROJECT_MEMBERSHIP" });
    const candidateMembership = candidateMemberships[0] ?? null;
    // Existing membership and role assignments are independent; appointing PM must not replace another role.
    if (candidateMembership && (candidateMembership.is_active !== true || candidateMembership.deactivated_at != null ||
        (candidateMembership.expires_at && new Date(candidateMembership.expires_at).getTime() <= Date.now()))) {
      return res.status(409).json({ error: "Project membership is inactive or expired. Admin must explicitly reactivate membership before appointing this user as PM.", code: "MEMBERSHIP_REACTIVATION_REQUIRED" });
    }

    if (current && current.user_id !== userId) {
      const { rows: oldRows } = await req.db.query(
        `UPDATE public.project_role_assignments
            SET is_active = false, revoked_at = now(), revoked_by = $2::uuid,
                revoke_reason = $3::text, updated_at = now()
          WHERE id = $1::uuid AND revoked_at IS NULL RETURNING *`,
        [current.assignment_id, req.user?.id, reason],
      );
      await req.db.query(
        `INSERT INTO public.audit_events
           (actor_user_id, actor_type, actor_role, action, target_type, target_id, project_id,
            reason, before_snapshot, after_snapshot, metadata, outcome)
         VALUES ($1::uuid, 'user', 'platform_admin', 'project.pm.unappointed', 'project_pm_appointment',
                 $2::uuid, $3::uuid, $4::text, $5::jsonb, $6::jsonb, $7::jsonb, 'success')`,
        [req.user?.id, current.assignment_id, projectId, reason, JSON.stringify(current),
         JSON.stringify({ is_active: false, revoked_at: oldRows[0]?.revoked_at, revoked_by: oldRows[0]?.revoked_by }),
         JSON.stringify({ previousPmUserId: current.user_id, nextPmUserId: userId })],
      );
    }

    let appointed;
    if (candidateMembership) {
      appointed = candidateMembership;
    } else {
      const { rows } = await req.db.query(
        `INSERT INTO public.project_members
           (project_id, user_id, project_role_id, is_active, joined_at, updated_at)
         VALUES ($1::uuid, $2::uuid, NULL, true, now(), now()) RETURNING *`,
        [projectId, userId],
      );
      appointed = rows[0];
    }
    await req.db.query(
      `UPDATE public.project_role_assignments
          SET is_active = false, updated_at = now()
        WHERE project_id = $1::uuid AND project_member_id = $2::uuid
          AND project_role_id = $3::uuid AND is_active = true
          AND revoked_at IS NULL AND expires_at IS NOT NULL AND expires_at <= now()`,
      [projectId, appointed.id, pmRoleId],
    );
    const { rows: assignmentResult } = await req.db.query(
      `INSERT INTO public.project_role_assignments
         (project_id, project_member_id, user_id, project_role_id, is_active, assigned_at, assigned_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, true, now(), $5::uuid)
       RETURNING *`,
      [projectId, appointed.id, userId, pmRoleId, req.user?.id],
    );
    const pmAssignment = assignmentResult[0];
    await req.db.query(
      `INSERT INTO public.audit_events
         (actor_user_id, actor_type, actor_role, action, target_type, target_id, project_id,
          reason, before_snapshot, after_snapshot, metadata, outcome)
       VALUES ($1::uuid, 'user', 'platform_admin', 'project.pm.appointed', 'project_pm_appointment',
               $2::uuid, $3::uuid, $4::text, $5::jsonb, $6::jsonb, $7::jsonb, 'success')`,
      [req.user?.id, appointed.id, projectId, reason,
       candidateMembership ? JSON.stringify(candidateMembership) : null,
       JSON.stringify({ userId, projectRoleId: pmRoleId, assignmentId: pmAssignment.id, isActive: true }),
       JSON.stringify({ email: userRows[0].email, handoverFromUserId: current?.user_id ?? null })],
    );
    return res.status(current ? 200 : 201).json({
      appointment: { projectId, userId, email: userRows[0].email, projectRoleId: pmRoleId, status: "active" },
      handoverFromUserId: current?.user_id ?? null,
    });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "PM appointment conflicts with an existing Project membership.", code: "PM_APPOINTMENT_CONFLICT" });
    logger.error("Project PM appointment failed:", { code: error?.code || "UNKNOWN" });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/admin/projects/:projectId/pm-appointment/:userId/deactivate", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const projectId = req.params.projectId as string;
  const userId = req.params.userId as string;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(projectId) || !uuidPattern.test(userId) || reason.length < 5) {
    return res.status(400).json({ error: "Valid Project, PM user, and administrative reason are required.", code: "INVALID_PM_DEACTIVATION_INPUT" });
  }
  try {
    await req.db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':pm-appointment', 0))", [projectId]);
    const { rows: beforeRows } = await req.db.query(
      `SELECT a.*, pr.role_code
         FROM public.project_role_assignments a
         JOIN public.project_roles pr ON pr.id = a.project_role_id AND pr.project_id = a.project_id
        WHERE a.project_id = $1::uuid AND a.user_id = $2::uuid
          AND pr.role_code = 'pm' AND a.is_active = true AND a.revoked_at IS NULL
        FOR UPDATE OF a`,
      [projectId, userId],
    );
    if (beforeRows.length === 0) return res.status(404).json({ error: "No active PM assignment found for this user in the Project.", code: "ACTIVE_PM_ASSIGNMENT_NOT_FOUND" });
    const revoked = [];
    for (const before of beforeRows) {
      const { rows } = await req.db.query(
        `UPDATE public.project_role_assignments
            SET is_active = false, revoked_at = now(), revoked_by = $3::uuid,
                revoke_reason = $4::text, updated_at = now()
          WHERE id = $2::uuid AND project_id = $1::uuid AND revoked_at IS NULL
          RETURNING *`,
        [projectId, before.id, req.user?.id ?? null, reason],
      );
      if (rows[0]) {
        revoked.push(rows[0]);
        await req.db.query(
          `INSERT INTO public.audit_events
             (actor_user_id, actor_type, actor_role, action, target_type, target_id, project_id,
              reason, before_snapshot, after_snapshot, metadata, outcome)
           VALUES ($1::uuid, 'user', 'platform_admin', 'project.pm.deactivated', 'project_pm_assignment',
                   $2::uuid, $3::uuid, $4::text, $5::jsonb, $6::jsonb, $7::jsonb, 'success')`,
          [req.user?.id, before.id, projectId, reason, JSON.stringify(before), JSON.stringify(rows[0]),
           JSON.stringify({ pmUserId: userId, adminDecision: true })],
        );
      }
    }
    return res.json({ ok: true, deactivatedAssignments: revoked.length, assignments: revoked, membershipPreserved: true });
  } catch (error: any) {
    logger.error("Admin PM deactivation failed:", { code: error?.code || "UNKNOWN" });
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/admin/users/:id/status", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const userId = req.params.id as string;
  const isActive = req.body?.isActive;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) || typeof isActive !== "boolean" || reason.length < 5) {
    return res.status(400).json({ error: "Valid user id, isActive, and an audit reason are required.", code: "INVALID_USER_STATUS_INPUT" });
  }
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM public.pke_admin_set_user_active($1::uuid, $2::boolean, $3::text)",
      [userId, isActive, reason],
    );
    if (!rows.length) return res.status(404).json({ error: "PKE user not found.", code: "USER_NOT_FOUND" });
    return res.json({ user: rows[0] });
  } catch (error: any) {
    const code = typeof error?.code === "string" ? error.code : "";
    if (code === "P0002") return res.status(404).json({ error: "PKE user not found.", code: "USER_NOT_FOUND" });
    if (code === "23514" || code === "22023") return res.status(409).json({ error: "User is not eligible for this status change.", code: "USER_STATUS_CONFLICT" });
    if (code === "42501") return res.status(403).json({ error: "Platform Admin authorization is required.", code: "ADMIN_REQUIRED" });
    return res.status(500).json(internalServerErrorPayload());
  }
});

// Admin-initiated password reset (Neon Auth / Better Auth). Sends reset request for the target user's
// explicitly linked Neon Auth identity; never exposes or mutates password hashes and never infers by email.
app.post("/api/v1/admin/users/:id/password-reset", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const actorId = req.user?.id || null;
  const targetId = req.params.id;
  if (!targetId || typeof targetId !== "string") {
    return res.status(400).json({ error: "Invalid target user.", code: "INVALID_TARGET" });
  }
  let auditStatus: "succeeded" | "failed" = "failed";
  try {
    const { rows } = await req.db.query(
      "SELECT user_id AS id, email, neon_auth_user_id, is_active FROM public.pke_admin_get_user($1::uuid)",
      [targetId]
    );
    if (rows.length !== 1) {
      try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [targetId, actorId]); } catch {}
      return res.status(404).json({ error: "User not found.", code: "USER_NOT_FOUND" });
    }
    const target = rows[0];
    if (!target.neon_auth_user_id) {
      try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [target.id, actorId]); } catch {}
      return res.status(409).json({ error: "User is not linked to a verified Neon Auth identity.", code: "NEON_IDENTITY_NOT_LINKED" });
    }
    if (target.is_active !== true) {
      try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [target.id, actorId]); } catch {}
      return res.status(409).json({ error: "User account is inactive.", code: "USER_INACTIVE" });
    }

    const baseUrl = process.env.NEON_AUTH_BASE_URL;
    if (!baseUrl) {
      try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [target.id, actorId]); } catch {}
      return res.status(503).json({ error: "Password reset service is not configured.", code: "AUTH_NOT_CONFIGURED" });
    }
    let endpoint: URL;
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== "https:") throw new Error("HTTPS required");
      // Better Auth endpoint path (Neon Auth)
      endpoint = new URL("/request-password-reset", parsed.origin + parsed.pathname.replace(/\/$/, ""));
    } catch {
      try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [target.id, actorId]); } catch {}
      return res.status(503).json({ error: "Password reset service is not configured correctly.", code: "AUTH_NOT_CONFIGURED" });
    }

    const redirectToRaw = typeof req.body?.redirectTo === "string" ? req.body.redirectTo : "";
    const redirectTo = redirectToRaw && /^https?:\/\//i.test(redirectToRaw) ? redirectToRaw : undefined;
    const payload: Record<string, string> = { email: String(target.email || "").trim().toLowerCase() };
    if (redirectTo) payload.redirectTo = redirectTo;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let upstreamOk = false;
    try {
      const resp = await fetch(endpoint.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      // Treat 2xx as accepted; do not leak upstream details.
      upstreamOk = resp.ok;
    } catch {
      upstreamOk = false;
    } finally {
      clearTimeout(timeout);
    }

    auditStatus = upstreamOk ? "succeeded" : "failed";
    try {
      await req.db.query(
        `INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at)
         VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, $3::text, now(), now())`,
        [target.id, actorId, auditStatus]
      );
    } catch {}

    if (!upstreamOk) {
      return res.status(502).json({ error: "Permintaan reset password tidak dapat diproses saat ini.", code: "RESET_REQUEST_FAILED" });
    }
    return res.json({ ok: true, requested: true });
  } catch (error) {
    try { await req.db.query(`INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at) VALUES ('user', $1::uuid, 'password_reset_requested', $2::uuid, 'failed', now(), now())`, [targetId, actorId]); } catch {}
    return res.status(500).json({ error: "Failed to process password reset request.", code: "RESET_REQUEST_ERROR" });
  }
});

app.get("/api/v1/role-templates", requireAuth, async (_req: express.Request, res: express.Response) => {
  res.json({
    version: 1,
    templates: listProjectRoleTemplates(),
    note: "Template activation does not assign a user. Platform Admin appoints the PM; the appointed PM activates Project workstream templates.",
  });
});

app.post("/api/v1/projects/:id/role-templates/:roleCode/activate", requireAuth, async (req: express.Request, res: express.Response) => {
  const projectId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const roleCode = Array.isArray(req.params.roleCode) ? req.params.roleCode[0] : req.params.roleCode;
  const template = getCanonicalRoleTemplate(roleCode);
  if (!template || template.scope !== "project") {
    return res.status(404).json({ error: "Canonical Project role template not found.", code: "ROLE_TEMPLATE_NOT_FOUND" });
  }
  if (!(await requireProjectPermission(req, res, projectId, "project.roles.manage"))) return;
  try {
    const { rows: permissionRows } = await req.db.query(
      "SELECT id, code FROM public.permissions WHERE code = ANY($1::text[]) AND is_active = true",
      [template.permissionCodes],
    );
    const found = new Set(permissionRows.map((row: any) => row.code));
    const missing = template.permissionCodes.filter((code) => !found.has(code));
    if (missing.length > 0) {
      return res.status(503).json({
        error: "Role template cannot be activated until every canonical permission exists and is active.",
        code: "ROLE_TEMPLATE_PERMISSION_CATALOG_INCOMPLETE",
        missingPermissionCodes: missing,
      });
    }
    const { rows: roleRows } = await req.db.query(
      `INSERT INTO public.project_roles
         (project_id, role_code, name, description, is_active, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::text, $3::text, $4::text, true, $5::uuid, now(), now())
       ON CONFLICT (project_id, role_code)
       DO UPDATE SET is_active = true, name = EXCLUDED.name, description = EXCLUDED.description, updated_at = now()
       RETURNING *`,
      [projectId, template.code, template.label, template.restrictions.join(" "), req.user?.id],
    );
    const projectRole = roleRows[0];
    await req.db.query(
      `INSERT INTO public.project_role_permissions
         (project_id, project_role_id, permission_id, granted_by, granted_at)
       SELECT $1::uuid, $2::uuid, p.id, $3::uuid, now()
         FROM public.permissions p
        WHERE p.code = ANY($4::text[]) AND p.is_active = true
       ON CONFLICT (project_role_id, permission_id) DO NOTHING`,
      [projectId, projectRole.id, req.user?.id, template.permissionCodes],
    );
    // The allowlist is the canonical extension point for permissions added after the role template version.
    // This keeps newly activated roles in sync with UAT-validated P1 grants without widening beyond the allowlist.
    await req.db.query(
      `INSERT INTO public.project_role_permissions
         (project_id, project_role_id, permission_id, granted_by, granted_at)
       SELECT $1::uuid, $2::uuid, p.id, $3::uuid, now()
         FROM public.pke_project_role_permission_allowlist a
         JOIN public.permissions p ON p.code=a.permission_code AND p.is_active=true
        WHERE a.role_code=$4::text
       ON CONFLICT (project_role_id, permission_id) DO NOTHING`,
      [projectId, projectRole.id, req.user?.id, template.code],
    );
    const { rows: grantedRows } = await req.db.query(
      `SELECT p.code FROM public.project_role_permissions prp
       JOIN public.permissions p ON p.id=prp.permission_id
       WHERE prp.project_role_id=$1::uuid AND p.is_active=true ORDER BY p.code`,
      [projectRole.id],
    );
    return res.status(200).json({
      role: projectRole,
      activated: true,
      assignedUsers: 0,
      templateVersion: template.templateVersion,
      permissionCodes: grantedRows.map((row: any) => row.code),
    });
  } catch {
    return res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/roles", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM role_catalog WHERE is_active = true ORDER BY name");
    res.json({ roles: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load roles" });
  }
});

app.get("/api/v1/permissions", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM permissions WHERE is_active = true ORDER BY code");
    res.json({ permissions: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load permissions" });
  }
});

// Session revocation is performed by the Neon Auth Admin provider SDK in the Admin UI.
// Do not expose a database-only endpoint that would incorrectly deactivate the global PKE account.

// ============================================
// Privileged action audit (P03 Identity/RBAC)
// ============================================
app.get("/api/v1/audit/privileged-actions", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query(
      `SELECT ae.id, ae.entity_type, ae.entity_id, ae.action, ae.approved_by, u.email AS approved_by_email, ae.status, ae.created_at, ae.updated_at
         FROM approval_events ae
         LEFT JOIN users u ON u.id = ae.approved_by
        ORDER BY ae.created_at DESC LIMIT 100`,
    );
    res.json({ auditEvents: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load audit events" });
  }
});

app.post("/api/v1/audit/privileged-actions", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { entityType, entityId, action, status } = req.body ?? {};
  if (!entityType || !entityId || !action) {
    return res.status(400).json({ error: "Required fields: entityType, entityId, action" });
  }
  try {
    const { rows } = await req.db.query(
      `INSERT INTO approval_events (entity_type, entity_id, action, approved_by, status, created_at, updated_at)
       VALUES ($1::text, $2::uuid, $3::text, $4::uuid, $5::text, now(), now()) RETURNING *`,
      [entityType, entityId, action, req.user?.id || null, status || "pending"],
    );
    res.status(201).json({ auditEvent: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create audit event" });
  }
});


  // P1 project-scoped domain workflows — schema-gated and fail-closed where not provisioned.
  const p1Ready = async (req: express.Request, res: express.Response): Promise<boolean> => {
    const { rows } = await req.db.query("SELECT to_regclass('public.p1_domain_records') IS NOT NULL AS ready");
    if (!rows[0]?.ready) { res.status(503).json({error:"P1 workflow schema is not provisioned.",code:"P1_WORKFLOW_NOT_PROVISIONED"}); return false; }
    return true;
  };
  const p1DefaultOwner: Record<P1RecordType,string> = {
    purchase_requisition:"procurement",purchase_order:"procurement",supplier_commitment:"supplier",goods_receipt_match:"procurement",
    production_batch:"production_manager",packing_batch:"packing_supervisor",quality_sample:"qc_officer",quality_result:"laboratory_officer",
    qa_release:"qa_manager",hse_inspection:"hse_officer",hse_action:"hse_officer",dispatch_assignment:"transporter",
    vessel_call:"master_of_loading",loading_plan:"master_of_loading",loading_survey:"marine_surveyor",ship_master_ack:"ship_master",
    laytime_event:"master_of_loading",lc_record:"document_officer",lc_clause:"document_officer",lc_discrepancy:"document_officer",
    lc_presentation:"document_officer",audit_finding:"internal_auditor",audit_response:"internal_auditor",audit_closure:"internal_auditor",
  };
  const p1ExternalRoles: Partial<Record<P1RecordType,string[]>> = {
    supplier_commitment:["supplier"],dispatch_assignment:["transporter","driver"],vessel_call:["shipping_agent","terminal_representative"],
    loading_survey:["marine_surveyor"],ship_master_ack:["ship_master"],laytime_event:["shipping_agent"],
    lc_record:["shipping_agent"],lc_clause:["shipping_agent"],lc_discrepancy:["shipping_agent"],lc_presentation:["shipping_agent"],
  };
  const p1Permission = async (req: express.Request,type:P1RecordType,action:"view"|"create"|"update"|"manage_external"):Promise<string|null> => {
    const q=await req.db.query("SELECT public.p1_workflow_permission($1,$2) AS code",[type,action]);
    return typeof q.rows[0]?.code==="string"?q.rows[0].code:null;
  };
  const p1ReadPermission = async (req:express.Request,projectId:string,type:P1RecordType):Promise<string|null> => {
    if(type==="audit_finding"||type==="audit_response"){
      const q=await req.db.query("SELECT public.pke_has_project_permission($1::uuid,'audit.finding.view') AS auditor,public.pke_has_project_permission($1::uuid,'audit.finding.respond') AS owner",[projectId]);
      return q.rows[0]?.auditor?"audit.finding.view":q.rows[0]?.owner?"audit.finding.respond":null;
    }
    if(type==="hse_action"){
      const q=await req.db.query("SELECT public.pke_has_project_permission($1::uuid,'hse.action.view') AS viewer,public.pke_has_project_permission($1::uuid,'hse.action.respond') AS owner,public.pke_has_project_permission($1::uuid,'hse.action.manage') AS manager",[projectId]);
      return q.rows[0]?.viewer?"hse.action.view":q.rows[0]?.owner?"hse.action.respond":q.rows[0]?.manager?"hse.action.manage":null;
    }
    const view=await p1Permission(req,type,"view"),manage=await p1Permission(req,type,"manage_external");
    if(!view)return manage;
    const q=await req.db.query("SELECT public.pke_has_project_permission($1::uuid,$2) AS can_view,public.pke_has_project_permission($1::uuid,$3) AS can_manage",[projectId,view,manage]);
    return q.rows[0]?.can_view?view:q.rows[0]?.can_manage?manage:null;
  };
  const p1Roles = async (req: express.Request,projectId:string):Promise<string[]> => {
    const candidates=["pm","project_admin","platform_admin","finance","accounting","procurement","contract_manager","buyer","supplier","pks_site_manager",
      "production_manager","packing_supervisor","qc_officer","laboratory_officer","qa_manager","hse_officer",
      "transport_manager","dispatcher","transporter","driver","checker","master_of_loading","loading_manager",
      "loading_supervisor","loading_operator","marine_surveyor","ship_master","terminal_representative","shipping_agent",
      "document_officer","internal_auditor","warehouse","warehouse_manager","warehouse_officer","inventory_controller"];
    const q=await req.db.query(
      `SELECT r.role_code FROM unnest($2::text[]) AS r(role_code)
       WHERE public.p1_has_active_project_role_assignment($1::uuid,r.role_code,public.pke_current_user_id())`,
      [projectId,candidates]
    );
    return q.rows.map((row:any)=>String(row.role_code));
  };
  const p1Role = async (req: express.Request):Promise<string> => {
    const q=await req.db.query("SELECT current_setting('app.current_role',true) AS code");
    return String(q.rows[0]?.code??"");
  };
  const p1HasRole = async (req: express.Request,projectId:string,userId:string,roleCodes:string[]):Promise<boolean> => {
    for(const roleCode of roleCodes){
      const q=await req.db.query(
        "SELECT public.p1_has_active_project_role_assignment($1::uuid,$2::text,$3::uuid) AS active",
        [projectId,roleCode,userId]
      );
      if(q.rows[0]?.active) return true;
    }
    return false;
  };

  app.get("/api/v1/projects/:projectId/p1-workflows",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,type=String(req.query.recordType??"");
    if(!isP1RecordType(type)) return res.status(400).json({error:"recordType is required and must be valid."});
    try {
      if(!(await p1Ready(req,res))) return;
      const permission=await p1ReadPermission(req,projectId,type);
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const status=typeof req.query.status==="string"?req.query.status:null;
      const q=await req.db.query("SELECT * FROM public.p1_domain_records WHERE project_id=$1::uuid AND record_type=$2 AND ($3::text IS NULL OR status=$3) ORDER BY updated_at DESC LIMIT 200",[projectId,type,status]);
      return res.json({projectId,recordType:type,records:q.rows});
    } catch { return res.status(500).json(internalServerErrorPayload()); }
  });

  app.get("/api/v1/projects/:projectId/p1-workflows/:id/events",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,id=req.params.id as string;
    try{
      if(!(await p1Ready(req,res))) return;
      const record=await req.db.query("SELECT record_type FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid",[id,projectId]);
      if(record.rows.length!==1) return res.status(404).json({error:"P1 workflow record not found."});
      const permission=await p1ReadPermission(req,projectId,record.rows[0].record_type);
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const events=await req.db.query("SELECT * FROM public.p1_domain_events WHERE record_id=$1::uuid AND project_id=$2::uuid ORDER BY occurred_at ASC",[id,projectId]);
      return res.json({events:events.rows});
    }catch{return res.status(500).json(internalServerErrorPayload());}
  });

  app.get("/api/v1/projects/:projectId/p1-workflows/:id/evidence",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,id=req.params.id as string;
    try{
      if(!(await p1Ready(req,res))) return;
      const record=await req.db.query("SELECT record_type FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid",[id,projectId]);
      if(record.rows.length!==1) return res.status(404).json({error:"P1 workflow record not found."});
      const permission=await p1ReadPermission(req,projectId,record.rows[0].record_type);
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const evidence=await req.db.query(
        "SELECT id,evidence_type,object_key,storage_bucket,original_filename,mime_type,file_size_bytes,sha256_checksum,uploaded_by,uploaded_at,verified_by,verified_at,status FROM public.p1_domain_evidence WHERE record_id=$1::uuid AND project_id=$2::uuid ORDER BY uploaded_at DESC",
        [id,projectId]
      );
      return res.json({evidence:evidence.rows});
    }catch{return res.status(500).json(internalServerErrorPayload());}
  });

  app.post("/api/v1/projects/:projectId/p1-workflows",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,actorId=String(req.user?.id??""),b=req.body??{},type=b.recordType;
    if(!isP1RecordType(type)) return res.status(400).json({error:"Valid recordType is required."});
    const title=typeof b.title==="string"?b.title.trim():"",payload=b.payload&&typeof b.payload==="object"&&!Array.isArray(b.payload)?b.payload:{};
    const errors=validateP1Create(type,payload);
    if(title.length<3||title.length>240) errors.push("title must contain 3-240 characters");
    if(typeof b.idempotencyKey!=="string"||b.idempotencyKey.trim().length<12) errors.push("idempotencyKey must contain at least 12 characters");
    if(errors.length) return res.status(400).json({error:"P1 validation failed.",code:"P1_VALIDATION_FAILED",details:errors});
    try {
      if(!(await p1Ready(req,res))) return;
      const permission=await p1Permission(req,type,"create");
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const priorRequest=await req.db.query("SELECT * FROM public.p1_domain_records WHERE project_id=$1::uuid AND idempotency_key=$2",[projectId,b.idempotencyKey.trim()]);
      if(priorRequest.rows.length){
        const prior=priorRequest.rows[0];
        if(prior.record_type!==type||prior.title!==title||JSON.stringify(prior.payload)!==JSON.stringify(payload)) return res.status(409).json({error:"Idempotency key conflict.",code:"IDEMPOTENCY_KEY_CONFLICT"});
        return res.status(200).json({record:prior,idempotentReplay:true});
      }
      const roleCode=await p1Role(req);
      if(["purchase_requisition","purchase_order","supplier_commitment"].includes(type)&&!["procurement","contract_manager"].includes(roleCode)) return res.status(403).json({error:"Procurement record creation is restricted to Procurement/Contract Manager."});
      if(type==="audit_finding"&&roleCode!=="internal_auditor") return res.status(403).json({error:"Only Internal Auditor may create findings."});
      if(type==="audit_closure"&&roleCode!=="internal_auditor") return res.status(403).json({error:"Only Internal Auditor may initiate closure."});
      if(type==="qa_release"&&roleCode!=="qa_manager") return res.status(403).json({error:"Only QA Manager may create release decisions."});
      if(type==="loading_survey"&&roleCode!=="marine_surveyor") return res.status(403).json({error:"Only Marine Surveyor may submit surveys."});
      if(type==="ship_master_ack"&&roleCode!=="ship_master") return res.status(403).json({error:"Only Ship Master may submit acknowledgements."});
      if(["purchase_order","supplier_commitment","goods_receipt_match","quality_sample","quality_result","audit_response","audit_closure","lc_clause","lc_discrepancy","lc_presentation","qa_release","hse_action"].includes(type)&&!b.parentRecordId) return res.status(400).json({error:"parentRecordId is required for this workflow type."});
      let parentRecord:any=null;
      if(b.parentRecordId){
        const parent=await req.db.query("SELECT id,record_type,status,created_by,owner_role_code,parent_record_id,payload FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid",[b.parentRecordId,projectId]);
        if(parent.rows.length!==1) return res.status(422).json({error:"Parent record is not in the selected Project."});
        parentRecord=parent.rows[0];
        if(type==="purchase_order"&&(parent.rows[0].record_type!=="purchase_requisition"||parent.rows[0].status!=="approved")) return res.status(409).json({error:"Purchase Order requires an approved requisition."});
        if(type==="supplier_commitment"&&(parent.rows[0].record_type!=="purchase_order"||!["issued","acknowledged","partially_received"].includes(parent.rows[0].status)||String(payload.purchaseOrderRecordId)!==String(b.parentRecordId))) return res.status(409).json({error:"Supplier commitment must reference its issued parent PO."});
        if(type==="goods_receipt_match"&&(parent.rows[0].record_type!=="purchase_order"||String(payload.purchaseOrderRecordId)!==String(b.parentRecordId))) return res.status(422).json({error:"Three-way match must reference its parent Purchase Order."});
        if(type==="quality_sample"&&!["production_batch","packing_batch"].includes(parent.rows[0].record_type)) return res.status(422).json({error:"QC sample must reference a production or packing batch."});
        if(type==="quality_result"&&(parent.rows[0].record_type!=="quality_sample"||String(payload.sampleId)!==String(parent.rows[0].payload.sampleId))) return res.status(422).json({error:"Quality result must reference the sample record it evaluates."});
        if(type==="audit_response"&&(parent.rows[0].record_type!=="audit_finding"||String(payload.findingRecordId)!==String(b.parentRecordId)||!["open","responded"].includes(parent.rows[0].status)||!(await p1HasRole(req,projectId,actorId,[parent.rows[0].owner_role_code])))) return res.status(403).json({error:"Only the active finding owner role may respond to its parent finding."});
        if(type==="audit_response"&&(parent.rows[0].record_type!=="audit_finding"||!["open","responded"].includes(parent.rows[0].status)||!(await p1HasRole(req,projectId,actorId,[parent.rows[0].owner_role_code])))) return res.status(403).json({error:"Only the active finding owner role may respond."});
        if(type==="audit_closure"&&(parent.rows[0].record_type!=="audit_finding"||String(payload.findingRecordId)!==String(b.parentRecordId))) return res.status(422).json({error:"Audit closure must reference the same parent audit finding."});
        if(type==="qa_release"&&(!["production_batch","packing_batch"].includes(parent.rows[0].record_type)||String(payload.sourceRecordId)!==String(b.parentRecordId))) return res.status(422).json({error:"QA release must reference its production or packing source record."});
        if(type==="hse_action"&&(parent.rows[0].record_type!=="hse_inspection"||String(payload.findingRecordId)!==String(b.parentRecordId))) return res.status(422).json({error:"HSE corrective action must reference its parent HSE inspection."});
        if(type==="lc_clause"&&(parent.rows[0].record_type!=="lc_record"||String(payload.lcRecordId)!==String(b.parentRecordId))) return res.status(422).json({error:"LC clause must reference its parent LC record."});
        if(type==="lc_discrepancy"&&parent.rows[0].record_type!=="lc_record"&&parent.rows[0].record_type!=="lc_clause") return res.status(422).json({error:"LC discrepancy must reference an LC record or clause."});
        if(type==="lc_presentation"&&parent.rows[0].record_type!=="lc_record") return res.status(422).json({error:"LC presentation must reference an LC record."});
      }
      if(type==="goods_receipt_match"){
        const po=await req.db.query("SELECT id,status,payload FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid AND record_type='purchase_order'",[payload.purchaseOrderRecordId,projectId]);
        const inputs=await req.db.query("SELECT * FROM public.p1_get_three_way_match_inputs($1::uuid,$2::uuid,$3::uuid)",[projectId,payload.warehouseReceiptId,payload.apInvoiceId]);
        if(po.rows.length!==1||inputs.rows.length!==1||!["issued","acknowledged","partially_received","received"].includes(po.rows[0].status)||!["verified","partial"].includes(inputs.rows[0].receipt_status)) return res.status(422).json({error:"PO, verified same-Project GRN and AP invoice are required."});
        const pp=po.rows[0].payload??{},ii=inputs.rows[0],gg=inputs.rows[0];
        if(ii.invoice_purchase_order_id&&String(ii.invoice_purchase_order_id)!==String(payload.purchaseOrderRecordId)) return res.status(409).json({error:"AP invoice is linked to another PO."});
        if(ii.invoice_goods_receipt_id&&String(ii.invoice_goods_receipt_id)!==String(payload.warehouseReceiptId)) return res.status(409).json({error:"AP invoice is linked to another GRN."});
        const match=validateThreeWayMatch({
          po:{projectId,supplierId:String(pp.supplierId??""),currencyCode:String(pp.currencyCode??""),items:Array.isArray(pp.items)?pp.items:[]},
          receipt:{projectId,quantity:Number(gg.receipt_quantity),unitCode:String(gg.receipt_unit),supplierId:null},
          invoice:{projectId,supplierId:String(ii.invoice_supplier_id),currencyCode:String(ii.invoice_currency_code),totalAmount:Number(ii.invoice_total_amount)},
          matchedQuantity:Number(payload.matchedQuantity),matchedAmount:Number(payload.matchedAmount),unitCode:String(payload.unitCode),currencyCode:String(payload.currencyCode),
        });
        if(!match.ok) return res.status(409).json({error:"Three-way match rejected.",code:match.reason});
      }
      if(type==="loading_survey"){
        const key=String(payload.certificateObjectKey??""),checksum=String(payload.sha256Checksum??""),size=Number(payload.certificateFileSizeBytes);
        const storage=privateStorage.status();
        if(!key.startsWith(`projects/${projectId}/`)||!storage.available||storage.bucket!=="pke-private-documents") return res.status(400).json({error:"Survey certificate must be stored in the Project private bucket.",code:"SURVEY_CERTIFICATE_STORAGE_INVALID"});
        try{await privateStorage.verifyObject(key,size,checksum);}catch{return res.status(422).json({error:"Survey certificate object checksum or size verification failed.",code:"SURVEY_CERTIFICATE_VERIFICATION_FAILED"});}
      }
      if(type==="production_batch"){
        if(b.sourceEntityType!=="production_batches"||!b.sourceEntityId) return res.status(400).json({error:"Production batch must link an existing production_batches row."});
        const q=await req.db.query("SELECT id FROM public.production_batches WHERE id=$1::uuid AND project_id=$2::uuid",[b.sourceEntityId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Production batch source is outside this Project."});
      }
      if(type==="packing_batch"){
        if(b.sourceEntityType!=="packing_batches"||!b.sourceEntityId) return res.status(400).json({error:"Packing batch must link an existing packing_batches row."});
        const q=await req.db.query("SELECT id FROM public.packing_batches WHERE id=$1::uuid AND project_id=$2::uuid",[b.sourceEntityId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Packing batch source is outside this Project."});
      }
      if(type==="quality_sample"){
        const q=payload.sampleId
          ? await req.db.query("SELECT id FROM public.product_quality_samples WHERE id=$1::uuid AND project_id=$2::uuid",[payload.sampleId,projectId])
          : await req.db.query("SELECT id FROM public.product_quality_samples WHERE sample_number=$1 AND project_id=$2::uuid",[payload.sampleNumber,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Quality sample must reference a same-Project sample."});
        payload.sampleId=String(q.rows[0].id);
      }
      if(type==="quality_result"){
        const q=await req.db.query("SELECT id FROM public.product_quality_samples WHERE id=$1::uuid AND project_id=$2::uuid",[payload.sampleId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Quality result sample is outside this Project."});
      }
      if(type==="dispatch_assignment"){
        const q=await req.db.query("SELECT id,vehicle_id FROM public.truck_trips WHERE id=$1::uuid AND project_id=$2::uuid",[payload.tripId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Dispatch assignment must reference a same-Project truck trip."});
        if(q.rows[0].vehicle_id&&String(q.rows[0].vehicle_id)!==String(payload.vehicleId)) return res.status(409).json({error:"Dispatch vehicle does not match the registered truck trip vehicle."});
        if(!await p1HasRole(req,projectId,String(payload.driverUserId),["driver"])) return res.status(422).json({error:"Dispatch driver must hold an active Driver Project role."});
      }
      if(type==="vessel_call"||type==="ship_master_ack"||type==="laytime_event"){
        const voyageId=String(payload.voyageId??"");
        const q=await req.db.query("SELECT id,vessel_id,port_id,origin_port_id,destination_port_id FROM public.voyages WHERE id=$1::uuid AND project_id=$2::uuid",[voyageId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Vessel workflow must reference a same-Project voyage."});
        if(type==="vessel_call"&&String(q.rows[0].vessel_id)!==String(payload.vesselId)) return res.status(422).json({error:"Vessel call vessel must match the Project voyage."});
        if(type==="vessel_call"&&![q.rows[0].port_id,q.rows[0].origin_port_id,q.rows[0].destination_port_id].filter(Boolean).map(String).includes(String(payload.portId))) return res.status(422).json({error:"Vessel call port must match the Project voyage route."});
      }
      if(type==="loading_plan"||type==="loading_survey"){
        const opId=String(payload.loadingOperationId??"");
        const q=await req.db.query("SELECT id,quantity FROM public.loading_operations WHERE id=$1::uuid AND project_id=$2::uuid",[opId,projectId]);
        if(!q.rows.length) return res.status(422).json({error:"Loading operation is outside this Project."});
        if(type==="loading_plan"){
          const shipment=await req.db.query("SELECT quantity FROM public.shipments WHERE id=$1::uuid AND project_id=$2::uuid",[payload.shipmentId,projectId]);
          if(!shipment.rows.length||Number(payload.plannedQuantity)>Number(shipment.rows[0].quantity)) return res.status(422).json({error:"Loading plan must reference a same-Project shipment and not exceed shipment quantity."});
        }
        if(type==="loading_survey"&&Number(payload.surveyedQuantity)>Number(q.rows[0].quantity)) return res.status(422).json({error:"Surveyed quantity cannot exceed the loading operation quantity."});
      }
      if(type==="lc_record"){
        const q=await req.db.query("SELECT id FROM public.p1_domain_records WHERE project_id=$1::uuid AND record_type='lc_record' AND payload->>'lcNumber'=$2 LIMIT 1",[projectId,payload.lcNumber]);
        if(q.rows.length) return res.status(409).json({error:"LC number already exists in this Project.",code:"DUPLICATE_LC_NUMBER"});
      }
      if(type==="lc_clause"&&String(payload.lcRecordId)!==String(parentRecord?.id??"")) return res.status(422).json({error:"LC clause must reference its parent LC record."});
      if(type==="lc_discrepancy"&&parentRecord?.record_type==="lc_clause"&&(String(payload.clauseRecordId)!==String(parentRecord.id)||String(payload.lcRecordId)!==String(parentRecord.parent_record_id))) return res.status(422).json({error:"LC discrepancy clause and LC references must match the parent clause."});
      if(type==="lc_discrepancy"&&parentRecord?.record_type==="lc_record"&&String(payload.lcRecordId)!==String(parentRecord.id)) return res.status(422).json({error:"LC discrepancy must reference its parent LC record."});
      if(type==="lc_presentation"){
        const lcId=String(payload.lcRecordId??"");
        if(lcId!==String(parentRecord?.id??"")||parentRecord?.record_type!=="lc_record"||!["issued","acknowledged"].includes(parentRecord.status)) return res.status(409).json({error:"LC presentation requires an issued, same-Project LC record."});
        const clauses=await req.db.query("SELECT payload,status FROM public.p1_domain_records WHERE project_id=$1::uuid AND parent_record_id=$2::uuid AND record_type='lc_clause'",[projectId,lcId]);
        if(!clauses.rows.length||clauses.rows.some((x:any)=>x.status!=="accepted")) return res.status(409).json({error:"All LC clauses must be reviewed and accepted before presentation.",code:"LC_CLAUSES_NOT_READY"});
        const selections=payload.documentSelections as Array<{documentRecordId:string;clauseCode:string;copyType:"original"|"copy"}>;
        const ids=[...new Set(selections.map(x=>x.documentRecordId))];
        const docs=await req.db.query("SELECT id,document_type_code,status,expiry_date,sha256_checksum,object_key,storage_bucket,file_size_bytes,upload_verified_at FROM public.project_export_documents WHERE project_id=$1::uuid AND id=ANY($2::uuid[])",[projectId,ids]);
        if(docs.rows.length!==ids.length) return res.status(422).json({error:"Every presented document must exist in the same Project."});
        const expired=docs.rows.some((d:any)=>d.status!=="approved"||!d.sha256_checksum||!d.object_key||!d.upload_verified_at||!d.file_size_bytes||d.storage_bucket!=="pke-private-documents"||(d.expiry_date&&new Date(d.expiry_date)<new Date()));
        const required=clauses.rows.map((x:any)=>String(x.payload.clauseCode));
        const supplied=[...new Set(selections.map(x=>x.clauseCode))];
        const checklist=validateLcPresentation(required,supplied,expired);
        if(!checklist.ok) return res.status(409).json({error:"LC presentation checklist is incomplete or contains invalid/expired evidence.",code:"LC_PRESENTATION_INCOMPLETE",missing:checklist.missing});
        for(const clause of clauses.rows){
          const code=String(clause.payload.clauseCode),matches=selections.filter(x=>x.clauseCode===code);
          const docType=String(clause.payload.documentTypeCode);
          if(matches.some(x=>docs.rows.find((d:any)=>d.id===x.documentRecordId)?.document_type_code!==docType)) return res.status(409).json({error:"Presented document type does not satisfy the LC clause.",code:"LC_DOCUMENT_TYPE_MISMATCH",clauseCode:code});
          if(matches.filter(x=>x.copyType==="original").length<Number(clause.payload.requiredOriginals??0)||matches.filter(x=>x.copyType==="copy").length<Number(clause.payload.requiredCopies??0)) return res.status(409).json({error:"LC original/copy count is below the clause requirement.",code:"LC_DOCUMENT_COUNT_MISMATCH",clauseCode:code});
        }
      }
      if(type==="laytime_event"){
        const calc=calculateLaytime({allowedHours:Number(payload.allowedHours),startAt:String(payload.startAt),endAt:String(payload.endAt),excludedHours:Number(payload.excludedHours??0)});
        if(!calc.valid) return res.status(400).json({error:"Invalid laytime interval or allowance.",code:"INVALID_LAYTIME"});
        const overlap=await req.db.query(
          `SELECT 1 FROM public.p1_domain_records
           WHERE project_id=$1::uuid AND record_type='laytime_event'
             AND payload->>'voyageId'=$2
             AND tstzrange((payload->>'startAt')::timestamptz,(payload->>'endAt')::timestamptz,'[)')
                 && tstzrange($3::timestamptz,$4::timestamptz,'[)')
           LIMIT 1`,[projectId,payload.voyageId,payload.startAt,payload.endAt]);
        if(overlap.rows.length) return res.status(409).json({error:"Laytime interval overlaps an existing event for this voyage.",code:"LAYTIME_INTERVAL_OVERLAP"});
        payload.laytimeImpactHours=calc.usedHours;
        payload.laytimeOverrunHours=calc.overrunHours;
      }
      if(type==="qa_release"){
        const source=await req.db.query("SELECT created_by FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid AND record_type IN ('production_batch','packing_batch')",[payload.sourceRecordId,projectId]);
        if(source.rows.length!==1||String(payload.sourceRecordId)!==String(b.parentRecordId)||source.rows[0].created_by===actorId) return res.status(409).json({error:"QA release requires an independent actor and production/packing source.",code:"QA_INDEPENDENCE_REQUIRED"});
        const quality=await req.db.query(
          `SELECT 1 FROM public.p1_domain_records s JOIN public.p1_domain_records r ON r.parent_record_id=s.id AND r.project_id=s.project_id
           WHERE s.project_id=$1::uuid AND s.parent_record_id=$2::uuid AND s.record_type='quality_sample' AND s.status='verified'
             AND r.record_type='quality_result' AND r.status='accepted' LIMIT 1`,[projectId,payload.sourceRecordId]);
        if(!quality.rows.length) return res.status(409).json({error:"QA release requires at least one verified QC sample with an accepted laboratory result.",code:"QA_QUALITY_EVIDENCE_REQUIRED"});
      }
      if(type==="audit_closure"){
        const fid=String(payload.findingRecordId??"");
        const finding=await req.db.query("SELECT created_by FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid AND record_type='audit_finding'",[fid,projectId]);
        const response=await req.db.query("SELECT created_by FROM public.p1_domain_records WHERE parent_record_id=$1::uuid AND project_id=$2::uuid AND record_type='audit_response' ORDER BY created_at DESC LIMIT 1",[fid,projectId]);
        if(finding.rows.length!==1||!response.rows.length||!canCloseAuditFinding(actorId,finding.rows[0].created_by,response.rows[0].created_by,roleCode)) return res.status(409).json({error:"Audit closure requires independent Internal Auditor verification after owner response.",code:"AUDIT_CLOSURE_INDEPENDENCE_REQUIRED"});
      }
      const external=b.externalScopeUserId?String(b.externalScopeUserId):null;
      let externalRoleCode:string|null=null;
      if(external){
        const allowed=p1ExternalRoles[type]??[];
        for(const candidateRole of allowed){
          const extRole=await req.db.query(
            "SELECT public.p1_has_active_project_role_assignment($1::uuid,$2::text,$3::uuid) AS active",
            [projectId,candidateRole,external]
          );
          if(extRole.rows[0]?.active){externalRoleCode=candidateRole;break;}
        }
        if(!externalRoleCode) return res.status(422).json({error:"External scope must match an active external Project assignment."});
      }
      const ownerRoleCode=typeof b.ownerRoleCode==="string"?b.ownerRoleCode:
        type==="audit_finding"?String(payload.ownerRoleCode):
        type==="audit_response"?String(parentRecord?.owner_role_code??""):
        type==="hse_action"?String(payload.actionOwnerRoleCode??""):
        externalRoleCode??p1DefaultOwner[type];
      const owner=await req.db.query(
        "SELECT public.p1_has_active_project_role_assignment($1::uuid,$2::text,NULL::uuid) AS active",
        [projectId,ownerRoleCode]
      );
      if(!owner.rows[0]?.active) return res.status(422).json({error:"ownerRoleCode must have an active assignee in this Project.",code:"P1_OWNER_ROLE_UNASSIGNED"});
      let assignee=b.assigneeUserId?String(b.assigneeUserId):null;
      if(external&&!assignee) assignee=external;
      if(assignee&&!await p1HasRole(req,projectId,assignee,[ownerRoleCode])) return res.status(422).json({error:"Assignee must hold the selected active Project role."});
      if(external&&assignee!==external) return res.status(422).json({error:"External scope and assignee must be the same user."});
      if(["supplier_commitment","dispatch_assignment","loading_survey","ship_master_ack"].includes(type)&&!external) return res.status(422).json({error:"This workflow requires an explicitly assigned external Project user.",code:"EXTERNAL_ASSIGNMENT_REQUIRED"});
      const dueAt=b.dueAt?new Date(b.dueAt):null;
      if(b.dueAt&&Number.isNaN(dueAt!.getTime())) return res.status(400).json({error:"Invalid dueAt."});
      const effectiveParentId=b.parentRecordId??(type==="goods_receipt_match"?payload.purchaseOrderRecordId:null);
      const ins=await req.db.query(
        `INSERT INTO public.p1_domain_records(project_id,record_type,record_code,parent_record_id,source_entity_type,source_entity_id,title,payload,status,owner_role_code,assignee_user_id,external_scope_user_id,created_by,updated_by,due_at,idempotency_key)
         VALUES($1::uuid,$2,COALESCE(NULLIF($3,''),'P1-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),$4::uuid,$5,$6::uuid,$7,$8::jsonb,$9,$10,$11::uuid,$12::uuid,$13::uuid,$13::uuid,$14::timestamptz,$15)
         ON CONFLICT (project_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING *`,
        [projectId,type,b.recordCode??"",effectiveParentId,b.sourceEntityType??null,b.sourceEntityId??null,title,JSON.stringify(payload),initialP1Status(type),ownerRoleCode,assignee,external,actorId,dueAt,b.idempotencyKey.trim()]);
      if(!ins.rows.length){
        const prior=await req.db.query("SELECT * FROM public.p1_domain_records WHERE project_id=$1::uuid AND idempotency_key=$2",[projectId,b.idempotencyKey.trim()]);
        if(prior.rows.length!==1||prior.rows[0].record_type!==type||prior.rows[0].title!==title||JSON.stringify(prior.rows[0].payload)!==JSON.stringify(payload)) return res.status(409).json({error:"Idempotency key conflict.",code:"IDEMPOTENCY_KEY_CONFLICT"});
        return res.status(200).json({record:prior.rows[0],idempotentReplay:true});
      }
      const currentRole=await p1Role(req);
      await req.db.query("INSERT INTO public.p1_domain_events(record_id,project_id,event_type,actor_user_id,actor_role_code,payload) VALUES($1::uuid,$2::uuid,'created',$3::uuid,$4,$5::jsonb)",[ins.rows[0].id,projectId,actorId,currentRole,JSON.stringify({recordType:type})]);
      return res.status(201).json({record:ins.rows[0],idempotentReplay:false});
    } catch { return res.status(500).json(internalServerErrorPayload()); }
  });

  app.patch("/api/v1/projects/:projectId/p1-workflows/:id/transition",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,id=req.params.id as string,actorId=String(req.user?.id??""),b=req.body??{};
    if(typeof b.status!=="string") return res.status(400).json({error:"status is required."});
    try {
      if(!(await p1Ready(req,res))) return;
      const found=await req.db.query("SELECT * FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid FOR UPDATE",[id,projectId]);
      if(found.rows.length!==1) return res.status(404).json({error:"P1 workflow record not found."});
      const record=found.rows[0];
      if(!isP1RecordType(record.record_type)) return res.status(409).json({error:"Unsupported stored workflow type."});
      const to=b.status as P1Status;
      const permission=record.record_type==="loading_survey"&&["accepted","rejected"].includes(to)
        ?"shipping.update"
        :record.record_type==="laytime_event"&&to==="verified"?"shipping.update"
        :await p1Permission(req,record.record_type,"update");
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const from=record.status as P1Status;
      if(!validateP1Transition(record.record_type,from,to)) return res.status(409).json({error:"Invalid status transition.",code:"INVALID_P1_TRANSITION",from,to});
      if(["rejected","held","blocked","cancelled","discrepancy"].includes(to)&&String(b.reason??"").trim().length<5) return res.status(400).json({error:"A reason of at least 5 characters is required."});
      if(record.record_type==="purchase_order"&&to==="approved"){
        if(!(await requireProjectPermission(req,res,projectId,"procurement.po.approve"))) return;
        if(!canApprovePurchaseOrder(actorId,record.created_by,await p1Role(req))) return res.status(403).json({error:"PO approval requires an independent Procurement/Contract Manager.",code:"MAKER_CHECKER_REQUIRED"});
      }
      if(record.record_type==="qa_release"&&(to==="released"||to==="held")){
        if(!(await requireProjectPermission(req,res,projectId,"quality.release.decide"))) return;
        const source=await req.db.query("SELECT created_by FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid",[record.payload.sourceRecordId,projectId]);
        if(source.rows.length!==1||!canDecideQaRelease(actorId,source.rows[0].created_by,await p1Role(req))) return res.status(403).json({error:"QA release requires an independent QA Manager."});
      }
      if(record.record_type==="audit_finding"&&(to==="verified"||to==="closed")){
        if(!(await requireProjectPermission(req,res,projectId,"audit.finding.close"))) return;
        const response=await req.db.query("SELECT created_by,status FROM public.p1_domain_records WHERE parent_record_id=$1::uuid AND project_id=$2::uuid AND record_type='audit_response' ORDER BY created_at DESC LIMIT 1",[id,projectId]);
        if(!response.rows.length||!canCloseAuditFinding(actorId,record.created_by,response.rows[0].created_by,await p1Role(req))||(to==="closed"&&response.rows[0].status!=="verified")) return res.status(403).json({error:"Finding verification/closure requires an independent Internal Auditor after a verified owner response.",code:"AUDIT_CLOSURE_INDEPENDENCE_REQUIRED"});
      }
      const roleCode=await p1Role(req);
      if(record.record_type==="supplier_commitment"&&to==="acknowledged"&&roleCode!=="supplier") return res.status(403).json({error:"Only the assigned Supplier may acknowledge the commitment."});
      if(record.record_type==="ship_master_ack"&&to==="acknowledged"&&roleCode!=="ship_master") return res.status(403).json({error:"Only Ship Master may acknowledge."});
      if(record.record_type==="loading_survey"&&to==="submitted"&&roleCode!=="marine_surveyor") return res.status(403).json({error:"Only Marine Surveyor may submit the survey."});
      if(record.record_type==="loading_survey"&&["accepted","rejected"].includes(to)){
        if(!["master_of_loading","loading_supervisor"].includes(roleCode)||actorId===record.created_by) return res.status(403).json({error:"Survey acceptance/rejection requires an independent Master of Loading or Loading Supervisor."});
      }
      if(record.record_type==="hse_action"&&to==="verified"){
        if(!(await requireProjectPermission(req,res,projectId,"hse.action.manage"))||roleCode!=="hse_officer"||actorId===record.created_by||actorId===record.assignee_user_id) return res.status(403).json({error:"HSE action verification requires an independent HSE Officer.",code:"HSE_VERIFICATION_INDEPENDENCE_REQUIRED"});
      }
      if(record.record_type==="dispatch_assignment"&&["acknowledged","in_progress","completed"].includes(to)&&["transporter","driver"].includes(roleCode)&&record.external_scope_user_id!==actorId) return res.status(403).json({error:"External dispatch updates are restricted to the assigned user."});
      if(record.record_type==="audit_response"&&to==="submitted"){
        const finding=await req.db.query("SELECT owner_role_code FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid AND record_type='audit_finding'",[record.parent_record_id]);
        if(finding.rows.length!==1||!await p1HasRole(req,projectId,actorId,[finding.rows[0].owner_role_code])) return res.status(403).json({error:"Only finding owner role may submit the response."});
      }
      if(record.record_type==="lc_presentation"&&(to==="accepted"||to==="discrepancy")){
        if(!b.transitionData?.bankAcknowledgementReference||String(b.transitionData.bankAcknowledgementReference).trim().length<3||!b.transitionData?.bankAcknowledgementEvidenceId) return res.status(409).json({error:"Bank acknowledgement reference and evidence are required before recording LC presentation outcome."});
        const bankEvidence=await req.db.query("SELECT id FROM public.p1_domain_evidence WHERE id=$1::uuid AND record_id=$2::uuid AND project_id=$3::uuid AND status IN ('uploaded','verified')",[b.transitionData.bankAcknowledgementEvidenceId,id,projectId]);
        if(!bankEvidence.rows.length) return res.status(409).json({error:"Bank acknowledgement evidence must be attached to this LC presentation."});
      }
      if(record.record_type==="lc_record"&&to==="issued"&&roleCode!=="document_officer") return res.status(403).json({error:"Only Document Officer may record issuance of an LC."});
      if(record.record_type==="loading_plan"&&to==="approved"&&roleCode!=="master_of_loading") return res.status(403).json({error:"Only Master of Loading may approve the shore-side loading plan."});
      if(record.record_type==="laytime_event"&&to==="verified"&&(roleCode!=="master_of_loading"||actorId===record.created_by)) return res.status(403).json({error:"Laytime verification requires a different Master of Loading actor."});
      const data=b.transitionData&&typeof b.transitionData==="object"?b.transitionData:{};
      const update=await req.db.query(
        `UPDATE public.p1_domain_records SET status=$1,updated_by=$2::uuid,updated_at=now(),version=version+1,payload=payload||$3::jsonb,
         closed_at=CASE WHEN $1='closed' THEN now() WHEN $1 IN ('open','responded','verified') THEN NULL ELSE closed_at END,
         closed_by=CASE WHEN $1='closed' THEN $2::uuid WHEN $1 IN ('open','responded','verified') THEN NULL ELSE closed_by END
         WHERE id=$4::uuid AND project_id=$5::uuid AND version=$6 RETURNING *`,
        [to,actorId,JSON.stringify(data),id,projectId,b.expectedVersion??record.version]);
      if(update.rows.length!==1) return res.status(409).json({error:"Record changed concurrently; reload and retry.",code:"P1_VERSION_CONFLICT"});
      const eventType:Record<string,string>={submitted:"submitted",approved:"approved",issued:"issued",acknowledged:"acknowledged",in_progress:"started",blocked:"blocked",partially_received:"updated",received:"completed",matched:"matched",held:"held",released:"released",rejected:"rejected",completed:"completed",cancelled:"cancelled",open:"created",responded:"responded",verified:"verified",closed:"closed",presented:"presented",accepted:"accepted",discrepancy:"discrepancy",expired:"updated"};
      await req.db.query("INSERT INTO public.p1_domain_events(record_id,project_id,event_type,actor_user_id,actor_role_code,reason,payload) VALUES($1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7::jsonb)",[id,projectId,eventType[to]??"updated",actorId,roleCode,b.reason??null,JSON.stringify({from,to,version:update.rows[0].version,...data})]);
      return res.json({record:update.rows[0]});
    } catch { return res.status(500).json(internalServerErrorPayload()); }
  });

  app.post("/api/v1/projects/:projectId/p1-workflows/:id/evidence",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string,id=req.params.id as string,actorId=String(req.user?.id??""),b=req.body??{};
    const evidenceKey=String(b.objectKey??""),evidenceSha=String(b.sha256Checksum??""),evidenceBucket=String(b.storageBucket??"pke-private-documents"),evidenceSize=Number(b.fileSizeBytes);
    if(!validateP1Evidence({objectKey:evidenceKey,sha256:evidenceSha,bucket:evidenceBucket,sizeBytes:evidenceSize})||!Number.isSafeInteger(evidenceSize)||evidenceSize<=0) return res.status(400).json({error:"Evidence requires private bucket, valid SHA-256 and verified file size <=50 MB."});
    if(!evidenceKey.startsWith(`projects/${projectId}/`)) return res.status(400).json({error:"Evidence object key must be namespaced to the selected Project.",code:"INVALID_OBJECT_KEY"});
    const storageStatus=privateStorage.status();
    if(!storageStatus.available||storageStatus.bucket!==evidenceBucket) return res.status(503).json({error:"Private object storage is unavailable or bucket does not match.",code:"STORAGE_UNAVAILABLE"});
    try{
      try{await privateStorage.verifyObject(evidenceKey,evidenceSize,evidenceSha);}catch{return res.status(422).json({error:"Evidence object checksum or size verification failed.",code:"EVIDENCE_OBJECT_VERIFICATION_FAILED"});}
      if(!(await p1Ready(req,res))) return;
      const record=await req.db.query("SELECT record_type FROM public.p1_domain_records WHERE id=$1::uuid AND project_id=$2::uuid",[id,projectId]);
      if(record.rows.length!==1) return res.status(404).json({error:"P1 workflow record not found."});
      const permission=record.rows[0].record_type==="quality_result"
        ?"quality.result.create"
        :await p1Permission(req,record.rows[0].record_type,"update");
      if(!permission||!(await requireProjectPermission(req,res,projectId,permission))) return;
      const inserted=await req.db.query(
        `INSERT INTO public.p1_domain_evidence(record_id,project_id,evidence_type,object_key,storage_bucket,original_filename,mime_type,file_size_bytes,sha256_checksum,uploaded_by)
         VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::uuid) RETURNING *`,
        [id,projectId,b.evidenceType??"supporting",evidenceKey,evidenceBucket,b.originalFilename??null,b.mimeType??null,evidenceSize,evidenceSha,actorId]);
      const roleCode=await p1Role(req);
      await req.db.query("INSERT INTO public.p1_domain_events(record_id,project_id,event_type,actor_user_id,actor_role_code,payload) VALUES($1::uuid,$2::uuid,'evidence_added',$3::uuid,$4,$5::jsonb)",[id,projectId,actorId,roleCode,JSON.stringify({evidenceId:inserted.rows[0].id})]);
      return res.status(201).json({evidence:inserted.rows[0]});
    }catch{return res.status(500).json(internalServerErrorPayload());}
  });

  app.get("/api/v1/projects/:projectId/p1-kpis",requireAuth,async(req:express.Request,res:express.Response)=>{
    const projectId=req.params.projectId as string;
    try{
      if(!(await p1Ready(req,res))) return;
      const kpiAccess=await req.db.query(
        "SELECT public.pke_has_project_permission($1::uuid,'p1.kpi.view') OR public.pke_has_project_permission($1::uuid,'reports.view') AS allowed",
        [projectId]
      );
      if(!kpiAccess.rows[0]?.allowed) return res.status(403).json({error:"Missing required Project permission: p1.kpi.view or reports.view"});
      const defs=await req.db.query("SELECT * FROM public.p1_report_kpi_definitions WHERE is_active=true AND (project_id IS NULL OR project_id=$1::uuid) ORDER BY template_id,metric_key",[projectId]);
      const roleCodes=await p1Roles(req,projectId);
      const p1KpiTemplatesByRole:Record<string,string[]> = {
        procurement:["tpl-procurement"],contract_manager:["tpl-procurement"],buyer:["tpl-procurement"],finance:["tpl-procurement"],accounting:["tpl-procurement"],
        pks_site_manager:["tpl-procurement","tpl-operational"],
        production_manager:["tpl-operational"],packing_supervisor:["tpl-operational"],qc_officer:["tpl-operational"],
        laboratory_officer:["tpl-operational"],qa_manager:["tpl-operational"],hse_officer:["tpl-operational"],
        transport_manager:["tpl-logistics"],dispatcher:["tpl-logistics"],transporter:["tpl-logistics"],driver:["tpl-logistics"],checker:["tpl-logistics"],
        master_of_loading:["tpl-shipping"],loading_manager:["tpl-shipping"],loading_supervisor:["tpl-shipping"],loading_operator:["tpl-shipping"],
        marine_surveyor:["tpl-shipping"],ship_master:["tpl-shipping"],terminal_representative:["tpl-shipping"],
        shipping_agent:["tpl-shipping","tpl-trade"],document_officer:["tpl-trade","tpl-compliance"],
        internal_auditor:["tpl-audit","tpl-compliance"],
        warehouse:["tpl-warehouse"],warehouse_manager:["tpl-warehouse"],warehouse_officer:["tpl-warehouse"],inventory_controller:["tpl-warehouse"]
      };
      const allTemplates=roleCodes.some((code)=>["pm","project_admin","platform_admin"].includes(code))
        ?new Set(defs.rows.map((d:any)=>String(d.template_id)))
        :new Set(roleCodes.flatMap((code)=>p1KpiTemplatesByRole[code]??[]));
      const kpiDefinitions=defs.rows.filter((d:any)=>allTemplates.has(String(d.template_id)));
      const kpis=[];
      for(const d of kpiDefinitions){
        const q=await req.db.query(
          "SELECT value,source_rows AS n,as_of FROM public.p1_get_kpi_metric($1::uuid,$2::text)",
          [projectId,String(d.formula_key)]
        );
        const row=q.rows[0]??{};
        const value=row.value===null||row.value===undefined?null:Number(row.value);
        const n=Number(row.n??0);
        const asOf=row.as_of??null;
        kpis.push({
          templateId:d.template_id,metricKey:d.metric_key,label:d.label,value,unit:d.unit_code,
          sourceEntity:d.source_entity,sourceRows:n,asOf,
          freshnessStatus:evaluateFreshness(asOf?new Date(asOf).toISOString():null,Number(d.freshness_minutes)),
          status:value===null?"unavailable":"available",missingDataPolicy:d.missing_data_policy
        });
      }
      return res.json({projectId,kpis,generatedAt:new Date().toISOString()});
    }catch{return res.status(500).json(internalServerErrorPayload());}
  });

}

// ============================================
// Centralized error handling middleware
// ============================================
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const rawStatus = err?.status;
  const status = typeof rawStatus === "number" && Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus < 500 ? rawStatus : 500;

  // Never persist exception messages, stacks, query strings, tokens or client IPs.
  logger.error({
    event: "api_unhandled_error",
    status,
    method: req.method,
    path: req.path,
    errorType: typeof err?.name === "string" ? err.name : "UnknownError",
  });

  res.status(status).json({
    status: "error",
    ...(status === 500 ? internalServerErrorPayload() : requestRejectedPayload()),
  });
});

let runtimeVerified = false;
let runtimeVerifyPromise: Promise<void> | null = null;

async function verifyProductionRuntimeSecurity(): Promise<void> {
  if (manualTrialMode.enabled) return;
  if (runtimeVerified) return;
  if (runtimeVerifyPromise) return runtimeVerifyPromise;
  runtimeVerifyPromise = (async () => {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT
          current_user AS current_role,
          r.rolsuper,
          r.rolbypassrls,
          r.rolcreatedb,
          r.rolcreaterole,
          pg_has_role(current_user, 'neon_superuser', 'MEMBER') AS has_neon_superuser_membership,
          has_function_privilege(
            current_user,
            'public.resolve_pke_user_by_neon_auth_user_id(uuid)',
            'EXECUTE'
          ) AS can_resolve_identity
        FROM pg_roles AS r
        WHERE r.rolname = current_user
      `);
      if (result.rows.length !== 1) {
        throw new Error("Unable to inspect PostgreSQL runtime role.");
      }
      const problems = validateRuntimeRoleState(result.rows[0], configuredDatabaseRole);
      if (problems.length > 0) {
        logger.error(`Runtime database security check failed: ${problems.join(" ")}`);
        throw new Error("Runtime database role did not pass the least-privilege startup check.");
      }
      await client.query("SELECT 1");
      runtimeVerified = true;
      logger.info("Database connected with verified app_runtime_secure role.");
    } finally {
      client.release();
    }
  })().catch((error) => {
    runtimeVerifyPromise = null;
    throw error;
  });
  return runtimeVerifyPromise;
}

async function startServer(): Promise<void> {
  if (manualTrialMode.enabled) {
    app.listen(Number(PORT) || 3000, "127.0.0.1", () => {
      logger.info(`PKE Manual Trial Mode API running on http://127.0.0.1:${PORT}`);
      logger.info("Mode: manual-trial (in-memory demo, no Neon/PostgreSQL/Auth/storage/external providers)");
      logger.info(`Timestamp: ${new Date().toISOString()}`);
    });
    return;
  }

  await verifyProductionRuntimeSecurity();

  app.listen(PORT, () => {
    logger.info(`PKE Export Platform API running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
    logger.info(`Database role: app_runtime_secure`);
    logger.info(`Timestamp: ${new Date().toISOString()}`);
  });
}

if (!isServerlessRuntime(process.env)) {
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received. Shutting down gracefully...");
    try {
      if (!manualTrialMode.enabled && pool) await pool.end();
    } catch (err) {
      logger.error("Error during shutdown:", err as any);
    }
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.info("SIGINT received. Shutting down gracefully...");
    try {
      if (!manualTrialMode.enabled && pool) await pool.end();
    } catch (err) {
      logger.error("Error during shutdown:", err as any);
    }
    process.exit(0);
  });

  if (process.env.NODE_ENV !== "test") {
    void startServer().catch((error) => {
      logger.error(manualTrialMode.enabled ? "PKE Manual Trial Mode startup failed." : "PKE API startup cancelled because runtime security checks failed.");
      if (!manualTrialMode.enabled && pool) { void pool.end().finally(() => process.exit(1)); }
      else process.exit(1);
    });
  } else {
    logger.info("PKE API loaded in test mode (server started by test harness).");
  }
} else {
  logger.info("PKE API loaded in serverless mode (no app.listen). Runtime security must be verified before handling production requests.");
}

export async function ensureRuntimeReady(): Promise<void> {
  if (manualTrialMode.enabled) return;
  if (runtimeStartupFailure) {
    throw new Error("PKE runtime configuration is incomplete.");
  }
  if (!pool) {
    throw new Error("PKE database pool is unavailable.");
  }
  await verifyProductionRuntimeSecurity();
}

export function getRuntimeReadinessState(): {
  ready: boolean;
  failure: RuntimeStartupFailure | null;
} {
  if (manualTrialMode.enabled) return { ready: true, failure: null };
  const failure = runtimeStartupFailure
    ? {
        code: runtimeStartupFailure.code,
        missingEnvironmentVariables: [...runtimeStartupFailure.missingEnvironmentVariables],
      }
    : !pool
      ? { code: "DATABASE_POOL_UNAVAILABLE", missingEnvironmentVariables: [] }
      : null;
  return { ready: failure === null, failure };
}

export default app;


