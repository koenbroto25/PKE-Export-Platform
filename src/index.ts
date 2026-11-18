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
    if ((req as express.Request).originalUrl === "/api/v1/webhooks/neon-auth") {
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

if (!manualTrialMode.enabled) {
  // ============================================
  // Environment validation (production / non-demo only)
  // ============================================
  const requiredEnv = ["DATABASE_URL", "NODE_ENV", "NEON_AUTH_BASE_URL", "NEON_AUTH_JWKS_URL"];
  const missingEnv = requiredEnv.filter((key) => !process.env[key]);
  if (missingEnv.length > 0) {
    logger.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
    process.exit(1);
  }

  try {
    configuredDatabaseRole = roleFromDatabaseUrl(process.env.DATABASE_URL || "");
  } catch {
    logger.error("DATABASE_URL is invalid. API startup cancelled.");
    process.exit(1);
  }
  if (process.env.NODE_ENV !== "test") {
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

      logger.error(
        `DATABASE_URL failed mandated single-branch preflight (${problemCodes.length} diagnostic code(s)). API startup cancelled.`
      );
      process.exit(1);
    }
    if (configuredDatabaseRole !== "app_runtime_secure") {
      logger.error("DATABASE_URL must use app_runtime_secure. API startup cancelled.");
      process.exit(1);
    }
  }

  for (const [key, value] of [["NEON_AUTH_BASE_URL", process.env.NEON_AUTH_BASE_URL], ["NEON_AUTH_JWKS_URL", process.env.NEON_AUTH_JWKS_URL]] as const) {
    try {
      const parsed = new URL(value || "");
      if (parsed.protocol !== "https:") throw new Error("HTTPS required");
    } catch {
      logger.error(`${key} must be a valid HTTPS URL. API startup cancelled.`);
      process.exit(1);
    }
  }

  // ============================================
  // Database connection with pooled RLS context support
  // ============================================
  try {
    pool = new Pool({
      connectionString: normalizePostgresSslMode(process.env.DATABASE_URL || ""),
      max: 20,
      idleTimeoutMillis: 30000,
    });
  } catch (error) {
    logger.error("Failed to create database pool:", error);
    process.exit(1);
  }
} else {
  logger.info("Manual Trial Mode: skipping required Neon env validation, DB preflight, auth endpoint validation, and Pool creation.");
}

if (manualTrialMode.enabled) {
  registerDemoApiRoutes(app);
} else {
// ============================================
// Health check endpoint
// ============================================
app.get("/api/v1/health", async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await pool.query("SELECT 1 as healthy");
    const health = {
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "connected",
      environment: process.env.NODE_ENV,
  };
    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Database health check failed.",
    });
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
  if (!authUser || typeof authUser.id !== "string" || typeof authUser.email !== "string") {
    if (isBeforeCreate) {
      return res.status(200).json({ allowed: false, error_message: "Invalid account creation payload.", error_code: "INVALID_AUTH_USER" });
    }
    return res.status(400).json({ error: "Neon Auth user-created payload is incomplete." });
  }

  try {
    const { rows } = await pool.query(
      "SELECT * FROM public.pke_link_neon_auth_identity_from_webhook($1::uuid, $2::text, $3::text, $4::uuid)",
      [authUser.id, authUser.email, typeof authUser.name === "string" ? authUser.name : null, verified.eventId],
    );
    if (isBeforeCreate) {
      // Blocking gate: no Auth account may be created unless Admin pre-provisioned its PKE identity.
      return res.status(200).json({ allowed: true });
    }
    return res.status(200).json({ ok: true, linkState: rows[0]?.link_state || "processed" });
  } catch (error: any) {
    const code = typeof error?.code === "string" ? error.code : "";
    logger.error("Neon Auth webhook identity synchronization failed:", { code });
    if (isBeforeCreate && ["P0002", "23505", "23514"].includes(code)) {
      return res.status(200).json({
        allowed: false,
        error_message: "Akun harus diprovisikan terlebih dahulu oleh Admin PKE.",
        error_code: "PKE_ADMIN_PROVISION_REQUIRED",
      });
    }
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
      `SELECT pm.project_id,
              p.name AS project_name,
              pm.role_id AS catalog_role_id,
              rc.name AS catalog_role_name,
              pm.project_role_id,
              pr.role_code AS project_role_code,
              pr.name AS project_role_name,
              pm.is_active,
              pm.joined_at,
              pm.expires_at,
              pm.deactivated_at,
              p.is_active AS project_is_active
         FROM project_members pm
         LEFT JOIN projects p ON p.id = pm.project_id
         LEFT JOIN role_catalog rc ON rc.id = pm.role_id
         LEFT JOIN project_roles pr ON pr.id = pm.project_role_id AND pr.project_id = pm.project_id
        WHERE pm.user_id = $1::uuid
        ORDER BY pm.joined_at DESC`,
      [userId],
    );

    const projectIds = memberships.map((m: any) => m.project_id);
    let permissions: string[] = [];
    if (req.user.isAdmin) {
      const { rows } = await req.db.query("SELECT code FROM permissions WHERE is_active = true ORDER BY code");
      permissions = rows.map((r: any) => r.code);
    } else if (projectIds.length > 0) {
      const { rows } = await req.db.query(
        `SELECT DISTINCT perm.code
           FROM project_role_permissions prp
           JOIN permissions perm ON perm.id = prp.permission_id
           JOIN project_members pm ON pm.project_role_id IS NOT NULL
                                 AND pm.project_id = prp.project_id
                                 AND pm.project_role_id = prp.project_role_id
          WHERE pm.user_id = $1::uuid
             AND pm.is_active = true
             AND pm.deactivated_at IS NULL
             AND (pm.expires_at IS NULL OR pm.expires_at > now())
             AND EXISTS (SELECT 1 FROM projects p WHERE p.id = pm.project_id AND p.is_active = true)
             AND perm.is_active = true
          ORDER BY perm.code`,
        [userId],
      );
      permissions = rows.map((r: any) => r.code);
    }

    const activeMemberships = memberships.filter((m: any) =>
      m.is_active === true &&
      m.deactivated_at == null &&
      m.project_is_active === true &&
      (!m.expires_at || new Date(m.expires_at).getTime() > Date.now())
    );
    const portalAccess = req.user.isAdmin
      ? ["admin", "workspace", "field", "buyer", "partner", "reports"]
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
          projectRoleId: m.project_role_id,
          roleCode: m.project_role_code ?? m.catalog_role_name,
          roleName: m.project_role_name ?? m.catalog_role_name,
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

// Role and permission endpoints

// Contract Program management
app.get("/api/v1/contract-programs", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM contract_programs WHERE is_active = true ORDER BY created_at DESC");
    res.json({ contractPrograms: rows });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.get("/api/v1/contract-programs/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  try {
    const { rows } = await req.db.query("SELECT * FROM contract_programs WHERE id = $1::uuid AND is_active = true", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Contract Program not found" });
    }
    res.json({ contractProgram: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// Buyer management
app.get("/api/v1/buyers", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM buyers WHERE is_active = true ORDER BY created_at DESC");
    res.json({ buyers: rows });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/buyers", requireAuth, async (req: express.Request, res: express.Response) => {
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

app.patch("/api/v1/buyers/:id", requireAuth, async (req: express.Request, res: express.Response) => {
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
    const buyerId = req.query.buyerId as string | undefined;
    const params: any[] = [];
    let sql = "SELECT * FROM contracts WHERE is_active = true";
    if (buyerId) { sql += " AND buyer_id = $1::uuid"; params.push(buyerId); }
    sql += " ORDER BY created_at DESC";
    const { rows } = await req.db.query(sql, params);
    res.json({ contracts: rows });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/contracts", requireAuth, async (req: express.Request, res: express.Response) => {
  const { buyerId, code, name, startDate, endDate } = req.body;
  if (!buyerId || !code || !name || !startDate) return res.status(400).json({ error: "buyerId, code, name, startDate required" });
  try {
    const { rows } = await req.db.query(
      "INSERT INTO contracts (buyer_id, code, name, start_date, end_date, is_active, created_at, updated_at) VALUES ($1::uuid, $2, $3, $4::timestamptz, $5::timestamptz, true, now(), now()) RETURNING *",
      [buyerId, code, name, startDate, endDate || null],
    );
    res.status(201).json({ contract: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// Cycle Policy management
app.get("/api/v1/cycle-policies", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM cycle_policies WHERE is_active = true ORDER BY created_at DESC");
    res.json({ cyclePolicies: rows });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.post("/api/v1/cycle-policies", requireAuth, async (req: express.Request, res: express.Response) => {
  const { contractProgramId, cadence, targetQuantity, generationMode } = req.body;

  if (!contractProgramId || !cadence || !generationMode) {
    return res.status(400).json({ error: "Required fields: contractProgramId, cadence, generationMode" });
  }

  try {
    const { rows } = await req.db.query(
      "INSERT INTO cycle_policies (contract_program_id, cadence, target_quantity, generation_mode, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, true, now(), now()) RETURNING *",
      [contractProgramId, cadence, targetQuantity || null, generationMode]
    );
    res.status(201).json({ cyclePolicy: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
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
  if (!(await requireProjectPermission(req, res, projectId, "project.configuration.view"))) return;
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
  return true;
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
  const base: string[] = ["project.view"];
  const byRole: Record<string, string[]> = {
    admin: [
      "project.view", "project.members.view", "project.members.invite", "project.members.manage",
      "project.roles.view", "project.roles.manage", "project.configuration.view",
      "project.configuration.manage", "documents.view", "documents.create", "workflow.view",
      "approvals.view", "notifications.view", "notifications.create", "reports.view"
    ],
    pm: [
      "project.view", "project.members.view", "documents.view", "documents.create",
      "workflow.view", "workflow.update", "approvals.view", "approvals.create",
      "notifications.view", "notifications.create", "reports.view"
    ],
    checker: [
      "project.view", "documents.view", "workflow.view", "approvals.view",
      "notifications.view", "reports.view"
    ],
    warehouse: [
      "project.view", "documents.view", "workflow.view", "notifications.view", "reports.view"
    ],
    finance: [
      "project.view", "documents.view", "reports.view", "finance.view"
    ],
    buyer: [
      "project.view", "documents.view", "reports.view", "shipment.view"
    ],
    supplier: [
      "project.view", "documents.view", "reports.view", "shipment.view"
    ]
  };
  return [...new Set([...base, ...(byRole[roleCode] || [])])];
}

// ============================================
// Contract Program CRUD
// ============================================
app.post("/api/v1/contract-programs", requireAuth, async (req: express.Request, res: express.Response) => {
  const { name, buyerId, contractId, settlementUnit, targetQuantity, cadence, generationMode, description } = req.body;
  if (!name || !settlementUnit || !targetQuantity || !cadence) {
    return res.status(400).json({ error: "Required fields: name, settlementUnit, targetQuantity, cadence" });
  }
  try {
    const { rows } = await req.db.query(
      `INSERT INTO contract_programs
        (name, buyer_id, contract_id, settlement_unit, target_quantity, cadence, generation_mode, description, is_active, created_at, updated_at)
       VALUES ($1::text, $2::uuid, $3::uuid, $4::text, $5::numeric, $6::text, $7::text, $8::text, true, now(), now())
       RETURNING *`,
      [name, buyerId || null, contractId || null, settlementUnit, targetQuantity, cadence, generationMode || "scheduled_draft", description || null]
    );
    res.status(201).json({ contractProgram: rows[0] });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

app.patch("/api/v1/contract-programs/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { name, buyerId, contractId, settlementUnit, targetQuantity, cadence, generationMode, description, isActive } = req.body;
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
app.post("/api/v1/projects", requireAuth, async (req: express.Request, res: express.Response) => {
  const {
    contractProgramId, name, description, status, settlementUnit, targetQuantity,
    exportCountryCode, createContractProgram
  } = req.body ?? {};
  if (!name || !settlementUnit || targetQuantity === undefined || targetQuantity === null || targetQuantity === "") {
    return res.status(400).json({ error: "Required fields: name, settlementUnit, targetQuantity" });
  }
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Authenticated user required" });

  // Use request-scoped RLS transaction client (req.db). Savepoint keeps atomicity within middleware-managed tx.
  const dbClient = req.db;
  try {
    await dbClient.query("SAVEPOINT project_create");
    try {
      let programId = typeof contractProgramId === "string" && contractProgramId ? contractProgramId : null;
      if (!programId && createContractProgram && typeof createContractProgram === "object") {
        const cpName = createContractProgram.name || `${name} Program`;
        const cpRows = await dbClient.query(
          `INSERT INTO contract_programs
            (name, buyer_id, contract_id, settlement_unit, target_quantity, cadence, generation_mode, is_active, created_at, updated_at)
           VALUES ($1::text, $2::uuid, $3::uuid, $4::text, $5::numeric, $6::text, 'scheduled_draft', true, now(), now())
           RETURNING id`,
          [cpName, createContractProgram.buyerId || null, createContractProgram.contractId || null,
           settlementUnit, targetQuantity, createContractProgram.cadence || "scheduled"]
        );
        programId = cpRows.rows[0].id;
      }
      if (!programId) {
        throw Object.assign(new Error("Contract program is required (existing or new)."), { status: 400 });
      }
      const { rows: projectRows } = await dbClient.query(
        `INSERT INTO projects
          (contract_program_id, name, description, status, settlement_unit, target_quantity,
           export_country_code, is_active, created_at, updated_at)
         VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::text, $6::numeric, $7::text, true, now(), now())
         RETURNING *`,
        [programId, name, description || null, status || "draft", settlementUnit, targetQuantity, exportCountryCode || null]
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
      const { rows: roleTemplates } = await dbClient.query(
        "SELECT id, name, description FROM role_catalog WHERE is_active = true ORDER BY name"
      );
      const createdRoles: any[] = [];
      for (const tmpl of roleTemplates) {
        const { rows: roleRows } = await dbClient.query(
          `INSERT INTO project_roles (project_id, role_code, name, description, is_active, created_by, created_at, updated_at)
           VALUES ($1::uuid, $2::text, $3::text, $4::text, true, $5::uuid, now(), now())
           RETURNING id`,
          [projectId, tmpl.name, tmpl.name, tmpl.description || null, userId]
        );
        const projectRoleId = roleRows[0].id;
        createdRoles.push({ projectRoleId, catalogRoleId: tmpl.id, roleCode: tmpl.name, name: tmpl.name });
        const defaultPerms = defaultPermissionsForRole(tmpl.name);
        for (const permCode of defaultPerms) {
          const { rows: permRows } = await dbClient.query(
            "SELECT id FROM permissions WHERE code = $1::text AND is_active = true LIMIT 1",
            [permCode]
          );
          if (permRows.length > 0) {
            await dbClient.query(
              `INSERT INTO project_role_permissions (project_id, project_role_id, permission_id, granted_by, granted_at)
               VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, now())
               ON CONFLICT (project_role_id, permission_id) DO NOTHING`,
              [projectId, projectRoleId, permRows[0].id, userId]
            );
          }
        }
      }
      const adminRole = createdRoles.find((r: any) => r.roleCode === "admin");
      if (adminRole) {
        // role_id -> role_catalog.id, project_role_id -> project_roles.id (no created_at column in project_members)
        await dbClient.query(
          `INSERT INTO project_members (project_id, user_id, project_role_id, role_id, joined_at, is_active, updated_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, now(), true, now())
           ON CONFLICT (project_id, user_id) DO NOTHING`,
          [projectId, userId, adminRole.projectRoleId, adminRole.catalogRoleId || null]
        );
      }
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
  const { projectRequirementId, fileReference, objectKey, originalFilename, mimeType, sha256Checksum, versionNo, expiryDate, notes } = req.body ?? {};
  if (!projectRequirementId || !fileReference || !originalFilename) {
    return res.status(400).json({ error: "Required fields: projectRequirementId, fileReference, originalFilename" });
  }
  if (objectKey && String(objectKey).indexOf(`projects/${projectId}/`) !== 0) {
    return res.status(400).json({ error: "Invalid object key namespace", code: "INVALID_OBJECT_KEY" });
  }
  try {
    const { rows: reqRows } = await req.db.query(
      "SELECT id FROM project_export_document_requirements WHERE id = $1::uuid AND project_id = $2::uuid",
      [projectRequirementId, projectId],
    );
    if (reqRows.length === 0) return res.status(404).json({ error: "Not found" });
    const { rows } = await req.db.query(
      `INSERT INTO project_export_documents
        (project_id, project_requirement_id, file_reference, object_key, original_filename, mime_type,
         sha256_checksum, version_no, status, uploaded_by, expiry_date, notes, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, 'uploaded', $9::uuid, $10::date, $11, now(), now())
       RETURNING *`,
      [projectId, projectRequirementId, fileReference, objectKey || null, originalFilename, mimeType || null,
       sha256Checksum || null, versionNo !== undefined ? versionNo : 1, req.user?.id || null,
       expiryDate || null, notes || null],
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
    if (!(await requireProjectPermission(req, res, projectId, "documents.review"))) return;
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


// ============================================
// Sprint 02E — Reporting, Notifications & BI
// ============================================

const reportTemplatesStore: any[] = [
  { id: "tpl-daily-ops", name: "Daily Operations Report", category: "Operational", version: 1, active: true, audience: "internal", frequency: "daily" },
  { id: "tpl-weekly-rab", name: "Weekly RAB vs Actual", category: "Financial", version: 1, active: true, audience: "finance", frequency: "weekly" },
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

app.get("/api/v1/reports/portfolio", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows: projectRows } = await req.db.query("SELECT COUNT(*)::int AS count, COALESCE(SUM(target_quantity),0) AS volume FROM projects WHERE is_active = true");
    const { rows: rabRows } = await req.db.query("SELECT COALESCE(SUM(amount),0) AS budget FROM rab WHERE is_active = true");
    const { rows: tripRows } = await req.db.query("SELECT COUNT(*)::int AS count FROM truck_trips");
    res.json({
      activeProjects: projectRows[0]?.count ?? 0,
      contractVolume: projectRows[0]?.volume ?? 0,
      approvedBudget: rabRows[0]?.budget ?? 0,
      shipmentCount: tripRows[0]?.count ?? 0,
      committedCost: 0,
      actualCost: 0,
      forecastMargin: 0,
      outstandingReceivables: 0,
      outstandingPayables: 0,
      cashRequirement: 0,
      criticalComplianceBlockers: 0,
      dataFreshness: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
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
    } else if (req.user?.isAdmin) {
      ({ rows } = await req.db.query("SELECT * FROM report_runs ORDER BY generated_at DESC LIMIT 200"));
    } else {
      ({ rows } = await req.db.query(
        `SELECT rr.* FROM report_runs rr
          WHERE rr.project_id IN (
            SELECT pm.project_id FROM project_members pm WHERE pm.user_id = $1::uuid AND pm.is_active = true
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

app.post("/api/v1/reports/generate", requireAuth, async (req: express.Request, res: express.Response) => {
  const { templateId, projectId, cutoff } = req.body ?? {};
  if (!templateId) return res.status(400).json({ error: "templateId required" });
  if (projectId && !(await requireProjectPermission(req, res, String(projectId), "reports.view"))) return;
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
      `SELECT id, event_id, project_id, recipient_user_id, created_by, title, message, priority, category, read_at, created_at
         FROM user_notifications
        WHERE recipient_user_id = $1::uuid
        ORDER BY created_at DESC`,
      [userId],
    );
    const notifications = rows.map((r: any) => ({
      id: r.id,
      eventId: r.event_id,
      projectId: r.project_id,
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
      if (!(await requireProjectPermission(req, res, scopedProjectId, "notifications.create"))) return;
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

app.get("/api/v1/reports/export/projects", requireAuth, async (req: express.Request, res: express.Response) => {
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

app.get("/api/v1/reports/kpis/operational", requireAuth, async (req: express.Request, res: express.Response) => {
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

app.get("/api/v1/reports/kpis/financial", requireAuth, async (req: express.Request, res: express.Response) => {
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

app.get("/api/v1/reports/historical", requireAuth, async (req: express.Request, res: express.Response) => {
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
    } else if (req.user?.isAdmin) {
      ({ rows } = await req.db.query("SELECT * FROM report_schedules ORDER BY created_at DESC"));
    } else {
      ({ rows } = await req.db.query(
        `SELECT rs.* FROM report_schedules rs
          WHERE rs.project_id IN (
            SELECT pm.project_id FROM project_members pm WHERE pm.user_id = $1::uuid AND pm.is_active = true
          )
          ORDER BY rs.created_at DESC`,
        [req.user?.id],
      ));
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
  if (projectId && !(await requireProjectPermission(req, res, String(projectId), "reports.manage"))) return;
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

app.get("/api/v1/reports/scheduler/runs", requireAuth, async (req: express.Request, res: express.Response) => {
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
app.post("/api/v1/reports/export/audit", requireAuth, async (req: express.Request, res: express.Response) => {
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
  const { rows: members } = await req.db.query(
    `SELECT pm.id, pm.user_id, u.email, u.name, pm.project_role_id, pr.role_code, pr.name AS role_name,
            pm.is_active, pm.joined_at, pm.expires_at
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       LEFT JOIN project_roles pr ON pr.id = pm.project_role_id AND pr.project_id = pm.project_id
      WHERE pm.project_id = $1::uuid
      ORDER BY pr.role_code, u.email`,
    [id]
  );
  const { rows: roles } = await req.db.query(
    `SELECT pr.id, pr.role_code, pr.name, pr.description, pr.is_active,
            (SELECT jsonb_agg(perm.code) FROM project_role_permissions prp
             JOIN permissions perm ON perm.id = prp.permission_id
             WHERE prp.project_role_id = pr.id AND perm.is_active = true) AS permissions
       FROM project_roles pr
      WHERE pr.project_id = $1::uuid
      ORDER BY pr.role_code`,
    [id]
  );
  const { rows: profile } = await req.db.query("SELECT * FROM project_operating_profiles WHERE project_id = $1::uuid", [id]);
  const { rows: readiness } = await req.db.query("SELECT * FROM project_module_readiness WHERE project_id = $1::uuid", [id]);
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
  const userId = req.user?.id;
  try {
    const { rows: roleRows } = await req.db.query(
      `INSERT INTO project_roles (project_id, role_code, name, description, is_active, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::text, $3::text, $4::text, true, $5::uuid, now(), now())
       RETURNING id`,
      [id, roleCode, name, description || null, userId]
    );
    const projectRoleId = roleRows[0].id;
    if (templateRoleCode) {
      const perms = defaultPermissionsForRole(templateRoleCode);
      for (const permCode of perms) {
        const { rows: permRows } = await req.db.query(
          "SELECT id FROM permissions WHERE code = $1::text AND is_active = true LIMIT 1",
          [permCode]
        );
        if (permRows.length > 0) {
          await req.db.query(
            `INSERT INTO project_role_permissions (project_id, project_role_id, permission_id, granted_by, granted_at)
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, now())
             ON CONFLICT (project_role_id, permission_id) DO NOTHING`,
            [id, projectRoleId, permRows[0].id, userId]
          );
        }
      }
    }
    res.status(201).json({ role: { id: projectRoleId, roleCode, name, description } });
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

app.put("/api/v1/projects/:id/roles/:roleId/permissions", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id, roleId } = req.params;
  const allowed = await requireProjectPermission(req, res, id, 'project.roles.manage');
  if (!allowed) return;
  const { permissionCodes } = req.body;
  if (!Array.isArray(permissionCodes)) {
    return res.status(400).json({ error: "permissionCodes array required" });
  }
  const userId = req.user?.id;
  const { rows: validPerms } = await req.db.query(
    "SELECT code FROM permissions WHERE is_active = true AND code = ANY($1::text[])",
    [permissionCodes]
  );
  const validCodes = new Set(validPerms.map((r: any) => r.code));
  const invalid = permissionCodes.filter((c: string) => !validCodes.has(c));
  if (invalid.length > 0) {
    return res.status(400).json({ error: "Invalid or inactive permission codes", invalid });
  }
  try {
    // Use savepoint: req.db is request-scoped middleware-managed transaction.
    await req.db.query("SAVEPOINT set_project_role_permissions");
    try {
      await req.db.query(
        "DELETE FROM project_role_permissions WHERE project_role_id = $2::uuid AND project_id = $1::uuid",
        [id, roleId]
      );
      for (const permCode of permissionCodes) {
        const { rows: permRows } = await req.db.query(
          "SELECT id FROM permissions WHERE code = $1::text AND is_active = true LIMIT 1",
          [permCode]
        );
        if (permRows.length > 0) {
          await req.db.query(
            `INSERT INTO project_role_permissions (project_id, project_role_id, permission_id, granted_by, granted_at)
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, now())`,
            [id, roleId, permRows[0].id, userId]
          );
        }
      }
      await req.db.query("RELEASE SAVEPOINT set_project_role_permissions");
      res.json({ ok: true, roleId, permissionCodes });
    } catch (error) {
      await req.db.query("ROLLBACK TO SAVEPOINT set_project_role_permissions").catch(() => {});
      await req.db.query("RELEASE SAVEPOINT set_project_role_permissions").catch(() => {});
      throw error;
    }
  } catch (error) {
    res.status(500).json(internalServerErrorPayload());
  }
});

// ============================================
// Project members
// ============================================
app.get("/api/v1/projects/:id/members", requireAuth, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const allowed = await requireProjectPermission(req, res, id, 'project.members.view');
  if (!allowed) return;
  const { rows } = await req.db.query(
    `SELECT pm.id, pm.user_id, u.email, u.name, pm.project_role_id, pr.role_code, pr.name AS role_name,
            pm.is_active, pm.joined_at, pm.expires_at, pm.deactivated_at
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       LEFT JOIN project_roles pr ON pr.id = pm.project_role_id AND pr.project_id = pm.project_id
      WHERE pm.project_id = $1::uuid
      ORDER BY u.email`,
    [id]
  );
  res.json({ members: rows });
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
    "SELECT id FROM project_roles WHERE id = $2::uuid AND project_id = $1::uuid AND is_active = true",
    [id, projectRoleId]
  );
  if (roleRows.length === 0) {
    return res.status(400).json({ error: "Invalid project role" });
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
  const sensitiveChange = isActive !== undefined || projectRoleId !== undefined;
  if (sensitiveChange && reason.length < 3) {
    return res.status(400).json({ error: "A reason of at least 3 characters is required for membership status or role changes.", code: "AUDIT_REASON_REQUIRED" });
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
      const { rows: roleRows } = await req.db.query(
        "SELECT id FROM project_roles WHERE id = $2::uuid AND project_id = $1::uuid AND is_active = true LIMIT 1",
        [id, projectRoleId],
      );
      if (roleRows.length === 0) return res.status(400).json({ error: "Project role is invalid, inactive, or belongs to another project.", code: "INVALID_PROJECT_ROLE" });
    }

    const nextActive = isActive === undefined ? before.is_active === true : isActive;
    const nextExpiresAt = expiresAt === undefined ? before.expires_at : expiresAt;
    const { rows } = await req.db.query(
      `UPDATE project_members
          SET project_role_id = COALESCE($3::uuid, project_role_id),
              is_active = $4::boolean,
              expires_at = $5::timestamptz,
              deactivated_at = CASE WHEN $4::boolean THEN NULL ELSE COALESCE(deactivated_at, now()) END,
              deactivated_by = CASE WHEN $4::boolean THEN NULL ELSE COALESCE(deactivated_by, $6::uuid) END,
              updated_at = now()
        WHERE id = $2::uuid AND project_id = $1::uuid
        RETURNING *`,
      [id, memberId, projectRoleId ?? null, nextActive, nextExpiresAt ?? null, req.user?.id ?? null],
    );
    const after = rows[0];
    const action = isActive === false
      ? "project_member.deactivated"
      : isActive === true && (before.is_active !== true || before.deactivated_at != null)
        ? "project_member.reactivated"
        : projectRoleId !== undefined
          ? "project_member.role_changed"
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
  try {
    const { rows } = await req.db.query("SELECT * FROM truck_trips ORDER BY created_at DESC LIMIT 100");
    res.json({ truckTrips: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load truck trips" });
  }
});

app.post("/api/v1/truck-trips", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, transportLegId, licensePlate, driverName, pksSiteId, vehicleId, departureTime, arrivalTime } = req.body;
  if (!projectId || !transportLegId || !licensePlate) {
    return res.status(400).json({ error: "Required fields: projectId, transportLegId, licensePlate" });
  }
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
// Transport legs (read-only listing for trip assignment)
// ============================================
app.get("/api/v1/transport-legs", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.query;
  try {
    if (projectId) {
      const { rows } = await req.db.query(
        `SELECT id, project_id, origin, destination, distance_km, status, created_at, updated_at
         FROM transport_legs
         WHERE project_id = $1::uuid
         ORDER BY created_at DESC LIMIT 100`,
        [projectId],
      );
      res.json({ transportLegs: rows });
    } else {
      const { rows } = await req.db.query(
        `SELECT id, project_id, origin, destination, distance_km, status, created_at, updated_at
         FROM transport_legs
         ORDER BY created_at DESC LIMIT 100`,
      );
      res.json({ transportLegs: rows });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to load transport legs" });
  }
});

app.get("/api/v1/tracking-events", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM tracking_events ORDER BY created_at DESC LIMIT 100");
    res.json({ trackingEvents: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load tracking events" });
  }
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
    if (!req.user?.isAdmin) {
      const { rows: memberRows } = await req.db.query(
        `SELECT 1 FROM public.project_members WHERE project_id = $1::uuid AND user_id = $2::uuid`,
        [tripProjectId, req.user.id],
      );
      if (memberRows.length === 0) {
        return res.status(403).json({ error: "Forbidden - not a member of the trip's project" });
      }
    }
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
    const { rows } = await req.db.query("SELECT * FROM tracking_events WHERE truck_trip_id = $1::uuid ORDER BY created_at DESC", [req.params.tripId]);
    res.json({ trackingEvents: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load tracking events" });
  }
});

app.get("/api/v1/warehouse-receipts", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM warehouse_receipts ORDER BY created_at DESC LIMIT 100");
    res.json({ warehouseReceipts: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load warehouse receipts" });
  }
});

app.post("/api/v1/warehouse-receipts", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, truckTripId, lotId, receivedQuantity, unit, conditionStatus, exceptionReason, weighbridgeTicketKey, checkTimestamp, status } = req.body ?? {};
  const checkerId = req.user?.id;
  if (!projectId || receivedQuantity === undefined || !unit) {
    return res.status(400).json({ error: "Required fields: projectId, receivedQuantity, unit" });
  }
  if (typeof checkerId !== "string") {
    return res.status(401).json({ error: "Authenticated principal required" });
  }
  try {
    if (truckTripId) {
      const { rows: tripRows } = await req.db.query(`SELECT id, project_id FROM truck_trips WHERE id = $1::uuid`, [truckTripId]);
      if (tripRows.length === 0) return res.status(400).json({ error: "Invalid truck trip" });
      if (tripRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden" });
    }
    if (lotId) {
      const { rows: lotRows } = await req.db.query(`SELECT id, project_id FROM inventory_lots WHERE id = $1::uuid`, [lotId]);
      if (lotRows.length === 0) return res.status(400).json({ error: "Invalid inventory lot" });
      if (lotRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden" });
    }
    const effectiveCheck = checkTimestamp || new Date().toISOString();
    const { rows } = await req.db.query(
      `INSERT INTO warehouse_receipts (project_id, truck_trip_id, lot_id, received_quantity, unit, condition_status, exception_reason, weighbridge_ticket_key, checker_id, check_timestamp, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9::uuid, $10::timestamptz, $11, now(), now()) RETURNING *`,
      [projectId, truckTripId || null, lotId || null, receivedQuantity, unit, conditionStatus || null, exceptionReason || null, weighbridgeTicketKey || null, checkerId, effectiveCheck, status || "pending"],
    );
    res.status(201).json({ warehouseReceipt: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create warehouse receipt" });
  }
});

app.patch("/api/v1/warehouse-receipts/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { status, receivedQuantity, unit, conditionStatus, exceptionReason } = req.body ?? {};
  try {
    const { rows } = await req.db.query(
      `UPDATE warehouse_receipts
          SET status = COALESCE($2, status),
              received_quantity = COALESCE($3, received_quantity),
              unit = COALESCE($4, unit),
              condition_status = COALESCE($5, condition_status),
              exception_reason = COALESCE($6, exception_reason),
              updated_at = now()
        WHERE id = $1::uuid RETURNING *`,
      [req.params.id, status ?? null, receivedQuantity ?? null, unit ?? null, conditionStatus ?? null, exceptionReason ?? null],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Warehouse receipt not found" });
    res.json({ warehouseReceipt: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to update warehouse receipt" });
  }
});

app.get("/api/v1/inventory-lots", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM inventory_lots ORDER BY created_at DESC LIMIT 100");
    res.json({ inventoryLots: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load inventory lots" });
  }
});

app.post("/api/v1/inventory-lots", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, pksSiteId, quantity, unit, location, status } = req.body;
  if (!projectId || quantity === undefined) return res.status(400).json({ error: "projectId, quantity required" });
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

app.post("/api/v1/inventory-movements", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, lotId, movementType, quantity, unit, warehouseReceiptId, sourceLocation, destinationLocation, reason, referenceId, referenceType, status } = req.body ?? {};
  const actorId = req.user?.id;
  if (!projectId || !lotId || !movementType || quantity === undefined || !unit || !actorId) {
    return res.status(400).json({ error: "projectId, lotId, movementType, quantity, unit required" });
  }
  try {
    const { rows: lotRows } = await req.db.query(`SELECT id, project_id FROM inventory_lots WHERE id = $1::uuid`, [lotId]);
    if (lotRows.length === 0) return res.status(400).json({ error: "Invalid inventory lot" });
    if (lotRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden: lot does not belong to project" });
    if (warehouseReceiptId) {
      const { rows: receiptRows } = await req.db.query(`SELECT id, project_id FROM warehouse_receipts WHERE id = $1::uuid`, [warehouseReceiptId]);
      if (receiptRows.length === 0) return res.status(400).json({ error: "Invalid warehouse receipt" });
      if (receiptRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden: receipt does not belong to project" });
    }
    const { rows } = await req.db.query(
      `INSERT INTO inventory_movements (project_id, lot_id, warehouse_receipt_id, movement_type, quantity, unit, source_location, destination_location, reason, actor_id, reference_id, reference_type, status, created_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::uuid, $11::uuid, $12, $13, now()) RETURNING *`,
      [projectId, lotId, warehouseReceiptId || null, movementType, quantity, unit, sourceLocation || null, destinationLocation || null, reason || null, actorId, referenceId || null, referenceType || null, status || "posted"],
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
  try {
    const { rows } = await req.db.query("SELECT * FROM inventory_reservations ORDER BY created_at DESC LIMIT 100");
    res.json({ inventoryReservations: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load inventory reservations" });
  }
});

app.post("/api/v1/inventory-reservations", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, lotId, reservedQuantity, unit, referenceId, referenceType, idempotencyKey } = req.body ?? {};
  const actorId = req.user?.id;
  if (!projectId || !lotId || reservedQuantity === undefined || !unit || !idempotencyKey) {
    return res.status(400).json({ error: "projectId, lotId, reservedQuantity, unit, idempotencyKey required" });
  }
  try {
    // Idempotency: reject duplicate reservation key
    const { rows: existing } = await req.db.query(
      "SELECT id FROM inventory_reservations WHERE idempotency_key = $1::text LIMIT 1",
      [idempotencyKey],
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: "Reservation with this idempotency key already exists" });
    }
    const { rows: lotRows } = await req.db.query(`SELECT id, project_id, quantity FROM inventory_lots WHERE id = $1::uuid`, [lotId]);
    if (lotRows.length === 0) return res.status(400).json({ error: "Invalid inventory lot" });
    if (lotRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden: lot does not belong to project" });
    const availableQty = Number(lotRows[0].quantity);
    const reserveQty = Number(reservedQuantity);
    if (reserveQty > availableQty) {
      return res.status(400).json({ error: "Insufficient available stock for reservation" });
    }
    const { rows } = await req.db.query(
      `INSERT INTO inventory_reservations (project_id, lot_id, reserved_quantity, unit, reference_id, reference_type, idempotency_key, status, fulfilled_quantity, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7::text, 'active', 0, now(), now()) RETURNING *`,
      [projectId, lotId, reserveQty, unit, referenceId || null, referenceType || null, idempotencyKey],
    );
    res.status(201).json({ inventoryReservation: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create inventory reservation" });
  }
});

// Inventory holds
app.get("/api/v1/inventory-holds", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM inventory_holds ORDER BY created_at DESC LIMIT 100");
    res.json({ inventoryHolds: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load inventory holds" });
  }
});

app.post("/api/v1/inventory-holds", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, lotId, heldQuantity, unit, reason, idempotencyKey } = req.body ?? {};
  const actorId = req.user?.id;
  if (!projectId || !lotId || heldQuantity === undefined || !unit || !reason || !idempotencyKey) {
    return res.status(400).json({ error: "projectId, lotId, heldQuantity, unit, reason, idempotencyKey required" });
  }
  try {
    const { rows: existing } = await req.db.query(
      "SELECT id FROM inventory_holds WHERE idempotency_key = $1::text LIMIT 1",
      [idempotencyKey],
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: "Hold with this idempotency key already exists" });
    }
    const { rows: lotRows } = await req.db.query(`SELECT id, project_id FROM inventory_lots WHERE id = $1::uuid`, [lotId]);
    if (lotRows.length === 0) return res.status(400).json({ error: "Invalid inventory lot" });
    if (lotRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden: lot does not belong to project" });
    const { rows } = await req.db.query(
      `INSERT INTO inventory_holds (project_id, lot_id, held_quantity, unit, reason, idempotency_key, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::text, 'active', now(), now()) RETURNING *`,
      [projectId, lotId, Number(heldQuantity), unit, reason, idempotencyKey],
    );
    res.status(201).json({ inventoryHold: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create inventory hold" });
  }
});

// ============================================
// Shipment allocations (P06)
// ============================================
app.get("/api/v1/shipment-allocations", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await req.db.query("SELECT * FROM shipment_allocations ORDER BY created_at DESC LIMIT 100");
    res.json({ shipmentAllocations: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load shipment allocations" });
  }
});

app.post("/api/v1/shipment-allocations", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, lotId, allocatedQuantity, unit, referenceId, referenceType, idempotencyKey } = req.body ?? {};
  const actorId = req.user?.id;
  if (!projectId || !lotId || allocatedQuantity === undefined || !unit || !idempotencyKey || !actorId) {
    return res.status(400).json({ error: "projectId, lotId, allocatedQuantity, unit, idempotencyKey required" });
  }
  try {
    // Idempotency: reject duplicate allocation key
    const { rows: existing } = await req.db.query(
      "SELECT id FROM shipment_allocations WHERE idempotency_key = $1::text LIMIT 1",
      [idempotencyKey],
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: "Allocation with this idempotency key already exists" });
    }
    const { rows: lotRows } = await req.db.query(`SELECT id, project_id, quantity FROM inventory_lots WHERE id = $1::uuid`, [lotId]);
    if (lotRows.length === 0) return res.status(400).json({ error: "Invalid inventory lot" });
    if (lotRows[0].project_id !== projectId) return res.status(403).json({ error: "Forbidden: lot does not belong to project" });
    const { rows: reservationRows } = await req.db.query(
      `SELECT reserved_quantity, COALESCE(fulfilled_quantity, 0) AS fulfilled_quantity FROM inventory_reservations WHERE lot_id = $1::uuid AND status = 'active'`,
      [lotId],
    );
    const reservedTotal = reservationRows.reduce((sum: number, r: any) => sum + Number(r.reserved_quantity || 0), 0);
    const fulfilledTotal = reservationRows.reduce((sum: number, r: any) => sum + Number(r.fulfilled_quantity || 0), 0);
    const availableForAllocation = reservedTotal - fulfilledTotal;
    const allocQty = Number(allocatedQuantity);
    if (allocQty > availableForAllocation) {
      return res.status(400).json({ error: "Allocation exceeds available reserved quantity" });
    }
    const { rows } = await req.db.query(
      `INSERT INTO shipment_allocations (project_id, lot_id, allocated_quantity, unit, reference_id, reference_type, idempotency_key, status, reversal_reason, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7::text, 'active', NULL, $8::uuid, now(), now()) RETURNING *`,
      [projectId, lotId, allocQty, unit, referenceId || null, referenceType || null, idempotencyKey, actorId],
    );
    // Update reservation fulfilled quantity
    if (reservationRows.length > 0) {
      const newFulfilled = fulfilledTotal + allocQty;
      await req.db.query(
        `UPDATE inventory_reservations SET fulfilled_quantity = $1, updated_at = now() WHERE lot_id = $2::uuid AND status = 'active'`,
        [newFulfilled, lotId],
      );
    }
    res.status(201).json({ shipmentAllocation: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create shipment allocation" });
  }
});

app.patch("/api/v1/shipment-allocations/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  const { status, reversalReason } = req.body ?? {};
  const allowedStatuses = new Set(["active", "reversed", "completed"]);
  if (status !== undefined && (typeof status !== "string" || !allowedStatuses.has(status))) {
    return res.status(400).json({ error: "Invalid status" });
  }
  try {
    const { rows: allocRows } = await req.db.query(
      "SELECT id, lot_id, allocated_quantity, status, reversal_reason, created_by FROM shipment_allocations WHERE id = $1::uuid",
      [req.params.id],
    );
    if (allocRows.length === 0) return res.status(404).json({ error: "Shipment allocation not found" });
    const alloc = allocRows[0];
    if (alloc.status === "reversed") {
      return res.status(400).json({ error: "Cannot modify a reversed allocation" });
    }
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }
    if (reversalReason !== undefined) { updates.push(`reversal_reason = $${idx++}`); values.push(reversalReason); }
    if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });
    values.push(req.params.id);
    const { rows } = await req.db.query(
      `UPDATE shipment_allocations SET ${updates.join(", ")}, updated_at = now() WHERE id = $${idx} RETURNING *`,
      values,
    );

    // If reversing, restore reservation fulfilled quantity
    if (status === "reversed") {
      await req.db.query(
        `UPDATE inventory_reservations
         SET fulfilled_quantity = GREATEST(COALESCE(fulfilled_quantity, 0) - $1, 0), updated_at = now()
         WHERE lot_id = $2::uuid AND status = 'active'`,
        [Number(alloc.allocated_quantity || 0), alloc.lot_id],
      );
    }

    res.json({ shipmentAllocation: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to update shipment allocation" });
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

app.post("/api/v1/fx-rates", requireAuth, async (req: express.Request, res: express.Response) => {
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
  try {
    const { rows } = await req.db.query(
      `SELECT e.id, e.project_id, e.exposure_type, e.original_currency_id, e.original_amount,
              e.functional_amount, e.fx_rate, e.fx_date, e.created_at, e.updated_at,
              c.code AS original_currency_code
       FROM fx_exposures e
       LEFT JOIN currencies c ON c.id = e.original_currency_id
       ORDER BY e.created_at DESC LIMIT 100`,
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
  try {
    const { rows } = await req.db.query("SELECT * FROM journal_entries ORDER BY created_at DESC LIMIT 100");
    res.json({ journalEntries: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load journal entries" });
  }
});

app.post("/api/v1/journal-entries", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId, entryType, referenceId, referenceType, description, entryDate } = req.body;
  if (!projectId || !entryType || !description) return res.status(400).json({ error: "projectId, entryType, description required" });
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
      "SELECT id, status FROM journal_entries WHERE id = $1::uuid",
      [journalEntryId],
    );
    if (entryRows.length === 0) return res.status(404).json({ error: "Journal entry not found" });
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

app.post("/api/v1/journal-lines", requireAuth, async (req: express.Request, res: express.Response) => {
  const { journalEntryId, accountId, debit, credit, description, lineOrder } = req.body;
  if (!journalEntryId || !accountId || debit === undefined || credit === undefined) return res.status(400).json({ error: "journalEntryId, accountId, debit, credit required" });
  try {
    // Verify the journal entry exists and is in draft status
    const { rows: entryRows } = await req.db.query(
      "SELECT id, status FROM journal_entries WHERE id = $1::uuid",
      [journalEntryId],
    );
    if (entryRows.length === 0) return res.status(404).json({ error: "Journal entry not found" });
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
      [journalEntryId, accountId, debit || 0, credit || 0, description || null, lineOrder !== undefined ? lineOrder : 1],
    );
    res.status(201).json({ journalLine: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to create journal line" });
  }
});

// ============================================
// RAB routes (P07 Finance)
// ============================================
app.get("/api/v1/rab", requireAuth, async (req: express.Request, res: express.Response) => {
  const { projectId } = req.query;
  try {
    const { rows } = await req.db.query(
      `SELECT id, project_id, description, category, amount, version, is_active, created_at, updated_at
       FROM rab
       WHERE ($1::uuid IS NULL OR project_id = $1::uuid) AND is_active = true
       ORDER BY created_at DESC LIMIT 200`,
      [projectId || null],
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

app.post("/api/v1/chart-of-accounts", requireAuth, async (req: express.Request, res: express.Response) => {
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
// Payment instruction routes (P07 Finance) — unavailable/fail-closed
// ============================================
// Payment execution schema requires owner approval. These routes return an
// explicit unavailable state instead of simulating payment settlement.
app.get("/api/v1/payment-instructions", requireAuth, async (_req: express.Request, res: express.Response) => {
  res.status(503).json({
    error: "Payment execution unavailable",
    code: "PAYMENT_EXECUTION_UNAVAILABLE",
    reason: "Payment execution data model requires owner-approved schema. No payments table exists in Production.",
    available: false,
  });
});

app.post("/api/v1/payment-instructions", requireAuth, async (_req: express.Request, res: express.Response) => {
  res.status(503).json({
    error: "Payment execution unavailable",
    code: "PAYMENT_EXECUTION_UNAVAILABLE",
    reason: "Cannot create payment instruction: payment execution data model requires owner-approved schema.",
    available: false,
  });
});

app.patch("/api/v1/payment-instructions/:id", requireAuth, async (_req: express.Request, res: express.Response) => {
  res.status(503).json({
    error: "Payment execution unavailable",
    code: "PAYMENT_EXECUTION_UNAVAILABLE",
    reason: "Cannot update payment instruction: payment execution data model requires owner-approved schema.",
    available: false,
  });
});

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

app.post("/api/v1/export-document-types", requireAuth, async (req: express.Request, res: express.Response) => {
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

app.post("/api/v1/country-export-document-requirements", requireAuth, async (req: express.Request, res: express.Response) => {
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
    if (!(await requireProjectPermission(req, res, existingRows[0].project_id, "documents.review"))) return;
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
    const { rows } = await req.db.query("SELECT * FROM contracts WHERE id = $1::uuid", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Contract not found" });
    res.json({ contract: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to load contract" });
  }
});

app.patch("/api/v1/contracts/:id", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { code, name, startDate, endDate, isActive } = req.body;
  try {
    const { rows } = await req.db.query(
      `UPDATE contracts SET code = COALESCE($2, code), name = COALESCE($3, name), start_date = COALESCE($4::timestamptz, start_date), end_date = COALESCE($5::timestamptz, end_date), is_active = COALESCE($6, is_active), updated_at = now() WHERE id = $1::uuid RETURNING *`,
      [req.params.id, code ?? null, name ?? null, startDate || null, endDate || null, typeof isActive === "boolean" ? isActive : null],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Contract not found" });
    res.json({ contract: rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Failed to update contract" });
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

app.post("/api/v1/admin/projects/:projectId/members", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const projectId = req.params.projectId as string;
  const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
  const projectRoleId = typeof req.body?.projectRoleId === "string" ? req.body.projectRoleId : "";
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(projectId) || !uuidPattern.test(userId) || !uuidPattern.test(projectRoleId) || reason.length < 5) {
    return res.status(400).json({ error: "Project, user, project role, and an audit reason are required.", code: "INVALID_PROJECT_MEMBER_INPUT" });
  }

  try {
    const { rows: userRows } = await req.db.query(
      "SELECT user_id, email, is_active, neon_auth_user_id FROM public.pke_admin_get_user($1::uuid)",
      [userId],
    );
    if (userRows.length !== 1) return res.status(404).json({ error: "PKE user not found.", code: "USER_NOT_FOUND" });
    if (userRows[0].is_active !== true || !userRows[0].neon_auth_user_id) {
      return res.status(409).json({ error: "User must have an active PKE account and a linked Neon Auth identity before project assignment.", code: "USER_NOT_READY" });
    }

    const { rows: roleRows } = await req.db.query(
      "SELECT id, role_code, name FROM public.project_roles WHERE id = $1::uuid AND project_id = $2::uuid AND is_active = true LIMIT 1",
      [projectRoleId, projectId],
    );
    if (roleRows.length !== 1) return res.status(400).json({ error: "Project role is invalid, inactive, or belongs to another project.", code: "INVALID_PROJECT_ROLE" });

    // Serialize Admin assignments for this project/user pair because this schema has no unique pair constraint.
    await req.db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text, 0))", [projectId, userId]);
    const { rows: existingRows } = await req.db.query(
      "SELECT id, user_id, project_role_id, is_active, deactivated_at, expires_at FROM public.project_members WHERE project_id = $1::uuid AND user_id = $2::uuid ORDER BY joined_at DESC FOR UPDATE",
      [projectId, userId],
    );
    if (existingRows.length > 1) {
      return res.status(409).json({ error: "Multiple memberships already exist for this user/project pair; reconcile duplicates before changing access.", code: "DUPLICATE_PROJECT_MEMBERSHIP" });
    }

    const before = existingRows[0] || null;
    let member;
    if (before) {
      const { rows } = await req.db.query(
        "UPDATE public.project_members SET project_role_id = $3::uuid, is_active = true, expires_at = NULL, deactivated_at = NULL, deactivated_by = NULL, updated_at = now() WHERE id = $1::uuid AND project_id = $2::uuid RETURNING *",
        [before.id, projectId, projectRoleId],
      );
      member = rows[0];
    } else {
      const { rows } = await req.db.query(
        "INSERT INTO public.project_members (project_id, user_id, project_role_id, is_active, joined_at, updated_at) VALUES ($1::uuid, $2::uuid, $3::uuid, true, now(), now()) RETURNING *",
        [projectId, userId, projectRoleId],
      );
      member = rows[0];
    }

    const action = !before ? "project_member.created" :
      before.is_active !== true || before.deactivated_at !== null ? "project_member.reactivated" :
        before.project_role_id !== projectRoleId ? "project_member.role_changed" : "project_member.reconfirmed";
    await req.db.query(
      "INSERT INTO public.audit_events (actor_user_id, actor_type, actor_role, action, target_type, target_id, project_id, reason, before_snapshot, after_snapshot, metadata, outcome) VALUES ($1::uuid, 'user', $2::text, $3::text, 'project_member', $4::uuid, $5::uuid, $6::text, $7::jsonb, $8::jsonb, $9::jsonb, 'success')",
      [
        req.user?.id ?? null,
        req.user?.role ?? null,
        action,
        member.id,
        projectId,
        reason,
        before ? JSON.stringify(before) : null,
        JSON.stringify({ user_id: member.user_id, project_role_id: member.project_role_id, is_active: member.is_active, expires_at: member.expires_at, deactivated_at: member.deactivated_at }),
        JSON.stringify({ email: userRows[0].email, role_code: roleRows[0].role_code }),
      ],
    );
    return res.status(before ? 200 : 201).json({ member });
  } catch (error) {
    logger.error("Admin project membership assignment failed:", error);
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

// ============================================
// Session revocation (P03 Identity/RBAC)
// ============================================
app.post("/api/v1/auth/revoke-session", requireAuth, async (req: express.Request, res: express.Response) => {
  const { userId } = req.body ?? {};
  const actorId = req.user?.id;
  if (!actorId) return res.status(401).json({ error: "Authenticated principal required" });
  try {
    // Admin can revoke any user session; non-admin can only revoke their own
    const targetId = typeof userId === "string" && userId ? userId : actorId;
    if (!req.user?.isAdmin && targetId !== actorId) {
      return res.status(403).json({ error: "Forbidden: cannot revoke another user's session" });
    }
    // Use request-scoped RLS transaction client (never global pool) so context/audit/RLS remain consistent.
    const { rows } = await req.db.query(
      `UPDATE users SET is_active = false, updated_at = now() WHERE id = $1::uuid RETURNING id, email, is_active`,
      [targetId],
    );
    if (rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json({ revoked: rows[0], revokedBy: actorId });
  } catch (error) {
    res.status(500).json({ error: "Failed to revoke session" });
  }
});

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

function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.VERCEL_ENV ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT,
  );
}

if (!isServerlessRuntime()) {
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
  await verifyProductionRuntimeSecurity();
}

export default app;


