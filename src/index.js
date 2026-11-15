import express from "express";
import dotenv from "dotenv";
import winston from "winston";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { requireAuth, requireAdmin } from "./auth";
import { roleFromDatabaseUrl, validateRuntimeRoleState } from "./runtime-security";
dotenv.config();
// In test mode, override DATABASE_URL with the local test database URL
if (process.env.NODE_ENV === "test" && process.env.LOCAL_TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.LOCAL_TEST_DATABASE_URL;
}
export const app = express();
app.use(express.json({ limit: "2mb" }));
const PORT = process.env.PORT || 3000;
// ============================================
// Logging setup (Winston)
// ============================================
const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(winston.format.timestamp(), winston.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} [${level}] ${message}`;
    })),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: "pke-error.log", level: "error" }),
    ],
});
// Global middleware to log all requests
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url} - IP: ${req.ip}`);
    next();
});
// CORS for local frontend development
app.use((req, res, next) => {
    const origin = req.headers.origin;
    const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3001,http://127.0.0.1:3001")
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
// ============================================
// Environment validation
// ============================================
const requiredEnv = ["DATABASE_URL", "NODE_ENV", "NEON_AUTH_BASE_URL", "NEON_AUTH_JWKS_URL"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
    logger.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
    process.exit(1);
}
const isProduction = process.env.NODE_ENV === "production";
let configuredDatabaseRole = "";
try {
    configuredDatabaseRole = roleFromDatabaseUrl(process.env.DATABASE_URL || "");
}
catch {
    logger.error("DATABASE_URL is invalid. API startup cancelled.");
    process.exit(1);
}
if (process.env.NODE_ENV !== "test" && configuredDatabaseRole !== "app_runtime_secure") {
    logger.error("DATABASE_URL must use app_runtime_secure. API startup cancelled.");
    process.exit(1);
}
for (const [key, value] of [["NEON_AUTH_BASE_URL", process.env.NEON_AUTH_BASE_URL], ["NEON_AUTH_JWKS_URL", process.env.NEON_AUTH_JWKS_URL]]) {
    try {
        const parsed = new URL(value || "");
        if (parsed.protocol !== "https:")
            throw new Error("HTTPS required");
    }
    catch {
        logger.error(`${key} must be a valid HTTPS URL. API startup cancelled.`);
        process.exit(1);
    }
}
// ============================================
// Database connection with pooled RLS context support
// ============================================
let pool;
try {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
    });
}
catch (error) {
    logger.error("Failed to create database pool:", error);
    process.exit(1);
}
// ============================================
// Health check endpoint
// ============================================
app.get("/api/v1/health", async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT 1 as healthy");
        const health = {
            status: "ok",
            timestamp: new Date().toISOString(),
            database: "connected",
            environment: process.env.NODE_ENV,
        };
        res.json(health);
    }
    catch (error) {
        res.status(500).json({
            status: "error",
            message: "Database health check failed.",
        });
    }
});
// ============================================
// API version prefix with auth injection
// ============================================
app.use("/api/v1", async (req, res, next) => {
    req.db = pool;
    req.logger = logger;
    await requireAuth(req, res, next);
});
// P03_RLS_REQUEST_TRANSACTION_MIDDLEWARE
app.use("/api/v1", async (req, res, next) => {
    // The global authentication middleware above must establish req.user first.
    const principal = req.user;
    if (!principal || typeof principal.id !== "string" ||
        typeof principal.role !== "string" || principal.isActive !== true) {
        return res.status(401).json({
            error: "Authenticated PKE principal is required.",
            code: "AUTHENTICATED_PRINCIPAL_REQUIRED",
        });
    }
    let client;
    try {
        client = await pool.connect();
        await client.query("BEGIN");
        await client.query(`SELECT
         set_config('app.current_user_id', $1::text, true),
         set_config('app.current_role', $2::text, true)`, [principal.id, principal.role]);
    }
    catch (error) {
        if (client) {
            try {
                await client.query("ROLLBACK");
            }
            catch {
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
    res.end = (...args) => {
        if (finalizing)
            return res;
        finalizing = true;
        const endArgs = args;
        void (async () => {
            let transactionFailure = null;
            try {
                if (res.statusCode >= 400 || clientDisconnected) {
                    await client.query("ROLLBACK");
                }
                else {
                    await client.query("COMMIT");
                }
            }
            catch (error) {
                transactionFailure = error;
                try {
                    await client.query("ROLLBACK");
                }
                catch {
                    // The connection is released below; do not reuse a failed transaction.
                }
            }
            finally {
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
            }
            else {
                originalEnd();
            }
        });
        return res;
    };
    // Do not release a client while a route query may still be in flight.
    // Mark an aborted response; the transaction rolls back when the route unwinds
    // and reaches res.end().
    res.once("close", () => {
        if (!res.writableFinished)
            clientDisconnected = true;
    });
    next();
});
// ============================================
// Authentication middleware
// ============================================
// Get current user context
app.get("/api/v1/me", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { rows: memberships } = await req.db.query(`SELECT pm.project_id, p.name AS project_name, pm.role_id, pr.role_code, pr.name AS role_name, pm.is_active, pm.joined_at
         FROM project_members pm
         LEFT JOIN projects p ON p.id = pm.project_id
         LEFT JOIN project_roles pr ON pr.id = pm.role_id
        WHERE pm.user_id = $1::uuid
        ORDER BY pm.joined_at DESC`, [userId]);
        const projectIds = memberships.map((m) => m.project_id);
        let permissions = [];
        if (req.user.isAdmin) {
            const { rows } = await req.db.query("SELECT code FROM permissions WHERE is_active = true ORDER BY code");
            permissions = rows.map((r) => r.code);
        }
        else if (projectIds.length > 0) {
            const { rows } = await req.db.query(`SELECT DISTINCT perm.code
           FROM project_role_permissions prp
           JOIN permissions perm ON perm.id = prp.permission_id
           JOIN project_members pm ON pm.project_role_id IS NOT NULL AND pm.project_role_id = prp.project_role_id
          WHERE pm.user_id = $1::uuid AND pm.is_active = true AND perm.is_active = true
          ORDER BY perm.code`, [userId]);
            permissions = rows.map((r) => r.code);
        }
        const portalAccess = req.user.isAdmin
            ? ["admin", "workspace", "field", "buyer", "partner", "reports"]
            : memberships.length > 0
                ? ["workspace", "field"]
                : ["workspace"];
        res.json({
            status: "authenticated",
            user: {
                ...req.user,
                accountStatus: req.user.isActive ? "active" : "inactive",
                platformAdmin: req.user.isAdmin === true,
                projectMemberships: memberships.map((m) => ({
                    projectId: m.project_id,
                    projectName: m.project_name,
                    roleId: m.role_id,
                    roleCode: m.role_code,
                    roleName: m.role_name,
                    isActive: m.is_active === true,
                    joinedAt: m.joined_at,
                })),
                permissions,
                portalAccess,
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Role and permission endpoints
app.get("/api/v1/roles", async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM role_catalog WHERE is_active = true");
        const { rows: perms } = await req.db.query("SELECT * FROM permissions WHERE is_active = true");
        res.json({ roles: rows, permissions: perms });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Contract Program management
app.get("/api/v1/contract-programs", async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM contract_programs WHERE is_active = true ORDER BY created_at DESC");
        res.json({ contractPrograms: rows });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get("/api/v1/contract-programs/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await req.db.query("SELECT * FROM contract_programs WHERE id = $1::uuid AND is_active = true", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: "Contract Program not found" });
        }
        res.json({ contractProgram: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/contract-programs", async (req, res) => {
    const { name, description, buyerId, contractId, settlementUnit, targetQuantity, cadence, generationMode } = req.body;
    if (!name || !settlementUnit || !targetQuantity || !cadence || !generationMode) {
        return res.status(400).json({ error: "Required fields: name, settlementUnit, targetQuantity, cadence, generationMode" });
    }
    try {
        const { rows } = await req.db.query("INSERT INTO contract_programs (name, description, buyer_id, contract_id, settlement_unit, target_quantity, cadence, generation_mode, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, now(), now()) RETURNING *", [name, description || null, buyerId || null, contractId || null, settlementUnit, targetQuantity, cadence, generationMode]);
        res.status(201).json({ contractProgram: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Buyer management
app.get("/api/v1/buyers", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM buyers WHERE is_active = true ORDER BY created_at DESC");
        res.json({ buyers: rows });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/buyers", requireAuth, async (req, res) => {
    const { name, code, countryCode } = req.body;
    if (!name)
        return res.status(400).json({ error: "name required" });
    try {
        const { rows } = await req.db.query("INSERT INTO buyers (name, code, country_code, is_active, created_at, updated_at) VALUES ($1, $2, $3, true, now(), now()) RETURNING *", [name, code || null, countryCode || null]);
        res.status(201).json({ buyer: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.patch("/api/v1/buyers/:id", requireAuth, async (req, res) => {
    const { name, code, countryCode, isActive } = req.body;
    try {
        const { rows } = await req.db.query(`UPDATE buyers SET
         name = COALESCE($2, name),
         code = COALESCE($3, code),
         country_code = COALESCE($4, country_code),
         is_active = COALESCE($5, is_active),
         updated_at = now()
       WHERE id = $1::uuid RETURNING *`, [req.params.id, name ?? null, code ?? null, countryCode ?? null, typeof isActive === "boolean" ? isActive : null]);
        if (rows.length === 0)
            return res.status(404).json({ error: "Buyer not found" });
        res.json({ buyer: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Contract management
app.get("/api/v1/contracts", requireAuth, async (req, res) => {
    try {
        const buyerId = req.query.buyerId;
        const params = [];
        let sql = "SELECT * FROM contracts WHERE is_active = true";
        if (buyerId) {
            sql += " AND buyer_id = $1::uuid";
            params.push(buyerId);
        }
        sql += " ORDER BY created_at DESC";
        const { rows } = await req.db.query(sql, params);
        res.json({ contracts: rows });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/contracts", requireAuth, async (req, res) => {
    const { buyerId, code, name, startDate, endDate } = req.body;
    if (!buyerId || !code || !name || !startDate)
        return res.status(400).json({ error: "buyerId, code, name, startDate required" });
    try {
        const { rows } = await req.db.query("INSERT INTO contracts (buyer_id, code, name, start_date, end_date, is_active, created_at, updated_at) VALUES ($1::uuid, $2, $3, $4::timestamptz, $5::timestamptz, true, now(), now()) RETURNING *", [buyerId, code, name, startDate, endDate || null]);
        res.status(201).json({ contract: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Cycle Policy management
app.get("/api/v1/cycle-policies", async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM cycle_policies WHERE is_active = true ORDER BY created_at DESC");
        res.json({ cyclePolicies: rows });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/cycle-policies", async (req, res) => {
    const { contractProgramId, cadence, targetQuantity, generationMode } = req.body;
    if (!contractProgramId || !cadence || !generationMode) {
        return res.status(400).json({ error: "Required fields: contractProgramId, cadence, generationMode" });
    }
    try {
        const { rows } = await req.db.query("INSERT INTO cycle_policies (contract_program_id, cadence, target_quantity, generation_mode, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, true, now(), now()) RETURNING *", [contractProgramId, cadence, targetQuantity || null, generationMode]);
        res.status(201).json({ cyclePolicy: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Project management
app.get("/api/v1/projects", async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM projects WHERE is_active = true ORDER BY created_at DESC");
        res.json({ projects: rows });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get("/api/v1/projects/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await req.db.query("SELECT * FROM projects WHERE id = $1::uuid AND is_active = true", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: "Project not found" });
        }
        res.json({ project: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/projects", async (req, res) => {
    const { contractProgramId, name, description, status, settlementUnit, targetQuantity } = req.body;
    if (!contractProgramId || !name || !settlementUnit || !targetQuantity) {
        return res.status(400).json({ error: "Required fields: contractProgramId, name, settlementUnit, targetQuantity" });
    }
    try {
        const { rows } = await req.db.query("INSERT INTO projects (contract_program_id, name, description, status, settlement_unit, target_quantity, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, true, now(), now()) RETURNING *", [contractProgramId, name, description || null, status || "draft", settlementUnit, targetQuantity]);
        res.status(201).json({ project: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Project operating profile (module configuration)
app.get("/api/v1/projects/:projectId/operating-profile", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM project_operating_profiles WHERE project_id = $1::uuid", [req.params.projectId]);
        if (rows.length === 0)
            return res.status(404).json({ error: "Operating profile not found" });
        res.json({ operatingProfile: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.put("/api/v1/projects/:projectId/operating-profile", requireAuth, async (req, res) => {
    const { logisticsMode, usesTrucking, pksOwnsOrControlsPort, financingEnabled, financierReportingRequired, primaryPksSiteId, primaryPortId, operatingNotes, configuration } = req.body;
    try {
        const { rows } = await req.db.query(`INSERT INTO project_operating_profiles (project_id, logistics_mode, uses_trucking, pks_owns_or_controls_port, financing_enabled, financier_reporting_required, primary_pks_site_id, primary_port_id, operating_notes, configuration, updated_by, created_at, updated_at)
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
       RETURNING *`, [req.params.projectId, logisticsMode || "direct", usesTrucking === true, pksOwnsOrControlsPort === true, financingEnabled === true, financierReportingRequired === true, primaryPksSiteId || null, primaryPortId || null, operatingNotes || null, JSON.stringify(configuration || {}), req.user?.id || null]);
        res.json({ operatingProfile: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// Project-scoped permission helper
// ============================================
async function requireProjectPermission(req, res, projectId, permissionCode) {
    const pid = Array.isArray(projectId) ? projectId[0] : projectId;
    const { rows } = await req.db.query("SELECT public.pke_has_project_permission($1::uuid, $2::text) AS has_perm", [pid, permissionCode]);
    if (!rows[0]?.has_perm) {
        res.status(403).json({ error: "Forbidden - project permission required", code: "PROJECT_PERMISSION_REQUIRED" });
        return false;
    }
    return true;
}
async function getProjectOr404(req, res, projectId) {
    const pid = Array.isArray(projectId) ? projectId[0] : projectId;
    const { rows } = await req.db.query("SELECT * FROM projects WHERE id = $1::uuid", [pid]);
    if (rows.length === 0) {
        res.status(404).json({ error: "Project not found" });
        return null;
    }
    return rows[0];
}
function defaultPermissionsForRole(roleCode) {
    const base = ["project.view"];
    const byRole = {
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
app.post("/api/v1/contract-programs", requireAuth, async (req, res) => {
    const { name, buyerId, contractId, settlementUnit, targetQuantity, cadence, generationMode, description } = req.body;
    if (!name || !settlementUnit || !targetQuantity || !cadence) {
        return res.status(400).json({ error: "Required fields: name, settlementUnit, targetQuantity, cadence" });
    }
    try {
        const { rows } = await req.db.query(`INSERT INTO contract_programs
        (name, buyer_id, contract_id, settlement_unit, target_quantity, cadence, generation_mode, description, is_active, created_at, updated_at)
       VALUES ($1::text, $2::uuid, $3::uuid, $4::text, $5::numeric, $6::text, $7::text, $8::text, true, now(), now())
       RETURNING *`, [name, buyerId || null, contractId || null, settlementUnit, targetQuantity, cadence, generationMode || "scheduled_draft", description || null]);
        res.status(201).json({ contractProgram: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.patch("/api/v1/contract-programs/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { name, buyerId, contractId, settlementUnit, targetQuantity, cadence, generationMode, description, isActive } = req.body;
    try {
        const { rows } = await req.db.query(`UPDATE contract_programs
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
       RETURNING *`, [id, name || null, buyerId || null, contractId || null, settlementUnit || null, targetQuantity || null, cadence || null, generationMode || null, description || null, isActive !== undefined ? isActive : null]);
        if (rows.length === 0)
            return res.status(404).json({ error: "Contract program not found" });
        res.json({ contractProgram: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// Project create (transaction: project + contract program + roles + module config)
// ============================================
app.post("/api/v1/projects", requireAuth, async (req, res) => {
    const { contractProgramId, name, description, status, settlementUnit, targetQuantity, exportCountryCode, createContractProgram } = req.body;
    if (!name || !settlementUnit || targetQuantity === undefined || !targetQuantity) {
        return res.status(400).json({ error: "Required fields: name, settlementUnit, targetQuantity" });
    }
    const userId = req.user?.id;
    if (!userId)
        return res.status(401).json({ error: "Authenticated user required" });
    let client;
    try {
        client = await req.db.pool ? req.db.pool.connect() : null;
        const dbClient = client || req.db;
        if (client)
            await client.query("BEGIN");
        try {
            let programId = contractProgramId || null;
            if (!programId && createContractProgram) {
                const cpName = createContractProgram.name || `${name} Program`;
                const cpRows = await dbClient.query(`INSERT INTO contract_programs
            (name, buyer_id, contract_id, settlement_unit, target_quantity, cadence, generation_mode, is_active, created_at, updated_at)
           VALUES ($1::text, $2::uuid, $3::uuid, $4::text, $5::numeric, $6::text, 'scheduled_draft', true, now(), now())
           RETURNING id`, [cpName, createContractProgram.buyerId || null, createContractProgram.contractId || null,
                    settlementUnit, targetQuantity, createContractProgram.cadence || "scheduled"]);
                programId = cpRows.rows[0].id;
            }
            if (!programId) {
                throw new Error("Contract program is required (existing or new).");
            }
            const { rows: projectRows } = await dbClient.query(`INSERT INTO projects
          (contract_program_id, name, description, status, settlement_unit, target_quantity,
           export_country_code, is_active, created_at, updated_at)
         VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::text, $6::numeric, $7::text, true, now(), now())
         RETURNING *`, [programId, name, description || null, status || "draft", settlementUnit, targetQuantity, exportCountryCode || null]);
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
            await dbClient.query(`INSERT INTO project_operating_profiles
          (project_id, logistics_mode, uses_trucking, pks_owns_or_controls_port, financing_enabled,
           financier_reporting_required, configuration, updated_by, created_at, updated_at)
         VALUES ($1::uuid, 'unspecified', false, false, false, false, $2::jsonb, $3::uuid, now(), now())
         ON CONFLICT (project_id) DO NOTHING`, [projectId, JSON.stringify(defaultConfiguration), userId]);
            const { rows: roleTemplates } = await dbClient.query("SELECT id, name, description FROM role_catalog WHERE is_active = true ORDER BY name");
            const createdRoles = [];
            for (const tmpl of roleTemplates) {
                const { rows: roleRows } = await dbClient.query(`INSERT INTO project_roles (project_id, role_code, name, description, is_active, created_by, created_at, updated_at)
           VALUES ($1::uuid, $2::text, $3::text, $4::text, true, $5::uuid, now(), now())
           RETURNING id`, [projectId, tmpl.name, tmpl.name, tmpl.description || null, userId]);
                const projectRoleId = roleRows[0].id;
                createdRoles.push({ projectRoleId, roleCode: tmpl.name, name: tmpl.name });
                const defaultPerms = defaultPermissionsForRole(tmpl.name);
                for (const permCode of defaultPerms) {
                    const { rows: permRows } = await dbClient.query("SELECT id FROM permissions WHERE code = $1::text AND is_active = true LIMIT 1", [permCode]);
                    if (permRows.length > 0) {
                        await dbClient.query(`INSERT INTO project_role_permissions (project_id, project_role_id, permission_id, granted_by, granted_at)
               VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, now())
               ON CONFLICT (project_role_id, permission_id) DO NOTHING`, [projectId, projectRoleId, permRows[0].id, userId]);
                    }
                }
            }
            const adminRole = createdRoles.find((r) => r.roleCode === "admin");
            if (adminRole) {
                await dbClient.query(`INSERT INTO project_members (project_id, user_id, project_role_id, role_id, joined_at, is_active, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $2::uuid, now(), true, now(), now())
           ON CONFLICT (project_id, user_id) DO NOTHING`, [projectId, userId, adminRole.projectRoleId]);
            }
            if (client)
                await client.query("COMMIT");
            res.status(201).json({ project, roles: createdRoles });
            return;
        }
        catch (error) {
            if (client)
                await client.query("ROLLBACK").catch(() => { });
            throw error;
        }
        finally {
            if (client)
                client.release();
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Financial Engine endpoints
// RAB management
app.get("/api/v1/rab", async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM rab WHERE is_active = true ORDER BY created_at DESC");
        res.json({ rab: rows });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/rab", async (req, res) => {
    const { projectId, description, amount, category } = req.body;
    if (!projectId || !description || !amount) {
        return res.status(400).json({ error: "Required fields: projectId, description, amount" });
    }
    try {
        const { rows } = await req.db.query("INSERT INTO rab (project_id, description, amount, category, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, true, now(), now()) RETURNING *", [projectId, description, amount, category || "fixed"]);
        res.status(201).json({ rab: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// FX rates management
app.get("/api/v1/fx-rates", async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM fx_rates WHERE is_active = true ORDER BY rate_date DESC");
        res.json({ fxRates: rows });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/fx-rates", async (req, res) => {
    const { fromCurrency, toCurrency, rate, rateType, source, effectiveDate } = req.body;
    if (!fromCurrency || !toCurrency || !rate) {
        return res.status(400).json({ error: "Required fields: fromCurrency, toCurrency, rate" });
    }
    try {
        const { rows } = await req.db.query("INSERT INTO fx_rates (from_currency, to_currency, rate, rate_type, source, effective_date, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, true, now(), now()) RETURNING *", [fromCurrency, toCurrency, rate, rateType || "reference", source || null, effectiveDate || null]);
        res.status(201).json({ fxRate: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// FX exposure management
app.get("/api/v1/fx-exposure", async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM fx_exposure ORDER BY created_at DESC");
        res.json({ fxExposure: rows });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/fx-exposure", async (req, res) => {
    const { projectId, amountIdr, amountFx, fxRate, exposureType } = req.body;
    if (!projectId || !amountIdr) {
        return res.status(400).json({ error: "Required fields: projectId, amountIdr" });
    }
    try {
        const { rows } = await req.db.query("INSERT INTO fx_exposure (project_id, amount_idr, amount_fx, fx_rate, exposure_type, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, 'open', now(), now()) RETURNING *", [projectId, amountIdr, amountFx || null, fxRate || null, exposureType || "open"]);
        res.status(201).json({ fxExposure: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// Graceful shutdown
// ============================================
process.on("SIGTERM", async () => {
    logger.info("SIGTERM received. Shutting down gracefully...");
    try {
        await pool.end();
        logger.info("Database pool closed");
    }
    catch (err) {
        logger.error("Error closing database pool:", err);
    }
    process.exit(0);
});
process.on("SIGINT", async () => {
    logger.info("SIGINT received. Shutting down gracefully...");
    try {
        await pool.end();
        logger.info("Database pool closed");
    }
    catch (err) {
        logger.error("Error closing database pool:", err);
    }
    process.exit(0);
});
// ============================================
// Phase 5: Export Compliance Endpoints
// ============================================
// Regulatory knowledge base - Admin only
app.get("/api/v1/regulatory-knowledge", requireAuth, requireAdmin, async (req, res) => {
    try {
        // In production, this would query a regulatory knowledge base
        const knowledge = [
            { country: "China", requirements: "Import permit, phytoosanitary certificate, FDA registration", status: "active" },
            { country: "Pakistan", requirements: "No objection certificate, quality certificate, weight certificate", status: "active" },
            { country: "Indonesia", requirements: "Import license, health certificate, packing list", status: "pending" }
        ];
        res.json({ regulatoryKnowledge: knowledge });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Document registry - Admin only
app.post("/api/v1/documents", requireAuth, requireAdmin, async (req, res) => {
    const { documentType, documentName, description, relatedEntityId, relatedEntityType, expiryDate } = req.body;
    if (!documentType || !documentName) {
        return res.status(400).json({ error: "Required fields: documentType, documentName" });
    }
    try {
        const { rows } = await req.db.query("INSERT INTO document_registry (document_type, document_name, description, related_entity_id, related_entity_type, expiry_date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, now(), now()) RETURNING *", [documentType, documentName, description || null, relatedEntityId || null, relatedEntityType || null, expiryDate || null]);
        res.status(201).json({ document: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get("/api/v1/documents", requireAuth, requireAdmin, async (req, res) => {
    try {
        let rows = [];
        try {
            const result = await req.db.query("SELECT * FROM document_registry ORDER BY created_at DESC");
            rows = result.rows;
        }
        catch (e) {
            rows = [];
        }
        res.json({ documents: rows });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Compliance engine - Admin only
app.post("/api/v1/compliance-check", requireAuth, requireAdmin, async (req, res) => {
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Country pack requirements - Admin only
app.get("/api/v1/country-packs", requireAuth, requireAdmin, async (req, res) => {
    try {
        // Placeholder country pack data
        const countryPacks = [
            { country: "China", packName: "China PKE Standard", requirements: ["Import permit", "Phytoosanitary certificate", "FDA registration"], taxRate: 0.13 },
            { country: "Pakistan", packName: "Pakistan PKE Standard", requirements: ["NOC", "Quality certificate", "Weight certificate"], taxRate: 0.08 },
            { country: "Indonesia", packName: "Indonesia PKE Standard", requirements: ["Import license", "Health certificate", "Packing list"], taxRate: 0.10 }
        ];
        res.json({ countryPacks });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Project workflow management
app.get("/api/v1/workflows/project/:projectId", requireAuth, async (req, res) => {
    try {
        const projectId = req.params.projectId;
        const workflows = await req.drizzleDb.select().from(schema.project_workflows).where(eq(schema.project_workflows.project_id, projectId));
        res.json({ workflows });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/workflows", requireAuth, async (req, res) => {
    try {
        const { projectId, workflowTemplateId, version } = req.body;
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// Graceful shutdown
// ============================================
process.on("SIGTERM", async () => {
    logger.info("SIGTERM received. Shutting down gracefully...");
    try {
        await pool.end();
        logger.info("Database pool closed");
    }
    catch (err) {
        logger.error("Error closing database pool:", err);
    }
    process.exit(0);
});
process.on("SIGINT", async () => {
    logger.info("SIGINT received. Shutting down gracefully...");
    try {
        await pool.end();
        logger.info("Database pool closed");
    }
    catch (err) {
        logger.error("Error closing database pool:", err);
    }
    process.exit(0);
});
// ============================================
// Sprint 02E — Reporting, Notifications & BI
// ============================================
const notificationsStore = [];
const reportTemplatesStore = [
    { id: "tpl-daily-ops", name: "Daily Operations Report", category: "Operational", version: 1, active: true, audience: "internal", frequency: "daily" },
    { id: "tpl-weekly-rab", name: "Weekly RAB vs Actual", category: "Financial", version: 1, active: true, audience: "finance", frequency: "weekly" },
    { id: "tpl-buyer-progress", name: "Buyer Progress Summary", category: "Shipment", version: 1, active: true, audience: "buyer", frequency: "daily" },
];
const reportRunsStore = [];
app.get("/api/v1/kpis", requireAuth, async (req, res) => {
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
app.get("/api/v1/reports/portfolio", requireAuth, async (req, res) => {
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get("/api/v1/reports/project/:projectId", requireAuth, async (req, res) => {
    const { projectId } = req.params;
    try {
        const { rows: projectRows } = await req.db.query("SELECT * FROM projects WHERE id = $1::uuid", [projectId]);
        if (projectRows.length === 0)
            return res.status(404).json({ error: "Project not found" });
        const { rows: tripRows } = await req.db.query("SELECT COUNT(*)::int AS count FROM truck_trips WHERE project_id = $1::uuid", [projectId]);
        const { rows: rabRows } = await req.db.query("SELECT COALESCE(SUM(amount),0) AS budget FROM rab WHERE project_id = $1::uuid", [projectId]);
        res.json({
            project: projectRows[0],
            truckTrips: tripRows[0]?.count ?? 0,
            approvedBudget: rabRows[0]?.budget ?? 0,
            dataFreshness: new Date().toISOString(),
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get("/api/v1/reports/templates", requireAuth, async (req, res) => {
    res.json({ templates: reportTemplatesStore });
});
app.get("/api/v1/reports/runs", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM report_runs ORDER BY generated_at DESC LIMIT 200");
        const runs = rows.map((r) => ({
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
        }));
        res.json({ runs });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/reports/generate", requireAuth, async (req, res) => {
    const { templateId, projectId, cutoff } = req.body;
    if (!templateId)
        return res.status(400).json({ error: "templateId required" });
    try {
        const templateVersion = reportTemplatesStore.find((t) => t.id === templateId)?.version || 1;
        const cutoffAt = cutoff || new Date().toISOString();
        const { rows } = await req.db.query(`INSERT INTO report_runs (id, schedule_id, template_id, template_version, cutoff_at, generated_at, requested_by, audience, project_id, status, idempotency_key, data_freshness)
       VALUES (gen_random_uuid(), NULL, $1, $2, $3::timestamptz, now(), $4::uuid, 'internal', $5::uuid, 'completed', NULL, now())
       RETURNING *`, [templateId, templateVersion, cutoffAt, req.user?.id || null, projectId || null]);
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
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get("/api/v1/notifications", requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id;
        const { rows } = await req.db.query(`SELECT id, event_id, project_id, recipient_user_id, created_by, title, message, priority, category, read_at, created_at
         FROM user_notifications
        WHERE recipient_user_id = $1::uuid
        ORDER BY created_at DESC`, [userId]);
        const notifications = rows.map((r) => ({
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
        res.json({ notifications, unreadCount: notifications.filter((n) => !n.readAt).length });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/notifications", requireAuth, async (req, res) => {
    const { recipient, title, message, priority, category, projectId } = req.body;
    if (!title || !message)
        return res.status(400).json({ error: "title and message required" });
    try {
        const recipientId = recipient || req.user?.id;
        const eventId = crypto.randomUUID();
        const { rows } = await req.db.query(`INSERT INTO user_notifications (id, event_id, project_id, recipient_user_id, created_by, title, message, priority, category, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, now())
       RETURNING *`, [eventId, projectId || null, recipientId, req.user?.id, title, message, priority || "normal", category || "system"]);
        const r = rows[0];
        await req.db.query(`INSERT INTO notification_deliveries (id, notification_id, channel, status, attempt_count, created_at)
       VALUES (gen_random_uuid(), $1::uuid, 'in_app', 'delivered', 1, now())`, [r.id]);
        const notification = {
            id: r.id,
            eventId: r.event_id,
            recipient: r.recipient_user_id,
            title: r.title,
            message: r.message,
            priority: r.priority,
            category: r.category,
            projectId: r.project_id,
            createdAt: r.created_at,
            readAt: r.read_at,
            deliveryStatus: "delivered",
            retryCount: 0,
            templateVersion: 1,
        };
        res.status(201).json({ notification });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.patch("/api/v1/notifications/:id/read", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query(`UPDATE user_notifications SET read_at = now() WHERE id = $1::uuid AND recipient_user_id = $2::uuid RETURNING *`, [req.params.id, req.user?.id]);
        if (rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        const r = rows[0];
        res.json({ notification: { id: r.id, eventId: r.event_id, projectId: r.project_id, recipient: r.recipient_user_id, title: r.title, message: r.message, priority: r.priority, category: r.category, createdAt: r.created_at, readAt: r.read_at, deliveryStatus: "delivered" } });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get("/api/v1/reports/export/projects", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT id, name, status, settlement_unit, target_quantity FROM projects WHERE is_active = true");
        const header = "id,name,status,settlement_unit,target_quantity";
        const body = rows.map((r) => [r.id, r.name, r.status, r.settlement_unit, r.target_quantity].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=projects.csv");
        res.send(header + "\n" + body);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// Sprint 02E Finalization — Backend KPI Authority
// ============================================
app.get("/api/v1/reports/kpis/operational", requireAuth, async (req, res) => {
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get("/api/v1/reports/kpis/financial", requireAuth, async (req, res) => {
    try {
        const { rows: rabRows } = await req.db.query("SELECT COALESCE(SUM(amount),0) AS budget FROM rab WHERE is_active = true");
        const { rows: fxRows } = await req.db.query("SELECT COUNT(*)::int AS count FROM fx_exposure");
        res.json({
            kpis: [
                { id: "approved_budget", name: "Approved Budget", value: rabRows[0]?.budget ?? 0, unit: "currency", formula: "sum(rab.amount)", source: "rab", currency: "IDR", dataCutoff: new Date().toISOString() },
                { id: "fx_exposure_count", name: "FX Exposure Records", value: fxRows[0]?.count ?? 0, unit: "count", formula: "count(fx_exposure)", source: "fx_exposure", dataCutoff: new Date().toISOString() },
            ],
            dataFreshness: new Date().toISOString(),
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get("/api/v1/reports/historical", requireAuth, async (req, res) => {
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Durable scheduler endpoints (DB-backed via migration 016; in-memory fallback for runtime)
const scheduleStore = [];
const scheduleRunStore = [];
app.get("/api/v1/reports/schedules", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM report_schedules ORDER BY created_at DESC");
        const schedules = rows.map((r) => ({
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/reports/schedules", requireAuth, async (req, res) => {
    const { templateId, frequency, timezone, executionTime, projectId, channel } = req.body;
    if (!templateId || !frequency)
        return res.status(400).json({ error: "templateId and frequency required" });
    try {
        const nextExecutionAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const { rows } = await req.db.query(`INSERT INTO report_schedules (id, template_id, template_version, audience, recipient_user_id, project_id, frequency, timezone, execution_time, cutoff_policy, channel, approval_required, status, next_execution_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 1, 'internal', $2::uuid, $3::uuid, $4, $5, $6::time, 'latest', $7, false, 'active', $8::timestamptz, now(), now())
       RETURNING *`, [templateId, req.user?.id || null, projectId || null, frequency, timezone || "Asia/Jakarta", executionTime || "06:00", channel || "in_app", nextExecutionAt]);
        const r = rows[0];
        res.status(201).json({
            schedule: {
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
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/reports/scheduler/run-due", requireAuth, async (req, res) => {
    try {
        const now = new Date();
        const { rows: schedules } = await req.db.query("SELECT * FROM report_schedules WHERE status = 'active' AND next_execution_at <= $1", [now]);
        const executed = [];
        for (const s of schedules) {
            const idempotencyKey = `${s.id}-${s.next_execution_at}`;
            const { rows: existing } = await req.db.query("SELECT id FROM report_runs WHERE idempotency_key = $1", [idempotencyKey]);
            if (existing.length > 0)
                continue;
            const { rows } = await req.db.query(`INSERT INTO report_runs (id, schedule_id, template_id, template_version, cutoff_at, generated_at, requested_by, audience, project_id, status, idempotency_key, data_freshness)
         VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4::timestamptz, now(), $5::uuid, $6, $7::uuid, 'completed', $8, now())
         RETURNING *`, [s.id, s.template_id, s.template_version, s.next_execution_at, req.user?.id || null, s.audience, s.project_id, idempotencyKey]);
            const r = rows[0];
            await req.db.query("UPDATE report_schedules SET last_execution_at = now(), next_execution_at = now() + interval '1 day', updated_at = now() WHERE id = $1::uuid", [s.id]);
            executed.push({ id: r.id, scheduleId: r.schedule_id, templateId: r.template_id, status: r.status, generatedAt: r.generated_at, idempotencyKey: r.idempotency_key });
        }
        res.json({ executedCount: executed.length, executed });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get("/api/v1/reports/scheduler/runs", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM report_runs WHERE schedule_id IS NOT NULL ORDER BY generated_at DESC LIMIT 200");
        res.json({ runs: rows.map((r) => ({ id: r.id, scheduleId: r.schedule_id, templateId: r.template_id, templateVersion: r.template_version, cutoff: r.cutoff_at, status: r.status, generatedAt: r.generated_at, idempotencyKey: r.idempotency_key, dataFreshness: r.data_freshness })) });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Provider status
app.get("/api/v1/notifications/providers", requireAuth, async (req, res) => {
    res.json({
        email: "not_configured",
        sms: "not_configured",
        whatsapp: "not_configured",
        inApp: "configured",
    });
});
// Export audit
app.post("/api/v1/reports/export/audit", requireAuth, async (req, res) => {
    res.status(201).json({ status: "recorded", timestamp: new Date().toISOString() });
});
// ============================================
// Project edit
// ============================================
app.patch("/api/v1/projects/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { rows: projRows } = await req.db.query("SELECT * FROM projects WHERE id = $1::uuid", [id]);
    if (projRows.length === 0)
        return res.status(404).json({ error: "Project not found" });
    const { rows: permRows } = await req.db.query("SELECT public.pke_has_project_permission($1::uuid, $2::text) AS has_perm, public.pke_is_platform_admin() AS is_admin", [id, 'project.configuration.manage']);
    if (!permRows[0]?.has_perm && !permRows[0]?.is_admin) {
        return res.status(403).json({ error: "Forbidden", code: "PROJECT_PERMISSION_REQUIRED" });
    }
    const { name, description, status, settlementUnit, targetQuantity, exportCountryCode, isActive } = req.body;
    try {
        const { rows } = await req.db.query(`UPDATE projects
        SET name = COALESCE($2::text, name),
            description = COALESCE($3::text, description),
            status = COALESCE($4::text, status),
            settlement_unit = COALESCE($5::text, settlement_unit),
            target_quantity = COALESCE($6::numeric, target_quantity),
            export_country_code = COALESCE($7::text, export_country_code),
            is_active = COALESCE($8::boolean, is_active),
            updated_at = now()
       WHERE id = $1::uuid
       RETURNING *`, [id, name || null, description || null, status || null, settlementUnit || null, targetQuantity || null, exportCountryCode || null, isActive !== undefined ? isActive : null]);
        res.json({ project: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// Project archive
// ============================================
app.post("/api/v1/projects/:id/archive", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { rows: projRows } = await req.db.query("SELECT * FROM projects WHERE id = $1::uuid", [id]);
    if (projRows.length === 0)
        return res.status(404).json({ error: "Project not found" });
    const { rows: permRows } = await req.db.query("SELECT public.pke_has_project_permission($1::uuid, $2::text) AS has_perm, public.pke_is_platform_admin() AS is_admin", [id, 'project.configuration.manage']);
    if (!permRows[0]?.has_perm && !permRows[0]?.is_admin) {
        return res.status(403).json({ error: "Forbidden", code: "PROJECT_PERMISSION_REQUIRED" });
    }
    try {
        await req.db.query("UPDATE projects SET is_active = false, status = 'closed', updated_at = now() WHERE id = $1::uuid", [id]);
        res.json({ ok: true, message: "Project archived" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// Project activate / deactivate
// ============================================
app.post("/api/v1/projects/:id/activate", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { rows: projRows } = await req.db.query("SELECT * FROM projects WHERE id = $1::uuid", [id]);
    if (projRows.length === 0)
        return res.status(404).json({ error: "Project not found" });
    const { rows: permRows } = await req.db.query("SELECT public.pke_has_project_permission($1::uuid, $2::text) AS has_perm, public.pke_is_platform_admin() AS is_admin", [id, 'project.configuration.manage']);
    if (!permRows[0]?.has_perm && !permRows[0]?.is_admin) {
        return res.status(403).json({ error: "Forbidden", code: "PROJECT_PERMISSION_REQUIRED" });
    }
    const { rows: profileRows } = await req.db.query("SELECT configuration FROM project_operating_profiles WHERE project_id = $1::uuid", [id]);
    if (profileRows.length === 0) {
        return res.status(400).json({ error: "Module configuration is required before activation", code: "MODULE_CONFIG_REQUIRED" });
    }
    try {
        await req.db.query("UPDATE projects SET status = 'active', is_active = true, updated_at = now() WHERE id = $1::uuid", [id]);
        res.json({ ok: true, message: "Project activated" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/projects/:id/deactivate", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { rows: projRows } = await req.db.query("SELECT * FROM projects WHERE id = $1::uuid", [id]);
    if (projRows.length === 0)
        return res.status(404).json({ error: "Project not found" });
    const { rows: permRows } = await req.db.query("SELECT public.pke_has_project_permission($1::uuid, $2::text) AS has_perm, public.pke_is_platform_admin() AS is_admin", [id, 'project.configuration.manage']);
    if (!permRows[0]?.has_perm && !permRows[0]?.is_admin) {
        return res.status(403).json({ error: "Forbidden", code: "PROJECT_PERMISSION_REQUIRED" });
    }
    try {
        await req.db.query("UPDATE projects SET status = 'draft', is_active = false, updated_at = now() WHERE id = $1::uuid", [id]);
        res.json({ ok: true, message: "Project deactivated" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// Project detail (full): members, roles, permissions, module config
// ============================================
app.get("/api/v1/projects/:id/detail", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { rows: projRows } = await req.db.query("SELECT * FROM projects WHERE id = $1::uuid", [id]);
    if (projRows.length === 0)
        return res.status(404).json({ error: "Project not found" });
    const { rows: members } = await req.db.query(`SELECT pm.id, pm.user_id, u.email, u.name, pm.project_role_id, pr.role_code, pr.name AS role_name,
            pm.is_active, pm.joined_at, pm.expires_at
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       LEFT JOIN project_roles pr ON pr.id = pm.project_role_id AND pr.project_id = pm.project_id
      WHERE pm.project_id = $1::uuid
      ORDER BY pr.role_code, u.email`, [id]);
    const { rows: roles } = await req.db.query(`SELECT pr.id, pr.role_code, pr.name, pr.description, pr.is_active,
            (SELECT jsonb_agg(perm.code) FROM project_role_permissions prp
             JOIN permissions perm ON perm.id = prp.permission_id
             WHERE prp.project_role_id = pr.id AND perm.is_active = true) AS permissions
       FROM project_roles pr
      WHERE pr.project_id = $1::uuid
      ORDER BY pr.role_code`, [id]);
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
app.get("/api/v1/projects/:id/roles", requireAuth, async (req, res) => {
    const { id } = req.params;
    const allowed = await requireProjectPermission(req, res, id, 'project.roles.manage');
    if (!allowed)
        return;
    const { rows } = await req.db.query(`SELECT pr.id, pr.role_code, pr.name, pr.description, pr.is_active, pr.created_at
       FROM project_roles pr
      WHERE pr.project_id = $1::uuid
      ORDER BY pr.role_code`, [id]);
    res.json({ roles: rows });
});
app.post("/api/v1/projects/:id/roles", requireAuth, async (req, res) => {
    const { id } = req.params;
    const allowed = await requireProjectPermission(req, res, id, 'project.roles.manage');
    if (!allowed)
        return;
    const { roleCode, name, description, templateRoleCode } = req.body;
    if (!roleCode || !name) {
        return res.status(400).json({ error: "Required fields: roleCode, name" });
    }
    const userId = req.user?.id;
    try {
        const { rows: roleRows } = await req.db.query(`INSERT INTO project_roles (project_id, role_code, name, description, is_active, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::text, $3::text, $4::text, true, $5::uuid, now(), now())
       RETURNING id`, [id, roleCode, name, description || null, userId]);
        const projectRoleId = roleRows[0].id;
        if (templateRoleCode) {
            const perms = defaultPermissionsForRole(templateRoleCode);
            for (const permCode of perms) {
                const { rows: permRows } = await req.db.query("SELECT id FROM permissions WHERE code = $1::text AND is_active = true LIMIT 1", [permCode]);
                if (permRows.length > 0) {
                    await req.db.query(`INSERT INTO project_role_permissions (project_id, project_role_id, permission_id, granted_by, granted_at)
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, now())
             ON CONFLICT (project_role_id, permission_id) DO NOTHING`, [id, projectRoleId, permRows[0].id, userId]);
                }
            }
        }
        res.status(201).json({ role: { id: projectRoleId, roleCode, name, description } });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.patch("/api/v1/projects/:id/roles/:roleId", requireAuth, async (req, res) => {
    const { id, roleId } = req.params;
    const allowed = await requireProjectPermission(req, res, id, 'project.roles.manage');
    if (!allowed)
        return;
    const { name, description, isActive } = req.body;
    try {
        const { rows } = await req.db.query(`UPDATE project_roles
        SET name = COALESCE($3::text, name),
            description = COALESCE($4::text, description),
            is_active = COALESCE($5::boolean, is_active),
            updated_at = now()
       WHERE id = $2::uuid AND project_id = $1::uuid
       RETURNING *`, [id, roleId, name || null, description || null, isActive !== undefined ? isActive : null]);
        if (rows.length === 0)
            return res.status(404).json({ error: "Role not found" });
        res.json({ role: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.delete("/api/v1/projects/:id/roles/:roleId", requireAuth, async (req, res) => {
    const { id, roleId } = req.params;
    const allowed = await requireProjectPermission(req, res, id, 'project.roles.manage');
    if (!allowed)
        return;
    try {
        const { rows } = await req.db.query("DELETE FROM project_roles WHERE id = $2::uuid AND project_id = $1::uuid RETURNING id", [id, roleId]);
        if (rows.length === 0)
            return res.status(404).json({ error: "Role not found" });
        res.json({ ok: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get("/api/v1/projects/:id/roles/:roleId/permissions", requireAuth, async (req, res) => {
    const { id, roleId } = req.params;
    const allowed = await requireProjectPermission(req, res, id, 'project.roles.manage');
    if (!allowed)
        return;
    const { rows } = await req.db.query(`SELECT perm.code, perm.name, perm.description
       FROM project_role_permissions prp
       JOIN permissions perm ON perm.id = prp.permission_id
      WHERE prp.project_role_id = $2::uuid AND prp.project_id = $1::uuid AND perm.is_active = true
      ORDER BY perm.code`, [id, roleId]);
    res.json({ permissions: rows });
});
app.put("/api/v1/projects/:id/roles/:roleId/permissions", requireAuth, async (req, res) => {
    const { id, roleId } = req.params;
    const allowed = await requireProjectPermission(req, res, id, 'project.roles.manage');
    if (!allowed)
        return;
    const { permissionCodes } = req.body;
    if (!Array.isArray(permissionCodes)) {
        return res.status(400).json({ error: "permissionCodes array required" });
    }
    const userId = req.user?.id;
    const { rows: validPerms } = await req.db.query("SELECT code FROM permissions WHERE is_active = true AND code = ANY($1::text[])", [permissionCodes]);
    const validCodes = new Set(validPerms.map((r) => r.code));
    const invalid = permissionCodes.filter((c) => !validCodes.has(c));
    if (invalid.length > 0) {
        return res.status(400).json({ error: "Invalid or inactive permission codes", invalid });
    }
    try {
        await req.db.query("BEGIN");
        await req.db.query("DELETE FROM project_role_permissions WHERE project_role_id = $2::uuid AND project_id = $1::uuid", [id, roleId]);
        for (const permCode of permissionCodes) {
            const { rows: permRows } = await req.db.query("SELECT id FROM permissions WHERE code = $1::text AND is_active = true LIMIT 1", [permCode]);
            if (permRows.length > 0) {
                await req.db.query(`INSERT INTO project_role_permissions (project_id, project_role_id, permission_id, granted_by, granted_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, now())`, [id, roleId, permRows[0].id, userId]);
            }
        }
        await req.db.query("COMMIT");
        res.json({ ok: true, roleId, permissionCodes });
    }
    catch (error) {
        await req.db.query("ROLLBACK").catch(() => { });
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// Project members
// ============================================
app.get("/api/v1/projects/:id/members", requireAuth, async (req, res) => {
    const { id } = req.params;
    const allowed = await requireProjectPermission(req, res, id, 'project.members.view');
    if (!allowed)
        return;
    const { rows } = await req.db.query(`SELECT pm.id, pm.user_id, u.email, u.name, pm.project_role_id, pr.role_code, pr.name AS role_name,
            pm.is_active, pm.joined_at, pm.expires_at, pm.deactivated_at
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       LEFT JOIN project_roles pr ON pr.id = pm.project_role_id AND pr.project_id = pm.project_id
      WHERE pm.project_id = $1::uuid
      ORDER BY u.email`, [id]);
    res.json({ members: rows });
});
app.post("/api/v1/projects/:id/members/invite", requireAuth, async (req, res) => {
    const { id } = req.params;
    const allowed = await requireProjectPermission(req, res, id, 'project.members.invite');
    if (!allowed)
        return;
    const { invitationEmail, displayName, projectRoleId, expiresAt } = req.body;
    if (!invitationEmail || !projectRoleId) {
        return res.status(400).json({ error: "Required fields: invitationEmail, projectRoleId" });
    }
    const userId = req.user?.id;
    const { rows: roleRows } = await req.db.query("SELECT id FROM project_roles WHERE id = $2::uuid AND project_id = $1::uuid AND is_active = true", [id, projectRoleId]);
    if (roleRows.length === 0) {
        return res.status(400).json({ error: "Invalid project role" });
    }
    const crypto = await import("node:crypto");
    const tokenHash = crypto.createHash("sha256").update(`${invitationEmail}:${id}:${Date.now()}:${crypto.randomBytes(16).toString("hex")}`).digest("hex");
    const expires = expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    try {
        const { rows } = await req.db.query(`INSERT INTO project_invitations
        (project_id, project_role_id, invitation_email, display_name, token_hash, status,
         invited_by, invited_at, expires_at, created_at)
       VALUES ($1::uuid, $2::uuid, $3::text, $4::text, $5::text, 'pending', $6::uuid, now(), $7::timestamptz, now())
       RETURNING id, invitation_email, status, expires_at`, [id, projectRoleId, invitationEmail, displayName || null, tokenHash, userId, expires]);
        res.status(201).json({ invitation: rows[0], tokenHash });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.patch("/api/v1/projects/:id/members/:memberId", requireAuth, async (req, res) => {
    const { id, memberId } = req.params;
    const allowed = await requireProjectPermission(req, res, id, 'project.members.manage');
    if (!allowed)
        return;
    const { projectRoleId, isActive, expiresAt } = req.body;
    try {
        const { rows } = await req.db.query(`UPDATE project_members
        SET project_role_id = COALESCE($3::uuid, project_role_id),
            is_active = COALESCE($4::boolean, is_active),
            expires_at = COALESCE($5::timestamptz, expires_at),
            updated_at = now()
       WHERE id = $2::uuid AND project_id = $1::uuid
       RETURNING *`, [id, memberId, projectRoleId || null, isActive !== undefined ? isActive : null, expiresAt || null]);
        if (rows.length === 0)
            return res.status(404).json({ error: "Member not found" });
        res.json({ member: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/projects/:id/members/:memberId/revoke", requireAuth, async (req, res) => {
    const { id, memberId } = req.params;
    const allowed = await requireProjectPermission(req, res, id, 'project.members.manage');
    if (!allowed)
        return;
    try {
        await req.db.query("UPDATE project_members SET is_active = false, deactivated_at = now(), updated_at = now() WHERE id = $2::uuid AND project_id = $1::uuid", [id, memberId]);
        res.json({ ok: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// Module readiness
// ============================================
app.get("/api/v1/projects/:id/module-readiness", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { rows } = await req.db.query("SELECT * FROM project_module_readiness WHERE project_id = $1::uuid ORDER BY module_name", [id]);
    res.json({ readiness: rows });
});
// ============================================
// ============================================
// Operational workflow routes (P06)
// ============================================
app.get("/api/v1/truck-trips", requireAuth, async (req, res) => {
    try {
        const ctx = await req.db.query("SELECT current_setting('app.current_user_id', true) as cui, current_setting('app.current_role', true) as cr");
        console.log("[AUTH DEBUG] GET truck-trips context:", JSON.stringify(ctx.rows[0]));
        const { rows } = await req.db.query("SELECT * FROM truck_trips ORDER BY created_at DESC LIMIT 100");
        res.json({ truckTrips: rows });
    }
    catch (error) {
        console.log("[AUTH DEBUG] GET truck-trips ERROR:", error.message, error.code, error.detail);
        res.status(500).json({ error: "Failed to load truck trips", detail: error.message });
    }
});
app.post("/api/v1/truck-trips", requireAuth, async (req, res) => {
    console.log("[AUTH DEBUG] truck-trips POST body:", JSON.stringify(req.body));
    const { projectId, transportLegId, licensePlate, driverName, pksSiteId, vehicleId, departureTime, arrivalTime } = req.body;
    if (!projectId || !transportLegId || !licensePlate) {
        return res.status(400).json({ error: "Required fields: projectId, transportLegId, licensePlate" });
    }
    try {
        // Validate that the transport leg exists and belongs to the same project
        const { rows: legRows } = await req.db.query(`SELECT id, project_id FROM transport_legs WHERE id = $1::uuid`, [transportLegId]);
        if (legRows.length === 0) {
            return res.status(400).json({ error: "Invalid transport leg: transport leg not found" });
        }
        if (legRows[0].project_id !== projectId) {
            return res.status(400).json({ error: "Invalid transport leg: transport leg does not belong to the specified project" });
        }
        const { rows } = await req.db.query(`INSERT INTO truck_trips (project_id, transport_leg_id, license_plate, driver_name, pks_site_id, vehicle_id, departure_time, arrival_time, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7::timestamptz, $8::timestamptz, 'scheduled', now(), now()) RETURNING *`, [projectId, transportLegId, licensePlate, driverName || null, pksSiteId || null, vehicleId || null, departureTime || null, arrivalTime || null]);
        res.status(201).json({ truckTrip: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create truck trip" });
    }
});
app.get("/api/v1/truck-trips/:id", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM truck_trips WHERE id = $1::uuid", [req.params.id]);
        if (rows.length === 0)
            return res.status(404).json({ error: "Truck trip not found" });
        res.json({ truckTrip: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load truck trip" });
    }
});
app.patch("/api/v1/truck-trips/:id", requireAuth, async (req, res) => {
    const { status, quantity } = req.body;
    try {
        const { rows } = await req.db.query(`UPDATE truck_trips SET status = COALESCE($2, status), quantity = COALESCE($3, quantity), updated_at = now() WHERE id = $1::uuid RETURNING *`, [req.params.id, status ?? null, quantity ?? null]);
        if (rows.length === 0)
            return res.status(404).json({ error: "Truck trip not found" });
        res.json({ truckTrip: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to update truck trip" });
    }
});
// ============================================
// Transport legs (read-only listing for trip assignment)
// ============================================
app.get("/api/v1/transport-legs", requireAuth, async (req, res) => {
    const { projectId } = req.query;
    try {
        if (projectId) {
            const { rows } = await req.db.query(`SELECT id, project_id, origin, destination, distance_km, status, created_at, updated_at
         FROM transport_legs
         WHERE project_id = $1::uuid
         ORDER BY created_at DESC LIMIT 100`, [projectId]);
            res.json({ transportLegs: rows });
        }
        else {
            const { rows } = await req.db.query(`SELECT id, project_id, origin, destination, distance_km, status, created_at, updated_at
         FROM transport_legs
         ORDER BY created_at DESC LIMIT 100`);
            res.json({ transportLegs: rows });
        }
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load transport legs" });
    }
});
app.get("/api/v1/tracking-events", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM tracking_events ORDER BY created_at DESC LIMIT 100");
        res.json({ trackingEvents: rows });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load tracking events" });
    }
});
app.post("/api/v1/tracking-events", requireAuth, async (req, res) => {
    const { truckTripId, eventType, checkerId, latitude, longitude, gpsAccuracy, source, captureTimestamp, notes } = req.body;
    if (!truckTripId || !eventType || !checkerId || latitude === undefined || longitude === undefined || gpsAccuracy === undefined) {
        return res.status(400).json({ error: "Required fields: truckTripId, eventType, checkerId, latitude, longitude, gpsAccuracy" });
    }
    try {
        const { rows } = await req.db.query(`INSERT INTO tracking_events (truck_trip_id, event_type, checker_id, latitude, longitude, gps_accuracy, source, capture_timestamp, status, notes, created_at)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8::timestamptz, 'verified', $9, now()) RETURNING *`, [truckTripId, eventType, checkerId, latitude, longitude, gpsAccuracy, source || "checker_device", captureTimestamp || null, notes || null]);
        res.status(201).json({ trackingEvent: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create tracking event" });
    }
});
app.get("/api/v1/tracking-events/trip/:tripId", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM tracking_events WHERE truck_trip_id = $1::uuid ORDER BY created_at DESC", [req.params.tripId]);
        res.json({ trackingEvents: rows });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load tracking events" });
    }
});
app.get("/api/v1/warehouse-receipts", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM warehouse_receipts ORDER BY created_at DESC LIMIT 100");
        res.json({ warehouseReceipts: rows });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load warehouse receipts" });
    }
});
app.post("/api/v1/warehouse-receipts", requireAuth, async (req, res) => {
    const { projectId, truckTripId, lotId, receivedQuantity, unit, checkerId, conditionStatus, exceptionReason, weighbridgeTicketKey, checkTimestamp, status } = req.body;
    if (!projectId || receivedQuantity === undefined || !unit || !checkerId) {
        return res.status(400).json({ error: "Required fields: projectId, receivedQuantity, unit, checkerId" });
    }
    try {
        const { rows } = await req.db.query(`INSERT INTO warehouse_receipts (project_id, truck_trip_id, lot_id, received_quantity, unit, condition_status, exception_reason, weighbridge_ticket_key, checker_id, check_timestamp, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9::uuid, $10::timestamptz, $11, now(), now()) RETURNING *`, [projectId, truckTripId || null, lotId || null, receivedQuantity, unit, conditionStatus || null, exceptionReason || null, weighbridgeTicketKey || null, checkerId, checkTimestamp || null, status || "pending"]);
        res.status(201).json({ warehouseReceipt: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create warehouse receipt" });
    }
});
app.patch("/api/v1/warehouse-receipts/:id", requireAuth, async (req, res) => {
    const { status, grossWeight, tareWeight, netWeight } = req.body;
    try {
        const { rows } = await req.db.query(`UPDATE warehouse_receipts SET status = COALESCE($2, status), gross_weight = COALESCE($3, gross_weight), tare_weight = COALESCE($4, tare_weight), net_weight = COALESCE($5, net_weight), updated_at = now() WHERE id = $1::uuid RETURNING *`, [req.params.id, status ?? null, grossWeight ?? null, tareWeight ?? null, netWeight ?? null]);
        if (rows.length === 0)
            return res.status(404).json({ error: "Warehouse receipt not found" });
        res.json({ warehouseReceipt: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to update warehouse receipt" });
    }
});
app.get("/api/v1/inventory-lots", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM inventory_lots ORDER BY created_at DESC LIMIT 100");
        res.json({ inventoryLots: rows });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load inventory lots" });
    }
});
app.post("/api/v1/inventory-lots", requireAuth, async (req, res) => {
    const { projectId, pksSiteId, quantity, unit, location, status } = req.body;
    if (!projectId || quantity === undefined)
        return res.status(400).json({ error: "projectId, quantity required" });
    try {
        const { rows } = await req.db.query(`INSERT INTO inventory_lots (project_id, pks_site_id, quantity, unit, location, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, now(), now()) RETURNING *`, [projectId, pksSiteId || null, quantity, unit || "MT", location || null, status || "incoming"]);
        res.status(201).json({ inventoryLot: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create inventory lot" });
    }
});
app.post("/api/v1/inventory-movements", requireAuth, async (req, res) => {
    const { projectId, lotId, movementType, quantity, unit, actorId, warehouseReceiptId, sourceLocation, destinationLocation, reason, referenceId, referenceType, status } = req.body;
    if (!projectId || !lotId || !movementType || quantity === undefined || !unit || !actorId) {
        return res.status(400).json({ error: "projectId, lotId, movementType, quantity, unit, actorId required" });
    }
    try {
        const { rows } = await req.db.query(`INSERT INTO inventory_movements (project_id, lot_id, warehouse_receipt_id, movement_type, quantity, unit, source_location, destination_location, reason, actor_id, reference_id, reference_type, status, created_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::uuid, $11::uuid, $12, $13, now()) RETURNING *`, [projectId, lotId, warehouseReceiptId || null, movementType, quantity, unit, sourceLocation || null, destinationLocation || null, reason || null, actorId, referenceId || null, referenceType || null, status || "posted"]);
        res.status(201).json({ inventoryMovement: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create inventory movement" });
    }
});
// ============================================
// Finance routes (P07)
// ============================================
app.get("/api/v1/rab-items", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM rab_items WHERE is_active = true ORDER BY created_at DESC LIMIT 100");
        res.json({ rabItems: rows });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load RAB items" });
    }
});
app.post("/api/v1/rab-items", requireAuth, async (req, res) => {
    const { projectId, description, category, amount, version } = req.body;
    if (!projectId || !description || !category || amount === undefined)
        return res.status(400).json({ error: "projectId, description, category, amount required" });
    try {
        const { rows } = await req.db.query(`INSERT INTO rab_items (project_id, description, category, amount, version, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, true, now(), now()) RETURNING *`, [projectId, description, category, amount, version || 1]);
        res.status(201).json({ rabItem: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create RAB item" });
    }
});
app.patch("/api/v1/rab-items/:id", requireAuth, async (req, res) => {
    const { description, category, amount, version, isActive } = req.body;
    try {
        const { rows } = await req.db.query(`UPDATE rab_items SET description = COALESCE($2, description), category = COALESCE($3, category), amount = COALESCE($4, amount), version = COALESCE($5, version), is_active = COALESCE($6, is_active), updated_at = now() WHERE id = $1::uuid RETURNING *`, [req.params.id, description ?? null, category ?? null, amount ?? null, version ?? null, typeof isActive === "boolean" ? isActive : null]);
        if (rows.length === 0)
            return res.status(404).json({ error: "RAB item not found" });
        res.json({ rabItem: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to update RAB item" });
    }
});
app.get("/api/v1/fx-rates", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM fx_rates WHERE is_active = true ORDER BY effective_date DESC LIMIT 100");
        res.json({ fxRates: rows });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load FX rates" });
    }
});
app.post("/api/v1/fx-rates", requireAuth, async (req, res) => {
    const { fromCurrency, toCurrency, rate, rateType, source, effectiveDate } = req.body;
    if (!fromCurrency || !toCurrency || rate === undefined || !effectiveDate)
        return res.status(400).json({ error: "fromCurrency, toCurrency, rate, effectiveDate required" });
    try {
        const { rows } = await req.db.query(`INSERT INTO fx_rates (from_currency, to_currency, rate, rate_type, source, effective_date, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz, true, now()) RETURNING *`, [fromCurrency, toCurrency, rate, rateType || "reference", source || null, effectiveDate]);
        res.status(201).json({ fxRate: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create FX rate" });
    }
});
app.get("/api/v1/fx-exposure", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM fx_exposure ORDER BY created_at DESC LIMIT 100");
        res.json({ fxExposure: rows });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load FX exposure" });
    }
});
app.post("/api/v1/fx-exposure", requireAuth, async (req, res) => {
    const { projectId, amountIdr, amountFx, fxRate, exposureType } = req.body;
    if (!projectId)
        return res.status(400).json({ error: "projectId required" });
    try {
        const { rows } = await req.db.query(`INSERT INTO fx_exposure (project_id, amount_idr, amount_fx, fx_rate, exposure_type, status, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, 'open', now(), now()) RETURNING *`, [projectId, amountIdr || null, amountFx || null, fxRate || null, exposureType || "open"]);
        res.status(201).json({ fxExposure: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create FX exposure" });
    }
});
app.get("/api/v1/payments", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM payments ORDER BY created_at DESC LIMIT 100");
        res.json({ payments: rows });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load payments" });
    }
});
app.post("/api/v1/payments", requireAuth, async (req, res) => {
    const { projectId, reference, amount, currency, status } = req.body;
    if (!projectId || !reference || amount === undefined)
        return res.status(400).json({ error: "projectId, reference, amount required" });
    try {
        const { rows } = await req.db.query(`INSERT INTO payments (project_id, reference, amount, currency, status, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, now(), now()) RETURNING *`, [projectId, reference, amount, currency || "IDR", status || "pending"]);
        res.status(201).json({ payment: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create payment" });
    }
});
app.patch("/api/v1/payments/:id", requireAuth, async (req, res) => {
    const { status, amount, currency } = req.body;
    try {
        const { rows } = await req.db.query(`UPDATE payments SET status = COALESCE($2, status), amount = COALESCE($3, amount), currency = COALESCE($4, currency), updated_at = now() WHERE id = $1::uuid RETURNING *`, [req.params.id, status ?? null, amount ?? null, currency ?? null]);
        if (rows.length === 0)
            return res.status(404).json({ error: "Payment not found" });
        res.json({ payment: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to update payment" });
    }
});
app.get("/api/v1/journal-entries", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM journal_entries ORDER BY created_at DESC LIMIT 100");
        res.json({ journalEntries: rows });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load journal entries" });
    }
});
app.post("/api/v1/journal-entries", requireAuth, async (req, res) => {
    const { projectId, entryNumber, postingDate, description, totalDebit, totalCredit } = req.body;
    if (!projectId || !entryNumber || !postingDate || !description)
        return res.status(400).json({ error: "projectId, entryNumber, postingDate, description required" });
    try {
        const { rows } = await req.db.query(`INSERT INTO journal_entries (project_id, entry_number, posting_date, description, total_debit, total_credit, status, created_at, updated_at)
       VALUES ($1::uuid, $2, $3::timestamptz, $4, $5, $6, 'draft', now(), now()) RETURNING *`, [projectId, entryNumber, postingDate, description, totalDebit || 0, totalCredit || 0]);
        res.status(201).json({ journalEntry: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create journal entry" });
    }
});
app.post("/api/v1/journal-lines", requireAuth, async (req, res) => {
    const { entryId, accountCode, accountName, debit, credit } = req.body;
    if (!entryId || !accountCode || !accountName)
        return res.status(400).json({ error: "entryId, accountCode, accountName required" });
    try {
        const { rows } = await req.db.query(`INSERT INTO journal_lines (entry_id, account_code, account_name, debit, credit, created_at)
       VALUES ($1::uuid, $2, $3, $4, $5, now()) RETURNING *`, [entryId, accountCode, accountName, debit || 0, credit || 0]);
        res.status(201).json({ journalLine: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create journal line" });
    }
});
// ============================================
// Compliance routes (P08)
// ============================================
app.get("/api/v1/compliance-rules", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM compliance_rules ORDER BY created_at DESC LIMIT 100");
        res.json({ complianceRules: rows });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load compliance rules" });
    }
});
app.post("/api/v1/compliance-rules", requireAuth, async (req, res) => {
    const { ruleCode, title, description, authority, jurisdiction, effectiveDate, expiryDate, status } = req.body;
    if (!ruleCode || !title)
        return res.status(400).json({ error: "ruleCode, title required" });
    try {
        const { rows } = await req.db.query(`INSERT INTO compliance_rules (rule_code, title, description, authority, jurisdiction, effective_date, expiry_date, status, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, 1, now(), now()) RETURNING *`, [ruleCode, title, description || null, authority || null, jurisdiction || null, effectiveDate || null, expiryDate || null, status || "draft"]);
        res.status(201).json({ complianceRule: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create compliance rule" });
    }
});
app.patch("/api/v1/compliance-rules/:id", requireAuth, async (req, res) => {
    const { title, description, status } = req.body;
    try {
        const { rows } = await req.db.query(`UPDATE compliance_rules SET title = COALESCE($2, title), description = COALESCE($3, description), status = COALESCE($4, status), updated_at = now() WHERE id = $1::uuid RETURNING *`, [req.params.id, title ?? null, description ?? null, status ?? null]);
        if (rows.length === 0)
            return res.status(404).json({ error: "Compliance rule not found" });
        res.json({ complianceRule: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to update compliance rule" });
    }
});
app.get("/api/v1/compliance-documents", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM compliance_documents ORDER BY created_at DESC LIMIT 100");
        res.json({ complianceDocuments: rows });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load compliance documents" });
    }
});
app.post("/api/v1/compliance-documents", requireAuth, async (req, res) => {
    const { projectId, shipmentId, ruleId, documentType, documentNumber, issueDate, expiryDate } = req.body;
    if (!documentType)
        return res.status(400).json({ error: "documentType required" });
    try {
        const { rows } = await req.db.query(`INSERT INTO compliance_documents (project_id, shipment_id, rule_id, document_type, document_number, issue_date, expiry_date, verification_state, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::timestamptz, $7::timestamptz, 'pending', now(), now()) RETURNING *`, [projectId || null, shipmentId || null, ruleId || null, documentType, documentNumber || null, issueDate || null, expiryDate || null]);
        res.status(201).json({ complianceDocument: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create compliance document" });
    }
});
// ============================================
// Notification routes (P11)
// ============================================
app.get("/api/v1/notifications", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100");
        res.json({ notifications: rows });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load notifications" });
    }
});
app.post("/api/v1/notifications/:id/read", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("UPDATE notifications SET read_at = now() WHERE id = $1::uuid RETURNING *", [req.params.id]);
        if (rows.length === 0)
            return res.status(404).json({ error: "Notification not found" });
        res.json({ notification: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to mark notification read" });
    }
});
// ============================================
// Buyer / Contract detail routes
// ============================================
app.get("/api/v1/buyers/:id", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM buyers WHERE id = $1::uuid", [req.params.id]);
        if (rows.length === 0)
            return res.status(404).json({ error: "Buyer not found" });
        res.json({ buyer: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load buyer" });
    }
});
app.get("/api/v1/contracts/:id", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM contracts WHERE id = $1::uuid", [req.params.id]);
        if (rows.length === 0)
            return res.status(404).json({ error: "Contract not found" });
        res.json({ contract: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load contract" });
    }
});
app.patch("/api/v1/contracts/:id", requireAuth, requireAdmin, async (req, res) => {
    const { code, name, startDate, endDate, isActive } = req.body;
    try {
        const { rows } = await req.db.query(`UPDATE contracts SET code = COALESCE($2, code), name = COALESCE($3, name), start_date = COALESCE($4::timestamptz, start_date), end_date = COALESCE($5::timestamptz, end_date), is_active = COALESCE($6, is_active), updated_at = now() WHERE id = $1::uuid RETURNING *`, [req.params.id, code ?? null, name ?? null, startDate || null, endDate || null, typeof isActive === "boolean" ? isActive : null]);
        if (rows.length === 0)
            return res.status(404).json({ error: "Contract not found" });
        res.json({ contract: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to update contract" });
    }
});
// ============================================
// Admin routes
// ============================================
app.get("/api/v1/users", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT id, email, name, role, is_active, created_at FROM users ORDER BY created_at DESC LIMIT 100");
        res.json({ users: rows });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load users" });
    }
});
app.get("/api/v1/roles", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM role_catalog WHERE is_active = true ORDER BY name");
        res.json({ roles: rows });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load roles" });
    }
});
app.get("/api/v1/permissions", requireAuth, async (req, res) => {
    try {
        const { rows } = await req.db.query("SELECT * FROM permissions WHERE is_active = true ORDER BY code");
        res.json({ permissions: rows });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to load permissions" });
    }
});
// Centralized error handling middleware
// ============================================
app.use((err, req, res, next) => {
    const status = err.status || 500;
    const clientMessage = isProduction ? "Internal server error" : "Terjadi kesalahan internal.";
    // Log detail teknis secara internal (file log), jangan kirim ke client.
    // Jangan log objek error mentah untuk menghindari penyimpanan detail sensitif/secret.
    logger.error({
        message: err?.message ?? "Unknown error",
        stack: err?.stack,
        status,
        url: req.originalUrl,
        method: req.method,
    });
    res.status(status).json({
        status: "error",
        message: clientMessage,
    });
});
async function startServer() {
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
        logger.info("Database connected with verified app_runtime_secure role.");
    }
    finally {
        client.release();
    }
    app.listen(PORT, () => {
        logger.info(`PKE Export Platform API running on port ${PORT}`);
        logger.info(`Environment: ${process.env.NODE_ENV}`);
        logger.info(`Database role: app_runtime_secure`);
        logger.info(`Timestamp: ${new Date().toISOString()}`);
    });
}
if (process.env.NODE_ENV !== "test") {
    void startServer().catch(() => {
        logger.error("PKE API startup cancelled because runtime security checks failed.");
        void pool.end().finally(() => process.exit(1));
    });
}
else {
    // In test mode, the server is started by the integration test harness.
    // Skip runtime role validation against Production; the local test DB has its own role setup.
    logger.info("PKE API loaded in test mode (server started by test harness).");
}
